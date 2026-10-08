// Cloudflare Worker: 静的アセット配信 + 診断ログAPI + 商品詳細ページ
// 診断スコアリングはクライアント側（src/assets/js/scoring.js）で行い、
// Worker は D1 の「商品マスタ」と「診断ログ」だけを扱う。

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QUESTIONS = ["q1_material", "q2_thickness", "q3_skill", "q4_environment", "q5_budget"];
const SITE_NAME = "レーザー溶接機 比較・選定";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) return handleApi(request, env, path);

    const m = path.match(/^\/products\/([a-z0-9-]+)\/?$/);
    if (m) {
      if (!path.endsWith("/")) return Response.redirect(url.origin + path + "/", 301);
      try {
        return await productPage(env, m[1]);
      } catch (e) {
        // D1 の障害などでもスタックトレースは返さず、共通の体裁で案内する（詳細はログにだけ残す）
        console.error("productPage failed", m[1], e && e.stack ? e.stack : e);
        return errorPage();
      }
    }
    const res = await env.ASSETS.fetch(request);
    // 存在しないページ（拡張子の無い URL）は、他のページと同じ体裁の 404 にする
    if (res.status === 404 && request.method === "GET" && !/\.[a-z0-9]+$/i.test(path)) return notFoundPage();
    return res;
  },
};

async function handleApi(request, env, path) {
  const method = request.method;
  // 商品一覧（D1 のマスタ。運用ツール・確認用）
  if (path === "/api/products" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM products WHERE is_published = 1 ORDER BY id").all();
    return json(results.map(rowToProduct));
  }
  // 診断ログ作成
  if (path === "/api/logs" && method === "POST") {
    const b = await safeJson(request);
    if (!b || !/^[0-9a-f-]{36}$/.test(b.id || "")) return json({ error: "invalid" }, 400);
    const a = b.answers || {};
    await env.DB.prepare(
      `INSERT OR REPLACE INTO diagnosis_logs (id, q1_material, q2_thickness, q3_skill, q4_environment, q5_budget, relaxed_axis, shown_products, exit_point, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(b.id, ...QUESTIONS.map((k) => a[k] ?? "unknown"), b.relaxed_axis ?? null,
      JSON.stringify((b.shown_products || []).slice(0, 5)), b.exit_point ?? "result", request.headers.get("user-agent") || "").run();
    return json({ ok: true, id: b.id });
  }
  // 診断ログ更新（詳細閲覧 / 比較 / 問い合わせ / 離脱地点）
  const lm = path.match(/^\/api\/logs\/([0-9a-f-]{36})$/);
  if (lm && method === "PATCH") {
    const b = await safeJson(request);
    if (!b) return json({ error: "invalid" }, 400);
    const sets = ["updated_at = datetime('now')"];
    const vals = [];
    if (Array.isArray(b.viewed_products)) { sets.push("viewed_products = ?"); vals.push(JSON.stringify(b.viewed_products)); }
    if (Array.isArray(b.compared_products)) { sets.push("compared_products = ?"); vals.push(JSON.stringify(b.compared_products.slice(0, 2))); }
    if (typeof b.inquired === "boolean") { sets.push("inquired = ?"); vals.push(b.inquired ? 1 : 0); }
    if (typeof b.exit_point === "string") { sets.push("exit_point = ?"); vals.push(b.exit_point.slice(0, 32)); }
    await env.DB.prepare(`UPDATE diagnosis_logs SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, lm[1]).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

async function safeJson(request) {
  try { return await request.json(); } catch { return null; }
}

function hostOf(u) { try { return new URL(u).host; } catch { return u; } }
function rowToProduct(r) {
  return { ...r, suitable_for: JSON.parse(r.suitable_for || "[]"), not_suitable_for: JSON.parse(r.not_suitable_for || "[]"), handled_by_operator: !!r.handled_by_operator };
}

const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons.svg#i-${name}"></use></svg>`;

/** 機種の種類（src/assets/js/partials.js の productKind と同じ規則）。方式の先頭が「ハンド」ならハンドヘルド */
function productKind(p) {
  const m = p.method || "";
  if (/^ハンド/.test(m)) return "handheld";
  if (/ロボット|ライン/.test(m)) return "robot";
  if (/据置|真空|チャンバー/.test(m)) return "fixed";
  return "handheld";
}

/** 商品写真（partials.js の productPhoto と同じ HTML）。実写真が無いときは青緑のタイル＋種類のピクトグラム */
function productPhoto(p, variant = "card") {
  if (p.image && !p.image.includes("placeholder")) return `<img class="ph-img ph-img--${variant}" src="${esc(p.image)}" alt="" loading="lazy">`;
  return `<span class="ph ph--${variant}" role="img" aria-label="${esc(p.name)}の写真は準備中">${icon(productKind(p))}<small>写真 準備中</small></span>`;
}

/** 「YDL（国内販売：株式会社ヨコハマシステムズ）」→ ["YDL", "国内販売：株式会社ヨコハマシステムズ"] */
function splitMaker(name = "") {
  const m = /^(.+?)（(.+)）$/.exec(name);
  return m ? [m[1], m[2]] : [name, ""];
}

/** 出力の表示。output_note（例: 最大ピーク出力）があれば括弧で添える */
function outputText(p) {
  if (!p.output_w) return "";
  return `${Number(p.output_w).toLocaleString("ja-JP")} W${p.output_note ? `（${p.output_note}）` : ""}`;
}

/** 0〜1 の重なり（共通タグ数 ÷ 和集合のタグ数） */
function overlap(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const s = new Set(a);
  const shared = b.filter((x) => s.has(x)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * 代替候補（最大2件。同じメーカーの機種は出さず、1メーカー1機種まで）
 * 1. 価格帯が公開されていれば、同じ価格帯の機種を出力の近い順に
 * 2. 足りなければ、用途タグ（用途が非公開なら素材タグ）の重なりが大きい順、同じなら出力の近い順に
 * 3. 用途も素材も非公開なら、同じ種類で出力の近い機種
 */
function pickAlternatives(p, tags, others, tagsOf) {
  const gap = (o) => (p.output_w && o.output_w ? Math.abs(o.output_w - p.output_w) : Infinity);
  const nearer = (a, b) => (gap(a) - gap(b)) || String(a.id).localeCompare(String(b.id));
  const pool = others.filter((o) => o.maker_slug !== p.maker_slug);
  const picked = [];
  const take = (list, basis) => {
    for (const o of list) {
      if (picked.length >= 2) return;
      if (picked.some((x) => x.o.maker_slug === o.maker_slug)) continue;
      picked.push({ o, basis });
    }
  };
  if (p.price_band) take(pool.filter((o) => o.price_band === p.price_band).sort(nearer), "price");
  const axis = (tags.use || []).length ? "use" : (tags.material || []).length ? "material" : null;
  if (axis) {
    const scored = pool
      .map((o) => {
        const t = tagsOf.get(o.id) || {};
        return { o, s: overlap(tags[axis], t[axis]), mat: overlap(tags.material, t.material) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => (b.s - a.s) || (gap(a.o) - gap(b.o)) || (b.mat - a.mat) || String(a.o.id).localeCompare(String(b.o.id)));
    take(scored.map((x) => x.o), axis);
  } else if (!picked.length && p.output_w) {
    take(pool.filter((o) => o.output_w && productKind(o) === productKind(p)).sort(nearer), "output");
  }
  return picked;
}

function altsHeading(p, picked) {
  const bases = new Set(picked.map((x) => x.basis));
  const what = bases.has("material") ? "対応素材" : "用途";
  if (bases.has("price") && bases.size === 1) return ["同じ価格帯の代替候補", `同じ価格帯（${p.price_band}）で、メーカーが異なる機種です。`];
  if (bases.has("price")) return ["代替候補", `同じ価格帯（${p.price_band}）の機種と、${what}が近い機種です。いずれもメーカーが異なります。`];
  if (bases.has("output")) return ["出力が近い候補", "用途や対応素材が公開されていないため、出力が近く、メーカーが異なる機種を出しています。"];
  return [`${what}が近い候補`, `${what}が近く、メーカーが異なる機種です。`];
}

// 商品詳細ページ: /products/{maker_slug}-{model_slug}/
// URL はスラッグのみで決まるため、メーカー実名NGの場合は maker_slug を差し替えるだけで移行できる。
async function productPage(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM products WHERE slug = ? AND is_published = 1").bind(slug).first();
  if (!row) return notFoundPage(true);
  const p = rowToProduct(row);
  const [{ results: others }, { results: tagRows }] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM products WHERE is_published = 1 AND id <> ? ORDER BY id").bind(p.id),
    env.DB.prepare("SELECT t.product_id, t.axis, t.tag FROM product_tags t JOIN products p ON p.id = t.product_id WHERE p.is_published = 1 ORDER BY t.rowid"),
  ]);
  const tagsOf = new Map();
  for (const t of tagRows) {
    const m = tagsOf.get(t.product_id) || {};
    (m[t.axis] ||= []).push(t.tag);
    tagsOf.set(t.product_id, m);
  }
  const tags = tagsOf.get(p.id) || {};
  const alts = pickAlternatives(p, tags, others, tagsOf);
  const [maker, makerAgent] = splitMaker(p.maker_name);
  const NA = "非公開";

  const li = (arr) => arr.length ? arr.map((x) => `<li>${esc(x)}</li>`).join("") : `<li class="fit__none">メーカーの公開情報に記載はありません</li>`;

  // スペック表。メーカーが公開していない項目は「非公開」を実値と区別できる見た目（.is-na）で出す
  const thickness = (tags.thickness || []).join("・");
  const thicknessRows = thickness && p.thickness_note
    ? [["対応板厚", thickness], ["公表値", p.thickness_note, "sub"]]
    : [["対応板厚", thickness || p.thickness_note]];
  const spec = [
    ["方式", p.method], ["波長", p.wavelength], ["出力", outputText(p)], ["可搬性", p.portability],
    ["対応素材", (tags.material || []).join("・")], ...thicknessRows,
    ["使用環境", (tags.environment || []).join("・")], ["価格帯", p.price_band], ["習得難易度", p.skill_level],
  ].map(([k, v, mod]) => `<div class="spec__row${mod ? ` spec__row--${mod}` : ""}"><dt>${esc(k)}</dt>${v ? `<dd>${esc(v)}</dd>` : `<dd class="is-na">${NA}</dd>`}</div>`).join("");

  // 頭の帯: 公開されている値を先に、非公開の項目は後ろに控えめに
  const bandItems = [["出力", outputText(p)], ["価格帯", p.price_band], ["習得難易度", p.skill_level]];
  const band = [...bandItems.filter(([, v]) => v), ...bandItems.filter(([, v]) => !v)]
    .map(([k, v]) => v ? `<span>${k}：<b>${esc(v)}</b></span>` : `<span class="is-na">${k}：${NA}</span>`).join("");

  const newWin = `<span class="nowrap">（別ウィンドウで開く）</span>`;
  const links = [
    p.official_url ? `<li><a href="${esc(p.official_url)}" target="_blank" rel="noopener">${icon("external")}<span class="pnav__label">メーカー公式の商品ページ<span class="pnav__sub">${esc(hostOf(p.official_url))}${newWin}</span></span>${icon("chevron", "ico ico--chev")}</a></li>` : "",
    p.source_url && p.source_url !== p.official_url ? `<li><a href="${esc(p.source_url)}" target="_blank" rel="noopener">${icon("doc")}<span class="pnav__label">情報源：${esc(p.source || "資料")}<span class="pnav__sub">${esc(hostOf(p.source_url))}${newWin}</span></span>${icon("chevron", "ico ico--chev")}</a></li>` : "",
  ].join("");

  let altsSection = "";
  if (alts.length) {
    const [altTitle, altNote] = altsHeading(p, alts);
    altsSection = `<section class="subsec" id="alts"><h2>${esc(altTitle)}</h2><p class="alts__note">${esc(altNote)}</p>
    <ul class="pnav">${alts.map(({ o }) => {
      const sub = [splitMaker(o.maker_name)[0], o.output_w ? `出力 ${outputText(o)}` : "", o.price_band ? `価格帯 ${o.price_band}` : "", o.handled_by_operator ? "運営元で取り扱い" : ""].filter(Boolean).join("｜");
      return `<li><a href="/products/${esc(o.slug)}/">${icon(productKind(o))}<span class="pnav__label">${esc(o.name)}<span class="pnav__sub">${esc(sub)}</span></span>${icon("chevron", "ico ico--chev")}</a></li>`;
    }).join("")}</ul></section>`;
  }

  const body = `
<nav class="subnav" aria-label="ページ内メニュー"><ul>
  <li><a href="#top" aria-current="true">概要</a></li><li><a href="#spec">スペック</a></li><li><a href="#fit">向き不向き</a></li><li><a href="#links">公式情報</a></li>
</ul></nav>
<main class="narrow product">
  <nav class="crumbs" aria-label="パンくず"><a href="/">トップ</a> › <a href="/lineup/">機種一覧</a> › <span>${esc(p.name)}</span></nav>
  <section class="product__intro" id="top">
    <div class="product__top">
      <div class="product__head">
        ${p.handled_by_operator ? `<span class="badge">運営元で取り扱い</span>` : ""}
        <h1>${esc(p.name)}</h1>
        <p class="product__maker">${esc(maker)}${makerAgent ? `<span class="product__agent">${esc(makerAgent)}</span>` : ""}</p>
        <div class="product__band">${band}</div>
      </div>
      ${productPhoto(p, "product")}
    </div>
    <h2>選定コメント</h2><p class="comment">${esc(p.comment)}</p>
  </section>
  <section class="subsec" id="spec"><h2>スペック</h2><dl class="spec">${spec}</dl></section>
  <section class="subsec" id="fit"><h2>向いている用途・向いていない用途</h2>
    <div class="fit"><div class="ok"><h3>向いている</h3><ul>${li(p.suitable_for)}</ul></div><div class="ng"><h3>向いていない</h3><ul>${li(p.not_suitable_for)}</ul></div></div></section>
  ${altsSection}
  <section class="subsec" id="links"><h2>メーカー公式・情報源</h2>
    ${links ? `<ul class="pnav">${links}</ul>` : ""}
    <p class="src">掲載内容は${esc(p.source || "公開情報")}に基づきます。価格帯や対応板厚など、メーカーが公開していない項目は「非公開」としています。</p>
  </section>
  <div class="cta">
    <a class="btn btn--primary" href="/diagnosis/">${icon("diag")}診断でほかの候補も見る</a>
    <a class="btn btn--accent" href="/contact/?product=${esc(p.slug)}">${icon("consult")}この機種について相談する</a>
  </div>
</main>
<script>
// ページ内メニューの選択中表示を、いま読んでいる節に合わせる
(() => {
  const nav = document.querySelector(".subnav");
  const links = [...nav.querySelectorAll("a")];
  const secs = links.map((a) => document.getElementById(a.hash.slice(1)));
  if (secs.some((s) => !s)) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const line = Math.max(nav.getBoundingClientRect().bottom, parseFloat(getComputedStyle(secs[1]).scrollMarginTop) || 0) + 8;
    let i = 0;
    secs.forEach((s, j) => { if (s.getBoundingClientRect().top <= line) i = j; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) i = secs.length - 1;
    links.forEach((a, j) => (j === i ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("hashchange", update);
  update();
})();
</script>`;
  return html(pageShell(p.name.includes(maker) ? p.name : `${p.name}（${maker}）`, body));
}

/** 商品が見つからない・存在しないページ（404） */
function notFoundPage(isProduct = false) {
  const [h1, lead] = isProduct
    ? ["お探しの機種が見つかりません", "掲載を終えたか、URL が変わった可能性があります。"]
    : ["ページが見つかりません", "URL が変わったか、ページが無くなった可能性があります。"];
  const body = `
<main class="section page-msg">
  <div class="narrow">
    <div class="sec-head"><h1>${h1}</h1><span class="sec-head__eyebrow">${lead}</span></div>
    <p>機種一覧から探すか、5つの質問に答えて現場に合う機種を絞り込めます。</p>
    <div class="cta">
      <a class="btn btn--primary" href="/lineup/">${icon("lineup")}機種一覧へ</a>
      <a class="btn" href="/diagnosis/">${icon("diag")}5つの質問で選ぶ</a>
    </div>
  </div>
</main>`;
  return html(pageShell(h1, body, { current: "" }), 404);
}

/** データを読めないときの案内（500）。スタックトレースや内部の情報は出さない */
function errorPage() {
  const body = `
<main class="section page-msg">
  <div class="narrow">
    <div class="sec-head"><h1>ただいま表示できません</h1><span class="sec-head__eyebrow">機種の情報を読み込めませんでした。</span></div>
    <p>しばらく時間をおいて、もう一度お試しください。</p>
    <div class="cta">
      <a class="btn btn--primary" href="/lineup/">${icon("lineup")}機種一覧へ</a>
      <a class="btn" href="/diagnosis/">${icon("diag")}5つの質問で選ぶ</a>
    </div>
  </div>
</main>`;
  return html(pageShell("ただいま表示できません", body, { current: "" }), 500);
}

function pageShell(title, body, { current = "/lineup/" } = {}) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta property="og:type" content="website"><meta property="og:site_name" content="レーザー溶接機 比較・選定"><meta property="og:title" content="${esc(title)}"><meta property="og:image" content="https://yosetsu-navi.jolly-frost-2311.workers.dev/assets/images/ogp.jpg"><meta name="twitter:card" content="summary_large_image"><title>${esc(title)}｜${SITE_NAME}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css?v=11"><link rel="stylesheet" href="/assets/css/product.css?v=11"></head><body>
<div id="siteHeader"></div>
${body}
<div id="siteFooter"></div>
<script type="module">import { mountChrome } from "/assets/js/partials.js?v=11"; mountChrome({ current: ${JSON.stringify(current)} });</script>
</body></html>`;
}

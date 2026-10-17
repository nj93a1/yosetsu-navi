// Cloudflare Worker: 静的アセット配信 + 診断ログAPI + 商品詳細ページ
// 診断スコアリングはクライアント側（src/assets/js/scoring.js）で行い、
// Worker は D1 の「商品マスタ」と「診断ログ」だけを扱う。

import { allocateAlternatives, productKind, regionOf } from "./alternatives.js";
import diagnosis from "../src/data/diagnosis.json";
import { handleContact } from "./contact.js";
import { thicknessGuide, materialCriteria, compareTarget, coolingOf } from "../src/assets/js/scoring.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QUESTIONS = ["q1_material", "q2_thickness", "q3_skill", "q4_environment", "q5_budget"];
const SITE_NAME = "レーザー溶接機 比較・選定";
// 正式な URL（2026-10-17 公開。ドメインは Xサーバーで取得し、DNS は Cloudflare）
const ORIGIN = "https://yosetsu-kakaku.com";
const CANONICAL_HOST = new URL(ORIGIN).host;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await route(request, env, url);
    // 正式なドメイン以外（workers.dev・localhost など）は検索に出さない。www は正式なドメインへ転送する
    if (url.host === CANONICAL_HOST) return res;
    const out = new Response(res.body, res);
    out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  },
};

async function route(request, env, url) {
    const path = url.pathname;
    if (url.host === `www.${CANONICAL_HOST}`) return Response.redirect(`${ORIGIN}${path}${url.search}`, 301);
    // http（s なし）で来たら https へ
    if (url.protocol === "http:" && url.host === CANONICAL_HOST) return Response.redirect(`${ORIGIN}${path}${url.search}`, 301);
    // 公開後に workers.dev の仮 URL を正式なドメインへ転送する（wrangler.toml の REDIRECT_TO_ORIGIN = "1"）
    if (env.REDIRECT_TO_ORIGIN === "1" && url.host.endsWith(".workers.dev")) return Response.redirect(`${ORIGIN}${path}${url.search}`, 301);

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
}

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
  // 相談フォームの送信（保存し、設定があれば受付用アドレスへメール。worker/contact.js）
  if (path === "/api/contact" && method === "POST") return handleContact(request, env, { diagnosis, rowToProduct, json });
  // 相談の記録（種類 × 見ていた機種 × 来たページ。個人情報は受け取らない）
  if (path === "/api/inquiries" && method === "POST") {
    const b = await safeJson(request);
    const TYPES = ["choose", "quote", "test", "subsidy", "other"];
    if (!b || !TYPES.includes(b.type)) return json({ error: "invalid" }, 400);
    const id = (v) => (typeof v === "string" && /^p[0-9]{3}$/.test(v) ? v : null);
    const product = id(b.product), compare = id(b.compare);
    const row = product ? await env.DB.prepare("SELECT handled_by_operator FROM products WHERE id = ?").bind(product).first() : null;
    const from = typeof b.from === "string" && b.from.startsWith("/") ? b.from.slice(0, 120) : null;
    await env.DB.prepare("INSERT INTO inquiry_logs (type, product_id, handled, compare_id, from_path) VALUES (?, ?, ?, ?, ?)")
      .bind(b.type, row ? product : null, row ? (row.handled_by_operator ? 1 : 0) : null, compare, from).run();
    return json({ ok: true });
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
/** ドメイン名の HTML。「.」の後でだけ折り返し、末尾の「amada.co.jp」「hsglaser.com」などは分けない */
function hostHtml(u) {
  const labels = hostOf(u).split(".");
  const keep = labels.length >= 3 && /^(co|or|ne|ac|go|lg|ed)$/.test(labels[labels.length - 2]) ? 3 : 2;
  const parts = [...labels.slice(0, -keep).map((l) => `${l}.`), labels.slice(-keep).join(".")];
  return parts.map((x) => `<span class="nowrap">${esc(x)}</span>`).join("<wbr>");
}
function rowToProduct(r) {
  const arr = (v) => { try { return JSON.parse(v || "[]"); } catch { return []; } };
  let origin = {};
  try { origin = JSON.parse(r.origin || "{}") || {}; } catch {}
  return { ...r, origin, suitable_for: arr(r.suitable_for), not_suitable_for: arr(r.not_suitable_for), features: arr(r.features), support: arr(r.support), spec_rows: arr(r.spec_rows), handled_by_operator: !!r.handled_by_operator };
}

const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons.svg#i-${name}"></use></svg>`;

/** 商品写真（partials.js の productPhoto と同じ HTML）。実写真が無いときは青緑のタイル＋種類のピクトグラム */
function productPhoto(p, variant = "card") {
  // 商品ページの頭の写真はすぐ読み込む（一覧・代替候補などの小さい写真は遅れて読み込む）
  if (p.image && !p.image.includes("placeholder")) return `<img class="ph-img ph-img--${variant}" src="${esc(p.image)}" alt="" ${variant === "product" ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
  return `<span class="ph ph--${variant}" role="img" aria-label="${esc(p.name)}の写真は準備中">${icon(productKind(p))}<small>写真 準備中</small></span>`;
}

/** 「YDL（国内販売：株式会社ヨコハマシステムズ）」→ ["YDL", "国内販売：株式会社ヨコハマシステムズ"] */
function splitMaker(name = "") {
  const m = /^(.+?)（(.+)）$/.exec(name);
  return m ? [m[1], m[2]] : [name, ""];
}

/**
 * 語の途中で折り返さないための HTML。語のまとまりの境目にだけ <wbr> を入れ、全体を .kw（word-break: keep-all）で囲む。
 * word-break: auto-phrase は Chrome だけで iPhone の Safari では効かないため、この方法にしている。
 * 境目は、漢字⇔カタカナ・カタカナ→英数字の切り替わり、括弧の前、ひらがなや句読点（、。・／：｜）の後、空白。
 * 漢字と英数字、英数字→カタカナは一続きにする（「最大2.8mm」「200〜400万円」「10mトーチ」を分けない）。
 * 「WEL-KEN」「0.5〜1.5mm」のようなハイフン・波線入りの英数字は、記号の後でも折り返さないよう .nowrap で囲む。
 * 「／」「｜」は行頭に来ないよう、直前に U+2060（改行させない印）を入れる。
 * 1つのまとまりが行より長いときは、CSS の overflow-wrap: anywhere で折り返す（横にはみ出さない）。
 */
function kw(text) {
  const s = String(text ?? "");
  if (!s) return "";
  const kind = (c) =>
    /[\p{Script=Han}々〆ヶ]/u.test(c) ? "kanji"
    : /[\p{Script=Katakana}ー]/u.test(c) && c !== "・" ? "kana"
    : /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ.,%+〜～~-]/.test(c) ? "alnum"
    : /[（「『【〈《(\[]/.test(c) ? "open"
    : /\s/.test(c) ? "space"
    : "tail"; // ひらがな・閉じ括弧・句読点・記号（前の語に付ける）
  const parts = [];
  let cur = "", prev = null;
  for (const c of s) {
    const k = kind(c);
    let cut = false;
    if (cur && k !== "tail" && k !== "space") {
      if (k === "open") cut = prev !== "open";
      else if (prev === "tail" || prev === "space") cut = true;
      else if (prev !== "open" && k !== prev) cut = k === "alnum" ? prev === "kana" : prev !== "alnum";
    }
    if (cut) { parts.push(cur); cur = ""; }
    cur += c;
    prev = k;
  }
  if (cur) parts.push(cur);
  const keep = (t) => esc(t)
    .replace(/[A-Za-z0-9][A-Za-z0-9.,]*(?:[-〜～~][A-Za-z0-9][A-Za-z0-9.,]*)+/g, (m) => `<span class="nowrap">${m}</span>`)
    .replace(/[／｜]/g, "&#8288;$&"); // 「／」「｜」の前で折り返さない（U+2060 で前の語に付ける）
  return `<span class="kw">${parts.map(keep).join("<wbr>")}</span>`;
}

/** 選定コメント。最初の1文をマーカーで強調する（マイベストの本文の強調に倣う） */
function commentHtml(text = "") {
  const i = text.indexOf("。");
  if (i < 0 || i === text.length - 1) return `<b class="mk">${kw(text)}</b>`;
  return `<b class="mk">${kw(text.slice(0, i + 1))}</b>${kw(text.slice(i + 1))}`;
}
const PRODUCT_KIND_LABEL = { handheld: "ハンドヘルド", fixed: "据置・専用機", robot: "ロボット・ライン組込" };

/** 出力の表示。[値, 注記]（例: ["2,000 W", "最大ピーク出力"]）。output_note が無ければ注記は "" */
function outputParts(p) {
  if (!p.output_w) return ["", ""];
  return [`${Number(p.output_w).toLocaleString("ja-JP")} W`, p.output_note || ""];
}
/** 出力の HTML。「項目名＋値」は折り返さず、注記は括弧付きで語のまとまりごとに折り返す */
function outputHtml(p, label = "", bold = false) {
  const [v, note] = outputParts(p);
  if (!v) return "";
  return `<span class="nowrap">${esc(label)}${bold ? `<b>${esc(v)}</b>` : esc(v)}</span>${note ? `<wbr>${kw(`（${note}）`)}` : ""}`;
}

function altsHeading(p, tags, picked) {
  const hasPrice = picked.some((x) => x.basis === "price");
  const onlyPrice = picked.every((x) => x.basis === "price");
  const tagPart = [(tags.use || []).length ? "用途" : "", (tags.material || []).length ? "対応素材" : ""].filter(Boolean).join("・");
  const basis = tagPart && p.output_w ? `${tagPart}と出力` : tagPart || "出力";
  if (onlyPrice) return ["同じ価格帯の代替候補", `同じ価格帯（${p.price_band}）で、メーカーが異なる機種です。`];
  if (hasPrice) return ["代替候補", `同じ価格帯（${p.price_band}）の機種と、${basis}の近さをもとに選んだ機種です。いずれもメーカーが異なります。`];
  if (!tagPart) return ["代替候補", "用途や対応素材が公開されていないため、出力の近さをもとに選んだ、メーカーが異なる機種です。"];
  return ["代替候補", `${basis}の近さをもとに選んだ、メーカーが異なる機種です。`];
}

/**
 * 所在地の表記。海外は国名だけ（「中国（広東省深圳市）」→「中国」）、国内は都道府県まで（「日本（大阪府東大阪市）」「大阪府東大阪市」→「大阪府」）
 */
function placeOf(text = "") {
  const t = String(text).trim();
  const m = /^(.+?)（(.+)）$/.exec(t);
  const [country, region] = m ? [m[1], m[2]] : /^[^（]+?[都道府県]/.test(t) ? ["日本", t] : [t, ""];
  if (country !== "日本") return country;
  const pref = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.exec(region);
  return pref ? pref[1] : "日本";
}

/**
 * スペック表の「本社所在地（または製造元・販売元）・製造国・国内のサポート・国内の販売店」。公式に書かれた事実だけ（origin が空なら「公式に記載なし」）。
 * makers があれば会社ごとに役割と所在地を並べる（UW シリーズは UW JAPAN とノースヒルズ溶接工業を併記）。sellers は確認できた国内の販売店で、makers と同じ会社は出さない
 */
function originRows(o = {}) {
  const none = "公式に記載なし";
  const src = (url) => (url ? `<a class="spec__src" href="${esc(url)}" target="_blank" rel="noopener">出典</a>` : "");
  const link = (text, url) => kw(text) + src(url);
  const line = (main, sub) => `<span class="spec__line">${main}${sub ? `<span class="spec__basis">${kw(sub)}</span>` : ""}</span>`;
  // 「※販売元…」と製造国の根拠は、値と分けて細字で出す。所在地は、海外は国名だけ、国内は都道府県まで（placeOf）
  const [hqRaw, hqNote] = String(o.hq || "").split(/\s*※/);
  const hq = placeOf(hqRaw);
  const makers = o.makers || [];
  const bare = (name) => String(name).replace(/株式会社/g, "");
  // 「UW JAPAN株式会社」の英字部分は途中で改行させない
  const companyName = (name) => {
    const m = /^([A-Za-z][A-Za-z ]*[A-Za-z])(.*)$/.exec(name);
    return m ? `<span class="nowrap">${esc(m[1])}</span>${kw(m[2])}` : kw(name);
  };
  const sellers = (o.sellers || []).filter((x) => !makers.some((m) => bare(m.name) === bare(x.name)));
  return [
    makers.length
      ? ["製造元・販売元", makers.map((m) => line(companyName(m.name) + src(m.url), [m.role, m.place && placeOf(m.place)].filter(Boolean).join("／"))).join("")]
      : ["本社所在地", o.hq && kw(hq) + (hqNote ? `<span class="spec__basis">${kw(`※${hqNote}`)}</span>` : "") + src(o.hq_url), none],
    ["製造国", o.made && kw(o.made) + (o.made_basis ? `<span class="spec__basis">${kw(`根拠：${o.made_basis}`)}</span>` : "") + src(o.made_url), none],
    ["国内のサポート", o.service && link(o.service, o.service_url), none],
    ...(sellers.length ? [["国内の販売店", sellers.map((x) => line(kw(x.name), x.note)).join("") + `<span class="spec__basis">${kw("公開情報で確認できた販売店です。ほかにも取り扱う店がある場合があります。")}</span>`]] : []),
  ];
}

/** スペック表の値の下に置く説明。押すと開く（ホバーでは開かない） */
function specNote(text) {
  return `<details class="spec__note"><summary>${kw("この目安について")}</summary><span class="spec__basis">${kw(text)}</span></details>`;
}

let altMemo = null; // { key, map }。D1 の公開機種が同じ間は、計算した代替候補を使い回す
async function alternativesOf(env, id, all, tagsOf) {
  const byId = new Map(all.map((r) => [r.id, r]));
  try {
    const { results } = await env.DB.prepare("SELECT alt_id, basis FROM product_alternatives WHERE product_id = ? ORDER BY rank").bind(id).all();
    const list = results.map((r) => ({ o: byId.get(r.alt_id), basis: r.basis })).filter((x) => x.o);
    if (list.length) return list;
  } catch (e) {
    console.warn("product_alternatives を読めませんでした（seed 前の D1）", e && e.message);
  }
  const key = all.map((r) => `${r.id}:${r.output_w}:${r.price_band}`).join("|");
  if (!altMemo || altMemo.key !== key) altMemo = { key, map: allocateAlternatives(all, tagsOf) };
  return altMemo.map.get(id) || [];
}

// 商品詳細ページ: /products/{maker_slug}-{model_slug}/
// URL はスラッグのみで決まるため、メーカー実名NGの場合は maker_slug を差し替えるだけで移行できる。
async function productPage(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM products WHERE slug = ? AND is_published = 1").bind(slug).first();
  if (!row) return notFoundPage(true);
  const p = rowToProduct(row);
  const [{ results: all }, { results: tagRows }] = await env.DB.batch([
    // 列を名指ししない（output_note・thickness_note の列がまだ無い D1 でも動くように）
    env.DB.prepare("SELECT * FROM products WHERE is_published = 1 ORDER BY id"),
    env.DB.prepare("SELECT t.product_id, t.axis, t.tag FROM product_tags t JOIN products p ON p.id = t.product_id WHERE p.is_published = 1 ORDER BY t.rowid"),
  ]);
  const tagsOf = new Map();
  for (const t of tagRows) {
    const m = tagsOf.get(t.product_id) || {};
    (m[t.axis] ||= []).push(t.tag);
    tagsOf.set(t.product_id, m);
  }
  const tags = tagsOf.get(p.id) || {};
  // 代替候補は公開中の全ページ分をまとめて割り当てたもの（特定のメーカーに偏らないように。worker/alternatives.js）。
  // seed のときに計算した product_alternatives を読む。表が無い・空のときだけ、ここで計算する（結果は isolate の中で使い回す）
  const alts = await alternativesOf(env, p.id, all, tagsOf);
  const [maker, makerAgent] = splitMaker(p.maker_name);
  const NA = "非公開";

  const li = (arr) => arr.length ? arr.map((x) => `<li>${kw(x)}</li>`).join("") : `<li class="fit__none">${kw("メーカーの公開情報に記載はありません")}</li>`;

  // スペック表。メーカーが公開していない項目は「非公開」を実値と区別できる見た目（.is-na）で出す。
  // 板厚はメーカーの公表値（thickness_note）を出す。診断用の板厚区分（product_tags）は、公表値が無いときだけ行名を分けて出す
  const thicknessTags = (tags.thickness || []).join("・");
  const thicknessRows = [["板厚の公表値", p.thickness_note && kw(p.thickness_note)]];
  if (!p.thickness_note && thicknessTags) thicknessRows.push(["板厚の区分（診断用）", kw(thicknessTags)]);
  // 出力から見た板厚の目安（運営元の目安）。メーカーの公表値とは別の行に出す
  const guide = thicknessGuide(diagnosis, p);
  if (guide) thicknessRows.push(["板厚の目安", kw(`${guide.name}（${guide.range}）クラス`) + specNote(`${diagnosis.thicknessGuide.label}。${diagnosis.thicknessGuide.note}`)]);
  // アルミ・銅をコア径/出力を基準に見た目安（diagnosis.json の materialCriteria）。メーカーの対応素材とは別の行
  const mc = materialCriteria(diagnosis, p);
  const mcCfg = diagnosis.materialCriteria;
  const mcText = Object.entries(mc).map(([m, x]) => `${m}：${x.ok ? `基準を満たす（${x.by === "core" ? "ファイバコア径" : "出力"}）` : x.by === null ? "判定できない" : "基準に届かない"}`).join("／");
  const mcRule = Object.entries(mcCfg.rules).map(([m, x]) => `${m}はファイバコア径${x.maxCoreUm}μm以下か出力${x.minOutputW.toLocaleString("ja-JP")}W以上`).join("、");
  const cooling = coolingOf(p);
  const spec = [
    ["方式", kw(p.method)], ["波長", kw(p.wavelength)], ["出力", outputHtml(p)], ["本体の重さ・大きさ", kw(p.portability)],
    ["冷却方式", cooling && kw(cooling + (p.cooling ? "" : "（本体の記載から）"))],
    ["ファイバコア径", p.fiber_core_um != null && kw(`${p.fiber_core_um}μm`), "公式に記載なし"],
    ["ワイヤー供給", p.wire_feed && kw(p.wire_feed === "対応" ? "対応（標準かオプションかは記載なし）" : p.wire_feed === "標準" ? "標準装備" : "オプションであり"), "公式に記載なし"],
    ["対応素材", kw((tags.material || []).join("・"))],
    ["アルミ・銅の目安", kw(mcText) + specNote(`${mcCfg.label}：${mcRule}（コア径が非公開なら出力だけで判定）。${mcCfg.note}`)],
    ...thicknessRows,
    // UW シリーズ（製造元・販売元を併記する機種）は、使用環境が空なら行ごと出さない（2026-10-16 北坂社長）
    ...((tags.environment || []).length || !p.origin.makers ? [["使用環境", kw((tags.environment || []).join("・"))]] : []), ["価格帯", p.price_band ? kw(p.price_band) : p.handled_by_operator ? `<a href="/contact/?type=quote&amp;product=${esc(p.slug)}">お問い合わせ</a>` : ""], ["習得難易度", kw(p.skill_level)],
    ...(p.spec_rows || []).map(([k, v]) => [k, kw(v)]),
    ...originRows(p.origin),
  ].map(([k, v, na]) => `<div class="spec__row"><dt>${kw(k)}</dt>${v ? `<dd>${v}</dd>` : `<dd class="is-na">${na || NA}</dd>`}</div>`).join("");
  const madeInJapan = /^日本/.test(p.origin.made || "");

  // 頭の帯: 公開されている値を先に、非公開の項目は後ろに控えめに
  const bandItems = [
    ["出力", outputHtml(p, "出力：", true)],
    ["価格帯", p.price_band ? `<span class="nowrap">価格帯：<b>${esc(p.price_band)}</b></span>` : p.handled_by_operator ? `<span class="nowrap">価格：<b>お問い合わせ</b></span>` : ""],
    ["習得難易度", p.skill_level && `<span class="nowrap">習得難易度：<b>${esc(p.skill_level)}</b></span>`],
  ];
  const band = [...bandItems.filter(([, v]) => v), ...bandItems.filter(([, v]) => !v)]
    .map(([k, v]) => v ? `<span>${v}</span>` : `<span class="is-na nowrap">${k}：${NA}</span>`).join("");

  const newWin = `<span class="nowrap">（別ウィンドウで開く）</span>`;
  const links = [
    p.official_url ? `<li><a href="${esc(p.official_url)}" target="_blank" rel="noopener">${icon("external")}<span class="pnav__label">${kw("メーカー公式の商品ページ")}<span class="pnav__sub">${hostHtml(p.official_url)}${newWin}</span></span>${icon("chevron", "ico ico--chev")}</a></li>` : "",
    p.source_url && p.source_url !== p.official_url ? `<li><a href="${esc(p.source_url)}" target="_blank" rel="noopener">${icon("doc")}<span class="pnav__label">${kw(`情報源：${p.source || "資料"}`)}<span class="pnav__sub">${hostHtml(p.source_url)}${newWin}</span></span>${icon("chevron", "ico ico--chev")}</a></li>` : "",
  ].join("");

  // 他社機のページ: 条件の近い運営元の取り扱い機と並べて見せ、実機で比べる相談につなげる
  const target = p.handled_by_operator ? null : compareTarget(diagnosis, p);
  const vsItem = target ? all.map(rowToProduct).find((o) => o.slug === target.slug && o.handled_by_operator) || null : null;
  let vsSection = "";
  if (vsItem) {
    const vt = tagsOf.get(vsItem.id) || {};
    const val = (x, xt, k) => ({
      out: outputParts(x)[0] && `<span class="nowrap">${esc(outputParts(x)[0])}</span>`, method: kw(x.method), port: kw(x.portability),
      mat: kw((xt.material || []).join("・")), thick: x.thickness_note && kw(x.thickness_note),
      price: x.price_band ? kw(x.price_band) : x.handled_by_operator ? "お問い合わせ" : "",
      skill: kw(x.skill_level), service: x.origin?.service && kw(x.origin.service),
      cooling: coolingOf(x) && kw(coolingOf(x)), core: x.fiber_core_um != null && kw(`${x.fiber_core_um}μm`),
      wire: x.wire_feed && kw(x.wire_feed === "標準" ? "標準装備" : x.wire_feed),
    })[k];
    const rows = [["出力", "out"], ["冷却方式", "cooling"], ["方式", "method"], ["本体の重さ・大きさ", "port"], ["ファイバコア径", "core"], ["ワイヤー供給", "wire"], ["対応素材", "mat"], ["板厚の公表値", "thick"], ["価格帯", "price"], ["習得難易度", "skill"], ["国内のサポート", "service"]]
      .map(([label, k]) => {
        const a = val(p, tags, k), b = val(vsItem, vt, k);
        const na = ["service", "core", "wire"].includes(k) ? "公式に記載なし" : NA;
        return `<div class="vs__row"><dt>${kw(label)}</dt>${a ? `<dd>${a}</dd>` : `<dd class="is-na">${na}</dd>`}${b ? `<dd>${b}</dd>` : `<dd class="is-na">${na}</dd>`}</div>`;
      }).join("");
    vsSection = `<section class="subsec vs" id="vs">
    <h2>${kw("運営元の取り扱い機と比べる")}</h2>
    <p class="vs__note">${kw(`${target.cooling ? `${target.cooling}の機種なので、運営元が取り扱う${target.cooling}の機種と比べています。` : target.note || ""}機種一覧の並び順や診断の順位には関係しません。`)}</p>
    <div class="vs__names"><div><span class="vs__tag">この機種</span>${productPhoto(p, "row")}<b>${kw(p.name)}</b><small>${kw(maker)}</small></div><div><span class="vs__tag vs__tag--op">${esc(vsItem.handled_label || "運営元で取り扱い")}</span>${productPhoto(vsItem, "row")}<b>${kw(vsItem.name)}</b><small>${kw(splitMaker(vsItem.maker_name)[0])}</small></div></div>
    <dl class="vs__rows">${rows}</dl>
    <div class="vs__cta">
      <a class="btn btn--accent" href="/contact/?type=test&amp;product=${esc(p.slug)}&amp;compare=${esc(vsItem.slug)}">${kw("2台を実機で比べる（テスト溶接）")}</a>
      <a class="btn" href="/products/${esc(vsItem.slug)}/">${kw(`${vsItem.name} の詳細を見る`)}</a>
    </div>
  </section>`;
  }

  let altsSection = "";
  if (alts.length) {
    const [altTitle, altNote0] = altsHeading(p, tags, alts);
    const region = regionOf(p);
    const altNote = altNote0 + (region === "domestic" ? "国内メーカー（本社が日本）の中から選んでいます。" : region === "overseas" ? "海外メーカーの中から選んでいます。" : "");
    altsSection = `<section class="subsec" id="alts"><h2>${kw(altTitle)}</h2><p class="alts__note">${kw(altNote)}</p>
    <ul class="pnav">${alts.map(({ o }) => {
      const sub = [
        kw(splitMaker(o.maker_name)[0]),
        outputHtml(o, "出力 "),
        o.price_band ? `<span class="nowrap">価格帯 ${esc(o.price_band)}</span>` : "",
        o.handled_by_operator ? `<span class="nowrap">${esc(o.handled_label || "運営元で取り扱い")}</span>` : "",
      ].filter(Boolean).join("&#8288;｜<wbr>"); // U+2060（改行させない印）で「｜」を前の項目に付け、行頭に来ないようにする
      return `<li><a href="/products/${esc(o.slug)}/">${icon(productKind(o))}<span class="pnav__label">${kw(o.name)}<span class="pnav__sub">${sub}</span></span>${icon("chevron", "ico ico--chev")}</a></li>`;
    }).join("")}</ul></section>`;
  }

  const body = `
<nav class="subnav" aria-label="ページ内メニュー"><ul>
  <li><a href="#top" aria-current="true">概要</a></li><li><a href="#spec">スペック</a></li><li><a href="#fit">向き不向き</a></li><li><a href="#links">${p.handled_by_operator ? "資料" : "公式情報"}</a></li>
</ul></nav>
<main class="narrow product">
  <nav class="crumbs" aria-label="パンくず"><a href="/">トップ</a> › <a href="/lineup/">機種一覧</a> › <span>${kw(p.name)}</span></nav>
  <section class="product__intro" id="top">
    <div class="product__top">
      <div class="product__head">
        <p class="product__chips">${p.handled_by_operator ? `<span class="badge">${esc(p.handled_label || "運営元で取り扱い")}</span>` : ""}${/ハンド|ロボット|ライン|据置|真空|チャンバー/.test(p.method || "") ? `<span class="pchip">${kw(PRODUCT_KIND_LABEL[productKind(p)])}</span>` : ""}${p.skill_level ? `<span class="pchip">${kw(p.skill_level)}</span>` : ""}</p>
        <p class="product__maker">${kw(maker)}</p>
        <h1>${kw(p.name)}</h1>
        ${makerAgent ? `<p class="product__agent">${kw(makerAgent)}</p>` : ""}
        <div class="product__band">${band}</div>
        <p class="product__basis">${icon("info")}<span>${kw("この機種の情報は、メーカーや販売店が公開している情報を基に記載しています")}。<a href="#links">${kw("出典を見る")}</a></span></p>
      </div>
      <figure class="product__fig">${productPhoto(p, "product")}${p.image_credit ? `<figcaption class="photo-credit">画像：${p.image_source ? `<a href="${esc(p.image_source)}" target="_blank" rel="noopener">${kw(p.image_credit)}</a>` : kw(p.image_credit)}</figcaption>` : ""}</figure>
    </div>
    <h2>${kw("選定コメント")}</h2><p class="comment">${commentHtml(p.comment)}</p>
  </section>
  ${(p.features || []).length ? `<section class="subsec" id="features"><h2>特長</h2><ul class="features">${p.features.map((f) => `<li>${icon("check")}<span>${kw(f)}</span></li>`).join("")}</ul></section>` : ""}
  ${p.handled_by_operator && (p.support || []).length ? `<section class="subsec opsupport" id="support">
    <h2>${kw("運営元のサポート")}</h2>
    <p class="opsupport__lead">${kw(p.handled_label ? "この機種は、本サイトの運営元のグループ会社が販売窓口です。見積もり・テスト溶接・補助金の活用を相談できます。" : p.support.some((x) => x.includes("修理")) ? "この機種は本サイトの運営元が取り扱っています。導入前の確認から導入後の修理まで、運営元が対応します。" : "この機種は本サイトの運営元が取り扱っています。テスト溶接・見積もり・補助金の活用を運営元に相談できます。")}</p>
    <ul class="opsupport__list">${p.support.map((x) => `<li>${icon("check")}<span>${kw(x)}</span></li>`).join("")}</ul>
    <div class="opsupport__cta">
      <a class="btn btn--accent" href="/contact/?type=test&amp;product=${esc(p.slug)}">${kw("テスト溶接・デモを相談する")}</a>
      <a class="btn" href="/contact/?type=quote&amp;product=${esc(p.slug)}">${kw("見積もりを相談する")}</a>
      <a class="btn" href="/contact/?type=subsidy&amp;product=${esc(p.slug)}">${kw("補助金の活用を相談する")}</a>
    </div>
  </section>` : ""}
  <section class="subsec" id="spec"><h2>スペック</h2><dl class="spec">${spec}</dl>
    ${madeInJapan ? "" : `<p class="spec__more"><a href="/articles/overseas/">${icon("guide")}${kw("製造国やサポート体制の確かめ方（海外製を選ぶときのポイント）")}</a></p>`}</section>
  <section class="subsec" id="fit"><h2>${kw("向いている用途・向いていない用途")}</h2>
    <div class="fit"><div class="ok"><h3>${icon("good")}${kw("向いている")}</h3><ul>${li(p.suitable_for)}</ul></div><div class="ng"><h3>${icon("bad")}${kw("向いていない")}</h3><ul>${li(p.not_suitable_for)}</ul></div></div></section>
  ${vsSection}
  ${p.handled_by_operator || vsSection ? "" : `<aside class="trybox">${icon("handheld", "ico trybox__ico")}<div><p class="trybox__title">${kw("実機で確かめたいとき")}</p><p>${kw("運営元が取り扱う機種で、テスト溶接やデモを相談できます。仕上がりを比べる参考にお使いください。")}</p><a class="btn" href="/contact/?type=test&amp;product=${esc(p.slug)}">${kw("テスト溶接・デモを相談する")}</a></div></aside>`}
  <aside class="subsidybox">${icon("yen", "ico subsidybox__ico")}<div><p class="subsidybox__title">${kw("補助金・税制で導入費を抑える")}</p><p>${kw("設備投資に使われることの多い補助金・助成金と、即時償却などの税制をまとめています。")}</p><a class="btn" href="/subsidy/">${kw("補助金・税制の一覧を見る")}</a></div></aside>
  ${altsSection}
  <section class="subsec" id="links"><h2>${kw("メーカー公式・情報源")}</h2>
    ${links ? `<ul class="pnav">${links}</ul>` : ""}
    <p class="src">${kw("掲載内容は")}${kw(p.source || "公開情報")}${kw("に基づきます。価格帯や板厚など、メーカーが公開していない項目は「非公開」としています。")}</p>
  </section>
  <div class="cta">
    <a class="btn btn--primary" href="/diagnosis/">${icon("diag")}${kw("診断でほかの候補も見る")}</a>
    <a class="btn btn--accent" href="/contact/?type=${p.handled_by_operator ? "quote" : "choose"}&amp;product=${esc(p.slug)}">${icon("consult")}${kw(p.handled_by_operator ? "見積もり・導入を相談する" : "この機種について相談する")}</a>
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
  return html(pageShell(p.name.includes(maker) ? p.name : `${p.name}（${maker}）`, body, {
    path: `/products/${p.slug}/`,
    description: `${p.name}（${maker}）の公開仕様、向いている用途・向いていない用途、代替候補。メーカーや販売店が公開している情報を基に記載しています。`,
  }));
}

/** 商品が見つからない・存在しないページ（404） */
function notFoundPage(isProduct = false) {
  const [h1, lead] = isProduct
    ? ["お探しの機種が見つかりません", "掲載を終えたか、URL が変わった可能性があります。"]
    : ["ページが見つかりません", "URL が変わったか、ページが無くなった可能性があります。"];
  const body = `
<main class="section page-msg">
  <div class="narrow">
    <div class="sec-head"><h1>${kw(h1)}</h1><span class="sec-head__eyebrow">${kw(lead)}</span></div>
    <p>${kw("機種一覧から探すか、5つの質問に答えて現場に合う機種を絞り込めます。")}</p>
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
    <div class="sec-head"><h1>${kw("ただいま表示できません")}</h1><span class="sec-head__eyebrow">${kw("機種の情報を読み込めませんでした。")}</span></div>
    <p>${kw("しばらく時間をおいて、もう一度お試しください。")}</p>
    <div class="cta">
      <a class="btn btn--primary" href="/lineup/">${icon("lineup")}機種一覧へ</a>
      <a class="btn" href="/diagnosis/">${icon("diag")}5つの質問で選ぶ</a>
    </div>
  </div>
</main>`;
  return html(pageShell("ただいま表示できません", body, { current: "" }), 500);
}

/** Worker が作るページの共通部分。path があるページ（商品ページ）は検索に出し、無いページ（404・エラー）は noindex */
function pageShell(title, body, { current = "/lineup/", path = null, description = "" } = {}) {
  const meta = path
    ? `<link rel="canonical" href="${ORIGIN}${esc(path)}"><meta property="og:url" content="${ORIGIN}${esc(path)}">${description ? `<meta name="description" content="${esc(description)}"><meta property="og:description" content="${esc(description)}">` : ""}`
    : `<meta name="robots" content="noindex,nofollow">`;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
${meta}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta property="og:type" content="website"><meta property="og:site_name" content="レーザー溶接機 比較・選定"><meta property="og:title" content="${esc(title)}"><meta property="og:image" content="${ORIGIN}/assets/images/ogp.jpg"><meta name="twitter:card" content="summary_large_image"><title>${esc(title)}｜${SITE_NAME}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css?v=24"><link rel="stylesheet" href="/assets/css/product.css?v=24"></head><body>
<div id="siteHeader"></div>
${body}
<div id="siteFooter"></div>
<script type="module">import { mountChrome } from "/assets/js/partials.js?v=24"; mountChrome({ current: ${JSON.stringify(current)} });</script>
</body></html>`;
}

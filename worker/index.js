// Cloudflare Worker: 静的アセット配信 + 診断ログAPI + 商品詳細ページ
// 診断スコアリングはクライアント側（src/assets/js/scoring.js）で行い、
// Worker は D1 の「商品マスタ」と「診断ログ」だけを扱う。

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QUESTIONS = ["q1_material", "q2_thickness", "q3_skill", "q4_environment", "q5_budget"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) return handleApi(request, env, path);

    const m = path.match(/^\/products\/([a-z0-9-]+)\/?$/);
    if (m) {
      if (!path.endsWith("/")) return Response.redirect(url.origin + path + "/", 301);
      return productPage(env, m[1]);
    }
    return env.ASSETS.fetch(request);
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

function rowToProduct(r) {
  return { ...r, suitable_for: JSON.parse(r.suitable_for || "[]"), not_suitable_for: JSON.parse(r.not_suitable_for || "[]"), handled_by_operator: !!r.handled_by_operator };
}

// 商品詳細ページ: /products/{maker_slug}-{model_slug}/
// URL はスラッグのみで決まるため、メーカー実名NGの場合は maker_slug を差し替えるだけで移行できる。
async function productPage(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM products WHERE slug = ? AND is_published = 1").bind(slug).first();
  if (!row) return html(pageShell("商品が見つかりません", `<main class="wrap"><h1>商品が見つかりません</h1><p><a class="btn" href="/diagnosis/">診断からさがす</a></p></main>`), 404);
  const p = rowToProduct(row);
  const { results: tagRows } = await env.DB.prepare("SELECT axis, tag FROM product_tags WHERE product_id = ? ORDER BY rowid").bind(p.id).all();
  const tags = {};
  for (const t of tagRows) (tags[t.axis] ||= []).push(t.tag);
  const { results: alts } = await env.DB
    .prepare("SELECT slug, name, maker_name, handled_by_operator FROM products WHERE price_band = ? AND id <> ? AND is_published = 1 ORDER BY id LIMIT 2")
    .bind(p.price_band, p.id).all();

  const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join("");
  const spec = [
    ["方式", p.method], ["波長", p.wavelength || "—"], ["出力", p.output_w ? `${p.output_w} W` : "—"], ["可搬性", p.portability],
    ["対応素材", (tags.material || []).join("・")], ["対応板厚", (tags.thickness || []).join("・")],
    ["使用環境", (tags.environment || []).join("・")], ["価格帯", p.price_band], ["習得難易度", p.skill_level],
  ].map(([k, v]) => `<div class="spec__row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");

  const body = `
<main class="wrap product">
  <nav class="crumbs" aria-label="パンくず"><a href="/">トップ</a> › <a href="/diagnosis/">診断</a> › <span>${esc(p.name)}</span></nav>
  ${p.handled_by_operator ? `<p class="label-handled">運営元で取り扱い</p>` : ""}
  <h1>${esc(p.name)}</h1>
  <p class="product__maker">${esc(p.maker_name)}</p>
  <img class="product__image" src="${esc(p.image || "/assets/images/products/placeholder.svg")}" alt="" width="640" height="400" loading="lazy">
  <section><h2>運営者の選定コメント</h2><p class="comment">${esc(p.comment)}</p></section>
  <section><h2>スペック</h2><dl class="spec">${spec}</dl></section>
  <section class="fit"><div><h2>向いている用途</h2><ul>${li(p.suitable_for)}</ul></div><div><h2>向いていない用途</h2><ul>${li(p.not_suitable_for)}</ul></div></section>
  <section><h2>同じ価格帯の代替候補</h2><ul class="alts">${alts.map((a) => `<li><a href="/products/${esc(a.slug)}/">${esc(a.name)}<span>${esc(a.maker_name)}</span></a></li>`).join("") || "<li>該当なし</li>"}</ul></section>
  <p class="src">情報源：${esc(p.source || "—")}</p>
  <div class="cta"><a class="btn btn--primary" href="/diagnosis/">診断でほかの候補も見る</a></div>
</main>`;
  return html(pageShell(`${p.name}｜${p.maker_name}｜比較`, body));
}

function pageShell(title, body) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="stylesheet" href="/assets/css/style.css?v=2"></head><body>
<header class="header"><a class="header__brand" href="/">レーザー溶接機 比較・選定（仮）</a></header>
${body}
<footer class="footer"><p>運営：ノースヒルズ溶接工業株式会社（レーザー溶接機の販売事業者です。一部製品を取り扱っています）</p><p><a href="/about/">運営者について・評価基準</a></p></footer>
</body></html>`;
}

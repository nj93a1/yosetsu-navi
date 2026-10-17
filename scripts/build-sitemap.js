// サイトマップ（src/sitemap.xml）と robots.txt（src/robots.txt）を書き出す。npm run build の最後に動く。
//   載せるページ: 静的ページ・公開中の商品ページ（src/data/products.json）・公開済みのコラム（src/data/columns.json）
//   載せないページ: /redesign/（デザイン案。noindex）・/api/
import { readFileSync, writeFileSync } from "node:fs";

const ORIGIN = "https://yosetsu-kakaku.com";
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const STATIC = ["/", "/diagnosis/", "/lineup/", "/articles/", "/articles/overseas/", "/columns/", "/subsidy/", "/contact/", "/about/", "/privacy/", "/disclaimer/"];
const products = read("../src/data/products.json").filter((p) => p.is_published !== false).map((p) => `/products/${p.maker_slug}-${p.model_slug}/`);
const columns = read("../src/data/columns.json").map((c) => ({ path: `/columns/${c.path}/`, lastmod: c.date }));

const urls = [...STATIC.map((path) => ({ path })), ...products.map((path) => ({ path })), ...columns];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u.path}</loc><lastmod>${u.lastmod || today}</lastmod></url>`).join("\n")}
</urlset>
`;
writeFileSync(new URL("../src/sitemap.xml", import.meta.url), xml);
writeFileSync(new URL("../src/robots.txt", import.meta.url), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`);
console.log(`サイトマップ: ${urls.length} ページ（商品 ${products.length}・コラム ${columns.length}）`);

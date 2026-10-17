import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 公開（2026-10-17、https://yosetsu-kakaku.com）: 検索に出すページと出さないページ
const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const htmlFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? htmlFiles(p) : f.endsWith(".html") ? [p] : [];
});

test("公開: /redesign/ 以外のページは noindex を外し、正式なドメインの canonical を持つ", () => {
  for (const f of htmlFiles(SRC)) {
    const s = readFileSync(f, "utf8");
    const rel = f.slice(SRC.length);
    if (rel.startsWith("redesign/")) { assert.match(s, /noindex/, rel); continue; }
    assert.doesNotMatch(s, /noindex/, rel);
    assert.match(s, /<link rel="canonical" href="https:\/\/yosetsu-kakaku\.com\//, rel);
    assert.doesNotMatch(s, /jolly-frost-2311\.workers\.dev/, rel);
  }
});

test("公開: サイトマップに公開中の商品ページがすべて載り、robots.txt がサイトマップを指す", () => {
  const xml = readFileSync(join(SRC, "sitemap.xml"), "utf8");
  const products = JSON.parse(readFileSync(join(SRC, "data/products.json"), "utf8")).filter((p) => p.is_published !== false);
  for (const p of products) assert.ok(xml.includes(`<loc>https://yosetsu-kakaku.com/products/${p.maker_slug}-${p.model_slug}/</loc>`), p.name);
  assert.ok(!xml.includes("/redesign/"));
  assert.match(readFileSync(join(SRC, "robots.txt"), "utf8"), /Sitemap: https:\/\/yosetsu-kakaku\.com\/sitemap\.xml/);
});

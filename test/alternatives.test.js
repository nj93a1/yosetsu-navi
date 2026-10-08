import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateAlternatives, ALT_RULES } from "../worker/alternatives.js";

// 商品詳細ページの代替候補（worker/alternatives.js）を、公開中の機種（src/data/products.json）で確かめる
const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url)))
  .filter((p) => p.is_published !== false)
  .map((p) => ({ ...p, slug: `${p.maker_slug}-${p.model_slug}`, price_band: (p.tags?.price || [])[0] || null }));
const tagsOf = new Map(products.map((p) => [p.id, p.tags || {}]));
const result = allocateAlternatives(products, tagsOf);

test("代替候補: 同じメーカーは出さず、1ページに同じメーカーは1機種まで・最大2件", () => {
  for (const p of products) {
    const list = result.get(p.id);
    assert.ok(list.length <= ALT_RULES.perPage, p.slug);
    assert.ok(list.every(({ o }) => o.maker_slug !== p.maker_slug), `${p.slug} に同じメーカーの候補`);
    assert.equal(new Set(list.map(({ o }) => o.maker_slug)).size, list.length, `${p.slug} に同じメーカーが2機種`);
  }
});

test("代替候補: 特定のメーカーに偏らない（1メーカーが出るページ数は上限以内）", () => {
  const makers = new Set(products.map((p) => p.maker_slug)).size;
  const cap = Math.ceil((products.length * ALT_RULES.perPage) / makers) + 1;
  const shown = {};
  for (const p of products) for (const { o } of result.get(p.id)) shown[o.maker_slug] = (shown[o.maker_slug] || 0) + 1;
  for (const [m, n] of Object.entries(shown)) assert.ok(n <= cap, `${m} が ${n} ページに出ている（上限 ${cap}）`);
});

test("代替候補: 出力が outputSpan 以上違う機種は、同じ価格帯でなければ出さない", () => {
  for (const p of products) {
    for (const { o, basis } of result.get(p.id)) {
      if (basis === "price" || !p.output_w || !o.output_w) continue;
      assert.ok(Math.abs(p.output_w - o.output_w) < ALT_RULES.outputSpan, `${p.slug} → ${o.slug}`);
    }
  }
});

test("代替候補: 価格帯が同じ機種（別メーカー）があれば先頭に出る", () => {
  for (const p of products) {
    if (!p.price_band) continue;
    const same = products.some((o) => o.maker_slug !== p.maker_slug && o.price_band === p.price_band);
    if (same) assert.equal(result.get(p.id)[0]?.basis, "price", p.slug);
  }
});

test("代替候補: 用途タグが空でも、対応素材と出力が近ければ候補が出る", () => {
  const noUse = products.filter((p) => !(p.tags?.use || []).length && (p.tags?.material || []).length && p.output_w);
  for (const p of noUse) assert.ok(result.get(p.id).length > 0, p.slug);
});

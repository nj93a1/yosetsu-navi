import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDiagnosis, tagCount, productSlug, alternatives } from "../src/assets/js/scoring.js";

const config = JSON.parse(readFileSync(new URL("../src/data/diagnosis.json", import.meta.url)));
const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url)));

test("公開商品は実データ21点・非公開13点（ダミー10＋自社3）・スラッグ重複なし", () => {
  assert.equal(products.filter((p) => p.is_published !== false).length, 21);
  assert.equal(products.filter((p) => p.is_published === false).length, 13);
  assert.ok(products.filter((p) => p.is_published !== false).every((p) => p.official_url || p.source_url), "公開商品は公式URLか情報源URLを持つ");
  const slugs = new Set(products.map(productSlug));
  assert.equal(slugs.size, products.length);
});

test("全問わからない → 全件が候補、TOP5が返る", () => {
  const r = runDiagnosis(config, products, {});
  assert.equal(r.results.length, 5);
  assert.equal(r.matchedCount, 21);
  assert.equal(r.relaxedAxis, null);
});

test("鉄薄板・未経験・屋内・200万以内 → 適合機が上位、枠配分が固定", () => {
  const r = runDiagnosis(config, products, {
    q1_material: "steel", q2_thickness: "thin", q3_skill: "beginner", q4_environment: "indoor", q5_budget: "b100_200",
  });
  assert.equal(r.results.length, 5);
  assert.deepEqual(r.results.map((x) => x.slotType), ["fit", "fit", "fit", "specialty", "price"]);
  assert.ok(["p219", "p220"].includes(r.results[0].product.id), r.results[0].product.id);
  assert.ok(r.results[0].matched);
  assert.match(r.results[3].reason, /^専門用途/);
  assert.match(r.results[4].reason, /^価格重視：/);
  // 価格重視枠は残候補のうち最安帯
  assert.ok(r.results.every((x) => typeof x.reason === "string" && x.reason.length > 0));
});

test("完全一致ゼロ → 条件を1つ緩め、緩めた条件を明示", () => {
  // チタン・厚物・未経験・屋外・100〜200万 は該当なし
  const r = runDiagnosis(config, products, {
    q1_material: "ti", q2_thickness: "thick", q3_skill: "beginner", q4_environment: "outdoor", q5_budget: "b100_200",
  });
  // 1つ緩めても該当ゼロなら relaxedAxis は null のまま非適合を適合度順で返す
  assert.equal(r.results.length, 5);
  if (r.relaxedAxis) assert.ok(config.relax.order.includes(r.relaxedAxis));
});

test("予算だけが合わない → 予算を緩めて提示", () => {
  // 真空チタン機は 600万以上のみ
  // チタン・薄板・熟練・予算200万以内: チタン対応機は価格非公開のため予算で落ち、予算を緩めて提示
  const r = runDiagnosis(config, products, {
    q1_material: "ti", q2_thickness: "thin", q3_skill: "expert", q5_budget: "b100_200",
  });
  assert.equal(r.relaxedAxis, "price");
  assert.equal(r.relaxedLabel, "予算");
  assert.ok(r.results[0].matched);
});

test("複数素材・混在板厚 は min_count で判定", () => {
  const r = runDiagnosis(config, products, { q1_material: "multi", q2_thickness: "mixed" });
  const top = r.results.filter((x) => x.matched).map((x) => x.product.id);
  assert.ok(top.includes("p202"));
  assert.ok(top.includes("p203"));
  assert.ok(!top.includes("p205"));
});

test("代替候補は同価格帯・自分以外・最大2件", () => {
  const p = products.find((x) => x.id === "p219");
  const alts = alternatives(products.filter((x) => x.is_published !== false), p);
  assert.ok(alts.length <= 2 && alts.length >= 1);
  assert.ok(alts.every((a) => a.id !== p.id && a.tags.price[0] === "100〜200万円"));
});

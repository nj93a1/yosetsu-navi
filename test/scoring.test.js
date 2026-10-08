import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDiagnosis, productSlug, alternatives } from "../src/assets/js/scoring.js";

const config = JSON.parse(readFileSync(new URL("../src/data/diagnosis.json", import.meta.url)));
const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url)));
const published = products.filter((p) => p.is_published !== false);
const strict = { ...config, unknownTags: { policy: "mismatch" } };

test("公開商品は実データ21点・非公開13点（ダミー10＋自社3）・スラッグ重複なし・公式か情報源のURLあり", () => {
  assert.equal(published.length, 21);
  assert.equal(products.filter((p) => p.is_published === false).length, 13);
  assert.equal(new Set(products.map(productSlug)).size, products.length);
  assert.ok(published.every((p) => p.official_url || p.source_url));
});

test("全問わからない → 全件が候補、TOP5、理由は向いている用途", () => {
  const r = runDiagnosis(config, products, {});
  assert.equal(r.results.length, 5);
  assert.equal(r.matchedCount, 21);
  assert.equal(r.relaxedAxis, null);
  assert.ok(r.results.every((x) => x.reason.length > 0 && !x.reason.includes("undefined")));
});

test("典型回答（鉄・ステンレス×薄板×新人×屋内×200〜400万）→ 枠配分が固定で、上位は条件に合う機種", () => {
  const r = runDiagnosis(config, products, {
    q1_material: "steel", q2_thickness: "thin", q3_skill: "novice", q4_environment: "indoor", q5_budget: "b200_400",
  });
  assert.deepEqual(r.results.map((x) => x.slotType), ["fit", "fit", "fit", "specialty", "price"]);
  assert.ok(r.results.slice(0, 3).every((x) => x.matched));
  assert.match(r.results[3].reason, /^専門用途/);
  assert.match(r.results[4].reason, /^価格重視：\d/); // 価格帯が公開されている機種だけが価格重視枠に入る
});

test("非公開の項目は不一致にしない（neutral）。理由に「非公開」と明示", () => {
  const r = runDiagnosis(config, products, { q1_material: "steel", q4_environment: "indoor" });
  const fh = r.results.find((x) => x.product.id === "p201");
  assert.ok(r.matchedCount > 5, `matched ${r.matchedCount}`);
  assert.ok(r.results.every((x) => x.matched));
  if (fh) assert.match(fh.reason, /環境は非公開/);
});

test("policy=mismatch に切り替えると、非公開の項目は不一致として扱う（設定で切替可能）", () => {
  const q = { q1_material: "steel", q5_budget: "b200_400" };
  const r = runDiagnosis(strict, products, q);
  const neutral = runDiagnosis(config, products, q);
  assert.ok(r.matchedCount < neutral.matchedCount, `strict ${r.matchedCount} / neutral ${neutral.matchedCount}`);
  assert.ok(r.results.slice(0, 3).every((x) => (x.product.tags.price || []).length === 1)); // 価格帯が公開されている機種だけが一致
});

test("ほぼ全項目が非公開の機種は「条件に合う」と数えない（minKnownAxes）", () => {
  const r = runDiagnosis(config, products, { q1_material: "steel", q2_thickness: "thin", q3_skill: "novice" });
  const vhp = r.results.find((x) => x.product.id === "p208"); // V-HP1500 は素材・板厚・難易度が非公開
  if (vhp) assert.equal(vhp.matched, false);
});

test("完全一致ゼロ → 条件を1つ緩めて、緩めた条件を明示（チタン×厚物 → 板厚を緩める）", () => {
  const r = runDiagnosis(config, products, {
    q1_material: "ti", q2_thickness: "thick", q3_skill: "beginner", q4_environment: "outdoor", q5_budget: "b100_200",
  });
  assert.equal(r.relaxedAxis, "thickness");
  assert.equal(r.relaxedLabel, "板厚");
  assert.ok(r.results[0].matched);
});

test("複数素材・混在板厚 は min_count で判定（混在は板厚3区分以上）", () => {
  const r = runDiagnosis(config, products, { q1_material: "multi", q2_thickness: "mixed" });
  const byId = Object.fromEntries(r.results.map((x) => [x.product.id, x]));
  assert.ok(r.results[0].matched);
  assert.match(r.results[0].reason, /板厚は非公開/); // 板厚を公開していない機種は「非公開」と明示して残す
  const amada = runDiagnosis(config, products, { q1_material: "multi" }).results.map((x) => x.product.id);
  assert.ok(amada.length === 5);
  if (byId.p203) assert.equal(byId.p203.matched, false); // 板厚2区分のアマダは「混在」に不一致
});

test("代替候補は同価格帯・自分以外・最大2件", () => {
  const p = products.find((x) => x.id === "p219");
  const alts = alternatives(published, p);
  assert.ok(alts.length >= 1 && alts.length <= 2);
  assert.ok(alts.every((a) => a.id !== p.id && a.tags.price[0] === "100〜200万円"));
});

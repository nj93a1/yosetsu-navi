import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIES, AXES, filterProducts, parseState } from "../src/assets/js/lineup.js";
import { coolingOf } from "../src/assets/js/scoring.js";

const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url))).filter((p) => p.is_published !== false);
const run = (qs) => filterProducts(products, parseState(new URLSearchParams(qs)));

test("冷却方式のタブ: 空冷と水冷はどちらも機種があり、重ならない。冷却方式が非公開の機種は「すべて」にだけ出る", () => {
  const air = run("cat=air"), water = run("cat=water");
  assert.ok(air.length > 0 && water.length > 0);
  assert.ok(!air.some((p) => water.includes(p)));
  assert.equal(air.length + water.length + products.filter((p) => !coolingOf(p)).length, products.length);
  assert.equal(run("cat=all").length, products.length);
});

test("以前の種類タブの URL: ?cat=line はロボット・自動化の絞り込みに、ほかは「すべて」に置き換える", () => {
  assert.deepEqual(run("cat=line").map((p) => p.id), run("use=自動化").map((p) => p.id));
  assert.equal(run("cat=handheld").length, products.length);
  assert.equal(run("cat=fixed").length, products.length);
});

test("キーワード検索は、製造元・国内販売店の名前でも見つかる（ノースヒルズ → UW、エル・ビー・ウエルド → THEO）", () => {
  assert.ok(run("q=ノースヒルズ").some((p) => /^UW-/.test(p.name)));
  assert.ok(run("q=エル・ビー・ウエルド").some((p) => /^THEO/.test(p.name)));
});

test("「日本製」で絞り込める（製造国が日本の機種だけ。「中国（日本で検査）」などは入れない）", () => {
  const list = run("made=日本製");
  assert.ok(list.length >= 4 && list.some((p) => /^UW-/.test(p.name)));
  assert.ok(list.every((p) => /^日本/.test(p.origin?.made || "")));
});

test("絞り込みのチップは、別の項目どうしで同じ名前にならない（板厚の目安とメーカーの公表値など）", () => {
  const names = AXES.flatMap((a) => a.values.map((v) => (a.names && a.names[v]) || v));
  assert.equal(new Set(names).size, names.length, names.join(" / "));
});

test("ワイヤー送給装置が標準装備の機種は、ワイヤー供給できる機種に含まれる", () => {
  const std = run("wire=標準装備"), any = run("wire=ワイヤー供給できる");
  assert.ok(std.length > 0 && std.every((p) => any.includes(p)));
});

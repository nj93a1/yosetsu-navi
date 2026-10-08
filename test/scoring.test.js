import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runDiagnosis, productSlug, alternatives, scoreProduct, resolveAnswers } from "../src/assets/js/scoring.js";

const config = JSON.parse(readFileSync(new URL("../src/data/diagnosis.json", import.meta.url)));
// src/data/products.json は公開分だけの生成物になる予定なので、診断のテストは is_published で絞った公開機種だけを対象にする
const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url)));
const published = products.filter((p) => p.is_published !== false);
const strict = { ...config, unknownTags: { policy: "mismatch" } };
// 非公開分（ダミー・自社機）を含むマスタ。無い環境ではその件数のテストを飛ばす
const masterUrl = new URL("../data/products.json", import.meta.url);
const master = existsSync(masterUrl) ? JSON.parse(readFileSync(masterUrl)) : null;

/** 全回答（各設問の選択肢＋わからない）の直積 */
function allAnswers() {
  const out = [];
  const rec = (ans, i) => {
    if (i === config.questions.length) { out.push(ans); return; }
    const q = config.questions[i];
    for (const o of q.options) rec({ ...ans, [q.id]: o.id }, i + 1);
  };
  rec({}, 0);
  return out;
}
const ALL = allAnswers();

test("公開商品は実データ21点・スラッグ重複なし・公式か情報源のURLあり", () => {
  assert.equal(published.length, 21);
  assert.equal(new Set(published.map(productSlug)).size, published.length);
  assert.ok(published.every((p) => p.official_url || p.source_url));
});

test("マスタの非公開は13点（ダミー10＋自社3）", { skip: master ? false : "マスタ data/products.json が無い" }, () => {
  assert.equal(master.filter((p) => p.is_published === false).length, 13);
  assert.equal(new Set(master.map(productSlug)).size, master.length);
});

test("全問わからない → 全件が候補、TOP5、理由は向いている用途", () => {
  const r = runDiagnosis(config, published, {});
  assert.equal(r.results.length, 5);
  assert.equal(r.matchedCount, 21);
  assert.equal(r.relaxedAxis, null);
  assert.ok(r.results.every((x) => x.reason.length > 0 && !x.reason.includes("undefined")));
});

test("典型回答（鉄・ステンレス×薄板×新人×屋内×200〜400万）→ 枠配分が固定で、上位は条件に合う機種", () => {
  const r = runDiagnosis(config, published, {
    q1_material: "steel", q2_thickness: "thin", q3_skill: "novice", q4_environment: "indoor", q5_budget: "b200_400",
  });
  assert.deepEqual(r.results.map((x) => x.slotType), ["fit", "fit", "fit", "specialty", "price"]);
  assert.ok(r.results.slice(0, 3).every((x) => x.matched));
  // 4位: 回答に無い専門タグだけを「〜にも対応」と添える（「専門用途（…）：」の見出し文は付けない）
  assert.doesNotMatch(r.results[3].reason, /^専門用途/);
  assert.match(r.results[3].reason, /にも対応/);
  // 5位: 価格帯が公開されている機種だけ。価格帯を先に出し、予算の理由（〜万円以内）は重ねない
  assert.match(r.results[4].reason, /^価格帯は\d/);
  assert.doesNotMatch(r.results[4].reason, /万円以内/);
});

test("非公開の項目は不一致にしない（neutral）。理由に「非公開」と明示", () => {
  const r = runDiagnosis(config, published, { q1_material: "steel", q4_environment: "indoor" });
  const fh = r.results.find((x) => x.product.id === "p201");
  assert.ok(r.matchedCount > 5, `matched ${r.matchedCount}`);
  assert.ok(r.results.every((x) => x.matched));
  if (fh) assert.match(fh.reason, /環境は非公開/);
});

test("policy=mismatch に切り替えると、非公開の項目は不一致として扱う（設定で切替可能）", () => {
  const q = { q1_material: "steel", q5_budget: "b200_400" };
  const r = runDiagnosis(strict, published, q);
  const neutral = runDiagnosis(config, published, q);
  assert.ok(r.matchedCount < neutral.matchedCount, `strict ${r.matchedCount} / neutral ${neutral.matchedCount}`);
  // 価格帯が公開されている機種だけが一致する（メーカー上限で入りきらない分は、条件外として後ろに並ぶ）
  assert.ok(r.results.filter((x) => x.matched).every((x) => (x.product.tags.price || []).length === 1));
  assert.ok(r.results[0].matched);
});

test("ほぼ全項目が非公開の機種は「条件に合う」と数えない（minKnownAxes）", () => {
  const r = runDiagnosis(config, published, { q1_material: "steel", q2_thickness: "thin", q3_skill: "novice" });
  const vhp = r.results.find((x) => x.product.id === "p208"); // V-HP1500 は素材・板厚・難易度が非公開
  if (vhp) assert.equal(vhp.matched, false);
});

test("完全一致ゼロ → 条件を1つ緩めて、緩めた条件を明示（チタン×厚物 → 板厚を緩める）", () => {
  const r = runDiagnosis(config, published, {
    q1_material: "ti", q2_thickness: "thick", q3_skill: "beginner", q4_environment: "outdoor", q5_budget: "b100_200",
  });
  assert.equal(r.relaxedAxis, "thickness");
  assert.equal(r.relaxedLabel, "板厚");
  assert.ok(r.results[0].matched);
});

test("緩和する条件は、外したときに最も多くの機種が残る条件（同数なら relax.order の順）", () => {
  assert.equal(config.relax.pick, "most_matched");
  const countWithout = (ans, axis) => {
    const rel = resolveAnswers(config, ans).filter((x) => x.axis !== axis);
    return published.map((p) => scoreProduct(config, rel, p)).filter((s) => s.matched).length;
  };
  let relaxedCases = 0;
  for (const ans of ALL) {
    const r = runDiagnosis(config, published, ans);
    if (!r.relaxedAxis) continue;
    relaxedCases++;
    const axes = resolveAnswers(config, ans).map((x) => x.axis);
    const counts = Object.fromEntries(axes.map((a) => [a, countWithout(ans, a)]));
    const best = Math.max(...Object.values(counts));
    assert.equal(counts[r.relaxedAxis], best, `${JSON.stringify(ans)} → ${r.relaxedAxis} ${JSON.stringify(counts)}`);
    const firstBest = config.relax.order.find((a) => axes.includes(a) && counts[a] === best);
    assert.equal(r.relaxedAxis, firstBest, `同数のときは order の順: ${JSON.stringify(ans)}`);
  }
  assert.ok(relaxedCases > 0);
});

test("厚物で合う機種が無いとき、外すのは「予算」ではなく「板厚」。3〜6mm 対応機を薄板専用機より先に出す", () => {
  for (const q2 of ["thick", "mixed"]) {
    const r = runDiagnosis(config, published, {
      q1_material: "steel", q2_thickness: q2, q3_skill: "beginner", q4_environment: "indoor", q5_budget: "b200_400",
    });
    assert.equal(r.relaxedAxis, "thickness", q2);
    assert.ok(r.relaxedNote, "近い候補を先に出したことを画面に出す一文");
    assert.ok((r.results[0].product.tags.thickness || []).includes("3〜6mm"), `${q2}: 1位 ${r.results[0].product.name}`);
    // 薄板専用機には「板厚は条件外」と出す
    for (const x of r.results) {
      if (!(x.product.tags.thickness || []).includes("3〜6mm") && (x.product.tags.thickness || []).length) assert.match(x.reason, /板厚は条件外/);
    }
  }
});

test("TOP5 に同じメーカーは slots.maxPerMaker 台まで（全回答の組み合わせ）", () => {
  const max = config.slots.maxPerMaker;
  assert.ok(Number.isInteger(max) && max >= 1);
  for (const ans of ALL) {
    const r = runDiagnosis(config, published, ans);
    assert.equal(r.results.length, 5);
    assert.equal(new Set(r.results.map((x) => x.product.id)).size, 5);
    const per = {};
    for (const x of r.results) per[x.product.maker_slug] = (per[x.product.maker_slug] || 0) + 1;
    assert.ok(Math.max(...Object.values(per)) <= max, `${JSON.stringify(ans)} → ${JSON.stringify(per)}`);
  }
});

test("maxPerMaker を外すと同じメーカーが3台以上並ぶ回答があり、上限が効いている", () => {
  const noCap = { ...config, slots: { ...config.slots, maxPerMaker: undefined } };
  const over = ALL.some((ans) => {
    const per = {};
    for (const x of runDiagnosis(noCap, published, ans).results) per[x.product.maker_slug] = (per[x.product.maker_slug] || 0) + 1;
    return Math.max(...Object.values(per)) > config.slots.maxPerMaker;
  });
  assert.ok(over);
});

test("選定理由: 「熟練工が使う」でも未経験可の機種に「熟練者の技能を活かせる」と書かない", () => {
  const r = runDiagnosis(config, published, { q1_material: "steel", q2_thickness: "thin", q3_skill: "expert", q4_environment: "indoor", q5_budget: "b400_600" });
  for (const x of r.results) {
    assert.doesNotMatch(x.reason, /技能を活かせる/);
    if ((x.product.tags.skill || []).includes("未経験可")) assert.match(x.reason, /未経験でも扱える/);
  }
});

test("複数素材・混在板厚 は min_count で判定（混在は板厚3区分以上）", () => {
  const r = runDiagnosis(config, published, { q1_material: "multi", q2_thickness: "mixed" });
  const byId = Object.fromEntries(r.results.map((x) => [x.product.id, x]));
  assert.ok(r.results[0].matched);
  assert.match(r.results[0].reason, /板厚は非公開/); // 板厚を公開していない機種は「非公開」と明示して残す
  const amada = runDiagnosis(config, published, { q1_material: "multi" }).results.map((x) => x.product.id);
  assert.ok(amada.length === 5);
  if (byId.p203) assert.equal(byId.p203.matched, false); // 板厚2区分のアマダは「混在」に不一致
});

test("代替候補は同価格帯・自分以外・最大2件", () => {
  const p = published.find((x) => x.id === "p219");
  const alts = alternatives(published, p);
  assert.ok(alts.length >= 1 && alts.length <= 2);
  assert.ok(alts.every((a) => a.id !== p.id && a.tags.price[0] === "100〜200万円"));
});

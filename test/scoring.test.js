import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runDiagnosis, productSlug, alternatives, scoreProduct, resolveAnswers, optionMatches } from "../src/assets/js/scoring.js";

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
const RESULTS = ALL.map((ans) => ({ ans, r: runDiagnosis(config, published, ans) }));
const has36 = (p) => (p.tags.thickness || []).includes("3〜6mm");
// 条件の置き換え・緩和の動きを確かめるための固定セット（最初に掲載した他社21機種。厚物・混在・チタン×厚物を公開している機種が無い）
const base = published.filter((p) => p.id >= "p201" && p.id <= "p221");

test("厚物（6mm以上）を公開している機種があれば、置き換えずにそのまま一致として出す", () => {
  const r = runDiagnosis(config, published, { q2_thickness: "thick" });
  assert.equal(r.preferredAxis ?? null, null);
  assert.ok(r.results[0].matched && (r.results[0].product.tags.thickness || []).includes("6mm以上"));
});

test("公開商品は87点（他社74＋運営元の取り扱い13）・スラッグ重複なし・公式か情報源のURLあり", () => {
  assert.equal(published.length, 87);
  assert.equal(published.filter((p) => p.handled_by_operator).length, 13);
  assert.equal(base.length, 21);
  assert.equal(new Set(published.map(productSlug)).size, published.length);
  assert.ok(published.every((p) => p.official_url || p.source_url));
});

test("マスタの非公開は10点（ダミー）", { skip: master ? false : "マスタ data/products.json が無い" }, () => {
  assert.equal(master.filter((p) => p.is_published === false).length, 10);
  assert.equal(new Set(master.map(productSlug)).size, master.length);
});

test("全問わからない → 全件が候補、TOP5、理由は向いている用途", () => {
  const r = runDiagnosis(config, published, {});
  assert.equal(r.results.length, 5);
  assert.equal(r.matchedCount, published.length);
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
  const r = runDiagnosis(config, base, {
    q1_material: "ti", q2_thickness: "thick", q3_skill: "beginner", q4_environment: "outdoor", q5_budget: "b100_200",
  });
  assert.equal(r.relaxedAxis, "thickness");
  assert.equal(r.relaxedLabel, "板厚");
  assert.ok(r.results[0].matched);
});

test("緩和する条件は、外したときに公開情報で合う機種が最も多く残る条件（同数なら全体の件数、さらに同数なら relax.order の順）", () => {
  assert.equal(config.relax.pick, "most_matched");
  // 件数の比べ方: [公開情報で合う機種（厚物・混在の板厚を非公開のまま通った機種を除く）, 条件に合う機種の総数]
  const countWithout = (ans, axis) => {
    const rel = resolveAnswers(config, ans).filter((x) => x.axis !== axis);
    const m = published.map((p) => scoreProduct(config, rel, p)).filter((s) => s.matched);
    return m.filter((s) => !s.unknownLast).length * 1000 + m.length;
  };
  let relaxedCases = 0;
  for (const { ans, r } of RESULTS) {
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

test("厚物・混在に合う機種が無いとき、条件を外す前に「近い条件」（3〜6mm 等）に置き換えて探し、その旨を出す", () => {
  assert.equal(config.relax.preferBeforeDrop, true);
  for (const q2 of ["thick", "mixed"]) {
    // 「近い条件」の置き換えは、厚物・混在を公開している機種が無いときの動き。固定セット base で確かめる
    const r = runDiagnosis(config, base, {
      q1_material: "steel", q2_thickness: q2, q3_skill: "beginner", q4_environment: "indoor", q5_budget: "b200_400",
    });
    assert.equal(r.relaxedAxis, null, q2);
    assert.equal(r.preferredAxis, "thickness", q2);
    assert.ok(r.preferredNote, "近い条件で探したことを画面に出す一文");
    assert.ok(has36(r.results[0].product), `${q2}: 1位 ${r.results[0].product.name}`);
    assert.match(r.results[0].reason, q2 === "thick" ? /3〜6mm まで対応/ : /薄板と3〜6mm に対応/);
    // 薄板専用機には「板厚は条件外」と出す
    for (const x of r.results) {
      if (!has36(x.product) && (x.product.tags.thickness || []).length) assert.match(x.reason, /（[^）]*板厚[^）]*は条件外）/);
    }
  }
});

test("全回答: 近い条件に置き換えたときは、1位は置き換えた条件を公開情報で満たす機種", () => {
  let n = 0;
  for (const { ans, r } of RESULTS) {
    if (!r.preferredAxis) continue;
    n++;
    const opt = config.questions.find((q) => q.axis === r.preferredAxis).options.find((o) => o.id === ans.q2_thickness);
    assert.ok(optionMatches({ axis: r.preferredAxis, match: opt.relaxPrefer }, r.results[0].product) && (r.results[0].product.tags.thickness || []).length,
      `${JSON.stringify(ans)} → 1位 ${r.results[0].product.name}`);
  }
  assert.ok(n > 0);
});

test("全回答: 「近い候補を先に表示しています」と出すなら、1位は近い候補で、適合度の枠では近い候補が先に並ぶ", () => {
  for (const { ans, r } of RESULTS) {
    if (!r.relaxedNote) continue;
    assert.ok(r.results[0].near > 0, `${JSON.stringify(ans)} → 1位 ${r.results[0].product.name}`);
    const fit = r.results.filter((x) => x.slotType === "fit").map((x) => x.near > 0);
    assert.ok(fit.indexOf(false) === -1 || fit.lastIndexOf(true) < fit.indexOf(false), JSON.stringify(ans));
  }
});

test("全回答: 厚物・混在で、1位が板厚非公開の機種になる回答は0件（3〜6mm 対応を公開している機種を先に出す）", () => {
  const bad = RESULTS.filter(({ ans, r }) => ["thick", "mixed"].includes(ans.q2_thickness) && !(r.results[0].product.tags.thickness || []).length);
  assert.equal(bad.length, 0, bad.slice(0, 3).map(({ ans, r }) => `${JSON.stringify(ans)} → ${r.results[0].product.name}`).join("\n"));
});

test("全回答: 厚物・混在で1位が薄板専用機になるのは、板厚の条件を外したときだけ（素材がチタン等で 3〜6mm 対応機が無い）", () => {
  for (const { ans, r } of RESULTS) {
    if (!["thick", "mixed"].includes(ans.q2_thickness)) continue;
    const t = r.results[0].product.tags.thickness || [];
    if (t.length && !t.includes("3〜6mm")) {
      assert.equal(r.relaxedAxis, "thickness", JSON.stringify(ans));
      assert.equal(r.relaxedNote, null, "近い候補を先に出していないのに、その一文を出さない");
    }
  }
});

test("TOP5 に同じメーカーは slots.maxPerMaker 台まで（全回答の組み合わせ）", () => {
  const max = config.slots.maxPerMaker;
  assert.ok(Number.isInteger(max) && max >= 1);
  for (const { ans, r } of RESULTS) {
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

test("全回答: メーカー上限のために条件外の機種を出したときは spareUsed / cappedOut で分かる（案内なしで条件外を出さない）", () => {
  let n = 0;
  for (const { ans, r } of RESULTS) {
    const hiddenMatched = r.matchedCount - r.results.filter((x) => x.matched).length;
    if (r.results.some((x) => !x.matched) && hiddenMatched > 0) {
      n++;
      assert.equal(r.spareUsed, true, JSON.stringify(ans));
      assert.equal(r.cappedOut, hiddenMatched, JSON.stringify(ans));
    } else assert.equal(r.spareUsed, false, JSON.stringify(ans));
  }
  assert.ok(n > 0);
});

test("全回答: 5位「価格重視」は予算を答えたとき予算内の機種だけ（予算オーバーなら枠を作らず適合度で埋める）", () => {
  assert.equal(config.slots.priceSlot?.withinBudget, true);
  for (const { ans, r } of RESULTS) {
    const p = r.results.find((x) => x.slotType === "price");
    if (!p) continue;
    assert.ok(!(p.misses || []).includes(config.axes.price.label), `${JSON.stringify(ans)} → ${p.product.name}`);
    assert.ok((p.product.tags.price || []).length > 0);
  }
});

test("選定理由: 「熟練工が使う」でも未経験可の機種に「熟練者の技能を活かせる」と書かない", () => {
  const r = runDiagnosis(config, published, { q1_material: "steel", q2_thickness: "thin", q3_skill: "expert", q4_environment: "indoor", q5_budget: "b400_600" });
  for (const x of r.results) {
    assert.doesNotMatch(x.reason, /技能を活かせる/);
    if ((x.product.tags.skill || []).includes("未経験可")) assert.match(x.reason, /未経験でも扱える/);
  }
});

test("複数素材・混在板厚 は min_count で判定（混在は板厚3区分以上）。3区分を公開している機種が無いので、薄板＋3〜6mm で探す", () => {
  const mixed = config.questions.find((q) => q.id === "q2_thickness").options.find((o) => o.id === "mixed");
  const p203 = published.find((p) => p.id === "p203"); // 板厚2区分（0.5〜3mm・3〜6mm）のアマダ
  assert.equal(optionMatches({ ...mixed, axis: "thickness" }, p203), false);
  const r = runDiagnosis(config, base, { q1_material: "multi", q2_thickness: "mixed" });
  assert.equal(r.preferredAxis, "thickness");
  assert.ok(r.results[0].matched);
  assert.match(r.results[0].reason, /幅広い素材に対応、薄板と3〜6mm に対応/);
  // 板厚を公開していない機種は、残す場合も「非公開」と明示する
  for (const x of r.results) if (!(x.product.tags.thickness || []).length) assert.match(x.reason, /板厚は非公開/);
  assert.equal(runDiagnosis(config, published, { q1_material: "multi" }).results.length, 5);
});

test("代替候補は同価格帯・自分以外・最大2件", () => {
  const p = published.find((x) => x.id === "p219");
  const alts = alternatives(published, p);
  assert.ok(alts.length >= 1 && alts.length <= 2);
  assert.ok(alts.every((a) => a.id !== p.id && a.tags.price[0] === "100〜200万円"));
});

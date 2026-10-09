// 診断スコアリング（純粋ロジック・DOM非依存）
// 設問・重み・枠配分は src/data/diagnosis.json で管理し、ここには条件を直書きしない。
// ブラウザと Node（テスト）の両方から import できるよう ESM で書く。

/** 商品スラッグ = {maker_slug}-{model_slug} */
export function productSlug(p) {
  return `${p.maker_slug}-${p.model_slug}`;
}

/** 1商品のタグ総数（6軸合計） */
export function tagCount(p) {
  return Object.values(p.tags || {}).reduce((n, arr) => n + arr.length, 0);
}

/** 選択肢が商品に適合するか（mode: any / min_count） */
export function optionMatches(option, product) {
  if (!option || option.unknown || !option.match) return true;
  const axisTags = product.tags?.[option.axis] || [];
  const { mode, tags, min } = option.match;
  const hit = tags.filter((t) => axisTags.includes(t)).length;
  if (mode === "min_count") return hit >= (min ?? 2);
  return hit > 0; // any
}

/** 回答 {q1_material: "steel", ...} を [{axis, option}] に展開（unknown は除外） */
export function resolveAnswers(config, answers) {
  const out = [];
  for (const q of config.questions) {
    const optId = answers[q.id];
    const opt = q.options.find((o) => o.id === optId);
    if (!opt || opt.unknown) continue;
    out.push({ axis: q.axis, questionId: q.id, option: { ...opt, axis: q.axis } });
  }
  return out;
}

/** 商品がその軸のタグを持っているか（空 = メーカー非公開） */
export function axisKnown(product, axis) {
  return (product.tags?.[axis] || []).length > 0;
}

/**
 * 1商品を採点。
 *  matched: 回答した軸に「不一致」が1つもない
 *  exact:   さらに、どの軸も非公開ではない（すべて公開情報で一致を確認できた）
 * 非公開の軸の扱いは diagnosis.json の unknownTags.policy に従う。
 */
export function scoreProduct(config, resolved, product) {
  const neutral = (config.unknownTags?.policy || "mismatch") === "neutral";
  let score = 0;
  let matched = true;
  const reasons = [];
  const reasonItems = []; // [{ axis, text }]（枠ごとに理由を出し分けるため軸も持つ）
  const misses = []; // 適合しなかった軸のラベル
  const missAxes = []; // 適合しなかった軸（キー）
  const unknowns = []; // メーカー非公開で判定できなかった軸のラベル
  let unknownLast = 0; // rankAboveUnknown の選択肢で、その軸が非公開のまま通った数（公開情報で合う機種より後ろに並べる）
  let near = 0; // 不一致だが、選択肢の relaxPrefer（いちばん近い条件）には合う軸の数
  for (const { axis, option } of resolved) {
    if (neutral && !axisKnown(product, axis)) {
      unknowns.push(config.axes[axis].unknownLabel || config.axes[axis].label);
      if (option.rankAboveUnknown ?? option.relaxPrefer?.rankAboveUnknown) unknownLast += 1;
      continue;
    }
    const ok = optionMatches(option, product);
    if (ok) {
      score += config.axes[axis].weight;
      const text = optionReason(option, product);
      if (text) { reasons.push(text); reasonItems.push({ axis, text }); }
    } else {
      matched = false;
      // 例: 「厚物（6mm以上）」に合う機種が無くても、3〜6mm 対応機は近い候補として薄板専用機より先に出す
      const pref = option.relaxPrefer;
      if (pref && optionMatches({ axis, match: pref }, product)) {
        near += 1;
        if (pref.reason) { reasons.push(pref.reason); reasonItems.push({ axis, text: pref.reason }); }
      } else {
        misses.push(config.axes[axis].label);
        missAxes.push(axis);
      }
    }
  }
  // 情報が少なすぎる機種（ほぼ全項目が非公開）を「条件に合う」と数えない
  const known = resolved.length - unknowns.length;
  const minKnown = Math.ceil(resolved.length * (config.unknownTags?.minKnownRatio ?? 0));
  if (known < minKnown) matched = false;
  // 同点時の補助: 回答した軸のタグ重なり数（多い方が汎用性が高い）
  const overlap = resolved.reduce((n, { axis, option }) => {
    const axisTags = product.tags?.[axis] || [];
    return n + (option.match?.tags || []).filter((t) => axisTags.includes(t)).length;
  }, 0);
  return { product, score, matched, exact: matched && unknowns.length === 0, near, unknownLast, reasons, reasonItems, misses, missAxes, unknowns, overlap };
}

/**
 * 選定理由の文言。選択肢に reasonByTag があれば、商品が実際に持つタグの文言を使う
 * （例: 「熟練工が使う」と答えても、未経験可の機種には「未経験でも扱える」と出す）
 */
export function optionReason(option, product) {
  const byTag = option.reasonByTag;
  if (byTag) {
    const own = product.tags?.[option.axis] || [];
    const hit = (option.match?.tags || []).find((t) => own.includes(t) && byTag[t]);
    if (hit) return byTag[hit];
  }
  return option.reason || "";
}

// 並び順: 条件に合う機種（rankAboveUnknown の軸を公開情報で確認できたものが先）→ 合わない条件が「近い候補」に収まる機種
//  → 公開情報で全項目を確認できた機種 → 適合度 → タグの重なり
function sortByScore(a, b) {
  return (b.matched - a.matched) || ((a.unknownLast || 0) - (b.unknownLast || 0)) || ((b.near || 0) - (a.near || 0)) || (b.exact - a.exact) || b.score - a.score || b.overlap - a.overlap || a.product.id.localeCompare(b.product.id);
}

/**
 * 選択肢を relaxPrefer（いちばん近い条件）に置き換えたもの。
 * 例: 「厚物（6mm以上）」→「3〜6mm に対応」。理由文は relaxPrefer.reason を使う
 */
export function preferOption(option) {
  const p = option.relaxPrefer;
  return {
    ...option,
    match: { mode: p.mode, tags: p.tags, ...(p.min ? { min: p.min } : {}) },
    reason: p.reason, reasonByTag: undefined, relaxPrefer: undefined,
    rankAboveUnknown: p.rankAboveUnknown, preferredFrom: option.id,
  };
}

/**
 * 専門用途タグを持つか
 *  strict=true : 回答に関係する専門タグを持つもののみ（例: 屋外と答えた→屋外対応機）
 *  strict=false: 専門タグを1つでも持てば該当（回答が専門用途に触れていない場合の埋め草）
 */
export function isSpecialty(config, product, resolved = [], strict = true) {
  return specialtyTags(config, product, resolved, strict).length > 0;
}

/** 商品が持つ専門用途タグ（strict のときは回答に関係するものだけ） */
export function specialtyTags(config, product, resolved = [], strict = true) {
  const spec = config.slots.specialty;
  const out = [];
  for (const [axis, tags] of Object.entries(spec)) {
    const own = (product.tags?.[axis] || []).filter((t) => tags.includes(t));
    if (own.length === 0) continue;
    const ans = resolved.find((r) => r.axis === axis);
    if (!strict || !ans) { out.push(...own); continue; }
    out.push(...own.filter((t) => (ans.option.match?.tags || []).includes(t)));
  }
  return out;
}

/** 専門用途タグを軸ごとにまとめる（理由文で「アルミ・銅、ライン組込」と軸の切れ目を読点にするため） */
export function specialtyGroups(config, product) {
  return Object.entries(config.slots.specialty)
    .map(([axis, tags]) => (product.tags?.[axis] || []).filter((t) => tags.includes(t)))
    .filter((g) => g.length);
}

export function priceRank(config, product) {
  const order = config.slots.priceOrder;
  const bands = product.tags?.price || [];
  const ranks = bands.map((b) => order.indexOf(b)).filter((i) => i >= 0);
  return ranks.length ? Math.min(...ranks) : order.length;
}

/**
 * TOP5 の枠配分
 *  1〜3枠: 適合度順 / 4枠: 専門用途 / 5枠: 価格重視
 *  候補が足りない枠は適合度順で補う
 *  同じメーカーは slots.maxPerMaker 台まで（中立性のため。上限に達したメーカーの機種は飛ばす）
 *  reserve: candidates だけでは5台そろわないときに使う予備（条件に合わない機種）
 */
export function allocateSlots(config, scored, resolved, reserve = []) {
  const maxPer = config.slots.maxPerMaker ?? Infinity;
  const pool = [...scored].sort(sortByScore);
  const spare = [...reserve].filter((s) => !pool.includes(s)).sort(sortByScore);
  const picked = [];
  const perMaker = {};
  const makerOf = (s) => s.product.maker_slug || s.product.maker_name;
  const ok = (s) => (perMaker[makerOf(s)] || 0) < maxPer;
  // 専門タグのうち、回答の選択肢で触れていないもの（理由文に「〜にも対応」と添える）
  const said = new Set(resolved.flatMap((r) => r.option.match?.tags || []));
  const specialtyExtra = (product) => specialtyGroups(config, product).map((g) => g.filter((t) => !said.has(t))).filter((g) => g.length);
  const take = (item, slotType, prefix) => {
    if (!item) return;
    const extra = slotType === "specialty" ? { specialty: specialtyTags(config, item.product, resolved, false), specialtyExtra: specialtyExtra(item.product) } : {};
    picked.push({ ...item, ...extra, slot: picked.length + 1, slotType, slotLabel: prefix });
    perMaker[makerOf(item)] = (perMaker[makerOf(item)] || 0) + 1;
    const from = pool.includes(item) ? pool : spare;
    from.splice(from.indexOf(item), 1);
  };
  // 1〜3枠
  for (let i = 0; i < 3; i++) take(pool.find(ok), "fit", "適合度");
  // 4枠: 専門用途
  // 回答に関係する専門機を優先し、無ければ専門タグを持つ機種を適合度順で
  const specialty =
    pool.find((s) => ok(s) && isSpecialty(config, s.product, resolved, true)) ||
    pool.find((s) => ok(s) && isSpecialty(config, s.product, resolved, false));
  if (specialty) take(specialty, "specialty", "専門用途");
  // 5枠: 価格重視（価格帯が公開されている機種のうち最も安いもの。同率は適合度順）
  // 価格帯が分かる候補が無いときは「価格重視」を名乗れないので適合度順で補う
  // slots.priceSlot.withinBudget: 予算を答えたときは、予算に収まる機種だけを候補にする（予算オーバーの機種を「価格重視」と出さない）
  const withinBudget = (s) => !config.slots.priceSlot?.withinBudget || !(s.missAxes || []).includes("price");
  const priced = pool.filter((s) => ok(s) && withinBudget(s) && priceRank(config, s.product) < config.slots.priceOrder.length);
  if (priced.length) {
    const cheapest = [...priced].sort(
      (a, b) => priceRank(config, a.product) - priceRank(config, b.product) || sortByScore(a, b)
    )[0];
    take(cheapest, "price", "価格重視");
  }
  // 不足分を適合度順で補う（メーカー上限を守れる機種 → 予備 → 上限を超えてでも5台に）
  while (picked.length < 5 && (pool.length || spare.length)) {
    take(pool.find(ok) || spare.find(ok) || pool[0] || spare[0], "fit", "適合度");
  }
  return picked;
}

/**
 * 診断の実行
 * @returns {{ results, relaxedAxis, relaxedLabel, relaxedNote, preferredAxis, preferredNote, spareUsed, cappedOut, resolved, matchedCount, exactCount }}
 *  matchedCount: 不一致のない機種数（非公開の項目を含む）/ exactCount: すべて公開情報で一致を確認できた機種数
 *  preferredAxis / preferredNote: 回答の条件を、いちばん近い条件（relaxPrefer）に置き換えて探したときの軸と案内文
 *  spareUsed: メーカー上限（slots.maxPerMaker）のため、条件に合う機種の代わりに条件外の機種を表示した / cappedOut: その「条件に合うが表示しなかった機種」の数
 */
export function runDiagnosis(config, products, answers) {
  const published = products.filter((p) => p.is_published !== false);
  const scoreAll = (res) => published.map((p) => scoreProduct(config, res, p));
  let resolved = resolveAnswers(config, answers);
  let scored = scoreAll(resolved);
  let matched = scored.filter((s) => s.matched);
  let relaxedAxis = null;
  let relaxedOption = null;
  let preferred = null;

  // 段階1（relax.preferBeforeDrop）: relaxPrefer を持つ選択肢（厚物・混在）で、その条件を公開情報で満たす機種が無いとき
  //  （0件、または非公開のまま通る機種だけのとき）は、軸ごと外す前に「いちばん近い条件」に置き換えて探す。
  //  置き換えても公開情報で合う機種が無ければ、元の回答のまま段階2へ
  if (config.relax?.preferBeforeDrop) {
    for (const r of resolved) {
      if (!r.option.relaxPrefer) continue;
      if (matched.some((s) => axisKnown(s.product, r.axis))) continue;
      const res2 = resolved.map((x) => (x === r ? { ...x, option: preferOption(x.option) } : x));
      const s2 = scoreAll(res2);
      const m2 = s2.filter((s) => s.matched);
      if (!m2.some((s) => axisKnown(s.product, r.axis))) continue;
      resolved = res2;
      scored = s2;
      matched = m2;
      preferred = r;
      break;
    }
  }

  // 段階2: 完全一致ゼロ → 条件を1つだけ「わからない」扱いにして再検索
  //  relax.pick = "most_matched": 回答した軸を1つずつ外して一致件数を比べ、最も多く残る軸を外す（同数なら relax.order の順）
  //    件数は「公開情報で合う機種」を先に比べる。rankAboveUnknown の軸（厚物・混在の板厚）を非公開のまま通っただけの機種は、
  //    公開情報で合う機種が同数のときにだけ数える（例: チタン×厚物で「素材」を外し、板厚が非公開の機種だけが残る、を避ける）
  //  relax.pick = "first"       : relax.order の順で、1件でも一致が出た最初の軸を外す
  //  合う機種があっても、すべて rankAboveUnknown の軸（厚物・混在の板厚）を非公開のまま通っただけなら、
  //  条件を1つ外して公開情報で合う機種が出るときに限り、そちらを採る（例: チタン×厚物で、板厚非公開のチタン対応機が1位になるのを避ける）
  const onlyUnknown = matched.length > 0 && matched.every((s) => s.unknownLast);
  if ((matched.length === 0 || onlyUnknown) && resolved.length > 0) {
    const trials = [];
    for (const axis of config.relax.order) {
      if (!resolved.some((r) => r.axis === axis)) continue;
      const relaxed = resolved.filter((r) => r.axis !== axis);
      const s2 = scoreAll(relaxed);
      const m2 = s2.filter((s) => s.matched);
      trials.push({ axis, relaxed, s2, m2, known: m2.filter((s) => !s.unknownLast).length });
      if (config.relax.pick !== "most_matched" && m2.length > 0) break;
    }
    const better = (t, b) => t.known > b.known || (t.known === b.known && t.m2.length > b.m2.length);
    const best = trials.filter((t) => (onlyUnknown ? t.known > 0 : t.m2.length > 0)).reduce((b, t) => (!b || better(t, b) ? t : b), null);
    if (best) {
      relaxedAxis = best.axis;
      relaxedOption = resolved.find((r) => r.axis === best.axis).option;
      resolved = best.relaxed;
      // 一致の判定と並び順は外した後の条件で行い、理由文の「条件外」「非公開」「近い候補」は元の回答で出す
      const full = new Map(scored.map((s) => [s.product.id, s]));
      scored = best.s2.map((s) => {
        const f = full.get(s.product.id);
        return { ...s, near: f.near, reasons: f.reasons, reasonItems: f.reasonItems, misses: f.misses, missAxes: f.missAxes, unknowns: f.unknowns };
      });
      matched = scored.filter((s) => s.matched);
    }
  }

  // 候補は「適合したもの」を優先し、5件に満たない場合だけ非適合を適合度順で補う
  // 適合が5件以上でも、メーカー上限で5台そろわないときは非適合を予備として使う
  const unmatched = scored.filter((s) => !s.matched);
  const enough = matched.length >= 5;
  const results = allocateSlots(config, enough ? matched : [...matched, ...unmatched], resolved, enough ? unmatched : []).map((r) => ({
    ...r,
    reason: buildReason(r),
  }));
  // メーカー上限のために表示しなかった「条件に合う機種」（その代わりに条件外の機種を出したときだけ数える）
  const shown = new Set(results.map((r) => r.product.id));
  const cappedOut = results.some((r) => !r.matched) ? matched.filter((s) => !shown.has(s.product.id)).length : 0;

  // 外した条件に「近い候補」を先に出したときの一文。1位が近い候補で、適合度の枠で近い候補がそうでない機種より前に並ぶときだけ出す
  const fit = results.filter((r) => r.slotType === "fit");
  const firstOther = fit.findIndex((r) => !r.near);
  const nearFirst = results[0]?.near > 0 && (firstOther === -1 || fit.slice(firstOther).every((r) => !r.near));

  return {
    results,
    relaxedAxis,
    relaxedLabel: relaxedAxis ? config.axes[relaxedAxis].label : null,
    relaxedNote: relaxedOption?.relaxPrefer?.note && nearFirst ? relaxedOption.relaxPrefer.note : null,
    preferredAxis: preferred ? preferred.axis : null,
    preferredNote: preferred ? preferred.option.relaxPrefer.preferNote : null,
    spareUsed: cappedOut > 0,
    cappedOut,
    resolved,
    matchedCount: matched.length,
    exactCount: matched.filter((s) => s.exact).length,
  };
}

/**
 * 選定理由を1行に
 *  適合度: 「鉄・ステンレスに対応、薄板向き、未経験から始めやすい」
 *  専門用途: 回答に無い専門タグを「。アルミ・銅、ライン組込にも対応」と添える
 *  価格重視: 先頭に価格帯を出し、予算の理由（〜万円以内）は重ねない
 */
export function buildReason(r) {
  const items = r.reasonItems || (r.reasons || []).map((text) => ({ axis: null, text }));
  const parts = items.filter((x) => !(r.slotType === "price" && x.axis === "price")).map((x) => x.text).slice(0, 3);
  const use = (r.product.suitable_for || [])[0];
  let text = parts.length ? parts.join("、") : use ? `向いている用途：${use}` : "条件に近い候補";
  if (r.slotType === "specialty" && r.specialtyExtra?.length) {
    // 回答で触れていない専門タグだけを添える（例: 鉄と答えた → 「アルミ・銅、ライン組込にも対応」）
    text += `。${r.specialtyExtra.map((g) => g.join("・")).join("、")}にも対応`;
  }
  if (r.slotType === "price") {
    const band = (r.product.tags?.price || [])[0];
    if (band) text = `価格帯は${band}。${text}`;
  }
  if (r.misses?.length) text += `（${r.misses.join("・")}は条件外）`;
  else if (r.unknowns?.length) {
    // 運営元の取り扱い機は価格の相談先があるので「価格帯はお問い合わせ」と分けて書く
    const op = r.product.handled_by_operator && r.unknowns.includes("価格帯");
    const rest = op ? r.unknowns.filter((u) => u !== "価格帯") : r.unknowns;
    const parts = [];
    if (rest.length) parts.push(r.matched ? `${rest.join("・")}は非公開` : `${rest.join("・")}は非公開のため要確認`);
    if (op) parts.push("価格帯はお問い合わせ");
    text += `（${parts.join("。")}）`;
  }
  return text;
}

/** 同価格帯の代替候補（最大 n 件、自分を除く） */
export function alternatives(products, product, n = 2) {
  const band = (product.tags?.price || [])[0];
  return products.filter((p) => p.id !== product.id && (p.tags?.price || []).includes(band)).slice(0, n);
}

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

/** 1商品を採点。全回答軸に適合すれば matched=true */
export function scoreProduct(config, resolved, product) {
  let score = 0;
  let matched = true;
  const reasons = [];
  const misses = []; // 適合しなかった軸のラベル
  for (const { axis, option } of resolved) {
    const ok = optionMatches(option, product);
    if (ok) {
      score += config.axes[axis].weight;
      if (option.reason) reasons.push(option.reason);
    } else {
      matched = false;
      misses.push(config.axes[axis].label);
    }
  }
  // 同点時の補助: 回答した軸のタグ重なり数（多い方が汎用性が高い）
  const overlap = resolved.reduce((n, { axis, option }) => {
    const axisTags = product.tags?.[axis] || [];
    return n + (option.match?.tags || []).filter((t) => axisTags.includes(t)).length;
  }, 0);
  return { product, score, matched, reasons, misses, overlap };
}

function sortByScore(a, b) {
  return b.score - a.score || b.overlap - a.overlap || a.product.id.localeCompare(b.product.id);
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
 */
export function allocateSlots(config, scored, resolved) {
  const pool = [...scored].sort(sortByScore);
  const picked = [];
  const take = (item, slotType, prefix) => {
    if (!item) return;
    const extra = slotType === "specialty" ? { specialty: specialtyTags(config, item.product, resolved, false) } : {};
    picked.push({ ...item, ...extra, slot: picked.length + 1, slotType, slotLabel: prefix });
    pool.splice(pool.indexOf(item), 1);
  };
  // 1〜3枠
  for (let i = 0; i < 3 && pool.length; i++) take(pool[0], "fit", "適合度");
  // 4枠: 専門用途
  // 回答に関係する専門機を優先し、無ければ専門タグを持つ機種を適合度順で
  const specialty =
    pool.find((s) => isSpecialty(config, s.product, resolved, true)) ||
    pool.find((s) => isSpecialty(config, s.product, resolved, false));
  if (specialty) take(specialty, "specialty", "専門用途");
  // 5枠: 価格重視（最も安い価格帯。同率は適合度順）
  if (pool.length) {
    const cheapest = [...pool].sort(
      (a, b) => priceRank(config, a.product) - priceRank(config, b.product) || sortByScore(a, b)
    )[0];
    take(cheapest, "price", "価格重視");
  }
  // 不足分を適合度順で補う
  while (picked.length < 5 && pool.length) take(pool[0], "fit", "適合度");
  return picked;
}

/**
 * 診断の実行
 * @returns {{ results, relaxedAxis, relaxedLabel, resolved, matchedCount }}
 */
export function runDiagnosis(config, products, answers) {
  const published = products.filter((p) => p.is_published !== false);
  let resolved = resolveAnswers(config, answers);
  let scored = published.map((p) => scoreProduct(config, resolved, p));
  let matched = scored.filter((s) => s.matched);
  let relaxedAxis = null;

  // 完全一致ゼロ → relax.order の順に条件を1つ緩めて再検索
  if (matched.length === 0 && resolved.length > 0) {
    for (const axis of config.relax.order) {
      if (!resolved.some((r) => r.axis === axis)) continue;
      const relaxed = resolved.filter((r) => r.axis !== axis);
      const s2 = published.map((p) => scoreProduct(config, relaxed, p));
      const m2 = s2.filter((s) => s.matched);
      if (m2.length > 0) {
        relaxedAxis = axis;
        resolved = relaxed;
        scored = s2;
        matched = m2;
        break;
      }
    }
  }

  // 候補は「適合したもの」を優先し、5件に満たない場合のみ非適合を適合度順で補う
  const candidates = matched.length >= 5 ? matched : [...matched, ...scored.filter((s) => !s.matched).sort(sortByScore)];
  const results = allocateSlots(config, candidates, resolved).map((r) => ({
    ...r,
    reason: buildReason(r),
  }));

  return {
    results,
    relaxedAxis,
    relaxedLabel: relaxedAxis ? config.axes[relaxedAxis].label : null,
    resolved,
    matchedCount: matched.length,
  };
}

/** 選定理由を1行に */
export function buildReason(r) {
  const parts = r.reasons.slice(0, 3);
  let text = parts.length ? parts.join("・") : "条件に近い候補";
  if (r.slotType === "specialty") text = `専門用途（${(r.specialty || []).join("・")}対応）：${text}`;
  if (r.slotType === "price") text = `価格重視：${(r.product.tags?.price || [])[0] || ""}・${text}`;
  if (!r.matched && r.misses?.length) text += `（${r.misses.join("・")}は条件外）`;
  return text;
}

/** 同価格帯の代替候補（最大 n 件、自分を除く） */
export function alternatives(products, product, n = 2) {
  const band = (product.tags?.price || [])[0];
  return products.filter((p) => p.id !== product.id && (p.tags?.price || []).includes(band)).slice(0, n);
}

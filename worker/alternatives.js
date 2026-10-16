// 商品詳細ページの「代替候補」を選ぶ（worker/index.js から使う。D1 に触れない純粋な関数なので node --test でも読める）
//
// 選び方
//   1. 同じメーカーの機種は出さない。1ページに同じメーカーは1機種まで
//      国内メーカー（本社が日本）のページには国内メーカー、海外メーカーのページには海外メーカーの機種だけを出す（2026-10-16 北坂社長）
//   2. 価格帯が公開されていれば、同じ価格帯の機種を先に出す
//   3. それ以外は「用途・対応素材のタグの重なり」と「出力の近さ」を1つの点数にまとめ、点数の高い順に出す
//      （用途タグが空の機種も、対応素材や出力が近ければ候補に入る）
//      ・出力が outputSpan 以上違う機種は候補にしない（例: 300 W の機種に 3,000 W の機種を出さない）
//      ・このページの出力が分かっていて、候補の出力が非公開なら、用途・対応素材が strongTag 以上重なるときだけ候補にする
//      （価格帯が同じ機種は、この2つの条件にかかわらず候補にする）
//   4. 特定のメーカーが多くのページに出続けないよう、公開中の全ページ分をまとめて割り当てる。
//      あるメーカーが freeShows ページを超えて出るたびに、そのメーカーの点数を repeatPenalty ずつ下げ、
//      「全ページの枠数 ÷ メーカー数 ＋ 1」ページ（公開21機種・9メーカーなら6ページ）を上限にする
//   同点の並びは ID 順にせず、ページと候補のスラッグから作る決まった値で回す（いつも同じ機種が勝たないように）

export const ALT_RULES = {
  perPage: 2,        // 1ページに出す候補の数
  outputSpan: 1500,  // 出力の差がこの W 以上なら「出力の近さ」は 0（差 0 W で 1）
  priceBonus: 2,     // 同じ価格帯の加点。タグ（最大1）と出力（最大1）の合計より大きくして必ず先に出す
  kindBonus: 0.25,   // 同じ種類（ハンドヘルド・据置・ロボット）の加点。これだけでは候補にしない
  strongTag: 0.5,    // 出力が比べられない候補に求める、用途・対応素材の重なり（0〜1）
  freeShows: 3,      // 1メーカーがこのページ数までは、点数を下げずに代替候補に出られる
  repeatPenalty: 0.3, // freeShows を超えて1ページ出るごとに、そのメーカーの点数から引く値（偏り防止）
};

/** 機種の種類（src/assets/js/partials.js の productKind と同じ規則）。方式の先頭が「ハンド」ならハンドヘルド */
export function productKind(p) {
  const m = p.method || "";
  if (/^ハンド/.test(m)) return "handheld";
  if (/ロボット|ライン/.test(m)) return "robot";
  if (/据置|真空|チャンバー/.test(m)) return "fixed";
  return "handheld";
}

/** 本社が日本なら "domestic"、海外なら "overseas"、本社が分からなければ null（origin は D1 の JSON 文字列でもオブジェクトでもよい） */
export function regionOf(p) {
  let o = p.origin || {};
  if (typeof o === "string") { try { o = JSON.parse(o || "{}"); } catch { o = {}; } }
  const hq = String(o.hq || "");
  if (!hq) return null;
  return /^日本/.test(hq) ? "domestic" : "overseas";
}

const tagKeys = (t = {}) => [...(t.use || []).map((x) => `use:${x}`), ...(t.material || []).map((x) => `material:${x}`)];

/** 0〜1 の重なり（共通のタグ数 ÷ 和集合のタグ数）。どちらかが空なら 0。aSet は a の Set（機種ごとに1回だけ作る） */
function overlap(a, aSet, b) {
  if (!a.length || !b.length) return 0;
  let shared = 0;
  for (const x of b) if (aSet.has(x)) shared++;
  return shared / (a.length + b.length - shared);
}

/** 文字列から決まった 32bit の値を作る（FNV-1a）。同点の並びを散らすためだけに使う */
function spread(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function closeness(p, o, kp, ko, rules) {
  const price = !!p.price_band && p.price_band === o.price_band;
  const tag = overlap(kp.keys, kp.keySet, ko.keys);
  const both = p.output_w && o.output_w;
  const out = both ? Math.max(0, 1 - Math.abs(p.output_w - o.output_w) / rules.outputSpan) : 0;
  if (!price) {
    if (both && !out) return null;                              // 出力が大きく違う
    if (p.output_w && !o.output_w && tag < rules.strongTag) return null; // 出力を比べられず、用途・素材の重なりも弱い
    if (!tag && !out) return null;
  }
  const kind = kp.kind === ko.kind ? rules.kindBonus : 0;
  return { price, score: (price ? rules.priceBonus : 0) + tag + out + kind };
}

/** 点数の高い順（同点は order の小さい順）に取り出す二分ヒープ */
class MaxHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  static before(x, y) { return x.val > y.val || (x.val === y.val && x.pair.order < y.pair.order); }
  push(e) {
    const a = this.a; a.push(e);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (!MaxHeap.before(a[i], a[j])) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && MaxHeap.before(a[l], a[m])) m = l;
        if (r < a.length && MaxHeap.before(a[r], a[m])) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

/**
 * 公開中の全機種について代替候補を割り当てる。
 * 全ページの「ページ×候補」の組から、点数がいちばん高い組を1つずつ確定していく。
 * そのとき、すでに freeShows ページ以上に出ているメーカーは、超えたページ数に応じて点数を下げ、
 * 「全ページの枠数 ÷ メーカー数 ＋ 1」ページに達したメーカーはそれ以上出さない（埋まらないページだけ最後に補う）。
 * 商品ページを開くたびに Worker で計算するので、CPU 時間を抑える（Cloudflare の上限を超えると 1102 エラーになる）:
 *   機種ごとの値（種類・タグ・国内/海外）は先に1回だけ求め、組の選び方はヒープで「点数が下がったものだけ入れ直す」形にする。
 *   点数はメーカーが出るたびに下がる一方なので、取り出した組の点数が今も同じなら、それが全体の最高点（毎回全部を見直す方法と同じ結果）
 * @param products 公開中の機種（id, slug, maker_slug, method, output_w, price_band, origin）
 * @param tagsOf   Map(id → { use:[], material:[], ... })
 * @returns Map(id → [{ o, basis: "price" | "near" }])（点数の高い順。最大 perPage 件）
 */
export function allocateAlternatives(products, tagsOf, rules = ALT_RULES) {
  const info = new Map(products.map((x) => {
    const keys = tagKeys(tagsOf.get(x.id) || {});
    return [x.id, { kind: productKind(x), keys, keySet: new Set(keys), region: regionOf(x) }];
  }));
  const pairs = [];
  for (const p of products) {
    const kp = info.get(p.id);
    for (const o of products) {
      if (o.maker_slug === p.maker_slug) continue;
      const ko = info.get(o.id);
      if (ko.region !== kp.region) continue; // 国内は国内、海外は海外の中から選ぶ
      const c = closeness(p, o, kp, ko, rules);
      if (c) pairs.push({ p, o, ...c, order: spread(`${p.slug}>${o.slug}`) });
    }
  }
  const picked = new Map(products.map((x) => [x.id, []]));
  const shown = new Map(); // メーカー → 代替候補に出ているページ数
  // 1メーカーが出るページ数の上限（全ページの枠数をメーカー数で割った数＋1）。上限で埋まらないページは最後に上限なしで補う
  const makers = new Set(products.map((x) => x.maker_slug)).size;
  const cap = Math.ceil((products.length * rules.perPage) / Math.max(1, makers)) + 1;
  const valueOf = (x) => x.score - rules.repeatPenalty * Math.max(0, (shown.get(x.o.maker_slug) || 0) - rules.freeShows + 1);
  for (const useCap of [true, false]) {
    const heap = new MaxHeap();
    for (const pair of pairs) if (picked.get(pair.p.id).length < rules.perPage) heap.push({ pair, val: valueOf(pair) }); // 埋まったページの組は入れない
    while (heap.size) {
      const e = heap.pop();
      const x = e.pair;
      const list = picked.get(x.p.id);
      if (list.length >= rules.perPage || list.some((y) => y.o.maker_slug === x.o.maker_slug)) continue;
      if (useCap && (shown.get(x.o.maker_slug) || 0) >= cap) continue;
      const val = valueOf(x);
      if (val < e.val) { e.val = val; heap.push(e); continue; } // 点数が下がっていたら入れ直す
      list.push(x);
      shown.set(x.o.maker_slug, (shown.get(x.o.maker_slug) || 0) + 1);
    }
  }

  const result = new Map();
  for (const [id, list] of picked) {
    list.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    result.set(id, list.map((x) => ({ o: x.o, basis: x.price ? "price" : "near" })));
  }
  return result;
}

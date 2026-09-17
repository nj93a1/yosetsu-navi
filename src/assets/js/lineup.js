// 機種一覧: カテゴリタブ・キーワード検索・素材/価格帯の絞り込み
import { icon } from "./partials.js";
import { productSlug } from "./scoring.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 可搬性からカテゴリを決める（商品データを変えずに絞り込めるようにする）
export const CATEGORIES = [
  { id: "all", label: "すべて", test: () => true },
  { id: "handheld", label: "ハンドヘルド", test: (p) => ["ハンドヘルド", "台車型"].includes(p.portability) },
  { id: "fixed", label: "据置・専用機", test: (p) => p.portability === "据置" },
  { id: "line", label: "ライン組込", test: (p) => p.portability === "ライン組込" },
];
const MATERIALS = ["鉄", "ステンレス", "アルミ", "銅", "チタン", "マグネシウム"];
const PRICES = ["100万円未満", "100〜200万円", "200〜400万円", "400〜600万円", "600万円以上"];

export function card(p) {
  return `<li class="pcard"><a href="/products/${esc(productSlug(p))}/">
    <img class="pcard__img" src="${esc(p.image || "/assets/images/products/placeholder.svg")}" alt="" width="320" height="240" loading="lazy">
    <p class="pcard__name">${esc(p.name)}</p>
    <p class="pcard__maker">${esc(p.maker_name)}</p>
    <p class="pcard__price">価格帯：<b>${esc(p.tags.price[0])}</b></p>
    ${p.handled_by_operator ? `<span class="badge">運営元で取り扱い</span>` : ""}
  </a></li>`;
}

/**
 * @param root  一覧を描画する要素
 * @param opts  { full: 検索と絞り込みチップも出す, limit: 表示上限 }
 */
export async function mountLineup(root, opts = {}) {
  const products = (await fetch("/data/products.json").then((r) => r.json())).filter((p) => p.is_published !== false);
  const state = { cat: "all", q: "", materials: new Set(), prices: new Set() };
  const params = new URLSearchParams(location.search);
  if (params.get("material")) state.materials.add(params.get("material"));
  if (params.get("cat") && CATEGORIES.some((c) => c.id === params.get("cat"))) state.cat = params.get("cat");
  if (params.get("q")) state.q = params.get("q");
  state.use = params.get("use") || "";

  root.innerHTML = `
    ${opts.full ? `
    <form class="search" role="search" id="searchForm">
      <label class="sr" for="q">機種名・メーカー名で探す</label>
      <input id="q" type="search" placeholder="機種名・メーカー名で探す" autocomplete="off">
      <button class="btn btn--primary" type="submit">${icon("search")}検索</button>
    </form>
    <div class="filter"><p class="filter__title">素材で絞り込む</p><ul class="chips" data-axis="materials">${MATERIALS.map((m) => `<li><button type="button" aria-pressed="false" data-v="${m}">${icon("check")}${m}</button></li>`).join("")}</ul></div>
    <div class="filter"><p class="filter__title">価格帯で絞り込む</p><ul class="chips" data-axis="prices">${PRICES.map((m) => `<li><button type="button" aria-pressed="false" data-v="${m}">${icon("check")}${m}</button></li>`).join("")}</ul></div>` : ""}
    <ul class="tabs" role="tablist">${CATEGORIES.map((c) => `<li role="presentation"><button role="tab" type="button" data-cat="${c.id}" aria-selected="${c.id === state.cat}">${c.label}</button></li>`).join("")}</ul>
    <div class="tabpanel" role="tabpanel">
      <p class="result-count" id="count"></p>
      <ul class="grid" id="grid"></ul>
      ${opts.full ? `<button class="btn btn--ghost" type="button" id="clearBtn" style="margin-top:20px">条件をすべて外す</button>` : ""}
    </div>`;

  const grid = root.querySelector("#grid");
  const count = root.querySelector("#count");
  const draw = () => {
    const cat = CATEGORIES.find((c) => c.id === state.cat);
    const q = state.q.trim().toLowerCase();
    let list = products.filter((p) => cat.test(p));
    if (q) list = list.filter((p) => `${p.name} ${p.maker_name} ${p.method}`.toLowerCase().includes(q));
    if (state.materials.size) list = list.filter((p) => [...state.materials].every((m) => p.tags.material.includes(m)));
    if (state.prices.size) list = list.filter((p) => state.prices.has(p.tags.price[0]));
    if (state.use) list = list.filter((p) => p.tags.use.includes(state.use));
    if (opts.limit) list = list.slice(0, opts.limit);
    count.textContent = list.length ? `${list.length} 機種` : "";
    grid.innerHTML = list.map(card).join("") || `<li class="empty">条件に合う機種がありません。条件を減らしてみてください。</li>`;
  };
  root.querySelectorAll("[role=tab]").forEach((b) => b.addEventListener("click", () => {
    state.cat = b.dataset.cat;
    root.querySelectorAll("[role=tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    draw();
  }));
  root.querySelectorAll(".chips button").forEach((b) => {
    const set = state[b.closest(".chips").dataset.axis];
    if (set.has(b.dataset.v)) b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => {
      set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
      b.setAttribute("aria-pressed", String(set.has(b.dataset.v)));
      draw();
    });
  });
  const form = root.querySelector("#searchForm");
  if (form) {
    const input = form.querySelector("#q");
    input.value = state.q;
    form.addEventListener("submit", (e) => { e.preventDefault(); state.q = input.value; draw(); });
    input.addEventListener("input", () => { state.q = input.value; draw(); });
    root.querySelector("#clearBtn").addEventListener("click", () => {
      state.q = ""; input.value = ""; state.materials.clear(); state.prices.clear(); state.cat = "all"; state.use = "";
      root.querySelectorAll(".chips button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      root.querySelectorAll("[role=tab]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.cat === "all")));
      draw();
    });
  }
  draw();
}

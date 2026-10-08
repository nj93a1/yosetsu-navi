// 機種一覧: 種類タブ・キーワード検索・用途/素材/板厚/価格帯の絞り込み（URL と同期）
import { icon, productPhoto } from "./partials.js";
import { productSlug } from "./scoring.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 可搬性からカテゴリを決める（商品データを変えずに絞り込めるようにする）
export const CATEGORIES = [
  { id: "all", label: "すべて", test: () => true },
  { id: "handheld", label: "ハンドヘルド", test: (p) => /ハンド/.test(p.method) || ["ハンドヘルド", "台車型"].includes(p.portability) },
  { id: "fixed", label: "据置・専用機", test: (p) => /据置|真空|チャンバー/.test(p.method) || p.portability === "据置" },
  { id: "line", label: "ライン組込", test: (p) => /ロボット|ライン|自動化/.test(p.method) || p.tags.environment.includes("ライン組込") || p.portability === "ライン組込" },
];

// 絞り込みの軸（URL のパラメータ名＝key）。values は商品データ仕様のタグ語彙で、チップとして並べる順。
// 公開機種に1件も無い値のチップは出さない（keepEmpty の価格帯だけは0件でも並べ、押せない見た目にする）。
// values が空の軸はチップを出さず、URL で渡されたときだけ「絞り込み中」に出す。同じ軸の中は「どれかに一致」
// 用途の「厚物」はチップにしない。該当機種は板厚「3〜6mm」と同じで、診断の「厚物（6mm以上）」と呼び方が食い違うため、板厚の軸で探してもらう
export const AXES = [
  { key: "use", label: "用途", tag: "use", values: ["薄板接合", "異材接合", "補修", "自動化"], names: { 自動化: "ロボット・自動化" } },
  { key: "material", label: "素材", tag: "material", values: ["鉄", "ステンレス", "アルミ", "銅", "チタン", "マグネシウム"] },
  { key: "thickness", label: "板厚", tag: "thickness", values: ["0.5mm未満", "0.5〜3mm", "3〜6mm", "6mm以上"] },
  { key: "price", label: "価格帯", tag: "price", values: ["100万円未満", "100〜200万円", "200〜400万円", "400〜600万円", "600万円以上"], keepEmpty: true },
  { key: "skill", label: "使う人", tag: "skill", values: [], names: { 未経験可: "未経験から使える" } },
  { key: "env", label: "使う場所", tag: "environment", values: [] },
];
const valueName = (axis, v) => (axis.names && axis.names[v]) || v;
const tagsOf = (p, axis) => (axis.key === "price" ? [p.tags.price[0] || "非公開"] : p.tags[axis.tag] || []);

/** 検索用の正規化: 全角半角（NFKC）・大文字小文字・空白・ハイフンの違いを無視する */
export const normalize = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[\s\-‐‑‒–—―−_]/g, "");

export async function loadProducts() {
  return (await fetch("/data/products.json").then((r) => r.json())).filter((p) => p.is_published !== false);
}

/** URL のパラメータから絞り込み条件を作る（値はカンマ区切りでも、同じ名前の繰り返しでもよい） */
export function parseState(params) {
  const list = (k) => params.getAll(k).flatMap((v) => v.split(/[,，、]/)).map((v) => v.trim()).filter(Boolean);
  const cat = params.get("cat");
  const st = { cat: CATEGORIES.some((c) => c.id === cat) ? cat : "all", q: (params.get("q") || "").trim() };
  for (const a of AXES) st[a.key] = new Set(list(a.key));
  return st;
}

export function toParams(st) {
  const params = new URLSearchParams();
  if (st.cat !== "all") params.set("cat", st.cat);
  if (st.q.trim()) params.set("q", st.q.trim());
  for (const a of AXES) if (st[a.key].size) params.set(a.key, [...st[a.key]].join(","));
  return params;
}

export function filterProducts(products, st) {
  const cat = CATEGORIES.find((c) => c.id === st.cat) || CATEGORIES[0];
  const q = normalize(st.q);
  return products.filter((p) => cat.test(p)
    && (!q || [p.name, p.maker_name, p.method, p.maker_slug, p.model_slug].map(normalize).join("|").includes(q))
    && AXES.every((a) => !st[a.key].size || tagsOf(p, a).some((t) => st[a.key].has(t))));
}

/** 機種名。型番がハイフンの位置（「FH-／PULSE」など）で切れないよう、空白で区切った語ごとに包む（.nseg は inline-block） */
export const nameHtml = (name) => String(name ?? "").trim().split(/\s+/).map((w) => `<span class="nseg">${esc(w)}</span>`).join(" ");

/** カードのスペック行（出力・対応素材・価格帯）。price:"known" のときは価格帯が公開されている機種だけ出す */
export function specLines(p, cls, { price = "always" } = {}) {
  // 「2,000／W」や素材名の途中（「アル／ミ」など）で改行しないよう、値を nowrap で包む
  const lines = [
    ["出力", p.output_w ? `<span class="nw">${esc(`${p.output_w.toLocaleString()} W`)}</span>` : "非公開"],
    ["対応素材", p.tags.material.length ? p.tags.material.map((m) => `<span class="nw">${esc(m)}</span>`).join("・") : "非公開"],
  ];
  if (p.tags.price[0] || price === "always") lines.push(["価格帯", p.tags.price[0] ? `<span class="nseg">${esc(p.tags.price[0])}</span>` : "非公開"]);
  return lines.map(([k, v]) => `<p class="${cls}"><span>${k}</span> <b>${v}</b></p>`).join("");
}

export function card(p) {
  return `<li class="pcard"><a href="/products/${esc(productSlug(p))}/">
    ${productPhoto(p, "card")}
    <p class="pcard__name">${nameHtml(p.name)}</p>
    <p class="pcard__maker">${esc(p.maker_name)}</p>
    ${specLines(p, "pcard__spec")}
    ${p.handled_by_operator ? `<span class="badge">運営元で取り扱い</span>` : ""}
  </a></li>`;
}

/** @param root 一覧を描画する要素 */
export async function mountLineup(root) {
  const products = await loadProducts();
  const st = parseState(new URLSearchParams(location.search));
  // チップに出す値: 公開機種にある値だけ（価格帯は全部）
  const groups = AXES.map((a) => ({ ...a, values: a.keepEmpty ? a.values : a.values.filter((v) => products.some((p) => tagsOf(p, a).includes(v))) }))
    .filter((a) => a.values.length);
  // 種類タブ: 条件なしで0件の種類は出さない（URL の ?cat= で選ばれたときだけ、選んだ状態で出して外せるようにする）
  const hasAny = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.id === "all" || products.some(c.test)]));

  root.innerHTML = `
    <ul class="tabs" role="tablist" aria-label="機種の種類">${CATEGORIES.map((c) => `<li role="presentation" data-tab="${c.id}"><button role="tab" type="button" data-cat="${c.id}" aria-selected="${c.id === st.cat}" aria-controls="lineupPanel">${c.label}<span class="tabs__n"></span></button></li>`).join("")}</ul>
    <form class="search" role="search" id="searchForm">
      <label class="sr" for="q">機種名・メーカー名で探す</label>
      <input id="q" type="search" placeholder="機種名・メーカー名で探す" autocomplete="off" enterkeyhint="search">
      <button class="btn btn--primary" type="submit">${icon("search")}検索</button>
    </form>
    <details class="filterbox" id="filterbox">
      <summary><span>用途・素材・板厚・価格帯で絞り込む<span class="filterbox__n" id="filterN"></span></span>${icon("chevron", "ico ico--chev")}</summary>
      <p class="filterbox__note">同じ項目で複数選ぶと、どれかに当てはまる機種を出します。数字は該当する機種の数です。</p>
      ${groups.map((a) => `<div class="filter"><p class="filter__title">${a.label}</p><ul class="chips">${a.values.map((v) => `<li><button type="button" aria-pressed="false" data-axis="${a.key}" data-v="${esc(v)}">${icon("check")}<span>${esc(valueName(a, v))}</span><span class="chips__n"></span></button></li>`).join("")}</ul></div>`).join("")}
    </details>
    <div class="active" id="active" hidden></div>
    <div class="tabpanel" role="tabpanel" id="lineupPanel">
      <p class="result-count" id="count" tabindex="-1" aria-live="polite"></p>
      <ul class="grid" id="grid"></ul>
    </div>`;

  const grid = root.querySelector("#grid");
  const count = root.querySelector("#count");
  const active = root.querySelector("#active");
  const input = root.querySelector("#q");
  // 絞り込み欄は閉じた状態で出す（開くと PC でも最初の画面が埋まるため。かかっている条件は「絞り込み中」に出る）
  input.value = st.q;

  const draw = () => {
    const list = filterProducts(products, st);

    let shown = 0;
    root.querySelectorAll("[role=tab]").forEach((b) => {
      const n = filterProducts(products, { ...st, cat: b.dataset.cat }).length;
      const on = b.dataset.cat === st.cat;
      const li = b.closest("li");
      li.hidden = !on && !hasAny[b.dataset.cat];
      if (!li.hidden) shown++;
      b.setAttribute("aria-selected", String(on));
      b.querySelector(".tabs__n").textContent = String(n);
      b.disabled = !on && n === 0;
    });
    const tabs = root.querySelector(".tabs");
    tabs.style.setProperty("--tabs-n", String(shown));
    tabs.classList.toggle("tabs--odd", shown % 2 === 1);

    // チップの件数は「ほかの条件はそのままで、この値だけを選んだとき」の数。0件のチップは押せない
    root.querySelectorAll(".filterbox [data-axis]").forEach((b) => {
      const key = b.dataset.axis;
      const on = st[key].has(b.dataset.v);
      const n = filterProducts(products, { ...st, [key]: new Set([b.dataset.v]) }).length;
      b.setAttribute("aria-pressed", String(on));
      b.querySelector(".chips__n").textContent = String(n);
      b.disabled = !on && n === 0;
    });

    // 絞り込み中の条件（URL で渡されたものも含めて全部）を、外せるチップで出す
    const items = [];
    if (st.cat !== "all") items.push({ key: "cat", v: st.cat, text: `種類：${CATEGORIES.find((c) => c.id === st.cat).label}` });
    if (st.q) items.push({ key: "q", v: "", text: `検索：${st.q}` });
    for (const a of AXES) for (const v of st[a.key]) items.push({ key: a.key, v, text: `${a.label}：${valueName(a, v)}` });
    const picked = groups.reduce((n, a) => n + a.values.filter((v) => st[a.key].has(v)).length, 0);
    root.querySelector("#filterN").textContent = picked ? `（${picked}件 選択中）` : "";
    active.hidden = !items.length;
    active.innerHTML = items.length ? `<p class="active__title">絞り込み中</p>
      <ul class="chips active__chips">${items.map((it) => `<li><button type="button" data-remove="${it.key}" data-v="${esc(it.v)}" aria-label="${esc(it.text)} の条件を外す"><span>${esc(it.text)}</span>${icon("close")}</button></li>`).join("")}
      <li><button class="active__clear" type="button" data-clear>すべて外す</button></li></ul>` : "";

    count.textContent = items.length ? `${list.length} 機種（全 ${products.length} 機種中）` : `${products.length} 機種`;
    grid.innerHTML = list.map(card).join("") || `<li class="empty"><p>条件に合う機種がありません。</p><button class="btn btn--ghost" type="button" data-clear>条件をすべて外す</button></li>`;

    const qs = toParams(st).toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  };

  const clearAll = () => {
    st.cat = "all"; st.q = ""; input.value = "";
    for (const a of AXES) st[a.key].clear();
  };

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b) || b.disabled) return;
    if (b.dataset.cat) { st.cat = b.dataset.cat; draw(); return; }
    if (b.dataset.axis) {
      const set = st[b.dataset.axis];
      set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
      draw();
      return;
    }
    if (b.dataset.remove) {
      const key = b.dataset.remove;
      if (key === "cat") st.cat = "all";
      else if (key === "q") { st.q = ""; input.value = ""; }
      else st[key].delete(b.dataset.v);
      draw();
      // 外したチップが消えるので、残りのチップか件数に移す
      (active.querySelector("[data-remove]") || count).focus();
      return;
    }
    if (b.hasAttribute("data-clear")) { clearAll(); draw(); count.focus(); }
  });

  const form = root.querySelector("#searchForm");
  form.addEventListener("submit", (e) => { e.preventDefault(); st.q = input.value.trim(); draw(); input.blur(); });
  input.addEventListener("input", () => { st.q = input.value.trim(); draw(); });
  draw();
}

// 選定診断の画面制御。スコアリングは scoring.js、設問・商品は /data/*.json。
import { runDiagnosis, productSlug, tagCount } from "./scoring.js";

const app = document.getElementById("app");
const foot = document.getElementById("foot");
const backBtn = document.getElementById("backBtn");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const state = {
  config: null,
  products: [],
  step: 0,            // 0..N-1 = 設問, N = 結果, N+1 = 比較
  answers: {},
  result: null,
  logId: null,
  compare: [],        // 比較対象 product id（最大2）
  viewed: new Set(),
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (html) => { app.innerHTML = html; window.scrollTo({ top: 0 }); };

// ---- 起動 -------------------------------------------------------
async function init() {
  const [config, products] = await Promise.all([
    fetch("/data/diagnosis.json").then((r) => r.json()),
    fetch("/data/products.json").then((r) => r.json()),
  ]);
  state.config = config;
  state.products = products;
  // 専門用途メニューからの入口: ?q1_material=alcu などを事前回答として受け取る
  const params = new URLSearchParams(location.search);
  for (const q of config.questions) {
    const v = params.get(q.id);
    if (v && q.options.some((o) => o.id === v)) state.answers[q.id] = v;
  }
  backBtn.addEventListener("click", goBack);
  render();
}

// ---- 画面遷移 ---------------------------------------------------
function render() {
  const n = state.config.questions.length;
  if (state.step < n) renderQuestion(state.step);
  else if (state.step === n) renderResult();
  else renderCompare();
}

function goBack() {
  if (state.step === 0) { location.href = "/"; return; }
  if (state.step > state.config.questions.length) { state.step = state.config.questions.length; render(); return; }
  state.step -= 1;
  render();
}

function answer(qid, optId) {
  state.answers[qid] = optId;
  if (state.rechangeOnly) {
    // 「条件を1つ変える」からの回答は、その1問だけ変えて結果へ直行
    state.rechangeOnly = null;
    state.step = state.config.questions.length;
    runAndLog();
    render();
    return;
  }
  state.step += 1;
  if (state.step === state.config.questions.length) runAndLog();
  render();
}

// ---- 設問（1画面1問） ------------------------------------------
function renderQuestion(i) {
  const q = state.config.questions[i];
  const n = state.config.questions.length;
  progressText.textContent = `質問 ${i + 1} / ${n}`;
  progressFill.style.width = `${(i / n) * 100}%`;
  backBtn.textContent = i === 0 ? "← トップに戻る" : "← 戻る";
  foot.hidden = false;
  const current = state.answers[q.id];
  h(`
    <p class="question__no">Q${i + 1}</p>
    <h1>${esc(q.title)}</h1>
    <ul class="choices">
      ${q.options.map((o) => `
        <li><button type="button" class="choice ${o.image ? "" : "choice--noimage"} ${o.unknown ? "choice--unknown" : ""}"
             data-opt="${esc(o.id)}" aria-pressed="${current === o.id}">
          ${o.image ? `<img class="choice__thumb" src="/assets/images/choices/${esc(o.image)}.svg" alt="" width="88" height="64" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}
          <span><span class="choice__label">${esc(o.label)}</span>${o.sub ? `<span class="choice__sub">${esc(o.sub)}</span>` : ""}</span>
        </button></li>`).join("")}
    </ul>`);
  app.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => answer(q.id, b.dataset.opt)));
}

// ---- 診断実行とログ --------------------------------------------
function runAndLog() {
  state.result = runDiagnosis(state.config, state.products, state.answers);
  state.compare = [];
  state.logId = crypto.randomUUID();
  postJson("/api/logs", {
    id: state.logId,
    answers: state.answers,
    relaxed_axis: state.result.relaxedAxis,
    shown_products: state.result.results.map((r) => r.product.id),
    exit_point: "result",
  });
}
function patchLog(data) { if (state.logId) postJson(`/api/logs/${state.logId}`, data, "PATCH"); }
function postJson(url, body, method = "POST") {
  // GitHub Pages 等 API の無い環境では失敗を無視する（診断自体はクライアントで完結）
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

// ---- 結果（TOP5固定） -------------------------------------------
function renderResult() {
  const n = state.config.questions.length;
  const r = state.result;
  progressText.textContent = "診断結果";
  progressFill.style.width = "100%";
  backBtn.textContent = "← 質問に戻る";
  foot.hidden = false;
  const inquiryQs = new URLSearchParams({ log: state.logId || "", ...state.answers }).toString();

  h(`
    <h1>おすすめの5台</h1>
    ${r.relaxedLabel ? `<div class="notice"><p>条件にぴったり合う機種がなかったため、<strong>「${esc(r.relaxedLabel)}」の条件を外して</strong>候補を広げました。</p></div>` : ""}
    ${!r.relaxedLabel && r.matchedCount < 5 ? `<div class="notice"><p>すべての条件に合う機種は ${r.matchedCount} 台でした。残りは条件に近い順に表示しています。</p></div>` : ""}
    <ul class="results">
      ${r.results.map((x) => card(x)).join("")}
    </ul>
    <section class="rechange">
      <h2>条件を1つ変えて再検索</h2>
      <button type="button" class="btn" data-rechange="q5_budget">予算だけ変える</button>
      <button type="button" class="btn" data-rechange="q2_thickness">板厚だけ変える</button>
    </section>
    <section class="rechange">
      <h2>この結果について相談する</h2>
      <p>診断の回答内容を添えてお問い合わせできます。</p>
      <a class="btn btn--primary" href="/contact/?${esc(inquiryQs)}" data-inquiry>フォームで問い合わせる</a>
      <a class="btn" href="tel:0000000000" data-inquiry>電話で相談する</a>
      <a class="btn" href="https://line.me/" target="_blank" rel="noopener" data-inquiry>LINEで相談する</a>
    </section>`);

  // 比較チェック（最大2台）
  const cmpBar = document.createElement("div");
  cmpBar.className = "sticky-cta";
  cmpBar.innerHTML = `<button type="button" class="btn btn--primary" id="compareBtn" disabled>2台を選んで比較する</button>`;
  foot.replaceChildren(backBtn, cmpBar.firstElementChild);
  updateCompareBtn();

  app.querySelectorAll("[data-cmp]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.cmp;
    if (cb.checked) { if (state.compare.length >= 2) { cb.checked = false; return; } state.compare.push(id); }
    else state.compare = state.compare.filter((x) => x !== id);
    cb.closest(".compare__check").classList.toggle("compare__check--on", cb.checked);
    updateCompareBtn();
  }));
  app.querySelectorAll("[data-detail]").forEach((a) => a.addEventListener("click", () => {
    state.viewed.add(a.dataset.detail);
    patchLog({ viewed_products: [...state.viewed], exit_point: "detail" });
  }));
  app.querySelectorAll("[data-inquiry]").forEach((a) => a.addEventListener("click", () => patchLog({ inquired: true, exit_point: "inquiry" })));
  app.querySelectorAll("[data-rechange]").forEach((b) => b.addEventListener("click", () => {
    const qid = b.dataset.rechange;
    state.step = state.config.questions.findIndex((q) => q.id === qid);
    state.rechangeOnly = qid;
    render();
  }));
}

function updateCompareBtn() {
  const btn = document.getElementById("compareBtn");
  if (!btn) return;
  btn.disabled = state.compare.length !== 2;
  btn.textContent = state.compare.length === 2 ? "選んだ2台を比較する" : `2台を選んで比較する（${state.compare.length}/2）`;
  btn.onclick = () => { patchLog({ compared_products: state.compare, exit_point: "compare" }); state.step = state.config.questions.length + 1; render(); };
}

function card(x) {
  const p = x.product;
  const slotClass = x.slotType === "specialty" ? "card__slot--specialty" : x.slotType === "price" ? "card__slot--price" : "";
  return `
    <li class="card">
      <div class="card__head"><span class="card__slot ${slotClass}">${x.slot}位 ${esc(x.slotLabel)}</span>
        ${p.handled_by_operator ? `<span class="label-handled">運営元で取り扱い</span>` : ""}</div>
      <p class="card__name">${esc(p.name)}</p>
      <p class="card__maker">${esc(p.maker_name)}｜${esc(p.tags.price[0])}｜${esc(p.tags.skill[0])}</p>
      <p class="card__reason">${esc(x.reason)}</p>
      <div class="card__actions">
        <a class="btn" href="/products/${esc(productSlug(p))}/" data-detail="${esc(p.id)}">詳しく見る</a>
        <label class="compare__check"><input type="checkbox" data-cmp="${esc(p.id)}"> 比較に追加</label>
      </div>
    </li>`;
}

// ---- 比較（2台横並び） ------------------------------------------
function renderCompare() {
  progressText.textContent = "2台を比較";
  backBtn.textContent = "← 結果に戻る";
  foot.replaceChildren(backBtn);
  const items = state.compare.map((id) => state.result.results.find((r) => r.product.id === id)).filter(Boolean);
  const rows = [
    ["方式", (p) => p.method], ["出力", (p) => (p.output_w ? `${p.output_w} W` : "—")], ["波長", (p) => p.wavelength || "—"],
    ["可搬性", (p) => p.portability], ["対応素材", (p) => p.tags.material.join("・")], ["対応板厚", (p) => p.tags.thickness.join("・")],
    ["使用環境", (p) => p.tags.environment.join("・")], ["価格帯", (p) => p.tags.price[0]], ["習得難易度", (p) => p.tags.skill[0]],
    ["向いている用途", (p) => p.suitable_for.join("、")], ["向いていない用途", (p) => p.not_suitable_for.join("、")],
  ];
  h(`
    <h1>2台を比較</h1>
    <div class="compare">
      ${items.map((x) => `
        <div class="compare__col">
          <h3>${esc(x.product.name)}</h3>
          <p class="card__maker">${esc(x.product.maker_name)}</p>
          ${x.product.handled_by_operator ? `<p class="label-handled">運営元で取り扱い</p>` : ""}
          <dl>${rows.map(([k, f]) => `<div class="compare__row"><dt>${esc(k)}</dt><dd>${esc(f(x.product))}</dd></div>`).join("")}</dl>
          <a class="btn" href="/products/${esc(productSlug(x.product))}/" data-detail="${esc(x.product.id)}">詳しく見る</a>
        </div>`).join("")}
    </div>`);
}

init();

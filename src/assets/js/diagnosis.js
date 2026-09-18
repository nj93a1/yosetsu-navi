// 選定診断の画面制御。スコアリングは scoring.js、設問・商品は /data/*.json。
import { runDiagnosis, productSlug } from "./scoring.js";
import { mountChrome, icon } from "./partials.js";

const app = document.getElementById("app");
const foot = document.getElementById("foot");
const backBtn = document.getElementById("backBtn");
const stepsEl = document.getElementById("steps");
const progressFill = document.getElementById("progressFill");

const state = {
  config: null, products: [],
  step: 0,             // 0..N-1 = 設問, N = 結果, N+1 = 比較
  answers: {}, result: null, logId: null,
  compare: [], viewed: new Set(), rechangeOnly: null,
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (html) => { app.innerHTML = html; window.scrollTo({ top: 0 }); };
const N = () => state.config.questions.length;

// ---- 起動 -------------------------------------------------------
async function init() {
  mountChrome({ current: "/diagnosis/", withBottombar: false });
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
  if (state.step < N()) renderQuestion(state.step);
  else if (state.step === N()) renderResult();
  else renderCompare();
}
function goBack() {
  if (state.rechangeOnly) { state.rechangeOnly = null; state.step = N(); render(); return; }
  if (state.step === 0) { location.href = "/"; return; }
  if (state.step > N()) { state.step = N(); render(); return; }
  state.step -= 1;
  render();
}
function answer(qid, optId) {
  state.answers[qid] = optId;
  if (state.rechangeOnly) {            // 「条件を1つ変える」からの回答は、その1問だけ変えて結果へ直行
    state.rechangeOnly = null;
    state.step = N();
    runAndLog();
    render();
    return;
  }
  state.step += 1;
  if (state.step === N()) runAndLog();
  render();
}
function setFoot(buttons, cols = 1) {
  foot.dataset.cols = String(cols);
  foot.replaceChildren(...buttons.map((b) => { const li = document.createElement("li"); li.appendChild(b); return li; }));
}
function drawSteps(current) {
  stepsEl.innerHTML = state.config.questions.map((q, i) => {
    const st = i < current ? "done" : i === current ? "current" : "todo";
    return `<li data-state="${st}"><b>${i < current ? icon("check") : i + 1}</b><span>${esc(state.config.axes[q.axis].label)}</span></li>`;
  }).join("");
  progressFill.style.width = `${Math.min(current, N()) / N() * 100}%`;
}

// ---- 設問（1画面1問） ------------------------------------------
function renderQuestion(i) {
  const q = state.config.questions[i];
  drawSteps(i);
  backBtn.innerHTML = `${icon("back")}${i === 0 ? "トップに戻る" : state.rechangeOnly ? "結果に戻る" : "前の質問に戻る"}`;
  setFoot([backBtn]);
  const current = state.answers[q.id];
  h(`
    <p class="question__no">質問 ${i + 1} / ${N()}</p>
    <h1>${esc(q.title)}</h1>
    <p class="question__help">あてはまるものを1つ押してください。</p>
    <ul class="pnav pnav--choices">
      ${q.options.map((o) => `
        <li><button type="button" class="${o.image ? "" : "noimg"} ${o.unknown ? "unknown" : ""}" data-opt="${esc(o.id)}" aria-pressed="${current === o.id}">
          ${o.image ? `<img class="choice__thumb" src="/assets/images/choices/${esc(o.image)}.svg" alt="" width="72" height="54" loading="lazy">` : ""}
          <span class="pnav__label">${esc(o.label)}${o.sub ? `<span class="pnav__sub">${esc(o.sub)}</span>` : ""}</span>
          ${icon("chevron", "ico ico--chev")}
        </button></li>`).join("")}
    </ul>`);
  app.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => answer(q.id, b.dataset.opt)));
}

// ---- 診断実行とログ --------------------------------------------
function runAndLog() {
  state.result = runDiagnosis(state.config, state.products, state.answers);
  state.compare = [];
  state.logId = crypto.randomUUID();
  postJson("/api/logs", {
    id: state.logId, answers: state.answers, relaxed_axis: state.result.relaxedAxis,
    shown_products: state.result.results.map((r) => r.product.id), exit_point: "result",
  });
}
function patchLog(data) { if (state.logId) postJson(`/api/logs/${state.logId}`, data, "PATCH"); }
function postJson(url, body, method = "POST") {
  // API の無い環境（GitHub Pages 等）では失敗を無視する。診断自体はクライアントで完結
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

// ---- 結果（TOP5固定） -------------------------------------------
function answerLabel(qid) {
  const q = state.config.questions.find((x) => x.id === qid);
  const o = q.options.find((x) => x.id === state.answers[qid]);
  return o ? o.label : "わからない";
}
function renderResult() {
  const r = state.result;
  drawSteps(N());
  const inquiryQs = new URLSearchParams({ log: state.logId || "", ...state.answers }).toString();
  h(`
    <h1>おすすめの5台</h1>
    <ul class="answers" aria-label="あなたの回答">
      ${state.config.questions.map((q) => `<li>${esc(state.config.axes[q.axis].label)}：<b>${esc(answerLabel(q.id))}</b></li>`).join("")}
    </ul>
    ${r.relaxedLabel ? `<div class="notice"><p>条件にぴったり合う機種がなかったため、<strong>「${esc(r.relaxedLabel)}」の条件を外して</strong>候補を広げました。</p></div>` : ""}
    ${!r.relaxedLabel && r.matchedCount < 5 ? `<div class="info"><p>すべての条件に合う機種は ${r.matchedCount} 台でした。残りは条件に近い順に表示しています。</p></div>` : ""}
    <ul class="results">${r.results.map(card).join("")}</ul>

    <section class="subsec">
      <h2>条件を1つ変えて再検索</h2>
      <ul class="pnav">
        <li><button type="button" data-rechange="q5_budget">${icon("diag")}<span class="pnav__label">予算だけ変える<span class="pnav__sub">いま：${esc(answerLabel("q5_budget"))}</span></span>${icon("chevron", "ico ico--chev")}</button></li>
        <li><button type="button" data-rechange="q2_thickness">${icon("diag")}<span class="pnav__label">板厚だけ変える<span class="pnav__sub">いま：${esc(answerLabel("q2_thickness"))}</span></span>${icon("chevron", "ico ico--chev")}</button></li>
      </ul>
    </section>
    <section class="subsec" id="contact">
      <h2>この結果について相談する</h2>
      <p>診断の回答内容を添えてお問い合わせできます。</p>
      <ul class="pnav">
        <li><a href="/contact/?${esc(inquiryQs)}" data-inquiry>${icon("contact")}<span class="pnav__label">フォームで問い合わせる</span>${icon("chevron", "ico ico--chev")}</a></li>
        <li><a href="tel:0000000000" data-inquiry>${icon("phone")}<span class="pnav__label">電話で相談する<span class="pnav__sub">平日 9:00〜17:00</span></span>${icon("chevron", "ico ico--chev")}</a></li>
        <li><a href="https://line.me/" target="_blank" rel="noopener" data-inquiry>${icon("contact")}<span class="pnav__label">LINEで相談する</span>${icon("chevron", "ico ico--chev")}</a></li>
      </ul>
    </section>`);

  backBtn.innerHTML = `${icon("back")}戻る`;
  const cmp = document.createElement("button");
  cmp.type = "button"; cmp.className = "btn btn--primary"; cmp.id = "compareBtn";
  setFoot([backBtn, cmp], 2);
  updateCompareBtn();

  app.querySelectorAll("[data-cmp]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.cmp;
    if (cb.checked) { if (state.compare.length >= 2) { cb.checked = false; return; } state.compare.push(id); }
    else state.compare = state.compare.filter((x) => x !== id);
    cb.closest(".chk").classList.toggle("chk--on", cb.checked);
    updateCompareBtn();
  }));
  app.querySelectorAll("[data-detail]").forEach((a) => a.addEventListener("click", () => {
    state.viewed.add(a.dataset.detail);
    patchLog({ viewed_products: [...state.viewed], exit_point: "detail" });
  }));
  app.querySelectorAll("[data-inquiry]").forEach((a) => a.addEventListener("click", () => patchLog({ inquired: true, exit_point: "inquiry" })));
  app.querySelectorAll("[data-rechange]").forEach((b) => b.addEventListener("click", () => {
    state.rechangeOnly = b.dataset.rechange;
    state.step = state.config.questions.findIndex((q) => q.id === b.dataset.rechange);
    render();
  }));
}
function updateCompareBtn() {
  const btn = document.getElementById("compareBtn");
  if (!btn) return;
  btn.disabled = state.compare.length !== 2;
  btn.innerHTML = `${icon("compare")}${state.compare.length === 2 ? "2台を比較" : `比較（${state.compare.length}/2）`}`;
  btn.onclick = () => { patchLog({ compared_products: state.compare, exit_point: "compare" }); state.step = N() + 1; render(); };
}
function card(x) {
  const p = x.product;
  const slotClass = x.slotType === "specialty" ? "rcard__slot--specialty" : x.slotType === "price" ? "rcard__slot--price" : "";
  return `
    <li class="rcard">
      <div class="rcard__head"><span class="rcard__slot ${slotClass}">${x.slot}位 ${esc(x.slotLabel)}</span>${p.handled_by_operator ? `<span class="badge" style="margin:0">運営元で取り扱い</span>` : ""}</div>
      <div class="rcard__body">
        <img class="rcard__img" src="${esc(p.image || "/assets/images/products/placeholder.svg")}" alt="" width="112" height="84" loading="lazy"><span class="image-note image-label">設備イメージ（AI生成）</span>
        <div><p class="rcard__name">${esc(p.name)}</p><p class="rcard__meta">${esc(p.maker_name)}<br>価格帯：${esc(p.tags.price[0])}｜${esc(p.tags.skill[0])}</p></div>
      </div>
      <p class="rcard__reason">${esc(x.reason)}</p>
      <div class="rcard__actions">
        <a class="btn" href="/products/${esc(productSlug(p))}/" data-detail="${esc(p.id)}">詳しく見る${icon("chevron")}</a>
        <label class="chk"><input type="checkbox" data-cmp="${esc(p.id)}">比較に追加</label>
      </div>
    </li>`;
}

// ---- 比較（2台横並び） ------------------------------------------
function renderCompare() {
  drawSteps(N());
  backBtn.innerHTML = `${icon("back")}結果に戻る`;
  setFoot([backBtn]);
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
          <img class="pcard__img" src="${esc(x.product.image || "/assets/images/products/placeholder.svg")}" alt="" width="160" height="120" loading="lazy"><span class="image-note image-label">設備イメージ（AI生成）</span>
          <h3>${esc(x.product.name)}</h3>
          <p class="rcard__meta">${esc(x.product.maker_name)}</p>
          ${x.product.handled_by_operator ? `<span class="badge">運営元で取り扱い</span>` : ""}
          <dl>${rows.map(([k, f]) => `<div class="compare__row"><dt>${esc(k)}</dt><dd>${esc(f(x.product))}</dd></div>`).join("")}</dl>
          <a class="btn" href="/products/${esc(productSlug(x.product))}/" data-detail="${esc(x.product.id)}">詳しく見る</a>
        </div>`).join("")}
    </div>`);
}

init();

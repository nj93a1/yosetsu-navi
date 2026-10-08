// 選定診断の画面制御。スコアリングは scoring.js、設問・商品は /data/*.json。
import { runDiagnosis, productSlug } from "./scoring.js?v=11";
import { mountChrome, icon, productPhoto } from "./partials.js?v=11";

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
  presets: [],         // URL で事前に受け取った回答（専門用途メニューからの入口）
  startStep: 0,        // このページで最初に出した画面
  histIdx: 0,          // このページで積んだ履歴の位置（0 = 最初の画面）
  resultScroll: 0,     // 比較へ進む前の結果画面のスクロール位置
  pendingNotice: null, // 「条件を1つ変える」で結果が変わらなかったときの案内（次の結果表示で1回だけ出す）
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (html, scrollTop = 0) => { app.innerHTML = html; window.scrollTo({ top: scrollTop }); };
const N = () => state.config.questions.length;
const firstUnanswered = () => state.config.questions.findIndex((q) => !(q.id in state.answers));

// ---- 起動 -------------------------------------------------------
async function init() {
  mountChrome({ current: "/diagnosis/", withBottombar: false });
  const [config, products] = await Promise.all([
    fetch("/data/diagnosis.json?v=11").then((r) => r.json()),
    fetch("/data/products.json").then((r) => r.json()),
  ]);
  state.config = config;
  state.products = products.filter((p) => p.is_published !== false);
  // 専門用途メニューからの入口: ?q1_material=alcu などを事前回答として受け取り、最初の未回答の設問から始める
  const params = new URLSearchParams(location.search);
  for (const q of config.questions) {
    const v = params.get(q.id);
    const o = v && q.options.find((x) => x.id === v);
    if (!o) continue;
    state.answers[q.id] = v;
    state.presets.push(`${config.axes[q.axis].label}：${o.label}`);
  }
  const first = firstUnanswered();
  state.step = first === -1 ? N() : first;
  if (state.step === N()) runAndLog();
  state.startStep = state.step;
  // ブラウザの戻る・進むで設問を行き来できるように、画面ごとに履歴を積む（再読み込みでは最初からやり直し）
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  history.replaceState({ diag: true, step: state.step, rechange: null, idx: 0 }, "");
  window.addEventListener("popstate", onPopState);
  backBtn.addEventListener("click", goBack);
  render();
}

// ---- 画面遷移 ---------------------------------------------------
function render(from = null) {
  if (state.step < N()) renderQuestion(state.step);
  else if (state.step === N()) renderResult(from === N() + 1 ? state.resultScroll : 0);
  else renderCompare();
}
/** 画面を進める（履歴を1つ積む） */
function go(step, rechange = null) {
  const from = state.step;
  if (from === N()) state.resultScroll = window.scrollY;
  state.step = step;
  state.rechangeOnly = rechange;
  state.histIdx += 1;
  history.pushState({ diag: true, step, rechange, idx: state.histIdx }, "");
  render(from);
}
/** 履歴を積まずに画面を差し替える（このページの最初の画面から、さらに前へ戻るとき） */
function replaceWith(step) {
  state.step = step;
  state.rechangeOnly = null;
  history.replaceState({ diag: true, step, rechange: null, idx: state.histIdx }, "");
  render();
}
function onPopState(e) {
  const st = e.state;
  if (!st || !st.diag) return; // メニューの「2台を比較」（#compare）などのページ内リンク。画面はそのまま
  const from = state.step;
  state.histIdx = st.idx || 0;
  state.rechangeOnly = st.rechange || null;
  state.step = reachable(st.step);
  render(from);
}
/** 履歴から戻ってきた画面が、いまの回答で表示できるか（できなければ表示できる手前の画面にする） */
function reachable(step) {
  const first = firstUnanswered();
  if (first !== -1 && step > first) return first;
  if (step >= N() && !state.result) runAndLog();
  if (step === N() + 1 && state.compare.length !== 2) return N();
  return Math.min(step, N() + 1);
}
// 画面下の「戻る」はブラウザの戻ると同じ動きにする（このページで積んだ履歴がある間）
function goBack() {
  if (state.histIdx > 0) { history.back(); return; }
  if (state.step === 0) { location.href = "/"; return; }
  replaceWith(state.step > N() ? N() : state.step - 1);
}
function answer(qid, optId) {
  if (state.rechangeOnly) {            // 「条件を1つ変える」からの回答は、その1問だけ変えて結果へ戻る
    const before = state.result ? ids(state.result) : null;
    const changed = state.answers[qid] !== optId;
    state.answers[qid] = optId;
    runAndLog();
    state.pendingNotice = changed && before === ids(state.result) ? unchangedNotice(qid) : null;
    if (state.histIdx > 0) { history.back(); return; } // 結果の画面の履歴へ戻る（popstate で描画）
    replaceWith(N());
    return;
  }
  state.answers[qid] = optId;
  const next = state.step + 1;
  if (next === N()) runAndLog();
  go(next);
}
const ids = (r) => r.results.map((x) => x.product.id).join(",");
/** 条件を1つ変えても5台が同じだったときの案内（事実だけを書く） */
function unchangedNotice(qid) {
  const q = state.config.questions.find((x) => x.id === qid);
  const axis = state.config.axes[q.axis];
  const known = state.products.filter((p) => (p.tags?.[q.axis] || []).length > 0).length;
  let text = `「${axis.label}」を「${answerLabel(qid)}」に変えても、おすすめの5台は変わりませんでした。`;
  if (state.config.unknownTags?.policy === "neutral" && known < state.products.length) {
    text += `${axis.unknownLabel || axis.label}を公開している機種は、掲載${state.products.length}機種のうち${known}機種です。公開していない機種は、${axis.label}では絞り込んでいません。`;
  }
  return text;
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
  const preset = state.presets.length && i === state.startStep && i > 0
    ? `<div class="info"><p>${state.presets.map((x) => `「${esc(x)}」`).join("")}は選択済みです。変えるときは「前の質問に戻る」を押してください。</p></div>` : "";
  h(`
    <p class="question__no">質問 ${i + 1} / ${N()}</p>
    <h1>${esc(q.title)}</h1>
    ${i === 0 && location.hash === "#compare" ? `<div class="info"><p>2台の比較は、診断結果のおすすめ5台から選べます。まず5つの質問に答えてください。</p></div>` : ""}
    ${preset}
    <p class="question__help">あてはまるものを1つ押してください。</p>
    <ul class="pnav pnav--choices">
      ${q.options.map((o) => `
        <li><button type="button" class="${o.icon ? "" : "noimg"} ${o.unknown ? "unknown" : ""}" data-opt="${esc(o.id)}" aria-pressed="${current === o.id}">
          ${o.icon ? `<span class="ph ph--row" aria-hidden="true">${icon(o.icon)}</span>` : ""}
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
function renderResult(scrollTop = 0) {
  const r = state.result;
  drawSteps(N());
  const notice = state.pendingNotice;
  state.pendingNotice = null;
  const inquiryQs = new URLSearchParams({ log: state.logId || "", ...state.answers }).toString();
  h(`
    <h1>おすすめの5台</h1>
    <ul class="answers" aria-label="あなたの回答">
      ${state.config.questions.map((q) => `<li>${esc(state.config.axes[q.axis].label)}：<b>${esc(answerLabel(q.id))}</b></li>`).join("")}
    </ul>
    ${notice ? `<div class="info" role="status"><p>${esc(notice)}</p></div>` : ""}
    ${r.relaxedLabel ? `<div class="notice"><p>条件にぴったり合う機種がなかったため、<strong>「${esc(r.relaxedLabel)}」の条件を外して</strong>候補を広げました。${esc(r.relaxedNote || "")}</p></div>` : ""}
    ${!r.relaxedLabel && r.matchedCount < 5 ? `<div class="info"><p>条件に合う機種は ${r.matchedCount} 台でした。残りは条件に近い順に表示しています。</p></div>` : ""}
    ${r.results.some((x) => x.unknowns?.length) ? `<p class="note">メーカーが公開していない項目（価格帯・使用環境など）は「非公開」と表示し、不一致とはしていません。導入前にメーカーへご確認ください。</p>` : ""}
    <ul class="results">${r.results.map(card).join("")}</ul>

    <section class="subsec">
      <h2>条件を1つ変えて再検索</h2>
      <ul class="pnav">
        <li><button type="button" data-rechange="q5_budget">${icon("yen")}<span class="pnav__label">予算だけ変える<span class="pnav__sub">いま：${esc(answerLabel("q5_budget"))}</span></span>${icon("chevron", "ico ico--chev")}</button></li>
        <li><button type="button" data-rechange="q2_thickness">${icon("thick")}<span class="pnav__label">板厚だけ変える<span class="pnav__sub">いま：${esc(answerLabel("q2_thickness"))}</span></span>${icon("chevron", "ico ico--chev")}</button></li>
      </ul>
    </section>
    <section class="subsec" id="contact">
      <h2>この結果について相談する</h2>
      <p>診断の回答内容を添えてお問い合わせできます。</p>
      <ul class="pnav">
        <li><a href="/contact/?${esc(inquiryQs)}">${icon("consult")}<span class="pnav__label">フォームで問い合わせる</span>${icon("chevron", "ico ico--chev")}</a></li>
        <li><a href="/contact/#tel">${icon("phone")}<span class="pnav__label">電話で相談する<span class="pnav__sub">番号は掲載準備中</span></span>${icon("chevron", "ico ico--chev")}</a></li>
        <li><a href="/contact/#line">${icon("consult")}<span class="pnav__label">LINEで相談する<span class="pnav__sub">準備中</span></span>${icon("chevron", "ico ico--chev")}</a></li>
      </ul>
    </section>`, scrollTop);

  backBtn.innerHTML = `${icon("back")}戻る`;
  const cmp = document.createElement("button");
  cmp.type = "button"; cmp.className = "btn btn--primary"; cmp.id = "compareBtn";
  cmp.addEventListener("click", () => {
    if (state.compare.length !== 2) return;
    patchLog({ compared_products: state.compare, exit_point: "compare" });
    go(N() + 1);
  });
  setFoot([backBtn, cmp], 2);
  updateCompareBtn();

  app.querySelectorAll("[data-cmp]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.cmp;
    app.querySelectorAll(".rcard__msg").forEach((m) => { m.innerHTML = ""; });
    if (cb.checked) {
      if (state.compare.length >= 2) {
        cb.checked = false;
        cb.closest(".rcard").querySelector(".rcard__msg").innerHTML = `<div class="notice"><p>比較できるのは2台までです。ほかの機種を選ぶときは、チェックを1つ外してください。</p></div>`;
        return;
      }
      if (!state.compare.includes(id)) state.compare.push(id);
    } else state.compare = state.compare.filter((x) => x !== id);
    cb.closest(".chk").classList.toggle("chk--on", cb.checked);
    updateCompareBtn();
  }));
  app.querySelectorAll("[data-detail]").forEach((a) => a.addEventListener("click", () => {
    state.viewed.add(a.dataset.detail);
    patchLog({ viewed_products: [...state.viewed], exit_point: "detail" });
  }));
  app.querySelectorAll("[data-rechange]").forEach((b) => b.addEventListener("click", () => {
    go(state.config.questions.findIndex((q) => q.id === b.dataset.rechange), b.dataset.rechange);
  }));
}
function updateCompareBtn() {
  const btn = document.getElementById("compareBtn");
  if (!btn) return;
  const n = state.compare.length;
  btn.disabled = n !== 2;
  btn.innerHTML = `${icon("compare")}${n === 2 ? "2台を比較" : `比較（${n}/2）`}`;
}
function card(x) {
  const p = x.product;
  const on = state.compare.includes(p.id);
  const slotClass = x.slotType === "specialty" ? "rcard__slot--specialty" : x.slotType === "price" ? "rcard__slot--price" : "";
  const price = (p.tags.price || [])[0];
  const skill = (p.tags.skill || [])[0];
  return `
    <li class="rcard">
      <div class="rcard__head"><span class="rcard__slot ${slotClass}">${x.slot}位 ${esc(x.slotLabel)}</span>${p.handled_by_operator ? `<span class="badge" style="margin:0">運営元で取り扱い</span>` : ""}</div>
      <div class="rcard__body">
        ${productPhoto(p, "result")}
        <div>
          <p class="rcard__name">${esc(p.name)}</p>
          <p class="rcard__maker">${esc(p.maker_name)}</p>
          <p class="rcard__meta"><span><span>価格帯：</span><wbr><span>${esc(price || "非公開")}</span></span><span>${skill ? `<span>${esc(skill)}</span>` : `<span>習得難易度：</span><wbr><span>非公開</span>`}</span></p>
        </div>
      </div>
      <p class="rcard__reason">${esc(x.reason)}</p>
      <div class="rcard__actions">
        <a class="btn" href="/products/${esc(productSlug(p))}/" data-detail="${esc(p.id)}">詳しく見る${icon("chevron")}</a>
        <label class="chk${on ? " chk--on" : ""}"><input type="checkbox" data-cmp="${esc(p.id)}"${on ? " checked" : ""}>比較に追加</label>
      </div>
      <div class="rcard__msg" aria-live="polite"></div>
    </li>`;
}

// ---- 比較（2台横並び。項目ごとに1行で、左右の値の高さをそろえる） ----
function renderCompare() {
  drawSteps(N());
  backBtn.innerHTML = `${icon("back")}結果に戻る`;
  setFoot([backBtn]);
  const items = state.compare.map((id) => state.result.results.find((r) => r.product.id === id)?.product).filter(Boolean);
  const list = (arr, empty) => (arr && arr.length
    ? `<ul class="cmp__list">${arr.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`
    : `<span class="cmp__none">${empty}</span>`);
  const text = (v) => (v === null || v === undefined || String(v).trim() === "" ? `<span class="cmp__none">非公開</span>` : esc(v));
  const tags = (arr) => text((arr || []).join("・"));
  const rows = [
    ["方式", (p) => text(p.method)],
    ["出力", (p) => text(p.output_w ? `${p.output_w} W` : "")],
    ["波長", (p) => text(p.wavelength)],
    ["可搬性", (p) => text(p.portability)],
    ["対応素材", (p) => tags(p.tags.material)],
    ["対応板厚", (p) => tags(p.tags.thickness)],
    ["使用環境", (p) => tags(p.tags.environment)],
    ["価格帯", (p) => tags(p.tags.price)],
    ["習得難易度", (p) => tags(p.tags.skill)],
    ["向いている用途", (p) => list(p.suitable_for, "記載なし")],
    ["向いていない用途", (p) => list(p.not_suitable_for, "記載なし")],
  ];
  h(`
    <h1>2台を比較</h1>
    <p class="note">メーカーが公開していない項目は「非公開」、公開情報に記載が無い用途は「記載なし」としています。</p>
    <div class="cmp">
      <div class="cmp__heads">
        ${items.map((p) => `
          <div class="cmp__head">
            ${productPhoto(p, "compare")}
            <p class="cmp__name">${esc(p.name)}</p>
            <p class="cmp__maker">${esc(p.maker_name)}</p>
            ${p.handled_by_operator ? `<span class="badge">運営元で取り扱い</span>` : ""}
          </div>`).join("")}
      </div>
      <dl class="cmp__rows">
        ${rows.map(([k, f]) => `
          <div class="cmp__row"><dt>${esc(k)}</dt>${items.map((p) => `<dd><span class="sr">${esc(p.name)}：</span>${f(p)}</dd>`).join("")}</div>`).join("")}
      </dl>
      <div class="cmp__actions">
        ${items.map((p) => `<a class="btn" href="/products/${esc(productSlug(p))}/" data-detail="${esc(p.id)}">詳しく見る${icon("chevron")}</a>`).join("")}
      </div>
    </div>`);
  app.querySelectorAll("[data-detail]").forEach((a) => a.addEventListener("click", () => {
    state.viewed.add(a.dataset.detail);
    patchLog({ viewed_products: [...state.viewed], exit_point: "detail" });
  }));
}

init();

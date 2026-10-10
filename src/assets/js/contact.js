// 相談・問い合わせ。診断結果や商品ページから来たときは、その内容を「一緒に送られる内容」として表示する。
// 送信先は未確定のため、デモでは確認画面までで止める（送信したように見せない）。
import { mountChrome } from "./partials.js?v=16";
import { productSlug } from "./scoring.js?v=16";

mountChrome({ current: "/contact/" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const [config, products] = await Promise.all([
  fetch("/data/diagnosis.json").then((r) => r.json()),
  fetch("/data/products.json").then((r) => r.json()),
]);

// 添付される内容（診断の回答・対象機種）
const attach = [];
for (const q of config.questions) {
  const v = params.get(q.id);
  if (!v) continue;
  const o = q.options.find((x) => x.id === v);
  if (o) attach.push([config.axes[q.axis].label, o.label]);
}
const slug = params.get("product");
const prod = slug && products.find((p) => p.is_published !== false && productSlug(p) === slug);
if (prod) attach.unshift(["対象の機種", `${prod.name}（${prod.maker_name}）`]);
// 他社機のページから「運営元の取り扱い機と実機で比べる」を押したとき
const cmpSlug = params.get("compare");
const cmp = cmpSlug && products.find((p) => p.is_published !== false && p.handled_by_operator && productSlug(p) === cmpSlug);
if (prod && cmp) attach.splice(1, 0, ["比べたい機種", `${cmp.name}（${cmp.maker_name}）`]);
if (attach.length) {
  document.getElementById("attachList").innerHTML = attach.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  document.getElementById("attach").hidden = false;
}

// ご相談の種類（?type= で選んだ状態にする）
const TYPES = { choose: "機種選びの相談", quote: "見積もり", test: "テスト溶接・デモ", subsidy: "補助金・助成金の活用", other: "その他" };
const t = params.get("type");
if (t && TYPES[t]) document.querySelector(`input[name="type"][value="${t}"]`).checked = true;

// 種類ごとの追加の入力欄と、相談後に届く内容の案内（見ていた機種が運営元の取り扱い機かどうかで変える）
const REPLY = {
  choose: prod && !prod.handled_by_operator
    ? "ご連絡する内容：同じ用途で比べられる機種のご紹介（運営元の取り扱い機を含みます）と、選ぶときの確認点"
    : "ご連絡する内容：用途に合う機種のご紹介と、選ぶときの確認点",
  quote: "ご連絡する内容：お見積もり、テスト溶接の日程、使える補助金・税制",
  test: cmp ? "ご連絡する内容：2台のテスト溶接の日程と、ご用意いただく材料" : "ご連絡する内容：テスト溶接・デモの日程と、ご用意いただく材料",
  subsidy: "ご連絡する内容：使える補助金・助成金・税制と、申請までの段取り",
  other: "",
};
const typeOf = () => document.querySelector('input[name="type"]:checked')?.value || "choose";
const syncType = () => {
  const v = typeOf();
  for (const el of document.querySelectorAll(".form__extra")) el.hidden = el.dataset.for !== v;
  const r = document.getElementById("formReply");
  r.textContent = REPLY[v] || "";
  r.hidden = !REPLY[v];
};
for (const el of document.querySelectorAll('input[name="type"]')) el.addEventListener("change", syncType);
syncType();

// 確認画面（送信はしない）
const form = document.getElementById("form");
const confirm = document.getElementById("confirm");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const ok = String(fd.get("name") || "").trim() && /.+@.+\..+/.test(String(fd.get("email") || ""));
  document.getElementById("formError").hidden = !!ok;
  if (!ok) return;
  const type = String(fd.get("type") || "");
  const extra = type === "quote" ? [["導入予定の台数", fd.get("qty")], ["導入の希望時期", fd.get("when")]] : type === "test" ? [["試したい材料・板厚", fd.get("work")]] : [];
  const rows = [["ご相談の種類", TYPES[type] || ""], ...extra, ["会社名", fd.get("company")], ["お名前", fd.get("name")], ["メールアドレス", fd.get("email")], ["電話番号", fd.get("tel")], ["ご相談内容", fd.get("body")], ...attach]
    .filter(([, v]) => String(v || "").trim());
  document.getElementById("confirmList").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v).replace(/\n/g, "<br>")}</dd></div>`).join("");
  form.hidden = true;
  confirm.hidden = false;
  confirm.scrollIntoView({ block: "start" });
  // 相談の種類 × 見ていた機種 × 来たページを記録（個人情報は送らない。API の無い環境では無視）
  let from = "";
  try { const r = new URL(document.referrer); if (r.origin === location.origin) from = r.pathname; } catch {}
  fetch("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, product: prod ? prod.id : null, compare: cmp ? cmp.id : null, from }) }).catch(() => {});
  // 診断ログに「問い合わせ」を記録（API の無い環境では無視）
  const log = params.get("log");
  if (log && /^[0-9a-f-]{36}$/.test(log)) fetch(`/api/logs/${log}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ inquired: true, exit_point: "inquiry" }) }).catch(() => {});
});
document.getElementById("backToForm").addEventListener("click", () => { confirm.hidden = true; form.hidden = false; });

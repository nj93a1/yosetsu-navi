// 相談・問い合わせ。診断結果や商品ページから来たときは、その内容を「一緒に送られる内容」として表示する。
// 送信先は未確定のため、デモでは確認画面までで止める（送信したように見せない）。
import { mountChrome } from "./partials.js?v=11";
import { productSlug } from "./scoring.js?v=11";

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
if (attach.length) {
  document.getElementById("attachList").innerHTML = attach.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  document.getElementById("attach").hidden = false;
}

// 確認画面（送信はしない）
const form = document.getElementById("form");
const confirm = document.getElementById("confirm");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const ok = String(fd.get("name") || "").trim() && /.+@.+\..+/.test(String(fd.get("email") || ""));
  document.getElementById("formError").hidden = !!ok;
  if (!ok) return;
  const rows = [["会社名", fd.get("company")], ["お名前", fd.get("name")], ["メールアドレス", fd.get("email")], ["電話番号", fd.get("tel")], ["ご相談内容", fd.get("body")], ...attach]
    .filter(([, v]) => String(v || "").trim());
  document.getElementById("confirmList").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v).replace(/\n/g, "<br>")}</dd></div>`).join("");
  form.hidden = true;
  confirm.hidden = false;
  confirm.scrollIntoView({ block: "start" });
  // 診断ログに「問い合わせ」を記録（API の無い環境では無視）
  const log = params.get("log");
  if (log && /^[0-9a-f-]{36}$/.test(log)) fetch(`/api/logs/${log}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ inquired: true, exit_point: "inquiry" }) }).catch(() => {});
});
document.getElementById("backToForm").addEventListener("click", () => { confirm.hidden = true; form.hidden = false; });

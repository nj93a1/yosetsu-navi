// 相談フォームの受付（POST /api/contact）。D1 の contact_messages に保存し、メール送信の設定があれば受付用アドレスへ知らせる。
// メールは Cloudflare Email Routing の send_email バインディング（env.MAIL）で送る。送れるのは Email Routing で確認済みの宛先だけなので、
// 相談者への自動返信はしない。運営側のメールに Reply-To で相談者のアドレスを入れ、そのまま返信できるようにする。
// D1 にも触れない部分（入力の確認・メール本文・MIME）は純粋な関数にして node --test で確かめる。

export const CONTACT_TYPES = { choose: "機種選びの相談", quote: "見積もり", test: "テスト溶接・デモ", subsidy: "補助金・助成金の活用", other: "その他" };
const LIMITS = { company: 100, name: 100, email: 254, tel: 30, body: 4000, qty: 20, when: 20, work: 200 };

const str = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const oneLine = (v, max) => str(v, max).replace(/\s+/g, " ");

/** 入力の確認。{ ok: true, data } か { ok: false, error }。website（見えない入力欄）が埋まっていたら機械の送信とみなす */
export function validateContact(b) {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid" };
  if (str(b.website, 200)) return { ok: false, error: "bot" };
  const data = {
    type: CONTACT_TYPES[b.type] ? b.type : "",
    company: oneLine(b.company, LIMITS.company),
    name: oneLine(b.name, LIMITS.name),
    email: oneLine(b.email, LIMITS.email),
    tel: oneLine(b.tel, LIMITS.tel),
    body: str(b.body, LIMITS.body),
    extra: { qty: oneLine(b.qty, LIMITS.qty), when: oneLine(b.when, LIMITS.when), work: oneLine(b.work, LIMITS.work) },
    product: typeof b.product === "string" && /^[a-z0-9-]{1,80}$/.test(b.product) ? b.product : null,
    compare: typeof b.compare === "string" && /^[a-z0-9-]{1,80}$/.test(b.compare) ? b.compare : null,
    answers: Object.fromEntries(Object.entries(b.answers && typeof b.answers === "object" ? b.answers : {})
      .filter(([k, v]) => /^q[1-5]_[a-z]+$/.test(k) && typeof v === "string" && /^[a-z0-9_]{1,20}$/.test(v))),
    log: typeof b.log === "string" && /^[0-9a-f-]{36}$/.test(b.log) ? b.log : null,
    from: typeof b.from === "string" && b.from.startsWith("/") ? b.from.slice(0, 120) : null,
  };
  if (!data.type) return { ok: false, error: "type" };
  if (!data.name) return { ok: false, error: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { ok: false, error: "email" };
  if (data.tel && !/^[0-9０-９+()\-－ー\s]{6,30}$/.test(data.tel)) return { ok: false, error: "tel" };
  return { ok: true, data };
}

/** 日本時間の「2026年10月16日 14:05」 */
export function jstText(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 運営側に届くメールの件名と本文。product / compare は { name, maker_name }、answers は [ラベル, 回答] の配列 */
export function contactMail(data, { id, date = new Date(), product = null, compare = null, answers = [] } = {}) {
  const who = data.company ? `${data.company} ${data.name}` : data.name;
  const subject = `【相談フォーム】${CONTACT_TYPES[data.type]}／${who} 様`;
  const rows = [
    ["ご相談の種類", CONTACT_TYPES[data.type]],
    ["会社名", data.company], ["お名前", data.name], ["メールアドレス", data.email], ["電話番号", data.tel],
    ["導入予定の台数", data.extra.qty], ["導入の希望時期", data.extra.when], ["試したい材料・板厚", data.extra.work],
    ["対象の機種", product && `${product.name}（${product.maker_name}）`],
    ["比べたい機種", compare && `${compare.name}（${compare.maker_name}）`],
    ...answers.map(([k, v]) => [`診断の回答：${k}`, v]),
    ["送信したページの前のページ", data.from],
  ].filter(([, v]) => String(v || "").trim());
  const text = [
    "サイトの相談フォームから、新しい相談が届きました。",
    `このメールに返信すると、相談者（${data.email}）に届きます。`,
    "",
    ...rows.map(([k, v]) => `■${k}：${v}`),
    "",
    "■ご相談内容",
    data.body || "（記入なし）",
    "",
    `受付番号：${id}`,
    `受付日時：${jstText(date)}`,
  ].join("\n");
  return { subject, text };
}

/** UTF-8 の文字列を base64 に（76文字ごとに改行） */
function b64(s, wrap = true) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const out = btoa(bin);
  return wrap ? out.replace(/.{76}/g, "$&\r\n") : out;
}
/** ヘッダーに日本語を入れるときの書き方（=?UTF-8?B?...?=） */
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s, false)}?=`);
const addr = (name, email) => (name ? `${encWord(name)} <${email}>` : `<${email}>`);

/** send_email に渡す MIME（text/plain・UTF-8・base64） */
export function buildMime({ from, fromName = "", to, replyTo, subject, text, id, date = new Date() }) {
  const domain = String(from).split("@")[1] || "localhost";
  return [
    `From: ${addr(fromName, from)}`,
    `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: ${encWord(subject)}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text.replace(/\n/g, "\r\n")),
    "",
  ].join("\r\n");
}

/** POST /api/contact。保存は必ず行い、メールは env.MAIL（send_email）と env.CONTACT_FROM がそろっているときだけ送る */
export async function handleContact(request, env, { diagnosis, rowToProduct, json }) {
  let body = null;
  try { body = await request.json(); } catch {}
  const v = validateContact(body);
  if (!v.ok) return v.error === "bot" ? json({ ok: true, mailed: false }) : json({ ok: false, error: v.error }, 400);
  const d = v.data;
  const id = crypto.randomUUID();
  const date = new Date();

  const find = async (slug) => (slug ? env.DB.prepare("SELECT * FROM products WHERE slug = ? AND is_published = 1").bind(slug).first() : null);
  const [pRow, cRow] = await Promise.all([find(d.product), find(d.compare)]);
  const product = pRow ? rowToProduct(pRow) : null;
  const compare = cRow ? rowToProduct(cRow) : null;
  const answers = diagnosis.questions
    .map((q) => [diagnosis.axes[q.axis].label, q.options.find((o) => o.id === d.answers[q.id])?.label])
    .filter(([, l]) => l);

  await env.DB.prepare(
    `INSERT INTO contact_messages (id, type, company, name, email, tel, body, extra, product_id, compare_id, answers, log_id, from_path, mail_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(id, d.type, d.company || null, d.name, d.email, d.tel || null, d.body || null, JSON.stringify(d.extra),
    product?.id || null, compare?.id || null, JSON.stringify(d.answers), d.log, d.from).run();
  // 匿名の集計（種類 × 機種 × 来たページ）と、診断ログの「問い合わせあり」
  await env.DB.batch([
    env.DB.prepare("INSERT INTO inquiry_logs (type, product_id, handled, compare_id, from_path) VALUES (?, ?, ?, ?, ?)")
      .bind(d.type, product?.id || null, product ? (product.handled_by_operator ? 1 : 0) : null, compare?.id || null, d.from),
    ...(d.log ? [env.DB.prepare("UPDATE diagnosis_logs SET inquired = 1, exit_point = 'inquiry', updated_at = datetime('now') WHERE id = ?").bind(d.log)] : []),
  ]);

  let status = "not_configured";
  if (env.MAIL && env.CONTACT_FROM && env.CONTACT_TO) {
    try {
      const { subject, text } = contactMail(d, { id, date, product, compare, answers });
      const raw = buildMime({ from: env.CONTACT_FROM, fromName: env.CONTACT_FROM_NAME || "相談フォーム", to: env.CONTACT_TO, replyTo: d.email, subject, text, id, date });
      const { EmailMessage } = await import("cloudflare:email");
      await env.MAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
      status = "sent";
    } catch (e) {
      console.error("contact mail failed", id, e && e.stack ? e.stack : e);
      status = "failed";
    }
  }
  await env.DB.prepare("UPDATE contact_messages SET mail_status = ? WHERE id = ?").bind(status, id).run();
  if (status === "failed") return json({ ok: false, error: "mail", id }, 502);
  return json({ ok: true, mailed: status === "sent", id });
}

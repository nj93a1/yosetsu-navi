import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContact, contactMail, buildMime, jstText } from "../worker/contact.js";

const base = { type: "test", company: "東大阪製作所", name: "山田 太郎", email: "taro@example.com", tel: "06-1234-5678", body: "SUS304 1.5mm を試したい", work: "SUS304 1.5mm" };

test("相談フォーム: 必須項目・メールの形・電話番号を確かめ、見えない入力欄が埋まっていたら機械の送信とみなす", () => {
  assert.ok(validateContact(base).ok);
  assert.equal(validateContact({ ...base, name: " " }).error, "name");
  assert.equal(validateContact({ ...base, email: "taro@" }).error, "email");
  assert.equal(validateContact({ ...base, tel: "abc" }).error, "tel");
  assert.equal(validateContact({ ...base, type: "x" }).error, "type");
  assert.equal(validateContact({ ...base, website: "http://spam" }).error, "bot");
  const d = validateContact({ ...base, answers: { q1_material: "steel", bad: "x", q2_thickness: "<b>" }, product: "uwjapan-uw-s1500f", log: "nope" }).data;
  assert.deepEqual(d.answers, { q1_material: "steel" });
  assert.equal(d.product, "uwjapan-uw-s1500f");
  assert.equal(d.log, null);
});

test("相談フォーム: 運営側に届くメールの件名・本文と、MIME（日本語は UTF-8 の base64、返信先は相談者）", () => {
  const d = validateContact(base).data;
  const date = new Date("2026-10-16T05:05:00Z");
  const { subject, text } = contactMail(d, { id: "abc", date, product: { name: "UW-S1500F", maker_name: "UW JAPAN" }, answers: [["素材", "鉄・ステンレス"]] });
  assert.equal(subject, "【相談フォーム】テスト溶接・デモ／東大阪製作所 山田 太郎 様");
  assert.match(text, /■対象の機種：UW-S1500F（UW JAPAN）/);
  assert.match(text, /■診断の回答：素材：鉄・ステンレス/);
  assert.match(text, /受付日時：2026年10月16日 14:05/);
  const raw = buildMime({ from: "form@example.jp", fromName: "相談フォーム", to: "desk@example.com", replyTo: d.email, subject, text, id: "abc", date });
  assert.match(raw, /^From: =\?UTF-8\?B\?.+\?= <form@example\.jp>\r\n/);
  assert.match(raw, /\r\nReply-To: <taro@example\.com>\r\n/);
  assert.match(raw, /\r\nContent-Transfer-Encoding: base64\r\n/);
  const bodyB64 = raw.split("\r\n\r\n")[1].replace(/\r\n/g, "");
  assert.match(Buffer.from(bodyB64, "base64").toString("utf8"), /山田 太郎/);
  assert.equal(jstText(new Date("2026-12-31T15:30:00Z")), "2027年1月1日 00:30");
});

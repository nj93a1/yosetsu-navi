// src/data/products.json を検証し、D1 投入用の seed.sql を生成する。
//   node scripts/build-seed.js          → seed.sql を書き出す
//   node scripts/build-seed.js --check  → 検証のみ
// 将来の CSV 一括更新は「CSV → products.json → 本スクリプト」の経路で D1 とクライアントJSONを同期する。
import { readFileSync, writeFileSync } from "node:fs";

const AXES = ["use", "material", "thickness", "environment", "price", "skill"];
const MIN_AVG_TAGS = 10;
const REQUIRED = ["id", "maker_slug", "model_slug", "name", "maker_name", "method", "portability", "comment", "tags"];

const products = JSON.parse(readFileSync(new URL("../src/data/products.json", import.meta.url), "utf8"));
const errors = [];
const slugs = new Set();
let totalTags = 0;

for (const p of products) {
  for (const k of REQUIRED) if (p[k] == null || p[k] === "") errors.push(`${p.id ?? "?"}: ${k} が未設定`);
  if (!/^[a-z0-9-]+$/.test(p.maker_slug || "") || !/^[a-z0-9-]+$/.test(p.model_slug || ""))
    errors.push(`${p.id}: スラッグは英小文字・数字・ハイフンのみ`);
  const slug = `${p.maker_slug}-${p.model_slug}`;
  if (slugs.has(slug)) errors.push(`${p.id}: スラッグ重複 ${slug}`);
  slugs.add(slug);
  for (const a of AXES) if (!Array.isArray(p.tags?.[a])) errors.push(`${p.id}: tags.${a} が配列でない`);
  // 非公開（is_published:false）の商品は価格帯未確定を許容する（確認後に1つ入れて公開）
  if ((p.tags?.price || []).length !== 1 && p.is_published !== false) errors.push(`${p.id}: 価格帯タグは1つだけ`);
  if ((p.tags?.skill || []).length !== 1) errors.push(`${p.id}: 習得難易度タグは1つだけ`);
  if (!p.comment || p.comment.length < 5) errors.push(`${p.id}: 選定コメントは必須（1文以上）`);
  totalTags += AXES.reduce((n, a) => n + (p.tags?.[a]?.length || 0), 0);
}
const avg = products.length ? totalTags / products.length : 0;
if (avg < MIN_AVG_TAGS) errors.push(`平均タグ数 ${avg.toFixed(1)} が下限 ${MIN_AVG_TAGS} を下回る`);

if (errors.length) {
  console.error("検証エラー:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`検証OK: ${products.length} 商品 / 平均タグ数 ${avg.toFixed(1)}`);
if (process.argv.includes("--check")) process.exit(0);

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const lines = ["-- 自動生成: scripts/build-seed.js（手で編集しない）", "DELETE FROM product_tags;", "DELETE FROM products;"];
for (const p of products) {
  const slug = `${p.maker_slug}-${p.model_slug}`;
  lines.push(
    `INSERT INTO products (id, maker_slug, model_slug, slug, name, maker_name, method, wavelength, output_w, portability, price_band, skill_level, comment, suitable_for, not_suitable_for, handled_by_operator, image, source, is_published) VALUES (` +
      [p.id, p.maker_slug, p.model_slug, slug, p.name, p.maker_name, p.method, p.wavelength, p.output_w, p.portability,
        p.tags.price[0] ?? null, p.tags.skill[0], p.comment, JSON.stringify(p.suitable_for || []), JSON.stringify(p.not_suitable_for || []),
        p.handled_by_operator ? 1 : 0, p.image, p.source, p.is_published === false ? 0 : 1]
        .map((v) => (typeof v === "number" ? v : q(v))).join(", ") + ");"
  );
  for (const a of AXES) for (const t of p.tags[a]) lines.push(`INSERT INTO product_tags (product_id, axis, tag) VALUES (${q(p.id)}, ${q(a)}, ${q(t)});`);
}
writeFileSync(new URL("../seed.sql", import.meta.url), lines.join("\n") + "\n");
console.log("seed.sql を書き出しました");

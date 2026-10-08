// 商品マスタ data/products.json を検証し、次の2つを生成する。
//   (a) seed.sql                … D1（products / product_tags）投入用。非公開機種も含む（is_published=0）
//   (b) src/data/products.json  … 診断・機種一覧などブラウザが読む配信用 JSON。
//                                  公開機種（is_published !== false）だけを、PUBLIC_FIELDS の項目に絞って書き出す。
//
// ※ src/data/products.json は生成物。手で編集しない。商品データの編集は必ず data/products.json（マスタ・配信されない）で行い、
//    `npm run build`（または seed:build / db:seed:local）で書き出し直す。notes・pending・実売価格などの内部情報は配信用に出さない。
//
//   node scripts/build-seed.js          → 検証して seed.sql と src/data/products.json を書き出す
//   node scripts/build-seed.js --check  → 検証のみ（マスタを読む。配信用 JSON が古ければ警告）
// 将来の CSV 一括更新は「CSV → data/products.json → 本スクリプト」の経路で D1 とクライアントJSONを同期する。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MASTER = new URL("../data/products.json", import.meta.url);
const PUBLIC_JSON = new URL("../src/data/products.json", import.meta.url);
const SEED = new URL("../seed.sql", import.meta.url);

const AXES = ["use", "material", "thickness", "environment", "price", "skill"];
const MIN_AVG_TAGS = 10;
const REQUIRED = ["id", "maker_slug", "model_slug", "name", "maker_name", "method", "portability", "comment", "tags"];
// 配信用 JSON に出す項目（この順で書き出す）。ここに無い項目（notes / pending / spec / is_published など）は出さない。
const PUBLIC_FIELDS = [
  "id", "maker_slug", "model_slug", "name", "maker_name", "method", "wavelength", "output_w", "output_note", "portability",
  "thickness_note", "tags", "comment", "suitable_for", "not_suitable_for", "handled_by_operator", "image",
  "official_url", "source_url", "source",
];
const OPTIONAL_TEXT = ["wavelength", "output_note", "thickness_note", "source", "official_url", "source_url", "image"];

const products = JSON.parse(readFileSync(MASTER, "utf8"));
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
  if ((p.tags?.price || []).length > 1) errors.push(`${p.id}: 価格帯タグは最大1つ（非公開なら空）`);
  if ((p.tags?.skill || []).length > 1) errors.push(`${p.id}: 習得難易度タグは最大1つ（非公開なら空）`);
  if (!p.comment || p.comment.length < 5) errors.push(`${p.id}: 選定コメントは必須（1文以上）`);
  for (const k of OPTIONAL_TEXT) if (p[k] != null && typeof p[k] !== "string") errors.push(`${p.id}: ${k} は文字列か null`);
  if (p.output_w != null && !Number.isInteger(p.output_w)) errors.push(`${p.id}: output_w は整数（W）か null`);
  if (p.output_note && p.output_w == null) errors.push(`${p.id}: output_note があるのに output_w が無い`);
  totalTags += AXES.reduce((n, a) => n + (p.tags?.[a]?.length || 0), 0);
}

// 配信用 JSON（公開機種・ホワイトリスト項目のみ）
const publicProducts = products
  .filter((p) => p.is_published !== false)
  .map((p) => Object.fromEntries(PUBLIC_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])));
// 実売価格（「税込」「〇〇円」）が公開項目に紛れ込んでいないか。価格は価格帯タグだけを出す
for (const p of publicProducts) {
  const text = JSON.stringify({ ...p, tags: undefined });
  if (/税込|税別|[0-9０-９,，]+円/.test(text)) errors.push(`${p.id}: 公開項目に実売価格らしき記載がある（価格は価格帯タグのみ）`);
}
const publicJson = JSON.stringify(publicProducts, null, 2) + "\n";

const published = publicProducts.length;
const avg = products.length ? totalTags / products.length : 0;
if (avg < MIN_AVG_TAGS) console.warn(`警告: 平均タグ数 ${avg.toFixed(1)} が目標 ${MIN_AVG_TAGS} を下回る（メーカー非公開の項目が多い。クライアント確認で補完）`);

if (errors.length) {
  console.error("検証エラー:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`検証OK: ${products.length} 商品（公開 ${published}）/ 平均タグ数 ${avg.toFixed(1)}`);
if (process.argv.includes("--check")) {
  if (!existsSync(PUBLIC_JSON) || readFileSync(PUBLIC_JSON, "utf8") !== publicJson)
    console.warn("警告: src/data/products.json がマスタと一致しない。`npm run build` で書き出し直す");
  process.exit(0);
}

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const lines = ["-- 自動生成: scripts/build-seed.js（手で編集しない。元データは data/products.json）", "DELETE FROM product_tags;", "DELETE FROM products;"];
for (const p of products) {
  const slug = `${p.maker_slug}-${p.model_slug}`;
  lines.push(
    `INSERT INTO products (id, maker_slug, model_slug, slug, name, maker_name, method, wavelength, output_w, output_note, portability, thickness_note, price_band, skill_level, comment, suitable_for, not_suitable_for, handled_by_operator, image, source, official_url, source_url, is_published) VALUES (` +
      [p.id, p.maker_slug, p.model_slug, slug, p.name, p.maker_name, p.method, p.wavelength, p.output_w, p.output_note ?? null, p.portability, p.thickness_note ?? null,
        p.tags.price[0] ?? null, p.tags.skill[0] ?? null, p.comment, JSON.stringify(p.suitable_for || []), JSON.stringify(p.not_suitable_for || []),
        p.handled_by_operator ? 1 : 0, p.image, p.source, p.official_url ?? null, p.source_url ?? null, p.is_published === false ? 0 : 1]
        .map((v) => (typeof v === "number" ? v : q(v))).join(", ") + ");"
  );
  for (const a of AXES) for (const t of p.tags[a]) lines.push(`INSERT INTO product_tags (product_id, axis, tag) VALUES (${q(p.id)}, ${q(a)}, ${q(t)});`);
}
writeFileSync(SEED, lines.join("\n") + "\n");
writeFileSync(PUBLIC_JSON, publicJson);
console.log(`seed.sql と src/data/products.json（公開 ${published} 商品）を書き出しました`);

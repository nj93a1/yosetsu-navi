-- 2026-10-09: 画像の出典、特長、運営元の導入サポート、追加の仕様行を products に追加する（1回だけ流す）。
--   本番:   npx wrangler d1 execute yosetsu-navi --remote --file=./migrations/2026-10-09-media-support.sql
--   ローカル: npx wrangler d1 execute yosetsu-navi --local --file=./migrations/2026-10-09-media-support.sql
ALTER TABLE products ADD COLUMN image_credit TEXT;
ALTER TABLE products ADD COLUMN image_source TEXT;
ALTER TABLE products ADD COLUMN features TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN support TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN spec_rows TEXT NOT NULL DEFAULT '[]';

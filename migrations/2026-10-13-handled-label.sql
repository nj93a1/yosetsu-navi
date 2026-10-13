-- 2026-10-13: 運営元の取り扱い表示の文言（例: 運営元のグループ会社が販売窓口の機種は「運営元グループで取り扱い」）。NULL なら「運営元で取り扱い」（1回だけ流す）
--   本番:   npx wrangler d1 execute yosetsu-navi --remote --file=./migrations/2026-10-13-handled-label.sql
--   ローカル: npx wrangler d1 execute yosetsu-navi --local --file=./migrations/2026-10-13-handled-label.sql
ALTER TABLE products ADD COLUMN handled_label TEXT;

-- 2026-10-14: ワイヤー供給・ファイバコア径・冷却方式（1回だけ流す）
--   本番:   npx wrangler d1 execute yosetsu-navi --remote --file=./migrations/2026-10-14-wire-core-cooling.sql
--   ローカル: npx wrangler d1 execute yosetsu-navi --local --file=./migrations/2026-10-14-wire-core-cooling.sql
ALTER TABLE products ADD COLUMN wire_feed TEXT;
ALTER TABLE products ADD COLUMN fiber_core_um REAL;
ALTER TABLE products ADD COLUMN cooling TEXT;

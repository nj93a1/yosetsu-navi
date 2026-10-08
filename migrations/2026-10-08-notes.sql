-- 2026-10-08: 出力の注記（output_note）と公表板厚（thickness_note）を products に追加する。
-- schema.sql の CREATE TABLE IF NOT EXISTS は既存の表に列を足さないため、作成済みの D1 にはこれを1回だけ流す。
--   本番:   npx wrangler d1 execute yosetsu-navi --remote --file=./migrations/2026-10-08-notes.sql
--   ローカル: npx wrangler d1 execute yosetsu-navi --local --file=./migrations/2026-10-08-notes.sql
-- そのあと npm run db:seed（ローカルは db:seed:local）で値を入れる。2回目に流すと duplicate column エラーになる（適用済みの印）。
ALTER TABLE products ADD COLUMN output_note TEXT;
ALTER TABLE products ADD COLUMN thickness_note TEXT;

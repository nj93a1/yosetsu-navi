-- 2026-10-10: 製造国・本社所在地・国内サポート（origin、JSON）と、相談の種類 × 見ていた機種の記録（inquiry_logs）を追加する（1回だけ流す）。
--   本番:   npx wrangler d1 execute yosetsu-navi --remote --file=./migrations/2026-10-10-origin-inquiry.sql
--   ローカル: npx wrangler d1 execute yosetsu-navi --local --file=./migrations/2026-10-10-origin-inquiry.sql
ALTER TABLE products ADD COLUMN origin TEXT NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS inquiry_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  type        TEXT NOT NULL,           -- choose / quote / test / subsidy / other
  product_id  TEXT,                    -- 見ていた機種（無ければ NULL）
  handled     INTEGER,                 -- 見ていた機種が運営元の取り扱い機か（1/0。機種なしは NULL）
  compare_id  TEXT,                    -- 「実機で比べる」で選んだ運営元の取り扱い機
  from_path   TEXT                     -- 相談フォームの前に見ていたページ（同じサイト内のパスだけ）
);
CREATE INDEX IF NOT EXISTS idx_inquiry_created ON inquiry_logs(created_at);

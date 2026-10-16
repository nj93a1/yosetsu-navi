-- 相談フォームの送信内容（2026-10-16）。メール送信の結果は mail_status（sent / not_configured / failed / pending）
CREATE TABLE IF NOT EXISTS contact_messages (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  type        TEXT NOT NULL,
  company     TEXT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  tel         TEXT,
  body        TEXT,
  extra       TEXT NOT NULL DEFAULT '{}',
  product_id  TEXT,
  compare_id  TEXT,
  answers     TEXT NOT NULL DEFAULT '{}',
  log_id      TEXT,
  from_path   TEXT,
  mail_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at);

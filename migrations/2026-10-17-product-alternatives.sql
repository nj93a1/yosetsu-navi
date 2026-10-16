-- 商品ページの代替候補（2026-10-17）。scripts/build-seed.js が公開機種どうしで計算して入れる（Worker で毎回計算すると CPU 上限を超えるため）
CREATE TABLE IF NOT EXISTS product_alternatives (
  product_id TEXT NOT NULL,
  rank       INTEGER NOT NULL,
  alt_id     TEXT NOT NULL,
  basis      TEXT NOT NULL,   -- price（同じ価格帯）/ near（用途・素材・出力が近い）
  PRIMARY KEY (product_id, rank)
);

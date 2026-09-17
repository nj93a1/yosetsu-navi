-- 溶接機比較サイト D1 スキーマ
-- D1 に持たせるのは「商品マスタ」と「診断ログ」のみ。
-- 診断スコアリングはクライアント側で src/data/products.json を参照して行う。
-- products.json は scripts/build-seed.js で seed.sql に変換して本テーブルへ投入する。

-- ---------------------------------------------------------------
-- 商品マスタ（要件定義書 6章「データ項目」に対応）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,               -- 内部ID（安定キー。スラッグ変更の影響を受けない）
  maker_slug      TEXT NOT NULL,                  -- URL用メーカースラッグ。実名NGの場合はここだけ差し替える
  model_slug      TEXT NOT NULL,                  -- URL用機種スラッグ
  slug            TEXT NOT NULL UNIQUE,           -- {maker_slug}-{model_slug}。/products/{slug}/ のURLになる
  name            TEXT NOT NULL,                  -- 商品名
  maker_name      TEXT NOT NULL,                  -- メーカー名（表示用）
  method          TEXT NOT NULL,                  -- 方式（例: ハンドヘルドファイバー / 真空チャンバー / ロボット組込）
  wavelength      TEXT,                           -- 波長（例: 1080nm）
  output_w        INTEGER,                        -- 出力（W）
  portability     TEXT NOT NULL,                  -- 可搬性（ハンドヘルド / 台車型 / 据置 / ライン組込）
  price_band      TEXT,                           -- 価格帯タグ（実売価格は掲載しない。未確定なら NULL・非公開）
  skill_level     TEXT NOT NULL,                  -- 習得難易度タグ
  comment         TEXT NOT NULL,                  -- 運営者による選定コメント（必須・1文以上）
  suitable_for    TEXT NOT NULL DEFAULT '[]',     -- 向いている用途（JSON配列）
  not_suitable_for TEXT NOT NULL DEFAULT '[]',    -- 向いていない用途（JSON配列）
  handled_by_operator INTEGER NOT NULL DEFAULT 0, -- 自社取り扱い区分（1=運営元で取り扱い）
  image           TEXT,                           -- 画像パス
  source          TEXT,                           -- 情報源（カタログURL等）
  is_published    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- タグ6軸（用途 / 素材 / 板厚 / 環境 / 価格帯 / 習得難易度）を多重付与する。
-- axis の値: use / material / thickness / environment / price / skill
-- 1商品あたり平均10タグ以上（build-seed.js で下限チェック）。
CREATE TABLE IF NOT EXISTS product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  axis       TEXT NOT NULL,
  tag        TEXT NOT NULL,
  PRIMARY KEY (product_id, axis, tag)
);
CREATE INDEX IF NOT EXISTS idx_product_tags_axis_tag ON product_tags(axis, tag);

-- ---------------------------------------------------------------
-- 診断ログ（要件定義書 7章「計測」：条件の組み合わせを1レコードとして記録）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnosis_logs (
  id                TEXT PRIMARY KEY,             -- クライアント生成のUUID
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  -- 各設問の回答（option id）。未回答・わからないは 'unknown'
  q1_material       TEXT,
  q2_thickness      TEXT,
  q3_skill          TEXT,
  q4_environment    TEXT,
  q5_budget         TEXT,
  relaxed_axis      TEXT,                         -- 完全一致ゼロで緩めた条件（なければ NULL）
  shown_products    TEXT NOT NULL DEFAULT '[]',   -- 表示5商品の product id（JSON配列・枠順）
  viewed_products   TEXT NOT NULL DEFAULT '[]',   -- 詳細閲覧商品（JSON配列）
  compared_products TEXT NOT NULL DEFAULT '[]',   -- 比較商品（JSON配列・最大2）
  inquired          INTEGER NOT NULL DEFAULT 0,   -- 問い合わせ有無
  exit_point        TEXT,                         -- 離脱地点（q1..q5 / result / detail / compare / inquiry）
  user_agent        TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON diagnosis_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_conditions
  ON diagnosis_logs(q1_material, q2_thickness, q3_skill, q4_environment, q5_budget);

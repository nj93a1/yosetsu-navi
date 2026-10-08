-- 溶接機比較サイト D1 スキーマ
-- D1 に持たせるのは「商品マスタ」と「診断ログ」のみ。
-- 診断スコアリングはクライアント側で src/data/products.json（配信用・生成物）を参照して行う。
-- 商品マスタ data/products.json を scripts/build-seed.js で seed.sql に変換して本テーブルへ投入する。
-- 既存の D1 に列を足すときは migrations/ の ALTER TABLE を流す（CREATE TABLE IF NOT EXISTS は既存表を変えない）。

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
  output_note     TEXT,                           -- 出力の注記（例: 最大ピーク出力 / 定格。最大2,500W）。無ければ NULL
  portability     TEXT NOT NULL,                  -- 可搬性（ハンドヘルド / 台車型 / 据置 / ライン組込）
  thickness_note  TEXT,
  image_credit    TEXT,                           -- 画像の出典表記（例: 株式会社アマダ 公式サイト）
  image_source    TEXT,                           -- 画像の掲載元ページURL
  features        TEXT NOT NULL DEFAULT '[]',     -- 機能・特長（JSON配列。メーカー・クライアント提供資料に基づく）
  support         TEXT NOT NULL DEFAULT '[]',     -- 運営元が提供する導入サポート（JSON配列。運営元取り扱い機のみ）
  spec_rows       TEXT NOT NULL DEFAULT '[]',     -- 追加の仕様行（JSON配列 [[項目, 値], ...]）                           -- メーカー公表の板厚・溶け込みの数値（表示用。診断の板厚区分は product_tags）。無ければ NULL
  price_band      TEXT,                           -- 価格帯タグ（実売価格は掲載しない。未確定なら NULL・非公開）
  skill_level     TEXT,                           -- 習得難易度タグ（非公開なら NULL）
  comment         TEXT NOT NULL,                  -- 運営者による選定コメント（必須・1文以上）
  suitable_for    TEXT NOT NULL DEFAULT '[]',     -- 向いている用途（JSON配列）
  not_suitable_for TEXT NOT NULL DEFAULT '[]',    -- 向いていない用途（JSON配列）
  handled_by_operator INTEGER NOT NULL DEFAULT 0, -- 自社取り扱い区分（1=運営元で取り扱い）
  image           TEXT,                           -- 画像パス
  source          TEXT,                           -- 情報源の名称（カタログ名等）
  official_url    TEXT,                           -- メーカー公式の商品ページURL
  source_url      TEXT,                           -- 情報源URL（カタログ・仕様表・販売店）
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

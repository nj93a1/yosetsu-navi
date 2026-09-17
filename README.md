# レーザー溶接機 比較・選定サイト（yosetsu-navi）

ノースヒルズ溶接工業株式会社向けの、レーザー溶接機の中立的な比較・選定サイト。
サイト名は未確定（リポジトリ名 `yosetsu-navi` はリネーム指示が出るまで維持）。
要件定義書は [docs/要件定義書.md](docs/要件定義書.md)、商品データ仕様は [docs/商品データ仕様.md](docs/商品データ仕様.md)。

## 構成

Cloudflare Workers + D1。診断スコアリングはクライアント側で JSON を参照し、D1 に持たせるのは診断ログと商品マスタのみ。

```
.
├── src/                       # 静的アセット（Workers の assets として配信）
│   ├── index.html                 # トップ（診断入口・専門用途メニュー）
│   ├── diagnosis/index.html       # 選定診断（1画面1問）
│   ├── about/index.html           # 運営者について
│   ├── data/diagnosis.json        # 設問・重み・緩和順・枠配分ルール（条件はコードに直書きしない）
│   ├── data/products.json         # 商品データの正本（ダミー10点）
│   └── assets/js/scoring.js       # スコアリング純粋ロジック（テスト対象）
│       assets/js/diagnosis.js     # 診断画面の制御
├── worker/index.js            # /api/logs（診断ログ）、/products/{slug}/（商品詳細）
├── schema.sql                 # D1 スキーマ（products / product_tags / diagnosis_logs）
├── scripts/build-seed.js      # products.json を検証して seed.sql を生成
├── test/scoring.test.js       # スコアリングのテスト
└── docs/                      # 要件定義書・仕様
```

商品ページURL：`/products/{メーカースラッグ}-{機種スラッグ}/`（実名NGの場合は `maker_slug` のみ差し替え）

## 開発

```bash
npm install
npm run db:init:local      # ローカル D1 にスキーマ作成
npm run db:seed:local      # products.json を検証 → seed.sql → ローカル D1 へ投入
npm run dev                # http://localhost:8787（Claude のプレビューは port 8766）
npm test                   # スコアリングのテスト
npm run validate           # 商品データの検証のみ
```

## デプロイ（Cloudflare）

1. `npm run db:create` で D1 を作成し、出力された `database_id` を `wrangler.toml` に反映
2. `npm run db:init` → `npm run db:seed`
3. `npm run deploy`

GitHub Actions の Pages ワークフローは `src/` の静的部分だけを https://nj93a1.github.io/yosetsu-navi/ に公開する（デザイン確認用。`/products/` と `/api/` は動かない）。

## 本番公開まで

- 全ページに `<meta name="robots" content="noindex,nofollow">` を残す
- 商品はダミーデータ。実データ投入は未決事項1（メーカー実名）・2（評価根拠）の確定後

## ブランチ・コミット

- `main`: 公開用 / `feature/*` / `fix/*`
- コミット接頭辞：`feat:` / `fix:` / `docs:` / `style:` / `chore:`

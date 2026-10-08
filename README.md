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
│   ├── data/products.json         # 配信用の商品データ（生成物。手で編集しない）
│   └── assets/js/scoring.js       # スコアリング純粋ロジック（テスト対象）
│       assets/js/diagnosis.js     # 診断画面の制御
├── data/products.json         # 商品マスタ（正本。配信されない。notes・非公開機種・価格根拠を含む）
├── worker/index.js            # /api/logs（診断ログ）、/products/{slug}/（商品詳細）
├── schema.sql                 # D1 スキーマ（products / product_tags / diagnosis_logs）
├── scripts/build-seed.js      # マスタを検証し、seed.sql と配信用 src/data/products.json を生成
├── migrations/                # 作成済み D1 に列を足す ALTER TABLE（schema.sql の変更に合わせて追加）
├── test/scoring.test.js       # スコアリングのテスト
└── docs/                      # 要件定義書・仕様
```

商品ページURL：`/products/{メーカースラッグ}-{機種スラッグ}/`（実名NGの場合は `maker_slug` のみ差し替え）

## 開発

```bash
npm install
npm run db:init:local      # ローカル D1 にスキーマ作成
npm run db:seed:local      # マスタを検証 → seed.sql・配信用 JSON を生成 → ローカル D1 へ投入
npm run dev                # http://localhost:8787（Claude のプレビューは port 8766）
npm test                   # スコアリングのテスト
npm run validate           # 商品データの検証のみ
npm run build              # seed.sql と配信用 src/data/products.json を書き出す（deploy でも自動実行）
```

### 商品データの編集

- 編集するのは `data/products.json`（マスタ）だけ。`src/data/products.json` は `npm run build` が書き出す生成物で、
  公開機種（`is_published` が false でないもの）の表示用項目だけを含む。notes・pending・実売価格は出さない
- 編集後は `npm run build` → `npm run validate` → `npm test`、D1 へは `npm run db:seed:local`（本番は `db:seed`）
- 生成した `src/data/products.json` もコミットする（GitHub Pages のプレビューと `wrangler dev` がそのまま読むため）

## デプロイ（Cloudflare）

1. `npm run db:create` で D1 を作成し、出力された `database_id` を `wrangler.toml` に反映
2. `npm run db:init` → `npm run db:seed`（作成済みの D1 に列を足すときは `migrations/` の SQL を `wrangler d1 execute --remote --file=...` で1回流してから）
3. `npm run deploy`

GitHub Actions の Pages ワークフローは `src/` の静的部分だけを https://nj93a1.github.io/yosetsu-navi/ に公開する（デザイン確認用。`/products/` と `/api/` は動かない）。

## 本番公開まで

- 全ページに `<meta name="robots" content="noindex,nofollow">` を残す
- 商品はダミーデータ。実データ投入は未決事項1（メーカー実名）・2（評価根拠）の確定後

## ブランチ・コミット

- `main`: 公開用 / `feature/*` / `fix/*`
- コミット接頭辞：`feat:` / `fix:` / `docs:` / `style:` / `chore:`

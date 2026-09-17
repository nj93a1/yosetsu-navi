# レーザー溶接機 比較・選定サイト（yosetsu-navi）

- 要件定義書 `docs/要件定義書.md` と `docs/商品データ仕様.md` を実装前に必ず読む
- 構成: Cloudflare Workers + D1。診断スコアリングはクライアント側（`src/assets/js/scoring.js` が `src/data/*.json` を参照）。D1 は診断ログと商品マスタのみ
- 診断の条件・重み・枠配分は `src/data/diagnosis.json` で管理。コードに直書きしない
- 商品データの正本は `src/data/products.json`。変更後は `npm run validate` と `npm test`、D1 へは `npm run db:seed:local`
- サイト名は未確定。リポジトリ名 `yosetsu-navi` はリネーム指示が出るまで変更しない
- 商品URLは `/products/{maker_slug}-{model_slug}/`。価格は価格帯のみ（実売価格は載せない）
- UI基準: 本文18px以上 / 見出し24px以上 / ボタン56px以上 / タップ間隔12px以上 / コントラスト4.5:1以上 / 横スクロール表・ホバー限定表示・自動再生は禁止 / スマホ優先
- 本番公開まで全ページ `noindex,nofollow`。CSS/JS は `?v=` でキャッシュ回避
- プレビュー: `.claude/launch.json` の `site`（wrangler dev、port 8766）
- コミットは `feat:` / `fix:` / `docs:` / `chore:` 接頭辞、日本語
- 現在はダミー商品10点。実データ投入は未決事項1・2の確定後

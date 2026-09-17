# 溶接ナビ

溶接に関する情報サイト。静的HTML/CSS/JS、ビルド工程なし。

- 公開: `src/` を GitHub Pages に自動デプロイ（`.github/workflows/pages.yml`、main push で反映）
- リポジトリ: nj93a1/yosetsu-navi
- 要件定義書: `docs/` 配下。実装前に必ず参照する
- プレビュー: `.claude/launch.json` の `site`（port 8766）
- 本番公開まで全ページに `<meta name="robots" content="noindex,nofollow">` を残す
- CSS/JS は `?v=` でキャッシュ回避
- コミットは `feat:` / `fix:` / `docs:` / `style:` / `chore:` 接頭辞、日本語

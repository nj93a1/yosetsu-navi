# 溶接ナビ

溶接に関する情報サイト「溶接ナビ」のソースコードです。
要件定義書は `docs/` 配下に置きます。

## ディレクトリ構成

```
.
├── src/                 # サイトのソース（GitHub Pages で公開）
│   ├── index.html
│   └── assets/
│       ├── css/
│       ├── js/
│       └── images/
├── docs/                # 要件定義書・企画などのドキュメント
└── README.md
```

## 公開URL

https://nj93a1.github.io/yosetsu-navi/ （`main` に push すると GitHub Actions が自動デプロイ）

本番ドメイン接続までは `noindex, nofollow` を付けています（`src/index.html` の meta robots）。

## ローカル確認

```bash
python3 -m http.server 8766 --directory src
```

http://localhost:8766/ を開く。

## ブランチ運用

- `main`: 公開用（常にデプロイ可能な状態を保つ）
- `feature/*`: 機能・ページ追加
- `fix/*`: 修正

## コミットメッセージ

`feat:` / `fix:` / `docs:` / `style:` / `chore:` の接頭辞を付けてください。

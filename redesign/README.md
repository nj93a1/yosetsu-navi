# デザイン刷新版（パーツセレクト方式）

- 現行デザインはタグ `design-v1-mybest` に保存。刷新版は確認用に `/redesign/` で公開（noindex）
- 選んだパーツ（2026-10-11）: ⓪SEC-077 ①SEC-121 ②SEC-163 ③SEC-082 ④SEC-044 ⑤SEC-090 ⑥SEC-116 ⑦SEC-142 ⑧SEC-097 ⑨SEC-009 ⑩SEC-135 ⑪SEC-161
- `index.html` … `~/Developer/section-parts/scripts/assemble.js` で組み立てたままの版（ダミー文）
- `customize.py` … 組み立て版に、色・フォント・文言・写真を差し込んで `src/redesign/index.html` を作る
  `python3 -I redesign/customize.py redesign/index.html src/redesign/index.html`
- `board_spec.json` … 一括選択ボードの候補と理由

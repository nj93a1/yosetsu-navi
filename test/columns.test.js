import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseColumn, renderBody, buildColumns } from "../scripts/build-columns.js";

test("コラム: frontmatter の必須項目と path の形を確かめ、Markdown を節ごとの HTML にする", () => {
  const ok = "---\ntitle: T\ndate: 2026-10-16\npath: price-guide\ndescription: D\ndraft: true\n---\n本文";
  assert.equal(parseColumn(ok).draft, true);
  assert.throws(() => parseColumn(ok.replace("path: price-guide", "path: 価格")), /path/);
  assert.throws(() => parseColumn(ok.replace("title: T\n", "")), /title/);
  const html = renderBody("導入です。\n\n## 見出し\n- **太字**\n- [一覧](/lineup/)\n\n段落<script>");
  assert.match(html, /<p>導入です。<\/p>/);
  assert.match(html, /<section class="art__sec"><h2>見出し<\/h2>/);
  assert.match(html, /<li><b class="mk">太字<\/b><\/li><li><a href="\/lineup\/">一覧<\/a><\/li>/);
  assert.match(html, /段落&lt;script&gt;/);
  assert.match(html, /<\/section>$/);
});

test("コラム: 下書き（draft: true）はページを作らない。サジェストワードの一覧は path が重ならない", () => {
  const { all, pub } = buildColumns({ write: false });
  assert.ok(all.some((c) => c.draft));
  assert.ok(pub.every((c) => !c.draft));
  const kw = JSON.parse(readFileSync(new URL("../content/columns/keywords.json", import.meta.url))).words;
  assert.equal(new Set(kw.map((w) => w.path)).size, kw.length);
  for (const c of all) assert.ok(kw.some((w) => w.path === c.path && w.keyword === c.keyword), c.path);
});

// コラム（content/columns/*.md）を公開ページにする。npm run build の中で動く。
//   入力: frontmatter（title / date / path / description / keyword / draft）＋ Markdown の本文（## 見出し・段落・箇条書き・**太字**・[リンク](URL)）
//   出力: src/columns/{path}/index.html と、一覧 src/columns/index.html、一覧用 src/data/columns.json
//   draft: true の記事はページを作らない（承認されたら draft の行を消して公開する）
// 書き方の決まりは content/columns/README.md。SEO ツール（kdm-seo-ops）の記事ジョブも、このフォルダに .md を 1 つ足す形で記事案を出す
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "content/columns");
const OUT = join(ROOT, "src/columns");
const SITE = "レーザー溶接機 比較・選定";
const ORIGIN = "https://yosetsu-kakaku.com";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** 1 行の中の **太字** と [リンク](URL)。URL は / か https:// で始まるものだけ */
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b class="mk">$1</b>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, (_, t, u) => (u.startsWith("/") ? `<a href="${u}">${t}</a>` : `<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
}

export function parseColumn(raw, file = "") {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw.replace(/\r\n?/g, "\n"));
  if (!m) throw new Error(`${file}: frontmatter がありません`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  for (const k of ["title", "date", "path", "description"]) if (!meta[k]) throw new Error(`${file}: frontmatter に ${k} がありません`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.path)) throw new Error(`${file}: path は英小文字・数字・ハイフンだけ（${meta.path}）`);
  return { ...meta, draft: meta.draft === "true", body: m[2].trim(), file };
}

/** 本文の Markdown → HTML。## ごとに節（section）にまとめる */
export function renderBody(md) {
  const out = [];
  let list = null, para = [], open = false;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(""))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const line of md.split("\n")) {
    const t = line.trim();
    let mm;
    if (!t) { flushPara(); flushList(); continue; }
    if ((mm = /^##\s+(.+)$/.exec(t)) && !t.startsWith("###")) {
      flushPara(); flushList();
      if (open) out.push("</section>");
      out.push(`<section class="art__sec"><h2>${inline(mm[1])}</h2>`); open = true; continue;
    }
    if ((mm = /^###\s+(.+)$/.exec(t))) { flushPara(); flushList(); out.push(`<h3>${inline(mm[1])}</h3>`); continue; }
    if ((mm = /^[-*]\s+(.+)$/.exec(t)) || (mm = /^\d+[.)]\s+(.+)$/.exec(t))) {
      flushPara();
      const tag = /^\d/.test(t) ? "ol" : "ul";
      if (list && list.tag !== tag) flushList();
      (list ||= { tag, items: [] }).items.push(mm[1]); continue;
    }
    flushList(); para.push(t);
  }
  flushPara(); flushList();
  if (open) out.push("</section>");
  return out.join("\n");
}

const dateText = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : d; };

function head({ title, description, path, version }) {
  const full = `${title}｜${SITE}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap" rel="stylesheet">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/style.css?v=${version}">
  <link rel="stylesheet" href="/assets/css/article.css?v=${version}">
  <title>${esc(full)}</title>
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE}">
  <meta property="og:title" content="${esc(full)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${ORIGIN}${path}">
  <link rel="canonical" href="${ORIGIN}${path}">
  <meta property="og:image" content="${ORIGIN}/assets/images/ogp.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="description" content="${esc(description)}">
</head>
<body>
<div id="siteHeader"></div>`;
}
const foot = (version) => `
<div id="siteFooter"></div>
<script type="module">import { mountChrome } from "/assets/js/partials.js?v=${version}"; mountChrome({ current: "/articles/" });</script>
</body>
</html>
`;

export function columnPage(c, version) {
  return `${head({ title: c.title, description: c.description, path: `/columns/${c.path}/`, version })}
<main class="section art">
  <div class="narrow">
    <p class="art__crumbs"><a href="/articles/">選び方ガイド</a> › <a href="/columns/">コラム</a></p>
    <div class="sec-head"><h1>${inline(c.title)}</h1><span class="sec-head__eyebrow">${dateText(c.date)} 公開</span></div>
    <div class="art__note"><p>この記事は、メーカーや販売店が公開している情報を基に書いています。価格は公開されている価格帯だけを扱い、実売価格は載せていません。</p></div>
${renderBody(c.body)}
    <section class="art__sec art__next"><h2>機種を探す</h2><ul>
      <li><a href="/diagnosis/">5つの質問で、現場に合う機種を絞り込む</a></li>
      <li><a href="/lineup/">機種一覧から、条件で探す</a></li>
      <li><a href="/contact/?type=choose">機種選びを相談する</a></li>
    </ul></section>
  </div>
</main>${foot(version)}`;
}

function indexPage(list, version) {
  return `${head({ title: "コラム", description: "レーザー溶接機の価格・選び方・補助金など、検索の多い疑問に、公開情報を基に答えるコラムです。", path: "/columns/", version })}
<main class="section art">
  <div class="narrow">
    <p class="art__crumbs"><a href="/articles/">選び方ガイド</a></p>
    <div class="sec-head"><h1>コラム</h1><span class="sec-head__eyebrow">価格・選び方・補助金など、よく調べられている疑問に答えます</span></div>
    ${list.length ? `<ul class="pnav">${list.map((c) => `<li><a href="/columns/${c.path}/"><span class="pnav__label">${esc(c.title)}<span class="pnav__sub">${dateText(c.date)}</span></span><svg class="ico ico--chev" aria-hidden="true"><use href="/assets/icons.svg#i-chevron"></use></svg></a></li>`).join("")}</ul>` : `<p>準備中です。</p>`}
  </div>
</main>${foot(version)}`;
}

export function buildColumns({ write = true, withDrafts = false } = {}) {
  const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith(".md") && f !== "README.md").sort() : [];
  const all = files.map((f) => parseColumn(readFileSync(join(SRC, f), "utf8"), f));
  const paths = new Set();
  for (const c of all) { if (paths.has(c.path)) throw new Error(`path が重複しています: ${c.path}`); paths.add(c.path); }
  // withDrafts は手元で下書きを見るときだけ（npm run columns:preview）。npm run build / deploy は必ず作り直すので下書きは残らない
  const pub = all.filter((c) => withDrafts || !c.draft).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (write) {
    // CSS/JS の版は、ほかのページ（記事ページ）と同じ値を使う
    const version = (/style\.css\?v=(\d+)/.exec(readFileSync(join(ROOT, "src/articles/index.html"), "utf8")) || [, "1"])[1];
    if (existsSync(OUT)) rmSync(OUT, { recursive: true });
    mkdirSync(OUT, { recursive: true });
    for (const c of pub) {
      mkdirSync(join(OUT, c.path), { recursive: true });
      writeFileSync(join(OUT, c.path, "index.html"), columnPage(c, version));
    }
    writeFileSync(join(OUT, "index.html"), indexPage(pub, version));
    writeFileSync(join(ROOT, "src/data/columns.json"), JSON.stringify(pub.map(({ title, date, path, description, keyword }) => ({ title, date, path, description, keyword: keyword || null })), null, 2) + "\n");
  }
  return { all, pub };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { all, pub } = buildColumns({ withDrafts: process.argv.includes("--with-drafts") });
  const drafts = all.filter((c) => c.draft).length;
  console.log(process.argv.includes("--with-drafts") ? `コラム: 下書き ${drafts} 本を含めて ${pub.length} 本を書き出しました（確認用。本番に出す前に npm run build で作り直す）` : `コラム: ${pub.length} 本を公開（下書き ${drafts} 本）`);
}

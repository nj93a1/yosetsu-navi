// ヘッダー・フッター・下部固定バーの共通パーツ（全ページで同じものを出す）
const ICONS = "/assets/icons.svg";
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 機種の種類（ピクトグラムの選択用）。方式の先頭が「ハンド」ならハンドヘルド（ロボット接続対応の手持ち機を含む） */
export function productKind(p) {
  const m = p.method || "";
  if (/^ハンド/.test(m)) return "handheld";
  if (/ロボット|ライン/.test(m)) return "robot";
  if (/据置|真空|チャンバー/.test(m)) return "fixed";
  return "handheld";
}

/** 商品写真。実写真が無いときは青緑のタイル＋種類のピクトグラム（variant: card / row / result / compare / product） */
export function productPhoto(p, variant = "card") {
  if (p.image && !p.image.includes("placeholder")) return `<img class="ph-img ph-img--${variant}" src="${escHtml(p.image)}" alt="" loading="lazy">`;
  return `<span class="ph ph--${variant}" role="img" aria-label="${escHtml(p.name)}の写真は準備中"><svg class="ico" aria-hidden="true"><use href="/assets/icons.svg#i-${productKind(p)}"></use></svg><small>写真 準備中</small></span>`;
}

export const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#i-${name}"></use></svg>`;

export function header(current = "") {
  // スマホはメニューボタンで開く一覧。PC はトップだけ右カラムのメニューが主要ナビで、下層ページはヘッダーに文字メニュー（hnav）を出す
  const items = [
    ["/diagnosis/", "diag", "5つの質問で選ぶ"],
    ["/lineup/", "lineup", "機種一覧"],
    ["/diagnosis/#compare", "compare", "2台を比較"],
    ["/articles/", "guide", "選び方ガイド"],
    ["/contact/", "consult", "相談・問い合わせ"],
  ];
  return `
<div class="topstrip"><div class="topstrip__in"><p>テスト溶接・補助金の活用相談<span class="topstrip__long">を受け付けています</span><span class="topstrip__by">（運営元が対応）</span></p><a href="/contact/?type=test">相談する${icon("chevron", "ico")}</a></div></div>
<header class="header">
  <div class="header__in">
    <a class="header__brand" href="/">${icon("diag", "ico header__mark")}<span class="header__name">レーザー溶接機 比較・選定<small>中立的な比較情報サイト（サイト名 仮）</small></span></a>
    <nav class="hnav" aria-label="主要メニュー">${items.filter(([href]) => !href.includes("#")).map(([href, ic, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>`).join("")}</nav>
    <div class="header__tools">
      <a class="header__tool" href="/lineup/">${icon("search")}<span>検索</span></a>
      <button class="header__tool header__tool--menu" type="button" id="menuBtn" aria-expanded="false" aria-controls="gnav">${icon("menu")}<span>メニュー</span></button>
    </div>
  </div>
  <nav class="gnav" id="gnav" data-open="false" aria-label="メニュー">
    <ul>${items.map(([href, ic, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span>${icon("chevron", "ico ico--chev")}</a></li>`).join("")}</ul>
  </nav>
</header>`;
}

export function bottombar(current = "") {
  const items = [
    ["/diagnosis/", "diag", "診断で選ぶ"],
    ["/lineup/", "lineup", "機種一覧"],
    ["/diagnosis/#compare", "compare", "2台を比較"],
    ["/contact/", "consult", "相談する"],
  ];
  return `
<nav class="bottombar" aria-label="主要メニュー">
  <ul>${items.map(([href, ic, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a></li>`).join("")}</ul>
</nav>`;
}

export function footer() {
  return `
<footer class="footer">
  <div class="wrap">
    <ul class="footer__links">
      <li><a href="/diagnosis/">5つの質問で選ぶ${icon("chevron")}</a></li>
      <li><a href="/lineup/">機種一覧${icon("chevron")}</a></li>
      <li><a href="/articles/">選び方ガイド${icon("chevron")}</a></li>
      <li><a href="/contact/">相談・問い合わせ${icon("chevron")}</a></li>
      <li><a href="/about/">運営者情報・評価基準${icon("chevron")}</a></li>
    </ul>
    <p class="footer__op">掲載内容はメーカー公開情報に基づきます。</p>
    <p class="footer__copy">© 2026 レーザー溶接機 比較・選定</p>
  </div>
</footer>`;
}

export function mountChrome({ current = "", withBottombar = true } = {}) {
  document.getElementById("siteHeader").innerHTML = header(current);
  document.getElementById("siteFooter").innerHTML = footer() + (withBottombar ? bottombar(current) : "");
  if (withBottombar) document.body.classList.add("has-bar");
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("gnav");
  btn.addEventListener("click", () => {
    const open = nav.dataset.open !== "true";
    nav.dataset.open = String(open);
    btn.setAttribute("aria-expanded", String(open));
  });
}

// ヘッダー・フッター・下部固定バーの共通パーツ（全ページで同じものを出す）
const ICONS = "/assets/icons.svg";
export const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#i-${name}"></use></svg>`;

export function header(current = "") {
  // スマホ用メニュー。PCでは右カラムのメニューが主要ナビゲーションなので、このメニューは出さない
  const items = [
    ["/diagnosis/", "diag", "5つの質問で選ぶ"],
    ["/lineup/", "lineup", "機種一覧"],
    ["/diagnosis/#compare", "compare", "2台を比較"],
    ["/articles/", "guide", "選び方ガイド"],
    ["/contact/", "consult", "相談・問い合わせ"],
  ];
  return `
<header class="header">
  <div class="header__in">
    <a class="header__brand" href="/">${icon("diag", "ico header__mark")}<span class="header__name">レーザー溶接機 比較・選定<small>中立的な比較情報サイト（サイト名 仮）</small></span></a>
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

// ヘッダー・フッター・下部固定バーの共通パーツ（全ページで同じものを出す）
const ICONS = "/assets/icons.svg";
export const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#i-${name}"></use></svg>`;

export function header(current = "") {
  const items = [
    ["/diagnosis/", "diag", "5つの質問で選ぶ（診断）"],
    ["/lineup/", "list", "機種一覧から探す"],
    ["/articles/", "article", "選び方・比較のコツを読む"],
    ["/contact/", "contact", "相談・問い合わせ"],
    ["/about/", "article", "運営者について・評価基準"],
  ];
  return `
<header class="header">
  <div class="header__in">
    <a class="header__brand" href="/"><span>レーザー溶接機 比較・選定<small>中立的な比較情報サイト（サイト名 仮）</small></span></a>
    <button class="header__menu" type="button" id="menuBtn" aria-expanded="false" aria-controls="gnav">${icon("menu")}MENU</button>
  </div>
  <nav class="gnav" id="gnav" data-open="false" aria-label="メニュー">
    <ul>${items.map(([href, ic, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ""}><span>${label}</span>${icon(ic)}</a></li>`).join("")}</ul>
  </nav>
</header>`;
}

export function bottombar(current = "") {
  const items = [
    ["/diagnosis/", "diag", "診断で選ぶ"],
    ["/lineup/", "list", "機種一覧"],
    ["/diagnosis/#compare", "compare", "2台を比較"],
    ["/contact/", "contact", "相談する"],
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
      <li><a href="/about/">運営者について・評価基準${icon("chevron")}</a></li>
      <li><a href="/lineup/">機種一覧${icon("chevron")}</a></li>
      <li><a href="/contact/">お問い合わせ${icon("chevron")}</a></li>
    </ul>
    <p class="footer__op">運営：ノースヒルズ溶接工業株式会社</p>
    <p class="footer__op">当社はレーザー溶接機の販売事業者です。本サイトに掲載する製品の一部を取り扱っており、該当製品には「運営元で取り扱い」と表示しています。</p>
    <p class="footer__copy">© 2026 ノースヒルズ溶接工業株式会社</p>
  </div>
</footer>`;
}

export function mountChrome({ current = "", withBottombar = true } = {}) {
  document.getElementById("siteHeader").innerHTML = header(current);
  document.getElementById("siteFooter").innerHTML = footer() + (withBottombar ? bottombar(current) : "");
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("gnav");
  btn.addEventListener("click", () => {
    const open = nav.dataset.open !== "true";
    nav.dataset.open = String(open);
    btn.setAttribute("aria-expanded", String(open));
  });
}

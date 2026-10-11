import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (a[:80], c)
    s = s.replace(a, b)
def block(sec, new):
    """<!-- ===== SEC-xxx ===== --> から次のマーカー（または <script>）までを差し替える"""
    global s
    start = s.index(f'<!-- ===== {sec} ===== -->')
    m = re.compile(r'\n<!-- ===== SEC-\d+ ===== -->|\n<script>').search(s, start + 10)
    s = s[:start] + f'<!-- ===== {sec} ===== -->\n' + new.strip() + '\n' + s[m.start():]
P = lambda name: f'<svg class="rd-pict" viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/icons.svg#i-{name}"></use></svg>'

# ---------- head ----------
s = re.sub(r'<link rel="preconnect"[^>]*>\n', '', s)
s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">\n', '', s)
rep('<title>レーザー溶接機 比較・選定</title>', '''<title>レーザー溶接機 比較・選定｜デザイン刷新版（確認用）</title>
<!-- 本番公開時に削除：検索エンジンのインデックスを許可する -->
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Montserrat:wght@500;700&display=swap">''')
# フォントを2種類に統一（日本語は BIZ UDPゴシック、英字の見出しラベルだけ Montserrat）
def fix_font(m):
    v = m.group(1)
    return 'font-family: Montserrat, "BIZ UDPGothic", sans-serif' if 'Montserrat' in v or 'Oswald' in v or 'Sulphur' in v else 'font-family: "BIZ UDPGothic", sans-serif'
s = re.sub(r'font-family\s*:\s*([^;}{]+)', fix_font, s)

# ---------- 色（各パーツの一番外側の変数だけ） ----------
C = dict(main='#14A3A6', dark='#0E7F82', ink='#0B6A6C', light='#E3F4F4', tint='#F1FAFA', sub='#6A4FA8', acc='#D2DF1E', accl='#F4F7D0', text='#313131', subtext='#5F6874')
rep('--bg:#00b383; --panel:#ffffff; --ink:#204253; --accent:#1055a3; --accent-dark:#0a5096; --accent-ink:#ffffff;',
    f'--bg:{C["dark"]}; --panel:#ffffff; --ink:{C["text"]}; --accent:{C["sub"]}; --accent-dark:#56408A; --accent-ink:#ffffff;')
rep('--yellow:#fcc433; --deco:#19685a; --stripe:#6fc494; --mark:#3fd18f;', f'--yellow:{C["acc"]}; --deco:{C["ink"]}; --stripe:{C["main"]}; --mark:{C["acc"]};')
rep('--bg:#ffffff; --text:#1f1f1f; --accent:#ff4800; --accent-ink:#ffffff;', f'--bg:#ffffff; --text:{C["text"]}; --accent:{C["dark"]}; --accent-ink:#ffffff;')
rep('--rule:#f6f9fc; --shadow:rgba(33,51,67,.12); --dark:#1f1f1f; --muted:#666666;', f'--rule:{C["tint"]}; --shadow:rgba(33,51,67,.12); --dark:{C["text"]}; --muted:{C["subtext"]};')
for a, b in [('--bg-a: #008c92;', f'--bg-a: {C["dark"]};'), ('--bg-b: #00a9b0;', f'--bg-b: {C["main"]};'), ('--bg-c: #00c4cc;', '--bg-c: #2BB8BB;'),
             ('--ink: #23221f;', f'--ink: {C["text"]};'), ('--label-bg: #12706f;', f'--label-bg: {C["ink"]};'), ('--btn-dark: #005a64;', f'--btn-dark: {C["ink"]};'),
             ('--icon: #12abb1;', f'--icon: {C["main"]};'), ('--tag-bg: #ffee11;', f'--tag-bg: {C["acc"]};'), ('--tag-ink: #0f7f85;', f'--tag-ink: {C["text"]};')]:
    rep(a, b)
rep('--bg:#ffffff; --text:#323232; --accent:#2864f0; --accent-ink:#1e46aa; --bar:#73a5ff;', f'--bg:#ffffff; --text:{C["text"]}; --accent:{C["dark"]}; --accent-ink:{C["ink"]}; --bar:{C["main"]};')
rep('--ill-line:#3c78e6; --ill-fill:#e8f0ff; --ill-sub:#ffc864;', f'--ill-line:{C["dark"]}; --ill-fill:{C["light"]}; --ill-sub:{C["acc"]};')
rep('--frame:#ffffff; --bg:#f0f4f8; --surface:#ffffff; --text:#222631; --accent:#009baa; --accent-hover:#00788c; --accent-ink:#ffffff;',
    f'--frame:#ffffff; --bg:{C["tint"]}; --surface:#ffffff; --text:{C["text"]}; --accent:{C["dark"]}; --accent-hover:{C["ink"]}; --accent-ink:#ffffff;')
rep('--ph-a:#d9dde2; --ph-b:#b9c3cc; --ph-ink:rgba(34,38,49,.45);', f'--ph-a:{C["light"]}; --ph-b:#BFE4E5; --ph-ink:{C["ink"]};')
rep('--bg:#ffffff; --text:#222222; --ink:#000000; --tile:#fafafa; --price:#009fe7; --link:#00a0e8; --line:#dddddd;',
    f'--bg:#ffffff; --text:{C["text"]}; --ink:{C["text"]}; --tile:#fafafa; --price:{C["dark"]}; --link:{C["dark"]}; --line:#E6E9EC;')
rep('--label:#222222; --label-ink:#ffffff; --new:#ff0000; --pink:#e4007e; --strike:#79828c;', f'--label:{C["text"]}; --label-ink:#ffffff; --new:{C["sub"]}; --pink:{C["sub"]}; --strike:#79828c;')
rep('--bg:#ffffff; --text:#424242; --heading:#000000; --sub-heading:#333333; --accent:#bf0000;', f'--bg:#ffffff; --text:{C["text"]}; --heading:{C["text"]}; --sub-heading:{C["text"]}; --accent:{C["dark"]};')
rep('--link:#006ea7; --link-hover:#d80000; --btn:#006ea7; --btn-hover:#006ec2; --btn-ink:#ffffff;', f'--link:{C["dark"]}; --link-hover:{C["ink"]}; --btn:{C["dark"]}; --btn-hover:{C["ink"]}; --btn-ink:#ffffff;')
rep('--card-line:#eeeeee; --toggle-bg:#ffd3d3; --ph:#f4eed2; --ph-ink:rgba(66,66,66,.55); --badge:#e9d9a6;', f'--card-line:#E6E9EC; --toggle-bg:{C["light"]}; --ph:{C["tint"]}; --ph-ink:{C["ink"]}; --badge:{C["acc"]};')
for a, b in [('--panel: #f3f1ea;', f'--panel: {C["tint"]};'), ('--text: #3e4240;', f'--text: {C["text"]};'), ('--accent: #1aae6e;', f'--accent: {C["dark"]};'),
             ('--accent-soft: #e2f9e6;', f'--accent-soft: {C["light"]};'), ('--navy: #0b3a8a;', f'--navy: {C["ink"]};'), ('--dot: #facc5d;', f'--dot: {C["acc"]};')]:
    rep(a, b)
rep('--bg:#f8f8f8; --surface:#ffffff; --title:#13202f; --text:#191919; --accent:#f03748; --link:#df1c13; --q:#191919;',
    f'--bg:{C["tint"]}; --surface:#ffffff; --title:{C["text"]}; --text:{C["text"]}; --accent:{C["dark"]}; --link:{C["dark"]}; --q:{C["text"]};')
rep('--bg:#ffffff; --text:#231815; --icon:#333333; --accent:#d75a11; --thumb:#f9f8f6;', f'--bg:#ffffff; --text:{C["text"]}; --icon:{C["text"]}; --accent:{C["dark"]}; --thumb:#f9f8f6;')
rep('--btn:#f2efea; --btn-hover:#e8e2d9; --dark:#231815; --dark-ink:#ffffff;', f'--btn:{C["tint"]}; --btn-hover:{C["light"]}; --dark:{C["text"]}; --dark-ink:#ffffff;')
rep('--ph-a:#f3efe8; --ph-b:#e4dccf; --ph-ink:rgba(35,24,21,.45);', f'--ph-a:{C["light"]}; --ph-b:#BFE4E5; --ph-ink:{C["ink"]};')
rep('--bg:#ffda1b; --surface:#ffffff; --text:#202226; --accent:#447fe0; --accent-ink:#3f6ecc; --badge:#ee7100; --badge-ink:#ffffff; --line:#f0f1f5;',
    f'--bg:{C["acc"]}; --surface:#ffffff; --text:{C["text"]}; --accent:{C["dark"]}; --accent-ink:{C["ink"]}; --badge:{C["sub"]}; --badge-ink:#ffffff; --line:#f0f1f5;')
rep('--ph-a:#f5f7fb; --ph-b:#e3eaf7; --ph-c:#f3e6c4;', f'--ph-a:{C["tint"]}; --ph-b:{C["light"]}; --ph-c:{C["accl"]};')
for a, b in [('--navy: #002777;', f'--navy: {C["ink"]};'), ('--photo-a: #8fb0d6;', f'--photo-a: {C["main"]};'), ('--photo-b: #1d3f7a;', f'--photo-b: {C["ink"]};')]:
    rep(a, b)
s = s.replace('#4f78ad 45%', '#0E7F82 45%')
s = s.replace('.sec044__card:nth-child(2) .sec044__ph { background:linear-gradient(150deg, #e7e2dc, #c9bdb3); }', '.sec044__card:nth-child(2) .sec044__ph { background:linear-gradient(150deg, #F4F7D0, #E2EA8C); }')
s = s.replace('.sec044__card:nth-child(3) .sec044__ph { background:linear-gradient(150deg, #e4e5e6, #c4c7ca); }', '.sec044__card:nth-child(3) .sec044__ph { background:linear-gradient(150deg, #EFEAF7, #D3C8EA); }')
s = s.replace('.sec044__card:nth-child(4) .sec044__ph { background:linear-gradient(150deg, #d7e3ea, #8fb0c6); }', '.sec044__card:nth-child(4) .sec044__ph { background:linear-gradient(150deg, #F1F3F5, #D5DADF); }')

# ---------- ⓪ 上部の帯 ----------
rep('aria-label="キャンペーンのお知らせ"', 'aria-label="補助金・税制のお知らせ"')
rep('<a class="sec077__link" href="#">', '<a class="sec077__link" href="/subsidy/">')
rep('<span class="sec077__badge-s">締切まで</span><span class="sec077__badge-l">あと<br class="sec077__br">わずか!!</span>', '<span class="sec077__badge-s">公募中</span><span class="sec077__badge-l">締切<br class="sec077__br">間近も!!</span>')
rep('<span class="sec077__lead"><i>\\\\</i>法人限定!<i>//</i></span>', '<span class="sec077__lead"><i>\\\\</i>要確認!<i>//</i></span>')
rep('<span class="sec077__label-a">サービス名</span><span class="sec077__label-b">最大<b>1</b>年間</span>', '<span class="sec077__label-a">補助金・税制</span><span class="sec077__label-b">補助<b>½</b>以下</span>')
rep('<span class="sec077__title"><span>実質</span><b>0</b><em>円キャンペーン</em></span>', '<span class="sec077__title"><span>全</span><b>10</b><em>制度を比較</em></span>')
rep('<span class="sec077__note">お申し込み＆条件達成で<br>全員もらえる</span>', '<span class="sec077__note">締切・上限額は<br>2026年10月10日時点</span>')

# ---------- ① ヘッダー ----------
L = lambda title, text, href: f'<a class="sec121__card" href="{href}"><span class="sec121__card-title">{title}</span><span class="sec121__card-text">{text}</span></a>'
q = lambda k, v: f'/lineup/?{k}=' + v
block('SEC-121', f'''
<header class="sec121" data-part="SEC-121">
  <div class="sec121__inner">
    <a class="sec121__logo" href="/redesign/" aria-label="トップへ"><span class="sec121__logo-ph">{P("diag")}<span>レーザー溶接機<br>比較・選定</span></span></a>
    <button class="sec121__burger" type="button" aria-expanded="false" aria-label="メニュー"><span></span></button>
    <div class="sec121__menu">
      <label class="sec121__search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg><input type="search" placeholder="機種名・メーカー名で探す" aria-label="機種名・メーカー名で探す" data-rd-search></label>
      <ul class="sec121__tabs">
        <li>
          <button class="sec121__tab" type="button" aria-expanded="false"><span class="sec121__tab-label">機種を探す</span><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 6.5 9 12l5.5-5.5"/></svg></button>
          <div class="sec121__drop sec121__drop--plain">
            <div class="sec121__drop-box">
              <div class="sec121__body">
                <ul class="sec121__grid">
                  <li><p class="sec121__col-title">素材</p>{L("鉄・ステンレス", "対応を公表している機種がもっとも多い素材です。", q("material", "ステンレス"))}</li>
                  <li><p class="sec121__col-title">素材</p>{L("アルミ・銅", "反射率の高い素材。対応を公表している機種から探せます。", q("material", "アルミ"))}</li>
                  <li><p class="sec121__col-title">素材</p>{L("チタン", "対応を公表している機種は限られます。", q("material", "チタン"))}</li>
                  <li class="sec121__divider" aria-hidden="true"></li>
                  <li><p class="sec121__col-title">板厚</p>{L("薄板（0.5〜3mm）", "板金・筐体など、ひずみを抑えたい溶接に。", q("thickness", "0.5〜3mm"))}</li>
                  <li><p class="sec121__col-title">板厚</p>{L("中厚（3〜6mm）", "TIG から置き換えたい中厚板に。", q("thickness", "3〜6mm"))}</li>
                  <li><p class="sec121__col-title">板厚</p>{L("厚物（6mm以上）", "6mm以上の対応を公表している機種です。", q("thickness", "6mm以上"))}</li>
                </ul>
              </div>
            </div>
          </div>
        </li>
        <li>
          <button class="sec121__tab" type="button" aria-expanded="false"><span class="sec121__tab-label">条件から選ぶ</span><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 6.5 9 12l5.5-5.5"/></svg></button>
          <div class="sec121__drop">
            <div class="sec121__drop-box">
              <div class="sec121__side">
                <ul role="tablist">
                  <li><button type="button" role="tab" aria-selected="true" data-tab="0">使う人・場所・予算<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6.5 3.5 12 9l-5.5 5.5"/></svg></button></li>
                  <li><button type="button" role="tab" aria-selected="false" data-tab="1">方式<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6.5 3.5 12 9l-5.5 5.5"/></svg></button></li>
                  <li><button type="button" role="tab" aria-selected="false" data-tab="2">このサイトについて<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6.5 3.5 12 9l-5.5 5.5"/></svg></button></li>
                </ul>
              </div>
              <div class="sec121__body">
                <div class="sec121__panel" role="tabpanel">
                  <ul class="sec121__grid">
                    <li>
                      <p class="sec121__col-title">使う人</p>
                      {L("未経験の新人が使う", "メーカーが「初心者でも扱える」と公表している機種です。", q("skill", "未経験可"))}
                      {L("5つの質問で絞り込む", "使う人・素材・板厚・場所・予算から候補を5台に。", "/diagnosis/")}
                    </li>
                    <li>
                      <p class="sec121__col-title">使う場所</p>
                      {L("国内で修理・サポート", "国内での修理・保守を公式に記載している機種です。", "/lineup/?support=国内で修理・サポート")}
                      {L("ライン・ロボットに組み込む", "自動化への対応を公表している機種です。", "/lineup/?cat=line")}
                    </li>
                    <li>
                      <p class="sec121__col-title">予算</p>
                      {L("100〜200万円", "価格を公開している機種から探せます。", q("price", "100〜200万円"))}
                      {L("200〜400万円", "価格帯は公開価格から当てはめています。", q("price", "200〜400万円"))}
                    </li>
                    <li class="sec121__divider" aria-hidden="true"></li>
                    <li>
                      <p class="sec121__col-title">補助金・税制</p>
                      {L("補助金・助成金の一覧", "省力化投資補助金など、締切と上限額つき。", "/subsidy/")}
                      {L("即時償却・税額控除", "買った年に経費にできる制度の違い。", "/subsidy/#kyoka")}
                    </li>
                    <li>
                      <p class="sec121__col-title">選び方ガイド</p>
                      {L("海外製を選ぶときのポイント", "修理・部品・保証・電源など、買う前に確かめたい8つの点。", "/articles/overseas/")}
                      {L("アルミ・銅は溶接できるか", "反射率の高い素材と機種の対応。", "/articles/#alcu")}
                    </li>
                    <li>
                      <p class="sec121__col-title">相談</p>
                      {L("機種選びの相談", "他社機も含めて、用途に合う機種を一緒に考えます。", "/contact/?type=choose")}
                      {L("テスト溶接・デモ", "運営元の取り扱い機で、仕上がりを確かめられます。", "/contact/?type=test")}
                      {L("補助金の活用相談", "運営元の活用支援チームが対応します。", "/contact/?type=subsidy")}
                    </li>
                  </ul>
                </div>
                <div class="sec121__panel" role="tabpanel" hidden data-sp-hidden>
                  <ul class="sec121__grid">
                    <li><p class="sec121__col-title">ハンドヘルド</p>{L("手で持って溶接する", "掲載機種の大半がこの方式です。", "/lineup/?cat=handheld")}</li>
                    <li><p class="sec121__col-title">据置・専用機</p>{L("決まった位置で溶接する", "真空チャンバーなどの専用機。", "/lineup/?cat=fixed")}</li>
                    <li><p class="sec121__col-title">ライン組込</p>{L("ロボット・ラインで使う", "自動化に組み込める機種。", "/lineup/?cat=line")}</li>
                  </ul>
                </div>
                <div class="sec121__panel" role="tabpanel" hidden data-sp-hidden>
                  <ul class="sec121__grid">
                    <li><p class="sec121__col-title">掲載の基準</p>{L("中立に並べる", "並び順と診断の順位は、取り扱いの有無に関係しません。", "/about/")}</li>
                    <li><p class="sec121__col-title">情報源</p>{L("メーカー公式が出典", "公開されていない項目は「非公開」と表示します。", "/about/")}</li>
                    <li><p class="sec121__col-title">運営者</p>{L("運営者情報", "レーザー溶接機の販売事業者が運営しています。", "/about/")}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li><a class="sec121__tab" href="/subsidy/"><span class="sec121__tab-label">補助金・税制</span></a></li>
        <li>
          <button class="sec121__tab" type="button" aria-expanded="false"><span class="sec121__tab-label">ガイド</span><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 6.5 9 12l5.5-5.5"/></svg></button>
          <div class="sec121__drop sec121__drop--plain">
            <div class="sec121__drop-box">
              <div class="sec121__body">
                <ul class="sec121__grid">
                  <li><p class="sec121__col-title">選び方</p>{L("選び方ガイド", "迷いやすいところから順に公開しています。", "/articles/")}</li>
                  <li><p class="sec121__col-title">製造国</p>{L("海外製を選ぶときのポイント", "国内の修理体制・部品・保証を確かめる。", "/articles/overseas/")}</li>
                  <li><p class="sec121__col-title">費用</p>{L("補助金・助成金・税制", "導入費を抑える制度をまとめています。", "/subsidy/")}</li>
                </ul>
              </div>
            </div>
          </div>
        </li>
      </ul>
      <div class="sec121__ctas">
        <a class="sec121__btn" href="/diagnosis/">5つの質問で選ぶ→</a>
        <a class="sec121__btn sec121__btn--sub" href="/lineup/">機種一覧→</a>
      </div>
      <a class="sec121__btn sec121__btn--dark" href="/contact/">相談する</a>
    </div>
  </div>
</header>''')

# ---------- ② ヒーロー ----------
block('SEC-163', '''
<section class="sec163" data-part="SEC-163">
  <div class="sec163__inner">
    <div class="sec163__content">
      <div class="sec163__contentInner">
        <div class="sec163__title">
          <p class="sec163__shoulder">メーカー<small>を問わず、</small><mark>公式情報で比べる</mark></p>
          <h1 class="sec163__copy">
            <span class="sec163__line">現場に合う<small>溶接機を、</small></span>
            <span class="sec163__line sec163__line--2">5つの質問<small>で。</small></span>
          </h1>
          <div class="sec163__kv sec163__kv--sp" aria-hidden="true">
            <div class="sec163__kvImg"><img class="rd-kv" src="/assets/images/workshop.jpg" alt="" width="1536" height="1024"><span class="sec163__kvLabel">溶接現場のイメージ（AI生成）</span></div>
          </div>
        </div>
        <ul class="sec163__buttons">
          <li class="sec163__btnWrap">
            <p class="sec163__tag">約1分・登録不要</p>
            <a class="sec163__btn" href="/diagnosis/">
              <span class="sec163__thumb sec163__thumb--doc" aria-hidden="true"></span>
              <span class="sec163__btnText">5つの質問で選ぶ</span>
              <svg class="sec163__icon sec163__icon--right" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.8 10h7.6M10.2 6.6 13.6 10l-3.4 3.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </li>
          <li class="sec163__btnWrap">
            <p class="sec163__tag">87機種を掲載</p>
            <a class="sec163__btn sec163__btn--dark" href="/lineup/">
              <span class="sec163__thumb sec163__thumb--screen" aria-hidden="true"></span>
              <span class="sec163__btnText">機種一覧を見る</span>
              <svg class="sec163__icon sec163__icon--right" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.8 10h7.6M10.2 6.6 13.6 10l-3.4 3.4" fill="none" stroke="var(--btn-dark)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <div class="sec163__kv sec163__kv--pc" aria-hidden="true">
      <div class="sec163__kvImg"><img class="rd-kv" src="/assets/images/workshop.jpg" alt="" width="1536" height="1024"><span class="sec163__kvLabel">溶接現場のイメージ（AI生成）</span></div>
    </div>
  </div>
</section>''')

# ---------- ③ 悩み ----------
def it082(pict, name, text, href):
    return f'''      <a class="sec082__item" href="{href}">
        <div class="sec082__image"><span class="rd-ill">{P(pict)}</span></div>
        <div class="sec082__wrap">
          <h3 class="sec082__name">{name}</h3>
          <p class="sec082__text">{text}</p>
        </div>
      </a>'''
block('SEC-082', f'''
<section class="sec082" data-part="SEC-082">
  <div class="sec082__inner">
    <h2 class="sec082__title">こんな悩みから、<br class="sec082__md">現場に合うレーザー溶接機を<br class="sec082__md">探せます。</h2>
    <div class="sec082__list">
{it082("user", "新人に任せたい", "熟練工がいなくても、新人がすぐ使える機種を", q("skill", "未経験可"))}
{it082("alcu", "アルミ・銅", "外注しているアルミ・銅の溶接を、自社で", q("material", "アルミ"))}
{it082("thick", "中厚・厚物を速く", "TIGで時間のかかる中厚板を、レーザーで", q("thickness", "3〜6mm"))}
{it082("yen", "予算を抑えたい", "100〜200万円で、補助金も使って導入", "/subsidy/")}
    </div>
  </div>
</section>''')

# ---------- ④ 探し方 ----------
def card044(photo, name, href):
    return f'''        <li class="sec044__card"><a class="sec044__link" href="{href}">
          <div class="sec044__img"><div class="sec044__ph"><img class="rd-photo" src="/assets/images/redesign/{photo}.jpg" alt="" loading="lazy"></div></div>
          <p class="sec044__name">{name}<svg class="sec044__arrow" viewBox="0 0 26 6" aria-hidden="true"><path d="M0 5.5h25L19.5.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></p>
        </a></li>'''
block('SEC-044', f'''
<section class="sec044" data-part="SEC-044">
  <div class="sec044__inner">
    <div class="sec044__wrap">
      <hgroup class="sec044__heading">
        <span class="sec044__en">SEARCH</span>
        <h2 class="sec044__ja">探し方を選ぶ</h2>
      </hgroup>
      <p class="sec044__text">質問に答えて絞り込む、一覧から条件で探す、2台を並べて比べる。目的に合う探し方を選べます。</p>
      <ul class="sec044__cards">
{card044("search-diagnosis", "質問で選ぶ", "/diagnosis/")}
{card044("search-lineup", "一覧で探す", "/lineup/")}
{card044("search-compare", "2台を比べる", "/diagnosis/#compare")}
{card044("search-subsidy", "補助金を知る", "/subsidy/")}
      </ul>
      <div class="sec044__btns">
        <a class="sec044__btn" href="/contact/">相談・問い合わせ<svg class="sec044__arrow" viewBox="0 0 26 6" aria-hidden="true"><path d="M0 5.5h25L19.5.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></a>
      </div>
    </div>
  </div>
</section>''')

# ---------- ⑤ 掲載機種（中身は products.json から） ----------
block('SEC-090', '''
<section class="sec090" data-part="SEC-090">
  <div class="sec090__inner">
    <h2 class="sec090__title"><a href="/lineup/">掲載機種（メーカーごとに1機種）</a></h2>
    <div class="sec090__wrap">
      <ul class="sec090__list" id="rdProducts"></ul>
    </div>
    <div class="sec090__more"><a href="/lineup/">87機種の一覧を見る</a></div>
  </div>
</section>''')

# ---------- ⑥ 中立性 ----------
def col116(text, pict, href):
    return f'<li class="sec116__col"><a class="sec116__item" href="{href}"><span class="sec116__text"><span>{text}</span></span><i class="sec116__icon" style="width:105px">{P(pict)}</i><span class="sec116__link">詳しくはこちら</span></a></li>'
block('SEC-116', f'''
<section class="sec116" data-part="SEC-116">
  <div class="sec116__head">
    <h2 class="sec116__label"><span class="sec116__badge" aria-hidden="true">{P("cert")}</span><span class="sec116__claim">掲載87機種・44メーカー*<br><span class="sec116__claim-note">*2026年10月10日時点</span></span></h2>
    <h2 class="sec116__what">このサイトについて</h2>
    <div class="sec116__container">
      <p class="sec116__btn-p"><a class="sec116__btn" href="/about/">掲載の基準と運営者を見る</a></p>
      <div class="sec116__more"><a href="/about/">情報源と更新の方針について</a></div>
    </div>
  </div>
  <div class="sec116__body">
    <h2 class="sec116__title">中立に比べられる理由</h2>
    <div class="sec116__reason">
      <div class="sec116__panels">
        <ul class="sec116__row">
          {col116("順位は<br>取り扱いと無関係<span class=\"sec116__note\">※1</span>", "compare", "/about/")}
          {col116("情報源は<br>メーカー公式", "doc", "/about/")}
          {col116("公開されていない<br>項目は「非公開」<span class=\"sec116__note\">※2</span>", "info", "/about/")}
          {col116("製造国・国内<br>サポートも表示", "factory", "/articles/overseas/")}
          {col116("実売価格は載せず<br>価格帯で比較", "yen", "/lineup/")}
          {col116("補助金・税制も<br>まとめて確認", "guide", "/subsidy/")}
        </ul>
      </div>
      <div class="sec116__toggle">
        <button class="sec116__toggle-btn" type="button" aria-expanded="false" aria-controls="sec116-terms">※ 1,2 掲載の基準はこちら<svg class="sec116__chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <ol class="sec116__toggle-body" id="sec116-terms" hidden>
          <li>機種一覧は出力の小さい順、診断は条件に合う度合いで並べます。<a href="/about/">運営元</a>が取り扱う機種かどうかは、並び順に使っていません。</li>
          <li>メーカーが公開していない項目は「非公開」と表示し、推測で埋めていません。</li>
        </ol>
      </div>
    </div>
  </div>
</section>''')

# ---------- ⑦ 診断の流れ ----------
block('SEC-142', f'''
<section class="sec142" data-part="SEC-142">
  <div class="sec142__bg" aria-hidden="true"></div>
  <div class="sec142__inner">
    <ul class="sec142__steps">
      <li class="sec142__step"><span class="sec142__num">1</span><p class="sec142__step-title">5つの質問に答える</p><span class="sec142__fig" aria-hidden="true">{P("diag")}</span></li>
      <li class="sec142__step"><span class="sec142__num">2</span><p class="sec142__step-title">候補5台を見る</p><span class="sec142__fig" aria-hidden="true">{P("lineup")}</span></li>
      <li class="sec142__step"><span class="sec142__num">3</span><p class="sec142__step-title">2台を並べて比べる</p><span class="sec142__fig" aria-hidden="true">{P("compare")}</span></li>
      <li class="sec142__step"><span class="sec142__num">4</span><p class="sec142__step-title">運営元に相談する</p><span class="sec142__fig" aria-hidden="true">{P("consult")}</span></li>
    </ul>
    <div class="sec142__body">
      <div class="sec142__head">
        <h2 class="sec142__title">このサイトでできること。</h2>
        <p class="sec142__en">ABOUT THIS WEBSITE</p>
      </div>
      <p class="sec142__text">素材・板厚・使う人・使う場所・予算の5つに答えると、メーカーの公開情報をもとに候補を5台に絞り込みます。公開されていない項目は「非公開」として扱い、推測では埋めません。</p>
      <div class="sec142__box">
        <p class="sec142__box-title">こんな方はぜひご利用ください。</p>
        <ul>
          <li class="sec142__check">どのメーカーの溶接機が自社に合うか分からない。</li>
          <li class="sec142__check">カタログの出力や板厚の読み方に自信がない。</li>
          <li class="sec142__check">補助金を使って導入費を抑えたい。</li>
        </ul>
      </div>
      <div class="sec142__btns">
        <a class="sec142__btn" href="/diagnosis/">5つの質問で選ぶ</a>
        <a class="sec142__btn" href="/lineup/">機種一覧から選ぶ</a>
      </div>
    </div>
  </div>
</section>''')

# ---------- ⑧ よくある質問 ----------
def qa(qt, *ps):
    return f'''      <dt class="sec097__q"><div class="sec097__q-text">{qt}</div></dt>
      <dd class="sec097__a">
        <div class="sec097__a-text">
          {"".join(f"<p>{p}</p>" for p in ps)}
        </div>
      </dd>'''
block('SEC-097', f'''
<section class="sec097" data-part="SEC-097">
  <div class="sec097__inner">
    <h2 class="sec097__title">よくある質問</h2>
    <dl class="sec097__list">
{qa("「溶け込み深さ」と「溶接できる板厚」は違いますか？", "違います。溶け込み深さは、溶ける深さの値です。", "メーカーの公表値が溶け込み深さの場合、本サイトでは板厚の区分には使わず、機種ページの「板厚の公表値」にそのまま載せています。")}
{qa("掲載の順番は、運営元の取り扱いで変わりますか？", "変わりません。機種一覧は出力の小さい順、診断は条件に合う度合いで並べています。", "運営元が取り扱う機種には「運営元で取り扱い」と表示しています。詳しくは<a href=\"/about/\">運営者情報・評価基準</a>をご覧ください。")}
{qa("中国製のレーザー溶接機は大丈夫ですか？", "製造国だけで良し悪しは決まりません。国内での修理体制・交換部品・保証・電源などを、買う前に確かめることが大切です。", "確かめ方は<a href=\"/articles/overseas/\">海外製を選ぶときのポイント</a>にまとめています。")}
{qa("補助金は使えますか？", "中小企業省力化投資補助金（カタログ注文型）に「ファイバーレーザー溶接機」のカテゴリがあります（2026年10月10日時点）。", "機種がカタログに登録されているかなどの条件があります。<a href=\"/subsidy/\">補助金・助成金・税制の一覧</a>をご覧ください。")}
{qa("価格が「非公開」の機種は、どう調べればよいですか？", "メーカーや販売店に問い合わせてください。", "運営元が取り扱う機種は、本サイトから<a href=\"/contact/?type=quote\">見積もりを相談</a>できます。")}
    </dl>
  </div>
</section>''')

# ---------- ⑨ 選び方ガイド ----------
def doc(name, desc, href, label, photo):
    return f'''      <li class="sec009__item">
        <a class="sec009__thumb" href="{href}">
          <span class="sec009__ph" aria-hidden="true"><img class="rd-photo" src="/assets/images/redesign/{photo}.jpg" alt="" loading="lazy"></span>
          <span class="sec009__veil" aria-hidden="true"></span>
        </a>
        <div class="sec009__body">
          <div class="sec009__text">
            <h3 class="sec009__name">{name}</h3>
            <p class="sec009__desc">{desc}</p>
          </div>
          <a class="sec009__dl" href="{href}">
            <svg class="sec009__dl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4"/></svg>
            <span class="sec009__dl-label sec009__dl-label--pc">{label}</span>
            <span class="sec009__dl-label sec009__dl-label--sp">{label}</span>
          </a>
        </div>
      </li>'''
block('SEC-009', f'''
<section class="sec009" data-part="SEC-009">
  <div class="sec009__inner">
    <div class="sec009__head">
      <div class="sec009__titles">
        <p class="sec009__en">Guide</p>
        <h2 class="sec009__title">選び方ガイド</h2>
      </div>
      <p class="sec009__lead">導入前に迷いやすいところを、公的機関やメーカーの公開情報をもとにまとめています。</p>
    </div>
    <ul class="sec009__list">
{doc("海外製（中国製など）を選ぶときのポイント", "国内の修理体制・交換部品・保証・電源など、買う前に確かめたい8つの点をまとめました。", "/articles/overseas/", "記事を読む", "guide-overseas")}
{doc("補助金・助成金・税制", "省力化投資補助金や即時償却など、導入費を抑える制度を締切と上限額つきで整理しました。", "/subsidy/", "一覧を見る", "guide-subsidy")}
{doc("TIG溶接とレーザー溶接の違い", "仕上がり・ひずみ・習得にかかる時間・設備の大きさを並べて整理します（公開準備中）。", "/articles/#tig", "内容を見る", "guide-tig")}
    </ul>
    <a class="sec009__more" href="/articles/">
      <span class="sec009__more-in">
        <span class="sec009__more-label">選び方ガイドをすべて見る</span>
        <span class="sec009__circle" aria-hidden="true">
          <span class="sec009__arrow sec009__arrow--in"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M3 8h9.5M8.5 4l4 4-4 4"/></svg></span>
          <span class="sec009__arrow"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M3 8h9.5M8.5 4l4 4-4 4"/></svg></span>
        </span>
      </span>
    </a>
  </div>
</section>''')

# ---------- ⑩ 相談の案内 ----------
block('SEC-135', f'''
<section class="sec135" data-part="SEC-135">
  <div class="sec135__inner">
    <h2 class="sec135__title">機種選びも見積もりも、<br class="sec135__br">運営元に相談できます</h2>
    <ul class="sec135__list">
      <li class="sec135__item">
        <div class="sec135__ph sec135__ph--doc" role="img" aria-label="機種選びの相談"><img class="rd-photo" src="/assets/images/redesign/consult-choose.jpg" alt="" loading="lazy"></div>
        <a class="sec135__btn sec135__btn--line" href="/contact/?type=choose"><small>他社機も含めて比べたい方</small>機種選びを相談する</a>
      </li>
      <li class="sec135__item">
        <div class="sec135__ph" role="img" aria-label="見積もり・テスト溶接の相談"><img class="rd-photo" src="/assets/images/redesign/consult-test.jpg" alt="" loading="lazy"></div>
        <a class="sec135__btn sec135__btn--fill" href="/contact/?type=quote"><small>運営元の取り扱い機を検討中の方</small>見積もり・テスト溶接を相談<span class="sec135__badge">デモ可</span></a>
      </li>
    </ul>
    <div class="sec135__others">
      <h3 class="sec135__sub">補助金の活用も相談できます</h3>
      <p class="sec135__tel">
        <svg class="sec135__tel-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <circle cx="32" cy="32" r="30"/>
          <path d="M22.5 15.5l5.2-1.6 4.4 9.6-3.6 3c1.4 4.4 4.2 8.8 7.8 12l4-2.2 7.4 7.6-3.6 4.4c-9.2 1.2-23.4-14.8-21.6-32.8z" stroke-linejoin="round"/>
        </svg>
        フォームは24時間受付<span class="sec135__hours">電話番号は<span class="sec135__hours-br"></span>掲載準備中</span>
      </p>
      <p class="sec135__contact">
        <a href="/contact/?type=subsidy"><svg class="sec135__mail" viewBox="0 0 24 24" fill="none" stroke="#313131" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14"/><path d="M2.5 5l9.5 8 9.5-8"/></svg>補助金の活用を相談する</a>
      </p>
    </div>
  </div>
</section>''')

# ---------- ⑪ フッター ----------
rep('<div class="sec161__logo" data-sec161-aos data-delay="200"><span>ロゴ 306×57</span></div>', '<div class="sec161__logo" data-sec161-aos data-delay="200"><span class="rd-logo">レーザー溶接機 比較・選定</span></div>')
rep('<p>事業に関するご相談や、<br>ミホングループに関する<br class="sec161__brSp">お問い合わせはこちらへ</p>', '<p>機種選び・見積もり・<br>テスト溶接・補助金の<br class="sec161__brSp">ご相談はこちらへ</p>')
rep('<a class="sec161__btn" href="#" data-sec161-aos data-delay="400">', '<a class="sec161__btn" href="/contact/" data-sec161-aos data-delay="400">')
rep('<span class="sec161__btnText">お問い合わせ</span>', '<span class="sec161__btnText">相談・問い合わせ</span>')
items = [("5つの質問で選ぶ", "/diagnosis/"), ("機種一覧", "/lineup/"), ("2台を比較", "/diagnosis/#compare"), ("選び方ガイド", "/articles/"), ("海外製を選ぶときのポイント", "/articles/overseas/"), ("補助金・税制", "/subsidy/"), ("相談・問い合わせ", "/contact/"), ("運営者情報・評価基準", "/about/"), ("トップ", "/redesign/")]
track = "\n".join(f'              <li class="sec161__item"><a href="{h}"><span class="rd-link">{t}</span></a></li>' for t, h in items)
s = re.sub(r'(<ul class="sec161__track">\n)(.*?)(\n\s*</ul>)', lambda m: m.group(1) + track + m.group(3), s, count=1, flags=re.S)
s = re.sub(r'(<div class="sec161__sns">\s*<ul>)(.*?)(</ul>)', lambda m: m.group(1) + '\n            <li><a href="/about/" class="rd-sns">掲載内容はメーカー公開情報に基づきます</a></li>\n          ' + m.group(3), s, count=1, flags=re.S)
rep('<span class="sec161__photoLabel" aria-hidden="true">写真 背景（空と社屋）</span>', '')
rep('<div class="sec161__company">株式会社ミホン</div>', '<div class="sec161__company">レーザー溶接機 比較・選定</div>')
rep('<div class="sec161__address">〒000-0000<br>〇〇〇県〇〇市〇〇区見本町南1-2-3<br>TEL : 0120-000-000</div>', '<div class="sec161__address">運営：レーザー溶接機の販売事業者<br>（詳しくは運営者情報をご覧ください）</div>')
rep('<li><a href="#">個人情報保護方針</a></li>', '<li><a href="/about/">運営者情報・評価基準</a></li>')
rep('<li><a href="#">サイトマップ</a></li>', '<li><a href="/articles/">選び方ガイド</a></li>')
rep('<li><a href="#">ハラスメント防止</a></li>', '<li><a href="/contact/">相談・問い合わせ</a></li>')
rep('<small class="sec161__copyright">© ACME Co.,Ltd. All rights Reserved.</small>', '<small class="sec161__copyright">© 2026 レーザー溶接機 比較・選定</small>')

# ---------- 差し込んだ中身の見た目（スロットの寸法は変えない） ----------
extra = '''
/* ===== 案件の中身をスロットに収める（2026-10-11） ===== */
.rd-pict { width: 48px; height: 48px; fill: currentColor; color: #0E7F82; display: block; }
.sec121__logo-ph { width: auto; height: 30px; gap: 6px; border: 0; padding: 0; color: #313131; font-size: 13px; font-weight: 700; line-height: 1.15; letter-spacing: 0; text-align: left; }
.sec121__logo-ph .rd-pict { width: 28px; height: 28px; }
@media (max-width: 767px) { .sec121__logo-ph { width: auto; height: 28px; font-size: 12px; } }
.sec163__kvImg { overflow: hidden; border-radius: 0; }
.rd-kv { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rd-ill { display: grid; place-items: center; width: 132px; height: 132px; border-radius: 50%; background: var(--ill-fill); }
.rd-ill .rd-pict { width: 64px; height: 64px; color: var(--ill-line); }
@media (max-width: 767px) { .rd-ill { width: 88px; height: 88px; } .rd-ill .rd-pict { width: 44px; height: 44px; } }
.sec044__ph .rd-pict { width: 64px; height: 64px; color: #0B6A6C; }
@media (max-width: 767px) { .sec044__ph .rd-pict { width: 40px; height: 40px; } }
.sec090__img { overflow: hidden; background: #fff; border: 1px solid #E6E9EC; }
.sec090__img img { width: 100%; height: 100%; object-fit: contain; }
.sec090__img .rd-pict { width: 44px; height: 44px; color: #0E7F82; }
.sec116__badge { padding-top: 0; display: grid; place-items: center; }
.sec116__badge .rd-pict { width: 40px; height: 40px; color: #313131; }
.sec116__icon { padding-top: 0; display: grid; place-items: center; }
.sec116__icon .rd-pict { width: 56px; height: 56px; }
.sec142__fig .rd-pict { width: 56px; height: 56px; }
@media (max-width: 767px) { .sec142__fig .rd-pict { width: 40px; height: 40px; } }
.rd-cover { padding: 0 12%; font-size: 22px; font-weight: 700; line-height: 1.5; color: #0B6A6C; text-align: center; }
@media (max-width: 767px) { .rd-cover { font-size: 16px; } }
.sec135__ph { align-items: center; padding-bottom: 0; }
.sec135__ph .rd-pict { width: 88px; height: 88px; position: relative; }
.rd-logo { border: 0 !important; color: #fff !important; font-size: 20px !important; font-weight: 700 !important; letter-spacing: .04em !important; }
.sec161__item .rd-link { border: 0; padding: 0 4px; color: #313131; font-size: 14px; font-weight: 700; }
.rd-sns { color: #fff; font-size: 13px; text-decoration: none; }
.sec161__item .rd-link { color: #fff; }
.rd-logo { color: #313131 !important; }
.rd-cover { text-wrap: balance; }
.sec142__bg { display: none; }
.sec142 { --ph-fig: #E3F4F4; --arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 25.239 9.978'%3E%3Crect fill='%230E7F82' y='4.011' width='13.793' height='1.859'/%3E%3Cpolygon fill='%230E7F82' points='14.722 0 25.239 4.989 14.722 9.978 14.722 0'/%3E%3C/svg%3E"); }
.sec082__text { text-wrap: balance; }
/* --- 崩れの修正（2026-10-11） ---
   1) 上部の帯（SEC-077）とヘッダー（SEC-121）がどちらも上に貼り付き、スクロールすると帯がヘッダーと本文に重なっていた。
      帯は先頭で流れて消えるようにし、上に残るのはヘッダーだけにする */
.sec077 { position: relative; top: auto; }
/* 2) 掲載機種カード: 機種名・説明が右の写真の下に潜り込んでいた（元パーツより文字が長い）。写真の幅だけ右をあける */
.sec090__name, .sec090__price, .sec090__text { padding-right: 122px; }
.sec090__name { overflow-wrap: anywhere; }
@media (max-width:480px) { .sec090__name, .sec090__price, .sec090__text { padding-right: 80px; } }
/* 3) フッターのロゴ: 枠（306×57 / SP 195幅）に1行で収める */
.rd-logo { white-space: nowrap; font-size: 20px !important; line-height: 1 !important; }
@media (max-width: 767px) { .rd-logo { font-size: 14px !important; } }
/* 4) 写真を入れたスロット: 枠いっぱいに切り抜く */
.rd-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.sec009__ph, .sec135__ph { position: relative; overflow: hidden; }
.sec135__ph--doc .rd-photo { inset: 4% 22% 16% 4%; width: auto; height: auto; }
/* フッターの写真: 1100px 未満は .sec161__contents、1100px 以上は .sec161__main が背景を持つ（元パーツの切り替えに合わせる） */
.sec161__contents { background: linear-gradient(160deg, rgba(20,163,166,.88) 0%, rgba(14,127,130,.86) 45%, rgba(11,106,108,.94) 100%), url("/assets/images/redesign/footer-factory.jpg") center / cover no-repeat; }
@media only screen and (min-width: 1100px) {
  .sec161__contents { background: none; }
  .sec161__main { background: linear-gradient(160deg, rgba(20,163,166,.88) 0%, rgba(14,127,130,.86) 45%, rgba(11,106,108,.94) 100%), url("/assets/images/redesign/footer-factory.jpg") center / cover no-repeat; }
}
.sec135__ph--doc .rd-photo { object-position: 72% 30%; }
/* 5) 探し方のカード: 元パーツは5列の枠に並べる作り。4枚だと右に1列ぶん空きが出て左に寄るので、4列にする */
@media (min-width: 768px) { .sec044__cards { grid-template-columns: repeat(4, 1fr); } }
/* 6) 768〜1099px（タブレット）: 元パーツの PC 寸法のままだと詰まる所を、割合で収める */
@media (min-width: 768px) and (max-width: 1099px) {
  .sec082__list { gap: 40px 20px; padding: 0 24px; }
  .sec082__item { width: calc((100% - 60px) / 4); }
  .sec090__list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
/* 7) 375px 未満: ヒーローのコピー（幅320px固定）とボタン（300px＋余白）が画面からはみ出していた（元パーツも同じ）。幅に合わせて縮める */
@media (max-width: 374px) {
  .sec163 { padding-left: 10px; padding-right: 10px; }
  .sec163__copy { width: 100%; }
  .sec163__line { font-size: 44px; height: 46px; line-height: 46px; }
  .sec163__line--2 { font-size: 46px; height: 48px; line-height: 48px; }
  .sec163__buttons { grid-template-columns: 100%; max-width: 100%; margin: 12px 0 0; }
  .sec163__content, .sec163__contentInner, .sec163__title { min-width: 0; width: 100%; }
  .sec163__kv { width: 100%; }
}
'''
rep('</style>\n</head>', extra + '</style>\n</head>')

# ---------- 掲載機種と検索のスクリプト ----------
script = '''<script type="module">
// 掲載機種: 今のトップと同じ選び方（メーカーごとに1機種。出力・対応素材のうち公開されている項目が多い順）
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const products = (await fetch("/data/products.json").then((r) => r.json())).filter((p) => p.is_published !== false);
const known = (p) => (p.output_w ? 1 : 0) + (p.tags.material.length ? 1 : 0);
const byMaker = new Map();
for (const p of products) if (!byMaker.has(p.maker_slug) || known(p) > known(byMaker.get(p.maker_slug))) byMaker.set(p.maker_slug, p);
const picks = [...byMaker.values()].sort((a, b) => known(b) - known(a)).slice(0, 24);
const maker = (n) => String(n).replace(/（.*$/, "").replace(/株式会社|合同会社/g, "").trim();
const kind = (p) => (/^ハンド/.test(p.method || "") ? "ハンドヘルド" : /ロボット|ライン/.test(p.method || "") ? "ライン組込" : /据置|真空|チャンバー/.test(p.method || "") ? "据置・専用機" : "レーザー溶接機");
document.getElementById("rdProducts").innerHTML = picks.map((p) => `<li class="sec090__item"><a class="sec090__link" href="/products/${esc(p.maker_slug)}-${esc(p.model_slug)}/">
  <span class="sec090__label">${esc(kind(p))}</span>${p.handled_by_operator ? '<span class="sec090__label sec090__label--fill">運営元の取扱</span>' : ""}
  <p class="sec090__name">${esc(p.name)}</p>
  <p class="sec090__price">${p.output_w ? `出力<span class="sec090__val">${(p.output_w / 1000).toFixed(p.output_w % 1000 ? (p.output_w % 100 ? 2 : 1) : 1)}</span>kW` : '<span class="sec090__sub">出力 非公開</span>'}</p>
  <p class="sec090__text">${esc(maker(p.maker_name))}<br>価格帯 ${esc(p.tags.price[0] || (p.handled_by_operator ? "お問い合わせ" : "非公開"))}</p>
  <p class="sec090__img">${p.image && !p.image.includes("placeholder") ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<svg class="rd-pict" viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/icons.svg#i-handheld"></use></svg>'}</p>
</a></li>`).join("");
// スマホのメニュー: ヘッダーの下端の位置から開く（ページ先頭で帯が見えているときに、ヘッダーと重ならないように）
const rdHead = document.querySelector(".sec121"), rdMenu = document.querySelector(".sec121__menu");
document.querySelector(".sec121__burger")?.addEventListener("click", () => { if (rdMenu) rdMenu.style.top = Math.max(0, rdHead.getBoundingClientRect().bottom) + "px"; });
// ヘッダーの検索: Enter で機種一覧のキーワード検索へ
document.querySelector("[data-rd-search]")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value.trim()) location.href = "/lineup/?q=" + encodeURIComponent(e.target.value.trim()); });
</script>
</body>'''
rep('</body>', script)
open(dst, 'w', encoding='utf-8').write(s)
print('ok', len(s))

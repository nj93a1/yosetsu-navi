// 選び方ガイド。記事本文は未公開のため、各テーマで「扱う内容」と、いま見られる機種一覧への近道（件数は実データから）を出す。
import { mountChrome, icon } from "./partials.js?v=16";

mountChrome({ current: "/articles/" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const products = (await fetch("/data/products.json").then((r) => r.json())).filter((p) => p.is_published !== false);
const count = (fn) => products.filter(fn).length;
const has = (axis, tag) => (p) => (p.tags[axis] || []).includes(tag);

const GUIDES = [
  { id: "overseas", ic: "guide", title: "海外製（中国製など）を選ぶときのポイント", lead: "国内の修理体制・交換部品・保証・安全表示・電源・公表値の読み方・補助金の条件など、買う前に確かめたい8つの点をまとめました。",
    href: "/articles/overseas/", links: [["記事を読む", "/articles/overseas/", null], ["国内での修理・サポートを公式に記載している機種", "/lineup/?support=" + encodeURIComponent("国内で修理・サポート"), count((p) => !!p.origin?.service)]] },
  { id: "tig", ic: "compare", title: "TIG溶接とレーザー溶接の違い", lead: "板金・ステンレスの現場でどちらを選ぶか。仕上がり、ひずみ、習得にかかる時間、設備の大きさを並べて整理します。",
    links: [["5つの質問で候補を絞る", "/diagnosis/", null]] },
  { id: "method", ic: "handheld", title: "ハンドヘルド型と据置型・ライン組込の違い", lead: "方式ごとに向いている仕事と向いていない仕事を、掲載機種の公開情報をもとに整理します。",
    links: [["ハンドヘルドの機種", "/lineup/?cat=handheld", null], ["ライン組込に対応する機種", "/lineup/?cat=line", null]] },
  { id: "skill", ic: "user", title: "未経験の新人でも扱える機種の見分け方", lead: "メーカーが「初心者でも扱える」と公表している機種と、その根拠になっている機能を整理します。",
    links: [["未経験可と公表されている機種", "/lineup/?skill=" + encodeURIComponent("未経験可"), count(has("skill", "未経験可"))]] },
  { id: "alcu", ic: "alcu", title: "アルミ・銅はレーザーで溶接できるか", lead: "反射率の高い素材について、対応・非対応をメーカーが明記している機種を整理します。",
    links: [["アルミに対応する機種", "/lineup/?material=" + encodeURIComponent("アルミ"), count(has("material", "アルミ"))], ["銅に対応する機種", "/lineup/?material=" + encodeURIComponent("銅"), count(has("material", "銅"))]] },
];

document.getElementById("guide").innerHTML = GUIDES.map((g) => `
  <li class="guide__item" id="${g.id}">
    <div class="guide__head">${icon(g.ic, "ico guide__ico")}<div>${g.href ? `<span class="chip">公開中</span>` : `<span class="chip chip--pending">公開準備中</span>`}<h2>${esc(g.title)}</h2></div></div>
    <p class="guide__lead">${esc(g.lead)}</p>
    <ul class="guide__links">${g.links.map(([label, href, n]) => `<li><a href="${href}"><span>${esc(label)}${n != null ? `<b>${n}機種</b>` : ""}</span>${icon("chevron", "ico ico--chev")}</a></li>`).join("")}</ul>
  </li>`).join("");
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();

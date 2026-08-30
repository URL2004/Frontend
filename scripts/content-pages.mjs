// 정적 콘텐츠 페이지 생성기(2026-08-28 Phase 4) — 블로그 허브(/blog)·기사(/blog/{slug})·
// 입력 템플릿(/templates/{genre}/{subtype})을 빌드 타임에 독립 HTML로 굽는다.
// SPA를 부팅하지 않는 완결 문서라 크롤러·직접 방문 모두 같은 본문을 본다(noscript 아님).
// Vercel은 rewrite보다 정적 파일을 우선하고, dev는 vite.config 미들웨어가 같은 파일을 서빙한다.
// ★내비 원칙(2026-08-28 사장님): 콘텐츠 페이지의 헤더·푸터는 독립 세계 안(홈=랜딩·블로그·시작 CTA)만
//   가리킨다 — 가이드·FAQ 같은 앱 셸 라우트로 새지 않는다(본문 내 요금 링크는 전환 경로라 예외).

import fs from 'node:fs/promises';
import path from 'node:path';
import { SITE, OG_IMAGE } from './route-meta.mjs';
import { BLOG_ARTICLES } from './blog-data.mjs';
import { TEMPLATE_PAGES } from './templates-data.mjs';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

// 매거진 스타일(2026-08-28 재설계) — 허브는 1180px 피처 그리드, 기사는 820px 판형.
// 앱 CSS에 의존하지 않는 완결 스타일. 라이트·다크 모두 토큰으로 명시.
const STYLE = `
:root{--paper:#faf9fc;--ink:#211f2e;--ink2:#46445c;--muted:#8482a0;--accent:#5a5bd8;--deep:#4443c0;--soft:#efeefb;--line:#e7e5f0;--card:#fff;--shadow:0 1px 2px rgba(33,31,46,.04),0 8px 28px rgba(90,91,216,.07)}
@media (prefers-color-scheme:dark){:root{--paper:#141320;--ink:#eceaf6;--ink2:#c3c1d8;--muted:#8d8ba8;--accent:#8a8cf0;--deep:#b4b6ff;--soft:#232238;--line:#2b2a3f;--card:#1c1b2b;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 28px rgba(0,0,0,.35)}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Noto Sans KR','Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.8;font-size:16px;word-break:keep-all;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:0 24px}
.wrap.wide{max-width:1180px}
a{color:var(--deep)}
/* ── 상단 바: 독립 세계 안만 가리킨다(홈·블로그·CTA) ── */
header.site{position:sticky;top:0;z-index:10;border-bottom:1px solid var(--line);background:var(--card)}
header.site .bar{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:22px;padding:13px 24px}
header.site a{color:var(--ink2);text-decoration:none;font-size:14px;font-weight:500}
header.site a.brand{font-weight:800;color:var(--ink);font-size:16.5px;letter-spacing:-.01em}
header.site a.brand em{font-style:normal;color:var(--accent)}
header.site .sp{margin-left:auto}
header.site a.cta{background:var(--accent);color:#fff;border-radius:999px;padding:8px 18px;font-weight:700;font-size:13.5px}
header.site a.cta:hover{background:var(--deep)}
nav.crumb{font-size:13px;color:var(--muted);padding:26px 0 0}
nav.crumb a{color:var(--muted);text-decoration:none}
nav.crumb a:hover{color:var(--deep)}
/* ── 기사 판형 ── */
article{padding:6px 0 48px}
.byline .cat{color:var(--accent);font-weight:700}
h1{font-size:clamp(27px,4.6vw,38px);font-weight:800;line-height:1.28;letter-spacing:-.015em;margin:10px 0 14px;word-break:keep-all}
.byline{display:flex;flex-wrap:wrap;gap:6px 0;font-size:13px;color:var(--muted);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 0;margin:18px 0 4px}
.byline span+span::before{content:'·';margin:0 10px;color:var(--line)}
.lead{font-size:18px;line-height:1.75;color:var(--ink2);margin:26px 0 30px}
.lead b{color:var(--ink)}
h2{font-size:22px;font-weight:800;letter-spacing:-.01em;margin:44px 0 12px;padding-top:26px;border-top:1px solid var(--line);line-height:1.35}
h3{font-size:16.5px;font-weight:700;margin:26px 0 8px}
p{margin:13px 0;color:var(--ink2)}
article b,article strong{color:var(--ink)}
ul,ol{margin:13px 0;padding-left:22px;color:var(--ink2)}
li{margin:8px 0}
li::marker{color:var(--accent)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:var(--shadow);margin:20px 0}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th{font-size:12.5px;letter-spacing:.05em;color:var(--muted);text-align:left;padding:12px 16px;border-bottom:2px solid var(--line);white-space:nowrap;background:var(--soft)}
td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink2)}
tr:last-child td{border-bottom:0}
.num{font-variant-numeric:tabular-nums}
.note{font-size:14px;color:var(--ink2);background:var(--soft);border-radius:12px;padding:14px 18px;margin:20px 0}
.check{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:10px 22px;margin:20px 0}
.cta-box{margin:42px 0 8px;padding:26px 28px;border-radius:16px;background:var(--soft);border:1px solid var(--line)}
.cta-box strong{display:block;font-size:18px;margin-bottom:6px;letter-spacing:-.01em}
.cta-box p{margin:4px 0 16px;font-size:14.5px}
.cta-box a{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:11px;padding:12px 22px;font-size:15px}
.cta-box a:hover{background:var(--deep)}
.related{border-top:1px solid var(--line);padding:28px 0 8px;margin-top:34px}
.related h2{margin:0 0 10px;padding:0;border:0;font-size:16px;letter-spacing:.02em}
.related a{display:block;color:var(--deep);text-decoration:none;padding:8px 0;font-size:15px;font-weight:500}
.related a:hover{text-decoration:underline;text-underline-offset:4px}
footer.site{border-top:1px solid var(--line);margin-top:34px;background:var(--card)}
footer.site .bar{max-width:1180px;margin:0 auto;padding:24px;font-size:12.5px;color:var(--muted);line-height:1.7}
footer.site a{color:var(--muted)}
img{max-width:100%}
/* ── 허브: 매거진 그리드 ── */
.hub-head{padding:44px 0 8px}
.hub-head h1{margin:0 0 12px}
.hub-head p{max-width:56ch;font-size:16.5px;color:var(--ink2);margin:0}
.hub-sec{display:flex;align-items:baseline;gap:14px;margin:44px 0 16px}
.hub-sec strong{font-size:14px;font-weight:800;letter-spacing:.12em;color:var(--ink)}
.hub-sec i{flex:1;height:1px;background:var(--line)}
.feature-row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:20px}
@media (max-width:860px){.feature-row{grid-template-columns:1fr}}
/* 리드 카드: 밝은 일러스트 위 오버레이 텍스트는 대비 미달 → 이미지/텍스트 분리형 */
a.feat{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:18px;overflow:hidden;text-decoration:none;color:var(--ink);background:var(--card);box-shadow:var(--shadow);transition:border-color .16s}
a.feat:hover{border-color:var(--accent)}
a.feat img.cover{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;display:block;border-bottom:1px solid var(--line)}
a.feat .feat-body{display:flex;flex-direction:column;gap:10px;padding:24px 28px 26px;flex:1}
a.feat strong{font-size:clamp(21px,2.4vw,26px);font-weight:800;line-height:1.35;letter-spacing:-.012em;word-break:keep-all}
a.feat p{margin:0;color:var(--ink2);font-size:15px;line-height:1.7;max-width:62ch}
a.feat .meta{margin-top:auto;padding-top:8px;font-size:12.5px;color:var(--muted)}
/* 사이드: 세로 카드에 와이드 이미지를 욱여넣지 않는다 — 썸네일 가로형 행(비율 고정, 텍스트 우선) */
.feat-side{display:flex;flex-direction:column;gap:20px;justify-content:space-between}
.hub-row{display:flex;gap:18px;align-items:stretch;flex:1;border:1px solid var(--line);border-radius:16px;background:var(--card);padding:18px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:border-color .16s}
.hub-row:hover{border-color:var(--accent)}
.hub-row:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.hub-row .txt{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;flex:1}
.hub-row strong{font-size:17.5px;font-weight:700;line-height:1.45;letter-spacing:-.01em;word-break:keep-all}
.hub-row p{margin:0;font-size:14px;color:var(--ink2);line-height:1.65;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hub-row .meta{margin-top:2px;font-size:12.5px;color:var(--muted)}
.hub-row img.cover{flex:0 0 116px;width:116px;height:116px;align-self:center;object-fit:cover;border-radius:12px}
@media (max-width:520px){.hub-row img.cover{flex-basis:88px;width:88px;height:88px}}
/* 그리드: 16:9 이미지로 본문 공간 확보, 제목이 이끌고 설명이 받친다 */
.hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
.hub-card{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:16px;background:var(--card);text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:transform .16s,border-color .16s;overflow:hidden}
.hub-card img.cover{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;display:block;border-bottom:1px solid var(--line)}
.hub-card .body{display:flex;flex-direction:column;gap:8px;padding:18px 20px 20px;flex:1}
.hub-card strong{font-size:18px;font-weight:700;line-height:1.42;letter-spacing:-.012em;word-break:keep-all}
.hub-card p{margin:0;font-size:14px;color:var(--ink2);line-height:1.68;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hub-card .meta{margin-top:auto;padding-top:10px;font-size:12.5px;color:var(--muted)}
.hub-card:hover{transform:translateY(-2px);border-color:var(--accent)}
.article-cover{width:100%;height:auto;aspect-ratio:2.4/1;object-fit:cover;border-radius:16px;box-shadow:var(--shadow);margin:22px 0 4px;display:block}
::selection{background:var(--accent);color:#fff}
.hub-card:focus-visible,a.feat:focus-visible,.hub-row:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.tpl-strip{border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:var(--shadow);padding:26px 28px;margin:8px 0 0}
.tpl-strip h2{margin:0 0 4px;padding:0;border:0;font-size:19px}
.tpl-strip>p{margin:0 0 16px;font-size:14px;color:var(--muted)}
.tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.tpl-grid a{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink2);font-size:14px;font-weight:500;border:1px solid var(--line);border-radius:11px;padding:12px 15px;transition:border-color .16s,color .16s}
.tpl-grid a::before{content:'✎';color:var(--accent);font-size:15px}
.tpl-grid a:hover{border-color:var(--accent);color:var(--ink)}
.hub-cta{display:flex;flex-wrap:wrap;align-items:center;gap:14px 26px;margin:40px 0 52px;padding:26px 30px;border-radius:18px;background:linear-gradient(120deg,var(--soft),var(--card));border:1px solid var(--line)}
.hub-cta div{flex:1 1 380px}
.hub-cta strong{display:block;font-size:18px;margin-bottom:4px}
.hub-cta p{margin:0;font-size:14px;color:var(--muted)}
.hub-cta a{background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:11px;padding:13px 24px;font-size:15px;white-space:nowrap}
.hub-cta a:hover{background:var(--deep)}
@media (prefers-reduced-motion:reduce){.hub-card,.hub-row,.tpl-grid a{transition:none}.hub-card:hover{transform:none}}
`;

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap">';

// 기사 커버(ima2-gen 산출 일러스트 → assets/img/blog/{slug}.webp) — 슬러그와 파일명이 1:1
function coverOf(slug) {
  return `/assets/img/blog/${slug}.webp`;
}

// 로그인 적응형 내비(2026-08-29 사장님): 가입 전 = 가입 CTA, 가입 후 = "작업실 열기".
// 앱은 setPersistence(browserLocalPersistence)라 인증 상태가 localStorage에 있다(app-module.js:43).
// localStorage 우선 확인 + indexedDB 폴백(기본 persistence로 바뀔 경우 대비) — 실패 시 게스트 문구 유지.
const AUTH_ADAPT = `<script>
(function () {
  function member() {
    document.querySelectorAll('[data-member-label]').forEach(function (el) { el.textContent = el.getAttribute('data-member-label'); });
    document.querySelectorAll('[data-member-text]').forEach(function (el) { el.textContent = el.getAttribute('data-member-text'); });
  }
  function fromLocalStorage() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('firebase:authUser:') === 0) {
          var v = null;
          try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
          if (v && v.uid) { member(); return true; }
        }
      }
    } catch (e) { /* 게스트 문구 유지 */ }
    return false;
  }
  function fromIndexedDb() {
    try {
      var req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = function () {
        try {
          var db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return;
          var g = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
          g.onsuccess = function () {
            var rows = g.result || [];
            for (var i = 0; i < rows.length; i++) {
              var key = rows[i] && rows[i].fbase_key;
              if (key && key.indexOf('authUser') >= 0 && rows[i].value) { member(); return; }
            }
          };
        } catch (e) { /* 게스트 문구 유지 */ }
      };
    } catch (e) { /* 게스트 문구 유지 */ }
  }
  if (!fromLocalStorage()) fromIndexedDb();
})();
</script>`;

function pageShell({ title, description, url, breadcrumbs, bodyHtml, ldBlocks, wide, image = OG_IMAGE }) {
  const crumbHtml = breadcrumbs
    .map((b, i) => (i === breadcrumbs.length - 1 ? esc(b.name) : `<a href="${b.url}">${esc(b.name)}</a>`))
    .join(' › ');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon-32x32.png">
${FONTS}
${ldBlocks.join('\n')}
<style>${STYLE}</style>
</head>
<body>
<header class="site"><div class="bar">
<a class="brand" href="/">교수님 <em>피하기</em></a>
<a href="/blog">연구노트</a>
<span class="sp"></span>
<a class="cta" href="/" data-member-label="작업실 열기">무료로 시작</a>
</div></header>
<div class="wrap${wide ? ' wide' : ''}">
<nav class="crumb">${crumbHtml}</nav>
${bodyHtml}
</div>
<footer class="site"><div class="bar">
교수님 피하기 · 지피코리아(gpkorea) — AI 초안의 문체 신호를 확인하고 원문의 뜻·장르·사실을 지키며 다듬는 도구입니다.
AI 감지 결과와 외부 검사 점수는 참고 신호이며 보장값이 아닙니다. <a href="/" data-member-label="작업실로 돌아가기">서비스 홈</a> · <a href="/blog">연구노트</a>
</div></footer>
${AUTH_ADAPT}
</body>
</html>
`;
}

function relatedBlock(slugs, all) {
  const items = (slugs || [])
    .map((s) => all.find((a) => a.slug === s))
    .filter(Boolean)
    .map((a) => `<a href="/blog/${a.slug}">${esc(a.title)} →</a>`);
  if (!items.length) return '';
  return `<section class="related"><h2>함께 읽기</h2>${items.join('\n')}</section>`;
}

function articlePage(article, allArticles) {
  const url = `${SITE}/blog/${article.slug}`;
  const image = `${SITE}${coverOf(article.slug)}`;
  const ld = [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      datePublished: article.date,
      dateModified: article.date,
      inLanguage: 'ko',
      mainEntityOfPage: url,
      image,
      author: { '@type': 'Organization', name: '교수님 피하기 팀', url: SITE },
      publisher: { '@type': 'Organization', name: '교수님 피하기', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/favicon-512x512.png` } }
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: '연구노트', item: `${SITE}/blog` },
        { '@type': 'ListItem', position: 3, name: article.title, item: url }
      ]
    })
  ];
  const body = `
<article>
<h1>${esc(article.title)}</h1>
<div class="byline"><span class="cat">${esc(article.category)}</span><span>교수님 피하기 팀</span><span>검수: ${esc(article.reviewer || '검수 대기')}</span><span>${article.date}</span></div>
<img class="article-cover" src="${coverOf(article.slug)}" alt="" width="1200" height="500" loading="eager" decoding="async">
<p class="lead">${article.lead}</p>
${article.body}
<div class="cta-box">
<strong data-member-text="이어서 다듬어 볼까요?">${esc(article.ctaTitle || '내 글로 직접 확인해 보세요')}</strong>
<p data-member-text="작업실에 글을 붙여넣으면 문단별 AI 문체 신호를 바로 확인할 수 있어요. 실패한 작업은 차감되지 않습니다.">${esc(article.ctaDesc || '가입하면 10크레딧으로 1,000자 AI 감지 또는 500자 기본 휴머나이징을 먼저 써볼 수 있어요. 실패한 작업은 차감되지 않습니다.')}</p>
<a href="${article.ctaHref || '/'}" data-member-label="${article.ctaHref ? esc(article.ctaLabel || '열어 보기') : '작업실 열기'}">${esc(article.ctaLabel || '무료 10크레딧으로 시작하기')}</a>
</div>
${relatedBlock(article.related, allArticles)}
</article>`;
  return pageShell({
    title: `${article.title} | 교수님 피하기 연구노트`,
    description: article.description,
    url,
    breadcrumbs: [{ name: '홈', url: '/' }, { name: '연구노트', url: '/blog' }, { name: article.title }],
    bodyHtml: body,
    ldBlocks: ld,
    image
  });
}

function templatePage(tpl, allArticles) {
  const url = `${SITE}/templates/${tpl.genre}/${tpl.subtype}`;
  const ld = [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: tpl.title,
      description: tpl.description,
      datePublished: tpl.date,
      dateModified: tpl.date,
      inLanguage: 'ko',
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: '교수님 피하기 팀', url: SITE },
      publisher: { '@type': 'Organization', name: '교수님 피하기', url: SITE }
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: '연구노트', item: `${SITE}/blog` },
        { '@type': 'ListItem', position: 3, name: tpl.title, item: url }
      ]
    })
  ];
  const body = `
<article>
<h1>${esc(tpl.title)}</h1>
<div class="byline"><span class="cat">${esc(tpl.genreLabel)} 템플릿</span><span>교수님 피하기 팀</span><span>검수: ${esc(tpl.reviewer || '검수 대기')}</span><span>${tpl.date}</span></div>
<p class="lead">${tpl.lead}</p>
${tpl.body}
<div class="cta-box">
<strong>지금은 이렇게 쓰세요</strong>
<p>이 체크리스트로 초안을 직접 작성한 뒤, 교수님 피하기에서 AI식 문체 신호를 점검하고 다듬을 수 있어요. 사실을 대신 만들어 주는 도구가 아니라, 내가 아는 사실을 지키며 문장을 다듬는 도구입니다. 장르별 질문에 답하면 초안까지 만들어 주는 글쓰기 랩은 현재 준비 중이에요.</p>
<a href="/" data-member-label="작업실 열기">무료 10크레딧으로 시작하기</a>
</div>
${relatedBlock(tpl.related, allArticles)}
</article>`;
  return pageShell({
    title: `${tpl.title} | 교수님 피하기`,
    description: tpl.description,
    url,
    breadcrumbs: [{ name: '홈', url: '/' }, { name: '연구노트', url: '/blog' }, { name: tpl.title }],
    bodyHtml: body,
    ldBlocks: ld
  });
}

// 블로그 허브 — 매거진 판형(2026-08-28 재설계): 피처 1 + 서브 2, 카테고리 그리드, 템플릿 스트립, CTA 밴드.
function hubPage() {
  const url = `${SITE}/blog`;
  const ld = [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: '교수님 피하기 연구노트',
      url,
      description: 'AI 초안을 자연스럽게 다듬을 때 확인할 기준을 정리한 실전 가이드 모음.',
      publisher: { '@type': 'Organization', name: '교수님 피하기', url: SITE }
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: '연구노트', item: url }
      ]
    })
  ];
  const [feat, ...rest] = BLOG_ARTICLES;
  const side = rest.slice(0, 2);
  const grid = rest.slice(2);
  const card = (a) => `
<a class="hub-card" href="/blog/${a.slug}">
<img class="cover" src="${coverOf(a.slug)}" alt="" width="1200" height="675" loading="lazy" decoding="async">
<span class="body">
<strong>${esc(a.title)}</strong>
<p>${esc(a.description)}</p>
<span class="meta">${esc(a.category)} · <time>${a.date}</time></span>
</span>
</a>`;
  const rowCard = (a) => `
<a class="hub-row" href="/blog/${a.slug}">
<span class="txt">
<strong>${esc(a.title)}</strong>
<p>${esc(a.description)}</p>
<span class="meta">${esc(a.category)} · <time>${a.date}</time></span>
</span>
<img class="cover" src="${coverOf(a.slug)}" alt="" width="1200" height="800" loading="lazy" decoding="async">
</a>`;
  const tplLinks = TEMPLATE_PAGES.map((t) => `<a href="/templates/${t.genre}/${t.subtype}">${esc(t.title)}</a>`).join('\n');
  const body = `
<article>
<div class="hub-head">
<h1>AI 초안을 다듬는 실전 기준</h1>
<p>점수 보장이 아니라, 사실을 지키면서 자연스럽게 만드는 방법을 다룹니다. 과제·자소서·리포트를 제출하기 전에 확인할 기준을 짧고 구체적으로 정리했어요.</p>
</div>
<div class="hub-sec"><strong>이번 주 추천</strong><i></i></div>
<div class="feature-row">
<a class="feat" href="/blog/${feat.slug}">
<img class="cover" src="${coverOf(feat.slug)}" alt="" width="1200" height="675" loading="eager" decoding="async">
<span class="feat-body">
<strong>${esc(feat.title)}</strong>
<p>${esc(feat.description)}</p>
<span class="meta">${esc(feat.category)} · <time>${feat.date}</time></span>
</span>
</a>
<div class="feat-side">
${side.map(rowCard).join('\n')}
</div>
</div>
<div class="hub-sec"><strong>가이드 전체</strong><i></i></div>
<div class="hub-grid">
${grid.map(card).join('\n')}
</div>
<div class="hub-sec"><strong>빈칸 채우기 입력 템플릿</strong><i></i></div>
<div class="tpl-strip">
<h2>쓰기 전에 사실부터 모으는 템플릿</h2>
<p>글을 대신 써주는 게 아니라, 필요한 사실을 빠짐없이 모으게 해주는 체크리스트형 템플릿입니다.</p>
<div class="tpl-grid">
${tplLinks}
</div>
</div>
<div class="hub-cta">
<div>
<strong data-member-text="이어서 다듬어 볼까요?">읽는 것보다 빠른 확인</strong>
<p data-member-text="작업실에 글을 붙여넣으면 문단별 AI 문체 신호를 바로 확인할 수 있어요. 실패한 작업은 차감되지 않아요.">글을 붙여넣으면 문단별 AI 문체 신호를 바로 보여드립니다. 가입 시 10크레딧 제공, 실패한 작업은 차감되지 않아요.</p>
</div>
<a href="/" data-member-label="작업실 열기">무료 10크레딧으로 시작하기</a>
</div>
</article>`;
  return pageShell({
    title: '교수님 피하기 연구노트 – AI 글 다듬기 실전 가이드',
    description: 'AI 티 줄이기, 감지 점수 읽는 법, 제출 전 사실 확인, 크레딧 계산까지 — AI 초안을 다듬는 실전 기준을 정리한 연구노트입니다.',
    url,
    breadcrumbs: [{ name: '홈', url: '/' }, { name: '연구노트' }],
    bodyHtml: body,
    ldBlocks: ld,
    wide: true
  });
}

export async function generateContentPages({ dist }) {
  const written = [];
  {
    const out = path.join(dist, 'blog', 'index.html');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, hubPage(), 'utf8');
    written.push('blog(허브)');
  }
  for (const article of BLOG_ARTICLES) {
    const out = path.join(dist, 'blog', article.slug, 'index.html');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, articlePage(article, BLOG_ARTICLES), 'utf8');
    written.push(`blog/${article.slug}`);
  }
  for (const tpl of TEMPLATE_PAGES) {
    const out = path.join(dist, 'templates', tpl.genre, tpl.subtype, 'index.html');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, templatePage(tpl, BLOG_ARTICLES), 'utf8');
    written.push(`templates/${tpl.genre}/${tpl.subtype}`);
  }
  return written;
}

// 사이트맵 편입용 공개 콘텐츠 URL 목록(허브 포함 — 허브는 SPA 프리렌더 라우트에서 독립 페이지로 분리됨)
export function contentUrls() {
  const latest = BLOG_ARTICLES.map((a) => a.date).sort().pop();
  return [
    { url: '/blog', date: latest },
    ...BLOG_ARTICLES.map((a) => ({ url: `/blog/${a.slug}`, date: a.date })),
    ...TEMPLATE_PAGES.map((t) => ({ url: `/templates/${t.genre}/${t.subtype}`, date: t.date }))
  ];
}

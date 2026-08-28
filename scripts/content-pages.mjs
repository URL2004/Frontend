// 정적 콘텐츠 페이지 생성기(2026-08-28 Phase 4) — 블로그 기사(/blog/{slug})와
// 템플릿 파일럿(/templates/{genre}/{subtype})을 빌드 타임에 독립 HTML로 굽는다.
// SPA를 부팅하지 않는 완결 문서라 크롤러·직접 방문 모두 같은 본문을 본다(noscript 아님).
// Vercel은 rewrite보다 정적 파일을 우선하므로 별도 라우팅 설정 없이 서빙된다.

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

// 독립 문서용 콤팩트 스타일 — 앱 CSS에 의존하지 않는다(라이트·다크 모두 명시적으로 칠한다).
const STYLE = `
:root{--paper:#fbfbfd;--ink:#23263a;--ink2:#4a4d68;--muted:#6c7090;--accent:#5a5bd8;--deep:#4749c9;--soft:rgba(90,91,216,.08);--line:#e4e5f0;--card:#fff}
@media (prefers-color-scheme:dark){:root{--paper:#16171f;--ink:#e8e9f5;--ink2:#c0c2d8;--muted:#8f93b3;--accent:#8a8cf0;--deep:#b4b6ff;--soft:rgba(138,140,240,.12);--line:#2b2d3c;--card:#1d1e29}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.75;font-size:16px;word-break:keep-all}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:18px;padding:14px 20px}
header.site a{color:var(--ink2);text-decoration:none;font-size:14px}
header.site a.brand{font-weight:800;color:var(--ink);font-size:16px;margin-right:auto}
header.site a.cta{background:var(--accent);color:#fff;border-radius:999px;padding:7px 16px;font-weight:700}
nav.crumb{font-size:13px;color:var(--muted);padding:22px 0 0}
nav.crumb a{color:var(--muted)}
article{padding:8px 0 40px}
h1{font-size:clamp(24px,5vw,32px);line-height:1.32;margin:12px 0 10px;word-break:keep-all}
.byline{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 6px}
.lead{font-size:17px;color:var(--ink2);border-left:3px solid var(--accent);background:var(--soft);border-radius:0 10px 10px 0;padding:14px 18px;margin:18px 0 26px}
h2{font-size:20px;margin:38px 0 10px;line-height:1.35}
h3{font-size:16.5px;margin:26px 0 8px}
p{margin:12px 0;color:var(--ink2)}
article b,article strong{color:var(--ink)}
ul,ol{margin:12px 0;padding-left:24px;color:var(--ink2)}
li{margin:7px 0}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:16px 0}
th{font-size:13px;color:var(--muted);text-align:left;padding:9px 12px;border-bottom:2px solid var(--line);white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink2)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);margin:16px 0}
.note{font-size:14px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:18px 0}
.check{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 18px;margin:16px 0}
.cta-box{margin:36px 0 8px;padding:22px;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;background:var(--card)}
.cta-box strong{display:block;font-size:17px;margin-bottom:6px}
.cta-box p{margin:4px 0 14px;font-size:14.5px}
.cta-box a{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:11px 20px;font-size:15px}
.related{border-top:1px solid var(--line);padding:26px 0 8px}
.related h2{margin-top:0;font-size:17px}
.related a{display:block;color:var(--deep);text-decoration:none;padding:7px 0;font-size:15px}
footer.site{border-top:1px solid var(--line);margin-top:30px}
footer.site .wrap{padding:22px 20px 40px;font-size:12.5px;color:var(--muted);line-height:1.7}
footer.site a{color:var(--muted)}
img{max-width:100%}
`;

function pageShell({ title, description, url, breadcrumbs, bodyHtml, ldBlocks }) {
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
<meta property="og:image" content="${OG_IMAGE}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon-32x32.png">
${ldBlocks.join('\n')}
<style>${STYLE}</style>
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="/">교수님 피하기</a>
<a href="/blog">블로그</a>
<a href="/guide">가이드</a>
<a href="/pricing">요금</a>
<a class="cta" href="/">무료로 시작</a>
</div></header>
<div class="wrap">
<nav class="crumb">${crumbHtml}</nav>
${bodyHtml}
</div>
<footer class="site"><div class="wrap">
교수님 피하기 · 지피코리아(gpkorea) — AI 초안의 문체 신호를 확인하고 원문의 뜻·장르·사실을 지키며 다듬는 도구입니다.<br>
AI 감지 결과와 외부 검사 점수는 참고 신호이며 보장값이 아닙니다. <a href="/">서비스</a> · <a href="/faq">자주 묻는 질문</a> · <a href="/qna">문의</a>
</div></footer>
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
      author: { '@type': 'Organization', name: '교수님 피하기 팀', url: SITE },
      publisher: { '@type': 'Organization', name: '교수님 피하기', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/favicon-512x512.png` } }
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: '블로그', item: `${SITE}/blog` },
        { '@type': 'ListItem', position: 3, name: article.title, item: url }
      ]
    })
  ];
  const body = `
<article>
<h1>${esc(article.title)}</h1>
<div class="byline"><span>교수님 피하기 팀</span><span>검수: ${esc(article.reviewer || '검수 대기')}</span><span>수정일 ${article.date}</span><span>${esc(article.category)}</span></div>
<p class="lead">${article.lead}</p>
${article.body}
<div class="cta-box">
<strong>${esc(article.ctaTitle || '내 글로 직접 확인해 보세요')}</strong>
<p>${esc(article.ctaDesc || '가입하면 10크레딧으로 1,000자 AI 감지 또는 500자 기본 휴머나이징을 먼저 써볼 수 있어요. 실패한 작업은 차감되지 않습니다.')}</p>
<a href="${article.ctaHref || '/'}">${esc(article.ctaLabel || '무료 10크레딧으로 시작하기')}</a>
</div>
${relatedBlock(article.related, allArticles)}
</article>`;
  return pageShell({
    title: `${article.title} | 교수님 피하기 블로그`,
    description: article.description,
    url,
    breadcrumbs: [{ name: '홈', url: '/' }, { name: '블로그', url: '/blog' }, { name: article.title }],
    bodyHtml: body,
    ldBlocks: ld
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
        { '@type': 'ListItem', position: 2, name: '입력 템플릿', item: `${SITE}/blog` },
        { '@type': 'ListItem', position: 3, name: tpl.title, item: url }
      ]
    })
  ];
  const body = `
<article>
<h1>${esc(tpl.title)}</h1>
<div class="byline"><span>교수님 피하기 팀</span><span>검수: ${esc(tpl.reviewer || '검수 대기')}</span><span>수정일 ${tpl.date}</span><span>${esc(tpl.genreLabel)} 템플릿</span></div>
<p class="lead">${tpl.lead}</p>
${tpl.body}
<div class="cta-box">
<strong>지금은 이렇게 쓰세요</strong>
<p>이 체크리스트로 초안을 직접 작성한 뒤, 교수님 피하기에서 AI식 문체 신호를 점검하고 다듬을 수 있어요. 사실을 대신 만들어 주는 도구가 아니라, 내가 아는 사실을 지키며 문장을 다듬는 도구입니다. 장르별 질문에 답하면 초안까지 만들어 주는 글쓰기 랩은 현재 준비 중이에요.</p>
<a href="/">무료 10크레딧으로 시작하기</a>
</div>
${relatedBlock(tpl.related, allArticles)}
</article>`;
  return pageShell({
    title: `${tpl.title} | 교수님 피하기`,
    description: tpl.description,
    url,
    breadcrumbs: [{ name: '홈', url: '/' }, { name: '블로그', url: '/blog' }, { name: tpl.title }],
    bodyHtml: body,
    ldBlocks: ld
  });
}

export async function generateContentPages({ dist }) {
  const written = [];
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

// 사이트맵 편입용 공개 콘텐츠 URL 목록
export function contentUrls() {
  return [
    ...BLOG_ARTICLES.map((a) => ({ url: `/blog/${a.slug}`, date: a.date })),
    ...TEMPLATE_PAGES.map((t) => ({ url: `/templates/${t.genre}/${t.subtype}`, date: t.date }))
  ];
}

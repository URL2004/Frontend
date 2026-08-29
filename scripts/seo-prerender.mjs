// SEO 프리렌더 — 빌드 타임에 라우트별 "완성된 정적 HTML"을 생성한다.
//
// 왜 필요한가:
//   이 앱은 SPA라 index.html의 <body>가 사실상 비어 있고(#page-root),
//   실제 본문은 page-loader.js가 런타임에 XHR로 주입한다. 네이버 크롤러(Yeti)는
//   자바스크립트를 거의 실행하지 않아 본문을 통째로 못 본다. 구글도 JS 렌더링이
//   지연·불안정하다. 그래서 크롤러가 읽을 본문/메타/JSON-LD를 미리 정적 HTML에
//   구워 넣는다.
//
// 어떻게:
//   - 각 공개 라우트마다 dist/<route>/index.html 생성(홈은 dist/index.html 덮어쓰기)
//   - <title>/description/og/canonical 을 라우트별로 치환
//   - <head>에 JSON-LD(Organization/WebSite/FAQPage/BreadcrumbList) 주입
//   - 홈은 실제 랜딩 본문을 #page-root에 서버 렌더하고 런타임에서 그대로 활성화
//   - 나머지 공개 라우트는 #page-root 뒤에 <noscript>{해당 페이지 본문}</noscript> 주입

import fs from 'node:fs/promises';
import path from 'node:path';
// 단일 원천(2026-08-28): 라우트 메타·FAQ는 별도 모듈에서 가져온다 — 이 파일에 사본을 두지 않는다.
import { SITE, OG_IMAGE, LOGO, ROUTES } from './route-meta.mjs';
import { FAQ_ITEMS } from './faq-data.mjs';

function htmlEscapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// JSON-LD 문자열 안에서 </script> 조기 종료를 막는다.
function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function buildJsonLdBlocks(route) {
  const blocks = [];

  blocks.push(
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: '교수님 피하기',
      alternateName: 'GPKorea',
      url: SITE,
      logo: LOGO,
      image: OG_IMAGE,
      description: 'AI로 작성한 글을 자연스럽게 다듬는 AI 감지 · 휴머나이징 서비스'
    })
  );

  blocks.push(
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '교수님 피하기',
      url: SITE
    })
  );

  if (route.breadcrumb) {
    blocks.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: route.breadcrumb, item: SITE + route.url }
        ]
      })
    );
  }

  if (route.faq) {
    blocks.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      })
    );
  }

  return blocks.join('\n');
}

// data-seo-exclude 마커 블록을 통째로 제거(2026-08-28 T2.1).
// 준비 중 구독 카드·A/B 실험 문구처럼 "사용자에게 공개되지 않은 상태"가 숨김 해제 규칙 때문에
// 크롤러 본문으로 노출되던 문제의 해결책: 숨김을 풀기 전에, 비공개로 표시된 블록을 먼저 걷어낸다.
// jsdom 없이 같은 태그명 균형 스캔으로 닫는 태그를 찾는다 — 못 찾으면 빌드를 시끄럽게 실패시킨다.
function removeSeoExcluded(html) {
  const openRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sdata-seo-exclude(?:="[^"]*")?[^>]*>/;
  let out = String(html);
  let m;
  while ((m = openRe.exec(out))) {
    const tag = m[1];
    const start = m.index;
    const tokenRe = new RegExp('<' + tag + '(?=[\\s>])|</' + tag + '\\s*>', 'gi');
    tokenRe.lastIndex = start;
    let depth = 0;
    let end = -1;
    let t;
    while ((t = tokenRe.exec(out))) {
      if (t[0][1] === '/') {
        depth--;
        if (depth === 0) { end = tokenRe.lastIndex; break; }
      } else {
        depth++;
      }
    }
    if (end < 0) throw new Error(`seo-prerender: data-seo-exclude <${tag}> 블록의 닫는 태그를 찾지 못했습니다.`);
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

// 파셜을 크롤러가 본문으로 인식하도록 정리:
//   1) 비공개 마커(data-seo-exclude) 블록 제거 — 공개 상태와 검색 본문을 일치시킨다
//   2) 남은 본문의 display:none / hidden 무력화 — SPA 초기 숨김(파셜 래퍼·아코디언)을 크롤러에 펼침
function cleanPartial(html) {
  return removeSeoExcluded(String(html))
    .replace(/\sstyle="display:\s*none[^"]*"/gi, '')
    .replace(/\sstyle='display:\s*none[^']*'/gi, '')
    .replace(/display:\s*none\s*;?/gi, '')
    .replace(/\shidden(?=[\s>])/gi, '');
}

function applyMeta(html, route) {
  const url = SITE + route.url;
  const title = htmlEscapeAttr(route.title);
  const desc = htmlEscapeAttr(route.description);

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${desc}">`)
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}">`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${desc}">`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${url}">`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${url}">`);
}

export async function prerenderSeo({ root, dist }) {
  const template = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const written = [];

  for (const route of ROUTES) {
    let html = applyMeta(template, route);

    // <head> 끝에 JSON-LD 주입
    const ld = buildJsonLdBlocks(route);
    html = html.replace(/<\/head>/i, `${ld}\n</head>`);

    // 본문 주입: #page-root 바로 뒤에 크롤러용 정적 콘텐츠
    const partialPath = path.join(root, 'pages', route.partial);
    const partialSource = String(await fs.readFile(partialPath, 'utf8')).replace(/^\uFEFF/u, '');
    const partialHtml = cleanPartial(partialSource);
    // 랜딩 파셜은 자체 h1을 가지므로 홈이라고 무조건 덧붙이지 않는다(h1 중복 방지).
    const h1 = !/<h1[\s>]/i.test(partialHtml) ? `<h1>${route.h1}</h1>\n` : '';
    if (route.url === '/' && route.partial === 'landing.html') {
      const deferredMarker = '<section class="gp-lp-principle">';
      const deferredStart = partialSource.indexOf(deferredMarker);
      const landingClose = partialSource.lastIndexOf('</div>');
      if (deferredStart < 0 || landingClose <= deferredStart) {
        throw new Error('seo-prerender: landing deferred boundary not found');
      }
      const immediateLanding = `${partialSource.slice(0, deferredStart).trimEnd()}\n</div>`;
      const deferredLanding = partialSource.slice(deferredStart, landingClose).trim();
      const deferredSeo = cleanPartial(deferredLanding);
      html = html.replace(
        /<div id="page-root"><\/div>/i,
        `<div id="page-root">\n${immediateLanding}\n<template id="landingDeferredTemplate">\n${deferredLanding}\n</template>\n</div>\n`
          + `<noscript id="seo-prerender-static" data-seo-route="/">\n<div id="seo-prerender">\n${deferredSeo}\n</div>\n</noscript>`
      );
    } else {
      const seoBlock = `<noscript id="seo-prerender-static" data-seo-route="${route.url}">\n<div id="seo-prerender">\n${h1}${partialHtml}\n</div>\n</noscript>`;
      html = html.replace(
        /(<div id="page-root"><\/div>)/i,
        `$1\n${seoBlock}`
      );
    }

    const outPath = path.join(dist, route.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, 'utf8');
    written.push(route.out);
  }

  return written;
}

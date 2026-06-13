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
//   - <div id="page-root"> 뒤에 <div id="seo-prerender">{해당 페이지 본문}</div> 주입
//   - 실제 브라우저에서는 page-loader.js가 부팅 시 #seo-prerender 를 제거하고
//     기존 SPA가 그대로 렌더 → 사용자 UX/동작은 변하지 않는다(하이드레이션 패턴).

import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://gpkorea.ai.kr';
const OG_IMAGE = `${SITE}/og-image.png?v=2`;
const LOGO = `${SITE}/favicon-512x512.png`;

// 공개(인덱싱 대상) 라우트 정의. mypage/history/pro 는 인증·동적이라 제외(SPA 폴백 유지).
const ROUTES = [
  {
    out: 'index.html',
    url: '/',
    partial: 'main.html',
    title: '교수님 피하기 – AI 휴머나이저 · AI 감지 무료 확인 | GPT·카피킬러 대비',
    h1: '교수님 피하기 AI 휴머나이저',
    description:
      'AI로 작성한 글을 자연스럽고 사람답게 다듬는 AI 휴머나이저. AI 감지(탐지 확률)는 무료로 확인하고, 휴머나이징으로 GPT·카피킬러 등 외부 감지에 대비하세요.',
    breadcrumb: null,
    faq: false
  },
  {
    out: 'pricing/index.html',
    url: '/pricing',
    partial: 'pricing.html',
    title: '요금제 · 충전 · 구독 – 교수님 피하기 AI 휴머나이저',
    h1: '교수님 피하기 요금제',
    description:
      '교수님 피하기 크레딧 충전과 구독 플랜 안내. 100자당 1크레딧 기준, 토스·카카오페이 결제, 충전 크레딧은 소멸 기한 없이 사용할 수 있습니다.',
    breadcrumb: '요금제',
    faq: false
  },
  {
    out: 'faq/index.html',
    url: '/faq',
    partial: 'faq.html',
    title: '자주 묻는 질문 – AI 감지 정확도 · 크레딧 · 환불 | 교수님 피하기',
    h1: '교수님 피하기 자주 묻는 질문',
    description:
      '교수님 피하기 이용 방법, AI 감지 정확도, 크레딧·환불, 개인정보 보안 등 자주 묻는 질문을 한곳에 모았습니다.',
    breadcrumb: '자주 묻는 질문',
    faq: true
  },
  {
    out: 'community/index.html',
    url: '/community',
    partial: 'community.html',
    title: '커뮤니티 – AI 감지 · 과제 글쓰기 · 휴머나이징 경험 공유 | 교수님 피하기',
    h1: '교수님 피하기 커뮤니티',
    description:
      'AI 감지, 과제 작성, 휴머나이징 활용 경험을 나누는 교수님 피하기 커뮤니티입니다. 인기 게시글과 오늘의 키워드를 확인하세요.',
    breadcrumb: '커뮤니티',
    faq: false
  },
  {
    out: 'blog/index.html',
    url: '/blog',
    partial: 'blog.html',
    title: '블로그 – AI 티 줄이는 글쓰기 · 과제 문장 다듬기 | 교수님 피하기',
    h1: '교수님 피하기 블로그',
    description:
      'AI가 쓴 것처럼 보이는 문장을 자연스럽게 다듬는 방법을 정리한 블로그 허브입니다. 과제, 자기소개서, 리포트, 블로그 글쓰기 가이드를 확인하세요.',
    breadcrumb: '블로그',
    faq: false
  },
  {
    out: 'detect-report/index.html',
    url: '/detect-report',
    partial: 'detect-report.html',
    title: '무료 AI 감지기 – AI 탐지 확률 확인 · 위험 문장 분석 | 교수님 피하기',
    h1: '무료 AI 감지기',
    description:
      '제출 전 글을 붙여넣고 AI 작성 흔적과 탐지 위험 문장을 무료로 확인하세요. AI 감지 결과를 바탕으로 휴머나이징까지 이어갈 수 있습니다.',
    breadcrumb: '무료 AI 감지기',
    faq: false
  },
  {
    out: 'qna/index.html',
    url: '/qna',
    partial: 'qna.html',
    title: '문의하기 – 결제 · 계정 · 오류 1:1 문의 | 교수님 피하기',
    h1: '교수님 피하기 문의하기',
    description:
      '교수님 피하기 1:1 문의 — 결제·계정·오류 등 개인 문의는 여기서 남기거나 카카오톡으로 연락주세요. 운영 시간 안내 포함.',
    breadcrumb: '문의하기',
    faq: false
  },
  {
    out: 'notice/index.html',
    url: '/notice',
    partial: 'notice.html',
    title: '공지사항 – 서비스 업데이트 · 운영 안내 | 교수님 피하기',
    h1: '교수님 피하기 공지사항',
    description: '교수님 피하기 서비스 업데이트와 운영 공지사항을 확인하세요.',
    breadcrumb: '공지사항',
    faq: false
  }
];

// /faq 의 FAQPage 구조화 데이터(faq.html 본문과 1:1로 일치해야 구글 가이드라인 충족).
const FAQ_ITEMS = [
  ['교수님 피하기는 어떤 서비스인가요?', 'AI로 작성한 글의 탐지 가능성을 확인(AI 감지)하고, 더 자연스럽고 사람다운 문장으로 다듬어 주는(휴머나이징) 서비스입니다.'],
  ['무료로 사용할 수 있나요?', 'AI 감지(탐지 확률 확인)는 일일 한도 내에서 무료로 이용할 수 있어요. 문장을 사람답게 바꾸는 휴머나이징은 크레딧이 차감됩니다.'],
  ['휴머나이징 후에도 제 글의 의미가 유지되나요?', '핵심 주장과 논지 흐름은 유지하면서, 기계적인 문장 패턴과 반복 표현만 자연스럽게 조정합니다.'],
  ['AI 감지 결과는 얼마나 정확한가요?', '주요 AI 탐지 패턴을 기준으로 분석하지만, 모든 외부 감지기(GPTZero·카피킬러 등)를 100% 보장하지는 않습니다. 변환 후 재검사를 권장합니다.'],
  ['탐지율을 더 낮추려면 어떻게 하나요?', '감지 보고서에서 위험 문단을 먼저 확인하고, 휴머나이징(기본/고급)으로 다듬은 뒤 다시 감지해 보세요. 한 번에 안 되면 고급 모드로 재변환하면 더 내려갑니다.'],
  ['크레딧은 어떻게 충전하나요?', '충전하기 메뉴에서 원하는 크레딧을 선택해 토스·카카오페이로 결제하면 즉시 충전됩니다. 100자당 1크레딧 기준이며 소수점 차감은 없습니다.'],
  ['충전한 크레딧은 소멸되나요?', '구매한 크레딧은 소멸 기한 없이 계속 사용할 수 있습니다.'],
  ['환불은 어떻게 받나요?', '사용하지 않은 크레딧은 환불 규정에 따라 환불 가능합니다. 이미 사용한 크레딧과 구독 쿠폰 사용분은 환불 대상에서 제외됩니다.'],
  ['제 글이 저장되거나 다른 곳에 사용되나요?', '결과 보관함과 이용 기록 제공을 위해 일부 결과가 저장될 수 있습니다. 외부 학습 데이터로는 사용하지 않습니다.']
];

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
      description: 'AI로 작성한 글을 자연스럽게 다듬는 AI 휴머나이저 · AI 감지 서비스'
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
        mainEntity: FAQ_ITEMS.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      })
    );
  }

  return blocks.join('\n');
}

// 파셜을 크롤러가 본문으로 인식하도록 정리: display:none / hidden 무력화.
function cleanPartial(html) {
  return String(html)
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
    const partialHtml = cleanPartial(await fs.readFile(partialPath, 'utf8'));
    const h1 = route.url === '/' || !/<h1[\s>]/i.test(partialHtml) ? `<h1>${route.h1}</h1>\n` : '';
    const seoBlock = `<div id="seo-prerender" data-seo-route="${route.url}">\n${h1}${partialHtml}\n</div>`;
    html = html.replace(
      /(<div id="page-root"><\/div>)/i,
      `$1\n${seoBlock}`
    );

    const outPath = path.join(dist, route.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, 'utf8');
    written.push(route.out);
  }

  return written;
}

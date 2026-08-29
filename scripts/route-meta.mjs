// 공개 라우트 메타 단일 원천(2026-08-28 T2.2) — seo-prerender·sitemap-gen이 import한다.
// assets/js/app-main.js의 ROUTE_META(브라우저 classic script)는 직접 import할 수 없어
// test/claims-consistency.test.mjs가 두 사본의 title/description 정합을 강제한다.
// 항목 추가·수정 시 app-main.js ROUTE_META도 함께 고칠 것(테스트가 어긋남을 잡는다).

export const SITE = 'https://gpkorea.ai.kr';
export const OG_IMAGE = `${SITE}/og-image.png?v=4`;
export const LOGO = `${SITE}/favicon-512x512.png`;

// 공개(인덱싱 대상) 라우트 정의. mypage/history/pro 는 인증·동적이라 제외(SPA 폴백 + noindex 헤더).
export const ROUTES = [
  {
    out: 'index.html',
    url: '/',
    partial: 'landing.html',
    title: '교수님 피하기 – AI 감지 · 휴머나이징',
    h1: '교수님 피하기 AI 감지 · 휴머나이징',
    description:
      'AI로 작성한 글을 원문의 뜻과 장르에 맞게 자연스럽게 다듬어요. AI 티 지수를 확인하고 필요한 문장을 휴머나이징해 보세요.',
    breadcrumb: null,
    faq: false
  },
  {
    out: 'pricing/index.html',
    url: '/pricing',
    partial: 'pricing.html',
    title: '요금 · 충전 – 교수님 피하기 AI 감지 · 휴머나이징',
    h1: '교수님 피하기 요금제',
    description:
      '교수님 피하기 크레딧 충전 안내. AI 감지는 100자당 1크레딧, 휴머나이징은 최소 10크레딧부터 사용할 수 있으며 충전 크레딧은 유효기간 없이 사용할 수 있습니다.',
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
  // /blog 허브는 2026-08-28부터 SPA 프리렌더가 아니라 content-pages.mjs의 완전 독립 정적 페이지
  // (사이트맵 등록은 contentUrls()가 담당). 여기 다시 추가하면 독립 허브를 SPA 셸로 덮어쓰게 되니 금지.
  {
    out: 'detect-report/index.html',
    url: '/detect-report',
    partial: 'detect-report.html',
    title: 'AI 감지기 – AI 티 지수 확인 · 문장 분석 | 교수님 피하기',
    h1: 'AI 감지기',
    description:
      '제출 전 글을 붙여넣고 AI 작성 흔적과 AI 티 나는 문장을 확인하세요. AI 감지 결과를 바탕으로 휴머나이징까지 이어갈 수 있습니다.',
    breadcrumb: 'AI 감지기',
    faq: false
  },
  {
    out: 'guide/index.html',
    url: '/guide',
    partial: 'guide.html',
    title: '사용 가이드 – AI 감지 · 휴머나이징 · 결과 보관 | 교수님 피하기',
    h1: '교수님 피하기 사용 가이드',
    description:
      '교수님 피하기에서 글을 붙여넣고 AI 감지, 휴머나이징, 결과 보관, 크레딧 충전까지 진행하는 방법을 단계별로 안내합니다.',
    breadcrumb: '사용 가이드',
    faq: false
  },
  {
    out: 'qna/index.html',
    url: '/qna',
    partial: 'qna.html',
    title: '문의하기 – 결제 · 계정 · 오류 1:1 문의 | 교수님 피하기',
    h1: '교수님 피하기 문의하기',
    description:
      '교수님 피하기 1:1 문의 — 결제·계정·오류 등 개인 문의를 남기고 답변을 확인하세요. 운영 시간 안내 포함.',
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

// claim 일관성 잠금 테스트(2026-08-28 T2.7) — 화면·검색 스키마·가격·약관이 서로 어긋나면 여기서 깨진다.
// 감사보고서 P0-1(프리렌더 공개상태)·P0-4(FAQ 이중화)·P0-7(유효기간)·P0-8(noindex)·P0-2(크롤러블 링크)의 회귀 방지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAQ_ITEMS } from '../scripts/faq-data.mjs';
import { ROUTES } from '../scripts/route-meta.mjs';
import { prerenderSeo } from '../scripts/seo-prerender.mjs';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('FAQ 화면(faq.html)과 데이터 모듈(=JSON-LD 원천)이 글자 단위로 일치한다', async () => {
  const faq = await read('pages/faq.html');
  const qs = [...faq.matchAll(/class="faq-q"[^>]*><span>([^<]+)<\/span>/gu)].map((m) => m[1].trim());
  const as = [...faq.matchAll(/<div class="faq-a"[^>]*>([^<]+)<\/div>/gu)].map((m) => m[1].trim());
  assert.equal(qs.length, FAQ_ITEMS.length, '화면 질문 수 ≠ 데이터 문항 수');
  assert.equal(as.length, FAQ_ITEMS.length, '화면 답변 수 ≠ 데이터 문항 수');
  FAQ_ITEMS.forEach((item, i) => {
    assert.equal(qs[i], item.q, `질문 불일치(#${i + 1})`);
    assert.equal(as[i], item.a, `답변 불일치(#${i + 1}: ${item.q})`);
  });
  // 프리렌더는 데이터 모듈만 사용해야 한다(자체 사본 금지 — 과거 화면 11 vs 스키마 10 사고 방지)
  const prerender = await read('scripts/seo-prerender.mjs');
  assert.match(prerender, /from '\.\/faq-data\.mjs'/u);
  assert.doesNotMatch(prerender, /어떤 서비스인가요/u);
});

test('FAQ는 홈페이지 리듬의 4개 분야와 접근 가능한 아코디언, 전용 작업 선택기를 제공한다', async () => {
  const [faq, module, flow] = await Promise.all([
    read('pages/faq.html'),
    read('assets/js/app-module.js'),
    read('assets/js/conversion-flow.js')
  ]);
  assert.match(faq, /<h1 id="faqTitle">자주 묻는 질문<\/h1>/u);
  for (const id of ['faq-start', 'faq-detect', 'faq-humanize', 'faq-account']) {
    assert.match(faq, new RegExp(`href="#${id}"`, 'u'));
  }
  const questions = [...faq.matchAll(/class="faq-q"[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"/gu)];
  assert.equal(questions.length, FAQ_ITEMS.length);
  for (const [, answerId] of questions) {
    assert.match(faq, new RegExp(`id="${answerId}"[^>]*role="region"[^>]*aria-labelledby=`, 'u'));
  }
  assert.match(module, /btn\.setAttribute\('aria-expanded', open \? 'true' : 'false'\)/u);
  assert.match(module, /answer\.setAttribute\('aria-hidden', open \? 'false' : 'true'\)/u);
  assert.match(faq, /openProductMode\('detect'\)/u);
  assert.match(faq, /openProductMode\('humanize'\)/u);
  assert.doesNotMatch(faq, /data-gp-offer-slot/u);
  assert.doesNotMatch(flow, /OFFER_PAGES = \['faq'/u);
});

test('FAQ와 사용자 정책·푸터 문구는 제거된 결과 보관함 대신 작업 기록을 안내한다', async () => {
  const surfaces = await Promise.all([
    read('pages/faq.html'),
    read('pages/main.html'),
    read('scripts/faq-data.mjs'),
    read('assets/js/app-main.js'),
    read('partials/footer.html')
  ]);
  for (const surface of surfaces) {
    assert.doesNotMatch(surface, /결과 보관함/u);
    assert.match(surface, /작업 기록/u);
  }
});

test('사용 가이드는 현재 작업 흐름·기능·단가와 직접 행동을 안내한다', async () => {
  const guide = await read('pages/guide.html');
  for (const anchor of ['guide-flow', 'guide-modes', 'guide-credits', 'guide-results']) {
    assert.match(guide, new RegExp(`id="${anchor}"`, 'u'));
  }
  for (const mode of ['AI 감지', '원문 보존 다듬기', '기본 휴머나이징', '고급 휴머나이징']) {
    assert.match(guide, new RegExp(mode, 'u'));
  }
  assert.match(guide, /100자당 1크레딧/u);
  assert.match(guide, /최소 10 · 100자당 2/u);
  assert.match(guide, /길이별 200~600크레딧/u);
  assert.match(guide, /스타터는 기준 100크레딧에 이벤트 5크레딧을 더해 총 105크레딧/u);
  assert.match(guide, /외부 탐지기 결과는 보장하지 않아요/u);
  assert.match(guide, /작업 기록/u);
  assert.doesNotMatch(guide, /gpg-shot|assets\/img\/guide\/step|보관함에서/u);
});

test('신뢰·가격·준비 중 표면은 확정된 정책 문구와 런타임 훅을 사용한다', async () => {
  const [pricing, faq, guide, pro, writingLab, qna, footer] = await Promise.all([
    read('pages/pricing.html'),
    read('pages/faq.html'),
    read('pages/guide.html'),
    read('pages/pro.html'),
    read('pages/writing-lab.html'),
    read('pages/qna.html'),
    read('partials/footer.html')
  ]);

  assert.equal((pricing.match(/data-credit-balance/gu) || []).length, 0, '본문에는 공통 상단 잔액을 중복 표시하지 않음');
  assert.doesNotMatch(pricing, /data-credit-work-count="current"/u);
  assert.equal((pricing.match(/data-plan-efficiency/gu) || []).length, 5, '상품마다 기본 1,000자 기준 금액 한 줄');
  assert.doesNotMatch(pricing, /보유 크레딧 10|업그레이드|구독 시작/u);
  for (const claim of ['최소 10크레딧 · 100자당 2크레딧', '고급 · 1만자 이하', '고급 · 2만자 이하', '고급 · 3만자 이하', '고급 · 근거 보강 선택']) {
    assert.ok(pricing.includes(claim) || guide.includes(claim), `단가 문구 누락: ${claim}`);
  }

  assert.match(faq, /서면 또는 전자문서로 계약 내용을 받은 날부터 7일 이내/u);
  assert.match(faq, /각 주문 안에서는 기준 크레딧을 먼저 사용/u);
  assert.match(faq, /같은 주문의 남은 추가 크레딧은 함께 회수/u);
  assert.match(faq, /환불 사유 입력은 선택사항/u);
  assert.doesNotMatch(faq, /구독 쿠폰/u);
  assert.match(qna, /평일 기준 1영업일 이내 답변/u);
  assert.match(qna, /data-auth-required="qna"/u);
  assert.match(pro, /<h1>Pro 전용 작업실<\/h1>/u);
  assert.match(pro, /Pro는 준비 중이에요/u);
  assert.match(pro, /크레딧 충전하기/u);
  assert.doesNotMatch(pro, /구독 시작|보유 쿠폰/u);
  assert.match(writingLab, /<h1 id="wlPageTitle">글쓰기 랩<\/h1>/u);
  assert.match(writingLab, /관리자 전용 · 준비 중/u);
  assert.match(writingLab, /제출 전 최종 점검/u);
  assert.match(writingLab, /검수 완료 상태/u);
  assert.doesNotMatch(writingLab, /800자|40크레딧|최종 공개 검사|공개 상태/u);
  assert.match(footer, /공정위 사업자정보 확인/u);
});

test('가격·크레딧 수치는 단일 원천(conversion-flow PLANS)과 pricing·landing에서 일치한다', async () => {
  const [flow, pricing, landing] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('pages/pricing.html'),
    read('pages/landing.html')
  ]);
  const plansBlock = flow.slice(flow.indexOf('var PLANS = ['), flow.indexOf('];', flow.indexOf('var PLANS = [')));
  const plans = [...plansBlock.matchAll(/amount:\s*(\d+),\s*paidCredits:\s*(\d+),\s*packageBonusCredits:\s*(\d+),\s*eventBonusCredits:\s*(\d+),\s*credits:\s*(\d+)/gu)]
    .map((m) => ({ amount: Number(m[1]), paidCredits: Number(m[2]), packageBonusCredits: Number(m[3]), eventBonusCredits: Number(m[4]), credits: Number(m[5]) }));
  assert.equal(plans.length, 5, 'PLANS 5종이어야 함');
  assert.deepEqual(plans, [
    { amount: 2900, paidCredits: 100, packageBonusCredits: 0, eventBonusCredits: 5, credits: 105 },
    { amount: 8700, paidCredits: 300, packageBonusCredits: 30, eventBonusCredits: 15, credits: 345 },
    { amount: 14500, paidCredits: 500, packageBonusCredits: 125, eventBonusCredits: 25, credits: 650 },
    { amount: 29000, paidCredits: 1000, packageBonusCredits: 350, eventBonusCredits: 50, credits: 1400 },
    { amount: 58000, paidCredits: 2000, packageBonusCredits: 900, eventBonusCredits: 100, credits: 3000 }
  ]);
  for (const { amount, paidCredits, packageBonusCredits, eventBonusCredits, credits } of plans) {
    assert.equal(paidCredits + packageBonusCredits + eventBonusCredits, credits, `${amount} 지급량 합계 불일치`);
    assert.ok(pricing.includes(`payToss(${amount},${credits}`), `pricing.html payToss(${amount},${credits}) 부재`);
    const fmt = credits.toLocaleString('en-US');
    assert.ok(pricing.includes(`총 ${fmt} 크레딧`), `pricing.html 총 ${fmt} 크레딧 부재`);
    assert.ok(landing.includes(`${fmt}크레딧`), `landing.html ${fmt}크레딧 부재`);
  }
  assert.doesNotMatch(`${flow}\n${pricing}\n${landing}`, /firstPurchase|firstBonus|첫 구매|첫 결제/u, '종료된 추가 지급 경로 재유입');
});

test('크레딧 유효기간 표기는 약관까지 포함해 전 표면에서 무기한으로 일치한다', async () => {
  const files = await Promise.all([
    read('assets/js/app-main.js'),
    read('pages/landing.html'),
    read('pages/pricing.html'),
    read('pages/faq.html'),
    read('scripts/faq-data.mjs'),
    read('scripts/route-meta.mjs')
  ]);
  const all = files.join('\n');
  assert.doesNotMatch(all, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u, '약관 1년 문구 재유입(2026-08-28 무기한 개정)');
  assert.match(files[0], /유료로 충전한 기준 크레딧과 상품 보너스·결제 이벤트로 추가 지급된 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  // 보장형 금지 주장(마케팅·스키마 공통)
  assert.doesNotMatch(all, /100%\s*(보장|통과)|무조건 통과|탐지\s*통과를?\s*보장/u);
});

test('프리렌더 공개상태: /pricing 검색 본문은 크레딧 충전만 안내하고 구독·실험 문구가 없다', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'gp-prerender-'));
  try {
    await prerenderSeo({ root: repoRoot, dist });
    const pricingOut = await readFile(join(dist, 'pricing/index.html'), 'utf8');
    assert.match(pricingOut, /기준 크레딧과 상품·이벤트로 받은 추가 크레딧은 모두 <strong>유효기간 없이<\/strong>/u, '크레딧 충전 정책이 검색 본문에 있어야 함');
    assert.doesNotMatch(pricingOut, /정기구독|정기 구독|openSubscribeConfirm|구독 시작|11,900|54,900|99,000|290,000/u, '비활성 구독 UI가 검색 본문에 노출');
    assert.doesNotMatch(pricingOut, /첫 결제 실험 혜택/u, 'A/B 실험 문구가 검색 본문에 노출');
    const faqOut = await readFile(join(dist, 'faq/index.html'), 'utf8');
    for (const item of FAQ_ITEMS) {
      assert.ok(faqOut.includes(JSON.stringify(item.q).slice(1, -1)), `FAQ 스키마에 질문 누락: ${item.q}`);
    }
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test('vercel.json: 인증 앱 경로와 원시 조각은 noindex 헤더를 가진다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const bySource = new Map((config.headers || []).map((h) => [h.source, new Map(h.headers.map((i) => [i.key.toLowerCase(), i.value]))]));
  assert.equal(bySource.get('/pages/(.*)')?.get('x-robots-tag'), 'noindex');
  assert.equal(bySource.get('/partials/(.*)')?.get('x-robots-tag'), 'noindex');
  const appBlock = [...bySource.keys()].find((s) => /mypage/.test(s));
  assert.ok(appBlock, '앱 경로 noindex 블록 부재');
  for (const p of ['mypage', 'admin', 'admin-humanize-lab', 'history', 'pro', 'writing-lab', 'main']) {
    assert.ok(appBlock.includes(p), `noindex 대상 누락: /${p}`);
  }
  assert.equal(bySource.get(appBlock).get('x-robots-tag'), 'noindex, nofollow');
});

test('내비는 크롤러블 앵커(a[href][data-tab])와 라우팅 델리게이트를 사용한다', async () => {
  const [main, footer, mobileNav, appShell, appMain] = await Promise.all([
    read('pages/main.html'),
    read('partials/footer.html'),
    read('partials/mobile-nav.html'),
    read('partials/app-shell-start.html'),
    read('assets/js/app-main.js')
  ]);
  const countAnchors = (s) => (s.match(/<a [^>]*data-tab="[^"]+"[^>]*href="\//gu) || []).length;
  assert.ok(countAnchors(main) >= 6, `main.html 사이드바 앵커 부족(${countAnchors(main)})`);
  assert.ok(countAnchors(footer) >= 8, `footer 앵커 부족(${countAnchors(footer)})`);
  // 연구노트(구 블로그)는 SPA 탭이 아니라 독립 정적 허브로 전체 이동(2026-08-28) — data-tab 없는 순수 링크여야 한다
  assert.match(footer, /<a href="\/blog">연구노트<\/a>/u);
  assert.equal(countAnchors(mobileNav), 0, '삭제한 모바일 내비가 다시 생기면 안 됨');
  assert.equal(countAnchors(appShell), 0, '앱 셸에 중복 사이드바 내비가 다시 생기면 안 됨');
  assert.match(appMain, /closest\('a\[data-tab\]\[href\]'\)/u, '앵커 라우팅 델리게이트 부재');
});

test('공개 라우트 집합: 프리렌더 라우트와 SPA 라우터가 같은 경로를 가리킨다', async () => {
  const appMain = await read('assets/js/app-main.js');
  for (const r of ROUTES) {
    const path = r.url === '/' ? "'/'" : `'${r.url}'`;
    assert.ok(appMain.includes(`${path}:`) || appMain.includes(`${path} :`) || appMain.includes(`${r.url}':`), `PATH_ROUTES에 ${r.url} 부재`);
  }
  const build = await read('scripts/build-vite-static.mjs');
  assert.match(build, /sitemap-gen\.mjs/u, '빌드에 사이트맵 생성기 미연결');
});

test('use_case 흐름: 랜딩 변형·3택 프리셋·이벤트 파라미터가 연결돼 있다', async () => {
  const [landing, evasion, tracking] = await Promise.all([
    read('assets/js/landing.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/head-tracking.js')
  ]);
  // 랜딩 변형 4종 + 히어로 셀렉터
  for (const key of ['assignment', 'resume', 'paper', 'blog']) {
    assert.match(landing, new RegExp(key + ':\\s*\\{'), `LP_VARIANTS.${key} 부재`);
  }
  assert.match(landing, /\.gp-lp-hero-inner h1/u);
  // 3택 화면 글 종류 프리셋 매핑
  assert.match(evasion, /USE_CASE_PROFILE\s*=\s*\{\s*assignment:\s*'report_assignment'/u);
  assert.match(evasion, /applyUseCasePreset\(\)/u);
  // 이벤트 컨텍스트에 use_case 포함(Meta params 포함)
  assert.match(tracking, /use_case:\s*last\.use_case \|\| first\.use_case/u);
  assert.match(tracking, /use_case:\s*clean\(payload\.use_case, 40\)/u);
});

test('콘텐츠 데이터(연구노트 12편·템플릿 6종)도 금지 주장·유효기간 규칙을 지킨다', async () => {
  const [blog, templates] = await Promise.all([
    read('scripts/blog-data.mjs'),
    read('scripts/templates-data.mjs')
  ]);
  const { BLOG_ARTICLES } = await import('../scripts/blog-data.mjs');
  const { TEMPLATE_PAGES } = await import('../scripts/templates-data.mjs');
  assert.equal(BLOG_ARTICLES.length, 12, '연구노트 12편이어야 함');
  assert.equal(TEMPLATE_PAGES.length, 6, '템플릿 파일럿 6종이어야 함');
  const all = blog + '\n' + templates;
  // 보장·날조형 표현 금지(감사보고서 §6·§8 게이트)
  assert.doesNotMatch(all, /100%\s*(보장|통과|만족)|무조건 통과|합격(을|률)?\s*보장|탐지\s*통과를?\s*보장/u);
  assert.doesNotMatch(all, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u);
  // 후기(review_blog) 유형 파일럿 금지(PRODUCT.md 기준선 사유)
  for (const t of TEMPLATE_PAGES) assert.notEqual(t.genre, 'review_blog');
  // 전 편 발행 게이트 필드 보유(작성일·검수 상태·관련 링크)
  const articleSlugs = new Set(BLOG_ARTICLES.map((article) => article.slug));
  assert.equal(articleSlugs.size, BLOG_ARTICLES.length, '블로그 slug는 중복되면 안 됨');
  for (const a of BLOG_ARTICLES) {
    assert.ok(a.slug && a.title && a.description && a.date && a.reviewer, `기사 메타 누락: ${a.slug}`);
    assert.match(a.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, `기사 slug 형식 오류: ${a.slug}`);
    assert.ok(Array.isArray(a.related) && a.related.length >= 1, `관련 링크 없음: ${a.slug}`);
    for (const relatedSlug of a.related) {
      assert.ok(articleSlugs.has(relatedSlug), `없는 관련 글 링크: ${a.slug} -> ${relatedSlug}`);
      assert.notEqual(relatedSlug, a.slug, `자기 자신을 관련 글로 연결함: ${a.slug}`);
    }
    const cover = await readFile(new URL(`../assets/img/blog/${a.slug}.webp`, import.meta.url));
    assert.ok(cover.byteLength > 1000, `블로그 커버 이미지 누락 또는 비정상: ${a.slug}`);
  }
  const pdfGuide = BLOG_ARTICLES.find((article) => article.slug === 'pdf-long-document-humanizing-guide');
  const appMain = await read('assets/js/app-main.js');
  assert.ok(pdfGuide, 'PDF 장문 입력 가이드가 있어야 함');
  assert.match(appMain, /PDF_MAX_PAGES\s*=\s*100/u);
  assert.match(appMain, /PDF_MAX_EXTRACTED_CHARS\s*=\s*30000/u);
  assert.match(appMain, /PDF_EXTRACT_TIMEOUT_MS\s*=\s*20000/u);
  assert.match(appMain, /file\.size\s*>\s*10\s*\*\s*1024\s*\*\s*1024/u);
  for (const currentLimit of ['10MB', '100쪽', '30,000자', '20초']) {
    assert.ok(pdfGuide.body.includes(currentLimit), `PDF 가이드의 현재 제한값 누락: ${currentLimit}`);
  }
  for (const t of TEMPLATE_PAGES) {
    assert.ok(t.genre && t.subtype && t.title && t.date && t.reviewer, `템플릿 메타 누락: ${t.genre}/${t.subtype}`);
  }
  // SPA 폴백 허브에도 12편 전부 실링크로 연결
  const hub = await read('pages/blog.html');
  for (const a of BLOG_ARTICLES) {
    assert.ok(hub.includes(`/blog/${a.slug}`), `허브에 /blog/${a.slug} 링크 부재`);
  }
});

test('단가 공식: evasion-flow 기준 공식이 유지되고 계산기 잔재가 없다', async () => {
  // 계산기 UI는 2026-08-29 제거 — 단가 표시는 3택 카드 인라인 비용(evasion-flow)이 단일 표면
  const evasion = await read('assets/js/evasion-flow.js');
  assert.match(evasion, /SHORT_HUMANIZE_MIN_CREDITS = 10/u);
  assert.match(evasion, /Math\.max\(SHORT_HUMANIZE_MIN_CREDITS, Math\.ceil\(.*\/ 100\) \* 2\)/u);
  const pricingHtml = await read('pages/pricing.html');
  assert.ok(!pricingHtml.includes('id="calculator"'), '제거된 계산기 섹션이 되살아남');
  const boot = await read('assets/js/app-boot.js');
  assert.ok(!boot.includes('credit-pricing.js'), '삭제된 credit-pricing.js를 여전히 로드함');
});

test('랜딩(홈) 푸터는 블로그·요금 등으로 가는 크롤러블 실링크를 가진다', async () => {
  const landing = await read('pages/landing.html');
  for (const href of ['/blog', '/pricing', '/guide', '/faq', '/qna']) {
    assert.ok(landing.includes(`<a href="${href}">`), `랜딩 푸터에 ${href} 실링크 부재`);
  }
});

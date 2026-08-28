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
  const as = [...faq.matchAll(/<div class="faq-a">([^<]+)<\/div>/gu)].map((m) => m[1].trim());
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

test('가격·크레딧 수치는 단일 원천(conversion-flow PLANS)과 pricing·landing에서 일치한다', async () => {
  const [flow, pricing, landing] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('pages/pricing.html'),
    read('pages/landing.html')
  ]);
  const plansBlock = flow.slice(flow.indexOf('var PLANS = ['), flow.indexOf('];', flow.indexOf('var PLANS = [')));
  const plans = [...plansBlock.matchAll(/amount:\s*(\d+),\s*credits:\s*(\d+)/gu)]
    .map((m) => ({ amount: Number(m[1]), credits: Number(m[2]) }));
  assert.equal(plans.length, 5, 'PLANS 5종이어야 함');
  for (const { amount, credits } of plans) {
    assert.ok(pricing.includes(`payToss(${amount},${credits}`), `pricing.html payToss(${amount},${credits}) 부재`);
    const fmt = credits.toLocaleString('en-US');
    assert.ok(pricing.includes(`총 ${fmt} 크레딧`), `pricing.html 총 ${fmt} 크레딧 부재`);
    assert.ok(landing.includes(`${fmt}크레딧`), `landing.html ${fmt}크레딧 부재`);
  }
  // 과거 사고 수치(8700원=330) 재유입 방지
  assert.ok(!pricing.includes('payToss(8700,330'), '구버전 330크레딧 재유입');
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
  assert.match(files[0], /유료로 충전한 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  // 보장형 금지 주장(마케팅·스키마 공통)
  assert.doesNotMatch(all, /100%\s*(보장|통과)|무조건 통과|탐지\s*통과를?\s*보장/u);
});

test('프리렌더 공개상태: /pricing 검색 본문에 준비 중 안내만 있고 구독 상품·실험 문구는 없다', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'gp-prerender-'));
  try {
    await prerenderSeo({ root: repoRoot, dist });
    const pricingOut = await readFile(join(dist, 'pricing/index.html'), 'utf8');
    assert.match(pricingOut, /정기 구독은 준비 중이에요/u, '준비 중 배너가 검색 본문에 있어야 함');
    assert.doesNotMatch(pricingOut, /openSubscribeConfirm|구독 시작|11,900|54,900|99,000|290,000/u, '준비 중 구독 상품이 검색 본문에 노출');
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
  assert.ok(countAnchors(footer) >= 9, `footer 앵커 부족(${countAnchors(footer)})`);
  assert.ok(countAnchors(mobileNav) >= 6, `모바일 내비 앵커 부족(${countAnchors(mobileNav)})`);
  assert.ok(countAnchors(appShell) >= 7, `사이드바 앵커 부족(${countAnchors(appShell)})`);
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

test('콘텐츠 데이터(블로그 8편·템플릿 6종)도 금지 주장·유효기간 규칙을 지킨다', async () => {
  const [blog, templates] = await Promise.all([
    read('scripts/blog-data.mjs'),
    read('scripts/templates-data.mjs')
  ]);
  const { BLOG_ARTICLES } = await import('../scripts/blog-data.mjs');
  const { TEMPLATE_PAGES } = await import('../scripts/templates-data.mjs');
  assert.equal(BLOG_ARTICLES.length, 8, '블로그 8편이어야 함');
  assert.equal(TEMPLATE_PAGES.length, 6, '템플릿 파일럿 6종이어야 함');
  const all = blog + '\n' + templates;
  // 보장·날조형 표현 금지(감사보고서 §6·§8 게이트)
  assert.doesNotMatch(all, /100%\s*(보장|통과|만족)|무조건 통과|합격(을|률)?\s*보장|탐지\s*통과를?\s*보장/u);
  assert.doesNotMatch(all, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u);
  // 후기(review_blog) 유형 파일럿 금지(PRODUCT.md 기준선 사유)
  for (const t of TEMPLATE_PAGES) assert.notEqual(t.genre, 'review_blog');
  // 전 편 발행 게이트 필드 보유(작성일·검수 상태·관련 링크)
  for (const a of BLOG_ARTICLES) {
    assert.ok(a.slug && a.title && a.description && a.date && a.reviewer, `기사 메타 누락: ${a.slug}`);
    assert.ok(Array.isArray(a.related) && a.related.length >= 1, `관련 링크 없음: ${a.slug}`);
  }
  for (const t of TEMPLATE_PAGES) {
    assert.ok(t.genre && t.subtype && t.title && t.date && t.reviewer, `템플릿 메타 누락: ${t.genre}/${t.subtype}`);
  }
  // 허브에 8편 전부 실링크로 연결
  const hub = await read('pages/blog.html');
  for (const a of BLOG_ARTICLES) {
    assert.ok(hub.includes(`/blog/${a.slug}`), `허브에 /blog/${a.slug} 링크 부재`);
  }
});

test('크레딧 계산기: 공용 단가 모듈이 evasion-flow 공식과 같은 값을 낸다', async () => {
  const vm = await import('node:vm');
  const src = await read('assets/js/credit-pricing.js');
  const win = { document: { readyState: 'complete', getElementById: () => null, addEventListener: () => {} } };
  vm.runInNewContext(src, { window: win, document: win.document, Math, String, parseInt });
  const p = win.gpCreditPricing;
  // 서버·evasion-flow와 동일해야 하는 기준값(감지 100자당 1 / 기본 최소10·100자당2 / 고급 200/400/600)
  assert.equal(p.detectCredit(1000), 10);
  assert.equal(p.shortCredit(300), 10);
  assert.equal(p.shortCredit(1050), 22);
  assert.equal(p.formalCredit(10000, false), 200);
  assert.equal(p.formalCredit(15000, false), 400);
  assert.equal(p.formalCredit(25000, true), 700);
  const evasion = await read('assets/js/evasion-flow.js');
  assert.match(evasion, /SHORT_HUMANIZE_MIN_CREDITS = 10/u);
  assert.match(evasion, /Math\.max\(SHORT_HUMANIZE_MIN_CREDITS, Math\.ceil\(.*\/ 100\) \* 2\)/u);
  const pricingHtml = await read('pages/pricing.html');
  assert.match(pricingHtml, /id="calculator"/u);
  const boot = await read('assets/js/app-boot.js');
  assert.match(boot, /credit-pricing\.js/u);
});

test('랜딩(홈) 푸터는 블로그·요금 등으로 가는 크롤러블 실링크를 가진다', async () => {
  const landing = await read('pages/landing.html');
  for (const href of ['/blog', '/pricing', '/guide', '/faq', '/qna']) {
    assert.ok(landing.includes(`<a href="${href}">`), `랜딩 푸터에 ${href} 실링크 부재`);
  }
});

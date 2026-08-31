import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('모바일 랜딩 헤더는 요금 바로가기를 유지하고 작은 폭에 맞춘다', async () => {
  const [landing, css] = await Promise.all([
    read('pages/landing.html'),
    read('assets/css/landing.css')
  ]);
  assert.match(landing, /class="gp-lp-ghost gp-lp-price-shortcut"[^>]+gpLandingScrollTo\('lpPricing'\)[^>]*>요금<\/button>/u);
  assert.match(css, /\.gp-lp-price-shortcut\{display:none\}/u);
  assert.match(css, /@media \(max-width:960px\)\{[\s\S]*?\.gp-lp-price-shortcut\{display:inline-flex;align-items:center\}/u);
  assert.match(css, /@media \(max-width:560px\)\{[\s\S]*?\.gp-lp-nav\{gap:8px;padding:10px\}[\s\S]*?\.gp-lp-brand img\{height:26px\}/u);
});

test('랜딩의 스탠다드는 선택 상태가 아닌 균형 추천 상품으로 강조한다', async () => {
  const [landing, css] = await Promise.all([
    read('pages/landing.html'),
    read('assets/css/landing.css')
  ]);
  assert.match(landing, /class="gp-lp-plan is-popular"[\s\S]{0,140}?<i>균형 추천<\/i>/u);
  assert.match(css, /\.gp-lp-plan\.is-popular\{border:2px solid var\(--lp-accent\);box-shadow:none\}/u);
  assert.match(css, /\.gp-lp-plan i\{[^}]*background:var\(--lp-accent\);color:#fff/u);
  assert.doesNotMatch(landing, />가장 인기<|>인기 상품</u);
});

test('컴포저는 붙여넣는 즉시 이 글의 크레딧과 잔액을 같은 단가로 계산해 보여준다', async () => {
  const [main, evasion, designs] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/main-designs.js')
  ]);
  assert.match(main, /id="lavEstimate"/u);
  assert.match(main, /id="lavEstimateCost"/u);
  assert.match(main, /id="lavEstimateBalance"/u);
  assert.match(main, /onclick="lavEstimateAction\(\)"/u);
  // 단가는 실행 경로와 같은 함수를 쓴다 — 표시값과 청구값이 갈라지지 않게.
  assert.match(evasion, /detect \? detectCredit\(text\.length\) : shortHumanizeCredit\(text\.length\)/u);
  assert.match(evasion, /Math\.ceil\(\(Number\(len\) \|\| 0\) \/ 100\)/u);
  // 입력·모드 전환 양쪽에서 갱신된다.
  assert.match(designs, /window\.lavUpdateEstimate\(\)/u);
  assert.match(evasion, /window\.lavSetMode = function[\s\S]*?window\.lavUpdateEstimate\(\)/u);
});

test('잔액이 모자라면 작업 보존형 결제창으로 넘기고 결제 후 초안을 되살린다', async () => {
  const [evasion, flow] = await Promise.all([
    read('assets/js/evasion-flow.js'),
    read('assets/js/conversion-flow.js')
  ]);
  assert.match(evasion, /크레딧 부족 · 충전하기/u);
  assert.match(evasion, /gpOpenCreditCheckout\(\{[\s\S]*?action: 'composer_draft'/u);
  assert.match(evasion, /window\.gpResumeComposerDraft/u);
  assert.match(flow, /composer_draft: 'gpResumeComposerDraft'/u);
  // 아직 시작하지 않은 초안이므로 결제 후 작업을 자동 실행하지 않는다.
  assert.match(evasion, /window\.gpResumeComposerDraft = function[\s\S]*?lavUpdateEstimate\(\)/u);
  assert.doesNotMatch(evasion, /window\.gpResumeComposerDraft = function[\s\S]*?lavRun\(\)/u);
});

test('비로그인 사용자에게는 예상 비용 대신 무료 크레딧 가입을 안내한다', async () => {
  const evasion = await read('assets/js/evasion-flow.js');
  assert.match(evasion, /로그인하고 무료 10크레딧 받기/u);
  assert.match(evasion, /source: 'composer_estimate'/u);
});

test('첫 화면 오퍼는 결제 이력과 잔액 단계에 따라 문구와 다음 행동이 달라진다', async () => {
  const [main, flow, module_] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/conversion-flow.js'),
    read('assets/js/app-module.js')
  ]);
  assert.match(main, /id="lavHeroOffer"/u);
  assert.match(main, /onclick="gpHeroOfferAction\(\)"/u);
  for (const segment of ['trial_unused', 'trial_engaged', 'returning_low_balance', 'returning_funded']) {
    assert.match(flow, new RegExp(`segment === '${segment}'`, 'u'));
  }
  assert.match(flow, /loggedOutHeroCopy/u);
  assert.match(flow, /window\.gpRefreshHeroOffer/u);
  // 바로 아래 입력창에 포커스만 주는 버튼은 변화가 없어 보이므로 정보만 남긴다.
  assert.match(flow, /cta\.hidden = copy\.action === 'focus'/u);
  assert.match(flow, /box\.classList\.toggle\('is-passive', copy\.action === 'focus'\)/u);
  // 재구매 세그먼트는 지난번 상품으로 바로 결제하고, 클릭 출처는 표면별로 기록한다.
  assert.match(flow, /offerVariant: 'repurchase_previous'[\s\S]*?source: surface \+ '_offer'/u);
  // 잔액이 바뀌면 오퍼도 다시 계산한다.
  assert.match(module_, /window\.gpRefreshHeroOffer\(false\)/u);
});

test('메인은 입력창을 화면 중심으로 올리고 모바일에서는 입력을 먼저 크게 보여준다', async () => {
  const [flow, css, index, main] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('assets/css/redesign.css'),
    read('index.html'),
    read('pages/main.html')
  ]);
  const block = css.slice(css.indexOf('lavender v114'));
  assert.ok(block.length > 500, '메인 작업 화면 배치 규칙이 있어야 한다');
  assert.match(block, /\.gp-lav-hero:not\(\.flow-active\)[^{]*\{[\s\S]*?translateY\(clamp\(-190px,-15vh,-120px\)\)/u);
  assert.match(block, /@media\(max-width:760px\)[\s\S]*?\.gp-lav-hero:not\(\.flow-active\)[^{]*\{[\s\S]*?padding:clamp\(20px,3\.5dvh,30px\) 0/u);
  assert.match(block, /@media\(max-width:760px\)[\s\S]*?height:clamp\(180px,30dvh,240px\) !important/u);
  assert.match(block, /font-size:16px/u); // iOS 입력 포커스 확대 방지
  assert.match(block, /\.gp-lav-offer[^{]*\{[\s\S]*?display:grid/u);
  assert.match(flow, /heroOrderMedia = window\.matchMedia\('\(max-width: 760px\)'\)/u);
  assert.match(flow, /anchor\.insertAdjacentElement\('afterend', offer\)/u);
  assert.match(flow, /composer\.insertAdjacentElement\('beforebegin', offer\)/u);
  assert.match(index, /viewport-fit=cover/u);
  const bubble = css.slice(css.indexOf('lavender v115'));
  assert.match(bubble, /\.gp-lav-offer\{[\s\S]*?width:max-content;[\s\S]*?max-width:min\(760px,calc\(100% - 32px\)\)/u);
  assert.match(bubble, /\.gp-lav-offer-tail\{[\s\S]*?bottom:-8px[\s\S]*?z-index:1[\s\S]*?clip-path:polygon\(0 0,100% 0,50% 100%\)/u);
  assert.match(bubble, /@media\(max-width:760px\)[\s\S]*?\.gp-lav-offer-tail\{[\s\S]*?top:-8px[\s\S]*?clip-path:polygon\(50% 0,100% 100%,0 100%\)/u);
  assert.match(main, /class="gp-lav-offer-tail" aria-hidden="true"/u);
});

test('완료 화면은 잔액이 다음 작업 최소치 미만일 때만 사실 기반 충전 안내를 붙인다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  // 결과 액션(복사·다운로드) 아래에 위치한다.
  assert.match(main, /lavDoneDownload\(\)[\s\S]*?id="lavDoneNext"/u);
  assert.match(evasion, /renderDoneNextStep\(st\)/u);
  // 최소치(10) 이상이면 아예 뜨지 않는다.
  assert.match(evasion, /if \(balance >= SHORT_HUMANIZE_MIN_CREDITS\) return;/u);
  // 무제한 플랜·차단 화면에는 없다: 함수는 unlimited에서 빠지고, blocked 마크업엔 결제 유도가 없다.
  assert.match(evasion, /window\.UP === 'unlimited'\) return;/u);
  assert.doesNotMatch(main, /lav-blocked[\s\S]{0,1500}?충전/u);
  // 완료 시점에 서버 잔액으로 최신화한다(비동기 작업 뒤 낡은 잔액 방지).
  assert.match(evasion, /gpConversionContext\(true\)/u);
});

test('감지 보고서의 휴머나이저 이동 버튼 아래에는 비용 정보 한 줄이 붙는다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /lavReportToHumanize\(\)[\s\S]{0,200}?id="lavRepGoCost"/u);
  assert.match(evasion, /renderReportGoCost\(\)/u);
  assert.match(evasion, /이동 후 기본 휴머나이징 /u);
});

test('일반 콘텐츠는 세그먼트 오퍼를 쓰고 FAQ·가이드는 전용 작업 선택기를 사용한다', async () => {
  const flow = await read('assets/js/conversion-flow.js');
  for (const page of ['notice', 'community', 'blog']) {
    const html = await read(`pages/${page}.html`);
    assert.match(html, /data-gp-offer-slot/u, `${page}에 인라인 오퍼 슬롯이 있어야 한다`);
  }
  const faq = await read('pages/faq.html');
  assert.doesNotMatch(faq, /data-gp-offer-slot/u);
  assert.match(faq, /AI 감지 시작/u);
  assert.match(faq, /휴머나이징 시작/u);
  assert.doesNotMatch(flow, /OFFER_PAGES = \['faq'/u);
  const guide = await read('pages/guide.html');
  assert.doesNotMatch(guide, /data-gp-offer-slot/u);
  assert.match(guide, /openProductMode\('detect'\)/u);
  assert.match(guide, /openProductMode\('humanize'\)/u);
  assert.match(guide, /data-tab="pricing" href="\/pricing"/u);
  assert.doesNotMatch(flow, /OFFER_PAGES = \[[^\]]*'guide'/u);
  const pricing = await read('pages/pricing.html');
  assert.doesNotMatch(pricing, /data-gp-offer-slot/u);   // gpPricingSegmentPanel과 중복 금지
  assert.match(flow, /renderInlineOffers/u);
});

test('플로팅 오퍼는 두 세그먼트 한정·지연 노출·세션 닫기·작업 중 차단을 지킨다', async () => {
  const [flow, modal, appMain] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('partials/modals.html'),
    read('assets/js/app-main.js')
  ]);
  assert.match(modal, /id="gpOfferFloat"/u);
  assert.match(flow, /FLOAT_SEGMENTS = \['returning_low_balance', 'trial_engaged'\]/u);
  assert.match(flow, /5000\)/u);                       // 체류 5초
  assert.match(flow, /ratio >= 0\.5/u);                // 또는 스크롤 50%
  assert.match(flow, /gp_offer_float_dismissed_v1/u);  // 닫으면 세션 동안 다시 안 뜸
  assert.match(flow, /lavActiveJob/u);                 // 진행 중 작업이 있으면 차단
  assert.match(appMain, /window\.gpOnTabChange\(t\)/u);
});

test('글쓰기 랩 메뉴는 Pro처럼 준비 중으로 보이고 진입은 관리자만 허용한다', async () => {
  const [main, appMain] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/app-main.js')
  ]);
  // 메뉴: Pro와 같은 연한 처리 + '준비 중' 배지
  assert.match(main, /class="gp-nav-soon" data-tab="writingLab" onclick="openWritingLab\(\)"/u);
  assert.match(main, /data-tab="writingLab"[\s\S]{0,400}?gp-soon-badge">준비 중/u);
  // 진입 가드: URL 직접 입력도 openWritingLab을 거치므로 함께 막힌다
  assert.match(appMain, /function openWritingLab\(\) \{[\s\S]*?window\.isAdmin\(\)\) \{[\s\S]*?준비 중/u);
});

test('오퍼 바는 업그레이드 버튼과 같은 그라데이션 테두리로 바 전체가 강조된다', async () => {
  const css = await read('assets/css/redesign.css');
  const block = css.slice(css.indexOf('오퍼 바 전체 강조'));
  assert.ok(block.length > 100, '오퍼 바 전체 강조 블록이 있어야 한다');
  // 바 전체: 그라데이션 테두리 + 남색 속
  for (const cls of ['gp-lav-offer', 'lav-done-next', 'gp-offer-inline', 'gp-offer-float']) {
    assert.ok(block.includes(`.${cls},`) || block.includes(`.${cls}{`) || block.includes(`.${cls}::before`),
      `${cls} 바 전체에 강조 스타일이 적용돼야 한다`);
  }
  assert.match(block, /linear-gradient\(144deg,#af40ff,#5b42f3 50%,#00ddeb\)/u);   // 업그레이드 버튼과 동일 그라데이션
  assert.match(block, /inset:3px/u);                                               // 테두리형(속은 남색)
  assert.match(block, /rgb\(5,6,45\)/u);
  // CTA도 같은 계열(그라데이션 채움)로 세트를 이룬다
  for (const cls of ['gp-lav-offer-cta', 'gp-lav-estimate-cta', 'lav-done-next-cta', 'gp-offer-inline-cta', 'gp-offer-float-cta']) {
    assert.ok(block.includes(`.${cls}`), `${cls}에 강조 스타일이 적용돼야 한다`);
  }
});

test('비로그인 홈 방문은 새 랜딩으로 가되 광고 딥링크와 로그인 사용자는 앱으로 보낸다', async () => {
  const [landingJs, appMain, loader, boot, index] = await Promise.all([
    read('assets/js/landing.js'),
    read('assets/js/app-main.js'),
    read('assets/js/page-loader.js'),
    read('assets/js/app-boot.js'),
    read('index.html')
  ]);
  assert.match(loader, /'\/pages\/landing\.html'/u);
  assert.match(boot, /landing\.js/u);
  assert.match(index, /landing\.css/u);
  assert.match(appMain, /window\.gpMaybeShowLanding\(\)/u);
  // 광고 딥링크(?mode=)는 기존 의도대로 컴포저 직행.
  assert.match(landingJs, /hasAdLandingMode/u);
  assert.match(landingJs, /if \(hasAdLandingMode\(\)\) return false/u);
  // 로그인 사용자에게 랜딩이 스쳐 지나가지 않도록 authReady 확정 후 판단한다.
  assert.match(landingJs, /window\.authReady[\s\S]*?then\(applyLanding/u);
  assert.match(landingJs, /if \(window\.CU\) return false/u);
});

test('랜딩은 현재 서비스 네 가지와 단가를 사실대로 안내하고 통과를 약속하지 않는다', async () => {
  const landing = await read('pages/landing.html');
  for (const name of ['AI 감지', '기본 휴머나이징', '고급 휴머나이징', '글쓰기 랩']) {
    assert.ok(landing.includes(name), `랜딩에 ${name} 안내가 있어야 한다`);
  }
  assert.match(landing, /100자당 1크레딧/u);
  assert.match(landing, /100자당 2크레딧/u);
  assert.match(landing, /1만자 이하 200크레딧/u);
  assert.match(landing, /가격 확정 전 · 준비 중/u);
  assert.doesNotMatch(landing, /800자 이하 40크레딧/u);
  // 과장 금지: 외부 검사 통과나 점수를 보장하지 않는다고 명시한다.
  assert.match(landing, /보장하지 않아요/u);
  assert.match(landing, /유효기간 없이/u);
  // 구형 시안 마크업을 되살리지 않는다(주석 언급은 허용, 실제 클래스 사용은 금지).
  assert.doesNotMatch(landing, /class="[^"]*gp-main-stage/u);
  assert.doesNotMatch(landing, /class="[^"]*gp-paper-/u);
});

test('홈 프리렌더 본문은 작업 화면이 아니라 랜딩을 크롤러에 노출한다', async () => {
  // 라우트 정의는 단일 원천(scripts/route-meta.mjs)으로 이동(2026-08-28 T2.2)
  const meta = await read('scripts/route-meta.mjs');
  assert.match(meta, /out: 'index\.html',\s*\n\s*url: '\/',\s*\n\s*partial: 'landing\.html'/u);
  const seo = await read('scripts/seo-prerender.mjs');
  assert.match(seo, /from '\.\/route-meta\.mjs'/u);
  // 랜딩이 자체 h1을 가지므로 홈에 h1을 덧붙이지 않는다.
  assert.doesNotMatch(seo, /route\.url === '\/' \|\| !/u);
});

test('충전 사다리는 기준·상품 보너스·기간 이벤트 지급량을 일치시킨다', async () => {
  const [pricing, flow, landing] = await Promise.all([
    read('pages/pricing.html'),
    read('assets/js/conversion-flow.js'),
    read('pages/landing.html')
  ]);
  assert.match(pricing, /payToss\(8700,345,/u);
  assert.match(pricing, /총 345 크레딧/u);
  assert.match(flow, /\{ amount: 8700, paidCredits: 300, packageBonusCredits: 30, eventBonusCredits: 15, credits: 345, label: '라이트' \}/u);
  assert.match(landing, /8,700원<\/b><span>총 345크레딧/u);
  assert.ok(!pricing.includes('plan-discount'), '할인율 배지 재유입');
  assert.match(pricing, /기본 1,000자 1회<\/span><strong>약 504원/u);
});

test('가격 카드는 상시 상품 보너스와 5% 기간 이벤트를 분리해 표시한다', async () => {
  const [pricing, landing, flow, modals] = await Promise.all([
    read('pages/pricing.html'),
    read('pages/landing.html'),
    read('assets/js/conversion-flow.js'),
    read('partials/modals.html')
  ]);
  const rates = [...pricing.matchAll(/9월 이벤트 <em>\(\+(\d+)%\)<\/em>/gu)].map((m) => Number(m[1]));
  assert.deepEqual(rates, [5, 5, 5, 5, 5]);
  assert.deepEqual([...pricing.matchAll(/class="feat-package"[^>]*>[\s\S]*?<strong>\+(\d+)<\/strong>/gu)].map((m) => Number(m[1])), [0, 30, 125, 350, 900]);
  for (const amount of [2900, 8700, 14500, 29000, 58000]) {
    assert.match(pricing, new RegExp(`data-plan-total-for="${amount}"`, 'u'), `${amount} 총 크레딧 훅 부재`);
  }
  for (const surface of [pricing, landing, flow]) {
    assert.match(surface, /2026년 9월 30일까지/u);
    assert.doesNotMatch(surface, /첫 구매|첫 결제|firstPurchase|firstBonus/u);
  }
  const checkoutModal = modals.slice(modals.indexOf('id="gpCreditCheckoutModal"'), modals.indexOf('<!-- 친구 초대 모달 -->'));
  assert.match(checkoutModal, /2026년 9월 30일까지/u);
  assert.doesNotMatch(checkoutModal, /첫 구매|첫 결제|firstPurchase|firstBonus/u);
  assert.ok(!pricing.includes('나눠 사면'), '분할 비교 문구 재유입');
});

test('랜딩 v2는 코다 구조(데모·탭·상황·사실 스트립)를 우리 자산으로 구현한다', async () => {
  const [landing, landingJs, css] = await Promise.all([
    read('pages/landing.html'),
    read('assets/js/landing.js'),
    read('assets/css/landing.css')
  ]);
  // 히어로 라이브 데모: 5장면 마크업 + 진행 스크립트 + 모션 배려
  for (const demo of ['composer', 'estimate', 'analyzing', 'report', 'result']) {
    assert.match(landing, new RegExp(`data-demo="${demo}"`, 'u'), `데모 장면 ${demo}가 있어야 한다`);
  }
  assert.match(landing, /id="landingScreen"[^>]*role="main"/u, '랜딩 본문 landmark');
  assert.equal((landing.match(/<li role="presentation"><button type="button" role="tab"/gu) || []).length, 4, '탭의 목록 래퍼는 presentation 역할');
  assert.match(css, /--lp-muted:#626a86/u, '보조 텍스트 대비 토큰');
  assert.match(css, /--lp-ok:#08785a/u, '성공 상태 대비 토큰');
  assert.match(css, /--lp-warn:#b52f28/u, '주의 상태 대비 토큰');
  assert.match(landing, /실제 이용 흐름을 요약한 예시 화면입니다/u);   // 데모는 예시임을 명시
  assert.match(landingJs, /function demoCycle\(\)/u);
  assert.match(landingJs, /prefers-reduced-motion/u);
  assert.match(landingJs, /IntersectionObserver/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  // 블렌드 탭 4항목 + 실제 화면 자산 + 준비 중 오버레이
  assert.equal((landing.match(/data-blend="\d"/gu) || []).length, 4);
  for (const shot of ['shot-detect', 'shot-composer', 'shot-settings', 'shot-done']) {
    assert.match(landing, new RegExp(`/assets/img/landing/${shot}\\.webp`, 'u'));
  }
  assert.match(landingJs, /window\.gpLandingBlendPick = function/u);
  assert.match(landing, /id="lpBlendSoon"/u);
  // 상황 4종 딥링크 CTA
  for (const src of ['moment_assignment', 'moment_resume', 'moment_thesis', 'moment_blog']) {
    assert.match(landing, new RegExp(`gpLandingStart[(]'${src}'[)]`, 'u'));
  }
  // 날조 금지: 고객사·이용자 수·매체 인용을 지어내지 않는다(사실 스트립으로 대체)
  assert.doesNotMatch(landing, /[0-9,만]+\s*(?:개\s*팀|명이|고객사|기업이)/u);
  assert.match(landing, /전달 가능한 결과를 만들지 못하면<\/b> 차감하지 않아요/u);
});

test('lp 스위치는 랜딩을 강제하거나 건너뛰고 관리자 페이지에서 안내한다', async () => {
  const [landingJs, appModule, admin, boot] = await Promise.all([
    read('assets/js/landing.js'),
    read('assets/js/app-module.js'),
    read('pages/admin.html'),
    read('assets/js/app-boot.js')
  ]);
  assert.match(landingJs, /function landingOverride\(\)/u);
  assert.match(landingJs, /if \(lp === '1'\) return 'force';/u);
  assert.match(landingJs, /if \(lp === '0'\) return 'skip';/u);
  // force는 로그인·이력 검사보다 먼저 평가된다
  assert.match(landingJs, /var override = landingOverride\(\);[\s\S]{0,120}?if \(override === 'force'\)/u);
  // 랜딩에서 시작한 로그인은 인증 성공 직후 강제 lp 값을 제거하고 앱으로 진입한다.
  assert.match(landingJs, /LOGIN_PENDING_KEY/u);
  assert.match(landingJs, /gpLandingCompleteLogin/u);
  assert.match(landingJs, /url\.searchParams\.delete\('lp'\)/u);
  assert.match(appModule, /function showAuthenticatedShell[\s\S]{0,260}?gpLandingCompleteLogin[\s\S]{0,120}?showScreen\('app'\)/u);
  assert.equal((appModule.match(/window\.gpLandingCompleteLogin\(\)/g) || []).length, 1);
  assert.match(boot, /window\.GP_REQUESTED_APP_SCREEN = options\.screen === 'login' \? 'login' : 'app';[\s\S]{0,180}?await Promise\.all/u,
    '랜딩의 로그인 화면 의도는 Firebase 초기 콜백보다 먼저 기록해야 함');
  assert.match(boot, /options\.screen === 'login' && !window\.CU/u,
    '이미 인증된 사용자는 비동기 로드 완료 뒤 로그인 화면으로 되돌리면 안 됨');
  assert.match(appModule, /if \(window\.GP_REQUESTED_APP_SCREEN === 'login'\) \{\s*showScreen\('login'\);/u,
    '최초 비로그인 콜백은 랜딩 CTA가 연 로그인 화면을 덮으면 안 됨');
  // 관리자 페이지: 미리보기 버튼과 광고 링크 지정 안내
  assert.match(admin, /window\.open\('\/\?lp=1', '_blank', 'noopener'\)/u);
  assert.match(admin, /\?lp=0/u);
});

test('익명 홈은 서버 렌더 랜딩을 즉시 활성화하고 앱·인증 자원을 초기 요청하지 않는다', async () => {
  const [build, prerender, loader, boot, landingJs, appModule, appMain, vendors, tracking, index, landingPage] = await Promise.all([
    read('scripts/build-vite-static.mjs'),
    read('scripts/seo-prerender.mjs'),
    read('assets/js/page-loader.js'),
    read('assets/js/app-boot.js'),
    read('assets/js/landing.js'),
    read('assets/js/app-module.js'),
    read('assets/js/app-main.js'),
    read('assets/js/vendor-init.js'),
    read('assets/js/head-tracking.js'),
    read('index.html'),
    read('pages/landing.html')
  ]);

  assert.match(build, /PAGE_BUNDLE_VERSION: 1/u);
  assert.match(build, /async function writePageBundle\(\)/u);
  assert.match(loader, /function fetchText\(url\)/u);
  assert.match(loader, /fetchText\('\/pages\/landing\.html'\)/u);
  assert.match(loader, /querySelector\('#landingScreen'\)/u);
  assert.match(loader, /hydrateLandingDeferred/u);
  assert.match(loader, /template\.content\.cloneNode\(true\)/u);
  assert.match(loader, /fetchText\('\/partials\/app-bundle\.html'\)/u);
  assert.match(loader, /function initialMode\(\)/u);
  assert.match(loader, /firebase:authUser:/u);
  assert.match(loader, /window\.GP_PAGE_READY = mode === 'landing'/u);
  assert.match(loader, /publicMain\.id = 'mainContent'/u, '공개 요금에도 라벤더 레이아웃 범위가 필요함');
  assert.match(loader, /publicMain\.dataset\.mainDesign = 'lavender'/u);
  assert.match(loader, /pricingContent\.style\.display = 'block'/u, '익명 요금 본문을 숨긴 채 두면 안 됨');
  assert.match(appModule, /window\.gpAuthResolved = true/u);
  assert.match(appModule, /if \(u\) \{[\s\S]{0,100}?showAuthenticatedShell\(u, 'auth_state'\);[\s\S]{0,100}?await loadUser\(u\)/u);

  assert.match(boot, /requestIdleCallback\(task, \{ timeout: timeout \|\| 1800 \}\)/u);
  assert.match(boot, /addEventListener\('scroll', start, \{ once: true, passive: true \}\)/u);
  assert.match(boot, /addEventListener\('pointerdown', start, \{ once: true, passive: true \}\)/u);
  assert.doesNotMatch(boot, /setTimeout\(start,/u, '광고 SDK를 수동 방문에서 자동으로 불러오면 안 됨');
  assert.match(boot, /setTimeout\(hydrate, 12000\)/u);
  assert.match(landingJs, /demoStartTimer = setTimeout[\s\S]{0,180}3200/u);
  assert.match(boot, /if \(mode === 'landing'\)[\s\S]*?loadScript\('\/assets\/js\/landing\.js'\)/u);
  assert.doesNotMatch(boot, /script\('https:\/\/cdn\.jsdelivr\.net\/npm\/(?:gsap|vanilla-tilt|countup)/u);
  assert.match(vendors, /window\.gpLoadTossPayments = function/u);
  assert.match(vendors, /5500\);/u);
  assert.match(appMain, /await window\.gpLoadTossPayments\(\)/u);
  assert.match(tracking, /4500\);/u);
  assert.doesNotMatch(index, /<script[^>]+(?:wcs\.naver\.net|js\.tosspayments\.com)/u);
  assert.doesNotMatch(index, /firebase-(?:app|auth|firestore)/u);
  assert.doesNotMatch(index, /assets\/css\/(?:app|redesign|writing-lab)\.css/u);
  assert.doesNotMatch(index, /document\.write|XMLHttpRequest/u);
  assert.match(index, /root\.querySelector\('#landingScreen'\)/u);
  assert.match(index, /runtime-config\.js" defer/u);
  assert.match(index, /app-boot\.js" defer/u);
  assert.match(prerender, /route\.url === '\/' && route\.partial === 'landing\.html'/u);
  assert.match(prerender, /landingDeferredTemplate/u);
  assert.match(prerender, /deferredMarker = '<section class="gp-lp-principle">'/u);
  assert.match(build, /writeHashedAssetManifest/u);
  assert.match(boot, /fetch\('\/asset-manifest\.json'/u);
  assert.match(landingPage, /brand-logo-menu\.webp/u);
});

test('카카오 로그인은 콜백을 즉시 처리하고 메인 전환 중 진행 상태를 명확히 보여준다', async () => {
  const [appModule, appMain, loader, login, css, landingJs, index, boot] = await Promise.all([
    read('assets/js/app-module.js'),
    read('assets/js/app-main.js'),
    read('assets/js/page-loader.js'),
    read('partials/login-screen.html'),
    read('assets/css/app.css'),
    read('assets/js/landing.js'),
    read('index.html'),
    read('assets/js/app-boot.js')
  ]);

  // 모바일 OAuth 리다이렉트는 전체 이미지·폰트 load 이벤트를 기다리지 않는다.
  assert.match(appModule, /queueMicrotask\(\(\) => window\.handleKakaoCallback\(\)\)/u);
  assert.match(appModule, /function isKakaoOAuthCallback\(params\)[\s\S]{0,260}?params\.get\('fail'\) !== '1'[\s\S]{0,180}?!params\.has\('paymentKey'\)/u);
  assert.doesNotMatch(appMain, /location\.search\.includes\('code='\)[\s\S]{0,80}?handleKakaoCallback/u);
  assert.match(loader, /function hasKakaoCallback\(params\)/u);
  assert.match(loader, /dataset\.gpAuthCallback = 'kakao'/u);
  assert.match(loader, /overlay\.hidden = false/u);

  // 팝업이 닫히는 즉시 앱 셸과 차단형 진행 상태를 보여 사용자가 오류로 오해하지 않는다.
  assert.match(appModule, /beginAuthTransition\('kakao', '카카오 로그인 확인 중', '메인 화면을 먼저 준비하고 있어요\.'/u);
  assert.match(login, /id="authTransition"[\s\S]{0,500}?role="status"/u);
  assert.match(login, /id="socialLoginStatus"[^>]+aria-live="polite"/u);
  assert.match(login, /onclick="gpRequestSocialLogin\('google'\)"/u);
  assert.match(login, /onclick="gpRequestSocialLogin\('kakao'\)"/u);
  assert.doesNotMatch(login, /onclick="(?:googleLogin|kakaoLogin)\(\)"/u,
    '인증 모듈이 로드되기 전 직접 전역 함수를 호출하면 가입 버튼이 간헐적으로 실패함');
  assert.match(boot, /window\.gpRequestSocialLogin = async function/u);
  assert.match(boot, /if \(typeof window\[handlerName\] !== 'function'\) await loadAppAssets\(\);/u);
  assert.match(boot, /if \(socialLoginRequestPromise\) return socialLoginRequestPromise;/u,
    '인증 모듈 로드 중 연속 클릭은 한 요청으로 합쳐야 함');
  assert.match(css, /\.gp-auth-transition\{[\s\S]{0,240}?backdrop-filter/u);
  assert.match(css, /\.btn-google:disabled,.btn-kakao:disabled/u);

  // custom token을 우선하되 서버가 명시한 v1 응답만 기존 계정 호환 경로를 사용한다.
  assert.match(appModule, /signInWithCustomToken\(auth, data\.customToken\)/u);
  assert.match(appModule, /data\.authVersion === 1 && data\.kakaoId && data\.email && typeof legacyPasswordFor === 'function'/u);
  assert.match(appModule, /signInOrCreateLegacyKakaoUser\(data, legacyPasswordFor\(data\.kakaoId\)\)/u);
  assert.match(appModule, /function consumeKakaoOAuthState/u);
  assert.match(appModule, /sessionStorage\.removeItem\(KAKAO_OAUTH_STATE_KEY\)/u);
  assert.match(appModule, /const oauthContext = consumeKakaoOAuthState\(params\.get\('state'\)\);[\s\S]{0,80}?if \(!oauthContext\)/u);
  assert.match(appModule, /showAuthenticatedShell\(result\.user, 'kakao_direct'\);[\s\S]{0,100}?syncKakaoProfileInBackground/u);

  // 랜딩에서 로그인 화면으로 이동하기 전 서버는 깨우되 인증 호스트는 초기 HTML에서 연결하지 않는다.
  assert.match(landingJs, /gpWarmAuthBackend/u);
  assert.match(appModule, /fetch\(window\.apiUrl\('\/healthz'\)/u);
  for (const host of ['kauth.kakao.com', 'kapi.kakao.com', 'ai-backend-3xtk.onrender.com']) {
    assert.doesNotMatch(index, new RegExp(`<link rel="preconnect" href="https://${host.replaceAll('.', '\\.')}"`, 'u'));
  }
});

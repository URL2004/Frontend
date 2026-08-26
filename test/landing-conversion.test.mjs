import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
  // 재구매 세그먼트는 지난번 상품으로 바로 결제하고, 클릭 출처는 표면별로 기록한다.
  assert.match(flow, /offerVariant: 'repurchase_previous'[\s\S]*?source: surface \+ '_offer'/u);
  // 잔액이 바뀌면 오퍼도 다시 계산한다.
  assert.match(module_, /window\.gpRefreshHeroOffer\(false\)/u);
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

test('콘텐츠 페이지 본문 끝에 세그먼트 인라인 오퍼 슬롯이 있고 충전 페이지에는 없다', async () => {
  const flow = await read('assets/js/conversion-flow.js');
  for (const page of ['faq', 'notice', 'community', 'guide', 'blog']) {
    const html = await read(`pages/${page}.html`);
    assert.match(html, /data-gp-offer-slot/u, `${page}에 인라인 오퍼 슬롯이 있어야 한다`);
  }
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
  assert.match(landing, /800자 이하 40크레딧/u);
  // 과장 금지: 외부 검사 통과나 점수를 보장하지 않는다고 명시한다.
  assert.match(landing, /보장하지 않습니다/u);
  assert.match(landing, /유효기간 없이/u);
  // 구형 시안 마크업을 되살리지 않는다(주석 언급은 허용, 실제 클래스 사용은 금지).
  assert.doesNotMatch(landing, /class="[^"]*gp-main-stage/u);
  assert.doesNotMatch(landing, /class="[^"]*gp-paper-/u);
});

test('홈 프리렌더 본문은 작업 화면이 아니라 랜딩을 크롤러에 노출한다', async () => {
  const seo = await read('scripts/seo-prerender.mjs');
  assert.match(seo, /out: 'index\.html',\s*\n\s*url: '\/',\s*\n\s*partial: 'landing\.html'/u);
  // 랜딩이 자체 h1을 가지므로 홈에 h1을 덧붙이지 않는다.
  assert.doesNotMatch(seo, /route\.url === '\/' \|\| !/u);
});

test('충전 사다리는 라이트 350으로 단조 할인(-9/-14/-17/-23/-26)을 이룬다', async () => {
  const [pricing, flow, landing] = await Promise.all([
    read('pages/pricing.html'),
    read('assets/js/conversion-flow.js'),
    read('pages/landing.html')
  ]);
  // 라이트 350: 스타터 3회(=330)보다 확실히 낫게 — 죽은 티어 수리(2026-08-26)
  assert.match(pricing, /payToss\(8700,350,/u);
  assert.match(pricing, /총 350 크레딧/u);
  assert.match(flow, /\{ amount: 8700, credits: 350, label: '라이트' \}/u);
  assert.match(landing, /8,700원<\/b><span>350크레딧/u);
  // 할인 표기: 기준가 29원(스타터 순정가) 대비, 커질수록 커지는 단조 사다리
  const badges = [...pricing.matchAll(/plan-discount">(-\d+%)</gu)].map(m => m[1]).slice(0, 5);
  assert.deepEqual(badges, ['-9%', '-14%', '-17%', '-23%', '-26%']);
  // 사용량 표기는 350 기준 내림값과 일치
  assert.match(pricing, /1,000자 글 휴머나이징<strong>17회/u);
  assert.match(pricing, /1,000자 AI 감지<strong>35회/u);
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
  assert.match(landing, /실제 이용 흐름을 요약한 예시 화면입니다/u);   // 데모는 예시임을 명시
  assert.match(landingJs, /function demoCycle\(\)/u);
  assert.match(landingJs, /prefers-reduced-motion/u);
  assert.match(landingJs, /IntersectionObserver/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  // 블렌드 탭 4항목 + 실제 화면 자산 + 준비 중 오버레이
  assert.equal((landing.match(/data-blend="\d"/gu) || []).length, 4);
  for (const shot of ['shot-detect', 'shot-composer', 'shot-settings', 'shot-done']) {
    assert.match(landing, new RegExp(`/assets/img/landing/${shot}\.png`, 'u'));
  }
  assert.match(landingJs, /window\.gpLandingBlendPick = function/u);
  assert.match(landing, /id="lpBlendSoon"/u);
  // 상황 4종 딥링크 CTA
  for (const src of ['moment_assignment', 'moment_resume', 'moment_thesis', 'moment_blog']) {
    assert.match(landing, new RegExp(`gpLandingStart[(]'${src}'[)]`, 'u'));
  }
  // 날조 금지: 고객사·이용자 수·매체 인용을 지어내지 않는다(사실 스트립으로 대체)
  assert.doesNotMatch(landing, /[0-9,만]+\s*(?:개\s*팀|명이|고객사|기업이)/u);
  assert.match(landing, /실패·차단 시 <b>차감 0<\/b>/u);
});

test('lp 스위치는 랜딩을 강제하거나 건너뛰고 관리자 페이지에서 안내한다', async () => {
  const [landingJs, appModule, admin] = await Promise.all([
    read('assets/js/landing.js'),
    read('assets/js/app-module.js'),
    read('pages/admin.html')
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
  assert.match(appModule, /gpLandingCompleteLogin[\s\S]{0,120}?showScreen\('app'\)/u);
  assert.equal((appModule.match(/window\.gpLandingCompleteLogin\(\)/g) || []).length, 2);
  // 관리자 페이지: 미리보기 버튼과 광고 링크 지정 안내
  assert.match(admin, /window\.open\('\/\?lp=1', '_blank', 'noopener'\)/u);
  assert.match(admin, /\?lp=0/u);
});

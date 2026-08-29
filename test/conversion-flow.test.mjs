import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('크레딧 부족 결제창은 작업을 보관하고 주문 번호에 결속한다', async () => {
  const [flow, modal, boot] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('partials/modals.html'),
    read('assets/js/app-boot.js')
  ]);
  assert.match(boot, /conversion-flow\.js/u);
  assert.match(flow, /gp_pending_paid_job_v1/u);
  assert.match(flow, /window\.gpBindPendingCheckout/u);
  assert.match(flow, /pending\.orderId !== orderId/u);
  assert.match(flow, /gp_resumed_paid_job_/u);
  assert.match(modal, /id="gpCreditCheckoutModal"[^>]+role="dialog"[^>]+aria-modal="true"/u);
  assert.match(modal, /id="gpCreditCheckoutSummary"/u);
  assert.match(modal, /id="gpCreditCheckoutPaid"/u);
  assert.match(modal, /id="gpCreditCheckoutEvent"/u);
  assert.doesNotMatch(modal, /gpCreditCheckoutUses/u);
  assert.match(modal, /전달 가능한 결과를 만들지 못하면 크레딧을 차감하지 않아요/u);
  assert.match(modal, /사용량은 기준 크레딧부터 반영/u);
  assert.match(modal, /이벤트 크레딧은 현금 환불 대상이 아니/u);
  assert.match(modal, /해당 주문에 남아 있는 기준·이벤트 크레딧을 모두 회수/u);
  assert.match(flow, /pending\.action === 'pricing_purchase'/u);
  assert.doesNotMatch(flow, /function workUses/u);
});

test('결제 완료 후 지원하는 모든 작업 흐름에 자동 재개 핸들러가 연결된다', async () => {
  const [flow, main, evasion, writing, callbacks] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('assets/js/app-main.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/writing-lab.js'),
    read('assets/js/payment-callbacks.js')
  ]);
  for (const action of ['main_analysis', 'evasion_detect', 'evasion_transform', 'evasion_fallback', 'writing_lab_generate']) {
    assert.match(flow, new RegExp(`${action}:\\s*'gpResume`, 'u'));
  }
  assert.match(main, /window\.gpResumeMainAnalysis/u);
  assert.match(evasion, /window\.gpResumeEvasionDetect/u);
  assert.match(evasion, /window\.gpResumeEvasionTransform/u);
  assert.match(evasion, /window\.gpResumeEvasionFallback/u);
  assert.match(writing, /window\.gpResumeWritingLab/u);
  assert.match(callbacks, /gpHandleCreditPaymentSuccess/u);
});

test('전환 퍼널과 사용자 단계별 제안 이벤트를 개인정보 없이 기록한다', async () => {
  const [flow, main, callbacks, tracking] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('assets/js/app-main.js'),
    read('assets/js/payment-callbacks.js'),
    read('assets/js/head-tracking.js')
  ]);
  const combined = `${flow}\n${main}\n${callbacks}\n${tracking}`;
  for (const event of ['paywall_view', 'starter_offer_click', 'begin_checkout', 'purchase', 'job_resumed']) {
    assert.match(combined, new RegExp(`['"]${event}['"]`, 'u'));
  }
  assert.match(flow, /activation_prompt_view/u);
  assert.match(flow, /repurchase_offer_view/u);
  assert.match(tracking, /paywall_view:\s*'PaywallView'/u);
  assert.match(tracking, /job_resumed:\s*'JobResumed'/u);
  assert.doesNotMatch(flow, /track\([^\n]+(?:text|email|uid):/u);
});

test('가격표 카드는 서비스별로 몇 번 쓸 수 있는지 보여준다', async () => {
  const pricing = await read('pages/pricing.html');
  // 사용량 목록은 카드마다 하나씩(2026-08-29 운영 결정으로 카드 내부 복귀)
  assert.equal((pricing.match(/class="gp-plan-svc"/gu) || []).length, 5, '카드마다 사용량 목록');
  assert.equal((pricing.match(/class="svc-r"/gu) || []).length, 15, '카드 5 × 작업 3종');
  // 상품별 크레딧과 단가가 맞는 횟수(1,000자 기본=20 · 감지=10 · 1만자 고급=200, 내림)
  for (const [credits, basic, detect, formal] of [
    [105, 5, 10, 0], [330, 16, 33, 1], [575, 28, 57, 2], [1200, 60, 120, 6], [2500, 125, 250, 12]
  ]) {
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="20">${basic}회<`, 'u'), `${credits} 기본 횟수`);
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="10">${detect}회<`, 'u'), `${credits} 감지 횟수`);
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="200">${formal}회<`, 'u'), `${credits} 고급 횟수`);
  }
  // 무엇 대비 할인인지 전달되지 않던 배지와, 길어서 읽히지 않던 분할 비교 줄은 제거(2026-08-29)
  assert.ok(!pricing.includes('plan-discount'), '할인율 배지가 되살아남');
  assert.ok(!pricing.includes('plan-vs-starter'), '분할 구매 비교 줄이 되살아남');
  assert.match(pricing, /class="gp-plan-svc-note"/u);
  assert.match(pricing, /id="gpPricingSegmentPanel"/u);
  assert.doesNotMatch(pricing, /plan-unitcost|gp-plan-audience|1크레딧당/u, '단가·추천 상황 문구 재유입');
  assert.equal((pricing.match(/aria-label="기준 [^"]+크레딧과 이벤트 [^"]+크레딧, 총 [^"]+크레딧을 [^"]+원에 충전하기"/gu) || []).length, 5, '결제 버튼마다 기준·이벤트·총 지급량 맥락');
  assert.ok(pricing.indexOf('class="gp-coupon-panel"') > pricing.indexOf('class="gp-pricing-refund"'), '쿠폰 입력은 가격·환불 안내 다음 맨 아래');
  assert.doesNotMatch(pricing, /class="gp-top-actions"|class="pc-fx"|class="pc-tr/u, '중복 상단 버튼 또는 장식 트래커 재유입');
  assert.doesNotMatch(pricing, /class="plan-card[^"]*"[^>]+onclick=/u, '카드 전체 클릭 재유입');
});

test('기간 이벤트 종료·서버 비활성화 시 표시와 결제 스냅샷이 기준 크레딧으로 함께 복귀한다', async () => {
  const [flow, main, pricing, landing, landingJs] = await Promise.all([
    read('assets/js/conversion-flow.js'),
    read('assets/js/app-main.js'),
    read('pages/pricing.html'),
    read('pages/landing.html'),
    read('assets/js/landing.js')
  ]);
  assert.match(flow, /CREDIT_EVENT_ENDS_AT_MS = Date\.parse\('2026-10-01T00:00:00\+09:00'\)/u);
  assert.match(flow, /eventDeclaredInactive[\s\S]*?context\.creditEvent\.active === false/u);
  assert.match(flow, /eventPanel\.hidden = !anyEvent/u);
  assert.match(flow, /window\.gpCreditOfferForAmount = async function/u);
  assert.equal((pricing.match(/data-plan-amount="\d+"/gu) || []).length, 5, '서버 오퍼를 덮어쓸 상품 키 5개');

  assert.match(main, /await window\.gpCreditOfferForAmount\(amount, true\)/u);
  assert.match(main, /creditGrantPolicyVersion: grant \? CREDIT_GRANT_POLICY_VERSION/u);
  assert.match(main, /eventCredits > 0/u);

  assert.match(landing, /id="lpCreditEvent"/u);
  assert.equal((landing.match(/data-paid-credits="\d+" data-event-credits="\d+"/gu) || []).length, 5, '랜딩 상품 5개');
  assert.match(landingJs, /function syncLandingCreditEvent/u);
  assert.match(landingJs, /eventNotice\.hidden = true/u);
});

test('직접 충전 확인창은 금액·지급 구성·환불 기준을 구조화해 보여준다', async () => {
  const [main, feedback] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/ui-feedback.js')
  ]);
  assert.match(feedback, /renderDialogSummary\(opts\.summary\)/u);
  assert.match(main, /summary:\s*purchaseSummary/u);
  assert.match(main, /label:\s*'결제 금액'/u);
  assert.match(main, /label:\s*'기준 크레딧'/u);
  assert.match(main, /label:\s*'이벤트 크레딧'/u);
  assert.match(main, /label:\s*'총 지급'[\s\S]{0,80}?emphasis:\s*true/u);
  assert.match(main, /safeText:/u);
  assert.match(main, /note:\s*refundNotice/u);
  assert.match(main, /원 결제하기/u);
  assert.doesNotMatch(main, /title:\s*'구매를 진행할까요\?'/u);
});

test('요금 카드는 넓은 화면에서 다섯 상품을 한 줄에 펼치고 작은 화면에서도 같은 가로 순서를 유지한다', async () => {
  const [pricing, css, boot, loader, appMain] = await Promise.all([
    read('pages/pricing.html'),
    read('assets/css/redesign.css'),
    read('assets/js/app-boot.js'),
    read('assets/js/page-loader.js'),
    read('assets/js/app-main.js')
  ]);
  assert.match(pricing, /id="gpPlanList"[^>]+role="region"[^>]+aria-label="크레딧 충전 상품 5개"[^>]+tabindex="0"/u);
  assert.doesNotMatch(pricing, /data-pricing-carousel-control|gpPlanPosition|aria-roledescription="캐러셀"/u, '별도 캐러셀 조작 UI 없음');
  assert.match(css, /\.gp-plan-grid\{[\s\S]{0,180}?display:grid !important;[\s\S]{0,100}?grid-template-columns:repeat\(5,minmax\(0,1fr\)\) !important/u, '데스크톱 5열');
  assert.match(css, /@media\(max-width:1180px\)[\s\S]{0,520}?\.gp-plan-grid\{[\s\S]{0,180}?display:flex !important/u, '작은 화면은 같은 가로 순서로 스크롤');
  assert.match(css, /container-name:pricing-plans;[\s\S]{0,120}?container-type:inline-size;[\s\S]{0,1400}?@container pricing-plans \(max-width:999px\)[\s\S]{0,260}?\.gp-plan-grid\{[\s\S]{0,180}?display:flex !important/u, '사이드바로 본문이 좁은 PC도 카드 가독성 보호');
  assert.match(css, /flex:0 0 280px/u, '스크롤 카드의 읽기 가능한 최소 폭');
  assert.match(css, /flex-basis:clamp\(280px,calc\(100vw - 92px\),298px\)/u, '모바일 카드 폭');
  assert.match(css, /scroll-snap-type:x mandatory/u);
  assert.doesNotMatch(css, /\.gp-plan-grid \.plan-card:nth-child/u, '줄 배치용 카드 순번 규칙 재유입');
  assert.doesNotMatch(`${boot}\n${loader}\n${appMain}`, /pricing-carousel|gpEnsurePricingCarousel/u, '삭제한 캐러셀 런타임 재유입');
  assert.doesNotMatch(css, /pcLineGrow|pcScan|pcFloat|\.pc-tr|\.pc-fx/u, '사이버 카드 장식 재유입');
  assert.doesNotMatch(css, /@media\(max-width:(?:1240|860)px\)/u, '비표준 중단점이 되살아남');
  assert.match(css, /\.gp-plan-grid \.plan-popular,[\s\S]{0,120}?transform:none !important/u, '인기 카드 돌출 제거');
  // 내비 앵커 밑줄 제거(button→a 전환 후 브라우저 기본 밑줄이 살아나던 문제)
  assert.match(css, /\.gp-lav-menu a,\.gp-lav-side-link,\.gp-footer-links a,a\.mnav-btn,a\.snav-btn\{text-decoration:none;\}/u);
});

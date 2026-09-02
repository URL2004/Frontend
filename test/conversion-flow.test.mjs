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
  assert.match(flow, /meta\.purchaseKind !== 'credit_package'/u);
  assert.match(flow, /window\.gpPendingCheckoutContract/u);
  assert.match(flow, /pending\.orderId !== orderId/u);
  assert.match(flow, /gp_resumed_paid_job_/u);
  assert.match(modal, /id="gpCreditCheckoutModal"[^>]+role="dialog"[^>]+aria-modal="true"/u);
  assert.match(modal, /id="gpCreditCheckoutSummary"/u);
  assert.match(modal, /id="gpCreditCheckoutPaid"/u);
  assert.match(modal, /id="gpCreditCheckoutPackage"/u);
  assert.match(modal, /id="gpCreditCheckoutEvent"/u);
  assert.doesNotMatch(modal, /gpCreditCheckoutUses/u);
  assert.match(modal, /전달 가능한 결과를 만들지 못하면 크레딧을 차감하지 않아요/u);
  assert.match(modal, /서면 또는 전자문서로 계약 내용을 받은 날부터 7일/u);
  assert.match(modal, /각 주문 안에서는 기준 크레딧을 먼저 사용/u);
  assert.match(modal, /같은 주문의 남은 추가 크레딧은 함께 회수/u);
  assert.match(modal, /관계 법령상 환불·취소 사유는 별도로 확인/u);
  assert.match(flow, /pending\.action === 'pricing_purchase'/u);
  assert.match(flow, /context\.starterUpgradeEnabled === true \? context\.upgradeOffer : null/u, '서버가 활성화하기 전 업그레이드 UI는 숨김');
  const pricingAction = flow.slice(
    flow.indexOf('window.gpPricingSegmentAction = async function'),
    flow.indexOf('window.gpRefreshPricingOffer = async function')
  );
  assert.match(pricingAction, /panel\.dataset\.action === 'recommendation'/u, '사용량 추천 버튼은 가격표 동작에서 처리');
  assert.match(pricingAction, /panel\.dataset\.action === 'upgrade'/u, '업그레이드 버튼은 가격표 동작에서 처리');
  const heroAction = flow.slice(flow.indexOf('async function runOfferAction'), flow.indexOf('window.gpHeroOfferAction'));
  assert.doesNotMatch(heroAction, /panel\.dataset/u, '히어로 CTA에서 가격표 panel 변수를 잘못 참조하지 않음');
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
  for (const event of ['paywall_view', 'pricing_policy_view', 'starter_offer_click', 'begin_checkout', 'purchase', 'job_resumed']) {
    assert.match(combined, new RegExp(`['"]${event}['"]`, 'u'));
  }
  assert.match(flow, /activation_prompt_view/u);
  assert.match(flow, /repurchase_offer_view/u);
  assert.match(tracking, /paywall_view:\s*'PaywallView'/u);
  assert.match(tracking, /job_resumed:\s*'JobResumed'/u);
  assert.doesNotMatch(flow, /track\([^\n]+(?:text|email|uid):/u);
});

test('가격표 카드는 가격→총 지급량→스타터 비교→기본 1,000자 기준 금액 순으로 비교한다', async () => {
  const [pricing, css, flow] = await Promise.all([
    read('pages/pricing.html'),
    read('assets/css/redesign.css'),
    read('assets/js/conversion-flow.js')
  ]);
  assert.equal((pricing.match(/data-plan-efficiency/gu) || []).length, 5, '카드마다 기준 금액 한 줄');
  for (const value of [590, 446, 414, 387, 374]) assert.match(pricing, new RegExp(`기본 1,000자 1회<\\/span><strong>약 ${value}원`, 'u'));
  // 5,900원 시작 상품은 상위 상품의 정수배가 아니므로 '같은 금액을 스타터 단가로 샀을 때' 대비 상시 지급량 차이로 비교한다.
  assert.match(pricing, /스타터 단가 대비<\/span><strong>기준 상품<\/strong>/u);
  assert.match(pricing, /스타터 단가 대비<\/span><strong>\+133 크레딧<\/strong>/u);
  assert.match(pricing, /스타터 단가 대비<\/span><strong>\+934 크레딧<\/strong>/u);
  assert.match(pricing, /class="gp-plan-compare-note">[^<]*기준 크레딧 1개당 29\.5원/u);
  assert.equal((pricing.match(/data-plan-total-value/gu) || []).length, 5, '최종 지급량은 별도 값으로 강조');
  assert.doesNotMatch(pricing, /총 [\d,]+ 크레딧 · \d+% 추가/u, '총 지급량 옆에 추가 지급처럼 읽히는 비율을 붙이지 않는다');
  assert.equal((pricing.match(/class="feat-package"/gu) || []).length, 5, '상품 보너스 0도 같은 행으로 보여 카드 구조를 통일');
  assert.equal((pricing.match(/class="gp-plan-breakdown" open/gu) || []).length, 5, '지급 구성은 카드마다 기본으로 펼쳐 표시');
  assert.match(css, /#pricingContent \.plan-card\{[\s\S]*?min-height:480px/u, '다섯 카드의 최소 높이를 통일');
  assert.match(flow, /totalValue\.textContent = '총 ' \+ format\(plan\.credits\) \+ ' 크레딧'/u);
  assert.doesNotMatch(flow, /combinedRate/u, '총 지급량 표면에 합산 보너스 비율 재유입');
  assert.doesNotMatch(pricing, /이 크레딧으로 할 수 있는 일|1,000자 AI 감지|1만자 고급/u, '용도별 장문 목록 재유입');
  // 무엇 대비 할인인지 전달되지 않던 별도 할인율 배지는 제거한다.
  assert.ok(!pricing.includes('plan-discount'), '할인율 배지가 되살아남');
  assert.ok(!pricing.includes('plan-vs-starter'), '구형 분할 구매 컴포넌트가 되살아남');
  assert.match(pricing, /class="gp-plan-svc-note"/u);
  // 안내문은 데스크톱 한 줄에 들어가야 한다 — 길어지면 다시 두 줄로 접힌다
  assert.ok(
    (pricing.match(/class="gp-plan-svc-note">([^<]+)</u)?.[1] || '').length <= 56,
    '충전 안내문이 한 줄을 넘길 길이로 늘어남'
  );
  assert.match(pricing, /id="gpPricingSegmentPanel"/u);
  assert.doesNotMatch(pricing, /plan-unitcost|gp-plan-audience|1크레딧당/u, '단가·추천 상황 문구 재유입');
  assert.equal((pricing.match(/class="plan-btn"/gu) || []).length, 4, '결제 버튼 4개(일반 3 + 맥스)');
  assert.equal((pricing.match(/class="plan-btn plan-btn-inquiry"/gu) || []).length, 1, '팀·기관은 문의 버튼 1개');
  assert.match(pricing, /<a class="plan-btn plan-btn-inquiry" data-tab="qna" data-tab-call="gpPrefillQuestion" data-tab-arg="팀·기관 요금제 문의" href="\/qna"/u, '문의 버튼은 고객센터(1:1 문의) 실링크 + 제목 사전입력');
  const appMain = await read('assets/js/app-main.js');
  assert.match(appMain, /window\.gpPrefillQuestion = gpPrefillQuestion;/u, '문의 사전입력 함수 노출');
  assert.match(appMain, /팀·기관 요금제\(116,000원 · 6,200크레딧\) 문의드려요/u);
  assert.equal((pricing.match(/aria-label="[^"]*기준 [^"]+총 [^"]+크레딧을 [^"]+원에 충전하기"/gu) || []).length, 4, '결제 버튼마다 기준·추가·총 지급량 맥락');
  assert.ok(pricing.indexOf('class="gp-coupon-panel"') > pricing.indexOf('id="gpPlanList"'), '쿠폰 입력은 가격 카드 다음 맨 아래');
  assert.doesNotMatch(pricing, /class="gp-top-actions"|class="pc-fx"|class="pc-tr/u, '중복 상단 버튼 또는 장식 트래커 재유입');
  assert.doesNotMatch(pricing, /class="plan-card[^"]*"[^>]+onclick=/u, '카드 전체 클릭 재유입');
});

test('기간 이벤트 종료·서버 비활성화 시 상시 상품 보너스는 유지하고 이벤트만 제거한다', async () => {
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
  assert.match(flow, /eventRow\.hidden = !anyEvent/u, '행사 중에는 스타터 0% 행도 보이고 종료 후에는 모든 이벤트 행을 숨긴다');
  assert.match(flow, /plan\.amount === 5900 \|\| eventDeclaredInactive \? 0/u, '구형 서버 응답도 스타터 이벤트를 되살리지 않는다');
  assert.match(flow, /if \(plan\.amount === 5900 \|\| eventDeclaredInactive\) total = paid \+ packageBonus/u);
  assert.match(flow, /if \(anyEvent\) parts\.push\('개강 이벤트 ' \+ format\(plan\.eventBonusCredits\) \+ '크레딧'\)/u, '행사 중 스타터 aria-label에도 0크레딧을 명시한다');
  assert.match(flow, /window\.gpCreditOfferForAmount = async function/u);
  assert.equal((pricing.match(/data-plan-amount="\d+"/gu) || []).length, 4, '서버 오퍼를 덮어쓸 상품 키 4개(문의 전용 제외)');
  assert.match(flow, /function syncInquiryCard\(eventActive\)/u, '문의 전용 카드도 이벤트 종료를 따라간다');

  assert.match(main, /await window\.gpCreditOfferForAmount\(amount, true\)/u);
  assert.match(main, /creditGrantPolicyVersion: grant \? CREDIT_GRANT_POLICY_VERSION/u);
  assert.match(main, /eventCredits > 0/u);

  assert.match(landing, /id="lpCreditEvent"/u);
  assert.match(landing, /data-paid-credits="200" data-package-credits="0" data-event-credits="0"/u);
  assert.equal((landing.match(/data-paid-credits="\d+" data-package-credits="\d+" data-event-credits="\d+"/gu) || []).length, 5, '랜딩 상품 5개');
  assert.match(landingJs, /function syncLandingCreditEvent/u);
  assert.match(landingJs, /eventNotice\.hidden = true/u);
  assert.match(landingJs, /ongoingTotal = paid \+ packageBonus/u);
});

test('직접 충전 확인창은 금액·지급 구성·환불 기준을 구조화해 보여준다', async () => {
  const [main, feedback, css] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/ui-feedback.js'),
    read('assets/css/redesign.css')
  ]);
  assert.match(feedback, /renderDialogSummary\(opts\.summary\)/u);
  assert.match(main, /summary:\s*purchaseSummary/u);
  assert.match(main, /label:\s*'결제 금액'/u);
  assert.match(main, /label:\s*'기준 크레딧'/u);
  assert.match(main, /label:\s*'상품 보너스'/u);
  assert.match(main, /label:\s*'개강 이벤트 추가'/u);
  assert.match(main, /label:\s*'총 지급'[\s\S]{0,80}?emphasis:\s*true/u);
  assert.match(main, /safeText:/u);
  assert.match(main, /note:\s*refundNotice/u);
  assert.match(main, /variant:\s*'purchase'/u);
  assert.match(main, /원 결제하기/u);
  assert.match(css, /\.gp-dialog-root\.variant-purchase \.gp-dialog-card\{width:min\(500px,100%\);\}/u);
  assert.match(css, /grid-template-columns:120px 220px;justify-content:end/u, '결제 버튼 글자가 가장자리에 붙지 않는 고정 폭');
  assert.match(css, /@media\(max-width:480px\)[\s\S]{0,180}?variant-purchase[\s\S]{0,120}?column-reverse/u, '작은 화면은 버튼을 세로 배치');
  assert.doesNotMatch(main, /title:\s*'구매를 진행할까요\?'/u);
});

test('요금 카드는 넓은 화면에서 한 묶음(일반 3종)을 한 줄에 펼치고 작은 화면에서도 같은 가로 순서를 유지한다', async () => {
  const [pricing, css, boot, loader, appMain] = await Promise.all([
    read('pages/pricing.html'),
    read('assets/css/redesign.css'),
    read('assets/js/app-boot.js'),
    read('assets/js/page-loader.js'),
    read('assets/js/app-main.js')
  ]);
  assert.match(pricing, /id="gpPlanList"[^>]+role="tabpanel"[^>]+aria-label="일반 요금제 상품 3개"[^>]+tabindex="0"/u);
  assert.match(pricing, /id="gpPlanListBulk"[^>]+role="tabpanel"[^>]+aria-label="대용량 요금제 상품 2개"[^>]+tabindex="0" hidden>/u, '대용량 묶음은 탭으로 숨겨 시작');
  assert.match(pricing, /role="tablist" aria-label="요금제 구분"[\s\S]{0,400}?id="gpPlanTabRegular"[^>]+aria-selected="true"[^>]+tabindex="0"[\s\S]{0,400}?id="gpPlanTabBulk"[^>]+aria-selected="false"[^>]+tabindex="-1"/u, '초기 활성 탭만 키보드 탭 순서에 둔다');
  assert.match(pricing, /id="gpPlanBulkStrip"[^>]+onclick="gpPlanGroup\('bulk'\)"[^>]+data-regular-title="대용량 요금제 · 58,000원부터"/u, '띠 배너가 반대쪽 묶음의 시작 가격을 노출');
  assert.match(css, /\.gp-plan-grid\[hidden\]\{display:none !important;\}/u, 'display:grid !important가 [hidden]을 덮는 사고 방지 가드');
  assert.match(pricing, /class="plan-card plan-popular"[\s\S]*?class="plan-card plan-premium"/u, '스탠다드가 일반 묶음, 맥스가 대용량 묶음');
  assert.doesNotMatch(pricing, /data-pricing-carousel-control|gpPlanPosition|aria-roledescription="캐러셀"/u, '별도 캐러셀 조작 UI 없음');
  assert.match(css, /\.gp-plan-grid\{[\s\S]{0,180}?display:grid !important;[\s\S]{0,100}?grid-template-columns:repeat\(3,minmax\(0,1fr\)\) !important/u, '데스크톱 3열');
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
  assert.match(pricing, /class="plan-card plan-popular"[\s\S]{0,120}?class="plan-badge">가성비 추천</u, '스탠다드는 사실 기반 추천 라벨을 유지');
  assert.match(css, /\.plan-card\.plan-popular\{[\s\S]{0,100}?border:2px solid var\(--brand\) !important/u, '스탠다드는 선택 상태가 아닌 추천 테두리로 강조');
  assert.match(css, /\.plan-card\.plan-popular \.plan-badge\{[\s\S]{0,100}?background:var\(--brand\) !important;[\s\S]{0,80}?color:#fff !important/u, '추천 이유는 별도 배지로 구분');
  // 내비 앵커 밑줄 제거(button→a 전환 후 브라우저 기본 밑줄이 살아나던 문제)
  assert.match(css, /\.gp-lav-menu a,\.gp-lav-side-link,\.gp-footer-links a,a\.mnav-btn,a\.snav-btn\{text-decoration:none;\}/u);
});

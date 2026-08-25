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
  assert.match(modal, /작업 실패 시 크레딧은 차감되지 않습니다/u);
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

test('가격표는 크레딧과 함께 예상 기본 휴머나이징 횟수를 보여준다', async () => {
  const pricing = await read('pages/pricing.html');
  assert.equal((pricing.match(/class="gp-plan-use"/gu) || []).length, 5);
  assert.equal((pricing.match(/class="gp-plan-use"[^>]*id="gpStarterUseEstimate"/gu) || []).length, 1);
  assert.match(pricing, /500자 기본 휴머나이징 약 11회/u);
  assert.match(pricing, /500자 기본 휴머나이징 약 270회/u);
  assert.match(pricing, /id="gpPricingSegmentPanel"/u);
});

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
  assert.match(modal, /전달 가능한 결과를 만들지 못하면 크레딧을 차감하지 않아요/u);
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
  // 2026-08-29: 카드마다 반복하던 사용량 블록을 카드 밖 공용 비교표 하나로 합쳤다
  // (카드 5장이 두 줄로 접히며 아래 내용이 스크롤 밖으로 밀리고 뱃지가 겹치던 문제 해소).
  assert.equal((pricing.match(/class="gp-plan-svc"/gu) || []).length, 1, '사용량 비교표는 하나여야 한다');
  assert.ok(!pricing.includes('class="svc-r"'), '카드 안 반복 사용량 줄이 남아 있음');
  assert.equal((pricing.match(/class="svc-row"/gu) || []).length, 3, '작업 3종 행');
  // 상품별 크레딧과 단가가 맞는 횟수(1,000자 기본=20 · 감지=10 · 1만자 고급=200, 내림)
  for (const [credits, basic, detect, formal] of [
    [110, 5, 11, 0], [400, 20, 40, 2], [700, 35, 70, 3], [1500, 75, 150, 7], [3300, 165, 330, 16]
  ]) {
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="20">${basic}회<`, 'u'), `${credits} 기본 횟수`);
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="10">${detect}회<`, 'u'), `${credits} 감지 횟수`);
    assert.match(pricing, new RegExp(`data-plan-credits="${credits}" data-work-cost="200">${formal}회<`, 'u'), `${credits} 고급 횟수`);
  }
  assert.match(pricing, /class="gp-plan-svc-note"/u);
  assert.match(pricing, /id="gpPricingSegmentPanel"/u);
});

test('요금 카드는 한 줄 배치와 겹침 방지 규칙을 갖는다', async () => {
  // 운영 확인 2026-08-29: 5장이 두 줄로 접혀 아래 내용이 안 보이고 카드가 겹쳤다
  const css = await read('assets/css/redesign.css');
  assert.match(css, /\.gp-plan-grid\{\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\) !important/u);
  assert.match(css, /@media\(max-width:1180px\)[\s\S]{0,500}?nth-last-child\(-n\+2\)\{grid-column:span 3;\}/u, '3+2 균형 배치');
  assert.match(css, /@media\(max-width:760px\)[\s\S]{0,500}?\.plan-card:last-child\{grid-column:1 \/ -1;\}/u, '2+2+1 균형 배치');
  assert.doesNotMatch(css, /@media\(max-width:(?:1240|860)px\)/u, '비표준 중단점이 되살아남');
  assert.match(css, /\.gp-plan-grid \.plan-popular,[\s\S]{0,120}?transform:none !important/u, '인기 카드 돌출 제거');
  // 내비 앵커 밑줄 제거(button→a 전환 후 브라우저 기본 밑줄이 살아나던 문제)
  assert.match(css, /\.gp-lav-menu a,\.gp-lav-side-link,\.gp-footer-links a,a\.mnav-btn,a\.snav-btn\{text-decoration:none;\}/u);
});

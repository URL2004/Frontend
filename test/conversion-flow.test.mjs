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
  // 사용량 목록은 카드마다 하나씩(2026-08-29 운영 결정으로 카드 내부 복귀)
  assert.equal((pricing.match(/class="gp-plan-svc"/gu) || []).length, 5, '카드마다 사용량 목록');
  assert.equal((pricing.match(/class="svc-r"/gu) || []).length, 15, '카드 5 × 작업 3종');
  // 상품별 크레딧과 단가가 맞는 횟수(1,000자 기본=20 · 감지=10 · 1만자 고급=200, 내림)
  for (const [credits, basic, detect, formal] of [
    [110, 5, 11, 0], [400, 20, 40, 2], [700, 35, 70, 3], [1500, 75, 150, 7], [3300, 165, 330, 16]
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
  assert.equal((pricing.match(/class="gp-plan-audience"/gu) || []).length, 5, '상품마다 추천 사용 상황');
  assert.equal((pricing.match(/aria-label="총 [^"]+크레딧을 [^"]+원에 충전하기"/gu) || []).length, 5, '결제 버튼마다 상품 맥락 이름');
  assert.doesNotMatch(pricing, /class="gp-top-actions"|class="pc-fx"|class="pc-tr/u, '중복 상단 버튼 또는 장식 트래커 재유입');
  assert.doesNotMatch(pricing, /class="plan-card[^"]*"[^>]+onclick=/u, '카드 전체 클릭 재유입');
});

test('요금 카드는 읽기 가능한 같은 너비의 3+2 · 2+2+1 · 1열 배치를 갖는다', async () => {
  const css = await read('assets/css/redesign.css');
  assert.match(css, /\.gp-plan-grid\{\s*grid-template-columns:repeat\(6,minmax\(0,1fr\)\) !important/u, '데스크톱 6트랙');
  assert.match(css, /\.gp-plan-grid \.plan-card\{grid-column:span 2;\}/u, '상품 3열 동폭');
  assert.match(css, /\.gp-plan-grid \.plan-card:nth-child\(4\)\{grid-column:2 \/ span 2;\}/u, '둘째 줄 중앙 시작');
  assert.match(css, /\.gp-plan-grid \.plan-card:nth-child\(5\)\{grid-column:4 \/ span 2;\}/u, '둘째 줄 중앙 종료');
  assert.match(css, /@media\(max-width:960px\)[\s\S]{0,600}?grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important/u, '중간 화면 2열');
  assert.match(css, /@media\(max-width:960px\)[\s\S]{0,600}?nth-child\(5\)\{\s*grid-column:1 \/ -1;\s*width:calc\(50% - 8px\);/u, '마지막 상품 같은 너비 중앙 정렬');
  assert.match(css, /@media\(max-width:560px\)[\s\S]{0,500}?grid-template-columns:1fr !important/u, '모바일 1열');
  assert.match(css, /@media\(max-width:560px\)[\s\S]{0,500}?nth-child\(5\)\{\s*grid-column:auto;\s*width:100%;/u, '모바일 마지막 상품 폭 복원');
  assert.doesNotMatch(css, /\.gp-plan-grid\{\s*grid-template-columns:repeat\(5,/u, '읽을 수 없는 5열 재유입');
  assert.doesNotMatch(css, /pcLineGrow|pcScan|pcFloat|\.pc-tr|\.pc-fx/u, '사이버 카드 장식 재유입');
  assert.doesNotMatch(css, /@media\(max-width:(?:1240|860)px\)/u, '비표준 중단점이 되살아남');
  assert.match(css, /\.gp-plan-grid \.plan-popular,[\s\S]{0,120}?transform:none !important/u, '인기 카드 돌출 제거');
  // 내비 앵커 밑줄 제거(button→a 전환 후 브라우저 기본 밑줄이 살아나던 문제)
  assert.match(css, /\.gp-lav-menu a,\.gp-lav-side-link,\.gp-footer-links a,a\.mnav-btn,a\.snav-btn\{text-decoration:none;\}/u);
});

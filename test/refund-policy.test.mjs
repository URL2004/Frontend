import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleSource = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
const modalSource = fs.readFileSync(new URL('../partials/modals.html', import.meta.url), 'utf8');
const pricingSource = fs.readFileSync(new URL('../pages/pricing.html', import.meta.url), 'utf8');
const landingSource = fs.readFileSync(new URL('../pages/landing.html', import.meta.url), 'utf8');
const guideSource = fs.readFileSync(new URL('../pages/guide.html', import.meta.url), 'utf8');
const faqSource = fs.readFileSync(new URL('../pages/faq.html', import.meta.url), 'utf8');

function loadRefundHelpers() {
  const start = moduleSource.indexOf("const REFUND_POLICY_VERSION = 'credit-grant-base-v1';");
  const end = moduleSource.indexOf('// 두 컬렉션의 결제 내역 통합 조회', start);
  assert.ok(start >= 0 && end > start, '환불 정책 헬퍼 블록을 찾을 수 있어야 한다');
  const context = {};
  vm.runInNewContext(`${moduleSource.slice(start, end)}\n` +
    'globalThis.refundHelpers = { REFUND_POLICY_VERSION, REFUND_WINDOW_MS, gpCreditRefundPreview, gpSubscriptionRefundPreview };', context);
  return context.refundHelpers;
}

test('신규 주문은 기준 크레딧 우선 사용·잔여 지급량 전부 회수로 계산한다', () => {
  const helpers = loadRefundHelpers();
  assert.equal(helpers.REFUND_POLICY_VERSION, 'credit-grant-base-v1');
  assert.equal(helpers.REFUND_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
  const order = {
    amount: 58000,
    paidCredits: 2000,
    eventBonusCredits: 500,
    totalGrantedCredits: 2500,
    creditGrantPolicyVersion: 'credit-grant-base-v1'
  };
  assert.deepEqual(
    { ...helpers.gpCreditRefundPreview(order, 2000) },
    {
      policy: 'base', refundAmount: 43500, recoverCredits: 2000, usedCredits: 500,
      paidUsedCredits: 500, refundablePaidCredits: 1500, paidCredits: 2000,
      eventBonusCredits: 500, totalGrantedCredits: 2500
    }
  );
  assert.equal(helpers.gpCreditRefundPreview(order, 2500).refundAmount, 58000);
  assert.equal(helpers.gpCreditRefundPreview(order, 500).refundAmount, 0);
  assert.equal(helpers.gpCreditRefundPreview(order, 500).recoverCredits, 500);
});

test('주문별 잔여 필드가 있으면 계정 전체 잔액보다 우선해 환불한다', () => {
  const helpers = loadRefundHelpers();
  const order = {
    amount: 58000,
    paidCredits: 2000,
    eventBonusCredits: 500,
    totalGrantedCredits: 2500,
    creditGrantPolicyVersion: 'credit-grant-base-v1',
    refundPaidCreditsRemaining: 1200,
    refundEventBonusCreditsRemaining: 500
  };
  assert.deepEqual(
    { ...helpers.gpCreditRefundPreview(order, 9999) },
    {
      policy: 'base', refundAmount: 34800, recoverCredits: 1700, usedCredits: 800,
      paidUsedCredits: 800, refundablePaidCredits: 1200, paidCredits: 2000,
      eventBonusCredits: 500, totalGrantedCredits: 2500
    }
  );
});

test('기존 주문은 주문 당시 총 지급량 기준 비례 계산을 유지한다', () => {
  const helpers = loadRefundHelpers();
  assert.deepEqual(
    { ...helpers.gpCreditRefundPreview({ amount: 29000, safeCredits: 1300 }, 1040) },
    {
      policy: 'legacy', refundAmount: 23200, recoverCredits: 1040, refundableCredits: 1040,
      usedCredits: 260, totalGrantedCredits: 1300
    }
  );
  assert.deepEqual(
    { ...helpers.gpSubscriptionRefundPreview({ amount: 54900, tier: '5000' }, { granted: 50, remaining: 45, used: 5 }) },
    { refundAmount: 49410, usedCount: 5, refundableUses: 45, settlementUses: 50 }
  );
  assert.equal(
    helpers.gpSubscriptionRefundPreview({ amount: 290000, tier: 'unlimited' }, { granted: -1, remaining: -1, used: 2 }).refundAmount,
    278400
  );
});

test('환불 버튼은 크레딧과 구독 모두 7일을 검사하고 사용 횟수를 읽는다', () => {
  assert.match(moduleSource, /else if \(!within7\)/u);
  assert.match(moduleSource, /결제일로부터 7일이 지났습니다/u);
  assert.match(moduleSource, /used: d\.coupon\.used \|\| 0/u);
  assert.match(moduleSource, /window\.requestRefund\('\$\{item\.id\}','\$\{item\.kind\}',\$\{refundAmount\}\)/u);
  assert.match(mainSource, /window\.COUPON\.used = Math\.max\(0, Number\(window\.COUPON\.used\) \|\| 0\) \+ 1/u);
});

test('이용약관과 환불규정은 유효기간·환불기간 및 3영업일 처리를 구분한다', () => {
  // 2026-08-28 약관 개정(D2): 크레딧 만료 로직이 없고 전 마케팅 표면이 무기한 표기 → 약관도 무기한으로 통일
  assert.match(mainSource, /유료로 충전한 기준 크레딧과 결제 이벤트로 추가 지급된 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  assert.match(mainSource, /2026년 9월 30일까지 결제 요청분/u);
  assert.match(mainSource, /기준 크레딧부터 먼저 차감/u);
  assert.match(mainSource, /남아 있는 기준·이벤트 크레딧을 모두 회수/u);
  assert.match(mainSource, /시행일: 2026년 8월 29일/u);
  assert.doesNotMatch(mainSource, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u);
  assert.match(mainSource, /일반 환불 신청기간은 결제일로부터 7일/u);
  assert.match(mainSource, /남은 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  assert.match(mainSource, /요청일로부터 3영업일 이내에 결제 취소 조치/u);
  assert.doesNotMatch(mainSource, /처리 기간: 영업일 기준 3~5일/u);
  assert.doesNotMatch(mainSource, /제3조의2 \(정기 구독 결제\)|구독 플랜 환불 정책|잔여 쿠폰/u);
});

test('구매 전 주요 화면은 기준 우선 차감·이벤트 비환불·주문 잔여 전량 회수를 함께 고지한다', () => {
  const surfaces = {
    결제확인: mainSource,
    부족크레딧결제: modalSource,
    가격표: pricingSource,
    랜딩: landingSource,
    이용가이드: guideSource,
    FAQ: faqSource
  };
  for (const [name, source] of Object.entries(surfaces)) {
    assert.match(source, /결제 후 7일 이내/u, `${name}: 환불 신청기간`);
    assert.match(source, /기준 크레딧(?:에서|부터)/u, `${name}: 기준 크레딧 우선 반영`);
    assert.match(source, /이벤트 크레딧은 현금 환불 대상이 아니/u, `${name}: 이벤트 크레딧 비환불`);
    assert.match(source, /해당 주문(?:에서|에) 남아 있는 기준·이벤트 크레딧(?:을|은) 모두 회수/u, `${name}: 해당 주문 잔여 전량 회수`);
  }
});

test('관리자 크레딧 환불 UI는 정책 환불만 허용한다', () => {
  assert.match(moduleSource, /data-mode="policy">정책 환불/u);
  assert.match(moduleSource, /mode = adminGetRefundMode\(i\)/u);
  assert.match(moduleSource, /return 'policy'/u);
  assert.doesNotMatch(moduleSource, /data-mode="(?:full|custom)"/u);
  assert.doesNotMatch(moduleSource, /adminSetRefundMode|refundAmt-/u);
  assert.match(moduleSource, /전액·직접입력 우회는 사용할 수 없습니다/u);
});

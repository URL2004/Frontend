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
    'globalThis.refundHelpers = { REFUND_POLICY_VERSION, REFUND_WINDOW_MS, gpCreditRefundPreview, gpSubscriptionRefundPreview, gpRefundWindowEndMs };', context);
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
      packageBonusCredits: 0, eventBonusCredits: 500, bonusCredits: 500, totalGrantedCredits: 2500
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
      packageBonusCredits: 0, eventBonusCredits: 500, bonusCredits: 500, totalGrantedCredits: 2500
    }
  );
});

test('현행 상품·이벤트 보너스는 하나의 비환불 잔액으로 회수한다', () => {
  const helpers = loadRefundHelpers();
  const order = {
    amount: 58000,
    paidCredits: 2000,
    packageBonusCredits: 900,
    eventBonusCredits: 100,
    bonusCredits: 1000,
    totalGrantedCredits: 3000,
    creditGrantPolicyVersion: 'credit-grant-base-v1',
    refundPaidCreditsRemaining: 1500,
    refundBonusCreditsRemaining: 700,
    refundEventBonusCreditsRemaining: 10
  };
  assert.deepEqual(
    { ...helpers.gpCreditRefundPreview(order, 9999) },
    {
      policy: 'base', refundAmount: 43500, recoverCredits: 2200, usedCredits: 800,
      paidUsedCredits: 500, refundablePaidCredits: 1500, paidCredits: 2000,
      packageBonusCredits: 900, eventBonusCredits: 100, bonusCredits: 1000, totalGrantedCredits: 3000
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

test('청약철회 마감은 한국 시간 7일째 말일까지 보장한다', () => {
  const helpers = loadRefundHelpers();
  const startsAt = '2026-08-01T10:00:00+09:00';
  const strict168Hours = new Date(Date.parse(startsAt) + helpers.REFUND_WINDOW_MS).toISOString();
  const endsAt = helpers.gpRefundWindowEndMs({
    kind: 'credit',
    data: {
      createdAt: startsAt,
      refundWindowStartsAt: startsAt,
      refundWindowEndsAt: strict168Hours,
      refundWindowDaysAtPurchase: 7
    }
  });
  assert.equal(endsAt, Date.parse('2026-08-08T23:59:59.999+09:00'));
  assert.ok(Date.parse('2026-08-08T20:00:00+09:00') <= endsAt, '7일째 오후에도 신청 가능');
  assert.ok(Date.parse('2026-08-09T00:00:00+09:00') > endsAt, '다음 날 00시부터 기간 경과');
  assert.equal(
    helpers.gpRefundWindowEndMs({
      kind: 'credit',
      data: {
        contractDocumentDeliveredAt: '2026-08-01T10:00:00+09:00',
        serviceAvailableAt: '2026-08-02T08:00:00+09:00',
        refundWindowDaysAtPurchase: 7
      }
    }),
    Date.parse('2026-08-09T23:59:59.999+09:00'),
    '서비스 이용 가능 시점이 늦으면 그 날짜를 기산일로 사용'
  );
});

test('환불 버튼은 저장된 기산일을 우선하고 기간 경과 주문도 추가 확인을 요청한다', () => {
  assert.match(moduleSource, /gpRefundWindowEndMs\(item\)/u);
  assert.match(moduleSource, /const requiresEligibilityReview = !missingWindowBasis && !within7/u);
  assert.match(moduleSource, /일반 청약철회 기간이 지났지만 관계 법령상 잔액 환급·취소 사유/u);
  assert.match(moduleSource, /청약철회 기준일을 확인할 수 없습니다/u);
  assert.match(moduleSource, /requiresEligibilityReview \? '확인 요청' : '환불 요청'/u);
  assert.match(moduleSource, /used: d\.coupon\.used \|\| 0/u);
  assert.match(moduleSource, /window\.requestRefund\('\$\{item\.id\}','\$\{item\.kind\}',\$\{refundAmount\},\$\{requiresEligibilityReview\}\)/u);
  assert.match(mainSource, /window\.COUPON\.used = Math\.max\(0, Number\(window\.COUPON\.used\) \|\| 0\) \+ 1/u);
});

test('이용약관과 환불규정은 기산일·부분 제공·법정 예외와 처리 기한을 정확히 고지한다', () => {
  // 2026-08-28 약관 개정(D2): 크레딧 만료 로직이 없고 전 마케팅 표면이 무기한 표기 → 약관도 무기한으로 통일
  assert.match(mainSource, /유료로 충전한 기준 크레딧과 상품 보너스·결제 이벤트로 추가 지급된 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  assert.match(mainSource, /2026년 9월 30일까지 결제 요청분/u);
  assert.match(mainSource, /주문에 귀속되지 않은 기존 잔액/u);
  assert.match(mainSource, /각 주문 안에서는 결제금액에 해당하는 기준 크레딧을 먼저 사용/u);
  assert.match(mainSource, /같은 주문에 남은 기준·추가 크레딧을 함께 회수/u);
  assert.match(mainSource, /시행일: 2026년 8월 30일/u);
  assert.doesNotMatch(mainSource, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u);
  assert.match(mainSource, /서면 또는 전자문서로 계약 내용을 받은 날부터 7일/u);
  assert.match(mainSource, /서비스 제공이 시작된 부분은 단순 변심에 따른 청약철회가 제한/u);
  assert.match(mainSource, /아직 제공되지 않은 부분은 관계 법령과 본 정책에 따라 환불/u);
  assert.match(mainSource, /3개월 이내이면서 그 사실을 안 날\(알 수 있었던 날\)부터 30일 이내/u);
  assert.match(mainSource, /법령상 결제대금 환급 의무가 있는 경우 원래 결제수단/u);
  assert.match(mainSource, /이용자가 동의한 경우에만 서비스 재제공이나 크레딧 복구/u);
  assert.match(mainSource, /환불 신청을 받은 날부터 3영업일 이내/u);
  assert.match(mainSource, /환불 사유 입력은 선택사항/u);
  assert.match(mainSource, /1372 소비자상담센터/u);
  assert.match(mainSource, /한국소비자원에 피해구제/u);
  assert.match(mainSource, /소비자분쟁조정위원회의 조정/u);
  assert.doesNotMatch(mainSource, /7일이 지난 단순 변심은 환불 대상이 아니/u);
  assert.doesNotMatch(mainSource, /처리 기간: 영업일 기준 3~5일/u);
  assert.doesNotMatch(mainSource, /제3조의2 \(정기 구독 결제\)|구독 플랜 환불 정책|잔여 쿠폰/u);
});

test('결제 직전과 정책 안내 화면은 환불 계산 기준을 고지하고 가격표는 상세 규정을 중복하지 않는다', () => {
  const surfaces = {
    결제확인: mainSource,
    부족크레딧결제: modalSource,
    랜딩: landingSource,
    이용가이드: guideSource,
    FAQ: faqSource
  };
  for (const [name, source] of Object.entries(surfaces)) {
    assert.match(source, /서면 또는 전자문서로 계약 내용을 받은 날(?:부터|\()?[\s\S]{0,45}?7일/u, `${name}: 청약철회 기산일`);
    assert.match(source, /기준 크레딧(?:을|에 따라) 먼저|기준 크레딧 비율/u, `${name}: 기준 크레딧 우선 반영`);
    assert.match(source, /남은 추가 크레딧(?:은|을) 함께 회수/u, `${name}: 해당 주문 잔여 추가분 회수`);
    assert.match(source, /7일 이후|7일이 지나/u, `${name}: 기간 이후 법정 예외 안내`);
  }
  assert.doesNotMatch(pricingSource, /gp-pricing-refund|환불 기준|환불규정 전체 보기/u, '가격 비교 화면은 환불 규정을 중복하지 않아야 함');
});

test('사용자 환불 사유만 선택 입력이며 관리자 환불·거절 사유는 필수다', () => {
  const userRequest = moduleSource.slice(
    moduleSource.indexOf('window.requestRefund = async'),
    moduleSource.indexOf('// 관리자: 환불 요청 목록')
  );
  assert.match(userRequest, /required: false/u);
  assert.match(userRequest, /if \(reason === null\) return/u);
  assert.match(userRequest, /cancelReason = String\(reason \|\| ''\)\.trim\(\)/u);
  assert.doesNotMatch(userRequest, /2자 이상/u);
  assert.match(moduleSource, /title: '환불 거절 사유'[\s\S]{0,180}?required: true/u);
  assert.match(moduleSource, /title: '직접 환불 사유'[\s\S]{0,180}?required: true/u);
});

test('신청 화면은 접수 시점 스냅샷·예약과 미정산 작업 예외를 설명한다', () => {
  assert.match(moduleSource, /신청이 접수되면 서버가 당시 잔액을 기록/u);
  assert.match(moduleSource, /남은 기준·추가 크레딧을 처리 중 사용되지 않도록 예약/u);
  assert.match(moduleSource, /접수 전에 시작되어 아직 정산되지 않은 작업이나 교정 요청/u);
  assert.match(moduleSource, /data\.requiresEligibilityReview === true/u);
  assert.match(moduleSource, /환불 요건에 해당하는 요청은 신청을 받은 날부터 3영업일 이내/u);
});

test('관리자 크레딧 환불 UI는 정책 환불만 허용한다', () => {
  assert.match(moduleSource, /data-mode="policy">정책 환불/u);
  assert.match(moduleSource, /mode = adminGetRefundMode\(i\)/u);
  assert.match(moduleSource, /return 'policy'/u);
  assert.doesNotMatch(moduleSource, /data-mode="(?:full|custom)"/u);
  assert.doesNotMatch(moduleSource, /adminSetRefundMode|refundAmt-/u);
  assert.match(moduleSource, /전액·직접입력 우회는 사용할 수 없습니다/u);
});

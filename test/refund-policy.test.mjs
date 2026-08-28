import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleSource = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');

function loadRefundHelpers() {
  const start = moduleSource.indexOf("const REFUND_POLICY_VERSION = '2026-07-20';");
  const end = moduleSource.indexOf('// 두 컬렉션의 결제 내역 통합 조회', start);
  assert.ok(start >= 0 && end > start, '환불 정책 헬퍼 블록을 찾을 수 있어야 한다');
  const context = {};
  vm.runInNewContext(`${moduleSource.slice(start, end)}\n` +
    'globalThis.refundHelpers = { REFUND_POLICY_VERSION, REFUND_WINDOW_MS, gpCreditRefundPreview, gpSubscriptionRefundPreview };', context);
  return context.refundHelpers;
}

test('프론트 환불 미리보기는 백엔드와 같은 비례 계산을 사용한다', () => {
  const helpers = loadRefundHelpers();
  assert.equal(helpers.REFUND_POLICY_VERSION, '2026-07-20');
  assert.equal(helpers.REFUND_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
  assert.deepEqual(
    { ...helpers.gpCreditRefundPreview({ amount: 29000, safeCredits: 1300 }, 1040) },
    { refundAmount: 23200, refundableCredits: 1040, usedCredits: 260 }
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
  assert.match(mainSource, /유료로 충전한 크레딧은 유효기간 없이 사용할 수 있습니다/u);
  assert.match(mainSource, /시행일: 2026년 8월 29일/u);
  assert.doesNotMatch(mainSource, /크레딧의?\s*이용기간은?\s*결제일로부터\s*1년/u);
  assert.match(mainSource, /일반 환불 신청기간은 결제일로부터 7일/u);
  assert.match(mainSource, /환불 정산상 월 50회 기준/u);
  assert.match(mainSource, /요청일로부터 3영업일 이내에 결제 취소 조치/u);
  assert.doesNotMatch(mainSource, /처리 기간: 영업일 기준 3~5일/u);
});

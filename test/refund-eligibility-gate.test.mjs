import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const start = Date.parse('2026-08-01T10:00:00+09:00');
const end = Date.parse('2026-08-08T23:59:59.999+09:00');
function setup(rows = [], now = end) {
 const list = { innerHTML: '' };
 const context = { window: { UC: 100, fetchAllOrders: async () => rows }, console,
  document: { getElementById: () => list }, escapeHtml: String, jsAttr: String,
  db: {}, CU: { uid: 'synthetic' }, doc: () => ({}),
  getDoc: async () => ({ data: () => ({ credits: context.window.UC }) }),
  Date: class extends Date { static now() { return now; } }, SUB_TIER_LABELS: {}, alert() {} };
 vm.createContext(context);
 const a = source.indexOf("const REFUND_POLICY_VERSION = 'credit-grant-base-v1';"), b = source.indexOf('// 두 컬렉션의 결제 내역 통합 조회', a);
 vm.runInContext(source.slice(a, b), context);
 const c = source.indexOf('window.loadRefundModalList ='), d = source.indexOf('// 사용자: 환불 요청', c);
 vm.runInContext(source.slice(c, d), context);
 const e = source.indexOf('function adminRefundNeedsReview('), f = source.indexOf('function adminPendingRefund(', e);
 vm.runInContext(source.slice(e, f), context);
 return { context, list };
}
const item = extra => ({ id: 'synthetic', kind: 'credit', data: { status: 'paid', amount: 1000, safeCredits: 100, createdAt: start, ...extra } });

test('request button is enabled through the deadline and disabled with support after it', async () => {
 for (const [now, enabled] of [[end, true], [end + 1, false]]) {
  const e = setup([item()], now); await e.context.window.loadRefundModalList();
  assert.equal(/<button disabled/.test(e.list.innerHTML), !enabled);
  assert.equal(/>고객센터<\/button>/.test(e.list.innerHTML), !enabled);
  if (!enabled) {
   assert.match(e.list.innerHTML, /일반 환불 신청 기간이 지났습니다/);
   assert.doesNotMatch(e.list.innerHTML, /전액 환불 대상|예상 환불액/);
  }
 }
});

test('missing date, zero remaining value, and a different subscription cycle cannot request refunds', async () => {
 const missing = setup([item({ createdAt: null })]);
 await missing.context.window.loadRefundModalList(); assert.match(missing.list.innerHTML, /<button disabled/);
 const empty = setup([item()]); empty.context.window.UC = 0;
 await empty.context.window.loadRefundModalList(); assert.match(empty.list.innerHTML, /<button disabled/);
 const sub = setup([{ id: 'sub-order', kind: 'sub', data: { status: 'paid', amount: 54900, tier: '5000', approvedAt: start } }]);
 sub.context.window.SUB = { tier: '5000', cycleStartedMs: start + 100000 };
 sub.context.window.COUPON = { tier: '5000', granted: 50, remaining: 45, used: 5 };
 await sub.context.window.loadRefundModalList(); assert.match(sub.list.innerHTML, /<button disabled/);
 sub.context.window.SUB.cycleStartedMs = start;
 await sub.context.window.loadRefundModalList(); assert.doesNotMatch(sub.list.innerHTML, /<button disabled/);
 assert.match(sub.list.innerHTML, /49,410원/);
});

test('later service availability and numeric server snapshots use the same deadline', () => {
 const { context: c } = setup();
 assert.equal(c.gpRefundWindowEndMs(item({ refundWindowStartsAt: start, serviceAvailableAt: start + 86400000 })), end + 86400000);
 assert.equal(c.gpRefundWindowEndMs({ kind: 'order', data: { refundWindowStartsAtMs: start, refundWindowEndsAtMs: end } }), end);
 assert.equal(c.gpRefundWindowEndMs(item({ createdAt: null, refundWindowEndsAt: end })), 0);
});

test('admin review uses original receipt date; legacy missing receipt and direct expired orders require review', () => {
 const { context: c } = setup([], end + 10000);
 const pending = { ...item().data, status: 'refund_requested', refundRequestedAt: end };
 assert.equal(c.adminRefundNeedsReview(pending, 'order'), false);
 assert.equal(c.adminRefundNeedsReview({ ...pending, refundRequestedAt: end + 1 }, 'order'), true);
 assert.equal(c.adminRefundNeedsReview({ ...pending, refundRequestedAt: null }, 'order'), true);
 assert.equal(c.adminRefundNeedsReview(item().data, 'order', true), true);
 assert.equal(c.adminRefundNeedsReview({ ...pending, refundReservationState: 'provider_canceling' }, 'order'), false);
});

test('admin form requires a valid exception, meaningful note and explicit confirmation', () => {
 const { context: c } = setup();
 const fields = { '[data-review-code]': { value: 'remaining_balance_settlement', focus() {} },
  '[data-review-note]': { value: '잔액 환급 근거 확인', focus() {} }, '[data-review-confirm]': { checked: false, focus() {} } };
 const root = { querySelector: key => fields[key] };
 assert.equal(c.adminReadRefundReview(root), null);
 fields['[data-review-confirm]'].checked = true;
 assert.equal(c.adminReadRefundReview(root).eligibilityReviewed, true);
 fields['[data-review-note]'].value = ' ';
 assert.equal(c.adminReadRefundReview(root), null);
 fields['[data-review-note]'].value = '근거 확인'; fields['[data-review-code]'].value = 'invalid';
 assert.equal(c.adminReadRefundReview(root), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 결과 화면 A안의 크레딧 한 줄: 돈 정보라서 경우별 문구를 고정한다.
//   금액은 서버가 확정한 creditBreakdown.charged만 쓰고, 예상 합계(total)는 쓰지 않는다.
const source = fs.readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  var doneCreditSt = null;'), source.indexOf('  function renderBillingDisposition(st) {'));

function setup(win = {}) {
  const nodes = new Map();
  const make = (tag) => ({ tag, hidden: false, textContent: '', set id(v) { this._id = v; nodes.set(v, this); }, get id() { return this._id; } });
  const card = { insertBefore: (child) => { card.inserted = child; } };
  const actions = { parentNode: card, nextSibling: null };
  const flow = make('div'); flow.id = 'lavFlow'; flow.dataset = { step: 'done' };
  const window = Object.assign({ CU: { uid: 'u' }, UP: 'free', UC: 722 }, win);
  const ctx = { window, $: (id) => nodes.get(id), document: { createElement: make, querySelector: (s) => (s === '.lav-done .lav-done-actions' ? actions : null) } };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const line = () => nodes.get('lavDoneCredit');
  return { ctx, window, flow, line };
}
const done = (result, extra = {}) => Object.assign({ status: 'done', result }, extra);

test('confirmed charge shows the amount and the current balance', () => {
  const h = setup();
  h.ctx.renderDoneCredit(done({ billingDisposition: 'charged', creditBreakdown: { base: 300, total: 300, charged: 278 } }));
  assert.equal(h.line().textContent, '이번 변환 278크레딧 · 현재 잔액 722크레딧');
  assert.equal(h.line().hidden, false);
});

test('never uses the estimated total when the confirmed charge is missing', () => {
  const h = setup();
  h.ctx.renderDoneCredit(done({ creditBreakdown: { total: 300 } }, { billingDisposition: 'charged' }));
  assert.equal(h.line().textContent, '크레딧 차감이 완료됐어요 · 현재 잔액 722크레딧');
  assert.doesNotMatch(h.line().textContent, /300/);
});

test('deduction under review keeps the review notice and hides amount and balance', () => {
  const h = setup();
  h.ctx.renderDoneCredit(done({ billingDisposition: 'charged', creditBreakdown: { charged: 278 } }, { deducted: false }));
  assert.equal(h.line().textContent, '크레딧 처리 상태를 확인하고 있어요. 작업 기록에서 최종 상태를 확인해 주세요');
});

test('no-charge dispositions use the existing billing wording', () => {
  const unlimited = setup({ UP: 'unlimited' });
  unlimited.ctx.renderDoneCredit(done({ billingDisposition: 'plan_unlimited' }));
  assert.equal(unlimited.line().textContent, '무제한 이용권으로 처리했어요');
  const admin = setup();
  admin.ctx.renderDoneCredit(done({ billingDisposition: 'admin_no_charge' }));
  assert.equal(admin.line().textContent, '관리자 테스트로 처리되어 크레딧을 차감하지 않았어요 · 현재 잔액 722크레딧');
});

test('coupon jobs and unknown dispositions show no credit line', () => {
  const coupon = setup();
  coupon.ctx.renderDoneCredit(done({ billingDisposition: 'charged', creditBreakdown: { charged: 1 } }, { billingMode: 'coupon' }));
  assert.equal(coupon.line().hidden, true);
  const none = setup();
  none.ctx.renderDoneCredit(done({ outputText: '결과' }));
  assert.equal(none.line().hidden, true);
});

test('signed-out view shows the amount without a balance', () => {
  const h = setup({ CU: null });
  h.ctx.renderDoneCredit(done({ billingDisposition: 'charged', creditBreakdown: { charged: 42 } }));
  assert.equal(h.line().textContent, '이번 변환 42크레딧');
});

test('balance refresh follows the latest credit value on the result screen only', () => {
  const h = setup();
  h.ctx.renderDoneCredit(done({ billingDisposition: 'charged', creditBreakdown: { charged: 278 } }));
  h.window.UC = 702;
  h.window.lavRefreshDoneCredit();
  assert.equal(h.line().textContent, '이번 변환 278크레딧 · 현재 잔액 702크레딧');
  h.flow.dataset.step = 'job';
  h.window.UC = 1;
  h.window.lavRefreshDoneCredit();
  assert.match(h.line().textContent, /702크레딧$/);
});

test('design A is on for every user, with admin-only sample tools and a fallback', () => {
  assert.match(source, /function resultDesignOn\(\) \{ return !resultDesignFailed; \}/);
  assert.match(source, /function adminSampleOn\(\) \{[\s\S]{0,160}window\.isAdmin && window\.isAdmin\(\)/);
  assert.match(source, /window\.lavAdminPreviewDone = function[\s\S]{0,200}if \(!\(window\.isAdmin && window\.isAdmin\(\)\)/);
  assert.match(source, /\.catch\(failResultDesign\)/);
});

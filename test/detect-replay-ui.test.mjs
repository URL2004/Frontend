import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
const part = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));
const helpers = part('function pendingCouponDetectRecovery(', 'function refreshProTab(');
function runtime(response = { ok: true, result: {} }) {
  const nodes = { proRunBtn: { style: {} }, proInputText: { value: '지역 도서관에서 준비물과 접수 기간을 확인했다.' }, proHint: {}, proCcount: {} };
  const c = { window: { CU: { uid: 'A', getIdToken: async () => 'token' }, SUB: { tier: '1000' },
    COUPON: { remaining: 2, used: 5 }, PRO_STATE: { mode: 'detect', selectedTier: '1000' } },
    document: { getElementById: id => nodes[id] }, selectedLang: 'ko', autoLangForText: (_text, lang) => lang,
    transformMinLength: () => 5, publicTransformMode: () => 'polish', alert: message => assert.fail(message),
    showScreen() {}, renderProResult() {}, refreshProTab() {}, callAnalyzeApi: async () => response, callTransformJob: async () => response };
  c.getCurrentAuthUser = async () => c.window.CU;
  vm.runInNewContext(helpers + part('async function runProAnalysis()', 'function renderProResult('), c);
  return { c, nodes };
}

test('coupon UI does not decrement a completed replay; explicit new debit and old transform fallback still work', async () => {
  for (const [response, mode, remaining, used] of [
    [{ ok: true, result: {}, charged: 0, idempotentReplay: true }, 'detect', 2, 5],
    [{ ok: true, result: {}, idempotentReplay: true }, 'detect', 2, 5],
    [{ ok: true, result: {}, charged: 1, idempotentReplay: true }, 'detect', 1, 6],
    [{ ok: true, result: {} }, 'polish', 1, 6]
  ]) {
    const { c } = runtime(response); c.window.PRO_STATE.mode = mode;
    await c.runProAnalysis();
    assert.equal(c.window.COUPON.remaining, remaining); assert.equal(c.window.COUPON.used, used);
  }
});

test('zero-coupon recovery button requires the exact current account, source, language, context and billing binding', () => {
  const { c, nodes } = runtime();
  c.window.COUPON.remaining = 0;
  const text = nodes.proInputText.value;
  const binding = ['A', 'detect', text, 'ko', '', 'coupon'];
  const setPending = value => { c.window.gpLegacyDetectPending = { requestId: 'stable-request-001', binding: JSON.stringify(value) }; c.updateProCount(nodes.proInputText); };
  setPending(binding); assert.equal(nodes.proRunBtn.disabled, false); assert.match(nodes.proHint.textContent, /같은 검사 요청/u);
  for (const [index, changed] of [[0, 'B'], [1, 'humanize'], [2, text + ' 다른 문장이다.'], [3, 'en'], [4, '별도 문맥이다.'], [5, 'credit']]) {
    const other = binding.slice(); other[index] = changed; setPending(other); assert.equal(nodes.proRunBtn.disabled, true, `mismatch ${index}`);
  }
  setPending(binding); c.window.CU = { uid: 'B' }; c.updateProCount(nodes.proInputText); assert.equal(nodes.proRunBtn.disabled, true);
  c.window.CU = { uid: 'A' }; c.window.PRO_STATE.mode = 'polish'; c.updateProCount(nodes.proInputText); assert.equal(nodes.proRunBtn.disabled, true);
});

test('main detect credit display uses the receipt without changing older transform usage behavior', () => {
  const block = part(' const chargedNeeded = currentMode', ' // 서버가 단일 호출 결과를');
  for (const [data, currentMode, expected] of [
    [{ charged: 0, idempotentReplay: true }, 'detect', 0],
    [{ idempotentReplay: true }, 'detect', 0],
    [{ charged: 3, idempotentReplay: true }, 'detect', 3],
    [{}, 'detect', 7], [{}, 'humanize', 7], [{ deducted: false }, 'humanize', 0]
  ]) {
    const c = { data, currentMode, needed: 7, noChargeDisposition: false, window: { UP: 'free', UC: 50 }, updateCreditUI() {} };
    vm.runInNewContext(part('function deliveredUsageCharge(', 'function updateProCount(') + block + '\nresult = chargedNeeded;', c);
    assert.equal(c.result, expected); assert.equal(c.window.UC, 50 - expected);
  }
});

test('enabled coupon recovery uses the same pending ID in the actual analyze helper', async () => {
  const { c, nodes } = runtime();
  const text = nodes.proInputText.value;
  c.window.COUPON.remaining = 0;
  c.window.gpLegacyDetectPending = { requestId: 'stable-request-001', binding: JSON.stringify(['A', 'detect', text, 'ko', '', 'coupon']) };
  c.updateProCount(nodes.proInputText); assert.equal(nodes.proRunBtn.disabled, false);
  let sent;
  Object.assign(c, { genReqId: () => 'different-request-002', AbortController, setTimeout: () => 1, clearTimeout() {}, globalThis: {} });
  c.window.apiUrl = path => path;
  c.window.gpFetch = async (_url, options) => { sent = JSON.parse(options.body); return { status: 200, json: async () => ({ ok: true, result: {}, charged: 0, idempotentReplay: true }) }; };
  vm.runInNewContext(part('async function callAnalyzeApi(payload, opts)', '// 휴머나이징은 /transform job 하나로 통일한다.'), c);
  await c.runProAnalysis();
  assert.equal(sent.requestId, 'stable-request-001'); assert.equal(c.window.COUPON.remaining, 0); assert.equal(c.window.COUPON.used, 5);
  assert.equal(c.window.gpLegacyDetectPending, null); assert.equal(nodes.proRunBtn.disabled, true);
});

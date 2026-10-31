import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const flow = readFileSync(new URL('../assets/js/conversion-flow.js', import.meta.url), 'utf8');
const evasion = readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
function extract(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}
const coordinator = extract(flow, '  async function resumePendingJob(', '\n  window.gpHandleCreditPaymentSuccess');
function fixture(handler, action = 'evasion_transform') {
  const s = { calls: 0, events: [], toasts: [], pending: { orderId: 'order-A', uid: 'account-A', action, neededCredits: 74, payload: { text: '합성 검증 원문' } } };
  const storage = new Map();
  const c = vm.createContext({
    window: { CU: { uid: 'account-A' }, UC: 220, UP: 'free', gpToast: m => s.toasts.push(m),
      gpResumeEvasionTransform: (...args) => { s.calls++; return handler(...args); },
      gpResumeComposerDraft: (...args) => { s.calls++; return handler(...args); } },
    number: v => Math.max(0, Number(v) || 0), format: v => String(v),
    readPending: () => s.pending, clearPending: () => { s.pending = null; },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    RESUMED_PREFIX: 'resumed_', track: (name, meta) => s.events.push({ name, ...meta })
  });
  vm.runInContext(coordinator, c);
  return { s, c, run: () => c.resumePendingJob('order-A', {}) };
}
test('draft restoration requires a next step and never claims server admission', async () => {
  const f = fixture(() => ({ status: 'input_restored' }), 'composer_draft');
  const result = await f.run();
  assert.equal(result.status, 'input_restored');
  assert.equal(f.s.pending, null);
  assert.equal(f.s.events[0].name, 'draft_restored');
  const notice = f.c.window.gpCreditResumeNotice(result, 200);
  assert.match(notice.message, /시작 버튼/);
  assert.doesNotMatch(notice.message, /접수됐|다시 시작했/);
  assert.equal(notice.action.tab, 'main');
});
test('only a job receipt allows the started notice and clears the pending request', async () => {
  const f = fixture(() => ({ status: 'started', jobId: 'job-A' }));
  const result = await f.run();
  assert.equal(result.status, 'started');
  assert.equal(f.s.pending, null);
  assert.equal(f.s.events[0].name, 'job_resumed');
  assert.match(f.c.window.gpCreditResumeNotice(result, 200).message, /접수됐어요/);
});
test('legacy dispatch booleans and missing job IDs cannot claim a started job', async () => {
  for (const value of [true, { status: 'started' }]) {
    const f = fixture(() => value), result = await f.run();
    assert.equal(result.status, 'requested');
    assert.ok(f.s.pending);
    assert.equal(f.s.events[0].name, 'job_resume_requested');
    assert.doesNotMatch(f.c.window.gpCreditResumeNotice(result, 200).message, /접수됐|다시 시작했/);
  }
});
test('failed or missing handlers preserve the draft and provide attention guidance', async () => {
  for (const handler of [() => false, () => undefined, () => { throw new Error('offline'); }, () => ({ status: 'attention_required' })]) {
    const f = fixture(handler), result = await f.run();
    assert.equal(result.status, 'attention_required');
    assert.ok(f.s.pending);
    assert.equal(f.s.events.length, 0);
    assert.match(f.c.window.gpCreditResumeNotice(result, 200).message, /확인하지 못/);
  }
  const f = fixture(() => true);
  delete f.c.window.gpResumeEvasionTransform;
  assert.equal((await f.run()).status, 'attention_required');
  assert.ok(f.s.pending);
});
test('two payment callbacks submit only once while acknowledgement is pending', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  const first = f.run();
  assert.equal((await f.run()).status, 'already_requested');
  assert.equal(f.s.calls, 1);
  assert.ok(f.s.pending);
  resolve({ status: 'started', jobId: 'job-A' });
  assert.equal((await first).status, 'started');
});
test('uncertain admission retains the request and prevents automatic resubmission', async () => {
  const f = fixture(() => ({ status: 'pending' }));
  assert.equal((await f.run()).status, 'pending');
  assert.equal((await f.run()).status, 'already_requested');
  assert.equal(f.s.calls, 1);
  assert.ok(f.s.pending);
});
test('missing account, account switch and insufficient balance do not start a job', async () => {
  for (const user of [null, { uid: 'account-B' }]) {
    const f = fixture(() => true); f.c.window.CU = user;
    assert.equal((await f.run()).status, 'attention_required');
    assert.equal(f.s.calls, 0);
  }
  const f = fixture(() => true); f.c.window.UC = 20;
  const result = await f.run();
  assert.equal(result.status, 'insufficient');
  assert.equal(f.s.calls, 0);
  assert.equal(f.c.window.gpCreditResumeNotice(result, 200).action.tab, 'pricing');
});
test('completion of an earlier handoff preserves a newer checkout draft', async () => {
  let f;
  f = fixture(() => { f.s.pending = { ...f.s.pending, orderId: 'order-B' }; return { status: 'started', jobId: 'job-A' }; });
  await f.run();
  assert.equal(f.s.pending.orderId, 'order-B');
});

const composer = extract(evasion, '  window.gpResumeComposerDraft = function', '\n  // Before/After');
test('actual composer handler restores text, focuses the start button and returns no job receipt', () => {
  const input = { value: '', focus() {} }, button = { focus() { this.focused = true; } };
  const c = vm.createContext({ window: { switchTab() {}, lavSetMode() {}, lavSyncCount() {}, lavUpdateEstimate() {} }, $: id => id === 'lavInput' ? input : button });
  vm.runInContext(composer, c);
  assert.equal(c.window.gpResumeComposerDraft({ text: '' }), false);
  assert.equal(c.window.gpResumeComposerDraft({ text: '합성 원문', mode: 'humanize' }).status, 'input_restored');
  assert.equal(input.value, '합성 원문');
  assert.equal(button.focused, true);
});

const resumeTransform = extract(evasion, '  window.gpResumeEvasionTransform = function', '\n  window.gpResumeEvasionFallback');
const shortRun = extract(evasion, '  function runShortJob(', '\n  function runBlogEvasion(');
const formalRun = extract(evasion, '  function runFormalEvasion(', '\n  window.lavStartJob');
function admissionFixture(mode, { token = 'synthetic-token' } = {}) {
  const nodes = {}, timers = new Map(), s = { requests: [], errors: [], polls: 0 };
  let timerId = 0, resolveResponse, rejectResponse;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  const c = vm.createContext({
    window: { CU: { uid: 'account-A' }, switchTab() {}, lavSetMode() {}, apiUrl: p => p },
    $: id => nodes[id] ||= { textContent: '', value: '' },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    pollGen: 1, activeCancel: null, setActiveJobUi() {}, show() {}, armCancelWindow() {}, replaceJobTicker() {},
    shortEstimateSec: () => 100, formalEstimateRange: () => ({ low: 100, high: 150 }), estimateRangeFromPayload: () => ({}),
    evGetIdToken: async () => token, reportHandoffFields: () => ({}), evDetectLang: () => 'ko', evAuthHeaders: () => ({}),
    parseTransformStart: r => r, fetch: (url, options) => { s.requests.push({ url, body: JSON.parse(options.body) }); return response; },
    makeJobCanceller: () => async () => {}, saveJobRef() {}, resumeTransformState() {},
    pollTransform: async () => { s.polls++; await new Promise(() => {}); },
    handleTransformStartError: async e => s.errors.push(e.httpStatus || 0)
  });
  vm.runInContext(shortRun + '\n' + formalRun + '\n' + resumeTransform, c);
  const result = c.window.gpResumeEvasionTransform({ text: '로컬 합성 검증 원문', flowMode: mode, settings: { evidence: true, basicStyle: 'report', effectNoticeAccepted: true } });
  function fire(ms) { for (const [id, timer] of timers) if (timer.ms === ms) { timers.delete(id); timer.fn(); break; } }
  return { c, s, result, fire, resolveResponse, rejectResponse };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
for (const mode of ['blog', 'formal']) test(`${mode}: receipt waits for HTTP admission, preserves mode and does not wait for model completion`, async () => {
  const f = admissionFixture(mode);
  let settled = false; f.result.then(() => { settled = true; });
  f.fire(120); await tick();
  assert.equal(settled, false);
  assert.equal(f.s.requests.length, 1);
  assert.equal(f.s.requests[0].body.mode, mode);
  assert.equal(f.s.requests[0].body.effectNoticeAccepted, true);
  f.resolveResponse({ jobId: 'job-A', job: { status: 'running' } });
  assert.equal((await f.result).status, 'started');
  assert.equal(f.s.polls, 1);
});
test('rejected admission cannot emit started and still renders the existing error guidance', async () => {
  const f = admissionFixture('blog'); f.fire(120); await tick();
  f.rejectResponse(Object.assign(new Error('confirmation required'), { httpStatus: 409 }));
  assert.equal((await f.result).status, 'attention_required');
  assert.deepEqual(f.s.errors, [409]);
});
test('slow admission times out as uncertain, with one request even if acknowledgement arrives later', async () => {
  const f = admissionFixture('formal'); f.fire(120); await tick(); f.fire(15000);
  assert.equal((await f.result).status, 'pending');
  f.resolveResponse({ jobId: 'job-A', job: { status: 'queued' } }); await tick();
  assert.equal(f.s.requests.length, 1);
});
test('missing authentication rejects resume without sending a transform request', async () => {
  const f = admissionFixture('blog', { token: '' }); f.fire(120);
  assert.equal((await f.result).status, 'attention_required');
  assert.equal(f.s.requests.length, 0);
  assert.deepEqual(f.s.errors, [401]);
});
test('account changes before dispatch or while obtaining authentication cannot submit the prior draft', async () => {
  for (const duringToken of [false, true]) {
    const f = admissionFixture('formal');
    if (duringToken) f.fire(120);
    f.c.window.CU = { uid: 'account-B' };
    if (!duringToken) f.fire(120);
    assert.equal((await f.result).status, 'attention_required');
    assert.equal(f.s.requests.length, 0);
  }
});

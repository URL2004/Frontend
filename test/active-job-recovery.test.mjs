import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
const noop = () => {};
function load(context, name, assignment = false) {
  const starts = assignment ? ['  window.' + name + ' = '] : ['  async function ' + name + '(', '  function ' + name + '('];
  const start = starts.map(s => source.indexOf(s)).find(n => n >= 0);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  }', start) + (assignment ? 5 : 4);
  vm.runInContext(source.slice(start, end), context);
}
function fixture() {
  const elements = {}, shown = [], requests = [];
  const context = vm.createContext({
    window: { apiUrl: path => path, gpToast: noop, lavCloseConfirm() { context.modalClosed = true; } },
    $: id => elements[id] ||= { hidden: true, textContent: '', value: '검증할 원문', disabled: false },
    pollGen: 4, structureLoading: false, structurePlan: null, structurePlanKey: '', paymentJob: null,
    activeJobUi: { status: 'idle' }, activeCancel: null, structureInputKey: () => 'input', currentDocumentProfile: () => '',
    updateConfirmStartState: noop, renderConfirmCost: noop, renderSelectCosts: noop,
    evGetIdToken: async () => 'owner', evAuthHeaders: (token, more) => ({ Authorization: token, ...more }),
    show: step => shown.push(step), stopFormalTicker: noop, clearCancelWindow: noop, armCancelWindow: noop,
    setJobSteps: noop, renderApprovalList: (rows, id) => { context.approvalJob = id; },
    saveJobRef: (id, status) => { context.ref = { id, status }; },
    clearJobRef: () => { context.ref = null; }, clearActiveJobUi: () => { context.activeJobUi = { status: 'idle' }; },
    setActiveJobUi: (id, status) => { context.activeJobUi = { jobId: id, status }; },
    readJobRef: () => null,
    fetch: async path => { requests.push(path); return { ok: true, status: 200, json: async () => ({ ok: true, job: { id: 'old', status: 'awaiting_approval', mode: 'formal', candidates: [], elapsedSec: 3600 } }) }; }
  });
  for (const fn of ['makeJobCanceller', 'parseTransformStart', 'resumeTransformState', 'recoverActiveTransformJob', 'handleTransformStartError', 'prepareStructurePreview', 'renderPaymentRequired', 'initJobResume']) load(context, fn);
  for (const fn of ['lavCancelJob', 'lavResumePayment']) load(context, fn, true);
  return { context, elements, shown, requests };
}

test('structure preview 409 restores the existing approval screen and closes the obscuring modal', async () => {
  const { context: c, elements, shown } = fixture();
  const fetchActive = c.fetch;
  c.fetch = async path => path.endsWith('structure-plan')
    ? { ok: false, status: 409, json: async () => ({ error: '기존 작업 확인', activeJobId: 'old', activeStatus: 'awaiting_approval' }) }
    : fetchActive(path);
  await c.prepareStructurePreview();
  assert.equal(c.modalClosed, true);
  assert.equal(c.approvalJob, 'old');
  assert.equal(c.ref.id, 'old'); assert.equal(c.activeJobUi.status, 'awaiting_approval');
  assert.equal(shown.at(-1), 'job');
  assert.equal(elements.lavJobCancel.hidden, false);
  assert.equal(elements.lavApprove.hidden, false);
  assert.equal(c.structureLoading, false);
});

test('missing local storage still restores the server job, including approvals older than six hours', async () => {
  const { context: c, requests } = fixture();
  c.initJobResume();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ['/transform/active']);
  assert.equal(c.approvalJob, 'old');
});

test('late recovery cannot replace a newer job and signed-out visits do not query active work', async () => {
  const { context: c, requests } = fixture();
  c.evGetIdToken = async () => { c.pollGen++; return 'owner'; };
  assert.equal(await c.recoverActiveTransformJob(4), false);
  assert.equal(requests.length, 0);
  c.evGetIdToken = async () => '';
  assert.equal(await c.recoverActiveTransformJob(c.pollGen), false);
  assert.equal(requests.length, 0);
});

test('payment holds show the saved-result actions and never start progress polling', () => {
  const { context: c, elements, shown } = fixture();
  c.pollTransform = () => { throw new Error('Must not poll or regenerate'); };
  assert.equal(c.resumeTransformState('saved', { status: 'awaiting_payment', needed: 205, billingMode: 'credit', error: '충전 후 결과를 받아 주세요.' }), true);
  assert.equal(shown.at(-1), 'payment');
  assert.equal(c.paymentJob.id, 'saved');
  assert.match(elements.lavPaymentAmount.textContent, /205/);
  assert.equal(elements.lavPaymentCharge.hidden, false);
});

test('rejected cancellation preserves the visible job and successful cancellation clears it', async () => {
  const { context: c, shown } = fixture();
  c.window.gpConfirm = async () => true;
  c.ref = { id: 'saved' }; c.activeJobUi = { jobId: 'saved', status: 'awaiting_payment' };
  c.activeCancel = async () => { throw new Error('취소할 수 없음'); };
  await c.window.lavCancelJob();
  assert.equal(c.ref.id, 'saved'); assert.equal(c.pollGen, 4); assert.equal(shown.length, 0);
  let finish;
  c.activeCancel = () => new Promise(resolve => { finish = resolve; });
  const cancelling = c.window.lavCancelJob();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.ref.id, 'saved');
  finish({ ok: true }); await cancelling;
  assert.equal(c.ref, null); assert.equal(c.pollGen, 5); assert.equal(shown.at(-1), 'select');
});

test('payment retry posts only to the saved job and keeps the result screen on another shortage', async () => {
  const { context: c, elements } = fixture();
  c.renderPaymentRequired('saved', { needed: 205, billingMode: 'credit' });
  const paths = [];
  c.fetch = async path => { paths.push(path); return { ok: false, status: 402, json: async () => ({ error: '크레딧이 부족합니다.' }) }; };
  await c.window.lavResumePayment();
  assert.deepEqual(paths, ['/transform/saved/resume-payment']);
  assert.equal(c.paymentJob.id, 'saved');
  assert.equal(elements.lavPaymentReason.textContent, '크레딧이 부족합니다.');
  assert.equal(elements.lavPaymentResume.disabled, false);
});

test('job canceller reports server refusal rather than pretending it succeeded', async () => {
  const { context: c } = fixture();
  c.fetch = async () => ({ ok: false, json: async () => ({ error: '취소 가능 시간이 지났어요.' }) });
  await assert.rejects(c.makeJobCanceller('old')(), /취소 가능 시간/);
});

test('late cancellation response cannot clear a newer job', async () => {
  const { context: c, shown } = fixture();
  c.window.gpConfirm = async () => true;
  let finish;
  c.activeCancel = () => new Promise(resolve => { finish = resolve; });
  const cancelled = c.window.lavCancelJob();
  await new Promise(resolve => setImmediate(resolve));
  c.pollGen++; c.ref = { id: 'newer' }; c.activeJobUi = { jobId: 'newer', status: 'running' };
  finish({ ok: true }); await cancelled;
  assert.equal(c.ref.id, 'newer'); assert.equal(shown.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const start = source.indexOf('let adminAttributionGeneration = 0;');
const end = source.indexOf('// 개요: 환불 대기 수치 갱신', start);
const code = source.slice(start, end);
const sample = {
  days: 30, touch: 'last_touch', since: '2026-09-06T15:00:00Z', until: '2026-10-06T03:00:00Z', total: 5, recorded: 4, unrecorded: 1,
  groups: [{ source: 'instagram', medium: 'social', campaign: 'signup_test', content: 'video_01', signups: 3 }, { source: 'naver', medium: 'cpc', campaign: 'search', content: '<img src=x onerror=alert(1)>', signups: 1 }]
};
function harness(post = async () => sample) {
  const ids = ['adminSignupAttributionSummary', 'adminSignupAttributionStatus', 'adminAttributionDays', 'adminAttributionTouch', 'adminAttributionSource', 'adminAttributionQuery'];
  const nodes = Object.fromEntries(ids.map(id => [id, { value: '', dataset: {}, innerHTML: '', textContent: '', setAttribute() {}, removeAttribute() {} }]));
  nodes.adminAttributionDays.value = '30'; nodes.adminAttributionTouch.value = 'last_touch';
  const window = { isAdmin: () => true, _adminSignupAttribution: sample };
  vm.runInNewContext(code, {
    window, document: { getElementById: id => nodes[id] }, AbortController,
    adminPost: post, adminNumber: value => Math.max(0, Number(value) || 0),
    escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  });
  return { window, nodes };
}

test('video search, source filters, coverage and hostile UTM text render correctly', () => {
  const { window, nodes } = harness();
  window.adminRenderSignupAttribution();
  const root = nodes.adminSignupAttributionSummary;
  assert.match(root.innerHTML, /신규 가입 4명/);
  assert.match(root.innerHTML, /미기록 1명/);
  assert.doesNotMatch(root.innerHTML, /<img/);
  nodes.adminAttributionSource.value = 'instagram';
  nodes.adminAttributionQuery.value = 'VIDEO_01';
  window.adminRenderSignupAttribution();
  assert.match(root.innerHTML, /신규 가입 3명/);
  assert.doesNotMatch(root.innerHTML, /search<\/td>/);
  nodes.adminAttributionQuery.value = 'no match';
  window.adminRenderSignupAttribution();
  assert.match(root.innerHTML, /조건에 맞는 유입 기록이 없어요/);
});

test('both first and last touch controls are sent to the admin API', async () => {
  const calls = [];
  const { window, nodes } = harness(async (path, body) => { calls.push({ path, ...body }); return { ...sample, touch: body.touch }; });
  await window.loadAdminSignupAttribution();
  nodes.adminAttributionTouch.value = 'first_touch';
  await window.loadAdminSignupAttribution();
  assert.equal(calls[0].touch, 'last_touch');
  assert.equal(calls[1].touch, 'first_touch');
  assert.equal(calls[0].path, '/admin/signup-attribution-summary');
  assert.match(nodes.adminSignupAttributionStatus.textContent, /최초 유입/);
});

test('late responses cannot overwrite a newer attribution choice', async () => {
  const pending = [];
  const { window, nodes } = harness((path, body) => new Promise(resolve => pending.push({ resolve, touch: body.touch })));
  const first = window.loadAdminSignupAttribution();
  nodes.adminAttributionTouch.value = 'first_touch';
  const second = window.loadAdminSignupAttribution();
  pending[1].resolve({ ...sample, touch: 'first_touch' }); await second;
  pending[0].resolve(sample); await first;
  assert.equal(window._adminSignupAttribution.touch, 'first_touch');
});

test('partial results are explicit and failures offer retry without stale totals', async () => {
  const partial = harness(); partial.window._adminSignupAttribution = { ...sample, truncated: true };
  partial.window.adminRenderSignupAttribution();
  assert.match(partial.nodes.adminSignupAttributionStatus.textContent, /전체 합계가 아니에요/);
  const failed = harness(async () => { throw new Error('조회 실패'); });
  await failed.window.loadAdminSignupAttribution();
  assert.equal(failed.nodes.adminSignupAttributionSummary.dataset.loadState, 'error');
  assert.match(failed.nodes.adminSignupAttributionSummary.innerHTML, /다시 시도/);
  assert.doesNotMatch(failed.nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 4명/);
});

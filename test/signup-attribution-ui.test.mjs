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
function harness(post = async () => sample, clipboard = async () => {}) {
  const ids = ['adminSignupAttributionSummary', 'adminSignupAttributionStatus', 'adminAttributionDays', 'adminAttributionTouch', 'adminAttributionSource', 'adminAttributionChannel', 'adminAttributionGroup', 'adminAttributionQuery', 'adminSignupAttributionPanel', 'adminUtmPlatform', 'adminUtmChannel', 'adminUtmVideo', 'adminUtmDestination', 'adminUtmMedium', 'adminUtmResult', 'adminUtmStatus', 'adminUtmOutput', 'adminUtmCopyButton'];
  const nodes = Object.fromEntries(ids.map(id => [id, { value: '', dataset: {}, innerHTML: '', textContent: '', hidden: true, setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, select() {} }]));
  nodes.adminAttributionDays.value = '30'; nodes.adminAttributionTouch.value = 'last_touch';
  nodes.adminUtmPlatform.value = 'instagram'; nodes.adminUtmDestination.value = 'https://gpkorea.ai.kr/'; nodes.adminUtmMedium.value = 'social';
  const window = { isAdmin: () => true, _adminSignupAttribution: sample };
  vm.runInNewContext(code, {
    window, document: { getElementById: id => nodes[id] }, AbortController, URL,
    adminWriteClipboardText: clipboard,
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

test('platform, channel and video rollups combine media without changing signup totals', () => {
  const { window, nodes } = harness();
  window._adminSignupAttribution = { ...sample, groups: [
    { source: 'instagram', medium: 'social', campaign: 'official', content: 'video_01', signups: 3 },
    { source: 'instagram', medium: 'paid_social', campaign: 'official', content: 'video_01', signups: 2 },
    { source: 'instagram', medium: 'social', campaign: 'official', content: 'video_02', signups: 4 },
    { source: 'instagram', medium: 'social', campaign: 'creator', content: 'video_01', signups: 1 }
  ] };
  window.adminRenderSignupAttribution();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /영상별 3개 항목/);
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /<strong>5명<\/strong>/);
  nodes.adminAttributionGroup.value = 'channel'; window.adminRenderSignupAttribution();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /채널별 2개 항목/);
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /<strong>9명<\/strong>/);
  nodes.adminAttributionGroup.value = 'platform'; window.adminRenderSignupAttribution();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /플랫폼별 1개 항목/);
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 10명/);
  nodes.adminAttributionChannel.value = 'creator'; window.adminRenderSignupAttribution();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 1명/);
});

test('generated URLs normalize identifiers and replace UTMs while preserving destination state', async () => {
  const copied = [];
  const { window, nodes } = harness(undefined, async text => copied.push(text));
  nodes.adminUtmChannel.value = ' @My Channel ';
  nodes.adminUtmVideo.value = '새 영상 01';
  nodes.adminUtmDestination.value = 'https://gpkorea.ai.kr/main?view=guide&utm_source=old&utm_term=stale&UTM_CAMPAIGN=old#help';
  window.adminGenerateUtmLink();
  assert.equal(nodes.adminUtmResult.hidden, false);
  const url = new URL(nodes.adminUtmOutput.value);
  assert.equal(url.searchParams.get('utm_source'), 'instagram');
  assert.equal(url.searchParams.get('utm_campaign'), 'my_channel');
  assert.equal(url.searchParams.get('utm_content'), '새_영상_01');
  assert.equal(url.searchParams.get('view'), 'guide');
  assert.equal(url.hash, '#help');
  assert.equal(url.searchParams.has('utm_term'), false);
  assert.equal(url.searchParams.has('UTM_CAMPAIGN'), false);
  await window.adminCopyUtmLink();
  assert.equal(copied[0], url.toString());
  window.adminInvalidateUtmLink();
  await window.adminCopyUtmLink();
  assert.equal(copied.length, 1);
  assert.equal(nodes.adminUtmResult.hidden, true);
  assert.equal(nodes.adminUtmOutput.value, '');
});

test('generator rejects unsafe or untrackable destinations and invalid identifiers', () => {
  const { window, nodes } = harness();
  nodes.adminUtmChannel.value = 'official'; nodes.adminUtmVideo.value = 'video_01';
  for (const destination of ['javascript:alert(1)', 'http://gpkorea.ai.kr/', 'https://gpkorea.ai.kr.evil.test/', 'https://evil.test/', 'https://user:password@gpkorea.ai.kr/', 'https://gpkorea.ai.kr:8443/', 'not a url']) {
    nodes.adminUtmDestination.value = destination;
    window.adminGenerateUtmLink();
    assert.equal(nodes.adminUtmResult.hidden, true);
    assert.equal(nodes.adminUtmStatus.dataset.state, 'error');
  }
  nodes.adminUtmDestination.value = 'https://gpkorea.ai.kr/';
  for (const video of ['', '<script>alert(1)</script>', 'x'.repeat(101)]) {
    nodes.adminUtmVideo.value = video; window.adminGenerateUtmLink();
    assert.equal(nodes.adminUtmStatus.dataset.state, 'error');
  }
});

test('generated video filters match exactly and remain selected before a first signup', async () => {
  const { window, nodes } = harness();
  nodes.adminUtmChannel.value = 'signup_test'; nodes.adminUtmVideo.value = 'video_01';
  window._adminSignupAttribution = { ...sample, groups: [...sample.groups, { source: 'instagram', medium: 'social', campaign: 'signup_test', content: 'video_010', signups: 10 }] };
  window.adminGenerateUtmLink(); window.adminViewUtmSignups();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 3명/);
  nodes.adminUtmChannel.value = 'new_channel'; nodes.adminUtmVideo.value = 'new_video';
  window.adminGenerateUtmLink(); window.adminViewUtmSignups();
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 0명/);
  await window.loadAdminSignupAttribution();
  assert.equal(nodes.adminAttributionChannel.value, 'new_channel');
  assert.match(nodes.adminSignupAttributionSummary.innerHTML, /신규 가입 0명/);
});

test('clipboard failures offer manual copy and unauthorised users cannot generate a link', async () => {
  const { window, nodes } = harness(undefined, async () => { throw new Error('denied'); });
  nodes.adminUtmChannel.value = 'official'; nodes.adminUtmVideo.value = 'video_01';
  window.adminGenerateUtmLink(); await window.adminCopyUtmLink();
  assert.match(nodes.adminUtmStatus.textContent, /직접 선택해서 복사/);
  assert.equal(nodes.adminUtmCopyButton.disabled, false);
  window.adminInvalidateUtmLink(); window.isAdmin = () => false;
  window.adminGenerateUtmLink(); assert.equal(nodes.adminUtmResult.hidden, true);
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

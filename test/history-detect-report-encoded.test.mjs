import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const inputText = '첫 문장을 확인했습니다. 다음 문장도 확인했습니다.';
const sample = () => Object.assign(JSON.parse(read('scripts/fixtures/detect-report-sample.json')), { probability: 15, detectorVersion: 'synthetic-v1' });
// Firestore에서 읽은 그대로의 모양: plain 캐시는 없고 압축본(Bytes)만 있다.
const encodedDoc = (id, extra) => ({
  id,
  data: () => ({
    type: 'detect', credits: 2, probability: 15, probSource: 'llm', inputText, detectorVersion: 'synthetic-v1',
    createdAt: { toMillis: () => 1760000000000 },
    detectResponseCacheEncoded: { v: 2, codec: 'gzip-json-dedupe', rawBytes: 600000, data: { toUint8Array: () => new Uint8Array(650000) } },
    ...extra
  })
});

function setup(respond) {
  const c = { console: { warn() {}, log() {}, error() {} }, Date, Intl, URL };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  for (const file of ['detect-interpretation', 'detect-presentation']) vm.runInContext(read('assets/js/' + file + '.js'), c);
  const flow = read('assets/js/evasion-flow.js');
  c.normalizeSentenceMap = x => x || {};
  vm.runInContext(flow.slice(flow.indexOf('  function reportNumber('), flow.indexOf('  // 퍼널 계측 컨텍스트')), c);
  vm.runInContext(flow.slice(flow.indexOf('  function repClamp01('), flow.indexOf('  function repPaintSurfaceLabel(')), c);
  const nodes = Object.fromEntries(['historyDetailPanel', 'historyWorkspace', 'historyContent', 'lavInput'].map(k => [k, {
    innerHTML: '', value: '', classList: { toggle() {} }, dispatchEvent() {}, focus() {}
  }]));
  c.document = { getElementById: id => nodes[id] || null };
  c.escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  c.Event = class { constructor(type) { this.type = type; } };
  c.requestAnimationFrame = () => {};
  c.location = { href: 'https://example.test/history?item=synthetic' };
  c.history = { state: {}, replaceState() {}, pushState() {} };
  const calls = [];
  c.CU = { uid: 'owner' };
  c.postAuthedJson = async (path, body) => { calls.push({ path, body }); return respond(path, body, calls.length); };
  const opened = [], toasts = [], tracked = [];
  c.lavOpenSavedDetectReport = (report, meta) => { opened.push({ report, meta }); return true; };
  c.lavFlowReset = () => true;
  c.gpToast = message => toasts.push(message);
  c.gpTrack = (name, params) => tracked.push({ name, params });
  const app = read('assets/js/app-module.js');
  vm.runInContext(app.slice(app.indexOf('function historyBillingInfo'), app.indexOf('async function historyFetchPage')), c);
  vm.runInContext(app.slice(app.indexOf('function historyComposerText'), app.indexOf('async function historyWriteClipboard')), c);
  const load = (...docs) => {
    c._docs = docs;
    vm.runInContext('historyState.items = _docs.map(historyNormalizeDoc); historyState.selectedId = historyState.items[0].id; historyState.initialized = true;', c);
    return c._historyState.items;
  };
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  const html = () => nodes.historyDetailPanel.innerHTML;
  return { c, calls, opened, toasts, tracked, load, settle, html, render: () => vm.runInContext('historyRender()', c) };
}

test('압축 저장된 감지 기록은 열 때 서버에서 한 번 풀어 받아 inline 보관본과 같은 결과 화면으로 복원된다', async () => {
  const report = sample();
  const served = Object.assign(sample(), { historySaved: true });
  const { c, calls, opened, tracked, load, settle, html, render } = setup((path, body) => ({ ok: true, id: body.id, report: served }));
  const [item] = load(encodedDoc('enc-1'));
  // 압축 바이트는 브라우저 메모리에 남기지 않는다.
  assert.equal(JSON.stringify(item.detectResponseCacheEncoded), '{"stored":true}');
  assert.equal(c.gpDetectHistoryReportPending(item), true);
  assert.equal(c.gpDetectHistoryCanRestore(item), false);

  render();
  assert.match(html(), /저장된 결과 화면을 불러오는 중이에요/);
  assert.match(html(), /크레딧은 차감되지 않아요/);
  assert.doesNotMatch(html(), /결과 화면 다시 보기|<h3>문체 지표/);
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ path: '/history/detect-report', body: { id: 'enc-1' } }]);
  assert.match(html(), /onclick="historyOpenDetectReport\(\)">결과 화면 다시 보기<\/button>/);
  assert.match(html(), /<h3>문체 지표/);

  // 같은 응답을 inline으로 가진 기록과 화면·복원 결과가 같다.
  const inline = { ...item, detectReportState: undefined, detectResponseCacheEncoded: undefined, detectResponseCache: served };
  assert.equal(JSON.stringify(c.gpDetectHistoryReport(item)), JSON.stringify(c.gpDetectHistoryReport(inline)));
  assert.equal(JSON.stringify(c.gpDetectHistorySections(item)), JSON.stringify(c.gpDetectHistorySections(inline)));
  assert.equal(c.gpDetectHistoryReport(item).probability, 15);
  assert.equal(JSON.stringify(c.gpDetectHistoryReport(item).sentenceMap), JSON.stringify(report.sentenceMap));

  // 다시 그리거나 결과 화면을 열어도 서버를 더 부르지 않고, 감지·차감 경로도 타지 않는다.
  render(); render();
  await settle();
  c.lavDetect = () => { throw new Error('재감지 금지'); };
  c.historyOpenDetectReport();
  assert.equal(calls.length, 1);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].meta.inputText, inputText);
  assert.equal(opened[0].meta.savedAtMs, 1760000000000);
  for (const key of ['charged', 'remainingCredits', 'activation', 'idempotentReplay']) assert.equal(key in opened[0].report, false, key);
  assert.deepEqual(JSON.parse(JSON.stringify(tracked)), [{ name: 'history_reuse', params: { action: 'reopen_report', source_type: 'detect' } }]);
});

test('받은 응답이 이 기록의 번호·점수·감지기 버전·원문과 맞지 않으면 쓰지 않고 요약만 남긴다', async () => {
  const cases = {
    'other record id': (body, report) => ({ ok: true, id: 'someone-else', report }),
    'score': (body, report) => ({ ok: true, id: body.id, report: { ...report, probability: 60 } }),
    'detector version': (body, report) => ({ ok: true, id: body.id, report: { ...report, detectorVersion: 'other-v2' } }),
    'input': (body, report) => ({ ok: true, id: body.id, report: { ...report, inputText: '다른 글' } }),
    'failed analysis': (body, report) => ({ ok: true, id: body.id, report: { ...report, ok: false } }),
    'no report view': (body, report) => ({ ok: true, id: body.id, report: { ...report, reportView: null } }),
    'not an object': body => ({ ok: true, id: body.id, report: 'x' }),
    'array': body => ({ ok: true, id: body.id, report: [] }),
    'not ok': (body, report) => ({ ok: false, id: body.id, report })
  };
  for (const [name, respond] of Object.entries(cases)) {
    const { c, calls, opened, toasts, load, settle, html, render } = setup((path, body) => respond(body, sample()));
    const [item] = load(encodedDoc('enc-2'));
    render();
    await settle();
    assert.equal(item.detectReportState, 'unavailable', name);
    assert.equal('detectResponseCache' in item, false, name);
    assert.equal(c.gpDetectHistoryCanRestore(item), false, name);
    assert.match(html(), /이 기록은 결과 화면으로 다시 열 수 없어요/, name);
    assert.match(html(), /낮은 구간 · 15\/100/, name);
    assert.match(html(), /<h3>원문<\/h3>/, name);
    assert.doesNotMatch(html(), /결과 화면 다시 보기|다시 불러오기|<h3>문체 지표/, name);
    c.historyOpenDetectReport();
    render();
    await settle();
    assert.equal(opened.length, 0, name);
    assert.equal(calls.length, 1, name);
    assert.match(toasts[0], /다시 열 수 없어요/, name);
  }
});

test('서버 오류는 종류에 따라 요약 유지 또는 수동 재시도로 끝나고, 자동 재감지·자동 반복 호출이 없다', async () => {
  const fail = (status, code) => () => { throw Object.assign(new Error('synthetic'), { status, code }); };
  for (const [status, code] of [[404, 'HISTORY_NOT_FOUND'], [404, 'DETECT_REPORT_NOT_SAVED'], [409, 'DETECT_REPORT_MISMATCH'],
    [422, 'DETECT_REPORT_UNREADABLE'], [422, 'DETECT_REPORT_TOO_LARGE'], [400, 'HISTORY_ID_INVALID']]) {
    const { calls, load, settle, html, render } = setup(fail(status, code));
    const [item] = load(encodedDoc('enc-3'));
    render();
    await settle();
    render();
    await settle();
    assert.equal(item.detectReportState, 'unavailable', code);
    assert.equal(calls.length, 1, code);
    assert.match(html(), /이 기록은 결과 화면으로 다시 열 수 없어요/, code);
    assert.match(html(), /낮은 구간 · 15\/100/, code);
    assert.doesNotMatch(html(), /다시 불러오기/, code);
  }

  // 서버가 확정하지 않은 실패(경로 미배포 404, 로그인 만료, 한도 초과)는 영구 실패로 굳히지 않는다.
  for (const [status, code] of [[404, 'REQUEST_FAILED'], [401, 'AUTH_INVALID'], [429, 'REQUEST_FAILED'], [500, 'REQUEST_FAILED']]) {
    const { calls, load, settle, html, render } = setup(fail(status, code));
    const [item] = load(encodedDoc('enc-3b'));
    render();
    await settle();
    assert.equal(item.detectReportState, 'retry', `${status} ${code}`);
    assert.equal(calls.length, 1);
    assert.match(html(), /다시 불러오기/);
  }

  let attempt = 0;
  const served = sample();
  const { c, calls, opened, load, settle, html, render } = setup((path, body) => {
    attempt += 1;
    if (attempt === 1) throw Object.assign(new Error('synthetic'), { code: 'NETWORK_ERROR' });
    if (attempt === 2) throw Object.assign(new Error('synthetic'), { status: 503, code: 'HISTORY_READ_UNAVAILABLE' });
    return { ok: true, id: body.id, report: served };
  });
  c.lavDetect = () => { throw new Error('재감지 금지'); };
  const [item] = load(encodedDoc('enc-4'));
  render();
  await settle();
  assert.equal(item.detectReportState, 'retry');
  assert.match(html(), /저장된 결과 화면을 불러오지 못했어요/);
  assert.match(html(), /onclick="historyRetryDetectReport\(\)">다시 불러오기<\/button>/);
  assert.match(html(), /다시 불러와도 크레딧은 차감되지 않아요/);
  assert.match(html(), /낮은 구간 · 15\/100/);
  // 다시 그리는 것만으로는 재시도하지 않는다. 사용자가 누를 때만 한 번 더 부른다.
  render(); render();
  await settle();
  assert.equal(calls.length, 1);
  c.historyRetryDetectReport();
  assert.match(html(), /불러오는 중이에요/);
  c.historyRetryDetectReport();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(item.detectReportState, 'retry');
  c.historyRetryDetectReport();
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(item.detectReportState, 'ready');
  assert.match(html(), /결과 화면 다시 보기/);
  c.historyOpenDetectReport();
  assert.equal(opened.length, 1);
  assert.equal(calls.every(call => call.path === '/history/detect-report'), true);
});

test('기존 기록은 그대로다: inline 보관본·보관본 없는 옛 기록·휴머나이징 기록은 서버를 부르지 않는다', async () => {
  const { c, calls, load, settle, html, render } = setup(() => { throw new Error('호출 금지'); });
  const plain = { id: 'plain-1', data: () => ({ type: 'detect', credits: 2, probability: 15, probSource: 'llm', inputText, detectorVersion: 'synthetic-v1', detectResponseCache: sample() }) };
  const legacy = { id: 'legacy-1', data: () => ({ type: 'detect', credits: 2, probability: 72, inputText, summary: '요약' }) };
  const humanize = { id: 'humanize-1', data: () => ({ type: 'humanize', inputText, outputText: '결과', detectResponseCacheEncoded: { v: 2 } }) };
  const unscored = encodedDoc('enc-unscored', { probability: null });
  const empty = encodedDoc('enc-empty', { inputText: '  ' });
  const items = load(plain, legacy, humanize, unscored, empty);
  for (const item of items) {
    c._historyState.selectedId = item.id;
    render();
    await settle();
    assert.equal(item.detectReportState, undefined, item.id);
    assert.doesNotMatch(html(), /불러오는 중이에요|다시 불러오기|다시 열 수 없어요/, item.id);
  }
  assert.equal(calls.length, 0);
  c._historyState.selectedId = 'plain-1';
  render();
  assert.match(html(), /결과 화면 다시 보기/);
  // plain과 압축본이 함께 있는 row(구버전 인스턴스가 덮어쓴 경우)는 서버 규칙과 같이 plain을 쓴다.
  const [both] = load({ id: 'both-1', data: () => ({ ...plain.data(), detectResponseCacheEncoded: { v: 2 } }) });
  render();
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(c.gpDetectHistoryCanRestore(both), true);
});

test('응답을 기다리는 사이 계정이나 목록이 바뀌면 받은 결과를 버린다', async () => {
  let release;
  const { c, load, settle, render } = setup((path, body) => new Promise(resolve => { release = () => resolve({ ok: true, id: body.id, report: sample() }); }));
  const [item] = load(encodedDoc('enc-5'));
  render();
  c.CU = { uid: 'another-account' };
  vm.runInContext('historyState.items = []', c);
  release();
  await settle();
  assert.equal('detectResponseCache' in item, false);
  assert.equal(item.detectReportState, 'loading');
});

test('복원 경로는 브라우저에서 압축을 풀지 않고, 결과 화면 열기는 여전히 서버를 부르지 않는다', () => {
  const app = read('assets/js/app-module.js');
  const presentation = read('assets/js/detect-presentation.js');
  const hydrate = app.slice(app.indexOf('async function historyHydrateDetectReport'), app.indexOf('function historyRender()'));
  assert.ok(hydrate.length > 200);
  assert.match(hydrate, /postAuthedJson\('\/history\/detect-report', \{ id: item\.id \}\)/);
  // 기록 번호만 보낸다. 감지 API·원문 전송·클라이언트 쓰기·잔액 갱신이 없다.
  assert.doesNotMatch(hydrate.replace("'/history/detect-report'", ''), /detect-report|inputText|lavDetect\(|setDoc|updateDoc|saveHistory|\bUC\b|fetch\(/);
  assert.doesNotMatch(app + presentation, /DecompressionStream|pako|gunzip|inflate/i);
  const handler = app.slice(app.indexOf('window.historyOpenDetectReport = function'), app.indexOf('async function historyWriteClipboard'));
  assert.doesNotMatch(handler, /postAuthedJson|fetch\(|getDocs|lavDetect\(/);
});

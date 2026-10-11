import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function setup() {
  const c = { console, Date, Intl, URL }; c.window = c; c.globalThis = c;
  vm.createContext(c);
  for (const file of ['detect-interpretation', 'detect-presentation']) vm.runInContext(read('assets/js/' + file + '.js'), c);
  const flow = read('assets/js/evasion-flow.js');
  c.normalizeSentenceMap = x => x || {};
  vm.runInContext(flow.slice(flow.indexOf('  function reportNumber('), flow.indexOf('  // 퍼널 계측 컨텍스트')), c);
  vm.runInContext(flow.slice(flow.indexOf('  function repClamp01('), flow.indexOf('  function repPaintSurfaceLabel(')), c);
  const nodes = Object.fromEntries(['historyDetailPanel', 'historyWorkspace', 'historyContent'].map(k => [k, { innerHTML: '', classList: { toggle() {} } }]));
  c.document = { getElementById: id => nodes[id] || null };
  c.escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const app = read('assets/js/app-module.js');
  vm.runInContext(app.slice(app.indexOf('function historyBillingInfo'), app.indexOf('async function historyFetchPage')), c);
  const render = record => {
    c._historyState.items = [{ id: 'synthetic', type: 'detect', credits: 2, createdAtMs: Date.now(), ...record }];
    c._historyState.selectedId = 'synthetic';
    vm.runInContext('historyRenderDetail()', c);
    return nodes.historyDetailPanel.innerHTML;
  };
  return { c, render };
}
const inputText = '첫 문장을 확인했습니다. 다음 문장도 확인했습니다.';
const evidence = { category: 'ending_repetition', scope: 'isolated', strength: 'strong', locationStatus: 'source_range_verified', locations: [{ sentenceIndex: 0, start: 0, end: 14 }] };
const row = { probability: 15, probSource: 'llm', inputText, detectCauseEvidence: [evidence] };

test('history uses saved evidence aliases, exact source excerpts and server scope without changing the score', () => {
  const { c, render } = setup();
  const original = JSON.stringify(row);
  const html = render(row);
  assert.match(html, /원문에서 확인한 문체 특징/);
  assert.match(html, /종결 표현/);
  assert.match(html, /일부 문장 · 강함/);
  assert.match(html, /첫 문장을 확인했습니다\./);
  assert.equal(c.gpNormalizeDetectPresentation(row).interpretation.pattern.category, 'ending_repetition');
  assert.equal(c.gpNormalizeDetectPresentation(row).probability, 15);
  assert.equal(JSON.stringify(row), original);
});

test('actual history renderer does not reintroduce short-input or calibration copy and defines the score once', () => {
  const { c, render } = setup();
  const info = c.GPDetectInterpretation.buildDetectInterpretation({ probability: 12, probSource: 'llm', textLength: inputText.length, sentenceTotal: 2 });
  const detail = [info.description, info.evidence.reason, ...info.nextSteps, ...info.limitations].join('\n\n');
  const html = render({ probability: 12, probSource: 'llm', inputText, interpretation: info, detail });
  assert.doesNotMatch(html, /문장 수가 적어|문장이 충분하지|해석에 주의|분석 근거 제한|보정/);
  assert.equal((html.match(/글에 나타난 AI식 표현과 전개를 종합한 점수예요/g) || []).length, 1);
  for (const probability of [0, 10, 20, 21, 49, 50, 100, null]) {
    const out = render({ probability, inputText, probSource: 'llm' });
    assert.equal((out.match(/글에 나타난 AI식 표현과 전개를 종합한 점수예요/g) || []).length, probability === null ? 0 : 1);
    assert.match(out, probability === null ? /점수 확인 필요/ : new RegExp(probability + '/100'));
  }
});

test('matching cached report restores the same five axes; stale cache cannot override a saved result', () => {
  const { c, render } = setup();
  const report = JSON.parse(read('scripts/fixtures/detect-report-sample.json'));
  report.probability = 15; report.detectorVersion = 'synthetic-v1';
  const saved = { ...row, detectorVersion: 'synthetic-v1', detectResponseCache: report };
  const html = render(saved);
  for (const label of ['문체 지표', '문장 길이 균일', '같은 종결 반복', '일반 표현 비율', '구체 근거 부족', '화자 입장 부족 · 해당 없음']) assert.ok(html.includes(label), label);
  const projected = c.gpDetectHistoryMetrics(c.gpDetectHistorySource(saved));
  assert.equal(JSON.stringify(projected), JSON.stringify(c.gpDetectHistoryMetrics(report)));
  assert.doesNotMatch(render({ ...saved, probability: 60 }), /<h3>문체 지표/);
  assert.doesNotMatch(render({ ...saved, detectorVersion: 'other-v2' }), /<h3>문체 지표/);
  assert.equal(c.gpDetectHistorySource(saved).probability, 15);
});

test('invalid or unverified locations never fabricate evidence; original and legacy useful analysis remain escaped', () => {
  const { render } = setup();
  for (const broken of [{ ...evidence, locationStatus: 'unlocated' }, { ...evidence, locations: [{ start: 0, end: 9999 }] }, { ...evidence, locations: [null] }]) {
    assert.doesNotMatch(render({ ...row, interpretation: undefined, detectCauseEvidence: [broken] }), /<h3>원문에서 확인한 문체 특징/);
  }
  assert.doesNotThrow(() => render({ probability: 32, inputText, reportView: { causeAnalysis: { items: {} } } }));
  const out = render({ ...row, inputText: '<img src=x onerror=alert(1)>', detectCauseEvidence: [], detail: '문장 끝의 반복을 확인해 주세요.\n\n이번 분석에서 문체를 설명할 근거가 제한적이에요.' });
  assert.match(out, /&lt;img/);
  assert.doesNotMatch(out, /<img|근거가 제한적/);
  assert.match(out, /문장 끝의 반복을 확인해 주세요/);
});

test('calibration is not disclosed or applied again and absent measurements do not produce axes', () => {
  const { render } = setup();
  const html = render({ ...row, rawProbability: 25, probabilityCalibration: { applied: true }, historyComparison: { version: 'humanize-comparison-v1', basis: 'history_adjusted_style', sourceProbability: 60, probability: 15, calibrationApplied: true } });
  assert.match(html, /15\/100/);
  assert.doesNotMatch(html, /보정|60점|25점|<h3>문체 지표/);
});

test('a saved score without a recorded source (pre-2026-09-01 records) is shown as a score, not as a failed analysis', () => {
  const { render } = setup();
  const legacy = { probability: 72, inputText, summary: 'AI가 작성했을 가능성이 높은 글이에요.', detail: '같은 종결이 연달아 나옵니다.\n\n접속어가 정형적으로 쓰였습니다.' };
  const html = render(legacy);
  assert.match(html, /높은 구간 · 72\/100/);
  assert.match(html, /AI식 문체 점수가 높은 구간이에요/);
  assert.match(html, /높은 구간 · 70~100점/);
  assert.match(html, /같은 종결이 연달아 나옵니다/);
  assert.doesNotMatch(html, /분석 결과를 확인할 수 없어요|점수 확인 필요|저장된 결과를 다시 열거나/);
  // 점수가 아예 없거나, 모델이 아닌 출처가 명시된 기록은 그대로 '확인 필요'로 남는다.
  assert.match(render({ probability: null, inputText }), /점수 확인 필요/);
  assert.match(render({ probability: 72, inputText, probSource: 'engine' }), /분석 결과를 확인할 수 없어요/);
  assert.match(render({ probability: 72, inputText, reportView: { styleSignal: { source: 'engine' } } }), /분석 결과를 확인할 수 없어요/);
});

test('only the response saved for this exact record can reopen the result screen, without billing receipts', () => {
  const { c, render } = setup();
  const report = JSON.parse(read('scripts/fixtures/detect-report-sample.json'));
  Object.assign(report, { probability: 15, detectorVersion: 'synthetic-v1', charged: 6, remainingCredits: 94, activation: { first: true }, idempotentReplay: true });
  const saved = { ...row, type: 'detect', detectorVersion: 'synthetic-v1', detectResponseCache: report };
  const before = JSON.stringify(saved);
  const restored = c.gpDetectHistoryReport(saved);
  assert.equal(c.gpDetectHistoryCanRestore(saved), true);
  assert.equal(restored.probability, 15);
  assert.equal(JSON.stringify(restored.sentenceMap), JSON.stringify(report.sentenceMap));
  assert.equal(JSON.stringify(restored.example), JSON.stringify(report.example));
  for (const key of ['charged', 'remainingCredits', 'activation', 'idempotentReplay']) assert.equal(key in restored, false, key);
  restored.reportView.status = 'changed';
  assert.equal(JSON.stringify(saved), before);
  for (const broken of [
    { ...saved, probability: 60 },
    { ...saved, detectorVersion: 'other-v2' },
    { ...saved, type: 'humanize' },
    { ...saved, inputText: '' },
    { ...saved, detectResponseCache: { ...report, reportView: null } },
    { ...saved, detectResponseCache: { ...report, ok: false } },
    { ...saved, detectResponseCache: { ...report, inputText: '다른 글' } },
    { ...saved, detectResponseCache: undefined }
  ]) {
    assert.equal(c.gpDetectHistoryCanRestore(broken), false);
    assert.equal(c.gpDetectHistoryReport(broken), null);
  }
  // 버튼은 복원할 수 있는 기록에만, 원문보다 위에 나온다.
  assert.doesNotMatch(render(saved), /결과 화면 다시 보기/);
  c.lavOpenSavedDetectReport = () => true;
  const html = render(saved);
  assert.match(html, /onclick="historyOpenDetectReport\(\)">결과 화면 다시 보기<\/button>/);
  assert.match(html, /크레딧은 차감되지 않아요/);
  assert.ok(html.indexOf('gp-history-reopen') < html.indexOf('<h3>원문</h3>'));
  assert.doesNotMatch(render({ ...saved, detectorVersion: 'other-v2' }), /결과 화면 다시 보기/);
  assert.doesNotMatch(render(row), /결과 화면 다시 보기/);
});

test('reopening a saved report never calls the server and is labelled apart from a new detection', () => {
  const flow = read('assets/js/evasion-flow.js');
  const reopen = flow.slice(flow.indexOf('  window.lavOpenSavedDetectReport = function'), flow.indexOf('  // ── 교수님 레이더 인트로'));
  assert.ok(reopen.length > 200);
  assert.doesNotMatch(reopen, /fetch\(|apiUrl|evGetIdToken|lavDetect\(|window\.UC\b/);
  assert.match(reopen, /reportRestore = \{ savedAtMs:/);
  assert.match(reopen, /finally \{\s*reportRestore = null;/);
  assert.match(flow, /if \(restore\) window\.gpTrack\('detect_report_reopen', detectCtx\);\s*else window\.gpTrack\('detect_report_view', detectCtx\);/);
  assert.match(flow, /지난 감지 결과를 다시 연 화면이에요\. 크레딧은 차감되지 않았어요\./);
  assert.match(read('pages/main.html'), /<p class="gp-rep-saved" id="gpRepSaved" hidden><\/p>/);
  const app = read('assets/js/app-module.js');
  const handler = app.slice(app.indexOf('window.historyOpenDetectReport = function'), app.indexOf('async function historyWriteClipboard'));
  assert.ok(handler.length > 200);
  assert.doesNotMatch(handler, /postAuthedJson|fetch\(|getDocs|lavDetect\(/);
  assert.match(handler, /window\.gpDetectHistoryReport\(item\)/);
  assert.match(handler, /action: 'reopen_report'/);
});

test('saved records use the result screen names and order for located style features', () => {
  const { render } = setup();
  const text = '하나를 확인했습니다. 둘을 확인했습니다. 셋을 확인했습니다. 넷을 확인했습니다.';
  const at = (index, sentence) => ({ sentenceIndex: index, start: text.indexOf(sentence), end: text.indexOf(sentence) + sentence.length });
  const located = [
    { category: 'generic_abstraction', scope: 'recurring', strength: 'moderate', locationStatus: 'source_range_verified', locations: [at(0, '하나를 확인했습니다.'), at(2, '셋을 확인했습니다.')] },
    { category: 'ending_repetition', scope: 'pervasive', strength: 'moderate', locationStatus: 'source_range_verified', locations: [at(1, '둘을 확인했습니다.'), at(3, '넷을 확인했습니다.')] },
    { category: 'formulaic_transition', scope: 'recurring', strength: 'strong', locationStatus: 'source_range_verified', locations: [at(2, '셋을 확인했습니다.'), at(3, '넷을 확인했습니다.')] }
  ];
  const items = [['ending_repetition', '종결 표현 반복'], ['formulaic_transition', '정형적인 연결·결론'], ['generic_abstraction', '추상적 일반론']]
    .map(([category, categoryLabel]) => ({ category, categoryLabel }));
  const html = render({ probability: 72, probSource: 'llm', inputText: text, detectCauseEvidence: located, reportView: { causeAnalysis: { items } } });
  const order = ['정형적인 연결·결론', '종결 표현 반복', '추상적 일반론'].map(label => html.indexOf(label + '\n'));
  assert.ok(order.every(position => position > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // 화면용 이름이 저장돼 있지 않은 기록은 기존 이름으로 보여 준다.
  assert.match(render({ probability: 72, probSource: 'llm', inputText: text, detectCauseEvidence: located }), /연결과 결론\n여러 문장 · 강함/);
});

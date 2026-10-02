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

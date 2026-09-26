import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const browser = {};
browser.window = browser;
vm.createContext(browser);
vm.runInContext(read('assets/js/detect-interpretation.js'), browser);
vm.runInContext(read('assets/js/detect-presentation.js'), browser);
const build = browser.GPDetectInterpretation.buildDetectInterpretation;
const normalize = browser.gpNormalizeDetectPresentation;
const base = { probability: 32, probSource: 'llm', confidence: 'high', textLength: 1000, sentenceTotal: 10, causeCoverageStatus: 'aligned' };
const signal = (category, locations = 2) => ({ category, strength: 'strong', scope: 'recurring', locationStatus: 'source_range_verified',
  locations: Array.from({ length: locations }, (_, i) => ({ sentenceIndex: i, start: i * 50, end: i * 50 + 30 })) });

test('public score copy omits sample warnings and calibration without changing scores or metadata',()=>{
  assert.equal(browser.gpDetectCalibrationDetails, undefined);
  for (let probability = 0; probability <= 100; probability++) {
    const input = { probability, probSource: 'llm', inputChars: 140,
      reportView: { measuredEvidence: { sentenceTotal: 2 } },
      scoreAdjustment: { matched: true, before: Math.min(100, probability + 10), after: probability } };
    const snapshot = JSON.stringify(input);
    const result = normalize(input);
    const copy = browser.gpDetectScoreCopy(result.interpretation);
    assert.equal(result.probability, probability);
    assert.equal(result.scoreAdjustment, input.scoreAdjustment);
    assert.equal(JSON.stringify(input), snapshot);
    assert.doesNotMatch(JSON.stringify(copy) + browser.gpDetectInterpretationText(result.interpretation), /해석 범위|분석 근거 제한|이력 보정|보정 전|짧은 글/);
    assert.doesNotMatch(copy.description, /사람이 쓴|AI가 작성했을 확률/);
  }
});

test('short reports retain verified causes without claiming missing evidence', () => {
  const info = build({ ...base, textLength: 160, sentenceTotal: 2, signalEvidence: [signal('ending_repetition')] });
  const copy = browser.gpDetectScoreCopy(info);
  assert.match(copy.headline, /종결 표현/);
  assert.match(copy.description, /2개 문장/);
  assert.match(copy.nextSteps[0], /종결 표현/);
  const noEvidence = browser.gpDetectScoreCopy(build({ ...base, textLength: 160, sentenceTotal: 2 }));
  assert.equal(noEvidence.nextSteps.length, 0);
  assert.doesNotMatch(noEvidence.description, /확인한 특징|개 문장/);
});

test('browser uses the server scope and retains unscored statistics disclosure',()=>{
  for(const scope of ['isolated','recurring','pervasive'])assert.equal(build({...base,signalEvidence:[{...signal('ending_repetition'),scope}]}).pattern.scope,scope);
  const r=build({...base,statisticalReference:{basis:'independent_statistics',scoreApplied:false}});
  assert.equal(r.score,32);assert(r.limitations.some(s=>s.includes('점수에는 반영하지 않았어요')));
});

test('statistics explanation survives browser fallback without turning weak causes into strong evidence', () => {
  const statisticalSupport = { version:'statistical-assist-v5-whitespace-stable',modelVersion:'korean-style-statistics-v1',
    applied:true,originalScore:18,score:49,margin:0.2,features:300,profile:'general',basis:'independent_statistics' };
  const result = normalize({ probability:49,probSource:'llm',confidence:'high',inputChars:1000,
    statisticalSupport,signalEvidence:[{...signal('generic_abstraction'),strength:'weak'}],
    reportView:{measuredEvidence:{sentenceTotal:10},causeAnalysis:{status:'aligned'}} });
  assert.equal(result.probability,49);
  assert.equal(result.interpretation.evidence.level,'some');
  assert.match(result.interpretation.description,/문체 통계/);
  const historyResult = normalize({probability:49,probSource:'llm',detectConfidence:'high',inputText:'합성 문장. '.repeat(80),
    detectStatisticalSupport:statisticalSupport,detectCauseAlignment:{status:'aligned'},
    interpretation:{version:'detect-interpretation-v2',sample:{sentences:10}}});
  assert.match(historyResult.interpretation.description,/문체 통계/);
  assert.equal(historyResult.interpretation.evidence.level,'some');
});

test('six descriptive ranges retain the original low/middle/high score boundaries', () => {
  for (const [score, band, key] of [[0,'low','minimal'],[10,'low','minimal'],[11,'low','low'],[20,'low','low'],[21,'moderate','noticeable'],[34,'moderate','noticeable'],[35,'moderate','mixed'],[49,'moderate','mixed'],[50,'high','repeated'],[69,'high','repeated'],[70,'high','pronounced'],[100,'high','pronounced']]) {
    const result = build({ ...base, probability: score });
    assert.equal(result.score, score);
    assert.equal(result.band, band);
    assert.equal(result.subBand.key, key);
  }
});

test('missing or invalid score remains unavailable, never a zero signal', () => {
  for (const probability of [null, undefined, '', ' ', false, true, NaN, [], {}]) {
    const result = build({ ...base, probability });
    assert.equal(result.score, null);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.band, 'unknown');
    const normalized = normalize({ probability });
    assert.equal(normalized.probability, null);
    assert.equal(normalized.interpretation.score, null);
  }
});

test('same score earns different actionable copy only from grounded categories', () => {
  const ending = build({ ...base, signalEvidence: [signal('ending_repetition')] });
  const structure = build({ ...base, signalEvidence: [signal('overstructured_progression')] });
  assert.notEqual(ending.headline, structure.headline);
  assert.match(ending.nextSteps[0], /문장 끝/);
  assert.match(structure.nextSteps[0], /내용상 필요한 순서는 유지/);
  assert.equal(ending.pattern.locationCount, 2);
  assert.equal(ending.pattern.scope, 'recurring');
  assert.deepEqual(build({ ...base, signalEvidence: [signal('ending_repetition')] }), ending);
});

test('weak catch-all cause cannot displace verified concrete guidance', () => {
  const result = build({ ...base, signalEvidence: [
    { ...signal('other_observed_style', 9), strength: 'weak' },
    { ...signal('ending_repetition', 3), strength: 'moderate' }
  ] });
  assert.equal(result.pattern.category, 'ending_repetition');
  assert.equal(result.score, base.probability);
  assert.match(result.nextSteps[0], /문장 끝/);
});

test('unverified, out-of-bounds, duplicated locations do not invent repeated evidence', () => {
  const unverified = signal('ending_repetition');
  delete unverified.locationStatus;
  assert.equal(build({ ...base, signalEvidence: [unverified] }).pattern, null);
  assert.equal(build({ ...base, signalEvidence: [{ ...signal('ending_repetition'), locations: [{ sentenceIndex: 0, start: 0, end: 1001 }] }] }).pattern, null);
  const one = signal('ending_repetition', 1);
  one.scope = 'isolated'; // The server owns scope; this fixture represents one verified unit.
  one.locations.push(one.locations[0]);
  const result = build({ ...base, signalEvidence: [one, one] });
  assert.equal(result.pattern.locationCount, 1);
  assert.equal(result.pattern.scope, 'isolated');
});

test('verified source coordinates alone identify the second and fifth paragraphs', () => {
  const observed = signal('ending_repetition');
  observed.locations[0].paragraphIndex = 1;
  observed.locations[1].paragraphIndex = 4;
  const result = build({ ...base, signalEvidence: [observed] });
  assert.deepEqual(Array.from(result.pattern.paragraphIndices), [1, 4]);
  assert.match(result.description, /확인 위치: 2·5번 문단/);
  const unverified = build({ ...base, signalEvidence: [{ ...observed, locationStatus: 'unverified' }] });
  assert.equal(unverified.pattern, null);
  assert.doesNotMatch(unverified.description, /2·5번 문단/);
  const invalid = build({ ...base, signalEvidence: [{ ...observed, locations: observed.locations.map(loc => ({ ...loc, end: 1001 })) }] });
  assert.equal(invalid.pattern, null);
  assert.doesNotMatch(invalid.description, /번 문단/);
});

test('short input, missing analysis data and partial evidence have separate recovery copy', () => {
  const short = build({ ...base, textLength: 160, sentenceTotal: 2 });
  assert.equal(short.evidence.level, 'limited');
  assert.match(short.headline, /짧은 글/);
  const partial = build({ ...base, causeCoverageStatus: 'partial' });
  assert.equal(partial.status, 'partial');
  assert.match(partial.evidence.reason, /연결하지 못/);
  const unknown = build({ probability: 0, probSource: 'unknown' });
  assert.equal(unknown.status, 'unavailable');
  assert.doesNotMatch(unknown.headline, /매우 낮/);
});

test('stored interpretation wins consistently, stale score descriptor is rebuilt', () => {
  const saved = build({ ...base, signalEvidence: [signal('formulaic_transition')] });
  const item = { probability: 32, interpretation: saved, inputText: '기록 원문', summary: '이전 요약', detail: '첫 문단\n\n둘째 문단' };
  const result = normalize(item);
  assert.equal(result.interpretation, saved);
  assert.equal(result.summary, browser.gpDetectScoreCopy(saved).headline);
  assert.equal(result.detail, item.detail);
  assert.equal(browser.gpDetectInterpretationText(saved).includes(saved.nextSteps[0]), true);
  const changed = normalize({ ...item, probability: 70 });
  assert.equal(changed.interpretation.score, 70);
  assert.notEqual(changed.interpretation, saved);
});

test('legacy reports derive grounded feedback using text and measured evidence', () => {
  const result = normalize({ probability: 17, probSource: 'llm', confidence: 'high', inputText: '가'.repeat(1000),
    reportView: { measuredEvidence: { sentenceTotal: 10 }, causeAnalysis: { status: 'aligned', items: [signal('lexical_template')] } } });
  assert.match(result.summary, /전체 신호는 낮아요/);
  assert.equal(result.interpretation.pattern.category, 'lexical_template');
  assert.equal(result.interpretation.sample.characters, 1000);
  const styleOnly = normalize({ reportView: { styleSignal: { score: 32, source: 'llm' } } });
  assert.equal(styleOnly.probability, 32);
  assert.equal(styleOnly.interpretation.score, 32);
  const explicitlyMissing = normalize({ probability: null, reportView: { styleSignal: { score: 32, source: 'llm' } } });
  assert.equal(explicitlyMissing.probability, null);
  assert.equal(explicitlyMissing.interpretation.score, null);
});

test('incomplete persisted descriptors fall back without breaking history or export', () => {
  const result = normalize({ probability: 32, interpretation: { version: browser.GPDetectInterpretation.VERSION, score: 32, evidence: {}, nextSteps: [], headline: '오래된 결과', description: '' } });
  assert.ok(Array.isArray(result.interpretation.limitations));
  assert.notEqual(result.interpretation.headline, '오래된 결과');
  assert.equal(typeof browser.gpDetectInterpretationText(result.interpretation), 'string');
});

test('old calibration prose and score contradictions are replaced without editing original or valid paragraphs', () => {
  const saved = build({ ...base, probability: 12, signalEvidence: [signal('ending_repetition')] });
  const inputText = '원문에는 센서 보정과 변환 이력이라는 표현이 있습니다.\n\n원문은 그대로 유지합니다.';
  const detail = '첫 문단의 근거는 유지해 주세요.\n\n확인된 변환 이력을 반영한 점수와 원인 설명을 함께 표시해요.\n\n마지막 문단은 2024년 자료를 인용해요.';
  const result = normalize({ probability: 12, interpretation: saved, detail, inputText });
  assert.equal(result.inputText, inputText);
  assert.match(result.detail, /^첫 문단의 근거는 유지해 주세요\.\n\n/);
  assert.match(result.detail, /\n\n마지막 문단은 2024년 자료를 인용해요\.$/);
  assert.equal(result.detail.includes(browser.gpDetectScoreCopy(saved).description), true);
  assert.doesNotMatch(result.detail, /변환 이력|보정/);
  const contradictory = normalize({ probability: 12, interpretation: saved, detail: 'AI식 문체 신호가 높게 감지됐어요. 자료 출처는 별도로 확인해 주세요.' });
  assert.doesNotMatch(contradictory.detail, /신호가 높/);
  assert.match(contradictory.detail, /자료 출처는 별도로 확인해 주세요\./);
  assert.equal(browser.gpDetectPublicNarrative('확인된 변환 이력을 반영한 점수와 원인 설명을 함께 표시해요.', saved), browser.gpDetectScoreCopy(saved).description);
});

test('empty editor does not replace stored report length with zero', () => {
  const result = normalize({ probability: 12, probSource: 'llm', inputChars: 1000, confidence: 'high',
    reportView: { measuredEvidence: { sentenceTotal: 10 }, causeAnalysis: { status: 'aligned' } } }, { inputText: '' });
  assert.equal(result.interpretation.sample.characters, 1000);
  assert.doesNotMatch(result.interpretation.headline, /짧은 글/);
  const unknown = normalize({ probability: 12, probSource: 'llm' }, { inputText: '' });
  assert.equal(unknown.interpretation.sample.characters, null);
  const storedText = normalize({ probability: 12, probSource: 'llm', inputText: '가'.repeat(800) }, { inputText: '  ' });
  assert.equal(storedText.interpretation.sample.characters, 800);
});

test('numeric authorship claims are replaced without removing useful analysis or original text', () => {
  for (const claim of ['AI가 작성했을 확률은 32%입니다.', 'AI가 작성했을 확률은 32.5%입니다.', '사람이 썼을 가능성은 68퍼센트입니다.', 'AI 작성 비율: 32%입니다.']) {
    const inputText = claim + '\n원문은 그대로입니다.';
    const result = normalize({ probability: 32, probSource: 'llm', inputText,
      detail: claim + ' 문장 끝의 반복을 확인해 주세요.\n\n인용 자료의 응답률은 32.5%예요.' });
    assert.equal(result.inputText, inputText);
    assert.equal(result.detail.includes(claim), false);
    assert.equal(result.detail.includes(browser.gpDetectScoreCopy(result.interpretation).description), true);
    assert.match(result.detail, /문장 끝의 반복을 확인해 주세요\.\n\n인용 자료의 응답률은 32\.5%예요\.$/);
  }
});

test('successful cached model results retain the same interpretation as live results', () => {
  const report = { probability: 32, confidence: 'high', inputChars: 1000,
    reportView: { measuredEvidence: { sentenceTotal: 10 }, causeAnalysis: { status: 'aligned', items: [signal('ending_repetition')] } } };
  const live = normalize({ ...report, probSource: 'llm' });
  const cached = normalize({ ...report, probSource: 'cached_llm' });
  assert.deepEqual(cached.interpretation, live.interpretation);
  assert.equal(cached.interpretation.status, 'ready');
  assert.equal(cached.probSource, 'cached_llm');
});

test('copy never describes author probability or calibration effects', () => {
  const text = [0, 17, 32, 42, 60, 90].flatMap(probability => ['ending_repetition', 'generic_abstraction', 'insufficient_grounding'].map(category => JSON.stringify(build({ ...base, probability, signalEvidence: [signal(category)] })))).join('\n');
  assert.doesNotMatch(text, /제출 권장|피하기에 유리|안전합니다|보정|사람이 쓴 글/);
});

test('browser bootstrap, result, history and image export share the same interpretation', () => {
  const boot = read('assets/js/app-boot.js');
  assert.ok(boot.indexOf("loadScript('/assets/js/detect-interpretation.js')") < boot.indexOf("loadScript('/assets/js/detect-presentation.js')"));
  const flow = read('assets/js/evasion-flow.js');
  assert.match(flow, /gpRepInterpretationDesc'\)\.textContent = repStripLocationNote\(model\.synthesis\.description\)/);
  assert.doesNotMatch(flow, /ctx\.fillText\(info\.evidence\.label/);
  assert.match(flow, /gpDetectScoreCopy\(model\.interpretation\)/);
  assert.match(read('assets/js/app-module.js'), /gpDetectInterpretationText\(view\.interpretation\)/);
  assert.match(read('assets/js/app-module.js'), /if \(typeof detectResult\.interpretationProof === 'string'\) data\.interpretationProof = detectResult\.interpretationProof;/);
  const main = read('pages/main.html');
  assert.equal((main.match(/id="gpRepInterpretation"/g) || []).length, 1);
});

test('renderer ignores stale supplied badges when a score is unavailable or in another band', () => {
  const flow = read('assets/js/evasion-flow.js');
  const start = flow.indexOf('  function professorRadarFor(score, supplied)');
  const end = flow.indexOf('  function contentEvidenceLabel', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(flow.slice(start, end), browser);
  const missing = browser.professorRadarFor(null, { band: 'low', label: '판정 보류', headline: '과거 제목' });
  assert.equal(missing.label, '점수 확인 필요');
  assert.equal(missing.headline, '점수 확인 필요');
  assert.equal(missing.band, 'limited');
  assert.equal(browser.professorRadarFor(0, { band: 'hard' }).band, 'low');
});

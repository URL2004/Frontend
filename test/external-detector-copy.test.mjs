import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const flow = read('assets/js/evasion-flow.js');

const EXTERNAL_NOT_GUARANTEED = '외부 검사 결과는 글과 도구에 따라 달라지며 점수를 보장하지 않아요.';
const LEGACY_TAIL = '작성 주체나 외부 검사 결과를 확정하지 않아요.';
const CURRENT_TAIL = '작성 주체를 확정하지 않아요. 외부 검사 결과와 다를 수 있어요.';

// 완료 화면 안내문을 실제 코드 그대로 실행해 모드별 문구를 얻는다.
function doneNote(mode, designOn) {
  const start = flow.indexOf("    var doneNote = $('lavDoneNote');");
  const end = flow.indexOf('    renderBillingDisposition(st);', start);
  assert.ok(start > 0 && end > start, '완료 안내문 블록을 찾음');
  const node = { textContent: '' };
  const c = { $: id => (id === 'lavDoneNote' ? node : null), st: { mode }, resultDesignOn: () => designOn };
  vm.createContext(c);
  vm.runInContext(flow.slice(start, end), c);
  return node.textContent;
}

function setup() {
  const c = { console, Date, Intl, URL }; c.window = c; c.globalThis = c;
  vm.createContext(c);
  for (const file of ['detect-interpretation', 'detect-presentation']) vm.runInContext(read('assets/js/' + file + '.js'), c);
  c.normalizeSentenceMap = x => x || {};
  vm.runInContext(flow.slice(flow.indexOf('  function reportNumber('), flow.indexOf('  // 퍼널 계측 컨텍스트')), c);
  return c;
}

test('고급 휴머나이징 완료 화면도 외부 검사 결과를 보장하지 않는다고 알린다', () => {
  for (const designOn of [true, false]) {
    const formal = doneNote('formal', designOn);
    assert.ok(formal.includes(EXTERNAL_NOT_GUARANTEED), formal);
    // '정밀 검증 완료'만 남으면 결과를 보장하는 말로 읽힌다 — 같은 문장 묶음 안에 있어야 한다.
    assert.ok(formal.indexOf('정밀 검증이 완료됐어요.') < formal.indexOf(EXTERNAL_NOT_GUARANTEED));
    assert.equal(formal.split('원문과').length - 1, 1, '원문 대조 안내는 한 번만');
    assert.ok(doneNote('blog', designOn).includes(EXTERNAL_NOT_GUARANTEED));
  }
  // 원문 보존 다듬기는 감지 점수를 다루는 기능이 아니다.
  assert.doesNotMatch(doneNote('polish', true), /외부 검사/);
});

test("'확정'은 작성 주체에만 쓰고, 외부 검사는 결과가 다를 수 있다고 말한다", () => {
  const c = setup();
  const fallback = c.buildReportModel({ probability: 40, probSource: 'llm' }).synthesis.limitation;
  assert.ok(fallback.endsWith(CURRENT_TAIL), fallback);
  const info = c.GPDetectInterpretation.buildDetectInterpretation({ probability: 40, probSource: 'llm', textLength: 400, sentenceTotal: 8 });
  assert.ok(info.limitations[0].endsWith(CURRENT_TAIL), info.limitations[0]);
  assert.ok(c.gpDetectInterpretationText(info).endsWith(CURRENT_TAIL));
  for (const file of ['assets/js/evasion-flow.js', 'assets/js/detect-interpretation.js', 'pages/main.html']) {
    assert.doesNotMatch(read(file), /외부 검사 결과를 확정/u, file);
  }
});

test('서버 응답과 저장된 기록의 예전 문구는 화면에서만 현재 문구로 바뀐다', () => {
  const c = setup();
  // 보관된 응답 견본은 2026-10-12 이전 문구 그대로다.
  const report = JSON.parse(read('scripts/fixtures/detect-report-sample.json'));
  assert.ok(report.reportView.synthesis.limitation.endsWith(LEGACY_TAIL));
  const before = JSON.stringify(report);
  const shown = c.buildReportModel(report).synthesis.limitation;
  assert.ok(shown.endsWith(CURRENT_TAIL), shown);
  assert.doesNotMatch(shown, /외부 검사 결과를 확정/u);
  assert.equal(JSON.stringify(report), before, '저장된 응답은 바꾸지 않는다');
  // 예전 문구를 바꾼 결과와 지금 새로 만드는 문구가 같아야 기록과 새 결과가 다르게 보이지 않는다.
  assert.equal(shown, c.buildReportModel({ probability: 40, probSource: 'llm' }).synthesis.limitation);
  assert.equal(c.gpDetectLimitCopy('문체 신호를 설명하는 참고 결과예요. ' + LEGACY_TAIL),
    c.GPDetectInterpretation.buildDetectInterpretation({ probability: 40, probSource: 'llm', textLength: 400, sentenceTotal: 8 }).limitations[0]);
  // 문구가 아닌 값과 이미 현재 문구인 글은 그대로 둔다.
  assert.equal(c.gpDetectLimitCopy(shown), shown);
  assert.equal(c.gpDetectLimitCopy(undefined), undefined);
  assert.equal(c.gpDetectLimitCopy(null), null);
});

test('작업 기록은 예전 문구로 저장된 상세 설명을 그대로 내보내지 않는다', () => {
  const c = setup();
  const inputText = '첫 문장을 확인했습니다. 다음 문장도 확인했습니다.';
  const info = c.GPDetectInterpretation.buildDetectInterpretation({ probability: 12, probSource: 'llm', textLength: inputText.length, sentenceTotal: 2 });
  const savedInfo = { ...info, limitations: info.limitations.map(line => line.split(CURRENT_TAIL).join(LEGACY_TAIL)) };
  assert.ok(savedInfo.limitations[0].endsWith(LEGACY_TAIL));
  const savedDetail = [savedInfo.description, savedInfo.evidence.reason, ...savedInfo.nextSteps, ...savedInfo.limitations].join('\n\n');
  for (const record of [
    { probability: 12, probSource: 'llm', inputText, interpretation: savedInfo, detail: savedDetail },
    { probability: 12, probSource: 'llm', inputText, detail: savedDetail }
  ]) {
    const text = c.gpDetectHistorySections(record).map(section => section.title + '\n' + section.text).join('\n\n');
    assert.doesNotMatch(text, /외부 검사 결과를 확정/u);
    assert.equal(text.split('외부 검사 결과와 다를 수 있어요.').length - 1, 1, text);
    assert.doesNotMatch(c.gpNormalizeDetectPresentation(record).detail, /외부 검사 결과를 확정/u);
  }
});

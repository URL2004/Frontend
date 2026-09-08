import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../assets/js/detect-presentation.js', import.meta.url), 'utf8');
const saveFunction = source.slice(source.indexOf('window.saveHistory = async'), source.indexOf('function historyBillingInfo('));
const data = { type: 'detect', probability: 68, inputText: '합성 검증용 문장',
  historyComparison: { version: 'humanize-comparison-v1', basis: 'history_adjusted_style',
    sourceProbability: 72, probability: 68, calibrationApplied: true },
  historyComparisonProof: 'synthetic-server-proof-forwarded-unchanged' };

test('backup API and pending queue preserve the opaque server comparison proof unchanged', async () => {
  for (const failure of [false, true]) {
    let payload, pending;
    const sandbox = { window: {}, CU: { uid: 'synthetic-user' }, newClientRequestId: () => 'synthetic-history-request',
      postAuthedJson: async (_url, body) => { payload = body; if (failure) throw new Error('synthetic offline'); },
      backupHistoryLocal: (uid, entry, requestId) => { pending = { uid, entry, requestId }; }, console: { error() {} } };
    vm.runInNewContext(saveFunction, sandbox);
    const saved = await sandbox.window.saveHistory('detect', data.inputText, data, null, 3);
    assert.equal(saved, !failure);
    assert.equal(payload.entry.historyComparisonProof, data.historyComparisonProof);
    assert.equal(payload.entry.historyComparison, data.historyComparison);
    assert.equal(payload.entry.probability, 68);
    if (failure) {
      assert.equal(pending.entry.historyComparisonProof, data.historyComparisonProof);
      assert.equal(pending.requestId, payload.requestId);
    }
  }
});

test('saved history detail renders only the comparison matching the visible score', () => {
  const panel = { innerHTML: '' }, workspace = { classList: { toggle() {} } };
  const sandbox = { window: {}, document: { getElementById: id => id === 'historyDetailPanel' ? panel : workspace },
    historyState: { items: [{ ...data, id: 'synthetic-history', credits: 3 }], selectedId: 'synthetic-history' },
    historyWorkStatus: () => ({ tone: 'low', label: '68점' }), historyBillingInfo: () => ({ short: '3크레딧' }),
    historyProbability: item => item.probability, historyCleanLine: text => String(text || '').trim(),
    historyDateText: () => '검증일', historyTitle: () => '합성 검증', escapeHtml: text => String(text || '').replace(/</g, '&lt;') };
  vm.runInNewContext(presentation, sandbox);
  sandbox.historyDetectView = item => sandbox.window.gpNormalizeDetectPresentation(item);
  const start = source.indexOf('function historyDetailBlock(');
  vm.runInNewContext(source.slice(start, source.indexOf('function historyRender()', start)), sandbox);
  sandbox.historyRenderDetail();
  assert.match(panel.innerHTML, /휴머나이징 전후 비교/);
  assert.match(panel.innerHTML, /원글 72점.*68점.*4점 감소/);
  sandbox.historyState.items[0].probability = 40;
  sandbox.historyRenderDetail();
  assert.doesNotMatch(panel.innerHTML, /휴머나이징 전후 비교/);
});

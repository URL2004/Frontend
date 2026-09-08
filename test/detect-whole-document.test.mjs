import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function combineChunkResults('), source.indexOf('async function runAnalysis('));

test('긴 글 감지는 본문 전체·멱등 키·서버 이력을 한 요청으로 유지한다', async () => {
  const calls = [];
  const result = { ok: true, result: { probability: 60 }, historySaved: true, needed: 123 };
  const context = { callAnalyzeApi: async payload => { calls.push(payload); return result; } };
  vm.runInNewContext(functions, context);
  const text = '긴 글 전체 문맥과 변환 결과를 보존합니다. '.repeat(500);
  const received = await context.runChunkedText(text, { mode: 'detect', requestId: 'same-request-123', prevContext: '제외할 이전 청크' });
  assert.equal(received, result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, text);
  assert.equal(calls[0].prevContext, '');
  assert.equal(calls[0].requestId, 'same-request-123');
  assert.throws(() => context.combineChunkResults([{ probability: 90 }, { probability: 10 }], 'detect'), /전체 글/);
});

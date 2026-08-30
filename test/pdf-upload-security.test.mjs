import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appMain = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');

test('PDF 텍스트 추출은 PDF.js eval과 문서 스크립팅을 비활성화한다', () => {
  const start = appMain.indexOf('async function extractPdfText(file)');
  const end = appMain.indexOf('\nfunction handlePDF(input)', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const extractor = appMain.slice(start, end);

  assert.match(extractor, /getDocument\(\{[\s\S]*data:\s*buf,[\s\S]*isEvalSupported:\s*false,[\s\S]*enableScripting:\s*false[\s\S]*\}\)/u);
  assert.doesNotMatch(extractor, /getDocument\(\{\s*data:\s*buf\s*\}\)/u);
});

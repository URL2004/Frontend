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

test('PDF 텍스트 추출은 페이지·문자·처리시간 자원 상한을 둔다', () => {
  assert.match(appMain, /PDF_MAX_PAGES = 100/u);
  assert.match(appMain, /PDF_MAX_EXTRACTED_CHARS = 30000/u);
  assert.match(appMain, /PDF_EXTRACT_TIMEOUT_MS = 20000/u);
  assert.match(appMain, /pdf\.numPages > PDF_MAX_PAGES/u);
  assert.match(appMain, /out\.length > PDF_MAX_EXTRACTED_CHARS/u);
  assert.match(appMain, /withPdfDeadline\(loadingTask\.promise, deadline\)/u);
  assert.match(appMain, /withPdfDeadline\(pdf\.getPage\(i\), deadline\)/u);
  assert.match(appMain, /withPdfDeadline\(page\.getTextContent\(\), deadline\)/u);
  assert.match(appMain, /loadingTask\.destroy/u);
});

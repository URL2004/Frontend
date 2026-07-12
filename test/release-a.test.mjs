import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('브라우저 휴머나이징 호출은 /transform job으로만 실행된다', async () => {
  const [appMain, evasion] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(appMain, /payload\.mode\s*!==\s*['"]detect['"]/u);
  assert.match(appMain, /transformFetchJson\([^,]+,\s*['"]\/transform['"]/u);
  assert.match(evasion, /mode:\s*['"]formal['"]/u);
  assert.match(evasion, /length:\s*['"]keep['"]/u);
  assert.doesNotMatch(evasion, /\/analyze(?:-pdf)?/u);
});

test('기본·고급 설명은 변환 세기가 아닌 검증 범위를 구분한다', async () => {
  const html = await read('pages/main.html');
  assert.match(html, /차이는 변환 세기가 아니라 검증 범위예요/u);
  assert.match(html, /모든 글의 의미를 정밀 검증/u);
  assert.match(html, /엔진이 원문 장르를 먼저 판별/u);
  assert.doesNotMatch(html, /칼럼처럼 다시 써요/u);
  assert.doesNotMatch(html, /원문의 약 60%/u);
});

test('이용 기록의 사용자·모델 문자열은 HTML 삽입 전에 escape된다', async () => {
  const source = await read('assets/js/app-module.js');
  for (const name of ['safePreview', 'safeInputText', 'safeOutputText', 'safeSummary', 'safeDetail']) {
    assert.match(source, new RegExp(`const ${name}\\s*=\\s*escapeHtml`, 'u'));
  }
  assert.match(source, /const preview\s*=\s*escapeHtml\(\(h\.inputText/u);
  assert.match(source, /const safeTypeTxt\s*=\s*escapeHtml\(typeTxt\)/u);
  assert.doesNotMatch(source, /innerHTML\s*=.*(?:\+\s*e\.message|\$\{e\.message\})/u);
});

test('배포 헤더는 프레이밍·MIME 스니핑·객체 삽입을 차단한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headers = new Map((config.headers?.[0]?.headers || []).map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/u);
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
});

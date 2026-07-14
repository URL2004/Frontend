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

test('기본·고급 설명은 체감 재구성 범위와 검증 범위를 구분한다', async () => {
  const [main, guide, faq, evasion] = await Promise.all([
    read('pages/main.html'),
    read('pages/guide.html'),
    read('pages/faq.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /이미 자연스러운 문장은 덜 바꾸고, 위험 신호가 많을수록 더 넓게/u);
  assert.match(main, /기본은 원문 상태에 따라 변환 강도가 달라지고/u);
  assert.match(main, /기본보다 더 많은 문장을 재구성하고, 모든 글의 의미·사실·구조/u);
  assert.match(main, /장르 판별과 별개로 단어 선택과 문장 연결의 친근함·격식/u);
  assert.match(main, /외부 검사 점수는 보장되지 않아요/u);
  assert.match(guide, /대상 문장을 눈에 띄게 다시 구성/u);
  assert.match(faq, /고급은 기본보다 더 넓은 문장 범위를 재구성/u);
  assert.match(evasion, /Math\.max\(90, Math\.min\(1200, Math\.round\(bareLength\(text\) \/ 12\)\)\)/u);
  assert.match(evasion, /Math\.max\(240, Math\.min\(5400, Math\.round\(bareLength\(text\) \/ 4\)/u);
  const copy = `${main}\n${guide}\n${faq}`;
  assert.doesNotMatch(copy, /고급은 더 많이 바꾸는 모드가 아니|고급이 더 강한 재작성 모드는 아닙니다|차이는 변환 세기가 아니라/u);
  assert.doesNotMatch(copy, /칼럼처럼 다시 써요|원문의 약 60%|격식 유지·문장 새로 짜기|어투와 구조를 다시 짜서 가장 자연스러운/u);
  assert.doesNotMatch(main, /검사기는.*의심|숫자가 들어가면 의심이 크게|효과를 크게 높여|훨씬 사람이 쓴 글/u);
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

test('관리자 진입점과 사용자 작업 기록의 접기·본문 스크롤·페이징을 유지한다', async () => {
  const [source, styles] = await Promise.all([
    read('assets/js/app-module.js'),
    read('assets/css/redesign.css')
  ]);
  const shellStart = source.indexOf("'<div class=\"shell\">'");
  const adminEntry = source.indexOf('class="gp-mypage-admin-entry"');
  const profileCard = source.indexOf("background:var(--surface);border:1px solid var(--border)", shellStart);
  assert.ok(shellStart >= 0 && adminEntry > shellStart && adminEntry < profileCard);
  assert.equal(source.match(/class="gp-mypage-admin-entry"/gu)?.length, 1);
  assert.doesNotMatch(styles, /#adminUserLog\s+\.gp-admin-log-list\s*\{[^}]*overflow-y/u);
  assert.match(styles, /\.gp-admin-log-detail\[hidden\]\{display:none;\}/u);
  assert.match(styles, /\.gp-admin-log-text\{[^}]*max-height:300px;overflow:auto;/u);
  assert.doesNotMatch(styles, /#adminUserLog\s+\.gp-admin-log-text\s*\{/u);
  assert.match(source, /_adminUserLog\s*=\s*\{[^}]*page:\s*0,\s*cursors:\s*\[0\]/u);
  assert.match(source, /function adminUserLogPagerHtml\(\)/u);
  assert.match(source, /loadAdminUserLog\(window\._adminUserLog\.uid,\s*'prev'\)/u);
  assert.match(source, /loadAdminUserLog\(window\._adminUserLog\.uid,\s*'next'\)/u);
  assert.doesNotMatch(source, /gp-admin-log-more/u);
});

test('배포 헤더는 프레이밍·MIME 스니핑·객체 삽입을 차단한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headers = new Map((config.headers?.[0]?.headers || []).map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/u);
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
});

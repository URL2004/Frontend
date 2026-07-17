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

test('애매한 글 종류 선택은 기본·고급 요청에 전달되고 자동 판별 우선 원칙을 설명한다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /id="lavDocumentProfile"/u);
  assert.match(main, /자동 판별 \(권장\)/u);
  assert.match(main, /원문에서 장르가 뚜렷하면 안전을 위해 자동 판정을 우선/u);
  assert.match(evasion, /if \(s && s\.documentProfile\) body\.documentProfile = s\.documentProfile/u);
  assert.match(evasion, /documentProfile:\s*s\.documentProfile \|\| undefined/u);
});

test('논문·구조화 보고서 추천은 구형 resumeLike 신호로 고급을 잠그지 않는다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /id="lavBasicRecommended"/u);
  assert.match(main, /id="lavFormalRecommended"[^>]*hidden/u);
  assert.match(main, /id="lavToneAdvancedNote"[^>]*role="status"[^>]*hidden/u);
  assert.match(main, /lavToneChange\(true\)/u);
  assert.match(evasion, /var unfit = d\.restructureUnfit === true/u);
  assert.match(evasion, /lastDiag\.recommendedMode === 'formal'/u);
  assert.match(evasion, /formalRadio\.checked = recommendAdvanced/u);
  assert.match(evasion, /recommendedMode:\s*d\.recommendedMode \|\| 'blog'/u);
  assert.match(evasion, /실행 전 예상 시간과 크레딧을 확인/u);
  assert.doesNotMatch(evasion, /restructureUnfit \|\| (?:d|lastDiag)\.resumeLike/u);
});

test('결과 품질 경고와 원문 검토 알림을 서로 다른 영역에 표시한다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /id="lavQualityWarning"[^>]*role="alert"/u);
  assert.match(main, /id="lavSourceReview"[^>]*role="status"/u);
  assert.match(evasion, /Array\.isArray\(result\.sourceReviewWarnings\)/u);
  assert.match(evasion, /한국어 표현 확인 필요/u);
  assert.doesNotMatch(`${main}\n${evasion}`, /국립국어원 규범 기준 검사/u);
  const sourceRender = evasion.indexOf("var sourceWrap = $('lavSourceReview')");
  const qualityEarlyReturn = evasion.indexOf('if (!needsReview && !warnings.length)', sourceRender);
  assert.ok(sourceRender >= 0 && qualityEarlyReturn > sourceRender, '원문 알림은 결과가 clean이어도 먼저 갱신해야 한다');
});

test('관리자 품질 탭은 본문 없이 장르 교차표와 깊이·한국어 지표를 조회한다', async () => {
  const [admin, source] = await Promise.all([
    read('pages/admin.html'),
    read('assets/js/app-module.js')
  ]);
  assert.match(admin, /data-tab="quality"/u);
  assert.match(admin, /id="adminHumanizeQualityBody"/u);
  assert.match(source, /adminPost\('\/admin\/humanize-quality', \{ hours, limit: 2000 \}\)/u);
  assert.match(source, /requestedModeDocumentProfileEngineQuality/u);
  assert.match(source, /rhetoricalRemediationCoverage/u);
  assert.match(source, /koreanRefinementPass/u);
  const qualityBlock = source.slice(source.indexOf('// ===== 관리자: 휴머나이징 품질 관측'), source.indexOf('window.adminJobsToggleAll'));
  assert.doesNotMatch(qualityBlock, /inputText|outputText/u);
});

test('배포 헤더는 프레이밍·MIME 스니핑·객체 삽입을 차단한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headers = new Map((config.headers?.[0]?.headers || []).map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/u);
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
});

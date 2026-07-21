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
  assert.match(evasion, /lastDiag\.advancedTimeEstimate/u);
  assert.match(evasion, /estimateTimeRangeLabel\(formalEstimateRange\(text, evidence\)\)/u);
  assert.match(evasion, /estimateRangeFromPayload\(r, estimate\)/u);
  assert.doesNotMatch(evasion, /function formalEstimateSec/u);
  const copy = `${main}\n${guide}\n${faq}`;
  assert.doesNotMatch(copy, /고급은 더 많이 바꾸는 모드가 아니|고급이 더 강한 재작성 모드는 아닙니다|차이는 변환 세기가 아니라/u);
  assert.doesNotMatch(copy, /칼럼처럼 다시 써요|원문의 약 60%|격식 유지·문장 새로 짜기|어투와 구조를 다시 짜서 가장 자연스러운/u);
  assert.doesNotMatch(main, /검사기는.*의심|숫자가 들어가면 의심이 크게|효과를 크게 높여|훨씬 사람이 쓴 글/u);
});

test('고급 예상 시간은 서버 청크 범위를 시작·확인·진행 화면에 일관되게 사용한다', async () => {
  const [appMain, evasion] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(evasion, /advancedTimeEstimate/u);
  assert.match(evasion, /sourceBareLength/u);
  assert.match(evasion, /estimateTimeRangeLabel\(formalEstimateRange\(text, s\.evidence\)\)/u);
  assert.match(evasion, /estimateRangeFromPayload\(st,/u);
  assert.match(evasion, /예상 범위를 지나 계속 처리 중/u);
  assert.match(appMain, /formalFallbackEstimateRange/u);
  assert.match(appMain, /start\.estLowSec/u);
  assert.match(appMain, /start\.estHighSec/u);
  assert.doesNotMatch(`${appMain}\n${evasion}`, /Math\.round\([^\n]*\/?\s*4\)[^\n]*5400/u);
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
  assert.match(main, /value="legal_contract"[^>]*>계약서·약관</u);
  assert.match(main, /원문에서 장르가 뚜렷하면 안전을 위해 자동 판정을 우선/u);
  assert.match(evasion, /if \(s && s\.documentProfile\) body\.documentProfile = s\.documentProfile/u);
  assert.match(evasion, /documentProfile:\s*s\.documentProfile \|\| undefined/u);
});

test('구조만 있는 입력의 422는 일반 서버 장애가 아니라 입력 안내로 처리한다', async () => {
  const evasion = await read('assets/js/evasion-flow.js');
  const handler = evasion.slice(evasion.indexOf('async function handleTransformStartError'), evasion.indexOf('// 폴링:', evasion.indexOf('async function handleTransformStartError')));
  assert.match(evasion, /e\.documentProfile = b\.documentProfile/u);
  assert.match(handler, /err\.httpStatus === 422 && err\.code === 'NO_EDITABLE_CONTENT'/u);
  assert.match(handler, /입력 내용을 확인해 주세요/u);
  assert.ok(handler.indexOf("NO_EDITABLE_CONTENT") < handler.indexOf('LIMITED_EFFECT_CONFIRMATION_REQUIRED'));
});

test('한국어 장르 판정은 고급을 잠그지 않고 고급 차단 작업도 보존형으로 낮추지 않는다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /id="lavBasicRecommended"/u);
  assert.match(main, /id="lavFormalRecommended"[^>]*hidden/u);
  assert.match(main, /id="lavToneAdvancedNote"[^>]*role="status"[^>]*hidden/u);
  assert.match(main, /lavToneChange\(true\)/u);
  assert.match(evasion, /function advancedUnavailable\(d\)/u);
  assert.match(evasion, /if \(d\.advancedEligible === false\) return true/u);
  assert.match(evasion, /lastDiag\.recommendedMode === 'formal'/u);
  assert.match(evasion, /formalRadio\.checked = recommendAdvanced/u);
  assert.match(evasion, /recommendedMode:\s*d\.recommendedMode \|\| 'blog'/u);
  assert.match(evasion, /실행 전 예상 시간과 크레딧을 확인/u);
  assert.doesNotMatch(evasion, /restructureUnfit \|\| (?:d|lastDiag)\.resumeLike/u);
  assert.match(evasion, /offer\.fallbackOffer === true && st && st\.mode === 'blog'/u);
});

test('사용자 완료 화면은 실제 품질 경고와 변환 효과 제한을 구분해 표시한다', async () => {
  const [main, evasion, module] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js')
  ]);
  assert.match(main, /id="lavResultEffectNotice"[^>]*role="status"[^>]*hidden/u);
  assert.match(main, /id="lavResultQualityNotice"[^>]*role="status"[^>]*hidden/u);
  assert.match(evasion, /function renderResultNotices/u);
  assert.match(evasion, /effectStatus[^\n]*=== 'limited'/u);
  assert.match(evasion, /qualityStatus[^\n]*=== 'needs_review'/u);
  const historyBlock = module.slice(module.indexOf('window.loadHistory'), module.indexOf('// --- 환불 시스템 UI ---'));
  assert.doesNotMatch(historyBlock, /완료된 결과의 확인 항목|historyQualityWarningMessage|완료 · 확인 권장/u);
  assert.match(evasion, /한국어 표현 점검 완료/u);
  assert.doesNotMatch(evasion, /원문 보존 기준 미통과/u);
  assert.doesNotMatch(`${main}\n${evasion}`, /국립국어원 규범 기준 검사/u);
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
  assert.match(source, /technicalBlockedCount/u);
  assert.match(source, /zeroApprovedChargedCount/u);
  assert.match(source, /effectNoticeCounts/u);
  const qualityBlock = source.slice(source.indexOf('// ===== 관리자: 휴머나이징 품질 관측'), source.indexOf('window.adminJobsToggleAll'));
  assert.doesNotMatch(qualityBlock, /inputText|outputText/u);
});

test('관리자 패치노트 탭은 운영 반영 이력을 최신순으로 제공한다', async () => {
  const [admin, source, styles] = await Promise.all([
    read('pages/admin.html'),
    read('assets/js/app-module.js'),
    read('assets/css/redesign.css')
  ]);
  assert.match(admin, /data-tab="patches"[^>]*>패치노트</u);
  assert.match(admin, /data-admin-tab="patches"/u);
  assert.match(source, /'settings', 'patches'/u);
  assert.equal(admin.match(/class="gp-admin-patch-release"/gu)?.length, 25);
  assert.match(admin, /v2\.5\.0/u);
  const timeline = admin.slice(admin.indexOf('gp-admin-patch-timeline'));
  assert.ok(timeline.indexOf('v2.5.0') < timeline.indexOf('v2.4.18'));
  assert.match(admin, /휴머나이징 엔진 v2\.4\.18/u);
  assert.match(admin, /Backend 97e657d/u);
  assert.ok(admin.indexOf('v2.4.18') < admin.indexOf('v2.4.17'));
  assert.ok(admin.indexOf('v2.4.17') < admin.indexOf('v2.4.16'));
  assert.ok(admin.indexOf('v2.4.16') < admin.indexOf('v2.4.15'));
  assert.match(admin, /운영 휴머나이징 엔진 v2 구축/u);
  assert.match(admin, /관리자 실험실과 운영 화면 기반/u);
  assert.match(admin, /2026년 6월/u);
  assert.match(admin, /FLOOR v2 의미 보존 엔진과 운영 저장소 시작/u);
  assert.match(admin, /운영 Git[\s\S]*594건/u);
  assert.match(admin, /GPT·Claude 작업 기록[\s\S]*56개 세션/u);
  assert.ok(admin.indexOf('2026년 7월') < admin.indexOf('2026년 6월'));
  assert.match(admin, /실험·후속 대체/u);
  assert.match(styles, /\.gp-admin-patch-release>summary/u);
  assert.match(styles, /\.gp-admin-patch-audit/u);
  assert.match(styles, /@media\(max-width:700px\)[^{]*\{/u);
});

test('관리자 파셜과 자산은 같은 캐시 버전을 사용한다', async () => {
  const [index, boot, loader] = await Promise.all([
    read('index.html'),
    read('assets/js/app-boot.js'),
    read('assets/js/page-loader.js')
  ]);
  assert.match(index, /app-boot\.js\?v=lav-154/u);
  assert.match(boot, /var v = 'lav-154'/u);
  assert.match(loader, /var ASSET_V = 'lav-154'/u);
  assert.doesNotMatch(`${index}\n${boot}\n${loader}`, /lav-153/u);
});

test('효과 제한 입력은 기본·고급에서만 확인하고 서버 409를 일반 작업 충돌과 구분한다', async () => {
  const [modals, evasion, legacy] = await Promise.all([
    read('partials/modals.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-main.js')
  ]);
  assert.match(modals, /id="lavEffectNotice"[^>]*hidden/u);
  assert.match(modals, /id="lavEffectNoticeAccepted"/u);
  assert.match(evasion, /lastDiag\.effectExpectation === 'limited'/u);
  assert.match(evasion, /if \(mode !== 'polish'\) body\.effectNoticeAccepted/u);
  assert.match(evasion, /effectNoticeAccepted:\s*!!s\.effectNoticeAccepted/u);
  const limitedHandler = evasion.indexOf("err.code === 'LIMITED_EFFECT_CONFIRMATION_REQUIRED'");
  const genericConflict = evasion.indexOf('if (err && err.httpStatus === 409)', limitedHandler + 1);
  assert.ok(limitedHandler >= 0 && genericConflict > limitedHandler);
  assert.match(legacy, /effectNoticeAccepted:\s*payload\.effectNoticeAccepted === true/u);
  assert.match(legacy, /확인하고 진행/u);
});

test('완료 화면·이용 기록·관리자 관측은 과금 처리와 v2.5 전달 지표를 표시한다', async () => {
  const [main, evasion, module] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js')
  ]);
  assert.match(main, /id="lavBillingNotice"[^>]*role="status"/u);
  assert.match(evasion, /waived_quality_shortfall:\s*'과거 무차감 정책/u);
  assert.match(evasion, /waived_repeat_low_benefit:\s*'과거 무차감 정책/u);
  assert.match(module, /과거 정책 · 무차감/u);
  assert.match(module, /deliveredLimitedEffectCount/u);
  assert.match(module, /zeroApprovedChargedCount/u);
  assert.match(module, /structureSignatureFailureCount/u);
  assert.match(module, /substantiveCarryoverRatio/u);
  assert.match(module, /sectionRecoveryAppliedCount/u);
  assert.match(module, /processingDurationMs/u);
});

test('배포 헤더는 프레이밍·MIME 스니핑·객체 삽입을 차단한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headers = new Map((config.headers?.[0]?.headers || []).map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/u);
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
});

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
  assert.match(main, /기본보다 더 넓은 문장 범위를 재구성하고, 모든 글에 모델 기반 의미·사실·구조 정밀 검증/u);
  assert.match(main, /장르 판별과 별개로 단어 선택과 문장 연결의 친근함·격식/u);
  assert.match(main, /외부 검사 점수는 보장되지 않아요/u);
  assert.match(guide, /AI식 반복과 균일한 흐름을 다시 구성/u);
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

test('다듬기·기본·고급 명칭과 설명은 선택부터 결과·이력까지 같은 의미를 사용한다', async () => {
  const [main, guide, faq, evasion, legacy, module, lab] = await Promise.all([
    read('pages/main.html'),
    read('pages/guide.html'),
    read('pages/faq.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-main.js'),
    read('assets/js/app-module.js'),
    read('pages/admin-humanize-lab.html')
  ]);
  assert.match(main, /원문 보존 다듬기/u);
  assert.match(main, /원문의 장르와 말투를 유지하면서 비문·띄어쓰기·어색한 연결·중복 표현만 정리/u);
  assert.match(main, /AI식 반복과 지나치게 균일한 문장 흐름이 있는 부분을 자연스럽게 다시 구성/u);
  assert.match(evasion, /문체 보조[^\n]+원문 장르 우선/u);
  assert.match(evasion, /원문 보존 다듬기를 시작할까요/u);
  assert.match(evasion, /label = '기본 휴머나이징'/u);
  assert.match(evasion, /label = '원문 보존 다듬기'/u);
  assert.match(legacy, /requestedMode/u);
  assert.match(legacy, /<b>고급 휴머나이징<\/b> 결과/u);
  assert.match(module, /case 'blog': return '기본 휴머나이징'/u);
  assert.match(module, /case 'polish': return '원문 보존 다듬기'/u);
  assert.match(lab, /value="polish">원문 보존 다듬기/u);
  assert.match(guide, /교정만 필요하면 원문 보존 다듬기/u);
  assert.match(faq, /원문 보존 다듬기와 휴머나이징은 무엇이 다른가요/u);
  const activeCopy = `${main}\n${guide}\n${faq}\n${evasion}\n${legacy}\n${module}\n${lab}`;
  assert.doesNotMatch(activeCopy, /과제 어투로 다듬기|기본 휴머나이징\(블로그\)|다듬기\(보존형\)|그대로 다듬기/u);
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

test('AI 감지 보정 화면은 장문 유사 일치와 원점수 매칭 근거를 정확히 표시한다', async () => {
  const [source, admin] = await Promise.all([
    read('assets/js/app-module.js'),
    read('pages/admin.html')
  ]);
  assert.match(admin, /장문에서 소폭 수정된 것으로 확인될 때만 적용/u);
  assert.match(admin, /짧은 글이나 크게 달라진 글에는 유사 일치를 적용하지 않습니다/u);
  assert.match(source, /cal\.match === 'near_normalized'/u);
  assert.match(source, /cal\.matchSimilarity/u);
  assert.match(source, /cal\.matchLengthRatio/u);
  assert.match(source, /정규화 정확 일치/u);
  assert.doesNotMatch(source, /cal\.reason \|\| 'test calibration'/u);
});

test('애매한 글 종류 선택은 기본·고급 요청에 전달되고 자동 판별 우선 원칙을 설명한다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /id="lavDocumentProfile"/u);
  assert.match(main, /자동 판별 \(권장\)/u);
  assert.match(main, /value="legal_contract"[^>]*>계약서·약관</u);
  assert.match(main, /value="long_explainer"[^>]*>전문 설명·장문 해설</u);
  assert.match(main, /value="clinical_record"[^>]*>임상·전문 기록</u);
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
  assert.match(source, /lexicalTransitionDocumentCount/u);
  assert.match(source, /lexicalTransitionCounts/u);
  assert.match(source, /studentRecordFragmentDocumentCount/u);
  assert.match(source, /functionalGreetingDuplicationDocumentCount/u);
  assert.match(source, /adjacentSemanticRepetitionDocumentCount/u);
  assert.match(source, /report\.latestEngine/u);
  assert.match(source, /최신 엔진 표본/u);
  assert.match(source, /조회 전체 · 자연성 위험/u);
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
  assert.equal(admin.match(/class="gp-admin-patch-release"/gu)?.length, 44);
  assert.match(admin, /최종 문서 무결성·안전 후보 원장/u);
  assert.match(admin, /Backend 6e51d4c/u);
  assert.match(admin, /첨부 사례 전용 79개를 포함한 백엔드 전체 773개 테스트와 FLOOR 88개 평가/u);
  assert.match(admin, /프롬프트·감사·수리 계약 중앙화/u);
  assert.match(admin, /Backend c76cfde/u);
  assert.match(admin, /고급 서사 재구성·논리 결함·거시 담화 보강/u);
  assert.match(admin, /Backend d5f0147/u);
  assert.match(admin, /최종 구조 고정점·한국어 감사 정합화/u);
  assert.match(admin, /Backend 699501b/u);
  assert.match(admin, /최종 구조 실패·비멱등·미수렴·문자 내용 변경은 모두 0건/u);
  assert.match(admin, /중단 작업 자동 재개·중복 실행 방지/u);
  assert.match(admin, /Backend 5fafb34/u);
  assert.match(admin, /라벨 문서 문단·목록·읽기 구조 안정화/u);
  assert.match(admin, /Backend 8e07cab · 67651d3 · f562835/u);
  assert.match(admin, /텍스트 거절 회복·문서 구조·의미 관계 보강/u);
  assert.match(admin, /Backend b83f54c/u);
  assert.match(admin, /승인 편집 2\/2·모델 실패 0건/u);
  assert.match(admin, /백엔드 전체 690개 테스트/u);
  assert.match(admin, /보호 구조 복구·지원서 의미 무결성·관측 일치/u);
  assert.match(admin, /Backend aacf0a7/u);
  assert.match(admin, /신규 차단·무차감·과금 변경은 추가하지 않았습니다/u);
  assert.match(admin, /실제 30건 기반 품질 오탐·리듬 지표 교정/u);
  assert.match(admin, /번호형 산문·한국어 회복 안정화/u);
  assert.match(admin, /Backend 8686ca1/u);
  assert.match(admin, /Frontend b46cf56/u);
  assert.match(admin, /휴머나이징 진행 화면 복구·중복 퍼센트 제거/u);
  assert.match(admin, /Luna 기본·Terra 승격 전환/u);
  assert.match(admin, /2026\.07\.31/u);
  assert.match(admin, /전문 문서 언어 무결성·GPT 캐시 효율화/u);
  assert.match(admin, /Backend 53b67b8 \+ 1f6e010/u);
  assert.match(admin, /GPT-5\.6 장르·문체·구조 안전망 확장/u);
  assert.match(admin, /원문 문단 역할·사례 결론 귀속 보존/u);
  assert.match(admin, /사용자 크레딧 내역 분리·작업 기록 복사 수정/u);
  assert.match(admin, /AI 감지 점수·설명 일관성 보정/u);
  assert.match(admin, /v2\.5\.3/u);
  assert.match(admin, /v2\.5\.2/u);
  assert.match(admin, /v2\.5\.1/u);
  assert.match(admin, /v2\.5\.0/u);
  const timeline = admin.slice(admin.indexOf('gp-admin-patch-timeline'));
  assert.ok(timeline.indexOf('v2.5.40') < timeline.indexOf('v2.5.39'));
  assert.ok(timeline.indexOf('v2.5.39') < timeline.indexOf('v2.5.38'));
  assert.ok(timeline.indexOf('v2.5.38') < timeline.indexOf('v2.5.37'));
  assert.ok(timeline.indexOf('v2.5.37') < timeline.indexOf('v2.5.36'));
  assert.ok(timeline.indexOf('v2.5.36') < timeline.indexOf('v2.5.35'));
  assert.ok(timeline.indexOf('v2.5.35') < timeline.indexOf('v2.5.34'));
  assert.ok(timeline.indexOf('v2.5.34') < timeline.indexOf('v2.5.33'));
  assert.ok(timeline.indexOf('v2.5.33') < timeline.indexOf('v2.5.31'));
  assert.ok(timeline.indexOf('v2.5.31') < timeline.indexOf('v2.5.30'));
  assert.ok(timeline.indexOf('v2.5.30') < timeline.indexOf('v2.5.27–29'));
  assert.ok(timeline.indexOf('v2.5.27–29') < timeline.indexOf('v2.5.21–26'));
  assert.ok(timeline.indexOf('v2.5.21–26') < timeline.indexOf('UX Hotfix'));
  assert.ok(timeline.indexOf('UX Hotfix') < timeline.indexOf('Luna 기본·Terra 승격 전환'));
  assert.ok(timeline.indexOf('Luna 기본·Terra 승격 전환') < timeline.indexOf('전문 문서 언어 무결성·GPT 캐시 효율화'));
  assert.ok(timeline.indexOf('전문 문서 언어 무결성·GPT 캐시 효율화') < timeline.indexOf('원문 문단 역할·사례 결론 귀속 보존'));
  assert.ok(timeline.indexOf('v2.5.2') < timeline.indexOf('관리자 Hotfix'));
  assert.ok(timeline.indexOf('관리자 Hotfix') < timeline.indexOf('감지 Hotfix'));
  assert.ok(timeline.indexOf('감지 Hotfix') < timeline.indexOf('v2.5.1'));
  assert.ok(timeline.indexOf('v2.5.1') < timeline.indexOf('v2.5.0'));
  assert.ok(timeline.indexOf('v2.5.0') < timeline.indexOf('v2.4.18'));
  assert.match(admin, /Frontend active-job-recovery/u);
  assert.match(admin, /Backend [^<]*1f6e010/u);
  assert.match(admin, /Backend d0ef190/u);
  assert.match(admin, /Backend 30706b7/u);
  assert.ok(admin.indexOf('v2.4.18') < admin.indexOf('v2.4.17'));
  assert.ok(admin.indexOf('v2.4.17') < admin.indexOf('v2.4.16'));
  assert.ok(admin.indexOf('v2.4.16') < admin.indexOf('v2.4.15'));
  assert.match(admin, /운영 휴머나이징 엔진 v2 구축/u);
  assert.match(admin, /관리자 실험실과 운영 화면 기반/u);
  assert.match(admin, /2026년 6월/u);
  assert.match(admin, /FLOOR v2 의미 보존 엔진과 운영 저장소 시작/u);
  assert.match(admin, /운영 Git[\s\S]*678건/u);
  assert.match(admin, /Backend \/ Frontend[\s\S]*475 \/ 203/u);
  assert.match(admin, /GPT·Claude 작업 기록[\s\S]*56개 세션/u);
  assert.ok(admin.indexOf('2026년 7월') < admin.indexOf('2026년 6월'));
  assert.match(admin, /실험·후속 대체/u);
  const releases = [...admin.matchAll(/<details class="gp-admin-patch-release"([^>]*)>([\s\S]*?)<\/details>/gu)];
  assert.equal(releases.length, 44);
  assert.equal(releases.filter(([, attrs]) => /\bopen\b/u.test(attrs)).length, 5);
  for (const [, attrs, body] of releases) {
    if (/gp-admin-patch-state is-live/u.test(body)) assert.match(attrs, /\bopen\b/u);
    if (/gp-admin-patch-state is-superseded/u.test(body)) assert.doesNotMatch(attrs, /\bopen\b/u);
  }
  assert.match(styles, /\.gp-admin-patch-release>summary/u);
  assert.match(styles, /\.gp-admin-patch-audit/u);
  assert.match(styles, /@media\(max-width:700px\)[^{]*\{/u);
});

test('관리자 GPT 설정은 Luna 기본·Terra 승격과 GPT-5.6 reasoning을 제공한다', async () => {
  const [admin, source] = await Promise.all([
    read('pages/admin.html'),
    read('assets/js/app-module.js')
  ]);
  const settings = admin.slice(admin.indexOf('data-admin-tab="settings"'));
  assert.match(settings, /id="adminGptModelHumanizePrimary"[\s\S]*?<option value="gpt-5\.6-luna"/u);
  assert.match(settings, /id="adminGptModelHumanizeEscalation"[\s\S]*?<option value="gpt-5\.6-terra"/u);
  assert.match(settings, /Luna 실패 시 Terra 승격/u);
  assert.match(settings, /<option value="max">max<\/option>/u);
  assert.doesNotMatch(settings, /<option value="gpt-5\.4/u);
  assert.match(source, /humanizePrimary:\s*value\('adminGptModelHumanizePrimary', 'gpt-5\.6-luna'\)/u);
  assert.match(source, /humanizeEscalation:\s*value\('adminGptModelHumanizeEscalation', 'gpt-5\.6-terra'\)/u);
  assert.match(source, /adminGptReasoningValues = \['none', 'low', 'medium', 'high', 'xhigh', 'max', 'default'\]/u);
  assert.doesNotMatch(source, /gpt-5\.4-(?:mini|nano)|gpt-5\.4'/u);
});

test('관리자 파셜과 자산은 같은 캐시 버전을 사용한다', async () => {
  const [index, boot, loader] = await Promise.all([
    read('index.html'),
    read('assets/js/app-boot.js'),
    read('assets/js/page-loader.js')
  ]);
  assert.match(index, /app-boot\.js\?v=lav-174/u);
  assert.match(boot, /var v = 'lav-174'/u);
  assert.match(loader, /var ASSET_V = 'lav-174'/u);
  assert.doesNotMatch(`${index}\n${boot}\n${loader}`, /lav-(?:164|166|167|168|170)/u);
});

test('진행 중 휴머나이징은 어디서든 복귀하고 이전 퍼센트가 새 작업을 덮지 않는다', async () => {
  const [main, designs, evasion, styles] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/main-designs.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/css/redesign.css')
  ]);
  assert.match(main, /id="lavActiveJob"[\s\S]*?onclick="lavOpenActiveJob\(\)"[\s\S]*?aria-live="polite"/u);
  assert.ok((designs.match(/window\.lavPrepareNewSentence\(\)/gu) || []).length >= 2);
  assert.match(evasion, /window\.lavPrepareNewSentence = function/u);
  assert.match(evasion, /newLabel\.textContent = blocking \? '진행 화면 보기' : '새 문장 시작'/u);
  assert.match(evasion, /var jobTickerGeneration = 0/u);
  assert.match(evasion, /function replaceJobTicker\(estimate, label, initialSec\)/u);
  assert.equal((evasion.match(/formalStop = startJobTicker/gu) || []).length, 1);
  const poll = evasion.slice(evasion.indexOf('async function pollTransform'), evasion.indexOf('// 완료 렌더', evasion.indexOf('async function pollTransform')));
  assert.ok(poll.indexOf('st = await pollRes.json()') < poll.indexOf('if (gen !== pollGen) return;', poll.indexOf('st = await pollRes.json()')));
  assert.match(evasion, /resumeGen !== pollGen/u);
  assert.match(evasion, /recoverGen !== pollGen/u);
  assert.match(evasion, /handleTransformStartError\(err, fallbackStep, expectedGen\)/u);
  assert.ok((evasion.match(/if \(r && r\.jobId\) makeJobCanceller\(r\.jobId\)\(\)/gu) || []).length >= 2);
  assert.match(evasion, /window\.lavBlockedRetryMemo = function \(\) \{[\s\S]*?clearJobRef\(\);[\s\S]*?clearActiveJobUi\(\);/u);
  assert.match(evasion, /window\.lavBlockedRetryEvidence = function \(\) \{[\s\S]*?clearJobRef\(\);[\s\S]*?clearActiveJobUi\(\);/u);
  assert.match(styles, /\.gp-lav-active-job/u);
  assert.match(styles, /\.gp-lav-new\.is-job-active/u);
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
  assert.match(module, /gates: Array\.isArray\(st\.gates\)/u);
  assert.match(module, /gateDetail: st\.gateDetail/u);
});

test('배포 헤더는 프레이밍·MIME 스니핑·객체 삽입을 차단한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headers = new Map((config.headers?.[0]?.headers || []).map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/u);
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
});

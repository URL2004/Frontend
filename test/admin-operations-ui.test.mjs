import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('pages/admin.html');
const source = read('assets/js/app-module.js');
const styles = read('assets/css/redesign.css');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} section should exist`);
  return source.slice(from, to);
}

test('관리자 정보 구조는 업무 흐름과 접근 가능한 탭 계약을 사용한다', () => {
  assert.match(html, /<nav[^>]+role="tablist"[^>]+aria-label="관리자 영역"/u);
  for (const [tab, label] of [
    ['overview', '개요'], ['incidents', '장애·작업'], ['billing', '결제·환불'],
    ['users', '사용자'], ['quality', '품질'], ['ledger', '원장'],
    ['coupons', '쿠폰'], ['settings', '운영 설정'], ['labs', '랩·도구'], ['patches', '변경 이력']
  ]) {
    assert.match(html, new RegExp(`role="tab"[^>]+aria-selected="(?:true|false)"[^>]+data-tab="${tab}"[^>]*>${label}`, 'u'));
    assert.match(html, new RegExp(`data-admin-tab="${tab}"`, 'u'));
  }
  assert.match(source, /ArrowLeft', 'ArrowRight', 'Home', 'End'/u);
  assert.match(source, /setAttribute\('aria-selected'/u);
  assert.match(source, /scrollIntoView\(\{ block: 'nearest', inline: 'center'/u);
  assert.match(source, /function adminSyncTabPanels\(\)/u);
  assert.match(source, /owner\.setAttribute\('aria-controls', panels\.map\(panel => panel\.id\)\.join\(' '\)\)/u);
  assert.match(source, /prefers-reduced-motion: reduce/u);
});

test('관리자 진입은 권한 확인 뒤 선택 탭만 지연 로딩한다', () => {
  const loadPage = section('window.loadAdminPage = async function()', '// ── 장애 로그');
  assert.match(loadPage, /if \(shell\) \{ shell\.hidden = true; shell\.inert = true; \}/u);
  assert.match(loadPage, /if \(!window\.isAdmin\(\)\)[\s\S]*return/u);
  assert.match(loadPage, /if \(shell\) \{ shell\.hidden = false; shell\.inert = false; \}/u);
  assert.ok(html.indexOf('id="adminGateMsg"') < html.indexOf('id="adminShell"'), '권한 안내는 숨겨지는 관리자 shell 밖에 있어야 한다');
  assert.doesNotMatch(loadPage, /loadAdminHumanizeQuality\(\)|loadAllCreditHistory\(\)|loadCouponBatches\(\)/u);
  assert.match(source, /const ADMIN_TAB_CACHE_MS = 45000/u);
  assert.match(source, /quality: \[window\.loadAdminHumanizeQuality\]/u);
  assert.match(source, /ledger: \[window\.loadAllCreditHistory\]/u);
  assert.match(source, /settings: \[window\.loadAdminGptRuntimeConfig, window\.loadAdminDetectCalibration\]/u);
  const loader = section('window.adminLoadTab = async function', 'function adminSyncTabPanels');
  assert.match(loader, /const runId = adminNumber\(state\.runId\) \+ 1/u);
  assert.match(loader, /loadedAt: failed \? 0 : Date\.now\(\)/u);
  assert.match(loader, /renderedFailure/u);
  assert.match(loader, /window\._adminActiveTab === tab/u);
});

test('사용자 검색과 운영 변경은 역순 응답·중복 실행을 막는다', () => {
  const search = section('window.adminSearchUser = async function', '// ===== 관리자: 사용자 작업 기록');
  assert.match(search, /adminUserSearchController\.abort\(\)/u);
  assert.match(search, /\{ signal: adminUserSearchController\.signal \}/u);
  assert.match(search, /generation !== adminUserSearchGeneration/u);
  assert.match(search, /adminSetUserActionsEnabled\(false\)/u);
  assert.match(source, /adminSetBusy\(button, true, '처리 중'\)/u);
  assert.match(source, /const adminRefundPending = new Set\(\)/u);
  assert.match(source, /const adminOpsAckPending = new Set\(\)/u);
  assert.match(source, /adminSetBusy\(submit, true, '발급 중'\)/u);
  assert.match(source, /let adminUserLogGeneration = 0/u);
  assert.match(source, /adminUserLogController\.abort\(\)/u);
  assert.match(source, /let adminOpsGeneration = 0/u);
  assert.match(source, /let adminJobsGeneration = 0/u);
  assert.match(source, /let adminQualityGeneration = 0/u);
  assert.match(source, /generation !== adminOpsGeneration/u);
  assert.match(source, /generation !== adminJobsGeneration/u);
  assert.match(source, /generation !== adminQualityGeneration/u);
  assert.match(source, /e\?\.name === 'AbortError'/u);
});

test('운영 화면은 실제 조회 범위와 서버 설정 계약을 정확히 설명한다', () => {
  assert.match(html, /최근 크레딧 원장/u);
  assert.match(html, /최신 1,000건/u);
  assert.doesNotMatch(html, /전체 크레딧 원장/u);
  assert.doesNotMatch(html, /adminBasicExpEnabled|기본 휴머나이징 개발테스트/u);
  assert.match(html, /adminGptEscProtectedTermThreshold[^>]+max="120"/u);
  assert.match(html, /adminGptEscPatchTargetThreshold[^>]+max="12"/u);
  const testTask = html.slice(html.indexOf('id="adminGptTestTask"'), html.indexOf('</select>', html.indexOf('id="adminGptTestTask"')));
  assert.match(testTask, /value="detect"/u);
  assert.match(testTask, /value="humanize"/u);
  assert.doesNotMatch(testTask, /value="judge"|value="repair"|value="evidence"/u);
  assert.match(html, /최신 원장 1,000건 범위/u);
  assert.match(html, /기간은 상단 KPI와 경고 코드 전체에 적용됩니다/u);
  assert.match(source, /최근 조회분 순결제/u);
  assert.match(source, /window\.loadAdminCreditUsageSummary/u);
  assert.match(source, /await window\.filterAdminHistory\(\)/u);
  assert.match(source, /let adminHistoryFilterGeneration = 0/u);
  assert.match(source, /const pendingKey = `refund:\$\{kind\}:\$\{orderId\}`/u);
  assert.match(source, /task === 'humanize'[\s\S]*result\.status === 'done' && !!String\(result\.outputText/u);
});

test('관리자 반응형·가독성 토큰은 넓은 화면과 모바일 조작을 함께 보장한다', () => {
  assert.match(styles, /\.gp-admin-shell\{max-width:1440px/u);
  assert.match(styles, /\.gp-admin-shell\{[^}]*container:gp-admin-shell \/ inline-size/u);
  assert.match(styles, /--admin-text3:#697086/u);
  assert.match(styles, /--admin-touch-h:44px/u);
  assert.match(styles, /\.gp-admin-ov-item strong\{[^}]*white-space:nowrap;[^}]*overflow-wrap:normal;/u);
  assert.match(styles, /@container gp-admin-shell \(max-width:960px\)[\s\S]*?\.gp-admin-overview\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);\}/u);
  assert.match(styles, /@container gp-admin-shell \(max-width:620px\)[\s\S]*?\.gp-admin-overview\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/u);
  assert.match(styles, /@container gp-admin-shell \(max-width:280px\)[\s\S]*?\.gp-admin-overview\{grid-template-columns:1fr;\}/u);
  assert.match(styles, /@media\(max-width:820px\)[\s\S]*\.gp-admin-refresh,[\s\S]*min-width:var\(--admin-touch-h\);min-height:var\(--admin-touch-h\)/u);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.gp-admin-refresh,[\s\S]*min-height:var\(--admin-touch-h\)/u);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.gp-admin-refresh,[\s\S]*min-width:var\(--admin-touch-h\)/u);
  assert.match(styles, /\.gp-admin-table caption\{/u);
  assert.match(styles, /\.gp-admin-table thead th\{position:sticky/u);
  assert.match(source, /<caption>크레딧 충전·사용·환불·조정 원장<\/caption>/u);
  assert.match(styles, /\.gp-admin-row-detail-panel\{position:fixed/u);
  assert.match(styles, /max-height:calc\(100vh - 96px\);overflow:auto/u);
  assert.match(source, /adminCloseJobDetail/u);
  assert.match(styles, /@media\(max-width:820px\)[\s\S]*\.gp-admin-quality-filter\{width:100%;display:flex;flex-wrap:wrap/u);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.gp-admin-ov-item:nth-child\(even\)\{border-left:1px solid var\(--admin-line\);\}/u);
});

test('필터 초기화와 오류 상태는 화면 값·세션·재시도 계약을 함께 갱신한다', () => {
  assert.match(source, /ADMIN_FILTER_IDS = \[[^\]]*'adminOpsQuery'/u);
  assert.match(source, /window\.adminResetOpsFilters[\s\S]*adminRememberFilters\(\);[\s\S]*window\.loadAdminOpsLogs\(\)/u);
  assert.match(source, /window\.adminResetJobFilters[\s\S]*adminRememberFilters\(\);[\s\S]*window\.loadAdminJobs\(\)/u);
  assert.match(source, /window\.adminResetQualityFilters[\s\S]*adminRememberFilters\(\);[\s\S]*window\.loadAdminHumanizeQuality\(\)/u);
  assert.match(source, /stat7d\.dataset\.loadState = 'error'/u);
  assert.match(source, /grid\.dataset\.loadState = 'error'/u);
  assert.match(source, /attention\.dataset\.loadState = 'error'/u);
  assert.match(source, /el\.classList\.toggle\('error', type === 'error'/u);
});

test('크레딧 원장은 연결 가능한 작업만 안전한 상세 화면으로 연다', () => {
  assert.match(html, /id="adminLedgerDetail"[^>]+role="dialog"[^>]+aria-modal="true"/u);
  assert.match(html, /id="adminLedgerDetailStatus" role="status" aria-live="polite"/u);
  assert.match(source, /creditHistoryId: d\.id/u);
  assert.match(source, /function adminHistoryHasLinkedTask\(h\)/u);
  assert.match(source, /type === 'detect'[\s\S]*?\^\[A-Za-z0-9:_-\]\{1,180\}\$/u);
  assert.match(source, /!\['humanize', 'restructure'\]\.includes\(type\) \|\| \/_refine\\d\+\$\/u\.test\(requestId\)/u);
  assert.match(source, /const canOpenTask = adminHistoryHasLinkedTask\(h\)/u);
  assert.match(source, /adminPost\('\/admin\/credit-history-item', \{ uid, creditHistoryId \}/u);
  assert.match(source, /const engine = engineBundle\.engineMeta \|\| history\.engineMeta \|\| \{\}/u);
  assert.match(source, /const archive = engineBundle\.archive \|\| \{\}/u);
  assert.match(source, /adminLedgerDetailController\.abort\(\)/u);
  assert.match(source, /generation !== adminLedgerDetailGeneration/u);
  assert.match(source, /event\.key === 'Escape'/u);
  assert.match(source, /if \(shell\) shell\.inert = true/u);
  assert.match(source, /if \(shell\) shell\.inert = false/u);
  assert.match(source, /adminLedgerDetailReturnFocus[\s\S]*target\.focus\(\)/u);
  assert.match(source, /escapeHtml\(history\.inputText\)|adminLedgerTextBlock\('원문', history\.inputText\)/u);
  assert.match(source, /adminLedgerTextBlock\('휴머나이징 결과', history\.outputText\)/u);
  assert.match(source, /function adminLedgerCodes\(\.\.\.sources\)/u);
  assert.match(source, /adminLedgerCodes\(history\.qualityWarningCodes, engine\.qualityWarningCodes, archive\.qualityWarningCodes\)/u);
  assert.match(source, /adminLedgerCodes\(history\.effectNoticeCodes, engine\.effectNoticeCodes, archive\.effectNoticeCodes\)/u);
  assert.match(source, /window\.gpNormalizeDetectPresentation\(history\)/u);
  assert.match(source, /typeof detectView\.probability === 'number' && Number\.isFinite\(detectView\.probability\)/u);
  assert.match(source, /adminLedgerDetailPairs\('AI 감지 결과'/u);
  assert.match(source, /adminLedgerTextBlock\('탐지 요약', detectView\.summary\)/u);
  assert.match(source, /adminLedgerTextBlock\('탐지 상세', detectView\.detail\)/u);
  assert.match(source, /\['사용자 UID', ledger\.uid\]/u);
  assert.match(source, /data\.opsStatus === 'error'/u);
  assert.match(source, /이 작업과 연결된 별도 운영 로그가 없습니다\./u);
  assert.match(source, /class="gp-admin-log-text" tabindex="0" role="region" aria-label=/u);
  assert.match(styles, /\.gp-admin-ledger-detail-panel\{[^}]*width:min\(720px,calc\(100vw - 40px\)\)/u);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*?\.gp-admin-ledger-detail-panel\{width:100%;/u);
  assert.match(styles, /\.gp-admin-ledger-detail-close\{[^}]*width:44px;height:44px/u);
  assert.match(styles, /\.gp-admin-ledger-detail\{[\s\S]*?--admin-text:#1a1f2e;[\s\S]*?--admin-focus-ring:/u);
  assert.match(styles, /\.gp-admin-ledger-inline-error\{[^}]*color:var\(--admin-red\)/u);
});

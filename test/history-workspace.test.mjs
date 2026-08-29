import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');

test('작업 기록은 검색·필터·날짜 그룹과 독립 상세 패널을 제공한다', async () => {
  const [html, source, styles] = await Promise.all([
    read('pages/history.html'),
    read('assets/js/app-module.js'),
    read('assets/css/redesign.css')
  ]);
  assert.match(html, /<h1>작업 기록<\/h1>/u);
  assert.match(html, /id="historySearch"[^>]*type="search"/u);
  assert.match(html, /data-history-filter="all"/u);
  assert.match(html, /id="historyDetailPanel"/u);
  assert.match(source, /function historyDateGroup/u);
  assert.match(source, /function historyVisibleItems/u);
  assert.match(source, /role="listitem" class="gp-history-row-wrap"/u);
  assert.match(source, /aria-expanded="\$\{selected \? 'true' : 'false'\}"/u);
  assert.match(styles, /grid-template-columns:minmax\(310px,380px\) minmax\(0,1fr\)/u);
  assert.match(styles, /\.gp-history-workspace\.is-detail-open \.gp-history-browser\{display:none;/u);
  assert.doesNotMatch(source.slice(source.indexOf('const HISTORY_PAGE_SIZE'), source.indexOf('// --- 환불 시스템 UI ---')), /class="history-item"|onclick="openHistory/u);
});

test('기록 목록은 50건 페이지 단위로 읽고 개별 주소로 바로 열 수 있다', async () => {
  const [source, main, shell, mobile] = await Promise.all([
    read('assets/js/app-module.js'),
    read('pages/main.html'),
    read('partials/app-shell-start.html'),
    read('partials/mobile-nav.html')
  ]);
  assert.match(source, /limit\(HISTORY_PAGE_SIZE \+ 1\)/u);
  assert.match(source, /startAfter\(historyState\.cursor\)/u);
  assert.match(source, /searchParams\.set\('item', id\)/u);
  assert.match(source, /getDoc\(doc\(db, 'users', CU\.uid, 'history', id\)\)/u);
  assert.match(source, /openHistoryRecord\(this\.dataset\.historyId\)/u);
  for (const nav of [main, shell, mobile]) assert.match(nav, /data-tab-call="openHistoryHome"/u);
});

test('상세 기록에서 결과를 복사·저장·편집하고 감지 원문을 이어서 쓸 수 있다', async () => {
  const source = await read('assets/js/app-module.js');
  assert.match(source, /휴머나이징으로 이어서/u);
  assert.match(source, /결과 복사/u);
  assert.match(source, /다운로드/u);
  assert.match(source, /편집기로 열기/u);
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /document\.execCommand\('copy'\)/u);
  assert.match(source, /new Blob\(\[text\]/u);
  assert.match(source, /window\.lavSetMode\(mode\)/u);
});

test('사용자 휴머나이징 기록은 결과만 보여주고 모델의 작업 설명은 노출하지 않는다', async () => {
  const source = await read('assets/js/app-module.js');
  const search = source.slice(source.indexOf('function historyVisibleItems'), source.indexOf('function historyIsMobile'));
  const detail = source.slice(source.indexOf('function historyRenderDetail'), source.indexOf('function historyRender()'));
  assert.match(detail, /historyDetailBlock\('휴머나이징 결과', item\.outputText, true\)/u);
  assert.match(detail, /historyDetailBlock\('분석 요약', view\.summary, true\)/u);
  assert.match(detail, /historyDetailBlock\('상세 분석', view\.detail, false\)/u);
  assert.doesNotMatch(detail, /작업 요약|상세 정보|item\.humanSummary|item\.humanDetail/u);
  assert.doesNotMatch(search, /item\.humanSummary|item\.humanDetail/u);
});

test('작업 상태와 이용 내역을 분리하고 복구 가능한 화면 상태를 제공한다', async () => {
  const source = await read('assets/js/app-module.js');
  assert.match(source, /<small>작업 상태<\/small>/u);
  assert.match(source, /<small>이용 내역<\/small>/u);
  assert.match(source, /이용권 포함/u);
  assert.match(source, /무차감 · 관리자/u);
  assert.match(source, /기록을 불러오지 못했어요/u);
  assert.match(source, /다시 시도/u);
  assert.match(source, /일치하는 기록이 없어요/u);
  assert.match(source, /로그인이 필요해요/u);
});

test('다듬기·기본·고급 카드는 추천 배지 대신 글 예시를 비교 정보로 보여준다', async () => {
  const [main, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js')
  ]);
  assert.match(main, /lav-sel-examples[^>]*><small>글 예시<\/small><b>제출 전 과제 · 자기소개서 · 교정이 필요한 초안<\/b>/u);
  assert.match(main, /일반 과제 · 블로그 · 후기·SNS/u);
  assert.match(main, /보고서 · 논문 초안 · 공식 문서/u);
  assert.match(evasion, /MODE_RECOMMENDATION_ENABLED = false/u);
});

test('모바일 사이드바는 닫힌 동안 포커스 트리에서 빠진다', async () => {
  const [main, designs] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/main-designs.js')
  ]);
  assert.match(main, /id="lavSidebar"/u);
  assert.match(main, /aria-controls="lavSidebar" aria-expanded="false"/u);
  assert.match(designs, /sidebar\.inert = !mobileOpen/u);
  assert.match(designs, /sidebar\.setAttribute\('aria-hidden', mobileOpen \? 'false' : 'true'\)/u);
  assert.match(designs, /hamburger\.setAttribute\('aria-expanded', mobileOpen \? 'true' : 'false'\)/u);
  assert.match(designs, /event\.target === hamburger && firstMenuItem/u);
});

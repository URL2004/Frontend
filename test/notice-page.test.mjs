import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('메인 공지는 세부 개선 대신 격식체로 신규 기능 오픈 소식을 보여준다', async () => {
  const page = await read('pages/notice.html');
  const featured = page.slice(
    page.indexOf('gp-notice-featured'),
    page.indexOf('noticeWriteForm')
  );

  assert.match(featured, /AI 감지 보고서를 정식 오픈했습니다/u);
  assert.match(featured, /글 전체의 AI 티 지수와 문단별 문체 특징/u);
  assert.doesNotMatch(featured, /정확도 개선/u);
  assert.doesNotMatch(featured, /AI 감지가 크레딧 이용 방식으로 바뀌었어요/u);
  assert.doesNotMatch(featured, /(?:해요|했어요|됐어요|있어요)/u);
});

test('하단 공지는 제외 요청한 주제를 숨기고 남은 중요 공지만 표시한다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );

  assert.equal(baseItems.match(/\n\s+id:\s*'/gu)?.length, 7);
  for (const title of [
    '휴머나이징 엔진 v2.5 업데이트 — 문단 구조 보존 강화',
    'AI 감지 크레딧 이용 방식 전환 안내 (100자당 1크레딧)',
    'AI 감지 보고서 문단별 미리보기·전체보기 개선',
    '자소서·지원서 장르 재구성 품질 개선',
    '긴 문서 처리 속도·안정성 개선',
    'AI 감지 보고서 정식 오픈',
    '친구 초대 혜택 안내 — 초대자와 가입자 모두 20크레딧 지급'
  ]) {
    assert.match(baseItems, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(baseItems, /(?:고급 휴머나이징|최대 3만 자|결과 보관함|환불 정책|서비스 리브랜딩|원문 문단 역할과 사례·결론 연결 보존 강화|AI 감지 점수·설명 일관성 개선|논문·자소서·전문 기록 장르별 맞춤 처리 확대|서비스 안정화 점검 완료)/u);
  assert.match(source, /\.filter\(item => !NOTICE_RETIRED_TITLES\.has\(item\.title\.trim\(\)\)\)/u);
  assert.doesNotMatch(baseItems, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요)/u);
});

test('공지 분류 탭·검색·정렬·상세보기가 하나의 필터 상태로 동작한다', async () => {
  const [page, source, designs] = await Promise.all([
    read('pages/notice.html'),
    read('assets/js/app-module.js'),
    read('assets/js/main-designs.js')
  ]);
  const noticeBlock = source.slice(
    source.indexOf('// ===== NOTICE ====='),
    source.indexOf('// ===== MY PAGE =====')
  );

  assert.equal(page.match(/data-notice-category=/gu)?.length, 5);
  assert.match(page, /onclick="setNoticeCategory\('업데이트',this\)"/u);
  assert.match(page, /onclick="setNoticeCategory\('정책',this\)"/u);
  assert.match(page, /data-notice-search="true"[^>]*oninput="applyNoticeFilters\(\)"/u);
  assert.match(page, /onclick="toggleNoticeSort\(this\)"/u);
  assert.match(source, /!noticeState\.category \|\| item\.category === noticeState\.category/u);
  assert.match(source, /noticeState\.query\.toLowerCase\(\)/u);
  assert.match(source, /category:\s*noticeCategoryOf\(n\)/u);
  assert.doesNotMatch(source, /if \(n\.isMajor !== true\) return null/u);
  assert.match(source, /\{ title, body, category, authorName:noticeAuthor/u);
  assert.match(source, /renderNoticeDetail\(items\[index\]\)/u);
  assert.doesNotMatch(noticeBlock, /showScreen\(\\?'login/u);
  assert.doesNotMatch(noticeBlock, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요|주세요|겠어요)/u);
  assert.match(designs, /input\.hasAttribute\('data-notice-search'\)/u);
});

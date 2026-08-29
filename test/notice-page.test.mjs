import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('메인 공지는 내부 버전명 없이 문단 보강과 구조 보존을 해요체로 안내한다', async () => {
  const page = await read('pages/notice.html');
  const featured = page.slice(
    page.indexOf('gp-notice-featured'),
    page.indexOf('noticeWriteForm')
  );

  assert.match(featured, /필요한 문단만 한 번 더 보강할 수 있어요/u);
  assert.match(featured, /실제 경험이나 사실을 직접 입력하면 다듬기·기본 결과의 해당 문단만 다시 다듬어요/u);
  assert.match(featured, /긴 글의 구조 보존을 강화했어요/u);
  assert.match(featured, /결합·누락 위험을 줄였어요/u);
  assert.doesNotMatch(featured, /정확도 개선/u);
  assert.doesNotMatch(featured, /AI 감지가 크레딧 이용 방식으로 바뀌었어요/u);
  assert.doesNotMatch(featured, /v2\.5\.41/u);
  assert.match(featured, /(?:해요|했어요|됐어요|있어요)/u);
});

test('하단 공지는 제외 요청한 주제를 숨기고 남은 중요 공지만 표시한다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );

  assert.equal(baseItems.match(/\n\s+id:\s*'/gu)?.length, 10);
  for (const title of [
    '긴 글 구조 보존과 문단 보강을 개선했어요',
    '유료 충전 크레딧은 유효기간이 없어요',
    '라이트 충전 상품이 350크레딧으로 늘었어요',
    '문단 구조 보존을 강화했어요',
    'AI 감지 보고서를 열었어요',
    'AI 감지 크레딧 이용 방식 전환 안내 (100자당 1크레딧)',
    'AI 감지 보고서 문단별 미리보기·전체보기 개선',
    '자소서·지원서 장르 재구성 품질 개선',
    '긴 문서 처리 속도·안정성 개선',
    '친구 초대 혜택 안내 — 초대자와 가입자 모두 20크레딧 지급'
  ]) {
    assert.match(baseItems, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(baseItems, /(?:고급 휴머나이징|최대 3만 자|결과 보관함|환불 정책|서비스 리브랜딩|원문 문단 역할과 사례·결론 연결 보존 강화|AI 감지 점수·설명 일관성 개선|논문·자소서·전문 기록 장르별 맞춤 처리 확대|서비스 안정화 점검 완료)/u);
  assert.match(baseItems, /결과가 바뀌지 않거나 안전 검증을 통과하지 못한 보강 요청은 크레딧과 무료 횟수를 사용하지 않아요/u);
  assert.match(baseItems, /제출 전에 수치·인용·고유명사와 사실관계를 직접 확인해 주세요/u);
  assert.match(baseItems, /현재 보유한 유료 충전 크레딧과 무료 지급 크레딧에도 같은 기준을 적용해요/u);
  assert.match(baseItems, /각 주문에 실제 지급된 크레딧을 기준으로 계산해요/u);
  assert.match(source, /\.filter\(item => !NOTICE_RETIRED_TITLES\.has\(item\.title\.trim\(\)\)\)/u);
  assert.match(baseItems, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요)/u);
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
  assert.match(noticeBlock, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요|주세요|겠어요)/u);
  assert.doesNotMatch(designs, /data-notice-search/u, '공통 디자인 스크립트가 공지 검색을 중복 처리하면 안 됨');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('신규·엔진 업데이트는 별도 상단 카드 없이 공지 목록 한 줄에서 강조한다', async () => {
  const [page, source, styles] = await Promise.all([
    read('pages/notice.html'),
    read('assets/js/app-module.js'),
    read('assets/css/redesign.css')
  ]);
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );

  assert.doesNotMatch(page, /gp-notice-featured|gp-notice-card|notice-(?:maintenance|analytics)\.png/u);
  assert.match(baseItems, /title: '긴 글 구조 보존과 문단 보강을 개선했어요'/u);
  assert.match(baseItems, /highlightLabel: '신규 · 엔진 업데이트'/u);
  assert.match(baseItems, /사용자가 직접 입력한 실제 경험이나 사실/u);
  assert.match(baseItems, /해당 문단만 다시 다듬으며/u);
  assert.match(baseItems, /제목·절·문단의 순서와 경계를 원문과 다시 대조/u);
  assert.match(baseItems, /서로 다른 절이 합쳐지거나 설명이 빠지는 문제를 줄였어요/u);
  assert.match(baseItems, /글쓰기 연구노트와 장르별 템플릿을 추가했어요/u);
  assert.doesNotMatch(baseItems, /가격 계산기/u);
  assert.doesNotMatch(baseItems, /정확도 개선|v2\.5\.41/u);
  assert.match(source, /NOTICE_HIGHLIGHT_LABELS/u);
  assert.match(source, /notice-row' \+ \(highlightLabel \? ' is-highlighted' : ''\)/u);
  assert.match(source, /class="gp-notice-row-badge"/u);
  assert.match(source, /class="gbr-ttl-text"/u);
  assert.match(styles, /#noticeList \.notice-row\.is-highlighted/u);
  assert.match(styles, /#noticeList \.gp-notice-row-badge/u);
});

test('공지는 제외 요청한 주제를 숨기고 7월 이후 필요한 정책 변경까지 표시한다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );

  assert.equal(baseItems.match(/\n\s+id:\s*'/gu)?.length, 10);
  for (const title of [
    '긴 글 구조 보존과 문단 보강을 개선했어요',
    '상시 상품 보너스와 9월 이벤트를 안내해요',
    '개인정보처리방침 변경 내용을 안내해요',
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
  assert.match(baseItems, /현재 적용 중인 크레딧 지급·환불 기준/u);
  assert.doesNotMatch(baseItems, /2026년 8월 30일부터 적용되는 크레딧 지급·환불 기준/u);
  assert.match(baseItems, /2026년 9월 30일 23시 59분\(한국 시간\)까지 결제 확인 요청이 서버에 접수된 주문/u);
  assert.match(baseItems, /스타터: 100 \+ 0 \+ 5 = 총 105크레딧/u);
  assert.match(baseItems, /맥스: 2,000 \+ 900 \+ 100 = 총 3,000크레딧/u);
  assert.match(baseItems, /사용량은 기준 크레딧부터 먼저 차감/u);
  assert.match(baseItems, /남아 있는 기준·추가 크레딧(?:을|은) 모두 회수/u);
  assert.match(baseItems, /서비스 이용 과정에서 방문 페이지와 회원가입·기능 완료·결제 이벤트/u);
  assert.match(baseItems, /광고 유입 시 UTM 정보와 광고 클릭 식별자/u);
  assert.match(baseItems, /입력한 원문과 휴머나이징 결과는 광고 플랫폼으로 전송하지 않아요/u);
  assert.match(source, /\.filter\(item => !NOTICE_RETIRED_TITLES\.has\(item\.title\.trim\(\)\)\)/u);
  assert.match(baseItems, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요)/u);
});

test('상시 상품 보너스 공지는 정렬 방향과 원격 중복에 관계없이 상단에 고정된다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );
  const noticeBlock = source.slice(
    source.indexOf('// ===== NOTICE ====='),
    source.indexOf('// ===== MY PAGE =====')
  );

  assert.match(baseItems, /title: '상시 상품 보너스와 9월 이벤트를 안내해요',[\s\S]*?pinned: true,[\s\S]*?highlightLabel: '고정 · 정책 안내'/u);
  assert.match(noticeBlock, /const NOTICE_PINNED_TITLES = new Set/u);
  assert.ok(
    noticeBlock.indexOf('const pinnedDiff = Number(noticeIsPinned(b)) - Number(noticeIsPinned(a))')
      < noticeBlock.indexOf('const diff = noticeDateValue(b.date) - noticeDateValue(a.date)'),
    '고정 공지 비교가 날짜 비교보다 먼저 실행되어야 함'
  );
  assert.match(noticeBlock, /filter\(item => !NOTICE_PINNED_TITLES\.has\(item\.title\.trim\(\)\.toLowerCase\(\)\)\)/u);
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

  assert.equal(page.match(/data-notice-category=/gu)?.length, 6);
  assert.match(page, /onclick="setNoticeCategory\('공지',this\)"/u);
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

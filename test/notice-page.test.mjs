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
  assert.match(baseItems, /title: '고급 휴머나이징 크레딧 기준을 더 세밀하게 조정했어요'/u);
  assert.match(baseItems, /highlightLabel: '업데이트 · 가격 안내'/u);
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

  assert.equal(baseItems.match(/\n\s+id:\s*'/gu)?.length, 21);
  for (const title of [
    '고급 휴머나이징 크레딧 기준을 더 세밀하게 조정했어요',
    '상시 상품 보너스와 9월 개강 이벤트를 안내해요',
    '환불과 취소 기준을 정리했어요',
    '신규 가입 무료 크레딧을 20크레딧으로 조정했어요',
    'AI 감지는 100자당 1크레딧으로 이용할 수 있어요',
    '긴 글 구조 보존과 문단 보강을 개선했어요',
    '화면 구성과 글쓰기 자료를 새로 정리했어요',
    '결제 반영과 취소 처리를 안정화했어요',
    '작업이 중단돼도 이어서 처리해요',
    '일본어와 중국어 원문도 입력할 수 있어요',
    '사용 내역과 충전 내역을 나눠서 볼 수 있어요',
    '문단 구조 보존을 강화했어요',
    'AI 감지 보고서를 열었어요',
    '감지 보고서를 문단별로 펼쳐 볼 수 있어요',
    '친구를 초대하면 둘 다 20크레딧을 받아요',
    '자소서와 지원서 처리 품질을 개선했어요',
    '긴 문서를 더 안정적으로 처리해요',
    '2026년 3~5월 점검 이력을 안내해요',
    '휴머나이징 품질을 강화했어요',
    '결제 시스템을 열었어요'
  ]) {
    assert.match(baseItems, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(baseItems, /(?:최대 3만 자|결과 보관함|환불 정책|서비스 리브랜딩|원문 문단 역할과 사례·결론 연결 보존 강화|AI 감지 점수·설명 일관성 개선|논문·자소서·전문 기록 장르별 맞춤 처리 확대|서비스 안정화 점검 완료)/u);
  assert.match(baseItems, /3,001~10,000자: 105~200크레딧/u);
  assert.match(baseItems, /3,000자 초과분 700자가 채워질 때마다 \+5크레딧/u);
  assert.match(baseItems, /변경 후 새로 접수되는 작업부터 적용해요/u);
  assert.match(baseItems, /이미 완료됐거나 진행 중인 작업의 차감액은 소급해 다시 계산하지 않아요/u);
  assert.match(baseItems, /결과가 바뀌지 않거나 안전 검증을 통과하지 못한 보강 요청은 크레딧과 무료 횟수를 사용하지 않아요/u);
  assert.match(baseItems, /제출 전에 수치·인용·고유명사와 사실관계를 직접 확인해 주세요/u);
  assert.match(baseItems, /현재 적용 중인 크레딧 지급 기준/u);
  assert.match(baseItems, /title: '신규 가입 무료 크레딧을 20크레딧으로 조정했어요'/u);
  assert.match(baseItems, /highlightLabel: '필수 · 가입 혜택'/u);
  assert.match(baseItems, /2026년 9월 2일 기준/u);
  assert.match(baseItems, /신규 계정에는 무료 20크레딧을 드려요/u);
  assert.match(baseItems, /기존 계정에는 이번 변경에 따른 추가 크레딧을 소급 지급하지 않아요/u);
  assert.match(baseItems, /기존 잔액과 결제·초대 등으로 받은 크레딧은 그대로 유지돼요/u);
  assert.match(baseItems, /600자 AI 감지는 6크레딧, 같은 분량의 기본 휴머나이징은 12크레딧/u);
  assert.match(baseItems, /총 18크레딧을 사용하고 2크레딧이 남아요/u);
  assert.match(baseItems, /가입 무료 크레딧은 유효기간 없이 사용할 수 있어요/u);
  assert.doesNotMatch(baseItems, /신규 계정에는 무료 25크레딧|기존 계정에도 (?:추가 )?20크레딧|기존 계정.{0,30}소급 지급(?:해요|합니다|돼요)/u);
  assert.doesNotMatch(baseItems, /크레딧 지급·환불 기준|환불 기준|사용량은 기준 크레딧부터 먼저 차감/u);
  assert.match(baseItems, /2026년 9월 30일 23시 59분\(한국 시간\)까지 결제 확인 요청이 서버에 접수된 주문/u);
  assert.match(baseItems, /스타터: 200 \+ 0 \+ 10 = 총 210크레딧/u);
  assert.doesNotMatch(baseItems, /라이트: 300 \+ 30 \+ 15/u, '종료 상품이 지급 기준 공지에 남음');
  assert.match(baseItems, /팀·기관\(문의 전용\): 4,000 \+ 2,000 \+ 200 = 총 6,200크레딧/u);
  // 2026-09-03 요금제 개편 공지 — 시작 상품 5,900원/200크레딧, 종료 상품, 대용량 2종
  assert.match(baseItems, /title: '요금제를 일반 3종과 대용량 2종으로 정리했어요'/u);
  assert.match(baseItems, /시작 상품을 5,900원 200크레딧으로 바꿨어요/u);
  assert.match(baseItems, /2,900원 스타터와 8,700원 라이트는 새 결제를 받지 않아요/u);
  assert.match(baseItems, /이미 결제한 크레딧은 그대로 남아 있고 유효기간 없이 사용할 수 있어요/u);
  assert.match(baseItems, /팀·기관: 116,000원 · 기준 4,000크레딧 \+ 상시 보너스 2,000크레딧 · 문의 후 결제 방법을 안내해요/u);
  assert.match(baseItems, /맥스: 2,000 \+ 900 \+ 100 = 총 3,000크레딧/u);
  assert.doesNotMatch(baseItems, /개인정보처리방침 변경 내용을 안내해요/u);
  assert.match(source, /NOTICE_RETIRED_TITLES[\s\S]*?'개인정보처리방침 변경 내용을 안내해요'/u);
  assert.match(source, /\.filter\(item => !NOTICE_RETIRED_TITLES\.has\(item\.title\.trim\(\)\)\)/u);
  assert.match(baseItems, /(?:해요|했어요|돼요|됐어요|드려요|있어요|없어요|않아요)/u);

  // 환불 기준은 공지로 안내하되, 소급 적용 오해와 접수 창구 혼선을 막는 두 문장을 반드시 포함한다
  assert.match(baseItems, /2026년 8월 30일 이전에 결제한 주문은 구매 당시 기준을 그대로 적용해요/u);
  assert.match(baseItems, /사이트 안의 고객센터에서 문의를 남겨 주시면/u);
});

test('공지 문구는 2026-09-02 양식 표준을 지킨다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );
  const titles = [...baseItems.matchAll(/title: '([^']+)'/gu)].map(match => match[1]);

  assert.equal(titles.length, 21);
  // 대괄호 접두어·이모지 없이 해요체 서술형 제목만 쓴다
  assert.doesNotMatch(baseItems, /title: '\[/u);
  assert.doesNotMatch(baseItems, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  for (const title of titles) {
    assert.ok(title.length <= 30, `공지 제목은 30자 이내여야 함: ${title}`);
    assert.doesNotMatch(title, /[.]$/u, `공지 제목에는 마침표를 쓰지 않음: ${title}`);
  }
  // 휴머나이징 리브랜딩(2026-07-10) 이전 표현이 재작성 공지에 되살아나지 않게 막는다
  assert.doesNotMatch(baseItems, /우회|원천 차단|눈치채지|완벽/u);
  // 문의 창구는 고객센터로 일원화했으므로 담당자 메일 주소를 본문에 두지 않는다
  assert.doesNotMatch(baseItems, /[\w.+-]+@[\w-]+\.[\w.]+/u);
  // 분류 탭이 빈 채로 남지 않도록 다섯 분류를 모두 채운다
  for (const category of ['공지', '업데이트', '점검', '이벤트', '정책']) {
    assert.match(baseItems, new RegExp(`category: '${category}'`, 'u'));
  }
});

test('돈·약관이 걸린 필수 공지는 고정하고, 재작성한 구공지 원본은 원격에서 숨긴다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );
  const noticeBlock = source.slice(
    source.indexOf('// ===== NOTICE ====='),
    source.indexOf('// ===== MY PAGE =====')
  );

  // 결제·크레딧·환불처럼 돈이 걸린 공지 네 건만 고정한다
  assert.equal(baseItems.match(/pinned: true/gu)?.length, 4);
  // '필수 ·' 배지는 고정 공지 전용 어휘다
  assert.equal(baseItems.match(/highlightLabel: '필수 · /gu)?.length, 4);
  for (const title of [
    '상시 상품 보너스와 9월 개강 이벤트를 안내해요',
    '환불과 취소 기준을 정리했어요',
    '신규 가입 무료 크레딧을 20크레딧으로 조정했어요',
    'AI 감지는 100자당 1크레딧으로 이용할 수 있어요'
  ]) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(baseItems, new RegExp(`title: '${escaped}',\\r?\\n\\s+pinned: true,\\r?\\n\\s+highlightLabel: '필수 · `, 'u'));
  }

  // 2026-09-02 양식 통일 때 로컬로 옮겨 다시 쓴 구공지들의 원격 원본
  for (const title of [
    '[2026-05-23] 시스템 업데이트로 인한 서비스 일시 장애',
    '[2026-05-14] 시스템 업데이트로 인한 서비스 일시 장애',
    '[모델 업데이트 중 기능 문제]',
    '[결제 시스템 오픈]',
    '[휴머나이징 기능 업데이트]',
    '[사이트 UI디자인 변경]'
  ]) {
    assert.ok(
      noticeBlock.includes(`'${title}'`),
      `재작성한 구공지의 원격 원본은 퇴역 목록에 있어야 함: ${title}`
    );
  }
  // 원격에 사본이 여러 벌 남아 목록에 중복으로 뜨던 두 제목 — 막으면 로컬 정본만 남는다
  assert.match(source, /NOTICE_RETIRED_TITLES[\s\S]*?'자소서·지원서 장르 재구성 품질 개선'/u);
  assert.match(source, /NOTICE_RETIRED_TITLES[\s\S]*?'긴 문서 처리 속도·안정성 개선'/u);
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

  assert.match(baseItems, /title: '상시 상품 보너스와 9월 개강 이벤트를 안내해요',[\s\S]*?pinned: true,[\s\S]*?highlightLabel: '필수 · 크레딧 지급 기준'/u);
  // 개명 전 제목은 퇴역 목록으로 남겨 원격 사본이 새 제목과 함께 뜨지 않게 한다
  assert.match(source, /NOTICE_RETIRED_TITLES[\s\S]*?'상시 상품 보너스와 9월 이벤트를 안내해요'/u);
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

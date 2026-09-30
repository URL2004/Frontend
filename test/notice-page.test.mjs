import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function noticeContext(source) {
 const context = vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('const NOTICE_BASE_ITEMS'), source.indexOf('const NOTICE_CATEGORIES')) + ';globalThis.items = NOTICE_BASE_ITEMS;globalThis.retired = NOTICE_RETIRED_TITLES;globalThis.copies = NOTICE_REMOTE_COPY;', context);
 return context;
}

test('격식체 재작성은 공지별 수치와 적용 조건을 보존한다', async () => {
 const source = await read('assets/js/app-module.js');
 const context = noticeContext(source);
 const expectedNumbers = {
 "humanize-paragraph-update-20260920": [],
 "humanize-meaning-naturalness-20260920": [],
 "detect-report-update-20260906": [
  "100"
 ],
 "structure-option-20260906": [
  "1",
  "100",
  "10000",
  "120",
  "130",
  "180",
  "2",
  "200",
  "20000",
  "260",
  "3",
  "30",
  "30",
  "30",
  "3000",
  "30000",
  "400",
  "520",
  "60",
  "600",
  "780"
 ],
 "humanize-voice-update-20260906": [],
 "pricing-tiers-20260903": [
  "0",
  "0",
  "1000",
  "116000",
  "125",
  "14500",
  "2",
  "2",
  "200",
  "200",
  "200",
  "2000",
  "2000",
  "2026",
  "2026",
  "29",
  "2900",
  "29000",
  "3",
  "3",
  "3",
  "30",
  "350",
  "4000",
  "5",
  "500",
  "58000",
  "5900",
  "5900",
  "8700",
  "9",
  "9",
  "900"
 ],
 "advanced-credit-steps-20260902": [
  "100",
  "100",
  "100",
  "100",
  "10000",
  "10000",
  "10000",
  "10000",
  "10001",
  "10001",
  "105",
  "105",
  "130",
  "150",
  "15000",
  "155",
  "160",
  "190",
  "200",
  "200",
  "20000",
  "205",
  "235",
  "250",
  "300",
  "300",
  "3000",
  "3000",
  "3000",
  "3000",
  "3000",
  "30000",
  "30000",
  "3001",
  "3001",
  "3001",
  "350",
  "400",
  "400",
  "5",
  "5",
  "5",
  "5",
  "50",
  "50",
  "500",
  "5000",
  "600",
  "600",
  "700",
  "700",
  "7000"
 ],
 "paid-credit-no-expiry-20260829": [
  "0",
  "0",
  "0",
  "100",
  "1000",
  "125",
  "1400",
  "200",
  "200",
  "200",
  "2000",
  "2000",
  "2026",
  "23",
  "25",
  "30",
  "3000",
  "350",
  "4000",
  "5",
  "50",
  "500",
  "59",
  "6200",
  "650",
  "9",
  "9",
  "9",
  "9",
  "900"
 ],
 "refund-standard-20260830": [
  "2026",
  "2026",
  "30",
  "30",
  "7",
  "7",
  "8",
  "8"
 ],
 "signup-credit-20-20260902": [
  "12",
  "18",
  "2",
  "2",
  "20",
  "20",
  "2026",
  "6",
  "600",
  "9"
 ],
 "detect-credit-policy": [
  "1",
  "1",
  "100",
  "100"
 ],
 "humanize-v2541-refine": [],
 "service-refresh-20260829": [],
 "payment-credit-sync-20260826": [],
 "job-resume-20260813": [],
 "multilingual-input-20260801": [],
 "credit-history-split-20260722": [
  "20"
 ],
 "humanize-v25": [],
 "detect-report-launch": [],
 "detect-report-preview": [],
 "friend-invite-event": [
  "20",
  "20"
 ],
 "application-genre-quality": [],
 "long-document-performance": [],
 "maintenance-history-2026-spring": [
  "03",
  "09",
  "13",
  "13",
  "13",
  "14",
  "14",
  "18",
  "2026",
  "2026",
  "2026",
  "2026",
  "2026",
  "23",
  "3",
  "3",
  "30",
  "5",
  "5",
  "5",
  "5",
  "5",
  "5",
  "50",
  "9"
 ],
 "humanize-quality-20260326": [],
 "payment-open-20260401": []
};
 assert.equal(context.items.length, 26);
 for (const item of context.items) {
  const actual = ( (item.title + '\n' + item.body).match(/\d[\d,]*(?:\.\d+)?/gu) || [] ).map(n => n.replaceAll(',', '')).sort();
  assert.deepEqual(actual, expectedNumbers[item.id], item.id + ': 날짜·시간·금액·크레딧 보존');
 }
 const find = id => context.items.find(item => item.id === id).body;
 assert.match(find('advanced-credit-steps-20260902'), /공백을 포함/);
 assert.match(find('advanced-credit-steps-20260902'), /새로 접수되는 작업부터 적용/);
 assert.match(find('advanced-credit-steps-20260902'), /소급해 다시 계산하지 않습니다/);
 assert.match(find('signup-credit-20-20260902'), /기존 계정[\s\S]*소급해 지급하지 않습니다/);
 assert.match(find('signup-credit-20-20260902'), /기존 잔액과 결제·초대[\s\S]*그대로 유지/);
 assert.match(find('paid-credit-no-expiry-20260829'), /결제 확인 요청[\s\S]*한국 시간[\s\S]*서버에 접수된 주문/);
 assert.match(find('refund-standard-20260830'), /한 번도 사용하지 않은 경우 전액 환불/);
 assert.match(find('refund-standard-20260830'), /사용한 만큼의 금액을 제외하고 환불/);
 assert.match(find('refund-standard-20260830'), /구매 당시의 기준이 그대로 적용/);
 assert.match(find('refund-standard-20260830'), /고객센터/);
 assert.match(find('humanize-v2541-refine'), /달라지지 않거나 안전 검증을 통과하지 못한[\s\S]*크레딧과 무료 횟수가 차감되지 않습니다/);
 assert.match(find('structure-option-20260906'), /근거 보강 요금[\s\S]*중복 적용하지 않습니다/);
 assert.match(find('structure-option-20260906'), /구조 변경이 필요하지 않거나 적용되지 않으면[\s\S]*차감하지 않습니다/);
 assert.match(find('detect-report-update-20260906'), /확정하는 확률이 아닙니다/);
 assert.match(find('detect-report-update-20260906'), /외부 검사 결과는 보장하지 않습니다/);
});

test('원격 공지 문구는 목록·직접 상세에 적용하고 이후 관리자 편집을 보존한다', async () => {
 const source = await read('assets/js/app-module.js');
 const context = noticeContext(source);
 assert.equal(context.copies.size, 4);
 for (const [id, copy] of context.copies) {
  const original = { title: copy.originalTitle, body: copy.originalBody, views: 123, authorName: '운영자' };
  const changed = context.noticeRemoteCopy(id, original);
  assert.equal(changed.title, copy.title);
  assert.equal(changed.body, copy.body);
  assert.equal(changed.views, 123);
  assert.equal(changed.authorName, '운영자');
  const edited = { ...original, body: '관리자가 새로 작성한 공지입니다.' };
  assert.equal(context.noticeRemoteCopy(id, edited), edited);
 }
 assert.match(source, /const n = noticeRemoteCopy\(d.id, d.data\(\)\)/u);
 assert.match(source, /const n = noticeRemoteCopy\(id, data\)/u);
 assert.equal(context.noticeRemoteCopy('future-notice', { title: '새 공지' }).title, '새 공지');
});

test('모든 기존 공지의 제목과 본문은 격식체이며 이전 제목은 중복 노출하지 않는다', async () => {
 const context = noticeContext(await read('assets/js/app-module.js'));
 const copies = Array.from(context.copies.values());
 for (const item of Array.from(context.items).concat(copies)) {
  assert.ok(item.title.length <= 30, item.title);
  assert.doesNotMatch(item.title + '\n' + item.body, /(?:[가-힣]+(?:해요|어요|아요|예요|에요|나요)|주세요)(?=[.!?\s]|$)/u);
  assert.doesNotMatch(item.title, /^\[|[.]$/u);
 }
 for (const title of ["긴 본문과 항목 설명의 문단 나눔을 개선했어요","원문의 뜻과 자연스러움을 확인하는 검사를 보강했어요","AI 감지 결과와 문장 예시를 개선했어요","고급 휴머나이징에 구조 개선을 추가했어요","휴머나이징 말투 보존과 검토 안내를 개선했어요","요금제를 일반 3종과 대용량 2종으로 정리했어요","고급 휴머나이징 크레딧 기준을 더 세밀하게 조정했어요","상시 상품 보너스와 9월 개강 이벤트를 안내해요","환불과 취소 기준을 정리했어요","신규 가입 무료 크레딧을 20크레딧으로 조정했어요","AI 감지는 100자당 1크레딧으로 이용할 수 있어요","긴 글 구조 보존과 문단 보강을 개선했어요","화면 구성과 글쓰기 자료를 새로 정리했어요","결제 반영과 취소 처리를 안정화했어요","작업이 중단돼도 이어서 처리해요","휴머나이징은 한국어 원문을 지원해요","사용 내역과 충전 내역을 나눠서 볼 수 있어요","문단 구조 보존을 강화했어요","AI 감지 보고서를 열었어요","감지 보고서를 문단별로 펼쳐 볼 수 있어요","친구를 초대하면 둘 다 20크레딧을 받아요","자소서와 지원서 처리 품질을 개선했어요","긴 문서를 더 안정적으로 처리해요","2026년 3~5월 점검 이력을 안내해요","휴머나이징 품질을 강화했어요","결제 시스템을 열었어요"]) assert.ok(context.retired.has(title), title);
});

test('공지 문구는 2026-09-02 양식 표준을 지킨다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );
  const titles = [...baseItems.matchAll(/title: '([^']+)'/gu)].map(match => match[1]);

  assert.equal(titles.length, 26);
  // 대괄호 접두어·이모지 없이 격식체 서술형 제목만 쓴다
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

test('최근 품질 안내와 요금·환불 기준을 중요 표시하고 재작성한 구공지 원본은 숨긴다', async () => {
  const source = await read('assets/js/app-module.js');
  const baseItems = source.slice(
    source.indexOf('const NOTICE_BASE_ITEMS'),
    source.indexOf('const NOTICE_RETIRED_TITLES')
  );
  const noticeBlock = source.slice(
    source.indexOf('// ===== NOTICE ====='),
    source.indexOf('// ===== MY PAGE =====')
  );

  const context = vm.createContext({});
  vm.runInContext(baseItems + ';globalThis.items = NOTICE_BASE_ITEMS;', context);
  const highlighted = Array.from(context.items).filter(item => item.highlightLabel);
  assert.deepEqual(highlighted.map(item => item.id), ['humanize-paragraph-update-20260920', 'humanize-meaning-naturalness-20260920', 'advanced-credit-steps-20260902', 'refund-standard-20260830']);
  assert.ok(highlighted.every(item => item.highlightLabel === '중요'));
  assert.doesNotMatch(baseItems, /pinned:/u);

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

test('중요 공지는 정렬 방향과 관계없이 최상단에 고정하고 각 그룹 안에서는 날짜순을 지킨다', async () => {
  const source = await read('assets/js/app-module.js');
  const block = source.slice(source.indexOf('const NOTICE_BASE_ITEMS'), source.indexOf('function renderNoticeList()'));
  const context = vm.createContext({});
  vm.runInContext(block + ';globalThis.state = noticeState;', context);
  for (const direction of ['desc', 'asc']) {
    context.state.sort = direction;
    const items = vm.runInContext('noticeFilteredItems()', context);
    assert.equal(items.length, 26);
    assert.ok(items.slice(0, 4).every(item => item.highlightLabel === '중요'));
    assert.ok(items.slice(4).every(item => item.highlightLabel !== '중요'));
    for (const group of [items.slice(0, 4), items.slice(4)]) {
      const dates = Array.from(group, item => Date.parse(item.date.replaceAll('.', '-')));
      assert.deepEqual(dates, [...dates].sort((a, b) => direction === 'desc' ? b - a : a - b));
    }
  }
  context.state.category = '정책';
  context.state.query = '크레딧';
  const filtered = vm.runInContext('noticeFilteredItems()', context);
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(item => item.category === '정책' && [item.title,item.body].join(' ').includes('크레딧')));
  assert.equal(filtered[0].highlightLabel, '중요');
  context.state.category = '업데이트';
  context.state.query = '';
  assert.ok(vm.runInContext('noticeFilteredItems()', context).every(item => item.category === '업데이트'));
  context.state.query = '존재하지않는공지검색어';
  assert.equal(vm.runInContext('noticeFilteredItems()', context).length, 0);
  assert.match(source, /filter\(item => !NOTICE_BASE_TITLES\.has\(item\.title\.trim\(\)\.toLowerCase\(\)\)\)/u);
  assert.match(source, /NOTICE_RETIRED_TITLES[\s\S]*?'상시 상품 보너스와 9월 이벤트를 안내해요'/u);
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

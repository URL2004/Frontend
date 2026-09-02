import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
// loadMyPage 본문이 renderSubManage를 호출하므로 함수 정의 앞의 주석을 끝 표지로 쓴다
const sliceMyPage = source => source.slice(source.indexOf('window.loadMyPage = async'), source.indexOf('// 마이페이지 정기결제 관리 카드 렌더'));

test('내 정보는 이스케이프한 뷰 모델을 골격 렌더러에 넘기고, 기존 목록 로더의 컨테이너 id를 유지한다', async () => {
  const source = await read('assets/js/app-module.js');
  const myPage = sliceMyPage(source);

  assert.match(myPage, /name: escapeHtml\(window\.getAdminName\(\)\|\|CU\.displayName\)/u);
  assert.match(myPage, /email: escapeHtml\(CU\.email\)/u);
  assert.match(myPage, /el\.innerHTML = window\.gpRenderMyPageShell\(view\);\s*window\.gpMyPageActivate\(el, view\);/u);
  for (const id of ['notifList', 'orderHistoryList', 'creditHistoryList', 'subManageCard']) {
    assert.match(myPage, new RegExp(`'${id}'|id="${id}"`, 'u'), `${id} 컨테이너가 골격에 있어야 기존 로더가 채운다`);
  }
  // 말풍선 호칭은 이미 이스케이프된 view.name을 쓴다(첫 글자만 잘라 '민님'처럼 되지 않게)
  assert.match(myPage, /\(view\.name \|\| '회원'\) \+ '님, 제출 전 마지막 점검은 여기서 해요'/u);
  // 캐릭터 무대: 여/남 포즈 4종을 data-src로 함께 들고, 선택은 localStorage에만 둔다
  assert.match(myPage, /data-src-f="\/assets\/img\/mypage\/avatar-f-' \+ pose \+ '\.webp"/u);
  assert.match(myPage, /const AVATAR_KEY = 'gp\.mypage\.avatar';/u);
  assert.match(myPage, /data-mp-avatar="m"/u);
  assert.match(myPage, /if \(stage\.dataset\.pose !== 'idle'\) return;/u, '연출 중 재입력은 무시');
  // 계정 동작은 전부 기존 함수로 연결된다
  for (const fn of ['logout()', 'changeNickname()', 'showRefundModal()', 'deleteAccount()', 'showReferralPopup()', "switchTab(\\'pricing\\')"]) {
    assert.ok(myPage.includes(fn), `${fn} 진입점 유지`);
  }
});

test('잔액 환산은 요금 안내와 같은 기준을 쓰고, 기록 탭은 접근 가능한 탭 패턴이다', async () => {
  const source = await read('assets/js/app-module.js');
  const myPage = sliceMyPage(source);

  // AI 감지 100자당 1크레딧, 기본 휴머나이징 100자당 2크레딧·최소 10 (pricing.html의 기준과 동일)
  assert.match(myPage, /const units = Math\.ceil\(len \/ 100\);/u);
  assert.match(myPage, /const basicCost = Math\.max\(10, units \* 2\);/u);
  assert.match(myPage, /data-mp-seg="600"[^>]*aria-pressed="true"/u);
  assert.match(myPage, /data-mp-seg="1500"/u);
  assert.match(myPage, /data-mp-seg="3000"/u);

  assert.match(myPage, /role="tablist"/u);
  assert.match(myPage, /const tab = \(id, panel, label, selected\) =>/u, '탭 버튼은 하나의 헬퍼로 찍는다');
  assert.match(myPage, /aria-controls="' \+ panel \+ '"/u);
  assert.match(myPage, /e\.key === 'ArrowRight' \? 1 : e\.key === 'ArrowLeft' \? -1 : 0/u);
  // 움직임 줄이기: 카운트업 없이 최종값
  assert.match(myPage, /prefers-reduced-motion: reduce/u);
  assert.match(myPage, /if \(reduceMotion \|\| credits === 0\)/u);
});

test('내 정보 스타일은 hidden 가드와 감속 모션 경로를 갖추고 로고 노랑은 블립에만 쓴다', async () => {
  const css = await read('assets/css/redesign.css');
  const block = css.slice(css.indexOf('lavender v119: 내 정보 재설계'), css.indexOf('/* ===== lavender v116: AI 감지 보고서'));

  assert.ok(block.length > 2000, 'v119 블록이 v116 보고서 섹션 앞에 있어야 한다');
  assert.match(block, /\[role="tabpanel"\]\[hidden\]\{display:none !important;\}/u);
  assert.match(block, /#subManageCard\[hidden\]\{display:none !important;\}/u);
  assert.match(block, /@media \(prefers-reduced-motion:no-preference\)\{/u);
  // 반복하는 움직임은 대기 중 숨쉬기(gpMpBreathe) 하나뿐이고, 그것도 감속 모션 미디어 안에만 있다
  assert.doesNotMatch(block, /animation:(?!gpMpBreathe)[^;]*infinite/u);
  assert.match(block, /@media \(prefers-reduced-motion:no-preference\)\{[^}]*\{animation:gpMpBreathe[^}]*infinite;\}/u);
  assert.ok((block.match(/#f5b425/gu) || []).length <= 1, '로고 노랑은 한 곳 이하');
  assert.match(block, /@media\(max-width:760px\)\{[\s\S]*\.gp-mp-hero\{grid-template-columns:1fr;\}/u);
});

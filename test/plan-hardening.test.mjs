import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('커뮤니티는 빈 목록·검색 없음·Firestore 실패·로그아웃을 각각 안전한 상태로 처리한다', async () => {
  const source = await read('assets/js/app-module.js');
  const loadPosts = source.slice(source.indexOf('window.loadPosts = async'), source.indexOf('window.submitPost = async'));
  const renderPage = source.slice(source.indexOf('function _renderPostPage'), source.indexOf('window.loadPosts = async'));

  assert.match(renderPage, /아직 게시글이 없어요/u);
  assert.match(renderPage, /검색 결과가 없어요\. 검색어나 필터를 바꿔보세요/u);
  assert.match(loadPosts, /if \(!CU\) \{\s*_showCommunityLoginGate\(\);\s*return;/u);
  assert.match(loadPosts, /const requestUid = CU\.uid/u);
  assert.match(loadPosts, /if \(!CU \|\| CU\.uid !== requestUid\) \{ _showCommunityLoginGate\(\); return; \}/u);
  assert.match(loadPosts, /catch\(e\)[\s\S]*?_clearCommunityPostSurfaces\(\)[\s\S]*?게시글을 불러오지 못했어요/u);
});

test('커뮤니티 긴 제목과 빠른 중복 등록을 화면과 실행 양쪽에서 막는다', async () => {
  const [page, source, styles] = await Promise.all([
    read('pages/community.html'),
    read('assets/js/app-module.js'),
    read('assets/css/redesign.css')
  ]);
  const submit = source.slice(source.indexOf('window.submitPost = async'), source.indexOf('window.viewPost = async'));

  assert.match(page, /id="ptitle"[^>]*maxlength="120"/u);
  assert.match(page, /id="pbody"[^>]*maxlength="10000"/u);
  assert.match(styles, /\.gbr-ttl\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/u);
  assert.match(submit, /if \(!btn \|\| btn\.disabled\) return;/u);
  assert.match(submit, /btn\.disabled = true;[\s\S]*?btn\.setAttribute\('aria-busy', 'true'\)/u);
  assert.match(submit, /finally[\s\S]*?btn\.disabled=false;[\s\S]*?btn\.removeAttribute\('aria-busy'\)/u);
});

test('결제 맥락이 준비되기 전에는 상품값과 결제 버튼을 열지 않는다', async () => {
  const [modal, flow] = await Promise.all([
    read('partials/modals.html'),
    read('assets/js/conversion-flow.js')
  ]);

  assert.match(modal, /id="gpCreditCheckoutPrice">—</u);
  assert.match(modal, /id="gpCreditCheckoutButton"[^>]*disabled>상품을 계산하고 있어요/u);
  assert.doesNotMatch(modal, /2,900원|110크레딧/u);
  assert.match(flow, /button\.disabled = true;[\s\S]*?button\.setAttribute\('aria-busy', 'true'\)/u);
  assert.match(flow, /modalState\.ready = true/u);
  assert.match(flow, /if \(!modalState \|\| !modalState\.ready \|\| !modalState\.plan\) return/u);
});

test('공통 모달은 레이어 순서와 키보드 포커스 계약을 지킨다', async () => {
  const [styles, manager, main] = await Promise.all([
    read('assets/css/redesign.css'),
    read('assets/js/modal-manager.js'),
    read('assets/js/app-main.js')
  ]);

  assert.match(styles, /\[hidden\]\{display:none!important;\}/u);
  for (const [name, value] of [
    ['checkout', 10020], ['panel', 10030], ['confirm', 10035], ['dialog', 10040], ['toast', 10050]
  ]) assert.match(styles, new RegExp(`--layer-${name}:${value}`, 'u'));
  assert.match(manager, /event\.key === 'Escape'/u);
  assert.match(manager, /event\.key !== 'Tab'/u);
  assert.match(manager, /last\.focus\(\)/u);
  assert.match(manager, /first\.focus\(\)/u);
  assert.match(manager, /previousFocus[\s\S]*?target\.focus/u);
  assert.match(manager, /document\.addEventListener\('click', rememberTrigger, true\)/u);
  assert.match(manager, /dialog\.getClientRects\(\)\.length > 0/u);
  assert.match(main, /window\.showPolicy = showPolicy/u);
});

test('구독 비활성 기간에는 공개 시작·재개·콜백 경로가 없고 Pro는 준비 중만 안내한다', async () => {
  const [pricing, pro, main, module, callbacks] = await Promise.all([
    read('pages/pricing.html'),
    read('pages/pro.html'),
    read('assets/js/app-main.js'),
    read('assets/js/app-module.js'),
    read('assets/js/payment-callbacks.js')
  ]);

  assert.doesNotMatch(pricing, /pricingTabSub|subscriptionSection|정기구독|11,900|54,900|99,000|290,000/u);
  assert.match(pro, /Pro는 준비 중이에요/u);
  assert.match(pro, /크레딧 충전하기/u);
  assert.doesNotMatch(`${main}\n${module}`, /구독 시작하기|다시 구독하기|구독 재개|resumeSubscription|retrySubscription/u);
  assert.doesNotMatch(callbacks, /issue-billing-key|authKey|구독 시작|subscription_api_failed/u);
});

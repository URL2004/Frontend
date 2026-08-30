import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('추천 링크는 innerHTML이나 inline JavaScript에 사용자 ref 값을 삽입하지 않는다', () => {
  const module = read('assets/js/app-module.js');
  const start = module.indexOf('window.showReferralPopup = async');
  const end = module.indexOf('// 보안: credits/plan', start);
  const popup = module.slice(start, end);

  assert.match(popup, /id="refShareLink"/u);
  assert.match(popup, /linkUrl\.searchParams\.set\('ref', String\(refCode\)\)/u);
  assert.match(popup, /linkEl\.textContent = link/u);
  assert.match(popup, /navigator\.clipboard\.writeText\(link\)/u);
  assert.doesNotMatch(popup, />\$\{link\}</u);
  assert.doesNotMatch(popup, /writeText\('\$\{link\}'\)/u);
});

test('종료된 커뮤니티는 숨은 런타임 경로에서도 Firestore와 Storage에 접근하지 않는다', () => {
  const module = read('assets/js/app-module.js');
  const appMain = read('assets/js/app-main.js');
  const designs = read('assets/js/main-designs.js');
  const flow = read('assets/js/conversion-flow.js');
  const feedback = read('assets/js/ui-feedback.js');

  assert.match(module, /const COMMUNITY_CLOSED = true/u);
  for (const name of ['loadPosts', 'submitPost', 'viewPost', 'submitComment', 'toggleBm', 'delPost', 'togglePostHidden', 'delComment', 'toggleLike', 'submitReply']) {
    const start = module.indexOf(`window.${name} =`);
    assert.notEqual(start, -1, `${name} 함수가 있어야 한다`);
    assert.match(module.slice(start, start + 180), /if \(blockClosedCommunity\(\)\) return/u, `${name}은 종료 게이트를 먼저 통과해야 한다`);
  }
  assert.doesNotMatch(module, /firebase-storage\.js|getStorage\(/u);
  assert.doesNotMatch(appMain, /community-photos|photo-preview-list|getSelectedFiles/u);
  assert.doesNotMatch(designs, /['"]community['"]/u);
  assert.doesNotMatch(flow.match(/var OFFER_PAGES = \[[^\]]*\]/u)?.[0] || '', /community/u);
  assert.doesNotMatch(feedback, /switchTab\('community'\)|viewPost\(n\.postId\)/u);

  const myPage = module.slice(module.indexOf('window.loadMyPage = async'), module.indexOf('window.renderSubManage'));
  assert.doesNotMatch(myPage, /collection\(db,'posts'\)|switchTab\('community'\)|작성한 글|북마크/u);
});

test('Q&A·공지·관리자·사용자 렌더링은 저장 문자열을 HTML 또는 inline JS 문맥에 맞게 이스케이프한다', () => {
  const module = read('assets/js/app-module.js');

  for (const expression of [
    'escapeHtml(q.title || \'\')',
    'escapeHtml(q.authorName||\'\')',
    'escapeHtml(q.body||\'\')',
    'escapeHtml(q.answer.body)',
    'escapeHtml(item.title)',
    "escapeHtml(item.body || '').replace(/\\n/g, '<br>')",
    "escapeHtml(user.name || '이름 없음')",
    "escapeHtml(user.email || '-')",
    "escapeHtml(user.uid || '')",
    'escapeHtml(cardLine)'
  ]) assert.ok(module.includes(expression), `누락된 escape 계약: ${expression}`);

  assert.match(module, /delQuestion\(\\''\+jsAttr\(qid\)\+'\\'\)/u);
  assert.match(module, /voidBatch\(\\'' \+ jsAttr\(b\.batchId\)/u);
  assert.match(module, /voidCoupon\(\\'' \+ jsAttr\(c\.code\)/u);
  assert.match(module, /approveRefund\('\$\{jsAttr\(item\.id\)\}'/u);
  assert.match(module, /adminOpsAck\(\\'' \+ jsAttr\(item\.id\)/u);
});

test('inline JS 이스케이프는 HTML 엔티티 재해석과 Storage 유사 호스트를 차단한다', () => {
  const module = read('assets/js/app-module.js');
  const jsAttrSource = module.match(/function jsAttr\(s\) \{[\s\S]*?\n\}/u)?.[0];
  const photoSource = module.match(/function safePhotoUrl\(url\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(jsAttrSource);
  assert.ok(photoSource);

  const sandbox = { payload: "&#39;);alert(1)// &apos;);alert(2)//", result: '' };
  vm.runInNewContext(`${jsAttrSource}; result = jsAttr(payload);`, sandbox);
  assert.match(sandbox.result, /^&amp;#39;/u);
  assert.match(sandbox.result, /&amp;apos;/u);
  assert.doesNotMatch(sandbox.result, /(^|[^\\])'/u);

  const photoSandbox = { URL, window: {}, good: '', subdomain: '', evil: '', insecure: '' };
  vm.runInNewContext(`${photoSource}; good = safePhotoUrl('https://firebasestorage.googleapis.com/v0/b/x'); subdomain = safePhotoUrl('https://cdn.storage.googleapis.com/x'); evil = safePhotoUrl('https://evilfirebasestorage.googleapis.com/x'); insecure = safePhotoUrl('http://storage.googleapis.com/x');`, photoSandbox);
  assert.match(photoSandbox.good, /^https:\/\/firebasestorage\.googleapis\.com/u);
  assert.match(photoSandbox.subdomain, /^https:\/\/cdn\.storage\.googleapis\.com/u);
  assert.equal(photoSandbox.evil, '');
  assert.equal(photoSandbox.insecure, '');
});

test('분석 주소는 개인정보·인증 토큰·추천 코드·미리보기 키를 대소문자와 무관하게 제거한다', () => {
  const tracking = read('assets/js/head-tracking.js');
  for (const key of ['preview_key', 'ref', 'token', 'id_token', 'access_token', 'refresh_token', 'session_state', 'email', 'phone', 'name']) {
    assert.match(tracking, new RegExp(`['"]${key}['"]`, 'u'));
  }
  assert.match(tracking, /String\(key\)\.toLowerCase\(\)/u);
  assert.match(tracking, /url\.searchParams\.delete\(key\)/u);
});

test('새 탭 외부 링크는 opener와 referrer를 함께 차단한다', () => {
  const sources = [
    read('pages/main.html'),
    read('partials/footer.html'),
    read('assets/js/app-main.js'),
    read('assets/js/app-module.js')
  ];
  const links = sources.flatMap(source => source.match(/<a\b[^>]*target="_blank"[^>]*>/gu) || []);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.match(link, /rel="[^"]*\bnoopener\b[^"]*"/u, link);
    assert.match(link, /rel="[^"]*\bnoreferrer\b[^"]*"/u, link);
  }
});

test('브라우저 설정에는 Firebase 공개 식별자만 있고 서버 비밀키 형식은 없다', () => {
  const shipped = [
    read('assets/js/config.js'),
    read('assets/js/app-boot.js'),
    read('assets/js/app-module.js')
  ].join('\n');
  assert.match(shipped, /apiKey/u);
  assert.doesNotMatch(shipped, /BEGIN (?:RSA )?PRIVATE KEY|private_key_id|OPENAI_API_KEY|FIREBASE_PRIVATE_KEY|client_secret/iu);
});

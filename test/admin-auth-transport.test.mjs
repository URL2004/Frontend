import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'assets/js/app-module.js'), 'utf8');
const api = await fs.readFile(path.join(root, 'assets/js/api.js'), 'utf8');
const appMain = await fs.readFile(path.join(root, 'assets/js/app-main.js'), 'utf8');
const conversionFlow = await fs.readFile(path.join(root, 'assets/js/conversion-flow.js'), 'utf8');
const paymentCallbacks = await fs.readFile(path.join(root, 'assets/js/payment-callbacks.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

function jsonStringifyArguments(text) {
  const calls = [];
  const marker = 'JSON.stringify(';
  let cursor = 0;
  while ((cursor = text.indexOf(marker, cursor)) !== -1) {
    const start = cursor + marker.length;
    let depth = 1;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let i = start;
    for (; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (char === '*' && next === '/') { blockComment = false; i++; }
        continue;
      }
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === quote) quote = '';
        continue;
      }
      if (char === '/' && next === '/') { lineComment = true; i++; continue; }
      if (char === '/' && next === '*') { blockComment = true; i++; continue; }
      if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) break;
    }
    calls.push(text.slice(start, i));
    cursor = i + 1;
  }
  return calls;
}

test('admin JSON requests put Firebase credentials only in the Authorization header', () => {
  const helper = section('function bearerJsonHeaders', 'window.formatCouponInput');
  assert.match(helper, /Authorization:\s*'Bearer '\s*\+\s*idToken/u);

  const couponAdmin = section('window.adminCreateCoupons', 'window.updateAuthUI');
  assert.ok((couponAdmin.match(/headers:\s*bearerJsonHeaders\(token\)/gu) || []).length >= 7);
  assert.doesNotMatch(couponAdmin, /JSON\.stringify\([^\n]*idToken/u);
  assert.doesNotMatch(couponAdmin, /\{\s*idToken:\s*token/u);

  const refundAdmin = section('window.approveRefund', '// ===== ADMIN PAGE =====');
  assert.ok((refundAdmin.match(/headers:\s*bearerJsonHeaders\(idToken\)/gu) || []).length >= 2);
  assert.doesNotMatch(refundAdmin, /JSON\.stringify\([^\n]*idToken/u);

  const adminPost = section('async function adminPost', 'function adminSetMessage');
  assert.match(adminPost, /headers:\s*bearerJsonHeaders\(idToken\)/u);
  assert.match(adminPost, /body:\s*JSON\.stringify\(body\s*\|\|\s*\{\}\)/u);
  assert.doesNotMatch(adminPost, /JSON\.stringify\([^\n]*idToken/u);

  const creditHistory = section('window.loadAllCreditHistory', 'window.filterAdminHistory');
  assert.match(creditHistory, /headers:\s*bearerJsonHeaders\(idToken\)/u);
  assert.match(creditHistory, /JSON\.stringify\(\{\s*limit:\s*1000\s*\}\)/u);
  assert.doesNotMatch(creditHistory, /JSON\.stringify\([^\n]*idToken/u);
});

test('admin transport never places a credential in a URL or strips business payload fields', () => {
  const adminSurface = [
    section('window.adminCreateCoupons', 'window.updateAuthUI'),
    section('window.approveRefund', '// ===== ADMIN PAGE ====='),
    section('async function adminPost', 'function adminSetMessage'),
    section('window.loadAllCreditHistory', 'window.filterAdminHistory')
  ].join('\n');

  assert.doesNotMatch(adminSurface, /[?&]idToken=/u);
  assert.match(adminSurface, /\{\s*credits,\s*count\s*\}/u);
  assert.match(adminSurface, /\{\s*orderId,\s*kind\s*\}/u);
  assert.match(adminSurface, /\{\s*orderId,\s*rejectReason:\s*reason\.trim\(\),\s*kind\s*\}/u);
  assert.match(adminSurface, /\{\s*limit:\s*1000\s*\}/u);
});

test('user payment, referral, coupon, and analyze tokens stay out of JSON bodies', () => {
  const referral = section("fetch(window.apiUrl('/apply-referral')", "localStorage.removeItem('pendingRef')");
  const coupon = section('window.redeemCoupon', 'window.adminCreateCoupons');
  assert.match(referral, /Authorization:'Bearer '\+token/u);
  assert.match(referral, /JSON\.stringify\(\{ refCode:pendingRef \}\)/u);
  assert.doesNotMatch(referral, /idToken/u);
  assert.match(coupon, /Authorization: 'Bearer ' \+ token/u);
  assert.match(coupon, /JSON\.stringify\(\{ code \}\)/u);

  assert.match(appMain, /payload\.idToken \? \{ Authorization: 'Bearer ' \+ payload\.idToken \}/u);
  const analyzeBody = appMain.slice(appMain.indexOf("fetch(window.apiUrl('/analyze')"), appMain.indexOf('if (netErr)', appMain.indexOf("fetch(window.apiUrl('/analyze')")));
  assert.doesNotMatch(analyzeBody, /idToken:\s*payload\.idToken/u);

  assert.match(conversionFlow, /Authorization: 'Bearer ' \+ idToken/u);
  assert.doesNotMatch(conversionFlow, /JSON\.stringify\(\{ idToken:/u);
  assert.match(paymentCallbacks, /Authorization: 'Bearer ' \+ idToken/u);
  assert.doesNotMatch(paymentCallbacks, /idToken:\s*idToken/u);
});

test('event, subscription cancellation, and refund calls use bearer auth without JSON credentials', () => {
  assert.match(api, /function jsonHeadersWithBearer\(idToken\)/u);
  assert.ok((api.match(/headers:\s*jsonHeadersWithBearer\(idToken\)/gu) || []).length >= 2);
  assert.doesNotMatch(api, /payload\.idToken\s*=/u);

  const notifyEvent = section('async function gpNotifyEvent', 'window.gpNotifyEvent = gpNotifyEvent');
  assert.match(notifyEvent, /Authorization: 'Bearer ' \+ idToken/u);
  assert.match(notifyEvent, /JSON\.stringify\(\{ type, \.\.\.metaContext, \.\.\.\(data \|\| \{\}\) \}\)/u);
  assert.doesNotMatch(notifyEvent, /JSON\.stringify\([^\n]*idToken/u);

  const subscriptionCancel = section('window.cancelSubscription', 'function notifCreatedMs');
  assert.match(subscriptionCancel, /headers:\s*bearerJsonHeaders\(idToken\)/u);
  assert.match(subscriptionCancel, /body:\s*JSON\.stringify\(\{\}\)/u);
  assert.doesNotMatch(subscriptionCancel, /JSON\.stringify\([^\n]*idToken/u);

  const refundRequest = section('window.requestRefund', '// 관리자: 환불 요청 목록');
  assert.match(refundRequest, /headers:\s*bearerJsonHeaders\(idToken\)/u);
  assert.match(refundRequest, /JSON\.stringify\(\{ orderId, cancelReason, kind \}\)/u);
  assert.doesNotMatch(refundRequest, /JSON\.stringify\([^\n]*idToken/u);
});

test('no production JavaScript serializes Firebase idToken into JSON or a query string', async () => {
  const files = [
    'assets/js/api.js',
    'assets/js/app-main.js',
    'assets/js/app-module.js',
    'assets/js/conversion-flow.js',
    'assets/js/evasion-flow.js',
    'assets/js/payment-callbacks.js',
    'assets/js/writing-lab.js'
  ];
  const combined = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
  const serialized = jsonStringifyArguments(combined);
  assert.ok(serialized.length > 20, 'expected to inspect the production JSON request bodies');
  serialized.forEach(argument => assert.doesNotMatch(argument, /\bidToken\b/u));
  assert.doesNotMatch(combined, /(?:[?&]|searchParams\.(?:set|append)\([^,]+,)\s*['"]?idToken(?:=|['"])/iu);
});

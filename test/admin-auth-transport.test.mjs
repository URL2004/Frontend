import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'assets/js/app-module.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('admin JSON requests put Firebase credentials only in the Authorization header', () => {
  const helper = section('function adminBearerJsonHeaders', 'window.formatCouponInput');
  assert.match(helper, /Authorization:\s*'Bearer '\s*\+\s*idToken/u);

  const couponAdmin = section('window.adminCreateCoupons', 'window.updateAuthUI');
  assert.ok((couponAdmin.match(/headers:\s*adminBearerJsonHeaders\(token\)/gu) || []).length >= 7);
  assert.doesNotMatch(couponAdmin, /JSON\.stringify\([^\n]*idToken/u);
  assert.doesNotMatch(couponAdmin, /\{\s*idToken:\s*token/u);

  const refundAdmin = section('window.approveRefund', '// ===== ADMIN PAGE =====');
  assert.ok((refundAdmin.match(/headers:\s*adminBearerJsonHeaders\(idToken\)/gu) || []).length >= 2);
  assert.doesNotMatch(refundAdmin, /JSON\.stringify\([^\n]*idToken/u);

  const adminPost = section('async function adminPost', 'function adminSetMessage');
  assert.match(adminPost, /headers:\s*adminBearerJsonHeaders\(idToken\)/u);
  assert.match(adminPost, /body:\s*JSON\.stringify\(body\s*\|\|\s*\{\}\)/u);
  assert.doesNotMatch(adminPost, /JSON\.stringify\([^\n]*idToken/u);

  const creditHistory = section('window.loadAllCreditHistory', 'window.filterAdminHistory');
  assert.match(creditHistory, /headers:\s*adminBearerJsonHeaders\(idToken\)/u);
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

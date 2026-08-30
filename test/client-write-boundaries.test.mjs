import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

test('privileged client persistence is routed through authenticated server APIs', async () => {
  const source = await read('assets/js/app-module.js');
  const account = source.slice(source.indexOf('async function loadUser'), source.indexOf('function updateCreditUI'));
  const qna = source.slice(source.indexOf('window.submitQuestion'), source.indexOf('// ===== NOTICE ====='));
  const notifications = source.slice(source.indexOf('window.persistUserNotification'), source.indexOf('window.loadNotifications'));
  const history = source.slice(source.indexOf('const PENDING_HISTORY_KEY'), source.indexOf('function historyBillingInfo'));

  assert.match(account, /postAuthedJson\('\/account\/initialize'/u);
  assert.doesNotMatch(account, /setDoc\(uRef/u);

  assert.match(qna, /postAuthedJson\('\/qna\/create'/u);
  assert.match(qna, /postAuthedJson\('\/qna\/delete'/u);
  assert.match(qna, /postAuthedJson\('\/admin\/qna\/answer'/u);
  assert.match(qna, /postAuthedJson\('\/admin\/qna\/answer-delete'/u);
  assert.doesNotMatch(qna, /addDoc\(collection\(db,'qna'/u);
  assert.doesNotMatch(qna, /updateDoc\(doc\(db,'qna'/u);
  assert.doesNotMatch(qna, /deleteDoc\(doc\(db,'qna'/u);
  assert.doesNotMatch(qna, /notifyQnaAnswered/u);

  assert.match(notifications, /postAuthedJson\('\/notifications\/create-self'/u);
  assert.doesNotMatch(notifications, /setDoc\(/u);

  assert.match(history, /postAuthedJson\('\/history\/backup'/u);
  assert.match(history, /requestId/u);
  assert.doesNotMatch(history, /addDoc\(collection\(db,'users'/u);
});
test('credit checkout preclaims the authenticated order before Toss opens', async () => {
  const [main, callbacks] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/payment-callbacks.js')
  ]);
  const pay = main.slice(main.indexOf('async function payToss'), main.indexOf('window.payToss = payToss'));
  assert.match(pay, /window\.apiUrl\('\/prepare-payment'\)/u);
  assert.match(pay, /Authorization: 'Bearer ' \+ idToken/u);
  assert.ok(pay.indexOf("window.apiUrl('/prepare-payment')") < pay.indexOf("tp.requestPayment('카드'"));
  assert.doesNotMatch(pay, /successUrl:[^\n]*uid=/u);
  assert.doesNotMatch(callbacks, /customerEmail:\s*userEmail/u);
  assert.doesNotMatch(callbacks, /uid:\s*uid/u);
});

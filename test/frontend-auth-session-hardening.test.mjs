import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    dump() { return Object.fromEntries(values); }
  };
}

async function loadSessionSecurity({ session = {}, local = {}, user = null } = {}) {
  const source = await read('assets/js/session-security.js');
  const sessionStorage = storage(session);
  const localStorage = storage(local);
  const window = { CU: user };
  vm.runInNewContext(source, { window, sessionStorage, localStorage, Object, String, Boolean, JSON });
  return { api: window.gpSessionSecurity, window, sessionStorage, localStorage };
}

test('guest drafts are claimed by the first login but never cross between two accounts', async () => {
  const draft = JSON.stringify({ ownerUid: 'guest', notes: 'private draft' });
  const fixture = await loadSessionSecurity({
    session: { gp_writing_lab_v2_draft: draft }
  });

  const first = fixture.api.bindUser('uid-a');
  assert.equal(first.previous, 'guest');
  assert.equal(JSON.parse(fixture.sessionStorage.getItem('gp_writing_lab_v2_draft')).ownerUid, 'uid-a');

  fixture.window.CU = { uid: 'uid-a' };
  fixture.sessionStorage.setItem('gp_pending_paid_job_v1', JSON.stringify({ ownerUid: 'uid-a', payload: 'original' }));
  fixture.localStorage.setItem('lavJobRef', JSON.stringify({ ownerUid: 'uid-a', jobId: 'job-a' }));
  fixture.localStorage.setItem('paid_order-a', 'marker');
  fixture.api.bindUser('uid-b');

  assert.equal(fixture.sessionStorage.getItem('gp_pending_paid_job_v1'), null);
  assert.equal(fixture.localStorage.getItem('lavJobRef'), null);
  assert.equal(fixture.localStorage.getItem('paid_order-a'), null);
});

test('logout clears sensitive recovery state while leaving OAuth state available for its one-time callback', async () => {
  const fixture = await loadSessionSecurity({
    session: {
      gp_session_owner_uid_v1: 'uid-a',
      gp_pending_paid_job_v1: JSON.stringify({ ownerUid: 'uid-a' }),
      gp_kakao_oauth_state_v1: JSON.stringify({ value: 'a'.repeat(48), createdAt: Date.now() })
    },
    local: { gp_pending_history: JSON.stringify([{ uid: 'uid-a', data: { inputText: 'private' } }]) },
    user: { uid: 'uid-a' }
  });

  fixture.api.bindUser('');
  assert.equal(fixture.sessionStorage.getItem('gp_pending_paid_job_v1'), null);
  assert.equal(fixture.localStorage.getItem('gp_pending_history'), null);
  assert.ok(fixture.sessionStorage.getItem('gp_kakao_oauth_state_v1'));
});

test('all text-bearing recovery paths require an owner and the loader installs the guard first', async () => {
  const [boot, conversion, writing, evasion, app] = await Promise.all([
    read('assets/js/app-boot.js'),
    read('assets/js/conversion-flow.js'),
    read('assets/js/writing-lab.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js')
  ]);
  assert.ok(boot.indexOf("loadScript('/assets/js/session-security.js')") < boot.indexOf("loadScript('/assets/js/conversion-flow.js')"));
  assert.match(conversion, /gpSessionSecurity\.tag\(value\)/u);
  assert.match(conversion, /gpSessionSecurity\.owns\(pending\)/u);
  assert.ok((writing.match(/gpSessionSecurity\.tag\(/gu) || []).length >= 3);
  assert.ok((writing.match(/gpSessionSecurity\.owns\(/gu) || []).length >= 3);
  assert.match(evasion, /gpSessionSecurity\.tag\(value\)/u);
  assert.match(evasion, /gpSessionSecurity\.owns\(ref\)/u);
  assert.match(app, /gpSessionSecurity\.clearSensitive\(\)[\s\S]{0,180}?signOut\(auth\)/u);
});

test('account deletion reauthenticates the same social account and sends the fresh token only in Authorization', async () => {
  const source = await read('assets/js/app-module.js');
  const deleteFlow = source.slice(source.indexOf('window.deleteAccount = async'), source.indexOf('window.showReferralPopup'));
  assert.match(source, /reauthenticateWithPopup\(user, provider\)/u);
  assert.match(source, /requestFreshKakaoAccessToken/u);
  assert.match(source, /expectedUid: user\.uid/u);
  assert.ok(source.indexOf('data.uid !== options.expectedUid') < source.indexOf('signInWithCustomToken(auth, data.customToken)'));
  assert.match(deleteFlow, /reauthenticatedUser\.getIdToken\(true\)/u);
  assert.match(deleteFlow, /'Authorization': 'Bearer ' \+ idToken/u);
  assert.doesNotMatch(deleteFlow, /body: JSON\.stringify\(\{ idToken \}\)/u);
  assert.match(deleteFlow, /구독 상태를 확인하지 못해 탈퇴를 중단/u);
});

test('Kakao redirect login binds the code with PKCE and scrubs it before asynchronous work', async () => {
  const source = await read('assets/js/app-module.js');
  const authorize = source.slice(source.indexOf('window.kakaoRedirectLogin = async'), source.indexOf('function waitForKakaoSdk'));
  const callback = source.slice(source.indexOf('window.handleKakaoCallback = async'), source.indexOf('window.kakaoLogin = async'));
  assert.match(authorize, /code_challenge/u);
  assert.match(authorize, /code_challenge_method', 'S256'/u);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/u);
  assert.match(callback, /code_verifier: verifier/u);
  assert.ok(callback.indexOf('clearKakaoCallbackQuery();') < callback.indexOf("fetch('https://kauth.kakao.com/oauth/token'"));
  assert.ok(callback.indexOf('clearKakaoCallbackQuery();') < callback.indexOf('beginAuthTransition('));
});

test('strict CSP is observation-only and App Check is intentionally not enabled in the frontend', async () => {
  const [vercel, boot, app] = await Promise.all([
    read('vercel.json'),
    read('assets/js/app-boot.js'),
    read('assets/js/app-module.js')
  ]);
  const config = JSON.parse(vercel);
  const headers = new Map(config.headers[0].headers.map(item => [item.key, item.value]));
  assert.match(headers.get('Content-Security-Policy-Report-Only'), /default-src 'self'/u);
  assert.match(
    headers.get('Content-Security-Policy-Report-Only'),
    /frame-src[^;]*https:\/\/url88-d1d27\.firebaseapp\.com/u,
    'Firebase Google 로그인 iframe 도메인은 report-only CSP에도 명시돼야 한다.'
  );
  assert.equal(headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert.doesNotMatch(boot + app, /initializeAppCheck|ReCaptchaEnterpriseProvider|X-Firebase-AppCheck/u);
});

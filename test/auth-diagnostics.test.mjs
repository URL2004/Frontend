import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs.readFileSync(new URL('../assets/js/auth-diagnostics.js', import.meta.url), 'utf8');
function fixture({ store = new Map(), blocked = false, internal = false, now = Date.now(), gaReady = true } = {}) {
  const ga = [], sent = [], listeners = {};
  const window = { crypto: webcrypto, location: { pathname: '/' }, gpAnalyticsInternal: internal,
    apiUrl: x => 'https://api.example.test' + x, GP_BUILD_VERSION: 'test-build',
    gpAttribution: { getLastTouch: () => ({ source: 'naver', medium: 'cpc' }) },
    fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true }; },
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  if (gaReady) window.gpTrack = (...args) => ga.push(args);
  const sessionStorage = { getItem: k => { if (blocked) throw Error('blocked'); return store.get(k) || null; },
    setItem: (k, v) => { if (blocked) throw Error('blocked'); store.set(k, v); }, removeItem: k => store.delete(k) };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { window, sessionStorage, navigator: { userAgent: 'Mozilla/5.0 (iPhone) Safari/605', maxTouchPoints: 5 }, Date: Clock });
  return { api: window.gpAuthDiagnostics, ga, sent, window, listeners, store };
}
test('an auth attempt emits one start and one terminal; retries have new IDs', () => {
  const f = fixture(); const a = f.api.start('google', 'popup');
  f.api.stage(a, 'popup');
  assert.equal(f.api.finish(a, 'error', { code: 'auth/popup-blocked', message: 'secret@example.com token' }), true);
  assert.equal(f.api.finish(a, 'success'), false);
  assert.deepEqual(f.ga.map(x => x[0]), ['login_start', 'login_error']);
  assert.equal(f.sent[0].attempt_id, f.sent[1].attempt_id);
  assert.equal(f.sent[1].error_code, 'auth/popup-blocked');
  assert.equal(f.sent[1].device, 'mobile');
  assert.equal(JSON.stringify(f.sent).includes('secret'), false);
  assert.notEqual(f.api.start('google', 'popup').id, a.id);
});
test('redirect survives reload, includes stage, and repeated callbacks do not duplicate success', () => {
  const f = fixture(); const a = f.api.start('kakao', 'redirect');
  const next = fixture({ store: f.store }); const resumed = next.api.resume('kakao');
  assert.equal(resumed.id, a.id);
  next.api.stage(resumed, 'token_exchange'); next.api.finish(resumed, 'success');
  const repeated = fixture({ store: f.store });
  assert.equal(repeated.api.finish(repeated.api.resume('kakao'), 'success'), false);
  assert.equal(repeated.sent.length, 0);
});
test('expired callbacks are orphan observations, storage and network failure never prevent login', () => {
  const f = fixture({ now: 1000000 }); const a = f.api.start('kakao', 'redirect');
  const late = fixture({ store: f.store, now: 1600001 }); const b = late.api.resume('kakao');
  assert.notEqual(b.id, a.id); late.api.finish(b, 'error', 'oauth_state_invalid');
  assert.deepEqual(late.sent.map(x => x.outcome), ['error']);
  const blocked = fixture({ blocked: true });
  blocked.window.fetch = () => { throw Error('offline'); };
  assert.doesNotThrow(() => blocked.api.finish(blocked.api.start('google', 'popup'), 'success'));
});
test('unknown provider exceptions are classified without exporting their content', () => {
  const f = fixture(); const a = f.api.start('kakao', 'popup'); f.api.stage(a, 'backend_exchange');
  f.api.finish(a, 'error', { code: 'private-token-value', message: 'raw text' });
  assert.equal(f.sent[1].error_code, 'unknown');
  assert.equal(f.sent[1].stage, 'backend_exchange');
  assert.equal(JSON.stringify(f.sent).includes('private-token-value'), false);
});
test('admin exclusion and delayed analytics initialization preserve event semantics', () => {
  const admin = fixture({ internal: true }); admin.api.finish(admin.api.start('google'), 'success');
  assert.equal(admin.sent.length, 0); assert.equal(admin.ga.length, 0);
  const late = fixture({ gaReady: false }); late.api.finish(late.api.start('google'), 'cancel', 'auth/popup-closed-by-user');
  late.window.gpTrack = (...args) => late.ga.push(args); late.listeners['gp:attribution-ready'](); late.listeners['gp:attribution-ready']();
  assert.deepEqual(late.ga.map(x => x[0]), ['login_start', 'login_cancel']);
});
test('payment diagnostics link order IDs and emit exactly one cancellation', () => {
  const api = fs.readFileSync(new URL('../assets/js/api.js', import.meta.url), 'utf8');
  const events = [];
  const window = { location: { pathname: '/' }, gpTrack: (...args) => events.push(args), addEventListener() {} };
  vm.runInNewContext(api, { window, localStorage: { getItem: () => 'naver' } });
  window.gpTrackPaymentError('request_payment_failed', { orderId: 'order_test', amount: 2900 }, { code: 'USER_CANCEL' });
  assert.equal(events.length, 1); assert.equal(events[0][0], 'checkout_cancel');
  assert.equal(events[0][1].transaction_id, 'order_test');
  assert.equal(events[0][1].checkout_linked, 1);
  window.gpTrackPaymentError('request_payment_failed', { orderId: 'retry', amount: 2900 }, { code: 'NETWORK_ERROR' });
  assert.equal(events[1][0], 'checkout_error');
  window.gpTrackPaymentError('confirm_failed', { orderId: 'confirm', amount: 2900 }, { code: 'NETWORK_ERROR' });
  assert.equal(events[2][0], 'payment_error');
});

test('Google user-cancelled follows the cancellation transition without an operational error', async () => {
  const module = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
  const handler = module.slice(module.indexOf('window.googleLogin = async'), module.indexOf('window.openExternal ='));
  const f = fixture(); const states = [];
  f.window.gpReportClientError = () => assert.fail('User cancellation is not a technical failure');
  vm.runInNewContext(handler, { window: f.window, navigator: { userAgent: 'Chrome' }, auth: {}, provider: {},
    signInWithPopup: async () => { throw { code: 'auth/user-cancelled' }; },
    setSocialLoginControls: busy => states.push(busy), finishAuthTransition: outcome => states.push(outcome) });
  await f.window.googleLogin();
  assert.deepEqual(f.ga.map(x => x[0]), ['login_start', 'login_cancel']);
  assert.equal(f.sent[1].error_code, 'auth/user-cancelled');
  assert.equal(states.at(-1), 'cancel');
});

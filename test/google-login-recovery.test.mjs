import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const boot = fs.readFileSync(new URL('../assets/js/app-boot.js', import.meta.url), 'utf8');
const moduleCode = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
test('production CSP permits the Firebase Google popup bootstrap script', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = config.headers.find(rule => rule.source === '/(.*)').headers;
  for (const name of ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']) {
    const policy = headers.find(header => header.key === name).value;
    const scripts = policy.split(';').map(x => x.trim()).find(x => x.startsWith('script-src ')).split(/\s+/);
    assert.ok(scripts.includes('https://apis.google.com'), name + ' must permit Google API bootstrap');
    assert.ok(scripts.includes('https://www.gstatic.com'), name + ' must permit Firebase SDK');
    assert.ok(!scripts.includes('*'));
  }
});
function bootFixture({ loaded, active = false }) {
  let calls = 0;
  const buttons = [{ disabled: false, setAttribute() {}, removeAttribute() {} }, { disabled: false, setAttribute() {}, removeAttribute() {} }];
  const status = { hidden: true }, label = {};
  const window = {};
  const login = async () => { calls++; };
  if (loaded) window.googleLogin = login;
  const context = { window, navigator: { userActivation: { isActive: active } }, document: { getElementById(id) { return ({ googleLoginBtn: buttons[0], kakaoLoginBtn: buttons[1], socialLoginStatus: status, socialLoginStatusText: label })[id]; } }, loadAppAssets: async () => { window.googleLogin = login; } };
  vm.runInNewContext(boot.slice(boot.indexOf('  var socialLoginRequestPromise = null;'), boot.indexOf('  window.gpEnsureWritingLab')), context);
  return { window, buttons, label, calls: () => calls };
}
test('expired activation after lazy loading waits for a new click and releases controls', async () => {
  const f = bootFixture({ loaded: false });
  await f.window.gpRequestSocialLogin('google');
  assert.equal(f.calls(), 0);
  assert.equal(f.buttons[0].disabled, false);
  assert.match(f.label.textContent, /한 번 더/);
  await f.window.gpRequestSocialLogin('google');
  assert.equal(f.calls(), 1);
});
test('ready Google handler runs immediately on the original click', async () => {
  const f = bootFixture({ loaded: true, active: true });
  const pending = f.window.gpRequestSocialLogin('google');
  assert.equal(f.calls(), 1);
  await pending;
});
test('direct app routes provide home navigation without landing.js', () => {
  const f = bootFixture({ loaded: true });
  const calls = [];
  f.window.showScreen = x => calls.push(x);
  f.window.switchTab = x => calls.push(x);
  f.window.gpLandingBackHome();
  assert.deepEqual(calls, ['app', 'main']);
});
test('Google popup failures provide recovery and operations reporting; cancellations remain quiet', async () => {
  for (const code of ['auth/popup-blocked', 'auth/network-request-failed', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
    const reports = [], toasts = [], events = [];
    const window = { gpTrack: (...x) => events.push(x), gpReportClientError: x => reports.push(x), gpToast: x => toasts.push(x) };
    const context = { window, navigator: { userAgent: 'Chrome' }, auth: {}, provider: {}, setSocialLoginControls() {}, finishAuthTransition() {}, signInWithPopup: async () => { throw { code }; } };
    vm.runInNewContext(moduleCode.slice(moduleCode.indexOf('window.googleLogin ='), moduleCode.indexOf('window.openExternal =')), context);
    await window.googleLogin();
    const canceled = code.includes('closed-by-user') || code.includes('cancelled');
    assert.equal(reports.length, canceled ? 0 : 1);
    assert.equal(toasts.length, canceled ? 0 : 1);
    assert.equal(events.at(-1)[0], canceled ? 'login_cancel' : 'login_error');
    if (!canceled) assert.ok(reports[0].message.includes(code));
  }
});

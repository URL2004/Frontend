import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const moduleSource = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const bootSource = fs.readFileSync(new URL('../assets/js/app-boot.js', import.meta.url), 'utf8');
function referral(getDoc) {
  const notices = [], overlays = [];
  const context = { CU: { uid: 'example-user' }, getDoc, doc: (...a) => a, db: {}, URL, setTimeout,
    window: { APP_CONFIG: { SITE_URL: 'https://example.test' }, location: { origin: 'https://example.test' }, gpToast: m => notices.push(m) },
    document: { getElementById: () => overlays[0], body: { appendChild: el => overlays.push(el) },
      createElement: () => ({ setAttribute() {}, style: {}, addEventListener() {}, querySelector() { return null; } }) } };
  vm.runInNewContext(moduleSource.slice(moduleSource.indexOf('let referralPopupPending'), moduleSource.indexOf('// 보안: credits/plan')), context);
  return { context, notices, overlays, run: context.window.showReferralPopup };
}
test('missing referral document and read failure are visible and retryable', async () => {
  let mode = 0;
  const h = referral(async () => { if (mode === 1) throw Error('offline'); return { exists: () => mode === 2, data: () => ({ refCode: 'safe1234' }) }; });
  await h.run(); mode = 1; await h.run();
  assert.equal(h.notices.length, 2); assert.equal(h.overlays.length, 0);
  mode = 2; await h.run(); assert.equal(h.overlays.length, 1);
});
test('concurrent invitation clicks read once and old-session completion cannot render', async () => {
  let release, reads = 0;
  const h = referral(() => { reads++; return new Promise(r => { release = r; }); });
  const first = h.run(); await h.run(); assert.equal(reads, 1);
  h.context.CU = { uid: 'another-user' };
  release({ exists: () => true, data: () => ({ refCode: 'safe1234' }) }); await first;
  assert.equal(h.overlays.length, 0); assert.equal(h.notices.length, 0);
});
function newSentence(loadAppAssets) {
  const notices = [];
  const context = { loadAppAssets, window: { gpToast: m => notices.push(m) } };
  vm.runInNewContext(bootSource.slice(bootSource.indexOf('  var newSentenceRequestPromise'), bootSource.indexOf('  var socialLoginRequestPromise')), context);
  return { window: context.window, notices, run: context.window.gpRequestNewSentence };
}
test('new sentence waits for full initialization, coalesces clicks, and preserves active-job guard', async () => {
  let release, cleared = 0, checked = 0;
  const h = newSentence(() => new Promise(r => { release = r; }));
  h.window.lavNewSentence = () => { if (h.window.lavPrepareNewSentence() !== false) cleared++; };
  const pending = h.run(); const duplicate = h.run(); assert.equal(cleared, 0);
  h.window.lavPrepareNewSentence = () => { checked++; return false; }; release();
  await Promise.all([pending, duplicate]); assert.equal(checked, 1); assert.equal(cleared, 0);
});
test('boot failure and missing handlers preserve text and allow another explicit attempt', async () => {
  let fails = true, cleared = 0;
  const h = newSentence(async () => { if (fails) throw Error('offline'); });
  await h.run(); fails = false; await h.run(); assert.equal(h.notices.length, 2);
  h.window.lavPrepareNewSentence = () => true; h.window.lavNewSentence = () => { cleared++; };
  await h.run(); assert.equal(cleared, 1);
});

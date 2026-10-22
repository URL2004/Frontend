import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const boot = fs.readFileSync(new URL('../assets/js/app-boot.js', import.meta.url), 'utf8');
const source = boot.slice(0, boot.indexOf('\n(function () {'));
const storage = () => { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; };
const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
function load({ local = storage(), session = storage(), search = '?ref=friend01' } = {}) {
  const window = { localStorage: local, sessionStorage: session, location: { search } };
  vm.runInNewContext(source, { window, URLSearchParams });
  return { api: window.gpReferralContext, window, local, session };
}
test('referral survives navigation before app initialization and unavailable browser storage', () => {
  for (const options of [{}, { local: blocked }, { local: blocked, session: blocked }]) {
    const h = load(options); h.window.location.search = ''; h.api.capture();
    assert.equal(h.api.claim('owner').code, 'friend01');
  }
});
test('pending retries stay attached to the first account across reloads', () => {
  const h = load(), ticket = h.api.claim('owner');
  assert.equal(h.api.claim('other'), null);
  const reloaded = load(h);
  assert.equal(reloaded.api.claim('other'), null);
  assert.equal(reloaded.api.claim('owner').code, ticket.code);
  reloaded.api.complete(ticket);
  assert.equal(load({ ...h, search: '' }).api.claim('owner'), null);
});
test('late success cannot remove a newer referral, and completion is not recaptured by module initialization', () => {
  const h = load(), ticket = h.api.claim('owner');
  h.window.location.search = '?ref=friend02'; h.api.capture();
  h.api.complete(ticket);
  const next = h.api.claim('owner'); assert.equal(next.code, 'friend02');
  h.api.complete(next); h.api.capture(); assert.equal(h.api.claim('owner'), null);
});
test('legacy codes migrate, malformed input and expired records never reach the API', () => {
  const local = storage(); local.setItem('pendingRef', 'legacy01');
  const h = load({ local, search: '' }); assert.equal(h.api.claim('owner').code, 'legacy01');
  assert.equal(local.getItem('pendingRef'), null);
  for (const search of ['?ref=short', '?ref=%3Cscript%3E', '?ref=abc%20defg']) assert.equal(load({ search }).api.claim('owner'), null);
  local.setItem('gp_pending_referral_v1', JSON.stringify({ code:'expired1',uid:'',at:Date.now()-31*86400000 }));
  assert.equal(load({ local, search:'' }).api.claim('owner'), null);
});
test('a readable but write-disabled local store cannot hide the newly captured session value', () => {
  const stale = JSON.stringify({ code:'oldcode1', uid:'', at:Date.now() });
  const local = { getItem: k => k === 'gp_pending_referral_v1' ? stale : null,
    setItem() { throw Error('quota'); }, removeItem() {} };
  const h = load({ local });
  const ticket = h.api.claim('owner');
  assert.equal(ticket.code, 'friend01');
  const next = load({ ...h, search: '' });
  assert.equal(next.api.claim('owner').code, 'friend01');
  next.api.complete(ticket);
  assert.equal(load({ ...h, search: '' }).api.claim('owner'), null);
});
test('unknown queue time is not displayed as an immediate start', () => {
  const flow = fs.readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
  const c = {}; vm.runInNewContext(flow.slice(flow.indexOf('  function lavQueueWaitText('), flow.indexOf('  function renderQueuedState(')), c);
  assert.equal(c.lavQueueWaitText(null), '확인 중');
  assert.equal(c.lavQueueWaitText(undefined), '확인 중');
  assert.equal(c.lavQueueWaitText(15), '곧 시작');
  assert.equal(c.lavQueueWaitText(600), '약 10분');
});

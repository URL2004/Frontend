import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const trackingSource = fs.readFileSync(path.join(root, 'assets', 'js', 'head-tracking.js'), 'utf8');

function loadTracking(url) {
  const parsed = new URL(url);
  const store = new Map();
  const calls = { inflow: [], pageView: 0, conversions: [] };
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  const window = {
    APP_CONFIG: {
      APP_ENV: 'production',
      NAVER_COMMON_KEY: 's_3d19465b3633',
      NAVER_COOKIE_DOMAIN: 'gpkorea.ai.kr'
    },
    location: {
      href: parsed.href,
      origin: parsed.origin,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search
    },
    wcs: {
      inflow(domain) { calls.inflow.push(domain); },
      trans(event) { calls.conversions.push({ ...event }); }
    },
    wcs_do() { calls.pageView += 1; }
  };
  const document = {
    cookie: '',
    referrer: '',
    title: '교수님 피하기',
    createElement() { return {}; },
    getElementsByTagName() { return []; },
    head: { appendChild() {} }
  };
  const context = { window, document, localStorage, URL, URLSearchParams, Date, JSON, String, Object, Array, Number, Math, encodeURIComponent, decodeURIComponent };
  vm.runInNewContext(trackingSource, context);
  return { window, calls };
}

test('발급된 네이버 공통키로 유입 쿠키와 PV를 한 번만 초기화한다', () => {
  const { window, calls } = loadTracking('https://gpkorea.ai.kr/?lp=1&utm_source=naver&NaPm=test');
  assert.equal(window.gpNaverInitialize(), true);
  assert.equal(window.gpNaverInitialize(), true);
  assert.equal(window.wcs_add.wa, 's_3d19465b3633');
  assert.deepEqual(calls.inflow, ['gpkorea.ai.kr']);
  assert.equal(calls.pageView, 1);
});

test('가입·기능 완료·결제를 wcs.trans 전환 유형으로 구분한다', () => {
  const { window, calls } = loadTracking('https://gpkorea.ai.kr/?utm_source=naver');
  window.gpNaverInitialize();
  window.gpTrack('sign_up', { method: 'google' });
  window.gpTrack('detect_run', { chars: 800 });
  window.gpTrack('humanize_run', { chars: 1200 });
  window.gpTrack('purchase', { transaction_id: 'order-1', value: 9900, currency: 'KRW' });
  assert.deepEqual(calls.conversions.map(event => event.type), ['sign_up', 'custom001', 'custom002', 'purchase']);
  assert.deepEqual(calls.conversions.at(-1), {
    type: 'purchase', id: 'order-1', value: '9900', currency: 'KRW'
  });
});

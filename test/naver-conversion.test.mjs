import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const trackingSource = fs.readFileSync(path.join(root, 'assets', 'js', 'head-tracking.js'), 'utf8');

function loadTracking(url, options = {}) {
  const parsed = new URL(url);
  const store = new Map();
  const calls = { inflow: [], pageView: 0, conversions: [], ensure: 0 };
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
    gpEnsureNaverTracking() { calls.ensure += 1; }
  };
  if (options.wcs !== false) {
    window.wcs = {
      inflow(domain) { calls.inflow.push(domain); },
      trans(event) { calls.conversions.push({ ...event }); }
    };
    window.wcs_do = function () { calls.pageView += 1; };
  }
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

test('네이버 SDK가 늦게 준비되어도 구매 전환을 보관했다가 한 번만 전송한다', () => {
  const { window, calls } = loadTracking('https://gpkorea.ai.kr/?utm_source=naver&NaPm=test', { wcs: false });
  const metaEventId = window.gpTrack('purchase', {
    transaction_id: 'order-delayed',
    value: 8700,
    currency: 'KRW',
    items: [{ item_id: 'light', item_name: '라이트 "상품"', quantity: 1, price: 8700 }]
  });
  assert.match(metaEventId, /^gp_purchase_/u);
  let status = window.gpNaverTrackingStatus();
  assert.equal(status.initialized, false);
  assert.equal(status.pending, 1);
  assert.equal(calls.ensure, 1);

  window.wcs = {
    inflow(domain) { calls.inflow.push(domain); },
    trans(event) { calls.conversions.push({ ...event }); }
  };
  window.wcs_do = function () { calls.pageView += 1; };
  assert.equal(window.gpNaverInitialize(), true);
  status = window.gpNaverTrackingStatus();
  assert.equal(status.initialized, true);
  assert.equal(status.pending, 0);
  assert.equal(calls.conversions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.conversions[0])), {
    type: 'purchase',
    id: 'order-delayed',
    value: '8700',
    currency: 'KRW',
    items: [{ id: 'light', name: '라이트 상품', quantity: 1, payAmount: 8700 }]
  });
  window.gpNaverInitialize();
  assert.equal(calls.conversions.length, 1);
});

test('추적 모듈은 가입·결제 콜백보다 먼저 로드된다', () => {
  const boot = fs.readFileSync(path.join(root, 'assets', 'js', 'app-boot.js'), 'utf8');
  const trackingIndex = boot.indexOf("loadScript('/assets/js/head-tracking.js')");
  const appModuleIndex = boot.indexOf("loadScript('/assets/js/app-module.js'");
  const paymentIndex = boot.indexOf("loadScript('/assets/js/payment-callbacks.js'");
  assert.ok(trackingIndex >= 0);
  assert.ok(trackingIndex < appModuleIndex);
  assert.ok(trackingIndex < paymentIndex);
});

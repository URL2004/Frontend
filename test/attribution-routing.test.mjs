import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const trackingSource = fs.readFileSync(path.join(root, 'assets', 'js', 'head-tracking.js'), 'utf8');

function storageFor(map) {
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function loadTracking(url, store, referrer = '') {
  const parsed = new URL(url);
  const localStorage = storageFor(store);
  const window = {
    APP_CONFIG: {},
    location: {
      href: parsed.href,
      origin: parsed.origin,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search
    }
  };
  const document = {
    referrer,
    title: 'test',
    createElement() { return {}; },
    head: { appendChild() {} }
  };
  const context = { window, document, localStorage, URL, URLSearchParams, Date, JSON, String, Object, encodeURIComponent };
  vm.runInNewContext(trackingSource, context);
  return window;
}

test('네이버 유입의 전체 UTM과 NaPm을 first/last touch로 보존한다', () => {
  const store = new Map();
  const paid = loadTracking(
    'https://gpkorea.ai.kr/?mode=detect&utm_source=naver&utm_medium=cpc&utm_campaign=detector_core&utm_content=responsive_a&utm_term=AI%EA%B2%80%EC%82%AC%EA%B8%B0&NaPm=test-token',
    store
  );
  const paidSnapshot = paid.gpAttribution.snapshot();
  assert.equal(paidSnapshot.first_touch.source, 'naver');
  assert.equal(paidSnapshot.last_touch.medium, 'cpc');
  assert.equal(paidSnapshot.last_touch.campaign, 'detector_core');
  assert.equal(paidSnapshot.last_touch.content, 'responsive_a');
  assert.equal(paidSnapshot.last_touch.term, 'AI검사기');
  assert.equal(paidSnapshot.last_touch.napm, 'test-token');

  const callback = loadTracking('https://gpkorea.ai.kr/?credits=330&plan=starter', store);
  const callbackSnapshot = callback.gpAttribution.snapshot();
  assert.equal(callbackSnapshot.first_touch.source, 'naver');
  assert.equal(callbackSnapshot.last_touch.source, 'naver');
  assert.equal(callbackSnapshot.last_touch.campaign, 'detector_core');
  assert.equal(store.get('traffic_source'), 'naver');
});

test('first touch는 고정하고 새 캠페인 방문만 last touch를 갱신한다', () => {
  const store = new Map();
  loadTracking('https://gpkorea.ai.kr/', store);
  const meta = loadTracking(
    'https://gpkorea.ai.kr/?mode=humanize&utm_source=meta&utm_medium=paid_social&utm_campaign=humanizer',
    store
  );
  const snapshot = meta.gpAttribution.snapshot();
  assert.equal(snapshot.first_touch.source, 'direct');
  assert.equal(snapshot.last_touch.source, 'meta');
  assert.equal(snapshot.last_touch.medium, 'paid_social');
  assert.equal(snapshot.last_touch.campaign, 'humanizer');
});

test('광고 랜딩 모드는 레거시와 라벤더 컴포저를 함께 전환한다', () => {
  const appMain = fs.readFileSync(path.join(root, 'assets', 'js', 'app-main.js'), 'utf8');
  const evasion = fs.readFileSync(path.join(root, 'assets', 'js', 'evasion-flow.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'pages', 'main.html'), 'utf8');
  const detectReport = fs.readFileSync(path.join(root, 'pages', 'detect-report.html'), 'utf8');
  assert.match(appMain, /function productModeFromUrl\(\)/u);
  assert.match(appMain, /params\.get\('mode'\)/u);
  assert.match(appMain, /setMode\(normalized\)/u);
  assert.match(appMain, /window\.lavSetMode\(normalized, \{ skipUrl: true \}\)/u);
  assert.match(appMain, /if \(routeTab === 'main'\) applyLandingProductMode\(\)/u);
  assert.match(evasion, /window\.gpSyncProductModeUrl\(m\)/u);
  assert.match(main, /onclick="gpApplyProductMode\('detect'\)"/u);
  assert.match(main, /onclick="gpApplyProductMode\('humanize'\)"/u);
  assert.equal(detectReport.match(/openProductMode\('detect'\)/gu)?.length, 2);
});

test('회원가입 뒤에도 유입정보를 삭제하지 않고 가입 원본을 저장한다', () => {
  const moduleSource = fs.readFileSync(path.join(root, 'assets', 'js', 'app-module.js'), 'utf8');
  assert.match(moduleSource, /signupAttribution/u);
  assert.match(moduleSource, /window\.gpAttribution\.snapshot\(\)/u);
  assert.doesNotMatch(moduleSource, /localStorage\.removeItem\('traffic_source'\)/u);
});

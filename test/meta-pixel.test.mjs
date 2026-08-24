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
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
  const firstScript = { parentNode: { insertBefore() {} } };
  const window = {
    APP_CONFIG: {
      APP_ENV: 'production',
      META_PIXEL_ID: '1575815300659999'
    },
    location: {
      href: parsed.href,
      origin: parsed.origin,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search
    }
  };
  const document = {
    referrer: '',
    title: '교수님 피하기',
    createElement() { return {}; },
    getElementsByTagName() { return [firstScript]; },
    head: { appendChild() {} }
  };
  const context = { window, document, localStorage, URL, URLSearchParams, Date, JSON, String, Object, Array, Number, Math, encodeURIComponent };
  vm.runInNewContext(trackingSource, context);
  return window;
}

function queued(window, command, eventName) {
  return window.fbq.queue.filter(args => args[0] === command && args[1] === eventName);
}

test('Meta Pixel을 초기화하고 SPA PageView를 중복 없이 전송한다', () => {
  const window = loadTracking('https://gpkorea.ai.kr/?utm_source=meta&utm_medium=paid_social&utm_campaign=conversion_core');
  assert.equal(queued(window, 'init', '1575815300659999').length, 1);
  window.gpTrackPageView('main', '교수님 피하기', window.location.href);
  window.gpTrackPageView('main', '교수님 피하기', window.location.href);
  const events = queued(window, 'track', 'PageView');
  assert.equal(events.length, 1);
  assert.equal(events[0][2].traffic_source, 'meta');
  assert.equal(events[0][2].traffic_campaign, 'conversion_core');
});

test('가입·결제는 Meta 표준 이벤트로 매핑하고 입력 원문은 보내지 않는다', () => {
  const window = loadTracking('https://gpkorea.ai.kr/?utm_source=meta');
  window.gpTrack('sign_up', { method: 'google' });
  window.gpTrack('purchase', {
    transaction_id: 'order-test',
    value: 9900,
    currency: 'KRW',
    items: [{ item_id: 'credits_100', quantity: 1, price: 9900 }],
    input_text: '전송하면 안 되는 원문'
  });
  const signup = queued(window, 'track', 'CompleteRegistration');
  const purchase = queued(window, 'track', 'Purchase');
  assert.equal(signup.length, 1);
  assert.equal(signup[0][2].method, 'google');
  assert.equal(purchase.length, 1);
  assert.equal(purchase[0][2].value, 9900);
  assert.equal(purchase[0][2].currency, 'KRW');
  assert.equal(purchase[0][2].contents[0].id, 'credits_100');
  assert.equal('input_text' in purchase[0][2], false);
});

test('AI 감지와 휴머나이징 완료는 분리된 맞춤 이벤트로 전송한다', () => {
  const window = loadTracking('https://gpkorea.ai.kr/?utm_source=meta');
  window.gpTrack('detect_run', { chars: 1200 });
  window.gpTrack('humanize_run', { chars: 900, mode: 'assignment' });
  const detect = queued(window, 'trackCustom', 'DetectComplete');
  const humanize = queued(window, 'trackCustom', 'HumanizeComplete');
  assert.equal(detect.length, 1);
  assert.equal(detect[0][2].analysis_mode, 'detect');
  assert.equal(humanize.length, 1);
  assert.equal(humanize[0][2].analysis_mode, 'humanize');
  assert.equal(humanize[0][2].humanize_mode, 'assignment');
});

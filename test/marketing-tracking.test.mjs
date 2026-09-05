import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/head-tracking.js', import.meta.url), 'utf8');
function load(url = 'https://gpkorea.ai.kr/', { store = new Map(), referrer = '' } = {}) {
  const location = new URL(url);
  const scripts = [];
  const window = { APP_CONFIG: { GA_MEASUREMENT_ID: 'G-TEST', META_PIXEL_ID: '1575815300659999' }, location };
  const document = { referrer, title: 'Test', cookie: '', createElement: () => ({}), getElementsByTagName: () => [], head: { appendChild: script => scripts.push(script) } };
  const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  vm.runInNewContext(source, { window, document, localStorage, URL, URLSearchParams });
  return { window, scripts, store, events: name => window.dataLayer.filter(args => args[0] === 'event' && args[1] === name) };
}

test('first PageView queues immediately, then SPA bootstrap does not count it twice', () => {
  const app = load('https://gpkorea.ai.kr/?utm_source=naver&paymentKey=private');
  assert.equal(app.events('page_view').length, 1);
  assert.ok(app.scripts.some(script => script.src.includes('googletagmanager.com')));
  assert.equal(app.events('page_view')[0][2].page_location.includes('private'), false);
  app.window.gpTrackPageView('main', 'Loaded');
  assert.equal(app.events('page_view').length, 1);
  app.window.location.href = 'https://gpkorea.ai.kr/pricing';
  app.window.gpTrackPageView('pricing', 'Pricing');
  assert.equal(app.events('page_view').length, 2);
});

test('UI source and caller overrides cannot replace acquisition, raw text never reaches GA or Meta', () => {
  const app = load('https://gpkorea.ai.kr/?utm_source=naver&utm_medium=cpc');
  app.window.gpTrack('paywall_view', { source: 'hero', traffic_source: 'hero', input_text: 'private', email: 'private', campaign_source: 'hero' });
  const payload = app.events('paywall_view')[0][2];
  assert.equal(payload.ui_source, 'hero');
  assert.equal(payload.traffic_source, 'naver');
  assert.equal(payload.traffic_medium, 'cpc');
  for (const key of ['source', 'campaign_source', 'input_text', 'email']) assert.equal(key in payload, false);
  assert.equal(JSON.stringify(app.window.fbq.queue).includes('private'), false);
});

test('payment, OAuth and www returns retain attribution while a real external referral replaces it', () => {
  const store = new Map();
  load('https://gpkorea.ai.kr/?utm_source=meta&utm_medium=paid_social', { store });
  for (const referrer of ['https://checkout.tosspayments.com/', 'https://accounts.google.com/', 'https://kauth.kakao.com/', 'https://www.gpkorea.ai.kr/']) {
    assert.equal(load(undefined, { store, referrer }).window.gpAttribution.getLastTouch().source, 'meta');
  }
  assert.equal(load(undefined, { store, referrer: 'https://news.example.org/' }).window.gpAttribution.getLastTouch().source, 'news.example.org');
  assert.equal(load(undefined, { referrer: 'https://not-google.com/' }).window.gpAttribution.getLastTouch().source, 'not-google.com');
  assert.equal(load(undefined, { referrer: 'https://www.google.com/' }).window.gpAttribution.getLastTouch().medium, 'organic');
  assert.equal(load(undefined, { referrer: 'https://m.search.naver.com/' }).window.gpAttribution.getLastTouch().medium, 'organic');
  assert.equal(load(undefined, { referrer: 'https://blog.naver.com/' }).window.gpAttribution.getLastTouch().medium, 'referral');
});

test('fbclid alone does not manufacture paid traffic; expired last touch does not persist forever', () => {
  assert.equal(load('https://gpkorea.ai.kr/?fbclid=share').window.gpAttribution.getLastTouch().medium, 'social');
  const store = new Map();
  load('https://gpkorea.ai.kr/?utm_source=naver', { store });
  const touch = JSON.parse(store.get('gp_attribution_last_touch'));
  store.set('gp_attribution_last_touch', JSON.stringify({ ...touch, captured_at: new Date(Date.now() - 31 * 86400000).toISOString() }));
  assert.equal(load(undefined, { store }).window.gpAttribution.getLastTouch().source, 'direct');
});

test('job completion counts once across polling, reload and distinct modes, but new jobs count', () => {
  const app = load();
  const run = { feature: 'humanize', run_id: 'job_123456', mode: 'blog', chars: 600, duration_ms: 25000, input_text: 'private' };
  assert.equal(app.window.gpTrackFeature('complete', run), true);
  assert.equal(app.window.gpTrackFeature('complete', run), false);
  assert.equal(app.events('humanize_run').length, 1);
  assert.equal(app.events('analysis_complete')[0][2].duration_ms, 25000);
  const reloaded = load(undefined, { store: app.store });
  assert.equal(reloaded.window.gpTrackFeature('complete', run), false);
  assert.equal(reloaded.window.gpTrackFeature('complete', { ...run, run_id: 'job_987654' }), true);
  assert.equal(JSON.stringify(app.window.dataLayer).includes('private'), false);
});

test('admin routes and resolved internal users do not produce marketing events', () => {
  const admin = load('https://gpkorea.ai.kr/admin-humanize-lab');
  assert.equal(admin.scripts.length, 0);
  admin.window.gpTrack('purchase', { value: 10000 });
  assert.equal(admin.events('purchase').length, 0);
  const app = load();
  app.window.gpSetAnalyticsInternal(true);
  assert.equal(app.window.gpNaverTrack('purchase', { value: 10000 }), false);
  assert.equal(app.window.gpNaverTrackingStatus().pending, 0);
  app.window.gpTrack('humanize_run');
  assert.equal(app.events('humanize_run').length, 0);
  assert.equal(app.window['ga-disable-G-TEST'], true);
  app.window.gpSetAnalyticsInternal(false);
  app.window.gpTrack('humanize_run');
  assert.equal(app.events('humanize_run').length, 1);
});

test('first success requires server confirmation and uses the server deduplication ID', () => {
  const app = load();
  app.window.gpTrackFeature('complete', { feature: 'detect', run_id: 'detect-1', activation: { firstSuccess: true, scope: 'since_20260905', eventId: 'gp_activation_test123' } });
  assert.equal(app.events('first_feature_success').length, 1);
  assert.equal(app.events('first_feature_success')[0][2].activation_scope, 'since_20260905');
  const activation = app.window.fbq.queue.find(args => args[1] === 'Activation');
  assert.equal(activation[3].eventID, 'gp_activation_test123');
  app.window.gpTrackFeature('complete', { feature: 'humanize', run_id: 'job-2' });
  assert.equal(app.events('first_feature_success').length, 1);
});

test('short landing waits for actual markup and records one successful variant view', async () => {
  const landing = fs.readFileSync(new URL('../assets/js/landing.js', import.meta.url), 'utf8');
  const variants = landing.slice(landing.search(/\(function \(\) \{\s+var LP_VARIANTS/));
  const listeners = new Map();
  let ready = false;
  const nodes = [{}, {}, {}];
  const events = [];
  let resolvePage;
  const window = {
    gpTrack: (...args) => events.push(args),
    addEventListener: (event, callback) => listeners.set(event, callback),
    GP_PAGE_READY: new Promise(resolve => { resolvePage = resolve; })
  };
  const document = { readyState: 'complete', querySelector: selector => !ready ? null : nodes[selector.includes(' h1') ? 0 : selector.includes('hero-sub') ? 1 : 2] };
  vm.runInNewContext(variants, { window, document });
  assert.equal(events.length, 0);
  ready = true;
  listeners.get('gp:landing-markup-ready')();
  assert.equal(events.length, 0);
  window.gpAttribution = { getContext: () => ({ use_case: 'short' }) };
  listeners.get('gp:attribution-ready')();
  resolvePage();
  await window.GP_PAGE_READY;
  assert.equal(events.length, 1);
  assert.match(nodes[1].textContent, /50자/);
  assert.match(nodes[1].textContent, /20크레딧/);
});

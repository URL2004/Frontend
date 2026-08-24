(function () {
 var config = window.APP_CONFIG || {};
 var measurementId = config.GA_MEASUREMENT_ID || '';
 var lastPageViewKey = '';
 var STORAGE_KEYS = {
  first: 'gp_attribution_first_touch',
  last: 'gp_attribution_last_touch',
  legacySource: 'traffic_source'
 };
 var PARAMS = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  content: 'utm_content',
  term: 'utm_term',
  napm: 'NaPm',
  gclid: 'gclid',
  fbclid: 'fbclid'
 };

 window.dataLayer = window.dataLayer || [];
 window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

 function clean(value, max) {
  var text = String(value == null ? '' : value).trim();
  return text.slice(0, max || 250);
 }

 function readJson(key) {
  try {
   var raw = localStorage.getItem(key);
   if (!raw) return null;
   var parsed = JSON.parse(raw);
   return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) { return null; }
 }

 function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (_) { /* 스토리지 차단 시 분석 기능만 건너뜀 */ }
 }

 function externalReferrerHost() {
  var ref = document.referrer;
  if (!ref) return '';
  try {
   var host = new URL(ref).hostname.toLowerCase();
   var currentHost = String(window.location.hostname || '').toLowerCase();
   return host && host !== currentHost ? host : '';
  } catch (_) { return ''; }
 }

 function sourceFromHost(host) {
  if (!host) return '';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('naver')) return 'naver';
  if (host.includes('google')) return 'google';
  if (host.includes('kakao')) return 'kakao';
  if (host.includes('youtube')) return 'youtube';
  if (host.includes('facebook')) return 'facebook';
  if (host.includes('twitter') || host.includes('x.com')) return 'twitter';
  return host;
 }

 function currentTouch() {
  var params = new URLSearchParams(window.location.search || '');
  var referrerHost = externalReferrerHost();
  var values = {};
  Object.keys(PARAMS).forEach(function (key) {
   values[key] = clean(params.get(PARAMS[key]), key === 'napm' ? 500 : 250);
  });
  var hasPaidId = !!(values.napm || values.gclid || values.fbclid);
  var hasCampaignParam = !!(values.source || values.medium || values.campaign || values.content || values.term || hasPaidId);
  var source = values.source || (values.napm ? 'naver' : values.gclid ? 'google' : values.fbclid ? 'meta' : sourceFromHost(referrerHost)) || 'direct';
  var medium = values.medium || (hasPaidId ? 'cpc' : referrerHost ? 'referral' : 'none');
  var landingPath = clean(window.location.pathname || '/', 250);
  var origin = clean(window.location.origin || '', 250);
  return {
   touch: {
    version: 1,
    captured_at: new Date().toISOString(),
    source: source,
    medium: medium,
    campaign: values.campaign,
    content: values.content,
    term: values.term,
    napm: values.napm,
    gclid: values.gclid,
    fbclid: values.fbclid,
    landing_path: landingPath,
    landing_url: origin + landingPath,
    referrer_host: clean(referrerHost, 250)
   },
   qualified: hasCampaignParam || !!referrerHost
  };
 }

 function captureAttribution() {
  var current = currentTouch();
  var first = readJson(STORAGE_KEYS.first);
  var last = readJson(STORAGE_KEYS.last);
  if (!first) {
   first = current.touch;
   writeJson(STORAGE_KEYS.first, first);
  }
  // 내부 이동이나 결제 콜백의 direct 방문이 마지막 유료 유입을 덮지 않게 한다.
  if (!last || current.qualified) {
   last = current.touch;
   writeJson(STORAGE_KEYS.last, last);
  }
  try { localStorage.setItem(STORAGE_KEYS.legacySource, (last && last.source) || 'direct'); }
  catch (_) {}
  return { first_touch: first, last_touch: last };
 }

 function attributionSnapshot() {
  var first = readJson(STORAGE_KEYS.first);
  var last = readJson(STORAGE_KEYS.last);
  if (!first || !last) return captureAttribution();
  return { first_touch: first, last_touch: last };
 }

 function attributionContext() {
  var snapshot = attributionSnapshot();
  var first = snapshot.first_touch || {};
  var last = snapshot.last_touch || {};
  return {
   traffic_source: last.source || 'direct',
   traffic_medium: last.medium || 'none',
   traffic_campaign: last.campaign || '',
   traffic_content: last.content || '',
   traffic_term: last.term || '',
   traffic_napm: last.napm || '',
   first_touch_source: first.source || 'direct',
   first_touch_medium: first.medium || 'none',
   first_touch_campaign: first.campaign || '',
   landing_path: last.landing_path || window.location.pathname || '/'
  };
 }

 captureAttribution();
 window.gpAttribution = {
  capture: captureAttribution,
  snapshot: attributionSnapshot,
  getFirstTouch: function () { return attributionSnapshot().first_touch; },
  getLastTouch: function () { return attributionSnapshot().last_touch; },
  getContext: attributionContext
 };

 window.gpTrack = function (eventName, params) {
  if (!eventName || !measurementId) return;
  var payload = Object.assign({
   app_env: config.APP_ENV || 'production'
  }, attributionContext(), params || {});
  window.gtag('event', eventName, payload);
 };

 window.gpTrackPageView = function (routeTab, title, locationUrl) {
  if (!measurementId) return;
  var pageLocation = locationUrl || window.location.href;
  var key = String(routeTab || '') + '|' + pageLocation;
  if (key === lastPageViewKey) return;
  lastPageViewKey = key;
  var path;
  try { path = new URL(pageLocation, window.location.origin).pathname; }
  catch (_) { path = window.location.pathname; }
  window.gtag('event', 'page_view', Object.assign({
   page_title: title || document.title,
   page_location: pageLocation,
   page_path: path,
   route_tab: routeTab || '',
   app_env: config.APP_ENV || 'production'
  }, attributionContext()));
 };

 if (measurementId) {
  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(gtagScript);

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
 }
})();

(function () {
 var config = window.APP_CONFIG || {};
 var measurementId = config.GA_MEASUREMENT_ID || '';
 var metaPixelId = String(config.META_PIXEL_ID || '').trim();
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

 function initMetaPixel() {
  if (!/^\d{8,25}$/.test(metaPixelId)) return false;
  if (!window.fbq) {
   var fbq = window.fbq = function () {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
   };
   if (!window._fbq) window._fbq = fbq;
   fbq.push = fbq;
   fbq.loaded = true;
   fbq.version = '2.0';
   fbq.queue = [];
   var script = document.createElement('script');
   script.async = true;
   script.src = 'https://connect.facebook.net/en_US/fbevents.js';
   var firstScript = document.getElementsByTagName('script')[0];
   if (firstScript && firstScript.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
   else if (document.head) document.head.appendChild(script);
  }
  window.fbq('init', metaPixelId);
  return true;
 }

 var metaPixelEnabled = initMetaPixel();

 function metaEventId(eventName, preferred) {
  var supplied = clean(preferred, 180);
  if (/^[a-z0-9_.:-]{6,180}$/i.test(supplied)) return supplied;
  return 'gp_' + clean(eventName, 40).replace(/[^a-z0-9_]+/gi, '_') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
 }

 // Server uses the same FNV-1a implementation to deduplicate signup Pixel/CAPI events.
 function stableMetaEventId(eventName, stableKey) {
  var name = clean(eventName, 40).replace(/[^a-z0-9_]+/gi, '_') || 'event';
  var key = String(stableKey == null ? '' : stableKey);
  var hash = 0x811c9dc5;
  for (var i = 0; i < key.length; i++) {
   hash ^= key.charCodeAt(i);
   hash = Math.imul(hash, 0x01000193);
  }
  return 'gp_' + name + '_' + (hash >>> 0).toString(16);
 }

 function itemContents(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20).map(function (item) {
   return {
    id: clean(item && (item.item_id || item.id), 100),
    quantity: Math.max(1, Number(item && item.quantity) || 1),
    item_price: Math.max(0, Number(item && (item.price || item.item_price)) || 0)
   };
  }).filter(function (item) { return !!item.id; });
 }

 function metaParams(payload, eventName) {
  payload = payload || {};
  var inferredMode = eventName === 'detect_run' ? 'detect' : (eventName === 'humanize_run' ? 'humanize' : payload.mode);
  var params = {
   app_env: clean(payload.app_env || config.APP_ENV || 'production', 30),
   traffic_source: clean(payload.traffic_source, 100),
   traffic_medium: clean(payload.traffic_medium, 100),
   traffic_campaign: clean(payload.traffic_campaign, 150),
   traffic_content: clean(payload.traffic_content, 150),
   traffic_term: clean(payload.traffic_term, 150),
   analysis_mode: clean(payload.analysis_mode || inferredMode, 50),
   humanize_mode: clean(payload.humanize_mode || (eventName === 'humanize_run' ? payload.mode : ''), 50),
   method: clean(payload.method, 50)
  };
  if (eventName === 'sign_up') {
   params.content_name = 'account_registration';
   params.status = true;
  }
  if (payload.transaction_id) params.transaction_id = clean(payload.transaction_id, 150);
  if (Number.isFinite(Number(payload.chars))) params.chars = Math.max(0, Number(payload.chars));
  if (Number.isFinite(Number(payload.value))) params.value = Math.max(0, Number(payload.value));
  if (payload.currency) params.currency = clean(payload.currency, 10).toUpperCase();
  var contents = itemContents(payload.items);
  if (contents.length) {
   params.content_type = 'product';
   params.contents = contents;
   params.content_ids = contents.map(function (item) { return item.id; });
  }
  Object.keys(params).forEach(function (key) {
   if (params[key] === '' || params[key] == null) delete params[key];
  });
  return params;
 }

 function trackMetaEvent(eventName, payload) {
  payload = payload || {};
  var eventID = metaEventId(eventName, payload.meta_event_id || payload.event_id);
  if (!metaPixelEnabled || !window.fbq) return eventID;
  var standard = {
   sign_up: 'CompleteRegistration',
   select_item: 'ViewContent',
   begin_checkout: 'InitiateCheckout',
   purchase: 'Purchase'
  };
  var custom = {
   analysis_start: 'AnalysisStart',
   detect_run: 'DetectComplete',
   humanize_run: 'HumanizeComplete'
  };
  var mapped = standard[eventName] || custom[eventName];
  if (!mapped) return eventID;
  var command = standard[eventName] ? 'track' : 'trackCustom';
  window.fbq(command, mapped, metaParams(payload, eventName), { eventID: eventID });
  return eventID;
 }

 window.gpMetaTrack = trackMetaEvent;
 window.gpMetaCreateEventId = function (eventName) { return metaEventId(eventName); };
 window.gpMetaStableEventId = stableMetaEventId;

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

 function cookieValue(name) {
  try {
   var prefix = name + '=';
   var parts = String(document.cookie || '').split(';');
   for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.indexOf(prefix) === 0) return clean(decodeURIComponent(part.slice(prefix.length)), 300);
   }
  } catch (_) {}
  return '';
 }

 function metaSourceUrl(value) {
  try {
   var parsed = new URL(String(value || ''), window.location.origin);
   var kept = new URLSearchParams();
   ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(function (key) {
    var item = clean(parsed.searchParams.get(key), key === 'fbclid' || key === 'gclid' ? 220 : 150);
    if (item) kept.set(key, item);
   });
   parsed.search = kept.toString();
   parsed.hash = '';
   return clean(parsed.toString(), 1000);
  } catch (_) {
   return '';
  }
 }

 function metaContext() {
  var snapshot = attributionSnapshot();
  var last = snapshot.last_touch || {};
  var fbc = cookieValue('_fbc');
  if (!fbc && last.fbclid) {
   var capturedMs = Date.parse(last.captured_at || '') || Date.now();
   fbc = 'fb.1.' + capturedMs + '.' + clean(last.fbclid, 220);
  }
  return {
   fbp: cookieValue('_fbp'),
   fbc: fbc,
   sourceUrl: metaSourceUrl(window.location.href),
   trafficSource: clean(last.source || 'direct', 100),
   trafficMedium: clean(last.medium || 'none', 100),
   trafficCampaign: clean(last.campaign, 150),
   trafficContent: clean(last.content, 150),
   trafficTerm: clean(last.term, 150)
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
 window.gpMetaContext = metaContext;

 window.gpTrack = function (eventName, params) {
  if (!eventName) return;
  var payload = Object.assign({
   app_env: config.APP_ENV || 'production'
  }, attributionContext(), params || {});
  if (measurementId) window.gtag('event', eventName, payload);
  return trackMetaEvent(eventName, payload);
 };

 window.gpTrackPageView = function (routeTab, title, locationUrl) {
  if (!measurementId && !metaPixelEnabled) return;
  var pageLocation = locationUrl || window.location.href;
  var key = String(routeTab || '') + '|' + pageLocation;
  if (key === lastPageViewKey) return;
  lastPageViewKey = key;
  var path;
  try { path = new URL(pageLocation, window.location.origin).pathname; }
  catch (_) { path = window.location.pathname; }
  var payload = Object.assign({
   page_title: title || document.title,
   page_location: pageLocation,
   page_path: path,
   route_tab: routeTab || '',
   app_env: config.APP_ENV || 'production'
  }, attributionContext());
  if (measurementId) window.gtag('event', 'page_view', payload);
  if (metaPixelEnabled && window.fbq) {
   window.fbq('track', 'PageView', {
    page_title: clean(payload.page_title, 250),
    page_path: clean(payload.page_path, 250),
    route_tab: clean(payload.route_tab, 80),
    traffic_source: clean(payload.traffic_source, 100),
    traffic_campaign: clean(payload.traffic_campaign, 150)
   }, { eventID: metaEventId('page_view') });
  }
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

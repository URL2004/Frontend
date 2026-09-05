(function () {
 var config = window.APP_CONFIG || {};
 var measurementId = config.GA_MEASUREMENT_ID || '';
 var metaPixelId = String(config.META_PIXEL_ID || '').trim();
 var naverCommonKey = String(config.NAVER_COMMON_KEY || '').trim();
 var naverCookieDomain = String(config.NAVER_COOKIE_DOMAIN || '').trim();
 var naverTrackingInitialized = false;
 var naverPendingConversions = [];
 var NAVER_PENDING_LIMIT = 50;
 var lastPageViewKey = '';

 function internalTraffic() {
  return /^\/admin(?:[\/-]|$)/.test(window.location.pathname || '')
   || window.gpAnalyticsInternal === true
   || (typeof window.isAdmin === 'function' && !!window.isAdmin());
 }
 window.gpSetAnalyticsInternal = function (value) {
  window.gpAnalyticsInternal = value === true;
  if (measurementId) window['ga-disable-' + measurementId] = internalTraffic();
 };
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
  if (internalTraffic()) return false;
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

 function initNaverTracking() {
  if (internalTraffic()) return false;
  if (naverTrackingInitialized) return true;
  if (!/^s_[a-z0-9]{6,64}$/i.test(naverCommonKey)) return false;
  if (!naverCookieDomain || !window.wcs || typeof window.wcs_do !== 'function') return false;
  window.wcs_add = window.wcs_add || {};
  window.wcs_add.wa = naverCommonKey;
  if (typeof window.wcs.inflow === 'function') window.wcs.inflow(naverCookieDomain);
  window.wcs_do();
  naverTrackingInitialized = true;
  flushNaverConversions();
  return true;
 }

 function naverConversionKey(conversion) {
  if (!conversion || !conversion.type) return '';
  return conversion.id ? conversion.type + '|' + conversion.id : '';
 }

 function queueNaverConversion(conversion) {
  var key = naverConversionKey(conversion);
  if (key && naverPendingConversions.some(function (pending) { return naverConversionKey(pending) === key; })) return;
  naverPendingConversions.push(conversion);
  if (naverPendingConversions.length > NAVER_PENDING_LIMIT) naverPendingConversions.shift();
 }

 function flushNaverConversions() {
  if (!naverTrackingInitialized && !initNaverTracking()) return 0;
  if (!window.wcs || typeof window.wcs.trans !== 'function') return 0;
  var sent = 0;
  while (naverPendingConversions.length) {
   var conversion = naverPendingConversions[0];
   try {
    window.wcs.trans(conversion);
    naverPendingConversions.shift();
    sent += 1;
   } catch (_) {
    break;
   }
  }
  return sent;
 }

 function naverEventType(eventName) {
  return {
   sign_up: 'sign_up',
   purchase: 'purchase',
   begin_checkout: 'begin_checkout',
   detect_run: 'custom001',
   humanize_run: 'custom002'
  }[eventName] || '';
 }

 function trackNaverEvent(eventName, payload) {
  if (internalTraffic()) return false;
  payload = payload || {};
  var type = naverEventType(eventName);
  if (!type) return false;
  var conversion = { type: type };
  if (payload.transaction_id || payload.run_id || payload.meta_event_id) conversion.id = clean(payload.transaction_id || payload.run_id || payload.meta_event_id, 150);
  if (type === 'purchase') {
   conversion.value = String(Math.max(0, Number(payload.value) || 0));
   conversion.currency = clean(payload.currency || 'KRW', 10).toUpperCase();
   if (Array.isArray(payload.items)) {
    conversion.items = payload.items.slice(0, 20).map(function (item) {
     var quantity = Math.max(1, Number(item && item.quantity) || 1);
     var itemPrice = Math.max(0, Number(item && (item.price || item.item_price)) || 0);
     return {
      id: clean(item && (item.item_id || item.id), 100),
      name: clean(item && (item.item_name || item.name), 150).replace(/["']/g, ''),
      quantity: quantity,
      payAmount: itemPrice * quantity
     };
    }).filter(function (item) { return !!item.id; });
    if (!conversion.items.length) delete conversion.items;
   }
  }
  if (!initNaverTracking() || !window.wcs || typeof window.wcs.trans !== 'function') {
   queueNaverConversion(conversion);
   if (typeof window.gpEnsureNaverTracking === 'function') window.gpEnsureNaverTracking();
   return true;
  }
  try {
   window.wcs.trans(conversion);
  } catch (_) {
   queueNaverConversion(conversion);
   if (typeof window.gpEnsureNaverTracking === 'function') window.gpEnsureNaverTracking();
  }
  return true;
 }

 window.gpNaverInitialize = initNaverTracking;
 window.gpNaverTrack = trackNaverEvent;
 window.gpNaverTrackingStatus = function () {
  return { initialized: naverTrackingInitialized, pending: naverPendingConversions.length };
 };

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
   use_case: clean(payload.use_case, 40),
   activation_scope: clean(payload.activation_scope, 40),
   analysis_mode: clean(payload.analysis_mode || inferredMode, 50),
   humanize_mode: clean(payload.humanize_mode || (eventName === 'humanize_run' ? payload.mode : ''), 50),
   method: clean(payload.method, 50),
   segment: clean(payload.segment, 50),
   offer_variant: clean(payload.offer_variant, 50),
   pending_action: clean(payload.pending_action, 64),
   paywall_source: clean(payload.paywall_source || payload.ui_source || payload.source, 64)
  };
  if (eventName === 'sign_up') {
   params.content_name = 'account_registration';
   params.status = true;
   params.currency = 'KRW';
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
  if (internalTraffic() || !metaPixelEnabled || !window.fbq) return eventID;
  var standard = {
   sign_up: 'CompleteRegistration',
   select_item: 'ViewContent',
   begin_checkout: 'InitiateCheckout',
   purchase: 'Purchase'
  };
  var custom = {
   analysis_start: 'AnalysisStart',
   detect_run: 'DetectComplete',
   humanize_run: 'HumanizeComplete',
   first_feature_success: 'Activation',
   paywall_view: 'PaywallView',
   starter_offer_click: 'StarterOfferClick',
   job_resumed: 'JobResumed',
   activation_prompt_click: 'ActivationPromptClick',
   repurchase_offer_click: 'RepurchaseOfferClick'
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
   if (host.replace(/^www\./, '') === currentHost.replace(/^www\./, '')) return '';
   // 결제·인증 서비스를 거쳐 돌아온 방문은 새로운 획득 채널이 아니다.
   if (['tosspayments.com', 'toss.im', 'accounts.google.com', 'kauth.kakao.com', 'accounts.kakao.com'].some(function (domain) { return hostMatches(host, domain); })) return '';
   return host;
  } catch (_) { return ''; }
 }

 function hostMatches(host, domain) {
  return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
 }

 function sourceFromHost(host) {
  if (!host) return '';
  var domains = { 'instagram.com': 'instagram', 'naver.com': 'naver', 'google.com': 'google', 'google.co.kr': 'google', 'kakao.com': 'kakao', 'youtube.com': 'youtube', 'facebook.com': 'facebook', 'twitter.com': 'twitter', 't.co': 'twitter', 'x.com': 'twitter' };
  var match = Object.keys(domains).find(function (domain) { return hostMatches(host, domain); });
  if (match) return domains[match];
  return host;
 }

 // use_case 파생(2026-08-28 P0-6): 광고는 use_case를 별도 파라미터가 아니라 utm_content 접두
 // ({use_case}_{set}_c{n}) 또는 네이버 그룹 코드({group}_responsive)로 싣는다 — 셋 다 지원한다.
 var USE_CASES = ['assignment', 'resume', 'blog', 'paper', 'short', 'general'];
 var NAVER_GROUP_USE_CASE = { '03': 'resume', '07': 'blog', '08': 'assignment', '09': 'paper', '10': 'short' };
 function deriveUseCase(params) {
  var direct = clean(params.get('use_case'), 40).toLowerCase();
  if (USE_CASES.indexOf(direct) >= 0) return direct;
  var content = clean(params.get('utm_content'), 150).toLowerCase();
  var prefix = content.match(/^(assignment|resume|blog|paper|short|general)(?=[_\-]|$)/);
  if (prefix) return prefix[1];
  var group = content.match(/^g(\d{2})/);
  if (group && NAVER_GROUP_USE_CASE[group[1]]) return NAVER_GROUP_USE_CASE[group[1]];
  return '';
 }

 function currentTouch() {
  var params = new URLSearchParams(window.location.search || '');
  var referrerHost = externalReferrerHost();
  var values = {};
  Object.keys(PARAMS).forEach(function (key) {
   values[key] = clean(params.get(PARAMS[key]), key === 'napm' ? 500 : 250);
  });
  var useCase = deriveUseCase(params);
  // fbclid는 일반 Facebook 공유 링크에도 붙는다. 유료 여부는 UTM으로 구분한다.
  var hasPaidId = !!(values.napm || values.gclid);
  var hasCampaignParam = !!(values.source || values.medium || values.campaign || values.content || values.term || hasPaidId || values.fbclid);
  var source = values.source || (values.napm ? 'naver' : values.gclid ? 'google' : values.fbclid ? 'meta' : sourceFromHost(referrerHost)) || 'direct';
  var searchReferrer = /^(www\.)?google\.(com|co\.kr)$/.test(referrerHost) || /^(m\.)?search\.naver\.com$/.test(referrerHost);
  var medium = values.medium || (hasPaidId ? 'cpc' : values.fbclid ? 'social' : searchReferrer ? 'organic' : referrerHost ? 'referral' : 'none');
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
    use_case: useCase,
    landing_path: landingPath,
    landing_url: origin + landingPath,
    referrer_host: clean(referrerHost, 250)
   },
   qualified: hasCampaignParam || !!referrerHost
  };
 }

 function captureAttribution() {
  var current = currentTouch();
  var first = freshTouch(STORAGE_KEYS.first, 90);
  var last = freshTouch(STORAGE_KEYS.last, 30);
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

 function freshTouch(key, days) {
  var touch = readJson(key);
  var age = touch ? Date.now() - Date.parse(touch.captured_at || '') : NaN;
  return Number.isFinite(age) && age >= 0 && age < days * 86400000 ? touch : null;
 }

 function attributionSnapshot() {
  var first = freshTouch(STORAGE_KEYS.first, 90);
  var last = freshTouch(STORAGE_KEYS.last, 30);
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
   use_case: last.use_case || first.use_case || '',   // 광고 용도 맥락 — 가입·첫 완료·구매까지 모든 이벤트에 관통
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
  if (!eventName || internalTraffic()) return;
  var safeParams = Object.assign({}, params || {});
  // UI 위치 source가 GA 획득 source와 충돌하지 않도록 한 곳에서 이전한다.
  if (safeParams.source != null) safeParams.ui_source = clean(safeParams.source, 100);
  ['source', 'medium', 'campaign', 'campaign_source', 'campaign_medium', 'campaign_name', 'input_text', 'output_text', 'text', 'prompt', 'email', 'phone', 'name', 'uid', 'token', 'paymentKey', 'message', 'error_message', 'stack'].forEach(function (key) { delete safeParams[key]; });
  var payload = Object.assign({
   app_env: config.APP_ENV || 'production'
  }, safeParams, attributionContext());
  if (measurementId) window.gtag('event', eventName, payload);
  trackNaverEvent(eventName, payload);
  return trackMetaEvent(eventName, payload);
 };

 // 작업 ID + 단계 단위로 재폴링·새로고침의 중복을 막는다. 원문/결과문은 받지 않는다.
 window.gpTrackFeature = function (phase, details) {
  details = details || {};
  if (internalTraffic() || !/^(start|complete|error)$/.test(phase)) return false;
  var feature = details.feature === 'detect' ? 'detect' : 'humanize';
  var runId = clean(details.run_id, 150);
  if (!runId) return false;
  var key = feature + '|' + runId + '|' + phase;
  var journal = readJson('gp_feature_events_v1');
  var entries = Array.isArray(journal) ? journal.filter(function (entry) { return entry && Date.now() - entry.at < 7 * 86400000; }) : [];
  if (entries.some(function (entry) { return entry.key === key; })) return false;
  var payload = {
   run_id: runId, analysis_mode: feature,
   humanize_mode: feature === 'humanize' ? clean(details.mode, 40) : '',
   chars: Math.max(0, Number(details.chars) || 0),
   duration_ms: Math.max(0, Number(details.duration_ms) || 0),
   error_code: clean(details.error_code, 64),
   ui_source: 'composer'
  };
  window.gpTrack('analysis_' + phase, payload);
  if (phase === 'complete') window.gpTrack(feature + '_run', Object.assign({}, payload, {
   meta_event_id: stableMetaEventId(feature + '_run', runId)
  }));
  if (phase === 'complete' && details.activation && details.activation.firstSuccess === true) {
   window.gpTrack('first_feature_success', Object.assign({}, payload, {
    activation_scope: clean(details.activation.scope, 40),
    meta_event_id: clean(details.activation.eventId, 180)
   }));
  }
  entries.push({ key: key, at: Date.now() });
  writeJson('gp_feature_events_v1', entries.slice(-300));
  return true;
 };

 function analyticsSafeLocation(value) {
  try {
   var url = new URL(value || window.location.href, window.location.origin);
   var sensitiveKeys = new Set([
    'paymentKey', 'orderId', 'amount', 'credits', 'plan', 'uid', 'fail', 'success', 'code', 'message',
    'authKey', 'sub', 'ck', 'subfail', 'state', 'error', 'error_description',
    'preview_key', 'ref', 'token', 'id_token', 'access_token', 'refresh_token', 'session_state',
    'email', 'phone', 'name'
   ].map(function (key) { return key.toLowerCase(); }));
   Array.from(url.searchParams.keys()).forEach(function (key) {
    if (sensitiveKeys.has(String(key).toLowerCase())) url.searchParams.delete(key);
   });
   url.hash = '';
   return url.toString();
  } catch (_) {
   return window.location.origin + window.location.pathname;
  }
 }

 window.gpTrackPageView = function (routeTab, title, locationUrl) {
  if (internalTraffic() || (!measurementId && !metaPixelEnabled)) return;
  var pageLocation = analyticsSafeLocation(locationUrl || window.location.href);
  var key = pageLocation;
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

 if (measurementId && !internalTraffic()) {
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false, page_location: analyticsSafeLocation(window.location.href), page_referrer: document.referrer ? analyticsSafeLocation(document.referrer) : '' });
  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(gtagScript);
 }
 window.gpTrackPageView('initial', document.title);
 if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
  window.dispatchEvent(new window.CustomEvent('gp:attribution-ready'));
 }
})();

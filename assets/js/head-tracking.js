(function () {
 var config = window.APP_CONFIG || {};
 var measurementId = config.GA_MEASUREMENT_ID || '';
 var lastPageViewKey = '';

 window.dataLayer = window.dataLayer || [];
 window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

 function trafficSource() {
  try { return localStorage.getItem('traffic_source') || 'direct'; }
  catch (_) { return 'direct'; }
 }

 window.gpTrack = function (eventName, params) {
  if (!eventName || !measurementId) return;
  var payload = Object.assign({
   app_env: config.APP_ENV || 'production',
   traffic_source: trafficSource()
  }, params || {});
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
  window.gtag('event', 'page_view', {
   page_title: title || document.title,
   page_location: pageLocation,
   page_path: path,
   route_tab: routeTab || '',
   app_env: config.APP_ENV || 'production'
  });
 };

 if (measurementId) {
  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(gtagScript);

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
 }

 // 유입 경로 저장
 (function () {
  var params = new URLSearchParams(location.search);
  var utm = params.get('utm_source');
  if (utm) { localStorage.setItem('traffic_source', utm); return; }
  var ref = document.referrer;
  if (!ref) return;
  try {
   var host = new URL(ref).hostname;
   if (host.includes('instagram')) localStorage.setItem('traffic_source', 'instagram');
   else if (host.includes('naver')) localStorage.setItem('traffic_source', 'naver');
   else if (host.includes('google')) localStorage.setItem('traffic_source', 'google');
   else if (host.includes('kakao')) localStorage.setItem('traffic_source', 'kakao');
   else if (host.includes('youtube')) localStorage.setItem('traffic_source', 'youtube');
   else if (host.includes('facebook')) localStorage.setItem('traffic_source', 'facebook');
   else if (host.includes('twitter') || host.includes('x.com')) localStorage.setItem('traffic_source', 'twitter');
   else localStorage.setItem('traffic_source', host);
  } catch (e) {}
 })();
})();

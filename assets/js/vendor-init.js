var resolveKakaoReady;
window.gpKakaoReady = new Promise(function (resolve) {
 resolveKakaoReady = resolve;
});
window.onKakaoLoad = function() {
 try {
  if (!window.Kakao) throw new Error('Kakao SDK missing');
  if (!window.Kakao.isInitialized || !window.Kakao.isInitialized()) {
   window.Kakao.init(window.APP_CONFIG.KAKAO_JS_KEY);
  }
  resolveKakaoReady(window.Kakao);
 } catch (error) {
  console.warn('Kakao SDK initialization failed.', error);
  resolveKakaoReady(null);
 }
};
window.onKakaoError = function () {
 resolveKakaoReady(null);
};

var tossPaymentsPromise = null;
window.gpLoadTossPayments = function () {
 if (typeof window.TossPayments === 'function') return Promise.resolve(window.TossPayments);
 if (tossPaymentsPromise) return tossPaymentsPromise;
 tossPaymentsPromise = new Promise(function (resolve, reject) {
  var script = document.createElement('script');
  script.src = 'https://js.tosspayments.com/v1';
  script.async = true;
  script.onload = function () {
   if (typeof window.TossPayments === 'function') resolve(window.TossPayments);
   else reject(new Error('Toss Payments SDK unavailable'));
  };
  script.onerror = function () { reject(new Error('Toss Payments SDK failed to load')); };
  document.head.appendChild(script);
 });
 return tossPaymentsPromise;
};

var naverTrackingPromise = null;
function loadNaverTracking() {
 if (window.wcs && typeof window.wcs_do === 'function') {
  if (window.gpNaverInitialize) window.gpNaverInitialize();
  return Promise.resolve(true);
 }
 if (naverTrackingPromise) return naverTrackingPromise;
 naverTrackingPromise = new Promise(function (resolve) {
  var script = document.createElement('script');
  script.src = 'https://wcs.naver.net/wcslog.js';
  script.async = true;
  script.onload = function () {
   if (window.gpNaverInitialize) window.gpNaverInitialize();
   resolve(true);
  };
  script.onerror = function () {
   naverTrackingPromise = null;
   resolve(false);
  };
  document.head.appendChild(script);
 });
 return naverTrackingPromise;
}

window.gpEnsureNaverTracking = loadNaverTracking;

function scheduleNaverTracking() {
 setTimeout(function () {
  if ('requestIdleCallback' in window) requestIdleCallback(loadNaverTracking, { timeout: 2500 });
  else loadNaverTracking();
 }, 5500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleNaverTracking, { once: true });
else scheduleNaverTracking();

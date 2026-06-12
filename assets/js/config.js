(function () {
  var runtime = window.APP_RUNTIME_CONFIG || {};
  var prodApiBase = 'https://ai-backend-3xtk.onrender.com';
  var prodSiteUrl = 'https://gpkorea.ai.kr';
  var prodFirebase = {
    apiKey: 'AIzaSyDfQyEmqEjHOaKp4WWiv-Ycxu8TITK8bZA',
    authDomain: 'url88-d1d27.firebaseapp.com',
    projectId: 'url88-d1d27',
    storageBucket: 'url88-d1d27.firebasestorage.app',
    messagingSenderId: '367996851503',
    appId: '1:367996851503:web:ff22a18e1f9e5294c7fdda',
    measurementId: 'G-6PBP3P6PQJ'
  };
  // 로컬 정적 서빙(localhost/127.0.0.1) 시 로컬 백엔드로 — 배포 환경엔 영향 없음.
  // 포트 3100: 3000은 Next.js 기본 포트라 다른 프로젝트(OpenRisk 등)와 상습 충돌(2026-06-12 실사고 — Failed to fetch의 원인).
  var isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  var isProductionHost = /^(www\.)?gpkorea\.ai\.kr$/.test(window.location.hostname);
  var appEnv = runtime.APP_ENV || (isLocalHost ? 'local' : (isProductionHost ? 'production' : 'preview'));
  var siteUrl = runtime.SITE_URL || (isProductionHost ? prodSiteUrl : window.location.origin);
  var apiBase = runtime.API_BASE || (isLocalHost ? 'http://localhost:3100' : (isProductionHost ? prodApiBase : ''));
  var tossClientKey = runtime.TOSS_CLIENT_KEY || (isProductionHost ? 'live_ck_DnyRpQWGrNw0XnWnYN6O8Kwv1M9E' : '');

  window.APP_CONFIG = Object.freeze({
    APP_ENV: appEnv,
    SITE_URL: siteUrl,
    API_BASE: apiBase,
    GA_MEASUREMENT_ID: 'G-Z95JMLJXZ2',
    KAKAO_JS_KEY: '742c97ee8a4457012e84eff0a3d72bf5',
    KAKAO_INQUIRY_URL: runtime.KAKAO_INQUIRY_URL || 'https://open.kakao.com/o/s3Jegizi',
    EMAILJS_PUBLIC_KEY: 'Cl-t76hcNwZUra4y-',
    TOSS_CLIENT_KEY: tossClientKey,
    FIREBASE: runtime.FIREBASE || prodFirebase
  });
})();

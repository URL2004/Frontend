(function () {
  var prodApiBase = 'https://ai-backend-3xtk.onrender.com';
  var siteUrl = 'https://gpkorea.ai.kr';
  // 로컬 정적 서빙(localhost/127.0.0.1) 시 로컬 백엔드로 — 배포 환경엔 영향 없음.
  var isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  var apiBase = isLocalHost ? 'http://localhost:3000' : prodApiBase;

  window.APP_CONFIG = Object.freeze({
    SITE_URL: siteUrl,
    API_BASE: apiBase,
    GA_MEASUREMENT_ID: 'G-Z95JMLJXZ2',
    KAKAO_JS_KEY: '742c97ee8a4457012e84eff0a3d72bf5',
    EMAILJS_PUBLIC_KEY: 'Cl-t76hcNwZUra4y-',
    TOSS_CLIENT_KEY: 'live_ck_DnyRpQWGrNw0XnWnYN6O8Kwv1M9E',
    FIREBASE: {
      apiKey: 'AIzaSyDfQyEmqEjHOaKp4WWiv-Ycxu8TITK8bZA',
      authDomain: 'url88-d1d27.firebaseapp.com',
      projectId: 'url88-d1d27',
      storageBucket: 'url88-d1d27.firebasestorage.app',
      messagingSenderId: '367996851503',
      appId: '1:367996851503:web:ff22a18e1f9e5294c7fdda',
      measurementId: 'G-6PBP3P6PQJ'
    }
  });
})();

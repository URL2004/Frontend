// Optional runtime override loaded before /assets/js/config.js when deploying preview/staging.
// Production gpkorea.ai.kr uses the defaults in config.js.
window.APP_RUNTIME_CONFIG = {
  APP_ENV: 'preview',
  SITE_URL: 'https://your-preview.vercel.app',
  API_BASE: 'https://your-staging-backend.onrender.com',
  TOSS_CLIENT_KEY: 'test_ck_replace_me',
  KAKAO_INQUIRY_URL: 'https://open.kakao.com/o/s3Jegizi',
  FIREBASE: {
    apiKey: 'replace_me',
    authDomain: 'replace_me.firebaseapp.com',
    projectId: 'replace_me',
    storageBucket: 'replace_me.appspot.com',
    messagingSenderId: 'replace_me',
    appId: 'replace_me',
    measurementId: 'replace_me'
  }
};

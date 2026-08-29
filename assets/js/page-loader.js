(function () {
  // 파셜은 동기 XHR로 로드되어 브라우저 휴리스틱 캐시에 잡히기 쉽다.
  // UI 버전이 바뀔 때마다 올려서 강제로 새 파일을 받게 한다.
  var ASSET_V = 'lav-187';   // ★ L-01: 자산 버전과 일치 — 파셜 stale 캐시 방지
  var partials = [
    '/partials/login-screen.html',
    '/pages/landing.html',
    '/partials/app-shell-start.html',
    '/pages/main.html',
    '/pages/history.html',
    '/pages/notice.html',
    '/pages/community.html',
    '/pages/blog.html',
    '/pages/detect-report.html',
    '/pages/guide.html',
    '/pages/faq.html',
    '/pages/qna.html',
    '/pages/pricing.html',
    '/pages/pro.html',
    '/pages/mypage.html',
    '/pages/admin.html',
    '/pages/admin-humanize-lab.html',
    '/pages/writing-lab.html',
    '/partials/app-shell-end.html',
    '/partials/footer.html',
    '/partials/modals.html',
    '/partials/mobile-nav.html'
  ];

  function loadPartial(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?v=' + ASSET_V, false);
    xhr.send(null);
    if ((xhr.status < 200 || xhr.status >= 300) && !(xhr.status === 0 && xhr.responseText)) {
      throw new Error('Failed to load page partial: ' + url);
    }
    // UTF-8 BOM이 파셜 사이에 남으면 본문 안에서 보이지 않는 한 줄로 렌더되어
    // 앱 상단 여백과 문서 스크롤을 만든다. 모든 파셜 경계에서 제거한다.
    return String(xhr.responseText || '').replace(/^\uFEFF/u, '');
  }

  function loadPageMarkup() {
    var runtime = window.APP_RUNTIME_CONFIG || {};
    if (Number(runtime.PAGE_BUNDLE_VERSION) === 1) {
      try {
        var bundled = loadPartial('/partials/app-bundle.html');
        window.PAGE_PARTIAL_BUNDLE_USED = true;
        return bundled;
      } catch (error) {
        console.warn('Page bundle unavailable; loading individual partials.', error);
      }
    }
    window.PAGE_PARTIAL_BUNDLE_USED = false;
    return partials.map(loadPartial).join('\n');
  }

  function hasCachedFirebaseUser() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i) || '';
        if (key.indexOf('firebase:authUser:') === 0 && localStorage.getItem(key)) return true;
      }
    } catch (_) {}
    return false;
  }

  function isHomePath() {
    var path = String(window.location.pathname || '/').replace(/\/index\.html$/i, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path === '' || path === '/';
  }

  function shouldStartOnLanding() {
    var params = new URLSearchParams(window.location.search || '');
    if (hasKakaoCallback(params)) return false;
    var lp = params.get('lp');
    if (lp === '1') return true;
    if (lp === '0') return false;
    var mode = String(params.get('mode') || '').toLowerCase();
    if (mode === 'detect' || mode === 'humanize') return false;
    if (!isHomePath() || window.location.hash) return false;
    try {
      if (sessionStorage.getItem('gp_landing_dismissed_v1') === '1') return false;
    } catch (_) {}
    return !hasCachedFirebaseUser();
  }

  function hasKakaoCallback(params) {
    params = params || new URLSearchParams(window.location.search || '');
    return params.has('code')
      && params.get('success') !== '1'
      && params.get('fail') !== '1'
      && params.get('subfail') !== '1'
      && !params.has('paymentKey');
  }

  function selectInitialScreen() {
    var kakaoCallback = hasKakaoCallback();
    var landing = shouldStartOnLanding();
    var landingScreen = document.getElementById('landingScreen');
    var appScreen = document.getElementById('appScreen');
    document.querySelectorAll('.screen.active').forEach(function (screen) {
      screen.classList.remove('active');
    });
    var target = landing ? landingScreen : appScreen;
    if (target) target.classList.add('active');
    document.documentElement.dataset.gpInitialScreen = landing ? 'landing' : 'app';
    if (kakaoCallback) {
      document.documentElement.dataset.gpAuthCallback = 'kakao';
      var overlay = document.getElementById('authTransition');
      if (appScreen) {
        appScreen.inert = true;
        appScreen.setAttribute('aria-busy', 'true');
      }
      if (overlay) {
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('gp-auth-transitioning');
    }
  }

  // SEO 프리렌더 블록 제거: 빌드된 정적 HTML에는 크롤러용 noscript 본문이 있다.
  // JS 브라우저에서는 렌더되지 않지만, 파셜 주입 전에 제거해 중복 ID 가능성을 없앤다.
  var seo = document.getElementById('seo-prerender-static') || document.getElementById('seo-prerender');
  if (seo && seo.parentNode) seo.parentNode.removeChild(seo);

  var root = document.getElementById('page-root');
  if (!root) throw new Error('Missing #page-root');
  root.insertAdjacentHTML('beforeend', loadPageMarkup());
  selectInitialScreen();
  window.PAGE_PARTIALS = partials;
})();













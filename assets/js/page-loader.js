(function () {
  'use strict';

  var APP_PARTIALS = [
    '/partials/login-screen.html',
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
    '/partials/modals.html'
  ];

  function fetchText(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error('Failed to load page partial: ' + url);
      return response.text();
    }).then(function (text) {
      return String(text || '').replace(/^\uFEFF/u, '');
    });
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

  function normalizedPath() {
    var path = String(window.location.pathname || '/').replace(/\/index\.html$/i, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
  }

  function hasKakaoCallback(params) {
    params = params || new URLSearchParams(window.location.search || '');
    return params.has('code')
      && params.get('success') !== '1'
      && params.get('fail') !== '1'
      && params.get('subfail') !== '1'
      && !params.has('paymentKey');
  }

  function shouldStartOnLanding() {
    var params = new URLSearchParams(window.location.search || '');
    if (hasKakaoCallback(params)) return false;
    var lp = params.get('lp');
    if (lp === '1') return true;
    if (lp === '0') return false;
    var mode = String(params.get('mode') || '').toLowerCase();
    if (mode === 'detect' || mode === 'humanize') return false;
    if (normalizedPath() !== '/' || window.location.hash) return false;
    try {
      if (sessionStorage.getItem('gp_landing_dismissed_v1') === '1') return false;
    } catch (_) {}
    return !hasCachedFirebaseUser();
  }

  function initialMode() {
    if (shouldStartOnLanding()) return 'landing';
    if (normalizedPath() === '/pricing' && !hasCachedFirebaseUser() && !hasKakaoCallback()) return 'public-pricing';
    return 'app';
  }

  function root() {
    var node = document.getElementById('page-root');
    if (!node) throw new Error('Missing #page-root');
    return node;
  }

  function removeSeoPrerender() {
    var seo = document.getElementById('seo-prerender-static') || document.getElementById('seo-prerender');
    if (seo && seo.parentNode) seo.parentNode.removeChild(seo);
  }

  async function appMarkup() {
    var runtime = window.APP_RUNTIME_CONFIG || {};
    if (Number(runtime.PAGE_BUNDLE_VERSION) === 1) {
      try {
        var bundled = await fetchText('/partials/app-bundle.html');
        window.PAGE_PARTIAL_BUNDLE_USED = true;
        return bundled;
      } catch (error) {
        console.warn('Page bundle unavailable; loading individual partials.', error);
      }
    }
    window.PAGE_PARTIAL_BUNDLE_USED = false;
    return (await Promise.all(APP_PARTIALS.map(fetchText))).join('\n');
  }

  function showOnly(screenName) {
    document.querySelectorAll('.screen.active').forEach(function (screen) { screen.classList.remove('active'); });
    var screen = document.getElementById(screenName + 'Screen');
    if (screen) screen.classList.add('active');
  }

  function prepareAuthCallback() {
    if (!hasKakaoCallback()) return;
    document.documentElement.dataset.gpAuthCallback = 'kakao';
    var appScreen = document.getElementById('appScreen');
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

  async function loadLanding() {
    var pageRoot = root();
    if (!pageRoot.querySelector('#landingScreen')) pageRoot.innerHTML = await fetchText('/pages/landing.html');
    showOnly('landing');
    document.documentElement.dataset.gpInitialScreen = 'landing';
    return 'landing';
  }

  function hydrateLandingDeferred() {
    var template = document.getElementById('landingDeferredTemplate');
    var screen = document.getElementById('landingScreen');
    if (!template || !screen || !template.content) return false;
    screen.appendChild(template.content.cloneNode(true));
    template.remove();
    window.dispatchEvent(new CustomEvent('gp:landing-deferred-ready'));
    return true;
  }

  async function loadPublicPricing() {
    var pricing = await fetchText('/pages/pricing.html');
    var pageRoot = root();
    pageRoot.innerHTML = '<div class="gp-public-shell">'
      + '<header class="gp-public-nav"><a href="/" class="gp-lp-brand"><img src="/assets/img/brand-logo-menu.webp" alt="교수님 피하기"></a>'
      + '<button type="button" data-public-login>로그인</button></header>'
      + '<main class="gp-public-main">' + pricing + '</main>'
      + '<footer class="gp-public-footer"><a href="/faq">자주 묻는 질문</a><a href="/qna">문의하기</a><span>지피코리아 · 213-11-67637</span></footer>'
      + '</div>';
    var publicMain = pageRoot.querySelector('.gp-public-main');
    var pricingContent = pageRoot.querySelector('#pricingContent');
    if (publicMain) {
      publicMain.id = 'mainContent';
      publicMain.dataset.mainDesign = 'lavender';
    }
    if (pricingContent) pricingContent.style.display = 'block';
    pageRoot.querySelectorAll('[onclick]').forEach(function (element) { element.removeAttribute('onclick'); });
    pageRoot.addEventListener('click', function (event) {
      var publicShell = event.target.closest('.gp-public-shell');
      if (!publicShell) return;
      if (event.target.closest('a[href]') && !event.target.closest('[data-public-login]')) return;
      if (event.target.closest('button')) {
        event.preventDefault();
        if (typeof window.gpLoadApp === 'function') window.gpLoadApp({ screen: 'login', tab: 'pricing' });
      }
    });
    document.documentElement.dataset.gpInitialScreen = 'public-pricing';
    document.documentElement.classList.add('design-ready');
    return 'public-pricing';
  }

  var appMarkupPromise = null;
  async function loadApp(options) {
    options = options || {};
    if (!appMarkupPromise) appMarkupPromise = appMarkup();
    root().innerHTML = await appMarkupPromise;
    window.dispatchEvent(new CustomEvent('gp:app-markup-ready'));
    document.documentElement.dataset.gpInitialScreen = 'app';
    window.PAGE_PARTIALS = APP_PARTIALS.slice();
    showOnly(options.screen === 'login' ? 'login' : 'app');
    prepareAuthCallback();
    return 'app';
  }

  removeSeoPrerender();
  var mode = initialMode();
  window.GPPageLoader = {
    initialMode: mode,
    loadApp: loadApp,
    hydrateLandingDeferred: hydrateLandingDeferred,
    hasCachedFirebaseUser: hasCachedFirebaseUser,
    hasKakaoCallback: hasKakaoCallback
  };
  window.GP_PAGE_READY = mode === 'landing'
    ? loadLanding()
    : mode === 'public-pricing'
      ? loadPublicPricing()
      : loadApp();
})();

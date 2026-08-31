(function () {
  'use strict';

  var ROUTE_PARTIALS = {
    main: '/pages/main.html',
    history: '/pages/history.html',
    notice: '/pages/notice.html',
    blog: '/pages/blog.html',
    detectReport: '/pages/detect-report.html',
    guide: '/pages/guide.html',
    faq: '/pages/faq.html',
    qna: '/pages/qna.html',
    pricing: '/pages/pricing.html',
    pro: '/pages/pro.html',
    mypage: '/pages/mypage.html',
    admin: '/pages/admin.html',
    adminHumanizeLab: '/pages/admin-humanize-lab.html',
    writingLab: '/pages/writing-lab.html'
  };
  var STANDARD_ROUTES = [
    'history', 'notice', 'blog', 'detectReport', 'guide', 'faq', 'qna', 'pricing', 'pro', 'mypage'
  ];
  var PRIVILEGED_ROUTES = ['admin', 'adminHumanizeLab', 'writingLab'];
  var APP_PARTIALS = [
    '/partials/login-screen.html',
    '/partials/app-shell-start.html'
  ].concat(Object.keys(ROUTE_PARTIALS).map(function (route) { return ROUTE_PARTIALS[route]; }), [
    '/partials/app-shell-end.html',
    '/partials/modals.html'
  ]);
  var loadedRoutes = new Set();
  var routePromises = new Map();
  var appMarkupReadyPromise = null;

  function fetchText(url) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : 0;
    return fetch(url, {
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('Failed to load page partial: ' + url);
      return response.text();
    }).then(function (text) {
      return String(text || '').replace(/^\uFEFF/u, '');
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('Timed out loading page partial: ' + url);
      throw error;
    }).finally(function () {
      if (timer) clearTimeout(timer);
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

  function routeFromPath() {
    var routes = {
      '/': 'main',
      '/main': 'main',
      '/history': 'history',
      '/notice': 'notice',
      '/blog': 'blog',
      '/detect-report': 'detectReport',
      '/guide': 'guide',
      '/faq': 'faq',
      '/qna': 'qna',
      '/pricing': 'pricing',
      '/pro': 'pro',
      '/mypage': 'mypage',
      '/admin': 'admin',
      '/admin-humanize-lab': 'adminHumanizeLab',
      '/writing-lab': 'writingLab'
    };
    return routes[normalizedPath()] || 'main';
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

  function markPresentRoutes(scope) {
    scope = scope || document;
    Object.keys(ROUTE_PARTIALS).forEach(function (route) {
      if (scope.querySelector && scope.querySelector('#' + route + 'Content')) loadedRoutes.add(route);
    });
  }

  async function appMarkup() {
    var initialRoute = routeFromPath();
    var routeList = initialRoute === 'main' ? ['main'] : ['main', initialRoute];
    var partials = [
      '/partials/login-screen.html',
      '/partials/app-shell-start.html'
    ].concat(routeList.map(function (route) { return ROUTE_PARTIALS[route]; }), [
      '/partials/app-shell-end.html',
      '/partials/modals.html'
    ]);
    try {
      var contents = await Promise.all(partials.map(function (url) { return fetchText(url); }));
      window.PAGE_PARTIAL_BUNDLE_USED = false;
      routeList.forEach(function (route) { loadedRoutes.add(route); });
      return contents.join('\n');
    } catch (error) {
      // 개별 파셜 중 하나가 일시적으로 누락되면 기존 단일 번들로 복구한다.
      // fetchText('/partials/app-bundle.html') 호출은 구 배포와의 롤백 호환 경계다.
      console.warn('Critical page partial unavailable; loading compatibility bundle.', error);
      var bundled = await fetchText('/partials/app-bundle.html');
      window.PAGE_PARTIAL_BUNDLE_USED = true;
      Object.keys(ROUTE_PARTIALS).forEach(function (route) { loadedRoutes.add(route); });
      return bundled;
    }
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

  function routeMount() {
    return document.getElementById('lavTabSlot') || document.querySelector('#appScreen .main-content');
  }

  function isRouteLoaded(route) {
    if (!ROUTE_PARTIALS[route]) return true;
    if (loadedRoutes.has(route)) return true;
    var present = !!document.getElementById(route + 'Content');
    if (present) loadedRoutes.add(route);
    return present;
  }

  function ensureRoute(route) {
    if (!ROUTE_PARTIALS[route] || isRouteLoaded(route)) return Promise.resolve(true);
    if (routePromises.has(route)) return routePromises.get(route);
    var promise = Promise.resolve(appMarkupReadyPromise).then(function () {
      if (isRouteLoaded(route)) return true;
      return fetchText(ROUTE_PARTIALS[route]).then(function (markup) {
        var mount = routeMount();
        if (!mount) throw new Error('Missing app route mount');
        mount.insertAdjacentHTML('beforeend', markup);
        loadedRoutes.add(route);
        window.dispatchEvent(new CustomEvent('gp:route-markup-ready', { detail: { route: route } }));
        return true;
      });
    }).finally(function () {
      routePromises.delete(route);
    });
    routePromises.set(route, promise);
    return promise;
  }

  var deferredAppPartialsPromise = null;
  function loadDeferredAppPartials() {
    if (deferredAppPartialsPromise) return deferredAppPartialsPromise;
    deferredAppPartialsPromise = Promise.resolve(appMarkupReadyPromise).then(function () {
      // 관리자·실험 화면은 권한 확인 뒤 ensureRoute로만 불러 일반 사용자 파싱 비용에서 제외한다.
      return Promise.all(STANDARD_ROUTES.map(ensureRoute));
    }).then(function () {
      window.dispatchEvent(new CustomEvent('gp:app-deferred-markup-ready'));
      return true;
    });
    return deferredAppPartialsPromise;
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
    if (!appMarkupReadyPromise) {
      appMarkupReadyPromise = appMarkupPromise.then(function (markup) {
        root().innerHTML = markup;
        markPresentRoutes(root());
        return true;
      });
    }
    await appMarkupReadyPromise;
    window.dispatchEvent(new CustomEvent('gp:app-markup-ready'));
    document.documentElement.dataset.gpInitialScreen = 'app';
    window.PAGE_PARTIALS = APP_PARTIALS.filter(function (url) {
      return !Object.keys(ROUTE_PARTIALS).some(function (route) {
        return ROUTE_PARTIALS[route] === url && !isRouteLoaded(route);
      });
    });
    showOnly(options.screen === 'login' ? 'login' : 'app');
    prepareAuthCallback();
    return 'app';
  }

  removeSeoPrerender();
  var mode = initialMode();
  window.GPPageLoader = {
    initialMode: mode,
    loadApp: loadApp,
    loadDeferredAppPartials: loadDeferredAppPartials,
    ensureRoute: ensureRoute,
    isRouteLoaded: isRouteLoaded,
    privilegedRoutes: PRIVILEGED_ROUTES.slice(),
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

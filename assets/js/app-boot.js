(function () {
  'use strict';

  if (window.GP_MAINTENANCE_BLOCKED) {
    document.documentElement.classList.add('design-ready');
    return;
  }

  var assetManifest = {};
  function assetPath(src) {
    return assetManifest[src] || src;
  }

  async function loadAssetManifest() {
    try {
      var response = await fetch('/asset-manifest.json', { cache: 'no-cache' });
      if (!response.ok) return;
      var body = await response.json();
      if (body && body.schemaVersion === 1 && body.assets) assetManifest = body.assets;
    } catch (_) {
      assetManifest = {};
    }
  }

  function loadScript(src, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-gp-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = assetPath(src);
      script.dataset.gpSrc = src;
      if (options.module) script.type = 'module';
      if (options.async) script.async = true;
      script.addEventListener('load', function () { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', function () { reject(new Error('Failed to load ' + src)); }, { once: true });
      document.head.appendChild(script);
    });
  }

  function loadStyle(href, id) {
    if (id && document.getElementById(id)) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetPath(href);
      if (id) link.id = id;
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', function () { reject(new Error('Failed to load ' + href)); }, { once: true });
      document.head.appendChild(link);
    });
  }

  function idle(task, timeout) {
    var run = function () {
      if ('requestIdleCallback' in window) requestIdleCallback(task, { timeout: timeout || 1800 });
      else setTimeout(task, 400);
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  function loadTrackingAfterFirstRender() {
    var started = false;
    function start() {
      if (started) return;
      started = true;
      window.removeEventListener('scroll', start);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      idle(function () {
        loadScript('/assets/js/head-tracking.js').catch(function (error) {
          console.warn('Tracking was skipped.', error);
        });
      }, 1800);
    }
    window.addEventListener('scroll', start, { once: true, passive: true });
    window.addEventListener('pointerdown', start, { once: true, passive: true });
    window.addEventListener('keydown', start, { once: true });
    // 무거운 광고 SDK는 실제 참여 뒤에만 불러 첫 화면과 수동 방문의 입력 응답성을 지킨다.
  }

  function scheduleLandingHydration() {
    if (!document.getElementById('landingDeferredTemplate')) return;
    var hydrated = false;
    var timer = 0;
    function hydrate() {
      if (hydrated) return;
      hydrated = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', hydrate);
      window.removeEventListener('pointerdown', hydrate);
      window.removeEventListener('keydown', hydrate);
      if (window.GPPageLoader) window.GPPageLoader.hydrateLandingDeferred();
    }
    window.addEventListener('scroll', hydrate, { once: true, passive: true });
    window.addEventListener('pointerdown', hydrate, { once: true, passive: true });
    window.addEventListener('keydown', hydrate, { once: true });
    // 스크롤·클릭·키보드에서는 즉시 채우고, 가만히 있는 첫 화면은 가볍게 유지한다.
    timer = setTimeout(hydrate, 12000);
  }

  var appAssetsPromise = null;
  function loadAppAssets() {
    if (appAssetsPromise) return appAssetsPromise;
    appAssetsPromise = (async function () {
      await Promise.all([
        loadStyle('/assets/css/app.css', 'gpAppCss'),
        loadStyle('/assets/css/redesign.css', 'gpRedesignCss'),
        loadStyle('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css', 'gpPretendardCss'),
        loadStyle('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0', 'gpMaterialSymbols')
      ]);
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) {
        await loadStyle('/assets/css/writing-lab.css', 'gpWritingLabCss');
      }
      // 가입·결제 콜백보다 전환 추적을 먼저 준비한다. 외부 SDK는 각 추적기가
      // 비동기로 불러오므로 앱 부팅을 막지 않는다.
      await loadScript('/assets/js/head-tracking.js');
      await loadScript('/assets/js/vendor-init.js');
      await loadScript('/assets/js/api.js');
      await loadScript('/assets/js/session-security.js');
      await loadScript('/assets/js/ui-feedback.js');
      await loadScript('/assets/js/modal-manager.js');
      await loadScript('/assets/js/conversion-flow.js');
      await loadScript('/assets/js/detect-presentation.js');
      await loadScript('/assets/js/app-main.js');
      await loadScript('/assets/js/input-quality.js');
      await loadScript('/assets/js/main-designs.js');
      await loadScript('/assets/js/evasion-flow.js');
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) await loadScript('/assets/js/writing-lab.js');
      await loadScript('/assets/js/app-module.js', { module: true });
      await loadScript('/assets/js/payment-callbacks.js', { module: true });
      idle(function () {
        loadScript('https://developers.kakao.com/sdk/js/kakao.min.js', { async: true })
          .then(function () { if (typeof window.onKakaoLoad === 'function') window.onKakaoLoad(); })
          .catch(function () { if (typeof window.onKakaoError === 'function') window.onKakaoError(); });
      }, 2400);
      loadTrackingAfterFirstRender();
      return true;
    })();
    return appAssetsPromise;
  }

  var socialLoginRequestPromise = null;
  window.gpRequestSocialLogin = async function (providerName) {
    var provider = providerName === 'kakao' ? 'kakao' : 'google';
    var handlerName = provider === 'kakao' ? 'kakaoLogin' : 'googleLogin';
    if (socialLoginRequestPromise) return socialLoginRequestPromise;
    socialLoginRequestPromise = (async function () {
      var buttons = [document.getElementById('googleLoginBtn'), document.getElementById('kakaoLoginBtn')];
      var status = document.getElementById('socialLoginStatus');
      var statusText = document.getElementById('socialLoginStatusText');
      buttons.forEach(function (button) {
        if (!button) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      });
      if (statusText) statusText.textContent = '로그인 기능을 준비하고 있어요.';
      if (status) status.hidden = false;
      try {
        if (typeof window[handlerName] !== 'function') await loadAppAssets();
        if (typeof window[handlerName] !== 'function') throw new Error('로그인 기능을 불러오지 못했어요.');
        return await window[handlerName]();
      } catch (error) {
        buttons.forEach(function (button) {
          if (!button) return;
          button.disabled = false;
          button.removeAttribute('aria-busy');
        });
        if (status) status.hidden = true;
        if (window.gpToast) window.gpToast(error.message || '로그인을 시작하지 못했어요.', { type: 'error', title: '로그인 확인 필요' });
        else window.alert(error.message || '로그인을 시작하지 못했어요.');
        return null;
      } finally {
        socialLoginRequestPromise = null;
      }
    })();
    return socialLoginRequestPromise;
  };

  window.gpEnsureWritingLab = async function () {
    await loadStyle('/assets/css/writing-lab.css', 'gpWritingLabCss');
    await loadScript('/assets/js/writing-lab.js');
  };

  window.gpLoadApp = async function (options) {
    options = options || {};
    window.GP_REQUESTED_APP_SCREEN = options.screen === 'login' ? 'login' : 'app';
    await Promise.all([window.GPPageLoader.loadApp(options), loadAppAssets()]);
    if (options.screen === 'login' && !window.CU && typeof window.showScreen === 'function') window.showScreen('login');
    else if (typeof window.showScreen === 'function') window.showScreen('app');
    if (options.tab && typeof window.switchTab === 'function') window.switchTab(options.tab);
    document.documentElement.classList.add('design-ready');
    return true;
  };

  async function boot() {
    await loadAssetManifest();
    await loadScript('/assets/js/page-loader.js');
    var mode = await window.GP_PAGE_READY;
    if (mode === 'landing') {
      await loadScript('/assets/js/landing.js');
      document.documentElement.classList.add('design-ready');
      scheduleLandingHydration();
      loadTrackingAfterFirstRender();
      return;
    }
    if (mode === 'public-pricing') {
      await Promise.all([
        loadStyle('/assets/css/app.css', 'gpAppCss'),
        loadStyle('/assets/css/redesign.css', 'gpRedesignCss'),
        loadStyle('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css', 'gpPretendardCss')
      ]);
      document.documentElement.classList.add('design-ready');
      loadTrackingAfterFirstRender();
      return;
    }
    await loadAppAssets();
    document.documentElement.classList.add('design-ready');
  }

  boot().catch(function (error) {
    console.error('Application boot failed.', error);
    document.documentElement.classList.add('design-ready');
    var root = document.getElementById('page-root');
    if (root && !root.textContent.trim()) root.innerHTML = '<main class="gp-boot-error"><h1>화면을 불러오지 못했어요</h1><p>잠시 후 새로고침해 주세요.</p></main>';
  });
})();

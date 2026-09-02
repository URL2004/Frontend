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
    var fallbackTimer = 0;
    function start() {
      if (started) return;
      started = true;
      clearTimeout(fallbackTimer);
      window.removeEventListener('scroll', start);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      idle(function () {
        loadScript('/assets/js/head-tracking.js')
          .then(function () { return loadScript('/assets/js/vendor-init.js'); })
          .then(function () {
            // 네이버 검수 봇과 클릭 없이 머무는 방문도 유입·전환 추적을 초기화한다.
            if (typeof window.gpEnsureNaverTracking === 'function') return window.gpEnsureNaverTracking();
          })
          .catch(function (error) {
            console.warn('Tracking was skipped.', error);
          });
      }, 1200);
    }
    window.addEventListener('scroll', start, { once: true, passive: true });
    window.addEventListener('pointerdown', start, { once: true, passive: true });
    window.addEventListener('keydown', start, { once: true });
    // 상호작용이 없어도 검수 봇과 첫 방문 유입을 놓치지 않도록 짧은 유예 뒤 시작한다.
    fallbackTimer = setTimeout(start, 900);
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
      // 첫 화면 아래 본문을 사용자 입력 뒤에 붙이면, 초기 DOM 높이가 뷰포트보다
      // 짧은 환경에서는 scroll 이벤트 자체가 발생하지 않는다. 그 결과 첫 클릭 전에는
      // 휠·트랙패드·터치 스크롤이 먹지 않는 것처럼 보인다. 템플릿은 이미 파싱돼 있고
      // 하단 이미지는 data-lp-src로 지연 로드되므로, 화면을 공개하기 전에 DOM만 복원한다.
      if (window.GPPageLoader) window.GPPageLoader.hydrateLandingDeferred();
      await loadScript('/assets/js/landing.js');
      document.documentElement.classList.add('design-ready');
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

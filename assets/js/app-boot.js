(function () {
  'use strict';

  if (window.GP_MAINTENANCE_BLOCKED) {
    document.documentElement.classList.add('design-ready');
    return;
  }

  var assetManifest = {};
  var DEFAULT_ASSET_TIMEOUT_MS = 12000;
  function assetPath(src) {
    return assetManifest[src] || src;
  }

  async function loadAssetManifest() {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 2500) : 0;
    try {
      var response = await fetch('/asset-manifest.json', {
        cache: 'no-cache',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) return;
      var body = await response.json();
      if (body && body.schemaVersion === 1 && body.assets) assetManifest = body.assets;
    } catch (_) {
      assetManifest = {};
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function loadScript(src, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_ASSET_TIMEOUT_MS;
      var settled = false;
      var timer = 0;
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        callback(value);
      }
      function onLoad(script) {
        script.dataset.loaded = '1';
        finish(resolve);
      }
      function onError(script) {
        if (script && script.parentNode) script.parentNode.removeChild(script);
        finish(reject, new Error('Failed to load ' + src));
      }
      var existing = document.querySelector('script[data-gp-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', function () { onLoad(existing); }, { once: true });
        existing.addEventListener('error', function () { onError(existing); }, { once: true });
        timer = setTimeout(function () {
          if (existing.parentNode) existing.parentNode.removeChild(existing);
          finish(reject, new Error('Timed out loading ' + src));
        }, timeoutMs);
        return;
      }
      var script = document.createElement('script');
      script.src = assetPath(src);
      script.dataset.gpSrc = src;
      if (options.module) script.type = 'module';
      // 동적 script의 기본값(async=true)을 명시적으로 끄면 병렬 다운로드와 실행 순서를
      // 함께 얻을 수 있다. 광고 SDK처럼 독립적인 자원만 options.async로 예외 처리한다.
      script.async = options.async === true;
      script.addEventListener('load', function () { onLoad(script); }, { once: true });
      script.addEventListener('error', function () { onError(script); }, { once: true });
      timer = setTimeout(function () {
        if (script.parentNode) script.parentNode.removeChild(script);
        finish(reject, new Error('Timed out loading ' + src));
      }, timeoutMs);
      document.head.appendChild(script);
    });
  }

  function loadStyle(href, id, options) {
    options = options || {};
    if (id && document.getElementById(id)) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_ASSET_TIMEOUT_MS;
      var settled = false;
      var timer = 0;
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        callback(value);
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetPath(href);
      if (id) link.id = id;
      link.addEventListener('load', function () { finish(resolve); }, { once: true });
      link.addEventListener('error', function () {
        if (link.parentNode) link.parentNode.removeChild(link);
        finish(reject, new Error('Failed to load ' + href));
      }, { once: true });
      timer = setTimeout(function () {
        if (link.parentNode) link.parentNode.removeChild(link);
        finish(reject, new Error('Timed out loading ' + href));
      }, timeoutMs);
      document.head.appendChild(link);
    });
  }

  function loadOptionalStyle(href, id) {
    // 외부 폰트는 시스템 폰트 폴백이 있으므로 첫 화면을 기다리게 하지 않는다.
    loadStyle(href, id, { timeoutMs: 6000 }).catch(function (error) {
      console.warn('Optional style was skipped.', error);
    });
  }

  function ensurePreconnect(origin) {
    if (!origin || document.querySelector('link[rel="preconnect"][href="' + origin + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
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
      // 익명 랜딩에는 연결 비용을 전가하지 않고, 앱 진입이 확정된 뒤에만
      // 폰트·Firebase의 TLS 연결을 앞당긴다.
      [
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
        'https://www.gstatic.com',
        'https://url88-d1d27.firebaseapp.com'
      ].forEach(ensurePreconnect);
      await Promise.all([
        loadStyle('/assets/css/app.css', 'gpAppCss'),
        loadStyle('/assets/css/redesign.css', 'gpRedesignCss')
      ]);
      loadOptionalStyle('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css', 'gpPretendardCss');
      loadOptionalStyle('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0', 'gpMaterialSymbols');
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) {
        await loadStyle('/assets/css/writing-lab.css', 'gpWritingLabCss');
      }
      // CSS와 현재 경로 마크업이 준비되면 바로 보여 주고, 나머지 화면과 동작은
      // 뒤에서 채운다. 실패하면 아래 boot catch가 명시적인 재시도 화면을 제공한다.
      document.documentElement.classList.add('design-ready');
      var deferredMarkup = window.GPPageLoader && window.GPPageLoader.loadDeferredAppPartials
        ? window.GPPageLoader.loadDeferredAppPartials()
        : Promise.resolve();

      // 각 그룹 안에서는 async=false인 동적 script가 다운로드는 병렬로 하되 선언한
      // 순서로 실행된다. 그룹 사이의 실제 전역 의존성만 await로 고정한다.
      await Promise.all([
        loadScript('/assets/js/vendor-init.js'),
        loadScript('/assets/js/api.js'),
        loadScript('/assets/js/session-security.js'),
        loadScript('/assets/js/ui-feedback.js'),
        loadScript('/assets/js/modal-manager.js')
      ]);
      await deferredMarkup;
      await Promise.all([
        loadScript('/assets/js/conversion-flow.js'),
        loadScript('/assets/js/detect-presentation.js'),
        loadScript('/assets/js/app-main.js'),
        loadScript('/assets/js/input-quality.js')
      ]);
      await Promise.all([
        loadScript('/assets/js/main-designs.js'),
        loadScript('/assets/js/evasion-flow.js')
      ]);
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) await loadScript('/assets/js/writing-lab.js');
      await loadScript('/assets/js/app-module.js', { module: true });
      await loadScript('/assets/js/payment-callbacks.js', { module: true });
      installLazyRouteGuards();
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
    if (window.GPPageLoader && window.GPPageLoader.ensureRoute) {
      await window.GPPageLoader.ensureRoute('writingLab');
    }
    await loadStyle('/assets/css/writing-lab.css', 'gpWritingLabCss');
    await loadScript('/assets/js/writing-lab.js');
  };

  function installLazyRouteGuards() {
    if (!window.GPPageLoader || !window.GPPageLoader.ensureRoute || window.__gpLazyRouteGuards) return;
    window.__gpLazyRouteGuards = true;
    var originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function') {
      window.switchTab = function (tab, options) {
        if (!window.GPPageLoader.isRouteLoaded || window.GPPageLoader.isRouteLoaded(tab)) {
          return originalSwitchTab.call(window, tab, options);
        }
        return window.GPPageLoader.ensureRoute(tab).then(function () {
          return originalSwitchTab.call(window, tab, options);
        }).catch(function (error) {
          console.error('Route markup failed to load.', error);
          if (window.gpToast) window.gpToast('화면을 불러오지 못했어요. 다시 시도해 주세요.', { type: 'error', title: '화면 로드 오류' });
        });
      };
    }
    ['openAdminPage', 'openAdminHumanizeLab'].forEach(function (name) {
      var route = name === 'openAdminPage' ? 'admin' : 'adminHumanizeLab';
      var original = window[name];
      if (typeof original !== 'function') return;
      window[name] = async function () {
        await window.GPPageLoader.ensureRoute(route);
        return original.apply(window, arguments);
      };
    });
  }

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
        loadStyle('/assets/css/redesign.css', 'gpRedesignCss')
      ]);
      loadOptionalStyle('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css', 'gpPretendardCss');
      document.documentElement.classList.add('design-ready');
      loadTrackingAfterFirstRender();
      return;
    }
    await loadAppAssets();
    document.documentElement.classList.add('design-ready');
  }

  function showBootFailure() {
    var root = document.getElementById('page-root');
    if (!root) return;
    root.innerHTML = '<main class="gp-boot-error" role="alert" style="min-height:100dvh;display:grid;place-content:center;gap:12px;padding:32px;text-align:center;font-family:system-ui,sans-serif;color:#171a2b;background:#f7f7fc">'
      + '<h1 style="margin:0;font-size:24px">화면을 불러오지 못했어요</h1>'
      + '<p style="margin:0;color:#565d73">네트워크를 확인한 뒤 다시 시도해 주세요.</p>'
      + '<button type="button" data-gp-boot-retry style="min-height:44px;margin:8px auto 0;padding:10px 18px;border:0;border-radius:10px;background:#4b4cc6;color:#fff;font-weight:700;cursor:pointer">다시 시도</button>'
      + '</main>';
    var retry = root.querySelector('[data-gp-boot-retry]');
    if (retry) retry.addEventListener('click', function () { window.location.reload(); }, { once: true });
  }

  boot().catch(function (error) {
    console.error('Application boot failed.', error);
    document.documentElement.classList.add('design-ready');
    showBootFailure();
  });
})();

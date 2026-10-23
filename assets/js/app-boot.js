// Capture before landing navigation or Firebase/CDN loading can remove ?ref.
(function initReferralContext() {
  'use strict';
  var KEY = 'gp_pending_referral_v1', TTL = 30 * 24 * 60 * 60 * 1000;
  var memory, capturedCode = '', unavailable = {};
  function stores() {
    return ['localStorage', 'sessionStorage'].filter(function (name) { return !unavailable[name]; });
  }
  function stamp(raw) {
    try { var value = JSON.parse(raw); return Number(value && (value.updatedAt || value.at)) || 0; } catch (_) { return 0; }
  }
  function read(key) {
    var latest = key === KEY ? memory : null;
    for (var name of stores()) {
      try {
        var value = window[name].getItem(key);
        if (value != null && key !== KEY) return value;
        if (value != null && (latest == null || stamp(value) > stamp(latest))) latest = value;
      } catch (_) { unavailable[name] = true; }
    }
    return latest;
  }
  function save(value) {
    var updatedAt = Math.max(Date.now(), stamp(read(KEY)) + 1);
    value = Object.assign({}, value || { code: '', at: Date.now(), uid: '' }, { updatedAt: updatedAt });
    memory = JSON.stringify(value);
    for (var name of stores()) {
      try { window[name].setItem(KEY, memory); } catch (_) { unavailable[name] = true; }
      try { window[name].removeItem('pendingRef'); } catch (_) {}
    }
  }
  function validCode(code) { return typeof code === 'string' && /^[A-Za-z0-9_-]{8}$/.test(code); }
  function current() {
    var raw = read(KEY), value;
    if (raw == null) {
      var legacy = read('pendingRef');
      if (validCode(legacy)) { value = { code: legacy, at: Date.now(), uid: '' }; save(value); return value; }
      return null;
    }
    try { value = JSON.parse(raw); } catch (_) { return null; }
    if (!value || !validCode(value.code) || !Number.isFinite(value.at)
      || value.at > Date.now() + 60000 || Date.now() - value.at > TTL) return null;
    return value;
  }
  function capture() {
    var code;
    try { code = new URLSearchParams(window.location.search).get('ref'); } catch (_) { return; }
    if (!validCode(code) || code === capturedCode) return;
    capturedCode = code;
    var previous = current();
    // Reloading the same link must not detach a retry from its original account.
    if (previous && previous.code === code) return;
    save({ code: code, at: Date.now(), uid: '' });
  }
  window.gpReferralContext = {
    capture: capture,
    claim: function (uid) {
      if (typeof uid !== 'string' || !uid) return null;
      var value = current();
      if (!value || value.uid && value.uid !== uid) return null;
      if (!value.uid) { value.uid = uid; save(value); }
      return value;
    },
    complete: function (ticket) {
      var value = current();
      if (value && ticket && value.code === ticket.code && value.uid === ticket.uid && value.at === ticket.at) save(null);
    }
  };
  capture();
})();

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
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', function () { reject(new Error('Failed to load ' + src)); }, { once: true });
        }
        return;
      }
      var script = document.createElement('script');
      script.src = assetPath(src);
      script.dataset.gpSrc = src;
      if (options.module) script.type = 'module';
      if (options.async) script.async = true;
      script.addEventListener('load', function () { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', function () {
        script.remove();
        reject(new Error('Failed to load ' + src));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function loadStyle(href, id) {
    return new Promise(function (resolve, reject) {
      var existing = id && document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === '1' || existing.sheet) resolve();
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', function () { reject(new Error('Failed to load ' + href)); }, { once: true });
        }
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetPath(href);
      if (id) link.id = id;
      link.addEventListener('load', function () { link.dataset.loaded = '1'; resolve(); }, { once: true });
      link.addEventListener('error', function () {
        link.remove();
        reject(new Error('Failed to load ' + href));
      }, { once: true });
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
    // 첫 랜딩이 준비된 직후 비동기로 시작한다. load/idle/첫 클릭 대기는
    // 짧은 인앱 방문의 실제 유입을 빠뜨리고 CTA를 첫 이벤트로 만들었다.
    return loadScript('/assets/js/head-tracking.js')
          .then(function () { return loadScript('/assets/js/vendor-init.js'); })
          .then(function () {
            // 네이버 검수 봇과 클릭 없이 머무는 방문도 유입·전환 추적을 초기화한다.
            if (typeof window.gpEnsureNaverTracking === 'function') return window.gpEnsureNaverTracking();
          })
          .catch(function (error) {
            console.warn('Tracking was skipped.', error);
          });
  }

  var appAssetsPromise = null;
  function preloadAppScripts() {
    var scripts = ['head-tracking', 'login-continuity', 'vendor-init', 'api', 'session-security', 'ui-feedback',
      'modal-manager', 'humanize-pricing', 'conversion-flow', 'refund-accounting', 'detect-interpretation', 'detect-presentation',
      'app-main', 'input-quality', 'main-designs', 'evasion-flow', 'app-module', 'payment-callbacks'];
    scripts.forEach(function (name) {
      var link = document.createElement('link');
      link.rel = name === 'app-module' || name === 'payment-callbacks' ? 'modulepreload' : 'preload';
      if (link.rel === 'preload') link.as = 'script';
      link.href = assetPath('/assets/js/' + name + '.js');
      document.head.appendChild(link);
    });
  }
  function loadAppAssets() {
    if (appAssetsPromise) return appAssetsPromise;
    appAssetsPromise = (async function () {
      preloadAppScripts();
      var stylesReady = Promise.all([
        loadStyle('/assets/css/app.css', 'gpAppCss'),
        loadStyle('/assets/css/redesign.css', 'gpRedesignCss')
      ]);
      stylesReady.catch(function () {}); // Observe rejection immediately; the awaited promise still fails boot.
      // Fonts enhance rendering but must not gate authentication or app startup.
      Promise.allSettled([
        loadStyle('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css', 'gpPretendardCss'),
        loadStyle('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0', 'gpMaterialSymbols')
      ]);
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) {
        await loadStyle('/assets/css/writing-lab.css', 'gpWritingLabCss');
      }
      // 가입·결제 콜백보다 전환 추적을 먼저 준비한다. 외부 SDK는 각 추적기가
      // 비동기로 불러오므로 앱 부팅을 막지 않는다.
      await loadScript('/assets/js/head-tracking.js');
      await loadScript('/assets/js/login-continuity.js');
      await loadScript('/assets/js/vendor-init.js');
      await loadScript('/assets/js/api.js');
      await loadScript('/assets/js/auth-diagnostics.js');
      await loadScript('/assets/js/session-security.js');
      await loadScript('/assets/js/ui-feedback.js');
      await loadScript('/assets/js/modal-manager.js');
      await loadScript('/assets/js/humanize-pricing.js');
      await loadScript('/assets/js/conversion-flow.js');
      await loadScript('/assets/js/refund-accounting.js');
      await loadScript('/assets/js/detect-interpretation.js');
      await loadScript('/assets/js/detect-presentation.js');
      await loadScript('/assets/js/pdf-text-layout.js');
      await loadScript('/assets/js/app-main.js');
      await loadScript('/assets/js/input-quality.js');
      await loadScript('/assets/js/main-designs.js');
      await loadScript('/assets/js/evasion-flow.js');
      if (/^\/writing-lab(?:\/|$)/.test(window.location.pathname)) await loadScript('/assets/js/writing-lab.js');
      await loadScript('/assets/js/app-module.js', { module: true });
      await loadScript('/assets/js/payment-callbacks.js', { module: true });
      await stylesReady;
      idle(function () {
        loadScript('https://developers.kakao.com/sdk/js/kakao.min.js', { async: true })
          .then(function () { if (typeof window.onKakaoLoad === 'function') window.onKakaoLoad(); })
          .catch(function () { if (typeof window.onKakaoError === 'function') window.onKakaoError(); });
      }, 2400);
      loadTrackingAfterFirstRender();
      return true;
    })().catch(function (error) {
      // An earlier failed module must not leave every later login attempt
      // attached to a permanently rejected promise or a dead script element.
      appAssetsPromise = null;
      throw error;
    });
    return appAssetsPromise;
  }

  var newSentenceRequestPromise = null;
  window.gpRequestNewSentence = async function () {
    if (newSentenceRequestPromise) return newSentenceRequestPromise;
    newSentenceRequestPromise = (async function () {
      try {
        // Wait for both the handler and the running-job guard. Loading just
        // main-designs.js can otherwise clear the editor before evasion-flow.
        await loadAppAssets();
        if (typeof window.lavNewSentence !== 'function' || typeof window.lavPrepareNewSentence !== 'function') {
          throw new Error('NEW_SENTENCE_NOT_READY');
        }
        return window.lavNewSentence();
      } catch (_) {
        var message = '새 글 쓰기 기능을 준비하지 못했어요. 작성 중인 글은 유지돼요. 잠시 후 다시 눌러 주세요.';
        if (window.gpToast) window.gpToast(message, { type: 'error' });
        else window.alert(message);
        return false;
      } finally {
        newSentenceRequestPromise = null;
      }
    })();
    return newSentenceRequestPromise;
  };

  var socialLoginRequestPromise = null;
  // Direct app routes do not load landing.js, but share its login-screen button.
  window.gpLandingBackHome = function () {
    if (typeof window.showScreen === 'function' && typeof window.switchTab === 'function') {
      window.showScreen('app');
      window.switchTab('main');
    } else window.location.assign('/');
  };
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
        var neededAssets = typeof window[handlerName] !== 'function';
        if (neededAssets) await loadAppAssets();
        if (typeof window[handlerName] !== 'function') throw new Error('로그인 기능을 불러오지 못했어요.');
        if (window.gpLoginContinuity?.[provider === 'google' ? 'googleExternal' : 'kakaoExternal']) {
          buttons.forEach(function (button) {
            if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
          });
          if (status) status.hidden = true;
          return await window.gpLoginContinuity.openExternal();
        }
        var waitedForKakao = provider === 'kakao' && !window.Kakao?.Auth && typeof window.gpPrepareKakaoLogin === 'function';
        if (waitedForKakao) await window.gpPrepareKakaoLogin();
        // A network wait can consume the click's popup permission. Let the next
        // explicit click open the provider instead of attempting a blocked popup.
        if ((neededAssets || waitedForKakao) && !navigator.userActivation?.isActive) {
          buttons.forEach(function (button) {
            if (!button) return;
            button.disabled = false;
            button.removeAttribute('aria-busy');
          });
          if (statusText) statusText.textContent = '준비됐어요. ' + (provider === 'kakao' ? '카카오' : 'Google') + ' 로그인 버튼을 한 번 더 눌러 주세요.';
          return null;
        }
        return await window[handlerName]();
      } catch (error) {
        if (window.gpAuthDiagnostics) {
          var failedAttempt = window.gpAuthDiagnostics.start(provider, 'popup');
          window.gpAuthDiagnostics.stage(failedAttempt, 'sdk');
          window.gpAuthDiagnostics.finish(failedAttempt, 'error', error);
        }
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
    window.gpLoginContinuity?.apply();
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
    window.gpLoginContinuity?.apply();
    document.documentElement.classList.add('design-ready');
  }

  boot().catch(function (error) {
    console.error('Application boot failed.', error);
    document.documentElement.classList.add('design-ready');
    var root = document.getElementById('page-root');
    // The shell can already contain text when an authentication module fails.
    // Keep that shell/input intact while making the failure visible.
    if (!document.getElementById('gpBootError')) {
      var notice = document.createElement('div');
      notice.id = 'gpBootError'; notice.className = 'gp-boot-error';
      notice.setAttribute('role', 'alert');
      var message = document.createElement('p');
      message.textContent = '일부 화면 기능을 불러오지 못했어요. 네트워크 연결을 확인해 주세요. 입력한 글이 있다면 복사해 둔 뒤 새로고침해 주세요.';
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '새로고침';
      retry.addEventListener('click', function () { window.location.reload(); });
      notice.appendChild(message); notice.appendChild(retry);
      (root || document.body).prepend(notice);
    }
  });
})();

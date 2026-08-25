/* 비로그인 랜딩(E) — 화면 전환과 CTA.
   왜 별도 스크린인가: 광고·검색으로 처음 온 사람에게 빈 입력창을 보여주면 무엇을 파는 서비스인지
   알 수 없다. 로그인 사용자는 지금까지처럼 바로 작업 화면으로 들어간다.

   노출 규칙(하나라도 어긋나면 기존 앱 화면):
     · 경로가 '/'(main 라우트)
     · 로그인 상태가 아님(authReady 확정 후 판단 — 로그인 사용자에게 랜딩이 깜빡이지 않게)
     · ?mode=detect|humanize 없음 — 광고 딥링크는 컴포저 직행 의도이므로 그대로 존중한다
     · 이 세션에서 '먼저 둘러보기'로 랜딩을 내리지 않았음 */
(function () {
  'use strict';

  var DISMISS_KEY = 'gp_landing_dismissed_v1';

  function track(name, params) {
    if (typeof window.gpTrack === 'function') window.gpTrack(name, params || {});
  }

  function dismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
  }

  function setDismissed(value) {
    try {
      if (value) sessionStorage.setItem(DISMISS_KEY, '1');
      else sessionStorage.removeItem(DISMISS_KEY);
    } catch (_) {}
  }

  function isHomePath() {
    var path = String(window.location.pathname || '/').replace(/\/index\.html$/i, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (window.location.hash && window.location.hash.length > 2) return false;
    return path === '' || path === '/';
  }

  function hasAdLandingMode() {
    var requested = String(new URLSearchParams(window.location.search || '').get('mode') || '').toLowerCase();
    return requested === 'detect' || requested === 'humanize';
  }

  function eligible() {
    if (window.CU) return false;
    if (dismissed()) return false;
    if (!isHomePath()) return false;
    if (hasAdLandingMode()) return false;
    return !!document.getElementById('landingScreen');
  }

  function applyLanding() {
    if (!eligible()) return false;
    if (typeof window.showScreen === 'function') window.showScreen('landing');
    var screen = document.getElementById('landingScreen');
    if (screen && !screen.dataset.viewed) {
      screen.dataset.viewed = '1';
      track('landing_view', { surface: 'landing' });
    }
    return true;
  }

  // 인증이 확정되기 전에 화면을 바꾸면 로그인 사용자에게 랜딩이 한 번 스쳐 지나간다.
  window.gpMaybeShowLanding = function () {
    if (window.authReady && typeof window.authReady.then === 'function') {
      window.authReady.then(applyLanding, applyLanding);
      return;
    }
    applyLanding();
  };

  // 로그아웃 시에는 다시 랜딩부터 보여준다.
  window.gpLandingReset = function () {
    setDismissed(false);
    var screen = document.getElementById('landingScreen');
    if (screen) delete screen.dataset.viewed;
  };

  window.gpLandingStart = function (source) {
    track('landing_signup_click', { source: source || 'landing', surface: 'landing' });
    if (typeof window.showScreen === 'function') window.showScreen('login');
  };

  window.gpLandingEnterApp = function (tabName, source) {
    track('landing_enter_app', { source: source || 'landing', target_tab: tabName || 'main', surface: 'landing' });
    setDismissed(true);
    if (typeof window.showScreen === 'function') window.showScreen('app');
    if (typeof window.switchTab === 'function') window.switchTab(tabName || 'main');
    if (tabName === 'qna' && typeof window.loadQuestions === 'function') window.loadQuestions();
    if (tabName === 'notice' && typeof window.loadNotices === 'function') window.loadNotices();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  window.gpLandingScrollTo = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  window.gpLandingHome = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
  };

  // 로그인 화면의 '홈으로 돌아가기' — 비로그인이면 랜딩으로, 그 외에는 앱 메인으로.
  window.gpLandingBackHome = function () {
    if (!window.CU && !dismissed() && document.getElementById('landingScreen')) {
      if (typeof window.showScreen === 'function') window.showScreen('landing');
      return;
    }
    if (typeof window.showScreen === 'function') window.showScreen('app');
    if (typeof window.switchTab === 'function') window.switchTab('main');
  };
})();

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
  var LOGIN_PENDING_KEY = 'gp_landing_login_pending_v1';
  var landingLoginPendingMemory = false;

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

  function landingLoginPending() {
    try { return sessionStorage.getItem(LOGIN_PENDING_KEY) === '1' || landingLoginPendingMemory; }
    catch (_) { return landingLoginPendingMemory; }
  }

  function setLandingLoginPending(value) {
    landingLoginPendingMemory = !!value;
    try {
      if (value) sessionStorage.setItem(LOGIN_PENDING_KEY, '1');
      else sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } catch (_) {}
  }

  function removeLandingOverride() {
    var url = new URL(window.location.href);
    if (!url.searchParams.has('lp')) return;
    url.searchParams.delete('lp');
    var query = url.searchParams.toString();
    var next = url.pathname + (query ? '?' + query : '') + url.hash;
    window.history.replaceState(window.history.state, '', next);
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

  // ?lp= 강제 스위치(2026-08-26 사장님): 광고 소재별 지정과 관리자 확인용.
  //  · lp=1 → 로그인·경로·둘러보기 이력과 무관하게 랜딩 강제
  //  · lp=0 → 비로그인 홈이어도 랜딩 스킵(앱 직행)
  //  그 외 값·부재 → 기본 규칙.
  function landingOverride() {
    var lp = new URLSearchParams(window.location.search || '').get('lp');
    if (lp === '1') return 'force';
    if (lp === '0') return 'skip';
    return '';
  }

  // 로컬 전용: ?preview_segment=...는 앱 화면의 상태별 오퍼를 보려는 파라미터이므로 랜딩을 건너뛴다.
  function hasLocalSegmentPreview() {
    var isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (!isLocal) return false;
    return !!new URLSearchParams(window.location.search || '').get('preview_segment');
  }

  function eligible() {
    var override = landingOverride();
    if (override === 'force') return !!document.getElementById('landingScreen');
    if (override === 'skip') return false;
    if (window.CU) return false;
    if (dismissed()) return false;
    if (!isHomePath()) return false;
    if (hasAdLandingMode()) return false;
    if (hasLocalSegmentPreview()) return false;
    return !!document.getElementById('landingScreen');
  }

  function applyLanding() {
    if (!eligible()) return false;
    if (typeof window.showScreen === 'function') window.showScreen('landing');
    var screen = document.getElementById('landingScreen');
    if (screen && !screen.dataset.viewed) {
      screen.dataset.viewed = '1';
      track('landing_view', { surface: 'landing', forced: landingOverride() === 'force' ? 1 : 0 });
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
    setLandingLoginPending(false);
    var screen = document.getElementById('landingScreen');
    if (screen) delete screen.dataset.viewed;
  };

  window.gpLandingStart = function (source) {
    track('landing_signup_click', { source: source || 'landing', surface: 'landing' });
    setLandingLoginPending(true);
    if (typeof window.showScreen === 'function') window.showScreen('login');
  };

  // 랜딩에서 시작한 로그인만 완료 처리한다. 관리자 미리보기 등 로그인 상태에서
  // 직접 ?lp=1을 연 경우에는 강제 랜딩 동작을 그대로 유지한다.
  window.gpLandingCompleteLogin = function () {
    if (!landingLoginPending()) return false;
    setLandingLoginPending(false);
    setDismissed(true);
    removeLandingOverride();
    return true;
  };

  window.gpLandingEnterApp = function (tabName, source) {
    track('landing_enter_app', { source: source || 'landing', target_tab: tabName || 'main', surface: 'landing' });
    setLandingLoginPending(false);
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

  // ── 공지 바(글쓰기 랩 예고) ─────────────────────────────────────────────
  window.gpLandingNotice = function () {
    track('landing_notice_click', { surface: 'landing', topic: 'writing_lab_soon' });
    setLandingLoginPending(true);
    if (typeof window.showScreen === 'function') window.showScreen('login');
  };

  // ── 서비스 블렌드 탭(코다 벤치마킹) ─────────────────────────────────────
  // 좌측 항목을 고르면 우측 실제 화면이 바뀐다. 글쓰기 랩은 오픈 전이라 오버레이로 정직하게 표시.
  var BLEND = [
    { img: '/assets/img/landing/shot-detect.png',   alt: 'AI 감지 보고서 화면',        soon: false,
      note: '글 전체의 AI 티 지수와 함께 어느 문단이 위험한지 문단별로 보여줍니다.' },
    { img: '/assets/img/landing/shot-done.png',     alt: '기본 휴머나이징 결과 화면',   soon: false,
      note: '원문의 장르와 말투와 사실을 지키면서 AI식 반복과 균일한 문장 흐름을 다시 구성합니다.' },
    { img: '/assets/img/landing/shot-settings.png', alt: '고급 휴머나이징 설정 화면',   soon: false,
      note: '더 넓은 범위를 재구성하고 모든 글에 의미·사실·구조 정밀 검증을 적용합니다. 직접 승인한 근거만 인용해요.' },
    { img: '/assets/img/landing/shot-composer.png', alt: '글쓰기 랩(오픈 준비 중)',     soon: true,
      note: '장르별 질문에 아는 것만 답하면 자기소개서·후기·소개 글을 만들어요. 답하지 않은 내용은 지어내지 않습니다.' }
  ];

  window.gpLandingBlendPick = function (index) {
    var item = BLEND[index] || BLEND[0];
    document.querySelectorAll('.gp-lp-blend-list button').forEach(function (btn) {
      var on = Number(btn.dataset.blend) === index;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var img = document.getElementById('lpBlendImg');
    if (img) { img.src = item.img; img.alt = item.alt; }
    var soon = document.getElementById('lpBlendSoon');
    if (soon) soon.hidden = !item.soon;
    var note = document.getElementById('lpBlendNote');
    if (note) note.textContent = item.note;
    track('landing_blend_pick', { surface: 'landing', blend_index: index });
  };

  // ── 히어로 라이브 데모(사장님 지시: 실제 사용 장면처럼) ───────────────────
  // 영상 파일이 아니라 DOM 애니메이션으로 5장면 루프:
  //   1 타이핑 → 2 예상 비용 → 3 분석 중 → 4 감지 보고서(게이지) → 5 휴머나이징 결과.
  // 수치는 실제 단가와 일치(아래 문장 85자 → 감지 ceil(85/100)=1크레딧).
  // reduced-motion이면 마지막 장면 정지, 화면 밖이면 일시정지, 리셋 시 타이머 전부 정리.
  var DEMO_TEXT = '본 연구에서는 다양한 요인을 종합적으로 고려하여 분석을 진행하였다. 이러한 결과는 여러 선행연구와 맥락을 같이 하는 것으로 판단된다.';
  var demoTimers = [];
  var demoRunning = false;

  function demoEl(id) { return document.getElementById(id); }
  function demoLater(fn, ms) { demoTimers.push(setTimeout(fn, ms)); }
  function demoClear() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
  }
  function demoScene(n) {
    var box = demoEl('lpDemo');
    if (box) box.dataset.scene = String(n);
  }
  function demoReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function demoCycle() {
    var typeEl = demoEl('lpDemoType');
    var lenEl = demoEl('lpDemoLen');
    var costEl = demoEl('lpDemoCost');
    var arc = demoEl('lpDemoArc');
    var prob = demoEl('lpDemoProb');
    var send = demoEl('lpDemoSend');
    if (!typeEl || !lenEl) return;

    // 리셋
    typeEl.textContent = '';
    lenEl.textContent = '0';
    if (costEl) costEl.textContent = '0';
    if (prob) prob.textContent = '0';
    if (arc) arc.style.strokeDashoffset = '264';
    if (send) send.classList.remove('pressed');
    demoScene(1);

    // 장면 1: 타이핑(2글자씩 40ms — 약 1.8초)
    var i = 0;
    (function typeStep() {
      if (!demoRunning) return;
      i = Math.min(DEMO_TEXT.length, i + 2);
      typeEl.textContent = DEMO_TEXT.slice(0, i);
      lenEl.textContent = String(i);
      if (i < DEMO_TEXT.length) demoLater(typeStep, 40);
    })();

    // 장면 2: 예상 비용(카운트 1)
    demoLater(function () {
      demoScene(2);
      if (costEl) costEl.textContent = '1';
    }, 2600);

    // 장면 3: 전송 눌림 → 분석
    demoLater(function () { if (send) send.classList.add('pressed'); }, 4400);
    demoLater(function () { demoScene(3); }, 4700);

    // 장면 4: 감지 보고서 — 게이지 78%까지, 숫자 카운트업
    demoLater(function () {
      demoScene(4);
      if (arc) arc.style.strokeDashoffset = String(Math.round(264 * (1 - 0.78)));
      var v = 0;
      (function count() {
        if (!demoRunning) return;
        v = Math.min(78, v + 3);
        if (prob) prob.textContent = String(v);
        if (v < 78) demoLater(count, 55);
      })();
    }, 7200);

    // 장면 5: 휴머나이징 결과 → 홀드 후 루프
    demoLater(function () { demoScene(5); }, 11200);
    demoLater(function () { if (demoRunning) demoCycle(); }, 15400);
  }

  function demoStart() {
    if (demoRunning || !demoEl('lpDemo')) return;
    if (demoReduced()) { demoFinalFrame(); return; }
    demoRunning = true;
    demoCycle();
  }
  function demoStop() {
    demoRunning = false;
    demoClear();
  }
  function demoFinalFrame() {
    // 모션 최소화 환경: 마지막 결과 장면을 정지 화면으로
    demoScene(5);
    var prob = demoEl('lpDemoProb');
    var arc = demoEl('lpDemoArc');
    if (prob) prob.textContent = '78';
    if (arc) arc.style.strokeDashoffset = String(Math.round(264 * (1 - 0.78)));
  }

  function demoInit() {
    var box = demoEl('lpDemo');
    if (!box) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) demoStart();
          else demoStop();
        });
      }, { threshold: 0.25 });
      io.observe(box);
    } else {
      demoStart();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) demoStop();
      else if (demoEl('lpDemo') && !document.getElementById('landingScreen').hidden) demoStart();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demoInit);
  else demoInit();

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

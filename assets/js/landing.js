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
    if (landingOverride() === 'force' || document.documentElement.dataset.gpInitialScreen === 'landing' || window.gpAuthResolved) {
      applyLanding();
      return;
    }
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

  window.gpLandingStart = async function (source) {
    track('landing_signup_click', { source: source || 'landing', surface: 'landing' });
    setLandingLoginPending(true);
    if (typeof window.gpLoadApp === 'function') await window.gpLoadApp({ screen: 'login' });
    else if (typeof window.showScreen === 'function') window.showScreen('login');
    if (typeof window.gpWarmAuthBackend === 'function') window.gpWarmAuthBackend();
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

  window.gpLandingEnterApp = async function (tabName, source) {
    track('landing_enter_app', { source: source || 'landing', target_tab: tabName || 'main', surface: 'landing' });
    setLandingLoginPending(false);
    setDismissed(true);
    if (typeof window.gpLoadApp === 'function') await window.gpLoadApp({ screen: 'app', tab: tabName || 'main' });
    else {
      if (typeof window.showScreen === 'function') window.showScreen('app');
      if (typeof window.switchTab === 'function') window.switchTab(tabName || 'main');
    }
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
  window.gpLandingNotice = async function () {
    track('landing_notice_click', { surface: 'landing', topic: 'writing_lab_soon' });
    setLandingLoginPending(true);
    if (typeof window.gpLoadApp === 'function') await window.gpLoadApp({ screen: 'login' });
    else if (typeof window.showScreen === 'function') window.showScreen('login');
    if (typeof window.gpWarmAuthBackend === 'function') window.gpWarmAuthBackend();
  };

  var BLEND = [
    { img: '/assets/img/landing/shot-detect.webp',   alt: 'AI 감지 보고서 화면',        soon: false,
      note: '글 전체의 AI 티 지수와 함께 주의가 필요한 문단을 보여줘요.' },
    { img: '/assets/img/landing/shot-done.webp',     alt: '기본 휴머나이징 결과 화면',   soon: false,
      note: '원문의 장르와 말투와 사실을 지키면서 AI식 반복과 균일한 문장 흐름을 다시 구성해요.' },
    { img: '/assets/img/landing/shot-settings.webp', alt: '고급 휴머나이징 설정 화면',   soon: false,
      note: '더 넓은 범위를 재구성하고 모든 글에 의미·사실·구조 정밀 검증을 적용해요. 직접 승인한 근거만 인용해요.' },
    { img: '/assets/img/landing/shot-composer.webp', alt: '글쓰기 랩(준비 중)',     soon: true,
      note: '장르별 질문에 아는 것만 답하면 자기소개서·후기·소개 글을 만들어요. 답하지 않은 내용은 지어내지 않아요.' }
  ];

  window.gpLandingBlendPick = function (index) {
    var item = BLEND[index] || BLEND[0];
    document.querySelectorAll('.gp-lp-blend-list button').forEach(function (btn) {
      var on = Number(btn.dataset.blend) === index;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var img = document.getElementById('lpBlendImg');
    if (img) { img.src = item.img; img.alt = item.alt; delete img.dataset.lpSrc; }
    var soon = document.getElementById('lpBlendSoon');
    if (soon) soon.hidden = !item.soon;
    var note = document.getElementById('lpBlendNote');
    if (note) note.textContent = item.note;
    track('landing_blend_pick', { surface: 'landing', blend_index: index });
  };

  function initDeferredLandingImages() {
    var images = document.querySelectorAll('#landingScreen img[data-lp-src]');
    function load(img) {
      if (!img.dataset.lpSrc) return;
      img.src = img.dataset.lpSrc;
      delete img.dataset.lpSrc;
    }
    if (!('IntersectionObserver' in window)) {
      images.forEach(load);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        load(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '240px 0px' });
    images.forEach(function (img) { observer.observe(img); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDeferredLandingImages, { once: true });
  else initDeferredLandingImages();

  var DEMO_TEXT = '본 연구에서는 다양한 요인을 함께 살펴보고 분석을 진행했다. 먼저 관련 선행연구의 기준을 정리한 뒤 실제 사례와 비교했다. 그 결과 일부 변화는 기존 연구와 비슷했지만, 조사 시점과 참여 집단에 따라 다른 흐름도 확인할 수 있었다.';
  var demoTimers = [];
  var demoRunning = false;
  var demoStartTimer = 0;

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

    // 장면 2: 예상 비용
    demoLater(function () {
      demoScene(2);
      if (costEl) costEl.textContent = String(Math.ceil(DEMO_TEXT.length / 100));
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
    clearTimeout(demoStartTimer);
    demoStartTimer = 0;
    demoClear();
  }
  function demoQueueStart() {
    if (demoRunning || demoStartTimer) return;
    if (demoReduced()) { demoStart(); return; }
    demoStartTimer = setTimeout(function () {
      demoStartTimer = 0;
      demoStart();
    }, 3200);
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
          if (e.isIntersecting) demoQueueStart();
          else demoStop();
        });
      }, { threshold: 0.25 });
      io.observe(box);
    } else {
      demoQueueStart();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) demoStop();
      else if (demoEl('lpDemo') && !document.getElementById('landingScreen').hidden) demoQueueStart();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demoInit);
  else demoInit();

  function initVerifiedMetrics() {
    var policy = document.getElementById('lpPolicyFacts');
    var metrics = document.getElementById('lpVerifiedMetrics');
    if (!policy || !metrics) return;
    var base = String((window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '').replace(/\/$/, '');
    if (!base) return;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, 4000);
    fetch(base + '/public/metrics', controller ? { signal: controller.signal } : {})
      .then(function (response) { if (!response.ok) throw new Error('metrics unavailable'); return response.json(); })
      .then(function (data) {
        var totals = data && data.totals;
        var processed = Number(totals && totals.processedCharacters);
        var jobs = Number(totals && totals.completedJobs);
        var asOf = Date.parse(data && data.asOf);
        var fresh = Number.isFinite(asOf) && Date.now() - asOf >= 0 && Date.now() - asOf <= 48 * 60 * 60 * 1000;
        if (!data || data.schemaVersion !== 1 || data.verified !== true || !fresh
          || !Number.isSafeInteger(processed) || processed < 0
          || !Number.isSafeInteger(jobs) || jobs < 0) throw new Error('invalid metrics');
        document.getElementById('lpProcessedCharacters').textContent = processed.toLocaleString('ko-KR');
        document.getElementById('lpCompletedJobs').textContent = jobs.toLocaleString('ko-KR');
        policy.hidden = true;
        metrics.hidden = false;
      })
      .catch(function () {
        metrics.hidden = true;
        policy.hidden = false;
      })
      .finally(function () { clearTimeout(timeout); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVerifiedMetrics, { once: true });
  else initVerifiedMetrics();

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

(function () {
  var LP_VARIANTS = {
    assignment: {
      h1: '과제의 AI 문체 신호,<br>제출 전에 확인한다.',
      sub: '수치·인용·내 주장은 유지하고, 확인이 필요한 문단부터 보여드려요.',
      cta: '과제 1,000자 무료 감지'
    },
    resume: {
      h1: '내 경험은 그대로,<br>AI식 상투어만 덜어낸다.',
      sub: '회사명·직무·내 행동·결과를 구분해 없는 경험을 만들지 않아요.',
      cta: '자소서 문단 점검하기'
    },
    paper: {
      h1: '수치·기관명·인용을 지키는<br>장문 검수.',
      sub: '긴 글은 구간별로 감지하고 변경된 부분을 원문과 비교할 수 있게 보여드려요.',
      cta: '보고서 점검 시작하기'
    },
    blog: {
      h1: '후기의 사실과 말투는 그대로,<br>반복 표현만 정리한다.',
      sub: '직접 경험하지 않은 장점이나 성과는 추가하지 않아요.',
      cta: '후기 문장 점검하기'
    }
  };
  function applyLandingUseCase() {
    try {
      var ctx = window.gpAttribution && window.gpAttribution.getContext ? window.gpAttribution.getContext() : null;
      var v = ctx && LP_VARIANTS[ctx.use_case];
      if (!v) return;
      var h1 = document.querySelector('.gp-lp-hero-inner h1');
      var sub = document.querySelector('.gp-lp-hero-sub');
      var cta = document.querySelector('.gp-lp-hero-cta .gp-lp-primary');
      if (h1) h1.innerHTML = v.h1;   // 정적 사전(LP_VARIANTS)만 주입 — 사용자 입력 아님
      if (sub) sub.textContent = v.sub;
      if (cta) cta.textContent = v.cta;
      if (typeof window.gpTrack === 'function') window.gpTrack('landing_variant_view', { landing_variant: ctx.use_case });
    } catch (e) { /* 변형 실패 시 기본 카피 유지 */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLandingUseCase, { once: true });
  else applyLandingUseCase();
  // 파셜 지연 주입(page-loader) 대비 — 랜딩 DOM이 늦게 들어와도 1회 재시도
  setTimeout(applyLandingUseCase, 1500);
})();

(function () {
  function getMain() {
    return document.getElementById('mainContent');
  }

  // 탭 파셜은 하나의 라벤더 셸 안으로만 이동합니다.
  var TAB_IDS = ['main', 'pricing', 'blog', 'detectReport', 'guide', 'faq', 'qna', 'notice', 'mypage', 'admin', 'adminHumanizeLab', 'history', 'pro', 'writingLab'];
  var MOVED_TABS = ['history', 'notice', 'blog', 'detectReport', 'guide', 'faq', 'qna', 'pricing', 'pro', 'mypage', 'admin', 'adminHumanizeLab', 'writingLab'];

  function moveInto(el, target) {
    if (el && target && el.parentElement !== target) target.appendChild(el);
  }

  function placeShared() {
    var slot = document.getElementById('lavTabSlot');
    if (slot) MOVED_TABS.forEach(function (name) { moveInto(document.getElementById(name + 'Content'), slot); });
  }

  // 라벤더에서 탭이 바뀌어도 라벤더 셸(#mainContent)은 항상 보이고,
  // 메인 탭이 아닐 때는 히어로만 숨겨 탭 콘텐츠가 그 자리에 나온다.
  var lavTab = null;
  function detectTab() {
    for (var i = 0; i < TAB_IDS.length; i++) {
      var el = document.getElementById(TAB_IDS[i] + 'Content');
      if (el && el.style.display !== 'none') return TAB_IDS[i];
    }
    return 'main';
  }

  function lavApplyTab() {
    if (document.body.dataset.mainDesign !== 'lavender') return;
    if (lavTab === null) lavTab = detectTab();
    var main = getMain();
    if (main) main.style.display = 'block';
    var hero = document.querySelector('.gp-lav-hero');
    if (hero) hero.style.display = lavTab === 'main' ? '' : 'none';
    var tabs = document.getElementById('lavTabSlot');
    if (tabs) tabs.hidden = lavTab === 'main';
    document.querySelectorAll('.gp-lav-menu [data-tab]').forEach(function (b) {
      var active = b.dataset.tab === lavTab;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (typeof window.lavCloseSidebar === 'function') window.lavCloseSidebar();
  }

  var origSwitchTab = null;
  function patchSwitchTab() {
    if (origSwitchTab || typeof window.switchTab !== 'function') return;
    origSwitchTab = window.switchTab;
    window.switchTab = function () {
      var result = origSwitchTab.apply(this, arguments);
      lavTab = detectTab();
      lavApplyTab();
      return result;
    };
  }

  function applyDesign() {
    var main = getMain();
    if (main) main.dataset.mainDesign = 'lavender';
    var shell = main ? main.closest('.gp-main') : document.querySelector('.gp-main');
    if (shell) shell.dataset.mainDesign = 'lavender';
    document.querySelectorAll('#appScreen, .app-layout, .gp-sidebar, .main-content.gp-main').forEach(function (el) {
      el.dataset.mainDesign = 'lavender';
    });
    document.body.dataset.mainDesign = 'lavender';
    placeShared();
    patchSwitchTab();
    lavInit();
    lavTab = detectTab();
    lavApplyTab();
  }

  /* ===== Lavender SaaS application ===== */
  var lavState = { mode: 'humanize', task: 'assignment', model: 0, banner: 0, timer: null, inited: false };
  var LAV_MODELS = ['Natural v2', 'Classic v1'];

  function lavPage() { return document.getElementById('lavPage'); }

  function lavSyncSidebarA11y() {
    var page = lavPage();
    var sidebar = document.getElementById('lavSidebar') || document.querySelector('.gp-lav-sidebar');
    var hamburger = document.querySelector('.gp-lav-hamburger');
    var collapse = document.querySelector('.gp-lav-collapse');
    if (!page || !sidebar) return;
    var mobile = window.matchMedia('(max-width: 960px)').matches;
    var mobileOpen = mobile && page.classList.contains('menu-open');
    if (mobile) {
      sidebar.inert = !mobileOpen;
      sidebar.setAttribute('aria-hidden', mobileOpen ? 'false' : 'true');
    } else {
      sidebar.inert = false;
      sidebar.removeAttribute('aria-hidden');
    }
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', mobileOpen ? 'true' : 'false');
      hamburger.setAttribute('aria-label', mobileOpen ? '메뉴 닫기' : '메뉴 열기');
    }
    if (collapse) {
      var expanded = !page.classList.contains('side-collapsed');
      collapse.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      collapse.setAttribute('aria-label', expanded ? '사이드바 접기' : '사이드바 펼치기');
    }
  }

  function lavInit() {
    if (lavState.inited) return;
    lavState.inited = true;
    var kbd = document.getElementById('lavNewKbd');
    if (kbd && navigator.platform && navigator.platform.indexOf('Mac') === -1) kbd.textContent = 'Ctrl N';
    lavSyncSidebarA11y();
    window.addEventListener('resize', lavSyncSidebarA11y, { passive: true });
    lavRestartTimer();
  }

  function lavRestartTimer() {
    if (lavState.timer) clearInterval(lavState.timer);
    if (!document.querySelector('#lavBanners article')) return;
    lavState.timer = setInterval(function () {
      var page = lavPage();
      if (!page || document.body.dataset.mainDesign !== 'lavender') return;
      window.lavSetBanner((lavState.banner + 1) % 4, true);
    }, 6000);
  }

  window.fillLavSample = function () {
    var src = document.getElementById('lavInput');
    if (!src) return;
    src.value = '본 연구에서는 인공지능 기술의 발전과 그에 따른 사회적 영향을 분석하고자 하였다. 먼저 인공지능의 개념과 역사에 대해 살펴본 후 다양한 분야에서의 활용 사례를 조사하였다.';
    window.lavSyncCount(src);
    src.focus();
  };

  window.lavSetBanner = function (i, fromTimer) {
    lavState.banner = i;
    var arts = document.querySelectorAll('#lavBanners article');
    var dots = document.querySelectorAll('#lavDots button');
    arts.forEach(function (a, idx) { a.classList.toggle('active', idx === i); });
    dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
    if (!fromTimer) lavRestartTimer();
  };

  window.lavToggleSidebar = function () {
    var page = lavPage();
    if (!page) return;
    var mobile = window.matchMedia('(max-width: 960px)').matches;
    if (mobile) page.classList.toggle('menu-open');
    else page.classList.toggle('side-collapsed');
    lavSyncSidebarA11y();
    if (mobile && page.classList.contains('menu-open')) {
      var sidebar = document.getElementById('lavSidebar') || document.querySelector('.gp-lav-sidebar');
      var first = sidebar && sidebar.querySelector('.gp-lav-new, a[href], button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
  };

  window.lavCloseSidebar = function () {
    var page = lavPage();
    if (!page) return;
    var sidebar = document.getElementById('lavSidebar') || document.querySelector('.gp-lav-sidebar');
    var restoreFocus = !!(sidebar && sidebar.contains(document.activeElement));
    page.classList.remove('menu-open');
    lavSyncSidebarA11y();
    if (restoreFocus && window.matchMedia('(max-width: 960px)').matches) {
      var hamburger = document.querySelector('.gp-lav-hamburger');
      if (hamburger) requestAnimationFrame(function () { hamburger.focus(); });
    }
  };

  window.lavNewSentence = function () {
    // 서버 작업이 살아 있는 동안에는 입력·진행 화면을 지우지 않는다.
    // 진행 화면으로 되돌려 사용자가 같은 작업의 상태를 확인하게 한다.
    if (typeof window.lavPrepareNewSentence === 'function' && !window.lavPrepareNewSentence()) return;
    // 다른 탭(FAQ·문의·공지 등)에서 눌러도 동작하도록 메인(컴포저)으로 먼저 복귀.
    // 안 그러면 숨겨진 lavInput만 비우고 화면이 안 바뀌어 "안 눌린다"처럼 보임.
    if (typeof window.switchTab === 'function') window.switchTab('main');
    var src = document.getElementById('lavInput');
    var target = document.getElementById('inputText');
    if (src) { src.value = ''; window.lavSyncCount(src); }
    if (target) {
      target.value = '';
      if (typeof updateCount === 'function') updateCount(target);
    }
    var res = document.getElementById('result');
    if (res) res.innerHTML = '';
    // ★ 회피 워크스페이스(lavFlow)가 떠 있으면 닫고 입력 화면으로(입력은 이미 비움 → 진짜 새 글)
    if (typeof window.lavFlowReset === 'function') window.lavFlowReset();
    window.lavCloseSidebar();
    if (src) src.focus();
  };

  window.lavQuickTask = function (task) {
    lavState.task = task;
    lavState.mode = 'humanize';
    lavSyncModeUI();
    document.querySelectorAll('.gp-lav-chips button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.task === task);
    });
    window.lavCloseSidebar();
    var src = document.getElementById('lavInput');
    if (src) src.focus();
  };

  window.lavChip = function (btn) {
    var chips = document.querySelectorAll('.gp-lav-chips button');
    chips.forEach(function (b) { b.classList.toggle('active', b === btn); });
    if (btn.dataset.task) {
      lavState.task = btn.dataset.task;
      lavState.mode = 'humanize';
    } else {
      lavState.mode = 'humanize';
      if (!btn.dataset.task) lavState.task = lavState.task || 'assignment';
    }
    lavSyncModeUI();
    var src = document.getElementById('lavInput');
    if (src) src.focus();
  };

  function lavSyncModeUI() {
    var label = document.getElementById('lavModeLabel');
    var btn = label ? label.closest('.gp-lav-mode') : null;
    if (label) label.textContent = lavState.mode === 'detect' ? 'AI 감지 모드' : '휴머나이징 모드';
    if (btn) btn.classList.toggle('detect', lavState.mode === 'detect');
  }

  window.lavCycleMode = function () {
    lavState.mode = lavState.mode === 'detect' ? 'humanize' : 'detect';
    lavSyncModeUI();
  };

  window.lavCycleModel = function () {
    lavState.model = (lavState.model + 1) % LAV_MODELS.length;
    var label = document.getElementById('lavModelLabel');
    if (label) label.textContent = LAV_MODELS[lavState.model];
  };

  window.LAV_MAX_CHARS = 30000;
  function lavInputError(message) {
    var error = document.getElementById('lavInputError');
    var src = document.getElementById('lavInput');
    var composer = src ? src.closest('.gp-lav-composer') : null;
    if (error) {
      error.textContent = message || '';
      error.hidden = !message;
    }
    if (src) src.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (composer) composer.classList.toggle('has-error', !!message);
  }

  window.lavClearInputError = function () {
    lavInputError('');
  };

  window.lavShowInputError = function (message, reason, track) {
    var src = document.getElementById('lavInput');
    var fallback = window.gpInputQuality && window.gpInputQuality.message
      ? window.gpInputQuality.message
      : '문장으로 인식하기 어려운 입력이에요. 의미가 있는 문장이나 문단을 붙여넣어 주세요.';
    lavInputError(message || fallback);
    if (track !== false && window.gpTrack) {
      var length = src ? (src.value || '').length : 0;
      window.gpTrack('humanize_input_rejected', {
        reason: reason || 'unreadable_input',
        length_bucket: window.gpInputQuality && window.gpInputQuality.lengthBucket
          ? window.gpInputQuality.lengthBucket(length)
          : 'unknown'
      });
    }
    if (src) {
      src.scrollIntoView({ behavior: 'smooth', block: 'center' });
      src.focus();
    }
  };

  window.lavEnsureReadableInput = function (text) {
    if (!window.gpInputQuality || typeof window.gpInputQuality.assess !== 'function') return true;
    var result = window.gpInputQuality.assess(text);
    if (result.readable) {
      window.lavClearInputError();
      return true;
    }
    window.lavShowInputError(window.gpInputQuality.message, result.reason, true);
    return false;
  };

  window.lavSyncCount = function (textarea) {
    var count = document.getElementById('lavCount');
    if (!count || !textarea) return;
    window.lavClearInputError();
    var len = (textarea.value || '').length;
    var max = Number(window.LAV_MAX_CHARS || 30000);
    var over = len > max;
    var wasOver = count.dataset.overLimit === 'true';
    count.textContent = len ? len.toLocaleString() + ' / 30,000자' : '';
    count.classList.toggle('over', over);
    count.dataset.overLimit = String(over);
    textarea.setAttribute('aria-invalid', over ? 'true' : 'false');
    if (over !== wasOver) {
      var status = document.getElementById('lavCountStatus');
      if (status) status.textContent = over
        ? '입력 가능 길이 30,000자를 초과했어요. 글을 나눠 주세요.'
        : '입력 길이가 30,000자 이내로 돌아왔어요.';
    }
    var run = document.getElementById('lavRunButton');
    if (run) {
      var detect = window.lavMode === 'detect';
      var credits = len ? (detect ? Math.ceil(len / 100) : Math.max(10, Math.ceil(len / 100) * 2)) : 0;
      run.setAttribute('aria-label', (detect ? 'AI 감지' : '휴머나이징') + ' 시작 · ' + (credits ? '예상 ' + credits + '크레딧' : '예상 크레딧 계산 전'));
    }
    if (typeof window.lavUpdateEstimate === 'function') window.lavUpdateEstimate();
  };

  window.lavComposerKey = function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      window.lavRun();
    }
  };

  // 전송 버튼: 회피 모드 인라인 스테퍼 진입(진단 배너부터).
  // 실제 "원문 보존 다듬기"는 lavRunHumanize가 기존 분석 파이프라인으로 연결.
  window.lavRun = function () {
    var src = document.getElementById('lavInput');
    var text = src && src.value.trim() ? src.value : '';
    if (!text.trim()) { if (src) src.focus(); return; }
    if (text.length > (window.LAV_MAX_CHARS || 30000)) {
      alert('한 번에 최대 30,000자까지 입력할 수 있어요. 글을 나눠 다시 시도해 주세요.');
      if (src) src.focus();
      return;
    }
    if (!window.lavEnsureReadableInput(text)) return;
    // 숨겨진 이전 작업이 있으면 새 진단·변환을 시작하지 않고 기존 진행 화면을 연다.
    if (typeof window.lavPrepareNewSentence === 'function' && !window.lavPrepareNewSentence()) return;
    // 모드 토글(컴포저 세그먼트): AI 감지 선택 시 무료 감지 보고서로 — 전송 버튼은 하나.
    if (window.lavMode === 'detect' && typeof window.lavDetect === 'function') { window.lavDetect(); return; }
    if (typeof window.lavFlowDiagnose === 'function') { window.lavFlowDiagnose(); return; }
    window.lavRunHumanize();
  };

  window.lavRunHumanize = function () {
    var src = document.getElementById('lavInput');
    var target = document.getElementById('inputText');
    var text = src && src.value.trim() ? src.value : (target ? target.value : '');
    if (!text.trim()) {
      if (src) src.focus();
      return;
    }
    if (!window.lavEnsureReadableInput(text)) return;
    // 워크스페이스를 닫고 입력 화면 컨텍스트로 복귀 후 결과 렌더(결과 슬롯이 입력 화면 안)
    if (typeof window.lavFlowReset === 'function') window.lavFlowReset();
    if (target) {
      target.value = text;
      if (typeof updateCount === 'function') updateCount(target);
      if (typeof updateSendBtn === 'function') updateSendBtn();
    }
    var task = lavState.mode === 'detect' ? 'detect' : (lavState.task || 'assignment');
    if (typeof lsSelectTaskMobile === 'function') {
      lsSelectTaskMobile(task);
    } else if (typeof setMode === 'function') {
      setMode(lavState.mode === 'detect' ? 'detect' : 'humanize');
    }
    if (typeof runAnalysis === 'function') runAnalysis();
    var res = document.getElementById('result');
    if (res) {
      setTimeout(function () {
        res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  };

  // 핸들러 없는 카테고리 탭(Q&A·공지): 행의 카테고리/배지 텍스트로 실제 필터링
  document.addEventListener('click', function (event) {
    var btn = event.target.closest ? event.target.closest('.cat-fbtn') : null;
    if (!btn || btn.getAttribute('onclick')) return;
    var group = btn.closest('.cat-filter');
    var page = btn.closest('[id$="Content"]');
    if (!group || !page) return;
    group.querySelectorAll('.cat-fbtn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    var label = btn.textContent.trim();
    var showAll = label === '전체';
    page.querySelectorAll('.gp-board-row').forEach(function (row) {
      var tag = row.querySelector('.gbr-cat, .cat-chip, .notice-badge');
      row.style.display = showAll || (tag && tag.textContent.trim() === label) ? '' : 'none';
    });
  });

  document.addEventListener('keydown', function (event) {
    var page = lavPage();
    if (event.key === 'Tab' && page && page.classList.contains('menu-open')) {
      var hamburger = document.querySelector('.gp-lav-hamburger');
      var firstMenuItem = document.querySelector('#lavSidebar .gp-lav-new');
      if (!event.shiftKey && event.target === hamburger && firstMenuItem) {
        event.preventDefault();
        firstMenuItem.focus({ preventScroll: true });
      } else if (event.shiftKey && event.target === firstMenuItem && hamburger) {
        event.preventDefault();
        hamburger.focus({ preventScroll: true });
      }
    }
    if (event.key === 'Escape' && page && page.classList.contains('menu-open')) window.lavCloseSidebar();
  });

  function bootDesign() {
    applyDesign();
    document.documentElement.classList.add('design-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDesign, { once: true });
  else bootDesign();
})();

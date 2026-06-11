(function () {
  var STORAGE_KEY = 'gp-main-design';
  var DEFAULT_DESIGN = 'lavender';
  var allowed = { lavender: true, midnight: true, paper: true, mint: true, clean: true, hub: true, neon: true };

  function getMain() {
    return document.getElementById('mainContent');
  }

  function getInitialDesign() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      var params = new URLSearchParams(window.location.search);
      var requested = params.get('design');
      return allowed[requested] ? requested : DEFAULT_DESIGN;
    } catch (_) {
      return DEFAULT_DESIGN;
    }
  }

  function syncOptions(design) {
    document.querySelectorAll('.gp-design-option').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.design === design);
    });
  }

  // 라벤더에서는 실제 앱 요소(분석 결과·탭 컨테이너·크레딧 칩·업그레이드 버튼·
  // 사이드바 푸터·최근 기록 리스트)를 라벤더 셸 안의 슬롯으로 옮긴다.
  // 복제가 아니라 이동이므로 #uname, #creditChip 등 동적 갱신이 그대로 동작한다.
  var TAB_IDS = ['main', 'pricing', 'community', 'qna', 'notice', 'mypage', 'history', 'pro'];
  var MOVED_TABS = ['history', 'notice', 'community', 'qna', 'pricing', 'pro', 'mypage'];

  function moveInto(el, target) {
    if (el && target && el.parentElement !== target) target.appendChild(el);
  }

  function placeShared(design) {
    var res = document.getElementById('result');
    var credit = document.getElementById('creditChip');
    var upgrade = document.getElementById('lsUpgradeBtn');
    var foot = document.querySelector('.gp-sidebar-footer');
    var hist = document.getElementById('sidebarHistoryList');
    if (design === 'lavender') {
      moveInto(res, document.getElementById('lavResultSlot'));
      var slotT = document.getElementById('lavTabSlot');
      if (slotT) MOVED_TABS.forEach(function (n) { moveInto(document.getElementById(n + 'Content'), slotT); });
      var slotTop = document.getElementById('lavTopSlot');
      if (slotTop) { moveInto(credit, slotTop); moveInto(upgrade, slotTop); }
      moveInto(foot, document.getElementById('lavSideFootSlot'));
      moveInto(hist, document.getElementById('lavHistSlot'));
    } else {
      var anchor = document.getElementById('pdfInput');
      if (anchor && res && res.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', res);
      var main = getMain();
      if (main) {
        var prev = main;
        MOVED_TABS.forEach(function (n) {
          var el = document.getElementById(n + 'Content');
          if (el) { prev.insertAdjacentElement('afterend', el); prev = el; }
        });
      }
      var actions = document.querySelector('.gp-top-actions');
      if (actions) { moveInto(credit, actions); moveInto(upgrade, actions); }
      moveInto(foot, document.querySelector('.gp-sidebar'));
      moveInto(hist, document.querySelector('.gp-sidebar .gp-nav, .gp-sidebar .sidebar-nav'));
    }
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
    document.querySelectorAll('.gp-lav-menu [data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === lavTab);
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

  function applyDesign(design) {
    if (!allowed[design]) design = DEFAULT_DESIGN;
    var main = getMain();
    if (main) main.dataset.mainDesign = design;
    var shell = main ? main.closest('.gp-main') : document.querySelector('.gp-main');
    if (shell) shell.dataset.mainDesign = design;
    document.querySelectorAll('#appScreen, .app-layout, .gp-sidebar, .main-content.gp-main').forEach(function (el) {
      el.dataset.mainDesign = design;
    });
    document.body.dataset.mainDesign = design;
    syncOptions(design);
    placeShared(design);
    patchSwitchTab();
    if (design === 'lavender') {
      lavInit();
      lavTab = detectTab();
      lavApplyTab();
    } else if (origSwitchTab && lavTab) {
      origSwitchTab(lavTab, { skipRoute: true });
    }
  }

  window.setMainDesign = function (design) {
    if (!allowed[design]) design = DEFAULT_DESIGN;
    applyDesign(design);
  };

  window.openMainDesignPicker = function () {
    var panel = document.getElementById('mainDesignPicker');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('open');
    syncOptions(getMain()?.dataset.mainDesign || DEFAULT_DESIGN);
  };

  window.closeMainDesignPicker = function () {
    var panel = document.getElementById('mainDesignPicker');
    if (!panel) return;
    panel.classList.remove('open');
    panel.hidden = true;
  };

  window.syncHubCount = function (textarea) {
    var count = document.getElementById('hubInputCount');
    if (!count || !textarea) return;
    count.textContent = (textarea.value || '').length.toLocaleString() + ' / 100,000자';
  };

  window.clearHubInput = function () {
    var source = document.getElementById('hubInputText');
    var quick = document.getElementById('hubQuickInput');
    if (!source) return;
    source.value = '';
    if (quick) quick.value = '';
    window.syncHubCount(source);
    source.focus();
  };

  window.fillHubSample = function () {
    var source = document.getElementById('hubInputText');
    var quick = document.getElementById('hubQuickInput');
    if (!source) return;
    source.value = '본 연구에서는 인공지능 기술의 발전과 그에 따른 사회적 영향을 분석하고자 하였다. 먼저 인공지능의 개념과 역사에 대해 살펴본 후 다양한 분야에서의 활용 사례를 조사하였다.';
    if (quick) quick.value = source.value;
    window.syncHubCount(source);
    source.focus();
  };

  window.runHubQuickAnalysis = function () {
    var quick = document.getElementById('hubQuickInput');
    var source = document.getElementById('hubInputText');
    if (quick && source && quick.value.trim()) {
      source.value = quick.value.trim();
      window.syncHubCount(source);
    }
    window.runHubAnalysis('detect');
  };

  window.fillNeonSample = function () {
    var target = document.getElementById('inputText');
    if (!target) return;
    target.value = '본 연구에서는 인공지능 기술의 발전과 그에 따른 사회적 영향을 분석하고자 하였다. 먼저 관련 선행연구를 검토한 뒤, 주요 사례를 중심으로 변화 양상을 정리하였다.';
    if (typeof updateCount === 'function') updateCount(target);
    if (typeof updateSendBtn === 'function') updateSendBtn();
    target.focus();
  };

  window.runHubAnalysis = function (taskMode) {
    var source = document.getElementById('hubInputText');
    var quick = document.getElementById('hubQuickInput');
    var target = document.getElementById('inputText');
    if (source && quick && !source.value.trim() && quick.value.trim()) {
      source.value = quick.value.trim();
      window.syncHubCount(source);
    }
    if (!source || !source.value.trim()) {
      if (source) source.focus();
      return;
    }
    if (target) {
      target.value = source.value;
      if (typeof updateCount === 'function') updateCount(target);
      if (typeof updateSendBtn === 'function') updateSendBtn();
    }
    if (typeof lsSelectTaskMobile === 'function') {
      lsSelectTaskMobile(taskMode === 'detect' ? 'detect' : taskMode || 'assignment');
    } else if (typeof setMode === 'function') {
      setMode(taskMode === 'detect' ? 'detect' : 'humanize');
    }
    if (typeof runAnalysis === 'function') runAnalysis();
  };

  /* ===== Lavender SaaS (confirmed main design) ===== */
  var lavState = { mode: 'humanize', task: 'assignment', model: 0, banner: 0, timer: null, inited: false };
  var LAV_MODELS = ['Natural v2', 'Classic v1'];

  function lavPage() { return document.getElementById('lavPage'); }

  function lavInit() {
    if (lavState.inited) return;
    lavState.inited = true;
    var kbd = document.getElementById('lavNewKbd');
    if (kbd && navigator.platform && navigator.platform.indexOf('Mac') === -1) kbd.textContent = 'Ctrl N';
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
    if (window.matchMedia('(max-width: 940px)').matches) page.classList.toggle('menu-open');
    else page.classList.toggle('side-collapsed');
  };

  window.lavCloseSidebar = function () {
    var page = lavPage();
    if (page) page.classList.remove('menu-open');
  };

  window.lavNewSentence = function () {
    var src = document.getElementById('lavInput');
    var target = document.getElementById('inputText');
    if (src) { src.value = ''; window.lavSyncCount(src); }
    if (target) {
      target.value = '';
      if (typeof updateCount === 'function') updateCount(target);
    }
    var res = document.getElementById('result');
    if (res) res.innerHTML = '';
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
    if (label) label.textContent = lavState.mode === 'detect' ? 'AI 검사 모드' : '자연화 모드';
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

  window.lavSyncCount = function (textarea) {
    var count = document.getElementById('lavCount');
    if (!count || !textarea) return;
    var len = (textarea.value || '').length;
    count.textContent = len ? len.toLocaleString() + ' / 100,000자' : '';
  };

  window.lavComposerKey = function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      window.lavRun();
    }
  };

  // 전송 버튼: 회피 모드 인라인 스테퍼 진입(진단 배너부터).
  // 실제 "그대로 다듬기"는 lavRunHumanize가 기존 분석 파이프라인으로 연결.
  window.lavRun = function () {
    var src = document.getElementById('lavInput');
    var text = src && src.value.trim() ? src.value : '';
    if (!text.trim()) { if (src) src.focus(); return; }
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
    page.querySelectorAll('.qna-item, .notice-item').forEach(function (row) {
      var tag = row.querySelector('.cat-chip, .notice-badge');
      row.style.display = showAll || (tag && tag.textContent.trim() === label) ? '' : 'none';
    });
  });

  // 페이지 검색 바: 해당 페이지 리스트 행을 텍스트로 실시간 필터링
  document.addEventListener('input', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('.gp-search input')) return;
    var page = input.closest('[id$="Content"]');
    if (!page) return;
    var q = input.value.trim().toLowerCase();
    page.querySelectorAll('.post-card, .qna-item, .notice-item, .pitem').forEach(function (row) {
      row.style.display = !q || row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  });

  document.addEventListener('click', function (event) {
    var panel = document.getElementById('mainDesignPicker');
    if (!panel || panel.hidden) return;
    if (event.target.closest('.gp-design-picker') || event.target.closest('.gp-design-open') || event.target.closest('[data-design-trigger]')) return;
    window.closeMainDesignPicker();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') window.closeMainDesignPicker();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyDesign(getInitialDesign()); });
  } else {
    applyDesign(getInitialDesign());
  }
})();

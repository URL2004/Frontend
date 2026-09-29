(function () {
  var nativeAlert = window.alert ? window.alert.bind(window) : null;
  var nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
  var nativePrompt = window.prompt ? window.prompt.bind(window) : null;
  var localKey = 'gpLocalNotifications';
  var remoteItems = [];
  var activeDialog = null;
  // 운영팀 메시지 플로팅: 기기마다 한 번만 띄운다. 오래된 미확인 메시지가 배포 직후
  // 한꺼번에 뜨지 않도록 최근 7일 안에 온 것만 대상으로 한다.
  var floatKeyPrefix = 'gpOperatorFloated:';
  var floatMaxAgeMs = 7 * 86400000;
  var floatQueue = [];
  var floatShownIds = {};
  var lastUnread = -1;
  var ringTimer = null;
  var floatOwner = '';

  window.gpNativeAlert = nativeAlert;
  window.gpNativeConfirm = nativeConfirm;
  window.gpNativePrompt = nativePrompt;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function now() { return Date.now(); }
  function id() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'n_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function inferType(message) {
    var m = String(message || '');
    if (/완료|성공|지급|변경됐|복사됐|접수/.test(m)) return 'success';
    if (/실패|오류|에러|부족|초과|없습니다|필요|불가|취소/.test(m)) return 'error';
    return 'info';
  }
  function ensureShell() {
    if ($('gpToastRoot')) return;
    var toastRoot = document.createElement('div');
    toastRoot.id = 'gpToastRoot';
    toastRoot.className = 'gp-toast-root';
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);

    var dialog = document.createElement('div');
    dialog.id = 'gpDialogRoot';
    dialog.className = 'gp-dialog-root';
    dialog.hidden = true;
    dialog.innerHTML =
      '<div class="gp-dialog-backdrop" data-gp-dialog-cancel></div>' +
      '<section class="gp-dialog-card" role="dialog" aria-modal="true" aria-labelledby="gpDialogTitle" aria-describedby="gpDialogBody">' +
        '<button type="button" class="gp-dialog-x" data-gp-dialog-cancel aria-label="닫기">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
        '<div class="gp-dialog-icon" id="gpDialogIcon" aria-hidden="true"></div>' +
        '<h2 id="gpDialogTitle"></h2>' +
        '<div id="gpDialogBody" class="gp-dialog-body">' +
          '<p id="gpDialogMessage"></p>' +
          '<dl id="gpDialogSummary" class="gp-dialog-summary" hidden></dl>' +
          '<p id="gpDialogSafe" class="gp-dialog-safe" hidden>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' +
            '<span id="gpDialogSafeText"></span>' +
          '</p>' +
          '<p id="gpDialogNote" class="gp-dialog-note" hidden></p>' +
          '<div id="gpPromptWrap" class="gp-prompt-wrap" hidden>' +
            '<textarea id="gpPromptInput" rows="4"></textarea>' +
            '<small id="gpPromptHint"></small>' +
          '</div>' +
        '</div>' +
        '<div class="gp-dialog-actions">' +
          '<button type="button" class="gp-dialog-cancel" data-gp-dialog-cancel>취소</button>' +
          '<button type="button" class="gp-dialog-confirm" data-gp-dialog-confirm>확인</button>' +
        '</div>' +
      '</section>';
    document.body.appendChild(dialog);

    var panel = document.createElement('aside');
    panel.id = 'gpNotificationPanel';
    panel.className = 'gp-notification-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="gp-notification-head">' +
        '<div><strong>알림</strong><span>작업과 문의 진행 상황</span></div>' +
        '<button type="button" onclick="gpCloseNotificationCenter()" aria-label="닫기">×</button>' +
      '</div>' +
      '<div class="gp-notification-actions">' +
        '<button type="button" onclick="gpMarkAllNotificationsRead()">모두 읽음</button>' +
      '</div>' +
      '<div id="gpNotificationList" class="gp-notification-list"></div>';
    document.body.appendChild(panel);

    document.addEventListener('click', function (e) {
      var p = $('gpNotificationPanel');
      if (!p || p.hidden) return;
      if (p.contains(e.target)) return;
      var bell = e.target.closest && e.target.closest('.gp-lav-bell, #gpOperatorFloat');
      if (bell) return;
      window.gpCloseNotificationCenter();
    });
    document.addEventListener('keydown', function (e) {
      if (activeDialog && e.key === 'Tab') {
        trapDialogFocus(e);
        return;
      }
      if (e.key === 'Escape') {
        if (activeDialog) {
          e.preventDefault();
          closeDialog(null);
          return;
        }
        var float = $('gpOperatorFloat');
        if (float && !float.hidden && float.contains(document.activeElement)) {
          dismissOperatorFloat('close');
          return;
        }
        window.gpCloseNotificationCenter();
      }
    });
  }

  function toast(message, opts) {
    ensureShell();
    opts = opts || {};
    var root = $('gpToastRoot');
    if (!root) {
      if (nativeAlert) nativeAlert(message);
      return;
    }
    var type = opts.type || inferType(message);
    var item = document.createElement('div');
    item.className = 'gp-toast gp-toast-' + type;
    item.innerHTML =
      '<span class="gp-toast-mark" aria-hidden="true"></span>' +
      '<div><b>' + esc(opts.title || (type === 'success' ? '완료' : type === 'error' ? '확인 필요' : '알림')) + '</b>' +
      '<p>' + esc(message) + '</p></div>' +
      '<button type="button" aria-label="닫기">×</button>';
    item.querySelector('button').onclick = function () { dismissToast(item); };
    root.appendChild(item);
    requestAnimationFrame(function () { item.classList.add('show'); });
    setTimeout(function () { dismissToast(item); }, opts.duration || (type === 'error' ? 5600 : 3600));
  }
  function dismissToast(el) {
    if (!el || el.classList.contains('hide')) return;
    el.classList.add('hide');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
  }

  function dialogFocusables(root) {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) {
      return !el.hidden && el.getClientRects().length > 0;
    });
  }
  function trapDialogFocus(e) {
    var root = $('gpDialogRoot');
    var focusables = dialogFocusables(root);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var current = document.activeElement;
    if (e.shiftKey && (current === first || !root.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (current === last || !root.contains(current))) {
      e.preventDefault();
      first.focus();
    }
  }
  function closeDialog(value, restoreFocus) {
    var root = $('gpDialogRoot');
    if (root) root.hidden = true;
    document.documentElement.classList.remove('gp-dialog-open');
    document.body.classList.remove('gp-dialog-open');
    if (activeDialog) {
      var state = activeDialog;
      activeDialog = null;
      state.resolve(value);
      if (restoreFocus !== false && state.previousFocus && state.previousFocus.isConnected && typeof state.previousFocus.focus === 'function') {
        setTimeout(function () { state.previousFocus.focus(); }, 0);
      }
    }
  }
  function renderDialogSummary(items) {
    var summary = $('gpDialogSummary');
    if (!summary) return;
    summary.textContent = '';
    var rows = Array.isArray(items) ? items.filter(function (item) {
      return item && item.label != null && item.value != null;
    }) : [];
    rows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'gp-dialog-summary-row' + (item.emphasis ? ' is-emphasis' : '');
      var label = document.createElement('dt');
      var value = document.createElement('dd');
      label.textContent = String(item.label);
      value.textContent = String(item.value);
      row.appendChild(label);
      row.appendChild(value);
      summary.appendChild(row);
    });
    summary.hidden = rows.length === 0;
  }
  function renderDialogIcon(icon, opts, promptMode) {
    if (!icon) return;
    if (opts.variant === 'notification-detail') {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h6"/></svg>';
      return;
    }
    if (opts.variant === 'detect') {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10M4 10h7M4 15h5"/><circle cx="15.5" cy="14.5" r="4.5"/><path d="m19 18 2 2"/></svg>';
      return;
    }
    icon.textContent = opts.icon || (opts.danger ? '!' : promptMode ? '✎' : '?');
  }
  function openDialog(opts, promptMode) {
    ensureShell();
    opts = opts || {};
    if (activeDialog) closeDialog(null, false);
    var previousFocus = document.activeElement;
    var root = $('gpDialogRoot');
    var title = $('gpDialogTitle');
    var message = $('gpDialogMessage');
    var icon = $('gpDialogIcon');
    var safe = $('gpDialogSafe');
    var safeText = $('gpDialogSafeText');
    var note = $('gpDialogNote');
    var promptWrap = $('gpPromptWrap');
    var promptInput = $('gpPromptInput');
    var promptHint = $('gpPromptHint');
    var confirmBtn = root.querySelector('[data-gp-dialog-confirm]');
    var cancelBtn = root.querySelector('[data-gp-dialog-cancel].gp-dialog-cancel');
    root.classList.toggle('danger', !!opts.danger);
    root.classList.toggle('prompt', !!promptMode);
    root.classList.toggle('variant-detect', opts.variant === 'detect');
    root.classList.toggle('variant-purchase', opts.variant === 'purchase');
    root.classList.toggle('variant-notify', opts.variant === 'notify');
    root.classList.toggle('variant-notification-detail', opts.variant === 'notification-detail');
    title.textContent = opts.title || (promptMode ? '내용을 입력해 주세요' : '내용을 확인해 주세요');
    message.textContent = opts.message || '';
    message.hidden = !message.textContent;
    renderDialogIcon(icon, opts, promptMode);
    renderDialogSummary(opts.summary);
    safeText.textContent = opts.safeText || '';
    safe.hidden = !safeText.textContent;
    note.textContent = opts.note || '';
    note.hidden = !note.textContent;
    confirmBtn.textContent = opts.confirmText || (promptMode ? '입력 완료' : '확인');
    cancelBtn.textContent = opts.cancelText || '취소';
    cancelBtn.hidden = !!opts.hideCancel;
    promptWrap.hidden = !promptMode;
    if (promptMode) {
      promptInput.value = opts.defaultValue || '';
      promptInput.placeholder = opts.placeholder || '';
      promptInput.rows = opts.rows || 4;
      if (opts.maxLength) promptInput.setAttribute('maxlength', String(opts.maxLength));
      else promptInput.removeAttribute('maxlength');
      var renderHint = function () {
        var base = opts.hint || '';
        promptHint.textContent = opts.maxLength
          ? (base ? base + ' · ' : '') + promptInput.value.length + '/' + opts.maxLength + '자'
          : base;
      };
      promptInput.oninput = renderHint;
      renderHint();
    }
    root.onclick = function (e) {
      var cancel = e.target && e.target.closest ? e.target.closest('[data-gp-dialog-cancel]') : null;
      if (cancel && root.contains(cancel)) closeDialog(promptMode ? null : false);
    };
    confirmBtn.onclick = function () {
      if (!promptMode) return closeDialog(true);
      var v = promptInput.value;
      if (opts.required && !v.trim()) {
        promptInput.focus();
        promptWrap.classList.add('shake');
        setTimeout(function () { promptWrap.classList.remove('shake'); }, 220);
        return;
      }
      closeDialog(v);
    };
    root.hidden = false;
    document.documentElement.classList.add('gp-dialog-open');
    document.body.classList.add('gp-dialog-open');
    setTimeout(function () { (promptMode ? promptInput : confirmBtn).focus(); }, 30);
    return new Promise(function (resolve) { activeDialog = { resolve: resolve, previousFocus: previousFocus }; });
  }

  function getLocalItems() {
    try { return JSON.parse(localStorage.getItem(localKey) || '[]'); } catch (e) { return []; }
  }
  function setLocalItems(items) {
    try { localStorage.setItem(localKey, JSON.stringify(items.slice(0, 80))); } catch (e) {}
  }
  function normalizeNotification(n, source) {
    n = n || {};
    var created = n.createdAt;
    if (created && typeof created.toMillis === 'function') created = created.toMillis();
    if (created && typeof created.toDate === 'function') created = created.toDate().getTime();
    if (created && created._seconds) created = created._seconds * 1000;
    return {
      id: String(n.id || n.clientId || id()),
      clientId: n.clientId || null,
      source: source || n.source || 'local',
      type: n.type || 'notice',
      title: n.title || titleForType(n.type),
      message: n.message || '',
      read: !!n.read,
      createdAt: Number(created) || now(),
      action: n.action || null,
      postId: n.postId || null
    };
  }
  function titleForType(type) {
    return ({
      job_done: '작업 완료',
      job_failed: '작업 확인 필요',
      payment: '결제 완료',
      refund: '환불 알림',
      qna: 'Q&A 답변',
      comment: '커뮤니티 댓글'
    })[type] || '알림';
  }
  function iconForType(type) {
    return ({
      job_done: 'task_alt',
      job_failed: 'error',
      payment: 'credit_card',
      refund: 'receipt_long',
      qna: 'help',
      comment: 'chat_bubble',
      notice: 'notifications'
    })[type] || 'notifications';
  }
  function timeLabel(ms) {
    var diff = Math.max(0, now() - ms);
    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
    return new Date(ms).toLocaleDateString('ko-KR');
  }
  function combinedItems() {
    var map = new Map();
    getLocalItems().map(function (n) { return normalizeNotification(n, 'local'); }).forEach(function (n) {
      map.set(n.clientId || n.id, n);
    });
    remoteItems.map(function (n) { return normalizeNotification(n, 'remote'); }).forEach(function (n) {
      var key = n.clientId || n.id;
      var old = map.get(key);
      if (old && old.source === 'local') {
        old.read = old.read || n.read;
        old.source = 'remote';
        old.id = n.id;
        old.action = n.action || old.action;
      } else {
        map.set(key, n);
      }
    });
    return Array.from(map.values()).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function updateBadge() {
    var unread = combinedItems().filter(function (n) { return !n.read; }).length;
    var badge = $('notifBadge');
    if (badge) {
      badge.textContent = unread > 99 ? '99+' : String(unread || '');
      badge.hidden = unread <= 0;
      badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
    var bell = document.querySelector('.gp-lav-bell');
    if (bell) {
      bell.classList.toggle('has-unread', unread > 0);
      bell.setAttribute('aria-label', unread > 0 ? '알림, 읽지 않은 알림 ' + unread + '개' : '알림');
    }
    if (lastUnread >= 0 && unread > lastUnread) ringBell();
    lastUnread = unread;
  }
  // 새 알림이 들어온 순간 한 번 크게 흔든다. 안 읽은 알림이 남아 있는 동안의
  // 주기적인 흔들림은 CSS(.has-unread)가 맡는다.
  function ringBell() {
    var bell = document.querySelector('.gp-lav-bell');
    if (!bell || bell.getAttribute('aria-expanded') === 'true') return;
    bell.classList.remove('is-ringing');
    void bell.offsetWidth;
    bell.classList.add('is-ringing');
    clearTimeout(ringTimer);
    ringTimer = setTimeout(function () { bell.classList.remove('is-ringing'); }, 1400);
  }

  function isOperatorMessage(n) {
    var key = String(n.clientId || n.id || '');
    if (n.type === 'qna') return /^qna_answered_/.test(key);
    return n.type === 'notice' && /^(admin_|job_incident_)/.test(key);
  }
  function floatStoreKey() {
    var uid = window.CU && window.CU.uid;
    return uid ? floatKeyPrefix + uid : '';
  }
  function getFloatedIds() {
    var key = floatStoreKey();
    if (!key) return [];
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function rememberFloated(n) {
    var key = floatStoreKey();
    if (!key || !n) return;
    var ids = getFloatedIds().filter(function (x) { return x !== n.id; });
    ids.unshift(n.id);
    try { localStorage.setItem(key, JSON.stringify(ids.slice(0, 100))); } catch (e) {}
  }
  function queueOperatorMessages() {
    var owner = floatStoreKey();
    if (owner !== floatOwner) {
      floatOwner = owner;
      floatQueue = [];
      floatShownIds = {};
      lastUnread = -1;
    }
    var live = {};
    remoteItems.forEach(function (x) { live[String(x.id)] = x; });
    floatQueue = floatQueue.filter(function (q) { return live[q.id] && !live[q.id].read; })
      .map(function (q) { return normalizeNotification(live[q.id], 'remote'); });
    if (floatStoreKey()) {
      var seen = getFloatedIds();
      var cutoff = now() - floatMaxAgeMs;
      remoteItems.map(function (x) { return normalizeNotification(x, 'remote'); })
        .filter(function (n) {
          return !n.read && isOperatorMessage(n) && n.createdAt >= cutoff &&
            !floatShownIds[n.id] && seen.indexOf(n.id) === -1;
        })
        .sort(function (a, b) { return a.createdAt - b.createdAt; })
        .forEach(function (n) {
          floatShownIds[n.id] = true;
          floatQueue.push(n);
        });
    }
    renderOperatorFloat();
  }
  function ensureOperatorFloat() {
    var el = $('gpOperatorFloat');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'gpOperatorFloat';
    el.className = 'gp-operator-float';
    el.hidden = true;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-labelledby', 'gpOperatorFloatTitle');
    el.innerHTML =
      '<div class="gp-operator-float-head">' +
        '<span class="gp-operator-float-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l10-4v14L8 15H4zM8 15l2 5h3l-2-4M21 9v6"/></svg></span>' +
        '<span class="gp-operator-float-label"><b id="gpOperatorFloatLabel"></b><small id="gpOperatorFloatMeta"></small></span>' +
        '<button type="button" class="gp-operator-float-x" data-float-close aria-label="메시지 닫기">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<h3 id="gpOperatorFloatTitle"></h3>' +
      '<p id="gpOperatorFloatMessage"></p>' +
      '<div class="gp-operator-float-actions">' +
        '<button type="button" class="gp-operator-float-secondary" data-float-open>자세히 보기</button>' +
        '<button type="button" class="gp-operator-float-primary" data-float-ack></button>' +
      '</div>' +
      '<p class="sr-only" id="gpOperatorFloatLive" aria-live="polite"></p>';
    el.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-float-close],[data-float-open],[data-float-ack]') : null;
      if (!t) return;
      if (t.hasAttribute('data-float-close')) dismissOperatorFloat('close');
      else if (t.hasAttribute('data-float-open')) dismissOperatorFloat('open');
      else dismissOperatorFloat('ack');
    });
    document.body.appendChild(el);
    return el;
  }
  function operatorFollowTab(n) {
    var tab = n && n.action && n.action.tab ? String(n.action.tab) : '';
    return tab && tab !== 'main' && tab !== 'community' ? tab : '';
  }
  function renderOperatorFloat() {
    var current = floatQueue[0];
    var el = $('gpOperatorFloat');
    if (!current) {
      if (el && !el.hidden) {
        el.classList.remove('is-in');
        setTimeout(function () { if (!floatQueue.length) el.hidden = true; }, 200);
      }
      return;
    }
    el = ensureOperatorFloat();
    var isAnswer = current.type === 'qna';
    var label = isAnswer ? '운영팀 답변' : '운영팀 메시지';
    $('gpOperatorFloatLabel').textContent = label;
    $('gpOperatorFloatMeta').textContent = timeLabel(current.createdAt) +
      (floatQueue.length > 1 ? ' · ' + floatQueue.length + '개 중 1' : '');
    $('gpOperatorFloatTitle').textContent = current.title;
    $('gpOperatorFloatMessage').textContent = current.message;
    var ack = el.querySelector('[data-float-ack]');
    ack.textContent = operatorFollowTab(current)
      ? (isAnswer ? '답변 보기' : '바로 보기')
      : (floatQueue.length > 1 ? '확인하고 다음' : '확인했어요');
    el.classList.toggle('is-answer', isAnswer);
    var wasHidden = el.hidden;
    el.hidden = false;
    if (wasHidden || el.getAttribute('data-current') !== current.id) {
      el.setAttribute('data-current', current.id);
      $('gpOperatorFloatLive').textContent = label + ': ' + current.title;
      el.classList.remove('is-in');
      void el.offsetWidth;
      requestAnimationFrame(function () { el.classList.add('is-in'); });
      ringBell();
      rememberFloated(current);
    }
  }
  async function dismissOperatorFloat(mode) {
    var current = floatQueue[0];
    if (!current) return renderOperatorFloat();
    if (mode === 'ack' && current.source === 'remote' && window.markRead) {
      var owner = floatOwner;
      var button = $('gpOperatorFloat').querySelector('[data-float-ack]');
      if (button.disabled) return;
      button.disabled = true;
      try { await window.markRead(current.id); }
      catch (e) {
        if (owner === floatOwner) window.gpToast('읽음 처리에 실패했어요. 다시 시도해 주세요.', 'error');
        return;
      } finally { button.disabled = false; }
      if (owner !== floatOwner) return;
      // 읽음 구독이 먼저 도착해 다음 메시지가 올라와도 다음 항목을 지우지 않는다.
      floatQueue = floatQueue.filter(function (n) { return n.id !== current.id; });
      var nextTab = operatorFollowTab(current);
      if (nextTab) followNotification(current);
      renderOperatorFloat();
      return;
    }
    if (mode === 'open') {
      floatQueue.forEach(rememberFloated);
      floatQueue = [];
      renderOperatorFloat();
      openNotificationDetail(current);
      return;
    }
    rememberFloated(current);
    floatQueue.shift();
    if (mode === 'ack') {
      var tab = operatorFollowTab(current);
      markNotificationRead(current);
      if (tab) {
        floatQueue.forEach(rememberFloated);
        floatQueue = [];
        followNotification(current);
      }
    }
    renderOperatorFloat();
  }
  function renderNotifications() {
    ensureShell();
    var list = $('gpNotificationList');
    if (!list) return;
    var items = combinedItems();
    updateBadge();
    if (!items.length) {
      list.innerHTML = '<div class="gp-notification-empty"><span class="material-symbols-outlined">notifications</span><b>새 알림이 없어요</b><p>작업 완료와 문의 답변을 여기에서 확인할 수 있어요.</p></div>';
      return;
    }
    list.innerHTML = items.map(function (n) {
      return '<button type="button" class="gp-notification-item' + (n.read ? '' : ' unread') + '" data-id="' + esc(n.id) + '" data-source="' + esc(n.source) + '">' +
        '<span class="material-symbols-outlined" aria-hidden="true">' + esc(iconForType(n.type)) + '</span>' +
        '<span class="gp-notification-body"><b>' + esc(n.title) + '</b><em>' + esc(n.message) + '</em><small>' + esc(timeLabel(n.createdAt)) + '</small></span>' +
      '</button>';
    }).join('');
    list.querySelectorAll('.gp-notification-item').forEach(function (btn) {
      btn.onclick = function () {
        var n = combinedItems().find(function (x) { return x.id === btn.getAttribute('data-id') && x.source === btn.getAttribute('data-source'); });
        if (!n) return;
        openNotificationDetail(n);
      };
    });
  }
  async function openNotificationDetail(n) {
    window.gpCloseNotificationCenter();
    var action = n.action || {};
    var canFollow = !!action.tab && action.tab !== 'community' && !n.postId;
    var result = openDialog({
      variant: 'notification-detail', title: n.title || '알림', message: n.message,
      note: timeLabel(n.createdAt), confirmText: canFollow ? '관련 화면 보기' : '닫기',
      cancelText: '닫기', hideCancel: !canFollow
    }, false);
    try { await markNotificationRead(n); }
    catch (e) { toast('읽음 처리에 실패했어요. 알림을 다시 열어 주세요.', { type: 'error' }); }
    if (await result && canFollow) followNotification(n);
  }
  window.gpOpenNotification = function (notificationId) {
    var n = combinedItems().find(function (item) { return item.id === notificationId; });
    if (n) return openNotificationDetail(n);
  };
  async function markNotificationRead(n) {
    if (n.source === 'local') {
      setLocalItems(getLocalItems().map(function (x) {
        if ((x.clientId || x.id) === (n.clientId || n.id)) x.read = true;
        return x;
      }));
    } else if (window.markRead) {
      await window.markRead(n.id);
    }
    remoteItems = remoteItems.map(function (x) {
      if (String(x.id) === String(n.id)) x.read = true;
      return x;
    });
    renderNotifications();
  }
  function followNotification(n) {
    window.gpCloseNotificationCenter();
    var a = n.action || {};
    if (a.tab === 'community' || n.postId) {
      toast('커뮤니티 운영을 종료했어요.', { type: 'info' });
      return;
    }
    if (a.tab && typeof window.switchTab === 'function') {
      window.switchTab(a.tab);
      return;
    }
  }

  window.gpToast = toast;
  window.gpConfirm = function (opts) { return openDialog(opts, false); };
  window.gpPrompt = function (opts) { return openDialog(opts, true); };
  window.alert = function (message) { toast(String(message || ''), { type: inferType(message) }); };

  window.gpNotify = function (payload, opts) {
    ensureShell();
    opts = opts || {};
    var n = normalizeNotification(Object.assign({ id: id(), clientId: id(), read: false, createdAt: now() }, payload || {}), 'local');
    var local = getLocalItems();
    var key = n.clientId || n.id;
    var inserted = false;
    if (!local.some(function (x) { return (x.clientId || x.id) === key; })) {
      local.unshift(n);
      setLocalItems(local);
      inserted = true;
    }
    renderNotifications();
    if (opts.toast !== false) toast(n.message || n.title, { type: n.type === 'job_failed' ? 'error' : 'success', title: n.title });
    if (inserted && opts.persist !== false && typeof window.persistUserNotification === 'function') {
      try { window.persistUserNotification(n); } catch (e) {}
    }
    return n;
  };
  window.gpSetRemoteNotifications = function (items) {
    remoteItems = Array.isArray(items) ? items : [];
    renderNotifications();
    queueOperatorMessages();
  };
  // 실시간 구독(app-module.js)이 새로 들어온 알림만 넘길 때 쓴다 — 목록 전체를 다시 읽지 않는다.
  window.gpUpsertRemoteNotifications = function (items) {
    if (!Array.isArray(items) || !items.length) return;
    items.forEach(function (item) {
      var at = -1;
      remoteItems.forEach(function (x, i) { if (String(x.id) === String(item.id)) at = i; });
      if (at >= 0) remoteItems[at] = item;
      else remoteItems.push(item);
    });
    renderNotifications();
    queueOperatorMessages();
  };
  window.gpRenderNotifications = renderNotifications;
  window.gpRemoveRemoteNotifications = function (ids) {
    remoteItems = remoteItems.filter(function (n) { return ids.indexOf(String(n.id)) === -1; });
    renderNotifications();
    queueOperatorMessages();
  };
  window.gpUpdateNotificationBadge = updateBadge;
  function setBellExpanded(open) {
    var bell = document.querySelector('.gp-lav-bell');
    if (bell) bell.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && bell) bell.classList.remove('is-ringing');
  }
  window.gpOpenNotificationCenter = function (event, forceOpen) {
    if (event && event.stopPropagation) event.stopPropagation();
    ensureShell();
    var panel = $('gpNotificationPanel');
    if (!panel) return;
    panel.hidden = forceOpen ? false : !panel.hidden;
    setBellExpanded(!panel.hidden);
    if (!panel.hidden && floatQueue.length) {
      // 알림함에서 같은 메시지를 보게 되므로 플로팅은 접는다.
      floatQueue.forEach(rememberFloated);
      floatQueue = [];
      renderOperatorFloat();
    }
    if (!panel.hidden && typeof window.loadNotifications === 'function') window.loadNotifications();
    renderNotifications();
  };
  window.gpCloseNotificationCenter = function () {
    var panel = $('gpNotificationPanel');
    if (panel) panel.hidden = true;
    setBellExpanded(false);
  };
  window.gpMarkAllNotificationsRead = function () {
    setLocalItems(getLocalItems().map(function (n) { n.read = true; return n; }));
    remoteItems.slice().forEach(function (n) { if (!n.read && window.markRead) window.markRead(n.id); n.read = true; });
    renderNotifications();
    queueOperatorMessages();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { ensureShell(); renderNotifications(); });
  else { ensureShell(); renderNotifications(); }
})();

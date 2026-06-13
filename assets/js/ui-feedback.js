(function () {
  var nativeAlert = window.alert ? window.alert.bind(window) : null;
  var nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
  var nativePrompt = window.prompt ? window.prompt.bind(window) : null;
  var localKey = 'gpLocalNotifications';
  var remoteItems = [];
  var activeDialog = null;

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
      '<section class="gp-dialog-card" role="dialog" aria-modal="true" aria-labelledby="gpDialogTitle">' +
        '<button type="button" class="gp-dialog-x" data-gp-dialog-cancel aria-label="닫기">×</button>' +
        '<div class="gp-dialog-icon" id="gpDialogIcon" aria-hidden="true"></div>' +
        '<h2 id="gpDialogTitle"></h2>' +
        '<p id="gpDialogMessage"></p>' +
        '<div id="gpPromptWrap" class="gp-prompt-wrap" hidden>' +
          '<textarea id="gpPromptInput" rows="4"></textarea>' +
          '<small id="gpPromptHint"></small>' +
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
      var bell = e.target.closest && e.target.closest('.gp-lav-bell');
      if (bell) return;
      window.gpCloseNotificationCenter();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (activeDialog) closeDialog(null);
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

  function closeDialog(value) {
    var root = $('gpDialogRoot');
    if (root) root.hidden = true;
    if (activeDialog) {
      activeDialog.resolve(value);
      activeDialog = null;
    }
  }
  function openDialog(opts, promptMode) {
    ensureShell();
    opts = opts || {};
    if (activeDialog) closeDialog(null);
    var root = $('gpDialogRoot');
    var title = $('gpDialogTitle');
    var message = $('gpDialogMessage');
    var icon = $('gpDialogIcon');
    var promptWrap = $('gpPromptWrap');
    var promptInput = $('gpPromptInput');
    var promptHint = $('gpPromptHint');
    var confirmBtn = root.querySelector('[data-gp-dialog-confirm]');
    var cancelBtn = root.querySelector('[data-gp-dialog-cancel].gp-dialog-cancel');
    root.classList.toggle('danger', !!opts.danger);
    root.classList.toggle('prompt', !!promptMode);
    title.textContent = opts.title || (promptMode ? '입력해주세요' : '확인해주세요');
    message.textContent = opts.message || '';
    icon.textContent = opts.icon || (opts.danger ? '!' : promptMode ? '✎' : '?');
    confirmBtn.textContent = opts.confirmText || (promptMode ? '입력 완료' : '확인');
    cancelBtn.textContent = opts.cancelText || '취소';
    promptWrap.hidden = !promptMode;
    if (promptMode) {
      promptInput.value = opts.defaultValue || '';
      promptInput.placeholder = opts.placeholder || '';
      promptHint.textContent = opts.hint || '';
    }
    root.onclick = function (e) {
      if (e.target && e.target.hasAttribute('data-gp-dialog-cancel')) closeDialog(promptMode ? null : false);
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
    setTimeout(function () { (promptMode ? promptInput : confirmBtn).focus(); }, 30);
    return new Promise(function (resolve) { activeDialog = { resolve: resolve }; });
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
    if (bell) bell.classList.toggle('has-unread', unread > 0);
  }
  function renderNotifications() {
    ensureShell();
    var list = $('gpNotificationList');
    if (!list) return;
    var items = combinedItems();
    updateBadge();
    if (!items.length) {
      list.innerHTML = '<div class="gp-notification-empty"><span class="material-symbols-outlined">notifications</span><b>새 알림이 없어요</b><p>작업 완료, 댓글, 문의 답변이 여기에 쌓입니다.</p></div>';
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
        markNotificationRead(n);
        followNotification(n);
      };
    });
  }
  function markNotificationRead(n) {
    if (n.source === 'local') {
      setLocalItems(getLocalItems().map(function (x) {
        if ((x.clientId || x.id) === (n.clientId || n.id)) x.read = true;
        return x;
      }));
    } else if (window.markRead) {
      try { window.markRead(n.id); } catch (e) {}
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
    if (a.type === 'library' && typeof window.lavOpenLibrary === 'function') {
      if (typeof window.switchTab === 'function') window.switchTab('main');
      setTimeout(function () { window.lavOpenLibrary(); }, 120);
      return;
    }
    if (a.tab && typeof window.switchTab === 'function') {
      window.switchTab(a.tab);
      return;
    }
    if (n.postId && typeof window.switchTab === 'function') {
      window.switchTab('community');
      setTimeout(function () { if (window.viewPost) window.viewPost(n.postId); }, 120);
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
  };
  window.gpRenderNotifications = renderNotifications;
  window.gpUpdateNotificationBadge = updateBadge;
  window.gpOpenNotificationCenter = function (event) {
    if (event && event.stopPropagation) event.stopPropagation();
    ensureShell();
    var panel = $('gpNotificationPanel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden && typeof window.loadNotifications === 'function') window.loadNotifications();
    renderNotifications();
  };
  window.gpCloseNotificationCenter = function () {
    var panel = $('gpNotificationPanel');
    if (panel) panel.hidden = true;
  };
  window.gpMarkAllNotificationsRead = function () {
    setLocalItems(getLocalItems().map(function (n) { n.read = true; return n; }));
    remoteItems.slice().forEach(function (n) { if (!n.read && window.markRead) window.markRead(n.id); n.read = true; });
    renderNotifications();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { ensureShell(); renderNotifications(); });
  else { ensureShell(); renderNotifications(); }
})();

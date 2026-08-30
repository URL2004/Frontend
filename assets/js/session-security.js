(function () {
  'use strict';

  var OWNER_KEY = 'gp_session_owner_uid_v1';
  var GUEST_OWNER = 'guest';
  var SESSION_JSON_KEYS = [
    'gp_pending_paid_job_v1',
    'gp_writing_lab_v2_draft',
    'gp_writing_lab_v2_active',
    'gp_writing_lab_v2_pending'
  ];
  var SESSION_PREFIXES = ['confirming_'];
  var LOCAL_JSON_KEYS = ['lavJobRef'];
  var LOCAL_EXACT_KEYS = ['gp_pending_history'];
  var LOCAL_PREFIXES = ['gp_resumed_paid_job_', 'paid_', 'paid_order_'];

  function normalizedOwner(uid) {
    var value = String(uid || '').trim();
    return value || GUEST_OWNER;
  }

  function markerOwner() {
    try { return normalizedOwner(sessionStorage.getItem(OWNER_KEY)); }
    catch (_) { return GUEST_OWNER; }
  }

  function currentOwner() {
    var uid = window.CU && window.CU.uid;
    return uid ? normalizedOwner(uid) : markerOwner();
  }

  function removePrefixes(storage, prefixes) {
    try {
      for (var i = storage.length - 1; i >= 0; i--) {
        var key = storage.key(i) || '';
        if (prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; })) storage.removeItem(key);
      }
    } catch (_) {}
  }

  function clearSensitive() {
    try { SESSION_JSON_KEYS.forEach(function (key) { sessionStorage.removeItem(key); }); } catch (_) {}
    try { LOCAL_JSON_KEYS.concat(LOCAL_EXACT_KEYS).forEach(function (key) { localStorage.removeItem(key); }); } catch (_) {}
    removePrefixes(sessionStorage, SESSION_PREFIXES);
    removePrefixes(localStorage, LOCAL_PREFIXES);
  }

  function updateJsonOwner(storage, key, fromOwner, toOwner) {
    try {
      var raw = storage.getItem(key);
      if (!raw) return;
      var value = JSON.parse(raw);
      var owner = normalizedOwner(value && (value.ownerUid || value.uid));
      if (owner !== fromOwner) return;
      value.ownerUid = toOwner;
      storage.setItem(key, JSON.stringify(value));
    } catch (_) {
      try { storage.removeItem(key); } catch (_) {}
    }
  }

  function claimGuestSession(uid) {
    SESSION_JSON_KEYS.forEach(function (key) { updateJsonOwner(sessionStorage, key, GUEST_OWNER, uid); });
    LOCAL_JSON_KEYS.forEach(function (key) { updateJsonOwner(localStorage, key, GUEST_OWNER, uid); });
  }

  function prunePendingHistory(uid) {
    try {
      var raw = localStorage.getItem('gp_pending_history');
      if (!raw) return;
      var values = JSON.parse(raw);
      if (!Array.isArray(values)) throw new Error('invalid pending history');
      var kept = values.filter(function (item) { return item && String(item.uid || '') === uid; });
      if (kept.length) localStorage.setItem('gp_pending_history', JSON.stringify(kept));
      else localStorage.removeItem('gp_pending_history');
    } catch (_) {
      try { localStorage.removeItem('gp_pending_history'); } catch (_) {}
    }
  }

  function pruneOwnedLocalJson(uid) {
    LOCAL_JSON_KEYS.forEach(function (key) {
      try {
        var value = JSON.parse(localStorage.getItem(key) || 'null');
        if (!value) return;
        if (String(value.ownerUid || '') !== uid) localStorage.removeItem(key);
      } catch (_) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    });
    prunePendingHistory(uid);
  }

  function bindUser(uid) {
    var next = normalizedOwner(uid);
    var previous;
    try { previous = normalizedOwner(sessionStorage.getItem(OWNER_KEY)); }
    catch (_) { previous = GUEST_OWNER; }

    var changed = previous !== next;
    if (changed && previous !== GUEST_OWNER && next !== GUEST_OWNER) {
      clearSensitive();
    } else if (changed && previous === GUEST_OWNER && next !== GUEST_OWNER) {
      // A visitor may type before opening the login popup. Claim only data made
      // in this same guest tab; a previous account's data was erased on logout.
      claimGuestSession(next);
      pruneOwnedLocalJson(next);
    } else if (next === GUEST_OWNER && previous !== GUEST_OWNER) {
      clearSensitive();
    } else if (!changed && next !== GUEST_OWNER) {
      pruneOwnedLocalJson(next);
    } else if (next === GUEST_OWNER) {
      pruneOwnedLocalJson('');
    }

    try { sessionStorage.setItem(OWNER_KEY, next); } catch (_) {}
    return { changed: changed, previous: previous, current: next };
  }

  function tag(value) {
    var copy = Object.assign({}, value || {});
    copy.ownerUid = currentOwner();
    return copy;
  }

  function owns(value) {
    if (!value || typeof value !== 'object') return false;
    var owner = String(value.ownerUid || value.uid || '').trim();
    return Boolean(owner) && normalizedOwner(owner) === currentOwner();
  }

  window.gpSessionSecurity = Object.freeze({
    bindUser: bindUser,
    clearSensitive: clearSensitive,
    currentOwner: currentOwner,
    tag: tag,
    owns: owns,
    ownerKey: OWNER_KEY
  });
})();

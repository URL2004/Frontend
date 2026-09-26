(function () {
  'use strict';
  var KEY = 'gp_auth_attempt_v1';
  var TTL = 10 * 60 * 1000;
  var active = null;
  var pendingGa = [];
  function track(name, params) {
    if (window.gpTrack) window.gpTrack(name, params);
    else if (pendingGa.length < 20) pendingGa.push([name, params]);
  }
  if (window.addEventListener) window.addEventListener('gp:attribution-ready', function () {
    if (!window.gpTrack) return;
    var batch = pendingGa; pendingGa = [];
    batch.forEach(function (args) { if (!internal()) window.gpTrack(args[0], args[1]); });
  });
  var outcomes = { success: 'login', cancel: 'login_cancel', error: 'login_error' };
  var codes = new Set(['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled',
    'auth/network-request-failed', 'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported', 'auth/unauthorized-domain', 'auth/internal-error',
    'auth/invalid-custom-token', 'auth/custom-token-mismatch', 'auth/user-disabled',
    'auth/account-exists-with-different-credential', 'auth/too-many-requests',
    'CANCELED', 'access_denied', 'oauth_state_invalid', 'KAKAO_BACKEND_ERROR',
    'KAKAO_TOKEN_EXCHANGE_FAILED', 'KAKAO_SDK_UNAVAILABLE', 'KAKAO_SDK_TIMEOUT',
    'KAKAO_REAUTH_ACCOUNT_MISMATCH', 'storage_unavailable', 'inapp_unsupported']);
  function errorCode(error) {
    var value = typeof error === 'string' ? error : error && (error.code || error.error_code || error.error);
    if (codes.has(value)) return value;
    if (error && error.name === 'AbortError') return 'network_timeout';
    if (error && error.name === 'TypeError') return 'network_or_runtime_error';
    return 'unknown';
  }
  function uuid() {
    try {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (_) { return ''; } // Analytics must never prevent authentication.
  }
  function save() {
    try {
      if (active) sessionStorage.setItem(KEY, JSON.stringify(active));
      else sessionStorage.removeItem(KEY);
    } catch (_) {}
  }
  function internal() {
    return /^\/admin(?:[-/]|$)/.test(window.location.pathname) || window.gpAnalyticsInternal === true;
  }
  function emit(attempt, outcome, error) {
    if (!attempt || internal()) return;
    var code = outcome === 'start' || outcome === 'success' ? '' : errorCode(error);
    var params = {
      attempt_id: attempt.id, method: attempt.method, flow: attempt.flow,
      auth_stage: outcome === 'success' ? 'complete' : attempt.stage,
      error_code: code, code: code,
      duration_ms: Math.max(0, Date.now() - attempt.startedAt)
    };
    try { track(outcome === 'start' ? 'login_start' : outcomes[outcome], params); } catch (_) {}
    if (!attempt.id || !window.fetch || !window.apiUrl) return;
    var touch = {};
    try { touch = window.gpAttribution.getLastTouch() || {}; } catch (_) {}
    var sources = ['google', 'naver', 'bing', 'meta', 'instagram', 'direct'];
    var media = ['organic', 'cpc', 'paid_social', 'paid', 'social', 'referral', 'none'];
    var body = {
      type: 'auth_diagnostic', attempt_id: attempt.id, method: attempt.method,
      flow: attempt.flow, stage: params.auth_stage, outcome: outcome,
      error_code: code, duration_ms: Math.min(TTL, params.duration_ms),
      release: String(window.GP_BUILD_VERSION || 'growth-20260926-v1').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40),
      traffic_source: sources.includes(touch.source) ? touch.source : 'other',
      traffic_medium: media.includes(touch.medium) ? touch.medium : 'other',
      device: /iPad|Tablet/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
        ? 'tablet' : /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    };
    // No token, account identifier, URL, OAuth state, or raw exception is sent.
    try {
      window.fetch(window.apiUrl('/events'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), keepalive: true
      }).catch(function () {});
    } catch (_) {}
  }
  window.gpAuthDiagnostics = {
    start: function (method, flow) {
      active = { id: uuid(), method: method, flow: flow || 'popup', stage: 'provider', startedAt: Date.now(), done: false };
      save(); emit(active, 'start'); return active;
    },
    resume: function (method) {
      try {
        var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (saved && /^[a-f0-9]{32}$/.test(saved.id) && saved.method === method && saved.flow === 'redirect'
          && Number.isFinite(saved.startedAt) && Date.now() >= saved.startedAt && Date.now() - saved.startedAt <= TTL) active = saved;
        else active = null;
      } catch (_) { active = null; }
      // An orphan callback stays unlinked; never fabricate a login_start.
      if (!active) active = { id: uuid(), method: method, flow: 'redirect', stage: 'callback', startedAt: Date.now(), done: false };
      return active;
    },
    stage: function (attempt, stage) {
      if (!attempt || attempt.done) return;
      attempt.stage = stage;
      if (active === attempt) save();
    },
    finish: function (attempt, outcome, error) {
      if (!attempt || attempt.done || !outcomes[outcome]) return false;
      attempt.done = true;
      emit(attempt, outcome, error);
      if (active === attempt) save(); // Keep terminal marker to deduplicate repeated OAuth callbacks.
      return true;
    },
    errorCode: errorCode
  };
})();

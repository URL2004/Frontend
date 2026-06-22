(function () {
  function getApiBase() {
    return ((window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '').replace(/\/+$/, '');
  }

  window.apiUrl = function apiUrl(path) {
    var base = getApiBase();
    var suffix = String(path || '').replace(/^\/+/, '');
    return base + '/' + suffix;
  };

  window.apiBase = getApiBase;

  function cleanText(value, max) {
    return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 160);
  }

  function safeNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }

  function isCancelCode(code) {
    return /^(USER_CANCEL|PAY_PROCESS_CANCELED|PAY_PROCESS_CANCELLED|CANCELED|CANCELLED)$/i.test(cleanText(code, 80));
  }

  function trafficSource() {
    try { return localStorage.getItem('traffic_source') || 'direct'; }
    catch (e) { return 'direct'; }
  }

  function addErrorFields(payload, err) {
    if (!err) return payload;
    if (!payload.code && err.code) payload.code = err.code;
    if (!payload.message && err.message) payload.message = err.message;
    if (!payload.message && typeof err === 'string') payload.message = err;
    if (!payload.errorName && err.name) payload.errorName = err.name;
    return payload;
  }

  window.gpTrackPaymentError = function gpTrackPaymentError(stage, details, err) {
    var raw = addErrorFields(Object.assign({}, details || {}), err);
    var payload = {
      type: 'payment_error',
      stage: cleanText(stage, 60),
      checkoutType: cleanText(raw.checkoutType || raw.checkout_type, 40),
      code: cleanText(raw.code, 80),
      message: cleanText(raw.message, 300),
      status: safeNumber(raw.status),
      orderId: cleanText(raw.orderId, 120),
      amount: safeNumber(raw.amount),
      credits: safeNumber(raw.credits),
      plan: cleanText(raw.plan, 80),
      tier: cleanText(raw.tier, 80),
      endpoint: cleanText(raw.endpoint, 120),
      page: window.location.pathname,
      uid: window.CU && window.CU.uid ? window.CU.uid : cleanText(raw.uid, 120),
      trafficSource: trafficSource()
    };

    if (window.gpTrack) {
      window.gpTrack(isCancelCode(payload.code) ? 'checkout_cancel' : 'payment_error', {
        payment_stage: payload.stage,
        checkout_type: payload.checkoutType,
        code: payload.code,
        message: payload.message,
        status: payload.status,
        value: payload.amount,
        currency: 'KRW'
      });
    }

    if (isCancelCode(payload.code) || /login_required$/i.test(payload.stage)) return;

    Promise.resolve().then(async function () {
      try {
        if (window.CU && typeof window.CU.getIdToken === 'function') {
          payload.idToken = await window.CU.getIdToken();
        }
      } catch (e) {}
      try {
        await window.fetch(window.apiUrl('/events'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (e) {}
    });
  };

  function getMaintenanceBypass() {
    try {
      return localStorage.getItem('gp_maintenance_bypass') || sessionStorage.getItem('gp_maintenance_bypass') || '';
    } catch (e) {
      return '';
    }
  }
  function isApiRequest(input) {
    var base = getApiBase();
    if (!base) return false;
    var url = '';
    if (typeof input === 'string') url = input;
    else if (input && input.url) url = input.url;
    if (!url) return false;
    try { url = new URL(url, window.location.origin).toString(); } catch (e) {}
    return url.indexOf(base + '/') === 0;
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch && !window.__gpFetchPatched) {
    window.__gpFetchPatched = true;
    window.fetch = function gpFetch(input, init) {
      var secret = getMaintenanceBypass();
      if (!secret || !isApiRequest(input)) return nativeFetch(input, init);
      var nextInit = Object.assign({}, init || {});
      var headers = new Headers(nextInit.headers || (input && input.headers) || {});
      headers.set('X-Maintenance-Bypass', secret);
      nextInit.headers = headers;
      return nativeFetch(input, nextInit);
    };
  }
})();

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

  function jsonHeadersWithBearer(idToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    return headers;
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
      var idToken = '';
      try {
        if (window.CU && typeof window.CU.getIdToken === 'function') {
          idToken = await window.CU.getIdToken();
        }
      } catch (e) {}
      try {
        await window.fetch(window.apiUrl('/events'), {
          method: 'POST',
          headers: jsonHeadersWithBearer(idToken),
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (e) {}
    });
  };

  // ── 전역 JS 오류 수집(2026-08-29) ─────────────────────────────────────
  // 이전에는 프론트 장애가 결제 외에 어디에도 남지 않았다. SPA 부팅이 실패하면 요청 자체를
  // 안 보내므로 서버 로그도 비어 있었고, 사용자는 빈 화면을 보고 조용히 이탈했다.
  // 서버는 이 이벤트를 client.app_error(SEV3)로 기록한다 — 같은 오류가 급증하면 배포 사고 신호.
  var errorReportCount = 0;
  var errorReportSeen = {};
  var ERROR_REPORT_MAX = 8;          // 한 세션당 상한(폭주 시 사용자 회선·서버 보호)

  function reportClientError(detail) {
    try {
      if (errorReportCount >= ERROR_REPORT_MAX) return;
      var key = (detail.message || '') + '|' + (detail.source || '') + '|' + (detail.line || '');
      if (errorReportSeen[key]) return;   // 같은 오류는 세션당 1회만
      errorReportSeen[key] = 1;
      errorReportCount++;

      var payload = {
        type: 'client_error',
        message: cleanText(detail.message, 300),
        source: cleanText(detail.source, 200),
        line: safeNumber(detail.line),
        col: safeNumber(detail.col),
        errorName: cleanText(detail.errorName, 80),
        stack: cleanText(detail.stack, 600),
        page: window.location.pathname,
        release: (window.GP_BUILD_VERSION || '')
      };
      Promise.resolve().then(async function () {
        var idToken = '';
        try {
          if (window.CU && typeof window.CU.getIdToken === 'function') idToken = await window.CU.getIdToken();
        } catch (e) {}
        try {
          await window.fetch(window.apiUrl('/events'), {
            method: 'POST',
            headers: jsonHeadersWithBearer(idToken),
            body: JSON.stringify(payload),
            keepalive: true
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  window.addEventListener('error', function (event) {
    // 리소스 로드 실패(img/script)는 event.error가 없다 — 잡음이라 제외한다.
    if (!event || !event.error) return;
    reportClientError({
      message: event.message || String(event.error),
      source: event.filename,
      line: event.lineno,
      col: event.colno,
      errorName: event.error && event.error.name,
      stack: event.error && event.error.stack
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    if (!reason) return;
    reportClientError({
      message: (reason && reason.message) || String(reason),
      errorName: (reason && reason.name) || 'UnhandledRejection',
      stack: reason && reason.stack
    });
  });

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

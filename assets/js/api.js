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

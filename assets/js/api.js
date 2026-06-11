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
})();

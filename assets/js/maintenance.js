(function () {
  var config = window.APP_CONFIG || {};
  var storageKey = 'gp_maintenance_preview_key';
  var query = new URLSearchParams(window.location.search || '');
  var suppliedKey = query.get('preview_key') || '';
  var expectedKey = config.MAINTENANCE_PREVIEW_KEY || '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function getStoredKey() {
    try { return localStorage.getItem(storageKey) || ''; } catch (e) { return ''; }
  }
  function setStoredKey(value) {
    try { localStorage.setItem(storageKey, value); } catch (e) {}
  }
  function clearPreviewParam() {
    if (!suppliedKey) return;
    try {
      var next = new URL(window.location.href);
      next.searchParams.delete('preview_key');
      window.history.replaceState({}, '', next.pathname + next.search + next.hash);
    } catch (e) {}
  }

  if (expectedKey && suppliedKey && suppliedKey === expectedKey) {
    setStoredKey(suppliedKey);
    clearPreviewParam();
  }

  var previewAllowed = expectedKey && getStoredKey() === expectedKey;
  window.GP_MAINTENANCE_BYPASSED = !!previewAllowed;
  window.GP_MAINTENANCE_BLOCKED = !!config.MAINTENANCE_MODE && !previewAllowed;

  if (!window.GP_MAINTENANCE_BLOCKED) return;

  function render() {
    var root = document.getElementById('page-root');
    if (!root) return;
    var inquiry = config.KAKAO_INQUIRY_URL || 'https://open.kakao.com/o/s3Jegizi';
    var message = config.MAINTENANCE_MESSAGE || '더 안정적인 결제와 변환 환경을 적용하고 있어요. 점검이 끝나면 바로 다시 이용할 수 있습니다.';
    document.documentElement.classList.add('design-ready');
    document.body.classList.add('gp-maintenance-body');
    root.innerHTML =
      '<main class="gp-maintenance-page" aria-labelledby="gpMaintenanceTitle">' +
        '<section class="gp-maintenance-card">' +
          '<img src="/assets/img/brand-logo.png" alt="교수님 피하기" class="gp-maintenance-logo">' +
          '<p class="gp-maintenance-kicker">서비스 점검 중</p>' +
          '<h1 id="gpMaintenanceTitle">잠시만 기다려 주세요.</h1>' +
          '<p class="gp-maintenance-copy">' + esc(message) + '</p>' +
          '<a class="gp-maintenance-kakao" href="' + esc(inquiry) + '" target="_blank" rel="noopener noreferrer">카카오톡 문의하기</a>' +
          '<p class="gp-maintenance-note">이미 결제했거나 작업 결과 확인이 필요한 경우 카카오톡으로 문의해 주세요.</p>' +
        '</section>' +
      '</main>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();

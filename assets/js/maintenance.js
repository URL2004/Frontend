(function () {
  var config = window.APP_CONFIG || {};
  var query = new URLSearchParams(window.location.search || '');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clearPreviewParam() {
    if (!query.has('preview_key')) return;
    try {
      var next = new URL(window.location.href);
      next.searchParams.delete('preview_key');
      window.history.replaceState({}, '', next.pathname + next.search + next.hash);
    } catch (e) {}
  }

  // 과거 공개 런타임 키 기반 우회 상태는 더 이상 신뢰하지 않는다. URL에는
  // 민감해 보이는 레거시 파라미터가 남지 않게 지우고, 점검 모드는 모두에게
  // 동일하게 적용한다.
  clearPreviewParam();
  try { localStorage.removeItem('gp_maintenance_preview_key'); } catch (e) {}
  window.GP_MAINTENANCE_BYPASSED = false;
  window.GP_MAINTENANCE_BLOCKED = !!config.MAINTENANCE_MODE;

  if (!window.GP_MAINTENANCE_BLOCKED) return;

  function render() {
    var root = document.getElementById('page-root');
    if (!root) return;
    var message = config.MAINTENANCE_MESSAGE || '더 안정적인 결제와 변환 환경을 적용하고 있어요. 점검이 끝나면 바로 다시 이용할 수 있어요.';
    document.documentElement.classList.add('design-ready');
    document.body.classList.add('gp-maintenance-body');
    root.innerHTML =
      '<main class="gp-maintenance-page" aria-labelledby="gpMaintenanceTitle">' +
        '<section class="gp-maintenance-card">' +
          '<img src="/assets/img/brand-logo.webp" alt="교수님 피하기" class="gp-maintenance-logo">' +
          '<p class="gp-maintenance-kicker">서비스 점검 중</p>' +
          '<h1 id="gpMaintenanceTitle">잠시만 기다려 주세요.</h1>' +
          '<p class="gp-maintenance-copy">' + esc(message) + '</p>' +
          '<a class="gp-maintenance-email" href="mailto:aqua0661123@naver.com">이메일 문의하기</a>' +
          '<p class="gp-maintenance-note">이미 결제했거나 작업 결과 확인이 필요한 경우 고객센터 이메일로 문의해 주세요.</p>' +
        '</section>' +
      '</main>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();

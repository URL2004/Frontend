(function () {
  // 파셜은 동기 XHR로 로드되어 브라우저 휴리스틱 캐시에 잡히기 쉽다.
  // UI 버전이 바뀔 때마다 올려서 강제로 새 파일을 받게 한다.
  var ASSET_V = 'lav-42';
  var partials = [
    '/partials/login-screen.html',
    '/partials/app-shell-start.html',
    '/pages/main.html',
    '/pages/history.html',
    '/pages/notice.html',
    '/pages/community.html',
    '/pages/qna.html',
    '/pages/pricing.html',
    '/pages/pro.html',
    '/pages/mypage.html',
    '/partials/app-shell-end.html',
    '/partials/footer.html',
    '/partials/modals.html',
    '/partials/mobile-nav.html'
  ];

  function loadPartial(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?v=' + ASSET_V, false);
    xhr.send(null);
    if ((xhr.status < 200 || xhr.status >= 300) && !(xhr.status === 0 && xhr.responseText)) {
      throw new Error('Failed to load page partial: ' + url);
    }
    return xhr.responseText;
  }

  var root = document.getElementById('page-root');
  if (!root) throw new Error('Missing #page-root');
  root.insertAdjacentHTML('beforeend', partials.map(loadPartial).join('\n'));
  window.PAGE_PARTIALS = partials;
})();






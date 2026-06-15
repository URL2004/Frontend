(function () {
  // 파셜은 동기 XHR로 로드되어 브라우저 휴리스틱 캐시에 잡히기 쉽다.
  // UI 버전이 바뀔 때마다 올려서 강제로 새 파일을 받게 한다.
  var ASSET_V = 'lav-123';
  var partials = [
    '/partials/login-screen.html',
    '/partials/app-shell-start.html',
    '/pages/main.html',
    '/pages/history.html',
    '/pages/notice.html',
    '/pages/community.html',
    '/pages/blog.html',
    '/pages/detect-report.html',
    '/pages/guide.html',
    '/pages/faq.html',
    '/pages/qna.html',
    '/pages/pricing.html',
    '/pages/pro.html',
    '/pages/mypage.html',
    '/pages/admin.html',
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

  // SEO 프리렌더 블록 제거: 빌드된 정적 HTML에는 크롤러용 noscript 본문이 있다.
  // JS 브라우저에서는 렌더되지 않지만, 파셜 주입 전에 제거해 중복 ID 가능성을 없앤다.
  var seo = document.getElementById('seo-prerender-static') || document.getElementById('seo-prerender');
  if (seo && seo.parentNode) seo.parentNode.removeChild(seo);

  var root = document.getElementById('page-root');
  if (!root) throw new Error('Missing #page-root');
  root.insertAdjacentHTML('beforeend', partials.map(loadPartial).join('\n'));
  window.PAGE_PARTIALS = partials;
})();
























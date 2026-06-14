(function () {
  // 파셜은 동기 XHR로 로드되어 브라우저 휴리스틱 캐시에 잡히기 쉽다.
  // UI 버전이 바뀔 때마다 올려서 강제로 새 파일을 받게 한다.
  var ASSET_V = 'lav-106';
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

  // SEO 프리렌더 블록 제거: 빌드된 정적 HTML에는 크롤러용 #seo-prerender 가 박혀
  // 있다. 실제 브라우저에서는 SPA가 본문을 새로 렌더하므로, 동일 ID 중복을 막기 위해
  // 파셜을 주입하기 전에 먼저 제거한다(하이드레이션 인계). dev/preview엔 없어서 no-op.
  var seo = document.getElementById('seo-prerender');
  if (seo && seo.parentNode) seo.parentNode.removeChild(seo);

  var root = document.getElementById('page-root');
  if (!root) throw new Error('Missing #page-root');
  root.insertAdjacentHTML('beforeend', partials.map(loadPartial).join('\n'));
  window.PAGE_PARTIALS = partials;
})();































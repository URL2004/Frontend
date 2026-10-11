(function () {
 'use strict';
 var ua = navigator.userAgent || '';
 var googleExternal = /KAKAOTALK|Instagram|FBAN|FBAV/i.test(ua);
 var kakaoExternal = /KAKAOTALK/i.test(ua);
 var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
 function node(id) { return document.getElementById(id); }
 function message(value) {
  var status = node('externalLoginStatus');
  if (status) { status.hidden = false; status.textContent = value; }
 }
 function externalUrl() {
  if (window.gpAttribution && typeof window.gpAttribution.continuationUrl === 'function') return window.gpAttribution.continuationUrl();
  // Never forward OAuth/payment credentials when tracking is unavailable.
  var current = new URL(window.location.href);
  var url = new URL(current.pathname, /^(www\.)?gpkorea\.ai\.kr$/.test(current.hostname) ? 'https://gpkorea.ai.kr' : current.origin);
  ['mode', 'lp', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'NaPm', 'gclid', 'fbclid'].forEach(function (key) {
   var value = current.searchParams.get(key);
   if (value) url.searchParams.set(key, value.slice(0, 500));
  });
  return url.toString();
 }
 function showHelp() {
  var help = node('externalLoginHelp');
  if (help) { help.hidden = false; help.style.display = 'flex'; }
  var draft = node('copyLoginDraftButton');
  if (draft) draft.hidden = !node('lavInput')?.value;
  var draftHint = node('loginDraftHint');
  if (draftHint) draftHint.hidden = !node('lavInput')?.value;
 }
 function apply() {
  if (!googleExternal) return;
  var hint = node('inappLoginHint');
  if (hint) {
   hint.hidden = false;
   hint.textContent = kakaoExternal
    ? '카카오톡에서는 Safari 또는 Chrome으로 열어 로그인해 주세요.'
    : '앱 안에서는 카카오로 로그인할 수 있어요. Google은 Safari 또는 Chrome에서 계속해 주세요.';
  }
  var googleLabel = node('googleLoginLabel');
  if (googleLabel) googleLabel.textContent = '외부 브라우저에서 Google로 계속';
  var kakaoLabel = node('kakaoLoginLabel');
  if (kakaoLabel && kakaoExternal) kakaoLabel.textContent = '외부 브라우저에서 카카오로 계속';
  var actions = node('socialLoginActions');
  var google = node('googleLoginBtn'), kakao = node('kakaoLoginBtn');
  if (actions && google && kakao && !kakaoExternal) {
   actions.insertBefore(kakao, google);
   actions.dataset.kakaoFirst = 'true';
  }
  showHelp();
 }
 function openExternal() {
  showHelp();
  var url = externalUrl();
  if (window.gpTrack) window.gpTrack('login_external_open', { source: 'login' });
  if (ios && kakaoExternal) window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
  else if (!ios && /Android/i.test(ua)) {
   // Intent URIs use their own fragment grammar; send continuation metadata in the query.
   var target = new URL(url);
   var fragment = target.hash;
   target.hash = '';
   if (fragment) target.searchParams.set('gp_attribution', new URLSearchParams(fragment.slice(1)).get('gp_attribution') || '');
   window.location.href = 'intent://' + target.toString().replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  } else {
   // The app menu opens the current address. Prepare that address as well as the copy link.
   var prepared = new URL(url);
   if (prepared.origin === window.location.origin && window.history?.replaceState) {
    window.history.replaceState(window.history.state, '', prepared.pathname + prepared.search + prepared.hash);
   }
   message('앱 메뉴에서 Safari 또는 브라우저로 열기를 선택해 주세요. 메뉴가 없으면 주소를 복사해 Safari나 Chrome에 붙여넣어 주세요.');
   node('copyExternalLoginLink')?.focus();
  }
 }
 async function copyLink() {
  var url = externalUrl();
  try {
   await navigator.clipboard.writeText(url);
   message('주소를 복사했어요. Safari 또는 Chrome 주소창에 붙여넣어 로그인해 주세요.');
  } catch (_) {
   var field = node('externalLoginUrl');
   if (field) { field.hidden = false; field.value = url; field.focus(); field.select(); }
   message('주소를 길게 눌러 복사한 뒤 Safari 또는 Chrome 주소창에 붙여넣어 주세요.');
  }
 }
 window.gpLoginContinuity = { googleExternal: googleExternal, kakaoExternal: kakaoExternal, apply: apply, openExternal: openExternal, copyLink: copyLink, externalUrl: externalUrl };
 apply();
})();

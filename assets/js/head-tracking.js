var gtagScript = document.createElement('script');
gtagScript.async = true;
gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(window.APP_CONFIG.GA_MEASUREMENT_ID);
document.head.appendChild(gtagScript);

window.dataLayer=window.dataLayer||[];
 function gtag(){dataLayer.push(arguments);}
 gtag('js',new Date());
 gtag('config', window.APP_CONFIG.GA_MEASUREMENT_ID);
 // 유입 경로 저장
 (function(){
  var params = new URLSearchParams(location.search);
  var utm = params.get('utm_source');
  if (utm) { localStorage.setItem('traffic_source', utm); return; }
  var ref = document.referrer;
  if (!ref) return;
  try {
   var host = new URL(ref).hostname;
   if (host.includes('instagram')) localStorage.setItem('traffic_source', 'instagram');
   else if (host.includes('naver')) localStorage.setItem('traffic_source', 'naver');
   else if (host.includes('google')) localStorage.setItem('traffic_source', 'google');
   else if (host.includes('kakao')) localStorage.setItem('traffic_source', 'kakao');
   else if (host.includes('youtube')) localStorage.setItem('traffic_source', 'youtube');
   else if (host.includes('facebook')) localStorage.setItem('traffic_source', 'facebook');
   else if (host.includes('twitter') || host.includes('x.com')) localStorage.setItem('traffic_source', 'twitter');
   else localStorage.setItem('traffic_source', host);
  } catch(e){}
 })();

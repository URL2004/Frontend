import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('커뮤니티는 직접 URL·SPA·번들·프리렌더·사이트맵에서 모두 폐쇄된다', async () => {
  const [vercelRaw, appMain, loader, build, routes, sitemap, designs, conversion] = await Promise.all([
    read('vercel.json'),
    read('assets/js/app-main.js'),
    read('assets/js/page-loader.js'),
    read('scripts/build-vite-static.mjs'),
    read('scripts/route-meta.mjs'),
    read('scripts/sitemap-gen.mjs'),
    read('assets/js/main-designs.js'),
    read('assets/js/conversion-flow.js')
  ]);
  const vercel = JSON.parse(vercelRaw);
  const redirect = (vercel.redirects || []).find(item => item.source === '/community');
  assert.ok(redirect, '/community 서버 리다이렉트가 필요함');
  assert.equal(redirect.permanent, false);
  assert.ok((vercel.redirects || []).some(item => item.source === '/community/:path*'));
  assert.ok((vercel.redirects || []).some(item => item.source === '/pages/community.html'));
  for (const source of ['/community', '/community/:path*', '/pages/community.html']) {
    const routeHeaders = (vercel.headers || []).find(item => item.source === source)?.headers || [];
    assert.ok(routeHeaders.some(item => item.key === 'Cache-Control' && item.value.includes('no-store')), `${source} no-store 부재`);
    assert.ok(routeHeaders.some(item => item.key === 'X-Robots-Tag' && item.value.includes('noindex')), `${source} noindex 부재`);
  }
  assert.equal((vercel.rewrites || []).some(item => item.source === '/community'), false);
  assert.doesNotMatch(appMain, /ROUTE_TABS\s*=\s*\[[^\]]*community/u);
  assert.doesNotMatch(appMain, /['"]\/community['"]\s*:\s*['"]community/u);
  assert.match(appMain, /consumeClosedCommunityRoute\(\)/u);
  assert.doesNotMatch(loader, /\/pages\/community\.html/u);
  assert.doesNotMatch(routes, /url:\s*['"]\/community['"]/u);
  assert.doesNotMatch(sitemap, /['"]\/community['"]/u);
  assert.doesNotMatch(designs, /['"]community['"]/u);
  assert.doesNotMatch(conversion, /OFFER_PAGES\s*=\s*\[[^\]]*community/u);
  assert.doesNotMatch(build.match(/const pagePartials = \[[\s\S]*?\];/u)?.[0] || '', /pages\/community\.html/u);
  assert.match(build, /fs\.rm\(path\.join\(dist, 'pages', 'community\.html'\)/u);

  const guardSource = appMain.slice(
    appMain.indexOf('function cleanRoutePath'),
    appMain.indexOf('function routeUrl')
  );
  const runCommunityGuard = href => {
    let replaced = '';
    const context = {
      URL,
      setTimeout(callback) { callback(); },
      window: {
        location: { href },
        history: { replaceState(_state, _title, next) { replaced = next; } }
      }
    };
    vm.runInNewContext(`${guardSource}\nwindow.__closed = consumeClosedCommunityRoute();`, context);
    return { closed: context.window.__closed, replaced };
  };
  assert.deepEqual(runCommunityGuard('https://gpkorea.ai.kr/community/archive/1'), {
    closed: true,
    replaced: '/?mode=humanize'
  });
  assert.deepEqual(runCommunityGuard('https://gpkorea.ai.kr/#/community/post/1'), {
    closed: true,
    replaced: '/?mode=humanize'
  });
  assert.deepEqual(runCommunityGuard('https://gpkorea.ai.kr/?mode=humanize'), {
    closed: false,
    replaced: ''
  }, '폐쇄 안내 목적지는 다시 리다이렉트하면 안 됨');
});

test('커뮤니티 레거시 함수는 Firestore 접근 전에 영구 종료되고 마이페이지도 posts를 조회하지 않는다', async () => {
  const [source, boot, config] = await Promise.all([
    read('assets/js/app-module.js'),
    read('assets/js/app-boot.js'),
    read('assets/js/config.js')
  ]);
  assert.match(source, /const COMMUNITY_CLOSED = true/u);
  for (const name of ['loadPosts', 'submitPost', 'viewPost', 'submitComment', 'toggleBm', 'delPost', 'togglePostHidden', 'delComment', 'sendNotification', 'toggleLike', 'submitReply']) {
    const start = source.indexOf(`window.${name} =`);
    assert.ok(start >= 0, `${name} 진입점 부재`);
    const body = source.slice(start, start + 260);
    assert.match(body, /if \(blockClosedCommunity\(\)\) return false;/u, `${name}의 폐쇄 가드 부재`);
  }
  const mypage = source.slice(source.indexOf('window.loadMyPage = async'), source.indexOf('// 마이페이지 정기결제'));
  assert.doesNotMatch(mypage, /collection\(db,['"]posts['"]\)/u);
  assert.doesNotMatch(mypage, /viewPost|switchTab\(['"]community/u);
  assert.doesNotMatch(source, /firebase-storage|getStorage\(|community_photos|uploadBytes\(|getDownloadURL\(/u);
  assert.doesNotMatch(source, /sendEmailNotification|window\.emailjs/u);
  assert.doesNotMatch(boot, /emailjs|email-init/u);
  assert.doesNotMatch(config, /EMAILJS/u);
  await assert.rejects(read('assets/js/email-init.js'), /ENOENT/u);
  const notifications = source.slice(source.indexOf('window.loadNotifications = async'), source.indexOf('window.markRead = async'));
  assert.doesNotMatch(notifications, /switchTab\(['"]community|viewPost\(/u);
});

test('작업 원문·결과·AI 상세는 브라우저 localStorage 폴백이나 직접 Firestore 쓰기로 복제하지 않는다', async () => {
  const source = await read('assets/js/app-module.js');
  const history = source.slice(source.indexOf('// ===== HISTORY ====='), source.indexOf('function historyBillingInfo'));
  assert.match(source, /localStorage\.removeItem\(PENDING_HISTORY_KEY\)/u);
  assert.doesNotMatch(history, /localStorage\.setItem/u);
  assert.doesNotMatch(history, /addDoc\(collection\(db,['"]users['"],CU\.uid,['"]history['"]\)/u);
  assert.doesNotMatch(history, /inputText|outputText|humanDetail|rawProbability|probabilityCalibration/u);
  assert.match(source, /onAuthStateChanged[\s\S]{0,180}?clearPendingHistoryLocal\(\)/u);
  assert.match(source, /window\.logout[\s\S]{0,360}?clearPendingHistoryLocal\(\)/u);
});

test('결제 콜백 비밀 query는 부트 이전에 메모리로 옮기고 URL에서 제거한다', async () => {
  const [index, stateSource, callbacks, main, tracking] = await Promise.all([
    read('index.html'),
    read('assets/js/payment-callback-state.js'),
    read('assets/js/payment-callbacks.js'),
    read('assets/js/app-main.js'),
    read('assets/js/head-tracking.js')
  ]);
  assert.ok(index.indexOf('/assets/js/payment-callback-state.js') < index.indexOf('/runtime-config.js'));
  const captureCallback = query => {
    let replaced = '';
    const context = {
      URLSearchParams,
      URL,
      Object,
      window: {
        location: { search: query, href: `https://gpkorea.ai.kr/${query}` },
        history: { state: { tab: 'main' }, replaceState(_state, _title, next) { replaced = next; } }
      }
    };
    context.window.window = context.window;
    vm.runInNewContext(stateSource, context);
    return { captured: context.window.GP_PAYMENT_CALLBACK_QUERY, replaced };
  };
  const credit = captureCallback('?paymentKey=secret&orderId=order_1&amount=2900&credits=105&plan=starter&uid=user_1&mp=preview');
  assert.equal(credit.captured.paymentKey, 'secret');
  assert.equal(credit.captured.orderId, 'order_1');
  assert.equal(credit.replaced, '/?mp=preview');
  const subscription = captureCallback('?authKey=billing-secret&sub=standard&ck=callback-key&subfail=1&code=E42&mp=preview');
  assert.equal(subscription.captured.authKey, 'billing-secret');
  assert.equal(subscription.captured.sub, 'standard');
  assert.equal(subscription.captured.ck, 'callback-key');
  assert.equal(subscription.replaced, '/?mp=preview');
  assert.match(index, /if \(window\.GP_PAYMENT_CALLBACK_QUERY\) return;/u,
    '조기 URL 정리 뒤 랜딩 프리렌더가 결제 콜백 화면을 덮으면 안 됨');
  assert.match(callbacks, /GP_PAYMENT_CALLBACK_QUERY/u);
  assert.match(callbacks, /creditPaymentRetryCount >= 2/u, '메모리 콜백은 네트워크 오류 시 같은 화면에서만 제한 재시도해야 함');
  assert.match(callbacks, /페이지를 닫지 않으면 잠시 후 자동으로 다시 확인/u);
  assert.doesNotMatch(callbacks, /새로고침하면 자동으로 처리/u, 'URL 제거 뒤 새로고침 재개를 약속하면 안 됨');
  assert.match(tracking, /function analyticsSafeLocation/u);
  for (const key of ['paymentKey', 'orderId', 'amount', 'uid', 'authKey', 'sub', 'ck', 'subfail']) {
    assert.match(tracking, new RegExp(`['"]${key}['"]`, 'u'), `${key} 분석 URL 제거 목록 부재`);
  }
  assert.match(tracking, /pageLocation = analyticsSafeLocation/u);
  assert.match(main, /crypto\.randomUUID/u);
  assert.match(main, /crypto\.getRandomValues\(randomBytes\)/u);
  assert.doesNotMatch(main, /const orderId = ['"]order_['"] \+ Date\.now\(\)/u);
});

test('CSP 강화안은 관측 모드로 검증하고 현행 차단 정책은 운영 호환을 유지한다', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const globalHeaders = new Map(config.headers[0].headers.map(item => [item.key.toLowerCase(), item.value]));
  const enforced = globalHeaders.get('content-security-policy') || '';
  const csp = globalHeaders.get('content-security-policy-report-only') || '';
  assert.equal(enforced, "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests");
  for (const directive of ['default-src', 'script-src', 'connect-src', 'img-src', 'form-action', 'frame-src', 'worker-src', 'font-src', 'style-src', 'manifest-src']) {
    assert.match(csp, new RegExp(`(?:^|; )${directive} `, 'u'), `${directive} 부재`);
  }
  assert.match(csp, /script-src 'self' 'unsafe-inline'/u, '현행 인라인 핸들러 호환과 외부 출처 제한이 함께 필요함');
  for (const origin of ['www.gstatic.com', 'developers.kakao.com', 'cdnjs.cloudflare.com', 'connect.facebook.net', 'www.googletagmanager.com', 'js.tosspayments.com', 'wcs.naver.net']) {
    assert.match(csp, new RegExp(origin.replaceAll('.', '\\.'), 'u'), `${origin} SDK 허용 출처 부재`);
  }
  assert.match(csp, /frame-src[^;]*https:\/\/\*\.firebaseapp\.com/u, 'Firebase Auth iframe 허용 출처 부재');
  assert.match(csp, /connect-src[^;]*https:\/\/stats\.g\.doubleclick\.net/u, 'GA 네트워크 허용 출처 부재');
  assert.doesNotMatch(csp, /api\.emailjs\.com/u);
});

test('카카오 인증은 custom token을 우선하고 명시적 v1 응답만 운영 호환하며 state·PKCE S256을 사용한다', async () => {
  const source = await read('assets/js/app-module.js');
  assert.match(source, /signInWithCustomToken\(auth, data\.customToken\)/u);
  assert.match(source, /data\.authVersion !== 2/u);
  assert.match(source, /data\.authVersion === 1 && data\.kakaoId && data\.email && typeof legacyPasswordFor === 'function'/u,
    '운영 호환 경로는 서버가 명시적으로 authVersion 1을 반환한 경우에만 사용해야 함');
  assert.match(source, /signInOrCreateLegacyKakaoUser\(data, legacyPasswordFor\(data\.kakaoId\)\)/u);
  assert.match(source, /signInWithEmailAndPassword|createUserWithEmailAndPassword|auth\/email-already-in-use/u);
  assert.match(source, /kakaoId => \[\s*'kakao_' \+ kakaoId \+ '_pw!',\s*'kakao_' \+ kakaoId \+ '_!@#'/u,
    '리다이렉트 로그인은 두 과거 비밀번호 규칙을 순서대로 호환해야 함');
  assert.match(source, /kakaoId => \[\s*'kakao_' \+ kakaoId \+ '_!@#',\s*'kakao_' \+ kakaoId \+ '_pw!'/u,
    '팝업 로그인도 두 과거 비밀번호 규칙을 순서대로 호환해야 함');
  assert.match(source, /window\.crypto\.getRandomValues\(stateBytes\)/u);
  assert.match(source, /window\.crypto\.getRandomValues\(verifierBytes\)/u);
  assert.match(source, /KAKAO_OAUTH_STATE_TTL_MS = 10 \* 60 \* 1000/u);
  assert.match(source, /sessionStorage\.removeItem\(KAKAO_OAUTH_STATE_KEY\)/u);
  assert.match(source, /fixedTimeStringEqual\(stored\.state, returnedState\)/u);
  assert.match(source, /const oauthContext = consumeKakaoOAuthState\(params\.get\('state'\)\);[\s\S]{0,80}?if \(!oauthContext\)/u);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/u);
  assert.match(source, /authorize\.searchParams\.set\('code_challenge', context\.codeChallenge\)/u);
  assert.match(source, /authorize\.searchParams\.set\('code_challenge_method', 'S256'\)/u);
  assert.match(source, /code_verifier: oauthContext\.codeVerifier/u);
  assert.match(source, /sessionStorage\.removeItem\(KAKAO_OAUTH_STATE_KEY\)[\s\S]{0,360}?return \{ codeVerifier: stored\.codeVerifier \}/u,
    'PKCE verifier는 세션 저장소에서 단일 사용으로 소비해야 함');
  const callback = source.slice(source.indexOf('window.handleKakaoCallback = async'), source.indexOf('window.kakaoLogin = async'));
  assert.ok(callback.indexOf('clearKakaoCallbackQuery();') < callback.indexOf("fetch('https://kauth.kakao.com/oauth/token'"),
    '카카오 code/state는 토큰 네트워크 요청 전에 주소창에서 제거해야 함');
});

test('친구 추천은 가입 즉시 잔액을 조작하지 않고 첫 결제 환불기간 뒤 지급을 안내한다', async () => {
  const [source, main, modals] = await Promise.all([
    read('assets/js/app-module.js'),
    read('pages/main.html'),
    read('partials/modals.html')
  ]);
  assert.doesNotMatch(source, /window\.UC\s*\+=\s*20/u);
  assert.match(source, /referral_registered/u);
  assert.match(source, /친구의 첫 결제 후 환불 가능 기간이 지나면/u);
  assert.match(source, /첫 결제를 완료하고 환불 가능 기간이 지나면/u);
  assert.match(main, /친구의 첫 결제·환불 가능 기간이 지나면/u);
  assert.match(modals, /친구의 첫 결제 후 각각 20크레딧/u);
  assert.match(modals, /첫 결제를 완료하고 환불 가능 기간이 지나면/u);
  assert.doesNotMatch(modals, /가입하면[^<\n]*20크레딧|신규 가입하면[^<\n]*20크레딧|가입이 확인되면[^<\n]*20크레딧/u);
});

test('계정 삭제는 최근 로그인·미정산 업무 코드를 보존해 안전한 재시도를 안내한다', async () => {
  const source = await read('assets/js/app-module.js');
  const accountDelete = source.slice(source.indexOf('window.deleteAccount = async'), source.indexOf('window.showReferralPopup = async'));
  assert.match(accountDelete, /body\?\.code/u);
  assert.match(accountDelete, /code === 'RECENT_LOGIN_REQUIRED'/u);
  assert.match(accountDelete, /로그아웃한 뒤 카카오 또는 구글로 다시 로그인/u);
  assert.match(accountDelete, /code\.startsWith\('ACCOUNT_PENDING_'\)/u);
  assert.match(accountDelete, /alert\(serverMessage\)/u);
  assert.doesNotMatch(accountDelete, /deleteAccount\(\)|location\.reload\(\)[\s\S]{0,120}?RECENT_LOGIN_REQUIRED/u);
});

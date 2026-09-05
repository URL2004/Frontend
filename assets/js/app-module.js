import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signOut, onAuthStateChanged, reauthenticateWithPopup, updateProfile, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, orderBy, query, where, limit, startAfter, serverTimestamp, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { compactPageNumbers, paginateItems } from './board-pagination.js';

// XSS 방어: 사용자 입력이 innerHTML에 들어갈 때 escape 필수
function escapeHtml(s) {
 if (s == null) return '';
 return String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
window.escapeHtml = escapeHtml;
// HTML 속성에 담긴 JS 문자열(예: onclick="fn('${jsAttr(x)}')")용 이중 이스케이프
function jsAttr(s) {
 return String(s == null ? '' : s)
  // &를 먼저 막아 &#39; / &apos;가 HTML 파싱 뒤 따옴표로 복원되는 우회를 차단한다.
  .replace(/&/g,'&amp;').replace(/\\/g,'\\\\').replace(/'/g,"\\'")
  .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
window.jsAttr = jsAttr;
// 사진 URL 화이트리스트: Firebase Storage 도메인만 허용
function safePhotoUrl(url) {
 try {
  const u = new URL(url);
  const ok = ['firebasestorage.googleapis.com','storage.googleapis.com'];
  return u.protocol === 'https:' && ok.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) ? u.toString() : '';
 } catch { return ''; }
}
window.safePhotoUrl = safePhotoUrl;
// FAQ 아코디언 토글
window.toggleFaq = function(btn) {
 const item = btn.closest('.faq-item');
 if (!item) return;
 const open = item.classList.toggle('open');
 const answerId = btn.getAttribute('aria-controls');
 const answer = answerId ? document.getElementById(answerId) : item.querySelector('.faq-a');
 btn.setAttribute('aria-expanded', open ? 'true' : 'false');
 if (answer) answer.setAttribute('aria-hidden', open ? 'false' : 'true');
};

const FB = window.APP_CONFIG.FIREBASE;
const fbapp = initializeApp(FB);
const auth = getAuth(fbapp); window._fbAuth = auth;
const db = getFirestore(fbapp);
const provider = new GoogleAuthProvider();
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(e => console.warn('Firebase auth persistence setup failed:', e));
window.authPersistenceReady = authPersistenceReady;

// 추천 링크: ?ref= 파라미터 저장
(function() {
 const urlParams = new URLSearchParams(window.location.search);
 const refCode = urlParams.get('ref');
 // 서버 추천 코드 계약과 같은 보수적인 문자 집합만 보관한다. URL에서 온 임의
 // 문자열이 브라우저 저장소에 남거나 이후 API 요청으로 전달되지 않게 한다.
 if (refCode && /^[A-Za-z0-9_-]{8}$/.test(refCode)) {
  try { localStorage.setItem('pendingRef', refCode); } catch (_) {}
 }
})();

let _authResolve;
let _authReadySettled = false;
window.authReady = new Promise(resolve => { _authResolve = resolve; });
function settleAuthReady() {
 if (_authReadySettled) return;
 _authReadySettled = true;
 _authResolve();
}
function wait(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}
window.waitForAuthUser = async function(timeoutMs) {
 const deadline = Date.now() + (timeoutMs == null ? 8000 : timeoutMs);
 try { await Promise.race([authPersistenceReady, wait(500)]); } catch (_) {}
 while (Date.now() < deadline) {
  const user = window.CU || auth.currentUser;
  if (user && user.getIdToken) {
   CU = user;
   window.CU = user;
   return user;
  }
  if (window.authReady && !_authReadySettled) {
   try { await Promise.race([window.authReady, wait(250)]); } catch (_) {}
  } else {
   await wait(120);
  }
 }
 const user = window.CU || auth.currentUser;
 if (user && user.getIdToken) {
  CU = user;
  window.CU = user;
  return user;
 }
 return null;
};
window._fbDb = db;
window._fbGetDoc = getDoc;
window._fbDoc = doc;

let CU = null;
window.UC = 0;
window.UP = 'free';
window.gpUserDataReady = false;
const ADMIN_ROLES = {
 'nC90IyjgaIZ8Z0JTABMTiyQHF9g1': { name:'운영자', label:'운영자' },
 'qa0iQAeVmMOxoy6Vg5ENTRKk0Vm2': { name:'관리자', label:'관리자' },
 'upyxtXMQEgQXfqTUWPrf6QS9EqE2': { name:'개발자', label:'개발자' },
 '9i6YA66mpXSBcpPJqNmJQ5jnJsT2': { name:'관리자', label:'관리자' }
};
window.isAdmin = () =>CU && !!ADMIN_ROLES[CU.uid];
window.getAdminName = () =>CU && ADMIN_ROLES[CU.uid] ? ADMIN_ROLES[CU.uid].name : null;

let activeAuthProvider = '';
let authTransitionStartedAt = 0;
let authTransitionSlowTimer = 0;
let authBackendWarmPromise = null;

function authTransitionElement(id) {
 return document.getElementById(id);
}

function setSocialLoginControls(busy, message) {
 const googleButton = authTransitionElement('googleLoginBtn');
 const kakaoButton = authTransitionElement('kakaoLoginBtn');
 [googleButton, kakaoButton].forEach(button => {
  if (!button) return;
  button.disabled = !!busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
 });
 const status = authTransitionElement('socialLoginStatus');
 const statusText = authTransitionElement('socialLoginStatusText');
 if (statusText && message) statusText.textContent = message;
 if (status) status.hidden = !busy;
}

function setAuthTransitionMessage(title, message) {
 const titleNode = authTransitionElement('authTransitionTitle');
 const messageNode = authTransitionElement('authTransitionMessage');
 if (titleNode && title) titleNode.textContent = title;
 if (messageNode && message) messageNode.textContent = message;
}

function beginAuthTransition(providerName, title, message) {
 activeAuthProvider = providerName || 'social';
 authTransitionStartedAt = performance.now();
 clearTimeout(authTransitionSlowTimer);
 setSocialLoginControls(true, '인증을 확인하고 있어요. 잠시만 기다려 주세요.');
 setAuthTransitionMessage(title || '로그인 확인 중', message || '작업 화면을 준비하고 있어요.');

 const overlay = authTransitionElement('authTransition');
 const appScreen = authTransitionElement('appScreen');
 if (typeof window.showScreen === 'function') window.showScreen('app');
 if (appScreen) {
  appScreen.inert = true;
  appScreen.setAttribute('aria-busy', 'true');
 }
 if (overlay) {
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
 }
 document.body.classList.add('gp-auth-transitioning');
 authTransitionSlowTimer = setTimeout(() => {
  setAuthTransitionMessage('로그인 마무리 중', '연결이 평소보다 조금 늦어지고 있어요. 이 화면에서 잠시만 기다려 주세요.');
 }, 4500);
}

function finishAuthTransition(result) {
 clearTimeout(authTransitionSlowTimer);
 const elapsed = authTransitionStartedAt ? Math.round(performance.now() - authTransitionStartedAt) : 0;
 const providerName = activeAuthProvider;
 activeAuthProvider = '';
 authTransitionStartedAt = 0;
 const overlay = authTransitionElement('authTransition');
 const appScreen = authTransitionElement('appScreen');
 if (overlay) {
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
 }
 if (appScreen) {
  appScreen.inert = false;
  appScreen.removeAttribute('aria-busy');
 }
 document.body.classList.remove('gp-auth-transitioning');
 setSocialLoginControls(false, '');
 if (providerName && window.gpTrack) {
  window.gpTrack('login_transition_complete', {
   method: providerName,
   result: result || 'success',
   duration_ms: elapsed
  });
 }
}

function showAuthenticatedShell(user, reason) {
 if (!user) return;
 const ownerChange = window.gpSessionSecurity
  ? window.gpSessionSecurity.bindUser(user.uid)
  : { changed: false, previous: '', current: user.uid };
 if (ownerChange.changed && ownerChange.previous !== 'guest' && ownerChange.current !== 'guest') {
  clearSensitiveAuthDom();
 }
 CU = user;
 window.CU = user;
 window.GP_REQUESTED_APP_SCREEN = 'app';
 if (typeof window.gpLandingCompleteLogin === 'function') window.gpLandingCompleteLogin();
 if (typeof window.showScreen === 'function') window.showScreen('app');
 if (typeof window.updateAuthUI === 'function') window.updateAuthUI(true);
 if (typeof window.applyRouteFromUrl === 'function') window.applyRouteFromUrl({ replace: true });
 finishAuthTransition('success');
 if (reason) retryPendingPaymentCallback(reason);
}

function clearSensitiveAuthDom() {
 ['lavInput', 'lavBlockedMemo', 'wlNotes', 'wlEmphasis', 'wlFinal', 'wlDraft', 'adminLabInput', 'adminLabMemo', 'adminLabBaselineOutput', 'adminLabOutput']
  .forEach(id => {
   const node = document.getElementById(id);
   if (node && 'value' in node) node.value = '';
  });
 ['result', 'lavDoneBody', 'lavRepBefore', 'lavRepAfter'].forEach(id => {
  const node = document.getElementById(id);
  if (node) node.textContent = '';
 });
}

function failAuthTransition() {
 window.GP_REQUESTED_APP_SCREEN = 'login';
 finishAuthTransition('error');
 if (typeof window.showScreen === 'function') window.showScreen('login');
}

window.gpWarmAuthBackend = function () {
 if (authBackendWarmPromise) return authBackendWarmPromise;
 if (!window.APP_CONFIG?.API_BASE || typeof window.apiUrl !== 'function') return Promise.resolve(false);
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 5000);
 authBackendWarmPromise = fetch(window.apiUrl('/healthz'), {
  method: 'GET',
  mode: 'cors',
  cache: 'no-store',
  credentials: 'omit',
  signal: controller.signal
 }).then(response => response.ok).catch(() => false).then(ok => {
  // 콜드 스타트 중 1차 워밍 요청이 시간 초과되면 로그인 클릭 시 다시 시도한다.
  if (!ok) authBackendWarmPromise = null;
  return ok;
 }).finally(() => clearTimeout(timer));
 return authBackendWarmPromise;
};

window.gpBeginAuthTransition = beginAuthTransition;
window.gpFinishAuthTransition = finishAuthTransition;

function scheduleAuthBackendWarmup() {
 const run = () => {
  if (!auth.currentUser) window.gpWarmAuthBackend();
 };
 if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1800 });
 else setTimeout(run, 700);
}
if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', scheduleAuthBackendWarmup, { once: true });
} else {
 scheduleAuthBackendWarmup();
}

function retryPendingPaymentCallback(reason) {
 setTimeout(() => {
  try {
   if (typeof window.processPendingPaymentCallback !== 'function') return;
   const p = window.processPendingPaymentCallback({ reason });
   if (p && typeof p.catch === 'function') {
    p.catch(e => console.warn('pending payment callback retry failed:', e));
   }
  } catch (e) {
   console.warn('pending payment callback retry failed:', e);
  }
 }, 0);
}

onAuthStateChanged(auth, async u =>{
 try {
  window.gpAuthResolved = true;
  if (window.gpSetAnalyticsInternal) window.gpSetAnalyticsInternal(!!(u && ADMIN_ROLES[u.uid]));
  if (u) {
  window.gpUserDataReady = false;
  showAuthenticatedShell(u, 'auth_state');
  await loadUser(u);
  }
  else {
  if (window.gpSessionSecurity) window.gpSessionSecurity.bindUser('');
  CU = null; window.CU = null;
  window.gpUserDataReady = false;
  if (window.gpSetRemoteNotifications) window.gpSetRemoteNotifications([]);
  if (window.GP_REQUESTED_APP_SCREEN === 'login') {
   showScreen('login');
  } else {
   showScreen('app');
   if (typeof window.applyRouteFromUrl === 'function') window.applyRouteFromUrl({ replace: true });
   else switchTab('main');
  }
  window.updateAuthUI(false);
  }
 } catch (e) {
  console.error('auth state handling failed:', e);
  if (u) {
   showAuthenticatedShell(u, 'auth_state_fallback');
  }
 } finally {
  settleAuthReady();
 }
});

// 운영 알림 중계(문의·가입·초대) — fire-and-forget, 사용자 흐름 절대 안 막음. 백엔드 /events가 미설정이면 즉시 종료됨.
async function gpNotifyEvent(type, data) {
 try {
  if (!CU || !CU.getIdToken) return;
  const idToken = await CU.getIdToken();
  const metaContext = window.gpMetaContext && typeof window.gpMetaContext === 'function'
   ? window.gpMetaContext()
   : {};
  fetch(window.apiUrl('/events'), {
   method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({ type, ...metaContext, ...(data || {}) })
  }).catch(() => {});
 } catch (_) { /* 알림 실패는 무시 */ }
}
window.gpNotifyEvent = gpNotifyEvent;

async function loadUser(u) {
 const uRef = doc(db,'users',u.uid);
 let snap = await getDoc(uRef);
 let createdNow = false;
 let signupMetaEventId = '';
 if (!snap.exists()) {
 const signupAttribution = window.gpAttribution && typeof window.gpAttribution.snapshot === 'function'
  ? window.gpAttribution.snapshot()
  : null;
 let initialized;
 try {
  initialized = await postAuthedJson('/account/initialize', { ...(signupAttribution ? { signupAttribution } : {}), meta: window.gpMetaContext ? window.gpMetaContext() : {} }, u);
 } catch (error) {
  // 유입 태그가 구형·손상된 경우 가입 자체를 막지 않는다. 서버가 허용 필드만
  // 저장하도록 빈 attribution으로 멱등 재시도한다.
  if (error?.code !== 'INVALID_ATTRIBUTION') throw error;
  initialized = await postAuthedJson('/account/initialize', {}, u);
 }
 createdNow = initialized?.duplicate === false;
 signupMetaEventId = String(initialized?.metaEventId || '');
 snap = await getDoc(uRef);
 if (!snap.exists()) throw new Error('계정 정보를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
 }
 const d = snap.data();
 window.UC = d.credits||0; window.UP = d.plan||'free';
 // 구독/쿠폰 상태 정규화
 if (d.subscription) {
   window.SUB = {
     tier: d.subscription.tier,
     status: d.subscription.status,
     cycleStartedMs: d.subscription.cycleStartedAt?.toMillis ? d.subscription.cycleStartedAt.toMillis() : (d.subscription.cycleStartedAt?._seconds ? d.subscription.cycleStartedAt._seconds*1000 : 0),
     nextBillingMs: d.subscription.nextBillingAt?.toMillis ? d.subscription.nextBillingAt.toMillis() : (d.subscription.nextBillingAt?._seconds ? d.subscription.nextBillingAt._seconds*1000 : 0),
     cancelledAt: d.subscription.cancelledAt || null,
     cardCompany: d.subscription.cardCompany || null,
     cardNumber: d.subscription.cardNumber || null
   };
 } else { window.SUB = null; }
 window.COUPON = d.coupon ? { tier: d.coupon.tier, remaining: d.coupon.remaining, granted: d.coupon.granted, used: d.coupon.used || 0 } : null;
 // pro 등급 정규화: 구독자는 'pro' 또는 'unlimited'
 const subValid = window.SUB && (window.SUB.status === 'active' || (window.SUB.status === 'cancelled' && window.SUB.nextBillingMs > Date.now()));
 if (subValid && window.SUB.tier === 'unlimited') window.UP = 'unlimited';
 else if (subValid) window.UP = 'pro';
 if (!d.refCode) await updateDoc(uRef, { refCode: u.uid.substring(0,8) });
 if (createdNow) {
  const trafficSource = localStorage.getItem('traffic_source') || 'direct';
  const signMethod = (u.providerData[0]?.providerId === 'google.com') ? 'google' : (u.email?.includes('@kakao.com')) ? 'kakao' : 'email';
  if (window.gpTrack) window.gpTrack('sign_up', { method: signMethod, traffic_source: trafficSource, meta_event_id: signupMetaEventId });
  gpNotifyEvent('signup', { via: signMethod, metaEventId: signupMetaEventId });
 }
 // Pro 탭 잠금 아이콘 표시
 const lock = document.getElementById('snavProLock');
 const isPro = window.UP === 'pro' || window.UP === 'unlimited';
 if (lock) lock.style.display = isPro ? 'none' : 'inline';
 // 추천 코드가 있으면 백엔드에 요청 (신규/기존 유저 모두)
 const pendingRef = localStorage.getItem('pendingRef');
 const myRefCode = d.refCode || u.uid.substring(0,8);
 if (pendingRef && pendingRef !== myRefCode) {
  try {
   const token = await u.getIdToken();
   const res = await fetch(window.apiUrl('/apply-referral'), {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token},
    body: JSON.stringify({ refCode:pendingRef })
   });
   const data = await res.json();
   if (data.ok) {
    window.UC += 20; updateCreditUI();
    if (window.gpTrack) window.gpTrack('referral_applied', { reward: 20, traffic_source: localStorage.getItem('traffic_source') || 'direct' });
    if (window.gpToast) window.gpToast('추천 보상으로 20크레딧이 지급됐어요!', { type: 'success' });
    else alert('추천 보상으로 20크레딧이 지급됐어요!');
    localStorage.removeItem('pendingRef');
   }
   else { console.log('추천 적용 실패:', data.error); localStorage.removeItem('pendingRef'); }
  } catch(e) { console.log('추천 적용 네트워크 오류 (재시도 가능):', e); }
 }
  window.gpUserDataReady = true;
  updateCreditUI();
 window.updateNotifBadge(u.uid);
 setTimeout(() => { if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory(); }, 300);
 // 저장 실패로 localStorage에 백업된 기록이 있으면 로그인·데이터 로드 후 자동 재시도.
 setTimeout(() => { if (typeof window.flushPendingHistory === 'function') window.flushPendingHistory(); }, 1200);
}

function updateCreditUI() {
 const plans = { pro:'프로', master:'마스터', unlimited:'무제한' };
 const p = window.UP;
 const loggedIn = !!window.CU;
 const balance = Math.max(0, Number(window.UC) || 0);
 const balanceText = !loggedIn
  ? '가입 시 20크레딧'
  : p === 'unlimited'
   ? '크레딧 무제한'
   : '크레딧 ' + balance + (plans[p] ? ' · ' + plans[p] : '');
 document.querySelectorAll('[data-credit-balance]').forEach(node => {
  node.textContent = balanceText;
  node.style.color = !loggedIn ? 'var(--text2)' : p === 'unlimited' || p === 'master' ? 'var(--yellow)' : balance <= 3 ? 'var(--red)' : 'var(--text)';
 });
 document.querySelectorAll('[data-credit-work-count]').forEach(node => {
  const cost = Math.max(1, Number(node.dataset.workCost) || 1);
  const planCredits = Math.max(0, Number(node.dataset.planCredits) || 0);
  const kind = node.dataset.creditWorkCount;
  const available = kind === 'current'
   ? (loggedIn ? balance : 20)
   : planCredits;
  node.textContent = Math.floor(available / cost).toLocaleString('ko-KR') + '회' + (kind === 'additional' ? ' 추가' : '');
 });
 // 플랜 뱃지 업데이트
 const badge = document.getElementById('userPlanBadge');
 if (badge) badge.textContent = plans[p] || 'Free';
 // 잔액이 바뀌면 컴포저 예상 비용과 상태별 오퍼도 같이 최신화한다.
 if (typeof window.lavUpdateEstimate === 'function') window.lavUpdateEstimate();
 if (typeof window.gpRefreshHeroOffer === 'function') window.gpRefreshHeroOffer(false);
}

 
window.updateCreditUI = updateCreditUI;

// ───────────────────────────────────────────
// 쿠폰 코드 기능
// ───────────────────────────────────────────
const COUPON_API = window.apiBase();

function bearerJsonHeaders(idToken) {
 return {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + idToken
 };
}

function newClientRequestId(prefix) {
 const safePrefix = String(prefix || 'req').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'req';
 let randomPart = '';
 try {
  if (window.crypto?.randomUUID) randomPart = window.crypto.randomUUID().replace(/-/g, '');
  else if (window.crypto?.getRandomValues) {
   const bytes = new Uint8Array(16);
   window.crypto.getRandomValues(bytes);
   randomPart = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
 } catch (_) { /* 아래 호환 폴백 사용 */ }
 if (!randomPart) randomPart = Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
 return `${safePrefix}_${randomPart}`.slice(0, 120);
}

async function postAuthedJson(path, body, user) {
 const authUser = user || CU || window.CU;
 if (!authUser?.getIdToken) {
  const error = new Error('로그인이 필요해요.');
  error.status = 401;
  error.code = 'AUTH_REQUIRED';
  throw error;
 }
 const idToken = await authUser.getIdToken();
 let response;
 try {
  response = await fetch(window.apiUrl(path), {
   method: 'POST',
   headers: bearerJsonHeaders(idToken),
   credentials: 'omit',
   body: JSON.stringify(body || {})
  });
 } catch (cause) {
  const error = new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
  error.code = 'NETWORK_ERROR';
  error.cause = cause;
  throw error;
 }
 let data = null;
 try { data = await response.json(); } catch (_) { data = null; }
 if (!response.ok || !data?.ok) {
  const error = new Error(String(data?.error || '요청을 처리하지 못했어요.'));
  error.status = response.status;
  error.code = String(data?.code || 'REQUEST_FAILED');
  error.retryAfter = response.headers.get('Retry-After') || '';
  throw error;
 }
 return data;
}

window.formatCouponInput = function(el) {
 const raw = el.value.replace(/[-\s]/g, '').toUpperCase().slice(0, 12);
 let out = raw;
 if (raw.length > 4) out = raw.slice(0, 4) + '-' + raw.slice(4);
 if (raw.length > 8) out = raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8);
 el.value = out;
};

window.redeemCoupon = async function() {
 const input = document.getElementById('couponInput');
 const msg = document.getElementById('couponMsg');
 if (!input || !msg) return;
 if (!window.CU) {
  if (window.gpTrack) window.gpTrack('login_required', { source: 'coupon' });
  msg.style.color = 'var(--red)'; msg.textContent = '로그인이 필요해요.'; return;
 }
 const code = input.value.trim();
 if (code.replace(/[-\s]/g, '').length !== 12) {
  msg.style.color = 'var(--red)'; msg.textContent = '12자리 쿠폰 코드를 입력해 주세요.'; return;
 }
 msg.style.color = 'var(--text3)'; msg.textContent = '적용 중...';
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/redeem-coupon', {
   method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
   body: JSON.stringify({ code })
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   window.UC = data.newBalance;
   window.updateCreditUI();
   msg.style.color = 'var(--green)';
   msg.textContent = '+' + data.credits + '크레딧이 충전됐어요! (현재 ' + data.newBalance + '크레딧)';
   input.value = '';
   if (window.gpTrack) window.gpTrack('coupon_redeem', { credits: data.credits || 0 });
  } else {
   msg.style.color = 'var(--red)';
   msg.textContent = data.error || '쿠폰 적용에 실패했어요.';
  }
 } catch (e) {
  msg.style.color = 'var(--red)';
  msg.textContent = '네트워크 오류: ' + e.message;
 }
};

window.adminCreateCoupons = async function() {
 const credEl = document.getElementById('couponCredits');
 const cntEl = document.getElementById('couponCount');
 const expEl = document.getElementById('couponExpires');
 const msg = document.getElementById('couponCreateMsg');
 const result = document.getElementById('couponCreateResult');
 const submit = document.getElementById('adminCouponCreateButton');
 if (!credEl || !cntEl || !msg || !result) return;
 if (submit && submit.disabled) return;
 if (!window.CU || !window.isAdmin()) { msg.style.color = 'var(--red)'; msg.textContent = '관리자 권한이 필요해요.'; return; }
 const credits = parseInt(credEl.value, 10);
 const count = parseInt(cntEl.value, 10);
 const expiresAt = expEl.value ? new Date(expEl.value + 'T23:59:59').toISOString() : null;
 if (!Number.isInteger(credits) || credits < 1) { msg.style.color = 'var(--red)'; msg.textContent = '지급할 크레딧을 올바르게 입력해 주세요.'; return; }
 if (!Number.isInteger(count) || count < 1) { msg.style.color = 'var(--red)'; msg.textContent = '발급할 쿠폰 수를 올바르게 입력해 주세요.'; return; }
 msg.style.color = 'var(--text3)'; msg.textContent = '발급 중...';
 result.innerHTML = '';
 adminSetBusy(submit, true, '발급 중');
 try {
  const token = await window.CU.getIdToken();
  const body = { credits, count };
  if (expiresAt) body.expiresAt = expiresAt;
  const res = await fetch(COUPON_API + '/admin/create-coupons', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   msg.style.color = 'var(--green)';
   msg.textContent = '✅ ' + data.count + '개 발급 완료 (배치 ID: ' + data.batchId + ')';
   const codeLines = data.codes.map(c => c.display).join('\n');
   const csvLines = 'code,credits\n' + data.codes.map(c => c.display + ',' + data.credits).join('\n');
   result.innerHTML = '';
   const box = document.createElement('div');
   box.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;max-height:240px;overflow:auto;font-family:monospace;font-size:13px;white-space:pre-wrap;';
   box.textContent = codeLines;
   result.appendChild(box);
   const btnRow = document.createElement('div');
   btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
   const btnCopy = document.createElement('button');
   btnCopy.textContent = '텍스트 복사';
   btnCopy.style.cssText = 'padding:7px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;';
   btnCopy.onclick = () => navigator.clipboard.writeText(codeLines).then(() => alert('복사됐어요!')).catch(() => alert('복사 실패'));
   btnRow.appendChild(btnCopy);
   const btnCsv = document.createElement('button');
   btnCsv.textContent = 'CSV 다운로드';
   btnCsv.style.cssText = 'padding:7px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;';
   btnCsv.onclick = () => {
    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'coupons-' + data.batchId + '.csv';
    a.click(); URL.revokeObjectURL(url);
   };
   btnRow.appendChild(btnCsv);
   result.appendChild(btnRow);
   if (typeof window.couponResetPaging === 'function') window.couponResetPaging();
   if (typeof window.loadCouponBatches === 'function') window.loadCouponBatches();
  } else {
   msg.style.color = 'var(--red)';
   msg.textContent = data.error || '쿠폰 발급에 실패했어요.';
  }
 } catch (e) {
  msg.style.color = 'var(--red)';
  msg.textContent = '네트워크 오류: ' + e.message;
 } finally {
  adminSetBusy(submit, false);
 }
};

// ───────────────────────────────────────────
// 쿠폰 발급 이력 관리 (관리자)
// ───────────────────────────────────────────
const COUPON_STATUS_LABEL = { unused: '미사용', redeemed: '사용', voided: '무효' };
const COUPON_STATUS_COLOR = { unused: 'var(--green)', redeemed: 'var(--blue)', voided: 'var(--text3)' };

function fmtDate(ms) {
 if (!ms) return '—';
 return new Date(ms).toLocaleString('ko-KR');
}
function fmtDateShort(ms) {
 if (!ms) return '무기한';
 return new Date(ms).toLocaleDateString('ko-KR');
}
function adminLabel(uid) {
 if (typeof ADMIN_ROLES !== 'undefined' && ADMIN_ROLES[uid]) return ADMIN_ROLES[uid].name;
 return (uid || '').slice(0, 8);
}

// 페이지네이션 상태 (cursor stack)
window._couponPages = { cursors: [null], index: 0, hasNext: false };
window.couponResetPaging = function() { window._couponPages = { cursors: [null], index: 0, hasNext: false }; };

window.loadCouponBatches = async function() {
 const el = document.getElementById('couponBatchList');
 if (!el) return;
 if (!window.CU || !window.isAdmin()) return;
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const token = await window.CU.getIdToken();
  const cursor = window._couponPages.cursors[window._couponPages.index];
  const body = { limit: 10 };
  if (cursor) body.cursor = cursor;
  const res = await fetch(COUPON_API + '/admin/list-coupon-batches', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
   el.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">' + escapeHtml(data.error || '조회 실패') + '</div>';
   return;
  }
  // nextCursor stack 갱신
  if (data.nextCursor && window._couponPages.cursors.length === window._couponPages.index + 1) {
   window._couponPages.cursors.push(data.nextCursor);
  }
  window._couponPages.hasNext = !!data.nextCursor;

  if ((!data.batches || data.batches.length === 0) && window._couponPages.index === 0) {
   el.innerHTML = '<div class="gp-admin-empty">발급 이력이 없어요.</div>';
   return;
  }
  // 페이지가 비었는데 index>0인 경우 (삭제 직후 케이스): 한 페이지 뒤로
  if ((!data.batches || data.batches.length === 0) && window._couponPages.index > 0) {
   window._couponPages.index--;
   return window.loadCouponBatches();
  }
  let html = '<div class="gp-admin-table-wrap"><table class="gp-admin-table">'
   + '<thead><tr>'
   + '<th>발급일</th>'
   + '<th>발급자</th>'
   + '<th class="num">크레딧</th>'
   + '<th class="num">발급</th>'
   + '<th class="num">사용</th>'
   + '<th class="num">무효</th>'
   + '<th class="num">잔여</th>'
   + '<th>만료</th>'
   + '<th></th>'
   + '</tr></thead><tbody>';
  data.batches.forEach(b => {
   const actionBtn = (b.unusedCount > 0)
    ? '<button class="gp-admin-mini-btn danger" onclick="voidBatch(\'' + jsAttr(b.batchId) + '\',' + b.unusedCount + ')">배치 무효화</button>'
    : '<button class="gp-admin-mini-btn" onclick="deleteBatch(\'' + jsAttr(b.batchId) + '\')">기록 지우기</button>';
   html += '<tr>'
    + '<td class="muted">' + escapeHtml(fmtDate(b.createdAt)) + '</td>'
    + '<td>' + escapeHtml(adminLabel(b.adminUid)) + '</td>'
    + '<td class="num" style="font-weight:700;">' + b.credits + '</td>'
    + '<td class="num">' + b.count + '</td>'
    + '<td class="num">' + b.redeemedCount + '</td>'
    + '<td class="num muted">' + b.voidedCount + '</td>'
    + '<td class="num gp-admin-pos">' + b.unusedCount + '</td>'
    + '<td class="muted edit" onclick="updateBatchExpiry(\'' + jsAttr(b.batchId) + '\',' + (b.expiresAt !== null && b.expiresAt !== undefined ? b.expiresAt : 'null') + ')" title="클릭해서 만료일 변경">' + escapeHtml(fmtDateShort(b.expiresAt)) + ' ✎</td>'
    + '<td style="white-space:nowrap;">'
    + '<button class="gp-admin-mini-btn" style="margin-right:4px;" onclick="showBatchDetail(\'' + jsAttr(b.batchId) + '\')">상세</button>'
    + actionBtn
    + '</td></tr>'
    + '<tr id="batchDetail-' + escapeHtml(b.batchId) + '" style="display:none;"><td colspan="9" style="padding:0;"></td></tr>';
  });
  html += '</tbody></table></div>';
  // 페이지네이션 컨트롤
  const prevDisabled = window._couponPages.index === 0;
  const nextDisabled = !window._couponPages.hasNext;
  html += '<div class="gp-admin-pager">'
   + '<button ' + (prevDisabled ? 'disabled' : '') + ' onclick="couponPrevPage()">‹ 이전</button>'
   + '<span>' + (window._couponPages.index + 1) + ' 페이지</span>'
   + '<button ' + (nextDisabled ? 'disabled' : '') + ' onclick="couponNextPage()">다음 ›</button>'
   + '</div>';
  el.innerHTML = html;
 } catch (e) {
  el.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">네트워크 오류: ' + escapeHtml(e.message) + '</div>';
 }
};

window.couponNextPage = function() {
 if (window._couponPages.hasNext) {
  window._couponPages.index++;
  window.loadCouponBatches();
 }
};

window.couponPrevPage = function() {
 if (window._couponPages.index > 0) {
  window._couponPages.index--;
  window.loadCouponBatches();
 }
};

window.deleteBatch = async function(batchId) {
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '쿠폰 배치 기록을 삭제할까요?', message: '발급된 쿠폰들과 배치 정보가 모두 사라집니다. 사용자의 크레딧 사용 내역은 그대로 남아요.', confirmText: '삭제하기', danger: true })
  : confirm('이 배치 기록을 영구 삭제할까요?\n발급된 쿠폰들과 배치 정보가 모두 사라집니다. 복구할 수 없어요.\n(사용자의 크레딧 사용 내역은 그대로 남아요)');
 if (!ok) return;
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/admin/delete-coupon-batch', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify({ batchId })
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   alert('배치 기록을 삭제했어요. (코드 ' + data.deletedCodes + '개 함께 삭제)');
   window.couponResetPaging();
   await window.loadCouponBatches();
  } else {
   alert(data.error || '삭제 실패');
  }
 } catch (e) {
  alert('네트워크 오류: ' + e.message);
 }
};

window.updateBatchExpiry = async function(batchId, currentMs) {
 let currentStr = '';
 if (typeof currentMs === 'number' && currentMs > 0) {
  const d = new Date(currentMs);
  currentStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
 }
 const input = window.gpPrompt
  ? await window.gpPrompt({ title: '쿠폰 만료일 변경', message: 'YYYY-MM-DD 형식으로 입력하세요. 비우면 무기한으로 변경됩니다.', placeholder: 'YYYY-MM-DD', defaultValue: currentStr, confirmText: '변경하기' })
  : prompt('새 만료일 (YYYY-MM-DD, 비우면 무기한):', currentStr);
 if (input === null) return; // 취소
 const trimmed = input.trim();
 let expiresAt = null;
 if (trimmed) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
   alert('날짜 형식은 YYYY-MM-DD 여야 해요.');
   return;
  }
  const d = new Date(trimmed + 'T23:59:59');
  if (Number.isNaN(d.getTime())) {
   alert('유효하지 않은 날짜에요.');
   return;
  }
  expiresAt = d.toISOString();
 }
 try {
  const token = await window.CU.getIdToken();
  const body = { batchId };
  if (expiresAt) body.expiresAt = expiresAt;
  const res = await fetch(COUPON_API + '/admin/update-batch-expiry', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   alert('만료일을 변경했어요. (코드 ' + data.updatedCodes + '개 갱신)');
   await window.loadCouponBatches();
  } else {
   alert(data.error || '만료일 변경 실패');
  }
 } catch (e) {
  alert('네트워크 오류: ' + e.message);
 }
};

window.showBatchDetail = async function(batchId) {
 const row = document.getElementById('batchDetail-' + batchId);
 if (!row) return;
 if (row.style.display === 'table-row') { row.style.display = 'none'; return; }
 row.style.display = 'table-row';
 const td = row.querySelector('td');
 td.innerHTML = '<div style="padding:12px;color:var(--text3);">상세 불러오는 중...</div>';
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/admin/get-coupon-batch', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify({ batchId })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
   td.innerHTML = '<div style="color:var(--red);padding:12px;">' + escapeHtml(data.error || '조회 실패') + '</div>';
   return;
  }
  let html = '<div style="padding:12px;background:var(--surface2);max-height:400px;overflow:auto;">'
   + '<table style="width:100%;border-collapse:collapse;font-size:11px;">'
   + '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text2);">'
   + '<th style="padding:6px;text-align:left;">코드</th>'
   + '<th style="padding:6px;text-align:left;">상태</th>'
   + '<th style="padding:6px;text-align:left;">사용자</th>'
   + '<th style="padding:6px;text-align:left;">사용일</th>'
   + '<th style="padding:6px;"></th>'
   + '</tr></thead><tbody>';
  data.codes.forEach(c => {
   const statusLabel = COUPON_STATUS_LABEL[c.status] || c.status;
   const statusColor = COUPON_STATUS_COLOR[c.status] || 'var(--text3)';
   const userTxt = c.redeemedBy
    ? escapeHtml(c.redeemedBy.nickname) + '<br><span style="color:var(--text3);font-size:10px;">' + escapeHtml(c.redeemedBy.email) + '</span>'
    : '—';
   html += '<tr style="border-bottom:1px solid var(--border);">'
    + '<td style="padding:6px;font-family:monospace;">' + escapeHtml(c.display) + '</td>'
    + '<td style="padding:6px;color:' + statusColor + ';font-weight:600;">' + statusLabel + '</td>'
    + '<td style="padding:6px;">' + userTxt + '</td>'
    + '<td style="padding:6px;color:var(--text3);">' + escapeHtml(fmtDate(c.redeemedAt)) + '</td>'
    + '<td style="padding:6px;">'
    + (c.status === 'unused' ? '<button onclick="voidCoupon(\'' + jsAttr(c.code) + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:10px;cursor:pointer;">무효화</button>' : '')
    + '</td></tr>';
  });
  html += '</tbody></table></div>';
  td.innerHTML = html;
 } catch (e) {
  td.innerHTML = '<div style="color:var(--red);padding:12px;">네트워크 오류: ' + escapeHtml(e.message) + '</div>';
 }
};

window.voidBatch = async function(batchId, unusedCount) {
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '미사용 쿠폰을 무효화할까요?', message: '이 배치의 미사용 쿠폰 ' + unusedCount + '개가 모두 무효화됩니다. 이미 사용된 쿠폰은 유지됩니다.', confirmText: '무효화', danger: true })
  : confirm('이 배치의 미사용 쿠폰 ' + unusedCount + '개를 모두 무효화할까요?\n이미 사용된 쿠폰은 그대로 유지됩니다.');
 if (!ok) return;
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/admin/void-coupons', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify({ batchId })
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   alert(data.voidedCount + '개 쿠폰을 무효화했어요.');
   await window.loadCouponBatches();
  } else {
   alert(data.error || '무효화 실패');
  }
 } catch (e) {
  alert('네트워크 오류: ' + e.message);
 }
};

window.voidCoupon = async function(code) {
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '쿠폰을 무효화할까요?', message: '무효화한 쿠폰은 다시 사용할 수 없어요.', confirmText: '무효화', danger: true })
  : confirm('이 쿠폰을 무효화할까요?');
 if (!ok) return;
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/admin/void-coupons', {
   method: 'POST', headers: bearerJsonHeaders(token),
   body: JSON.stringify({ code })
  });
  const data = await res.json();
  if (res.ok && data.ok) {
   alert('쿠폰을 무효화했어요.');
   await window.loadCouponBatches();
  } else {
   alert(data.error || '무효화 실패');
  }
 } catch (e) {
  alert('네트워크 오류: ' + e.message);
 }
};

window.updateAuthUI = (isLoggedIn) =>{
 const uname = document.getElementById('uname');
 const avatar = document.querySelector('.sidebar-user-avatar');
 if (uname) {
 if (isLoggedIn) {
   const name = window.CU?.displayName || '사용자';
   uname.textContent = name;
   uname.style.cssText = '';
   if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
   uname.onclick = () => openMyPage();
 } else {
   uname.textContent = '로그인 / 회원가입';
   uname.style.cssText = 'color:var(--blue);font-weight:600;';
   if (avatar) avatar.textContent = '?';
   uname.onclick = () => window.showScreen('login');
 }
 }
 if (typeof updateCreditUI === 'function') updateCreditUI();
};

function clearKakaoCallbackQuery() {
 const url = new URL(window.location.href);
 ['code', 'state', 'error', 'error_description'].forEach(key => url.searchParams.delete(key));
 const query = url.searchParams.toString();
 history.replaceState(history.state, '', url.pathname + (query ? '?' + query : '') + url.hash);
}

function isKakaoOAuthCallback(params) {
 return params.has('code')
  && params.get('success') !== '1'
  && params.get('fail') !== '1'
  && params.get('subfail') !== '1'
  && !params.has('paymentKey');
}

function syncKakaoProfileInBackground(user, data) {
 const profileChanged = user.displayName !== data.nickname || user.photoURL !== data.photo;
 if (!profileChanged) return;
 // The provider binding is server-owned. The client may update only the
 // Firebase Auth display profile and never writes users.kakaoId.
 updateProfile(user, { displayName: data.nickname, photoURL: data.photo }).catch(() => {
  console.warn('Kakao display profile sync was skipped.');
 });
}

async function exchangeKakaoIdentity(accessToken, timing, options) {
 options = options || {};
 setAuthTransitionMessage('카카오 계정 확인 중', '안전하게 로그인 정보를 확인하고 있어요.');
 const backendStartedAt = performance.now();
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 15000);
 let response;
 try {
  response = await fetch(window.apiUrl('/kakao-login'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ accessToken }),
   signal: controller.signal
  });
 } finally {
  clearTimeout(timeout);
 }
 const data = await response.json().catch(() => ({}));
 if (!response.ok || data.error || !data.customToken) {
  const error = new Error(data.error || '카카오 계정 확인에 실패했어요.');
  error.code = data.code || 'KAKAO_BACKEND_ERROR';
  throw error;
 }
 timing.backendMs = Math.round(performance.now() - backendStartedAt);

 if (options.expectedUid && data.uid !== options.expectedUid) {
  const mismatch = new Error('처음 가입한 카카오 계정과 같은 계정으로 다시 인증해 주세요.');
  mismatch.code = 'KAKAO_REAUTH_ACCOUNT_MISMATCH';
  throw mismatch;
 }

 setAuthTransitionMessage('로그인 마무리 중', '작업 화면에 계정을 연결하고 있어요.');
 const firebaseStartedAt = performance.now();
 const result = await signInWithCustomToken(auth, data.customToken);
 timing.firebaseMs = Math.round(performance.now() - firebaseStartedAt);
 timing.created = data.created ? 1 : 0;

 if (options.expectedUid && result.user.uid !== options.expectedUid) {
  try { await signOut(auth); } catch (_) {}
  const mismatch = new Error('처음 가입한 카카오 계정과 같은 계정으로 다시 인증해 주세요.');
  mismatch.code = 'KAKAO_REAUTH_ACCOUNT_MISMATCH';
  throw mismatch;
 }

 showAuthenticatedShell(result.user, 'kakao_direct');
 syncKakaoProfileInBackground(result.user, data);
 if (window.gpTrack && !options.reauthentication) {
  window.gpTrack('login', { method: 'kakao' });
  window.gpTrack('login_complete_timing', {
   method: 'kakao',
   backend_ms: timing.backendMs || 0,
   firebase_ms: timing.firebaseMs || 0,
   total_ms: Math.round(performance.now() - timing.startedAt),
   created: timing.created || 0,
   flow: timing.flow
  });
 }
 return result.user;
}

const KAKAO_OAUTH_STATE_KEY = 'gp_kakao_oauth_state_v1';
const KAKAO_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function randomKakaoOAuthState() {
 if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
  throw new Error('안전한 로그인 요청을 만들 수 없는 브라우저예요. 브라우저를 업데이트해 주세요.');
 }
 const bytes = new Uint8Array(24);
 window.crypto.getRandomValues(bytes);
 return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomKakaoPkceVerifier() {
 const bytes = new Uint8Array(32);
 window.crypto.getRandomValues(bytes);
 let binary = '';
 bytes.forEach(byte => { binary += String.fromCharCode(byte); });
 return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

async function kakaoPkceChallenge(verifier) {
 if (!window.crypto?.subtle || typeof TextEncoder !== 'function') {
  throw new Error('안전한 카카오 로그인을 지원하지 않는 브라우저예요. 브라우저를 업데이트해 주세요.');
 }
 const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
 let binary = '';
 new Uint8Array(digest).forEach(byte => { binary += String.fromCharCode(byte); });
 return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function createKakaoOAuthState() {
 const value = randomKakaoOAuthState();
 const verifier = randomKakaoPkceVerifier();
 sessionStorage.setItem(KAKAO_OAUTH_STATE_KEY, JSON.stringify({ value, verifier, createdAt: Date.now() }));
 return { value, verifier };
}

function consumeKakaoOAuthState(received) {
 let saved = null;
 try { saved = JSON.parse(sessionStorage.getItem(KAKAO_OAUTH_STATE_KEY) || 'null'); }
 catch (_) { saved = null; }
 // OAuth state is single-use even when malformed or expired.
 try { sessionStorage.removeItem(KAKAO_OAUTH_STATE_KEY); } catch (_) {}
 if (!saved || typeof saved.value !== 'string' || typeof received !== 'string') return '';
 if (!/^[a-f0-9]{48}$/u.test(saved.value) || !/^[a-f0-9]{48}$/u.test(received)) return '';
 if (typeof saved.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(saved.verifier)) return '';
 const createdAt = Number(saved.createdAt);
 const age = Date.now() - createdAt;
 if (!Number.isFinite(createdAt) || age < 0 || age > KAKAO_OAUTH_STATE_TTL_MS) return '';
 return saved.value === received ? saved.verifier : '';
}

window.kakaoRedirectLogin = async function () {
 const context = createKakaoOAuthState();
 const challenge = await kakaoPkceChallenge(context.verifier);
 const authorizeUrl = new URL('https://kauth.kakao.com/oauth/authorize');
 authorizeUrl.searchParams.set('client_id', window.APP_CONFIG.KAKAO_REST_KEY);
 authorizeUrl.searchParams.set('redirect_uri', window.APP_CONFIG.SITE_URL);
 authorizeUrl.searchParams.set('response_type', 'code');
 authorizeUrl.searchParams.set('state', context.value);
 authorizeUrl.searchParams.set('code_challenge', challenge);
 authorizeUrl.searchParams.set('code_challenge_method', 'S256');
 window.location.assign(authorizeUrl.toString());
};

function waitForKakaoSdk() {
 if (window.Kakao?.Auth) return Promise.resolve(window.Kakao);
 const ready = window.gpKakaoReady;
 if (!ready || typeof ready.then !== 'function') return Promise.reject(new Error('카카오 로그인 모듈을 불러오지 못했어요.'));
 return Promise.race([
  ready,
  wait(6000).then(() => { throw new Error('카카오 로그인 연결이 지연되고 있어요. 다시 시도해 주세요.'); })
 ]).then(sdk => {
  if (!sdk?.Auth) throw new Error('카카오 로그인 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
  return sdk;
 });
}

window.handleKakaoCallback = async () =>{
 const params = new URLSearchParams(location.search);
 const code = params.get('code');
 if (!code || !isKakaoOAuthCallback(params)) return false;
 const verifier = consumeKakaoOAuthState(params.get('state'));
 // The authorization code is a short-lived credential. Remove it from the
 // address bar before any await, analytics call or third-party script can see it.
 clearKakaoCallbackQuery();
 if (!verifier) {
  failAuthTransition();
  const message = '카카오 로그인 요청이 만료됐거나 일치하지 않아요. 로그인 버튼을 다시 눌러 주세요.';
  if (window.gpTrack) window.gpTrack('login_error', { method: 'kakao', flow: 'redirect', code: 'oauth_state_invalid' });
  if (window.gpToast) window.gpToast(message, { type: 'error', title: '로그인 확인 필요' });
  else alert(message);
  return false;
 }
 const timing = { startedAt: performance.now(), flow: 'redirect' };
 beginAuthTransition('kakao', '카카오 로그인 확인 중', '작업 화면을 먼저 준비하고 있어요.');
 try {
  const tokenStartedAt = performance.now();
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
   method: 'POST',
   headers: {'Content-Type': 'application/x-www-form-urlencoded'},
   body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: window.APP_CONFIG.KAKAO_REST_KEY,
    redirect_uri: window.APP_CONFIG.SITE_URL,
    code,
    code_verifier: verifier
   })
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  timing.tokenMs = Math.round(performance.now() - tokenStartedAt);
  if (!tokenRes.ok || !tokenData.access_token) throw new Error('카카오 인증 정보를 확인하지 못했어요.');
  await exchangeKakaoIdentity(tokenData.access_token, timing);
  return true;
 } catch(e) {
  failAuthTransition();
  if (window.gpTrack) window.gpTrack('login_error', { method: 'kakao', flow: 'redirect', message: String(e.message || '').slice(0, 120) });
  if (window.gpToast) window.gpToast(e.message || '카카오 로그인에 실패했어요.', { type: 'error', title: '로그인 확인 필요' });
  else alert('카카오 로그인 실패: ' + (e.message || JSON.stringify(e)));
  return false;
 }
};

window.kakaoLogin = async () =>{
 if (/KAKAOTALK/i.test(navigator.userAgent)) {
  document.querySelector('.kakao-warn').style.display = 'flex';
  return;
 }
 const timing = { startedAt: performance.now(), flow: 'popup' };
 try {
  setSocialLoginControls(true, '카카오 로그인 창에서 인증을 계속해 주세요.');
  window.gpWarmAuthBackend();
  if (window.gpTrack) window.gpTrack('login_start', { method: 'kakao' });
  const sdk = await waitForKakaoSdk();
  const popupStartedAt = performance.now();
  const authResult = await new Promise((resolve, reject) =>{
   sdk.Auth.login({
    success: resolve,
    fail: reject,
    scope: 'profile_nickname,profile_image,account_email'
   });
  });
  timing.popupMs = Math.round(performance.now() - popupStartedAt);
  beginAuthTransition('kakao', '카카오 로그인 확인 중', '메인 화면을 먼저 준비하고 있어요.');
  await exchangeKakaoIdentity(authResult.access_token, timing);
 } catch(e) {
  failAuthTransition();
  const canceled = e && e.error_code === 'CANCELED';
  if (window.gpTrack) window.gpTrack(canceled ? 'login_cancel' : 'login_error', { method: 'kakao', message: String(e.message || '').slice(0, 120) });
  if (!canceled) {
   if (window.gpToast) window.gpToast(e.message || '카카오 로그인에 실패했어요.', { type: 'error', title: '로그인 확인 필요' });
   else alert('카카오 로그인 실패: ' + (e.message || JSON.stringify(e)));
  }
 }
};

// 모바일 리다이렉트 콜백은 window.load(이미지·폰트 완료)를 기다리지 않는다.
// 모듈이 준비되는 즉시 인증 교환을 시작해 불필요한 수 초 대기를 제거한다.
if (isKakaoOAuthCallback(new URLSearchParams(location.search))) {
 queueMicrotask(() => window.handleKakaoCallback());
}

window.googleLogin = async () =>{
 if (/KAKAOTALK/i.test(navigator.userAgent)) { document.querySelector('.kakao-warn').style.display='flex'; return; }
 try {
  setSocialLoginControls(true, 'Google 로그인 창에서 인증을 계속해 주세요.');
  if (window.gpTrack) window.gpTrack('login_start', { method: 'google' });
  const result = await signInWithPopup(auth, provider);
  showAuthenticatedShell(result.user, 'google_direct');
  if (window.gpTrack) window.gpTrack('login', { method: 'google' });
 } catch(e) {
  finishAuthTransition(e.code === 'auth/popup-closed-by-user' ? 'cancel' : 'error');
  if (window.gpTrack) window.gpTrack(e.code === 'auth/popup-closed-by-user' ? 'login_cancel' : 'login_error', { method: 'google', message: String(e.message || '').slice(0, 120) });
  if(e.code!=='auth/popup-closed-by-user') alert('로그인 실패: '+e.message);
 }
};
window.openExternal = () =>{
 const url = location.href;
 if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) location.href='kakaotalk://web/openExternal?url='+encodeURIComponent(url);
 else location.href='intent://'+url.replace(/https?:\/\//,'')+'#Intent;scheme=https;package=com.android.chrome;end';
};
window.logout = async () =>{
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '로그아웃할까요?', message: '언제든 다시 로그인할 수 있어요.', confirmText: '로그아웃' })
  : confirm('로그아웃 하시겠어요?');
 if(ok) {
  if (window.gpTrack) window.gpTrack('logout');
  if (window.gpSessionSecurity) {
   window.gpSessionSecurity.clearSensitive();
   window.gpSessionSecurity.bindUser('');
  }
  clearSensitiveAuthDom();
  await signOut(auth);
  if (typeof window.gpLandingReset === 'function') window.gpLandingReset();
  switchTab('main');
  if (typeof window.gpMaybeShowLanding === 'function') window.gpMaybeShowLanding();
 }
};

window.changeNickname = async () =>{
 if (!CU) return;
 const newName = window.gpPrompt
  ? await window.gpPrompt({ title: '닉네임 변경', message: '커뮤니티와 마이페이지에 표시될 이름입니다.', placeholder: '새 닉네임', defaultValue: CU.displayName || '', confirmText: '변경하기', required: true })
  : prompt('새 닉네임을 입력하세요:', CU.displayName);
 if (!newName || newName.trim() === '') return;
 if (newName.trim().length >20) { alert('닉네임은 20자 이내로 입력해 주세요.'); return; }
 try {
 await updateProfile(CU, { displayName: newName.trim() });
 await updateDoc(doc(db,'users',CU.uid), { name: newName.trim() });
 document.getElementById('uname').textContent = newName.trim() + '님';
 alert('닉네임을 변경했어요.');
 await window.loadMyPage();
 } catch(e) {
 alert('닉네임 변경 실패: ' + e.message);
 }
};

async function requestFreshKakaoAccessToken() {
 const sdk = await waitForKakaoSdk();
 const result = await new Promise((resolve, reject) => {
  sdk.Auth.login({
   success: resolve,
   fail: reject,
   scope: 'profile_nickname,profile_image,account_email'
  });
 });
 if (!result || !result.access_token) throw new Error('카카오 재인증 정보를 확인하지 못했어요.');
 return result.access_token;
}

async function reauthenticateForAccountDeletion(user) {
 const providers = new Set((user.providerData || []).map(item => item && item.providerId).filter(Boolean));
 if (providers.has('google.com')) {
  await reauthenticateWithPopup(user, provider);
  return auth.currentUser || user;
 }

 let claims = {};
 try { claims = (await user.getIdTokenResult()).claims || {}; } catch (_) {}
 const signedInWithKakao = claims.signInProvider === 'kakao'
  || String(user.email || '').toLowerCase().endsWith('@kakao.com');
 if (signedInWithKakao) {
  const timing = { startedAt: performance.now(), flow: 'delete_reauth' };
  const accessToken = await requestFreshKakaoAccessToken();
  return exchangeKakaoIdentity(accessToken, timing, {
   reauthentication: true,
   expectedUid: user.uid
  });
 }

 const error = new Error('안전한 탈퇴를 위해 로그아웃한 뒤 가입한 소셜 계정으로 다시 로그인해 주세요.');
 error.code = 'ACCOUNT_REAUTH_PROVIDER_UNAVAILABLE';
 throw error;
}

window.deleteAccount = async () =>{
 if (!CU) return;
 // 활성 구독이 있으면 탈퇴 차단 (전자상거래법상 청약철회권 보호 + 토스 심사 요건)
 try {
   const preSnap = await getDoc(doc(db,'users',CU.uid));
   const sub = preSnap.exists() ? preSnap.data().subscription : null;
   if (sub) {
     const nextMs = sub.nextBillingAt?.toMillis ? sub.nextBillingAt.toMillis() : 0;
     if (sub.status === 'active') {
       alert('현재 진행 중인 정기 구독이 있어 탈퇴할 수 없습니다.\n마이페이지의 "구독 해지" 버튼으로 먼저 해지해주세요.');
       const card = document.getElementById('subManageCard');
       if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
       return;
     }
     if (sub.status === 'cancelled' && nextMs > Date.now()) {
       const nextDate = new Date(nextMs).toLocaleDateString('ko-KR');
       alert('해지 예정인 구독이 ' + nextDate + '까지 남아 있습니다.\n남은 쿠폰을 사용하거나 마이페이지의 환불하기에서 환불 가능 여부를 확인한 뒤 다시 시도해 주세요.');
       return;
     }
   }
  } catch(e) {
   alert('구독 상태를 확인하지 못해 탈퇴를 중단했어요. 잠시 후 다시 시도해 주세요.');
   return;
  }

 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: '정말 탈퇴하시겠어요?',
    message: '모든 크레딧과 데이터가 삭제되며 복구할 수 없습니다. 결제·환불 기록은 전자상거래법에 따라 5년간 보관됩니다.',
    confirmText: '탈퇴하기',
    danger: true
  })
  : confirm('정말 탈퇴하시겠어요?\n탈퇴 시 모든 크레딧과 데이터가 삭제되며 복구할 수 없습니다.\n(결제·환불 기록은 전자상거래법에 따라 5년간 보관됩니다.)');
 if (!ok) return;
 try {
   const deletingUid = CU.uid;
   const reauthenticatedUser = await reauthenticateForAccountDeletion(CU);
   if (!reauthenticatedUser || reauthenticatedUser.uid !== deletingUid) {
    throw new Error('처음 가입한 계정과 같은 계정으로 다시 인증해 주세요.');
   }
   const idToken = await reauthenticatedUser.getIdToken(true);
   const res = await fetch(window.apiUrl('/delete-account'), {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
     body: JSON.stringify({ confirm: true })
   });
   const body = await res.json().catch(() => null);
   if (!res.ok || !body || !body.ok) {
    const error = new Error((body && body.error) || '탈퇴 처리 중 오류가 발생했어요.');
    error.code = body && body.code;
    error.partial = Boolean(body && body.partial);
    throw error;
   }
   if (window.gpSessionSecurity) {
    window.gpSessionSecurity.clearSensitive();
    window.gpSessionSecurity.bindUser('');
   }
   clearSensitiveAuthDom();
   try { await signOut(auth); } catch(_) {}   // 서버에서 계정이 이미 삭제됨 — 클라 세션 정리
   alert('탈퇴가 완료됐어요.');
   location.reload();
  } catch(e) {
   if (e && e.partial) {
    alert('로그인 계정 삭제는 처리됐지만 일부 데이터 정리가 지연되고 있어요. 다시 결제하거나 가입하지 말고 사이트 내 고객센터로 문의해 주세요.');
   } else if (e && (e.code === 'ACCOUNT_RECENT_LOGIN_REQUIRED' || e.code === 'auth/requires-recent-login')) {
    alert('보안을 위해 다시 로그인한 직후 탈퇴를 진행해 주세요.');
   } else {
    alert('탈퇴 실패: ' + (e.message || e));
   }
  }
};

window.showReferralPopup = async () => {
 if (!CU) return;
 const snap = await getDoc(doc(db,'users',CU.uid));
 const refCode = snap.data().refCode || CU.uid.substring(0,8);
 const linkUrl = new URL(window.APP_CONFIG.SITE_URL, window.location.origin);
 linkUrl.searchParams.set('ref', String(refCode));
 const link = linkUrl.toString();
 const overlay = document.createElement('div');
 overlay.id = 'refOverlay';
 overlay.setAttribute('role', 'dialog');
 overlay.setAttribute('aria-modal', 'true');
 overlay.setAttribute('aria-labelledby', 'refOverlayTitle');
 overlay.setAttribute('aria-describedby', 'refOverlayDesc');
 overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:var(--layer-dialog,10040);display:flex;align-items:center;justify-content:center;padding:20px;';
 overlay.innerHTML = `
 <div style="background:var(--surface);border-radius:16px;max-width:380px;width:100%;padding:32px 24px;position:relative;text-align:center;">
  <button type="button" aria-label="초대 안내 닫기" onclick="document.getElementById('refOverlay').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);">×</button>
  <div style="margin-bottom:16px;">
   <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5" width="56" height="56" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  </div>
  <div id="refOverlayTitle" style="font-size:18px;font-weight:700;margin-bottom:6px;">친구와 함께 20크레딧 받기</div>
  <div id="refOverlayDesc" style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.6;">초대 링크로 친구가 가입하면 두 사람 모두<br><strong style="color:var(--green);">20크레딧</strong>을 받아요.</div>
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left;">
   <div style="font-size:13px;color:var(--text2);margin-bottom:12px;">크레딧 받는 방법</div>
   <div style="display:flex;flex-direction:column;gap:8px;">
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">1</span> 아래 링크를 친구에게 공유하세요.</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">2</span> 친구가 링크로 신규 가입하면 친구에게 20크레딧을 드려요.</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">3</span> 가입이 확인되면 초대한 사람에게도 20크레딧을 드려요.</div>
   </div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
   <div id="refShareLink" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
   <button id="refShareCopy" type="button" style="padding:10px 18px;border-radius:10px;border:none;background:var(--green);color:#fff;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">링크 복사</button>
  </div>
 </div>`;
 overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
 document.body.appendChild(overlay);
 const linkEl = overlay.querySelector('#refShareLink');
 const copyBtn = overlay.querySelector('#refShareCopy');
 if (linkEl) linkEl.textContent = link;
 if (copyBtn) copyBtn.addEventListener('click', async () => {
  try {
   await navigator.clipboard.writeText(link);
   copyBtn.textContent = '복사했어요';
   setTimeout(() => { copyBtn.textContent = '링크 복사'; }, 1500);
  } catch (_) {
   if (window.gpToast) window.gpToast('링크를 복사하지 못했어요.', { type: 'error' });
  }
 });
};

// 보안: credits/plan 직접 수정은 전부 백엔드(Admin SDK)에서만 처리.
// 과거 클라이언트측 addCredits/deductCredits는 콘솔에서 누구나 호출 가능한
// 권한 상승 취약점이었으므로 완전 제거. 차감은 /analyze에서,
// 지급은 /confirm-payment·/apply-referral에서만 발생한다.

// ===== COMMUNITY =====
// 공개 커뮤니티는 운영 종료 상태다. 과거 번들·알림·콘솔 호출이 남아 있어도
// posts/Storage에 접근하지 않도록 모든 공개 진입점에서 먼저 차단한다.
const COMMUNITY_CLOSED = true;
function blockClosedCommunity(options) {
 if (!COMMUNITY_CLOSED) return false;
 const quiet = options && options.quiet;
 if (!quiet) {
  if (typeof window.switchTab === 'function') window.switchTab('main');
  if (window.gpToast) window.gpToast('커뮤니티 운영을 종료했어요.', { type: 'info' });
 }
 return true;
}
window.sortBy = 'latest';
window.currentCategory = window.currentCategory || '';
window.postSearch = window.postSearch || '';

// 페이지네이션 — 한 페이지에 10개씩
const POSTS_PER_PAGE = 10;
window.postPage = window.postPage || 1;
window._cachedPosts = null;
let _postSearchTimer = null;

const CAT_SLUG = {
 '블로그 작성 팁':'blog',
 '논문':'paper',
 '자소서 조언':'resume',
 '글쓰기 팁':'writing',
 '자유':'free'
};
const _ICO_VIEW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const _ICO_CMT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const _ICO_HRT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
// 통일 게시판 행(공지/커뮤니티/QnA 공통)의 강조 스탯 아이콘 — 14px
const _SICO_VIEW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const _SICO_CMT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const _SICO_HRT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
// 강조 스탯 한 칸: 아이콘 + 굵은 숫자
function _gbrStat(ico, n, kind){ return '<span class="gbr-stat'+(kind?' '+kind:'')+'">'+ico+'<b>'+n+'</b></span>'; }

function _normalizePostCategory(cat){
 const value = String(cat || '자유').trim();
 return value === '블로그 작성 꿀팁' ? '블로그 작성 팁' : value;
}
function _categorySlug(cat){ return CAT_SLUG[_normalizePostCategory(cat)] || 'free'; }
function _postScore(p){
 const views = p.views || 0;
 const likes = (p.likes || []).length;
 const comments = p.commentCount || 0;
 return views + likes*3 + comments*2;
}
function _postThumbUrl(p){
 if (p.photos && p.photos.length > 0) {
  const u = (typeof safePhotoUrl === 'function') ? safePhotoUrl(p.photos[0]) : p.photos[0];
  return u || null;
 }
 return null;
}
function _fmtDate(p){ return p.createdAt ? new Date(p.createdAt.toDate()).toLocaleDateString('ko-KR') : ''; }
function _makeExcerpt(body, n){
 if (!body) return '';
 n = n || 80;
 const t = String(body).replace(/\s+/g,' ').trim();
 return t.length > n ? t.slice(0, n) + '…' : t;
}

function _renderPostCard(p){
 const cat = _normalizePostCategory(p.category);
 const date = _fmtDate(p);
 const likes = (p.likes || []).length;
 const hiddenBadge = p.hidden ? '<span class="gbr-hidden">숨김</span>' : '';
 return '<div class="gp-board-row" onclick="viewPost(\''+jsAttr(p.id)+'\')">'
  + '<div class="gbr-main">'
  +  '<div class="gbr-ttl">'+escapeHtml(p.title||'')+hiddenBadge+'</div>'
  +  '<div class="gbr-sub">'
  +   '<span>'+escapeHtml(p.authorName||'')+'</span>'
  +   '<span>'+date+'</span>'
  +   '<span class="gbr-cat">'+escapeHtml(cat)+'</span>'
  +  '</div>'
  + '</div>'
  + '<div class="gbr-stats">'
  +  _gbrStat(_SICO_VIEW, (p.views||0), 'views')
  +  _gbrStat(_SICO_HRT, likes, 'likes')
  +  _gbrStat(_SICO_CMT, (p.commentCount||0), 'cmt')
  + '</div>'
  + '</div>';
}

function _renderFeaturedCard(p){
 const cat = _normalizePostCategory(p.category);
 const slug = _categorySlug(cat);
 const thumb = _postThumbUrl(p);
 const date = _fmtDate(p);
 const thumbHtml = thumb
  ? '<div class="feat-thumb" style="background-image:url(\''+escapeHtml(thumb)+'\')"></div>'
  : '<div class="feat-thumb no-img">'+escapeHtml(p.title||cat)+'</div>';
 return '<div class="feat-card" onclick="viewPost(\''+p.id+'\')">'
  + thumbHtml
  + '<div class="feat-body">'
  +  '<div class="post-card-cat-row"><span class="cat-chip cat-'+slug+'">'+escapeHtml(cat)+'</span></div>'
  +  '<div class="feat-ttl">'+escapeHtml(p.title||'')+'</div>'
  +  '<div class="feat-meta">'
  +   '<span>'+escapeHtml(p.authorName||'')+'</span>'
  +   '<span>'+date+'</span>'
  +   '<span>'+_ICO_VIEW+(p.views||0)+'</span>'
  +  '</div>'
  + '</div></div>';
}

function _renderFeaturedSection(featured){
 const sect = document.getElementById('featuredSection');
 const list = document.getElementById('featuredList');
 if (!sect || !list) return;
 if (!featured || !featured.length) { sect.style.display = 'none'; return; }
 sect.style.display = 'block';
 list.innerHTML = featured.slice(0, 4).map(_renderFeaturedCard).join('');
}

// 인기 게시글 TOP 5(aside) — 실제 글만 표시한다.
function _renderRankList(top5){
 const el = document.getElementById('rankList');
 if (!el) return;
 if (!top5 || !top5.length){
  el.innerHTML = '<li class="rank-empty">아직 인기 글이 모이는 중이에요.</li>';
  return;
 }
 el.innerHTML = top5.map((p,i) =>
  '<li onclick="viewPost(\''+p.id+'\')" title="'+escapeHtml(p.title||'')+'"><span>'+(i+1)+'</span><b class="rt">'+escapeHtml(p.title||'')+'</b><strong>'+(p.views||0)+'</strong></li>'
 ).join('');
}

function _renderPopularSection(top5){
 const sect = document.getElementById('popularSection');
 const heroEl = document.getElementById('popularHero');
 const restEl = document.getElementById('popularRest');
 if (!sect || !heroEl || !restEl) return;
 if (!top5 || !top5.length) { sect.style.display = 'none'; return; }
 sect.style.display = 'block';

 const top = top5[0];
 const cat = _normalizePostCategory(top.category);
 const slug = _categorySlug(cat);
 const thumb = _postThumbUrl(top);
 const date = _fmtDate(top);
 const likes = (top.likes || []).length;
 const excerpt = _makeExcerpt(top.body, 90);
 const thumbHtml = thumb
  ? '<div class="popular-hero-thumb" style="background-image:url(\''+escapeHtml(thumb)+'\')"></div>'
  : '<div class="popular-hero-thumb no-img">'+escapeHtml(cat)+'</div>';
 heroEl.innerHTML = '<div class="popular-hero" onclick="viewPost(\''+top.id+'\')">'
  + thumbHtml
  + '<div class="popular-hero-body">'
  +  '<div class="popular-hero-rank">★ 1위 · 이번주</div>'
  +  '<div class="post-card-cat-row"><span class="cat-chip cat-'+slug+'">'+escapeHtml(cat)+'</span></div>'
  +  '<div class="popular-hero-ttl">'+escapeHtml(top.title||'')+'</div>'
  +  (excerpt ? '<div class="popular-hero-excerpt">'+escapeHtml(excerpt)+'</div>' : '')
  +  '<div class="popular-hero-meta">'
  +   '<span>'+escapeHtml(top.authorName||'')+'</span>'
  +   '<span>'+date+'</span>'
  +   '<span>'+_ICO_VIEW+(top.views||0)+'</span>'
  +   '<span>'+_ICO_HRT+likes+'</span>'
  +   '<span>'+_ICO_CMT+(top.commentCount||0)+'</span>'
  +  '</div>'
  + '</div></div>';

 const rest = top5.slice(1, 5);
 if (!rest.length) { restEl.innerHTML = ''; return; }
 restEl.innerHTML = rest.map((p, i) => {
  const r = i + 2;
  const lk = (p.likes || []).length;
  return '<div class="popular-rest-item" onclick="viewPost(\''+p.id+'\')">'
   + '<span class="popular-rest-rank">'+r+'</span>'
   + '<span class="popular-rest-ttl">'+escapeHtml(p.title||'')+'</span>'
   + '<span class="popular-rest-meta">'
   +  '<span>'+_ICO_VIEW+(p.views||0)+'</span>'
   +  '<span>'+_ICO_HRT+lk+'</span>'
   +  '<span>'+_ICO_CMT+(p.commentCount||0)+'</span>'
   + '</span>'
   + '</div>';
 }).join('');
}

function _communitySearchText(value){
 return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
}

function _postCreatedAtMs(post){
 if (!post || !post.createdAt) return 0;
 try {
  const value = typeof post.createdAt.toDate === 'function' ? post.createdAt.toDate() : new Date(post.createdAt);
  const time = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(time) ? time : 0;
 } catch (_) {
  return 0;
 }
}

function _filteredSortedPosts(){
 const category = window.currentCategory ? _normalizePostCategory(window.currentCategory) : '';
 const search = _communitySearchText(window.postSearch);
 const posts = (window._cachedPosts || []).filter(post => {
  if (category && _normalizePostCategory(post.category) !== category) return false;
  if (!search) return true;
  const haystack = _communitySearchText([post.title, post.body, post.authorName].join(' '));
  return haystack.includes(search);
 });
 return posts.sort((a, b) => {
  if (window.sortBy === 'oldest') return _postCreatedAtMs(a) - _postCreatedAtMs(b);
  if (window.sortBy === 'views') return (Number(b.views) || 0) - (Number(a.views) || 0) || _postCreatedAtMs(b) - _postCreatedAtMs(a);
  return _postCreatedAtMs(b) - _postCreatedAtMs(a);
 });
}

function _setCommunityStatus(message){
 const status = document.getElementById('communityResultsStatus');
 if (status) status.textContent = message || '';
}

function _clearCommunityPostSurfaces(){
 window._cachedPosts = [];
 window.postPage = 1;
 const featured = document.getElementById('featuredSection');
 const popular = document.getElementById('popularSection');
 const rankSection = document.getElementById('rankSection');
 const featuredList = document.getElementById('featuredList');
 const popularHero = document.getElementById('popularHero');
 const popularRest = document.getElementById('popularRest');
 const rankList = document.getElementById('rankList');
 const pager = document.getElementById('postPager');
 if (featured) { featured.style.display = 'none'; featured.dataset.has = '0'; }
 if (popular) { popular.style.display = 'none'; popular.dataset.has = '0'; }
 if (rankSection) rankSection.style.display = 'none';
 if (featuredList) featuredList.innerHTML = '';
 if (popularHero) popularHero.innerHTML = '';
 if (popularRest) popularRest.innerHTML = '';
 if (rankList) rankList.innerHTML = '';
 if (pager) { pager.style.display = 'none'; pager.innerHTML = ''; }
}

function _showCommunityLoginGate(){
 _clearCommunityPostSurfaces();
 const listView = document.getElementById('listView');
 const detailView = document.getElementById('detailView');
 const list = document.getElementById('postList');
 const form = document.getElementById('wform');
 if (listView) listView.style.display = 'block';
 if (detailView) detailView.style.display = 'none';
 if (form) form.style.display = 'none';
 if (list) {
  list.innerHTML = '<div class="gp-community-login-gate" style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text3)">'
   + '<p>로그인하면 실제 커뮤니티 글을 확인할 수 있어요</p>'
   + '<button type="button" class="wbtn" onclick="openCommunityLogin()">로그인하기</button>'
   + '</div>';
 }
 _setCommunityStatus('로그인이 필요해요.');
}

window.openCommunityLogin = function(){
 if (blockClosedCommunity()) return;
 if (window.gpTrack) window.gpTrack('login_required', { source: 'community' });
 if (typeof window.showScreen === 'function') window.showScreen('login');
};

window.openCommunityComposer = function(){
 if (blockClosedCommunity()) return;
 const form = document.getElementById('wform');
 if (!CU) {
  if (form) form.style.display = 'none';
  window.openCommunityLogin();
  return;
 }
 if (form) form.style.display = form.style.display === 'block' ? 'none' : 'block';
};

window.filterByCategory = function(cat){
 window.currentCategory = cat ? _normalizePostCategory(cat) : '';
 document.querySelectorAll('.cat-fbtn').forEach(b => b.classList.toggle('active', (b.dataset.cat||'') === window.currentCategory));
 const isAll = !window.currentCategory;
 const fs = document.getElementById('featuredSection');
 const ps = document.getElementById('popularSection');
 if (fs) fs.style.display = (isAll && fs.dataset.has === '1') ? 'block' : 'none';
 if (ps) ps.style.display = (isAll && ps.dataset.has === '1') ? 'block' : 'none';
 window.postPage = 1;
 _renderPostPage();
};

window.setPostSort = function(sort){
 if (!['latest', 'views', 'oldest'].includes(sort)) return;
 window.sortBy = sort;
 window.postPage = 1;
 document.querySelectorAll('.sortbtn').forEach(button => button.classList.toggle('active', button.dataset.sort === sort));
 _renderPostPage();
};

window.queuePostSearch = function(value){
 clearTimeout(_postSearchTimer);
 _postSearchTimer = setTimeout(() => window.applyPostSearch(value), 250);
};

window.applyPostSearch = function(value){
 clearTimeout(_postSearchTimer);
 const input = document.getElementById('postSearch');
 window.postSearch = _communitySearchText(value === undefined ? input?.value : value);
 if (input && value !== undefined && input.value !== value) input.value = value;
 window.postPage = 1;
 _renderPostPage();
};

function _renderPostPage() {
 const pl = document.getElementById('postList');
 const pager = document.getElementById('postPager');
 if (!pl) return;
 if (!CU) { _showCommunityLoginGate(); return; }
 const cat = window.currentCategory || '';
 const search = window.postSearch || '';
 const posts = _filteredSortedPosts();
 if (!posts.length) {
   pl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text3)">'
    + (search ? '검색 결과가 없어요. 검색어나 필터를 바꿔보세요.' : cat ? '"'+escapeHtml(cat)+'" 카테고리 글이 아직 없어요.' : '아직 게시글이 없어요.')
    + '</div>';
   if (pager) pager.style.display = 'none';
   _setCommunityStatus(search ? '검색 결과가 없어요.' : '표시할 게시글이 없어요.');
   return;
 }
 const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
 if (window.postPage > totalPages) window.postPage = totalPages;
 if (window.postPage < 1) window.postPage = 1;
 const startIdx = (window.postPage - 1) * POSTS_PER_PAGE;
 const slice = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);
 pl.innerHTML = slice.map(_renderPostCard).join('');
 _renderPager(totalPages);
 _setCommunityStatus(`게시글 ${posts.length}건 중 ${startIdx + 1}~${Math.min(startIdx + POSTS_PER_PAGE, posts.length)}건을 표시했어요.`);
}

function _renderPager(totalPages) {
 const pager = document.getElementById('postPager');
 if (!pager) return;
 if (totalPages <= 1) { pager.style.display = 'none'; pager.innerHTML = ''; return; }
 pager.style.display = 'flex';
 const cur = window.postPage;
 const btnStyle = 'min-width:34px;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:13px;cursor:pointer;';
 const activeStyle = 'min-width:34px;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--blue);background:var(--blue);color:#fff;font-size:13px;font-weight:700;cursor:default;';
 const disabledStyle = btnStyle + 'opacity:.4;cursor:not-allowed;';
 let html = '';
 // 이전 버튼
 html += '<button onclick="gotoPostPage('+(cur-1)+')" '+(cur<=1?'disabled':'')+' style="'+(cur<=1?disabledStyle:btnStyle)+'">‹</button>';
 // 페이지 번호 (현재 ± 2 윈도우 + 1, 마지막)
 const pages = new Set([1, totalPages, cur-2, cur-1, cur, cur+1, cur+2].filter(n => n >= 1 && n <= totalPages));
 const sorted = [...pages].sort((a,b)=>a-b);
 let prev = 0;
 for (const n of sorted) {
   if (n - prev > 1) html += '<span style="padding:0 4px;color:var(--text3);">…</span>';
   html += '<button onclick="gotoPostPage('+n+')" style="'+(n===cur?activeStyle:btnStyle)+'">'+n+'</button>';
   prev = n;
 }
 // 다음 버튼
 html += '<button onclick="gotoPostPage('+(cur+1)+')" '+(cur>=totalPages?'disabled':'')+' style="'+(cur>=totalPages?disabledStyle:btnStyle)+'">›</button>';
 pager.innerHTML = html;
}

window.gotoPostPage = function(n) {
 const total = Math.max(1, Math.ceil(_filteredSortedPosts().length / POSTS_PER_PAGE));
 if (n < 1 || n > total) return;
 window.postPage = n;
 _renderPostPage();
 // 페이지 전환 시 목록 상단으로 스크롤
 const pl = document.getElementById('postList');
 if (pl) pl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.loadPosts = async (sort) =>{
 if (blockClosedCommunity()) return;
 const sortChanged = sort && sort !== window.sortBy;
 if (sort && ['latest', 'views', 'oldest'].includes(sort)) window.sortBy = sort;
 document.querySelectorAll('.sortbtn').forEach(b =>b.classList.toggle('active', b.dataset.sort===window.sortBy));
 const pl = document.getElementById('postList');
 if (!pl) return;
 // 관리자만 "에디터 추천" 체크박스 노출
 const featLabel = document.getElementById('featuredLabel');
 if (featLabel) featLabel.style.display = (window.isAdmin && window.isAdmin()) ? 'flex' : 'none';
 const pager = document.getElementById('postPager');
 // 비로그인 상태에서는 공개 읽기 규칙과 무관하게 UI에서 실게시글 접근을 차단한다.
 if (!CU) {
  _showCommunityLoginGate();
  return;
 }
 const requestUid = CU.uid;
 const rankSection = document.getElementById('rankSection');
 if (rankSection) rankSection.style.display = '';
 pl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text3)">불러오는 중...</div>';
 if (pager) pager.style.display = 'none';
 try {
 const snap = await getDocs(collection(db,'posts'));
 if (!CU || CU.uid !== requestUid) { _showCommunityLoginGate(); return; }
 let posts = [];
 snap.forEach(d => {
  const data = d.data();
  posts.push({id:d.id,...data,category:_normalizePostCategory(data.category)});
 });

 // 숨김 글: 작성자/관리자만 보임
 const _isAdm = window.isAdmin && window.isAdmin();
 const _myUid = CU ? CU.uid : null;
 posts = posts.filter(p => !p.hidden || _isAdm || (_myUid && p.authorId === _myUid));

 // 에디터 추천: isFeatured=true & 최근 30일
 const month = new Date(); month.setDate(month.getDate()-30);
 const featured = posts
  .filter(p => p.isFeatured && p.createdAt && p.createdAt.toDate() >= month)
  .sort((a,b) => (b.createdAt?.toDate()||0) - (a.createdAt?.toDate()||0));

 // 이번주 인기글: 최근 7일 글 중 가중점수 (views + likes*3 + comments*2) 상위 5개
 // 7일 글이 2개 미만이면 전체 글로 폴백
 const week = new Date(); week.setDate(week.getDate()-7);
 const recent = posts.filter(p=>p.createdAt && p.createdAt.toDate()>=week);
 const top5src = recent.length >= 2 ? recent : posts;
 const top5 = [...top5src].sort((a,b) => _postScore(b) - _postScore(a)).slice(0,5);

 const fs = document.getElementById('featuredSection');
 const ps = document.getElementById('popularSection');
 if (fs) fs.dataset.has = featured.length ? '1' : '0';
 if (ps) ps.dataset.has = top5.length ? '1' : '0';
 _renderFeaturedSection(featured);
 _renderPopularSection(top5);
 _renderRankList(top5);

 // 카테고리 필터가 걸려 있으면 추천/인기 섹션 숨김
 if (window.currentCategory) {
  if (fs) fs.style.display = 'none';
  if (ps) ps.style.display = 'none';
 }

 window._cachedPosts = posts;
 if (sortChanged || !window.postPage) window.postPage = 1;
 _renderPostPage();
 } catch(e) {
  if (!CU || CU.uid !== requestUid) { _showCommunityLoginGate(); return; }
  _clearCommunityPostSurfaces();
  pl.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--red)">게시글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>';
  _setCommunityStatus('게시글을 불러오지 못했어요.');
 }
};

window.submitPost = async () =>{
 if (blockClosedCommunity()) return;
 if (!CU) { window.openCommunityLogin(); return; }
 const title = document.getElementById('ptitle').value.trim();
 const body = document.getElementById('pbody').value.trim();
 if (!title||!body) { alert('제목과 내용을 모두 입력해 주세요.'); return; }
 
 const files = typeof window.getSelectedFiles === 'function' ? window.getSelectedFiles() : [];
 if (files.length >5) { alert('사진은 최대 5장까지만 올릴 수 있어요.'); return; }

 const anon = document.getElementById('postAnon').checked;
 const btn = document.getElementById('postsubmit');
 if (!btn || btn.disabled) return;
 btn.disabled = true; 
 btn.setAttribute('aria-busy', 'true');
 btn.textContent = '등록 중...';

 try {
 let photoUrls = [];
 // 1. 사진이 있으면 먼저 Storage에 업로드
 if (files.length >0) {
 btn.textContent = '사진 업로드 중... ⏳';
 for (let i = 0; i < files.length; i++) {
 const file = files[i];
 const fileName = `community_photos/${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name}`;
 const storageRef = ref(storage, fileName);
 const snapshot = await uploadBytes(storageRef, file);
 const downloadUrl = await getDownloadURL(snapshot.ref);
 photoUrls.push(downloadUrl);
 }
 }

 // 2. 게시글 정보 DB에 저장
 btn.textContent = '게시글 저장 중...';
 const pAuthorName = anon ? '익명' : (window.getAdminName() || CU.displayName);
 const catEl = document.getElementById('postCategory');
 const category = _normalizePostCategory((catEl && catEl.value) ? catEl.value : '자유');
 const featEl = document.getElementById('postFeatured');
 const isFeatured = !!(window.isAdmin() && featEl && featEl.checked);
 await addDoc(collection(db,'posts'),{
 title,
 body,
 authorId:CU.uid,
 authorName:pAuthorName,
 isAnon:anon,
 category,
 isFeatured,
 commentCount:0,
 views:0,
 createdAt:serverTimestamp(),
 photos: photoUrls // 사진 링크 배열 저장!
 });
 if (window.gpTrack) window.gpTrack('community_post_create', { category, photos_count: photoUrls.length, is_anon: anon });

 // 3. 폼 초기화
 document.getElementById('ptitle').value='';
 document.getElementById('pbody').value='';
 if (catEl) catEl.value = '자유';
 if (featEl) featEl.checked = false;
 if(typeof window.clearSelectedFiles === 'function') window.clearSelectedFiles();
 document.getElementById('wform').style.display='none';
 
 // 4. 목록 새로고침 (새 글이 가장 위에 오도록 1페이지로 이동)
 window.postPage = 1;
 await window.loadPosts();
 } catch(e) {
 alert('등록 실패: '+e.message); 
 } finally { 
 btn.disabled=false; 
 btn.removeAttribute('aria-busy');
 btn.textContent='등록'; 
 }
};

window.viewPost = async (postId) =>{
 if (blockClosedCommunity()) return;
 if (!CU) { _showCommunityLoginGate(); window.openCommunityLogin(); return; }
 document.getElementById('listView').style.display='none';
 document.getElementById('detailView').style.display='block';
 const dv = document.getElementById('postDetail');
 dv.innerHTML='<div style="text-align:center;padding:32px;color:var(--text3)">불러오는 중...</div>';
 try {
 const snap = await getDoc(doc(db,'posts',postId));
 const p = snap.data();
 const _isAdm2 = window.isAdmin && window.isAdmin();
 const _isOwner2 = CU && CU.uid === p.authorId;
 if (p.hidden && !_isAdm2 && !_isOwner2) {
  dv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">존재하지 않거나 삭제된 글입니다.</div>';
  return;
 }
 await updateDoc(doc(db,'posts',postId),{views:increment(1)}).catch(()=>{});
 const date = p.createdAt?new Date(p.createdAt.toDate()).toLocaleDateString('ko-KR'):'';
 const likes = p.likes || [];
 const isLiked = CU && likes.includes(CU.uid);
 const isAuthor = CU && (CU.uid===p.authorId || window.isAdmin());
 let bookmarked = false;
 if (CU) { const us = await getDoc(doc(db,'users',CU.uid)); bookmarked = (us.data().bookmarks||[]).includes(postId); }
 const bmClass = bookmarked?'abtn bookmarked':'abtn';
 const bmTxt = bookmarked?' 북마크됨':' 북마크';
 const postUrl = location.origin+location.pathname+'?post='+postId;
 const pdCat = _normalizePostCategory(p.category);
 const pdSlug = _categorySlug(pdCat);
 const pdCatHtml = '<div style="margin-bottom:8px;"><span class="cat-chip cat-'+pdSlug+'">'+escapeHtml(pdCat)+'</span>'+(p.isFeatured?'<span class="feat-title-badge" style="margin-left:6px;">에디터 추천</span>':'')+'</div>';
 dv.innerHTML =
 '<div class="pdhd">'
 +pdCatHtml
 +'<div class="pdtitle">'+escapeHtml(p.title)+'</div>'
 +'<div class="pmeta"><span>'+escapeHtml(p.authorName)+'</span><span>'+date+'</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+(p.views||0)+'</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'+(p.commentCount||0)+'</span></div>'
 +'<div class="pdactions">'
 +'<button class="'+(isLiked?'like-btn liked':'like-btn')+'" id="likeBtn" onclick="toggleLike(\''+postId+'\')"><svg viewBox="0 0 24 24" fill="'+(isLiked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> '+likes.length+'</button>'
 +'<button class="'+bmClass+'" id="bmBtn" onclick="toggleBm(\''+postId+'\')">'+bmTxt+'</button>'
 +'<button class="abtn" onclick="copyLink(\''+postUrl+'\')">링크 복사</button>'
 +(window.isAdmin && window.isAdmin() ? '<button class="abtn" onclick="togglePostHidden(\''+postId+'\','+(p.hidden?'false':'true')+')">'+(p.hidden?'숨김 해제':'숨김 처리')+'</button>' : '')
 +(isAuthor?'<button class="abtn danger" onclick="delPost(\''+postId+'\')">삭제</button>':'')
 +'</div></div>'
 +'<div class="pdbody" id="pdbody"></div>';
 let bodyHtml = escapeHtml(p.body);
 if (p.photos && p.photos.length >0) {
 bodyHtml += '<div style="margin-top:20px; display:flex; flex-direction:column; gap:12px;">';
 p.photos.forEach(url =>{
 const safeU = safePhotoUrl(url);
 if (safeU) bodyHtml += `<img src="${escapeHtml(safeU)}" style="max-width:100%; border-radius:8px; border:1px solid var(--border);">`;
 });
 bodyHtml += '</div>';
 }
 document.getElementById('pdbody').innerHTML = bodyHtml;
 const csnap = await getDocs(query(collection(db,'posts',postId,'comments'),orderBy('createdAt','asc')));
 let ch = '<div class="csec"><div class="ctitle">댓글 '+csnap.size+'개</div>';
 csnap.forEach(c =>{
 const cd = c.data();
 const cd_date = cd.createdAt?new Date(cd.createdAt.toDate()).toLocaleDateString('ko-KR'):'';
 const isMine = CU && (CU.uid===cd.authorId || window.isAdmin());
 const isReply = cd.isReply || false;
 const replyStyle = isReply ? 'margin-left:20px;padding-left:12px;background:var(--surface2);border-radius:10px;' : '';
 const replyPrefix = isReply ? '↩ ' : '';
 let replyFormHtml = '';
 if (CU && !isReply) {
 replyFormHtml = '<button class="reply-btn" onclick="toggleReplyForm(\''+c.id+'\')">답글 달기</button>'
 +'<div id="replyForm_'+c.id+'" style="display:none;margin-top:8px;">'
 +'<textarea id="reply_'+c.id+'" placeholder="답글을 입력해 주세요" rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);font-family:var(--font);font-size:13px;resize:vertical;outline:none;display:block;"></textarea>'
 +'<div class="cwrite-ft" style="margin-top:6px;">'
 +'<label class="anon-label"><input type="checkbox" id="replyAnon_'+c.id+'">익명</label>'
 +'<button class="csubmit" style="font-size:13px;padding:7px 14px;" onclick="submitReply(\''+postId+'\',\''+c.id+'\',\''+jsAttr(cd.authorName)+'\')">등록</button>'
 +'</div></div>';
 }
 ch += '<div class="citem" style="'+replyStyle+'">'
 +'<div class="cauthor"><span>'+escapeHtml(replyPrefix)+escapeHtml(cd.authorName)+' · '+cd_date+'</span>'
 +(isMine?'<button class="cdelbtn" onclick="delComment(\''+postId+'\',\''+c.id+'\')"></button>':'')
 +'</div><div class="cbody">'+escapeHtml(cd.body)+'</div>'
 +replyFormHtml
 +'</div>';
 });
 if (CU) {
 ch += '<div class="cwrite">'
 +'<textarea id="cinput" placeholder="댓글을 입력하세요..." rows="3"></textarea>'
 +'<div class="cwrite-ft">'
 +'<label class="anon-label"><input type="checkbox" id="canon">익명으로 작성</label>'
 +'<button class="csubmit" onclick="submitComment(\''+postId+'\')">등록</button>'
 +'</div></div>';
 } else {
 ch += '<div class="loginmsg">댓글을 작성하려면 로그인하세요.</div>';
 }
 ch += '</div>';
 dv.innerHTML += ch;
 document.getElementById('curPostId').value = postId;
 } catch(e) { dv.innerHTML='<div style="color:var(--red)">게시글을 불러오지 못했어요. '+escapeHtml(e.message || '')+'</div>'; }
};

window.submitComment = async (postId) =>{
 if (blockClosedCommunity()) return;
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const body = document.getElementById('cinput').value.trim();
 if (!body) { alert('댓글 내용을 입력해 주세요.'); return; }
 const anon = document.getElementById('canon').checked;
 try {
 let anonName = window.getAdminName() || CU.displayName;
 if (anon) {
 const prevSnap = await getDocs(query(collection(db,'posts',postId,'comments'),orderBy('createdAt','asc')));
 const anonMap = {};
 let anonCount = 0;
 prevSnap.forEach(c =>{
 const cd = c.data();
 if (cd.isAnon && cd.authorId) {
 if (!anonMap[cd.authorId]) { anonCount++; anonMap[cd.authorId] = anonCount; }
 }
 });
 if (anonMap[CU.uid]) { anonName = '익명' + anonMap[CU.uid]; }
 else { anonName = '익명' + (anonCount + 1); }
 }
 await addDoc(collection(db,'posts',postId,'comments'),{ body, authorId:CU.uid, authorName:anonName, isAnon:anon, createdAt:serverTimestamp() });
 if (window.gpTrack) window.gpTrack('comment_create', { post_id: postId, is_anon: anon });
 await updateDoc(doc(db,'posts',postId),{commentCount:increment(1)});
 const psnap = await getDoc(doc(db,'posts',postId));
 if(psnap.exists()) await window.sendNotification(postId, psnap.data().authorId, anonName, psnap.data().title);
 await window.viewPost(postId);
 } catch(e) { alert('댓글 등록 실패: '+e.message); }
};

window.toggleBm = async (postId) =>{
 if (blockClosedCommunity()) return;
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const ref = doc(db,'users',CU.uid);
 const snap = await getDoc(ref);
 const bms = snap.data().bookmarks||[];
 const has = bms.includes(postId);
 await updateDoc(ref,{bookmarks: has?arrayRemove(postId):arrayUnion(postId)});
 const btn = document.getElementById('bmBtn');
 if (btn) { btn.textContent=has?' 북마크':' 북마크됨'; btn.className=has?'abtn':'abtn bookmarked'; }
};

window.copyLink = (url) =>{
 navigator.clipboard.writeText(url).then(()=>alert('링크를 복사했어요.'));
};

window.delPost = async (postId) =>{
 if (blockClosedCommunity()) return;
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '글을 삭제할까요?', message: '삭제한 글은 복구할 수 없어요.', confirmText: '삭제하기', danger: true })
  : confirm('글을 삭제하시겠어요?');
 if (!ok) return;
 try {
   await deleteDoc(doc(db,'posts',postId));
   backToList();
   await window.loadPosts();
 } catch(e) {
   alert('삭제 실패: ' + e.message);
 }
};

window.togglePostHidden = async (postId, makeHidden) =>{
 if (blockClosedCommunity()) return;
 if (!(window.isAdmin && window.isAdmin())) { alert('권한이 없습니다.'); return; }
 const msg = makeHidden ? '이 글을 숨김 처리할까요? (다른 유저에게 노출되지 않음)' : '숨김을 해제할까요?';
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: makeHidden ? '글을 숨김 처리할까요?' : '숨김을 해제할까요?', message: makeHidden ? '다른 사용자에게 노출되지 않습니다.' : '다시 목록과 상세 화면에 노출됩니다.', confirmText: makeHidden ? '숨김 처리' : '해제하기', danger: makeHidden })
  : confirm(msg);
 if (!ok) return;
 try {
   await updateDoc(doc(db,'posts',postId), { hidden: makeHidden });
   await window.viewPost(postId);
 } catch(e) {
   alert('처리 실패: ' + e.message);
 }
};

window.delComment = async (postId, commentId) =>{
 if (blockClosedCommunity()) return;
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '댓글을 삭제할까요?', message: '삭제한 댓글은 복구할 수 없어요.', confirmText: '삭제하기', danger: true })
  : confirm('댓글을 삭제하시겠어요?');
 if (!ok) return;
 try {
 await deleteDoc(doc(db,'posts',postId,'comments',commentId));
 await updateDoc(doc(db,'posts',postId),{commentCount:increment(-1)});
 await window.viewPost(postId);
 } catch(e) { alert('댓글 삭제 실패: ' + e.message); }
};

// ===== Q&A =====
const QNA_PAGE_SIZE = 10;
let qnaItems = [];
let qnaContext = { isAdmin: false, uid: null };

function renderBoardPagination(container, { page, totalPages, totalItems, label, onChange }) {
 if (!container) return;
 if (totalItems <= 0 || totalPages <= 1) {
  container.hidden = true;
  container.innerHTML = '';
  return;
 }
 const pages = compactPageNumbers(page, totalPages, 1);
 const parts = [
  '<button type="button" class="gp-board-page-nav" data-board-page="' + (page - 1) + '" aria-label="이전 페이지"' + (page <= 1 ? ' disabled' : '') + '>이전</button>'
 ];
 pages.forEach((pageNumber, index) => {
  if (index > 0 && pageNumber - pages[index - 1] > 1) {
   parts.push('<span class="gp-board-page-gap" aria-hidden="true">…</span>');
  }
  parts.push('<button type="button" class="gp-board-page-number' + (pageNumber === page ? ' is-current' : '') + '" data-board-page="' + pageNumber + '" aria-label="' + label + ' ' + pageNumber + '페이지"' + (pageNumber === page ? ' aria-current="page"' : '') + '>' + pageNumber + '</button>');
 });
 parts.push('<button type="button" class="gp-board-page-nav" data-board-page="' + (page + 1) + '" aria-label="다음 페이지"' + (page >= totalPages ? ' disabled' : '') + '>다음</button>');
 container.innerHTML = parts.join('');
 container.hidden = false;
 container.querySelectorAll('button[data-board-page]').forEach(button => {
  button.addEventListener('click', () => {
   const nextPage = Number(button.dataset.boardPage);
   if (!button.disabled && Number.isInteger(nextPage)) onChange(nextPage);
  });
 });
}

window.qnaSort = window.qnaSort || 'pending';
window.qnaPage = Number.isInteger(window.qnaPage) && window.qnaPage > 0 ? window.qnaPage : 1;

function renderQuestionListPage() {
 const el = document.getElementById('questionList');
 const statusEl = document.getElementById('questionResultStatus');
 const pager = document.getElementById('questionPagination');
 if (!el) return;
 const pageData = paginateItems(qnaItems, window.qnaPage, QNA_PAGE_SIZE);
 const { totalItems, totalPages, startIndex, endIndex, items: pageItems } = pageData;
 window.qnaPage = pageData.page;
 el.setAttribute('aria-busy', 'false');
 if (statusEl) {
  const scope = qnaContext.isAdmin ? '전체 문의' : '내 문의';
  statusEl.textContent = totalItems
   ? scope + ' ' + totalItems.toLocaleString('ko-KR') + '건 · ' + (startIndex + 1).toLocaleString('ko-KR') + '–' + endIndex.toLocaleString('ko-KR') + '건 표시'
   : scope + ' 0건';
 }
 if (!totalItems) {
  el.innerHTML = qnaContext.isAdmin
   ? '<div class="qna-empty">접수된 문의가 없어요.</div>'
   : '<div class="qna-empty">아직 남긴 문의가 없어요. 위에서 문의를 남겨보세요.</div>';
  renderBoardPagination(pager, { page: 1, totalPages: 1, totalItems: 0, label: '문의 목록', onChange: () => {} });
  return;
 }
 const lockIco = '<svg class="lock-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
 el.innerHTML = pageItems.map(q => {
  const date = q.createdAt ? new Date(q.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
  const qnaStatus = q.status === 'answered' ? 'answered' : 'pending';
  const statusText = qnaStatus === 'answered' ? '답변 완료' : '답변 대기';
  const canView = qnaContext.isAdmin || (qnaContext.uid && q.authorId === qnaContext.uid);
  const displayTitle = canView ? escapeHtml(q.title || '') : '비공개 질문입니다.';
  const authorMeta = qnaContext.isAdmin ? '<span>' + escapeHtml(q.authorName || '') + '</span>' : '';
  return '<button type="button" class="gp-board-row gp-board-row-button" data-qna-id="' + escapeHtml(q.id) + '" aria-label="' + displayTitle + ', ' + statusText + '">'
   + '<span class="gbr-main">'
   +  '<span class="gbr-ttl">' + (canView ? '' : lockIco) + '<span class="gbr-ttl-text">' + displayTitle + '</span></span>'
   +  '<span class="gbr-sub">' + authorMeta + '<span>' + date + '</span>' + (canView ? '' : '<span class="gbr-cat">비공개</span>') + '</span>'
   + '</span>'
   + '<span class="gbr-stats"><span class="qna-status ' + qnaStatus + '">' + statusText + '</span></span>'
   + '</button>';
 }).join('');
 el.querySelectorAll('[data-qna-id]').forEach(row => {
  row.addEventListener('click', () => window.viewQuestion(row.dataset.qnaId));
 });
 renderBoardPagination(pager, {
  page: window.qnaPage,
  totalPages,
  totalItems,
  label: '문의 목록',
  onChange: nextPage => {
   window.qnaPage = nextPage;
   renderQuestionListPage();
   const heading = document.getElementById('questionListTitle');
   if (heading) heading.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
 });
}

window.loadQuestions = async (sort) =>{
 if (sort) {
  window.qnaSort = sort;
  window.qnaPage = 1;
 }
 document.querySelectorAll('[data-qsort]').forEach(button => {
  const active = button.dataset.qsort === window.qnaSort;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
 });
 const el = document.getElementById('questionList');
 const statusEl = document.getElementById('questionResultStatus');
 const pager = document.getElementById('questionPagination');
 if (!el) return;
 if (!CU) {
  // 1:1 문의는 로그인 필요 — 공개 게시판이 아니므로 데모 목록 대신 로그인 유도
  qnaItems = [];
  qnaContext = { isAdmin: false, uid: null };
  if (statusEl) statusEl.textContent = '로그인이 필요해요.';
  if (pager) { pager.hidden = true; pager.innerHTML = ''; }
  el.innerHTML = '<div class="qna-empty">로그인하면 1:1 문의를 남기고 답변을 확인할 수 있어요.</div>';
  return;
 }
 el.setAttribute('aria-busy', 'true');
 if (statusEl) statusEl.textContent = '문의 내역을 불러오는 중이에요.';
 if (pager) { pager.hidden = true; pager.innerHTML = ''; }
 el.innerHTML = '<div class="qna-empty">불러오는 중...</div>';
 try {
  const isAdm = window.isAdmin && window.isAdmin();
  const myUid = CU ? CU.uid : null;
  // 1:1 문의: 관리자는 전체, 일반 사용자는 본인 문의만 조회.
  // Firestore Rules의 qna list 권한(admin 또는 authorId==uid)과 정확히 일치시켜야 권한 거부가 안 난다.
  const qref = isAdm
   ? collection(db,'qna')
   : query(collection(db,'qna'), where('authorId','==',myUid));
  const snap = await getDocs(qref);
  let questions = [];
  snap.forEach(d => questions.push({id:d.id, ...d.data()}));
  // 정렬
  if (window.qnaSort === 'pending') {
   questions.sort((a,b) => {
    const ans = (a.status === 'answered' ? 1 : 0) - (b.status === 'answered' ? 1 : 0);
    if (ans !== 0) return ans;
    return (b.createdAt?.toDate()||0) - (a.createdAt?.toDate()||0);
   });
  } else {
   questions.sort((a,b) => (b.createdAt?.toDate()||0) - (a.createdAt?.toDate()||0));
  }

  qnaItems = questions;
  qnaContext = { isAdmin: Boolean(isAdm), uid: myUid };
  renderQuestionListPage();
 } catch(e) {
  el.setAttribute('aria-busy', 'false');
  qnaItems = [];
  if (statusEl) statusEl.textContent = '문의 내역을 불러오지 못했어요.';
  const isPerm = /permission|insufficient/i.test(e.message||'');
  el.innerHTML = isPerm
   ? '<div class="qna-empty">작성자와 관리자만 볼 수 있어요.</div>'
   : '<div class="qna-empty" style="color:var(--red)">문의 목록을 불러오지 못했어요. '+escapeHtml(e.message||'')+'</div>';
 }
};

window.submitQuestion = async () =>{
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const title = document.getElementById('qtitle').value.trim();
 const body = document.getElementById('qbody').value.trim();
 if (!title || !body) { alert('문의 제목과 내용을 모두 입력해 주세요.'); return; }
 const anon = document.getElementById('qAnon').checked;
 const btn = document.getElementById('qsubmit');
 btn.disabled = true;
 btn.textContent = '등록 중...';
 const fingerprint = JSON.stringify([title, body, anon]);
 if (!btn.dataset.requestId || btn.dataset.requestFingerprint !== fingerprint) {
  btn.dataset.requestId = newClientRequestId('qna');
  btn.dataset.requestFingerprint = fingerprint;
 }
 try {
  const result = await postAuthedJson('/qna/create', {
   requestId: btn.dataset.requestId,
   title,
   body,
   isAnon: anon
  });
  if (window.gpTrack) window.gpTrack('qna_submit', { qna_id: result.id, is_anon: anon });
  document.getElementById('qtitle').value = '';
  document.getElementById('qbody').value = '';
  document.getElementById('qAnon').checked = false;
  delete btn.dataset.requestId;
  delete btn.dataset.requestFingerprint;
  document.getElementById('qform').style.display = 'none';
  window.qnaPage = 1;
  await window.loadQuestions();
 } catch(e) {
  // 서버가 명시적으로 거절한 요청은 실제 저장이 없으므로 다음 제출에 새 ID를 쓴다.
  // 네트워크 단절·5xx는 응답만 유실됐을 수 있어 같은 ID를 유지해 멱등 재시도한다.
  if (Number(e?.status) > 0 && Number(e.status) < 500) {
   delete btn.dataset.requestId;
   delete btn.dataset.requestFingerprint;
  }
  alert('등록 실패: '+e.message);
 } finally {
  btn.disabled = false;
  btn.textContent = '문의 등록';
 }
};

window.viewQuestion = async (qid) =>{
 document.getElementById('qnaListView').style.display = 'none';
 document.getElementById('qnaDetailView').style.display = 'block';
 const dv = document.getElementById('questionDetail');
 dv.innerHTML = '<div class="qna-empty">불러오는 중...</div>';
 try {
  const snap = await getDoc(doc(db,'qna',qid));
  if (!snap.exists()) { dv.innerHTML = '<div class="qna-empty">삭제되었거나 찾을 수 없는 문의예요.</div>'; return; }
  const q = snap.data();
  const isAdm = window.isAdmin && window.isAdmin();
  const isOwner = CU && CU.uid === q.authorId;
  if (!isAdm && !isOwner) {
   dv.innerHTML = '<div class="qna-empty">비공개 질문입니다.</div>';
   document.getElementById('curQuestionId').value = '';
   return;
  }
  document.getElementById('curQuestionId').value = qid;
  const date = q.createdAt ? new Date(q.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
  const status = q.status === 'answered' ? 'answered' : 'pending';
  const statusTxt = status === 'answered' ? '답변 완료' : '답변 대기';
  const canDel = isAdm || isOwner;
  let html = '<div class="pdhd">'
   + '<div style="margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">'
   +  '<span class="qna-status '+status+'">'+statusTxt+'</span>'
   + '</div>'
   + '<div class="pdtitle">'+escapeHtml(q.title||'')+'</div>'
   + '<div class="pmeta"><span>'+escapeHtml(q.authorName||'')+'</span><span>'+date+'</span></div>'
   + (canDel ? '<div class="pdactions"><button class="abtn danger" onclick="delQuestion(\''+jsAttr(qid)+'\')">질문 삭제</button></div>' : '')
   + '</div>'
   + '<div class="pdbody">'+escapeHtml(q.body||'')+'</div>';

  if (q.answer && q.answer.body) {
   const aDate = q.answer.answeredAt ? new Date(q.answer.answeredAt.toDate()).toLocaleDateString('ko-KR') : '';
   html += '<div class="qna-answer">'
    + '<div class="qna-answer-hd">'
    +  '<span class="qna-answer-tag">✓ 운영팀 답변</span>'
    +  '<span class="qna-answer-meta">'+escapeHtml(q.answer.answeredBy||'운영팀')+(aDate?' · '+aDate:'')+'</span>'
    + '</div>'
    + '<div class="qna-answer-body">'+escapeHtml(q.answer.body)+'</div>'
    + (isAdm ? '<div class="qna-answer-actions"><button class="abtn" onclick="editAnswer(\''+jsAttr(qid)+'\')">답변 수정</button><button class="abtn danger" onclick="delAnswer(\''+jsAttr(qid)+'\')">답변 삭제</button></div>' : '')
    + '</div>';
  } else if (isAdm) {
   html += '<div class="qna-admin-form">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#2d8e4a;">운영팀 답변 작성</div>'
    + '<textarea id="answerBody" placeholder="답변을 입력하세요..."></textarea>'
    + '<div class="qna-admin-form-ft">'
    +  '<button class="qna-answer-submit" onclick="submitAnswer(\''+jsAttr(qid)+'\')">답변 등록</button>'
    + '</div>'
    + '</div>';
  } else {
   html += '<div class="qna-pending-box">아직 답변이 등록되지 않았어요. 운영팀 확인 후 답변드릴게요.</div>';
  }
  dv.innerHTML = html;
 } catch(e) {
  const isPerm = /permission|insufficient/i.test(e.message||'');
  dv.innerHTML = isPerm
   ? '<div class="qna-empty">작성자와 관리자만 볼 수 있어요.</div>'
   : '<div class="qna-empty" style="color:var(--red)">문의 내용을 불러오지 못했어요. '+escapeHtml(e.message||'')+'</div>';
 }
};

window.backToQList = (refresh = false) =>{
 document.getElementById('qnaDetailView').style.display = 'none';
 document.getElementById('qnaListView').style.display = 'block';
 document.getElementById('curQuestionId').value = '';
 if (refresh || !qnaItems.length) window.loadQuestions();
 else renderQuestionListPage();
};

window.submitAnswer = async (qid) =>{
 if (!window.isAdmin || !window.isAdmin()) { alert('관리자만 답변할 수 있어요.'); return; }
 const ta = document.getElementById('answerBody');
 const body = ta ? ta.value.trim() : '';
 if (!body) { alert('답변 내용을 입력해 주세요.'); return; }
 try {
  const answeredBy = (window.getAdminName && window.getAdminName()) || '운영팀';
  await postAuthedJson('/admin/qna/answer', { id: qid, body, answeredBy });
  qnaItems = [];
  await window.viewQuestion(qid);
 } catch(e) {
  alert('답변 등록 실패: '+e.message);
 }
};

window.editAnswer = async (qid) =>{
 if (!window.isAdmin || !window.isAdmin()) return;
 const snap = await getDoc(doc(db,'qna',qid));
 const q = snap.data() || {};
 const cur = q.answer && q.answer.body ? q.answer.body : '';
 const next = window.gpPrompt
  ? await window.gpPrompt({ title: '답변 수정', message: '사용자에게 보일 답변 내용을 수정합니다.', defaultValue: cur, placeholder: '답변 내용', confirmText: '수정하기', required: true })
  : prompt('답변을 수정하세요:', cur);
 if (next == null) return;
 const trimmed = next.trim();
 if (!trimmed) { alert('빈 답변은 등록할 수 없어요.'); return; }
 try {
  const answeredBy = (window.getAdminName && window.getAdminName()) || '운영팀';
  await postAuthedJson('/admin/qna/answer', { id: qid, body: trimmed, answeredBy });
  qnaItems = [];
  await window.viewQuestion(qid);
 } catch(e) {
  alert('수정 실패: '+e.message);
 }
};

window.delAnswer = async (qid) =>{
 if (!window.isAdmin || !window.isAdmin()) return;
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '답변을 삭제할까요?', message: '질문 상태가 답변 대기로 돌아갑니다.', confirmText: '삭제하기', danger: true })
  : confirm('답변을 삭제하시겠어요?');
 if (!ok) return;
 try {
  await postAuthedJson('/admin/qna/answer-delete', { id: qid });
  qnaItems = [];
  await window.viewQuestion(qid);
 } catch(e) {
  alert('삭제 실패: '+e.message);
 }
};

window.delQuestion = async (qid) =>{
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '질문을 삭제할까요?', message: '삭제한 문의는 복구할 수 없어요.', confirmText: '삭제하기', danger: true })
  : confirm('질문을 삭제하시겠어요?');
 if (!ok) return;
 try {
  await postAuthedJson('/qna/delete', { id: qid });
  qnaItems = [];
  window.backToQList(true);
 } catch(e) {
  alert('삭제 실패: '+e.message);
 }
};

// ===== NOTICE =====
const NOTICE_BASE_ITEMS = [
 {
  id: 'pricing-tiers-20260903',
  category: '정책',
  title: '요금제를 일반 3종과 대용량 2종으로 정리했어요',
  highlightLabel: '신규 · 요금제',
  date: '2026.09.03',
  views: 0,
  body: '충전 상품을 일반 요금제 3종과 대용량 요금제 2종으로 나누고, 시작 상품을 5,900원 200크레딧으로 바꿨어요.\n\n적용 시점\n2026년 9월 3일부터 새로 결제하는 주문에 적용해요.\n\n일반 요금제\n• 스타터: 5,900원 · 기준 200크레딧 · 개강 이벤트 0% · 총 200크레딧\n• 스탠다드: 14,500원 · 기준 500크레딧 + 상시 보너스 125크레딧\n• 프로: 29,000원 · 기준 1,000크레딧 + 상시 보너스 350크레딧\n\n대용량 요금제\n• 맥스: 58,000원 · 기준 2,000크레딧 + 상시 보너스 900크레딧\n• 팀·기관: 116,000원 · 기준 4,000크레딧 + 상시 보너스 2,000크레딧 · 문의 후 결제 방법을 안내해요\n\n종료되는 상품\n2,900원 스타터와 8,700원 라이트는 새 결제를 받지 않아요. 이미 결제한 크레딧은 그대로 남아 있고 유효기간 없이 사용할 수 있어요.\n\n크레딧 단가\n스타터의 기준 크레딧 단가는 이전과 같은 29원대이며 개강 이벤트 추가는 0%예요. 2026년 9월 30일까지 스탠다드·프로·맥스·팀·기관에는 기준 크레딧의 5%를 더 드려요.'
 },
 {
  id: 'advanced-credit-steps-20260902',
  category: '정책',
  title: '고급 휴머나이징 크레딧 기준을 더 세밀하게 조정했어요',
  highlightLabel: '업데이트 · 가격 안내',
  date: '2026.09.02',
  views: 0,
  body: '고급 휴머나이징 요금을 글자 수에 따라 5크레딧 단위로 더 세밀하게 조정했어요. 글자 수는 기존과 같이 공백을 포함해 계산합니다.\n\n고급 기본 요금\n• 3,000자 이하: 100크레딧\n• 3,001~10,000자: 105~200크레딧 · 3,000자 초과분 350자당 +5크레딧(올림)\n• 10,001~30,000자: 205~600크레딧 · 10,000자 초과분 250자당 +5크레딧(올림)\n\n근거 보강 추가금\n• 3,000자 이하: +50크레딧\n• 3,001~10,000자: +50~100크레딧 · 3,000자 초과분 700자가 채워질 때마다 +5크레딧\n• 10,001자 이상: +100크레딧\n\n대표 예시 (기본 / 근거 보강 포함)\n• 3,000자: 100 / 150크레딧\n• 3,001자: 105 / 155크레딧\n• 5,000자: 130 / 190크레딧\n• 7,000자: 160 / 235크레딧\n• 10,000자: 200 / 300크레딧\n• 15,000자: 300 / 400크레딧\n• 20,000자: 400 / 500크레딧\n• 30,000자: 600 / 700크레딧\n\n적용 범위\n변경 후 새로 접수되는 작업부터 적용해요. 이미 완료됐거나 진행 중인 작업의 차감액은 소급해 다시 계산하지 않아요.'
 },
 {
  id: 'paid-credit-no-expiry-20260829',
  category: '정책',
  title: '상시 상품 보너스와 9월 개강 이벤트를 안내해요',
  pinned: true,
  highlightLabel: '필수 · 크레딧 지급 기준',
  date: '2026.09.03',
  views: 0,
  body: '현재 적용 중인 크레딧 지급 기준이에요.\n\n상시 상품 보너스\n스탠다드·프로·맥스·팀·기관은 결제할 때 상품별 보너스를 함께 받아요. 9월 개강 이벤트가 끝난 뒤에도 계속 지급됩니다.\n\n9월 개강 추가 크레딧 이벤트\n2026년 9월 30일 23시 59분(한국 시간)까지 결제 확인 요청이 서버에 접수된 주문 중 스탠다드·프로·맥스·팀·기관에는 기준 크레딧의 5%를 추가로 드려요. 스타터의 이벤트 추가는 0%예요.\n\n상품별 지급 구성 (기준 + 상시 보너스 + 개강 이벤트 = 총 지급량)\n• 스타터: 200 + 0 + 0 = 총 200크레딧\n• 스탠다드: 500 + 125 + 25 = 총 650크레딧\n• 프로: 1,000 + 350 + 50 = 총 1,400크레딧\n• 맥스: 2,000 + 900 + 100 = 총 3,000크레딧\n• 팀·기관(문의 전용): 4,000 + 2,000 + 200 = 총 6,200크레딧\n\n유효기간\n기준 크레딧과 상품·이벤트로 받은 추가 크레딧은 모두 유효기간 없이 사용할 수 있어요.'
 },
 {
  id: 'refund-standard-20260830',
  category: '정책',
  title: '환불과 취소 기준을 정리했어요',
  pinned: true,
  highlightLabel: '필수 · 환불 안내',
  date: '2026.08.30',
  views: 0,
  body: '결제한 크레딧을 어떤 기준으로 환불해 드리는지 안내해요.\n\n적용 시점\n2026년 8월 30일부터 접수되는 요청에 적용해요.\n\n7일 이내에 사용하지 않았다면\n결제일로부터 7일 이내이고 크레딧을 한 번도 사용하지 않았다면 전액 환불해 드려요.\n\n일부만 사용했다면\n사용한 만큼을 뺀 금액을 환불해 드려요. 사용량은 주문별로 따로 기록해 두기 때문에 어떤 결제에서 얼마를 썼는지 그대로 계산돼요.\n\n함께 받은 추가 크레딧\n환불하는 주문으로 받은 상품 보너스와 이벤트 크레딧 중 남아 있는 분량은 함께 회수돼요.\n\n신청한 뒤에는\n처리가 끝날 때까지 해당 주문의 남은 크레딧은 사용할 수 없도록 예약돼요.\n\n과거 주문\n2026년 8월 30일 이전에 결제한 주문은 구매 당시 기준을 그대로 적용해요.\n\n접수 방법\n사이트 안의 고객센터에서 문의를 남겨 주시면 확인 후 안내해 드려요.'
 },
 {
  id: 'signup-credit-20-20260902',
  category: '정책',
  title: '신규 가입 무료 크레딧을 20크레딧으로 조정했어요',
  pinned: true,
  highlightLabel: '필수 · 가입 혜택',
  date: '2026.09.02',
  views: 0,
  body: '2026년 9월 2일 기준, 서비스에 처음 가입해 계정 생성을 완료한 신규 계정에는 무료 20크레딧을 드려요. 가입과 로그인 뒤 잔액에서 확인할 수 있어요.\n\n적용 대상\n• 현재 서비스에 처음 가입해 새로 생성되는 계정\n\n기존 계정\n이미 생성된 기존 계정에는 이번 변경에 따른 추가 크레딧을 소급 지급하지 않아요. 기존 잔액과 결제·초대 등으로 받은 크레딧은 그대로 유지돼요.\n\n사용 예시\n600자 AI 감지는 6크레딧, 같은 분량의 기본 휴머나이징은 12크레딧이에요. 두 작업을 차례로 이용하면 총 18크레딧을 사용하고 2크레딧이 남아요. 실제 사용량은 입력한 글자 수와 선택한 기능에 따라 달라지며, 실행 전에 화면에서 확인할 수 있어요.\n\n유효기간\n가입 무료 크레딧은 유효기간 없이 사용할 수 있어요.'
 },
 {
  id: 'detect-credit-policy',
  category: '정책',
  title: 'AI 감지는 100자당 1크레딧으로 이용할 수 있어요',
  pinned: true,
  highlightLabel: '필수 · 과금 안내',
  date: '2026.07.20',
  views: 0,
  body: 'AI 감지는 로그인 후 100자당 1크레딧으로 이용할 수 있어요.\n\n이용 방법\n실행하기 전에 예상 사용량을 화면에서 확인할 수 있어요.\n\n차감 기준\n전달 가능한 결과를 만들지 못하면 크레딧을 차감하지 않아요.'
 },
 {
  id: 'humanize-v2541-refine',
  category: '업데이트',
  title: '긴 글 구조 보존과 문단 보강을 개선했어요',
  highlightLabel: '신규 · 엔진 업데이트',
  date: '2026.08.29',
  views: 0,
  body: '긴 글을 처리할 때 제목·절·문단의 순서와 경계를 원문과 다시 대조해 서로 다른 절이 합쳐지거나 설명이 빠지는 문제를 줄였어요.\n\n문단 보강\n다듬기·기본 결과에서는 보강이 필요한 문단에 문단 보강 기능이 표시될 수 있어요. 사용자가 직접 입력한 실제 경험이나 사실을 바탕으로 해당 문단만 다시 다듬으며, 결과가 바뀌지 않거나 안전 검증을 통과하지 못한 보강 요청은 크레딧과 무료 횟수를 사용하지 않아요.\n\n확인해 주세요\n휴머나이징 결과는 제출 전에 수치·인용·고유명사와 사실관계를 직접 확인해 주세요.'
 },
 {
  id: 'service-refresh-20260829',
  category: '업데이트',
  title: '화면 구성과 글쓰기 자료를 새로 정리했어요',
  date: '2026.08.29',
  views: 0,
  body: '처음 들어오는 화면부터 결과를 다시 쓰는 화면까지 구성을 정리하고, 참고할 수 있는 글쓰기 자료를 늘렸어요.\n\n화면 구성\n• 첫 화면에서 실제 처리 과정을 순서대로 볼 수 있어요\n• 다듬기·기본·고급의 처리 범위와 예상 비용, 예상 시간을 한 화면에서 비교할 수 있어요\n• 작업 기록에서 지난 결과를 바로 열어 이어서 쓸 수 있어요\n\n글쓰기 자료\n글쓰기 연구노트와 장르별 템플릿을 추가했어요. 상단 메뉴와 화면 아래 링크에서 열어 볼 수 있어요.'
 },
 {
  id: 'payment-credit-sync-20260826',
  category: '업데이트',
  title: '결제 반영과 취소 처리를 안정화했어요',
  date: '2026.08.26',
  views: 0,
  body: '결제 승인과 크레딧 잔액이 어긋나지 않도록 결제 처리 흐름을 보강했어요.\n\n무엇이 달라졌나요\n• 결제가 승인되면 크레딧 반영 여부를 서버가 한 번 더 확인해요\n• 결제를 취소하면 잔액에 더 빠르게 반영돼요\n• 결제 확인창에서 기준 크레딧과 추가 크레딧을 나눠서 볼 수 있어요\n\n확인 방법\n반영 결과는 내 정보의 충전 내역에서 주문번호와 함께 확인할 수 있어요.'
 },
 {
  id: 'job-resume-20260813',
  category: '업데이트',
  title: '작업이 중단돼도 이어서 처리해요',
  date: '2026.08.13',
  views: 0,
  body: '휴머나이징을 실행하는 중에 화면을 벗어나거나 일시적인 오류가 생겨도 작업을 이어서 처리해요.\n\n무엇이 달라졌나요\n• 페이지를 새로 고쳐도 진행 상태가 그대로 이어져요\n• 처리 도중 멈춘 작업은 자동으로 다시 시작해요\n• 같은 작업이 두 번 실행되지 않도록 막았어요\n\n확인 방법\n완료된 결과는 작업 기록에서 다시 열어 볼 수 있어요.'
 },
 {
  id: 'multilingual-input-20260801',
  category: '업데이트',
  title: '휴머나이징은 한국어 원문을 지원해요',
  date: '2026.08.01',
  views: 0,
  body: '휴머나이징은 한국어 원문을 지원해요. 외국어가 주된 글은 의미 보존을 위해 변환하지 않아요. 한국어 글 안의 외국어 전문 용어와 인용은 보존해요.'
 },
 {
  id: 'credit-history-split-20260722',
  category: '정책',
  title: '사용 내역과 충전 내역을 나눠서 볼 수 있어요',
  date: '2026.07.22',
  views: 0,
  body: '크레딧이 어디에 쓰였고 어떻게 채워졌는지 두 화면으로 나눠서 확인할 수 있어요.\n\n사용 내역\n차감, 복구, 환불, 조정 기록을 시간순으로 볼 수 있어요.\n\n충전 내역\n결제한 주문의 금액과 처리 상태, 주문번호를 함께 볼 수 있어요.\n\n보는 방법\n내 정보에서 확인할 수 있고, 한 번에 20건씩 나눠서 보여드려요.'
 },
 {
  id: 'humanize-v25',
  category: '업데이트',
  title: '문단 구조 보존을 강화했어요',
  date: '2026.07.22',
  views: 1246,
  body: '원문의 문단 구조와 사례·결론 연결을 유지하면서 문장을 더욱 자연스럽게 다듬도록 분석·재작성 흐름을 강화했어요.\n\n무엇이 달라졌나요\n제목, 표, 목록과 인용 구조도 더욱 안정적으로 보존해요.'
 },
 {
  id: 'detect-report-launch',
  category: '업데이트',
  title: 'AI 감지 보고서를 열었어요',
  date: '2026.07.21',
  views: 2841,
  body: '글 전체의 AI 티 지수와 문단별 문체 특징을 한눈에 확인할 수 있는 AI 감지 보고서를 열었어요.\n\n무엇을 볼 수 있나요\n참고 결과와 주요 근거를 하나의 종합 보고서로 보여드려요.'
 },
 {
  id: 'detect-report-preview',
  category: '업데이트',
  title: '감지 보고서를 문단별로 펼쳐 볼 수 있어요',
  date: '2026.07.20',
  views: 1102,
  body: '문단별 감지 결과를 짧은 미리보기로 먼저 확인하고 필요한 문단만 펼쳐볼 수 있어요.\n\n무엇이 달라졌나요\n긴 글에서도 전체 흐름과 세부 근거를 빠르게 비교할 수 있도록 보고서 구성을 개선했어요.'
 },
 {
  id: 'friend-invite-event',
  category: '이벤트',
  title: '친구를 초대하면 둘 다 20크레딧을 받아요',
  date: '2026.07.18',
  views: 2874,
  body: '초대 링크를 통해 친구가 신규 가입하면 초대자와 가입자에게 각각 20크레딧을 드려요.\n\n참여 방법\n사이드바의 초대하기 버튼에서 링크를 복사해 바로 공유할 수 있어요.'
 },
 {
  id: 'application-genre-quality',
  category: '업데이트',
  title: '자소서와 지원서 처리 품질을 개선했어요',
  date: '2026.07.08',
  views: 1532,
  body: '자소서와 지원서를 다듬을 때 문항이 서로 섞이지 않도록 처리 품질을 개선했어요.\n\n무엇이 달라졌나요\n성장 과정, 경험, 지원 동기와 포부의 문항 경계를 유지하면서 반복 표현을 줄여요.'
 },
 {
  id: 'long-document-performance',
  category: '업데이트',
  title: '긴 문서를 더 안정적으로 처리해요',
  date: '2026.07.05',
  views: 987,
  body: '긴 문서를 구간별로 안전하게 나누고 순서대로 다시 결합하는 흐름을 보강했어요.\n\n무엇이 달라졌나요\n일시적인 오류가 발생한 구간은 자동으로 다시 시도해 작업 중단 가능성을 줄였어요.'
 },
 {
  id: 'maintenance-history-2026-spring',
  category: '점검',
  title: '2026년 3~5월 점검 이력을 안내해요',
  date: '2026.05.23',
  views: 0,
  body: '2026년 3월부터 5월 사이에 있었던 점검과 일시 장애 이력을 한곳에 정리했어요. 모두 복구가 끝난 사항이에요.\n\n2026년 5월 23일\n03시 30분부터 13시 50분까지 시스템 업데이트 중 발생한 내부 오류로 서비스 이용이 일시적으로 어려웠어요. 같은 날 복구를 마쳤어요.\n\n2026년 5월 13일 ~ 5월 14일\n13일 18시부터 14일 09시까지 예정된 시스템 업데이트를 진행했고 정상적으로 마무리했어요.\n\n2026년 5월 9일\n모델 업데이트 과정에서 일부 기능이 정상 동작하지 않았어요. 확인 후 조치를 마쳤어요.\n\n문의\n이용 중 불편한 점이 있으면 사이트 안의 고객센터로 알려 주세요.'
 },
 {
  id: 'humanize-quality-20260326',
  category: '업데이트',
  title: '휴머나이징 품질을 강화했어요',
  date: '2026.03.26',
  views: 0,
  body: '입력한 글의 문체와 맥락을 함께 분석해 결과가 더 자연스럽게 읽히도록 휴머나이징을 강화했어요.\n\n무엇이 달라졌나요\n• 단어만 바꾸는 대신 글 전체의 문체와 맥락을 함께 반영해요\n• 자기소개서처럼 말투가 중요한 글에서 원문의 어투를 더 잘 유지해요\n• 문장이 어색하게 끊기거나 같은 표현이 반복되는 경우를 줄였어요\n\n확인해 주세요\n휴머나이징 결과는 제출 전에 내용과 사실관계를 직접 확인해 주세요.'
 },
 {
  id: 'payment-open-20260401',
  category: '공지',
  title: '결제 시스템을 열었어요',
  date: '2026.04.01',
  views: 0,
  body: '크레딧 결제 기능을 열었어요.\n\n이용 방법\n요금 안내 화면에서 상품을 고른 뒤 결제하면 크레딧이 잔액에 반영돼요.\n\n감사 인사\n기다려 주신 이용자분들께 감사드려요.'
 }
];

const NOTICE_RETIRED_TITLES = new Set([
 '고급 휴머나이징 정식 출시',
 '최대 3만 자 장문 지원 시작',
 '결과 보관함 정식 오픈',
 '휴머나이징 결과 보관함·작업 복구 안정화',
 // 새 환불 공지(refund-standard-20260830)가 대체한다. 원격 사본이 새 공지와
 // 나란히 떠서 서로 다른 기준을 말하지 않도록 계속 숨긴다.
 '환불 정책 개정 안내 — 7일 이내 사용량 비례 환불',
 '서비스 리브랜딩 안내 — AI 휴머나이징으로 새단장',
 '개인정보처리방침 변경 내용을 안내해요',
 // 같은 공지의 옛 제목(개강 이벤트로 개명, 2026-08-31). 원격에 남은 사본이
 // 새 제목과 중복 노출되지 않도록 막는다 — 고정 제목 대조는 새 제목으로만 이뤄진다.
 '상시 상품 보너스와 9월 이벤트를 안내해요',
 // 아래는 2026-09-02 공지 양식 통일 때 로컬로 옮겨 다시 쓴 구공지들이다.
 // 원격 원본은 대괄호 제목·이모지·혼용 문체라 숨기고, 재작성본만 노출한다.
 '[2026-05-23] 시스템 업데이트로 인한 서비스 일시 장애',
 '[2026-05-14] 시스템 업데이트로 인한 서비스 일시 장애',
 '[모델 업데이트 중 기능 문제]',
 '[결제 시스템 오픈]',
 '[휴머나이징 기능 업데이트]',
 // 담당자 개인 이메일이 본문에 노출돼 있고, 문의 창구를 고객센터로 일원화한
 // 2026-08-30 방침과도 어긋나 재작성 없이 내린다.
 '[사이트 UI디자인 변경]',
 // 이미 종료된 이벤트라 재작성 없이 내린다.
 '[이벤트 종료] 오픈기념 5천자 무료 증정 이벤트 종료 되었습니다. 빠른시일내에 이벤트 또 열도록 하겠습니다.',
 // 원격에 같은 제목의 사본이 여러 벌 남아 목록에 중복으로 떴다. 원격 필터는
 // 원격 항목에만 걸리므로, 아래 두 제목을 막으면 로컬 정본만 남는다.
 '자소서·지원서 장르 재구성 품질 개선',
 '긴 문서 처리 속도·안정성 개선'
]);

const NOTICE_CATEGORIES = ['공지', '업데이트', '점검', '이벤트', '정책'];
const NOTICE_HIGHLIGHT_LABELS = new Map(
 NOTICE_BASE_ITEMS
  .filter(item => item.highlightLabel)
  .map(item => [item.title.trim().toLowerCase(), item.highlightLabel])
);
const NOTICE_PINNED_TITLES = new Set(
 NOTICE_BASE_ITEMS
  .filter(item => item.pinned)
  .map(item => item.title.trim().toLowerCase())
);
const noticeState = {
 category: '',
 query: '',
 sort: 'desc',
 page: 1,
 pageSize: 10,
 items: NOTICE_BASE_ITEMS.map(item => ({ ...item, source: 'local', authorName: '교수님 피하기' })),
 detail: null
};

function noticeDateValue(value) {
 const normalized = String(value || '').replace(/\./g, '-');
 const parsed = Date.parse(normalized);
 return Number.isFinite(parsed) ? parsed : 0;
}

function noticeDateText(value) {
 if (!value) return '';
 let date;
 try {
  date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
 } catch (e) {
  return '';
 }
 if (!date || Number.isNaN(date.getTime())) return '';
 return [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
 ].join('.');
}

function noticeCategoryOf(data) {
 const explicit = String(data.category || '').trim();
 if (NOTICE_CATEGORIES.includes(explicit)) return explicit;
 const title = String(data.title || '');
 if (/이벤트|초대|혜택|증정/.test(title)) return '이벤트';
 if (/점검|장애|복구|안정화 완료/.test(title)) return '점검';
 if (/정책|이용 방식|환불|약관/.test(title)) return '정책';
 if (/업데이트|개선|강화|업그레이드|리뉴얼|새단장/.test(title)) return '업데이트';
 return '공지';
}

function noticeIsPinned(item) {
 const title = String(item && item.title || '').trim().toLowerCase();
 return Boolean(item && item.pinned) || NOTICE_PINNED_TITLES.has(title);
}

function noticeFilteredItems() {
 const queryText = noticeState.query.toLowerCase();
 return noticeState.items
  .filter(item => !noticeState.category || item.category === noticeState.category)
  .filter(item => {
   if (!queryText) return true;
   return [item.title, item.category, item.body].join(' ').toLowerCase().includes(queryText);
  })
  .sort((a, b) => {
   const pinnedDiff = Number(noticeIsPinned(b)) - Number(noticeIsPinned(a));
   if (pinnedDiff) return pinnedDiff;
   const diff = noticeDateValue(b.date) - noticeDateValue(a.date);
   return noticeState.sort === 'desc' ? diff : -diff;
  });
}

function noticeHighlightLabel(item) {
 const title = String(item && item.title || '').trim().toLowerCase();
 return String(item && item.highlightLabel || NOTICE_HIGHLIGHT_LABELS.get(title) || '').trim();
}

function renderNoticeList() {
 const el = document.getElementById('noticeList');
 const status = document.getElementById('noticeResultStatus');
 const pager = document.getElementById('noticePagination');
 if (!el) return;
 noticeState.detail = null;
 el.setAttribute('aria-busy', 'false');
 const filteredItems = noticeFilteredItems();
 const pageData = paginateItems(filteredItems, noticeState.page, noticeState.pageSize);
 const { totalPages, startIndex, endIndex, items } = pageData;
 noticeState.page = pageData.page;
 if (status) {
  const scope = noticeState.category || '전체';
  const suffix = noticeState.query ? ' · 검색 결과' : '';
  status.textContent = filteredItems.length
   ? scope + ' ' + filteredItems.length.toLocaleString('ko-KR') + '개 · ' + (startIndex + 1).toLocaleString('ko-KR') + '–' + endIndex.toLocaleString('ko-KR') + '개 표시' + suffix
   : scope + ' 0개' + suffix;
 }
 if (!filteredItems.length) {
  el.innerHTML = '<div class="gp-notice-empty">조건에 맞는 공지사항이 없어요.<small>다른 분류를 선택하거나 검색어를 바꿔 보세요.</small></div>';
  renderBoardPagination(pager, { page: 1, totalPages: 1, totalItems: 0, label: '공지사항', onChange: () => {} });
  return;
 }
 el.innerHTML = items.map((item, index) => {
  const highlightLabel = noticeHighlightLabel(item);
  return '<button type="button" class="gp-board-row gp-board-row-button notice-row' + (highlightLabel ? ' is-highlighted' : '') + '" data-notice-index="' + index + '">'
  + '<span class="gbr-main">'
  +  '<span class="gbr-ttl">'
  +   (highlightLabel ? '<span class="gp-notice-row-badge">' + escapeHtml(highlightLabel) + '</span>' : '')
  +   '<span class="gbr-ttl-text">' + escapeHtml(item.title) + '</span>'
  +  '</span>'
  +  '<span class="gbr-sub"><span class="gbr-cat">' + escapeHtml(item.category) + '</span><span>' + escapeHtml(item.date) + '</span></span>'
  + '</span>'
  + '</button>';
 }).join('');
 el.querySelectorAll('[data-notice-index]').forEach(row => {
  row.addEventListener('click', () => {
   const index = Number(row.dataset.noticeIndex);
   if (Number.isInteger(index) && items[index]) renderNoticeDetail(items[index]);
  });
 });
 renderBoardPagination(pager, {
  page: noticeState.page,
  totalPages,
  totalItems: filteredItems.length,
  label: '공지사항',
  onChange: nextPage => {
   noticeState.page = nextPage;
   renderNoticeList();
   const resultStatus = document.getElementById('noticeResultStatus');
   if (resultStatus) resultStatus.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
 });
}

// 공지 본문은 `소제목\n내용` 블록 규약(2026-09-02 양식 표준)이다. 빈 줄 뒤에 오는 짧은 한 줄(문장 종결 아님)을
// 소제목으로 올려 상세에서 구조가 보이게 한다. 규약을 안 따르는 옛 본문은 줄바꿈만 살린 평문으로 그대로 낸다.
function noticeBodyHtml(item) {
 const plain = escapeHtml(item.body || '').replace(/\n/g, '<br>');
 const lines = String(item.body || '').split('\n');
 const isHeading = i => {
  const t = lines[i].trim();
  if (!t || t.length > 24 || t.startsWith('•')) return false;
  if (/(?:[.!?]|어요|해요|돼요|됐어요|드려요|있어요|없어요|않아요|습니다|니다)$/.test(t)) return false;
  return i > 0 && !lines[i - 1].trim() && !!(lines[i + 1] || '').trim();
 };
 if (!lines.some((_, i) => isHeading(i))) return plain;
 const blocks = [];
 let cur = [];
 lines.forEach(line => { if (line.trim()) cur.push(line); else if (cur.length) { blocks.push(cur); cur = []; } });
 if (cur.length) blocks.push(cur);
 let idx = 0;
 return blocks.map(block => {
  const start = idx; idx += block.length + 1;
  const lineHtml = l => l.trim().startsWith('•') ? '<span class="gp-notice-li">' + escapeHtml(l.trim()) + '</span>' : escapeHtml(l);
  if (isHeading(start)) {
   return '<section><h3>' + escapeHtml(block[0].trim()) + '</h3><p>' + block.slice(1).map(lineHtml).join('<br>') + '</p></section>';
  }
  return '<p>' + block.map(lineHtml).join('<br>') + '</p>';
 }).join('');
}

function renderNoticeDetail(item) {
 const el = document.getElementById('noticeList');
 const status = document.getElementById('noticeResultStatus');
 const pager = document.getElementById('noticePagination');
 if (!el || !item) return;
 noticeState.detail = item;
 if (status) status.textContent = '공지 상세';
 if (pager) { pager.hidden = true; pager.innerHTML = ''; }
 const canDelete = item.source === 'remote' && window.isAdmin();
 const highlightLabel = noticeHighlightLabel(item);
 el.innerHTML =
  '<button type="button" class="backbtn" id="noticeBackBtn">← 목록으로</button>'
  + '<article class="gp-notice-detail">'
  + '<div class="pdhd">'
  + '<div class="gp-notice-detail-tags"><span class="gbr-cat">' + escapeHtml(item.category || '공지') + '</span>'
  + (highlightLabel ? '<span class="gp-notice-row-badge">' + escapeHtml(highlightLabel) + '</span>' : '') + '</div>'
  + '<div class="pdtitle">' + escapeHtml(item.title) + '</div>'
  + '<div class="pmeta"><span>' + escapeHtml(item.authorName || '운영자') + '</span><span>' + escapeHtml(item.date || '') + '</span></div>'
  + (canDelete ? '<div class="pdactions"><button type="button" class="abtn danger" id="noticeDeleteBtn">삭제</button></div>' : '')
  + '</div>'
  + '<div class="pdbody" id="nbody">' + noticeBodyHtml(item) + '</div>'
  + '</article>';
 const backBtn = document.getElementById('noticeBackBtn');
 if (backBtn) backBtn.addEventListener('click', renderNoticeList);
 const deleteBtn = document.getElementById('noticeDeleteBtn');
 if (deleteBtn) deleteBtn.addEventListener('click', () => window.delNotice(item.id));
}

window.setNoticeCategory = (category, btn) => {
 noticeState.category = NOTICE_CATEGORIES.includes(category) ? category : '';
 noticeState.page = 1;
 document.querySelectorAll('#noticeContent [data-notice-category]').forEach(button => {
  const active = (button.dataset.noticeCategory || '') === noticeState.category;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
 });
 renderNoticeList();
};

window.applyNoticeFilters = () => {
 const input = document.getElementById('noticeSearchInput');
 noticeState.query = input ? input.value.trim() : '';
 noticeState.page = 1;
 renderNoticeList();
};

window.toggleNoticeSort = btn => {
 noticeState.sort = noticeState.sort === 'desc' ? 'asc' : 'desc';
 noticeState.page = 1;
 if (btn) {
  const isOldest = noticeState.sort === 'asc';
  btn.textContent = isOldest ? '오래된순' : '최신순';
  btn.setAttribute('aria-label', '공지 정렬: ' + btn.textContent);
  btn.setAttribute('aria-pressed', String(isOldest));
 }
 renderNoticeList();
};

window.backToNoticeList = renderNoticeList;

window.loadNotices = async () =>{
 const adminBtn = document.getElementById('noticeAdminBtn');
 if (adminBtn) {
  if (window.isAdmin()) {
   adminBtn.innerHTML = '<button class="wbtn" onclick="toggleNoticeForm()">공지 작성</button>';
  } else {
   adminBtn.innerHTML = '';
  }
 }
 noticeState.page = 1;
 noticeState.items = NOTICE_BASE_ITEMS.map(item => ({ ...item, source: 'local', authorName: '교수님 피하기' }));
 renderNoticeList();
 if (!CU) return;
 try {
  const snap = await getDocs(query(collection(db,'notices'), orderBy('createdAt','desc')));
  const remoteItems = snap.docs.map(d => {
   const n = d.data();
   const date = noticeDateText(n.createdAt);
   return {
    id: d.id,
    source: 'remote',
    category: noticeCategoryOf(n),
    title: String(n.title || '제목 없는 공지'),
    body: String(n.body || ''),
    authorName: String(n.authorName || '운영자'),
    date,
    views: Number(n.views || 0)
   };
  }).filter(item => !NOTICE_RETIRED_TITLES.has(item.title.trim()))
    .filter(item => !NOTICE_PINNED_TITLES.has(item.title.trim().toLowerCase()));
  const remoteTitles = new Set(remoteItems.map(item => item.title.trim().toLowerCase()));
  noticeState.items = remoteItems.concat(
   NOTICE_BASE_ITEMS
    .filter(item => !remoteTitles.has(item.title.trim().toLowerCase()))
    .map(item => ({ ...item, source: 'local', authorName: '교수님 피하기' }))
  );
  renderNoticeList();
 } catch(e) {
  if (window.gpToast) window.gpToast('운영 공지를 불러오지 못해 기본 공지를 표시해요.', { type: 'info' });
 }
};

window.viewNotice = async (id) =>{
 const cached = noticeState.items.find(item => item.source === 'remote' && item.id === id);
 if (cached) {
  renderNoticeDetail(cached);
  return;
 }
 try {
  const snap = await getDoc(doc(db,'notices',id));
  const n = snap.data();
  if (!n) throw new Error('NOTICE_NOT_FOUND');
  renderNoticeDetail({
   id,
   source: 'remote',
   category: noticeCategoryOf(n),
   title: String(n.title || '제목 없는 공지'),
   body: String(n.body || ''),
   authorName: String(n.authorName || '운영자'),
   date: noticeDateText(n.createdAt),
   views: Number(n.views || 0)
  });
 } catch (e) {
  if (window.gpToast) window.gpToast('공지 내용을 불러오지 못했어요.', { type: 'error' });
  renderNoticeList();
 }
};

window.toggleNoticeForm = () =>{
 const f = document.getElementById('noticeWriteForm');
 if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.submitNotice = async () =>{
 if (!window.isAdmin()) { alert('관리자만 공지를 작성할 수 있습니다.'); return; }
 const title = document.getElementById('ntitle').value.trim();
 const body = document.getElementById('nbody_input').value.trim();
 const categoryEl = document.getElementById('ncategory');
 const category = categoryEl && NOTICE_CATEGORIES.includes(categoryEl.value) ? categoryEl.value : '공지';
 if (!title||!body) { alert('제목과 내용을 모두 입력해야 합니다.'); return; }
 const btn = document.getElementById('noticeSubmit');
 btn.disabled=true; btn.textContent='등록 중...';
 try {
 const noticeAuthor = window.getAdminName() || CU.displayName;
 await addDoc(collection(db,'notices'),{ title, body, category, authorName:noticeAuthor, createdAt:serverTimestamp() });
 document.getElementById('ntitle').value='';
 document.getElementById('nbody_input').value='';
 if (categoryEl) categoryEl.value='공지';
 document.getElementById('noticeWriteForm').style.display='none';
 await window.loadNotices();
 } catch(e) { alert('등록 실패: '+e.message); }
 finally { btn.disabled=false; btn.textContent='등록'; }
};

window.delNotice = async (id) =>{
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '공지를 삭제하시겠습니까?', message: '삭제한 공지는 복구할 수 없습니다.', confirmText: '삭제하기', danger: true })
  : confirm('공지를 삭제하시겠습니까?');
 if (!ok) return;
 await deleteDoc(doc(db,'notices',id));
 await window.loadNotices();
};

// ===== MY PAGE =====
// 리스트 더보기/접기 공용 토글 — 내정보 화면의 목록들이 전부 펼쳐져 스크롤이 과도해지는 것 방지
window.gpToggleMore = function(hiddenId, btn, moreText) {
 const h = document.getElementById(hiddenId);
 if (!h || !btn) return;
 const expanded = h.style.display !== 'none';
 h.style.display = expanded ? 'none' : 'block';
 btn.textContent = expanded ? moreText : '접기';
};

window.loadMyPage = async () =>{
 if (!CU) return;
 const el = document.getElementById('mypageContent');
 if (!el) return;
 el.innerHTML = '<div class="gp-mp-loading" role="status">내 정보를 불러오는 중이에요…</div>';
 el.style.display = 'block';
 window.scrollTo(0,0);
 try {
 const snap = await getDoc(doc(db,'users',CU.uid));
 const u = snap.data() || {};
 const plan = u.plan || 'free';
 const planNames = { free:'무료', starter:'스타터', pro:'프로', master:'마스터', unlimited:'무제한' };
 const view = {
  name: escapeHtml(window.getAdminName()||CU.displayName),
  email: escapeHtml(CU.email),
  credits: Math.max(0, Number(u.credits) || 0),
  planLabel: escapeHtml(planNames[plan] || '무료'),
  isAdmin: window.isAdmin()
 };
 el.innerHTML = window.gpRenderMyPageShell(view);
 window.gpMyPageActivate(el, view);
 await loadNotifications();
 await window.loadOrderHistory();
 await window.loadCreditHistory();
 window.renderSubManage(u);
 } catch(e) { el.innerHTML = '<div class="gp-mp-error" role="alert">내 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. '+escapeHtml(e.message || '')+'</div>'; }
};

// 내 정보 화면 골격(2026-09-02 재설계). 데이터는 loadMyPage가 이스케이프해서 넘기고, 여기서는 조립만 한다.
// 브랜드 장치는 레이더 스코프 하나 — 보고서에서는 교수님이 학생을 찾지만, 여기서는 사용자 본인이 블립이다.
// 목록 컨테이너 id(notifList·orderHistoryList·creditHistoryList)는 기존 로더가 그대로 채우므로 바꾸지 않는다.
window.gpRenderMyPageShell = function(view) {
 const bubbleDefault = (view.name || '회원') + '님, 제출 전 마지막 점검은 여기서 해요';
 const stagePose = pose => '<img class="gp-mp-pose is-' + pose + '" data-pose="' + pose + '" data-src-f="/assets/img/mypage/avatar-f-' + pose + '.webp" data-src-m="/assets/img/mypage/avatar-m-' + pose + '.webp" src="/assets/img/mypage/avatar-f-' + pose + '.webp" alt="" width="480" height="480" decoding="async">';
 const coverageRow = (label, key) =>
  '<div class="gp-mp-cover-row"><span>' + label + '</span><strong><b data-mp-' + key + '>0</b>회</strong></div>';
 const tab = (id, panel, label, selected) =>
  '<button type="button" role="tab" id="' + id + '" aria-controls="' + panel + '" aria-selected="' + (selected ? 'true' : 'false') + '" tabindex="' + (selected ? '0' : '-1') + '">' + label + '</button>';
 const panel = (id, tabId, listId, hidden) =>
  '<section role="tabpanel" id="' + id + '" aria-labelledby="' + tabId + '"' + (hidden ? ' hidden' : '') + '><div id="' + listId + '"><div class="gp-mp-empty">불러오는 중…</div></div></section>';
 return '<section class="gp-mp">'
  +'<div class="gp-page-head"><div><h1>내 정보</h1><p>크레딧 잔액과 이용 기록, 계정 설정을 한곳에서 확인해요.</p></div>'
  +'<button type="button" class="gp-mp-logout" onclick="logout()">로그아웃</button></div>'
  +(view.isAdmin ? '<div class="gp-mypage-admin-entry"><div><div class="gp-mypage-admin-title">관리자 페이지</div><div class="gp-mypage-admin-sub">환불, 크레딧, 쿠폰, 사용자 원장을 별도 화면에서 처리합니다.</div></div><button type="button" onclick="openAdminPage()">관리자 페이지 열기</button></div>' : '')
  +'<div class="gp-mp-hero">'
  + '<div class="gp-mp-id">'
  +  '<div class="gp-mp-stage" data-mp-stage data-avatar="f" data-pose="idle" role="button" tabindex="0" aria-label="내 캐릭터. 누르면 교수님을 피해요">'
  +   '<svg class="gp-mp-stage-rings" viewBox="0 0 96 96" aria-hidden="true" focusable="false"><circle cx="48" cy="48" r="44"/><circle cx="48" cy="48" r="30"/><circle cx="48" cy="48" r="16"/><path d="M48 4v88M4 48h88"/></svg>'
  +   '<div class="gp-mp-prof" aria-hidden="true"><img src="/assets/img/report/professor.png" alt="" width="320" height="314" loading="lazy" decoding="async"></div>'
  +   '<div class="gp-mp-char" aria-hidden="true">'
  +    stagePose('idle') + stagePose('dodge') + stagePose('cheer') + stagePose('run')
  +   '</div>'
  +   '<div class="gp-mp-bubble" data-mp-bubble role="status" aria-live="polite">' + bubbleDefault + '</div>'
  +   '<span class="gp-mp-stage-hint" aria-hidden="true">눌러서 피하기</span>'
  +  '</div>'
  +  '<div class="gp-mp-who"><strong>' + view.name + '</strong><span>' + view.email + '</span><em>' + view.planLabel + ' 플랜</em></div>'
  +  '<div class="gp-mp-avatar-pick" role="group" aria-label="내 캐릭터 고르기">'
  +   '<button type="button" data-mp-avatar="f" aria-pressed="true">여학생</button>'
  +   '<button type="button" data-mp-avatar="m" aria-pressed="false">남학생</button>'
  +  '</div>'
  + '</div>'
  + '<div class="gp-mp-fuel">'
  +  '<div class="gp-mp-credits"><span>보유 크레딧</span><b data-mp-count="' + view.credits + '">0</b></div>'
  +  '<div class="gp-mp-cover">'
  +   '<p>지금 잔액으로 <span data-mp-len>600</span>자 글을</p>'
  +   coverageRow('AI 감지', 'detect')
  +   coverageRow('기본 휴머나이징', 'basic')
  +   '<em class="gp-mp-low" data-mp-low hidden>기본 휴머나이징을 한 번 실행하기에는 잔액이 부족해요. 충전하면 바로 이어서 쓸 수 있어요.</em>'
  +   '<div class="gp-mp-seg" role="group" aria-label="환산 기준 글 길이">'
  +    '<button type="button" data-mp-seg="600" aria-pressed="true">600자</button>'
  +    '<button type="button" data-mp-seg="1500" aria-pressed="false">1,500자</button>'
  +    '<button type="button" data-mp-seg="3000" aria-pressed="false">3,000자</button>'
  +   '</div>'
  +   '<small>실제 차감은 글자 수와 기능에 따라 달라지며, 실행 전에 다시 안내해요.</small>'
  +  '</div>'
  +  '<div class="gp-mp-actions"><button type="button" class="gp-mp-btn-primary" onclick="switchTab(\'pricing\')">충전하기</button>'
  +  '<button type="button" class="gp-mp-btn-outline" onclick="showReferralPopup()">친구 초대</button></div>'
  + '</div>'
  +'</div>'
  +'<div id="subManageCard" hidden></div>'
  +'<div class="gp-mp-tabs" role="tablist" aria-label="이용 기록">'
  + tab('mpTabNotif', 'mpPanelNotif', '알림', true)
  + tab('mpTabOrders', 'mpPanelOrders', '결제 내역', false)
  + tab('mpTabCredits', 'mpPanelCredits', '사용 내역', false)
  +'</div>'
  +'<div class="gp-mp-panels">'
  + panel('mpPanelNotif', 'mpTabNotif', 'notifList', false)
  + panel('mpPanelOrders', 'mpTabOrders', 'orderHistoryList', true)
  + panel('mpPanelCredits', 'mpTabCredits', 'creditHistoryList', true)
  +'</div>'
  +'<div class="gp-mp-account"><span>계정 관리</span>'
  + '<button type="button" onclick="changeNickname()">닉네임 변경</button>'
  + '<button type="button" onclick="showRefundModal()">환불하기</button>'
  + '<button type="button" class="is-danger" onclick="deleteAccount()">회원 탈퇴</button>'
  +'</div>'
  +'</section>';
};

// 잔액이 어디까지 가는지 — 요금 안내와 같은 기준(AI 감지 100자당 1, 기본 휴머나이징 100자당 2·최소 10)으로 환산한다.
window.gpMyPageCoverage = function(credits, len) {
 const units = Math.ceil(len / 100);
 const detectCost = Math.max(1, units);
 const basicCost = Math.max(10, units * 2);
 return { detect: Math.floor(credits / detectCost), basic: Math.floor(credits / basicCost) };
};

// 골격을 붙인 뒤 상호작용을 건다: 잔액 카운트업(한 번), 환산 기준 토글, 기록 탭(화살표 키 포함).
// 스코프 스윕은 CSS 애니메이션이라 여기서는 건드리지 않는다. 움직임 줄이기 설정이면 카운트업 없이 바로 최종값.
window.gpMyPageActivate = function(root, view) {
 if (!root) return;
 const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const countEl = root.querySelector('[data-mp-count]');
 const lenEl = root.querySelector('[data-mp-len]');
 const detectEl = root.querySelector('[data-mp-detect]');
 const basicEl = root.querySelector('[data-mp-basic]');
 const lowEl = root.querySelector('[data-mp-low]');
 const fmt = n => Number(n || 0).toLocaleString('ko-KR');
 const credits = Math.max(0, Number(view && view.credits) || 0);

 const applyCoverage = len => {
  const c = window.gpMyPageCoverage(credits, len);
  if (lenEl) lenEl.textContent = fmt(len);
  if (detectEl) detectEl.textContent = fmt(c.detect);
  if (basicEl) basicEl.textContent = fmt(c.basic);
  if (lowEl) lowEl.hidden = c.basic > 0;
 };
 root.querySelectorAll('[data-mp-seg]').forEach(btn => {
  btn.addEventListener('click', () => {
   root.querySelectorAll('[data-mp-seg]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
   applyCoverage(Number(btn.dataset.mpSeg) || 600);
  });
 });
 applyCoverage(600);

 if (countEl) {
  if (reduceMotion || credits === 0) {
   countEl.textContent = fmt(credits);
  } else {
   const start = performance.now();
   const dur = 640;
   const tick = now => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    countEl.textContent = fmt(Math.round(credits * eased));
    if (t < 1) requestAnimationFrame(tick);
   };
   requestAnimationFrame(tick);
  }
 }

 // ── 캐릭터 무대 ─────────────────────────────────────────────────────────────
 // 여/남 선택은 기기별 취향이라 localStorage에만 둔다(서버 필드 없음). 포인터를 따라 살짝 기울고,
 // 누르면 교수님이 오른쪽에서 들어왔다 나가는 동안 피하기 → 환호 → 대기로 돌아온다. 연출 중 재입력은 무시.
 const stage = root.querySelector('[data-mp-stage]');
 if (stage) {
  const bubble = stage.querySelector('[data-mp-bubble]');
  const bubbleDefault = bubble ? bubble.textContent : '';
  const poses = Array.from(stage.querySelectorAll('.gp-mp-pose'));
  const AVATAR_KEY = 'gp.mypage.avatar';
  const setAvatar = key => {
   const k = key === 'm' ? 'm' : 'f';
   stage.dataset.avatar = k;
   poses.forEach(img => { const src = img.getAttribute('data-src-' + k); if (src && img.getAttribute('src') !== src) img.setAttribute('src', src); });
   root.querySelectorAll('[data-mp-avatar]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mpAvatar === k)));
   try { localStorage.setItem(AVATAR_KEY, k); } catch (e) {}
  };
  let saved = 'f';
  try { saved = localStorage.getItem(AVATAR_KEY) || 'f'; } catch (e) {}
  setAvatar(saved);
  root.querySelectorAll('[data-mp-avatar]').forEach(b => b.addEventListener('click', () => {
   setAvatar(b.dataset.mpAvatar);
   stage.classList.remove('is-swapped'); void stage.offsetWidth; stage.classList.add('is-swapped');
  }));

  const lowBubble = '잔액이 얼마 안 남았어요. 충전하면 바로 이어서 쓸 수 있어요';
  const setBubble = text => { if (bubble) bubble.textContent = text; };
  const idleBubble = () => setBubble(window.gpMyPageCoverage(credits, 600).basic > 0 ? bubbleDefault : lowBubble);
  idleBubble();

  if (!reduceMotion) {
   let raf = 0;
   stage.addEventListener('pointermove', e => {
    if (stage.dataset.pose !== 'idle') return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
     raf = 0;
     const r = stage.getBoundingClientRect();
     const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
     const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
     stage.style.setProperty('--mp-tilt-x', (dx * 8).toFixed(2) + 'px');
     stage.style.setProperty('--mp-tilt-y', (dy * 5).toFixed(2) + 'px');
     stage.style.setProperty('--mp-tilt-r', (dx * 4).toFixed(2) + 'deg');
    });
   });
   stage.addEventListener('pointerleave', () => {
    stage.style.setProperty('--mp-tilt-x', '0px');
    stage.style.setProperty('--mp-tilt-y', '0px');
    stage.style.setProperty('--mp-tilt-r', '0deg');
   });
  }

  let dodges = 0;
  const wait = ms => new Promise(res => setTimeout(res, ms));
  const dodge = async () => {
   if (stage.dataset.pose !== 'idle') return;
   dodges += 1;
   if (reduceMotion) {
    stage.dataset.pose = 'cheer';
    setBubble('교수님이 지나가셨어요. ' + dodges + '번째!');
    await wait(1200);
    stage.dataset.pose = 'idle';
    idleBubble();
    return;
   }
   stage.dataset.pose = 'alert';
   setBubble('앗, 교수님!');
   await wait(420);
   stage.dataset.pose = 'dodge';
   await wait(900);
   stage.dataset.pose = 'cheer';
   setBubble('휴, 지나가셨다. ' + dodges + '번째 성공!');
   await wait(1300);
   stage.dataset.pose = 'idle';
   idleBubble();
  };
  stage.addEventListener('click', dodge);
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dodge(); } });
 }

 const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
 const select = tab => {
  tabs.forEach(t => {
   const on = t === tab;
   t.setAttribute('aria-selected', String(on));
   t.tabIndex = on ? 0 : -1;
   const p = root.querySelector('#' + t.getAttribute('aria-controls'));
   if (p) p.hidden = !on;
  });
 };
 tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', e => {
   const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
   if (!dir) return;
   e.preventDefault();
   const next = tabs[(i + dir + tabs.length) % tabs.length];
   next.focus();
   select(next);
  });
 });
};

// 마이페이지 정기결제 관리 카드 렌더
window.renderSubManage = function(u) {
  const el = document.getElementById('subManageCard');
  if (!el) return;
  const sub = u.subscription;
  const coupon = u.coupon;
  if (!sub) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const tierLabels = { '1000':'베이직(1,000자 × 50회/월)', '5000':'스탠다드(5,000자 × 50회/월)', '10000':'프로(10,000자 × 50회/월)', 'unlimited':'무제한' };
  const tierPrices = { '1000':11900, '5000':54900, '10000':99000, 'unlimited':290000 };
  const nextMs = sub.nextBillingAt?.toMillis ? sub.nextBillingAt.toMillis() : (sub.nextBillingAt?._seconds ? sub.nextBillingAt._seconds*1000 : 0);
  const nextDate = nextMs ? new Date(nextMs).toLocaleDateString('ko-KR') : '—';
  const statusLabel = ({ active:'정상 이용 중', cancelled:'해지 예정', expired:'만료', past_due:'결제 실패(중단)' })[sub.status] || '상태 확인 필요';
  const cardLine = sub.cardCompany || sub.cardNumber
    ? (sub.cardCompany || '카드') + (sub.cardNumber ? ' ' + sub.cardNumber : '')
    : '등록된 카드';
  const couponLine = sub.tier === 'unlimited'
    ? '무제한 사용 가능'
    : (coupon ? (coupon.remaining || 0) + ' / ' + (coupon.granted || 50) + '회 남음' : '0회');

  let actionBtn = '';
  let pastDueBanner = '';
  if (sub.status === 'active') {
    actionBtn = '<button onclick="cancelSubscription()" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:13px;cursor:pointer;">구독 해지</button>';
  } else if (sub.status === 'past_due') {
    actionBtn = '<button onclick="switchTab(\'pricing\')" style="padding:8px 14px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">크레딧 충전하기</button>';
    pastDueBanner = '<div style="background:rgba(217,48,37,.08);border:1px solid rgba(217,48,37,.3);border-radius:10px;padding:12px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="22" height="22" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      +'<div style="font-size:13px;color:var(--text);"><strong style="color:var(--red);">정기 결제를 완료하지 못했어요.</strong> 신규·재개 신청은 준비 중이에요. 현재는 크레딧을 충전해 이용해 주세요.</div>'
      +'</div>';
  } else {
    actionBtn = '<button onclick="switchTab(\'pricing\')" style="padding:8px 14px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:13px;cursor:pointer;">크레딧 충전하기</button>';
  }

  el.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;">'
    + pastDueBanner
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
    +'<div style="font-size:15px;font-weight:700;">정기 구독 관리</div>'
    +actionBtn
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:13px;">'
    +'<div style="color:var(--text3);">상품</div><div style="color:var(--text);font-weight:600;">'+escapeHtml(tierLabels[sub.tier] || '상품 확인 필요')+'</div>'
    +'<div style="color:var(--text3);">상태</div><div style="color:'+(sub.status==='past_due'?'var(--red)':'var(--text)')+';">'+escapeHtml(statusLabel)+'</div>'
    +'<div style="color:var(--text3);">다음 결제일</div><div style="color:var(--text);">'+escapeHtml(nextDate)+'</div>'
    +'<div style="color:var(--text3);">결제 금액</div><div style="color:var(--text);">'+(tierPrices[sub.tier] ? tierPrices[sub.tier].toLocaleString()+'원/월' : '확인 필요')+'</div>'
    +'<div style="color:var(--text3);">결제 카드</div><div style="color:var(--text);">'+escapeHtml(cardLine)+'</div>'
    +'<div style="color:var(--text3);">이번 사이클 쿠폰</div><div style="color:var(--text);">'+escapeHtml(couponLine)+'</div>'
    +'</div></div>';
};

window.cancelSubscription = async function() {
  if (!window.CU) return;
  const ok = window.gpConfirm
    ? await window.gpConfirm({ title: '구독을 해지할까요?', message: '다음 결제일까지는 계속 사용할 수 있습니다.', confirmText: '해지하기', danger: true })
    : confirm('정말 구독을 해지하시겠어요? 다음 결제일까지는 계속 사용할 수 있습니다.');
  if (!ok) return;
  try {
    const idToken = await window.CU.getIdToken();
    const res = await fetch(window.apiUrl('/subscription/cancel'), {
      method: 'POST', headers: bearerJsonHeaders(idToken),
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.ok) {
      alert(data.message || '해지가 완료되었습니다.');
      if (window.SUB) window.SUB.status = 'cancelled';
      await window.loadMyPage();
    } else {
      alert(data.error || '해지 실패');
    }
  } catch(e) { alert('네트워크 오류: ' + e.message); }
};

function notifCreatedMs(n) {
 const created = n && n.createdAt;
 if (created && typeof created.toMillis === 'function') return created.toMillis();
 if (created && typeof created.toDate === 'function') return created.toDate().getTime();
 if (created && created._seconds) return created._seconds * 1000;
 return Number(n && n.createdAtMs) || 0;
}

function notifFromDoc(d) {
 const n = d.data() || {};
 return {
  id: d.id,
  clientId: n.clientId || d.id,
  source: 'remote',
  type: n.type || (n.postId ? 'comment' : 'notice'),
  title: n.title || (n.postId ? '커뮤니티 댓글' : '알림'),
  message: n.message || '',
  read: !!n.read,
  createdAt: notifCreatedMs(n),
  action: n.action || null,
  postId: n.postId || null
 };
}

window.persistUserNotification = async (n) =>{
 if (!CU || !n) return;
 try {
  await postAuthedJson('/notifications/create-self', {
   clientId: String(n.clientId || n.id || ''),
   type: String(n.type || ''),
   message: String(n.message || ''),
   action: n.action && n.action.tab ? { tab: String(n.action.tab) } : null
  });
  if (typeof window.updateNotifBadge === 'function') await window.updateNotifBadge(CU.uid);
 } catch(e) { console.log('알림 저장 오류:', e); }
};

window.loadNotifications = async () =>{
 if (!CU) {
  if (window.gpSetRemoteNotifications) window.gpSetRemoteNotifications([]);
  return;
 }
 const el = document.getElementById('notifList');
 try {
 const snap = await getDocs(query(collection(db,'users',CU.uid,'notifications'),orderBy('createdAt','desc')));
 const items = snap.docs.map(notifFromDoc);
 if (window.gpSetRemoteNotifications) window.gpSetRemoteNotifications(items);
 if (!el) return;
 if (!items.length) { el.innerHTML='<div style="text-align:center;padding:24px;color:var(--text3)">새 알림이 없어요</div>'; return; }
 const renderNotif = n=>{
 const date=n.createdAt?new Date(n.createdAt).toLocaleDateString('ko-KR'):'';
 const borderColor = n.read ? 'var(--border)' : 'var(--blue)';
 const fontWeight = n.read ? '400' : '600';
 const requestedTab = n.action && n.action.tab ? String(n.action.tab) : '';
 const action = !n.postId && requestedTab && requestedTab !== 'community'
  ? "switchTab('"+jsAttr(requestedTab)+"')"
  : "";
 return '<div style="background:var(--surface);border:1px solid '+borderColor+';border-radius:var(--rs);padding:14px;margin-bottom:8px;cursor:pointer;" onclick="markRead(\''+jsAttr(n.id)+'\');'+action+'">'
 +'<div style="font-size:13px;font-weight:'+fontWeight+';">'+escapeHtml(n.message)+'</div>'
 +'<div style="font-size:12px;color:var(--text3);margin-top:4px;">'+date+'</div></div>';
 };
 // markRead가 재렌더해도 펼침 상태(_notifShowAll)는 유지된다
 const showAll = window._notifShowAll === true;
 let html = (showAll ? items : items.slice(0,10)).map(renderNotif).join('');
 if (items.length > 10) {
  html += showAll
   ? '<button type="button" class="gp-more-btn" onclick="window._notifShowAll=false;loadNotifications()">접기</button>'
   : '<button type="button" class="gp-more-btn" onclick="window._notifShowAll=true;loadNotifications()">더보기 ('+(items.length-10)+'건)</button>';
 }
 el.innerHTML = html;
 } catch(e) {
  if (el) el.innerHTML='<div style="color:var(--red)">작업 내용을 불러오지 못했어요.</div>';
 }
};

window.markRead = async (notifId) =>{
 if (!CU || !notifId) return;
 await updateDoc(doc(db,'users',CU.uid,'notifications',notifId),{read:true});
 if (typeof window.loadNotifications === 'function') await window.loadNotifications();
};

window.sendNotification = async (postId, postAuthorId, commenterName, postTitle) =>{
 if (blockClosedCommunity({ quiet: true })) return;
 if (!postAuthorId || postAuthorId === CU.uid) return;
 try {
 await addDoc(collection(db,'users',postAuthorId,'notifications'),{
 type: 'comment',
 title: '새 댓글',
 message: commenterName + '님이 내 글에 댓글을 달았어요',
 action: { type: 'post', postId },
 postId, read: false, createdAt: serverTimestamp(), createdAtMs: Date.now()
 });
 updateNotifBadge(postAuthorId);
 } catch(e) { console.log('알림 오류:', e); }
};

window.updateNotifBadge = async (uid) =>{
 if (!CU || CU.uid !== uid) return;
 try {
 const snap = await getDocs(query(collection(db,'users',CU.uid,'notifications')));
 const items = snap.docs.map(notifFromDoc);
 if (window.gpSetRemoteNotifications) window.gpSetRemoteNotifications(items);
 else {
  let unread = 0;
  snap.forEach(d=>{ if(!d.data().read) unread++; });
  const badge = document.getElementById('notifBadge');
  if (badge) { badge.textContent = unread >0 ? unread : ''; badge.style.display = unread >0 ? 'inline-flex' : 'none'; }
 }
 } catch(e) {}
};

window.toggleLike = async (postId) =>{
 if (blockClosedCommunity()) return;
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const ref = doc(db,'posts',postId);
 const snap = await getDoc(ref);
 const likes = snap.data().likes || [];
 const liked = likes.includes(CU.uid);
 await updateDoc(ref, { likes: liked ? arrayRemove(CU.uid) : arrayUnion(CU.uid) });
 const btn = document.getElementById('likeBtn');
 if (btn) {
 const newCount = liked ? likes.length-1 : likes.length+1;
 btn.innerHTML = (liked ? '' : '') + ' ' + newCount;
 btn.className = liked ? 'like-btn' : 'like-btn liked';
 }
};

window.toggleReplyForm = (commentId) =>{
 if (blockClosedCommunity()) return;
 const f = document.getElementById('replyForm_' + commentId);
 if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.submitReply = async (postId, commentId, parentAuthorName) =>{
 if (blockClosedCommunity()) return;
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const bodyEl = document.getElementById('reply_' + commentId);
 const body = bodyEl ? bodyEl.value.trim() : '';
 if (!body) { alert('답글 내용을 입력해 주세요.'); return; }
 const anonEl = document.getElementById('replyAnon_' + commentId);
 const anon = anonEl ? anonEl.checked : false;
 let authorName = window.getAdminName() || CU.displayName;
 if (anon) {
 const prevSnap = await getDocs(query(collection(db,'posts',postId,'comments'),orderBy('createdAt','asc')));
 const anonMap = {}; let anonCount = 0;
 prevSnap.forEach(c =>{
 const cd = c.data();
 if (cd.isAnon && cd.authorId) { if (!anonMap[cd.authorId]) { anonCount++; anonMap[cd.authorId]=anonCount; } }
 });
 authorName = anonMap[CU.uid] ? '익명'+anonMap[CU.uid] : '익명'+(anonCount+1);
 }
 try {
 await addDoc(collection(db,'posts',postId,'comments'), {
 body: '@'+parentAuthorName+' '+body,
 authorId: CU.uid, authorName, isAnon: anon,
 parentCommentId: commentId, isReply: true,
 createdAt: serverTimestamp()
 });
 if (window.gpTrack) window.gpTrack('comment_reply_create', { post_id: postId, parent_comment_id: commentId, is_anon: anon });
 await updateDoc(doc(db,'posts',postId), {commentCount: increment(1)});
 const psnap = await getDoc(doc(db,'posts',postId));
 if (psnap.exists()) await window.sendNotification(postId, psnap.data().authorId, authorName, psnap.data().title);
 document.getElementById('replyForm_'+commentId).style.display = 'none';
 await window.viewPost(postId);
 } catch(e) { alert('답글 등록 실패: '+e.message); }
};

// ===== HISTORY =====
// 이용 기록 저장(2026-06-14 강화) — 실패를 조용히 삼키지 않고:
//   ① localStorage 백업(결과 유실 방지) ② 사용자에게 토스트 안내 ③ 다음 로드·온라인 복귀 시 자동 재시도.
//   (서버측 /analyze 저장과 별개의 클라 폴백 — 청크·구형서버·비과금 경로 대비.)
const PENDING_HISTORY_KEY = 'gp_pending_history';
function legacyHistoryRequestId(uid, item) {
 const seed = `${uid}|${Number(item?.ts) || 0}|${JSON.stringify(item?.data || {})}`;
 let hash = 2166136261;
 for (let i = 0; i < seed.length; i++) {
  hash ^= seed.charCodeAt(i);
  hash = Math.imul(hash, 16777619);
 }
 return `legacy_${Number(item?.ts) || 0}_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function backupHistoryLocal(uid, data, requestId) {
 try {
  const q = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]');
  q.push({ uid, data, requestId, ts: Date.now() });
  while (q.length > 50) q.shift();        // 적체 상한
  localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify(q));
 } catch (e) { /* localStorage 불가·용량 초과 — 백업 생략(토스트는 이미 안내) */ }
}
window.flushPendingHistory = async function flushPendingHistory() {
 if (!CU || !db) return;
 let q;
 try { q = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]'); } catch (e) { return; }
 if (!q.length) return;
 const remaining = [];
 let restored = 0;
 for (const item of q) {
  if (!item || item.uid !== CU.uid) { if (item) remaining.push(item); continue; }   // 다른 계정 항목은 보존
  try {
   const requestId = item.requestId || legacyHistoryRequestId(CU.uid, item);
   await postAuthedJson('/history/backup', {
    requestId,
    entry: { ...(item.data || {}), backupAtMs: Number(item.ts) || Date.now() }
   });
   restored++;
  } catch (e) { remaining.push(item); }   // 여전히 실패 → 다음 기회에
 }
 try { localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify(remaining)); } catch (e) {}
 if (restored > 0) {
  if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory();
  if (window.gpToast) window.gpToast(`저장하지 못했던 기록 ${restored}건을 복구했어요.`, { type: 'success' });
 }
};
window.addEventListener('online', () => { try { window.flushPendingHistory(); } catch (e) {} });

window.saveHistory = async (type, inputText, detectResult, humanResult, credits) =>{
 if (!CU) return false;
 const requestId = newClientRequestId('history');
 const data = {
  type: type || 'unknown',
  inputText: inputText || '',
  credits: typeof credits === 'number' ? credits : 0
 };
 if (detectResult) {
  data.probability = typeof detectResult.probability === 'number' ? detectResult.probability : null;
  if (typeof detectResult.rawProbability === 'number') data.rawProbability = detectResult.rawProbability;
  if (detectResult.probabilityCalibration) data.probabilityCalibration = detectResult.probabilityCalibration;
  data.summary = detectResult.summary || '';
  data.detail = detectResult.detail || '';
 }
  if (humanResult) {
   data.outputText = humanResult.outputText || '';
   data.humanSummary = humanResult.summary || '';
   data.humanDetail = humanResult.detail || '';
   if (['charged', 'plan_unlimited', 'admin_no_charge'].includes(humanResult.billingDisposition)) {
    data.billingDisposition = humanResult.billingDisposition;
   }
   if (humanResult.qualityStatus === 'needs_review' || humanResult.qualityStatus === 'clean') data.qualityStatus = humanResult.qualityStatus;
   if (Array.isArray(humanResult.qualityWarnings)) data.qualityWarningCodes = humanResult.qualityWarnings.map(item => item?.code).filter(Boolean).slice(0, 20);
 }
 try {
  await postAuthedJson('/history/backup', { requestId, entry: data });
  return true;
 } catch(e) {
  console.error('[saveHistory] 실패', { code: e?.code, message: e?.message, name: e?.name });
  backupHistoryLocal(CU.uid, data, requestId);   // 결과 유실 방지 — 같은 requestId로 멱등 재시도
  if (window.gpToast) window.gpToast('결과를 기록에 저장하지 못했어요. 결과는 안전하게 백업해뒀고, 잠시 후 자동으로 다시 저장할게요.', { type: 'warning', title: '기록 저장 지연' });
  return false;
 }
};

function historyBillingInfo(disposition, credits) {
 const chargedCredits = Math.max(0, Number(credits) || 0).toLocaleString('ko-KR');
 const values = {
  charged: { short: `${chargedCredits}크레딧 사용`, badge: '사용 완료', waived: false },
  waived_quality_shortfall: { short: '무차감', badge: '무차감', waived: true },
  waived_repeat_low_benefit: { short: '무차감', badge: '무차감', waived: true },
  plan_unlimited: { short: '이용권 포함', badge: '이용권 포함', waived: true },
  admin_no_charge: { short: '무차감', badge: '무차감', waived: true }
 };
 if (values[disposition]) return values[disposition];
 return Number(credits) > 0
  ? { short: `${chargedCredits}크레딧 사용`, badge: '', waived: false }
  : { short: '무차감', badge: '', waived: true };
}

const HISTORY_PAGE_SIZE = 50;
const historyState = {
 userId: '',
 items: [],
 cursor: null,
 hasMore: false,
 loading: false,
 initialized: false,
 filter: 'all',
 search: '',
 selectedId: '',
 missingId: '',
 error: ''
};
window._historyState = historyState;

function historyTimestampMs(value) {
 if (!value) return 0;
 if (typeof value.toMillis === 'function') return value.toMillis();
 if (typeof value.toDate === 'function') return value.toDate().getTime();
 if (Number.isFinite(value._seconds)) return value._seconds * 1000;
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) ? parsed : 0;
}

function historyNormalizeDoc(snapshot) {
 const data = snapshot.data() || {};
 return { id: snapshot.id, ...data, createdAtMs: historyTimestampMs(data.createdAt) || Number(data.backupAtMs) || 0 };
}

function historyCleanLine(value) {
 return String(value || '').replace(/\s+/gu, ' ').trim();
}

function historyTruncate(value, max) {
 const text = historyCleanLine(value);
 return text.length > max ? text.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : text;
}

function historyTitle(item) {
 const firstLine = String(item.inputText || '').split(/\r?\n/u).map(historyCleanLine).find(Boolean) || '';
 return historyTruncate(firstLine, 42) || (item.type === 'detect' ? 'AI 감지 기록' : '휴머나이징 기록');
}

function historyPreview(item) {
 const source = item.type === 'detect'
  ? item.inputText
  : (item.outputText || item.inputText);
 return historyTruncate(source, 92) || '저장된 본문이 없어요.';
}

function historyDetectView(item) {
 return item.type === 'detect' && typeof window.gpNormalizeDetectPresentation === 'function'
  ? window.gpNormalizeDetectPresentation(item)
  : item;
}

function historyProbability(item) {
 const value = Number(historyDetectView(item).probability);
 return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null;
}

function historyWorkStatus(item) {
 if (item.type === 'detect') {
  const probability = historyProbability(item);
  if (probability == null) return { label: '분석 완료', tone: 'neutral' };
  if (probability <= 20) return { label: `AI 생성 가능성 낮음 · ${probability}%`, tone: 'good' };
  if (probability <= 49) return { label: `AI 생성 가능성 보통 · ${probability}%`, tone: 'notice' };
  return { label: `AI 생성 가능성 높음 · ${probability}%`, tone: 'warn' };
 }
 // qualityStatus는 운영 품질 확인용 메타데이터다. 사용자 기록에는 내부 판정명을 노출하지 않는다.
 return { label: '작업 완료', tone: 'good' };
}

function historyDateText(ms) {
 if (!ms) return '날짜 정보 없음';
 const date = new Date(ms);
 const today = new Date();
 const sameYear = date.getFullYear() === today.getFullYear();
 const sameDay = sameYear && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
 const options = sameDay
  ? { hour: 'numeric', minute: '2-digit' }
  : { ...(sameYear ? {} : { year: 'numeric' }), month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
 return date.toLocaleString('ko-KR', options);
}

function historyDateGroup(ms) {
 if (!ms) return '날짜 미상';
 const date = new Date(ms);
 const now = new Date();
 const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
 const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
 const diff = Math.round((start - target) / 86400000);
 if (diff === 0) return '오늘';
 if (diff === 1) return '어제';
 if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}월 ${date.getDate()}일`;
 return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function historyRequestedId() {
 try {
  const id = new URLSearchParams(window.location.search || '').get('item') || '';
  return /^[A-Za-z0-9_-]{1,128}$/u.test(id) ? id : '';
 } catch (_) { return ''; }
}

function historySetRoute(id, mode) {
 const url = new URL(window.location.href);
 url.pathname = '/history';
 url.searchParams.delete('mode');
 if (id) url.searchParams.set('item', id);
 else url.searchParams.delete('item');
 const state = { ...(window.history.state || {}), tab: 'history', historyId: id || '' };
 window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', url.pathname + url.search + url.hash);
}

function historyVisibleItems() {
 const queryText = historyState.search.toLocaleLowerCase('ko-KR');
 return historyState.items.filter(item => {
  if (historyState.filter === 'detect' && item.type !== 'detect') return false;
  if (historyState.filter === 'humanize' && item.type === 'detect') return false;
  if (!queryText) return true;
  const searchableFields = item.type === 'detect'
   ? [item.inputText, item.summary, item.detail]
   : [item.inputText, item.outputText];
  const haystack = searchableFields
   .map(historyCleanLine).join(' ').toLocaleLowerCase('ko-KR');
  return haystack.includes(queryText);
 });
}

function historyIsMobile() {
 return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}

function historyStateMessage(kind, title, message, actionLabel, action) {
 const icon = kind === 'error' ? '!' : kind === 'login' ? '↗' : '＋';
 return `<div class="gp-history-state gp-history-state-${kind}">
  <span class="gp-history-state-icon" aria-hidden="true">${icon}</span>
  <strong>${escapeHtml(title)}</strong>
  <p>${escapeHtml(message)}</p>
  ${actionLabel ? `<button type="button" onclick="${action}()">${escapeHtml(actionLabel)}</button>` : ''}
 </div>`;
}

function historyLoadingHtml() {
 return `<div class="gp-history-skeleton" aria-hidden="true">${Array.from({ length: 5 }, () =>
  '<span><i></i><b></b><em></em></span>').join('')}</div>`;
}

function historyRenderList() {
 const list = document.getElementById('historyList');
 const more = document.getElementById('historyMore');
 const count = document.getElementById('historyCount');
 const status = document.getElementById('historyStatus');
 if (!list) return;
 list.setAttribute('aria-busy', historyState.loading && !historyState.initialized ? 'true' : 'false');
 if (historyState.loading && !historyState.initialized) {
  list.innerHTML = historyLoadingHtml();
  if (count) count.textContent = '기록 불러오는 중';
  if (more) more.hidden = true;
  return;
 }
 if (historyState.error && !historyState.initialized) {
  list.innerHTML = historyStateMessage('error', '기록을 불러오지 못했어요', '네트워크 상태를 확인한 뒤 다시 시도해 주세요.', '다시 시도', 'historyRetry');
  if (count) count.textContent = '불러오기 실패';
  if (more) more.hidden = true;
  return;
 }
 if (!CU) {
  list.innerHTML = historyStateMessage('login', '로그인이 필요해요', '로그인하면 이전 결과를 안전하게 다시 열 수 있어요.', '로그인하기', 'historyLogin');
  if (count) count.textContent = '로그인 필요';
  if (more) more.hidden = true;
  return;
 }
 const visible = historyVisibleItems();
 if (!visible.length) {
  const narrowed = !!historyState.search || historyState.filter !== 'all';
  list.innerHTML = narrowed
   ? historyStateMessage('empty', '일치하는 기록이 없어요', historyState.hasMore ? '현재 불러온 기록에는 없어요. 이전 기록을 더 불러오거나 조건을 지워보세요.' : '검색어나 작업 유형을 바꿔보세요.', '조건 지우기', 'historyClearFilters')
   : historyStateMessage('empty', '아직 작업 기록이 없어요', 'AI 감지나 휴머나이징을 완료하면 이곳에서 다시 활용할 수 있어요.', '새 글 시작', 'historyStartNew');
 } else {
  const groups = [];
  visible.forEach(item => {
   const label = historyDateGroup(item.createdAtMs);
   let group = groups[groups.length - 1];
   if (!group || group.label !== label) {
    group = { label, items: [] };
    groups.push(group);
   }
   group.items.push(item);
  });
  list.innerHTML = groups.map((group, groupIndex) => {
   const headingId = `historyGroup${groupIndex}`;
   return `<section class="gp-history-group" aria-labelledby="${headingId}">
    <h2 id="${headingId}">${escapeHtml(group.label)}</h2>
    <div role="list">${group.items.map(item => {
     const isDetect = item.type === 'detect';
     const work = historyWorkStatus(item);
     const billing = historyBillingInfo(item.billingDisposition, item.credits);
     const selected = historyState.selectedId === item.id;
     return `<div role="listitem" class="gp-history-row-wrap">
      <button type="button" class="gp-history-row${selected ? ' is-selected' : ''}" data-history-id="${escapeHtml(item.id)}" aria-expanded="${selected ? 'true' : 'false'}" aria-controls="historyDetailPanel" onclick="historySelect(this.dataset.historyId)">
       <span class="gp-history-row-top"><span class="gp-history-kind ${isDetect ? 'detect' : 'humanize'}">${isDetect ? 'AI 감지' : '휴머나이징'}</span><time>${escapeHtml(historyDateText(item.createdAtMs))}</time></span>
       <strong>${escapeHtml(historyTitle(item))}</strong>
       <span class="gp-history-row-preview">${escapeHtml(historyPreview(item))}</span>
       <span class="gp-history-row-meta"><span class="gp-history-work ${work.tone}">${escapeHtml(work.label)}</span><span class="gp-history-billing">${escapeHtml(billing.short)}</span></span>
      </button>
     </div>`;
    }).join('')}</div>
   </section>`;
  }).join('');
 }
 const loadedLabel = historyState.hasMore ? `${historyState.items.length}건 이상` : `${historyState.items.length}건`;
 if (count) count.textContent = historyState.search || historyState.filter !== 'all' ? `${visible.length}건 표시 · ${loadedLabel} 불러옴` : loadedLabel;
 if (status) status.textContent = `작업 기록 ${visible.length}건이 표시됐어요.`;
 if (more) {
  more.hidden = !historyState.hasMore;
  more.disabled = historyState.loading;
  more.textContent = historyState.loading ? '불러오는 중…' : '이전 기록 더 보기';
 }
}

function historyDetailBlock(title, text, featured) {
 if (!historyCleanLine(text)) return '';
 return `<section class="gp-history-text-block${featured ? ' featured' : ''}">
  <h3>${escapeHtml(title)}</h3>
  <div class="gp-history-text">${escapeHtml(text)}</div>
 </section>`;
}

function historyRenderDetail() {
 const panel = document.getElementById('historyDetailPanel');
 const workspace = document.getElementById('historyWorkspace');
 const content = document.getElementById('historyContent');
 if (!panel || !workspace) return;
 const item = historyState.items.find(entry => entry.id === historyState.selectedId);
 const detailOpen = !!historyState.selectedId;
 workspace.classList.toggle('is-detail-open', detailOpen);
 if (content) content.classList.toggle('history-detail-open', detailOpen);
 if (!item) {
  panel.innerHTML = historyState.missingId
   ? historyStateMessage('error', '기록을 찾을 수 없어요', '삭제되었거나 현재 계정에서 열 수 없는 기록이에요.', '목록으로 돌아가기', 'historyCloseDetail')
   : `<div class="gp-history-detail-empty">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>
      <strong>기록을 선택해 주세요</strong>
      <p>결과와 원문을 확인하고 복사·다운로드·이어쓰기까지 할 수 있어요.</p>
     </div>`;
  return;
 }
 const isDetect = item.type === 'detect';
 const view = historyDetectView(item);
 const work = historyWorkStatus(item);
 const billing = historyBillingInfo(item.billingDisposition, item.credits);
 const probability = historyProbability(item);
 const hasOutput = !!historyCleanLine(item.outputText);
 const details = isDetect
  ? `${historyDetailBlock('분석 요약', view.summary, true)}${historyDetailBlock('상세 분석', view.detail, false)}`
  : historyDetailBlock('휴머나이징 결과', item.outputText, true);
 const originalBlock = historyDetailBlock('원문', item.inputText, false);
 const noDetail = '<p class="gp-history-no-detail">저장된 상세 결과가 없어요.</p>';
 const contentBlocks = isDetect
  ? `${originalBlock}${details || noDetail}`
  : `${details || noDetail}${originalBlock}`;
 const actions = isDetect
  ? `<button type="button" class="primary" onclick="historyContinueHumanize()">휴머나이징으로 이어서</button>
     <button type="button" onclick="historyRunAgain('detect')">다시 감지</button>
     <button type="button" onclick="historyCopy('input')">원문 복사</button>`
  : `<button type="button" class="primary" onclick="historyCopy('output')"${hasOutput ? '' : ' disabled'}>결과 복사</button>
     <button type="button" onclick="historyDownload()"${hasOutput ? '' : ' disabled'}>다운로드</button>
     <button type="button" onclick="historyRunAgain('humanize')"${hasOutput ? '' : ' disabled'}>편집기로 열기</button>`;
 panel.innerHTML = `<article class="gp-history-detail">
  <header class="gp-history-detail-head">
   <button type="button" class="gp-history-back" onclick="historyCloseDetail()" aria-label="작업 기록 목록으로 돌아가기"><span aria-hidden="true">←</span> 목록</button>
   <div class="gp-history-detail-kicker"><span class="gp-history-kind ${isDetect ? 'detect' : 'humanize'}">${isDetect ? 'AI 감지' : '휴머나이징'}</span><time>${escapeHtml(historyDateText(item.createdAtMs))}</time></div>
   <h2>${escapeHtml(historyTitle(item))}</h2>
   <div class="gp-history-detail-meta">
    <span><small>작업 상태</small><b class="${work.tone}">${escapeHtml(work.label)}${isDetect && probability != null ? ' (추정)' : ''}</b></span>
    <span><small>이용 내역</small><b>${escapeHtml(billing.short)}</b></span>
   </div>
  </header>
  <div class="gp-history-detail-body">
   ${contentBlocks}
  </div>
  <footer class="gp-history-actions" aria-label="이 기록으로 할 수 있는 작업">${actions}</footer>
 </article>`;
}

function historyRender() {
 const visible = historyVisibleItems();
 if (historyState.selectedId && !historyState.missingId && !visible.some(item => item.id === historyState.selectedId)) {
  historyState.selectedId = '';
 }
 if (!historyState.selectedId && !historyIsMobile() && visible.length) historyState.selectedId = visible[0].id;
 historyRenderList();
 historyRenderDetail();
}

async function historyFetchPage(reset) {
 if (historyState.loading || !CU) return;
 historyState.loading = true;
 historyState.error = '';
 if (reset) {
  historyState.items = [];
  historyState.cursor = null;
  historyState.hasMore = false;
  historyState.initialized = false;
 }
 historyRenderList();
 try {
  const constraints = [orderBy('createdAt', 'desc')];
  if (!reset && historyState.cursor) constraints.push(startAfter(historyState.cursor));
  constraints.push(limit(HISTORY_PAGE_SIZE + 1));
  const snap = await getDocs(query(collection(db, 'users', CU.uid, 'history'), ...constraints));
  const pageDocs = snap.docs.slice(0, HISTORY_PAGE_SIZE);
  const known = new Set(historyState.items.map(item => item.id));
  pageDocs.forEach(snapshot => { if (!known.has(snapshot.id)) historyState.items.push(historyNormalizeDoc(snapshot)); });
  historyState.items.sort((a, b) => b.createdAtMs - a.createdAtMs);
  historyState.cursor = pageDocs.length ? pageDocs[pageDocs.length - 1] : historyState.cursor;
  historyState.hasMore = snap.docs.length > HISTORY_PAGE_SIZE;
  historyState.initialized = true;
 } catch (error) {
  console.warn('[history] 목록 불러오기 실패', error?.code || error?.message || error);
  historyState.error = 'load_failed';
 } finally {
  historyState.loading = false;
 }
}

async function historyEnsureItem(id) {
 if (!id || historyState.items.some(item => item.id === id) || !CU) return;
 try {
  const snapshot = await getDoc(doc(db, 'users', CU.uid, 'history', id));
  if (!snapshot.exists()) {
   historyState.missingId = id;
   return;
  }
  historyState.items.push(historyNormalizeDoc(snapshot));
  historyState.items.sort((a, b) => b.createdAtMs - a.createdAtMs);
 } catch (error) {
  console.warn('[history] 상세 기록 불러오기 실패', error?.code || error?.message || error);
  historyState.missingId = id;
 }
}

window.loadHistory = async function (options) {
 const list = document.getElementById('historyList');
 if (!list) return;
 options = options || {};
 if (!CU) {
  historyState.userId = '';
  historyState.items = [];
  historyState.initialized = false;
  historyState.selectedId = '';
  historyRender();
  return;
 }
 const userChanged = historyState.userId !== CU.uid;
 if (userChanged) {
  historyState.userId = CU.uid;
  historyState.filter = 'all';
  historyState.search = '';
  historyState.selectedId = '';
  historyState.missingId = '';
  const search = document.getElementById('historySearch');
  if (search) search.value = '';
 }
 if (userChanged || options.force || !historyState.initialized) await historyFetchPage(true);
 const requestedId = options.itemId || historyRequestedId();
 historyState.missingId = '';
 if (requestedId) {
  await historyEnsureItem(requestedId);
  historyState.selectedId = requestedId;
 } else if (historyIsMobile()) {
  historyState.selectedId = '';
 }
 historyRender();
};

window.historyLoadMore = async function () {
 if (!historyState.hasMore || historyState.loading) return;
 await historyFetchPage(false);
 historyRender();
};

window.historySelect = async function (id, options) {
 if (!/^[A-Za-z0-9_-]{1,128}$/u.test(String(id || ''))) return;
 options = options || {};
 historyState.missingId = '';
 await historyEnsureItem(id);
 historyState.selectedId = id;
 if (options.updateUrl !== false) historySetRoute(id, options.replaceUrl ? 'replace' : 'push');
 historyRender();
 if (options.focus !== false) {
  const panel = document.getElementById('historyDetailPanel');
  if (panel) requestAnimationFrame(() => panel.focus({ preventScroll: !historyIsMobile() }));
 }
};

window.openHistoryRecord = function (id) {
 if (!/^[A-Za-z0-9_-]{1,128}$/u.test(String(id || ''))) return;
 if (typeof window.switchTab === 'function') window.switchTab('history', { skipRoute: true });
 historySetRoute(id, 'push');
 window.loadHistory({ itemId: id });
};

window.openHistoryHome = function () {
 historySetRoute('', 'replace');
 historyState.selectedId = '';
 historyState.missingId = '';
 if (historyState.initialized) historyRender();
 else window.loadHistory();
};

window.historyCloseDetail = function () {
 const previousId = historyState.selectedId;
 historyState.selectedId = '';
 historyState.missingId = '';
 historySetRoute('', 'replace');
 historyRender();
 const row = previousId ? document.querySelector(`[data-history-id="${CSS.escape(previousId)}"]`) : null;
 if (row) requestAnimationFrame(() => row.focus());
};

window.historySetFilter = function (filter) {
 historyState.filter = ['detect', 'humanize'].includes(filter) ? filter : 'all';
 document.querySelectorAll('[data-history-filter]').forEach(button => {
  const active = button.dataset.historyFilter === historyState.filter;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
 });
 historyState.missingId = '';
 historyRender();
};

window.historySearchInput = function (value) {
 historyState.search = historyCleanLine(value);
 historyState.missingId = '';
 historyRender();
};

window.historyClearFilters = function () {
 historyState.search = '';
 historyState.filter = 'all';
 const search = document.getElementById('historySearch');
 if (search) search.value = '';
 window.historySetFilter('all');
 if (search) search.focus();
};

window.historyRetry = function () { window.loadHistory({ force: true }); };
window.historyLogin = function () { if (typeof window.showScreen === 'function') window.showScreen('login'); };

function historyComposerText(mode) {
 const item = historyState.items.find(entry => entry.id === historyState.selectedId);
 if (!item) return '';
 return mode === 'humanize' && item.type !== 'detect' ? String(item.outputText || '') : String(item.inputText || '');
}

function historyOpenComposer(mode, text) {
 if (typeof window.lavFlowReset === 'function' && window.lavFlowReset() === false) {
  if (window.gpToast) window.gpToast('진행 중인 작업을 먼저 확인해 주세요.', { type: 'info' });
  return false;
 }
 if (typeof window.switchTab === 'function') window.switchTab('main');
 if (typeof window.lavSetMode === 'function') window.lavSetMode(mode);
 else if (typeof window.gpApplyProductMode === 'function') window.gpApplyProductMode(mode);
 const input = document.getElementById('lavInput');
 const legacyInput = document.getElementById('inputText');
 if (input && text) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (typeof window.lavSyncCount === 'function') window.lavSyncCount(input);
 }
 if (legacyInput && text) {
  legacyInput.value = text;
  if (typeof window.updateCount === 'function') window.updateCount(legacyInput);
 }
 const url = new URL(window.location.href);
 url.searchParams.delete('item');
 window.history.replaceState({ ...(window.history.state || {}), tab: 'main', mode }, '', url.pathname + url.search + url.hash);
 if (input) requestAnimationFrame(() => input.focus());
 return true;
}

window.historyStartNew = function () {
 if (typeof window.lavNewSentence === 'function') window.lavNewSentence();
 else historyOpenComposer('humanize', '');
};
window.historyContinueHumanize = function () {
 const text = historyComposerText('detect');
 if (text && historyOpenComposer('humanize', text)) {
  if (typeof window.gpTrackProductModeOpen === 'function') window.gpTrackProductModeOpen('humanize', 'history', 'history_detail', 'detect');
  if (window.gpTrack) window.gpTrack('history_reuse', { action: 'continue_humanize', source_type: 'detect' });
 }
};
window.historyRunAgain = function (mode) {
 const text = historyComposerText(mode);
 if (text && historyOpenComposer(mode, text) && window.gpTrack) window.gpTrack('history_reuse', { action: mode === 'detect' ? 'detect_again' : 'edit_output', source_type: mode });
};

async function historyWriteClipboard(text) {
 if (!text) return false;
 try {
  if (navigator.clipboard && window.isSecureContext) {
   await navigator.clipboard.writeText(text);
   return true;
  }
 } catch (_) {}
 const area = document.createElement('textarea');
 area.value = text;
 area.setAttribute('readonly', '');
 area.style.position = 'fixed';
 area.style.opacity = '0';
 document.body.appendChild(area);
 area.select();
 let copied = false;
 try { copied = document.execCommand('copy'); } catch (_) {}
 area.remove();
 return copied;
}

window.historyCopy = async function (target) {
 const item = historyState.items.find(entry => entry.id === historyState.selectedId);
 const text = item ? (target === 'output' ? item.outputText : item.inputText) : '';
 const copied = await historyWriteClipboard(String(text || ''));
 if (window.gpToast) window.gpToast(copied ? '클립보드에 복사했어요.' : '복사하지 못했어요. 다시 시도해 주세요.', { type: copied ? 'success' : 'error' });
 if (copied && window.gpTrack) window.gpTrack('history_reuse', { action: target === 'output' ? 'copy_output' : 'copy_input', source_type: item?.type || 'unknown' });
};

window.historyDownload = function () {
 const item = historyState.items.find(entry => entry.id === historyState.selectedId);
 const text = String(item?.outputText || '');
 if (!text) return;
 const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
 const href = URL.createObjectURL(blob);
 const link = document.createElement('a');
 const safeTitle = historyTitle(item).replace(/[\\/:*?"<>|]/gu, '').slice(0, 32) || '휴머나이징-결과';
 link.href = href;
 link.download = `${safeTitle}.txt`;
 document.body.appendChild(link);
 link.click();
 link.remove();
 setTimeout(() => URL.revokeObjectURL(href), 0);
 if (window.gpToast) window.gpToast('결과를 텍스트 파일로 저장했어요.', { type: 'success' });
 if (window.gpTrack) window.gpTrack('history_reuse', { action: 'download_output', source_type: item.type || 'humanize' });
};

// --- 환불 시스템 UI ---

// 사용자: 결제 내역 + 환불 요청 버튼
// 정기결제 티어 표시명
const SUB_TIER_LABELS = { '1000':'베이직(1,000자×50회/월)', '5000':'스탠다드(5,000자×50회/월)', '10000':'프로(10,000자×50회/월)', 'unlimited':'무제한' };
const REFUND_POLICY_VERSION = 'credit-grant-base-v1';
const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const UNLIMITED_REFUND_SETTLEMENT_USES = 50;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function gpTimestampMs(value) {
 if (!value) return 0;
 if (typeof value.toMillis === 'function') return value.toMillis();
 if (typeof value.toDate === 'function') return value.toDate().getTime();
 if (value._seconds) return value._seconds * 1000;
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) ? parsed : 0;
}

function gpOrderPaidAtMs(item) {
 const o = item.data || {};
 return item.kind === 'sub'
  ? gpTimestampMs(o.approvedAt || o.cycleStartedAt || o.requestedAt)
  : gpTimestampMs(o.createdAt || o.approvedAt || o.requestedAt);
}

function gpRefundWindowEndMs(item) {
 const o = item.data || {};
 const explicitEnd = gpTimestampMs(o.refundWindowEndsAt);
 const explicitStart = gpTimestampMs(o.refundWindowStartsAt);
 const contractDeliveredAt = gpTimestampMs(o.contractDocumentDeliveredAt);
 const serviceAvailableAt = gpTimestampMs(o.serviceAvailableAt);
 const contractualStart = Math.max(contractDeliveredAt, serviceAvailableAt);
 const startsAt = explicitStart || contractualStart || gpOrderPaidAtMs(item);
 const storedDays = Math.floor(Number(o.refundWindowDaysAtPurchase));
 const windowDays = Number.isFinite(storedDays) && storedDays > 0 ? storedDays : 7;
 if (!startsAt) return explicitEnd;
 const kstStart = new Date(startsAt + KST_OFFSET_MS);
 const kstDayStartAsUtc = Date.UTC(kstStart.getUTCFullYear(), kstStart.getUTCMonth(), kstStart.getUTCDate());
 const calendarDayEnd = kstDayStartAsUtc + windowDays * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1) - KST_OFFSET_MS;
 return Math.max(explicitEnd, calendarDayEnd);
}

function gpCreditRefundPreview(order, currentCredits) {
 const amount = Math.max(0, Math.floor(Number(order.amount) || 0));
 const balance = Math.max(0, Math.floor(Number(currentCredits) || 0));
 const isBasePolicy = order.creditGrantPolicyVersion === REFUND_POLICY_VERSION
  && Math.floor(Number(order.paidCredits) || 0) > 0;
 if (isBasePolicy) {
  const paidCredits = Math.max(0, Math.floor(Number(order.paidCredits) || 0));
  const packageBonusCredits = Math.max(0, Math.floor(Number(order.packageBonusCredits) || 0));
  const eventBonusCredits = Math.max(0, Math.floor(Number(order.eventBonusCredits) || 0));
  const bonusCredits = Math.max(
   packageBonusCredits + eventBonusCredits,
   Math.floor(Number(order.bonusCredits) || 0)
  );
  const totalGrantedCredits = Math.max(
   paidCredits + bonusCredits,
   Math.floor(Number(order.totalGrantedCredits) || 0)
  );
  const lotPaidRemaining = Number(order.refundPaidCreditsRemaining);
  const lotBonusRemaining = Number(order.refundBonusCreditsRemaining ?? order.refundEventBonusCreditsRemaining);
  const hasOrderLot = Number.isFinite(lotPaidRemaining) && lotPaidRemaining >= 0
   && Number.isFinite(lotBonusRemaining) && lotBonusRemaining >= 0;
  // 새 주문은 서버가 유지하는 주문별 잔여량을 우선한다. 과거 신규 주문처럼 lot 필드가
  // 아직 없는 경우에만 계정 전체 잔액을 주문 지급량으로 cap한 기존 안전 추정을 쓴다.
  const balanceRecoverCredits = Math.min(balance, totalGrantedCredits);
  const balanceUsedCredits = Math.max(0, totalGrantedCredits - balanceRecoverCredits);
  const refundablePaidCredits = hasOrderLot
   ? Math.min(paidCredits, Math.floor(lotPaidRemaining))
   : Math.max(0, paidCredits - Math.min(paidCredits, balanceUsedCredits));
  const recoverCredits = hasOrderLot
   ? refundablePaidCredits + Math.min(bonusCredits, Math.floor(lotBonusRemaining))
   : balanceRecoverCredits;
  const usedCredits = Math.max(0, totalGrantedCredits - recoverCredits);
  const paidUsedCredits = Math.max(0, paidCredits - refundablePaidCredits);
  const refundAmount = paidCredits > 0
   ? Math.min(amount, Math.floor(amount * refundablePaidCredits / paidCredits))
   : 0;
  return {
   policy: 'base', refundAmount, recoverCredits, usedCredits, paidUsedCredits,
   refundablePaidCredits, paidCredits, packageBonusCredits, eventBonusCredits, bonusCredits, totalGrantedCredits
  };
 }
 const purchased = Math.max(0, Math.floor(Number(order.safeCredits ?? order.credits) || 0));
 const refundableCredits = Math.min(balance, purchased);
 const usedCredits = Math.max(0, purchased - refundableCredits);
 const refundAmount = purchased > 0 ? Math.min(amount, Math.floor(amount * refundableCredits / purchased)) : 0;
 return {
  policy: 'legacy', refundAmount, recoverCredits: refundableCredits, refundableCredits,
  usedCredits, totalGrantedCredits: purchased
 };
}

function gpSubscriptionRefundPreview(order, coupon) {
 const amount = Math.max(0, Math.floor(Number(order.amount) || 0));
 const grantedValue = Number(coupon?.granted);
 const remainingValue = Number(coupon?.remaining);
 const granted = Number.isFinite(grantedValue) ? Math.floor(grantedValue) : 0;
 const remaining = Number.isFinite(remainingValue) ? Math.floor(remainingValue) : -1;
 const recordedUsed = Math.max(0, Math.floor(Number(coupon?.used) || 0));
 const settlementUses = order.tier === 'unlimited' || granted <= 0 ? UNLIMITED_REFUND_SETTLEMENT_USES : granted;
 const derivedUsed = granted > 0 && remaining >= 0 ? Math.max(0, granted - remaining) : 0;
 const usedCount = Math.min(settlementUses, Math.max(recordedUsed, derivedUsed));
 const refundableUses = Math.max(0, settlementUses - usedCount);
 const refundAmount = settlementUses > 0 ? Math.min(amount, Math.floor(amount * refundableUses / settlementUses)) : 0;
 return { refundAmount, usedCount, refundableUses, settlementUses };
}

// 두 컬렉션의 결제 내역 통합 조회 (크레딧 + 정기결제)
window.fetchAllOrders = async () => {
 const [creditSnap, subSnap] = await Promise.all([
   getDocs(query(collection(db,'orders'), where('uid','==',CU.uid), orderBy('createdAt','desc'))),
   getDocs(query(collection(db,'subscriptionOrders'), where('uid','==',CU.uid), orderBy('approvedAt','desc')))
 ]).catch(async () => {
   // approvedAt 인덱스가 없으면 createdAt 또는 cycleStartedAt fallback
   const c = await getDocs(query(collection(db,'orders'), where('uid','==',CU.uid), orderBy('createdAt','desc')));
   const s = await getDocs(query(collection(db,'subscriptionOrders'), where('uid','==',CU.uid)));
   return [c, s];
 });
 const credit = creditSnap.docs.map(d => ({ id: d.id, kind: 'credit', data: d.data() }));
 const sub = subSnap.docs.map(d => ({ id: d.id, kind: 'sub', data: d.data() }));
 const all = [...credit, ...sub];
 all.sort((a, b) => {
   const at = a.data.createdAt?.toMillis?.() || a.data.approvedAt?.toMillis?.() || a.data.requestedAt?.toMillis?.() || 0;
   const bt = b.data.createdAt?.toMillis?.() || b.data.approvedAt?.toMillis?.() || b.data.requestedAt?.toMillis?.() || 0;
   return bt - at;
 });
 return all;
};

window.loadOrderHistory = async () =>{
 const el = document.getElementById('orderHistoryList');
 if (!el || !CU) return;
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">불러오는 중...</div>';
 try {
 const all = await window.fetchAllOrders();
 if (all.length === 0) {
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">결제 내역이 없어요</div>';
 return;
 }
 const statusMap = { paid:'결제 완료', refund_requested:'환불 심사중', partially_refunded:'부분 환불', refunded:'환불 완료', refund_rejected:'환불 거절', failed:'결제 실패' };
 const orderRows = all.slice(0,30).map(item =>{
 const o = item.data;
 const ts = o.createdAt?.toMillis?.() || o.approvedAt?.toMillis?.() || o.requestedAt?.toMillis?.() || 0;
 const date = ts ? new Date(ts).toLocaleString('ko-KR') : '';
 const statusTxt = statusMap[o.status] || o.status || '결제 완료';
 const statusColor = (o.status === 'refunded' || o.status === 'partially_refunded') ? 'var(--yellow)' : o.status === 'refund_requested' ? 'var(--blue)' : (o.status === 'refund_rejected' || o.status === 'failed') ? 'var(--red)' : 'var(--green)';
 const title = item.kind === 'sub'
   ? `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`
   : `크레딧 충전 · ${Number(o.totalGrantedCredits || o.safeCredits || o.credits || 0).toLocaleString('ko-KR')}크레딧`;
 return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;">
 <div>
 <div style="font-weight:600;color:var(--text);">${(o.amount||0).toLocaleString()}원 · ${title}</div>
 <div style="color:var(--text3);font-size:12px;margin-top:2px;">${date} · 주문번호 ${item.id}</div>
 ${o.cancelReason ? '<div style="color:var(--text3);font-size:11px;margin-top:2px;">사유: '+escapeHtml(o.cancelReason)+'</div>' : ''}
 ${o.rejectReason ? '<div style="color:var(--red);font-size:11px;margin-top:2px;">거절 사유: '+escapeHtml(o.rejectReason)+'</div>' : ''}
 ${o.failReason ? '<div style="color:var(--red);font-size:11px;margin-top:2px;">실패 사유: '+escapeHtml(o.failReason)+'</div>' : ''}
 </div>
 <div style="font-weight:600;color:${statusColor};font-size:12px;">${statusTxt}</div>
</div>`;
 });
 const orderHidden = orderRows.slice(5).join('');
 el.innerHTML = orderRows.slice(0,5).join('')
 + (orderHidden
  ? '<div id="orderHistHidden" style="display:none;">'+orderHidden+'</div>'
   +'<button type="button" class="gp-more-btn" onclick="gpToggleMore(\'orderHistHidden\',this,\'더보기 ('+(orderRows.length-5)+'건)\')">더보기 ('+(orderRows.length-5)+'건)</button>'
  : '');
 } catch(e) {
 console.log('결제 내역 로드 실패:', e);
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">결제 내역이 없어요</div>';
 }
};

// 환불하기 모달 열기
window.showRefundModal = async () =>{
 if (!CU) { alert('로그인이 필요해요.'); return; }
 const modal = document.getElementById('refundModal');
 modal.style.display = 'flex';
 await window.loadRefundModalList();
};

// 환불 모달 내 결제 내역 로드 (크레딧 + 정기결제 통합)
window.loadRefundModalList = async () =>{
 const el = document.getElementById('refundModalList');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">불러오는 중...</div>';
 try {
 const all = await window.fetchAllOrders();
 const refundable = all.filter(it => it.data.status === 'paid');
 if (refundable.length === 0) {
 el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">환불 가능한 결제 내역이 없습니다.</div>';
 return;
  }
  const currentCredits = window.UC || 0;
  const coupon = window.COUPON || null;
  el.innerHTML = refundable.map(item => {
  const o = item.data;
 const ts = gpOrderPaidAtMs(item);
 const date = ts ? new Date(ts).toLocaleString('ko-KR') : '';
 const isSub = item.kind === 'sub';
 const title = isSub
   ? `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`
   : `크레딧 충전 · ${Number(o.totalGrantedCredits || o.safeCredits || o.credits || 0).toLocaleString('ko-KR')}크레딧`;
  // 일반 청약철회 기간은 주문에 저장된 계약·이용 가능 시점 기준을 우선한다.
  // 기간이 지난 주문은 추가 확인을 허용하고, 기준일 자체가 없으면 고객센터로 안내한다.
  let eligibilityNote = '';
  let refundPreview = '';
  let canRequest = true;
  let refundAmount = 0;
  const refundWindowEndMs = gpRefundWindowEndMs(item);
  const within7 = refundWindowEndMs > 0 && Date.now() <= refundWindowEndMs;
  const missingWindowBasis = refundWindowEndMs <= 0;
  const requiresEligibilityReview = !missingWindowBasis && !within7;
  if (isSub) {
    const sameCycle = !!(
      window.SUB && coupon &&
      window.SUB.tier === o.tier && coupon.tier === o.tier &&
      window.SUB.cycleStartedMs && Math.abs(window.SUB.cycleStartedMs - ts) < 60 * 1000
    );
    if (!sameCycle) {
      canRequest = false;
      eligibilityNote = '현재 결제주기의 구독만 온라인 환불할 수 있습니다. 고객센터로 문의해주세요.';
    } else {
      const calc = gpSubscriptionRefundPreview(o, coupon);
      refundAmount = calc.refundAmount;
      canRequest = refundAmount > 0;
      eligibilityNote = calc.usedCount > 0
        ? `${calc.settlementUses}회 정산 기준 · ${calc.usedCount}회 사용분을 공제합니다.`
        : '이번 결제주기 미사용 · 전액 환불 대상입니다.';
      refundPreview = `예상 환불액: ${refundAmount.toLocaleString()}원`;
      if (!canRequest) eligibilityNote = `정산 기준 ${calc.settlementUses}회를 모두 사용했습니다. 서비스 오류는 고객센터로 문의해주세요.`;
    }
  } else {
    const calc = gpCreditRefundPreview(o, currentCredits);
    refundAmount = calc.refundAmount;
    if (calc.policy === 'base') {
     eligibilityNote = calc.paidUsedCredits > 0
      ? `사용량 ${calc.usedCredits.toLocaleString()}크레딧을 기준 크레딧부터 반영했어요. 별도 결제대가 없이 지급된 추가 크레딧에는 독립된 현금 환불액을 계산하지 않아요.`
      : '기준 크레딧 미사용 · 전액 환불 대상입니다. 환불 시 남은 지급 크레딧을 모두 회수해요.';
     refundPreview = `예상 환불액: ${refundAmount.toLocaleString()}원 · 기준 잔여 ${calc.refundablePaidCredits.toLocaleString()}/${calc.paidCredits.toLocaleString()} · 회수 ${calc.recoverCredits.toLocaleString()}크레딧`;
    } else {
     eligibilityNote = calc.usedCredits > 0
      ? `기존 주문 기준으로 사용한 ${calc.usedCredits.toLocaleString()}크레딧을 환불액에서 제외합니다.`
      : '기존 주문의 총 지급 크레딧 미사용 · 전액 환불 대상입니다.';
     refundPreview = `예상 환불액: ${refundAmount.toLocaleString()}원 · 회수 ${calc.recoverCredits.toLocaleString()}크레딧`;
    }
    if (calc.recoverCredits <= 0 || refundAmount <= 0) {
      canRequest = false;
      eligibilityNote = '환불 가능한 기준 크레딧을 모두 사용했습니다. 서비스 오류는 고객센터로 문의해주세요.';
    }
  }
  if (missingWindowBasis) {
    canRequest = false;
    eligibilityNote = '청약철회 기준일을 확인할 수 없습니다. 주문번호와 함께 고객센터로 문의해 주세요.';
  } else if (requiresEligibilityReview) {
    const reviewNotice = '일반 청약철회 기간이 지났지만 관계 법령상 잔액 환급·취소 사유가 있는지 추가 확인을 요청할 수 있어요.';
    eligibilityNote = `${eligibilityNote ? eligibilityNote + ' ' : ''}${reviewNotice}`;
  }
  return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
  <div style="flex:1;min-width:0;">
  <div style="font-weight:600;font-size:14px;color:var(--text);">${(o.amount||0).toLocaleString()}원 · ${escapeHtml(title)}</div>
  <div style="color:var(--text3);font-size:12px;margin-top:4px;">${date}</div>
  ${refundPreview ? `<div style="color:var(--text);font-size:12px;font-weight:700;margin-top:7px;">${refundPreview}</div>` : ''}
  ${eligibilityNote ? `<div style="color:${canRequest?'var(--text3)':'var(--red)'};font-size:11px;margin-top:4px;">${eligibilityNote}</div>` : ''}
  </div>
 <button ${canRequest ? '' : 'disabled'} onclick="window.requestRefund('${jsAttr(item.id)}','${jsAttr(item.kind)}',${refundAmount},${requiresEligibilityReview})" style="padding:6px 14px;border-radius:6px;border:1px solid var(--red);background:none;color:${canRequest?'var(--red)':'var(--text3)'};font-size:12px;font-weight:600;cursor:${canRequest?'pointer':'not-allowed'};white-space:nowrap;opacity:${canRequest?'1':'.5'};">${canRequest ? (requiresEligibilityReview ? '확인 요청' : '환불 요청') : '문의 필요'}</button>
 </div>
</div>`;
 }).join('');
 } catch(e) {
 console.log('환불 목록 로드 실패:', e);
 el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">환불 가능한 결제 내역이 없습니다.</div>';
 }
};

// 사용자: 환불 요청 (크레딧/정기결제 분기)
window.requestRefund = async (orderId, kind, estimatedRefundAmount, requiresEligibilityReview) =>{
 kind = kind || 'credit';
 const estimate = Math.max(0, Math.floor(Number(estimatedRefundAmount) || 0));
 const reviewMessage = requiresEligibilityReview
  ? '일반 청약철회 기간이 지나거나 기준일 확인이 필요한 주문이에요. 관계 법령과 구매 당시 기준에 따라 환불 가능 여부를 추가로 확인합니다.\n'
  : '';
 const promptMessage = reviewMessage
  + (estimate ? `현재 예상 환불액은 ${estimate.toLocaleString('ko-KR')}원입니다.\n` : '')
  + '신청이 접수되면 서버가 당시 잔액을 기록하고, 크레딧 주문은 남은 기준·추가 크레딧을 처리 중 사용되지 않도록 예약해요. 다만 접수 전에 시작되어 아직 정산되지 않은 작업이나 교정 요청은 최종 금액에 반영될 수 있어요. 환불 사유 입력은 선택사항입니다.';
 const reason = window.gpPrompt
  ? await window.gpPrompt({ title: requiresEligibilityReview ? '환불 가능 여부 확인' : '환불 요청', message: promptMessage, placeholder: '선택 입력: 단순 변심 / 중복 결제 / 결과를 받지 못했어요', confirmText: '환불 요청', required: false })
  : prompt('환불 사유를 입력해 주세요. 입력하지 않아도 신청할 수 있어요:');
 if (reason === null) return;
 const cancelReason = String(reason || '').trim();
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/request-refund'), {
 method:'POST', headers: bearerJsonHeaders(idToken),
 body: JSON.stringify({ orderId, cancelReason, kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) {
  const acceptedAmount = Math.max(0, Math.floor(Number(data.estimatedRefundAmount) || 0));
  const needsReview = data.requiresEligibilityReview === true;
  const reserveMessage = kind === 'credit' ? ' 해당 주문의 남은 크레딧은 처리 중 사용되지 않도록 예약했어요.' : '';
  const acceptedMessage = needsReview
   ? `환불 요청이 접수됐어요. 관계 법령과 구매 당시 기준에 따른 추가 확인 후 처리 결과를 알려드릴게요.${reserveMessage}`
   : acceptedAmount
    ? `환불 예정액 ${acceptedAmount.toLocaleString('ko-KR')}원으로 접수됐어요.${reserveMessage} 환불 요건에 해당하는 요청은 신청을 받은 날부터 3영업일 이내에 원래 결제수단으로 취소 조치를 진행해요.`
    : `환불 요청이 접수됐어요.${reserveMessage} 처리 결과는 알림에서 확인할 수 있어요.`;
  if (window.gpNotify) window.gpNotify({ clientId: 'refund_requested_' + orderId, type: 'refund', title: '환불 요청 접수', message: acceptedMessage, action: { tab: 'mypage' } }, { persist: true });
  else alert('환불 요청이 접수되었습니다.');
  await window.loadOrderHistory(); await window.loadRefundModalList();
 }
 else alert(data.error || '환불 요청 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
};

// 관리자: 환불 요청 목록 (크레딧 + 정기결제 통합)
window.loadAdminRefundSummary = async () => {
 if (!window.isAdmin()) return;
 const attention = document.getElementById('adminAttentionRefunds');
 if (attention) delete attention.dataset.loadState;
 try {
  const [orderSnap, subSnap] = await Promise.all([
   getDocs(query(collection(db, 'orders'), where('status', '==', 'refund_requested'), orderBy('createdAt', 'desc'))),
   getDocs(query(collection(db, 'subscriptionOrders'), where('status', '==', 'refund_requested')))
  ]);
  adminSetRefundStat(orderSnap.size + subSnap.size);
  if (attention) attention.dataset.loadState = 'ok';
 } catch (error) {
  if (attention) { attention.textContent = '측정 실패'; attention.dataset.state = 'danger'; attention.dataset.loadState = 'error'; }
 }
};

window.loadAdminRefundList = async () =>{
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminRefundList');
 if (!el) return;
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
 const [creditSnap, subSnap] = await Promise.all([
   getDocs(query(collection(db,'orders'), where('status','==','refund_requested'), orderBy('createdAt','desc'))),
   getDocs(query(collection(db,'subscriptionOrders'), where('status','==','refund_requested')))
 ]);
 const items = [
   ...creditSnap.docs.map(d => ({ id: d.id, kind: 'order', data: d.data() })),
   ...subSnap.docs.map(d => ({ id: d.id, kind: 'subscription', data: d.data() }))
 ];
 items.sort((a,b) => {
   const at = a.data.refundRequestedAt?.toMillis?.() || 0;
   const bt = b.data.refundRequestedAt?.toMillis?.() || 0;
   return bt - at;
 });
 adminSetRefundStat(items.length);
 if (items.length === 0) {
 el.innerHTML = '<div class="gp-admin-empty">대기 중인 환불 요청이 없습니다.</div>';
 return;
 }
 let html = '<div class="gp-admin-refund-list">';
 for (const item of items) {
 const o = item.data;
 const requestedDate = o.refundRequestedAt ? new Date(o.refundRequestedAt.toDate()).toLocaleString('ko-KR') : '';
 const paidMs = o.createdAt?.toMillis?.() || o.approvedAt?.toMillis?.() || o.requestedAt?.toMillis?.() || 0;
 const paidDate = paidMs ? new Date(paidMs).toLocaleString('ko-KR') : '';
 let userEmail = o.uid;
 let userCredits = 0;
 try {
   const uSnap = await getDoc(doc(db,'users',o.uid));
   if(uSnap.exists()) {
     userEmail = uSnap.data().email || o.uid;
     userCredits = uSnap.data().credits || 0;
   }
 } catch(e){}
 const isSub = item.kind === 'subscription';
 let itemLabel, refundDetail;
 if (isSub) {
   itemLabel = `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`;
   const expected = Math.max(0, Number(o.requestedRefundAmount) || Number(o.amount) || 0);
   const used = Math.max(0, Number(o.refundUsedCount) || 0);
   const settlementUses = Math.max(0, Number(o.refundSettlementUses) || 50);
   const refundType = expected >= (Number(o.amount) || 0) ? '전액' : `${used}/${settlementUses}회 사용분 공제`;
   refundDetail = `<div class="gp-admin-refund-detail">환불 예정 금액 <b class="neg">${expected.toLocaleString()}원</b> (${refundType} · 승인 시 서버 재검증)</div>`;
 } else {
   const calc = gpCreditRefundPreview(o, userCredits);
   if (calc.policy === 'base') {
    itemLabel = `크레딧 · 기준 ${calc.paidCredits.toLocaleString()} + 추가 ${calc.bonusCredits.toLocaleString()}`;
    refundDetail = `<div class="gp-admin-refund-detail">기준 사용 <b>${calc.paidUsedCredits.toLocaleString()}</b> · 기준 잔여 <b>${calc.refundablePaidCredits.toLocaleString()}</b> · 환불 예정 <b class="neg">${calc.refundAmount.toLocaleString()}원</b> · 남은 지급량 <b>${calc.recoverCredits.toLocaleString()}</b>크레딧 전부 회수</div>`;
   } else {
    itemLabel = `크레딧 · 기존 주문 ${calc.totalGrantedCredits.toLocaleString()}크레딧`;
    refundDetail = `<div class="gp-admin-refund-detail">기존 비례 정책 · 사용 <b>${calc.usedCredits.toLocaleString()}</b> · 환불 예정 <b class="neg">${calc.refundAmount.toLocaleString()}원</b> · 차감 <b>${calc.recoverCredits.toLocaleString()}</b>크레딧</div>`;
   }
 }
 html += `<div class="gp-admin-refund-item">
 <div class="gp-admin-refund-top">
 <div class="gp-admin-refund-who">
 <strong>${escapeHtml(userEmail)}<span class="gp-admin-refund-tag">${isSub ? '구독' : '크레딧'}</span></strong>
 <span>${(o.amount||0).toLocaleString()}원 · ${escapeHtml(itemLabel)}</span>
 <span>결제 ${escapeHtml(paidDate || '-')} · 환불요청 ${escapeHtml(requestedDate || '-')}</span>
 </div>
 <div class="gp-admin-refund-actions">
 <button class="gp-admin-btn-approve" onclick="window.approveRefund('${jsAttr(item.id)}','${jsAttr(item.kind)}')">승인</button>
 <button class="gp-admin-btn-reject" onclick="window.rejectRefund('${jsAttr(item.id)}','${jsAttr(item.kind)}')">거절</button>
 </div>
 </div>
 ${refundDetail}
 <div class="gp-admin-refund-reason">사유: ${escapeHtml(o.cancelReason || '없음')}</div>
</div>`;
 }
 el.innerHTML = html + '</div>';
 } catch(e) {
 console.log('환불 목록 로드 실패:', e);
 el.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">환불 목록을 불러오지 못했습니다.</div>';
 }
};

const adminRefundPending = new Set();

// 관리자: 환불 승인
window.approveRefund = async (orderId, kind) =>{
 kind = kind || 'order';
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '환불을 승인할까요?', message: '승인하면 토스에서 실제 환불이 진행됩니다.', confirmText: '승인하기', danger: true })
 : confirm('이 환불을 승인하시겠습니까? 토스에서 실제 환불이 진행됩니다.');
 if (!ok) return;
 const pendingKey = `refund:${kind}:${orderId}`;
 if (adminRefundPending.has(pendingKey)) return;
 adminRefundPending.add(pendingKey);
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/approve-refund'), {
 method:'POST', headers: bearerJsonHeaders(idToken),
 body: JSON.stringify({ orderId, kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) {
  alert('환불이 완료되었습니다.');
  await Promise.allSettled([
   window.loadAdminRefundList(),
   window.loadOrderHistory(),
   window.loadAllCreditHistory(),
   window._adminSelectedUser ? window.adminSearchUser(true) : Promise.resolve()
  ]);
 }
 else alert(data.error || '환불 승인 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
 finally { adminRefundPending.delete(pendingKey); }
};

// 관리자: 환불 거절
window.rejectRefund = async (orderId, kind) =>{
 kind = kind || 'order';
 const reason = window.gpPrompt
  ? await window.gpPrompt({ title: '환불 거절 사유', message: '사용자에게 안내할 사유를 입력해 주세요.', placeholder: '거절 사유', confirmText: '거절 처리', required: true })
 : prompt('거절 사유를 입력해 주세요:');
 if (!reason || reason.trim().length < 2) { alert('거절 사유를 2자 이상 입력해 주세요.'); return; }
 const pendingKey = `refund:${kind}:${orderId}`;
 if (adminRefundPending.has(pendingKey)) return;
 adminRefundPending.add(pendingKey);
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/reject-refund'), {
 method:'POST', headers: bearerJsonHeaders(idToken),
 body: JSON.stringify({ orderId, rejectReason: reason.trim(), kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) {
  alert('환불 요청이 거절되었습니다.');
  await Promise.allSettled([
   window.loadAdminRefundList(),
   window.loadOrderHistory(),
   window._adminSelectedUser ? window.adminSearchUser(true) : Promise.resolve()
  ]);
 }
 else alert(data.error || '환불 거절 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
 finally { adminRefundPending.delete(pendingKey); }
};

// ===== ADMIN PAGE =====
function adminNumber(n) {
 const v = Number(n);
 return Number.isFinite(v) ? v : 0;
}

function adminMoney(n) {
 return adminNumber(n).toLocaleString('ko-KR') + '원';
}

function adminDateText(ms) {
 const v = Number(ms);
 return Number.isFinite(v) && v > 0 ? new Date(v).toLocaleString('ko-KR') : '-';
}

function adminDateShortText(ms) {
 const v = Number(ms);
 return Number.isFinite(v) && v > 0 ? new Date(v).toLocaleDateString('ko-KR') : '-';
}

function adminPlanText(plan) {
 return ({ free:'무료', starter:'스타터', pro:'프로', master:'마스터', unlimited:'무제한' })[plan] || plan || '무료';
}

function adminKindText(kind) {
 return kind === 'subscription' ? '정기결제' : '크레딧';
}

function adminOrderStatusText(status) {
 return ({
  paid: '결제 완료',
  refund_requested: '환불 요청',
  refund_rejected: '환불 거절',
  partially_refunded: '부분 환불',
  refunded: '환불 완료',
  cancelled: '취소',
  failed: '실패'
 })[status] || status || '-';
}

function adminHistoryTypeText(type) {
 return ({
  charge: '충전',
  refund: '환불',
  referral: '친구 추천',
  coupon_redeem: '쿠폰',
  detect: 'AI 감지',
  humanize: '휴머나이징',
  restructure: '고급 휴머나이징(정밀 검증)',
  admin_adjust: '관리자 조정'
 })[type] || '기타';
}

// 정확한 작업명: type + mode(+evidence/fallback)로 "다듬기 / 기본 / 고급 정밀 검증 / 근거"까지 구분.
// 차감 doc에 mode가 기록된 신규 건만 세분화되고, mode 없는 구 데이터는 기존 라벨로 폴백한다.
function adminHistoryLabel(h) {
 h = h || {};
 const type = h.type || '';
 if (type.endsWith('_restore')) {
  return adminHistoryTypeText(type.slice(0, -8)) + ' 복구';
 }
 if (type === 'humanize') {
  if (h.fallback) return '기본 휴머나이징 → 원문 보존 다듬기';
  switch (h.mode) {
   case 'blog': return '기본 휴머나이징';
   case 'polish': return '원문 보존 다듬기';
   case 'assignment': return '원문 보존 다듬기(구형 기록)';
   case 'thesis': return '논문 다듬기(구형 기록)';
   case 'resume': return '다듬기(자소서)';
   default: return '휴머나이징';   // 구 데이터(모드 미기록)
  }
 }
 if (type === 'restructure') {
  return '고급 휴머나이징(정밀 검증)' + (h.evidence ? ' + 근거' : '');
 }
 return adminHistoryTypeText(type);
}

function adminHistoryAmountHtml(h) {
 const type = String(h?.type || '');
 if (type.endsWith('_restore')) {
  return `<span style="color:var(--green);">+${Math.abs(adminNumber(h.used)).toLocaleString('ko-KR')}</span>`;
 }
 if (h.type === 'admin_adjust') {
  const amount = adminNumber(h.amount);
  const color = amount >= 0 ? 'var(--green)' : 'var(--red)';
  const prefix = amount > 0 ? '+' : '';
  return `<span style="color:${color};">${prefix}${amount}</span>`;
 }
 if (h.type === 'charge' || h.type === 'referral' || h.type === 'coupon_redeem') {
  return `<span style="color:var(--green);">+${adminNumber(h.amount)}</span>`;
 }
 if (h.type === 'refund') {
  return `<span style="color:var(--yellow);">${adminNumber(h.amount)}</span>`;
 }
 return `<span style="color:var(--red);">-${adminNumber(h.used)}</span>`;
}

function adminUsageHistory(data) {
 const explicit = data && data.creditUsageHistory;
 const rows = Array.isArray(explicit)
  ? explicit
  : (Array.isArray(data && data.creditHistory) ? data.creditHistory : []).filter(h => h && h.type !== 'charge');
 return rows;
}

function adminChargeHistory(data) {
 if (Array.isArray(data && data.chargeHistory)) return data.chargeHistory;
 return Array.isArray(data && data.orders) ? data.orders : [];
}

function adminSelectedChargeOrder(index) {
 return adminChargeHistory(window._adminSelectedBundle)[index];
}

async function adminPost(path, body, options) {
 if (!window.CU || !window.isAdmin()) throw new Error('관리자 권한이 필요합니다.');
 const idToken = await window.CU.getIdToken();
 const res = await fetch(window.apiUrl(path), {
  method: 'POST',
  headers: bearerJsonHeaders(idToken),
  body: JSON.stringify(body || {}),
  signal: options && options.signal
 });
 let data = {};
 try { data = await res.json(); } catch (_) {}
 if (!res.ok || !data.ok) throw new Error(data.error || '요청 처리에 실패했습니다.');
 return data;
}

function adminSetBusy(button, busy, busyText) {
 if (!button) return;
 if (busy) {
  if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (busyText) button.textContent = busyText;
 } else {
  button.disabled = false;
  button.removeAttribute('aria-busy');
  if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
 }
}

function adminSetMessage(id, text, type) {
 const el = document.getElementById(id);
 if (!el) return;
 el.textContent = text || '';
 el.classList.toggle('error', type === 'error' && !!text);
 el.classList.toggle('success', type === 'success' && !!text);
 el.style.color = type === 'error' ? 'var(--admin-danger-fg)' : type === 'success' ? 'var(--admin-success-fg)' : 'var(--admin-text3)';
}

function adminPagerHtml(page, pageCount, total, fnName) {
 if (pageCount <= 1) return '';
 return `
  <div class="gp-admin-pager">
   <button type="button" class="gp-admin-mini-btn" ${page <= 1 ? 'disabled' : ''} onclick="${fnName}(${page - 1})">이전</button>
   <span>${page.toLocaleString('ko-KR')} / ${pageCount.toLocaleString('ko-KR')} · 총 ${total.toLocaleString('ko-KR')}건</span>
   <button type="button" class="gp-admin-mini-btn" ${page >= pageCount ? 'disabled' : ''} onclick="${fnName}(${page + 1})">다음</button>
  </div>`;
}

function adminRenderCreditAudit(audit) {
 if (!audit) return '';
 const paidCredits = adminNumber(audit.paidOrphanDebitCredits);
 const paidCount = adminNumber(audit.paidOrphanDebitCount);
 const prePaidCredits = adminNumber(audit.prePaidOrphanDebitCredits);
 const handledCount = adminNumber(audit.handledOrphanDebitCount);
 const handledCredits = adminNumber(audit.handledOrphanDebitCredits);
 const orphanDebits = Array.isArray(audit.orphanDebits) ? audit.orphanDebits : [];
 const hasPaidIssue = paidCredits > 0;
 const pageSize = 25;
 const totalRows = orphanDebits.length;
 const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
 const page = Math.min(Math.max(parseInt(window._adminAuditPage || 1, 10) || 1, 1), pageCount);
 window._adminAuditPage = page;
 window._adminOrphanDebitRows = orphanDebits;
 const start = (page - 1) * pageSize;
 const visibleDebits = orphanDebits.slice(start, start + pageSize);
 const rows = visibleDebits.map((d, i) => {
  const rowIndex = start + i;
  const scope = d.isAfterFirstPaid ? '유료' : '결제 전';
  const dup = d.duplicateHint ? ' · 중복 의심' : '';
  const handled = d.handled === true;
  const restoredCredits = adminNumber(d.restoredCredits);
  const resolutionText = handled
   ? (d.resolution === 'manual_handled'
     ? '처리완료 표시'
     : `처리완료 · +${restoredCredits.toLocaleString('ko-KR')}크레딧`)
   : `${scope}${dup}`;
  const hint = !handled && d.manualRestoreHint
   ? `<span class="gp-admin-audit-hint">같은 금액 수동 조정 가능성 · ${escapeHtml(adminDateText(d.manualRestoreHint.createdAtMs))} · +${adminNumber(d.manualRestoreHint.amount).toLocaleString('ko-KR')}</span>`
   : '';
  const actions = (!handled && d.isAfterFirstPaid)
   ? `<div class="gp-admin-audit-actions">
       <button type="button" class="gp-admin-mini-btn" onclick="adminResolveOrphanDebit(${rowIndex},'restore')">크레딧 환급</button>
       <button type="button" class="gp-admin-mini-btn" onclick="adminResolveOrphanDebit(${rowIndex},'mark')">처리완료 표시</button>
      </div>`
   : '';
  return `
   <div class="gp-admin-audit-row ${handled ? 'is-handled' : ''}">
    <span>${escapeHtml(adminDateText(d.createdAtMs))}</span>
    <strong>${escapeHtml(adminHistoryLabel(d))}</strong>
    <b>-${adminNumber(d.used).toLocaleString('ko-KR')}크레딧</b>
    <em>${escapeHtml(resolutionText)}</em>
    ${actions}
    ${hint}
   </div>`;
 }).join('');
 const subText = hasPaidIssue
  ? `미처리 유료 차감 ${paidCount.toLocaleString('ko-KR')}건이 저장된 결과와 매칭되지 않습니다.`
  : handledCount > 0
  ? `미처리 유료 차감은 없고, 처리완료 ${handledCount.toLocaleString('ko-KR')}건이 기록되어 있습니다.`
  : '결제 이후 결과 없는 차감은 발견되지 않았습니다.';
 const preText = prePaidCredits > 0
  ? `<span>결제 전 미매칭 ${prePaidCredits.toLocaleString('ko-KR')}크레딧 별도</span>`
  : '';
 const handledText = handledCount > 0
  ? `<span>처리완료 ${handledCredits.toLocaleString('ko-KR')}크레딧</span>`
  : '';
 const pageText = totalRows > 0
  ? `<span>목록 ${Math.min(start + 1, totalRows).toLocaleString('ko-KR')}-${Math.min(start + pageSize, totalRows).toLocaleString('ko-KR')} / ${totalRows.toLocaleString('ko-KR')}건</span>`
  : '';
 const metaHtml = `${preText}${handledText}${pageText}`.trim();
 const pagerHtml = adminPagerHtml(page, pageCount, totalRows, 'adminSetAuditPage');
 return `
  <div class="gp-admin-audit ${hasPaidIssue ? 'is-warn' : 'is-ok'}">
   <div class="gp-admin-audit-head">
    <div>
     <strong>${hasPaidIssue ? '결과 없는 유료 차감' : '차감-결과 대조 정상'}</strong>
     <span>${escapeHtml(subText)}</span>
    </div>
    <div class="gp-admin-audit-total">
     <b>${paidCredits.toLocaleString('ko-KR')}</b><span>크레딧</span>
    </div>
   </div>
   ${metaHtml ? `<div class="gp-admin-audit-meta">${metaHtml}</div>` : ''}
   ${rows ? `<div class="gp-admin-audit-rows">${rows}</div>${pagerHtml}` : ''}
  </div>`;
}

window.adminSetAuditPage = function(page) {
 window._adminAuditPage = parseInt(page, 10) || 1;
 if (window._adminSelectedBundle) adminRenderUserBundle(window._adminSelectedBundle);
};

window.adminPrefillCreditRestore = function(credits) {
 const amount = adminNumber(credits);
 if (amount <= 0) return;
 const signEl = document.getElementById('adminCreditSign');
 const amountEl = document.getElementById('adminCreditAmount');
 const reasonEl = document.getElementById('adminCreditReason');
 if (signEl) signEl.value = '1';
 if (amountEl) amountEl.value = String(amount);
 if (reasonEl) reasonEl.value = `결과 저장 없는 유료 차감 ${amount.toLocaleString('ko-KR')}크레딧 복구`;
 adminSetMessage('adminCreditAdjustMsg', '복구 수량을 채웠습니다. 사유 확인 후 적용하세요.', 'info');
 if (amountEl) amountEl.focus();
};

window.adminResolveOrphanDebit = async function(index, action) {
 const user = window._adminSelectedUser;
 const debit = (window._adminOrphanDebitRows || [])[index];
 const mode = action === 'mark' ? 'mark' : 'restore';
 if (!user || !user.uid || !debit) {
  alert('사용자와 차감 항목을 다시 선택해주세요.');
  return;
 }
 const credits = adminNumber(debit.used);
 const title = mode === 'mark' ? '처리완료로 표시할까요?' : '크레딧을 환급할까요?';
 const defaultReason = mode === 'mark'
  ? `결과 저장 없는 유료 차감 ${credits.toLocaleString('ko-KR')}크레딧 수동 처리완료 표시`
  : `결과 저장 없는 유료 차감 ${credits.toLocaleString('ko-KR')}크레딧 환급`;
 let reason = defaultReason;
 if (mode === 'mark') {
  reason = window.gpPrompt
   ? await window.gpPrompt({
     title,
     message: '이미 수동으로 복구한 차감이면 크레딧 변동 없이 처리완료 표시만 남깁니다.',
     placeholder: '처리 사유',
     defaultValue: defaultReason,
     confirmText: '표시하기',
     required: true
    })
   : prompt('처리 사유', defaultReason);
  if (!reason || reason.trim().length < 2) return;
 } else {
  const hint = debit.manualRestoreHint
   ? `\n\n주의: 같은 금액의 관리자 조정 가능성이 있습니다.\n${adminDateText(debit.manualRestoreHint.createdAtMs)} · +${adminNumber(debit.manualRestoreHint.amount).toLocaleString('ko-KR')}크레딧`
   : '';
  const ok = window.gpConfirm
   ? await window.gpConfirm({
     title,
     message: `${user.email || user.uid}\n+${credits.toLocaleString('ko-KR')}크레딧이 실제로 추가되고 이 차감은 처리완료로 표시됩니다.${hint}`,
     confirmText: '환급 처리',
     danger: false
    })
   : confirm(`${user.email || user.uid}에게 +${credits}크레딧을 환급하고 처리완료로 표시할까요?${hint}`);
  if (!ok) return;
 }

 adminSetMessage('adminCreditAdjustMsg', '결과 없는 차감 처리 중...', 'info');
 try {
  const data = await adminPost('/admin/resolve-orphan-debit', {
   uid: user.uid,
   creditHistoryId: debit.id,
   action: mode,
   reason: reason.trim()
  });
  const msg = data.alreadyHandled
   ? '이미 처리완료로 표시된 차감입니다.'
   : mode === 'mark'
   ? '처리완료 표시를 남겼습니다.'
   : `환급 완료: ${adminNumber(data.before).toLocaleString('ko-KR')} → ${adminNumber(data.after).toLocaleString('ko-KR')}크레딧`;
  adminSetMessage('adminCreditAdjustMsg', msg, 'success');
  if (window.CU && user.uid === window.CU.uid && typeof data.after === 'number') {
   window.UC = data.after;
   if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
  }
  await window.adminSearchUser(true);
  await window.loadAllCreditHistory();
 } catch (e) {
  adminSetMessage('adminCreditAdjustMsg', e.message || '결과 없는 차감 처리에 실패했습니다.', 'error');
  alert(e.message || '결과 없는 차감 처리에 실패했습니다.');
 }
};

function adminRenderUserBundle(data) {
 const user = data.user || {};
 const resultEl = document.getElementById('adminUserResult');
 const uidEl = document.getElementById('adminSelectedUid');
 const ordersEl = document.getElementById('adminUserOrders');
 if (uidEl) uidEl.textContent = user.uid ? 'UID ' + user.uid.slice(0, 8) : '';
 if (!resultEl || !ordersEl) return;
 if (window._adminUserPagerUid !== user.uid) {
  window._adminUserPagerUid = user.uid;
  window._adminAuditPage = 1;
  window._adminLedgerPage = 1;
  window._adminChargePage = 1;
 }

 const sub = user.subscription || null;
 const coupon = user.coupon || null;
 const hist = adminUsageHistory(data);
 const orders = adminChargeHistory(data);
 const successfulOrders = orders.filter(order => !['failed', 'cancelled'].includes(String(order.status || '')));
 const paidGross = successfulOrders.reduce((sum, order) => sum + adminNumber(order.amount), 0);
 const refundedTotal = successfulOrders.reduce((sum, order) => sum + adminNumber(order.refundedAmount || order.refundAmount), 0);
 const netPaid = Math.max(0, paidGross - refundedTotal);
 const usedCredits = hist.reduce((sum, row) => sum + Math.max(0, adminNumber(row.used)), 0);
 const auditHtml = adminRenderCreditAudit(data.creditAudit);
 const ledgerPageSize = 30;
 const ledgerTotal = hist.length;
 const ledgerPageCount = Math.max(1, Math.ceil(ledgerTotal / ledgerPageSize));
 const ledgerPage = Math.min(Math.max(parseInt(window._adminLedgerPage || 1, 10) || 1, 1), ledgerPageCount);
 window._adminLedgerPage = ledgerPage;
 const ledgerStart = (ledgerPage - 1) * ledgerPageSize;
 const ledgerRows = hist.slice(ledgerStart, ledgerStart + ledgerPageSize);
 const historyHtml = hist.length
  ? ledgerRows.map(h => `
    <div class="gp-admin-ledger-row">
      <div>
        <strong>${escapeHtml(adminHistoryLabel(h))}</strong>
        <span>${escapeHtml(adminDateText(h.createdAtMs))}</span>
      </div>
      <div>
        ${adminHistoryAmountHtml(h)}
        <span>잔여 ${adminNumber(h.remaining).toLocaleString('ko-KR')}</span>
      </div>
    </div>`).join('')
  : '<div class="gp-admin-empty gp-admin-empty-compact">사용 내역이 없습니다.</div>';
 const ledgerPagerHtml = adminPagerHtml(ledgerPage, ledgerPageCount, ledgerTotal, 'adminSetLedgerPage');
 const ledgerRange = ledgerTotal > 0
  ? `${Math.min(ledgerStart + 1, ledgerTotal).toLocaleString('ko-KR')}-${Math.min(ledgerStart + ledgerPageSize, ledgerTotal).toLocaleString('ko-KR')} / ${ledgerTotal.toLocaleString('ko-KR')}건`
  : '0건';

 resultEl.innerHTML = `
  <div class="gp-admin-user-summary">
    <div class="gp-admin-user-main">
      <strong>${escapeHtml(user.name || '이름 없음')}</strong>
      <span>${escapeHtml(user.email || '-')}</span>
      <code>${escapeHtml(user.uid || '')}</code>
    </div>
    <div class="gp-admin-figs">
      <div class="gp-admin-fig"><span>보유 크레딧</span><strong>${adminNumber(user.credits).toLocaleString('ko-KR')}</strong></div>
      <div class="gp-admin-fig"><span>플랜</span><strong>${escapeHtml(adminPlanText(user.plan))}</strong></div>
      <div class="gp-admin-fig"><span>가입일</span><strong>${escapeHtml(adminDateShortText(user.createdAtMs))}</strong></div>
      <div class="gp-admin-fig"><span>구독</span><strong>${sub ? escapeHtml((SUB_TIER_LABELS[sub.tier] || sub.tier || '-')) : '없음'}</strong></div>
      <div class="gp-admin-fig"><span>쿠폰 잔여</span><strong>${coupon ? `${adminNumber(coupon.remaining).toLocaleString('ko-KR')} / ${adminNumber(coupon.granted).toLocaleString('ko-KR')}` : '없음'}</strong></div>
      <div class="gp-admin-fig"><span>최근 조회분 순결제</span><strong>${adminMoney(netPaid)}</strong></div>
      <div class="gp-admin-fig"><span>조회분 결제 / 환불</span><strong>${successfulOrders.length.toLocaleString('ko-KR')}건 / ${adminMoney(refundedTotal)}</strong></div>
      <div class="gp-admin-fig"><span>최근 조회분 사용</span><strong>${usedCredits.toLocaleString('ko-KR')}크레딧</strong></div>
     </div>
    <p class="gp-admin-limit-note">결제·환불·사용 합계는 사용자 요약 API가 반환한 최근 기록 범위이며 계정 전체 누적값이 아닙니다.</p>
    ${auditHtml}
    <div>
      <div class="gp-admin-ledger-head">사용 내역 <span>${ledgerRange}</span></div>
      <div class="gp-admin-ledger-note">크레딧 차감·복구·환불·관리자 조정 기록</div>
      <div class="gp-admin-ledger is-paged">${historyHtml}</div>
      ${ledgerPagerHtml}
    </div>
  </div>`;

 if (!orders.length) {
  ordersEl.innerHTML = '<div class="gp-admin-empty gp-admin-empty-compact">충전 내역이 없습니다.</div>';
  return;
 }
 const chargePageSize = 20;
 const chargePageCount = Math.max(1, Math.ceil(orders.length / chargePageSize));
 const chargePage = Math.min(Math.max(parseInt(window._adminChargePage || 1, 10) || 1, 1), chargePageCount);
 window._adminChargePage = chargePage;
 const chargeStart = (chargePage - 1) * chargePageSize;
 const chargeRows = orders.slice(chargeStart, chargeStart + chargePageSize);
 const chargeRange = `${Math.min(chargeStart + 1, orders.length).toLocaleString('ko-KR')}-${Math.min(chargeStart + chargePageSize, orders.length).toLocaleString('ko-KR')} / ${orders.length.toLocaleString('ko-KR')}건`;
 ordersEl.innerHTML = `
  <div class="gp-admin-charge-meta">
   <strong>${chargeRange}</strong>
   <span>일반 충전·정기결제 및 환불 상태</span>
  </div>
  <div class="gp-admin-order-list">` + chargeRows.map((o, i) => {
  const orderIndex = chargeStart + i;
  const isSub = o.kind === 'subscription';
  const grantTotal = adminNumber(o.totalGrantedCredits || o.safeCredits || o.credits);
  const basePolicyOrder = o.creditGrantPolicyVersion === REFUND_POLICY_VERSION && adminNumber(o.paidCredits) > 0;
  const title = isSub
   ? `정기결제 · ${escapeHtml(SUB_TIER_LABELS[o.tier] || o.tier || '-')}`
   : `크레딧 · ${grantTotal.toLocaleString('ko-KR')}크레딧`;
  const priorRefunded = adminNumber(o.refundedAmount || o.refundAmount);
  const remainingMoney = Math.max(0, adminNumber(o.amount) - priorRefunded);
  const canRefund = !!o.paymentKey && ['paid', 'refund_requested', 'refund_rejected', 'partially_refunded'].includes(o.status) && remainingMoney > 0;
  const disabledTitle = !o.paymentKey ? 'paymentKey가 없는 이전 결제건입니다.' : '현재 상태에서는 환불할 수 없습니다.';
  const refundMeta = o.status === 'refunded'
   ? `<span>환불 완료 ${adminMoney(priorRefunded)} · ${adminNumber(o.refundedCredits).toLocaleString('ko-KR')}크레딧</span>`
   : o.status === 'partially_refunded'
   ? `<span>부분환불 ${adminMoney(priorRefunded)} · 잔여 ${adminMoney(remainingMoney)} 환불 가능</span>`
   : '';

  let actionBtn, panel = '';
  if (!canRefund) {
   actionBtn = `<button type="button" class="gp-admin-danger" disabled title="${escapeHtml(disabledTitle)}">환불</button>`;
  } else if (isSub) {
   actionBtn = `<button type="button" class="gp-admin-danger" onclick="adminDirectRefund(${orderIndex})">전액 환불</button>`;
  } else {
   actionBtn = `<button type="button" class="gp-admin-danger" onclick="adminToggleRefund(${orderIndex})">환불 ▾</button>`;
   panel = `
     <div class="gp-admin-refund-panel" id="refundPanel-${orderIndex}" hidden>
       <div class="gp-admin-refund-modes">
         <span class="gp-admin-mode is-active" data-mode="policy">정책 환불</span>
       </div>
       <p class="gp-admin-refund-policy-note">${basePolicyOrder
        ? '기준 크레딧 사용량으로 금액을 계산하고 남은 기준·추가 크레딧을 모두 회수합니다.'
        : '기존 주문은 주문 당시 총 지급 크레딧 기준 비례 환불만 허용합니다.'} 전액·직접입력 우회는 사용할 수 없습니다.</p>
       <input type="text" class="gp-admin-input gp-admin-input-sm" id="refundReason-${orderIndex}" maxlength="120" placeholder="환불 사유 (필수)">
       <div class="gp-admin-refund-preview" id="refundPreview-${orderIndex}"></div>
       <div class="gp-admin-refund-go">
         <button type="button" class="gp-admin-primary" onclick="adminDirectRefund(${orderIndex})">환불 진행</button>
         <button type="button" class="gp-admin-mini-btn" onclick="adminToggleRefund(${orderIndex})">닫기</button>
       </div>
     </div>`;
  }

  return `
   <div class="gp-admin-order">
     <div class="gp-admin-order-row">
       <div class="gp-admin-order-main">
         <strong>${title}</strong>
         <span>${escapeHtml(o.id)} · ${adminKindText(o.kind)} · ${adminDateText(o.createdAtMs)}</span>
         <span>${adminMoney(o.amount)} · ${escapeHtml(adminOrderStatusText(o.status))}</span>
         ${refundMeta}
       </div>
       ${actionBtn}
     </div>
     ${panel}
   </div>`;
 }).join('') + `</div>${adminPagerHtml(chargePage, chargePageCount, orders.length, 'adminSetChargePage')}`;
}

window.adminSetLedgerPage = function(page) {
 window._adminLedgerPage = parseInt(page, 10) || 1;
 if (window._adminSelectedBundle) adminRenderUserBundle(window._adminSelectedBundle);
};

window.adminSetChargePage = function(page) {
 window._adminChargePage = parseInt(page, 10) || 1;
 if (window._adminSelectedBundle) adminRenderUserBundle(window._adminSelectedBundle);
};

// 결제건 정책 환불 계산(백엔드 processRefund 미러, 누적 부분환불 반영)
function adminComputeRefund(order) {
 const priorAmount = adminNumber(order.refundedAmount || order.refundAmount);
 const priorCredits = adminNumber(order.refundedCredits);
 const remainingMoney = Math.max(0, adminNumber(order.amount) - priorAmount);
 const current = adminNumber(window._adminSelectedUser?.credits);
 if (remainingMoney <= 0) return { amount: 0, credits: 0 };
 const calc = gpCreditRefundPreview(order, current);
 const remainingGrant = Math.max(0, adminNumber(calc.totalGrantedCredits) - priorCredits);
 return {
  ...calc,
  amount: Math.min(remainingMoney, adminNumber(calc.refundAmount)),
  credits: Math.min(remainingGrant, adminNumber(calc.recoverCredits))
 };
}

function adminGetRefundMode() {
 return 'policy';
}

function adminRefundMsg(i, text) {
 const prev = document.getElementById('refundPreview-' + i);
 if (prev) prev.innerHTML = `<span class="neg">${escapeHtml(text)}</span>`;
}

window.adminRefundPreview = function(i) {
 const order = adminSelectedChargeOrder(i);
 const prev = document.getElementById('refundPreview-' + i);
 if (!order || !prev) return;
 const calc = adminComputeRefund(order);
 if (!calc || calc.amount <= 0) { prev.innerHTML = '<span class="neg">정책상 환불 가능한 금액이 없습니다.</span>'; return; }
 const basis = calc.policy === 'base'
  ? `기준 잔여 ${calc.refundablePaidCredits.toLocaleString('ko-KR')}/${calc.paidCredits.toLocaleString('ko-KR')}`
  : '기존 총 지급량 비례';
 prev.innerHTML = `${basis} · 환불 <b>${adminMoney(calc.amount)}</b> · 남은 지급 크레딧 <b>${calc.credits.toLocaleString('ko-KR')}</b> 전부 회수`;
};

window.adminToggleRefund = function(i) {
 const panel = document.getElementById('refundPanel-' + i);
 if (!panel) return;
 panel.hidden = !panel.hidden;
 if (!panel.hidden) window.adminRefundPreview(i);
};

async function adminRunRefund(i, body) {
 const pendingKey = `direct:${body.kind || 'order'}:${body.orderId || i}`;
 if (adminRefundPending.has(pendingKey)) return;
 adminRefundPending.add(pendingKey);
 try {
  const data = await adminPost('/admin/direct-refund', body);
  const isPartial = data.fullyRefunded === false;
  const doneMsg = `${isPartial ? '부분 환불' : '환불'} 완료: ${adminMoney(data.refundAmount)}${data.refundedCredits ? ' · ' + data.refundedCredits.toLocaleString('ko-KR') + '크레딧 차감' : ''}`;
  if (window.gpToast) window.gpToast(doneMsg, { type: 'success', title: isPartial ? '부분 환불 완료' : '환불 완료' });
  else alert(doneMsg);
  await window.adminSearchUser(true);
  await Promise.allSettled([
   window.loadAdminRefundList(),
   window.loadAllCreditHistory(),
   window.loadOrderHistory(),
   window.loadAdminOverview()
  ]);
 } catch (e) {
  adminRefundMsg(i, e.message || '환불 처리에 실패했습니다.');
  alert(e.message || '환불 처리에 실패했습니다.');
 } finally {
  adminRefundPending.delete(pendingKey);
 }
}

function adminDetectCalibrationExample(cfg) {
 cfg = cfg || {};
 const raw = 80;
 const factor = Number(cfg.factor) || 0;
 const maxReduction = Number(cfg.maxReduction) || 0;
 const floor = Number(cfg.floor) || 0;
 const adjusted = Math.max(floor, raw - Math.min(maxReduction, Math.round(raw * factor)));
 return `예시: 원점수 ${raw}% → 표시 ${Math.round(adjusted)}%`;
}

function adminSetDetectCalibrationForm(cfg) {
 cfg = cfg || {};
 const enabled = document.getElementById('adminDetectCalEnabled');
 const limit = document.getElementById('adminDetectCalLimit');
 const factor = document.getElementById('adminDetectCalFactor');
 const maxReduction = document.getElementById('adminDetectCalMaxReduction');
 const floor = document.getElementById('adminDetectCalFloor');
 const source = document.getElementById('adminDetectCalSource');
 if (enabled) enabled.checked = cfg.enabled === true;
 if (limit) limit.value = cfg.limit == null ? '' : String(cfg.limit);
 if (factor) factor.value = cfg.factor == null ? '' : String(cfg.factor);
 if (maxReduction) maxReduction.value = cfg.maxReduction == null ? '' : String(cfg.maxReduction);
 if (floor) floor.value = cfg.floor == null ? '' : String(cfg.floor);
 if (source) source.textContent = cfg.source || '-';
 adminSetMessage('adminDetectCalMsg', adminDetectCalibrationExample(cfg), 'info');
}

function adminReadDetectCalibrationForm() {
 const num = (id) => Number(document.getElementById(id)?.value);
 return {
  enabled: document.getElementById('adminDetectCalEnabled')?.checked === true,
  limit: num('adminDetectCalLimit'),
  factor: num('adminDetectCalFactor'),
  maxReduction: num('adminDetectCalMaxReduction'),
  floor: num('adminDetectCalFloor')
 };
}

window.loadAdminDetectCalibration = async function() {
 if (!window.isAdmin()) return;
 const msg = document.getElementById('adminDetectCalMsg');
 if (msg) msg.textContent = '불러오는 중...';
 try {
  const data = await adminPost('/admin/detect-calibration', {});
  adminSetDetectCalibrationForm(data.config || {});
 } catch (e) {
  adminSetMessage('adminDetectCalMsg', e.message || '감지 보정 설정을 불러오지 못했습니다.', 'error');
 }
};

window.adminSaveDetectCalibration = async function() {
 if (!window.isAdmin()) return;
 const button = document.getElementById('adminDetectSaveButton');
 if (button && button.disabled) return;
 const cfg = adminReadDetectCalibrationForm();
 if (!Number.isFinite(cfg.limit) || cfg.limit < 1 || cfg.limit > 100) {
  adminSetMessage('adminDetectCalMsg', '최근 작업 조회 수는 1~100 사이여야 합니다.', 'error');
  return;
 }
 if (!Number.isFinite(cfg.factor) || cfg.factor < 0 || cfg.factor > 0.4) {
  adminSetMessage('adminDetectCalMsg', '보정 비율은 0~0.4 사이여야 합니다.', 'error');
  return;
 }
 if (!Number.isFinite(cfg.maxReduction) || cfg.maxReduction < 0 || cfg.maxReduction > 30) {
  adminSetMessage('adminDetectCalMsg', '최대 감산은 0~30 사이여야 합니다.', 'error');
  return;
 }
 if (!Number.isFinite(cfg.floor) || cfg.floor < 0 || cfg.floor > 100) {
  adminSetMessage('adminDetectCalMsg', '최저 표시값은 0~100 사이여야 합니다.', 'error');
  return;
 }
 adminSetMessage('adminDetectCalMsg', '저장 중...', 'info');
 adminSetBusy(button, true, '저장 중');
 try {
  const data = await adminPost('/admin/update-detect-calibration', { config: cfg });
  adminSetDetectCalibrationForm(data.config || cfg);
  adminSetMessage('adminDetectCalMsg', '저장 완료 · ' + adminDetectCalibrationExample(data.config || cfg), 'success');
 } catch (e) {
  adminSetMessage('adminDetectCalMsg', e.message || '감지 보정 설정 저장에 실패했습니다.', 'error');
 } finally {
  adminSetBusy(button, false);
 }
};

const adminGptReasoningValues = ['none', 'low', 'medium', 'high', 'xhigh', 'max', 'default'];

function adminGptSetValue(id, value) {
 const el = document.getElementById(id);
 if (!el) return;
 const v = value == null ? '' : String(value);
 if (el.tagName === 'SELECT' && v && !Array.from(el.options).some(opt => opt.value === v)) {
  const opt = document.createElement('option');
  opt.value = v;
  opt.textContent = v + ' (저장값)';
  el.appendChild(opt);
 }
 el.value = v;
}

function adminGptSetChecked(id, value) {
 const el = document.getElementById(id);
 if (el) el.checked = value === true;
}

function adminGptReasoning(value, fallback) {
 const v = String(value || '').toLowerCase();
 return adminGptReasoningValues.includes(v) ? v : fallback;
}

function adminSetGptRuntimeForm(cfg) {
 cfg = cfg || {};
 const models = cfg.models || {};
 const reasoning = cfg.reasoning || {};
 const cache = cfg.cache || {};
 const escalation = cfg.escalation || {};
 const source = document.getElementById('adminGptRuntimeSource');
 if (source) source.textContent = cfg.source || '-';

 adminGptSetValue('adminGptModelHumanizePrimary', models.humanizePrimary || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelHumanizeEscalation', models.humanizeEscalation || 'gpt-5.6-terra');
 adminGptSetValue('adminGptModelJudge', models.judge || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelJudgeEscalation', models.judgeEscalation || 'gpt-5.6-terra');
 adminGptSetValue('adminGptModelRepair', models.repair || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelClassify', models.classify || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelDetect', models.detect || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelDetectEscalation', models.detectEscalation || 'gpt-5.6-terra');
 adminGptSetValue('adminGptModelEvidenceSearch', models.evidenceSearch || 'gpt-5.6-luna');
 adminGptSetValue('adminGptModelEvidenceEscalation', models.evidenceEscalation || 'gpt-5.6-terra');

 adminGptSetValue('adminGptReasonHumanize', adminGptReasoning(reasoning.humanize, 'medium'));
 adminGptSetValue('adminGptReasonFactDense', adminGptReasoning(reasoning.factDense, 'high'));
 adminGptSetValue('adminGptReasonEscalation', adminGptReasoning(reasoning.escalation, 'high'));
 adminGptSetValue('adminGptReasonJudge', adminGptReasoning(reasoning.judge, 'medium'));
 adminGptSetValue('adminGptReasonRepair', adminGptReasoning(reasoning.repair, 'medium'));
 adminGptSetValue('adminGptReasonClassify', adminGptReasoning(reasoning.classify, 'low'));
 adminGptSetValue('adminGptReasonDetect', adminGptReasoning(reasoning.detect, 'low'));
 adminGptSetValue('adminGptReasonEvidenceSearch', adminGptReasoning(reasoning.evidenceSearch, 'medium'));

 adminGptSetChecked('adminGptCacheEnabled', cache.enabled !== false);
 adminGptSetValue('adminGptCachePrefix', cache.keyPrefix || 'gp-v9-cksafe-ko-p20260704');
 adminGptSetValue('adminGptCacheRetention', cache.retention || '');

 adminGptSetChecked('adminGptEscalationEnabled', escalation.enabled !== false);
 adminGptSetValue('adminGptEscLongTextChars', escalation.longTextChars || 9000);
 adminGptSetValue('adminGptEscProtectedTermThreshold', escalation.protectedTermThreshold || 35);
 adminGptSetValue('adminGptEscPatchTargetThreshold', escalation.patchTargetThreshold || 12);

 const cacheLabel = cache.enabled === false ? '캐싱 꺼짐' : '캐싱 켜짐';
 adminSetMessage('adminGptRuntimeMsg', `GPT 운영 중 · ${models.humanizePrimary || 'gpt-5.6-luna'} · ${cacheLabel}`, 'info');
}

function adminReadGptRuntimeForm() {
 const value = (id, fallback) => {
  const raw = document.getElementById(id)?.value;
  return raw == null || String(raw).trim() === '' ? fallback : String(raw).trim();
 };
 const num = (id, fallback) => {
  const n = Number(document.getElementById(id)?.value);
  return Number.isFinite(n) ? n : fallback;
 };
 return {
  models: {
   humanizePrimary: value('adminGptModelHumanizePrimary', 'gpt-5.6-luna'),
   humanizeEscalation: value('adminGptModelHumanizeEscalation', 'gpt-5.6-terra'),
   judge: value('adminGptModelJudge', 'gpt-5.6-luna'),
   judgeEscalation: value('adminGptModelJudgeEscalation', 'gpt-5.6-terra'),
   repair: value('adminGptModelRepair', 'gpt-5.6-luna'),
   classify: value('adminGptModelClassify', 'gpt-5.6-luna'),
   detect: value('adminGptModelDetect', 'gpt-5.6-luna'),
   detectEscalation: value('adminGptModelDetectEscalation', 'gpt-5.6-terra'),
   evidenceSearch: value('adminGptModelEvidenceSearch', 'gpt-5.6-luna'),
   evidenceEscalation: value('adminGptModelEvidenceEscalation', 'gpt-5.6-terra')
  },
  reasoning: {
   humanize: value('adminGptReasonHumanize', 'medium'),
   factDense: value('adminGptReasonFactDense', 'high'),
   escalation: value('adminGptReasonEscalation', 'high'),
   judge: value('adminGptReasonJudge', 'medium'),
   repair: value('adminGptReasonRepair', 'medium'),
   classify: value('adminGptReasonClassify', 'low'),
   detect: value('adminGptReasonDetect', 'low'),
   evidenceSearch: value('adminGptReasonEvidenceSearch', 'medium')
  },
  cache: {
   enabled: document.getElementById('adminGptCacheEnabled')?.checked !== false,
   keyPrefix: value('adminGptCachePrefix', 'gp-v9-cksafe-ko-p20260704'),
   retention: value('adminGptCacheRetention', '')
  },
  escalation: {
   enabled: document.getElementById('adminGptEscalationEnabled')?.checked !== false,
   longTextChars: num('adminGptEscLongTextChars', 9000),
   protectedTermThreshold: num('adminGptEscProtectedTermThreshold', 35),
   patchTargetThreshold: num('adminGptEscPatchTargetThreshold', 12)
  }
 };
}

window.loadAdminGptRuntimeConfig = async function() {
 if (!window.isAdmin()) return;
 const msg = document.getElementById('adminGptRuntimeMsg');
 if (msg) msg.textContent = '불러오는 중...';
 try {
  const data = await adminPost('/admin/gpt-runtime-config', {});
  adminSetGptRuntimeForm(data.config || {});
  window._adminLoadedGptConfig = adminReadGptRuntimeForm();
 } catch (e) {
  adminSetMessage('adminGptRuntimeMsg', e.message || '운영 LLM 설정을 불러오지 못했습니다.', 'error');
 }
};

window.adminSaveGptRuntimeConfig = async function() {
 if (!window.isAdmin()) return;
 const button = document.getElementById('adminGptSaveButton');
 if (button && button.disabled) return;
 const cfg = adminReadGptRuntimeForm();
 if (cfg.escalation.protectedTermThreshold < 1 || cfg.escalation.protectedTermThreshold > 120 || cfg.escalation.patchTargetThreshold < 1 || cfg.escalation.patchTargetThreshold > 12) {
  adminSetMessage('adminGptRuntimeMsg', '보호표현 기준은 1~120, 패치 대상 기준은 1~12 사이여야 합니다.', 'error');
  return;
 }
 const before = JSON.stringify(window._adminLoadedGptConfig || {});
 const after = JSON.stringify(cfg);
 if (before === after) {
  adminSetMessage('adminGptRuntimeMsg', '변경된 설정이 없습니다.', 'info');
  return;
 }
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '운영 LLM 설정을 바꿀까요?', message: '새 요청부터 즉시 적용됩니다. 저장 전 현재 입력값 테스트를 권장합니다.', confirmText: '운영에 저장' })
  : confirm('운영 LLM 설정을 저장할까요? 새 요청부터 즉시 적용됩니다.');
 if (!ok) return;
 adminSetMessage('adminGptRuntimeMsg', '저장 중...', 'info');
 adminSetBusy(button, true, '저장 중');
 try {
  const data = await adminPost('/admin/update-gpt-runtime-config', { config: cfg });
  adminSetGptRuntimeForm(data.config || cfg);
  window._adminLoadedGptConfig = adminReadGptRuntimeForm();
  adminSetMessage('adminGptRuntimeMsg', 'GPT 운영 설정 저장 완료', 'success');
 } catch (e) {
  adminSetMessage('adminGptRuntimeMsg', e.message || '운영 LLM 설정 저장에 실패했습니다.', 'error');
 } finally {
  adminSetBusy(button, false);
 }
};

window.adminTestGptRuntimeConfig = async function() {
 if (!window.isAdmin()) return;
 const button = document.getElementById('adminGptTestButton');
 if (button && button.disabled) return;
 const cfg = adminReadGptRuntimeForm();
 const task = document.getElementById('adminGptTestTask')?.value || 'detect';
 adminSetMessage('adminGptRuntimeMsg', '테스트 호출 중...', 'info');
 adminSetBusy(button, true, '테스트 중');
 try {
  const data = await adminPost('/admin/test-gpt-runtime-config', { config: cfg, task });
  const result = data.result || {};
  const meta = result.meta || {};
  const model = meta.selectedModel || meta.model || result.selectedModel || data.selectedModel || (task === 'detect' ? cfg.models.detect : cfg.models.humanizePrimary);
  const succeeded = task === 'humanize'
   ? result.status === 'done' && !!String(result.outputText || '').trim()
   : result.ok !== false && result.status !== 'error' && result.status !== 'blocked';
  const statusText = succeeded ? '성공' : `실패${result.status ? ` (${result.status})` : ''}`;
  adminSetMessage('adminGptRuntimeMsg', `테스트 ${statusText} · ${task} · ${model}`, succeeded ? 'success' : 'error');
 } catch (e) {
  adminSetMessage('adminGptRuntimeMsg', e.message || 'GPT 런타임 테스트 호출에 실패했습니다.', 'error');
 } finally {
  adminSetBusy(button, false);
 }
};

let adminLabPollToken = 0;

function adminLabSetStatus(text, type) {
 const el = document.getElementById('adminLabStatus');
 if (!el) return;
 el.textContent = text || '';
 el.className = 'gp-admin-msg' + (type ? ' ' + type : '');
}

function adminLabSetBusy(busy) {
 const buttons = [document.getElementById('adminLabRunBtn'), document.getElementById('adminLabHeaderRunBtn')].filter(Boolean);
 const profile = document.getElementById('adminLabProfile')?.value || 'preserve_lab';
 const idleText = profile === 'copykiller_naturalness_lab'
  ? '카피킬러 자연성 테스트 실행'
  : profile === 'ko_quality_pattern_lab'
  ? '한국어 품질 패턴 엔진 테스트 실행'
  : profile === 'gpt_engine'
   ? 'GPT 전용 엔진 테스트 실행'
   : profile === 'final_report_engine' ? '최종보고서 엔진 테스트 실행' : '보존형 테스트 실행';
 buttons.forEach(btn => {
  btn.disabled = !!busy;
  btn.textContent = busy ? '테스트 진행 중...' : idleText;
 });
}

function adminLabModeLabel(mode) {
 if (mode === 'blog') return '기본 휴머나이징';
 if (mode === 'polish') return '원문 보존 다듬기';
 return '고급 휴머나이징';
}

function adminLabProfileLabel(profile) {
 if (profile === 'copykiller_naturalness_lab' || profile === 'ck_naturalness_lab' || profile === 'naturalness_lab') return '카피킬러 자연성 테스트 모드';
 if (profile === 'ko_quality_pattern_lab' || profile === 'quality_pattern_lab') return '한국어 품질 패턴 엔진 v1';
 if (profile === 'gpt_engine' || profile === 'gpt_prod') return 'GPT 전용 엔진';
 if (profile === 'final_report_engine' || profile === 'report_engine' || profile === 'final_report') return '최종 개선보고서 엔진';
 return '보존형 실험 엔진';
}

function adminLabReadForm() {
 const text = (document.getElementById('adminLabInput')?.value || '').trim();
 const profile = document.getElementById('adminLabProfile')?.value || 'preserve_lab';
 const mode = document.getElementById('adminLabMode')?.value || 'blog';
 const lang = document.getElementById('adminLabLang')?.value || 'ko';
 const memo = (document.getElementById('adminLabMemo')?.value || '').trim();
 const niklQualityTest = document.getElementById('adminLabNiklQualityTest')?.checked === true;
 const layoutNlpTest = document.getElementById('adminLabLayoutNlpTest')?.checked === true;
 return { text, profile, mode, lang, memo, niklQualityTest, layoutNlpTest };
}

function adminLabRenderChips(items) {
 const wrap = document.getElementById('adminLabMetaChips');
 if (!wrap) return;
 wrap.innerHTML = '';
 (items || []).filter(Boolean).forEach(txt => {
  const chip = document.createElement('span');
  chip.className = 'gp-admin-lab-chip';
  chip.textContent = txt;
  wrap.appendChild(chip);
 });
}

function adminLabRenderDiff(compare) {
 const el = document.getElementById('adminLabDiffSummary');
 if (!el) return;
 if (!compare || compare.enabled !== true) {
  el.hidden = true;
  el.innerHTML = '';
  return;
 }
 const len = compare.length || {};
 const para = compare.paragraphs || {};
 const sent = compare.sentences || {};
 const q = compare.niklQualityTest || {};
 const official = q.official || {};
 const qp = compare.qualityPattern || {};
 const natural = compare.naturalness || {};
 const layout = compare.layoutFormat || {};
 const keyword = compare.keywords || {};
 const added = (keyword.added || []).slice(0, 10).map(escapeHtml).join(', ');
 const removed = (keyword.removed || []).slice(0, 10).map(escapeHtml).join(', ');
 const increased = (qp.increasedPatterns || []).slice(0, 5).map(p => escapeHtml(p.label || p.id || '')).filter(Boolean).join(', ');
 const reduced = (qp.reducedPatterns || []).slice(0, 5).map(p => escapeHtml(p.label || p.id || '')).filter(Boolean).join(', ');
 const naturalIncreased = (natural.increasedPatterns || []).slice(0, 5).map(p => escapeHtml(p.label || p.id || '')).filter(Boolean).join(', ');
 const naturalReduced = (natural.reducedPatterns || []).slice(0, 5).map(p => escapeHtml(p.label || p.id || '')).filter(Boolean).join(', ');
 const labels = compare.labels || {};
 const layoutEngines = layout.engines || {};
 const engineStatus = name => {
  const e = layoutEngines[name] || {};
  if (!layout.enabled) return '';
  return `${name} ${e.ok ? 'ON' : 'OFF'}`;
 };
 const pct = v => `${Math.round((Number(v) || 0) * 100)}%`;
 const signed = v => {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : ''}${n.toLocaleString('ko-KR')}`;
 };
 const signedFixed = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return `${n > 0 ? '+' : ''}${n.toFixed(3)}`;
 };
 el.hidden = false;
  el.innerHTML = `
  <b>OFF/ON 비교${labels.baseline || labels.test ? ` · ${escapeHtml(labels.baseline || 'OFF')} vs ${escapeHtml(labels.test || 'ON')}` : ''}</b>
  <div class="gp-admin-lab-diff-row">
    <span class="gp-admin-lab-diff-pill">길이 ${signed(len.delta)}자</span>
    <span class="gp-admin-lab-diff-pill">문단 ${signed(para.delta)}</span>
    <span class="gp-admin-lab-diff-pill">문단 변화 ${pct(para.changedRatio)}</span>
    <span class="gp-admin-lab-diff-pill">문장 변화 ${pct(sent.changedRatio)}</span>
    ${q.niklRiskDelta != null ? `<span class="gp-admin-lab-diff-pill">품질 위험 변화 ${Number(q.niklRiskDelta).toFixed(3)}</span>` : ''}
    ${official.riskDelta != null ? `<span class="gp-admin-lab-diff-pill">공식자료 위험 변화 ${Number(official.riskDelta).toFixed(3)}</span>` : ''}
    ${q.action ? `<span class="gp-admin-lab-diff-pill">판정 ${escapeHtml(q.action)}</span>` : ''}
    ${qp.enabled ? `<span class="gp-admin-lab-diff-pill">패턴 위험 ${signedFixed(qp.riskDelta)}</span>` : ''}
    ${qp.enabled ? `<span class="gp-admin-lab-diff-pill">감소 ${Number(qp.reducedCount || 0)} / 증가 ${Number(qp.increasedCount || 0)}</span>` : ''}
    ${qp.action ? `<span class="gp-admin-lab-diff-pill">감사 ${escapeHtml(qp.action)}</span>` : ''}
    ${natural.enabled ? `<span class="gp-admin-lab-diff-pill">자연성 위험 ${signedFixed(natural.riskDelta)}</span>` : ''}
    ${natural.enabled ? `<span class="gp-admin-lab-diff-pill">자연성 감소 ${Number(natural.reducedCount || 0)} / 증가 ${Number(natural.increasedCount || 0)}</span>` : ''}
    ${natural.action ? `<span class="gp-admin-lab-diff-pill">자연성 감사 ${escapeHtml(natural.action)}</span>` : ''}
    ${natural.protectedTermLossCount ? `<span class="gp-admin-lab-diff-pill">자연성 보호표현 손실 ${Number(natural.protectedTermLossCount || 0)}</span>` : ''}
    ${qp.protectedTermLossCount ? `<span class="gp-admin-lab-diff-pill">보호표현 손실 ${Number(qp.protectedTermLossCount || 0)}</span>` : ''}
    ${qp.grammarHardError?.introduced ? `<span class="gp-admin-lab-diff-pill">문법 hard error</span>` : ''}
    ${qp.externalApiHintsUsed ? `<span class="gp-admin-lab-diff-pill">외부 API 힌트 사용</span>` : ''}
    ${layout.enabled ? `<span class="gp-admin-lab-diff-pill">레이아웃 ${layout.outputChanged ? '변경' : '유지'}</span>` : ''}
    ${layout.post?.profile ? `<span class="gp-admin-lab-diff-pill">형태 ${escapeHtml(layout.post.profile)}</span>` : ''}
    ${layout.post?.needScore != null ? `<span class="gp-admin-lab-diff-pill">형태 필요도 ${Number(layout.post.needScore).toFixed(3)}</span>` : ''}
    ${layout.enabled ? `<span class="gp-admin-lab-diff-pill">${escapeHtml(engineStatus('kss'))}</span>` : ''}
    ${layout.enabled ? `<span class="gp-admin-lab-diff-pill">${escapeHtml(engineStatus('kiwipiepy'))}</span>` : ''}
    ${layout.enabled ? `<span class="gp-admin-lab-diff-pill">${escapeHtml(engineStatus('pykospacing'))}</span>` : ''}
  </div>
  ${added || removed ? `<div class="gp-admin-lab-diff-list">${added ? `<div>ON에서 추가된 표현: ${added}</div>` : ''}${removed ? `<div>ON에서 줄거나 빠진 표현: ${removed}</div>` : ''}</div>` : ''}
  ${qp.enabled && (reduced || increased || (qp.warnings || []).length) ? `<div class="gp-admin-lab-diff-list">
    ${reduced ? `<div>줄어든 품질 패턴: ${reduced}</div>` : ''}
    ${increased ? `<div>늘어난 품질 패턴: ${increased}</div>` : ''}
    ${(qp.warnings || []).length ? `<div>감사 경고: ${(qp.warnings || []).slice(0, 8).map(escapeHtml).join(', ')}</div>` : ''}
  </div>` : ''}
  ${natural.enabled && (naturalReduced || naturalIncreased || (natural.warnings || []).length) ? `<div class="gp-admin-lab-diff-list">
    ${naturalReduced ? `<div>줄어든 자연성 위험: ${naturalReduced}</div>` : ''}
    ${naturalIncreased ? `<div>늘어난 자연성 위험: ${naturalIncreased}</div>` : ''}
    ${(natural.warnings || []).length ? `<div>자연성 감사 경고: ${(natural.warnings || []).slice(0, 8).map(escapeHtml).join(', ')}</div>` : ''}
  </div>` : ''}
  ${layout.enabled ? `<div class="gp-admin-lab-diff-list">
    <div>입력 복원: ${layout.inputChanged ? '적용' : '변경 없음'} · 출력 후처리: ${layout.outputChanged ? '적용' : '변경 없음'}</div>
    ${layout.post?.after ? `<div>줄/문단 변화: ${Number(layout.post.before?.lines || 0)}→${Number(layout.post.after?.lines || 0)}줄, ${Number(layout.post.before?.paragraphs || 0)}→${Number(layout.post.after?.paragraphs || 0)}문단</div>` : ''}
  </div>` : ''}
 `;
}

function adminLabRenderResult(st) {
 const result = (st && st.result) || {};
 const out = document.getElementById('adminLabOutput');
 if (out) out.value = result.outputText || '';
 const baselineWrap = document.getElementById('adminLabBaselineWrap');
 const baselineOut = document.getElementById('adminLabBaselineOutput');
 const baselineText = result.baselineOutputText || '';
 if (baselineWrap) baselineWrap.hidden = !baselineText;
 if (baselineOut) baselineOut.value = baselineText;
 const outputLabel = document.getElementById('adminLabOutputLabel');
 if (outputLabel) outputLabel.textContent = baselineText ? '테스트 결과 ON' : '결과문';
 const diffCompare = result.naturalnessCompare || result.qualityPatternCompare || result.layoutFormatCompare || result.niklQualityCompare;
 if (diffCompare && result.layoutFormatCompare?.layoutFormat && !diffCompare.layoutFormat) {
  adminLabRenderDiff({ ...diffCompare, layoutFormat: result.layoutFormatCompare.layoutFormat });
 } else {
  adminLabRenderDiff(diffCompare);
 }
 const jobId = document.getElementById('adminLabJobId');
 if (jobId) jobId.textContent = st.jobId ? '#' + String(st.jobId).slice(0, 6).toUpperCase() : '';
 const engineMeta = result.finalReportEngine || result.preserveLab || result.humanizeMeta || {};
 const profile = result.adminLabProfile || result.styleProfile || engineMeta.profile || 'preserve_lab';
 const gates = engineMeta.gates || result.humanizeMeta?.gates || {};
 const ckReasons = (gates.ck && gates.ck.reasons) || [];
 const surfaceReasons = (gates.surface && gates.surface.reasons) || [];
 const riskFlags = engineMeta.riskFlags || result.humanizeMeta?.riskFlags || [];
 adminLabRenderChips([
  '엔진 ' + adminLabProfileLabel(profile),
  '모드 ' + adminLabModeLabel(st.mode || 'formal'),
  '프로필 ' + (result.styleProfile || profile),
  engineMeta.path ? '경로 ' + engineMeta.path : '',
  engineMeta.strength ? '강도 ' + engineMeta.strength : '',
  engineMeta.decision ? '판단 ' + engineMeta.decision : '',
  riskFlags.length ? '위험 플래그 ' + riskFlags.length : '',
  result.niklQualityCompare ? '국어원식 비교 ON' : '',
  result.niklQualityTest?.action ? '국어원식 ' + result.niklQualityTest.action : '',
  result.qualityPatternCompare ? '품질 패턴 비교 ON' : '',
  result.qualityPatternLab?.action ? '품질 패턴 ' + result.qualityPatternLab.action : '',
  result.naturalnessCompare ? '자연성 비교 ON' : '',
  result.naturalnessLab?.action ? '자연성 ' + result.naturalnessLab.action : '',
  result.layoutFormatCompare ? '문서 형태 비교 ON' : '',
  result.layoutFormat?.post?.applied ? '문서 형태 후처리 적용' : '',
  result.layoutFormat?.post?.nlp?.sentenceEngine ? '문장분리 ' + result.layoutFormat.post.nlp.sentenceEngine : '',
  result.layoutFormat?.post?.nlp?.spacingEngine ? '띄어쓰기 ' + result.layoutFormat.post.nlp.spacingEngine : '',
  result.externalApiHintsUsed ? '외부 API 힌트 사용' : '',
  result.protectedTermReport?.lossCount ? '보호표현 손실 ' + result.protectedTermReport.lossCount : '',
  result.grammarHardError?.introduced ? '문법 hard error' : '',
  result.compressionFallback ? '압축 폴백' : '',
  result.chunkCount != null ? '청크 ' + result.chunkCount : '',
  result.fallbackCount ? '청크 폴백 ' + result.fallbackCount : '',
  ckReasons.length ? 'CK 되돌림 ' + ckReasons.length : '',
  surfaceReasons.length ? '표면 게이트 ' + surfaceReasons.length : ''
 ]);
 const meta = {
  status: st.status,
  mode: st.mode,
  stage: st.stage,
  gates: Array.isArray(st.gates) ? st.gates : [],
  gateDetail: st.gateDetail || null,
  deliveryDecision: st.engineMeta?.deliveryDecision || result.engineMeta?.deliveryDecision || result.humanizeMeta?.engineMeta?.deliveryDecision || null,
  deliveryReasonCodes: st.engineMeta?.deliveryReasonCodes || result.engineMeta?.deliveryReasonCodes || result.humanizeMeta?.engineMeta?.deliveryReasonCodes || [],
  result: {
   styleProfile: result.styleProfile,
   adminLabProfile: result.adminLabProfile,
   adminHumanizeLab: result.adminHumanizeLab,
   compressionFallback: result.compressionFallback,
   chunkCount: result.chunkCount,
   fallbackCount: result.fallbackCount,
   preserveLab: result.preserveLab,
   finalReportEngine: result.finalReportEngine,
   humanizeMeta: result.humanizeMeta,
   niklQualityTest: result.niklQualityTest,
   niklQuality: result.niklQuality,
   niklQualityCompare: result.niklQualityCompare,
   qualityPatternLab: result.qualityPatternLab,
   qualityPatternCompare: result.qualityPatternCompare,
   naturalnessLab: result.naturalnessLab,
   naturalnessCompare: result.naturalnessCompare,
   naturalnessProfileBefore: result.naturalnessProfileBefore,
   naturalnessProfileAfter: result.naturalnessProfileAfter,
   naturalnessDelta: result.naturalnessDelta,
   naturalnessAuditTrail: result.naturalnessAuditTrail,
   naturalnessProtectedTermReport: result.naturalnessProtectedTermReport,
   layoutNlpTest: result.layoutNlpTest,
   layoutFormat: result.layoutFormat,
   layoutFormatCompare: result.layoutFormatCompare,
   qualityProfileBefore: result.qualityProfileBefore,
   qualityProfileAfter: result.qualityProfileAfter,
   patternDelta: result.patternDelta,
   auditTrail: result.auditTrail,
   protectedTermReport: result.protectedTermReport,
   claimStrengthDrift: result.claimStrengthDrift,
   rhetoricalInsertion: result.rhetoricalInsertion,
   grammarHardError: result.grammarHardError,
   externalApiHintsUsed: result.externalApiHintsUsed,
   baselineHumanizeMeta: result.baselineHumanizeMeta,
   baselineFloorReport: result.baselineFloorReport,
   floorReport: result.floorReport
  },
  note: st.note || ''
 };
 const pre = document.getElementById('adminLabMetaJson');
 if (pre) pre.textContent = JSON.stringify(meta, null, 2);
}

async function adminLabToken(force) {
 if (!window.CU || !window.isAdmin()) throw new Error('관리자 권한이 필요합니다.');
 return await window.CU.getIdToken(!!force);
}

async function adminLabPoll(jobId, tokenId) {
 let idToken = await adminLabToken(false);
 const deadline = Date.now() + 6 * 3600 * 1000;
 while (Date.now() < deadline && tokenId === adminLabPollToken) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  let res = await fetch(window.apiUrl('/transform/' + jobId), {
   headers: { Authorization: 'Bearer ' + idToken }
  });
  if (res.status === 401) {
   idToken = await adminLabToken(true);
   res = await fetch(window.apiUrl('/transform/' + jobId), {
    headers: { Authorization: 'Bearer ' + idToken }
   });
  }
  const st = await res.json().catch(() => ({}));
  st.jobId = jobId;
  if (!res.ok || st.error && !st.status) throw new Error(st.error || '작업 상태를 불러오지 못했습니다.');
  if (st.status === 'queued') {
   adminLabSetStatus(`대기 중 · ${st.queuePosition || '-'}번째`, 'info');
   continue;
  }
  if (st.status === 'running') {
   adminLabSetStatus(st.stage || '처리 중...', 'info');
   continue;
  }
  if (st.status === 'done') {
   adminLabRenderResult(st);
   adminLabSetStatus('완료', 'success');
   adminLabSetBusy(false);
   return;
  }
  if (st.status === 'blocked') {
   adminLabRenderResult(st);
   adminLabSetStatus(st.reason || '게이트에 차단되었습니다.', 'error');
   adminLabSetBusy(false);
   return;
  }
  if (st.status === 'error' || st.status === 'cancelled') {
   throw new Error(st.error || '작업이 중단되었습니다.');
  }
 }
 throw new Error('작업이 예상보다 오래 걸립니다. 잠시 후 다시 확인해 주세요.');
}

window.adminHumanizeLabCount = function() {
 const text = document.getElementById('adminLabInput')?.value || '';
 const el = document.getElementById('adminLabInputCount');
 if (el) el.textContent = `${text.length.toLocaleString('ko-KR')}자`;
};

window.adminHumanizeLabClear = function() {
 adminLabPollToken++;
 const input = document.getElementById('adminLabInput');
 const output = document.getElementById('adminLabOutput');
 const baselineOutput = document.getElementById('adminLabBaselineOutput');
 const baselineWrap = document.getElementById('adminLabBaselineWrap');
 const diff = document.getElementById('adminLabDiffSummary');
 const outputLabel = document.getElementById('adminLabOutputLabel');
 const memo = document.getElementById('adminLabMemo');
 if (input) input.value = '';
 if (output) output.value = '';
 if (baselineOutput) baselineOutput.value = '';
 if (baselineWrap) baselineWrap.hidden = true;
 if (diff) { diff.hidden = true; diff.innerHTML = ''; }
 if (outputLabel) outputLabel.textContent = '결과문';
 if (memo) memo.value = '';
 const pre = document.getElementById('adminLabMetaJson');
 if (pre) pre.textContent = '{}';
 const jobId = document.getElementById('adminLabJobId');
 if (jobId) jobId.textContent = '';
 adminLabRenderChips([]);
 adminLabSetStatus('', '');
 adminLabSetBusy(false);
 window.adminHumanizeLabCount();
};

window.adminHumanizeLabCopy = async function() {
 const text = document.getElementById('adminLabOutput')?.value || '';
 if (!text) return;
 await navigator.clipboard.writeText(text);
 if (window.gpToast) window.gpToast('결과를 복사했습니다.', { type: 'success', title: '복사 완료' });
 else alert('복사했습니다.');
};

window.adminHumanizeLabSyncProfile = function() {
 adminLabSetBusy(false);
 const profile = document.getElementById('adminLabProfile')?.value || 'preserve_lab';
 adminLabRenderChips(['엔진 ' + adminLabProfileLabel(profile)]);
};

window.adminHumanizeLabRun = async function() {
 if (!window.CU || !window.isAdmin()) {
  adminLabSetStatus('관리자 권한이 필요합니다.', 'error');
  return;
 }
 const form = adminLabReadForm();
 const minLen = form.mode === 'formal' ? 200 : 50;
 if (form.text.length < minLen) {
  adminLabSetStatus(`이 모드는 최소 ${minLen}자가 필요합니다.`, 'error');
  return;
 }
 adminLabPollToken++;
 const tokenId = adminLabPollToken;
 adminLabSetBusy(true);
 const forceCompare = form.profile === 'ko_quality_pattern_lab' || form.profile === 'copykiller_naturalness_lab' || form.layoutNlpTest;
 adminLabSetStatus((form.niklQualityTest || forceCompare) ? '작업 시작 중... OFF/ON 비교를 위해 2회 실행합니다.' : '작업 시작 중...', 'info');
 const out = document.getElementById('adminLabOutput');
 if (out) out.value = '';
 const baselineOut = document.getElementById('adminLabBaselineOutput');
 const baselineWrap = document.getElementById('adminLabBaselineWrap');
 const diff = document.getElementById('adminLabDiffSummary');
 const outputLabel = document.getElementById('adminLabOutputLabel');
 if (baselineOut) baselineOut.value = '';
 if (baselineWrap) baselineWrap.hidden = true;
 if (diff) { diff.hidden = true; diff.innerHTML = ''; }
 if (outputLabel) outputLabel.textContent = '결과문';
 adminLabRenderChips(['시작 준비', form.niklQualityTest ? '국어원식 비교 ON' : '', form.profile === 'ko_quality_pattern_lab' ? '품질 패턴 비교 ON' : '', form.profile === 'copykiller_naturalness_lab' ? '자연성 비교 ON' : '', form.layoutNlpTest ? '문서 형태 NLP ON' : '']);
 try {
  const idToken = await adminLabToken(true);
  const res = await fetch(window.apiUrl('/transform'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({
    text: form.text,
    adminLabProfile: form.profile,
    mode: form.mode,
    lang: form.lang,
    memo: form.memo,
    adminHumanizeLab: true,
    niklQualityTest: form.niklQualityTest,
    layoutNlpTest: form.layoutNlpTest,
    humanizeExperiment: true,
    evidence: false,
    length: 'keep'
   })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || '테스트 작업을 시작하지 못했습니다.');
  const jobId = data.jobId;
  const jobEl = document.getElementById('adminLabJobId');
  if (jobEl && jobId) jobEl.textContent = '#' + String(jobId).slice(0, 6).toUpperCase();
  adminLabSetStatus(data.job && data.job.status === 'queued' ? '대기열에 들어갔습니다.' : '처리 중...', 'info');
  await adminLabPoll(jobId, tokenId);
 } catch (e) {
  if (tokenId === adminLabPollToken) {
   adminLabSetStatus(e.message || '테스트 실행에 실패했습니다.', 'error');
   adminLabSetBusy(false);
  }
 }
};

window.loadAdminHumanizeLab = async function() {
 const el = document.getElementById('adminHumanizeLabContent');
 if (!el) return;
 el.style.display = 'block';
 window.scrollTo(0, 0);
 const gate = document.getElementById('adminLabGateMsg');
 if (!window.CU) {
  if (gate) { gate.hidden = false; gate.textContent = '로그인이 필요합니다.'; }
  showScreen('login');
  return;
 }
 if (!window.isAdmin()) {
  if (gate) { gate.hidden = false; gate.textContent = '관리자 권한이 필요합니다.'; }
  return;
 }
 if (gate) { gate.hidden = true; gate.textContent = ''; }
 window.adminHumanizeLabSyncProfile();
 window.adminHumanizeLabCount();
};

// 관리자 탭: 선택한 영역만 조회한다. 숨겨진 품질 2,000건·원장 1,000건을
// 관리자 진입 때마다 모두 요청하던 구조를 탭별 지연 로딩으로 바꾼다.
const ADMIN_TABS = ['overview', 'incidents', 'billing', 'users', 'quality', 'ledger', 'coupons', 'settings', 'labs', 'patches'];
const ADMIN_TAB_CACHE_MS = 45000;
const ADMIN_FILTER_IDS = ['adminSignupCreditWindow','adminOpsHours','adminOpsSeverity','adminOpsDomain','adminOpsQuery','adminOpsOnlyOpen','adminJobsFilter','adminJobsHours','adminQualityHours','adminQualityMode','adminQualityStatus','adminDateFrom','adminDateTo','adminEmailFilter','adminHistoryType','adminHistoryPageSize'];
window._adminTabLoadState = window._adminTabLoadState || {};

function adminRememberFilters() {
 const values = {};
 ADMIN_FILTER_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (el) values[id] = el.type === 'checkbox' ? el.checked : el.value;
 });
 try { sessionStorage.setItem('gpAdminFilters', JSON.stringify(values)); } catch (_) {}
}

function adminRestoreFilters() {
 let values = {};
 try { values = JSON.parse(sessionStorage.getItem('gpAdminFilters') || '{}'); } catch (_) {}
 ADMIN_FILTER_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (!el || values[id] === undefined) return;
  if (el.type === 'checkbox') el.checked = !!values[id];
  else {
   el.value = values[id];
   // 영역 옵션은 첫 API 응답 뒤 생성된다. 옵션이 아직 없어서 값이 사라져도
   // 의도한 복원값을 보관했다가 gpOpsRenderDomains에서 다시 적용한다.
   if (id === 'adminOpsDomain' && values[id] && el.value !== values[id]) el.dataset.restoredValue = values[id];
  }
 });
 const pageSize = document.getElementById('adminHistoryPageSize');
 if (pageSize) window._adminHistory = { ...(window._adminHistory || {}), pageSize: parseInt(pageSize.value, 10) || 25 };
}

function adminTabLoaders(tab) {
 return ({
  overview: [window.loadAdminOverview, window.loadAdminOverviewHealth, window.loadAdminSignupCreditSummary, window.loadAdminRefundSummary, window.loadAdminCreditUsageSummary],
  incidents: [window.loadAdminOpsLogs, window.loadAdminJobs],
  billing: [window.loadAdminOverview, window.loadAdminRefundList],
  users: [],
  quality: [window.loadAdminHumanizeQuality],
  ledger: [window.loadAllCreditHistory],
  coupons: [window.loadCouponBatches],
  settings: [window.loadAdminGptRuntimeConfig, window.loadAdminDetectCalibration],
  labs: [window.loadAdminWritingPolicies, window.loadAdminWritingMetrics],
  patches: [window.adminFilterPatches]
 })[tab] || [];
}

window.adminLoadTab = async function(tab, options) {
 const force = !!(options && options.force);
 const state = window._adminTabLoadState[tab] || {};
 if (!force && state.promise) return state.promise;
 if (!force && state.loadedAt && Date.now() - state.loadedAt < ADMIN_TAB_CACHE_MS) return;
 const runId = adminNumber(state.runId) + 1;
 const status = document.getElementById('adminTabStatus');
 if (status && window._adminActiveTab === tab) status.textContent = '데이터를 불러오는 중입니다.';
 const panels = [...document.querySelectorAll(`#adminContent [data-admin-tab="${tab}"]`)];
 panels.forEach(panel => panel.setAttribute('aria-busy', 'true'));
 const loaders = adminTabLoaders(tab).filter(fn => typeof fn === 'function');
 const promise = Promise.allSettled(loaders.map(fn => fn())).then(results => {
  const current = window._adminTabLoadState[tab] || {};
  if (current.runId !== runId) return results;
  const rejected = results.filter(result => result.status === 'rejected').length;
  const renderedFailure = panels.some(panel =>
   panel.querySelector('[data-load-state="error"], .gp-admin-error-text, .gp-admin-msg.error')
  );
  const statusFailure = !!(status && window._adminActiveTab === tab && status.textContent && status.textContent !== '데이터를 불러오는 중입니다.');
  const failed = rejected + (renderedFailure || statusFailure ? 1 : 0);
  window._adminTabLoadState[tab] = { loadedAt: failed ? 0 : Date.now(), promise: null, runId };
  panels.forEach(panel => panel.removeAttribute('aria-busy'));
  if (status && window._adminActiveTab === tab) {
   const existing = status.textContent;
   status.textContent = failed
    ? (existing && existing !== '데이터를 불러오는 중입니다.' ? existing : `${failed}개 영역을 불러오지 못했습니다. 현재 화면 새로고침으로 다시 시도하세요.`)
    : '';
  }
  const updated = document.getElementById('adminLastUpdated');
  if (updated && !failed) updated.textContent = `마지막 갱신 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  return results;
 }).catch(error => {
  const current = window._adminTabLoadState[tab] || {};
  if (current.runId !== runId) return;
  window._adminTabLoadState[tab] = { loadedAt: 0, promise: null, runId };
  panels.forEach(panel => panel.removeAttribute('aria-busy'));
  if (status && window._adminActiveTab === tab) status.textContent = error.message || '데이터를 불러오지 못했습니다.';
 });
 window._adminTabLoadState[tab] = { loadedAt: state.loadedAt || 0, promise, runId };
 return promise;
};

function adminSyncTabPanels() {
 ADMIN_TABS.forEach(tab => {
  const owner = document.querySelector(`#adminTabs [data-tab="${tab}"]`);
  const panels = [...document.querySelectorAll(`#adminContent [data-admin-tab="${tab}"]`)];
  panels.forEach((panel, index) => {
   if (!panel.id) panel.id = `adminPanel-${tab}-${index + 1}`;
   panel.setAttribute('role', 'tabpanel');
   if (owner?.id) panel.setAttribute('aria-labelledby', owner.id);
  });
  if (owner) owner.setAttribute('aria-controls', panels.map(panel => panel.id).join(' '));
 });
}

window.adminSwitchTab = function(tab, options) {
 if (tab === 'ops') tab = 'overview';
 if (!ADMIN_TABS.includes(tab)) tab = 'overview';
 window._adminActiveTab = tab;
 try { sessionStorage.setItem('gpAdminTab', tab); } catch (e) {}
 document.querySelectorAll('#adminContent [data-admin-tab]').forEach(s => {
  const selected = s.dataset.adminTab === tab;
  s.hidden = !selected;
  s.style.display = selected ? '' : 'none';
  s.setAttribute('role', 'tabpanel');
  const owner = document.querySelector(`#adminTabs [data-tab="${s.dataset.adminTab}"]`);
  if (owner?.id) s.setAttribute('aria-labelledby', owner.id);
 });
 document.querySelectorAll('#adminTabs .gp-admin-tab').forEach(b => {
  const selected = b.dataset.tab === tab;
  b.classList.toggle('active', selected);
  b.setAttribute('aria-selected', selected ? 'true' : 'false');
  b.tabIndex = selected ? 0 : -1;
  if (selected && !(options && options.restore)) {
   const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
 });
 window.adminLoadTab(tab, options);
};

window.adminRefreshCurrent = async function() {
 const button = document.getElementById('adminRefreshButton');
 if (button && button.disabled) return;
 adminSetBusy(button, true, '새로고침 중');
 try {
  const tab = window._adminActiveTab || 'overview';
  window._adminTabLoadState[tab] = { ...(window._adminTabLoadState[tab] || {}), loadedAt: 0, promise: null };
  if (tab !== 'overview' && typeof window.loadAdminOverview === 'function') await window.loadAdminOverview();
  await window.adminLoadTab(tab, { force: true });
 } finally {
  adminSetBusy(button, false);
 }
};

window.adminTabsKeydown = function(event) {
 if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
 const tabs = [...document.querySelectorAll('#adminTabs [role="tab"]')];
 if (!tabs.length) return;
 const current = Math.max(0, tabs.indexOf(document.activeElement));
 const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
 event.preventDefault();
 tabs[next].focus();
 window.adminSwitchTab(tabs[next].dataset.tab);
};

window.adminFilterPatches = function() {
 const query = (document.getElementById('adminPatchQuery')?.value || '').trim().toLocaleLowerCase('ko-KR');
 const status = document.getElementById('adminPatchStatus')?.value || '';
 const releases = [...document.querySelectorAll('.gp-admin-patch-release')];
 let visible = 0;
 releases.forEach(release => {
  const matchesQuery = !query || release.textContent.toLocaleLowerCase('ko-KR').includes(query);
  const matchesStatus = !status || !!release.querySelector(`.gp-admin-patch-state.${status}`);
  release.hidden = !(matchesQuery && matchesStatus);
  if (!release.hidden) visible += 1;
 });
 document.querySelectorAll('.gp-admin-patch-month').forEach(month => {
  let sibling = month.nextElementSibling;
  let hasVisible = false;
  while (sibling && !sibling.classList.contains('gp-admin-patch-month')) {
   if (sibling.classList.contains('gp-admin-patch-release') && !sibling.hidden) hasVisible = true;
   sibling = sibling.nextElementSibling;
  }
  month.hidden = !hasVisible;
 });
 const count = document.getElementById('adminPatchMatchCount');
 if (count) count.textContent = `${visible}개 표시`;
};

window.adminTogglePatches = function(open) {
 document.querySelectorAll('.gp-admin-patch-release:not([hidden])').forEach(release => { release.open = !!open; });
};

window.loadAdminPage = async function() {
 const el = document.getElementById('adminContent');
 if (!el) return;
 const shell = document.getElementById('adminShell');
 const gate = document.getElementById('adminGateMsg');
 el.style.display = 'block';
 el.inert = false;
 if (shell) { shell.hidden = true; shell.inert = true; }
 if (!window.CU) {
  if (gate) {
   gate.hidden = false;
   gate.textContent = '로그인이 필요합니다.';
  }
  showScreen('login');
  return;
 }
 if (!window.isAdmin()) {
  if (gate) {
   gate.hidden = false;
   gate.textContent = '관리자 권한이 필요합니다.';
  }
  return;
 }
 if (gate) {
  gate.hidden = true;
  gate.textContent = '';
 }
 if (shell) { shell.hidden = false; shell.inert = false; }
 window.scrollTo(0, 0);
 let savedTab = 'overview';
 try { savedTab = sessionStorage.getItem('gpAdminTab') || 'overview'; } catch (e) {}
 if (savedTab === 'ops') savedTab = 'overview';
 const tabs = document.getElementById('adminTabs');
 if (tabs && !tabs.dataset.keyboardReady) {
  tabs.addEventListener('keydown', window.adminTabsKeydown);
  tabs.dataset.keyboardReady = '1';
 }
 adminSyncTabPanels();
 if (!el.dataset.adminFilterReady) {
  el.addEventListener('change', adminRememberFilters);
  el.dataset.adminFilterReady = '1';
 }
 if (!el.dataset.adminDetailReady) {
  el.addEventListener('toggle', event => {
   const opened = event.target;
   if (!(opened instanceof HTMLDetailsElement) || !opened.matches('.gp-admin-row-detail') || !opened.open) return;
   el.querySelectorAll('.gp-admin-row-detail[open]').forEach(details => { if (details !== opened) details.open = false; });
  }, true);
  el.addEventListener('keydown', event => {
   if (event.key !== 'Escape') return;
   const details = event.target?.closest?.('.gp-admin-row-detail[open]');
   if (!details) return;
   event.preventDefault();
   details.open = false;
   details.querySelector('summary')?.focus();
  });
  el.dataset.adminDetailReady = '1';
 }
 adminRestoreFilters();
 window.adminSwitchTab(savedTab, { restore: true });
 if (savedTab !== 'overview') window.adminLoadTab('overview');
};

// ── 장애 로그(2026-08-29) ────────────────────────────────────────────────
// 서버가 등급을 매긴 사건(Backend lib/opsEvents 카탈로그)을 목록·요약·하트비트로 보여준다.
// 목표는 "이게 심각한가"를 목록에서 바로 판단하고, 확인(ack)까지 여기서 끝내는 것.
let gpOpsQueryTimer = null;
let adminOpsGeneration = 0;
let adminOpsController = null;
window.adminOpsQueryInput = function() {
 clearTimeout(gpOpsQueryTimer);
 adminOpsGeneration += 1;
 if (adminOpsController) adminOpsController.abort();
 adminRememberFilters();
 gpOpsQueryTimer = setTimeout(() => window.loadAdminOpsLogs(), 300);
};

window.adminResetOpsFilters = function() {
 clearTimeout(gpOpsQueryTimer);
 adminOpsGeneration += 1;
 if (adminOpsController) adminOpsController.abort();
 const values = { adminOpsHours: '24', adminOpsSeverity: '', adminOpsDomain: '', adminOpsQuery: '' };
 Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
 const open = document.getElementById('adminOpsOnlyOpen');
 if (open) open.checked = false;
 const domain = document.getElementById('adminOpsDomain');
 if (domain) delete domain.dataset.restoredValue;
 adminRememberFilters();
 window.loadAdminOpsLogs();
};

function gpOpsEscape(value) {
 return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function gpOpsAgo(ms) {
 if (!ms) return '-';
 const diff = Math.max(0, Date.now() - Number(ms));
 const m = Math.floor(diff / 60000);
 if (m < 1) return '방금';
 if (m < 60) return m + '분 전';
 const h = Math.floor(m / 60);
 if (h < 24) return h + '시간 전';
 return Math.floor(h / 24) + '일 전';
}

async function gpOpsPost(path, body, options) {
 return adminPost(path, body, options);
}

window.loadAdminOpsLogs = async function() {
 const listEl = document.getElementById('adminOpsList');
 if (!listEl || !window.CU || !window.isAdmin()) return;
 const generation = ++adminOpsGeneration;
 if (adminOpsController) adminOpsController.abort();
 const controller = new AbortController();
 adminOpsController = controller;
 const hours = Number((document.getElementById('adminOpsHours') || {}).value) || 24;
 const severity = (document.getElementById('adminOpsSeverity') || {}).value || '';
 const domain = (document.getElementById('adminOpsDomain') || {}).value || '';
 const q = ((document.getElementById('adminOpsQuery') || {}).value || '').trim();
 const onlyOpen = !!(document.getElementById('adminOpsOnlyOpen') || {}).checked;
 listEl.setAttribute('aria-busy', 'true');

 try {
  const [summaryResult, logsResult] = await Promise.allSettled([
   gpOpsPost('/admin/ops-summary', { hours }, { signal: controller.signal }),
   gpOpsPost('/admin/ops-logs', { hours, severity, domain, q, onlyOpen, limit: 80 }, { signal: controller.signal })
  ]);
  if (generation !== adminOpsGeneration) return;
  if (summaryResult.status === 'fulfilled') {
   gpOpsRenderSummary(summaryResult.value);
   gpOpsRenderBeats(summaryResult.value.heartbeats || []);
  } else if (summaryResult.reason?.name !== 'AbortError') {
   const summaryEl = document.getElementById('adminOpsSummary');
   if (summaryEl) summaryEl.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">장애 요약을 불러오지 못했어요. ${gpOpsEscape(summaryResult.reason?.message || '')}</div>`;
  }
  if (logsResult.status === 'fulfilled') {
   const logs = logsResult.value;
   gpOpsRenderDomains(logs.domains || []);
   gpOpsRenderList(logs);
   const tag = document.getElementById('adminOpsSourceTag');
   if (tag) tag.textContent = logs.source === 'firestore' ? '' : '메모리 보관분';
  } else if (logsResult.reason?.name !== 'AbortError') {
   listEl.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">장애 로그를 불러오지 못했어요. ' + gpOpsEscape(logsResult.reason?.message || '') + '</div>';
  }
 } catch (e) {
  if (e?.name === 'AbortError' || generation !== adminOpsGeneration) return;
  listEl.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">장애 로그를 불러오지 못했어요. ' + gpOpsEscape(e.message || '') + '</div>';
 } finally {
  if (generation === adminOpsGeneration) listEl.removeAttribute('aria-busy');
 }
};

function gpOpsRenderSummary(s) {
 const el = document.getElementById('adminOpsSummary');
 if (!el) return;
 const sev = s.bySeverity || {};
 const alerting = s.alerting || {};
 const hook = alerting.webhook || {};
 // 알림 자체가 죽었는지 보여준다 — 예전에는 웹훅이 실패해도 아무도 몰랐다.
 const hookState = !alerting.discord
  ? '<span class="gp-ops-pill warn">디스코드 미설정</span>'
  : (hook.failed ? '<span class="gp-ops-pill warn">전송 실패 ' + hook.failed + '건</span>' : '<span class="gp-ops-pill ok">알림 정상</span>');
 const store = alerting.store || {};
 const storeState = store.writeErrors ? '<span class="gp-ops-pill warn">저장 실패 ' + store.writeErrors + '건</span>' : '';

 el.innerHTML =
  '<div class="gp-ops-cards">' +
   '<div class="gp-ops-card sev1"><b>' + (sev.SEV1 || 0) + '</b><span>SEV1 · 돈·정합성</span></div>' +
   '<div class="gp-ops-card sev2"><b>' + (sev.SEV2 || 0) + '</b><span>SEV2 · 기능 장애</span></div>' +
   '<div class="gp-ops-card sev3"><b>' + (sev.SEV3 || 0) + '</b><span>SEV3 · 기록만</span></div>' +
   '<div class="gp-ops-card open"><b>' + (s.openSev1 || 0) + '</b><span>미확인 SEV1</span></div>' +
  '</div>' +
  '<div class="gp-ops-meta">최근 ' + (s.hours || 24) + '시간 · 사건 ' + (s.incidents || 0) + '건(발생 ' + (s.occurrences || 0) + '회) ' + hookState + ' ' + storeState + '</div>' +
  (s.topEvents && s.topEvents.length
   ? '<div class="gp-ops-top">' + s.topEvents.slice(0, 5).map(t =>
      '<span class="gp-ops-topitem"><i>' + gpOpsEscape(t.event) + '</i><b>' + t.count + '</b></span>').join('') + '</div>'
  : '');
 const badge = document.getElementById('adminOpsTabBadge');
 if (badge) {
  const openCount = Number(s.openSev1 || 0);
  badge.hidden = openCount <= 0;
  badge.textContent = String(openCount);
 }
}

function gpOpsRenderBeats(beats) {
 const el = document.getElementById('adminOpsHeartbeats');
 if (!el) return;
 if (!beats.length) { el.innerHTML = '<div class="gp-ops-beatrow"><span class="gp-ops-beat unknown"><i>정기 작업</i>하트비트 기록 없음</span></div>'; return; }
 // 부재 감지: "일어나야 할 일이 안 일어난 것"은 이 줄에서만 보인다.
 el.innerHTML = '<div class="gp-ops-beatrow">' + beats.map(b => {
  const cls = b.state === 'stale' ? 'stale' : (b.state === 'ok' ? 'ok' : 'unknown');
  const label = b.state === 'stale' ? (b.ageMinutes + '분째 멈춤') : (b.state === 'ok' ? gpOpsAgo(b.lastBeatMs) : '기록 없음');
  return '<span class="gp-ops-beat ' + cls + '"><i>' + gpOpsEscape(b.label || b.name) + '</i>' + gpOpsEscape(label) + '</span>';
 }).join('') + '</div>';
}

function gpOpsRenderDomains(domains) {
 const sel = document.getElementById('adminOpsDomain');
 if (!sel) return;
 const current = sel.dataset.restoredValue || sel.value;
 const options = ['<option value="">전체 영역</option>'].concat(domains.map(d =>
  '<option value="' + gpOpsEscape(d) + '">' + gpOpsEscape(d) + '</option>'));
 sel.innerHTML = options.join('');
 if (domains.includes(current)) sel.value = current;
 delete sel.dataset.restoredValue;
}

function gpOpsRenderList(data) {
 const el = document.getElementById('adminOpsList');
 if (!el) return;
 const items = data.items || [];
 if (!items.length) {
  el.innerHTML = '<div class="gp-admin-empty">조건에 맞는 장애 기록이 없어요.</div><p class="gp-admin-limit-note">장애 목록은 선택 기간의 최근 80건을 표시합니다. 미확인 SEV1 수는 전체 요약값입니다.</p>';
  return;
 }
 el.innerHTML = items.map(item => {
  const sev = item.severity || 'SEV3';
  const ids = [
   item.uid ? ['회원', item.uid] : null,
   item.orderId ? ['주문', item.orderId] : null,
   item.jobId ? ['작업', item.jobId] : null,
   item.amount != null ? ['금액', '₩' + Number(item.amount).toLocaleString('ko-KR')] : null,
   item.credits != null ? ['크레딧', item.credits] : null,
   item.code ? ['코드', item.code] : null,
   item.stage ? ['단계', item.stage] : null,
   item.requestId ? ['requestId', item.requestId] : null,
   item.statusCode ? ['status', item.statusCode] : null
  ].filter(Boolean);
  const context = [
   item.errorName ? ['오류', item.errorName] : null,
   item.method || item.path ? ['요청', [item.method, item.path].filter(Boolean).join(' ')] : null,
   item.reason ? ['원인', item.reason] : null,
   item.authSource ? ['인증', item.authSource] : null,
   item.service ? ['서비스', item.service] : null,
   item.commit ? ['커밋', item.commit] : null,
   item.environment ? ['환경', item.environment] : null,
   item.userAgent ? ['브라우저', item.userAgent] : null
  ].filter(Boolean);
  return '' +
   '<article class="gp-ops-item ' + sev.toLowerCase() + (item.acked ? ' acked' : '') + '">' +
    '<div class="gp-ops-item-head">' +
     '<span class="gp-ops-sev ' + sev.toLowerCase() + '">' + sev + '</span>' +
     '<span class="gp-ops-domain">' + gpOpsEscape(item.domain || 'ops') + '</span>' +
     '<b class="gp-ops-event">' + gpOpsEscape(item.event) + '</b>' +
     (Number(item.count) > 1 ? '<span class="gp-ops-count">' + item.count + '건</span>' : '') +
     '<span class="gp-ops-time">' + gpOpsAgo(item.lastSeenMs || item.createdMs) + '</span>' +
    '</div>' +
    (item.message ? '<p class="gp-ops-msg">' + gpOpsEscape(item.message) + '</p>' : '') +
    (item.action ? '<p class="gp-ops-action"><i>대응</i>' + gpOpsEscape(item.action) + '</p>' : '') +
    (ids.length ? '<div class="gp-ops-ids">' + ids.map(([k, v]) =>
      '<span><i>' + gpOpsEscape(k) + '</i>' + gpOpsEscape(v) + '</span>').join('') + '</div>' : '') +
    (context.length ? '<details class="gp-ops-context"><summary>기술 정보</summary><dl>' + context.map(([k, v]) => '<div><dt>' + gpOpsEscape(k) + '</dt><dd>' + gpOpsEscape(v) + '</dd></div>').join('') + '</dl></details>' : '') +
    (item.stack ? '<details class="gp-ops-stack"><summary>스택 보기</summary><pre>' + gpOpsEscape(item.stack) + '</pre></details>' : '') +
    '<div class="gp-ops-item-foot">' +
     (item.acked
      ? '<span class="gp-ops-ackinfo">확인함 · ' + gpOpsEscape(item.ackedAt ? item.ackedAt.slice(0, 16).replace('T', ' ') : '') + '</span>' +
        (item.memoryOnly ? '' : '<button type="button" class="gp-admin-mini-btn" onclick="adminOpsAck(\'' + jsAttr(item.id) + '\', false)">확인 취소</button>')
      : (item.memoryOnly
         ? '<span class="gp-ops-ackinfo">메모리 보관분(저장 전)</span>'
         : '<button type="button" class="gp-admin-mini-btn" onclick="adminOpsAck(\'' + jsAttr(item.id) + '\', true)">확인 처리</button>')) +
    '</div>' +
   '</article>';
 }).join('') + '<p class="gp-admin-limit-note">장애 목록은 선택 기간의 최근 80건을 표시합니다. 미확인 SEV1 수는 전체 요약값입니다.</p>';
}

const adminOpsAckPending = new Set();
window.adminOpsAck = async function(id, acked) {
 if (!id) return;
 if (adminOpsAckPending.has(id)) return;
 adminOpsAckPending.add(id);
 try {
  await gpOpsPost('/admin/ops-ack', { id, acked });
  await window.loadAdminOpsLogs();
 } catch (e) {
  if (window.gpToast) window.gpToast(e.message || '확인 처리에 실패했어요.', { type: 'error' });
 } finally {
  adminOpsAckPending.delete(id);
 }
};

window.loadAdminWritingPolicies = async function() {
 const box = document.getElementById('adminWritingPolicyStatus');
 if (!box || !window.CU || !window.isAdmin()) return;
 try {
  const idToken = await window.CU.getIdToken();
  const res = await fetch(window.apiUrl('/admin/writing-lab-policies'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: '{}'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || '정책 팩 상태를 불러오지 못했습니다.');
  const registry = data.registry || {};
  const packs = Array.isArray(registry.packs) ? registry.packs : [];
  box.innerHTML = packs.map(pack => {
   const status = pack.approved && pack.validation && pack.validation.valid ? '승인·유효' : pack.validation && !pack.validation.valid ? '스키마 오류' : '담당자 승인 대기';
   const color = status === '승인·유효' ? 'var(--green)' : status === '스키마 오류' ? 'var(--red)' : 'var(--yellow)';
   const counts = pack.termCounts || {};
   const approval = pack.approval || {};
   const sources = (Array.isArray(pack.sources) ? pack.sources : []).map(source => {
    const url = /^https:\/\/(?:www\.)?(?:law\.go\.kr|ftc\.go\.kr)\//u.test(String(source.url || '')) ? source.url : '';
    const label = `${source.publisher || '공식 출처'} · ${source.title || ''}`;
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
   }).join(' · ');
   return `<div class="gp-admin-exp-copy"><b>${escapeHtml(pack.domain)} · ${escapeHtml(pack.id)}</b><span style="color:${color};font-weight:700;">${escapeHtml(status)}</span><span>담당자 ${escapeHtml(approval.owner || 'UNASSIGNED')} · 검토일 ${escapeHtml(pack.reviewedAt)} · 출처 확인 ${escapeHtml(pack.sourceCheckedAt || '-')}</span><span>기관 ${adminNumber(counts.institutions)} · 행위 ${adminNumber(counts.treatments)} · 주장 ${adminNumber(counts.claims)} · 차단 ${adminNumber(counts.blockedClaims)}</span>${sources ? `<span>${sources}</span>` : ''}</div>`;
  }).join('') + `<div class="gp-admin-exp-copy"><b>전체 출시 판정</b><span style="color:${registry.launchEligible ? 'var(--green)' : 'var(--yellow)'};font-weight:700;">${registry.launchEligible ? '정책 팩 출시 가능' : '규제 팩 자동 출시는 보류'}</span><span>${registry.pendingDomains && registry.pendingDomains.length ? '승인 대기: ' + escapeHtml(registry.pendingDomains.join(', ')) : '승인 대기 없음'}</span></div>`;
 } catch (error) {
  box.innerHTML = `<span style="color:var(--red);">${escapeHtml(error.message || '정책 팩 상태를 불러오지 못했습니다.')}</span>`;
 }
};

window.loadAdminWritingMetrics = async function() {
 const box = document.getElementById('adminWritingMetrics');
 if (!box || !window.CU || !window.isAdmin()) return;
 try {
  const idToken = await window.CU.getIdToken();
  const res = await fetch(window.apiUrl('/admin/writing-lab-metrics'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({ days: 14 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || '운영 지표를 불러오지 못했습니다.');
  const totals = { events: {}, latencyBuckets: {}, latencyTotalMs: 0, latencyCount: 0 };
  (data.rows || []).forEach(row => {
   Object.entries(row.events || {}).forEach(([key, value]) => { totals.events[key] = (totals.events[key] || 0) + adminNumber(value); });
   Object.entries(row.latencyBuckets || {}).forEach(([key, value]) => { totals.latencyBuckets[key] = (totals.latencyBuckets[key] || 0) + adminNumber(value); });
   totals.latencyTotalMs += adminNumber(row.latencyTotalMs);
   totals.latencyCount += adminNumber(row.latencyCount);
  });
  const ready = adminNumber(totals.events.GENERATE_READY);
  const failed = adminNumber(totals.events.GENERATE_FAILED);
  const finalBlocked = adminNumber(totals.events.FINAL_CHECK_BLOCKED);
  const fallback = adminNumber(totals.events.HUMANIZE_FALLBACK);
  const within45 = adminNumber(totals.latencyBuckets.lte15s) + adminNumber(totals.latencyBuckets.lte30s) + adminNumber(totals.latencyBuckets.lte45s);
  const within45Rate = totals.latencyCount ? Math.round(within45 / totals.latencyCount * 1000) / 10 : 0;
  const averageSec = totals.latencyCount ? Math.round(totals.latencyTotalMs / totals.latencyCount / 100) / 10 : 0;
  box.innerHTML = [
   ['공개 초안', ready.toLocaleString('ko-KR') + '건', '서버 Release Gate 통과'],
   ['생성 실패', failed.toLocaleString('ko-KR') + '건', '과금·성공 한도 미반영'],
   ['최종 차단', finalBlocked.toLocaleString('ko-KR') + '건', '휴머나이징·수정본 공개 보류'],
   ['안전 초안 복원', fallback.toLocaleString('ko-KR') + '건', '휴머나이징 결과 대신 이전 후보 사용'],
   ['생성 평균', averageSec.toLocaleString('ko-KR') + '초', '모델 생성과 초안 검수'],
   ['45초 이내', within45Rate.toLocaleString('ko-KR') + '%', '목표 p95 판단용 지연 구간']
  ].map(item => `<div class="gp-admin-exp-copy"><b>${escapeHtml(item[0])}</b><span style="font-weight:800;">${escapeHtml(item[1])}</span><span>${escapeHtml(item[2])}</span></div>`).join('');
 } catch (error) {
  box.innerHTML = `<span style="color:var(--red);">${escapeHtml(error.message || '운영 지표를 불러오지 못했습니다.')}</span>`;
 }
};

// 관리자: 상단 개요 바 (매출 요약)
window.loadAdminOverview = async function() {
 if (!window.isAdmin()) return;
 const todayEl = document.getElementById('adminStatRevToday');
 const monthEl = document.getElementById('adminStatRevMonth');
 if (todayEl) delete todayEl.dataset.loadState;
 try {
  const data = await adminPost('/admin/revenue-summary', {});
  const won = (n) => '₩' + adminNumber(n).toLocaleString('ko-KR');
  if (todayEl) todayEl.textContent = won(data.today.totalPaid);
  const tCnt = document.getElementById('adminStatRevTodayCnt');
  if (tCnt) tCnt.textContent = `${adminNumber(data.today.totalCount)}건${data.today.refundCount ? ` · 환불 ${data.today.refundCount}` : ''}`;
  if (monthEl) monthEl.textContent = won(data.month.totalPaid);
  const mCnt = document.getElementById('adminStatRevMonthCnt');
  if (mCnt) mCnt.textContent = `${adminNumber(data.month.totalCount)}건`;
  const monthCount = adminNumber(data.month.totalCount);
  const aov = document.getElementById('adminStatRevMonthAov');
  if (aov) aov.textContent = monthCount ? won(Math.round(adminNumber(data.month.totalPaid) / monthCount)) : '₩0';
  const refundMonth = document.getElementById('adminStatRefundMonth');
  if (refundMonth) refundMonth.textContent = won(data.month.refundAmount);
  const refundMonthCnt = document.getElementById('adminStatRefundMonthCnt');
  if (refundMonthCnt) refundMonthCnt.textContent = `${adminNumber(data.month.refundCount)}건`;
  if (todayEl) todayEl.dataset.loadState = 'ok';
 } catch (e) {
  if (todayEl) todayEl.textContent = '—';
  if (monthEl) monthEl.textContent = '—';
  ['adminStatRevMonthAov', 'adminStatRefundMonth'].forEach(id => { const node = document.getElementById(id); if (node) node.textContent = '측정 실패'; });
  const status = document.getElementById('adminTabStatus');
  if (status && window._adminActiveTab === 'overview') status.textContent = '매출 요약을 불러오지 못했습니다. 현재 화면 새로고침으로 다시 시도하세요.';
  if (todayEl) todayEl.dataset.loadState = 'error';
 }
};

window.loadAdminOverviewHealth = async function() {
 const grid = document.getElementById('adminCommandGrid');
 const line = document.getElementById('adminOverviewHealth');
 if (!grid || !window.isAdmin()) return;
 delete grid.dataset.loadState;
 grid.setAttribute('aria-busy', 'true');
 try {
  const summary = await gpOpsPost('/admin/ops-summary', { hours: 24 });
  const alerting = summary.alerting || {};
  const webhook = alerting.webhook || {};
  const beats = Array.isArray(summary.heartbeats) ? summary.heartbeats : [];
  const stale = beats.filter(item => item.state === 'stale').length;
  const missing = beats.length ? beats.filter(item => item.state !== 'ok' && item.state !== 'stale').length : 1;
  const set = (id, value, state) => {
   const el = document.getElementById(id);
   if (!el) return;
   el.textContent = value;
   el.dataset.state = state || 'ok';
  };
  set('adminAttentionSev1', `${adminNumber(summary.openSev1)}건`, adminNumber(summary.openSev1) ? 'danger' : 'ok');
  set('adminAttentionWebhook', !alerting.discord ? '미설정' : webhook.failed ? `실패 ${adminNumber(webhook.failed)}건` : '정상', (!alerting.discord || webhook.failed) ? 'danger' : 'ok');
  set('adminAttentionCron', stale ? `중단 ${stale}개` : missing ? `미측정 ${missing}개` : '정상', stale ? 'danger' : missing ? 'warn' : 'ok');
  if (line) line.textContent = `최근 24시간 사건 ${adminNumber(summary.incidents)}건 · 발생 ${adminNumber(summary.occurrences)}회 · 하트비트 ${beats.length}개`;
  const badge = document.getElementById('adminOpsTabBadge');
  if (badge) { badge.hidden = !adminNumber(summary.openSev1); badge.textContent = String(adminNumber(summary.openSev1)); }
  grid.dataset.loadState = 'ok';
 } catch (error) {
  ['adminAttentionSev1', 'adminAttentionWebhook', 'adminAttentionCron'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = '측정 실패'; el.dataset.state = 'danger'; } });
  if (line) line.textContent = `운영 상태를 불러오지 못했습니다. ${error.message || ''}`;
  grid.dataset.loadState = 'error';
 } finally {
  grid.removeAttribute('aria-busy');
 }
};

let adminSignupCreditGeneration = 0;
let adminSignupCreditController = null;
window._adminSignupCreditSummary = window._adminSignupCreditSummary || null;

function adminSignupCreditAnnounce(message) {
 const live = document.getElementById('adminSignupCreditStatus');
 if (live) live.textContent = String(message || '');
}

function adminSignupRate(count, total) {
 const denominator = Math.max(0, adminNumber(total));
 return denominator ? `${Math.round((adminNumber(count) / denominator) * 100)}%` : '—';
}

function adminSignupMinutes(value) {
 if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
 const minutes = Math.max(0, Number(value));
 if (minutes < 60) return `${Math.round(minutes)}분`;
 if (minutes < 1440) return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)}시간`;
 return `${(minutes / 1440).toFixed(1)}일`;
}

function adminSignupDate(value) {
 const milliseconds = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Date.parse(String(value || ''));
 return Number.isFinite(milliseconds) ? new Date(milliseconds).toLocaleString('ko-KR') : '—';
}

function adminSignupBalanceRows(cohort) {
 const buckets = cohort.balanceBuckets || {};
 const total = Math.max(0, adminNumber(cohort.accounts));
 const rows = [
  ['0', buckets.zero], ['1', buckets.one], ['2–5', buckets.two_to_five],
  ['6–10', buckets.six_to_ten], ['11–19', buckets.eleven_to_nineteen], ['20', buckets.full]
 ];
 return rows.map(([label, raw]) => {
  const count = Math.max(0, adminNumber(raw));
  const width = total ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return `<div class="gp-admin-signup-bar"><span>${label}크레딧</span><i><b style="width:${width}%"></b></i><strong>${count.toLocaleString('ko-KR')}명</strong></div>`;
 }).join('');
}

function adminSignupUsageRows(items, labels) {
 const rows = Array.isArray(items) ? items : [];
 if (!rows.length) return '<div class="gp-admin-signup-none">아직 사용 이벤트가 없습니다.</div>';
  return rows.slice(0, 8).map(item => {
  const key = String(item && item.key || 'unknown');
  const label = labels[key] || key;
   return `<div class="gp-admin-signup-usage-row"><span>${escapeHtml(label)}</span><strong>${adminNumber(item.events).toLocaleString('ko-KR')}건</strong><em>${adminNumber(item.credits).toLocaleString('ko-KR')}크레딧</em></div>`;
 }).join('');
}

function adminSignupQuotaCell(label, soft, hard, maximum) {
 const softCount = adminNumber(soft && soft.principalsAtOrAbove);
 const hardCount = adminNumber(hard && hard.principalsAtOrAbove);
 const state = hardCount > 0 ? 'danger' : softCount > 0 ? 'warn' : 'ok';
 return `<div class="gp-admin-signup-quota" data-state="${state}"><span>${label} 최대</span><strong>${adminNumber(maximum).toLocaleString('ko-KR')}계정</strong><em>소프트 이상 ${softCount.toLocaleString('ko-KR')}개 · 하드 이상 ${hardCount.toLocaleString('ko-KR')}개 지문</em></div>`;
}

window.adminRenderSignupCreditSummary = function() {
 const root = document.getElementById('adminSignupCreditSummary');
 const data = window._adminSignupCreditSummary;
 if (!root || !data) return;
 const selected = document.getElementById('adminSignupCreditWindow')?.value === '24' ? 'hours24' : 'days7';
 const cohort = data.cohorts && data.cohorts[selected] || {};
 const accounts = Math.max(0, adminNumber(cohort.accounts));
 const anyUse = cohort.anyUse || {};
 const firstUse = cohort.firstUse || {};
 const low = cohort.remainingAtOrBelowOne || {};
 const exhausted = cohort.exhausted || {};
 const journey = cohort.detectHumanize18 || {};
 const spend = cohort.spend || {};
 const quota = cohort.principalQuota || {};
 const soft = quota.soft || {};
 const hard = quota.hard || {};
 const maximum = quota.maxAccountsPerPrincipal || {};
 const state = data.status === 'truncated' ? 'warn' : data.status === 'empty' ? 'empty' : 'ok';
 const stateLabel = state === 'warn' ? '부분 집계' : state === 'empty' ? '측정 대기' : '측정 정상';
 const periodLabel = selected === 'hours24' ? '최근 24시간' : '최근 7일';
 const operationLabels = { detect: 'AI 감지', humanize: '기본 휴머나이징', restructure: '고급 휴머나이징', polish: '원문 보존 다듬기' };
 const modeLabels = { detect: 'AI 감지', blog: '기본', formal: '고급', polish: '원문 보존' };

 if (data.status === 'empty' || (accounts === 0 && data.status !== 'truncated')) {
  root.innerHTML = `<div class="gp-admin-signup-state"><span data-state="empty">측정 대기</span><b>${periodLabel}</b></div><div class="gp-admin-signup-empty"><strong>아직 이 구간에 신규 계정 이벤트가 없습니다.</strong><p>배포 후 계정 초기화와 무료 크레딧 사용 이벤트가 들어오면 첫 사용·잔액·접속 지문 지표가 여기에 나타납니다.</p></div><p class="gp-admin-signup-foot">서버 권위 이벤트만 집계 · 원문, UID, IP 미포함 · 마지막 조회 ${adminSignupDate(data.generatedAt)}</p>`;
   root.dataset.loadState = 'ok';
   root.removeAttribute('aria-busy');
   adminSignupCreditAnnounce(`${periodLabel} 신규 계정 이벤트가 아직 없습니다.`);
   return;
 }

 root.innerHTML = `
  <div class="gp-admin-signup-state"><span data-state="${state}">${stateLabel}</span><b>${periodLabel} · ${adminSignupDate(cohort.since)}부터</b></div>
  <dl class="gp-admin-signup-kpis">
    <div><dt>신규 계정</dt><dd>${accounts.toLocaleString('ko-KR')}명</dd><dd class="gp-admin-signup-meta">가입 지급 이벤트 기준</dd></div>
    <div><dt>첫 사용</dt><dd>${adminSignupRate(anyUse.accounts, accounts)}</dd><dd class="gp-admin-signup-meta">${adminNumber(anyUse.accounts).toLocaleString('ko-KR')}명 · 중앙 ${adminSignupMinutes(firstUse.medianMinutes)}</dd></div>
    <div><dt>감지→기본 완주</dt><dd>${adminSignupRate(journey.accounts, accounts)}</dd><dd class="gp-admin-signup-meta">18크레딧 여정 ${adminNumber(journey.accounts).toLocaleString('ko-KR')}명</dd></div>
    <div><dt>1크레딧 이하</dt><dd>${adminSignupRate(low.accounts, accounts)}</dd><dd class="gp-admin-signup-meta">완전 소진 ${adminNumber(exhausted.accounts).toLocaleString('ko-KR')}명</dd></div>
    <div><dt>첫 사용 p90</dt><dd>${adminSignupMinutes(firstUse.p90Minutes)}</dd><dd class="gp-admin-signup-meta">관측 ${adminNumber(firstUse.observedAccounts).toLocaleString('ko-KR')}명</dd></div>
  </dl>
  <div class="gp-admin-signup-grid">
   <section aria-labelledby="adminSignupBalanceTitle"><h4 id="adminSignupBalanceTitle">현재 무료 지급분 잔액</h4><div class="gp-admin-signup-bars">${adminSignupBalanceRows(cohort)}</div></section>
   <section aria-labelledby="adminSignupSpendTitle"><h4 id="adminSignupSpendTitle">소진 패턴</h4><div class="gp-admin-signup-spend"><div><b>기능별</b>${adminSignupUsageRows(spend.byOperation, operationLabels)}</div><div><b>모드별</b>${adminSignupUsageRows(spend.byMode, modeLabels)}</div></div><p>${adminNumber(spend.events).toLocaleString('ko-KR')}건 · ${adminNumber(spend.credits).toLocaleString('ko-KR')}크레딧 사용 · ${adminNumber(spend.restoredCredits).toLocaleString('ko-KR')}크레딧 복구</p></section>
  </div>
  <section class="gp-admin-signup-principal" aria-labelledby="adminSignupPrincipalTitle">
    <div><h4 id="adminSignupPrincipalTitle">접속 지문별 신규 계정</h4><p>공유 와이파이 오탐을 피하려고 하드 한도는 시간당 ${adminNumber(data.thresholds?.hard?.hourly)}개·UTC 일일 ${adminNumber(data.thresholds?.hard?.daily)}개로 유지하고, ${adminNumber(data.thresholds?.soft?.hourly)}개·${adminNumber(data.thresholds?.soft?.daily)}개부터 관측합니다.</p></div>
    <div class="gp-admin-signup-quota-grid">${adminSignupQuotaCell('1시간', soft.hourly, hard.hourly, maximum.hourly)}${adminSignupQuotaCell('일일(UTC)', soft.daily, hard.daily, maximum.daily)}</div>
  </section>
  <p class="gp-admin-signup-foot">서버 권위 이벤트만 집계 · 원문, UID, IP 미포함 · 유효 ${adminNumber(data.validEvents).toLocaleString('ko-KR')} / 스캔 ${adminNumber(data.scannedEvents).toLocaleString('ko-KR')}건${adminNumber(data.invalidEvents) ? ` · 무효 ${adminNumber(data.invalidEvents).toLocaleString('ko-KR')}건` : ''} · 마지막 조회 ${adminSignupDate(data.generatedAt)}${data.truncated ? ' · 조회 한도 이후 이벤트는 제외됨' : ''}</p>`;
  root.dataset.loadState = 'ok';
  root.removeAttribute('aria-busy');
  adminSignupCreditAnnounce(`${periodLabel} 신규 계정 ${accounts.toLocaleString('ko-KR')}명, 첫 사용 ${adminSignupRate(anyUse.accounts, accounts)}로 측정했습니다.`);
};

window.adminSignupCreditWindowChange = function() {
 adminRememberFilters();
 window.adminRenderSignupCreditSummary();
};

window.loadAdminSignupCreditSummary = async function(force) {
 const root = document.getElementById('adminSignupCreditSummary');
 if (!root || !window.isAdmin()) return;
 if (!force && window._adminSignupCreditSummary) {
  window.adminRenderSignupCreditSummary();
  return;
 }
 const generation = ++adminSignupCreditGeneration;
 if (adminSignupCreditController) adminSignupCreditController.abort();
 adminSignupCreditController = new AbortController();
 root.setAttribute('aria-busy', 'true');
 adminSignupCreditAnnounce('무료 크레딧 지표를 불러오는 중입니다.');
 delete root.dataset.loadState;
 root.innerHTML = '<div class="gp-admin-empty">측정 이벤트를 불러오는 중입니다.</div>';
 try {
  const data = await adminPost('/admin/signup-credit-summary', {}, { signal: adminSignupCreditController.signal });
  if (generation !== adminSignupCreditGeneration) return;
  window._adminSignupCreditSummary = data;
  window.adminRenderSignupCreditSummary();
 } catch (error) {
  if (error && error.name === 'AbortError') return;
  if (generation !== adminSignupCreditGeneration) return;
  root.dataset.loadState = 'error';
  root.removeAttribute('aria-busy');
  root.innerHTML = `<div class="gp-admin-signup-error"><strong>무료 크레딧 지표를 불러오지 못했습니다.</strong><p>${escapeHtml(error.message || '잠시 후 다시 시도해 주세요.')}</p><button type="button" class="gp-admin-mini-btn" onclick="loadAdminSignupCreditSummary(true)">다시 시도</button></div>`;
  adminSignupCreditAnnounce('무료 크레딧 지표를 불러오지 못했습니다.');
 }
};

// 개요: 환불 대기 수치 갱신
function adminSetRefundStat(count) {
 const stat = document.getElementById('adminStatRefund');
 if (stat) {
  stat.textContent = `${count}건`;
  stat.classList.toggle('gp-admin-ov-warn', count > 0);
 }
 const badge = document.getElementById('adminRefundCount');
 if (badge) {
  if (count > 0) { badge.hidden = false; badge.textContent = count; badge.classList.add('is-alert'); }
  else { badge.hidden = true; badge.classList.remove('is-alert'); }
 }
 const attention = document.getElementById('adminAttentionRefunds');
 if (attention) { attention.textContent = `${count}건`; attention.dataset.state = count > 0 ? 'warn' : 'ok'; }
 const tabBadge = document.getElementById('adminBillingTabBadge');
 if (tabBadge) { tabBadge.hidden = count <= 0; tabBadge.textContent = String(count); }
}

let adminUserSearchGeneration = 0;
let adminUserSearchController = null;

function adminSetUserActionsEnabled(enabled) {
 document.querySelectorAll('[data-admin-user-action]').forEach(control => { control.disabled = !enabled; });
}

window.adminSearchUser = async function(quiet) {
 const input = document.getElementById('adminUserQuery');
 const resultEl = document.getElementById('adminUserResult');
 const ordersEl = document.getElementById('adminUserOrders');
 const raw = (input?.value || window._adminSelectedUser?.uid || '').trim();
 if (!raw) {
  if (resultEl) resultEl.innerHTML = '<div class="gp-admin-empty">검색어를 입력하세요.</div>';
  return;
 }
 const generation = ++adminUserSearchGeneration;
 if (adminUserSearchController) adminUserSearchController.abort();
 adminUserSearchController = new AbortController();
 const searchButton = document.getElementById('adminUserSearchButton');
 adminSetBusy(searchButton, true, '검색 중');
 adminSetUserActionsEnabled(false);
 if (resultEl) resultEl.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 if (ordersEl) ordersEl.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/user-summary', { query: raw }, { signal: adminUserSearchController.signal });
  if (generation !== adminUserSearchGeneration) return;
  window._adminSelectedBundle = data;
  window._adminSelectedUser = data.user;
  if (input) input.value = data.user.uid || raw;
  adminSetMessage('adminCreditAdjustMsg', '', 'info');
  adminSetMessage('adminUserNotifyMsg', '', 'info');
  adminRenderUserBundle(data);
  adminSetUserActionsEnabled(true);
  window.loadAdminUserLog(data.user.uid);
  if (!quiet && window.gpTrack) window.gpTrack('admin_user_search');
 } catch (e) {
  if (e && e.name === 'AbortError') return;
  if (generation !== adminUserSearchGeneration) return;
  window._adminSelectedBundle = null;
  window._adminSelectedUser = null;
  adminSetUserActionsEnabled(false);
  const msg = escapeHtml(e.message);
  if (resultEl) resultEl.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${msg}</div>`;
  if (ordersEl) ordersEl.innerHTML = '<div class="gp-admin-empty">사용자를 먼저 선택하세요.</div>';
  const logEl = document.getElementById('adminUserLog');
  if (logEl) logEl.innerHTML = '<div class="gp-admin-empty">사용자를 먼저 선택하세요.</div>';
  const logCnt = document.getElementById('adminUserLogCount');
  if (logCnt) logCnt.textContent = '';
 } finally {
  if (generation === adminUserSearchGeneration) adminSetBusy(searchButton, false);
 }
};

// ===== 관리자: 사용자 작업 기록 =====
window._adminUserLog = { uid: null, items: [], page: 0, cursors: [0], nextCursorMs: null, loading: false };

const ADMIN_LOG_TYPE = {
 detect: { label: '탐지', cls: 'detect' },
 humanize: { label: '휴머나이징', cls: 'humanize' }
};
function adminLogTypeInfo(type) {
 return ADMIN_LOG_TYPE[type] || { label: type || '기타', cls: 'etc' };
}
function adminProbBadge(p) {
 if (typeof p !== 'number') return '';
 const v = Math.round(p);
 const cls = v <= 20 ? 'safe' : v <= 49 ? 'warn' : 'risk';
 return `<span class="gp-admin-log-prob ${cls}">AI ${v}%</span>`;
}

let adminUserLogGeneration = 0;
let adminUserLogController = null;

window.loadAdminUserLog = async function(uid, direction) {
 const el = document.getElementById('adminUserLog');
 if (!el || !uid) return;
 const st = window._adminUserLog;
 const requestKey = `${uid}:${direction || 'first'}`;
 if (st.loading && st.requestKey === requestKey) return;
 const sameUser = st.uid === uid;
 let cursors = sameUser ? (st.cursors || [0]).slice() : [0];
 let page = sameUser ? adminNumber(st.page) : 0;
 if (direction === 'next') {
  if (!st.nextCursorMs) return;
  page += 1;
  cursors[page] = st.nextCursorMs;
 } else if (direction === 'prev') {
  page = Math.max(0, page - 1);
 } else {
  page = 0;
  cursors = [0];
 }
 const cursorMs = cursors[page] || 0;
 const generation = ++adminUserLogGeneration;
 if (adminUserLogController) adminUserLogController.abort();
 adminUserLogController = new AbortController();
 window._adminUserLog = { ...st, uid, loading: true, requestKey };
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/user-history', { uid, limit: 20, cursorMs }, { signal: adminUserLogController.signal });
  if (generation !== adminUserLogGeneration || (window._adminSelectedUser?.uid && window._adminSelectedUser.uid !== uid)) return;
  window._adminUserLog = {
   uid,
   items: data.items || [],
   page,
   cursors,
   nextCursorMs: data.nextCursorMs || null,
   loading: true,
   requestKey
  };
  window.renderAdminUserLog();
  if (direction === 'next' || direction === 'prev') {
   const panel = el.closest('.gp-admin-panel');
   const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (panel) panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
 } catch (e) {
  if (e && e.name === 'AbortError') return;
  if (generation !== adminUserLogGeneration) return;
  el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 } finally {
  if (generation === adminUserLogGeneration) window._adminUserLog.loading = false;
 }
};

function adminUserLogPagerHtml() {
 const st = window._adminUserLog;
 if (!st.page && !st.nextCursorMs) return '';
 return `
  <div class="gp-admin-pager gp-admin-user-log-pager">
    <button type="button" onclick="loadAdminUserLog(window._adminUserLog.uid, 'prev')" ${st.page <= 0 ? 'disabled' : ''}>이전</button>
    <span>${adminNumber(st.page) + 1}페이지${st.nextCursorMs ? '' : ' · 끝'}</span>
    <button type="button" onclick="loadAdminUserLog(window._adminUserLog.uid, 'next')" ${st.nextCursorMs ? '' : 'disabled'}>다음</button>
  </div>`;
}

window.renderAdminUserLog = function() {
 const el = document.getElementById('adminUserLog');
 if (!el) return;
 const st = window._adminUserLog;
 const cntEl = document.getElementById('adminUserLogCount');
 if (cntEl) cntEl.textContent = st.items.length
  ? `${st.items.length}${st.nextCursorMs ? '+' : ''}건 · ${adminNumber(st.page) + 1}p`
  : '';
 if (!st.items.length) {
  el.innerHTML = '<div class="gp-admin-empty">작업 기록이 없습니다.</div>' + adminUserLogPagerHtml();
  return;
 }
 const rows = st.items.map(it => {
  const ti = adminLogTypeInfo(it.type);
  const isDetect = it.type === 'detect';
  const itemId = jsAttr(it.id);
  const detectPreview = isDetect && typeof window.gpNormalizeDetectPresentation === 'function'
   ? window.gpNormalizeDetectPresentation({ probability: it.probability, summary: it.summaryPreview || '' })
   : null;
  const preview = isDetect ? (detectPreview?.summary || it.inputPreview) : (it.outputPreview || it.inputPreview);
  const billing = historyBillingInfo(it.billingDisposition, it.credits);
  const lenInfo = isDetect
   ? `입력 ${adminNumber(it.inputLen).toLocaleString('ko-KR')}자`
   : `입력 ${adminNumber(it.inputLen).toLocaleString('ko-KR')}자 → 결과 ${adminNumber(it.outputLen).toLocaleString('ko-KR')}자`;
  return `
   <div class="gp-admin-log-item">
     <div class="gp-admin-log-head" id="logHead-${itemId}" role="button" tabindex="0" aria-expanded="false" aria-controls="logDetail-${itemId}" onclick="adminToggleLogItem('${itemId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();adminToggleLogItem('${itemId}');}">
       <div class="gp-admin-log-meta">
         <span class="gp-admin-log-badge ${ti.cls}">${escapeHtml(ti.label)}</span>
          ${adminProbBadge(it.probability)}
          ${it.calibrated ? '<span class="gp-admin-log-badge">보정</span>' : ''}
          ${!isDetect && billing.badge ? `<span class="gp-admin-log-badge">${escapeHtml(billing.badge)}</span>` : ''}
          ${!isDetect && it.qualityStatus === 'needs_review' ? '<span class="gp-admin-log-badge warn">검토 필요</span>' : ''}
          <span class="gp-admin-log-date">${escapeHtml(adminDateText(it.createdAtMs))}</span>
          <span class="gp-admin-log-sub">${escapeHtml(lenInfo)} · ${isDetect ? adminNumber(it.credits) + '크레딧' : escapeHtml(billing.short)}</span>
       </div>
       <span class="gp-admin-log-toggle" id="logToggle-${itemId}">자세히 ▾</span>
     </div>
     <div class="gp-admin-log-preview">${escapeHtml(preview) || '<span class="gp-admin-muted">내용 없음</span>'}</div>
     <div class="gp-admin-log-detail" id="logDetail-${itemId}" hidden></div>
   </div>`;
 }).join('');
 el.innerHTML = `<div class="gp-admin-log-list">${rows}</div>${adminUserLogPagerHtml()}`;
};

window.adminToggleLogItem = async function(id) {
 const box = document.getElementById('logDetail-' + id);
 const toggle = document.getElementById('logToggle-' + id);
 const head = document.getElementById('logHead-' + id);
 if (!box) return;
 if (!box.hidden) {
  box.hidden = true;
  if (toggle) toggle.textContent = '자세히 ▾';
  if (head) head.setAttribute('aria-expanded', 'false');
  return;
 }
 box.hidden = false;
 if (toggle) toggle.textContent = '접기 ▴';
 if (head) head.setAttribute('aria-expanded', 'true');
 if (box.dataset.loaded === '1') return;
 box.innerHTML = '<div class="gp-admin-empty gp-admin-empty-compact">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/user-history-item', { uid: window._adminUserLog.uid, id });
  const it = data.item || {};
  const detectView = it.type === 'detect' && typeof window.gpNormalizeDetectPresentation === 'function'
   ? window.gpNormalizeDetectPresentation(it)
   : it;
  const block = (label, text, mono) => text
   ? `<div class="gp-admin-log-block">
        <div class="gp-admin-log-block-head"><span>${escapeHtml(label)}</span><button type="button" class="gp-admin-mini-btn" onclick="adminCopyText(this)">복사</button></div>
        <div class="gp-admin-log-text${mono ? ' mono' : ''}">${escapeHtml(text)}</div>
      </div>`
   : '';
  let html = '';
  html += block('입력 원문', it.inputText, true);
  if (it.type === 'detect') {
   if (typeof detectView.probability === 'number') {
    const cal = it.probabilityCalibration || {};
    const raw = typeof it.rawProbability === 'number' ? Math.round(it.rawProbability) : null;
    const similarity = Number(cal.matchSimilarity);
    const lengthRatio = Number(cal.matchLengthRatio);
    const matchInfo = cal.match === 'near_normalized'
     ? [
       '유사 일치',
       Number.isFinite(similarity) ? `${Math.round(similarity * 1000) / 10}%` : '',
       Number.isFinite(lengthRatio) ? `길이 ${Math.round(lengthRatio * 1000) / 10}%` : ''
      ].filter(Boolean).join(' · ')
     : cal.match === 'exact_normalized'
       ? '정규화 정확 일치'
       : '작업내역 일치';
    const note = raw !== null && raw !== Math.round(detectView.probability)
     ? `<div style="margin-top:6px;color:var(--text3);font-size:12px;">원점수 ${raw}% · ${escapeHtml(matchInfo)}</div>`
     : '';
    html += `<div class="gp-admin-log-block"><div class="gp-admin-log-block-head"><span>AI 감지 확률</span></div><div class="gp-admin-log-text">${Math.round(detectView.probability)}%${note}</div></div>`;
   }
   html += block('탐지 요약', detectView.summary, false);
   html += block('탐지 상세', detectView.detail, true);
  } else {
   html += block('결과', it.outputText, true);
   html += block('결과 요약', it.humanSummary, false);
   html += block('결과 상세', it.humanDetail, true);
  }
  box.innerHTML = html || '<div class="gp-admin-empty gp-admin-empty-compact">표시할 내용이 없습니다.</div>';
  box.dataset.loaded = '1';
 } catch (e) {
  box.innerHTML = `<div class="gp-admin-empty gp-admin-empty-compact gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 }
};

function adminLegacyCopy(text) {
 const textarea = document.createElement('textarea');
 textarea.value = text;
 textarea.setAttribute('readonly', '');
 textarea.setAttribute('aria-hidden', 'true');
 textarea.style.position = 'fixed';
 textarea.style.left = '-9999px';
 textarea.style.top = '0';
 textarea.style.opacity = '0';
 textarea.style.pointerEvents = 'none';
 document.body.appendChild(textarea);
 textarea.focus();
 textarea.select();
 textarea.setSelectionRange(0, text.length);
 let copied = false;
 try {
  copied = document.execCommand('copy');
 } catch (_) {
  copied = false;
 } finally {
  textarea.remove();
 }
 return copied;
}

async function adminWriteClipboardText(text) {
 // execCommand는 deprecated지만 일부 브라우저·관리자 환경에서 Clipboard API 권한이
 // 거부될 때도 실제 버튼 클릭의 사용자 제스처 안에서 안정적으로 동작한다.
 if (adminLegacyCopy(text)) return;
 if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
  await navigator.clipboard.writeText(text);
  return;
 }
 throw new Error('CLIPBOARD_UNAVAILABLE');
}

window.adminCopyText = async function(btn) {
 const textEl = btn?.closest?.('.gp-admin-log-block')?.querySelector?.('.gp-admin-log-text');
 const text = textEl?.textContent || '';
 if (!text) {
  if (window.gpToast) window.gpToast('복사할 내용이 없습니다.', { type: 'error', title: '복사 실패' });
  return;
 }
 try {
  await adminWriteClipboardText(text);
  const prev = btn.textContent;
  btn.textContent = '복사됨';
  setTimeout(() => { btn.textContent = prev; }, 1200);
 } catch (_) {
  if (window.gpToast) window.gpToast('브라우저에서 복사를 허용하지 않았습니다.', { type: 'error', title: '복사 실패' });
  else alert('복사 실패');
 }
};

// ===== 관리자: 작업 모니터 (transformJobArchive) =====
const ADMIN_JOB_STATUS = {
 queued: { l: '대기 중', c: 'wait' },
 running: { l: '진행 중', c: 'run' },
 awaiting_approval: { l: '승인 대기', c: 'wait' },
 done: { l: '완료', c: 'done' },
 error: { l: '오류·중단', c: 'err' },
 blocked: { l: '차단', c: 'err' },
 cancelled: { l: '취소', c: 'muted' }
};
window._adminJobsPager = { key: '', page: 0, cursors: [0], nextCursorMs: null, hasMore: false };
let adminJobsGeneration = 0;
let adminJobsController = null;
window.adminResetJobFilters = function() {
 const status = document.getElementById('adminJobsFilter');
 const hours = document.getElementById('adminJobsHours');
 if (status) status.value = 'issues';
 if (hours) hours.value = '24';
 adminRememberFilters();
 window.loadAdminJobs();
};

window.loadAdminJobs = async function(direction) {
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminJobsBody');
 if (!el) return;
 const filter = document.getElementById('adminJobsFilter')?.value || 'issues';
 const hours = parseInt(document.getElementById('adminJobsHours')?.value, 10) || 24;
 const key = `${filter}|${hours}`;
 const prevState = window._adminJobsPager || { key: '', page: 0, cursors: [0] };
 let cursors = prevState.key === key ? (prevState.cursors || [0]).slice() : [0];
 let page = prevState.key === key ? adminNumber(prevState.page) : 0;
 if (direction === 'next') {
  if (!prevState.nextCursorMs) return;
  page += 1;
  cursors[page] = prevState.nextCursorMs;
 } else if (direction === 'prev') {
  page = Math.max(0, page - 1);
 } else {
  page = 0;
  cursors = [0];
 }
 const cursorMs = cursors[page] || 0;
 const generation = ++adminJobsGeneration;
 if (adminJobsController) adminJobsController.abort();
 const controller = new AbortController();
 adminJobsController = controller;
 el.setAttribute('aria-busy', 'true');
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/jobs', { filter, hours, limit: 25, cursorMs }, { signal: controller.signal });
  if (generation !== adminJobsGeneration) return;
  window._adminJobsPager = { key, page, cursors, nextCursorMs: data.nextCursorMs || null, hasMore: !!data.hasMore };
  window._adminJobs = data;
  renderAdminJobs(data);
 } catch (e) {
  if (e?.name === 'AbortError' || generation !== adminJobsGeneration) return;
  el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 } finally {
  if (generation === adminJobsGeneration) el.removeAttribute('aria-busy');
 }
};
window.adminCloseJobDetail = function(button) {
 const details = button?.closest?.('.gp-admin-row-detail');
 if (!details) return;
 details.open = false;
 details.querySelector('summary')?.focus();
};

function adminJobsPagerHtml(data) {
 const st = window._adminJobsPager || { page: 0, hasMore: false };
 if (!st.page && !data.hasMore) return '';
 return `
  <div class="gp-admin-pager gp-admin-jobs-pager">
    <button type="button" onclick="loadAdminJobs('prev')" ${st.page <= 0 ? 'disabled' : ''}>이전</button>
    <span>${adminNumber(st.page) + 1}페이지${data.hasMore ? '' : ' · 끝'}</span>
    <button type="button" onclick="loadAdminJobs('next')" ${data.hasMore ? '' : 'disabled'}>다음</button>
  </div>`;
}

function renderAdminJobs(data) {
 const el = document.getElementById('adminJobsBody');
 if (!el) return;
 const cnt = document.getElementById('adminJobsCount');
 const st = window._adminJobsPager || { page: 0 };
 if (cnt) cnt.textContent = data.count ? `${data.count}${data.hasMore ? '+' : ''} · ${adminNumber(st.page) + 1}p` : '';
 if (!data.rows || !data.rows.length) {
  el.innerHTML = '<div class="gp-admin-empty">해당 조건의 작업이 없습니다.</div>' + adminJobsPagerHtml(data);
  return;
 }
 const charged = data.chargedCount || 0;
 const rows = data.rows.map(r => {
   const s = ADMIN_JOB_STATUS[r.status] || { l: r.status || '-', c: 'muted' };
   const billing = historyBillingInfo(r.billingDisposition, r.needed);
   const detail = [
    ['엔진', r.engineVersion],
    ['요청/적용', [ADMIN_MODE_LABELS[r.requestedMode] || r.requestedMode, ADMIN_MODE_LABELS[r.effectiveMode] || r.effectiveMode].filter(Boolean).join(' → ')],
    ['글 종류', ADMIN_PROFILE_LABELS[r.documentProfile] || r.documentProfile],
    ['처리 시간', r.processingDurationMs ? adminQualityDuration(r.processingDurationMs) : ''],
    ['길이', r.sourceLength || r.inputLength ? `${adminNumber(r.sourceLength || r.inputLength)} → ${adminNumber(r.resultLength || r.outputLength)}자` : ''],
    ['실질 편집', r.substantiveEditRatio == null ? '' : adminQualityPercent(r.substantiveEditRatio)],
    ['청크', r.editableChunkCount == null ? '' : `${adminNumber(r.approvedModelChunkCount)}/${adminNumber(r.editableChunkCount)} 승인 · 실패 ${adminNumber(r.modelFailureChunkCount)}`],
    ['구조', r.structureSignaturePass === true ? '통과' : r.structureSignaturePass === false ? `오류 ${adminNumber(r.sectionPathErrorCount)}` : ''],
    ['품질/효과', [r.qualityStatus, r.effectStatus].filter(Boolean).join(' · ')],
    ['예상 API 비용', r.estimatedUsd == null ? '' : `$${Number(r.estimatedUsd).toFixed(4)}`]
   ].filter(([, value]) => value);
   return `<tr>
    <td><input type="checkbox" class="gp-admin-job-cb" data-uid="${jsAttr(r.uid)}" aria-label="${escapeHtml(r.email || (r.uid || '').slice(0, 8))} 작업 선택"></td>
    <td>${escapeHtml(r.email || '(이메일 없음)')}<br><span class="muted">${escapeHtml((r.uid || '').slice(0, 8))}</span></td>
    <td><span class="gp-admin-jobst ${s.c}">${escapeHtml(s.l)}</span></td>
    <td>${r.billingDisposition
      ? `<span class="${r.deducted ? 'gp-admin-neg' : 'muted'}">${escapeHtml(billing.short)}</span>`
      : (r.deducted ? '<span class="gp-admin-neg">⚠ 차감</span>' : '<span class="muted">—</span>')}</td>
    <td class="num">${adminNumber(r.needed)}</td>
    <td class="muted">${escapeHtml(r.stage || '')}</td>
    <td class="muted">${escapeHtml(adminDateText(r.createdAtMs))}</td>
    <td><details class="gp-admin-row-detail"><summary>상세</summary><div class="gp-admin-row-detail-panel"><button type="button" class="gp-admin-detail-close" aria-label="작업 상세 닫기" onclick="adminCloseJobDetail(this)">×</button><dl>${detail.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><button type="button" class="gp-admin-mini-btn" onclick="adminOpenUser('${jsAttr(r.uid)}')">사용자 열기</button></div></details></td>
  </tr>`;
 }).join('');
 el.innerHTML = `
  <div class="gp-admin-jobs-bar">
    <label class="gp-admin-jobs-all"><input type="checkbox" onclick="adminJobsToggleAll(this)" aria-label="현재 페이지 작업 전체 선택"> 전체 선택</label>
    <button type="button" class="gp-admin-primary" onclick="adminNotifyAffected()">선택 사용자에게 알림</button>
    <span class="gp-admin-jobs-note ${charged ? 'alert' : ''}">${charged ? `⚠ 실제 차감된 작업 ${charged}건 — 확인 필요` : '차감된 작업 없음'}</span>
  </div>
  <div class="gp-admin-table-wrap" tabindex="0" aria-label="작업 목록 가로 스크롤"><table class="gp-admin-table gp-admin-jobs-table"><caption>선택 기간의 작업 상태와 과금 정보</caption>
   <thead><tr><th scope="col">선택</th><th scope="col">사용자</th><th scope="col">상태</th><th scope="col">차감</th><th scope="col" class="num">크레딧</th><th scope="col">단계</th><th scope="col">시각</th><th scope="col">세부</th></tr></thead>
   <tbody>${rows}</tbody>
  </table></div>
  ${adminJobsPagerHtml(data)}`;
}

// ===== 관리자: 휴머나이징 품질 관측(원문·결과 미포함) =====
const ADMIN_PROFILE_LABELS = {
 academic_paper: '논문·학술', report_assignment: '과제·보고서',
 long_explainer: '전문 설명·장문 해설', clinical_record: '임상·전문 기록',
 legal_contract: '계약서·약관',
 student_record_teacher: '세특·교사 관찰', student_self_assessment: '학생 자기평가',
 resume_application: '자소서·지원서', personal_essay: '개인 에세이',
 review_blog: '후기·블로그', marketing: '홍보·광고', social: 'SNS',
 mail_notice: '메일·안내', creative: '시·창작', general: '일반', unknown: '미분류'
};
const ADMIN_MODE_LABELS = { blog: '기본', formal: '고급', polish: '다듬기', assignment: '격식 처리', unknown: '미상' };

function adminQualityLoadingHtml() {
 return '<div class="gp-admin-quality-skeleton" aria-label="품질 통계를 불러오는 중"><span></span><span></span><span></span><span></span></div>';
}

function adminQualityPercent(value, signed) {
 if (value === null || value === undefined || value === '') return '—';
 const number = Number(value);
 if (!Number.isFinite(number)) return '—';
 const percent = number * 100;
 const prefix = signed && percent > 0 ? '+' : '';
 return prefix + percent.toFixed(Math.abs(percent) < 10 ? 1 : 0) + '%';
}

function adminQualityDuration(value) {
 const ms = Number(value);
 if (!Number.isFinite(ms) || ms < 0) return '—';
 const seconds = Math.round(ms / 1000);
 if (seconds < 60) return `${seconds}초`;
 const minutes = Math.floor(seconds / 60);
 const remain = seconds % 60;
 return `${minutes}분${remain ? ` ${remain}초` : ''}`;
}

function adminQualityAverage(report, field, signed) {
 return adminQualityPercent(report?.metrics?.[field]?.average, signed);
}

function adminQualityMetricAverage(metrics, field, signed) {
 return adminQualityPercent(metrics?.[field]?.average, signed);
}

function adminQualityStat(label, value, detail, alert) {
 return `<div class="gp-admin-quality-stat${alert ? ' is-alert' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><em>${escapeHtml(detail || '')}</em></div>`;
}

function adminQualityCodeList(title, rows, emptyText) {
 const items = (Array.isArray(rows) ? rows : []).slice(0, 10);
 return `<div class="gp-admin-quality-code-group"><h4>${escapeHtml(title)}</h4>${items.length
  ? '<ol>' + items.map(item => `<li><code>${escapeHtml(item.code || '')}</code><b>${adminNumber(item.count)}</b></li>`).join('') + '</ol>'
  : `<p>${escapeHtml(emptyText || '기록 없음')}</p>`}</div>`;
}

let adminQualityGeneration = 0;
let adminQualityController = null;
window.adminResetQualityFilters = function() {
 const hours = document.getElementById('adminQualityHours');
 const mode = document.getElementById('adminQualityMode');
 const status = document.getElementById('adminQualityStatus');
 if (hours) hours.value = '24';
 if (mode) mode.value = '';
 if (status) status.value = '';
 adminRememberFilters();
 window.loadAdminHumanizeQuality();
};

window.loadAdminHumanizeQuality = async function() {
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminHumanizeQualityBody');
 if (!el) return;
 const generation = ++adminQualityGeneration;
 if (adminQualityController) adminQualityController.abort();
 const controller = new AbortController();
 adminQualityController = controller;
 const hours = parseInt(document.getElementById('adminQualityHours')?.value, 10) || 24;
 el.setAttribute('aria-busy', 'true');
 el.innerHTML = adminQualityLoadingHtml();
 try {
  const data = await adminPost('/admin/humanize-quality', { hours, limit: 2000 }, { signal: controller.signal });
  if (generation !== adminQualityGeneration) return;
  window._adminHumanizeQuality = data;
  renderAdminHumanizeQuality(data);
 } catch (e) {
  if (e?.name === 'AbortError' || generation !== adminQualityGeneration) return;
  el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 } finally {
  if (generation === adminQualityGeneration) el.removeAttribute('aria-busy');
 }
};

function renderAdminHumanizeQuality(data) {
 const el = document.getElementById('adminHumanizeQualityBody');
 if (!el) return;
 const report = data?.report;
 const summary = report?.summary || {};
 const selectedMode = document.getElementById('adminQualityMode')?.value || '';
 const selectedStatus = document.getElementById('adminQualityStatus')?.value || '';
 const total = adminNumber(summary.total);
 const count = document.getElementById('adminQualityCount');
 if (count) count.textContent = total ? `${total}${data?.truncated ? '+' : ''}건` : '';
 if (!report || !total) {
  el.innerHTML = '<div class="gp-admin-empty">선택한 기간에 집계할 휴머나이징 작업이 없습니다.</div>';
  return;
 }

 const latest = report.latestEngine;
 const latestMetrics = latest?.metrics || {};
 const latestNaturalness = Number(latestMetrics?.naturalnessOverallRiskDelta?.average);
 const latestRhythm = Number(latestMetrics?.rhythmUniformityDelta?.average);
 const latestReviewRate = Number(latest?.needsReviewRate);
 const latestEngineSummary = latest ? `
  <section class="gp-admin-quality-cohort" aria-label="최신 엔진 품질 표본">
   <div class="gp-admin-quality-cohort-head">
    <div><strong>최신 엔진 표본</strong><code>${escapeHtml(latest.engineVersion || '미상')}</code></div>
    <span>${adminNumber(latest.rowCount)}건${adminNumber(latest.rowCount) < 10 ? ' · 소표본' : ''}</span>
   </div>
   <dl>
    <div class="${latestReviewRate > .1 ? 'is-alert' : ''}"><dt>검토 필요</dt><dd>${adminQualityPercent(latest.needsReviewRate)}</dd><small>${adminNumber(latest.needsReviewCount)}건</small></div>
    <div><dt>실질 편집</dt><dd>${adminQualityMetricAverage(latestMetrics, 'substantiveEditRatio')}</dd><small>표면 교체 제외</small></div>
    <div class="${latestNaturalness > 0 ? 'is-alert' : ''}"><dt>자연성 위험</dt><dd>${adminQualityMetricAverage(latestMetrics, 'naturalnessOverallRiskDelta', true)}</dd><small>작업 당시 산식 · 0 이하 개선</small></div>
    <div class="${latestRhythm > 0 ? 'is-alert' : ''}"><dt>리듬 균일화</dt><dd>${adminQualityMetricAverage(latestMetrics, 'rhythmUniformityDelta', true)}</dd><small>작업 당시 산식 · 0 이하 개선</small></div>
    <div class="${adminNumber(latest.structureSignatureFailureCount) > 0 ? 'is-alert' : ''}"><dt>구조 서명 오류</dt><dd>${adminNumber(latest.structureSignatureFailureCount)}건</dd><small>최신 엔진만</small></div>
    <div class="${adminNumber(latest.koreanRefinementFailureCount) > 0 ? 'is-alert' : ''}"><dt>한국어 잔여</dt><dd>${adminNumber(latest.koreanRefinementFailureCount)}건</dd><small>최신 엔진만</small></div>
   </dl>
   <p>아래 ‘조회 전체’에는 선택 기간에 실행된 이전 엔진 결과도 함께 포함됩니다. shadow 값은 작업 당시 엔진 산식으로 저장되며, 보정 산식은 v2.5.31 신규 작업부터 반영됩니다. 최신 표본이 10건 미만이면 방향 확인용으로만 보세요.</p>
  </section>` : '';

  const stats = [
   adminQualityStat('조회 전체 · 작업', total.toLocaleString('ko-KR') + '건', `완료 ${adminNumber(summary.completedCount)}건${data.truncated ? ' · 조회 상한 도달' : ''}`),
   adminQualityStat('조회 전체 · 검토 필요', adminQualityPercent(summary.needsReviewRate), `${adminNumber(summary.needsReviewCount)}건 · 엔진 혼합`, Number(summary.needsReviewRate) > .1),
   adminQualityStat('기술 차단', `${adminNumber(summary.technicalBlockedCount ?? summary.blockedCount)}건`, `전체 상태 차단 ${adminNumber(summary.blockedCount)}건`, Number(summary.technicalBlockedCount ?? summary.blockedCount) > 0),
   adminQualityStat('효과 제한', `${adminNumber(summary.deliveredLimitedEffectCount ?? summary.limitedEffectCount)}건`, `깊이 목표 미달 ${adminNumber(summary.depthBelowMinimumCount)}건`, false),
   adminQualityStat('승인 편집 0 과금', `${adminNumber(summary.zeroApprovedChargedCount)}건`, '반드시 0건이어야 함', adminNumber(summary.zeroApprovedChargedCount) > 0),
   adminQualityStat('모델 전실패', `${adminNumber(summary.allModelFailureCount)}건`, '기술 차단 대상', adminNumber(summary.allModelFailureCount) > 0),
   adminQualityStat('구조 서명 오류', `${adminNumber(summary.structureSignatureFailureCount)}건`, `절 경로 오류 ${adminNumber(summary.sectionPathErrorDocumentCount)}건`, adminNumber(summary.structureSignatureFailureCount) > 0),
   adminQualityStat('과거 정책 무차감', adminQualityPercent(summary.waivedRate), `${adminNumber(summary.waivedCount)}건 · 신규 생성 안 함`, false),
   adminQualityStat('동일 문장 상한 초과', `${adminNumber(summary.carryoverOverLimitCount)}건`, '일반 산문 정책 기준', adminNumber(summary.carryoverOverLimitCount) > 0),
   adminQualityStat('섹션 회복 적용', `${adminNumber(summary.sectionRecoveryAppliedCount)}건`, `시도 문서 ${adminNumber(summary.sectionRecoveryAttemptedCount)}건`),
   adminQualityStat('평균 실질 편집', adminQualityAverage(report, 'substantiveEditRatio'), '문자 표면 교체 제외'),
   adminQualityStat('평균 동일 문장 잔존', adminQualityAverage(report, 'substantiveCarryoverRatio'), '제목·표·목록·인용 제외'),
   adminQualityStat('평균 구조 변화', adminQualityAverage(report, 'structuralChangedSentenceRatio'), '절·어순·호흡 기준'),
   adminQualityStat('정형 표현 개선', adminQualityAverage(report, 'rhetoricalRemediationCoverage'), '원문의 반복 결론·상투 표현 대상'),
   adminQualityStat('반복 어휘 치환', `${adminNumber(summary.lexicalTransitionDocumentCount)}건`, `평균 ${adminNumber(report?.metrics?.lexicalTransitionCount?.average).toFixed(2)}회 · 관측 전용`),
   adminQualityStat('세특 문장 조각', `${adminNumber(summary.studentRecordFragmentDocumentCount)}건`, '불완전 명사형 문장 잔존'),
   adminQualityStat('기능문 중복 인사', `${adminNumber(summary.functionalGreetingDuplicationDocumentCount)}건`, '공지·메일 첫 인사 반복'),
   adminQualityStat('인접 의미 반복', `${adminNumber(summary.adjacentSemanticRepetitionDocumentCount)}건`, '연속 문장·문단의 같은 내용'),
   adminQualityStat('p95 처리 시간', adminQualityDuration(report?.metrics?.processingDurationMs?.p95), '실제 실행 시작~완료'),
  adminQualityStat('조회 전체 · 자연성 위험', adminQualityAverage(report, 'naturalnessOverallRiskDelta', true), 'shadow 지표 · 엔진 혼합', Number(report?.metrics?.naturalnessOverallRiskDelta?.average) > 0),
  adminQualityStat('조회 전체 · 리듬 균일화', adminQualityAverage(report, 'rhythmUniformityDelta', true), 'shadow 지표 · 엔진 혼합', Number(report?.metrics?.rhythmUniformityDelta?.average) > 0)
 ].join('');

 const filteredCross = (report.requestedModeDocumentProfileEngineQuality || []).filter(row =>
  (!selectedMode || row.requestedMode === selectedMode) && (!selectedStatus || row.qualityStatus === selectedStatus)
 );
 const crossRows = filteredCross.slice(0, 60).map(row => `<tr>
  <td>${escapeHtml(ADMIN_MODE_LABELS[row.requestedMode] || row.requestedMode || '미상')}</td>
  <td>${escapeHtml(ADMIN_PROFILE_LABELS[row.documentProfile] || row.documentProfile || '미분류')}</td>
  <td><code>${escapeHtml(row.engineVersion || '미상')}</code></td>
  <td><span class="gp-admin-quality-status ${row.qualityStatus === 'needs_review' ? 'warn' : row.qualityStatus === 'clean' ? 'clean' : 'muted'}">${row.qualityStatus === 'needs_review' ? '검토 필요' : row.qualityStatus === 'clean' ? '정상' : escapeHtml(row.qualityStatus || '미측정')}</span></td>
  <td class="num">${adminNumber(row.count)}</td>
 </tr>`).join('');

  const filteredRecent = (report.recent || []).filter(row =>
   (!selectedMode || row.requestedMode === selectedMode) && (!selectedStatus || row.qualityStatus === selectedStatus)
  );
  const recentRows = filteredRecent.slice(0, 80).map(row => `<tr>
  <td class="muted">${escapeHtml(adminDateText(row.createdAtMs))}</td>
  <td>${escapeHtml(ADMIN_MODE_LABELS[row.requestedMode] || row.requestedMode || '미상')}</td>
  <td>${escapeHtml(ADMIN_PROFILE_LABELS[row.documentProfile] || row.documentProfile || '미분류')}</td>
   <td><span class="gp-admin-quality-status ${row.effectStatus === 'limited' ? 'warn' : row.effectStatus === 'normal' ? 'clean' : 'muted'}">${row.effectStatus === 'limited' ? '제한' : row.effectStatus === 'normal' ? '정상' : '미측정'}</span></td>
   <td class="num">${adminQualityPercent(row.substantiveEditRatio)}</td>
   <td class="num">${adminNumber(row.approvedModelChunkCount)} / ${adminNumber(row.editableChunkCount)}</td>
   <td class="num">${adminNumber(row.modelFailureChunkCount)}</td>
   <td><span class="gp-admin-quality-status ${row.structureSignaturePass === false ? 'warn' : row.structureSignaturePass === true ? 'clean' : 'muted'}">${row.structureSignaturePass === false ? `오류 ${adminNumber(row.sectionPathErrorCount)}` : row.structureSignaturePass === true ? '통과' : '미측정'}</span></td>
  <td>${row.koreanRefinementPass === false
    ? '<span class="gp-admin-quality-status warn">확인</span>'
    : row.koreanRefinementPass === true
      ? '<span class="gp-admin-quality-status clean">통과</span>'
      : '<span class="gp-admin-quality-status muted">미측정</span>'}</td>
   <td><span class="gp-admin-quality-status ${row.qualityStatus === 'needs_review' ? 'warn' : row.qualityStatus === 'clean' ? 'clean' : 'muted'}">${row.qualityStatus === 'needs_review' ? '검토 필요' : row.qualityStatus === 'clean' ? '정상' : '미측정'}</span></td>
   <td>${escapeHtml(({
     charged: '차감 완료',
     waived_quality_shortfall: '품질 미달 무차감',
     waived_repeat_low_benefit: '재결제 보호',
     plan_unlimited: '이용권',
     admin_no_charge: '관리자 무차감'
    })[row.billingDisposition] || '—')}</td>
 </tr>`).join('');

 el.innerHTML = `
  ${latestEngineSummary}
  <div class="gp-admin-quality-stats">${stats}</div>
  <div class="gp-admin-quality-section">
   <div class="gp-admin-quality-section-head"><h4>모드 × 글 종류 × 엔진 × 품질 상태</h4><span>${filteredCross.length ? `상위 ${Math.min(60, filteredCross.length)}개 조합` : '선택 조건 결과 없음'}</span></div>
   <div class="gp-admin-table-wrap" tabindex="0" aria-label="품질 교차표 가로 스크롤"><table class="gp-admin-table gp-admin-quality-cross"><caption>요청 모드, 글 종류, 엔진, 품질 상태별 작업 건수</caption><thead><tr><th scope="col">요청</th><th scope="col">글 종류</th><th scope="col">엔진</th><th scope="col">품질</th><th scope="col" class="num">건수</th></tr></thead><tbody>${crossRows || '<tr><td colspan="5" class="muted">선택 조건에 맞는 조합이 없습니다.</td></tr>'}</tbody></table></div>
  </div>
  <div class="gp-admin-quality-codes">
   ${adminQualityCodeList('결과 품질 경고', report.warningCounts, '결과 경고 없음')}
   ${adminQualityCodeList('변환 효과 알림', report.effectNoticeCounts, '효과 제한 알림 없음')}
   ${adminQualityCodeList('전달 결정 사유', report.deliveryReasonCounts, '기술 차단 사유 없음')}
   ${adminQualityCodeList('원문 검토 신호', report.sourceReviewWarningCounts, '원문 검토 신호 없음')}
   ${adminQualityCodeList('한국어 교정 잔여', report.koreanRefinementIssueCounts, '한국어 교정 잔여 없음')}
   ${adminQualityCodeList('반복 어휘 치환 (관측)', report.lexicalTransitionCounts, '반복 치환 징후 없음')}
   ${adminQualityCodeList('깊이 미달 사유', report.depthReasonCounts, '깊이 미달 없음')}
  </div>
  <div class="gp-admin-quality-section">
   <div class="gp-admin-quality-section-head"><h4>최근 작업</h4><span>본문 없이 관측값 ${filteredRecent.length}건</span></div>
    <div class="gp-admin-table-wrap" tabindex="0" aria-label="최근 품질 작업 가로 스크롤"><table class="gp-admin-table gp-admin-quality-recent"><caption>최근 휴머나이징 작업의 품질 관측값</caption><thead><tr><th scope="col">시각</th><th scope="col">요청</th><th scope="col">글 종류</th><th scope="col">효과</th><th scope="col" class="num">편집</th><th scope="col" class="num">승인/편집청크</th><th scope="col" class="num">모델 실패</th><th scope="col">구조</th><th scope="col">한국어</th><th scope="col">품질</th><th scope="col">과금</th></tr></thead><tbody>${recentRows || '<tr><td colspan="11" class="muted">선택 조건에 맞는 최근 작업이 없습니다.</td></tr>'}</tbody></table></div>
  </div>`;
}

window.adminRenderHumanizeQualityFilters = function() {
 if (window._adminHumanizeQuality) renderAdminHumanizeQuality(window._adminHumanizeQuality);
};

window.adminJobsToggleAll = function(cb) {
 document.querySelectorAll('.gp-admin-job-cb').forEach(x => { x.checked = cb.checked; });
};

window.adminOpenUser = function(uid) {
 const i = document.getElementById('adminUserQuery');
 if (i) i.value = uid;
 window.adminSwitchTab('users');
 window.adminSearchUser();
 const ws = document.querySelector('.gp-admin-ws');
 if (ws) ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.adminNotifyAffected = async function() {
 const cbs = [...document.querySelectorAll('.gp-admin-job-cb:checked')];
 const uids = [...new Set(cbs.map(c => c.dataset.uid).filter(Boolean))];
 if (!uids.length) { alert('알림 보낼 사용자를 선택하세요.'); return; }
 const defMsg = '재구성 작업 중 일시적 오류로 진행이 중단됐어요. 원인은 수정 완료됐고, 크레딧은 차감되지 않았습니다. 번거로우시겠지만 다시 시도해 주세요. 불편을 드려 죄송합니다.';
 const message = window.gpPrompt
  ? await window.gpPrompt({ title: '영향 사용자 알림', message: `${uids.length}명에게 인앱 알림을 보냅니다.`, placeholder: '알림 메시지', defaultValue: defMsg, confirmText: '발송', required: true })
  : prompt('알림 메시지', defMsg);
 if (!message || message.trim().length < 2) return;
 try {
  const dayKey = new Date().toISOString().slice(0, 10);
  const data = await adminPost('/admin/notify-users', { uids, title: '작업 오류 안내 (수정 완료)', message: message.trim(), clientId: 'job_incident_' + dayKey + '_' + message.trim().length });
  if (window.gpToast) window.gpToast(`${data.sent}/${data.total}명에게 알림을 보냈어요.`, { type: 'success', title: '알림 발송' });
  else alert(`${data.sent}/${data.total}명에게 알림 발송 완료`);
 } catch (e) {
  alert(e.message || '알림 발송에 실패했습니다.');
 }
};

window.adminNotifySelectedUser = async function() {
 const user = window._adminSelectedUser;
 if (!user || !user.uid) { alert('먼저 사용자를 검색해서 선택하세요.'); return; }
 const who = user.email || user.name || user.uid;
 const defMsg = '운영팀 안내입니다. 확인이 필요한 내용이 있어 알림을 보냈습니다.';
 const message = window.gpPrompt
  ? await window.gpPrompt({ title: '사용자 알림', message: `${who} 사용자에게 인앱 알림을 보냅니다.`, placeholder: '알림 메시지', defaultValue: defMsg, confirmText: '발송', required: true })
  : prompt('알림 메시지', defMsg);
 if (!message || message.trim().length < 2) return;
 if (!window._adminSelectedUser || window._adminSelectedUser.uid !== user.uid) {
  adminSetMessage('adminUserNotifyMsg', '검색 대상이 바뀌었습니다. 사용자를 다시 확인하세요.', 'error');
  return;
 }
 const button = document.getElementById('adminUserNotifyButton');
 if (button && button.disabled) return;
 adminSetBusy(button, true, '발송 중');
 try {
  const data = await adminPost('/admin/notify-users', {
   uids: [user.uid],
   title: '운영팀 안내',
   message: message.trim(),
   clientId: 'admin_user_notice_' + user.uid.slice(0, 8) + '_' + Date.now()
  });
  adminSetMessage('adminUserNotifyMsg', `${data.sent}/${data.total}명에게 알림을 보냈습니다.`, 'success');
  if (window.gpToast) window.gpToast('사용자에게 알림을 보냈어요.', { type: 'success', title: '알림 발송' });
 } catch (e) {
  adminSetMessage('adminUserNotifyMsg', e.message || '알림 발송에 실패했습니다.', 'error');
 } finally {
  adminSetBusy(button, false);
 }
};

window.adminAdjustCredits = async function() {
 const user = window._adminSelectedUser;
 if (!user || !user.uid) {
  adminSetMessage('adminCreditAdjustMsg', '사용자를 먼저 검색하세요.', 'error');
  return;
 }
 const signEl = document.getElementById('adminCreditSign');
 const amountEl = document.getElementById('adminCreditAmount');
 const reasonEl = document.getElementById('adminCreditReason');
 const sign = parseInt(signEl?.value, 10) === -1 ? -1 : 1;
 const magnitude = parseInt(amountEl?.value, 10);
 const reason = (reasonEl?.value || '').trim();
 if (!Number.isInteger(magnitude) || magnitude <= 0) {
  adminSetMessage('adminCreditAdjustMsg', '1 이상의 크레딧 수량을 입력하세요.', 'error');
  return;
 }
 const delta = sign * magnitude;
 if (reason.length < 2) {
  adminSetMessage('adminCreditAdjustMsg', '조정 사유를 2자 이상 입력하세요.', 'error');
  return;
 }
 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: delta > 0 ? '크레딧을 추가할까요?' : '크레딧을 차감할까요?',
    message: `${user.email || user.uid} · ${delta > 0 ? '+' : ''}${delta.toLocaleString('ko-KR')}크레딧`,
    confirmText: delta > 0 ? '추가하기' : '차감하기',
    danger: delta < 0
   })
  : confirm(`${user.email || user.uid}에게 ${delta > 0 ? '+' : ''}${delta}크레딧을 적용할까요?`);
 if (!ok) return;

 if (!window._adminSelectedUser || window._adminSelectedUser.uid !== user.uid) {
  adminSetMessage('adminCreditAdjustMsg', '검색 대상이 바뀌었습니다. 사용자를 다시 확인하세요.', 'error');
  return;
 }
 const button = document.getElementById('adminCreditAdjustButton');
 if (button && button.disabled) return;

 adminSetMessage('adminCreditAdjustMsg', '처리 중...', 'info');
 adminSetBusy(button, true, '처리 중');
 try {
  const data = await adminPost('/admin/adjust-credits', { uid: user.uid, delta, reason });
  adminSetMessage('adminCreditAdjustMsg', `완료: ${data.before.toLocaleString('ko-KR')} → ${data.after.toLocaleString('ko-KR')}크레딧`, 'success');
  if (amountEl) amountEl.value = '';
  if (reasonEl) reasonEl.value = '';
  if (window.CU && user.uid === window.CU.uid) {
   window.UC = data.after;
   if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
  }
  await window.adminSearchUser(true);
  await window.loadAllCreditHistory();
 } catch (e) {
  adminSetMessage('adminCreditAdjustMsg', e.message, 'error');
 } finally {
  adminSetBusy(button, false);
 }
};

window.adminDirectRefund = async function(i) {
 const order = adminSelectedChargeOrder(i);
 if (!order) {
  alert('주문 정보를 찾을 수 없습니다. 사용자를 다시 검색해주세요.');
  return;
 }

 // 구독: 전액 환불(모드 선택 없음)
 if (order.kind === 'subscription') {
  const reason = window.gpPrompt
   ? await window.gpPrompt({ title: '직접 환불 사유', message: '고객 요청 없이 바로 전액 환불합니다.', placeholder: '예: 중복 결제 환불', confirmText: '환불 진행', required: true })
   : prompt('직접 환불 사유를 입력해 주세요:');
  if (!reason || reason.trim().length < 2) { alert('환불 사유를 2자 이상 입력해 주세요.'); return; }
  const ok = window.gpConfirm
   ? await window.gpConfirm({ title: '전액 환불을 진행할까요?', message: `${order.id} · ${adminMoney(order.amount)}`, confirmText: '환불하기', danger: true })
   : confirm(`${order.id} 정기결제를 전액 환불할까요?`);
  if (!ok) return;
  await adminRunRefund(i, { orderId: order.id, kind: order.kind, reason: reason.trim() });
  return;
 }

 // 크레딧: 서버 정책 산식만 사용한다. 전액·직접입력 우회는 허용하지 않는다.
 const mode = adminGetRefundMode(i);
 const reasonEl = document.getElementById('refundReason-' + i);
 const reason = (reasonEl?.value || '').trim();
 if (reason.length < 2) { adminRefundMsg(i, '환불 사유를 2자 이상 입력하세요.'); if (reasonEl) reasonEl.focus(); return; }
 const calc = adminComputeRefund(order);
 if (!calc || calc.amount <= 0) { adminRefundMsg(i, '정책상 환불 가능한 금액이 없습니다.'); return; }

 const modeLabel = calc.policy === 'base' ? '기준 크레딧 정책 환불' : '기존 주문 비례 환불';
 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: '실제 환불을 진행할까요?',
    message: `${order.id}\n${modeLabel} · ${adminMoney(calc.amount)} · ${calc.credits.toLocaleString('ko-KR')}크레딧 차감`,
    confirmText: '환불하기',
    danger: true
   })
  : confirm(`${order.id} · ${modeLabel}\n${adminMoney(calc.amount)} / ${calc.credits}크레딧 차감으로 환불할까요?`);
 if (!ok) return;

 await adminRunRefund(i, { orderId: order.id, kind: order.kind, reason, mode });
};

window.loadCreditHistory = async () =>{
 const el = document.getElementById('creditHistoryList');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">불러오는 중...</div>';
 try {
 const snap = await getDocs(query(
 collection(db,'users',CU.uid,'creditHistory'),
 orderBy('createdAt','desc')
 ));
 if (snap.empty) {
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">사용 내역이 없어요</div>';
 return;
 }
 const allDocs = snap.docs.slice(0,50);
 const renderRow = (d) => {
 const h = d.data();
 const date = h.createdAt ? new Date(h.createdAt.toDate()).toLocaleString('ko-KR') : '';
 const isCharge = h.type === 'charge';
 const isRefund = h.type === 'refund';
 const isReferral = h.type === 'referral';
 const isCoupon = h.type === 'coupon_redeem';
 const isAdminAdjust = h.type === 'admin_adjust';
 const isRestore = String(h.type || '').endsWith('_restore');
 const typeTxt = isCharge ? '충전' : isRefund ? '환불' : isReferral ? '친구 추천' : isCoupon ? '쿠폰' : isAdminAdjust ? '관리자 조정' : isRestore ? adminHistoryLabel(h) : h.type === 'detect' ? 'AI 감지' : adminHistoryLabel(h);
 const safeTypeTxt = escapeHtml(typeTxt);
 const safeDate = escapeHtml(date);
 const amount = adminNumber(h.amount);
 const used = adminNumber(h.used);
 const remaining = adminNumber(h.remaining);
 const amountTxt = isCharge || isReferral || isCoupon
 ? `<div style="color:var(--green);font-weight:600;">+${amount.toLocaleString('ko-KR')} 크레딧</div>`
 : isRefund
 ? `<div style="color:var(--yellow);font-weight:600;">${amount.toLocaleString('ko-KR')} 크레딧 (환불)</div>`
 : isAdminAdjust
 ? `<div style="color:${amount >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:600;">${amount > 0 ? '+' : ''}${amount.toLocaleString('ko-KR')} 크레딧</div>`
 : isRestore
 ? `<div style="color:var(--green);font-weight:600;">+${Math.abs(used).toLocaleString('ko-KR')} 크레딧 (복구)</div>`
 : `<div style="color:var(--red);font-weight:600;">-${Math.abs(used).toLocaleString('ko-KR')} 크레딧</div>`;
 return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
 <div>
 <div style="font-weight:600;color:var(--text);">${safeTypeTxt}</div>
 <div style="color:var(--text3);font-size:12px;margin-top:2px;">${safeDate}</div>
</div>
 <div style="text-align:right;">
 ${amountTxt}
 <div style="color:var(--text3);font-size:12px;">잔여 ${remaining.toLocaleString('ko-KR')} 크레딧</div>
</div>
</div>`;
 };
 if (allDocs.length <= 10) {
 el.innerHTML = allDocs.map(renderRow).join('');
 } else {
 const visibleRows = allDocs.slice(0, 10).map(renderRow).join('');
 const hiddenRows = allDocs.slice(10).map(renderRow).join('');
 el.innerHTML = `${visibleRows}<div id="creditHistoryHidden" style="display:none;">${hiddenRows}</div>`
 + `<button id="creditHistoryToggle" type="button" style="width:100%;margin-top:12px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-weight:600;cursor:pointer;">더보기 (${allDocs.length - 10}건)</button>`;
 const btn = document.getElementById('creditHistoryToggle');
 const hidden = document.getElementById('creditHistoryHidden');
 btn.addEventListener('click', () => {
 const expanded = hidden.style.display !== 'none';
 hidden.style.display = expanded ? 'none' : 'block';
 btn.textContent = expanded ? `더보기 (${allDocs.length - 10}건)` : '접기';
 });
 }
 } catch(e) {
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red)">크레딧 내역을 불러오지 못했습니다.</div>';
 }
};

window._adminHistory = { data: [], page: 0, pageSize: 25, filtered: [] };
let adminHistoryFilterGeneration = 0;

function adminHistoryMatchesType(h, type) {
 if (!type) return true;
 const value = String(h?.type || '');
 if (type === 'usage') return !['charge', 'refund', 'admin_adjust', 'coupon_redeem', 'referral'].includes(value) && !value.endsWith('_restore');
 if (type === 'restore') return value.endsWith('_restore');
 return value === type;
}

function adminHistoryCreatedMs(h) {
 const c = h && h.createdAt;
 if (c && typeof c.toMillis === 'function') return c.toMillis();
 if (c && typeof c.toDate === 'function') return c.toDate().getTime();
 if (c && c._seconds) return c._seconds * 1000;
 const direct = Number(h && h.createdAtMs);
 if (Number.isFinite(direct) && direct > 0) return direct;
 const parsed = Date.parse(c || '');
 return Number.isFinite(parsed) ? parsed : 0;
}

function adminHistoryHasLinkedTask(h) {
 const type = String(h?.type || '');
 const requestId = String(h?.requestId || '');
 if (!h?.uid || !(h.creditHistoryId || h.id) || !requestId) return false;
 if (type === 'detect') return !/^job_/u.test(requestId) && /^[A-Za-z0-9:_-]{1,180}$/u.test(requestId);
 if (!['humanize', 'restructure'].includes(type) || /_refine\d+$/u.test(requestId)) return false;
 return /^job_[A-Za-z0-9_-]{1,128}$/u.test(requestId);
}

function adminHistoryDateText(h) {
 const ms = adminHistoryCreatedMs(h);
 return ms ? new Date(ms).toLocaleString('ko-KR') : '';
}

window.loadAllCreditHistory = async () =>{
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminCreditHistory');
 if (!el) return;
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/admin/credit-history'), {
  method:'POST',
  headers: bearerJsonHeaders(idToken),
  body: JSON.stringify({ limit: 1000 })
 });
 const data = await res.json();
 if (!res.ok || !data.ok) throw new Error(data.error || '전체 사용자 내역을 불러오지 못했습니다.');

 const allHistory = (data.history || []).map(h => ({
  ...h,
  createdAtMs: Number(h.createdAtMs) || 0
 }));

 window._adminHistory.dailyUsed = data.dailyUsed || {};

 // 개요 바: 최근 7일 크레딧 사용 합계
 const stat7d = document.getElementById('adminStatCredit7d');
 if (stat7d) {
  const sum = Object.values(window._adminHistory.dailyUsed).reduce((a, b) => a + (Number(b) || 0), 0);
  stat7d.textContent = sum.toLocaleString('ko-KR');
 }

 window._adminHistory.data = allHistory;
 window._adminHistory.filtered = allHistory;
 window._adminHistory.page = 0;
 await window.filterAdminHistory();
 } catch(e) {
 console.log('전체 사용자 내역 로드 실패:', e);
 el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">크레딧 원장을 불러오지 못했습니다. ${escapeHtml(e.message || '')} <button type="button" class="gp-admin-mini-btn" onclick="loadAllCreditHistory()">다시 시도</button></div>`;
 }
};

window.loadAdminCreditUsageSummary = async () => {
 if (!window.isAdmin()) return;
 const stat7d = document.getElementById('adminStatCredit7d');
 if (!stat7d) return;
 delete stat7d.dataset.loadState;
 try {
  const data = await adminPost('/admin/credit-history', { limit: 1000 });
  const sum = Object.values(data.dailyUsed || {}).reduce((total, used) => total + (Number(used) || 0), 0);
  stat7d.textContent = sum.toLocaleString('ko-KR');
  stat7d.title = '전체 사용자 최신 원장 1,000건 안에서 최근 7일 사용량을 합산한 값입니다.';
  stat7d.dataset.loadState = 'ok';
 } catch (_) {
  stat7d.textContent = '측정 실패';
  stat7d.dataset.loadState = 'error';
 }
};

window.filterAdminHistory = async () => {
 const generation = ++adminHistoryFilterGeneration;
 try {
 const from = document.getElementById('adminDateFrom').value;
 const to = document.getElementById('adminDateTo').value;
 const email = (document.getElementById('adminEmailFilter')?.value || '').trim().toLowerCase();
 const type = document.getElementById('adminHistoryType')?.value || '';
 if (from && to && from > to) {
  const el = document.getElementById('adminCreditHistory');
  if (el) el.innerHTML = '<div class="gp-admin-empty gp-admin-error-text">시작일은 종료일보다 늦을 수 없습니다.</div>';
  return;
 }
 window._adminHistory.dateFrom = from;
 window._adminHistory.dateTo = to;
 window._adminHistory.emailFilter = email;

 if (email) {
  // 이메일 검색 시 해당 유저의 subcollection 전체 조회
  let uid = null;
  let userName = '알 수 없음';
  const matched = window._adminHistory.data.find(h => (h.userEmail || '').toLowerCase() === email);
  if (matched) {
   uid = matched.uid;
   userName = matched.userName;
  } else {
   // 캐시에 없으면 Firestore에서 직접 이메일로 유저 조회
   const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
   if (generation !== adminHistoryFilterGeneration) return;
   if (!userSnap.empty) {
    uid = userSnap.docs[0].id;
    userName = userSnap.docs[0].data().name || '알 수 없음';
   }
  }
  if (!uid) {
   window._adminHistory.filtered = [];
   window._adminHistory.page = 0;
   window.renderAdminHistory();
   return;
  }
  const histSnap = await getDocs(query(collection(db, 'users', uid, 'creditHistory'), orderBy('createdAt', 'desc')));
  if (generation !== adminHistoryFilterGeneration) return;
  let filtered = histSnap.docs.map(d => ({ ...d.data(), id: d.id, creditHistoryId: d.id, userName, userEmail: email, uid }));
  if (from) filtered = filtered.filter(h => {
   const ms = adminHistoryCreatedMs(h);
   return ms && ms >= new Date(from).getTime();
  });
  if (to) filtered = filtered.filter(h => {
   const ms = adminHistoryCreatedMs(h);
   return ms && ms <= new Date(to + 'T23:59:59').getTime();
  });
  filtered = filtered.filter(h => adminHistoryMatchesType(h, type));
  window._adminHistory.filtered = filtered;
  window._adminHistory.page = 0;
  window.renderAdminHistory();
  return;
 }

 // 이메일 없으면 기존 로직 (전체 1000건에서 날짜 필터)
 let filtered = window._adminHistory.data;
 if (from) filtered = filtered.filter(h => {
  const ms = adminHistoryCreatedMs(h);
  return ms && ms >= new Date(from).getTime();
 });
 if (to) filtered = filtered.filter(h => {
  const ms = adminHistoryCreatedMs(h);
  return ms && ms <= new Date(to + 'T23:59:59').getTime();
 });
 filtered = filtered.filter(h => adminHistoryMatchesType(h, type));
 window._adminHistory.filtered = filtered;
 window._adminHistory.page = 0;
 window.renderAdminHistory();
 } catch (error) {
  if (generation !== adminHistoryFilterGeneration) return;
  const el = document.getElementById('adminCreditHistory');
  if (el) el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">원장 필터를 적용하지 못했습니다. ${escapeHtml(error.message || '')}</div>`;
 }
};

window.adminSetHistoryPageSize = function(value) {
 const size = Math.min(50, Math.max(10, parseInt(value, 10) || 25));
 window._adminHistory.pageSize = size;
 window._adminHistory.page = 0;
 window.renderAdminHistory();
};

window.adminResetHistoryFilters = function() {
 adminHistoryFilterGeneration += 1;
 clearTimeout(window._adminHistory._emailTimer);
 ['adminDateFrom', 'adminDateTo', 'adminEmailFilter', 'adminHistoryType'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
 window._adminHistory.dateFrom = '';
 window._adminHistory.dateTo = '';
 window._adminHistory.emailFilter = '';
 window._adminHistory.filtered = window._adminHistory.data.slice();
 window._adminHistory.page = 0;
 adminRememberFilters();
 window.renderAdminHistory();
};

window.renderAdminHistory = () =>{
 const el = document.getElementById('adminCreditHistory');
 if (!el) return;
 const { filtered, page, pageSize } = window._adminHistory;
 const total = filtered.length;
 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const start = page * pageSize;
 const items = filtered.slice(start, start + pageSize);

 const countEl = document.getElementById('adminHistoryCount');
 if (countEl) countEl.textContent = total.toLocaleString('ko-KR');

 // DB에서 조회한 일별 크레딧 사용 총합 표시 (칩)
 const dailyUsed = window._adminHistory.dailyUsed || {};
 const dailyEntries = Object.entries(dailyUsed).slice(0, 7);
 const dailySummary = dailyEntries.map(([day, used]) =>
 `<div class="gp-admin-daily-item"><span>${escapeHtml(day)}</span><strong>-${adminNumber(used).toLocaleString('ko-KR')}</strong></div>`
 ).join('');

 let html = dailySummary ? `<div class="gp-admin-daily">${dailySummary}</div>` : '';

 if (total === 0) {
 el.innerHTML = html + '<div class="gp-admin-empty">해당 조건의 내역이 없습니다.</div>';
 return;
 }

 html += `<p class="gp-admin-limit-note">${window._adminHistory.emailFilter ? '정확한 이메일로 조회한 사용자 전체 원장' : '전체 사용자 최신 1,000건 범위'} · 현재 필터 ${total.toLocaleString('ko-KR')}건</p><div class="gp-admin-table-wrap" tabindex="0" aria-label="크레딧 원장 가로 스크롤"><table class="gp-admin-table">
 <caption>크레딧 충전·사용·환불·조정 원장</caption>
 <thead><tr>
 <th scope="col">날짜</th><th scope="col">유저</th><th scope="col">종류</th><th scope="col" class="num">증감</th><th scope="col" class="num">잔여</th><th scope="col">작업</th>
 </tr></thead><tbody>`
 + items.map(h =>{
 const date = adminHistoryDateText(h);
 const typeTxt = adminHistoryLabel(h);
 const amountTxt = adminHistoryAmountHtml(h);
 const creditHistoryId = String(h.creditHistoryId || h.id || '');
 const canOpenTask = adminHistoryHasLinkedTask(h);
 const taskCell = canOpenTask
  ? `<button type="button" class="gp-admin-mini-btn gp-admin-ledger-open" onclick="adminOpenLedgerDetail(this,'${jsAttr(h.uid)}','${jsAttr(creditHistoryId)}')">작업 열기</button>`
  : '<span class="gp-admin-ledger-unavailable">연결 없음</span>';
 return `<tr>
 <td class="muted">${date}</td>
 <td>${escapeHtml(h.userName)}<br><span class="muted">${escapeHtml(h.userEmail)}</span></td>
 <td>${escapeHtml(typeTxt)}</td>
 <td class="num">${amountTxt}</td>
 <td class="num muted">${adminNumber(h.remaining).toLocaleString('ko-KR')}</td>
 <td>${taskCell}</td>
</tr>`;
 }).join('')
 + `</tbody></table></div>
 <div class="gp-admin-pager">
 <button onclick="window._adminHistory.page=Math.max(0,window._adminHistory.page-1);window.renderAdminHistory()" ${page===0?'disabled':''}>‹ 이전</button>
 <span>${page+1} / ${totalPages}</span>
 <button onclick="window._adminHistory.page=Math.min(${totalPages-1},window._adminHistory.page+1);window.renderAdminHistory()" ${page>=totalPages-1?'disabled':''}>다음 ›</button>
</div>`;

 el.innerHTML = html;
};

let adminLedgerDetailGeneration = 0;
let adminLedgerDetailController = null;
let adminLedgerDetailReturnFocus = null;

function adminLedgerText(value) {
 return value == null ? '' : String(value);
}

function adminLedgerStatusBadge(label, value) {
 if (!value) return '';
 return `<span class="gp-admin-ledger-detail-badge"><span>${escapeHtml(label)}</span>${escapeHtml(value)}</span>`;
}

function adminLedgerDetailPairs(title, pairs) {
 const rows = pairs.filter(([, value]) => value !== '' && value != null);
 if (!rows.length) return '';
 return `<section class="gp-admin-ledger-detail-section"><h3>${escapeHtml(title)}</h3><dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`;
}

function adminLedgerTextBlock(label, text) {
 if (!text) return '';
 return `<section class="gp-admin-log-block gp-admin-ledger-text-block">
  <div class="gp-admin-log-block-head"><h3>${escapeHtml(label)}</h3><button type="button" class="gp-admin-mini-btn" onclick="adminCopyText(this)">복사</button></div>
  <div class="gp-admin-log-text" tabindex="0" role="region" aria-label="${escapeHtml(label)} 전체 내용">${escapeHtml(text)}</div>
 </section>`;
}

function adminLedgerCodes(...sources) {
 return [...new Set(sources.flatMap(source => Array.isArray(source) ? source : [])
  .map(code => String(code || '').trim())
  .filter(Boolean))].slice(0, 30).join(', ');
}

function adminRenderLedgerDetail(data) {
 if (data.available === false) {
  const reasonLabels = {
   legacy_missing_request_id: '과거 원장이라 연결할 작업 식별자가 없습니다.',
   refine_result_not_archived: '문단 보강 결과는 별도 원문·결과로 보관되지 않았습니다.',
   history_not_found: '연결된 작업 이력이 보관 기간을 지나 조회되지 않습니다.',
   non_task_ledger: '충전·환불·조정 내역에는 연결할 글 작업이 없습니다.'
  };
  return `<div class="gp-admin-empty">${escapeHtml(reasonLabels[data.reason] || '이 원장 행에 연결된 작업 상세가 없습니다.')}</div>`;
 }
 const ledger = data.ledger || {};
 const link = data.link || {};
 const history = data.history || {};
 const engineBundle = data.engine || {};
 const engine = engineBundle.engineMeta || history.engineMeta || {};
 const archive = engineBundle.archive || {};
 const ops = Array.isArray(data.ops) ? data.ops.slice(0, 30) : [];
 const qualityCodes = adminLedgerCodes(history.qualityWarningCodes, engine.qualityWarningCodes, archive.qualityWarningCodes);
 const effectCodes = adminLedgerCodes(history.effectNoticeCodes, engine.effectNoticeCodes, archive.effectNoticeCodes);
 const sourceReviewCodes = adminLedgerCodes(history.sourceReviewWarningCodes, engine.sourceReviewWarningCodes, archive.sourceReviewWarningCodes);
 const koreanCodes = adminLedgerCodes(engine.koreanRefinementIssueCodes, archive.koreanRefinementIssueCodes);
 const integrityRestoreCodes = adminLedgerCodes(engine.finalSourceIntegrityRestoreCodes, archive.finalSourceIntegrityRestoreCodes);
 const isDetect = history.type === 'detect';
 const detectView = isDetect && typeof window.gpNormalizeDetectPresentation === 'function'
  ? window.gpNormalizeDetectPresentation(history)
  : history;
 const detectProbability = typeof detectView.probability === 'number' && Number.isFinite(detectView.probability)
  ? detectView.probability
  : null;
 const detectRawProbability = typeof history.rawProbability === 'number' && Number.isFinite(history.rawProbability)
  ? history.rawProbability
  : null;
 const status = adminLedgerText(history.status || archive.status || '연결됨');
 const badges = [
  adminLedgerStatusBadge('상태', status),
  adminLedgerStatusBadge('품질', history.qualityStatus || archive.qualityStatus),
  adminLedgerStatusBadge('효과', history.effectStatus || engine.effectStatus || archive.effectStatus),
  adminLedgerStatusBadge('과금', history.billingDisposition || engine.billingDisposition || archive.billingDisposition || ledger.billingDisposition),
  adminLedgerStatusBadge('AI 감지', isDetect && Number.isFinite(detectProbability) ? `${Math.round(detectProbability)}%` : '')
 ].join('');
 const opsStatus = data.opsStatus === 'error' ? 'error' : (ops.length ? 'ok' : 'empty');
 const opsHtml = opsStatus === 'error'
  ? '<section class="gp-admin-ledger-detail-section"><h3>작업·감사 로그</h3><div class="gp-admin-ledger-inline-error" role="alert">관련 운영 로그를 불러오지 못했습니다. 작업 원문과 결과는 정상적으로 확인할 수 있습니다.</div></section>'
  : ops.length
   ? `<section class="gp-admin-ledger-detail-section"><h3>작업·감사 로그</h3><ol class="gp-admin-ledger-ops">${ops.map(item => `<li><div><strong>${escapeHtml(item.event || item.code || '운영 기록')}</strong><time>${escapeHtml(adminDateText(item.createdAtMs || item.createdMs || item.atMs))}</time></div><p>${escapeHtml(item.message || item.action || item.reason || '')}</p></li>`).join('')}</ol></section>`
   : '<section class="gp-admin-ledger-detail-section"><h3>작업·감사 로그</h3><div class="gp-admin-ledger-empty-note">이 작업과 연결된 별도 운영 로그가 없습니다.</div></section>';
 const detectHtml = isDetect ? `${adminLedgerDetailPairs('AI 감지 결과', [
  ['보정 감지율', Number.isFinite(detectProbability) ? `${Math.round(detectProbability)}%` : ''],
  ['원 감지율', Number.isFinite(detectRawProbability) ? `${Math.round(detectRawProbability)}%` : ''],
  ['보정 방식', history.probabilityCalibration?.match]
 ])}${adminLedgerTextBlock('탐지 요약', detectView.summary)}${adminLedgerTextBlock('탐지 상세', detectView.detail)}` : '';
 return `<div class="gp-admin-ledger-detail-badges">${badges}</div>
  <div class="gp-admin-ledger-detail-grid">
   ${adminLedgerDetailPairs('원장 연결', [
    ['사용자 UID', ledger.uid], ['원장 ID', ledger.id || ledger.creditHistoryId], ['요청 ID', ledger.requestId], ['작업 ID', link.jobId], ['이력 ID', link.historyId], ['완료 시각', adminDateText(archive.updatedAtMs || archive.createdAtMs || history.createdAtMs)], ['사용 크레딧', ledger.used]
   ])}
   ${adminLedgerDetailPairs('엔진 감사', [
    ['엔진 버전', engine.engineVersion || archive.engineVersion], ['요청 모드', engine.requestedMode || archive.requestedMode || history.mode], ['적용 모드', engine.effectiveMode || archive.effectiveMode], ['문서 프로필', engine.documentProfile || archive.documentProfile], ['전달 결정', engine.deliveryDecision || archive.deliveryDecision || history.deliveryDecision], ['승인 청크', engine.approvedModelChunkCount ?? archive.approvedModelChunkCount], ['모델 실패', engine.modelFailureChunkCount ?? archive.modelFailureChunkCount], ['구조 검사', (engine.structureSignaturePass ?? archive.structureSignaturePass) === true ? '통과' : (engine.structureSignaturePass ?? archive.structureSignaturePass) === false ? '확인 필요' : ''], ['처리 시간', archive.processingDurationMs ? `${Math.round(archive.processingDurationMs / 100) / 10}초` : ''], ['예상 API 비용', Number.isFinite(Number(engine.estimatedUsd ?? archive.estimatedUsd)) ? `$${Number(engine.estimatedUsd ?? archive.estimatedUsd).toFixed(4)}` : ''], ['품질 경고', qualityCodes], ['효과 알림', effectCodes], ['원문 확인', sourceReviewCodes], ['한국어 감사', koreanCodes], ['안전 복원', integrityRestoreCodes], ['구체 성과 감사', (engine.unsupportedSpecificityPass ?? archive.unsupportedSpecificityPass) === false ? `잔여 ${engine.unsupportedSpecificityResidualCount ?? archive.unsupportedSpecificityResidualCount ?? 0}건` : (engine.unsupportedSpecificityPass ?? archive.unsupportedSpecificityPass) === true ? '통과' : '']
   ])}
  </div>
  ${adminLedgerTextBlock('원문', history.inputText)}
  ${isDetect ? detectHtml : adminLedgerTextBlock('휴머나이징 결과', history.outputText)}
  ${opsHtml}
  ${!history.inputText && !history.outputText && !detectView.summary && !detectView.detail ? '<div class="gp-admin-empty">이 원장 행에 연결된 작업 내용이 없습니다.</div>' : ''}`;
}

function adminLedgerDetailFocusable(root) {
 return [...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => !el.hidden && el.offsetParent !== null);
}

window.adminOpenLedgerDetail = async function(trigger, uid, creditHistoryId) {
 if (!uid || !creditHistoryId) return;
 const root = document.getElementById('adminLedgerDetail');
 const body = document.getElementById('adminLedgerDetailBody');
 const status = document.getElementById('adminLedgerDetailStatus');
 if (!root || !body || !status) return;
 adminLedgerDetailGeneration += 1;
 const generation = adminLedgerDetailGeneration;
 if (adminLedgerDetailController) adminLedgerDetailController.abort();
 adminLedgerDetailController = new AbortController();
 adminLedgerDetailReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
 root.hidden = false;
 const shell = document.getElementById('adminShell');
 if (shell) shell.inert = true;
 document.body.classList.add('gp-admin-ledger-detail-open');
 body.setAttribute('aria-busy', 'true');
 body.innerHTML = '<div class="gp-admin-ledger-detail-loading"><span aria-hidden="true"></span><p>원장과 작업 기록을 안전하게 연결하고 있습니다.</p></div>';
 status.textContent = '작업 정보를 불러오는 중입니다.';
 document.getElementById('adminLedgerDetailClose')?.focus();
 try {
  const data = await adminPost('/admin/credit-history-item', { uid, creditHistoryId }, { signal: adminLedgerDetailController.signal });
  if (generation !== adminLedgerDetailGeneration || root.hidden) return;
  body.innerHTML = adminRenderLedgerDetail(data);
  body.setAttribute('aria-busy', 'false');
  status.textContent = '원장과 작업 기록 연결을 완료했습니다.';
 } catch (error) {
  if (error?.name === 'AbortError' || generation !== adminLedgerDetailGeneration || root.hidden) return;
  body.setAttribute('aria-busy', 'false');
  status.textContent = '작업 정보를 불러오지 못했습니다.';
  body.innerHTML = `<div class="gp-admin-ledger-detail-error" role="alert"><strong>작업 상세를 열 수 없습니다.</strong><p>${escapeHtml(error.message || '잠시 후 다시 시도해 주세요.')}</p><button type="button" class="gp-admin-mini-btn" onclick="adminOpenLedgerDetail(adminLedgerDetailReturnFocus,'${jsAttr(uid)}','${jsAttr(creditHistoryId)}')">다시 시도</button></div>`;
 }
};

window.adminCloseLedgerDetail = function() {
 const root = document.getElementById('adminLedgerDetail');
 if (!root || root.hidden) return;
 adminLedgerDetailGeneration += 1;
 if (adminLedgerDetailController) adminLedgerDetailController.abort();
 adminLedgerDetailController = null;
 root.hidden = true;
 const shell = document.getElementById('adminShell');
 if (shell) shell.inert = false;
 document.body.classList.remove('gp-admin-ledger-detail-open');
 const target = adminLedgerDetailReturnFocus;
 adminLedgerDetailReturnFocus = null;
 if (target && target.isConnected && typeof target.focus === 'function') target.focus();
};

document.addEventListener('keydown', event => {
 const root = document.getElementById('adminLedgerDetail');
 if (!root || root.hidden) return;
 if (event.key === 'Escape') {
  event.preventDefault();
  window.adminCloseLedgerDetail();
  return;
 }
 if (event.key !== 'Tab') return;
 const focusable = adminLedgerDetailFocusable(root);
 if (!focusable.length) return;
 const first = focusable[0];
 const last = focusable[focusable.length - 1];
 if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
 else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

// 이메일 필터: 입력마다 Firestore 조회를 피하려고 디바운스
window.adminHistoryEmailInput = () => {
 adminHistoryFilterGeneration += 1;
 clearTimeout(window._adminHistory._emailTimer);
 window._adminHistory._emailTimer = setTimeout(() => { adminRememberFilters(); window.filterAdminHistory(); }, 350);
};

window.backToList = () =>{
 if (blockClosedCommunity()) return;
 document.getElementById('listView').style.display='block';
 document.getElementById('detailView').style.display='none';
};

window.loadSidebarHistory = async () => {
  const el = document.getElementById('sidebarHistoryList');
  if (!el || !window.CU) return;
  try {
    const snap = await getDocs(query(
      collection(db,'users',window.CU.uid,'history'),
      orderBy('createdAt','desc'),
      limit(8)
    ));
    if (snap.empty) { el.innerHTML = ''; return; }
    el.innerHTML = snap.docs.map(d => {
      const h = d.data();
      const isDetect = h.type === 'detect';
      const badge = isDetect
        ? `<span style="font-size:10px;color:var(--blue);font-weight:600;">감지</span>`
        : `<span style="font-size:10px;color:var(--green);font-weight:600;">휴머나이징</span>`;
      const preview = escapeHtml((h.inputText || '내용 없음').replace(/\s+/g,' ').trim().slice(0, 18));
      return `<button type="button" class="sidebar-hist-item" data-history-id="${escapeHtml(d.id)}" aria-label="${isDetect ? 'AI 감지' : '휴머나이징'} 기록 열기: ${preview}" onclick="openHistoryRecord(this.dataset.historyId)">
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
          ${badge}
          <span class="sidebar-hist-text">${preview}</span>
        </div>
      </button>`;
    }).join('');
  } catch(e) {}
};

// ── 자소서 생성 랩(글쓰기 랩 실험, 2026-08-24) ─────────────────────────
// 생성(POST /writing-lab/generate) → 휴머나이징(기존 /transform adminHumanizeLab·gpt_engine 재사용)
// → 검수(POST /writing-lab/check, 사실 카드 기준 결정론 검사) 체인. 관리자 전용·무과금.
let wlabPollToken = 0;
const wlabState = { factsheet: '', form: null };

function wlabEl(id) { return document.getElementById(id); }

function wlabSetStatus(text, type) {
 const el = wlabEl('wlabStatus');
 if (!el) return;
 el.textContent = text || '';
 el.className = 'gp-admin-msg' + (type ? ' ' + type : '');
}

function wlabSetBusy(busy) {
 const btn = wlabEl('wlabRunBtn');
 if (btn) {
  btn.disabled = !!busy;
  btn.textContent = busy ? '실행 중...' : '생성 → 휴머나이징 실행';
 }
}

function wlabReadForm() {
 return {
  company: (wlabEl('wlabCompany')?.value || '').trim(),
  role: (wlabEl('wlabRole')?.value || '').trim(),
  targetChars: Number(wlabEl('wlabTargetChars')?.value) || 0,
  charLimitMode: wlabEl('wlabCharMode')?.value || 'with_space',
  question: (wlabEl('wlabQuestion')?.value || '').trim(),
  emphasis: (wlabEl('wlabEmphasis')?.value || '').trim(),
  humanizeMode: wlabEl('wlabHumanizeMode')?.value || 'blog',
  memo: {
   experience: (wlabEl('wlabMemoExp')?.value || '').trim(),
   caseExample: (wlabEl('wlabMemoCase')?.value || '').trim(),
   numbers: (wlabEl('wlabMemoNum')?.value || '').trim(),
   thoughts: (wlabEl('wlabMemoView')?.value || '').trim()
  }
 };
}

window.adminWritingLabCount = function() {
 const q = wlabEl('wlabQuestion')?.value || '';
 const qc = wlabEl('wlabQuestionCount');
 if (qc) qc.textContent = q.length.toLocaleString('ko-KR') + '자';
};

function wlabUpdateOutputCounts() {
 const d = wlabEl('wlabDraft')?.value || '';
 const f = wlabEl('wlabFinal')?.value || '';
 const dc = wlabEl('wlabDraftCount');
 const fc = wlabEl('wlabFinalCount');
 if (dc) dc.textContent = d ? d.length.toLocaleString('ko-KR') + '자' : '';
 if (fc) fc.textContent = f ? f.length.toLocaleString('ko-KR') + '자' : '';
}

// 검수 리포트 한 단계(초안/최종)를 pill + 상세 목록으로 렌더링
function wlabChecksHtml(title, checks, extras) {
 if (!checks) return '';
 const c = checks.counts || {};
 const lim = checks.limit || {};
 const nov = checks.experienceNovelty || {};
 const nums = checks.fabricatedNumberCandidates || [];
 const cli = checks.cliches || { total: 0, found: [] };
 const gaps = checks.questionKeywordGaps || [];
 const followups = (extras && extras.followupQuestions) || [];
 const usage = (extras && extras.usage) || null;
 const pill = (text, cls) => '<span class="gp-wlab-pill' + (cls ? ' ' + cls : '') + '">' + escapeHtml(text) + '</span>';
 const pills = [
  pill('공백포함 ' + Number(c.withSpace || 0).toLocaleString('ko-KR') + '자'),
  pill('공백제외 ' + Number(c.noSpace || 0).toLocaleString('ko-KR') + '자'),
  pill('2바이트 ' + Number(c.byte2 || 0).toLocaleString('ko-KR'))
 ];
 if (lim.applicable) {
  pills.push(lim.pass
   ? pill('제한 ' + lim.target + ' 통과 · 사용률 ' + Math.round((lim.usageRatio || 0) * 100) + '%', 'ok')
   : pill('제한 ' + lim.target + ' 초과 +' + lim.over, 'bad'));
 }
 pills.push(nov.candidate ? pill('경험 날조 후보 있음', 'bad') : pill('신규 경험 신호 없음', 'ok'));
 pills.push(nums.length ? pill('근거 없는 수치 후보 ' + nums.length, 'bad') : pill('수치 전부 사실 카드에 근거', 'ok'));
 pills.push(cli.total ? pill('상투구 ' + cli.total, 'warn') : pill('상투구 0', 'ok'));
 if (gaps.length) pills.push(pill('문항 키워드 미반영 후보 ' + gaps.length, 'warn'));
 const details = [];
 if (nums.length) details.push('<div>근거 없는 수치 후보: ' + nums.map(escapeHtml).join(', ') + '</div>');
 if (cli.found && cli.found.length) details.push('<div>상투구: ' + cli.found.map(x => escapeHtml(x.phrase + ' ×' + x.count)).join(', ') + '</div>');
 if (gaps.length) details.push('<div>문항 키워드 미반영 후보(휴리스틱): ' + gaps.map(escapeHtml).join(', ') + '</div>');
 if (followups.length) details.push('<div>지원자에게 확인할 질문: ' + followups.map(escapeHtml).join(' / ') + '</div>');
 if (usage) details.push('<div>생성 비용: ' + escapeHtml(String(usage.model || '')) + ' · 입력 ' + Number(usage.inputTokens || 0).toLocaleString('ko-KR') + ' / 출력 ' + Number(usage.outputTokens || 0).toLocaleString('ko-KR') + ' 토큰 · $' + Number(usage.estimatedUsd || 0).toFixed(4) + ' · ' + (Number(usage.elapsedMs || 0) / 1000).toFixed(1) + '초</div>');
 return '<div class="gp-wlab-check"><b>' + escapeHtml(title) + '</b><div class="gp-wlab-pills">' + pills.join('') + '</div>' + (details.length ? '<div class="gp-wlab-detail">' + details.join('') + '</div>' : '') + '</div>';
}

const wlabReportBlocks = { draft: '', final: '' };
function wlabRenderReport() {
 const el = wlabEl('wlabReport');
 if (!el) return;
 const html = [wlabReportBlocks.draft, wlabReportBlocks.final].filter(Boolean).join('');
 el.innerHTML = html;
 el.hidden = !html;
}

window.adminWritingLabRun = async function() {
 if (!window.CU || !window.isAdmin()) {
  wlabSetStatus('관리자 권한이 필요합니다.', 'error');
  return;
 }
 const form = wlabReadForm();
 if (form.question.length < 5) {
  wlabSetStatus('자기소개서 문항을 입력해 주세요(5자 이상).', 'error');
  return;
 }
 if (!form.memo.experience && !form.memo.caseExample && !form.memo.numbers && !form.memo.thoughts) {
  wlabSetStatus('사실 카드를 최소 한 칸은 채워 주세요 — 무날조 생성의 근거입니다.', 'error');
  return;
 }
 wlabPollToken++;
 const tokenId = wlabPollToken;
 wlabState.form = form;
 wlabState.factsheet = '';
 wlabReportBlocks.draft = '';
 wlabReportBlocks.final = '';
 wlabRenderReport();
 const draftEl = wlabEl('wlabDraft');
 const finalEl = wlabEl('wlabFinal');
 if (draftEl) draftEl.value = '';
 if (finalEl) finalEl.value = '';
 const jobEl = wlabEl('wlabJobId');
 if (jobEl) jobEl.textContent = '';
 wlabUpdateOutputCounts();
 wlabSetBusy(true);
 wlabSetStatus('① 사실 카드 기반 생성 중... (수십 초 걸릴 수 있어요)', 'info');
 try {
  const idToken = await window.CU.getIdToken(true);
  const res = await fetch(window.apiUrl('/writing-lab/generate'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({
    question: form.question,
    company: form.company,
    role: form.role,
    emphasis: form.emphasis,
    targetChars: form.targetChars || undefined,
    charLimitMode: form.charLimitMode,
    memo: form.memo
   })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || '생성에 실패했습니다.');
  if (tokenId !== wlabPollToken) return;
  wlabState.factsheet = data.factsheet || '';
  if (draftEl) draftEl.value = data.draft || '';
  wlabUpdateOutputCounts();
  wlabReportBlocks.draft = wlabChecksHtml('① 생성 초안 검수', data.checks, {
   followupQuestions: data.followupQuestions,
   usage: data.usage
  });
  wlabRenderReport();
  if (form.humanizeMode === 'skip') {
   wlabSetStatus('완료 — 생성만 실행했습니다(휴머나이징 건너뜀).', 'success');
   wlabSetBusy(false);
   return;
  }
  wlabSetStatus('② 휴머나이징 작업 시작 중...', 'info');
  const res2 = await fetch(window.apiUrl('/transform'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({
    text: data.draft,
    mode: form.humanizeMode,
    adminHumanizeLab: true,
    adminLabProfile: 'gpt_engine',
    humanizeExperiment: true,
    memo: [form.memo.experience, form.memo.caseExample, form.memo.numbers, form.memo.thoughts].filter(Boolean).join('\n').slice(0, 2000),
    documentProfile: 'resume_application',
    lang: 'ko',
    evidence: false,
    length: 'keep',
    effectNoticeAccepted: true
   })
  });
  const start = await res2.json().catch(() => ({}));
  if (!res2.ok || !start.ok) throw new Error(start.error || '휴머나이징 작업을 시작하지 못했습니다. 초안은 위에 남아 있습니다.');
  if (jobEl && start.jobId) jobEl.textContent = '#' + String(start.jobId).slice(0, 6).toUpperCase();
  await wlabPoll(start.jobId, tokenId, form);
 } catch (e) {
  if (tokenId === wlabPollToken) {
   wlabSetStatus(e.message || '실행에 실패했습니다.', 'error');
   wlabSetBusy(false);
  }
 }
};

async function wlabPoll(jobId, tokenId, form) {
 let idToken = await window.CU.getIdToken(false);
 const deadline = Date.now() + 2 * 3600 * 1000;
 while (Date.now() < deadline && tokenId === wlabPollToken) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  let res = await fetch(window.apiUrl('/transform/' + jobId), {
   headers: { Authorization: 'Bearer ' + idToken }
  });
  if (res.status === 401) {
   idToken = await window.CU.getIdToken(true);
   res = await fetch(window.apiUrl('/transform/' + jobId), {
    headers: { Authorization: 'Bearer ' + idToken }
   });
  }
  const st = await res.json().catch(() => ({}));
  if (!res.ok || (st.error && !st.status)) throw new Error(st.error || '작업 상태를 불러오지 못했습니다.');
  if (st.status === 'queued') {
   wlabSetStatus('② 휴머나이징 대기 중 · ' + (st.queuePosition || '-') + '번째', 'info');
   continue;
  }
  if (st.status === 'running') {
   wlabSetStatus('② ' + (st.stage || '휴머나이징 처리 중...'), 'info');
   continue;
  }
  if (st.status === 'done') {
   const finalText = (st.result && st.result.outputText) || '';
   const finalEl = wlabEl('wlabFinal');
   if (finalEl) finalEl.value = finalText;
   wlabUpdateOutputCounts();
   wlabSetStatus('③ 최종 결과 검수 중...', 'info');
   await wlabCheckText(finalText, form, '② 최종 결과 검수 (휴머나이징 후)');
   wlabSetStatus('완료', 'success');
   wlabSetBusy(false);
   return;
  }
  if (st.status === 'blocked') {
   throw new Error((st.reason || '휴머나이징이 안전 게이트에 차단되었습니다.') + ' 초안은 위에 남아 있습니다.');
  }
  if (st.status === 'error' || st.status === 'cancelled') {
   throw new Error(st.error || '휴머나이징 작업이 중단되었습니다. 초안은 위에 남아 있습니다.');
  }
 }
 throw new Error('작업이 예상보다 오래 걸립니다. 잠시 후 다시 확인해 주세요.');
}

async function wlabCheckText(text, form, title) {
 if (!text) return;
 try {
  const idToken = await window.CU.getIdToken(false);
  const res = await fetch(window.apiUrl('/writing-lab/check'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
   body: JSON.stringify({
    text: text,
    question: form.question,
    company: form.company,
    role: form.role,
    emphasis: form.emphasis,
    targetChars: form.targetChars || undefined,
    charLimitMode: form.charLimitMode,
    memo: form.memo,
    factsheet: wlabState.factsheet || undefined
   })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) {
   wlabReportBlocks.final = wlabChecksHtml(title, data.checks, null);
   wlabRenderReport();
  } else {
   wlabReportBlocks.final = '<div class="gp-wlab-check"><b>' + escapeHtml(title) + '</b><div class="gp-wlab-detail">검수 요청에 실패했습니다: ' + escapeHtml(data.error || String(res.status)) + '</div></div>';
   wlabRenderReport();
  }
 } catch (e) {
  wlabReportBlocks.final = '<div class="gp-wlab-check"><b>' + escapeHtml(title) + '</b><div class="gp-wlab-detail">검수 중 오류: ' + escapeHtml(e.message || '알 수 없는 오류') + '</div></div>';
  wlabRenderReport();
 }
}

window.adminWritingLabRecheck = async function() {
 if (!window.CU || !window.isAdmin()) {
  wlabSetStatus('관리자 권한이 필요합니다.', 'error');
  return;
 }
 const finalText = wlabEl('wlabFinal')?.value || '';
 const draftText = wlabEl('wlabDraft')?.value || '';
 const text = finalText || draftText;
 if (!text) {
  wlabSetStatus('재검사할 결과가 없습니다.', 'error');
  return;
 }
 const form = wlabState.form || wlabReadForm();
 wlabSetStatus('재검사 중...', 'info');
 await wlabCheckText(text, form, finalText ? '② 최종 결과 재검사' : '① 초안 재검사');
 wlabSetStatus('재검사 완료', 'success');
};

window.adminWritingLabCopy = async function() {
 const text = wlabEl('wlabFinal')?.value || wlabEl('wlabDraft')?.value || '';
 if (!text) return;
 await navigator.clipboard.writeText(text);
 if (window.gpToast) window.gpToast('결과를 복사했습니다.', { type: 'success', title: '복사 완료' });
 else alert('복사했습니다.');
};

window.adminWritingLabClear = function() {
 wlabPollToken++;
 wlabState.factsheet = '';
 wlabState.form = null;
 wlabReportBlocks.draft = '';
 wlabReportBlocks.final = '';
 ['wlabCompany', 'wlabRole', 'wlabTargetChars', 'wlabQuestion', 'wlabEmphasis', 'wlabMemoExp', 'wlabMemoCase', 'wlabMemoNum', 'wlabMemoView', 'wlabDraft', 'wlabFinal'].forEach(id => {
  const el = wlabEl(id);
  if (el) el.value = '';
 });
 const jobEl = wlabEl('wlabJobId');
 if (jobEl) jobEl.textContent = '';
 wlabRenderReport();
 wlabUpdateOutputCounts();
 window.adminWritingLabCount();
 wlabSetStatus('', '');
 wlabSetBusy(false);
};

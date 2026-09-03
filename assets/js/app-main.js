let mode='detect', tab='main', humanizeMode='assignment', selectedLang='ko';
window.mode='detect';
const SHORT_HUMANIZE_MIN_CREDITS = 10;
function shortHumanizeCredit(len) {
 const n = Math.max(0, Number(len) || 0);
 return n > 0 ? Math.max(SHORT_HUMANIZE_MIN_CREDITS, Math.ceil(n / 100) * 2) : 0;
}
function creditNeededForText(text, apiMode) {
 const len = (text || '').length;
 if (!len) return 0;
 return apiMode === 'detect' ? Math.ceil(len / 100) : shortHumanizeCredit(len);
}
function currentCreditMode() {
 return mode === 'detect' ? 'detect' : 'humanize';
}
const ROUTE_TABS = ['main','pricing','blog','detectReport','guide','faq','qna','notice','mypage','admin','adminHumanizeLab','history','pro','writingLab'];
const ROUTE_PATHS = {
 main: '/',
 pricing: '/pricing',
 blog: '/blog',
 detectReport: '/detect-report',
 guide: '/guide',
 faq: '/faq',
 qna: '/qna',
 notice: '/notice',
 mypage: '/mypage',
 admin: '/admin',
 adminHumanizeLab: '/admin-humanize-lab',
 history: '/history',
 pro: '/pro',
 writingLab: '/writing-lab'
};
const PATH_ROUTES = {
 '/': 'main',
 '/main': 'main',
 '/pricing': 'pricing',
 '/blog': 'blog',
 '/detect-report': 'detectReport',
 '/guide': 'guide',
 '/faq': 'faq',
 '/qna': 'qna',
 '/notice': 'notice',
 '/mypage': 'mypage',
 '/admin': 'admin',
 '/admin-humanize-lab': 'adminHumanizeLab',
 '/history': 'history',
 '/pro': 'pro',
 '/writing-lab': 'writingLab'
};
const ROUTE_META = {
main: {
  title: '교수님 피하기 · AI 감지 · 휴머나이징',
  description: 'AI식 문체 신호를 확인하고 원문의 뜻과 장르를 지키며 문장을 다듬는 AI 감지 · 휴머나이징 서비스, 교수님 피하기입니다.'
 },
 pricing: {
  title: '요금제 · 교수님 피하기',
  description: '교수님 피하기 크레딧 충전 상품과 작업별 이용 기준을 확인하세요.'
 },
blog: {
 title: '블로그 · AI 글쓰기 다듬기 가이드 | 교수님 피하기',
 description: '과제·자기소개서·리포트에서 반복 표현과 균일한 흐름을 점검하는 글쓰기 가이드를 모았어요.'
},
detectReport: {
 title: 'AI 감지기 · AI 티 지수 확인 | 교수님 피하기',
 description: '글을 붙여넣고 AI식 문체 신호가 두드러진 문장을 확인하세요. 결과를 바탕으로 휴머나이징까지 이어갈 수 있어요.'
},
guide: {
 title: '사용 가이드 · 교수님 피하기',
 description: '교수님 피하기 사용 방법을 처음부터 작업 기록까지 단계별로 안내해요.'
},
faq: {
 title: '자주 묻는 질문 · 교수님 피하기',
 description: '교수님 피하기 이용, 크레딧·환불, AI 감지 정확도 등 자주 묻는 질문을 모았어요.'
 },
 qna: {
  title: '문의하기 · 교수님 피하기',
  description: '교수님 피하기 1:1 문의 — 결제·계정·오류 등 개인 문의를 남기고 답변을 확인하세요.'
 },
 notice: {
  title: '공지사항 · 교수님 피하기',
  description: '교수님 피하기 서비스 업데이트와 운영 공지사항입니다.'
 },
 mypage: {
  title: '마이페이지 · 교수님 피하기',
  description: '내 크레딧과 작업 기록, 계정 정보를 확인하세요.'
 },
 admin: {
  title: '관리자 · 교수님 피하기',
  description: '교수님 피하기 관리자 운영 페이지입니다.'
 },
 adminHumanizeLab: {
  title: '휴머나이징 테스트 · 교수님 피하기 관리자',
  description: '관리자 전용 휴머나이징 보존형 테스트 페이지입니다.'
 },
 history: {
  title: '작업 기록 · 교수님 피하기',
  description: '내 AI 감지 · 휴머나이징 작업 기록을 확인하세요.'
 },
 pro: {
  title: 'Pro · 교수님 피하기',
  description: '교수님 피하기 Pro 전용 기능은 준비 중이에요. 현재는 크레딧을 충전해 이용해 주세요.'
 },
 writingLab: {
  title: '글쓰기 랩 · 교수님 피하기',
  description: '글쓰기 랩은 관리자 검수 중인 준비 단계이며 아직 공개 신청을 받지 않아요.'
 }
};

function normalizeRouteTab(value) {
 const raw = String(value || '').replace(/^#\/?/, '').replace(/^\/+|\/+$/g, '').trim();
 if (!raw) return 'main';
 return ROUTE_TABS.includes(raw) ? raw : 'main';
}

function getHashRouteTab() {
 const raw = String(window.location.hash || '').replace(/^#\/?/, '').replace(/^\/+|\/+$/g, '').trim();
 return ROUTE_TABS.includes(raw) ? raw : '';
}

function cleanRoutePath(pathname) {
 const path = String(pathname || '/').replace(/\/+$/g, '') || '/';
 return path === '/index.html' ? '/' : path;
}

function getRouteTab() {
 const hashTab = getHashRouteTab();
 if (hashTab) return hashTab;
 return PATH_ROUTES[cleanRoutePath(window.location.pathname)] || 'main';
}

function consumeClosedCommunityRoute() {
 const url = new URL(window.location.href);
 const legacyPath = /^\/community(?:\/|$)/iu.test(cleanRoutePath(url.pathname));
 const legacyHash = /^#\/?community(?:\/|$)/iu.test(url.hash || '');
 const redirected = url.searchParams.get('community') === 'closed';
 if (!legacyPath && !legacyHash && !redirected) return false;
 url.pathname = '/';
 url.hash = '';
 url.searchParams.delete('community');
 if (!url.searchParams.has('mode')) url.searchParams.set('mode', 'humanize');
 window.history.replaceState({ tab: 'main' }, '', url.pathname + url.search);
 setTimeout(function () {
  const message = '커뮤니티 운영을 종료했어요. AI 감지와 휴머나이징은 계속 이용할 수 있어요.';
  if (window.gpToast) window.gpToast(message, { type: 'info', title: '커뮤니티 운영 종료' });
 }, 0);
 return true;
}

function routeUrl(t) {
 const base = (window.APP_CONFIG && window.APP_CONFIG.SITE_URL ? window.APP_CONFIG.SITE_URL : window.location.origin).replace(/\/+$/,'');
 return base + (ROUTE_PATHS[t] || '/');
}

function normalizeProductMode(value) {
 return String(value || '').toLowerCase() === 'detect' ? 'detect' : 'humanize';
}

function productModeFromUrl() {
 const params = new URLSearchParams(window.location.search || '');
 const requested = String(params.get('mode') || '').toLowerCase();
 return requested === 'detect' || requested === 'humanize' ? requested : '';
}

function syncProductModeUrl(productMode) {
 if (getRouteTab() !== 'main') return;
 const normalized = normalizeProductMode(productMode);
 const url = new URL(window.location.href);
 if (url.searchParams.get('mode') === normalized) return;
 url.searchParams.set('mode', normalized);
 window.history.replaceState({ tab: 'main', mode: normalized }, '', url.pathname + url.search + url.hash);
}
window.gpSyncProductModeUrl = syncProductModeUrl;

function applyProductMode(productMode, opts) {
 opts = opts || {};
 const normalized = normalizeProductMode(productMode);
 setMode(normalized);
 if (typeof window.lavSetMode === 'function') {
  window.lavSetMode(normalized, { skipUrl: true });
 }
 if (!opts.skipUrl) syncProductModeUrl(normalized);
 return normalized;
}
window.gpApplyProductMode = applyProductMode;

function trackProductModeOpen(productMode, sourceRoute, sourceSurface, sourceMode) {
 const normalized = normalizeProductMode(productMode);
 if (typeof window.gpTrack === 'function') {
  window.gpTrack('product_mode_open', {
   source_route: normalizeRouteTab(sourceRoute || getRouteTab()),
   source_surface: String(sourceSurface || 'page_cta').slice(0, 80),
   source_mode: sourceMode === 'detect' || sourceMode === 'humanize' ? sourceMode : '',
   target_mode: normalized
  });
 }
 return normalized;
}
window.gpTrackProductModeOpen = trackProductModeOpen;

window.gpSelectProductMode = function (productMode, sourceSurface) {
 const sourceMode = window.lavMode === 'detect' ? 'detect' : 'humanize';
 const normalized = trackProductModeOpen(productMode, getRouteTab(), sourceSurface || 'composer_toggle', sourceMode);
 return applyProductMode(normalized);
};

window.openProductMode = function (productMode, sourceSurface) {
 const sourceRoute = getRouteTab();
 const normalized = trackProductModeOpen(productMode, sourceRoute, sourceSurface || 'page_cta', '');
 switchTab('main');
 applyProductMode(normalized);
 setTimeout(function () {
  const el = document.getElementById('lavInput') || document.getElementById('inputText');
  if (el) el.focus();
 }, 80);
 return normalized;
};

function applyLandingProductMode() {
 const requested = productModeFromUrl();
 if (!requested || getRouteTab() !== 'main') return;
 applyProductMode(requested, { skipUrl: true });
}

function setMeta(selector, content, attrName) {
 const el = document.querySelector(selector);
 if (el) el.setAttribute(attrName || 'content', content);
}

function updateRouteMeta(t) {
 const meta = ROUTE_META[t] || ROUTE_META.main;
 const url = routeUrl(t);
 document.title = meta.title;
 setMeta('meta[name="description"]', meta.description);
 setMeta('meta[property="og:title"]', meta.title);
 setMeta('meta[property="og:description"]', meta.description);
 setMeta('meta[property="og:url"]', url);
 setMeta('link[rel="canonical"]', url, 'href');
}

function setRouteUrl(t, replace) {
 if (!ROUTE_TABS.includes(t)) return;
 const nextPath = ROUTE_PATHS[t] || '/';
 const currentPath = cleanRoutePath(window.location.pathname);
 const url = new URL(window.location.href);
 url.pathname = nextPath;
 if (t !== 'history') url.searchParams.delete('item');
 const nextUrl = url.pathname + url.search;
 if (currentPath === cleanRoutePath(nextPath) && nextUrl === window.location.pathname + window.location.search && !window.location.hash) return;
 if (replace) window.history.replaceState({ tab: t }, '', nextUrl);
 else window.history.pushState({ tab: t }, '', nextUrl);
}

function runRouteSideEffects(t) {
 if (t === 'history' && typeof window.loadHistory === 'function') window.loadHistory();
 if (t === 'notice' && typeof window.loadNotices === 'function') window.loadNotices();
 if (t === 'qna' && typeof window.loadQuestions === 'function') window.loadQuestions();
 if (t === 'admin' && typeof window.loadAdminPage === 'function') window.loadAdminPage();
 if (t === 'adminHumanizeLab' && typeof window.loadAdminHumanizeLab === 'function') window.loadAdminHumanizeLab();
 if (t === 'writingLab' && typeof window.loadWritingLab === 'function') window.loadWritingLab();
}

function applyRouteFromUrl(opts) {
 opts = opts || {};
 consumeClosedCommunityRoute();
 const routeTab = getRouteTab();
 updateRouteMeta(routeTab);
 if (routeTab === 'mypage') {
  openMyPage();
  return;
 }
 if (routeTab === 'admin') {
  openAdminPage();
  return;
 }
 if (routeTab === 'adminHumanizeLab') {
  openAdminHumanizeLab();
  return;
 }
 if (routeTab === 'writingLab') {
  openWritingLab();
  return;
 }
 if (routeTab === 'pro') {
  goToPro();
  return;
 }
 switchTab(routeTab, { skipRoute: true });
 if (routeTab === 'main') applyLandingProductMode();
 runRouteSideEffects(routeTab);
 if (opts.replace) setRouteUrl(routeTab, true);
 // 비로그인 홈 방문은 앱 화면 대신 랜딩으로 — 판단은 landing.js가 authReady 확정 후에 한다.
 if (typeof window.gpMaybeShowLanding === 'function') window.gpMaybeShowLanding();
}
window.applyRouteFromUrl = applyRouteFromUrl;
function applyInitialRouteWhenAppMarkupReady() {
 if (!document.getElementById('appScreen')) return false;
 applyRouteFromUrl({ replace: true });
 return true;
}
if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', function () {
  if (!applyInitialRouteWhenAppMarkupReady()) {
   window.addEventListener('gp:app-markup-ready', applyInitialRouteWhenAppMarkupReady, { once: true });
  }
 }, { once: true });
} else if (!applyInitialRouteWhenAppMarkupReady()) {
 window.addEventListener('gp:app-markup-ready', applyInitialRouteWhenAppMarkupReady, { once: true });
}

function selectHumanizeMode(element) {
 document.querySelectorAll('.mode-tab').forEach(t =>t.classList.remove('active'));
 element.classList.add('active');
 humanizeMode = element.getAttribute('data-mode');
}

function setLang(lang) {
 selectedLang = lang;
 document.getElementById('langKo').classList.toggle('active', lang === 'ko');
 document.getElementById('langEn').classList.toggle('active', lang === 'en');
 checkLangMismatch();
}

// 입력 텍스트가 선택 언어와 크게 다르면 작은 경고 표시 (차단 아님)
function checkLangMismatch() {
 const warnEl = document.getElementById('langMismatchWarn');
 const ta = document.getElementById('inputText');
 if (!warnEl || !ta) return;
 const text = ta.value || '';
 if (text.length < 20) { warnEl.style.display = 'none'; return; }
 const ko = (text.match(/[가-힣]/g) || []).length;
 const en = (text.match(/[a-zA-Z]/g) || []).length;
 const total = ko + en;
 if (total < 5) { warnEl.style.display = 'none'; return; }
 const koRatio = ko / total;
 const lang = (typeof selectedLang !== 'undefined' ? selectedLang : 'ko');
 let msg = '';
 if (lang === 'ko' && koRatio < 0.3) {
   msg = '⚠ 영어 위주의 글로 보여요. 위에서 <strong>English</strong>로 변경하면 결과 품질이 더 좋아져요.';
 } else if (lang === 'en' && koRatio > 0.7) {
   msg = '⚠ 한국어 위주의 글로 보여요. 위에서 <strong>한국어</strong>로 변경하면 결과 품질이 더 좋아져요.';
 }
 if (msg) { warnEl.innerHTML = msg; warnEl.style.display = 'block'; }
 else { warnEl.style.display = 'none'; }
}

// Liner Scholar 태스크 선택
function lsSelectTask(el, taskMode) {
 document.querySelectorAll('.ls-task-item').forEach(b => b.classList.remove('active'));
 el.classList.add('active');
 const label = document.getElementById('lsSendLabel');
 if (taskMode === 'detect') {
   setMode('detect');
   if (label) label.textContent = '분석';
 } else {
   setMode('humanize');
   const tab = document.querySelector('.mode-tab[data-mode="'+taskMode+'"]');
   if (tab) selectHumanizeMode(tab);
   if (label) label.textContent = '휴머나이징';
 }
 document.getElementById('result').innerHTML = '';
}

// 모바일 태스크 셀렉터
function lsSelectTaskMobile(taskMode) {
  const label = document.getElementById('lsSendLabel');
  if (taskMode === 'detect') {
    setMode('detect');
    if (label) label.textContent = '분석';
  } else {
    setMode('humanize');
    const tab = document.querySelector('.mode-tab[data-mode="'+taskMode+'"]');
    if (tab) selectHumanizeMode(tab);
    if (label) label.textContent = '실행';
  }
  document.getElementById('result').innerHTML = '';
}

// 전송 버튼 활성화 상태 관리
function updateSendBtn() {
 const btn = document.getElementById('lsSendBtn');
 if (!btn) return;
 const txt = (document.getElementById('inputText')||{}).value || '';
 // PDF가 첨부되어 있으면 텍스트 길이와 무관하게 활성화
 if (txt.trim().length >= 5) btn.classList.add('ready');
 else btn.classList.remove('ready');
}


function showScreen(n) {
 document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
 const target = document.getElementById(n+'Screen');
 if (target) target.classList.add('active');
}
function setMode(m) {
 mode = m;
 window.mode = m;
 
 // 상단 버튼(mbtn) 활성화 처리
 document.querySelectorAll('.mbtn').forEach(b =>b.classList.remove('active'));
 const target = document.querySelector('.mbtn.' + (m === 'humanize' ? 'human' : m));
 if (target) target.classList.add('active');

 // 핵심: 휴머나이저일 때만 스타일 탭 보여주기 
 const opts = document.getElementById('humanizeOptions');
 if (opts) {
 // m이 humanize거나 human일 때만 보이게 함
 opts.style.display = (m === 'humanize' || m === 'human') ? 'block' : 'none';
 }

 // 카드 테두리 색상 및 라벨 변경
 const isH = (m === 'humanize' || m === 'human');
 const inputCard = document.getElementById('inputCard');
 if (inputCard) inputCard.className = 'card ' + (isH ? 'human-mode' : 'detect-mode');
 
 const inputLabel = document.getElementById('inputLabel');
 const buttonText = document.getElementById('btxt');
 const sendButton = document.getElementById('sbtn');
 const result = document.getElementById('result');
 if (inputLabel) inputLabel.textContent = isH ? '변환할 텍스트' : '분석할 텍스트';
 if (buttonText) buttonText.textContent = isH ? '변환 시작' : '분석 시작';
 if (sendButton) sendButton.className = 'sbtn ' + (isH ? 'hb' : 'db');
 if (result) result.innerHTML = '';
 if (document.getElementById('inputText')) updateHint();
}
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main-content');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('collapsed');
  if (main) main.classList.toggle('sidebar-collapsed', collapsed);
  if (btn) btn.innerHTML = collapsed
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
}

function openInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (window.gpTrack) window.gpTrack('invite_open');
  const linkText = document.getElementById('inviteLinkText');
  if (linkText) {
    const uid = window.CU ? window.CU.uid : null;
    const base = window.APP_CONFIG.SITE_URL;
    linkText.textContent = uid ? base + '?ref=' + uid.slice(0,8) : base;
  }
}
function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (modal) modal.style.display = 'none';
}
function copyInviteLink() {
  const text = document.getElementById('inviteLinkText')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    if (window.gpTrack) window.gpTrack('invite_copy', { is_logged_in: !!window.CU });
    const btn = document.getElementById('inviteCopyBtn');
    if (btn) { btn.textContent = '복사했습니다'; setTimeout(() => { btn.textContent = '링크 복사'; }, 1500); }
  });
}
// 모달 바깥 클릭 시 닫기
document.addEventListener('click', e => {
  const modal = document.getElementById('inviteModal');
  if (modal && e.target === modal) closeInviteModal();
});

function setAdminAuthHydrationPending(pending) {
 const overlay = document.getElementById('authTransition');
 const appScreen = document.getElementById('appScreen');
 if (pending) {
  window.GP_REQUESTED_APP_SCREEN = 'app';
  window.gpAdminAuthHydrationPending = true;
  showScreen('app');
  const title = document.getElementById('authTransitionTitle');
  const message = document.getElementById('authTransitionMessage');
  if (title) title.textContent = '로그인 상태 확인 중';
  if (message) message.textContent = '관리자 화면을 안전하게 준비하고 있어요.';
  if (appScreen) {
   appScreen.inert = true;
   appScreen.setAttribute('aria-busy', 'true');
  }
  if (overlay) {
   overlay.hidden = false;
   overlay.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('gp-auth-transitioning');
  return;
 }
 if (!window.gpAdminAuthHydrationPending) return;
 window.gpAdminAuthHydrationPending = false;
 if (overlay) {
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
 }
 if (appScreen) {
  appScreen.inert = false;
  appScreen.removeAttribute('aria-busy');
 }
 document.body.classList.remove('gp-auth-transitioning');
}

function requireResolvedAdminAuth() {
 if (window.CU) {
  setAdminAuthHydrationPending(false);
  return true;
 }
 // Firebase가 로컬 세션을 복원하기 전에는 비로그인으로 단정하지 않는다.
 // 직접 /admin 진입 시 로그인 화면이 잠깐 노출됐다가 뒤집히는 현상을 막는다.
 if (window.gpAuthResolved !== true && window.GP_REQUESTED_APP_SCREEN !== 'login') {
  setAdminAuthHydrationPending(true);
  return false;
 }
 setAdminAuthHydrationPending(false);
 showScreen('login');
 return false;
}

function openMyPage() {
 if (!window.CU) { showScreen('login'); return; }
 switchTab('mypage');
 var tryLoad = function(tries) {
  if (typeof window.loadMyPage === 'function') { window.loadMyPage(); }
  else if (tries > 0) { setTimeout(function(){ tryLoad(tries-1); }, 200); }
 };
 tryLoad(10);
}
function openAdminPage() {
 if (!requireResolvedAdminAuth()) return;
 if (typeof window.isAdmin === 'function' && !window.isAdmin()) {
  if (window.gpToast) window.gpToast('관리자 권한이 필요합니다.', { type: 'error', title: '접근 제한' });
  else alert('관리자 권한이 필요합니다.');
  openMyPage();
  return;
 }
 switchTab('admin');
 var tryLoad = function(tries) {
  if (typeof window.loadAdminPage === 'function') { window.loadAdminPage(); }
  else if (tries > 0) { setTimeout(function(){ tryLoad(tries-1); }, 200); }
 };
 tryLoad(10);
}
window.openAdminPage = openAdminPage;
function openAdminHumanizeLab() {
 if (!requireResolvedAdminAuth()) return;
 if (typeof window.isAdmin === 'function' && !window.isAdmin()) {
  if (window.gpToast) window.gpToast('관리자 권한이 필요합니다.', { type: 'error', title: '접근 제한' });
  else alert('관리자 권한이 필요합니다.');
  openMyPage();
  return;
 }
 switchTab('adminHumanizeLab');
 var tryLoad = function(tries) {
  if (typeof window.loadAdminHumanizeLab === 'function') { window.loadAdminHumanizeLab(); }
  else if (tries > 0) { setTimeout(function(){ tryLoad(tries-1); }, 200); }
 };
 tryLoad(10);
}
window.openAdminHumanizeLab = openAdminHumanizeLab;
async function openWritingLab() {
 if (!window.CU) { showScreen('login'); return; }
 if (typeof window.isAdmin === 'function' && !window.isAdmin()) {
  if (window.gpToast) window.gpToast('글쓰기 랩은 준비 중이에요.', { type: 'info', title: '준비 중' });
  else alert('글쓰기 랩은 준비 중이에요.');
  return;
 }
 if (typeof window.gpEnsureWritingLab === 'function') await window.gpEnsureWritingLab();
 switchTab('writingLab');
 var tryLoad = function(tries) {
  if (typeof window.loadWritingLab === 'function') { window.loadWritingLab(); }
  else if (tries > 0) { setTimeout(function(){ tryLoad(tries-1); }, 200); }
 };
 tryLoad(10);
}
window.openWritingLab = openWritingLab;
function openQnaComposer() {
 if (!window.CU) {
  showScreen('login');
  return false;
 }
 const form = document.getElementById('qform');
 if (!form) return false;
 form.style.display = 'block';
 const title = document.getElementById('qtitle');
 if (title) title.focus({ preventScroll: true });
 return true;
}
window.openQnaComposer = openQnaComposer;
// 가격표 팀·기관 카드 → 1:1 문의 제목·본문 사전입력(2026-09 요금제 개편).
// 위임 링크 핸들러가 data-tab-arg를 첫 인자로 넘긴다. 미로그인이면 openQnaComposer가 로그인 화면으로 보낸다.
function gpPrefillQuestion(subject) {
 if (typeof window.loadQuestions === 'function') window.loadQuestions();
 if (!openQnaComposer()) return false;
 const title = document.getElementById('qtitle');
 const body = document.getElementById('qbody');
 const text = String(subject || '').trim().slice(0, 120);
 if (title && !title.value.trim() && text) title.value = text;
 if (body && !body.value.trim()) {
  const inquiryCredits = typeof window.gpInquiryPlanCreditsAt === 'function'
   ? window.gpInquiryPlanCreditsAt()
   : 6000;
  body.value = '팀·기관 요금제(116,000원 · ' + Number(inquiryCredits).toLocaleString('ko-KR') + '크레딧) 문의드려요.\n- 사용 인원:\n- 소속:\n- 희망 결제 방법:\n- 크레딧 받을 계정 이메일:';
 }
 if (title) title.focus({ preventScroll: true });
 return true;
}
window.gpPrefillQuestion = gpPrefillQuestion;
// 요금 탭을 열면 가로 슬라이드(작은 화면)의 시작 위치를 가성비 추천(스탠다드) 카드에 맞춘다(2026-09-02).
// 카드 순서는 그대로 두고 첫 화면의 포커스만 옮긴다 — 넘침이 없는 PC 격자에서는 아무것도 하지 않는다.
// scrollIntoView는 세로 스크롤까지 움직여 페이지가 튀므로 가로 위치만 직접 계산한다.
function focusRecommendedPlan() {
 const grid = document.getElementById('gpPlanList');
 const card = grid ? grid.querySelector('.plan-popular') : null;
 if (!grid || !card) return;
 requestAnimationFrame(() => requestAnimationFrame(() => {
  if (grid.scrollWidth <= grid.clientWidth + 4) return;
  const gridRect = grid.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const cardStart = cardRect.left - gridRect.left + grid.scrollLeft;
  const centered = getComputedStyle(card).scrollSnapAlign.includes('center');
  const padStart = parseFloat(getComputedStyle(grid).scrollPaddingLeft) || 0;
  const target = centered ? cardStart - (grid.clientWidth - cardRect.width) / 2 : cardStart - padStart;
  grid.scrollLeft = Math.max(0, Math.round(target));
 }));
}

function switchTab(t, opts) {
 opts = opts || {};
 t = normalizeRouteTab(t);
 tab=t;
 document.querySelectorAll('.ntab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 document.querySelectorAll('.snav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 ['main','pricing','blog','detectReport','guide','faq','qna','notice','mypage','admin','adminHumanizeLab','history','pro','writingLab'].forEach(n=>{
 const el = document.getElementById(n+'Content');
 if (el) el.style.display = n===t ? 'block' : 'none';
 });
 if (t === 'pro' && typeof window.refreshProTab === 'function') window.refreshProTab();
 if (t === 'pricing' && typeof window.gpRefreshPricingOffer === 'function') window.gpRefreshPricingOffer(false);
 if (t === 'pricing') focusRecommendedPlan();
 updateRouteMeta(t);
 if (!opts.skipRoute) setRouteUrl(t, opts.replaceRoute);
 if (!opts.skipTrack && typeof window.gpTrackPageView === 'function') window.gpTrackPageView(t, document.title, window.location.href);
 // 플로팅 오퍼는 탭 단위로 무장·해제한다(읽기용 페이지에서만, 지연 노출).
 if (typeof window.gpOnTabChange === 'function') window.gpOnTabChange(t);
}

window.addEventListener('hashchange', () => applyRouteFromUrl({ replace: true }));
window.addEventListener('popstate', () => applyRouteFromUrl({ replace: true }));

// 크롤러블 내비 델리게이트(2026-08-28 T2.4): <a href data-tab>는 검색엔진용 실링크이고,
// 일반 클릭만 SPA 라우팅으로 가로챈다. 새 탭·수정키(Ctrl/Cmd/Shift/Alt)·중클릭은 브라우저 기본 동작 유지.
document.addEventListener('click', function (e) {
 var a = e.target && e.target.closest ? e.target.closest('a[data-tab][href]') : null;
 if (!a) return;
 if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
 if (a.target && a.target !== '_self') return;
 e.preventDefault();
 switchTab(a.getAttribute('data-tab'));
 var fn = a.getAttribute('data-tab-call');
 if (fn && typeof window[fn] === 'function') window[fn](a.getAttribute('data-tab-arg') || undefined);
});

// 구독 비활성 기간에는 Pro 설명 화면에서 준비 상태와 충전 경로만 보여 줍니다.
function goToPro() {
 if (!window.PRO_ENABLED) {
   switchTab('pro');
   return;
 }
 if (!window.CU) { showScreen('login'); return; }
 const sub = window.SUB;
 const valid = sub && (sub.status === 'active' || (sub.status === 'cancelled' && sub.nextBillingMs > Date.now()));
 if (!valid) {
   switchTab('pricing');
   setTimeout(() => {
     if (typeof window.switchPricingTab === 'function') window.switchPricingTab('credit');
     const el = document.getElementById('pricingTabCredit');
     if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
   }, 100);
   return;
 }
 switchTab('pro');
}

// === Pro 탭 상태 ===
window.PRO_STATE = { mode: 'assignment', selectedTier: null };
const TIER_LABELS = { '1000': '1,000자', '5000': '5,000자', '10000': '10,000자', 'unlimited': '무제한' };
const TIER_PRICES = { '1000': 11900, '5000': 54900, '10000': 99000, 'unlimited': 290000 };

function setProMode(m) {
 window.PRO_STATE.mode = m;
 ['detect','assignment','resume','blog'].forEach(k => {
   const btn = document.getElementById('proMode' + k.charAt(0).toUpperCase() + k.slice(1));
   if (!btn) return;
   const active = (k === m);
   btn.classList.toggle('active', active);
   btn.style.background = active ? 'var(--accent)' : 'var(--surface2)';
   btn.style.color = active ? '#fff' : 'var(--text2)';
   btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
 });
 var ta = document.getElementById('proInputText');
 if (ta) updateProCount(ta);
}

function selectProCoupon(tier) {
 const sub = window.SUB;
 if (!sub) return;
 if (sub.tier !== tier) return; // 본인 티어가 아니면 무시
 window.PRO_STATE.selectedTier = tier;
 const ta = document.getElementById('proInputText');
 const limit = (tier === 'unlimited') ? 50000 : parseInt(tier, 10);
 ta.maxLength = limit;
 const badge = document.getElementById('proSelectedBadge');
 if (badge) badge.textContent = TIER_LABELS[tier] + ' 쿠폰 선택됨 · 최대 ' + limit.toLocaleString() + '자';
 document.querySelectorAll('.pro-coupon-card').forEach(el => {
   const t = el.dataset.tier;
   const sel = (t === tier);
   el.style.borderColor = sel ? 'var(--accent)' : 'var(--border)';
   el.style.boxShadow = sel ? '0 0 0 2px rgba(124,92,255,.28)' : 'none';
 });
 updateProCount(ta);
}

function updateProCount(el) {
 const cc = document.getElementById('proCcount');
 if (cc) cc.textContent = el.value.length.toLocaleString() + '자';
 const tier = window.PRO_STATE.selectedTier;
 const btn = document.getElementById('proRunBtn');
 const proMode = window.PRO_STATE.mode;
 const minLen = proMode === 'detect' ? 5 : transformMinLength(publicTransformMode(proMode));
 const can = !!tier && el.value.trim().length >= minLen && (window.COUPON?.remaining > 0 || tier === 'unlimited');
 const hint = document.getElementById('proHint');
 if (hint) hint.textContent = '쿠폰 1회 사용 · 최소 ' + minLen.toLocaleString() + '자';
 if (btn) {
   btn.disabled = !can;
   btn.style.opacity = can ? '1' : '.5';
 }
}

function refreshProTab() {
 const sub = window.SUB;
 const coupon = window.COUPON;
 const tierEl = document.getElementById('proSubTier');
 const metaEl = document.getElementById('proSubMeta');
 const listEl = document.getElementById('proCouponList');
 const emptyEl = document.getElementById('proCouponEmpty');
 if (!sub) {
   if (tierEl) tierEl.textContent = 'Pro 준비 중';
   if (metaEl) metaEl.textContent = '현재는 크레딧을 충전해 이용해 주세요.';
   if (listEl) listEl.innerHTML = '';
   if (emptyEl) emptyEl.style.display = 'block';
   return;
 }
 const nextDate = sub.nextBillingMs ? new Date(sub.nextBillingMs).toLocaleDateString('ko-KR') : '—';
 const statusLabel = sub.status === 'active' ? '정상' : (sub.status === 'cancelled' ? '취소 예정' : sub.status);
 if (tierEl) tierEl.textContent = TIER_LABELS[sub.tier] + ' (' + statusLabel + ')';
 if (metaEl) metaEl.textContent = '다음 결제일: ' + nextDate + ' · ' + TIER_PRICES[sub.tier].toLocaleString() + '원';

 // 쿠폰 카드
 if (listEl) {
   listEl.innerHTML = '';
   if (sub.tier === 'unlimited') {
     const card = document.createElement('div');
     card.className = 'pro-coupon-card';
     card.dataset.tier = 'unlimited';
     card.style.cssText = 'flex:1;min-width:200px;border:2px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;background:linear-gradient(135deg,rgba(129,93,242,.1),rgba(85,135,248,.08));';
     card.onclick = () => selectProCoupon('unlimited');
     card.innerHTML = '<div style="font-size:13px;color:var(--text2);margin-bottom:4px;">무제한 이용권</div>'
       + '<div style="font-size:18px;font-weight:700;color:var(--text);">∞ 사용 가능</div>'
       + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">최대 50,000자/회</div>';
     listEl.appendChild(card);
   } else if (coupon && coupon.tier === sub.tier) {
     const card = document.createElement('div');
     card.className = 'pro-coupon-card';
     card.dataset.tier = sub.tier;
     card.style.cssText = 'flex:1;min-width:200px;border:2px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;background:var(--surface2);';
     card.onclick = () => selectProCoupon(sub.tier);
     card.innerHTML = '<div style="font-size:13px;color:var(--text2);margin-bottom:4px;">' + TIER_LABELS[sub.tier] + ' 쿠폰</div>'
       + '<div style="font-size:18px;font-weight:700;color:var(--text);">' + (coupon.remaining || 0) + ' / ' + (coupon.granted || 50) + '</div>'
       + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">최대 ' + parseInt(sub.tier,10).toLocaleString() + '자/회</div>';
     listEl.appendChild(card);
   }
 }
 if (emptyEl) emptyEl.style.display = (sub.tier !== 'unlimited' && (!coupon || coupon.remaining <= 0)) ? 'block' : 'none';

 // 자동 선택: 본인 티어 카드 자동 선택
 if (!window.PRO_STATE.selectedTier && sub.tier) selectProCoupon(sub.tier);
}
window.refreshProTab = refreshProTab;

async function runProAnalysis() {
 const authUser = await getCurrentAuthUser(8000);
 if (!authUser) { showScreen('login'); return; }
 const sub = window.SUB;
 const tier = window.PRO_STATE.selectedTier;
 if (!sub || !tier) { alert('사용할 쿠폰을 선택해 주세요.'); return; }
 const text = document.getElementById('proInputText').value.trim();
 if (text.length < 5) { alert('처리할 글을 5자 이상 입력해 주세요.'); return; }
 const charLimit = (tier === 'unlimited') ? 50000 : parseInt(tier, 10);
 if (text.length > charLimit) { alert(TIER_LABELS[tier] + ' 한도를 초과했어요.'); return; }

 const mode = window.PRO_STATE.mode;
 const apiMode = mode === 'detect' ? 'detect' : 'humanize';
 const humanizeMode = mode === 'detect' ? null : mode;
 const publicMode = mode === 'detect' ? null : publicTransformMode(mode);
 const minLen = mode === 'detect' ? 5 : transformMinLength(publicMode);
 if (text.length < minLen) { alert('이 모드는 최소 ' + minLen.toLocaleString() + '자부터 이용할 수 있어요.'); return; }

 const btn = document.getElementById('proRunBtn');
 btn.disabled = true; btn.textContent = '처리 중...'; btn.style.opacity = '.7';

 try {
   const runLang = autoLangForText(text, selectedLang);
   const res = apiMode === 'detect'
    ? await callAnalyzeApi({
       mode: 'detect',
       text,
       humanizeMode: null,
       lang: runLang,
       idToken: await authUser.getIdToken(true),
       billingMode: 'coupon'
      })
    : await callTransformJob({
       authUser,
       text,
       humanizeMode: publicMode,
       lang: runLang,
       billingMode: 'coupon',
       basicStyle: publicMode === 'blog' ? 'blog' : undefined
      });
   if (res.error) throw new Error(res.error);
   if (!res.ok) throw new Error('처리 실패');
   renderProResult(res.result, apiMode);
   // 쿠폰 사용량 갱신 — 환불 예상액도 새로고침 전 즉시 같은 사용량을 반영한다.
   if (window.COUPON) {
     window.COUPON.used = Math.max(0, Number(window.COUPON.used) || 0) + 1;
     if (tier !== 'unlimited') {
       window.COUPON.remaining = Math.max(0, (window.COUPON.remaining || 0) - 1);
     }
   }
   refreshProTab();
 } catch (e) {
   alert('작업을 완료하지 못했어요. ' + (e.message || '잠시 후 다시 시도해 주세요.'));
 } finally {
   btn.disabled = false; btn.textContent = '실행'; btn.style.opacity = '1';
   updateProCount(document.getElementById('proInputText'));
 }
}

function renderProResult(result, apiMode) {
 const wrap = document.getElementById('proResult');
 if (!wrap) return;
 if (apiMode === 'detect') {
   if (typeof window.gpNormalizeDetectPresentation === 'function') result = window.gpNormalizeDetectPresentation(result);
   const p = (result.probability ?? 0);
   wrap.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;">'
     + '<div style="font-size:13px;color:var(--text3);">AI 작성 가능성</div>'
     + '<div style="font-size:32px;font-weight:800;color:var(--text);margin:6px 0;">' + p + '%</div>'
     + (result.detail ? '<div style="font-size:13px;color:var(--text2);white-space:pre-wrap;">' + escapeHtml(result.detail) + '</div>' : '')
     + '</div>';
 } else {
   const out = result.outputText || '';
   wrap.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;">'
     + '<div style="font-size:13px;color:var(--text3);margin-bottom:8px;">변환 결과</div>'
     + '<div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--text);">' + escapeHtml(out) + '</div>'
     + (result.summary ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text2);">' + escapeHtml(result.summary) + '</div>' : '')
     + '</div>';
 }
}

function escapeHtml(s) {
 return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function toggleExpand(){const ta=document.getElementById('inputText');const btn=document.getElementById('expandBtn');if(!btn)return;if(btn.dataset.expanded==='true'){ta.style.maxHeight='';ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,parseInt(getComputedStyle(ta).maxHeight))+'px';btn.dataset.expanded='false';btn.textContent='↕ 펼치기';}else{ta.style.maxHeight='none';ta.style.height=ta.scrollHeight+'px';btn.dataset.expanded='true';btn.textContent='↕ 접기';}}
function autoResize(el) {
 const btn=document.getElementById('expandBtn');
 if(btn && btn.dataset.expanded==='true') return;
 el.style.height='auto';
 el.style.height=Math.min(el.scrollHeight, parseInt(getComputedStyle(el).maxHeight))+'px';
}
function updateCount(el) {
 document.getElementById('ccount').textContent=el.value.length.toLocaleString()+'자';
 autoResize(el);
 updateHint();
 updateSendBtn();
 checkLangMismatch();
}
function updateHint() {
 const t=document.getElementById('inputText').value;
 const creditMode = currentCreditMode();
 const n=creditNeededForText(t, creditMode);
 const el=document.getElementById('chint');
 if(el) el.textContent=t.length>0?n+'크레딧 소모 예정':(creditMode === 'detect' ? '100자당 1크레딧' : '최소 10크레딧 · 100자당 2크레딧');
}
// pdf.js lazy loader — 첨부 시점에 1회만 로드
let pdfJsPromise = null;
const PDF_MAX_PAGES = 100;
const PDF_MAX_EXTRACTED_CHARS = 30000;
const PDF_EXTRACT_TIMEOUT_MS = 20000;
function pdfDeadlineError() {
 return new Error('PDF 처리 시간이 20초를 넘었어요. 더 짧은 문서로 나눠 주세요.');
}
async function withPdfDeadline(promise, deadlineMs) {
 const remaining = deadlineMs - Date.now();
 if (remaining <= 0) throw pdfDeadlineError();
 let timer = null;
 try {
  return await Promise.race([
   promise,
   new Promise((_, reject) => { timer = setTimeout(() => reject(pdfDeadlineError()), remaining); })
  ]);
 } finally {
  if (timer) clearTimeout(timer);
 }
}
function loadPdfJs() {
 if (pdfJsPromise) return pdfJsPromise;
 pdfJsPromise = new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => {
   if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    resolve(window.pdfjsLib);
   } else {
    pdfJsPromise = null;
    reject(new Error('pdfjsLib not found'));
   }
  };
  s.onerror = () => { pdfJsPromise = null; reject(new Error('pdf.js 스크립트 로드 실패')); };
  document.head.appendChild(s);
 });
 return pdfJsPromise;
}

async function extractPdfText(file) {
 const pdfjsLib = await loadPdfJs();
 const buf = await file.arrayBuffer();
 // PDF.js 3.x의 CVE-2024-4367 공식 완화책. 업로드된 PDF의 eval 및
 // 문서 내 스크립트가 호스팅 도메인 문맥에서 실행되지 않게 고정한다.
 const loadingTask = pdfjsLib.getDocument({
  data: buf,
  isEvalSupported: false,
  enableScripting: false
 });
 const deadline = Date.now() + PDF_EXTRACT_TIMEOUT_MS;
 let pdf = null;
 try {
  pdf = await withPdfDeadline(loadingTask.promise, deadline);
  if (pdf.numPages > PDF_MAX_PAGES) {
   throw new Error('PDF는 한 번에 100쪽까지만 불러올 수 있어요. 문서를 나눠 주세요.');
  }
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
   const page = await withPdfDeadline(pdf.getPage(i), deadline);
   const content = await withPdfDeadline(page.getTextContent(), deadline);
   out += content.items.map(it => it.str).join(' ') + '\n\n';
   if (out.length > PDF_MAX_EXTRACTED_CHARS) {
    throw new Error('PDF에서 읽은 글이 30,000자를 넘어요. 필요한 부분만 나눠서 올려 주세요.');
   }
  }
  return out.trim();
 } finally {
  try {
   if (pdf && typeof pdf.destroy === 'function') await pdf.destroy();
   else if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
  } catch (_) {}
 }
}

function handlePDF(input) {
 const file = input.files[0];
 if (!file) return;
 // 파일 형식 검증 — accept 속성은 힌트일 뿐, 드래그/모바일에서 우회 가능
 const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
 if (!isPdf) {
  alert('PDF 파일만 첨부할 수 있어요. 선택한 파일: ' + (file.name || '파일 이름 없음'));
  input.value = '';
  return;
 }
 if (file.size === 0) {
  alert('내용이 없는 파일이에요. 다른 PDF를 선택해 주세요.');
  input.value = '';
  return;
 }
 if (file.size > 10 * 1024 * 1024) {
  const mb = (file.size / 1024 / 1024).toFixed(1);
  alert('PDF 파일은 10MB 이하만 가능해요.\n선택한 파일: ' + mb + 'MB');
  input.value = '';
  return;
 }
 extractAndFillFromPdf(file);
}

async function extractAndFillFromPdf(file) {
 const inputText = document.getElementById('lavInput') || document.getElementById('inputText');
 if (!inputText) return;
 const prevPlaceholder = inputText.placeholder;

 inputText.disabled = true;
 inputText.placeholder = 'PDF에서 텍스트를 추출하고 있어요...';
 if (window.gpToast) window.gpToast(file.name + '에서 텍스트를 읽고 있어요.', { type: 'info', title: 'PDF 처리 중' });

 try {
  const text = await extractPdfText(file);
  if (!text || text.length < 5) {
   alert('이 PDF에서는 글자를 읽어올 수 없어요.\n스캔 이미지나 보호된 파일일 수 있으니, 텍스트를 직접 복사해 붙여넣어 주세요.');
   clearPDF();
   return;
  }
  inputText.value = text;
  if (inputText.id === 'lavInput' && typeof window.lavSyncCount === 'function') window.lavSyncCount(inputText);
  else updateCount(inputText);
  if (window.gpToast) window.gpToast(text.length.toLocaleString() + '자를 입력창에 넣었어요.', { type: 'success', title: 'PDF 불러오기 완료' });
  if (text.length < 100) {
   alert('읽어 온 텍스트가 ' + text.length + '자로 너무 짧아요. 스캔 PDF인지 확인해 주세요.');
  }
 } catch (e) {
  console.error('PDF 추출 오류:', e);
  alert('PDF를 처리하지 못했어요. ' + (e.message || '파일을 확인한 뒤 다시 시도해 주세요.'));
  clearPDF();
 } finally {
  inputText.disabled = false;
  inputText.placeholder = prevPlaceholder;
  const picker = document.getElementById('pdfInput');
  if (picker) picker.value = '';
 }
}

function clearPDF() {
 const inputText = document.getElementById('lavInput') || document.getElementById('inputText');
 const picker = document.getElementById('pdfInput');
 if (picker) picker.value = '';
 if (!inputText) return;
 inputText.value = '';
 inputText.disabled = false;
 inputText.placeholder = '다듬을 초안이나 문단을 붙여넣어 보세요...';
 if (inputText.id === 'lavInput' && typeof window.lavSyncCount === 'function') window.lavSyncCount(inputText);
 else updateCount(inputText);
}

/* ══════════════════════════════════════════════════════════════
   자동 청크 분할 · 순차 실행 (5,000자 초과 시)
   ══════════════════════════════════════════════════════════════ */
function splitByBoundary(text, MIN, MAX) {
 MIN = MIN || 4500;
 MAX = MAX || 5500;
 var chunks = [];
 var rest = text;
 while (rest.length > MAX) {
  // [MIN, MAX] 범위 내에서 가장 뒤쪽의 자연스러운 경계 탐색
  var win = rest.slice(MIN, MAX);
  var cut = -1;
  // 1) 문단 경계 (\n\n)
  var paraIdx = win.lastIndexOf('\n\n');
  if (paraIdx >= 0) cut = MIN + paraIdx + 2;
  // 2) 문장 경계 — 영어 구두점 + 한글 종결
  if (cut < 0) {
   var sentRe = /[.!?。！？](?:\s|$)|(?:다|요|까|죠|네|군|나|지)\.(?:\s|$)/g;
   var last = -1, m;
   while ((m = sentRe.exec(win)) !== null) {
    last = m.index + m[0].length;
   }
   if (last >= 0) cut = MIN + last;
  }
  // 3) 공백 fallback
  if (cut < 0) {
   var sp = win.lastIndexOf(' ');
   if (sp >= 0) cut = MIN + sp + 1;
  }
  // 4) 강제 절단 (MAX)
  if (cut < 0) cut = MAX;
  chunks.push(rest.slice(0, cut).trim());
  rest = rest.slice(cut).trim();
 }
 if (rest.length) chunks.push(rest);
 return chunks;
}

// /analyze 호출 (타임아웃 + 재시도 포함).
// - 타임아웃: 긴 generation(refine 포함 ~수분)을 죽이지 않도록 넉넉히 잡고, 진짜 hang만 끊는다.
//   abort 시 서버는 req.on('close')로 작업 중단 + 차감 스킵/복구하므로 "크레딧만 사라짐"이 안 생긴다.
// - 재시도: 429/5xx/네트워크 오류처럼 일시적인 실패만 백오프 재시도. 잔액부족·인증·길이 오류는 즉시 throw.
// 성공 시 서버 body({ ok, result, usage, ... })를 반환한다.
// 작업 멱등 키: 같은 작업(재시도·청크 포함)이 두 번 도달해도 서버가 1회만 차감하도록 고정 ID를 발급.
function genReqId() {
 try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
 return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 입력 글의 주 언어 자동 판별 — 영어 글을 'ko'로 보내 결과가 한글로 나오던 버그(민원 #124·#145) 방지.
// 한글 비중<15%면 영어로, >50%면 한국어로 확정. 애매한 혼합문은 사용자가 고른 fallback 유지.
function autoLangForText(text, fallback) {
 var t = (text || '').replace(/\s+/g, '');
 if (!t.length) return fallback || 'ko';
 var ko = (t.match(/[가-힣]/g) || []).length;
 var ratio = ko / t.length;
 if (ratio < 0.15) return 'en';
 if (ratio > 0.5) return 'ko';
 return fallback || 'ko';
}

async function getCurrentAuthUser(timeoutMs) {
 if (typeof window.waitForAuthUser === 'function') {
  try {
   const waited = await window.waitForAuthUser(timeoutMs == null ? 8000 : timeoutMs);
   if (waited && waited.getIdToken) return waited;
  } catch (_) {}
 }
 const deadline = Date.now() + (timeoutMs == null ? 8000 : timeoutMs);
 const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
 try {
  if (window.authPersistenceReady) await Promise.race([window.authPersistenceReady, wait(500)]);
  if (window.authReady) await Promise.race([window.authReady, wait(1000)]);
 } catch (_) {}
 while (Date.now() < deadline) {
  const user = window.CU || (window._fbAuth && window._fbAuth.currentUser);
  if (user && user.getIdToken) {
   window.CU = user;
   return user;
  }
  await wait(150);
 }
 const user = window.CU || (window._fbAuth && window._fbAuth.currentUser);
 if (user && user.getIdToken) {
  window.CU = user;
  return user;
 }
 return null;
}

async function callAnalyzeApi(payload, opts) {
 opts = opts || {};
 if (payload.mode !== 'detect') {
  throw new Error('휴머나이징은 새 변환 작업 경로를 이용해야 합니다.');
 }
 var maxRetries = (opts.maxRetries == null) ? 1 : opts.maxRetries;
 var timeoutMs = opts.timeoutMs || 300000;
 var delay = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
 var attempt = 0;
 while (true) {
  var ctrl = new AbortController();
  var timedOut = false;
  var timer = setTimeout(function(){ timedOut = true; ctrl.abort(); }, timeoutMs);
  var res = null, body = null, netErr = null;
  try {
   res = await fetch(window.apiUrl('/analyze'), {
    method: 'POST',
    headers: Object.assign(
     { 'Content-Type': 'application/json' },
     payload.idToken ? { Authorization: 'Bearer ' + payload.idToken } : {}
    ),
    body: JSON.stringify({
     mode: payload.mode,
     text: payload.text,
     humanizeMode: payload.humanizeMode,
     lang: payload.lang,
     prevContext: payload.prevContext || '',
     billingMode: payload.billingMode || 'credit',
     requestId: payload.requestId || undefined,
     useWebSearch: false
    }),
    signal: ctrl.signal
   });
  } catch (err) {
   netErr = err;
  } finally {
   clearTimeout(timer);
  }

  if (netErr) {
   if (timedOut) {
    // 타임아웃은 무한정 다시 기다리기보다 즉시 안내 (서버는 abort로 차감 안 함)
    var te = new Error('서버 응답이 지연돼 요청을 중단했어요. 크레딧은 차감하지 않았어요. 글을 더 짧게 나눠 다시 시도해 주세요.');
    te.code = 'timeout';
    throw te;
   }
   if (attempt < maxRetries) { attempt++; await delay(1500 * attempt); continue; }
   throw new Error('네트워크 연결이 불안정해요. 잠시 후 다시 시도해 주세요.');
  }

  try { body = await res.json(); } catch (e) { body = null; }

  if (res.status === 429) {
   if (attempt < maxRetries) { attempt++; await delay(2000 * attempt); continue; }
   throw new Error((body && body.error) || '요청이 많아 잠시 기다려야 해요. 잠시 후 다시 시도해 주세요.');
  }
  if (res.status >= 500) {
   if (attempt < maxRetries) { attempt++; await delay(1500 * attempt); continue; }
   throw new Error((body && body.error) || '서버에서 작업을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  // 400/402 등 — 재시도해도 결과가 안 바뀌는 오류
  if (body && body.error) {
   var apiError = new Error(body.error);
   apiError.status = res.status;
   apiError.code = body.code || '';
   apiError.body = body;
   throw apiError;
  }
  if (!body || !body.ok) throw new Error('처리 중 오류가 발생했어요.');
  return body;
 }
}

// 휴머나이징은 /transform job 하나로 통일한다. 구형 화면의 assignment/resume/thesis는
// 공개 formal 모드로, blog는 blog로 명시 매핑한다. /analyze는 detect 전용이다.
function publicTransformMode(humanizeModeValue) {
 var value = String(humanizeModeValue || '').toLowerCase();
 if (value === 'blog') return 'blog';
 if (value === 'polish' || value === 'preserve') return 'polish';
 return 'formal';
}

function transformMinLength(transformMode) {
 return transformMode === 'formal' ? 200 : 50;
}

function formalFallbackEstimateRange(text) {
 var bare = String(text || '').replace(/\s/g, '').length;
 var round5 = function(seconds) { return Math.ceil(Math.max(0, Number(seconds) || 0) / 300) * 300; };
 var lowSec = round5(Math.max(240, Math.min(4500, 180 + (bare * 0.08))));
 var highSec = round5(Math.max(lowSec + 300, Math.min(5400, 360 + (bare * 0.22))));
 return { lowSec: lowSec, highSec: highSec };
}

function estimateRangeLabel(range) {
 var low = Math.max(1, Math.round((Number(range && range.lowSec) || 0) / 60));
 var high = Math.max(low, Math.round((Number(range && range.highSec) || 0) / 60));
 return low === high ? '약 ' + high + '분' : '약 ' + low + '~' + high + '분';
}

function transformCreditNeeded(text, transformMode) {
 var len = String(text || '').length;
 if (transformMode === 'formal') {
  return window.gpHumanizePricing.advancedCredits(len, false);
 }
 return shortHumanizeCredit(len);
}

async function transformFetchJson(authUser, path, init, forceRefresh) {
 var token = await authUser.getIdToken(forceRefresh === true);
 var options = Object.assign({}, init || {});
 options.headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token });
 var response = await fetch(window.apiUrl(path), options);
 var body = null;
 try { body = await response.json(); } catch (_) {}
 if (response.status === 401 && forceRefresh !== true) {
  return transformFetchJson(authUser, path, init, true);
 }
 if (!response.ok || (body && body.error)) {
  var error = new Error((body && body.error) || '변환 요청을 처리하지 못했어요.');
  error.code = body && body.code;
  error.status = response.status;
  error.body = body;
  throw error;
 }
 return body || {};
}

async function callTransformJob(payload) {
 var authUser = payload.authUser;
 if (!authUser || typeof authUser.getIdToken !== 'function') throw new Error('로그인이 필요해요.');
 var transformMode = publicTransformMode(payload.humanizeMode || payload.mode);
 var minLen = transformMinLength(transformMode);
 var text = String(payload.text || '').trim();
 if (text.length < minLen) throw new Error('이 모드는 최소 ' + minLen + '자부터 변환할 수 있어요.');
 var start;
 try {
  start = await transformFetchJson(authUser, '/transform', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    text: text,
    mode: transformMode,
    lang: payload.lang || 'ko',
    billingMode: payload.billingMode === 'coupon' ? 'coupon' : 'credit',
    basicStyle: transformMode === 'blog' ? (payload.basicStyle === 'report' ? 'report' : 'blog') : undefined,
    evidence: false,
    effectNoticeAccepted: payload.effectNoticeAccepted === true
   })
  }, false);
 } catch (error) {
  if (error && error.status === 409 && error.code === 'LIMITED_EFFECT_CONFIRMATION_REQUIRED' && payload.effectNoticeAccepted !== true) {
   var accepted = window.gpConfirm
    ? await window.gpConfirm({
       title: '변화가 작을 수 있는 글이에요',
       message: '이미 자연스러운 글은 바꿀 대상이 적어 원문의 장르·화자·리듬을 지키는 범위에서만 손봐요. 안전한 얕은 결과도 정상 과금해요.',
       confirmText: '확인하고 진행'
      })
    : confirm('이미 자연스러운 글이라 결과 변화가 작을 수 있어요. 안전한 얕은 결과도 정상 과금해요. 계속할까요?');
   if (!accepted) throw new Error('예상 효과 확인 후 다시 시작해 주세요. 크레딧은 차감되지 않았어요.');
   return callTransformJob(Object.assign({}, payload, { effectNoticeAccepted: true }));
  }
  throw error;
 }
 if (typeof payload.onEstimate === 'function') payload.onEstimate(start);
 var jobId = start.jobId;
 if (!jobId) throw new Error('작업 번호를 받지 못했어요.');
 var deadline = Date.now() + 6 * 60 * 60 * 1000;
 while (Date.now() < deadline) {
  await new Promise(function(resolve){ setTimeout(resolve, 2500); });
  var current = await transformFetchJson(authUser, '/transform/' + encodeURIComponent(jobId), { method: 'GET' }, false);
  var progress = document.getElementById('progStatus');
  if (progress && current.stage) progress.textContent = current.stage;
  if (current.status === 'done') {
    var result = Object.assign({}, current.result || {});
    result.billingDisposition = current.billingDisposition || result.billingDisposition || '';
    result.deducted = current.deducted === true;
    return {
     ok: true,
     result: result,
     historySaved: true,
     jobId: jobId,
     needed: Number(start.job && start.job.needed) || Number(current.needed) || 0,
     billingMode: start.job && start.job.billingMode || payload.billingMode || 'credit',
     billingDisposition: current.billingDisposition || result.billingDisposition || '',
     deducted: current.deducted === true
    };
  }
  if (current.status === 'blocked') {
   var blocked = new Error(current.reason || current.error || '안전하게 전달할 수 있는 결과를 만들지 못해 작업을 멈췄어요. 크레딧은 차감되지 않았어요.');
   blocked.code = 'transform_blocked';
   blocked.body = current;
   throw blocked;
  }
  if (current.status === 'error') throw new Error(current.error || '변환 중 오류가 발생했어요.');
  if (current.status === 'cancelled') throw new Error('변환 작업이 취소됐어요.');
  if (current.status === 'awaiting_approval') {
   throw new Error('이 작업은 근거 승인이 필요해요. 새 변환 화면에서 계속해 주세요.');
  }
 }
 throw new Error('처리 시간이 길어지고 있어요. 작업 결과는 작업 기록에서 확인해 주세요.');
}

function combineChunkResults(results, apiMode) {
 if (apiMode === 'detect') {
  var probs = results.map(function(r){ return typeof r.probability === 'number' ? r.probability : 0; });
  var avg = probs.reduce(function(a,b){return a+b;}, 0) / (probs.length || 1);
  return Object.assign({}, results[0] || {}, { probability: Math.round(avg * 10) / 10 });
 }
 // humanize류
 var joined = results.map(function(r){ return r.outputText || ''; }).filter(Boolean).join('\n\n');
 var base = results[0] || {};
 return Object.assign({}, base, { outputText: joined });
}

async function runChunkedText(fullText, opts) {
 // 내부 처리 — 청크 분할 후 순차 호출. 긴 입력일 때 사용자가
 // "멈춘 게 아니다"를 인지할 수 있도록 진행 상태 메시지를 갱신한다.
 var chunks = splitByBoundary(fullText, 4500, 5500);
 var results = [];
 var prevTail = '';
 var doneNeeded = 0;  // 차감 정합용 — 서버 청크별 차감 공식을 그대로 누적
 for (var i = 0; i < chunks.length; i++) {
  // 청크 진행 표시 (별도 element — setInterval의 가짜 단계 메시지와 분리)
  if (chunks.length > 1) {
   var chunkEl = document.getElementById('progChunk');
   if (chunkEl) chunkEl.textContent = '청크 ' + (i + 1) + ' / ' + chunks.length;
  }
  var body;
  try {
   body = await callAnalyzeApi({
    mode: opts.mode,
    text: chunks[i],
    humanizeMode: opts.humanizeMode,
    lang: opts.lang,
    idToken: opts.idToken,
    prevContext: prevTail,
    billingMode: opts.billingMode,
    // 청크별 고정 멱등 키 — 재시도(maxRetries:3) 시 같은 청크의 중복 차감 방지.
    requestId: opts.requestId ? (opts.requestId + ':' + i) : undefined,
    useWebSearch: false
   }, { maxRetries: 3 });   // 청크는 한 작업의 일부 — 일시 실패에 더 끈질기게 재시도해 부분 실패 빈도↓
  } catch (err) {
   // ★ 부분 결과 보존: 앞 청크들은 서버에서 정상 차감·완료됐다(disconnect 아님 → 서버 복구 대상 아님).
   //   여기서 전체를 버리면 "크레딧만 사라지고 결과 0" 민원이 된다. 처리된 청크 결과를 살려 전달.
   if (results.length > 0) {
    err.partial = {
     result: combineChunkResults(results, opts.mode),
     done: results.length,
     total: chunks.length,
     doneNeeded: doneNeeded
    };
   }
   throw err;
  }
  results.push(body.result);
  doneNeeded += creditNeededForText(chunks[i], opts.mode);
  prevTail = chunks[i].slice(-200);
 }
 return { ok: true, result: combineChunkResults(results, opts.mode) };
}

async function runAnalysis() {
 const authUser = await getCurrentAuthUser(8000);
 if (!authUser) {
 if (window.gpTrack) window.gpTrack('login_required', { source: 'analysis' });
 alert('로그인한 뒤 이용해 주세요. 신규 가입 계정에는 20크레딧을 드려요.');
 showScreen('login');
 return;
}
 const text = document.getElementById('inputText').value.trim();
 if (!text) { alert('처리할 글을 입력하거나 PDF를 첨부해 주세요.'); return; }
 if (text.length < 20) { alert('20자 이상 입력해 주세요.'); return; }
 const selectedTransformMode = mode === 'detect' ? null : publicTransformMode(humanizeMode);
 if (selectedTransformMode) {
  const minLen = transformMinLength(selectedTransformMode);
  if (text.length < minLen) { alert('이 모드는 최소 ' + minLen.toLocaleString() + '자부터 변환할 수 있어요.'); return; }
 }

 // ★ 긴 글 사전 차감 정합(P0-3): 청크 분할 시 서버는 청크별 과금 공식을 각각 적용하므로,
 //   단순 전체 길이 계산이 아니라 청크 합계로 선검증해야 "99%에서 크레딧 부족"으로 중간 중단되던 민원(#120)을 막는다.
 const precheckMode = mode === 'detect' ? 'detect' : 'humanize';
 let needed;
 if (mode !== 'detect') {
  needed = transformCreditNeeded(text, selectedTransformMode);
 } else if (text.length > 5500) {
  needed = splitByBoundary(text, 4500, 5500).reduce(function (s, c) { return s + creditNeededForText(c, precheckMode); }, 0);
 } else {
  needed = creditNeededForText(text, precheckMode);
 }
 if (window.UP !== 'unlimited' && (window.UC || 0) < needed) {
 if (typeof window.gpOpenCreditCheckout === 'function') {
  await window.gpOpenCreditCheckout({
   action: 'main_analysis',
   source: 'main_precheck',
   neededCredits: needed,
   currentCredits: window.UC || 0,
   payload: {
    text: text,
    mode: mode === 'detect' ? 'detect' : 'humanize',
    humanizeMode: humanizeMode || 'assignment',
    selectedLang: selectedLang || 'ko'
   }
  });
 } else {
  const ok = confirm('이 글을 변환하려면 ' + needed + '크레딧이 필요해요(현재 ' + (window.UC || 0) + '크레딧). 충전 페이지로 이동할까요?');
  if (ok) switchTab('pricing');
 }
 if (window.gpTrack) window.gpTrack('credit_insufficient', {
  analysis_mode: mode === 'detect' ? 'detect' : 'humanize',
  needed_credits: needed,
  current_credits: window.UC || 0,
  chars: text.length
 });
 return;
 }

 const btn = document.getElementById('sbtn');
 btn.classList.add('loading'); btn.disabled = true;
 const lsBtn = document.getElementById('lsSendBtn');
 if (lsBtn) { lsBtn.disabled = true; lsBtn.style.opacity = '.4'; lsBtn.style.cursor = 'not-allowed'; }

 // 감지는 동기 요청이라 이탈 시 결과가 사라진다. 휴머나이징은 서버 job으로 계속 진행되고 이용 기록에 남는다.
 const onLeave = (e) => { e.preventDefault(); e.returnValue = '분석이 진행 중입니다. 떠나면 결과가 사라져요.'; return e.returnValue; };
 if (mode === 'detect') window.addEventListener('beforeunload', onLeave);

 // 고급은 완료 시각을 한 점으로 단정하지 않고 범위로 안내한다. 작업 접수 후
 // 서버의 실제 v2 청크 계산값이 오면 아래 폴백 범위와 진행 기준을 교체한다.
 const initialEstimate = (() => {
  const len = text.replace(/\s/g, '').length;
  if (mode === 'detect') {
   const seconds = (text.length > 5500 ? Math.ceil(text.length / 5500) : 1) * 10 + 2;
   return { highSec: seconds, label: '약 ' + seconds + '초' };
  }
  if (selectedTransformMode === 'formal') {
   const range = formalFallbackEstimateRange(text);
   return { lowSec: range.lowSec, highSec: range.highSec, label: estimateRangeLabel(range) };
  }
  const seconds = Math.max(90, Math.min(1200, Math.round(len / 12)));
  return { highSec: seconds, label: '약 ' + Math.max(1, Math.ceil(seconds / 60)) + '분' };
 })();
 const estSec = initialEstimate.highSec;
 const hintHtml = mode === 'detect'
  ? `<div class="prog-hint">예상 처리 시간: ${initialEstimate.label}. 페이지를 닫지 말아주세요.</div>`
  : `<div class="prog-hint">예상 처리 시간: ${initialEstimate.label}. 창을 닫아도 서버에서 계속 처리해요.</div>
     <div class="prog-warn">완료된 결과는 작업 기록에서 다시 확인할 수 있어요.</div>`;
 document.getElementById('result').innerHTML = `<div class="progress-overlay" id="progressOverlay">
  <div class="prog-pct" id="progPct">0%</div>
  <div class="prog-status" id="progStatus">준비 중</div>
  <div class="prog-track"><div class="prog-bar" id="progBar"></div></div>
  <div class="prog-chunk" id="progChunk" style="margin-top:8px;font-size:13px;color:var(--text3);"></div>
  ${hintHtml}
 </div>`;

 let pct = 0;
 const pctEl = document.getElementById('pctTxt');
 const fillEl = document.getElementById('progressFill');
 const barEl = document.getElementById('progressBar');
 const progPctEl = document.getElementById('progPct');
 const progBarEl = document.getElementById('progBar');
 const progStatusEl = document.getElementById('progStatus');
 if (barEl) barEl.style.display = 'block';

 if (window.gpTrack) window.gpTrack('analysis_start', {
  analysis_mode: mode === 'detect' ? 'detect' : 'humanize',
  humanize_mode: mode === 'detect' ? '' : (humanizeMode || 'assignment'),
  needed_credits: needed,
  chars: text.length
 });

 const stages = (mode !== 'detect')
  ? [
      { at: 0, msg: '원문 장르와 구조를 확인하는 중...' },
      { at: 15, msg: '화자와 중요 사실을 보호하는 중...' },
      { at: 35, msg: '문장 흐름을 자연스럽게 다듬는 중...' },
      { at: 60, msg: '의미와 사실을 검증하는 중...' }
    ]
  : [
      { at: 0, msg: '텍스트 분석 중...' },
      { at: 25, msg: '특징 추출 중...' },
      { at: 60, msg: 'AI 패턴 검사 중...' }
    ];
 const tailMsgs = [
  '거의 완료...',
  '원문의 말투에 맞게 다듬는 중...',
  '문장을 자연스럽게 고치는 중...',
  '어휘 다양성 검증 중...',
  '마지막 다듬는 중...',
  '거의 다 됐어요...'
 ];
 let tailIdx = 0;
 let tick = 0;
 const startMs = Date.now();
 let estimatedMs = estSec * 1000;

 const prog = setInterval(() =>{
  tick++;
  const elapsed = Date.now() - startMs;
  // 경과 시간/예상 시간 비율로 0→95% 선형 진행. 추정보다 늦으면 95%에서 점근.
  const linearPct = Math.min((elapsed / estimatedMs) * 95, 95);
  if (linearPct >= 95) {
   if (pct < 95) pct = 95;
   pct += (99 - pct) * 0.03;
  } else {
   pct = linearPct;
  }
  const rounded = Math.round(pct);
  if (pctEl) pctEl.textContent = rounded + '%';
  if (fillEl) fillEl.style.width = pct + '%';
  if (progPctEl) progPctEl.textContent = rounded + '%';
  if (progBarEl) progBarEl.style.width = pct + '%';
  if (pct < 85) {
   for (let i = stages.length - 1; i >= 0; i--) {
    if (pct >= stages[i].at) { if (progStatusEl) progStatusEl.textContent = stages[i].msg; break; }
   }
  } else {
   if (tick % 10 === 0) tailIdx = (tailIdx + 1) % tailMsgs.length;
   if (progStatusEl) progStatusEl.textContent = tailMsgs[tailIdx];
  }
 }, 500);

 try {
 let data;
 const currentMode = mode === 'detect' ? 'detect' : 'humanize';
 const idToken = await authUser.getIdToken(true);

 // PDF는 첨부 시 브라우저(pdf.js)에서 텍스트로 추출돼 입력창에 채워지므로(extractAndFillFromPdf),
 // 여기서는 항상 텍스트 경로로 처리한다. (서버 /analyze-pdf 호출 분기는 미사용이라 제거됨)
 const selectedHumanizeMode = humanizeMode || 'assignment';
 const apiMode = mode === 'detect' ? 'detect' : 'humanize';
 const runLang = autoLangForText(text, selectedLang);   // 영어 글이 한글로 나오던 버그 방지
 const commonOpts = {
  mode: apiMode,
  humanizeMode: selectedHumanizeMode,
  lang: runLang,
  idToken: idToken,
  requestId: genReqId(),   // 이 변환 작업의 멱등 키(단일·청크 공통)
  useWebSearch: false
 };

 if (apiMode !== 'detect') {
  data = await callTransformJob({
   authUser: authUser,
   text: text,
   humanizeMode: selectedTransformMode,
   lang: runLang,
   billingMode: 'credit',
   basicStyle: selectedTransformMode === 'blog' ? 'blog' : undefined,
   onEstimate: function(start) {
    if (selectedTransformMode !== 'formal') return;
    var lowSec = Number(start && (start.estLowSec || start.job && start.job.estLowSec));
    var highSec = Number(start && (start.estHighSec || start.job && start.job.estHighSec));
    if (!(lowSec > 0 && highSec >= lowSec)) return;
    estimatedMs = highSec * 1000;
    var hint = document.querySelector('.prog-hint');
    if (hint) hint.textContent = '예상 처리 시간: ' + estimateRangeLabel({ lowSec: lowSec, highSec: highSec }) + '. 창을 닫아도 서버에서 계속 처리해요.';
   }
  });
 } else if (text.length > 5500) {
  // 내부 자동 분할 — 유저 노출 없음
  data = await runChunkedText(text, commonOpts);
 } else {
  data = await callAnalyzeApi(Object.assign({ text: text }, commonOpts));
 }

 // 서버가 전달한 최종 과금 처리값만 UI에 반영한다. 과거 무차감 기록도 차감처럼 보이지 않는다.
 const noChargeDisposition = /^(?:waived_|plan_unlimited|admin_no_charge)/u.test(String(data.billingDisposition || data.result?.billingDisposition || ''));
 const chargedNeeded = currentMode === 'detect'
  ? (Number(data.needed) || needed)
  : (data.deducted === false || noChargeDisposition ? 0 : (Number(data.needed) || needed));
 if (window.UP !== 'unlimited') { window.UC = Math.max(0, (window.UC || 0) - chargedNeeded); updateCreditUI(); }

 // 서버가 단일 호출 결과를 이미 저장했으면(historySaved) 중복 저장하지 않는다.
 // 청크(>5500자)·구형 서버 응답은 historySaved가 없어 기존대로 클라가 저장(폴백).
 if (!data.historySaved) {
  await window.saveHistory(
  currentMode,
  text,
  mode === 'detect' ? data.result : null,
  mode !== 'detect' ? data.result : null,
  chargedNeeded
  );
 }
 if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory();

 const _ts = localStorage.getItem('traffic_source') || 'direct';
 const _chars = text.length;
 if (currentMode === 'detect') {
  if (window.gpTrack) window.gpTrack('detect_run', { chars: _chars, lang: runLang, pdf: false, traffic_source: _ts });
 } else {
  if (window.gpTrack) window.gpTrack('humanize_run', { mode: humanizeMode, chars: _chars, lang: runLang, pdf: false, traffic_source: _ts });
 }
 if (window.gpTrack) window.gpTrack('analysis_complete', {
  analysis_mode: currentMode,
  humanize_mode: currentMode === 'detect' ? '' : (humanizeMode || 'assignment'),
  chars: _chars,
  lang: runLang,
  pdf: false,
  credits_used: chargedNeeded,
  traffic_source: _ts
 });

 if (mode === 'detect') renderDetect(data.result);
 else renderHuman(data.result);

 } catch (e) {
 // ★ 청크 분할 중 일부만 성공한 경우: 차감된 크레딧이 헛되지 않게 부분 결과를 보여준다.
 if (e && e.partial && e.partial.result) {
  if (window.gpTrack) window.gpTrack('analysis_partial', {
   analysis_mode: mode === 'detect' ? 'detect' : 'humanize',
   chunks_done: e.partial.done || 0,
   chunks_total: e.partial.total || 0,
   chars: text.length
  });
  const pCurMode = mode === 'detect' ? 'detect' : 'humanize';
  if (mode === 'detect') renderDetect(e.partial.result);
  else renderHuman(e.partial.result);
  renderPartialWarning(e.partial.done, e.partial.total);
  // 실제 처리(차감)된 청크만큼만 크레딧 낙관 업데이트 + 부분 결과 히스토리 저장
  const partialNeeded = Math.max(0, e.partial.doneNeeded || 0);
  if (window.UP !== 'unlimited' && partialNeeded > 0) { window.UC = Math.max(0, (window.UC || 0) - partialNeeded); updateCreditUI(); }
  try {
   await window.saveHistory(
    pCurMode,
    text,
    mode === 'detect' ? e.partial.result : null,
    mode !== 'detect' ? e.partial.result : null,
    partialNeeded
   );
   if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory();
  } catch (_) {}
 } else {
  if (e && e.status === 402 && typeof window.gpOpenCreditCheckout === 'function') {
   await window.gpOpenCreditCheckout({
    action: 'main_analysis',
    source: 'main_server_precheck',
    neededCredits: needed,
    currentCredits: window.UC || 0,
    payload: {
     text: text,
     mode: mode === 'detect' ? 'detect' : 'humanize',
     humanizeMode: humanizeMode || 'assignment',
     selectedLang: selectedLang || 'ko'
    }
   });
   return;
  }
  if (window.gpTrack) window.gpTrack('analysis_error', {
   analysis_mode: mode === 'detect' ? 'detect' : 'humanize',
   message: String(e.message || 'unknown').slice(0, 120),
   chars: text.length
  });
  renderError(e.message || '오류가 발생했어요.');
 }
 } finally {
 window.removeEventListener('beforeunload', onLeave);
 clearInterval(prog);
 pct = 100;
 if (pctEl) pctEl.textContent = '100%';
 if (fillEl) fillEl.style.width = '100%';
 if (progPctEl) progPctEl.textContent = '100%';
 if (progBarEl) progBarEl.style.width = '100%';
 if (progStatusEl) progStatusEl.textContent = '완료!';
 setTimeout(() =>{
 btn.classList.remove('loading'); btn.disabled = false;
 if (lsBtn) { lsBtn.disabled = false; lsBtn.style.opacity = ''; lsBtn.style.cursor = ''; }
 if (barEl) barEl.style.display = 'none';
 if (fillEl) fillEl.style.width = '0%';
 if (pctEl) pctEl.textContent = '0%';
 }, 400);
 }
}

window.gpResumeMainAnalysis = function (payload) {
 payload = payload || {};
 if (!payload.text) return false;
 switchTab('main');
 const input = document.getElementById('inputText');
 if (!input) return false;
 input.value = payload.text;
 setMode(payload.mode === 'detect' ? 'detect' : 'humanize');
 if (payload.mode !== 'detect') {
  const modeTab = document.querySelector('.mode-tab[data-mode="' + String(payload.humanizeMode || 'assignment').replace(/[^a-z_-]/gi, '') + '"]');
  if (modeTab) selectHumanizeMode(modeTab);
 }
 if (payload.selectedLang === 'en' || payload.selectedLang === 'ko') setLang(payload.selectedLang);
 input.dispatchEvent(new Event('input', { bubbles: true }));
 if (typeof updateSendBtn === 'function') updateSendBtn();
 setTimeout(function () { runAnalysis(); }, 120);
 return true;
};

function renderDetect(r) {
 if (typeof window.gpNormalizeDetectPresentation === 'function') r = window.gpNormalizeDetectPresentation(r);
 const p = r.probability;
 let bc, bl, mainMsg, subMsg;

 if (p <= 20) {
 bc = 'safe';
 bl = ' 안전';
 mainMsg = 'AI 생성 신호가 낮게 감지됐어요';
 subMsg = '현재 점수는 낮은 구간이에요. 감지 결과는 문체 패턴에 대한 추정치이며 실제 작성 주체를 확정하지 않아요.';
 } else if (p <= 49) {
 bc = 'caution';
 bl = ' 조심';
 mainMsg = 'AI 생성 신호가 일부 감지됐어요';
 subMsg = '일부 정형적인 문체 특징이 관찰됐어요. 점수와 상세 근거를 함께 참고해 주세요.';
 } else {
 bc = 'danger';
 bl = ' 위험';
 mainMsg = 'AI 생성 신호가 높게 감지됐어요';
 subMsg = '표시된 문체 특징이 점수를 높인 신호입니다. 이 결과만으로 실제 작성 주체가 확정되는 것은 아닙니다.';
 }

 const gaugeColor = bc === 'safe' ? '#36d39b' : bc === 'caution' ? '#f4b454' : '#ff6d78';

 document.getElementById('result').innerHTML = `
 <div class="rsec">
 <div class="vbox">
 <div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px 20px;">
 <div style="width:260px;">
 <svg viewBox="0 0 200 120" style="width:100%;display:block;">
 <path d="M 30 100 A 70 70 0 0 1 170 100"
 fill="none" stroke="rgba(151,171,213,.16)" stroke-width="14" stroke-linecap="round"/>
 <path id="gaugeFill" d="M 30 100 A 70 70 0 0 1 170 100"
 fill="none"
 stroke="${gaugeColor}"
 stroke-width="14"
 stroke-linecap="round"/>
 <text x="30" y="118" text-anchor="middle" fill="#36d39b" font-size="9" font-weight="600">안전</text>

 <text x="170" y="118" text-anchor="middle" fill="#ff6d78" font-size="9" font-weight="600">위험</text>
</svg>
</div>
 <div style="text-align:center;margin-top:-55px;">
 <div style="font-size:40px;font-weight:800;color:${gaugeColor};line-height:1;letter-spacing:-1px;">${p}<span style="font-size:18px;font-weight:600;margin-left:3px;vertical-align:top;position:relative;top:6px;">%</span></div>
 <div style="margin-top:10px;">
 <span style="color:${gaugeColor};background:${bc==='safe'?'rgba(54,211,155,.14)':bc==='caution'?'rgba(244,180,84,.14)':'rgba(255,109,120,.14)'};padding:4px 14px;border-radius:12px;font-size:12px;font-weight:700;">${bl.trim()}</span>
</div>
</div>
</div>
 <div style="padding:0 24px 20px;text-align:center;">
 <div class="gauge-main-msg">${mainMsg}</div>
 <div class="gauge-sub-msg">${subMsg}</div>
</div>
 <div class="dtabs">
 <button class="dtab active" onclick="dtab(this,'dt1')">상세 분석</button>
 <button class="dtab" onclick="dtab(this,'dt2')">요약</button>
</div>
 <div class="dpane active" id="dt1"><p>${escapeHtml(r.detail || '')}</p></div>
 <div class="dpane" id="dt2"><p>${escapeHtml(r.summary || '')}</p></div>
</div>
</div>`;

 // 렌더링 후 path 실제 길이 측정 → dasharray/dashoffset 적용
 requestAnimationFrame(() => {
  const fill = document.getElementById('gaugeFill');
  if (!fill) return;
  const len = fill.getTotalLength();
  fill.style.strokeDasharray = len;
  fill.style.strokeDashoffset = len;
  fill.style.transition = 'none';
  requestAnimationFrame(() => {
   fill.style.transition = 'stroke-dashoffset 0.8s ease-out';
   fill.style.strokeDashoffset = len * (1 - p / 100);
  });
 });
}

function renderHuman(r) {
 const resultMode = String(r?.engineMeta?.requestedMode || r?.requestedMode || r?.mode || '').toLowerCase();
 let noteCopy;
 if (r?.preservationFallback || resultMode === 'polish') {
  noteCopy = '이 결과는 원문의 장르·사실·구조를 지키는 <b>원문 보존 다듬기</b>예요. 문장을 넓게 다시 쓰는 휴머나이징과는 다른 기능이에요.';
 } else if (resultMode === 'formal') {
  noteCopy = '이 결과는 더 넓은 문장 재구성과 모델 기반 정밀 검증을 적용한 <b>고급 휴머나이징</b> 결과예요.';
 } else {
  noteCopy = '이 결과는 원문의 장르·화자·사실을 지키며 대상 문장을 다시 구성한 <b>기본 휴머나이징</b> 결과예요.';
 }
 const note = '<div class="sstrip" style="background:var(--surface2,#f6f6f8);color:var(--text3);font-size:12.5px;line-height:1.5;">'
  + noteCopy + '</div>';
  const billingLabels = {
   charged: '크레딧 차감 완료',
   waived_quality_shortfall: '과거 무차감 정책으로 처리된 작업이에요.',
   waived_repeat_low_benefit: '과거 무차감 정책으로 처리된 작업이에요.',
   plan_unlimited: '무제한 이용권으로 처리했어요.',
   admin_no_charge: '관리자 테스트 · 무차감'
  };
  const billing = billingLabels[r.billingDisposition] || '';
  const billingNote = billing
   ? '<div class="sstrip" style="background:#f5f7ff;color:#4c587f;font-size:12.5px;line-height:1.5;"><b>과금 상태</b> · '+escapeHtml(billing)+'</div>'
   : '';
  document.getElementById('result').innerHTML=
 '<div class="rsec"><div class="ocard"><div class="ohd"><span class="olbl">변환 결과</span>'
 +'<button class="cpybtn" id="dlbtn" onclick="dlOut()" style="margin-left:auto;">다운로드</button>'
 +'<button class="cpybtn" id="cpybtn" onclick="cpyOut()" style="margin-left:8px;">복사</button></div>'
 +'<div class="obody" id="outText">'+escapeHtml(r.outputText||'')+'</div></div>'
  +(r.summary?'<div class="sstrip">'+escapeHtml(r.summary)+'</div>':'')+billingNote+note+'</div>';
}
function renderError(msg) {
 document.getElementById('result').innerHTML=
 '<div class="rsec"><div class="vbox" style="border-color:var(--red)">'
 +'<div style="padding:24px;display:flex;align-items:center;gap:12px;">'
 +'<span style="font-size:24px;"></span>'
 +'<div><div style="font-size:15px;font-weight:600;color:var(--red);">오류 발생</div>'
 +'<div style="font-size:14px;color:var(--text2);margin-top:4px;">'+escapeHtml(msg)+'</div></div></div></div></div>';
}
// 청크 분할 처리 중 일부만 성공했을 때, 렌더된 부분 결과 위에 안내 배너를 끼워 넣는다.
function renderPartialWarning(done, total) {
 const el = document.getElementById('result');
 if (!el) return;
 const warn = document.createElement('div');
 warn.className = 'rsec';
 warn.innerHTML =
  '<div class="vbox" style="border-color:var(--yellow)">'
  +'<div style="padding:16px 20px;">'
  +'<div style="font-size:14px;font-weight:600;color:var(--text);">일부 구간만 변환됐어요 ('+done+'/'+total+')</div>'
  +'<div style="font-size:13px;color:var(--text2);margin-top:6px;line-height:1.6;">글이 길어 나눠 처리하던 중 일부 구간에서 오류가 발생했어요. 지금까지 처리된 부분과 그만큼의 크레딧만 반영했어요. 남은 글은 따로 붙여넣어 다시 변환해주세요.</div>'
  +'</div></div>';
 el.insertBefore(warn, el.firstChild);
}
function dtab(btn,id) {
 btn.closest('.vbox').querySelectorAll('.dtab').forEach(t=>t.classList.remove('active'));
 btn.closest('.vbox').querySelectorAll('.dpane').forEach(p=>p.classList.remove('active'));
 btn.classList.add('active'); document.getElementById(id).classList.add('active');
}

function cpyOut() {
 const t=document.getElementById('outText').innerText;
 if(!t) return;
 navigator.clipboard.writeText(t).then(()=>{
 const b=document.getElementById('cpybtn');
 b.textContent=' 복사됨'; b.classList.add('copied');
 setTimeout(()=>{b.textContent=' 복사';b.classList.remove('copied');},2000);
 });
}

function dlOut() {
 const t = document.getElementById('outText').innerText;
 if (!t) return;
 // UTF-8 BOM 포함 — 한글이 윈도우 메모장에서 깨지지 않도록
 const blob = new Blob(['﻿' + t], { type: 'text/plain;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
 a.href = url;
 a.download = 'gpkorea_humanized_' + ts + '.txt';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function maintenancePreviewQuery() {
  if (!window.GP_MAINTENANCE_BYPASSED || !window.APP_CONFIG?.MAINTENANCE_PREVIEW_KEY) return '';
  return '&preview_key=' + encodeURIComponent(window.APP_CONFIG.MAINTENANCE_PREVIEW_KEY);
}

const CREDIT_GRANT_POLICY_VERSION = 'credit-grant-base-v1';
const CREDIT_OFFER_POLICY_VERSION = 'credit-offer-v4-202609';
const CREDIT_EVENT_LOCAL_START_MS = Date.parse('2026-08-29T00:00:00+09:00');
const CREDIT_EVENT_LOCAL_END_MS = Date.parse('2026-10-01T00:00:00+09:00');
function localCreditEventProduct(paidCredits, packageBonusCredits, configuredEventBonusCredits) {
 const now = Date.now();
 const eventActive = now >= CREDIT_EVENT_LOCAL_START_MS && now < CREDIT_EVENT_LOCAL_END_MS;
 const eventBonusCredits = eventActive ? configuredEventBonusCredits : 0;
 return {
  paidCredits,
  packageBonusCredits,
  eventBonusCredits,
  bonusCredits: packageBonusCredits + eventBonusCredits,
  totalGrantedCredits: paidCredits + packageBonusCredits + eventBonusCredits,
  offerPolicyVersion: CREDIT_OFFER_POLICY_VERSION
 };
}
const CREDIT_EVENT_PRODUCTS = {
 5900: localCreditEventProduct(200, 0, 0),
 14500: localCreditEventProduct(500, 125, 25),
 29000: localCreditEventProduct(1000, 350, 50),
 58000: localCreditEventProduct(2000, 900, 100)
};

async function payToss(amount, credits, name, plan, checkoutOptions) {
  checkoutOptions = checkoutOptions || {};
  if (!window.CU) {
   if (window.gpTrack) window.gpTrack('login_required', { source: 'payment', value: amount, currency: 'KRW' });
   if (window.gpTrackPaymentError) window.gpTrackPaymentError('checkout_login_required', { checkoutType: 'credits', amount, credits, plan });
   alert('로그인이 필요해요.');
   return;
  }

 // 오결제 방지: 결제 전 1회 확인 + 환불/차감 정책 명시(실수 클릭·기대 불일치 환불 감소)
  let grant = CREDIT_EVENT_PRODUCTS[Number(amount)] || null;
  if (!grant && checkoutOptions.grant && Number(checkoutOptions.grant.totalGrantedCredits) > 0) {
   grant = {
    paidCredits: Math.max(0, Number(checkoutOptions.grant.paidCredits) || 0),
    packageBonusCredits: Math.max(0, Number(checkoutOptions.grant.packageBonusCredits) || 0),
    eventBonusCredits: Math.max(0, Number(checkoutOptions.grant.eventBonusCredits) || 0),
    bonusCredits: Math.max(0, Number(checkoutOptions.grant.packageBonusCredits) || 0) + Math.max(0, Number(checkoutOptions.grant.eventBonusCredits) || 0),
    totalGrantedCredits: Math.max(0, Number(checkoutOptions.grant.totalGrantedCredits) || 0)
   };
  }
  // 로그인 결제에서는 서버의 현재 오퍼를 최종 기준으로 삼는다. 이벤트 조기 종료나
  // 마감 직후에도 화면의 정적 지급량이 실제 주문 스냅샷보다 앞서지 않게 한다.
  if (typeof window.gpCreditOfferForAmount === 'function') {
   try {
    const currentOffer = await window.gpCreditOfferForAmount(amount, true);
    if (currentOffer && Number(currentOffer.paidCredits) > 0) {
     const paidCredits = Number(currentOffer.paidCredits);
     const packageBonusCredits = Math.max(0, Number(currentOffer.packageBonusCredits) || 0);
     // v4에서 스타터는 개강 이벤트 0%다. 전환 중 구형 응답이 남아도 결제 확인값은 200으로 고정한다.
     const eventBonusCredits = Number(amount) === 5900 ? 0 : Math.max(0, Number(currentOffer.eventBonusCredits) || 0);
     const computedTotal = paidCredits + packageBonusCredits + eventBonusCredits;
     const offeredTotal = Number(amount) === 5900
      ? computedTotal
      : (Number(currentOffer.credits) || Number(currentOffer.totalGrantedCredits) || 0);
     grant = {
      paidCredits,
      packageBonusCredits,
      eventBonusCredits,
      bonusCredits: packageBonusCredits + eventBonusCredits,
      totalGrantedCredits: Math.max(computedTotal, offeredTotal),
      offerPolicyVersion: String(currentOffer.offerPolicyVersion || CREDIT_OFFER_POLICY_VERSION)
     };
    }
   } catch (_) {
    // 네트워크 오류 때는 기간을 반영한 로컬 상품표를 사용하고, 실제 지급량은 서버가 다시 검증한다.
   }
  }
  const shownCredits = grant ? grant.totalGrantedCredits : (Number(checkoutOptions.displayCredits) || Number(credits));
  // 구 주문 재구매 컨텍스트에 과거 지급량이 남아 있어도 현재 상품 지급량으로 주문·추적 값을 통일한다.
  credits = shownCredits;
  const paidCredits = grant ? grant.paidCredits : shownCredits;
  const packageCredits = grant ? grant.packageBonusCredits : 0;
  const eventCredits = grant ? grant.eventBonusCredits : 0;
  const purchaseSummary = [
   { label: '결제 금액', value: Number(amount).toLocaleString('ko-KR') + '원' },
   { label: '기준 크레딧', value: Number(paidCredits).toLocaleString('ko-KR') + '크레딧' }
  ];
  if (packageCredits > 0) purchaseSummary.push({ label: '상품 보너스', value: '+' + Number(packageCredits).toLocaleString('ko-KR') + '크레딧' });
  if (eventCredits > 0) purchaseSummary.push({ label: '개강 이벤트 추가', value: '+' + Number(eventCredits).toLocaleString('ko-KR') + '크레딧' });
  purchaseSummary.push({ label: '총 지급', value: Number(shownCredits).toLocaleString('ko-KR') + '크레딧', emphasis: true });
  const refundNotice = '잔액은 기존 잔액, 오래된 주문, 각 주문의 기준·추가 크레딧 순으로 사용해요. 환불액은 신청 시 남은 기준 크레딧으로 계산하고, 같은 주문의 남은 추가 크레딧은 함께 회수해요. 일반 청약철회는 계약 내용을 받은 날(이용 가능 시점이 더 늦으면 그날)부터 7일 이내이며, 7일이 지나도 법정 예외는 별도로 처리해요.';
  const eventNotice = eventCredits > 0
   ? '9월 개강 이벤트 크레딧은 2026년 9월 30일까지 결제 요청분에 추가돼요. '
   : '';
  const confirmMsg = `${Number(shownCredits).toLocaleString('ko-KR')}크레딧을 ${Number(amount).toLocaleString('ko-KR')}원에 구매할까요?\n${eventNotice}지급된 크레딧은 유효기간이 없어요.\n${refundNotice}`;
 const buyOk = checkoutOptions.skipConfirm === true
  ? true
  : (window.gpConfirm
    ? await window.gpConfirm({
      title: '총 ' + Number(shownCredits).toLocaleString('ko-KR') + '크레딧을 충전할까요?',
      message: '선택한 충전 내역을 확인해 주세요.',
      summary: purchaseSummary,
      safeText: (eventNotice + '지급된 기준·추가 크레딧은 모두 유효기간 없이 사용할 수 있어요.').trim(),
      note: refundNotice,
      icon: '₩',
      variant: 'purchase',
      confirmText: Number(amount).toLocaleString('ko-KR') + '원 결제하기'
     })
    : confirm(confirmMsg));
 if (!buyOk) {
  if (window.gpTrack) window.gpTrack('checkout_cancel', { checkout_type: 'credits', value: amount, currency: 'KRW', code: 'PRE_CONFIRM_CANCEL' });
  return;
 }

 const creditSku = plan || ('credits_' + Number(amount));
 if (window.gpTrack) window.gpTrack('select_item', {
  item_list_name: 'pricing',
  items: [{ item_id: creditSku, item_name: name + ' ' + credits + '크레딧', quantity: 1, price: amount }],
  value: amount,
  currency: 'KRW',
  traffic_source: localStorage.getItem('traffic_source') || 'direct'
 });
 const pendingMeta = typeof window.gpPendingCheckoutMeta === 'function' ? window.gpPendingCheckoutMeta() : {};
 if (window.gpTrack) window.gpTrack('begin_checkout', Object.assign({
  items: [{ item_id: creditSku, item_name: name + ' ' + credits + '크레딧', quantity: 1, price: amount }],
  value: amount,
  currency: 'KRW',
  checkout_type: 'credits',
  segment: checkoutOptions.segment || '',
  offer_variant: checkoutOptions.offerVariant || '',
  pending_action: checkoutOptions.pendingAction || '',
  paywall_source: checkoutOptions.source || ''
 }, pendingMeta));

  // 1. 테스트 키 대신 주신 'API 개별 연동' 라이브 클라이언트 키 적용
  const clientKey = window.APP_CONFIG.TOSS_CLIENT_KEY;
  if (!clientKey) {
   if (window.gpTrackPaymentError) window.gpTrackPaymentError('checkout_client_key_missing', { checkoutType: 'credits', amount, credits, plan });
   alert('결제는 운영 환경에서만 사용할 수 있어요.');
   return;
  }
  try {
   await window.gpLoadTossPayments();
  } catch (sdkError) {
   if (window.gpTrackPaymentError) window.gpTrackPaymentError('checkout_sdk_load_failed', { checkoutType: 'credits', amount, credits, plan }, sdkError);
   alert('결제 모듈을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
   return;
  }
  const tp = window.TossPayments(clientKey);
  let orderEntropy = '';
  try {
   const bytes = new Uint8Array(8);
   window.crypto.getRandomValues(bytes);
   orderEntropy = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  } catch (_) { orderEntropy = Math.random().toString(36).slice(2, 14); }
  const orderId = `order_${Date.now()}_${orderEntropy}`.slice(0, 64);
  // 결제창을 열기 전에 주문번호·금액·로그인 UID를 서버에서 원자적으로 묶는다.
  // 성공 URL이 유출되거나 다른 계정에서 먼저 제출돼도 confirm 단계가 소유자를
  // 바꿀 수 없도록 하는 선점 단계다.
  try {
   const idToken = await window.CU.getIdToken();
   const prepareResponse = await fetch(window.apiUrl('/prepare-payment'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    credentials: 'omit',
    body: JSON.stringify({
     orderId,
     amount: Number(amount),
     purchaseKind: checkoutOptions.purchaseKind || 'credit_package',
     sourceOrderId: checkoutOptions.sourceOrderId || ''
    })
   });
   let prepared = null;
   try { prepared = await prepareResponse.json(); } catch (_) { prepared = null; }
   if (!prepareResponse.ok || !prepared?.ok) {
    const error = new Error(prepared?.error || '결제를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
    error.code = prepared?.code || 'PAYMENT_PREPARE_FAILED';
    throw error;
   }
  } catch (prepareError) {
   if (window.gpTrackPaymentError) window.gpTrackPaymentError('checkout_prepare_failed', {
    checkoutType: 'credits', amount, credits, plan, orderId
   }, prepareError);
   alert(prepareError?.message || '결제를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
   return;
  }
  if (typeof window.gpBindPendingCheckout === 'function') {
   window.gpBindPendingCheckout(orderId, {
    amount: Number(amount),
     credits: Number(credits),
     displayCredits: shownCredits,
     paidCredits: grant?.paidCredits || Number(credits),
     packageBonusCredits: grant?.packageBonusCredits || 0,
     eventBonusCredits: grant?.eventBonusCredits || 0,
     bonusCredits: grant?.bonusCredits || ((grant?.packageBonusCredits || 0) + (grant?.eventBonusCredits || 0)),
     totalGrantedCredits: shownCredits,
     creditGrantPolicyVersion: grant ? CREDIT_GRANT_POLICY_VERSION : '',
    purchaseKind: checkoutOptions.purchaseKind || 'credit_package',
    sourceOrderId: checkoutOptions.sourceOrderId || '',
    offerPolicyVersion: checkoutOptions.offerPolicyVersion || grant?.offerPolicyVersion || CREDIT_OFFER_POLICY_VERSION,
    segment: checkoutOptions.segment || pendingMeta.segment || '',
    offerVariant: checkoutOptions.offerVariant || pendingMeta.offer_variant || ''
   });
  }

  try {
  await tp.requestPayment('카드', {
  amount: amount,
  orderId: orderId,
  orderName: name + ' ' + credits + '크레딧',
  customerName: window.CU.displayName,
 // 2. 결제 성공/실패 시 돌아올 URL 설정
 successUrl: `${window.location.origin + window.location.pathname}?credits=${credits}&plan=${encodeURIComponent(creditSku)}${maintenancePreviewQuery()}`,
 failUrl: location.origin + location.pathname + '?fail=1' + maintenancePreviewQuery()
 });
 } catch(e) {
 if (typeof window.gpUnbindPendingCheckout === 'function') window.gpUnbindPendingCheckout(orderId);
 if (window.gpTrack) window.gpTrack(e.code === 'USER_CANCEL' ? 'checkout_cancel' : 'checkout_error', {
  checkout_type: 'credits',
  value: amount,
  currency: 'KRW',
  code: e.code || '',
  message: String(e.message || '').slice(0, 120)
  });
  if (window.gpTrackPaymentError) window.gpTrackPaymentError('request_payment_failed', {
   checkoutType: 'credits',
   amount,
   credits,
   plan,
   orderId
  }, e);
  if(e.code !== 'USER_CANCEL') alert('결제 오류: ' + e.message);
  }
}
window.payToss = payToss;

// 기존 호출 호환용: 요금 화면은 크레딧 충전으로 단일화했습니다.
window.switchPricingTab = switchPricingTab;
function switchPricingTab() {
  const credit = document.getElementById('pricingTabCredit');
  const heroTitle = document.getElementById('pricingHeroTitle');
  const heroDesc = document.getElementById('pricingHeroDesc');
  if (credit) credit.style.display = 'block';
  if (heroTitle && heroDesc) {
    heroTitle.textContent = '크레딧 충전';
    heroDesc.innerHTML = '기준 크레딧과 상품·이벤트로 받은 추가 크레딧은 모두 <strong>유효기간 없이</strong> 사용할 수 있어요. AI 감지는 100자당 1크레딧이며, 휴머나이징은 선택한 모드와 글자 수에 따라 차감돼요.';
  }
  if (window.gpTrack) window.gpTrack('pricing_tab_change', { pricing_tab: 'credit' });
}

window.SUBSCRIPTION_ENABLED = false;
window.PRO_ENABLED = false;

function showPolicy(type) {
 const modal = document.getElementById('policyModal');
 const title = document.getElementById('policyTitle');
 const body = document.getElementById('policyBody');
 modal.style.display = 'block';

 // 정책 모달 탭 활성 표시
 const navBtns = modal.querySelectorAll('.gp-policy-nav button');
 for (let bi = 0; bi < navBtns.length; bi++) {
 const onTab = navBtns[bi].getAttribute('data-policy') === type;
 navBtns[bi].style.color = onTab ? 'var(--accent)' : 'var(--text3)';
 navBtns[bi].style.fontWeight = onTab ? '700' : '400';
 navBtns[bi].style.background = onTab ? 'var(--surface2)' : 'none';
 }

 if (type === 'company') {
 title.textContent = '회사 정보 · 사업자 정보';
 body.innerHTML = '상호명: 지피코리아(gpkorea)<br>대표자: 윤동민<br>개인정보보호책임자: 윤동민<br>사업자등록번호: 213-11-67637<br>통신판매업 신고번호: 2024-인천연수구-4281<br>사업장 주소: 인천광역시 연수구 랜드마크로360번길 40, 108동 3201호<br>이메일: aqua0661123@naver.com<br>고객센터: 이메일 문의 · 운영 시간 09:00–23:59<br><br>본 서비스는 국립국어원 공공저작물(공공언어 용어 목록 · 어문규범 규정 · 말뭉치 통계, 공공누리 제1유형)과 표준국어대사전 · 우리말샘 · 온용어 오픈 API를 활용해 결과 품질을 검증합니다.<br><br><a href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=2131167637" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">▸ 통신판매사업자 정보 확인 (공정거래위원회)</a>';
 return;
 }

 if (type === 'terms') {
 title.textContent = '이용약관';
 body.innerHTML = `제1조 (목적)
본 약관은 지피코리아(gpkorea)(이하 "회사")이 운영하는 교수님 피하기(gpkorea.ai.kr, 이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정합니다.

제2조 (서비스 이용)
1. 서비스는 AI 작성 여부 진단(AI 감지) 및 텍스트 휴머나이징(문장 다듬기·재작성) 기능을 제공합니다.
2. 이용자는 Google 또는 카카오 계정을 통해 가입할 수 있습니다.
3. 서비스 이용을 위해 크레딧이 필요하며, 신규 가입 시 20크레딧이 무료로 지급됩니다.
4. 크레딧 소비 기준은 기능별로 다르며, AI 감지는 100자당 1크레딧, 기본 휴머나이징은 최소 10크레딧 및 100자당 2크레딧 기준으로 차감됩니다. 모든 문서에 의미 검증을 수행하는 고급 휴머나이징은 3,000자 이하 100크레딧을 기준으로 하며, 초과 길이는 5크레딧 단위 단계형 요금을 적용합니다. 근거 보강 추가금은 입력 길이에 따라 50~100크레딧이며, 실행 전에 실제 글자 수로 계산한 금액을 안내합니다. 기준 변경 시 사전 공지합니다.

제3조 (크레딧 및 결제)
1. 크레딧은 유료 결제 또는 무료 지급을 통해 획득할 수 있습니다.
2. 결제는 토스페이먼츠를 통해 이루어집니다.
3. 유료로 충전한 기준 크레딧과 상품 보너스·결제 이벤트로 추가 지급된 크레딧은 유효기간 없이 사용할 수 있습니다.
4. 상품별 상시 보너스는 결제 시 함께 지급하며, 2026년 9월 30일까지 결제 요청분에는 기준 크레딧의 5%를 이벤트 크레딧으로 추가 지급합니다.
5. 일반 청약철회는 서면 또는 전자문서로 계약 내용을 받은 날부터 7일 이내에 신청할 수 있습니다. 다만 크레딧을 사용할 수 있게 된 시점이 그보다 늦으면 그날부터 기간을 계산합니다.
6. 크레딧은 주문에 귀속되지 않은 기존 잔액, 결제 시점이 오래된 주문 순으로 사용합니다. 각 주문 안에서는 결제금액에 해당하는 기준 크레딧을 먼저 사용하고, 그 다음 상품 보너스·이벤트 추가 크레딧을 사용합니다.
7. 일반 환불액은 해당 주문의 결제금액에 신청 접수 시점의 남은 기준 크레딧 비율을 곱해 계산합니다. 별도 결제대가 없이 지급된 상품 보너스·이벤트 추가 크레딧에는 독립된 현금 환불액을 계산하지 않으며, 환불이 완료되면 같은 주문에 남은 기준·추가 크레딧을 함께 회수합니다.
8. 이용자가 크레딧을 사용해 서비스 제공이 시작된 부분은 단순 변심에 따른 청약철회가 제한될 수 있으나, 아직 제공되지 않은 부분은 관계 법령과 환불 규정에 따라 환불할 수 있습니다. 7일이 지난 경우에도 관계 법령과 소비자분쟁해결기준에 따른 잔액 환급 또는 계약 취소 사유가 있으면 그 기준에 따라 처리합니다. 자세한 계산식과 신청 절차는 환불 규정에 따릅니다.

제4조 (이용자 책임 및 면책 - Disclaimer)
1. 본 서비스는 AI 작성 여부 진단(감지) 및 텍스트 휴머나이징(문장 다듬기·재작성) 도구를 제공하며, 해당 도구의 활용 방법과 목적은 전적으로 이용자의 판단과 책임에 따릅니다.
2. 이용자는 본 서비스를 이용함에 있어 소속 기관(학교, 직장 등)의 규정, 학칙, 윤리강령 등을 스스로 확인하고 준수할 책임이 있습니다. 회사는 이용자가 소속 기관의 규정을 위반하여 발생하는 어떠한 불이익(징계, 성적 처리 등)에 대해서도 책임을 지지 않습니다.
3. 서비스를 통해 생성된 결과물의 활용으로 인해 발생하는 법적·윤리적 문제에 대한 모든 책임은 이용자 본인에게 있습니다.
4. AI가 생성하거나 변환한 결과물은 현행 저작권법상 '인간의 창작물'로 인정되기 어려울 수 있으며, 해당 결과물에 대한 저작권 보호 여부는 보장되지 않습니다. 이용자는 이 점을 충분히 인지하고 서비스를 이용해야 합니다.
5. AI 감지 및 변환 결과는 참고용이며, 결과의 정확성이나 외부 검사·평가 결과를 보장하지 않습니다. 이로 인해 발생하는 손해에 대해 회사는 책임을 지지 않습니다.

제5조 (금지행위)
1. 서비스를 부정한 목적으로 사용하는 행위
2. 타인의 계정을 도용하는 행위
3. 서비스의 정상적인 운영을 방해하는 행위
4. 허위 정보를 입력하거나 결제를 부정한 방법으로 이용하는 행위

제6조 (서비스 변경 및 중단)
회사는 운영상 필요에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 이에 대해 사전 공지합니다. 서비스 중단으로 인해 잔여 크레딧이 있는 경우 환불 정책에 따라 처리합니다.

제7조 (분쟁 해결)
본 약관과 관련한 분쟁은 대한민국 법률을 준거법으로 하며, 분쟁 발생 시 회사 소재지를 관할하는 법원을 1심 관할 법원으로 합니다.

시행일: 2026년 8월 30일`.split('\n').join('<br>');
 } else if (type === 'privacy') {
 title.textContent = '개인정보처리방침';
 body.innerHTML = `교수님 피하기(이하 "서비스")는 이용자의 개인정보를 중요시하며, 개인정보 보호법에 따라 아래와 같이 개인정보처리방침을 안내합니다.

1. 수집하는 개인정보 항목
- Google/카카오 로그인을 통해 이름, 이메일 주소를 수집합니다.
- 서비스 이용 기록, 크레딧 사용 내역, 결제 정보(주문번호, 결제금액)를 수집합니다.
- 사용자가 입력한 텍스트, 변환 결과, Q&A/커뮤니티 작성 내용은 서비스 처리, 작업 기록, 고객지원 제공을 위해 저장될 수 있습니다.
- 서비스 이용 과정에서 접속 IP, 접속 일시, 브라우저 정보 등이 자동으로 수집될 수 있습니다.
- 광고 및 분석 유입 시 UTM 파라미터, 광고 클릭 식별자, 방문 페이지와 회원가입·기능 완료·결제 이벤트가 수집될 수 있습니다. 사용자가 입력한 원문과 변환 결과는 광고 플랫폼으로 전송하지 않습니다.

2. 개인정보 수집 및 이용 목적
- 서비스 제공 및 회원 관리
- 크레딧 관리 및 결제 처리
- 서비스 개선 및 통계 분석
- 광고 성과 측정, 전환 분석 및 광고 게재 최적화
- 부정 이용 방지
- 고객 문의, 환불, 장애 확인 및 분쟁 대응

3. 개인정보 보유 및 이용 기간
- 회원 탈퇴 시까지 보관합니다.
- 단, 관련 법령에 따라 아래 정보는 일정 기간 보관합니다.
  · 전자상거래 계약·청약철회 기록: 5년 (전자상거래법)
  · 대금결제 및 재화 공급 기록: 5년 (전자상거래법)
  · 소비자 불만·분쟁처리 기록: 3년 (전자상거래법)

4. 개인정보 제3자 제공 및 처리 위탁
- 이용자의 동의 없이 제3자에게 개인정보를 제공하지 않습니다.
- 아래 업체에 업무 처리를 위해 최소한의 정보를 위탁합니다.
  · Google Firebase (Firestore): 데이터 저장 및 인증 처리 / 미국
  · 토스페이먼츠: 결제 처리 / 대한민국
  · Google Analytics: 방문·이용 통계 분석 / 미국
  · 네이버 애널리틱스 및 네이버 광고: 방문·광고 전환 분석 / 대한민국
  · Meta Platforms, Inc. (Meta Pixel 및 전환 API): 방문·회원가입·기능 완료·결제 광고 전환 분석 / 미국

5. 이용자의 권리
이용자는 언제든지 아래 권리를 행사할 수 있습니다.
- 개인정보 열람 요청
- 개인정보 정정·삭제 요청
- 개인정보 처리 정지 요청
- 개인정보 이동 요청
권리 행사는 고객센터 이메일(aqua0661123@naver.com)로 신청하실 수 있으며, 접수 후 10일 이내에 처리합니다.

6. 개인정보 파기
회원 탈퇴 시 또는 보유 기간 만료 시 지체 없이 파기합니다. 단, 결제·환불·분쟁 처리 기록은 관련 법령 및 운영상 필요한 기간 동안 보관될 수 있습니다.

7. 개인정보보호책임자
- 성명: 윤동민
- 직책: 대표
- 이메일: aqua0661123@naver.com
- 문의: 고객센터 이메일

8. 개인정보 침해 신고
개인정보 침해 관련 신고·상담은 아래 기관에 문의하실 수 있습니다.
- 개인정보 침해신고센터: privacy.kisa.or.kr / 국번 없이 118
- 대검찰청 사이버수사과: cybercid.spo.go.kr / 국번 없이 1301

시행일: 2026년 8월 24일`.split('\n').join('<br>');
 } else if (type === 'refund') {
 title.textContent = '환불 규정';
 body.innerHTML = `교수님 피하기 환불 규정
(전자상거래 등에서의 소비자보호에 관한 법률에 따라 아래와 같이 환불 정책을 안내합니다.)

1. 청약철회 기간
- 일반 청약철회는 서면 또는 전자문서로 계약 내용을 받은 날부터 7일 이내 신청할 수 있습니다. 다만 크레딧을 사용할 수 있게 된 시점이 그보다 늦으면 그날부터 기간을 계산합니다.
- 기준 크레딧을 전혀 사용하지 않은 경우 결제금액 전액을 환불합니다.
- 이용자가 크레딧을 사용해 서비스 제공이 시작된 부분은 단순 변심에 따른 청약철회가 제한될 수 있습니다. 다만 아직 제공되지 않은 부분은 관계 법령과 본 정책에 따라 환불할 수 있습니다.
- 7일이 지난 경우에도 관계 법령과 소비자분쟁해결기준에 따른 잔액 환급 또는 계약 취소 사유가 있으면 그 기준에 따라 처리합니다.

2. 사용 순서와 환불액 계산
- 크레딧은 주문에 귀속되지 않은 기존 잔액을 먼저 사용한 뒤, 결제 시점이 오래된 주문부터 사용합니다. 각 주문 안에서는 결제금액에 해당하는 기준 크레딧을 먼저 사용하고, 그 다음 상품 보너스·이벤트 추가 크레딧을 사용합니다.
- 일부 사용한 주문의 환불액은 '해당 주문 결제금액 × (신청 접수 시점에 남은 기준 크레딧 ÷ 해당 주문의 지급 기준 크레딧)'으로 계산하고 1원 미만은 버립니다. 별도 취소 수수료나 위약금은 공제하지 않습니다.
- 별도 결제대가 없이 지급된 회원가입·추천·쿠폰·상품 보너스·이벤트 추가 크레딧에는 독립된 현금 환불액을 계산하지 않습니다.
- 환불 신청이 접수되면 서버가 해당 주문의 남은 기준·추가 크레딧을 예약하고 환불액을 기록합니다. 접수 전에 시작되어 아직 정산되지 않은 작업이나 교정 요청의 사용량은 최종 정산에 반영될 수 있습니다.
- 환불이 완료되면 같은 주문에 남은 기준·추가 크레딧을 함께 회수합니다. 본 정책 시행 전 주문은 주문 당시 저장된 총 지급 크레딧을 기준으로 기존 비례 환불 산식을 적용합니다.

3. 법정 예외와 별도 확인이 필요한 경우
- 중복·오결제, 회사 책임으로 인한 서비스 미제공, 회사의 귀책사유로 정상적인 서비스 이용이 현저히 곤란한 오류 등은 일반 청약철회 기간과 별도로 관계 법령과 사실 확인 결과에 따라 결제를 취소합니다. 법령상 결제대금 환급 의무가 있는 경우 원래 결제수단으로 환급하며, 이용자가 동의한 경우에만 서비스 재제공이나 크레딧 복구로 처리할 수 있습니다.
- 표시·광고 또는 계약 내용과 다르게 이행된 경우에는 서비스를 공급받은 날부터 3개월 이내이면서 그 사실을 안 날(알 수 있었던 날)부터 30일 이내에 청약철회를 신청할 수 있습니다.
- 온라인 환불 버튼이 비활성화되어 있어도 법정 취소·환급 사유가 있으면 사이트 내 고객센터로 신청할 수 있습니다.

4. 환불 신청 및 처리
- 마이페이지의 환불하기 메뉴 또는 사이트 내 고객센터로 신청할 수 있습니다.
- 주문번호와 결제일을 알려주시면 확인이 빨라집니다. 환불 사유 입력은 선택사항입니다.
- 법정 청약철회 또는 본 정책상 환불 요건에 해당하는 경우, 회사는 환불 신청을 받은 날부터 3영업일 이내에 원래 결제수단으로 결제 취소 조치를 진행합니다. 카드사나 결제기관의 실제 반영에는 추가 시간이 걸릴 수 있습니다.

5. 소비자 분쟁 해결
- 먼저 1372 소비자상담센터에서 상담받을 수 있습니다.
- 상담으로 해결되지 않으면 한국소비자원에 피해구제를 신청할 수 있고, 합의가 이루어지지 않으면 소비자분쟁조정위원회의 조정 절차를 이용할 수 있습니다.

시행일: 2026년 8월 30일`.split('\n').join('<br>');
 }
}

window.showPolicy = showPolicy;

window.addEventListener('load',()=>{
 const p=new URLSearchParams(location.search);
 if (p.get('subfail') === '1' || p.has('authKey') || p.has('sub') || p.has('ck')) {
  history.replaceState({}, '', location.pathname);
 }
 if(p.get('success')==='1') {
 history.replaceState({},'',location.pathname);
 }
 if(p.get('fail')==='1') {
  if (window.gpTrackPaymentError) window.gpTrackPaymentError('fail_redirect', {
   checkoutType: 'credits',
   code: p.get('code') || '',
   message: p.get('message') || '',
   orderId: p.get('orderId') || '',
   amount: p.get('amount') || ''
  });
  alert('결제가 취소됐어요.');
  history.replaceState({},'',location.pathname);
 }
});

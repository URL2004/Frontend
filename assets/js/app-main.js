let mode='detect', dark=true, tab='main', humanizeMode='assignment', selectedLang='ko';
window.mode='detect';
const ROUTE_TABS = ['main','pricing','community','faq','qna','notice','mypage','history','pro'];
const ROUTE_PATHS = {
 main: '/',
 pricing: '/pricing',
 community: '/community',
 faq: '/faq',
 qna: '/qna',
 notice: '/notice',
 mypage: '/mypage',
 history: '/history',
 pro: '/pro'
};
const PATH_ROUTES = {
 '/': 'main',
 '/main': 'main',
 '/pricing': 'pricing',
 '/community': 'community',
 '/faq': 'faq',
 '/qna': 'qna',
 '/notice': 'notice',
 '/mypage': 'mypage',
 '/history': 'history',
 '/pro': 'pro'
};
const ROUTE_META = {
 main: {
  title: '교수님 피하기 · AI 감지기',
  description: 'AI 감지 우회 및 휴머나이징 전문, 교수님 피하기입니다. GPT 탐지기와 카피킬러 회피를 위한 AI 인간화 솔루션.'
 },
 pricing: {
  title: '요금제 · 교수님 피하기',
  description: '교수님 피하기 크레딧 충전, 구독 플랜, Pro 기능을 확인하세요.'
 },
 community: {
  title: '커뮤니티 · 교수님 피하기',
  description: 'AI 감지, 과제 작성, 휴머나이징 활용 경험을 나누는 커뮤니티입니다.'
 },
 faq: {
  title: '자주 묻는 질문 · 교수님 피하기',
  description: '교수님 피하기 이용, 크레딧·환불, AI 감지 정확도 등 자주 묻는 질문을 모았습니다.'
 },
 qna: {
  title: '문의하기 · 교수님 피하기',
  description: '교수님 피하기 1:1 문의 — 결제·계정·오류 등 개인 문의는 여기서 남기거나 카카오톡으로 연락주세요.'
 },
 notice: {
  title: '공지사항 · 교수님 피하기',
  description: '교수님 피하기 서비스 업데이트와 운영 공지사항입니다.'
 },
 mypage: {
  title: '마이페이지 · 교수님 피하기',
  description: '내 크레딧, 구독, 계정 정보를 확인하세요.'
 },
 history: {
  title: '이용 기록 · 교수님 피하기',
  description: '내 AI 감지 및 휴머나이징 작업 기록을 확인하세요.'
 },
 pro: {
  title: 'Pro · 교수님 피하기',
  description: '교수님 피하기 Pro 전용 기능을 이용하세요.'
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

function routeUrl(t) {
 const base = (window.APP_CONFIG && window.APP_CONFIG.SITE_URL ? window.APP_CONFIG.SITE_URL : window.location.origin).replace(/\/+$/,'');
 return base + (ROUTE_PATHS[t] || '/');
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
 if (currentPath === cleanRoutePath(nextPath) && !window.location.hash) return;
 const nextUrl = nextPath + window.location.search;
 if (replace) window.history.replaceState({ tab: t }, '', nextUrl);
 else window.history.pushState({ tab: t }, '', nextUrl);
}

function runRouteSideEffects(t) {
 if (t === 'history' && typeof window.loadHistory === 'function') window.loadHistory();
 if (t === 'notice' && typeof window.loadNotices === 'function') window.loadNotices();
 if (t === 'community' && typeof window.loadPosts === 'function') window.loadPosts();
 if (t === 'qna' && typeof window.loadQuestions === 'function') window.loadQuestions();
}

function applyRouteFromUrl(opts) {
 opts = opts || {};
 const routeTab = getRouteTab();
 updateRouteMeta(routeTab);
 if (routeTab === 'mypage') {
  openMyPage();
  return;
 }
 if (routeTab === 'pro') {
  goToPro();
  return;
 }
 switchTab(routeTab, { skipRoute: true });
 runRouteSideEffects(routeTab);
 if (opts.replace) setRouteUrl(routeTab, true);
}
window.applyRouteFromUrl = applyRouteFromUrl;
window.addEventListener('DOMContentLoaded', () => applyRouteFromUrl({ replace: true }));

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
 document.getElementById(n+'Screen').classList.add('active');
 if(n==='app') initThemeBtn();
}
function toggleTheme() {
 dark=!dark; document.body.classList.toggle('dark',dark);
 const sun='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
 const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
 const themeBtn = document.getElementById('themeBtn');
 if (themeBtn) themeBtn.innerHTML=dark?moon:sun;
}
function initThemeBtn() {
 const sun='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
 const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
 const themeBtn = document.getElementById('themeBtn');
 if (themeBtn) themeBtn.innerHTML=dark?moon:sun;
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
 
 document.getElementById('inputLabel').textContent = isH ? '변환할 텍스트' : '분석할 텍스트';
 document.getElementById('btxt').textContent = isH ? '변환 시작' : '분석 시작';
 document.getElementById('sbtn').className = 'sbtn ' + (isH ? 'hb' : 'db');
 
 document.getElementById('result').innerHTML = '';
 updateHint();
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
    const btn = document.getElementById('inviteCopyBtn');
    if (btn) { btn.textContent = '복사됨!'; setTimeout(() => { btn.textContent = '링크 복사'; }, 1500); }
  });
}
// 모달 바깥 클릭 시 닫기
document.addEventListener('click', e => {
  const modal = document.getElementById('inviteModal');
  if (modal && e.target === modal) closeInviteModal();
});

function openMyPage() {
 if (!window.CU) { showScreen('login'); return; }
 switchTab('mypage');
 var tryLoad = function(tries) {
  if (typeof window.loadMyPage === 'function') { window.loadMyPage(); }
  else if (tries > 0) { setTimeout(function(){ tryLoad(tries-1); }, 200); }
 };
 tryLoad(10);
}
function switchTab(t, opts) {
 opts = opts || {};
 t = normalizeRouteTab(t);
 tab=t;
 document.querySelectorAll('.ntab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 document.querySelectorAll('.mnav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 document.querySelectorAll('.snav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 ['main','pricing','community','faq','qna','notice','mypage','history','pro'].forEach(n=>{
 const el = document.getElementById(n+'Content');
 if (el) el.style.display = n===t ? 'block' : 'none';
 });
 if (t === 'pro' && typeof window.refreshProTab === 'function') window.refreshProTab();
 updateRouteMeta(t);
 if (!opts.skipRoute) setRouteUrl(t, opts.replaceRoute);
}

window.addEventListener('hashchange', () => applyRouteFromUrl({ replace: true }));
window.addEventListener('popstate', () => applyRouteFromUrl({ replace: true }));

// Pro 탭 진입 가드: 미로그인이면 로그인 화면, 비구독자면 가격 페이지로 안내
function goToPro() {
 if (!window.CU) { showScreen('login'); return; }
 const sub = window.SUB;
 const valid = sub && (sub.status === 'active' || (sub.status === 'cancelled' && sub.nextBillingMs > Date.now()));
 if (!valid) {
   switchTab('pricing');
   setTimeout(() => {
     if (typeof window.switchPricingTab === 'function') window.switchPricingTab('sub');
     const el = document.getElementById('subscriptionSection');
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
 const can = !!tier && el.value.trim().length >= 5 && (window.COUPON?.remaining > 0 || tier === 'unlimited');
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
   if (tierEl) tierEl.textContent = '구독 없음';
   if (metaEl) metaEl.textContent = '가격 페이지에서 구독을 시작하세요.';
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
 if (!window.CU) { showScreen('login'); return; }
 const sub = window.SUB;
 const tier = window.PRO_STATE.selectedTier;
 if (!sub || !tier) { alert('쿠폰을 선택해주세요.'); return; }
 const text = document.getElementById('proInputText').value.trim();
 if (text.length < 5) { alert('텍스트가 너무 짧습니다.'); return; }
 const charLimit = (tier === 'unlimited') ? 50000 : parseInt(tier, 10);
 if (text.length > charLimit) { alert(TIER_LABELS[tier] + ' 한도를 초과했습니다.'); return; }

 const mode = window.PRO_STATE.mode;
 const apiMode = mode === 'detect' ? 'detect' : 'humanize';
 const humanizeMode = mode === 'detect' ? null : mode;

 const btn = document.getElementById('proRunBtn');
 btn.disabled = true; btn.textContent = '처리 중...'; btn.style.opacity = '.7';

 try {
   const idToken = await window.CU.getIdToken();
   const res = await callAnalyzeApi({
     mode: apiMode,
     text,
     humanizeMode,
     lang: 'ko',
     idToken,
     billingMode: 'coupon'
   });
   if (res.error) throw new Error(res.error);
   if (!res.ok) throw new Error('처리 실패');
   renderProResult(res.result, apiMode);
   // 쿠폰 잔량 갱신
   if (tier !== 'unlimited' && window.COUPON) {
     window.COUPON.remaining = Math.max(0, (window.COUPON.remaining || 0) - 1);
   }
   refreshProTab();
 } catch (e) {
   alert('오류: ' + (e.message || '알 수 없음'));
 } finally {
   btn.disabled = false; btn.textContent = '실행'; btn.style.opacity = '1';
   updateProCount(document.getElementById('proInputText'));
 }
}

function renderProResult(result, apiMode) {
 const wrap = document.getElementById('proResult');
 if (!wrap) return;
 if (apiMode === 'detect') {
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
 const needed=Math.ceil(el.value.length/100);
 const b=document.getElementById('lowbanner');

 // 로그인된 상태(window.CU가 있을 때)에서만 크레딧 부족 배너를 띄우도록 수정!
 if(b) b.style.display=(window.CU && window.UP!=='unlimited' && window.UC<needed && el.value.length>0) ? 'flex' : 'none';
 checkLangMismatch();
}
function updateHint() {
 const t=document.getElementById('inputText').value;
 const n=Math.ceil(t.length/100);
 const el=document.getElementById('chint');
 if(el) el.textContent=t.length>0?n+'크레딧 소모 예정':'100자당 1크레딧';
}
// pdf.js lazy loader — 첨부 시점에 1회만 로드
let pdfJsPromise = null;
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
 const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
 let out = '';
 for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  out += content.items.map(it => it.str).join(' ') + '\n\n';
 }
 return out.trim();
}

function handlePDF(input) {
 const file = input.files[0];
 if (!file) return;
 // 파일 형식 검증 — accept 속성은 힌트일 뿐, 드래그/모바일에서 우회 가능
 const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
 if (!isPdf) {
  alert('PDF 파일만 첨부할 수 있어요. (선택한 파일: ' + (file.name || '알 수 없음') + ')');
  input.value = '';
  return;
 }
 if (file.size === 0) {
  alert('빈 파일이에요. 다른 PDF를 선택해주세요.');
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
 const badge = document.getElementById('pdfBadge');
 const pdfName = document.getElementById('pdfName');
 const inputText = document.getElementById('inputText');
 const prevPlaceholder = inputText.placeholder;

 // 추출 중 UI — 첨부 직후 텍스트 추출은 시간이 걸리므로 명시적 로딩 표시
 badge.style.display = 'block';
 pdfName.textContent = ' ' + file.name + ' · 텍스트 추출 중...';
 inputText.disabled = true;
 inputText.placeholder = 'PDF에서 텍스트를 추출하고 있어요...';

 try {
  const text = await extractPdfText(file);
  if (!text || text.length < 5) {
   alert('이 PDF에서 텍스트를 추출할 수 없어요.\n스캔된 이미지 PDF이거나 보호된 파일일 수 있어요.');
   clearPDF();
   return;
  }
  inputText.value = text;
  pdfName.textContent = ' ' + file.name + ' · ' + text.length.toLocaleString() + '자 추출됨';
  // 글자수/크레딧/배너/전송버튼 갱신
  updateCount(inputText);
  if (text.length < 50) {
   alert('추출된 텍스트가 ' + text.length + '자로 너무 짧아요. 스캔 PDF일 가능성이 있으니 확인해주세요.');
  }
 } catch (e) {
  console.error('PDF 추출 오류:', e);
  alert('PDF 처리 중 오류가 발생했어요: ' + (e.message || '알 수 없음'));
  clearPDF();
 } finally {
  inputText.disabled = false;
  inputText.placeholder = prevPlaceholder;
  document.getElementById('pdfInput').value = '';
 }
}

function clearPDF() {
 const inputText = document.getElementById('inputText');
 document.getElementById('pdfBadge').style.display = 'none';
 document.getElementById('pdfInput').value = '';
 inputText.value = '';
 inputText.disabled = false;
 inputText.placeholder = '분석하거나 변환할 텍스트를 입력하세요... (또는 PDF를 첨부하세요)';
 updateCount(inputText);
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

async function callAnalyzeApi(payload, opts) {
 opts = opts || {};
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     mode: payload.mode,
     text: payload.text,
     humanizeMode: payload.humanizeMode,
     lang: payload.lang,
     idToken: payload.idToken,
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
    var te = new Error('서버 응답이 지연돼 요청을 중단했어요. 크레딧은 차감되지 않았어요. 글을 더 짧게 나눠 다시 시도해주세요.');
    te.code = 'timeout';
    throw te;
   }
   if (attempt < maxRetries) { attempt++; await delay(1500 * attempt); continue; }
   throw new Error('네트워크 연결이 불안정해요. 잠시 후 다시 시도해주세요.');
  }

  try { body = await res.json(); } catch (e) { body = null; }

  if (res.status === 429) {
   if (attempt < maxRetries) { attempt++; await delay(2000 * attempt); continue; }
   throw new Error((body && body.error) || '요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
  }
  if (res.status >= 500) {
   if (attempt < maxRetries) { attempt++; await delay(1500 * attempt); continue; }
   throw new Error((body && body.error) || '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
  }
  // 400/402 등 — 재시도해도 결과가 안 바뀌는 오류
  if (body && body.error) throw new Error(body.error);
  if (!body || !body.ok) throw new Error('처리 중 오류가 발생했습니다.');
  return body;
 }
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
 var doneNeeded = 0;  // 차감 정합용 — 서버 청크별 차감 공식(ceil(len/100))을 그대로 누적
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
  doneNeeded += Math.ceil(chunks[i].length / 100);
  prevTail = chunks[i].slice(-200);
 }
 return { ok: true, result: combineChunkResults(results, opts.mode) };
}

async function runAnalysis() {
 if (!window.CU) {
 alert('로그인 후 무료로 체험해보세요!');
 showScreen('login');
 return;
}
 const text = document.getElementById('inputText').value.trim();
 if (!text) { alert('텍스트를 입력하거나 PDF를 첨부해주세요.'); return; }
 if (text.length < 20) { alert('20자 이상 입력해주세요.'); return; }

 // ★ 긴 글 사전 차감 정합(P0-3): 청크 분할 시 서버는 청크별 ceil(len/100)을 각각 차감하므로,
 //   단순 ceil(전체/100)이 아니라 청크 합계로 선검증해야 "99%에서 크레딧 부족"으로 중간 중단되던 민원(#120)을 막는다.
 let needed;
 if (text.length > 5500) {
  needed = splitByBoundary(text, 4500, 5500).reduce(function (s, c) { return s + Math.ceil(c.length / 100); }, 0);
 } else {
 needed = Math.ceil(text.length / 100);
 }
 if (window.UP !== 'unlimited' && (window.UC || 0) < needed) {
 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: '크레딧이 부족해요',
    message: '이 글을 변환하려면 ' + needed + '크레딧이 필요합니다. 현재 보유 크레딧은 ' + (window.UC || 0) + '크레딧이에요.',
    confirmText: '충전하러 가기'
  })
  : confirm('이 글을 변환하려면 ' + needed + '크레딧이 필요해요(현재 ' + (window.UC || 0) + '크레딧). 충전 페이지로 이동할까요?');
 if (ok) switchTab('pricing');
 return;
 }

 const btn = document.getElementById('sbtn');
 btn.classList.add('loading'); btn.disabled = true;
 const lsBtn = document.getElementById('lsSendBtn');
 if (lsBtn) { lsBtn.disabled = true; lsBtn.style.opacity = '.4'; lsBtn.style.cursor = 'not-allowed'; }

 // 분석 중 새로고침/이탈 경고 (실수로 결과 잃지 않도록)
 const onLeave = (e) => { e.preventDefault(); e.returnValue = '분석이 진행 중입니다. 떠나면 결과가 사라져요.'; return e.returnValue; };
 window.addEventListener('beforeunload', onLeave);

 // 입력 길이 + 모드 기반 예상 처리 시간 추정
 const estSec = (() => {
  const len = text.length;
  const chunks = len > 5500 ? Math.ceil(len / 5500) : 1;
  // humanize: 웹검색 ~12s + 메인 ~18s + 2-pass refine ~17s + 검증/네트워크 ~3s
  const humanizePerChunk = 50;
  const perChunk = (mode === 'detect') ? 10 : humanizePerChunk;
  const base = (mode === 'detect') ? 2 : 3;
  return chunks * perChunk + base;
 })();
 const hintHtml = `<div class="prog-hint">예상 처리 시간: 약 ${estSec}초. 페이지를 닫지 말아주세요.</div>
  <div class="prog-warn">중간에 새로고침하면 크레딧이 차감된 채 결과를 받지 못할 수 있어요.</div>`;
 document.getElementById('result').innerHTML = `<div class="progress-overlay" id="progressOverlay">
  <div class="prog-pct" id="progPct">0%</div>
  <div class="prog-status" id="progStatus">준비 중...</div>
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

 const stages = (mode !== 'detect')
  ? [
      { at: 0, msg: '텍스트 분석 중...' },
      { at: 15, msg: '웹에서 참고 자료 검색 중...' },
      { at: 35, msg: '자연스러운 표현으로 변환 중...' },
      { at: 60, msg: '문체 다듬는 중...' }
    ]
  : [
      { at: 0, msg: '텍스트 분석 중...' },
      { at: 25, msg: '특징 추출 중...' },
      { at: 60, msg: 'AI 패턴 검사 중...' }
    ];
 const tailMsgs = [
  '거의 완료...',
  'AI 패턴 우회 중...',
  '문장 흐름 재구성 중...',
  '어휘 다양성 검증 중...',
  '마지막 다듬는 중...',
  '거의 다 됐어요...'
 ];
 let tailIdx = 0;
 let tick = 0;
 const startMs = Date.now();
 const estimatedMs = estSec * 1000;

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
 const idToken = await window.CU.getIdToken();

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

 if (text.length > 5500) {
  // 내부 자동 분할 — 유저 노출 없음
  data = await runChunkedText(text, commonOpts);
 } else {
  data = await callAnalyzeApi(Object.assign({ text: text }, commonOpts));
 }

 // 서버가 이미 Firestore 크레딧을 차감했으므로 UI만 낙관적 업데이트
 if (window.UP !== 'unlimited') { window.UC = Math.max(0, (window.UC || 0) - needed); updateCreditUI(); }

 await window.saveHistory(
 currentMode,
 text,
 mode === 'detect' ? data.result : null,
 mode !== 'detect' ? data.result : null,
 needed
 );
 if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory();

 const _ts = localStorage.getItem('traffic_source') || 'direct';
 const _chars = text.length;
 if (currentMode === 'detect') {
  gtag('event', 'detect_run', { chars: _chars, lang: runLang, pdf: false, traffic_source: _ts });
 } else {
  gtag('event', 'humanize_run', { mode: humanizeMode, chars: _chars, lang: runLang, pdf: false, traffic_source: _ts });
 }

 if (mode === 'detect') renderDetect(data.result);
 else renderHuman(data.result);

 } catch (e) {
 // ★ 청크 분할 중 일부만 성공한 경우: 차감된 크레딧이 헛되지 않게 부분 결과를 보여준다.
 if (e && e.partial && e.partial.result) {
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
  renderError(e.message || '오류가 발생했습니다.');
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

function renderDetect(r) {
 const p = r.probability;
 let bc, bl, mainMsg, subMsg;

 if (p <= 20) {
 bc = 'safe';
 bl = ' 안전';
 mainMsg = '사람이 쓴 글로 보여요';
 subMsg = 'AI 작성 흔적이 거의 감지되지 않았습니다. 자연스러운 문체와 개인적인 표현이 잘 드러나 있어 탐지기에 걸릴 가능성이 낮습니다.';
 } else if (p <= 49) {
 bc = 'caution';
 bl = ' 조심';
 mainMsg = 'AI 패턴이 일부 감지됐어요';
 subMsg = '완전히 안전하지는 않습니다. 일부 AI 특유의 표현이 포함되어 있어 탐지기에 따라 의심받을 수 있어요. 휴머나이저로 한 번 더 다듬어보세요.';
 } else {
 bc = 'danger';
 bl = ' 위험';
 mainMsg = 'AI가 작성한 글일 가능성이 높아요';
 subMsg = 'AI 작성 특유의 패턴이 뚜렷하게 감지됩니다. 그대로 제출하면 탐지될 가능성이 매우 높습니다. 지금 바로 휴머나이저로 변환하세요.';
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
 // ★ 고지: '그대로 다듬기'(보존형)는 원문 의미·사실을 유지하는 품질 다듬기라 외부 AI 검출 회피력이 약해요.
 //   외부 검출률을 낮추려면 '회피(블로그/재구성)' 경로를 쓰도록 안내. 글에 따라 70%대가 나올 수 있음을 명시.
 const note = '<div class="sstrip" style="background:var(--surface2,#f6f6f8);color:var(--text3);font-size:12.5px;line-height:1.5;">'
  + '이 결과는 의미·사실을 보존하는 <b>다듬기</b>예요. 외부 AI 검사기(카피킬러 등)의 탐지율은 글에 따라 그대로(70% 이상)일 수 있어요. '
  + '탐지율을 더 낮추려면 회피(블로그 말투·격식 재구성) 모드를 이용하고, 변환 후 외부 검사기로 재확인하세요.</div>';
 document.getElementById('result').innerHTML=
 '<div class="rsec"><div class="ocard"><div class="ohd"><span class="olbl">변환 결과</span>'
 +'<button class="cpybtn" id="dlbtn" onclick="dlOut()" style="margin-left:auto;">다운로드</button>'
 +'<button class="cpybtn" id="cpybtn" onclick="cpyOut()" style="margin-left:8px;">복사</button></div>'
 +'<div class="obody" id="outText">'+escapeHtml(r.outputText||'')+'</div></div>'
 +(r.summary?'<div class="sstrip">'+escapeHtml(r.summary)+'</div>':'')+note+'</div>';
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

function openKakaoInquiry() {
  const url = window.APP_CONFIG && window.APP_CONFIG.KAKAO_INQUIRY_URL;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else alert('카카오톡 문의 주소가 설정되지 않았어요. 고객센터 이메일(aqua0661123@naver.com)로 문의해주세요.');
}
window.openKakaoInquiry = openKakaoInquiry;

async function payToss(amount, credits, name, plan) {
 if (!window.CU) { alert('로그인이 필요합니다.'); return; }

 gtag('event', 'select_item', {
  item_list_name: 'pricing',
  items: [{ item_id: 'credits_' + credits, item_name: name + ' ' + credits + '크레딧', quantity: 1, price: amount }],
  value: amount,
  currency: 'KRW',
  traffic_source: localStorage.getItem('traffic_source') || 'direct'
 });

  // 1. 테스트 키 대신 주신 'API 개별 연동' 라이브 클라이언트 키 적용
  const clientKey = window.APP_CONFIG.TOSS_CLIENT_KEY;
  if (!clientKey) { alert('결제는 운영 환경에서만 사용할 수 있어요.'); return; }
  const tp = TossPayments(clientKey);

 try {
 await tp.requestPayment('카드', { 
 amount: amount, 
 orderId: 'order_' + Date.now(), 
 orderName: name + ' ' + credits + '크레딧',
 customerName: window.CU.displayName,
 // 2. 결제 성공/실패 시 돌아올 URL 설정
 successUrl: `${window.location.origin + window.location.pathname}?credits=${credits}&plan=${encodeURIComponent(plan||'')}&uid=${encodeURIComponent(window.CU.uid)}`,
 failUrl: location.origin + location.pathname + '?fail=1' 
 });
 } catch(e) {
 if(e.code !== 'USER_CANCEL') alert('결제 오류: ' + e.message);
 }
}

// 가격 페이지 내부 탭 전환 (크레딧 / 정기구독)
window.switchPricingTab = switchPricingTab;
function switchPricingTab(t) {
  const credit = document.getElementById('pricingTabCredit');
  const sub = document.getElementById('pricingTabSub');
  const btnCredit = document.getElementById('pricingTabBtnCredit');
  const btnSub = document.getElementById('pricingTabBtnSub');
  const heroTitle = document.getElementById('pricingHeroTitle');
  const heroDesc = document.getElementById('pricingHeroDesc');
  const isCredit = (t === 'credit');
  if (credit) credit.style.display = isCredit ? 'block' : 'none';
  if (sub) sub.style.display = isCredit ? 'none' : 'block';
  if (btnCredit) {
    btnCredit.setAttribute('aria-selected', isCredit ? 'true' : 'false');
    btnCredit.style.background = isCredit ? 'var(--surface)' : 'transparent';
    btnCredit.style.color = isCredit ? 'var(--text)' : 'var(--text2)';
    btnCredit.style.fontWeight = isCredit ? '700' : '600';
    btnCredit.style.boxShadow = isCredit ? '0 1px 4px rgba(0,0,0,.08)' : 'none';
  }
  if (btnSub) {
    btnSub.setAttribute('aria-selected', isCredit ? 'false' : 'true');
    btnSub.style.background = isCredit ? 'transparent' : 'var(--surface)';
    btnSub.style.color = isCredit ? 'var(--text2)' : 'var(--text)';
    btnSub.style.fontWeight = isCredit ? '600' : '700';
    btnSub.style.boxShadow = isCredit ? 'none' : '0 1px 4px rgba(0,0,0,.08)';
  }
  if (heroTitle && heroDesc) {
    if (isCredit) {
      heroTitle.textContent = '지금 충전하고 바로 사용하세요';
      heroDesc.innerHTML = '구매한 크레딧은 <strong>소멸 없이 계속</strong> 쓸 수 있어요. 100자당 1크레딧 · 소수점 차감 없음';
    } else {
      heroTitle.textContent = 'Pro 정기 구독으로 더 저렴하게';
      heroDesc.innerHTML = '글자 한도 내 월 50회 또는 무제한. <strong>매달 자동 결제</strong>되며 언제든 해지할 수 있어요.';
    }
  }
}

// === 정기결제 구독 ===
// ⚠️ 토스 정기결제 심사 통과 후 true로 변경하면 즉시 활성화됩니다.
//    false면 가격 페이지에 정기구독 카드는 노출되지만 "구독 시작" 버튼은 비활성 + 안내 배너 표시.
window.SUBSCRIPTION_ENABLED = true;

// 정기구독 가용성 UI 적용 (카드 비활성 처리, 배너 토글, 버튼 라벨)
window.applySubscriptionAvailability = function() {
  const enabled = !!window.SUBSCRIPTION_ENABLED;
  const banner = document.getElementById('subscriptionDisabledBanner');
  if (banner) banner.style.display = enabled ? 'none' : 'flex';
  const cards = document.querySelectorAll('#subscriptionSection .plan-card');
  cards.forEach(card => {
    if (enabled) {
      card.classList.remove('sub-disabled');
      const btn = card.querySelector('.plan-btn');
      if (btn) btn.textContent = '구독 시작';
    } else {
      card.classList.add('sub-disabled');
      const btn = card.querySelector('.plan-btn');
      if (btn) btn.textContent = '검수 중';
    }
  });
};
// 페이지 로드 시 1회 적용
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.applySubscriptionAvailability());
} else {
  setTimeout(() => window.applySubscriptionAvailability(), 0);
}

const SUB_PLAN_INFO = {
 '1000':      { amount: 11900,  name: '베이직 (1,000자 × 50회/월)' },
 '5000':      { amount: 54900,  name: '스탠다드 (5,000자 × 50회/월)' },
 '10000':     { amount: 99000,  name: '프로 (10,000자 × 50회/월)' },
 'unlimited': { amount: 290000, name: '무제한' }
};

function openSubscribeConfirm(tier) {
 if (!window.SUBSCRIPTION_ENABLED) {
   alert('정기 구독은 현재 결제 시스템 검수 중입니다.\n검수 완료 즉시 공지·메일로 안내드릴게요.');
   return;
 }
 if (!window.CU) { alert('로그인이 필요합니다.'); showScreen('login'); return; }
 const info = SUB_PLAN_INFO[tier];
 if (!info) return;
 if (window.SUB && window.SUB.status === 'active') {
   alert('이미 진행 중인 구독이 있습니다. 마이페이지에서 관리해주세요.');
   return;
 }
 const modal = document.getElementById('subConfirmModal');
 if (!modal) return;
 const next = new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('ko-KR');
 document.getElementById('subConfirmTier').textContent = info.name;
 document.getElementById('subConfirmAmount').textContent = info.amount.toLocaleString() + '원/월';
 document.getElementById('subConfirmNext').textContent = next;
 document.getElementById('subConfirmAgree').checked = false;
 document.getElementById('subConfirmStartBtn').disabled = true;
 document.getElementById('subConfirmStartBtn').dataset.tier = tier;
 modal.style.display = 'flex';
}

function closeSubscribeConfirm() {
 const modal = document.getElementById('subConfirmModal');
 if (modal) modal.style.display = 'none';
}

function onSubConfirmAgreeChange(cb) {
 document.getElementById('subConfirmStartBtn').disabled = !cb.checked;
}

async function startSubscription() {
 const tier = document.getElementById('subConfirmStartBtn').dataset.tier;
 closeSubscribeConfirm();
 await payTossSubscription(tier);
}

async function payTossSubscription(tier) {
 if (!window.SUBSCRIPTION_ENABLED) {
   alert('정기 구독은 현재 결제 시스템 검수 중입니다.\n검수 완료 즉시 안내드릴게요.');
   return;
 }
 if (!window.CU) { alert('로그인이 필요합니다.'); return; }
 const info = SUB_PLAN_INFO[tier];
 if (!info) return;

 gtag('event', 'select_item', {
   item_list_name: 'subscription',
   items: [{ item_id: 'sub_' + tier, item_name: info.name, quantity: 1, price: info.amount }],
   value: info.amount, currency: 'KRW',
   traffic_source: localStorage.getItem('traffic_source') || 'direct'
 });

  const clientKey = window.APP_CONFIG.TOSS_CLIENT_KEY;
  if (!clientKey) { alert('정기 구독 결제는 운영 환경에서만 사용할 수 있어요.'); return; }
  const tp = TossPayments(clientKey);
 const customerKey = 'cust_' + window.CU.uid;

 try {
   await tp.requestBillingAuth('카드', {
     customerKey,
     successUrl: `${window.location.origin + window.location.pathname}?sub=${tier}&ck=${encodeURIComponent(customerKey)}&uid=${encodeURIComponent(window.CU.uid)}`,
     failUrl: location.origin + location.pathname + '?subfail=1'
   });
 } catch(e) {
   if (e.code !== 'USER_CANCEL') alert('결제 오류: ' + e.message);
 }
}

function showPolicy(type) {
 const modal = document.getElementById('policyModal');
 const title = document.getElementById('policyTitle');
 const body = document.getElementById('policyBody');
 modal.style.display = 'block';

 if (type === 'terms') {
 title.textContent = '이용약관';
 body.innerHTML = `제1조 (목적)
본 약관은 지피코리아(gpkorea)(이하 "회사")이 운영하는 교수님 피하기(gpkorea.ai.kr, 이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정합니다.

제2조 (서비스 이용)
1. 서비스는 AI 글 탐지 및 텍스트 변환 기능을 제공합니다.
2. 이용자는 Google 또는 카카오 계정을 통해 가입할 수 있습니다.
3. 서비스 이용을 위해 크레딧이 필요하며, 신규 가입 시 10크레딧이 무료로 지급됩니다.
4. 크레딧 소비 기준은 100자당 1크레딧이며, 서비스 정책에 따라 변경될 수 있습니다. 변경 시 사전 공지합니다.

제3조 (크레딧 및 결제)
1. 크레딧은 유료 결제 또는 무료 지급을 통해 획득할 수 있습니다.
2. 결제는 토스페이먼츠를 통해 이루어집니다.
3. 충전된 크레딧(포인트)의 이용기간과 환불 가능기간은 결제 시점으로부터 1년 이내입니다.
4. 구매한 크레딧의 환불은 환불규정에 따릅니다.

제3조의2 (정기 구독 결제)
1. 회사는 매월 자동 결제되는 정기 구독 상품(이하 "구독")을 제공하며, 구독자는 Pro 전용 작업실과 매월 부여되는 쿠폰(또는 무제한 사용권)을 이용할 수 있습니다.
2. 구독을 신청하면 신청 즉시 첫 결제가 이루어지고, 그 후 매월 동일한 날짜(매 30일)에 등록된 결제 수단으로 자동 결제가 진행됩니다.
3. 구독 상품과 가격은 다음과 같습니다.
  · 베이직(1,000자 × 50회/월): 11,900원/월
  · 스탠다드(5,000자 × 50회/월): 54,900원/월
  · 프로(10,000자 × 50회/월): 99,000원/월
  · 무제한: 290,000원/월 (회수·글자 수 제한 없음)
4. 매 사이클에 부여된 쿠폰은 해당 사이클 내에서만 사용 가능하며, 다음 결제일에 잔여 쿠폰은 소멸되고 새 쿠폰이 50회 부여됩니다(무제한 상품 제외).
5. 이용자는 마이페이지에서 언제든 구독을 해지할 수 있으며, 해지 후에도 다음 결제일 전까지 잔여 쿠폰을 사용할 수 있습니다. 해지 시점이 다음 결제일 이후이면 신규 결제는 발생하지 않습니다.
6. 결제 실패 시 구독은 자동으로 일시 중단되며, 이용자는 결제 수단 변경 후 다시 구독할 수 있습니다.
7. 자동 결제 카드 정보는 토스페이먼츠가 안전하게 보관하며, 회사는 카드 번호 등의 결제 정보를 자체 보관하지 않습니다.
8. 구독 환불은 결제일로부터 7일 이내, 그리고 해당 사이클의 쿠폰을 사용하지 않은 경우에 한해 전액 환불됩니다. 일부라도 사용한 경우에는 환불이 제한될 수 있으며, 자세한 내용은 환불 정책을 따릅니다.

제4조 (이용자 책임 및 면책 - Disclaimer)
1. 본 서비스는 AI 감지 회피 및 텍스트 변환 도구를 제공하며, 해당 도구의 활용 방법과 목적은 전적으로 이용자의 판단과 책임에 따릅니다.
2. 이용자는 본 서비스를 이용함에 있어 소속 기관(학교, 직장 등)의 규정, 학칙, 윤리강령 등을 스스로 확인하고 준수할 책임이 있습니다. 회사는 이용자가 소속 기관의 규정을 위반하여 발생하는 어떠한 불이익(징계, 성적 처리 등)에 대해서도 책임을 지지 않습니다.
3. 서비스를 통해 생성된 결과물의 활용으로 인해 발생하는 법적·윤리적 문제에 대한 모든 책임은 이용자 본인에게 있습니다.
4. AI가 생성하거나 변환한 결과물은 현행 저작권법상 '인간의 창작물'로 인정되기 어려울 수 있으며, 해당 결과물에 대한 저작권 보호 여부는 보장되지 않습니다. 이용자는 이 점을 충분히 인지하고 서비스를 이용해야 합니다.
5. AI 감지 및 변환 결과는 참고용이며, 결과의 정확성 및 탐지 회피 성공 여부를 보장하지 않습니다. 이로 인해 발생하는 손해에 대해 회사는 책임을 지지 않습니다.

제5조 (금지행위)
1. 서비스를 부정한 목적으로 사용하는 행위
2. 타인의 계정을 도용하는 행위
3. 서비스의 정상적인 운영을 방해하는 행위
4. 허위 정보를 입력하거나 결제를 부정한 방법으로 이용하는 행위

제6조 (서비스 변경 및 중단)
회사는 운영상 필요에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 이에 대해 사전 공지합니다. 서비스 중단으로 인해 잔여 크레딧이 있는 경우 환불 정책에 따라 처리합니다.

제7조 (분쟁 해결)
본 약관과 관련한 분쟁은 대한민국 법률을 준거법으로 하며, 분쟁 발생 시 회사 소재지를 관할하는 법원을 1심 관할 법원으로 합니다.

시행일: 2026년 3월 14일`.split('\n').join('<br>');
 } else if (type === 'privacy') {
 title.textContent = '개인정보처리방침';
 body.innerHTML = `교수님 피하기(이하 "서비스")는 이용자의 개인정보를 중요시하며, 개인정보 보호법에 따라 아래와 같이 개인정보처리방침을 안내합니다.

1. 수집하는 개인정보 항목
- Google/카카오 로그인을 통해 이름, 이메일 주소를 수집합니다.
- 서비스 이용 기록, 크레딧 사용 내역, 결제 정보(주문번호, 결제금액)를 수집합니다.
- 사용자가 입력한 텍스트, 변환 결과, Q&A/커뮤니티 작성 내용은 서비스 처리, 결과 보관함, 고객지원 제공을 위해 저장될 수 있습니다.
- 서비스 이용 과정에서 접속 IP, 접속 일시, 브라우저 정보 등이 자동으로 수집될 수 있습니다.

2. 개인정보 수집 및 이용 목적
- 서비스 제공 및 회원 관리
- 크레딧 관리 및 결제 처리
- 서비스 개선 및 통계 분석
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
- 문의: 카카오톡 문의 또는 고객센터 이메일

8. 개인정보 침해 신고
개인정보 침해 관련 신고·상담은 아래 기관에 문의하실 수 있습니다.
- 개인정보 침해신고센터: privacy.kisa.or.kr / 국번 없이 118
- 대검찰청 사이버수사과: cybercid.spo.go.kr / 국번 없이 1301

시행일: 2026년 3월 14일`.split('\n').join('<br>');
 } else if (type === 'refund') {
 title.textContent = '환불규정';
 body.innerHTML = `교수님 피하기 환불규정
(전자상거래 등에서의 소비자보호에 관한 법률에 따라 아래와 같이 환불 정책을 안내합니다.)

1. 크레딧 환불 정책
- 구매 후 7일 이내 환불을 요청할 수 있으며, 사용한 크레딧은 환불액에서 제외됩니다.
- 무료로 지급된 크레딧은 환불 대상이 아닙니다.
- 크레딧 소비 기준은 100자당 1크레딧이며, 소비된 크레딧은 환불되지 않습니다.

2. 구독 플랜 환불 정책
- 구독 후 7일 이내 환불을 요청할 수 있으며, 해당 사이클 쿠폰을 사용하지 않은 경우 전액 환불 가능합니다.
- 구독 기간 중 쿠폰 또는 크레딧을 사용한 경우, 사용분을 제외하거나 환불이 제한될 수 있습니다.
- 월 구독의 경우 당월 환불만 가능하며, 익월 자동결제는 해지 신청으로 중단할 수 있습니다.

3. 환불 신청 방법
- 마이페이지의 환불하기 메뉴 또는 카카오톡 문의/고객센터 이메일(aqua0661123@naver.com)로 환불 신청
- 신청 시 아래 정보를 기재해 주세요.
  · 주문번호 및 결제일
  · 환불 사유
- 처리 기간: 영업일 기준 3~5일
- 환불은 결제 수단으로 원칙 환불하며, 카드 결제의 경우 카드 취소로 처리됩니다.

4. 환불 불가 항목
- 이미 사용된 크레딧
- 구매 후 7일 초과된 경우
- 부정 사용으로 적립된 크레딧
- 무료 지급 크레딧

5. 소비자 분쟁 해결
환불 관련 분쟁이 해결되지 않는 경우 공정거래위원회 소비자분쟁조정위원회(1372.go.kr)에 분쟁 조정을 신청하실 수 있습니다.

시행일: 2026년 3월 14일`.split('\n').join('<br>');
 }
}

window.addEventListener('load',()=>{
 if (location.search.includes('code=')) {
 window.handleKakaoCallback();
 }
// --- 사진 미리보기 이벤트 등록 ---
 const photoInput = document.getElementById('community-photos');
 const previewList = document.getElementById('photo-preview-list');
 let selectedFiles = []; // 선택된 파일 관리용 배열

 if (photoInput && previewList) {
 photoInput.addEventListener('change', function(e) {
 const files = Array.from(e.target.files);
 if (selectedFiles.length + files.length >5) { 
 alert("사진은 최대 5장까지만 첨부할 수 있습니다!"); 
 return; 
 }
 files.forEach(file =>{
 selectedFiles.push(file);
 const reader = new FileReader();
 reader.onload = function(event) {
 const div = document.createElement('div');
 div.className = 'preview-item';
 const img = document.createElement('img');
 img.src = event.target.result;
 const rbtn = document.createElement('span');
 rbtn.className = 'remove-btn';
 rbtn.textContent = '×';
 rbtn.addEventListener('click', () => {
  div.remove();
  window.removeSelectedFile(file.name);
 });
 div.replaceChildren(img, rbtn);
 previewList.appendChild(div);
 };
 reader.readAsDataURL(file);
 });
 // 같은 파일을 다시 올릴 수 있도록 초기화
 photoInput.value = ''; 
 });

 // X 버튼 누르면 배열에서도 삭제하는 함수
 window.removeSelectedFile = function(fileName) {
 selectedFiles = selectedFiles.filter(f =>f.name !== fileName);
 };
 // 업로드 시 참조할 수 있게 전역에 연결
 window.getSelectedFiles = () =>selectedFiles;
 window.clearSelectedFiles = () =>{ selectedFiles = []; previewList.innerHTML = ''; };
 }
 const p=new URLSearchParams(location.search);
 if(p.get('success')==='1') {
 history.replaceState({},'',location.pathname);
 }
 if(p.get('fail')==='1') { alert('결제가 취소됐어요.'); history.replaceState({},'',location.pathname); }
});

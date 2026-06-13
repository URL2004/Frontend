import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, EmailAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, collectionGroup, addDoc, getDocs, orderBy, query, where, limit, serverTimestamp, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
  .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
  .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
window.jsAttr = jsAttr;
// 사진 URL 화이트리스트: Firebase Storage 도메인만 허용
function safePhotoUrl(url) {
 try {
  const u = new URL(url);
  const ok = ['firebasestorage.googleapis.com','storage.googleapis.com'];
  return ok.some(h => u.hostname.endsWith(h)) ? u.toString() : '';
 } catch { return ''; }
}
window.safePhotoUrl = safePhotoUrl;
// FAQ 아코디언 토글
window.toggleFaq = function(btn) {
 const item = btn.closest('.faq-item');
 if (!item) return;
 item.classList.toggle('open');
};

const FB = window.APP_CONFIG.FIREBASE;
const fbapp = initializeApp(FB);
const auth = getAuth(fbapp); window._fbAuth = auth;
const db = getFirestore(fbapp);
const storage = getStorage(fbapp);
const provider = new GoogleAuthProvider();

// 추천 링크: ?ref= 파라미터 저장
(function() {
 const urlParams = new URLSearchParams(window.location.search);
 const refCode = urlParams.get('ref');
 if (refCode) localStorage.setItem('pendingRef', refCode);
})();

let _authResolve;
window.authReady = new Promise(resolve => { _authResolve = resolve; });
window._fbDb = db;
window._fbGetDoc = getDoc;
window._fbDoc = doc;

let CU = null;
window.UC = 0;
window.UP = 'free';
const ADMIN_ROLES = {
 'nC90IyjgaIZ8Z0JTABMTiyQHF9g1': { name:'운영자', label:'운영자' },
 'qa0iQAeVmMOxoy6Vg5ENTRKk0Vm2': { name:'관리자', label:'관리자' },
 'upyxtXMQEgQXfqTUWPrf6QS9EqE2': { name:'개발자', label:'개발자' },
 '9i6YA66mpXSBcpPJqNmJQ5jnJsT2': { name:'박도현', label:'관리자' }
};
window.isAdmin = () =>CU && !!ADMIN_ROLES[CU.uid];
window.getAdminName = () =>CU && ADMIN_ROLES[CU.uid] ? ADMIN_ROLES[CU.uid].name : null;

onAuthStateChanged(auth, async u =>{
 if (u) {
 CU = u; window.CU = u; await loadUser(u);
 showScreen('app');
 window.updateAuthUI(true);
 if (typeof window.applyRouteFromUrl === 'function') window.applyRouteFromUrl({ replace: true });
 }
 else {
 CU = null; window.CU = null;
 if (window.gpSetRemoteNotifications) window.gpSetRemoteNotifications([]);
 showScreen('app');
 if (typeof window.applyRouteFromUrl === 'function') window.applyRouteFromUrl({ replace: true });
 else switchTab('main');
 window.updateAuthUI(false);
 }
 _authResolve();
});

// 운영 알림 중계(문의·가입·초대) — fire-and-forget, 사용자 흐름 절대 안 막음. 백엔드 /events가 미설정이면 즉시 종료됨.
async function gpNotifyEvent(type, data) {
 try {
  if (!CU || !CU.getIdToken) return;
  const idToken = await CU.getIdToken();
  fetch(window.apiUrl('/events'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken, type, ...(data || {}) })
  }).catch(() => {});
 } catch (_) { /* 알림 실패는 무시 */ }
}
window.gpNotifyEvent = gpNotifyEvent;

async function loadUser(u) {
 const uRef = doc(db,'users',u.uid);
 const snap = await getDoc(uRef);
 if (!snap.exists()) {
 const myRefCode = u.uid.substring(0,8);
 await setDoc(uRef,{ email:u.email, name:u.displayName, credits:10, plan:'free', refCode:myRefCode, createdAt:new Date().toISOString() });
 window.UC = 10; window.UP = 'free';
 window.SUB = null; window.COUPON = null;
 const trafficSource = localStorage.getItem('traffic_source') || 'direct';
 const signMethod = (u.providerData[0]?.providerId === 'google.com') ? 'google' : (u.email?.includes('@kakao.com')) ? 'kakao' : 'email';
 if (window.gpTrack) window.gpTrack('sign_up', { method: signMethod, traffic_source: trafficSource });
 localStorage.removeItem('traffic_source');
 gpNotifyEvent('signup', { via: signMethod });   // 운영 알림(신규 가입)
 } else {
 const d = snap.data();
 window.UC = d.credits||0; window.UP = d.plan||'free';
 // 구독/쿠폰 상태 정규화
 if (d.subscription) {
   window.SUB = {
     tier: d.subscription.tier,
     status: d.subscription.status,
     nextBillingMs: d.subscription.nextBillingAt?.toMillis ? d.subscription.nextBillingAt.toMillis() : (d.subscription.nextBillingAt?._seconds ? d.subscription.nextBillingAt._seconds*1000 : 0),
     cancelledAt: d.subscription.cancelledAt || null,
     cardCompany: d.subscription.cardCompany || null,
     cardNumber: d.subscription.cardNumber || null
   };
 } else { window.SUB = null; }
 window.COUPON = d.coupon ? { tier: d.coupon.tier, remaining: d.coupon.remaining, granted: d.coupon.granted } : null;
 // pro 등급 정규화: 구독자는 'pro' 또는 'unlimited'
 const subValid = window.SUB && (window.SUB.status === 'active' || (window.SUB.status === 'cancelled' && window.SUB.nextBillingMs > Date.now()));
 if (subValid && window.SUB.tier === 'unlimited') window.UP = 'unlimited';
 else if (subValid) window.UP = 'pro';
 if (!d.refCode) await updateDoc(uRef, { refCode: u.uid.substring(0,8) });
 }
 // Pro 탭 잠금 아이콘 표시
 const lock = document.getElementById('snavProLock');
 const isPro = window.UP === 'pro' || window.UP === 'unlimited';
 if (lock) lock.style.display = isPro ? 'none' : 'inline';
 // 추천 코드가 있으면 백엔드에 요청 (신규/기존 유저 모두)
 const pendingRef = localStorage.getItem('pendingRef');
 const myRefCode = snap.exists() ? (snap.data().refCode || u.uid.substring(0,8)) : u.uid.substring(0,8);
 if (pendingRef && pendingRef !== myRefCode) {
  try {
   const token = await u.getIdToken();
   const res = await fetch(window.apiUrl('/apply-referral'), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ idToken:token, refCode:pendingRef })
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
 updateCreditUI();
 window.updateNotifBadge(u.uid);
 setTimeout(() => { if (typeof window.loadSidebarHistory === 'function') window.loadSidebarHistory(); }, 300);
}

function updateCreditUI() {
 const el = document.getElementById('creditChip');
 if (!el) return;
 if (!window.CU) { el.innerHTML = '크레딧 10'; el.style.color = 'var(--text2)'; return; }
 const plans = { pro:'프로', master:'마스터', unlimited:'무제한' };
 const p = window.UP;
 if (p === 'unlimited') { el.innerHTML = '크레딧 무제한'; el.style.color = 'var(--yellow)'; }
 else if (plans[p]) { el.innerHTML = '크레딧 ' + window.UC + ' · ' + plans[p]; el.style.color = p==='master'?'var(--yellow)':'var(--blue)'; }
 else { el.innerHTML = '크레딧 ' + window.UC; el.style.color = window.UC<=3?'var(--red)':'var(--text)'; }
 // 플랜 뱃지 업데이트
 const badge = document.getElementById('userPlanBadge');
 if (badge) badge.textContent = plans[p] || 'Free';
}

 
window.updateCreditUI = updateCreditUI;

// ───────────────────────────────────────────
// 쿠폰 코드 기능
// ───────────────────────────────────────────
const COUPON_API = window.apiBase();

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
  msg.style.color = 'var(--red)'; msg.textContent = '쿠폰 코드 12자리를 입력해주세요.'; return;
 }
 msg.style.color = 'var(--text3)'; msg.textContent = '적용 중...';
 try {
  const token = await window.CU.getIdToken();
  const res = await fetch(COUPON_API + '/redeem-coupon', {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken: token, code })
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
 if (!credEl || !cntEl || !msg || !result) return;
 if (!window.CU || !window.isAdmin()) { msg.style.color = 'var(--red)'; msg.textContent = '관리자 권한이 필요해요.'; return; }
 const credits = parseInt(credEl.value, 10);
 const count = parseInt(cntEl.value, 10);
 const expiresAt = expEl.value ? new Date(expEl.value + 'T23:59:59').toISOString() : null;
 if (!Number.isInteger(credits) || credits < 1) { msg.style.color = 'var(--red)'; msg.textContent = '크레딧을 올바르게 입력해주세요.'; return; }
 if (!Number.isInteger(count) || count < 1) { msg.style.color = 'var(--red)'; msg.textContent = '개수를 올바르게 입력해주세요.'; return; }
 msg.style.color = 'var(--text3)'; msg.textContent = '발급 중...';
 result.innerHTML = '';
 try {
  const token = await window.CU.getIdToken();
  const body = { idToken: token, credits, count };
  if (expiresAt) body.expiresAt = expiresAt;
  const res = await fetch(COUPON_API + '/admin/create-coupons', {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
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
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div>';
 try {
  const token = await window.CU.getIdToken();
  const cursor = window._couponPages.cursors[window._couponPages.index];
  const body = { idToken: token, limit: 10 };
  if (cursor) body.cursor = cursor;
  const res = await fetch(COUPON_API + '/admin/list-coupon-batches', {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
   el.innerHTML = '<div style="color:var(--red);padding:12px;">' + (data.error || '조회 실패') + '</div>';
   return;
  }
  // nextCursor stack 갱신
  if (data.nextCursor && window._couponPages.cursors.length === window._couponPages.index + 1) {
   window._couponPages.cursors.push(data.nextCursor);
  }
  window._couponPages.hasNext = !!data.nextCursor;

  if ((!data.batches || data.batches.length === 0) && window._couponPages.index === 0) {
   el.innerHTML = '<div style="color:var(--text3);padding:12px;text-align:center;">발급 이력이 없어요.</div>';
   return;
  }
  // 페이지가 비었는데 index>0인 경우 (삭제 직후 케이스): 한 페이지 뒤로
  if ((!data.batches || data.batches.length === 0) && window._couponPages.index > 0) {
   window._couponPages.index--;
   return window.loadCouponBatches();
  }
  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
   + '<thead><tr style="border-bottom:2px solid var(--border);color:var(--text2);">'
   + '<th style="padding:8px;text-align:left;">발급일</th>'
   + '<th style="padding:8px;text-align:left;">발급자</th>'
   + '<th style="padding:8px;text-align:right;">크레딧</th>'
   + '<th style="padding:8px;text-align:right;">발급</th>'
   + '<th style="padding:8px;text-align:right;">사용</th>'
   + '<th style="padding:8px;text-align:right;">무효</th>'
   + '<th style="padding:8px;text-align:right;">잔여</th>'
   + '<th style="padding:8px;text-align:left;">만료</th>'
   + '<th style="padding:8px;"></th>'
   + '</tr></thead><tbody>';
  data.batches.forEach(b => {
   const actionBtn = (b.unusedCount > 0)
    ? '<button onclick="voidBatch(\'' + escapeHtml(b.batchId) + '\',' + b.unusedCount + ')" style="padding:5px 10px;border-radius:6px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:11px;cursor:pointer;">배치 무효화</button>'
    : '<button onclick="deleteBatch(\'' + escapeHtml(b.batchId) + '\')" style="padding:5px 10px;border-radius:6px;border:1px solid var(--text3);background:transparent;color:var(--text2);font-size:11px;cursor:pointer;">기록 지우기</button>';
   html += '<tr style="border-bottom:1px solid var(--border);">'
    + '<td style="padding:8px;color:var(--text3);">' + escapeHtml(fmtDate(b.createdAt)) + '</td>'
    + '<td style="padding:8px;">' + escapeHtml(adminLabel(b.adminUid)) + '</td>'
    + '<td style="padding:8px;text-align:right;font-weight:600;">' + b.credits + '</td>'
    + '<td style="padding:8px;text-align:right;">' + b.count + '</td>'
    + '<td style="padding:8px;text-align:right;color:var(--blue);">' + b.redeemedCount + '</td>'
    + '<td style="padding:8px;text-align:right;color:var(--text3);">' + b.voidedCount + '</td>'
    + '<td style="padding:8px;text-align:right;color:var(--green);font-weight:600;">' + b.unusedCount + '</td>'
    + '<td style="padding:8px;color:var(--text3);cursor:pointer;text-decoration:underline;text-decoration-style:dotted;" onclick="updateBatchExpiry(\'' + escapeHtml(b.batchId) + '\',' + (b.expiresAt !== null && b.expiresAt !== undefined ? b.expiresAt : 'null') + ')" title="클릭해서 만료일 변경">' + escapeHtml(fmtDateShort(b.expiresAt)) + ' ✎</td>'
    + '<td style="padding:8px;white-space:nowrap;">'
    + '<button onclick="showBatchDetail(\'' + escapeHtml(b.batchId) + '\')" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;cursor:pointer;margin-right:4px;">상세</button>'
    + actionBtn
    + '</td></tr>'
    + '<tr id="batchDetail-' + escapeHtml(b.batchId) + '" style="display:none;"><td colspan="9" style="padding:0;"></td></tr>';
  });
  html += '</tbody></table></div>';
  // 페이지네이션 컨트롤
  const prevDisabled = window._couponPages.index === 0;
  const nextDisabled = !window._couponPages.hasNext;
  html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:12px;font-size:13px;color:var(--text2);">'
   + '<button ' + (prevDisabled ? 'disabled' : '') + ' onclick="couponPrevPage()" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:' + (prevDisabled ? 'var(--text3)' : 'var(--text2)') + ';font-size:12px;cursor:' + (prevDisabled ? 'not-allowed' : 'pointer') + ';opacity:' + (prevDisabled ? '0.5' : '1') + ';">‹ 이전</button>'
   + '<span>' + (window._couponPages.index + 1) + ' 페이지</span>'
   + '<button ' + (nextDisabled ? 'disabled' : '') + ' onclick="couponNextPage()" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:' + (nextDisabled ? 'var(--text3)' : 'var(--text2)') + ';font-size:12px;cursor:' + (nextDisabled ? 'not-allowed' : 'pointer') + ';opacity:' + (nextDisabled ? '0.5' : '1') + ';">다음 ›</button>'
   + '</div>';
  el.innerHTML = html;
 } catch (e) {
  el.innerHTML = '<div style="color:var(--red);padding:12px;">네트워크 오류: ' + escapeHtml(e.message) + '</div>';
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
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken: token, batchId })
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
  const body = { idToken: token, batchId };
  if (expiresAt) body.expiresAt = expiresAt;
  const res = await fetch(COUPON_API + '/admin/update-batch-expiry', {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
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
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken: token, batchId })
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
    + (c.status === 'unused' ? '<button onclick="voidCoupon(\'' + escapeHtml(c.code) + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:10px;cursor:pointer;">무효화</button>' : '')
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
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken: token, batchId })
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
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ idToken: token, code })
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
 if (isLoggedIn && typeof updateCreditUI === 'function') updateCreditUI();
};

window.handleKakaoCallback = async () =>{
 const params = new URLSearchParams(location.search);
 const code = params.get('code');
 if (!code) return;
 try {
 const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
 method: 'POST',
 headers: {'Content-Type': 'application/x-www-form-urlencoded'},
 body: new URLSearchParams({
 grant_type: 'authorization_code',
 client_id: window.APP_CONFIG.KAKAO_REST_KEY,
 redirect_uri: window.APP_CONFIG.SITE_URL,
 code
 })
 });
 const tokenData = await tokenRes.json();
 if (tokenData.access_token) {
 Kakao.Auth.setAccessToken(tokenData.access_token);
 const userRes = await Kakao.API.request({url: '/v2/user/me'});
 const kakaoId = userRes.id;
 const nickname = userRes.kakao_account?.profile?.nickname || '카카오유저';
 const email = userRes.kakao_account?.email || kakaoId+'@kakao.com';
 const photo = userRes.kakao_account?.profile?.profile_image_url || '';
 const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
 const { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
 const auth2 = window._fbAuth;
 const pw = 'kakao_' + kakaoId + '_pw!';
 let user;
 try {
 const uc = await createUserWithEmailAndPassword(auth2, email, pw);
 user = uc.user;
 await updateProfile(user, {displayName: nickname, photoURL: photo});
 } catch(e) {
 if (e.code === 'auth/email-already-in-use') {
 const us = await signInWithEmailAndPassword(auth2, email, pw);
 user = us.user;
 } else throw e;
 }
 await updateDoc(doc(db,'users',user.uid), { kakaoId: String(kakaoId) }).catch(()=>{});
 history.replaceState({}, '', location.pathname);
 }
 } catch(e) { console.log('카카오 로그인 오류:', e); }
};

window.kakaoLogin = async () =>{
 if (/KAKAOTALK/i.test(navigator.userAgent)) {
 document.querySelector('.kakao-warn').style.display = 'flex';
 return;
 }
 try {
 if (window.gpTrack) window.gpTrack('login_start', { method: 'kakao' });
 const authResult = await new Promise((resolve, reject) =>{
 Kakao.Auth.login({
 success: resolve,
 fail: reject,
 scope: 'profile_nickname,profile_image,account_email'
 });
 });
 const token = authResult.access_token;
 const res = await fetch(window.apiUrl('/kakao-login'), {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ accessToken: token })
 });
 const data = await res.json();
 if (data.error) throw new Error(data.error);
 const { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
 const pw = 'kakao_' + data.kakaoId + '_!@#';
 let user;
 try {
 const uc = await createUserWithEmailAndPassword(window._fbAuth, data.email, pw);
 user = uc.user;
 } catch(e) {
 if (e.code === 'auth/email-already-in-use') {
 const us = await signInWithEmailAndPassword(window._fbAuth, data.email, pw);
 user = us.user;
 } else throw e;
 }
 await updateProfile(user, { displayName: data.nickname, photoURL: data.photo });
 await updateDoc(doc(db,'users',user.uid), { kakaoId: String(data.kakaoId) }).catch(()=>{});
 if (window.gpTrack) window.gpTrack('login', { method: 'kakao' });
 } catch(e) {
 if (window.gpTrack) window.gpTrack((e && e.error_code === 'CANCELED') ? 'login_cancel' : 'login_error', { method: 'kakao', message: String(e.message || '').slice(0, 120) });
 if (e && e.error_code !== 'CANCELED') alert('카카오 로그인 실패: ' + (e.message || JSON.stringify(e)));
 }
};

window.googleLogin = async () =>{
 if (/KAKAOTALK/i.test(navigator.userAgent)) { document.querySelector('.kakao-warn').style.display='flex'; return; }
 try {
  if (window.gpTrack) window.gpTrack('login_start', { method: 'google' });
  await signInWithPopup(auth, provider);
  if (window.gpTrack) window.gpTrack('login', { method: 'google' });
 } catch(e) {
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
 if(ok) { if (window.gpTrack) window.gpTrack('logout'); await signOut(auth); switchTab('main'); }
};

window.changeNickname = async () =>{
 if (!CU) return;
 const newName = window.gpPrompt
  ? await window.gpPrompt({ title: '닉네임 변경', message: '커뮤니티와 마이페이지에 표시될 이름입니다.', placeholder: '새 닉네임', defaultValue: CU.displayName || '', confirmText: '변경하기', required: true })
  : prompt('새 닉네임을 입력하세요:', CU.displayName);
 if (!newName || newName.trim() === '') return;
 if (newName.trim().length >20) { alert('닉네임은 20자 이내로 입력해주세요.'); return; }
 try {
 await updateProfile(CU, { displayName: newName.trim() });
 await updateDoc(doc(db,'users',CU.uid), { name: newName.trim() });
 document.getElementById('uname').textContent = newName.trim() + '님';
 alert('닉네임이 변경됐어요!');
 await window.loadMyPage();
 } catch(e) {
 alert('닉네임 변경 실패: ' + e.message);
 }
};

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
       alert('해지 예정인 구독이 ' + nextDate + '까지 남아 있습니다.\n잔여 쿠폰을 사용하시거나, 결제 후 7일 이내 미사용이라면 환불 신청 후 다시 시도해주세요.');
       return;
     }
   }
 } catch(e) { /* 조회 실패해도 탈퇴는 시도 가능 */ }

 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: '정말 탈퇴하시겠어요?',
    message: '모든 크레딧과 데이터가 삭제되며 복구할 수 없습니다. 결제·환불 기록은 전자상거래법에 따라 5년간 보관됩니다.',
    confirmText: '탈퇴하기',
    danger: true
  })
  : confirm('정말 탈퇴하시겠어요?\n탈퇴 시 모든 크레딧과 데이터가 삭제되며 복구할 수 없습니다.\n(결제·환불 기록은 전자상거래법에 따라 5년간 보관됩니다.)');
 if (!ok) return;
 // ★ 탈퇴는 백엔드(Admin SDK)에서 처리 — 카카오 비밀번호 추측 재인증 제거.
 //   추측 패턴 불일치로 탈퇴 불가하던 민원(#40·#61·#62·#91) 해결. 서버가 idToken만 검증하고 데이터·Auth 계정을 삭제.
 try {
   const idToken = await CU.getIdToken();
   const res = await fetch(window.apiUrl('/delete-account'), {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ idToken })
   });
   const body = await res.json().catch(() => null);
   if (!res.ok || !body || !body.ok) throw new Error((body && body.error) || '탈퇴 처리 중 오류가 발생했어요.');
   try { await signOut(auth); } catch(_) {}   // 서버에서 계정이 이미 삭제됨 — 클라 세션 정리
   alert('탈퇴가 완료됐어요.');
   location.reload();
 } catch(e) {
   alert('탈퇴 실패: ' + (e.message || e));
 }
};

window.showReferralPopup = async () => {
 if (!CU) return;
 const snap = await getDoc(doc(db,'users',CU.uid));
 const refCode = snap.data().refCode || CU.uid.substring(0,8);
 const link = window.APP_CONFIG.SITE_URL + '?ref=' + refCode;
 const overlay = document.createElement('div');
 overlay.id = 'refOverlay';
 overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
 overlay.innerHTML = `
 <div style="background:var(--surface);border-radius:16px;max-width:380px;width:100%;padding:32px 24px;position:relative;text-align:center;">
  <button onclick="document.getElementById('refOverlay').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);">×</button>
  <div style="margin-bottom:16px;">
   <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5" width="56" height="56" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  </div>
  <div style="font-size:18px;font-weight:700;margin-bottom:6px;">친구 초대 시 20크레딧 증정!</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.6;">친구가 링크로 가입하면 친구도, 나도<br>각각 <strong style="color:var(--green);">20크레딧</strong>을 드려요</div>
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left;">
   <div style="font-size:13px;color:var(--text2);margin-bottom:12px;">크레딧 받는 방법</div>
   <div style="display:flex;flex-direction:column;gap:8px;">
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">1</span> 아래 링크를 친구에게 공유하세요.</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">2</span> 친구가 링크로 신규 가입하면 20크레딧을 받아요.</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">3</span> 친구가 신규 가입하면 나도 20크레딧을 받아요.</div>
   </div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
   <div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${link}</div>
   <button onclick="navigator.clipboard.writeText('${link}');this.textContent='복사됨!';setTimeout(()=>this.textContent='링크 복사',1500)" style="padding:10px 18px;border-radius:10px;border:none;background:var(--green);color:#fff;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">링크 복사</button>
  </div>
 </div>`;
 overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
 document.body.appendChild(overlay);
};

// 보안: credits/plan 직접 수정은 전부 백엔드(Admin SDK)에서만 처리.
// 과거 클라이언트측 addCredits/deductCredits는 콘솔에서 누구나 호출 가능한
// 권한 상승 취약점이었으므로 완전 제거. 차감은 /analyze에서,
// 지급은 /confirm-payment·/apply-referral에서만 발생한다.

// ===== COMMUNITY =====
window.sortBy = 'latest';
window.currentCategory = window.currentCategory || '';

// 페이지네이션 — 한 페이지에 10개씩
const POSTS_PER_PAGE = 10;
window.postPage = window.postPage || 1;
window._cachedPosts = null;

const CAT_SLUG = {
 '블로그 작성 꿀팁':'blog',
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

function _categorySlug(cat){ return CAT_SLUG[cat] || 'free'; }
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
function _mockDate(daysAgo){
 const d = new Date();
 d.setDate(d.getDate() - daysAgo);
 return { toDate: () => d };
}
function _makeExcerpt(body, n){
 if (!body) return '';
 n = n || 80;
 const t = String(body).replace(/\s+/g,' ').trim();
 return t.length > n ? t.slice(0, n) + '…' : t;
}

function _renderPostCard(p){
 const cat = p.category || '자유';
 const date = _fmtDate(p);
 const likes = (p.likes || []).length;
 const hiddenBadge = p.hidden ? '<span class="gbr-hidden">숨김</span>' : '';
 const onClick = p.demo ? "showScreen('login')" : "viewPost('"+jsAttr(p.id)+"')";
 return '<div class="gp-board-row" onclick="'+onClick+'">'
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
 const cat = p.category || '자유';
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

// 인기 게시글 TOP 5(aside) — 실제 글로 클릭 가능하게(사장님: 제목에 링크)
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
 const cat = top.category || '자유';
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

window.filterByCategory = function(cat){
 window.currentCategory = cat || '';
 document.querySelectorAll('.cat-fbtn').forEach(b => b.classList.toggle('active', (b.dataset.cat||'') === window.currentCategory));
 const isAll = !window.currentCategory;
 const fs = document.getElementById('featuredSection');
 const ps = document.getElementById('popularSection');
 if (fs) fs.style.display = (isAll && fs.dataset.has === '1') ? 'block' : 'none';
 if (ps) ps.style.display = (isAll && ps.dataset.has === '1') ? 'block' : 'none';
 window.postPage = 1;
 _renderPostPage();
};

function _renderPostPage() {
 const pl = document.getElementById('postList');
 const pager = document.getElementById('postPager');
 if (!pl) return;
 const all = window._cachedPosts || [];
 const cat = window.currentCategory || '';
 const posts = cat ? all.filter(p => (p.category || '자유') === cat) : all;
 if (!posts.length) {
   pl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text3)">'
    + (cat ? '"'+escapeHtml(cat)+'" 카테고리 글이 아직 없어요' : '첫 번째 글을 작성해보세요!')
    + '</div>';
   if (pager) pager.style.display = 'none';
   return;
 }
 const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
 if (window.postPage > totalPages) window.postPage = totalPages;
 if (window.postPage < 1) window.postPage = 1;
 const startIdx = (window.postPage - 1) * POSTS_PER_PAGE;
 const slice = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);
 pl.innerHTML = slice.map(_renderPostCard).join('');
 _renderPager(totalPages);
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
 const total = Math.max(1, Math.ceil((window._cachedPosts||[]).length / POSTS_PER_PAGE));
 if (n < 1 || n > total) return;
 window.postPage = n;
 _renderPostPage();
 // 페이지 전환 시 목록 상단으로 스크롤
 const pl = document.getElementById('postList');
 if (pl) pl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.loadPosts = async (sort) =>{
 const sortChanged = sort && sort !== window.sortBy;
 if (sort) window.sortBy = sort;
 document.querySelectorAll('.sortbtn').forEach(b =>b.classList.toggle('active', b.dataset.sort===window.sortBy));
 const pl = document.getElementById('postList');
 if (!pl) return;
 // 관리자만 "에디터 추천" 체크박스 노출
 const featLabel = document.getElementById('featuredLabel');
 if (featLabel) featLabel.style.display = (window.isAdmin && window.isAdmin()) ? 'flex' : 'none';
 const pager = document.getElementById('postPager');
 // 로그인 안 한 경우: 친절한 안내 + Firestore 호출 차단 (룰이 auth 요구)
 if (!CU) {
  const fs = document.getElementById('featuredSection');
  const ps = document.getElementById('popularSection');
  if (fs) fs.style.display = 'none';
  if (ps) ps.style.display = 'none';
  window._cachedPosts = [
   { id:'demo-post-1', demo:true, category:'블로그 작성 꿀팁', title:'AI 탐지 안전하게 피하는 블로그 글 작성 루틴', body:'저는 이렇게 쓰면 대부분 자연스럽게 나왔어요. 구성부터 문장 리듬까지 실제 루틴을 공유합니다.', authorName:'익명', createdAt:_mockDate(0), views:1246, likes:[1,2,3,4,5], commentCount:34 },
   { id:'demo-post-2', demo:true, category:'논문', title:'서론과 결론에서 AI 냄새 줄이는 방법', body:'교수님들이 특히 어색하게 보는 부분이 서론과 결론이더라고요. 제가 효과 봤던 표현 방식 정리해봤습니다.', authorName:'석문대생', createdAt:_mockDate(0), views:973, likes:[1,2,3,4], commentCount:22 },
   { id:'demo-post-3', demo:true, category:'자소서 조언', title:'자소서 문항별 구조 추천, 경험 기반', body:'항목별로 어떤 흐름이 설득력 있는지 막막하신 분들께 도움이 되길 바랍니다.', authorName:'취준러', createdAt:_mockDate(1), views:861, likes:[1,2,3], commentCount:18 },
   { id:'demo-post-4', demo:true, category:'글쓰기 팁', title:'문장 다양하게 쓰는 7가지 표현 패턴', body:'같은 내용도 더 자연스럽고 사람답게 쓰는 방법을 정리했어요.', authorName:'익명', createdAt:_mockDate(1), views:752, likes:[1,2], commentCount:11 },
   { id:'demo-post-5', demo:true, category:'자유', title:'이번 학기 과제 지옥, 우리 같이 버텨요', body:'다들 뭐 하고 계신가요? 저만 이렇게 바쁜 거 아니죠?', authorName:'익명', createdAt:_mockDate(2), views:630, likes:[1,2], commentCount:29 }
  ];
  window.postPage = 1;
  _renderPostPage();
  if (pager) pager.style.display = 'none';
  return;
 }
 pl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text3)">불러오는 중...</div>';
 if (pager) pager.style.display = 'none';
 try {
 const snap = await getDocs(collection(db,'posts'));
 let posts = [];
 snap.forEach(d =>posts.push({id:d.id,...d.data()}));

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

 if (window.sortBy==='oldest') posts.sort((a,b)=>(a.createdAt?.toDate()||0)-(b.createdAt?.toDate()||0));
 else if (window.sortBy==='views') posts.sort((a,b)=>(b.views||0)-(a.views||0));
 else posts.sort((a,b)=>(b.createdAt?.toDate()||0)-(a.createdAt?.toDate()||0));
 window._cachedPosts = posts;
 if (sortChanged || !window.postPage) window.postPage = 1;
 _renderPostPage();
 } catch(e) { pl.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--red)">불러오기 실패</div>'; }
};

window.submitPost = async () =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
 const title = document.getElementById('ptitle').value.trim();
 const body = document.getElementById('pbody').value.trim();
 if (!title||!body) { alert('제목과 내용을 입력해주세요.'); return; }
 
 const files = typeof window.getSelectedFiles === 'function' ? window.getSelectedFiles() : [];
 if (files.length >5) { alert('사진은 최대 5장까지만 가능합니다.'); return; }

 const anon = document.getElementById('postAnon').checked;
 const btn = document.getElementById('postsubmit');
 btn.disabled = true; 
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
 const category = (catEl && catEl.value) ? catEl.value : '자유';
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
 btn.textContent='등록'; 
 }
};

window.viewPost = async (postId) =>{
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
 const pdCat = p.category || '자유';
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
 const replyStyle = isReply ? 'margin-left:20px;border-left:3px solid var(--blue);padding-left:10px;' : '';
 const replyPrefix = isReply ? '↩ ' : '';
 let replyFormHtml = '';
 if (CU && !isReply) {
 replyFormHtml = '<button class="reply-btn" onclick="toggleReplyForm(\''+c.id+'\')">답글 달기</button>'
 +'<div id="replyForm_'+c.id+'" style="display:none;margin-top:8px;">'
 +'<textarea id="reply_'+c.id+'" placeholder="답글을 입력하세요..." rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);font-family:var(--font);font-size:13px;resize:vertical;outline:none;display:block;"></textarea>'
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
 } catch(e) { dv.innerHTML='<div style="color:var(--red)">불러오기 실패: '+e.message+'</div>'; }
};

window.submitComment = async (postId) =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
 const body = document.getElementById('cinput').value.trim();
 if (!body) { alert('댓글을 입력해주세요.'); return; }
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
 if (!CU) { alert('로그인이 필요합니다.'); return; }
 const ref = doc(db,'users',CU.uid);
 const snap = await getDoc(ref);
 const bms = snap.data().bookmarks||[];
 const has = bms.includes(postId);
 await updateDoc(ref,{bookmarks: has?arrayRemove(postId):arrayUnion(postId)});
 const btn = document.getElementById('bmBtn');
 if (btn) { btn.textContent=has?' 북마크':' 북마크됨'; btn.className=has?'abtn':'abtn bookmarked'; }
};

window.copyLink = (url) =>{
 navigator.clipboard.writeText(url).then(()=>alert('링크가 복사됐어요!'));
};

window.delPost = async (postId) =>{
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
window.qnaSort = window.qnaSort || 'pending';

window.loadQuestions = async (sort) =>{
 if (sort) window.qnaSort = sort;
 document.querySelectorAll('[data-qsort]').forEach(b => b.classList.toggle('active', b.dataset.qsort === window.qnaSort));
 const el = document.getElementById('questionList');
 if (!el) return;
 if (!CU) {
  // 1:1 문의는 로그인 필요 — 공개 게시판이 아니므로 데모 목록 대신 로그인 유도
  el.innerHTML = '<div class="qna-empty">로그인하면 1:1 문의를 남기고 답변을 확인할 수 있어요.<br>급하면 우측 하단 카카오톡 문의를 이용해 주세요.</div>';
  return;
 }
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

  if (!questions.length) {
   el.innerHTML = isAdm
    ? '<div class="qna-empty">접수된 문의가 없어요.</div>'
    : '<div class="qna-empty">아직 남긴 문의가 없어요. 위에서 문의를 남겨보세요.</div>';
   return;
  }
  const lockIco = '<svg class="lock-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  el.innerHTML = questions.map(q => {
   const date = q.createdAt ? new Date(q.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
   const status = q.status === 'answered' ? 'answered' : 'pending';
   const statusTxt = status === 'answered' ? '답변 완료' : '답변 대기';
   const canView = isAdm || (myUid && q.authorId === myUid);
   const displayTitle = canView ? escapeHtml(q.title||'') : '비공개 질문입니다.';
   const lockHtml = canView ? '' : lockIco;
   return '<div class="gp-board-row" onclick="viewQuestion(\''+q.id+'\')">'
    + '<div class="gbr-main">'
    +  '<div class="gbr-ttl">'+lockHtml+displayTitle+'</div>'
    +  '<div class="gbr-sub">'
    +   '<span>'+escapeHtml(q.authorName||'')+'</span>'
    +   '<span>'+date+'</span>'
    +   (canView ? '' : '<span class="gbr-cat">비공개</span>')
    +  '</div>'
    + '</div>'
    + '<div class="gbr-stats">'
    +  '<span class="qna-status '+status+'">'+statusTxt+'</span>'
    + '</div>'
    + '</div>';
  }).join('');
 } catch(e) {
  const isPerm = /permission|insufficient/i.test(e.message||'');
  el.innerHTML = isPerm
   ? '<div class="qna-empty">작성자와 관리자만 볼 수 있어요.</div>'
   : '<div class="qna-empty" style="color:var(--red)">불러오기 실패: '+escapeHtml(e.message||'')+'</div>';
 }
};

window.submitQuestion = async () =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
 const title = document.getElementById('qtitle').value.trim();
 const body = document.getElementById('qbody').value.trim();
 if (!title || !body) { alert('제목과 내용을 입력해주세요.'); return; }
 const anon = document.getElementById('qAnon').checked;
 const btn = document.getElementById('qsubmit');
 btn.disabled = true;
 btn.textContent = '등록 중...';
 try {
  const authorName = anon ? '익명' : ((window.getAdminName && window.getAdminName()) || CU.displayName || '사용자');
  const _qref = await addDoc(collection(db,'qna'), {
   title,
   body,
   authorId: CU.uid,
   authorName,
   isAnon: anon,
   status: 'pending',
   answer: null,
   createdAt: serverTimestamp(),
   views: 0
  });
  if (window.gpTrack) window.gpTrack('qna_submit', { qna_id: _qref.id, is_anon: anon });
  gpNotifyEvent('inquiry', { id: _qref.id });   // 운영 알림(새 문의)
  document.getElementById('qtitle').value = '';
  document.getElementById('qbody').value = '';
  document.getElementById('qAnon').checked = false;
  document.getElementById('qform').style.display = 'none';
  await window.loadQuestions();
 } catch(e) {
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
  if (!snap.exists()) { dv.innerHTML = '<div class="qna-empty">존재하지 않는 질문입니다.</div>'; return; }
  const q = snap.data();
  const isAdm = window.isAdmin && window.isAdmin();
  const isOwner = CU && CU.uid === q.authorId;
  if (!isAdm && !isOwner) {
   dv.innerHTML = '<div class="qna-empty">비공개 질문입니다.</div>';
   document.getElementById('curQuestionId').value = '';
   return;
  }
  await updateDoc(doc(db,'qna',qid), {views: increment(1)}).catch(()=>{});
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
   + (canDel ? '<div class="pdactions"><button class="abtn danger" onclick="delQuestion(\''+qid+'\')">질문 삭제</button></div>' : '')
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
    + (isAdm ? '<div class="qna-answer-actions"><button class="abtn" onclick="editAnswer(\''+qid+'\')">답변 수정</button><button class="abtn danger" onclick="delAnswer(\''+qid+'\')">답변 삭제</button></div>' : '')
    + '</div>';
  } else if (isAdm) {
   html += '<div class="qna-admin-form">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#2d8e4a;">운영팀 답변 작성</div>'
    + '<textarea id="answerBody" placeholder="답변을 입력하세요..."></textarea>'
    + '<div class="qna-admin-form-ft">'
    +  '<button class="qna-answer-submit" onclick="submitAnswer(\''+qid+'\')">답변 등록</button>'
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
   : '<div class="qna-empty" style="color:var(--red)">불러오기 실패: '+escapeHtml(e.message||'')+'</div>';
 }
};

window.backToQList = () =>{
 document.getElementById('qnaDetailView').style.display = 'none';
 document.getElementById('qnaListView').style.display = 'block';
 document.getElementById('curQuestionId').value = '';
 window.loadQuestions();
};

async function notifyQnaAnswered(qid, message) {
 try {
  const snap = await getDoc(doc(db,'qna',qid));
  if (!snap.exists()) return;
  const q = snap.data() || {};
  if (!q.authorId) return;
  await setDoc(doc(db,'users',q.authorId,'notifications','qna_answered_' + qid), {
   clientId: 'qna_answered_' + qid,
   type: 'qna',
   title: '문의 답변',
   message: message || '남겨주신 문의에 답변이 등록됐어요.',
   action: { tab: 'qna' },
   read: false,
   createdAt: serverTimestamp(),
   createdAtMs: Date.now()
  }, { merge: true });
 } catch(e) { console.log('Q&A 알림 저장 오류:', e); }
}

window.submitAnswer = async (qid) =>{
 if (!window.isAdmin || !window.isAdmin()) { alert('관리자만 답변할 수 있어요.'); return; }
 const ta = document.getElementById('answerBody');
 const body = ta ? ta.value.trim() : '';
 if (!body) { alert('답변 내용을 입력해주세요.'); return; }
 try {
  const answeredBy = (window.getAdminName && window.getAdminName()) || '운영팀';
  await updateDoc(doc(db,'qna',qid), {
   status: 'answered',
   answer: { body, answeredBy, answeredAt: new Date() }
  });
  await notifyQnaAnswered(qid, '남겨주신 문의에 운영팀 답변이 등록됐어요.');
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
  await updateDoc(doc(db,'qna',qid), {
   answer: { body: trimmed, answeredBy, answeredAt: new Date() },
   status: 'answered'
  });
  await notifyQnaAnswered(qid, '문의 답변이 수정됐어요. 다시 확인해 주세요.');
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
  await updateDoc(doc(db,'qna',qid), {status: 'pending', answer: null});
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
  await deleteDoc(doc(db,'qna',qid));
  window.backToQList();
 } catch(e) {
  alert('삭제 실패: '+e.message);
 }
};

// ===== NOTICE =====
window.loadNotices = async () =>{
 const adminBtn = document.getElementById('noticeAdminBtn');
 if (adminBtn) {
 if (window.isAdmin()) {
 adminBtn.innerHTML = '<button class="wbtn" onclick="toggleNoticeForm()">공지 작성</button>';
 } else {
 adminBtn.innerHTML = '';
 }
 }
 const el = document.getElementById('noticeList');
 if (!el) return;
 if (!CU) {
  const samples = [
   ['점검','서비스 정기 점검 안내 (05/25)','2024.05.22','1,246'],
   ['업데이트','AI 감지 알고리즘 v2.3 업데이트 안내','2024.05.20','3,512'],
   ['이벤트','5월 프리미엄 플랜 20% 할인 이벤트','2024.05.18','2,189'],
   ['업데이트','대시보드 UI/UX 개선 및 사용성 향상','2024.05.15','1,102'],
   ['정책','개인정보 처리방침 변경 안내','2024.05.10','1,876'],
   ['점검','서비스 임시 점검 안내 (완료)','2024.05.06','1,023'],
   ['업데이트','커뮤니티 기능 개선 및 버그 수정','2024.04.28','1,532'],
   ['이벤트','친구 초대 이벤트 당첨자 발표','2024.04.20','987']
  ];
  el.innerHTML = samples.map(n => '<div class="gp-board-row notice-demo" onclick="showScreen(\'login\')">'
   + '<div class="gbr-main">'
   +  '<div class="gbr-ttl">'+escapeHtml(n[1])+'</div>'
   +  '<div class="gbr-sub"><span class="gbr-cat">'+escapeHtml(n[0])+'</span><span>'+escapeHtml(n[2])+'</span></div>'
   + '</div>'
   + '<div class="gbr-stats">'+_gbrStat(_SICO_VIEW, escapeHtml(n[3]), 'views')+'</div>'
   + '</div>').join('');
  return;
 }
 el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">불러오는 중...</div>';
 try {
 const snap = await getDocs(query(collection(db,'notices'), orderBy('createdAt','desc')));
 if (snap.empty) { el.innerHTML='<div style="text-align:center;padding:32px;color:var(--text3)">등록된 공지가 없습니다.</div>'; return; }
 el.innerHTML = snap.docs.map(d =>{
 const n = d.data();
 const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
 return '<div class="gp-board-row" onclick="viewNotice(\''+d.id+'\')">'
 +'<div class="gbr-main">'
 +'<div class="gbr-ttl">'+escapeHtml(n.title)+'</div>'
 +'<div class="gbr-sub"><span class="gbr-cat">공지</span><span>'+date+'</span></div>'
 +'</div>'
 +'<div class="gbr-stats">'+_gbrStat(_SICO_VIEW, Number(n.views || 0).toLocaleString('ko-KR'), 'views')+'</div>'
 +'</div>';
 }).join('');
 } catch(e) { el.innerHTML='<div style="color:var(--red)">불러오기 실패</div>'; }
};

window.viewNotice = async (id) =>{
 const el = document.getElementById('noticeList');
 const snap = await getDoc(doc(db,'notices',id));
 const n = snap.data();
 const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
 const isAdm = window.isAdmin();
 el.innerHTML =
 '<button class="backbtn" onclick="loadNotices()">← 목록으로</button>'
 +'<div class="pdhd">'
 +'<div class="pdtitle">'+escapeHtml(n.title)+'</div>'
 +'<div class="pmeta"><span>'+escapeHtml(n.authorName||'운영자')+'</span><span>'+date+'</span></div>'
 +(isAdm ? '<div class="pdactions"><button class="abtn danger" onclick="delNotice(\'' + id + '\')">삭제</button></div>' : '')
 +'</div>'
 +'<div class="pdbody" id="nbody"></div>';
 document.getElementById('nbody').innerHTML = escapeHtml(n.body).replace(/\n/g,'<br>');
};

window.toggleNoticeForm = () =>{
 const f = document.getElementById('noticeWriteForm');
 if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.submitNotice = async () =>{
 if (!window.isAdmin()) { alert('관리자만 공지를 작성할 수 있습니다.'); return; }
 const title = document.getElementById('ntitle').value.trim();
 const body = document.getElementById('nbody_input').value.trim();
 if (!title||!body) { alert('제목과 내용을 입력해주세요.'); return; }
 const btn = document.getElementById('noticeSubmit');
 btn.disabled=true; btn.textContent='등록 중...';
 try {
 const noticeAuthor = window.getAdminName() || CU.displayName;
 await addDoc(collection(db,'notices'),{ title, body, authorName:noticeAuthor, createdAt:serverTimestamp() });
 document.getElementById('ntitle').value='';
 document.getElementById('nbody_input').value='';
 document.getElementById('noticeWriteForm').style.display='none';
 await window.loadNotices();
 } catch(e) { alert('등록 실패: '+e.message); }
 finally { btn.disabled=false; btn.textContent='등록'; }
};

window.delNotice = async (id) =>{
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '공지를 삭제할까요?', message: '삭제한 공지는 복구할 수 없어요.', confirmText: '삭제하기', danger: true })
  : confirm('공지를 삭제하시겠어요?');
 if (!ok) return;
 await deleteDoc(doc(db,'notices',id));
 await window.loadNotices();
};

// ===== MY PAGE =====
window.loadMyPage = async () =>{
 if (!CU) return;
 const el = document.getElementById('mypageContent');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text3);">불러오는 중...</div>';
 el.style.display = 'block';
 window.scrollTo(0,0);
 try {
 const snap = await getDoc(doc(db,'users',CU.uid));
 const u = snap.data();
 const plan = u.plan || 'free';
 const planNames = { free:'무료', starter:'스타터', pro:'프로', master:'마스터', unlimited:'무제한' };
 const postSnap = await getDocs(query(collection(db,'posts'), where('authorId','==',CU.uid)));
 let myPosts = [];
 postSnap.forEach(d => myPosts.push({id:d.id,...d.data()}));
 myPosts.sort((a,b)=>(b.createdAt?.toDate()||0)-(a.createdAt?.toDate()||0));
 const bookmarks = u.bookmarks || [];
 el.innerHTML =
 '<div class="shell"><div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;margin-bottom:20px;">'
 +'<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">'
 +'<div style="width:56px;height:56px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;">'
 +'<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" width="32" height="32" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
 +'</div>'
 +'<div><div style="font-size:18px;font-weight:700;">'+(window.getAdminName()||CU.displayName)+'</div>'
 +'<div style="font-size:13px;color:var(--text2);">'+CU.email+'</div></div></div>'
 +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">'
 +'<div style="text-align:center;padding:16px;background:var(--surface2);border-radius:var(--rs);">'
 +'<div style="font-size:22px;font-weight:700;color:var(--blue);">'+(u.credits||0)+'</div>'
 +'<div style="font-size:12px;color:var(--text3);">보유 크레딧</div></div>'
 +'<div style="text-align:center;padding:16px;background:var(--surface2);border-radius:var(--rs);">'
 +'<div style="font-size:22px;font-weight:700;color:var(--green);">'+myPosts.length+'</div>'
 +'<div style="font-size:12px;color:var(--text3);">작성한 글</div></div>'
 +'<div style="text-align:center;padding:16px;background:var(--surface2);border-radius:var(--rs);">'
 +'<div style="font-size:22px;font-weight:700;color:var(--yellow);">'+bookmarks.length+'</div>'
 +'<div style="font-size:12px;color:var(--text3);">북마크</div></div>'
 +'</div>'
 +'<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">'
 +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
 +'<span style="font-size:14px;color:var(--text2);">현재 플랜: <strong>'+(planNames[plan]||'무료')+'</strong></span>'
 +'<div style="display:flex;gap:6px;"><button onclick="showRefundModal()" style="padding:5px 12px;border-radius:50px;border:1px solid var(--border);background:transparent;color:var(--text3);font-family:var(--font);font-size:11px;cursor:pointer;">환불하기</button>'
+'<button onclick="deleteAccount()" style="padding:5px 12px;border-radius:50px;border:1px solid var(--border);background:transparent;color:var(--text3);font-family:var(--font);font-size:11px;cursor:pointer;">회원 탈퇴</button></div>'
 +'</div>'
 +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
 +'<button class="buybtn" onclick="switchTab(\'pricing\')">플랜 변경</button>'
 +'<button onclick="showReferralPopup()" style="padding:9px 0;border-radius:50px;border:none;background:var(--green);color:#fff;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;">친구 초대</button>'
 +'</div>'
 +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">'
 +'<button onclick="changeNickname()" style="padding:9px 0;border-radius:50px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-family:var(--font);font-size:13px;cursor:pointer;">닉네임 변경</button>'
 +'<button onclick="logout()" style="padding:9px 0;border-radius:50px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-family:var(--font);font-size:13px;cursor:pointer;">로그아웃</button>'
 +'</div>'
 +'</div></div>'
 +'<div id="subManageCard" style="margin-bottom:20px;"></div>'
 +'<div style="font-size:15px;font-weight:700;margin-bottom:12px;">내가 쓴 글 ('+myPosts.length+')</div>'
 +(myPosts.length===0?'<div style="text-align:center;padding:24px;color:var(--text3);">작성한 글이 없어요</div>'
 :myPosts.map(p=>{
 const date=p.createdAt?new Date(p.createdAt.toDate()).toLocaleDateString('ko-KR'):'';
 return '<div class="pitem" onclick="switchTab(\'community\');setTimeout(()=>viewPost(\''+p.id+'\'),100)">'
 +'<div class="pttl">'+escapeHtml(p.title)+'</div>'
 +'<div class="pmeta"><span>'+date+'</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+(p.views||0)+'</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'+(p.commentCount||0)+'</span></div></div>';
 }).join(''))
 +'<div style="font-size:15px;font-weight:700;margin:20px 0 12px;">알림</div>'
 +'<div id="notifList"><div style="text-align:center;padding:24px;color:var(--text3);">불러오는 중...</div></div>'
 +'<div style="margin-top:28px;"><div style="font-size:15px;font-weight:700;margin-bottom:12px;">결제 내역 / 환불</div><div id="orderHistoryList"><div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div></div></div>'
 +'<div style="margin-top:28px;"><div style="font-size:15px;font-weight:700;margin-bottom:12px;">크레딧 사용 내역</div><div id="creditHistoryList"><div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div></div></div>'
 +(window.isAdmin() ? '<div style="margin-top:28px;padding:20px;background:rgba(217,48,37,.05);border:1px solid rgba(217,48,37,.2);border-radius:var(--r);"><div style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--red);">관리자 - 환불 요청 목록</div><div id="adminRefundList"><div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div></div></div>' : '')
 +(window.isAdmin() ? '<div style="margin-top:28px;padding:20px;background:rgba(217,48,37,.05);border:1px solid rgba(217,48,37,.2);border-radius:var(--r);"><div style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--red);">관리자 - 전체 사용자 내역</div><div id="adminCreditHistory"><div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div></div></div>' : '')
 +(window.isAdmin() ? '<div style="margin-top:28px;padding:20px;background:rgba(217,48,37,.05);border:1px solid rgba(217,48,37,.2);border-radius:var(--r);"><div style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--red);">관리자 - 쿠폰 발급</div><div style="display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:8px;align-items:end;"><label style="font-size:12px;color:var(--text2);">크레딧<input id="couponCredits" type="number" min="1" max="10000" value="100" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-family:var(--font);font-size:14px;box-sizing:border-box;"></label><label style="font-size:12px;color:var(--text2);">개수<input id="couponCount" type="number" min="1" max="400" value="30" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-family:var(--font);font-size:14px;box-sizing:border-box;"></label><label style="font-size:12px;color:var(--text2);">만료일 (선택)<input id="couponExpires" type="date" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-family:var(--font);font-size:14px;box-sizing:border-box;"></label><button onclick="adminCreateCoupons()" style="padding:9px 16px;border-radius:8px;border:none;background:var(--red);color:#fff;font-weight:600;cursor:pointer;font-size:13px;height:38px;">발급</button></div><div id="couponCreateMsg" style="margin-top:10px;font-size:13px;min-height:18px;"></div><div id="couponCreateResult" style="margin-top:8px;"></div></div>' : '')
 +(window.isAdmin() ? '<div style="margin-top:28px;padding:20px;background:rgba(217,48,37,.05);border:1px solid rgba(217,48,37,.2);border-radius:var(--r);"><div style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--red);">관리자 - 쿠폰 발급 이력</div><div id="couponBatchList"><div style="text-align:center;padding:20px;color:var(--text3);">불러오는 중...</div></div></div>' : '')
 +'</div>';
 await loadNotifications();
 await window.loadOrderHistory();
 await window.loadCreditHistory();
 window.renderSubManage(u);
 if (window.isAdmin()) { await window.loadAdminRefundList(); await window.loadAllCreditHistory(); await window.loadCouponBatches(); }
 } catch(e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">불러오기 실패: '+e.message+'</div>'; }
};

// 마이페이지 정기결제 관리 카드 렌더
window.renderSubManage = function(u) {
  const el = document.getElementById('subManageCard');
  if (!el) return;
  const sub = u.subscription;
  const coupon = u.coupon;
  if (!sub) {
    el.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
      +'<div><div style="font-size:15px;font-weight:700;">정기 구독</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:2px;">아직 구독 중이 아닙니다.</div></div>'
      +'<button onclick="switchTab(\'pricing\');setTimeout(()=>{if(window.switchPricingTab)window.switchPricingTab(\'sub\');const s=document.getElementById(\'subscriptionSection\');if(s)s.scrollIntoView({behavior:\'smooth\'});},100);" '
      +'style="padding:8px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#815df2,#5587f8);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">구독 시작하기</button>'
      +'</div></div>';
    return;
  }
  const tierLabels = { '1000':'베이직(1,000자 × 50회/월)', '5000':'스탠다드(5,000자 × 50회/월)', '10000':'프로(10,000자 × 50회/월)', 'unlimited':'무제한' };
  const tierPrices = { '1000':11900, '5000':54900, '10000':99000, 'unlimited':290000 };
  const nextMs = sub.nextBillingAt?.toMillis ? sub.nextBillingAt.toMillis() : (sub.nextBillingAt?._seconds ? sub.nextBillingAt._seconds*1000 : 0);
  const nextDate = nextMs ? new Date(nextMs).toLocaleDateString('ko-KR') : '—';
  const statusLabel = ({ active:'정상 이용 중', cancelled:'해지 예정', expired:'만료', past_due:'결제 실패(중단)' })[sub.status] || sub.status;
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
  } else if (sub.status === 'cancelled' && nextMs > Date.now()) {
    actionBtn = '<button onclick="resumeSubscription()" style="padding:8px 14px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:13px;cursor:pointer;">구독 재개</button>';
  } else if (sub.status === 'past_due') {
    actionBtn = '<button onclick="retrySubscription(\''+sub.tier+'\')" style="padding:8px 14px;border-radius:8px;border:none;background:var(--red);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">결제수단 다시 등록</button>';
    pastDueBanner = '<div style="background:rgba(217,48,37,.08);border:1px solid rgba(217,48,37,.3);border-radius:10px;padding:12px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="22" height="22" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      +'<div style="font-size:13px;color:var(--text);"><strong style="color:var(--red);">정기결제에 실패했어요.</strong> 카드 한도·만료 등을 확인하고 결제수단을 다시 등록해주세요. 등록 즉시 결제가 시도됩니다.</div>'
      +'</div>';
  } else {
    actionBtn = '<button onclick="switchTab(\'pricing\');setTimeout(()=>{if(window.switchPricingTab)window.switchPricingTab(\'sub\');const s=document.getElementById(\'subscriptionSection\');if(s)s.scrollIntoView({behavior:\'smooth\'});},100);" style="padding:8px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#815df2,#5587f8);color:#fff;font-size:13px;cursor:pointer;">다시 구독하기</button>';
  }

  el.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;">'
    + pastDueBanner
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
    +'<div style="font-size:15px;font-weight:700;">정기 구독 관리</div>'
    +actionBtn
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:13px;">'
    +'<div style="color:var(--text3);">상품</div><div style="color:var(--text);font-weight:600;">'+ (tierLabels[sub.tier] || sub.tier) +'</div>'
    +'<div style="color:var(--text3);">상태</div><div style="color:'+(sub.status==='past_due'?'var(--red)':'var(--text)')+';">'+ statusLabel +'</div>'
    +'<div style="color:var(--text3);">다음 결제일</div><div style="color:var(--text);">'+ nextDate +'</div>'
    +'<div style="color:var(--text3);">결제 금액</div><div style="color:var(--text);">'+ tierPrices[sub.tier].toLocaleString() +'원/월</div>'
    +'<div style="color:var(--text3);">결제 카드</div><div style="color:var(--text);">'+ cardLine +'</div>'
    +'<div style="color:var(--text3);">이번 사이클 쿠폰</div><div style="color:var(--text);">'+ couponLine +'</div>'
    +'</div></div>';
};

// past_due 상태에서 결제수단 다시 등록 → 같은 티어로 재구독
window.retrySubscription = async function(tier) {
  if (!window.SUBSCRIPTION_ENABLED) {
    alert('정기 구독은 현재 결제 시스템 검수 중입니다.\n검수 완료 즉시 안내드릴게요.');
    return;
  }
  if (!window.CU) return;
  const ok = window.gpConfirm
    ? await window.gpConfirm({ title: '카드를 다시 등록할까요?', message: '등록이 끝나면 즉시 결제가 시도됩니다.', confirmText: '등록하기' })
    : confirm('카드를 다시 등록하면 즉시 결제가 시도됩니다. 진행할까요?');
  if (!ok) return;
  await payTossSubscription(tier);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
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

window.resumeSubscription = async function() {
  if (!window.CU) return;
  try {
    const idToken = await window.CU.getIdToken();
    const res = await fetch(window.apiUrl('/subscription/resume'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (data.ok) {
      alert(data.message || '구독이 재개되었습니다.');
      if (window.SUB) window.SUB.status = 'active';
      await window.loadMyPage();
    } else {
      alert(data.error || '재개 실패');
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

function notifDocId(n) {
 return String((n && (n.clientId || n.id)) || Date.now())
  .replace(/[^\w.-]/g, '_')
  .slice(0, 120);
}

window.persistUserNotification = async (n) =>{
 if (!CU || !n) return;
 try {
  const cleanAction = n.action ? JSON.parse(JSON.stringify(n.action)) : null;
  await setDoc(doc(db,'users',CU.uid,'notifications',notifDocId(n)), {
   clientId: n.clientId || n.id || null,
   type: n.type || 'notice',
   title: n.title || '알림',
   message: n.message || '',
   action: cleanAction,
   postId: n.postId || null,
   read: !!n.read,
   createdAt: serverTimestamp(),
   createdAtMs: n.createdAt || Date.now()
  }, { merge: true });
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
 el.innerHTML = items.map(n=>{
 const date=n.createdAt?new Date(n.createdAt).toLocaleDateString('ko-KR'):'';
 const borderColor = n.read ? 'var(--border)' : 'var(--blue)';
 const fontWeight = n.read ? '400' : '600';
 const action = n.postId
  ? "switchTab('community');setTimeout(()=>viewPost('"+jsAttr(n.postId)+"'),100)"
  : (n.action && n.action.tab ? "switchTab('"+jsAttr(n.action.tab)+"')" : "");
 return '<div style="background:var(--surface);border:1px solid '+borderColor+';border-radius:var(--rs);padding:14px;margin-bottom:8px;cursor:pointer;" onclick="markRead(\''+jsAttr(n.id)+'\');'+action+'">'
 +'<div style="font-size:13px;font-weight:'+fontWeight+';">'+escapeHtml(n.message)+'</div>'
 +'<div style="font-size:12px;color:var(--text3);margin-top:4px;">'+date+'</div></div>';
 }).join('');
 } catch(e) {
  if (el) el.innerHTML='<div style="color:var(--red)">불러오기 실패</div>';
 }
};

window.markRead = async (notifId) =>{
 if (!CU || !notifId) return;
 await updateDoc(doc(db,'users',CU.uid,'notifications',notifId),{read:true});
 if (typeof window.loadNotifications === 'function') await window.loadNotifications();
};

window.sendNotification = async (postId, postAuthorId, commenterName, postTitle) =>{
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
 const authorSnap = await getDoc(doc(db,'users',postAuthorId));
 if (authorSnap.exists()) {
 const ad = authorSnap.data();
 await window.sendEmailNotification(
 ad.email, ad.name, commenterName,
 postTitle || '게시글',
 commenterName + '님이 댓글을 달았어요. 확인해보세요!'
 );
 }
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

window.sendEmailNotification = async (toEmail, toName, fromName, postTitle, message) =>{
 try {
 await window.emailjs.send('gpkorea', 'gpkorea', {
 to_email: toEmail,
 to_name: toName,
 from_name: fromName,
 post_title: postTitle,
 message: message
 });
 } catch(e) { console.log('이메일 발송 실패:', e); }
};

window.toggleLike = async (postId) =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
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
 const f = document.getElementById('replyForm_' + commentId);
 if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.submitReply = async (postId, commentId, parentAuthorName) =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
 const bodyEl = document.getElementById('reply_' + commentId);
 const body = bodyEl ? bodyEl.value.trim() : '';
 if (!body) { alert('답글을 입력해주세요.'); return; }
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
window.saveHistory = async (type, inputText, detectResult, humanResult, credits) =>{
 if (!CU) return;
 try {
 const data = {
 type: type || 'unknown',
 inputText: inputText || '',
 credits: typeof credits === 'number' ? credits : 0,
 createdAt: serverTimestamp()
 };
 if (detectResult) {
 data.probability = typeof detectResult.probability === 'number' ? detectResult.probability : null;
 data.summary = detectResult.summary || '';
 data.detail = detectResult.detail || '';
 }
 if (humanResult) {
 data.outputText = humanResult.outputText || '';
 data.humanSummary = humanResult.summary || '';
 data.humanDetail = humanResult.detail || '';
 }
 await addDoc(collection(db,'users',CU.uid,'history'), data);
 } catch(e) { console.error('[saveHistory] 실패', { code: e?.code, message: e?.message, name: e?.name }); }
};

window.loadHistory = async () =>{
 const el = document.getElementById('historyList');
 if (!el) return;
 if (!CU) {
  el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text3);font-size:14px;">로그인 후 이용할 수 있어요.</div>';
  return;
 }
 el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">불러오는 중...</div>';
 try {
 const snap = await getDocs(query(
 collection(db,'users',CU.uid,'history'),
 orderBy('createdAt','desc')
 ));
 if (snap.empty) {
 el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">분석 기록이 없어요</div>';
 return;
 }
 const items = snap.docs.slice(0, 50);
 el.innerHTML = items.map(d =>{
 const h = d.data();
 const date = h.createdAt ? new Date(h.createdAt.toDate()).toLocaleString('ko-KR') : '';
 const isDetect = h.type === 'detect';
 const preview = h.inputText ? h.inputText.substring(0, 60) + (h.inputText.length >60 ? '...' : '') : '';

 // 탐지 결과 배지
 let resultBadge = '';
 if (isDetect) {
 const p = h.probability;
 let badgeColor, badgeLabel;
 if (p <= 20) { badgeColor = 'var(--green)'; badgeLabel = ' 안전'; }
 else if (p <= 49) { badgeColor = 'var(--yellow)'; badgeLabel = ' 조심'; }
 else { badgeColor = 'var(--red)'; badgeLabel = ' 위험'; }
 resultBadge = `<span style="padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600;background:rgba(26,115,232,.1);color:var(--blue)">AI 감지</span>
 ${p !== undefined ? `<span style="padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600;color:${badgeColor}">${badgeLabel} · ${p}%</span>` : ''}`;
 } else {
 resultBadge = `<span style="padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600;background:rgba(30,142,62,.1);color:var(--green)">휴머나이저</span>`;
 }

 // 상세 내용 (탐지: summary+detail / 휴머나이저: outputText+humanSummary)
 let detailHtml = '';
 if (isDetect) {
 detailHtml = `
 ${h.summary ? `<div style="margin-top:12px;">
 <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:4px;">요약</div>
 <div style="font-size:14px;color:var(--text2);background:var(--surface2);padding:10px 12px;border-radius:var(--rs);line-height:1.7;">${h.summary}</div>
</div>` : ''}
 ${h.detail ? `<div style="margin-top:10px;">
 <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:4px;">상세 분석</div>
 <div style="font-size:13px;color:var(--text2);background:var(--surface2);padding:10px 12px;border-radius:var(--rs);line-height:1.7;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-all;">${h.detail}</div>
</div>` : ''}`;
 } else {
 detailHtml = `
 ${h.outputText ? `<div style="margin-top:12px;">
 <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:4px;">변환 결과</div>
 <div style="font-size:14px;color:var(--text);background:var(--surface2);padding:10px 12px;border-radius:var(--rs);line-height:1.8;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-all;">${h.outputText}</div>
</div>` : ''}
 ${h.humanSummary ? `<div style="margin-top:10px;">
 <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:4px;">변환 요약</div>
 <div style="font-size:13px;color:var(--text2);background:var(--surface2);padding:10px 12px;border-radius:var(--rs);line-height:1.7;">${h.humanSummary}</div>
</div>` : ''}`;
 }

 return `<div class="history-item" onclick="openHistory(this)">
 <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
 <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${resultBadge}</div>
 <span style="font-size:12px;color:var(--text3);">${date} · ${h.credits}크레딧</span>
</div>
 <div class="history-preview" style="margin-top:8px;font-size:14px;color:var(--text2);">${preview}</div>
 <div class="history-detail" style="display:none;margin-top:12px;">
 <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
 <button onclick="closeHistory(event,this)" style="padding:5px 14px;border-radius:50px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-family:var(--font);font-size:12px;cursor:pointer;">닫기</button>
</div>
 <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:6px;">입력 텍스트</div>
 <div style="font-size:14px;color:var(--text);background:var(--surface2);padding:12px;border-radius:var(--rs);line-height:1.7;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-all;">${h.inputText || ''}</div>
 ${detailHtml}
</div>
</div>`;
 }).join('');
 } catch(e) {
 el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--red)">불러오기 실패</div>';
 }
};

window.openHistory = (el) =>{
 const detail = el.querySelector('.history-detail');
 if (detail && detail.style.display === 'none') detail.style.display = 'block';
};

window.closeHistory = (event, btn) =>{
 event.stopPropagation();
 const detail = btn.closest('.history-detail');
 if (detail) detail.style.display = 'none';
};

// --- 환불 시스템 UI ---

// 사용자: 결제 내역 + 환불 요청 버튼
// 정기결제 티어 표시명
const SUB_TIER_LABELS = { '1000':'베이직(1,000자×50회/월)', '5000':'스탠다드(5,000자×50회/월)', '10000':'프로(10,000자×50회/월)', 'unlimited':'무제한' };

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
 const statusMap = { paid:'결제 완료', refund_requested:'환불 심사중', refunded:'환불 완료', refund_rejected:'환불 거절', failed:'결제 실패' };
 el.innerHTML = all.slice(0,30).map(item =>{
 const o = item.data;
 const ts = o.createdAt?.toMillis?.() || o.approvedAt?.toMillis?.() || o.requestedAt?.toMillis?.() || 0;
 const date = ts ? new Date(ts).toLocaleString('ko-KR') : '';
 const statusTxt = statusMap[o.status] || o.status || '결제 완료';
 const statusColor = o.status === 'refunded' ? 'var(--yellow)' : o.status === 'refund_requested' ? 'var(--blue)' : (o.status === 'refund_rejected' || o.status === 'failed') ? 'var(--red)' : 'var(--green)';
 const title = item.kind === 'sub'
   ? `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`
   : `크레딧 충전 · ${o.safeCredits||0}크레딧`;
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
 }).join('');
 } catch(e) {
 console.log('결제 내역 로드 실패:', e);
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">결제 내역이 없어요</div>';
 }
};

// 환불하기 모달 열기
window.showRefundModal = async () =>{
 if (!CU) { alert('로그인이 필요합니다.'); return; }
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
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const currentCredits = window.UC || 0;
  const coupon = window.COUPON || null;
  el.innerHTML = refundable.map(item => {
  const o = item.data;
 const ts = o.createdAt?.toMillis?.() || o.approvedAt?.toMillis?.() || 0;
 const date = ts ? new Date(ts).toLocaleString('ko-KR') : '';
 const isSub = item.kind === 'sub';
 const title = isSub
   ? `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`
   : `크레딧 충전 · ${o.safeCredits||0}크레딧`;
  // 정기결제: 7일 이내 + 미사용 시에만 환불 가능 (서버에서 최종 검증)
  let eligibilityNote = '';
  let refundPreview = '';
  let canRequest = true;
  if (isSub) {
    const within7 = ts && (Date.now() - ts) <= SEVEN_DAYS;
    if (!within7) { canRequest = false; eligibilityNote = '결제일로부터 7일이 지나 환불할 수 없습니다.'; }
    else {
      const used = coupon && coupon.tier === o.tier ? Math.max(0, (coupon.granted || 0) - (coupon.remaining || 0)) : 0;
      eligibilityNote = used > 0
        ? `이번 사이클 쿠폰 ${used}회 사용으로 서버 검증 후 환불이 제한될 수 있습니다.`
        : '결제일 7일 이내 + 이번 사이클 쿠폰 미사용 시 전액 환불';
      refundPreview = used > 0
        ? '예상 환불액: 서버 검증 후 확정'
        : `예상 환불액: ${(o.amount || 0).toLocaleString()}원`;
    }
  } else {
    const safe = parseInt(o.safeCredits) || 0;
    const amt = parseInt(o.amount) || 0;
    const refundableCredits = Math.min(currentCredits, safe);
    const usedCredits = Math.max(0, safe - refundableCredits);
    const refundAmt = safe > 0 ? Math.floor(amt * refundableCredits / safe) : 0;
    eligibilityNote = usedCredits > 0
      ? `사용한 ${usedCredits}크레딧은 환불액에서 제외됩니다.`
      : '현재 기준 미사용 결제 크레딧 전액 환불 예상';
    refundPreview = `예상 환불액: ${refundAmt.toLocaleString()}원 · 환불 대상 ${refundableCredits.toLocaleString()}크레딧`;
    if (refundableCredits <= 0) canRequest = false;
  }
  return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
  <div style="flex:1;min-width:0;">
  <div style="font-weight:600;font-size:14px;color:var(--text);">${(o.amount||0).toLocaleString()}원 · ${title}</div>
  <div style="color:var(--text3);font-size:12px;margin-top:4px;">${date}</div>
  ${refundPreview ? `<div style="color:var(--text);font-size:12px;font-weight:700;margin-top:7px;">${refundPreview}</div>` : ''}
  ${eligibilityNote ? `<div style="color:${canRequest?'var(--text3)':'var(--red)'};font-size:11px;margin-top:4px;">${eligibilityNote}</div>` : ''}
  </div>
 <button ${canRequest ? '' : 'disabled'} onclick="window.requestRefund('${item.id}','${item.kind}')" style="padding:6px 14px;border-radius:6px;border:1px solid var(--red);background:none;color:${canRequest?'var(--red)':'var(--text3)'};font-size:12px;font-weight:600;cursor:${canRequest?'pointer':'not-allowed'};white-space:nowrap;opacity:${canRequest?'1':'.5'};">환불 요청</button>
 </div>
</div>`;
 }).join('');
 } catch(e) {
 console.log('환불 목록 로드 실패:', e);
 el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">환불 가능한 결제 내역이 없습니다.</div>';
 }
};

// 사용자: 환불 요청 (크레딧/정기결제 분기)
window.requestRefund = async (orderId, kind) =>{
 kind = kind || 'credit';
 const reason = window.gpPrompt
  ? await window.gpPrompt({ title: '환불 사유', message: '처리 기준 확인을 위해 사유를 남겨주세요.', placeholder: '예: 결과를 받지 못했어요 / 크레딧이 중복 차감됐어요', confirmText: '환불 요청', required: true })
  : prompt('환불 사유를 입력해주세요:');
 if (!reason || reason.trim().length < 2) { alert('환불 사유를 2자 이상 입력해주세요.'); return; }
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/request-refund'), {
 method:'POST', headers:{'Content-Type':'application/json'},
 body: JSON.stringify({ orderId, idToken, cancelReason: reason.trim(), kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) {
  if (window.gpNotify) window.gpNotify({ clientId: 'refund_requested_' + orderId, type: 'refund', title: '환불 요청 접수', message: '환불 요청이 접수됐어요. 처리 결과는 알림으로 확인할 수 있습니다.', action: { tab: 'mypage' } }, { persist: true });
  else alert('환불 요청이 접수되었습니다.');
  await window.loadOrderHistory(); await window.loadRefundModalList();
 }
 else alert(data.error || '환불 요청 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
};

// 관리자: 환불 요청 목록 (크레딧 + 정기결제 통합)
window.loadAdminRefundList = async () =>{
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminRefundList');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">불러오는 중...</div>';
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
 if (items.length === 0) {
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">환불 요청이 없습니다</div>';
 return;
 }
 let html = '';
 for (const item of items) {
 const o = item.data;
 const date = o.refundRequestedAt ? new Date(o.refundRequestedAt.toDate()).toLocaleString('ko-KR') : '';
 let userEmail = o.uid;
 let userCredits = 0;
 try {
   const uSnap = await getDoc(doc(db,'users',o.uid));
   if(uSnap.exists()) {
     userEmail = uSnap.data().email || o.uid;
     userCredits = uSnap.data().credits || 0;
   }
 } catch(e){}
 let itemLabel, refundDetail;
 if (item.kind === 'subscription') {
   itemLabel = `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`;
   refundDetail = `<div style="color:var(--text2);font-size:12px;margin-top:6px;">환불 예정 금액: <b style="color:var(--red);">${(o.amount||0).toLocaleString()}원</b> (전액)</div>`;
 } else {
   // 무료 보너스(회원가입/추천)는 결제 크레딧보다 먼저 소진된다고 가정 → 잔액은 모두 결제분으로 취급
   const safe = parseInt(o.safeCredits) || 0;
   const amt = parseInt(o.amount) || 0;
   const refundable = Math.min(userCredits, safe);
   const usedFromOrder = Math.max(0, safe - refundable);
   const refundAmt = safe > 0 ? Math.floor(amt * refundable / safe) : 0;
   itemLabel = `크레딧 · ${safe}크레딧 결제`;
   refundDetail = `<div style="color:var(--text2);font-size:12px;margin-top:6px;line-height:1.6;">사용한 크레딧: <b>${usedFromOrder}크레딧</b> · 현재 잔액 ${userCredits}크레딧<br>환불 예정 금액: <b style="color:var(--red);">${refundAmt.toLocaleString()}원</b> · 차감 크레딧: <b>${refundable}크레딧</b></div>`;
 }
 html += `<div style="padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;">
 <div style="display:flex;justify-content:space-between;align-items:center;">
 <div>
 <div style="font-weight:600;">${escapeHtml(userEmail)} <span style="font-size:11px;color:var(--text3);font-weight:500;">[${item.kind === 'subscription' ? '구독' : '크레딧'}]</span></div>
 <div style="color:var(--text3);font-size:12px;">${(o.amount||0).toLocaleString()}원 결제 · ${itemLabel} · ${date}</div>
 </div>
 <div style="display:flex;gap:6px;flex-shrink:0;">
 <button onclick="window.approveRefund('${item.id}','${item.kind}')" style="padding:6px 14px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">승인</button>
 <button onclick="window.rejectRefund('${item.id}','${item.kind}')" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;">거절</button>
 </div>
 </div>
 ${refundDetail}
 <div style="color:var(--text2);font-size:12px;margin-top:6px;word-break:break-all;">사유: ${escapeHtml(o.cancelReason || '없음')}</div>
</div>`;
 }
 el.innerHTML = html;
 } catch(e) {
 console.log('환불 목록 로드 실패:', e);
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">환불 요청이 없습니다</div>';
 }
};

// 관리자: 환불 승인
window.approveRefund = async (orderId, kind) =>{
 kind = kind || 'order';
 const ok = window.gpConfirm
  ? await window.gpConfirm({ title: '환불을 승인할까요?', message: '승인하면 토스에서 실제 환불이 진행됩니다.', confirmText: '승인하기', danger: true })
  : confirm('이 환불을 승인하시겠습니까? 토스에서 실제 환불이 진행됩니다.');
 if (!ok) return;
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/approve-refund'), {
 method:'POST', headers:{'Content-Type':'application/json'},
 body: JSON.stringify({ orderId, idToken, kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) { alert('환불이 완료되었습니다.'); await window.loadAdminRefundList(); await window.loadOrderHistory(); }
 else alert(data.error || '환불 승인 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
};

// 관리자: 환불 거절
window.rejectRefund = async (orderId, kind) =>{
 kind = kind || 'order';
 const reason = window.gpPrompt
  ? await window.gpPrompt({ title: '환불 거절 사유', message: '사용자에게 안내할 사유를 입력해주세요.', placeholder: '거절 사유', confirmText: '거절 처리', required: true })
  : prompt('거절 사유를 입력해주세요:');
 if (!reason || reason.trim().length < 2) { alert('거절 사유를 2자 이상 입력해주세요.'); return; }
 try {
 const idToken = await CU.getIdToken();
 const res = await fetch(window.apiUrl('/reject-refund'), {
 method:'POST', headers:{'Content-Type':'application/json'},
 body: JSON.stringify({ orderId, idToken, rejectReason: reason.trim(), kind })
 });
 const data = await res.json();
 if (res.ok && data.ok) { alert('환불 요청이 거절되었습니다.'); await window.loadAdminRefundList(); await window.loadOrderHistory(); }
 else alert(data.error || '환불 거절 실패');
 } catch(e) { alert('네트워크 오류: ' + e.message); }
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
 const typeTxt = isCharge ? '충전' : isRefund ? '환불' : isReferral ? '친구 추천' : isCoupon ? '쿠폰' : h.type === 'detect' ? ' AI 감지' : h.type === 'humanize' ? ' 휴머나이저' : '기타';
 const amountTxt = isCharge || isReferral || isCoupon
 ? `<div style="color:var(--green);font-weight:600;">+${h.amount} 크레딧</div>`
 : isRefund
 ? `<div style="color:var(--yellow);font-weight:600;">${h.amount} 크레딧 (환불)</div>`
 : `<div style="color:var(--red);font-weight:600;">-${h.used} 크레딧</div>`;
 return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
 <div>
 <div style="font-weight:600;color:var(--text);">${typeTxt}</div>
 <div style="color:var(--text3);font-size:12px;margin-top:2px;">${date}</div>
</div>
 <div style="text-align:right;">
 ${amountTxt}
 <div style="color:var(--text3);font-size:12px;">잔여 ${h.remaining} 크레딧</div>
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
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red)">불러오기 실패</div>';
 }
};

window._adminHistory = { data: [], page: 0, pageSize: 10, filtered: [] };

window.loadAllCreditHistory = async () =>{
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminCreditHistory');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">불러오는 중...</div>';
 try {
 const snap = await getDocs(query(
 collectionGroup(db, 'creditHistory'),
 orderBy('createdAt', 'desc'),
 limit(1000)
 ));

 // uid 목록 추출 후 유저 정보 병렬 조회
 const uidSet = new Set();
 snap.docs.forEach(d => uidSet.add(d.ref.parent.parent.id));
 const uidCache = {};
 await Promise.all([...uidSet].map(async uid => {
 try {
 const uSnap = await getDoc(doc(db, 'users', uid));
 uidCache[uid] = uSnap.exists() ? uSnap.data() : {};
 } catch(e) { uidCache[uid] = {}; }
 }));

 const allHistory = snap.docs.map(d => {
 const uid = d.ref.parent.parent.id;
 return {
 ...d.data(),
 userName: uidCache[uid].name || '알 수 없음',
 userEmail: uidCache[uid].email || '',
 uid
 };
 });

 // 일별 크레딧 요약용 별도 쿼리 (최근 7일, limit 없이 DB 전체 조회)
 const sevenDaysAgo = new Date();
 sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
 sevenDaysAgo.setHours(0, 0, 0, 0);
 const dailySnap = await getDocs(query(
  collectionGroup(db, 'creditHistory'),
  where('createdAt', '>=', sevenDaysAgo),
  orderBy('createdAt', 'desc')
 ));
 const dailyUsed = {};
 dailySnap.docs.forEach(d => {
  const h = d.data();
  if (!h.createdAt) return;
  if (h.type === 'charge' || h.type === 'refund') return;
  const day = new Date(h.createdAt.toDate()).toLocaleDateString('ko-KR');
  if (!dailyUsed[day]) dailyUsed[day] = 0;
  dailyUsed[day] += (h.used || 0);
 });
 window._adminHistory.dailyUsed = dailyUsed;

 window._adminHistory.data = allHistory;
 window._adminHistory.filtered = allHistory;
 window._adminHistory.page = 0;
 window.renderAdminHistory();
 } catch(e) {
 console.log('전체 사용자 내역 로드 실패:', e);
 el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)">불러오기 실패: ${e.message}</div>`;
 }
};

window.filterAdminHistory = async () => {
 const from = document.getElementById('adminDateFrom').value;
 const to = document.getElementById('adminDateTo').value;
 const email = (document.getElementById('adminEmailFilter')?.value || '').trim().toLowerCase();
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
  let filtered = histSnap.docs.map(d => ({ ...d.data(), userName, userEmail: email, uid }));
  if (from) filtered = filtered.filter(h => h.createdAt && new Date(h.createdAt.toDate()) >= new Date(from));
  if (to) filtered = filtered.filter(h => h.createdAt && new Date(h.createdAt.toDate()) <= new Date(to + 'T23:59:59'));
  window._adminHistory.filtered = filtered;
  window._adminHistory.page = 0;
  window.renderAdminHistory();
  return;
 }

 // 이메일 없으면 기존 로직 (전체 1000건에서 날짜 필터)
 let filtered = window._adminHistory.data;
 if (from) filtered = filtered.filter(h => h.createdAt && new Date(h.createdAt.toDate()) >= new Date(from));
 if (to) filtered = filtered.filter(h => h.createdAt && new Date(h.createdAt.toDate()) <= new Date(to + 'T23:59:59'));
 window._adminHistory.filtered = filtered;
 window._adminHistory.page = 0;
 window.renderAdminHistory();
};

window.renderAdminHistory = () =>{
 const el = document.getElementById('adminCreditHistory');
 if (!el) return;
 const { filtered, page, pageSize, dateFrom, dateTo, emailFilter } = window._adminHistory;
 const total = filtered.length;
 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const start = page * pageSize;
 const items = filtered.slice(start, start + pageSize);

 // DB에서 조회한 일별 크레딧 사용 총합 표시
 const dailyUsed = window._adminHistory.dailyUsed || {};
 const dailySummary = Object.entries(dailyUsed).slice(0, 7).map(([day, used]) =>
 `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span>${day}</span><span style="font-weight:600;color:var(--red);">-${used} 크레딧 사용</span></div>`
 ).join('');

 let html = `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
 <input type="date" id="adminDateFrom" value="${dateFrom||''}" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);font-size:13px;" onchange="window.filterAdminHistory()">
 <span style="color:var(--text3);">~</span>
 <input type="date" id="adminDateTo" value="${dateTo||''}" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);font-size:13px;" onchange="window.filterAdminHistory()">
 <span style="font-size:12px;color:var(--text3);">총 ${total}건</span>
</div>
<div style="margin-bottom:12px;">
 <input type="text" id="adminEmailFilter" value="${emailFilter||''}" placeholder="이메일로 검색" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);font-size:13px;font-family:var(--font);box-sizing:border-box;" oninput="window.filterAdminHistory()">
</div>`;

 if (dailySummary) {
 html += `<div style="margin-bottom:14px;padding:12px;background:var(--surface2);border-radius:var(--rs);border:1px solid var(--border);">
 <div style="font-size:13px;font-weight:700;margin-bottom:6px;">일별 크레딧 변동</div>
 ${dailySummary}
</div>`;
 }

 if (total === 0) {
 el.innerHTML = html + '<div style="text-align:center;padding:20px;color:var(--text3)">해당 기간 내역이 없어요</div>';
 return;
 }

 html += `<table style="width:100%;border-collapse:collapse;font-size:13px;">
 <thead><tr style="border-bottom:2px solid var(--border);color:var(--text3);">
 <th style="padding:8px;text-align:left;">날짜</th>
 <th style="padding:8px;text-align:left;">유저</th>
 <th style="padding:8px;text-align:left;">종류</th>
 <th style="padding:8px;text-align:right;">사용</th>
 <th style="padding:8px;text-align:right;">잔여</th>
</tr></thead><tbody>`
 + items.map(h =>{
 const date = h.createdAt ? new Date(h.createdAt.toDate()).toLocaleString('ko-KR') : '';
 const typeTxt = h.type === 'charge' ? '충전' : h.type === 'refund' ? '환불' : h.type === 'referral' ? '친구 추천' : h.type === 'coupon_redeem' ? '쿠폰' : h.type === 'detect' ? '탐지' : h.type === 'humanize' ? '휴머나이저' : '기타';
 const amountTxt = (h.type === 'charge' || h.type === 'referral' || h.type === 'coupon_redeem') ? `<span style="color:var(--green);">+${h.amount}</span>`
 : h.type === 'refund' ? `<span style="color:var(--yellow);">${h.amount}</span>`
 : `<span style="color:var(--red);">-${h.used}</span>`;
 return `<tr style="border-bottom:1px solid var(--border);">
 <td style="padding:8px;color:var(--text3);font-size:12px;">${date}</td>
 <td style="padding:8px;">${escapeHtml(h.userName)}<br><span style="font-size:11px;color:var(--text3);">${escapeHtml(h.userEmail)}</span></td>
 <td style="padding:8px;">${typeTxt}</td>
 <td style="padding:8px;text-align:right;font-weight:600;">${amountTxt}</td>
 <td style="padding:8px;text-align:right;color:var(--text3);">${h.remaining}</td>
</tr>`;
 }).join('')
 + `</tbody></table>
 <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;">
 <button onclick="window._adminHistory.page=Math.max(0,window._adminHistory.page-1);window.renderAdminHistory()" style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface2);color:var(--text);cursor:pointer;font-family:var(--font);" ${page===0?'disabled':''}>◀ 이전</button>
 <span style="font-size:13px;color:var(--text3);">${page+1} / ${totalPages}</span>
 <button onclick="window._adminHistory.page=Math.min(${totalPages-1},window._adminHistory.page+1);window.renderAdminHistory()" style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface2);color:var(--text);cursor:pointer;font-family:var(--font);" ${page>=totalPages-1?'disabled':''}>다음 ▶</button>
</div>`;

 el.innerHTML = html;
};

window.backToList = () =>{
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
      const preview = (h.inputText || '내용 없음').replace(/\s+/g,' ').trim().slice(0, 18);
      return `<button class="sidebar-hist-item" onclick="switchTab('history');loadHistory()">
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
          ${badge}
          <span class="sidebar-hist-text">${preview}</span>
        </div>
      </button>`;
    }).join('');
  } catch(e) {}
};

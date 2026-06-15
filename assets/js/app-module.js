import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, EmailAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, orderBy, query, where, limit, serverTimestamp, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
 // 저장 실패로 localStorage에 백업된 기록이 있으면 로그인·데이터 로드 후 자동 재시도.
 setTimeout(() => { if (typeof window.flushPendingHistory === 'function') window.flushPendingHistory(); }, 1200);
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
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
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
    ? '<button class="gp-admin-mini-btn danger" onclick="voidBatch(\'' + escapeHtml(b.batchId) + '\',' + b.unusedCount + ')">배치 무효화</button>'
    : '<button class="gp-admin-mini-btn" onclick="deleteBatch(\'' + escapeHtml(b.batchId) + '\')">기록 지우기</button>';
   html += '<tr>'
    + '<td class="muted">' + escapeHtml(fmtDate(b.createdAt)) + '</td>'
    + '<td>' + escapeHtml(adminLabel(b.adminUid)) + '</td>'
    + '<td class="num" style="font-weight:700;">' + b.credits + '</td>'
    + '<td class="num">' + b.count + '</td>'
    + '<td class="num">' + b.redeemedCount + '</td>'
    + '<td class="num muted">' + b.voidedCount + '</td>'
    + '<td class="num gp-admin-pos">' + b.unusedCount + '</td>'
    + '<td class="muted edit" onclick="updateBatchExpiry(\'' + escapeHtml(b.batchId) + '\',' + (b.expiresAt !== null && b.expiresAt !== undefined ? b.expiresAt : 'null') + ')" title="클릭해서 만료일 변경">' + escapeHtml(fmtDateShort(b.expiresAt)) + ' ✎</td>'
    + '<td style="white-space:nowrap;">'
    + '<button class="gp-admin-mini-btn" style="margin-right:4px;" onclick="showBatchDetail(\'' + escapeHtml(b.batchId) + '\')">상세</button>'
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
 +(window.isAdmin() ? '<div class="gp-mypage-admin-entry"><div><div class="gp-mypage-admin-title">관리자 페이지</div><div class="gp-mypage-admin-sub">환불, 크레딧, 쿠폰, 사용자 원장을 별도 화면에서 처리합니다.</div></div><button type="button" onclick="openAdminPage()">관리자 페이지 열기</button></div>' : '')
 +'</div>';
 await loadNotifications();
 await window.loadOrderHistory();
 await window.loadCreditHistory();
 window.renderSubManage(u);
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
// 이용 기록 저장(2026-06-14 강화) — 실패를 조용히 삼키지 않고:
//   ① localStorage 백업(결과 유실 방지) ② 사용자에게 토스트 안내 ③ 다음 로드·온라인 복귀 시 자동 재시도.
//   (서버측 /analyze 저장과 별개의 클라 폴백 — 청크·구형서버·비과금 경로 대비.)
const PENDING_HISTORY_KEY = 'gp_pending_history';
function backupHistoryLocal(uid, data) {
 try {
  const q = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]');
  const { createdAt, ...rest } = data;   // serverTimestamp()는 직렬화 불가 → 제거(재시도 때 재생성)
  q.push({ uid, data: rest, ts: Date.now() });
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
   await addDoc(collection(db,'users',CU.uid,'history'), { ...item.data, createdAt: serverTimestamp(), backupAtMs: item.ts });
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
 try {
  await addDoc(collection(db,'users',CU.uid,'history'), data);
  return true;
 } catch(e) {
  console.error('[saveHistory] 실패', { code: e?.code, message: e?.message, name: e?.name });
  backupHistoryLocal(CU.uid, data);   // 결과 유실 방지 — 로컬 백업 후 자동 재시도
  if (window.gpToast) window.gpToast('결과를 기록에 저장하지 못했어요. 결과는 안전하게 백업해뒀고, 잠시 후 자동으로 다시 저장할게요.', { type: 'warning', title: '기록 저장 지연' });
  return false;
 }
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
 const statusMap = { paid:'결제 완료', refund_requested:'환불 심사중', partially_refunded:'부분 환불', refunded:'환불 완료', refund_rejected:'환불 거절', failed:'결제 실패' };
 el.innerHTML = all.slice(0,30).map(item =>{
 const o = item.data;
 const ts = o.createdAt?.toMillis?.() || o.approvedAt?.toMillis?.() || o.requestedAt?.toMillis?.() || 0;
 const date = ts ? new Date(ts).toLocaleString('ko-KR') : '';
 const statusTxt = statusMap[o.status] || o.status || '결제 완료';
 const statusColor = (o.status === 'refunded' || o.status === 'partially_refunded') ? 'var(--yellow)' : o.status === 'refund_requested' ? 'var(--blue)' : (o.status === 'refund_rejected' || o.status === 'failed') ? 'var(--red)' : 'var(--green)';
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
 const isSub = item.kind === 'subscription';
 let itemLabel, refundDetail;
 if (isSub) {
   itemLabel = `정기결제 · ${SUB_TIER_LABELS[o.tier] || o.tier}`;
   refundDetail = `<div class="gp-admin-refund-detail">환불 예정 금액 <b class="neg">${(o.amount||0).toLocaleString()}원</b> (전액)</div>`;
 } else {
   // 무료 보너스(회원가입/추천)는 결제 크레딧보다 먼저 소진된다고 가정 → 잔액은 모두 결제분으로 취급
   const safe = parseInt(o.safeCredits) || 0;
   const amt = parseInt(o.amount) || 0;
   const refundable = Math.min(userCredits, safe);
   const usedFromOrder = Math.max(0, safe - refundable);
   const refundAmt = safe > 0 ? Math.floor(amt * refundable / safe) : 0;
   itemLabel = `크레딧 · ${safe}크레딧 결제`;
   refundDetail = `<div class="gp-admin-refund-detail">사용 <b>${usedFromOrder}</b> · 현재 잔액 <b>${userCredits}</b>크레딧 · 환불 예정 <b class="neg">${refundAmt.toLocaleString()}원</b> · 차감 <b>${refundable}</b>크레딧</div>`;
 }
 html += `<div class="gp-admin-refund-item">
 <div class="gp-admin-refund-top">
 <div class="gp-admin-refund-who">
 <strong>${escapeHtml(userEmail)}<span class="gp-admin-refund-tag">${isSub ? '구독' : '크레딧'}</span></strong>
 <span>${(o.amount||0).toLocaleString()}원 · ${itemLabel} · ${date}</span>
 </div>
 <div class="gp-admin-refund-actions">
 <button class="gp-admin-btn-approve" onclick="window.approveRefund('${item.id}','${item.kind}')">승인</button>
 <button class="gp-admin-btn-reject" onclick="window.rejectRefund('${item.id}','${item.kind}')">거절</button>
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
  humanize: '휴머나이저',
  restructure: '고급 피하기(재구성)',
  admin_adjust: '관리자 조정'
 })[type] || '기타';
}

// 정확한 작업명: type + mode(+evidence/fallback)로 "다듬기 / 기본 피하기 / 고급 재구성 / 근거" 까지 구분.
// 차감 doc에 mode가 기록된 신규 건만 세분화되고, mode 없는 구 데이터는 기존 라벨로 폴백한다.
function adminHistoryLabel(h) {
 h = h || {};
 const type = h.type || '';
 if (type.endsWith('_restore')) {
  return adminHistoryTypeText(type.slice(0, -8)) + ' 복구';
 }
 if (type === 'humanize') {
  if (h.fallback) return '고급 피하기 → 보존형 폴백';
  switch (h.mode) {
   case 'blog': return '기본 피하기(블로그)';
   case 'polish':
   case 'assignment': return '다듬기(보존형)';
   case 'thesis': return '다듬기(논문)';
   case 'resume': return '다듬기(자소서)';
   default: return '휴머나이저';   // 구 데이터(모드 미기록)
  }
 }
 if (type === 'restructure') {
  return '고급 피하기(재구성)' + (h.evidence ? ' + 근거' : '');
 }
 return adminHistoryTypeText(type);
}

function adminHistoryAmountHtml(h) {
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

async function adminPost(path, body) {
 if (!window.CU || !window.isAdmin()) throw new Error('관리자 권한이 필요합니다.');
 const idToken = await window.CU.getIdToken();
 const res = await fetch(window.apiUrl(path), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...(body || {}), idToken })
 });
 let data = {};
 try { data = await res.json(); } catch (_) {}
 if (!res.ok || !data.ok) throw new Error(data.error || '요청 처리에 실패했습니다.');
 return data;
}

function adminSetMessage(id, text, type) {
 const el = document.getElementById(id);
 if (!el) return;
 el.textContent = text || '';
 el.style.color = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--text3)';
}

function adminRenderUserBundle(data) {
 const user = data.user || {};
 const resultEl = document.getElementById('adminUserResult');
 const uidEl = document.getElementById('adminSelectedUid');
 const ordersEl = document.getElementById('adminUserOrders');
 if (uidEl) uidEl.textContent = user.uid ? 'UID ' + user.uid.slice(0, 8) : '';
 if (!resultEl || !ordersEl) return;

 const sub = user.subscription || null;
 const coupon = user.coupon || null;
 const hist = data.creditHistory || [];
 const historyHtml = hist.length
  ? hist.slice(0, 6).map(h => `
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
  : '<div class="gp-admin-empty gp-admin-empty-compact">최근 크레딧 내역이 없습니다.</div>';

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
    </div>
    <div>
      <div class="gp-admin-ledger-head">최근 크레딧 내역</div>
      <div class="gp-admin-ledger">${historyHtml}</div>
    </div>
  </div>`;

 const orders = data.orders || [];
 if (!orders.length) {
  ordersEl.innerHTML = '<div class="gp-admin-empty gp-admin-empty-compact">결제건이 없습니다.</div>';
  return;
 }
 ordersEl.innerHTML = '<div class="gp-admin-order-list">' + orders.map((o, i) => {
  const isSub = o.kind === 'subscription';
  const title = isSub
   ? `정기결제 · ${escapeHtml(SUB_TIER_LABELS[o.tier] || o.tier || '-')}`
   : `크레딧 · ${adminNumber(o.safeCredits).toLocaleString('ko-KR')}크레딧`;
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
   actionBtn = `<button type="button" class="gp-admin-danger" onclick="adminDirectRefund(${i})">전액 환불</button>`;
  } else {
   actionBtn = `<button type="button" class="gp-admin-danger" onclick="adminToggleRefund(${i})">환불 ▾</button>`;
   panel = `
     <div class="gp-admin-refund-panel" id="refundPanel-${i}" hidden>
       <div class="gp-admin-refund-modes">
         <button type="button" class="gp-admin-mode is-active" data-mode="remaining" onclick="adminSetRefundMode(${i},'remaining')">남은건 환불</button>
         <button type="button" class="gp-admin-mode" data-mode="full" onclick="adminSetRefundMode(${i},'full')">전체 환불</button>
         <button type="button" class="gp-admin-mode" data-mode="custom" onclick="adminSetRefundMode(${i},'custom')">직접 입력</button>
       </div>
       <div class="gp-admin-refund-custom" id="refundCustom-${i}" hidden>
         <input type="number" class="gp-admin-input gp-admin-input-sm" id="refundAmt-${i}" min="1" max="${remainingMoney}" placeholder="환불 금액" oninput="adminRefundPreview(${i})">
         <span>원 · 최대 ${adminMoney(remainingMoney)}</span>
       </div>
       <input type="text" class="gp-admin-input gp-admin-input-sm" id="refundReason-${i}" maxlength="120" placeholder="환불 사유 (필수)">
       <div class="gp-admin-refund-preview" id="refundPreview-${i}"></div>
       <div class="gp-admin-refund-go">
         <button type="button" class="gp-admin-primary" onclick="adminDirectRefund(${i})">환불 진행</button>
         <button type="button" class="gp-admin-mini-btn" onclick="adminToggleRefund(${i})">닫기</button>
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
 }).join('') + '</div>';
}

// 결제건 환불 계산(백엔드 processRefund 미러, 누적 부분환불 반영) — {amount, credits} 또는 null
function adminComputeRefund(order, mode, customAmount) {
 const orderAmount = adminNumber(order.amount);
 const safe = adminNumber(order.safeCredits);
 const priorAmount = adminNumber(order.refundedAmount || order.refundAmount);
 const priorCredits = adminNumber(order.refundedCredits);
 const remainingMoney = Math.max(0, orderAmount - priorAmount);
 const remainingOrderCredits = Math.max(0, safe - priorCredits);
 const current = adminNumber(window._adminSelectedUser?.credits);
 const usable = Math.min(current, remainingOrderCredits);
 if (remainingMoney <= 0) return { amount: 0, credits: 0 };
 if (mode === 'full') return { amount: remainingMoney, credits: usable };
 if (mode === 'custom') {
  const amt = Math.floor(Number(customAmount));
  if (!Number.isFinite(amt) || amt <= 0 || amt > remainingMoney) return null;
  return { amount: amt, credits: Math.min(usable, safe > 0 ? Math.floor(safe * amt / orderAmount) : 0) };
 }
 if (usable <= 0) return { amount: 0, credits: 0 };
 return { amount: Math.min(remainingMoney, safe > 0 ? Math.floor(orderAmount * usable / safe) : 0), credits: usable };
}

function adminGetRefundMode(i) {
 const panel = document.getElementById('refundPanel-' + i);
 const active = panel && panel.querySelector('.gp-admin-mode.is-active');
 return active ? active.dataset.mode : 'remaining';
}

function adminRefundMsg(i, text) {
 const prev = document.getElementById('refundPreview-' + i);
 if (prev) prev.innerHTML = `<span class="neg">${escapeHtml(text)}</span>`;
}

window.adminRefundPreview = function(i) {
 const order = (window._adminSelectedBundle?.orders || [])[i];
 const prev = document.getElementById('refundPreview-' + i);
 if (!order || !prev) return;
 const amtInput = document.getElementById('refundAmt-' + i);
 const calc = adminComputeRefund(order, adminGetRefundMode(i), amtInput ? amtInput.value : null);
 if (!calc) { prev.innerHTML = '<span class="neg">금액을 확인하세요 (1원 이상, 환불 가능액 이하)</span>'; return; }
 if (calc.amount <= 0) { prev.innerHTML = '<span class="neg">환불 가능 금액이 없습니다. 전체/직접입력을 사용하세요.</span>'; return; }
 prev.innerHTML = `환불 <b>${adminMoney(calc.amount)}</b> · 크레딧 <b>${calc.credits.toLocaleString('ko-KR')}</b> 차감`;
};

window.adminToggleRefund = function(i) {
 const panel = document.getElementById('refundPanel-' + i);
 if (!panel) return;
 panel.hidden = !panel.hidden;
 if (!panel.hidden) window.adminRefundPreview(i);
};

window.adminSetRefundMode = function(i, mode) {
 const panel = document.getElementById('refundPanel-' + i);
 if (!panel) return;
 panel.querySelectorAll('.gp-admin-mode').forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));
 const custom = document.getElementById('refundCustom-' + i);
 if (custom) custom.hidden = mode !== 'custom';
 if (mode === 'custom') {
  const amtInput = document.getElementById('refundAmt-' + i);
  const order = (window._adminSelectedBundle?.orders || [])[i];
  if (amtInput && order && !amtInput.value) {
   const def = adminComputeRefund(order, 'remaining');
   const remaining = adminNumber(order.amount) - adminNumber(order.refundedAmount || order.refundAmount);
   amtInput.value = def && def.amount > 0 ? def.amount : Math.max(0, remaining);
  }
  if (amtInput) amtInput.focus();
 }
 window.adminRefundPreview(i);
};

async function adminRunRefund(i, body) {
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
 }
}

window.loadAdminPage = async function() {
 const el = document.getElementById('adminContent');
 if (!el) return;
 el.style.display = 'block';
 window.scrollTo(0, 0);
 const gate = document.getElementById('adminGateMsg');
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
 await Promise.allSettled([
  window.loadAdminOverview(),
  window.loadAdminJobs(),
  window.loadAdminRefundList(),
  window.loadAllCreditHistory(),
  window.loadCouponBatches()
 ]);
};

// 관리자: 상단 개요 바 (매출 요약)
window.loadAdminOverview = async function() {
 if (!window.isAdmin()) return;
 const todayEl = document.getElementById('adminStatRevToday');
 const monthEl = document.getElementById('adminStatRevMonth');
 try {
  const data = await adminPost('/admin/revenue-summary', {});
  const won = (n) => '₩' + adminNumber(n).toLocaleString('ko-KR');
  if (todayEl) todayEl.textContent = won(data.today.totalPaid);
  const tCnt = document.getElementById('adminStatRevTodayCnt');
  if (tCnt) tCnt.textContent = `${adminNumber(data.today.totalCount)}건${data.today.refundCount ? ` · 환불 ${data.today.refundCount}` : ''}`;
  if (monthEl) monthEl.textContent = won(data.month.totalPaid);
  const mCnt = document.getElementById('adminStatRevMonthCnt');
  if (mCnt) mCnt.textContent = `${adminNumber(data.month.totalCount)}건`;
 } catch (e) {
  if (todayEl) todayEl.textContent = '—';
  if (monthEl) monthEl.textContent = '—';
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
 if (resultEl) resultEl.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 if (ordersEl) ordersEl.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/user-summary', { query: raw });
  window._adminSelectedBundle = data;
  window._adminSelectedUser = data.user;
  if (input) input.value = data.user.uid || raw;
  adminSetMessage('adminCreditAdjustMsg', '', 'info');
  adminRenderUserBundle(data);
  window.loadAdminUserLog(data.user.uid);
  if (!quiet && window.gpTrack) window.gpTrack('admin_user_search');
 } catch (e) {
  window._adminSelectedBundle = null;
  window._adminSelectedUser = null;
  const msg = escapeHtml(e.message);
  if (resultEl) resultEl.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${msg}</div>`;
  if (ordersEl) ordersEl.innerHTML = '<div class="gp-admin-empty">사용자를 먼저 선택하세요.</div>';
  const logEl = document.getElementById('adminUserLog');
  if (logEl) logEl.innerHTML = '<div class="gp-admin-empty">사용자를 먼저 선택하세요.</div>';
  const logCnt = document.getElementById('adminUserLogCount');
  if (logCnt) logCnt.textContent = '';
 }
};

// ===== 관리자: 사용자 작업 기록 =====
window._adminUserLog = { uid: null, items: [], nextCursorMs: null, loading: false };

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

window.loadAdminUserLog = async function(uid, append) {
 const el = document.getElementById('adminUserLog');
 if (!el || !uid) return;
 const st = window._adminUserLog;
 if (st.loading) return;
 st.loading = true;
 if (!append) {
  st.uid = uid; st.items = []; st.nextCursorMs = null;
  el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 }
 try {
  const data = await adminPost('/admin/user-history', { uid, limit: 20, cursorMs: append ? st.nextCursorMs : 0 });
  st.items = st.items.concat(data.items || []);
  st.nextCursorMs = data.nextCursorMs || null;
  window.renderAdminUserLog();
 } catch (e) {
  if (!append) el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 } finally {
  st.loading = false;
 }
};

window.renderAdminUserLog = function() {
 const el = document.getElementById('adminUserLog');
 if (!el) return;
 const st = window._adminUserLog;
 const cntEl = document.getElementById('adminUserLogCount');
 if (cntEl) cntEl.textContent = st.items.length ? (st.items.length + (st.nextCursorMs ? '+' : '')) : '';
 if (!st.items.length) {
  el.innerHTML = '<div class="gp-admin-empty">작업 기록이 없습니다.</div>';
  return;
 }
 const rows = st.items.map(it => {
  const ti = adminLogTypeInfo(it.type);
  const isDetect = it.type === 'detect';
  const preview = isDetect ? (it.summaryPreview || it.inputPreview) : (it.outputPreview || it.inputPreview);
  const lenInfo = isDetect
   ? `입력 ${adminNumber(it.inputLen).toLocaleString('ko-KR')}자`
   : `입력 ${adminNumber(it.inputLen).toLocaleString('ko-KR')}자 → 결과 ${adminNumber(it.outputLen).toLocaleString('ko-KR')}자`;
  return `
   <div class="gp-admin-log-item">
     <div class="gp-admin-log-head" onclick="adminToggleLogItem('${jsAttr(it.id)}')">
       <div class="gp-admin-log-meta">
         <span class="gp-admin-log-badge ${ti.cls}">${escapeHtml(ti.label)}</span>
         ${adminProbBadge(it.probability)}
         <span class="gp-admin-log-date">${escapeHtml(adminDateText(it.createdAtMs))}</span>
         <span class="gp-admin-log-sub">${escapeHtml(lenInfo)} · ${adminNumber(it.credits)}크레딧</span>
       </div>
       <span class="gp-admin-log-toggle" id="logToggle-${jsAttr(it.id)}">자세히 ▾</span>
     </div>
     <div class="gp-admin-log-preview">${escapeHtml(preview) || '<span class="gp-admin-muted">내용 없음</span>'}</div>
     <div class="gp-admin-log-detail" id="logDetail-${jsAttr(it.id)}" hidden></div>
   </div>`;
 }).join('');
 const more = st.nextCursorMs
  ? `<button type="button" class="gp-admin-mini-btn gp-admin-log-more" onclick="loadAdminUserLog(window._adminUserLog.uid, true)">더 보기</button>`
  : '';
 el.innerHTML = `<div class="gp-admin-log-list">${rows}</div>${more}`;
};

window.adminToggleLogItem = async function(id) {
 const box = document.getElementById('logDetail-' + id);
 const toggle = document.getElementById('logToggle-' + id);
 if (!box) return;
 if (!box.hidden) { box.hidden = true; if (toggle) toggle.textContent = '자세히 ▾'; return; }
 box.hidden = false;
 if (toggle) toggle.textContent = '접기 ▴';
 if (box.dataset.loaded === '1') return;
 box.innerHTML = '<div class="gp-admin-empty gp-admin-empty-compact">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/user-history-item', { uid: window._adminUserLog.uid, id });
  const it = data.item || {};
  const block = (label, text, mono) => text
   ? `<div class="gp-admin-log-block">
        <div class="gp-admin-log-block-head"><span>${escapeHtml(label)}</span><button type="button" class="gp-admin-mini-btn" onclick="adminCopyText(this)" data-copy="${escapeHtml(text)}">복사</button></div>
        <div class="gp-admin-log-text${mono ? ' mono' : ''}">${escapeHtml(text)}</div>
      </div>`
   : '';
  let html = '';
  html += block('입력 원문', it.inputText, true);
  if (it.type === 'detect') {
   if (typeof it.probability === 'number') html += `<div class="gp-admin-log-block"><div class="gp-admin-log-block-head"><span>AI 탐지 확률</span></div><div class="gp-admin-log-text">${Math.round(it.probability)}%</div></div>`;
   html += block('탐지 요약', it.summary, false);
   html += block('탐지 상세', it.detail, true);
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

window.adminCopyText = function(btn) {
 const text = btn?.dataset?.copy || '';
 if (!text) return;
 navigator.clipboard.writeText(text).then(() => {
  const prev = btn.textContent;
  btn.textContent = '복사됨';
  setTimeout(() => { btn.textContent = prev; }, 1200);
 }).catch(() => alert('복사 실패'));
};

// ===== 관리자: 작업 모니터 (transformJobs) =====
const ADMIN_JOB_STATUS = {
 queued: { l: '대기 중', c: 'wait' },
 running: { l: '진행 중', c: 'run' },
 awaiting_approval: { l: '승인 대기', c: 'wait' },
 done: { l: '완료', c: 'done' },
 error: { l: '오류·중단', c: 'err' },
 blocked: { l: '차단', c: 'err' },
 cancelled: { l: '취소', c: 'muted' }
};

window.loadAdminJobs = async function() {
 if (!window.isAdmin()) return;
 const el = document.getElementById('adminJobsBody');
 if (!el) return;
 const filter = document.getElementById('adminJobsFilter')?.value || 'issues';
 const hours = parseInt(document.getElementById('adminJobsHours')?.value, 10) || 24;
 el.innerHTML = '<div class="gp-admin-empty">불러오는 중...</div>';
 try {
  const data = await adminPost('/admin/jobs', { filter, hours, limit: 200 });
  window._adminJobs = data;
  renderAdminJobs(data);
 } catch (e) {
  el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">${escapeHtml(e.message)}</div>`;
 }
};

function renderAdminJobs(data) {
 const el = document.getElementById('adminJobsBody');
 if (!el) return;
 const cnt = document.getElementById('adminJobsCount');
 if (cnt) cnt.textContent = data.count ? String(data.count) : '';
 if (!data.rows || !data.rows.length) {
  el.innerHTML = '<div class="gp-admin-empty">해당 조건의 작업이 없습니다.</div>';
  return;
 }
 const charged = data.chargedCount || 0;
 const rows = data.rows.map(r => {
  const s = ADMIN_JOB_STATUS[r.status] || { l: r.status || '-', c: 'muted' };
  return `<tr>
    <td><input type="checkbox" class="gp-admin-job-cb" data-uid="${jsAttr(r.uid)}"></td>
    <td>${escapeHtml(r.email || '(이메일 없음)')}<br><span class="muted">${escapeHtml((r.uid || '').slice(0, 8))}</span></td>
    <td><span class="gp-admin-jobst ${s.c}">${escapeHtml(s.l)}</span></td>
    <td>${r.deducted ? '<span class="gp-admin-neg">⚠ 차감</span>' : '<span class="muted">—</span>'}</td>
    <td class="num">${adminNumber(r.needed)}</td>
    <td class="muted">${escapeHtml(r.stage || '')}</td>
    <td class="muted">${escapeHtml(adminDateText(r.createdAtMs))}</td>
    <td><button type="button" class="gp-admin-mini-btn" onclick="adminOpenUser('${jsAttr(r.uid)}')">열기</button></td>
  </tr>`;
 }).join('');
 el.innerHTML = `
  <div class="gp-admin-jobs-bar">
    <label class="gp-admin-jobs-all"><input type="checkbox" onclick="adminJobsToggleAll(this)"> 전체 선택</label>
    <button type="button" class="gp-admin-primary" onclick="adminNotifyAffected()">선택 사용자에게 알림</button>
    <span class="gp-admin-jobs-note ${charged ? 'alert' : ''}">${charged ? `⚠ 실제 차감된 작업 ${charged}건 — 확인 필요` : '차감된 작업 없음'}</span>
  </div>
  <div class="gp-admin-table-wrap"><table class="gp-admin-table gp-admin-jobs-table">
   <thead><tr><th></th><th>사용자</th><th>상태</th><th>차감</th><th class="num">크레딧</th><th>단계</th><th>시각</th><th></th></tr></thead>
   <tbody>${rows}</tbody>
  </table></div>`;
}

window.adminJobsToggleAll = function(cb) {
 document.querySelectorAll('.gp-admin-job-cb').forEach(x => { x.checked = cb.checked; });
};

window.adminOpenUser = function(uid) {
 const i = document.getElementById('adminUserQuery');
 if (i) i.value = uid;
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

 adminSetMessage('adminCreditAdjustMsg', '처리 중...', 'info');
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
 }
};

window.adminDirectRefund = async function(i) {
 const order = (window._adminSelectedBundle?.orders || [])[i];
 if (!order) {
  alert('주문 정보를 찾을 수 없습니다. 사용자를 다시 검색해주세요.');
  return;
 }

 // 구독: 전액 환불(모드 선택 없음)
 if (order.kind === 'subscription') {
  const reason = window.gpPrompt
   ? await window.gpPrompt({ title: '직접 환불 사유', message: '고객 요청 없이 바로 전액 환불합니다.', placeholder: '예: 중복 결제 환불', confirmText: '환불 진행', required: true })
   : prompt('직접 환불 사유를 입력해주세요:');
  if (!reason || reason.trim().length < 2) { alert('환불 사유를 2자 이상 입력해주세요.'); return; }
  const ok = window.gpConfirm
   ? await window.gpConfirm({ title: '전액 환불을 진행할까요?', message: `${order.id} · ${adminMoney(order.amount)}`, confirmText: '환불하기', danger: true })
   : confirm(`${order.id} 정기결제를 전액 환불할까요?`);
  if (!ok) return;
  await adminRunRefund(i, { orderId: order.id, kind: order.kind, reason: reason.trim() });
  return;
 }

 // 크레딧: 패널에서 모드/금액/사유 읽기
 const mode = adminGetRefundMode(i);
 const reasonEl = document.getElementById('refundReason-' + i);
 const reason = (reasonEl?.value || '').trim();
 if (reason.length < 2) { adminRefundMsg(i, '환불 사유를 2자 이상 입력하세요.'); if (reasonEl) reasonEl.focus(); return; }
 const amtInput = document.getElementById('refundAmt-' + i);
 const customAmount = mode === 'custom' ? parseInt(amtInput?.value, 10) : null;
 const calc = adminComputeRefund(order, mode, customAmount);
 if (!calc || calc.amount <= 0) { adminRefundMsg(i, '환불 금액을 확인하세요 (남은 크레딧이 없으면 전체/직접입력 사용).'); return; }

 const modeLabel = { remaining: '남은건 환불', full: '전체 환불', custom: '직접 입력' }[mode];
 const ok = window.gpConfirm
  ? await window.gpConfirm({
    title: '실제 환불을 진행할까요?',
    message: `${order.id}\n${modeLabel} · ${adminMoney(calc.amount)} · ${calc.credits.toLocaleString('ko-KR')}크레딧 차감`,
    confirmText: '환불하기',
    danger: true
   })
  : confirm(`${order.id} · ${modeLabel}\n${adminMoney(calc.amount)} / ${calc.credits}크레딧 차감으로 환불할까요?`);
 if (!ok) return;

 await adminRunRefund(i, { orderId: order.id, kind: order.kind, reason, mode, amount: customAmount });
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
 const typeTxt = isCharge ? '충전' : isRefund ? '환불' : isReferral ? '친구 추천' : isCoupon ? '쿠폰' : isAdminAdjust ? '관리자 조정' : h.type === 'detect' ? 'AI 감지' : adminHistoryLabel(h);
 const amountTxt = isCharge || isReferral || isCoupon
 ? `<div style="color:var(--green);font-weight:600;">+${h.amount} 크레딧</div>`
 : isRefund
 ? `<div style="color:var(--yellow);font-weight:600;">${h.amount} 크레딧 (환불)</div>`
 : isAdminAdjust
 ? `<div style="color:${(Number(h.amount)||0) >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:600;">${(Number(h.amount)||0) > 0 ? '+' : ''}${Number(h.amount)||0} 크레딧</div>`
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
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ idToken, limit: 1000 })
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
 window.renderAdminHistory();
 } catch(e) {
 console.log('전체 사용자 내역 로드 실패:', e);
 el.innerHTML = `<div class="gp-admin-empty gp-admin-error-text">불러오기 실패: ${e.message}</div>`;
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
  if (from) filtered = filtered.filter(h => {
   const ms = adminHistoryCreatedMs(h);
   return ms && ms >= new Date(from).getTime();
  });
  if (to) filtered = filtered.filter(h => {
   const ms = adminHistoryCreatedMs(h);
   return ms && ms <= new Date(to + 'T23:59:59').getTime();
  });
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
 window._adminHistory.filtered = filtered;
 window._adminHistory.page = 0;
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

 html += `<div class="gp-admin-table-wrap"><table class="gp-admin-table">
 <thead><tr>
 <th>날짜</th><th>유저</th><th>종류</th><th class="num">사용</th><th class="num">잔여</th>
 </tr></thead><tbody>`
 + items.map(h =>{
 const date = adminHistoryDateText(h);
 const typeTxt = adminHistoryLabel(h);
 const amountTxt = adminHistoryAmountHtml(h);
 return `<tr>
 <td class="muted">${date}</td>
 <td>${escapeHtml(h.userName)}<br><span class="muted">${escapeHtml(h.userEmail)}</span></td>
 <td>${escapeHtml(typeTxt)}</td>
 <td class="num">${amountTxt}</td>
 <td class="num muted">${adminNumber(h.remaining).toLocaleString('ko-KR')}</td>
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

// 이메일 필터: 입력마다 Firestore 조회를 피하려고 디바운스
window.adminHistoryEmailInput = () => {
 clearTimeout(window._adminHistory._emailTimer);
 window._adminHistory._emailTimer = setTimeout(() => window.filterAdminHistory(), 350);
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

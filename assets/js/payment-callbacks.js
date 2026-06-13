(async function() {
  const url = new URLSearchParams(window.location.search);
  const pKey = url.get('paymentKey');
  if (!pKey) return;

  // Firebase Auth 초기화 대기 (모바일 리다이렉트 후 CU 미초기화 방지)
  await window.authReady;

  // 모바일 리다이렉트 직후엔 CU가 일시적으로 null일 수 있어 최대 6초 재시도
  for (let i = 0; i < 4 && !window.CU; i++) {
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!window.CU) {
    if (window.gpToast) window.gpToast('결제 확인을 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.', { type: 'error' });
    else alert('결제 확인을 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.');
    return;
  }

  const uid = window.CU.uid;
  const userEmail = window.CU.email || '';
  const credits = parseInt(url.get('credits') || '100');
  const orderId = url.get('orderId');

  // localStorage로 중복 방지 (iOS Safari sessionStorage 이슈 해결)
  const storageKey = 'paid_' + orderId;
  if (localStorage.getItem(storageKey)) return;
  localStorage.setItem(storageKey, '1');

  // Firebase ID Token (필수)
  let idToken;
  try {
    idToken = await window.CU.getIdToken();
  } catch (e) {
    localStorage.removeItem(storageKey);
    if (window.gpToast) window.gpToast('로그인 토큰을 가져올 수 없습니다. 다시 로그인해주세요.', { type: 'error' });
    else alert('로그인 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
    return;
  }

  try {
    const res = await fetch(window.apiUrl('/confirm-payment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentKey: pKey,
        orderId: orderId,
        amount: url.get('amount'),
        customerEmail: userEmail,
        uid: uid,
        idToken: idToken
      })
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      history.replaceState({}, '', location.pathname);
      const _amt = Number(url.get('amount')) || 0;
      const _plan = url.get('plan') || '';
      const _cred = data.creditAmount || credits;
      gtag('event', 'purchase', {
        transaction_id: orderId,
        value: _amt,
        currency: 'KRW',
        items: [{ item_id: _plan || ('credits_' + _cred), item_name: _plan || ('크레딧 ' + _cred), quantity: 1, price: _amt }],
        traffic_source: localStorage.getItem('traffic_source') || 'direct'
      });
      try {
        const snap = await window._fbGetDoc(
          window._fbDoc(window._fbDb, 'users', window.CU?.uid || uid)
        );
        window.UC = snap.data().credits || 0;
        window.updateCreditUI();
      } catch(e) {}
      const chargedCredits = data.creditAmount || credits;
      if (window.gpNotify) {
        window.gpNotify({
          clientId: 'payment_' + orderId,
          type: 'payment',
          title: '충전 완료',
          message: chargedCredits + '크레딧이 충전됐어요. 보유 크레딧을 확인해 주세요.',
          action: { tab: 'pricing' }
        }, { persist: true });
      } else alert(chargedCredits + '크레딧 충전 완료!');
    } else if (data.error === "이미 처리된 결제입니다.") {
      history.replaceState({}, '', location.pathname);
    } else {
      if (window.gpToast) window.gpToast('충전 실패: ' + (data.error || '알 수 없는 오류'), { type: 'error' });
      else alert('충전 실패: ' + (data.error || '알 수 없는 오류'));
    }
  } catch(err) {
    if (window.gpToast) window.gpToast('네트워크 오류: ' + err.message, { type: 'error' });
    else alert('네트워크 오류: ' + err.message);
  }

  // 24시간 지난 localStorage 항목 정리
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('paid_order_')) {
      const ts = parseInt(key.replace('paid_order_', ''));
      if (!isNaN(ts) && Date.now() - ts > 86400000) {
        localStorage.removeItem(key);
      }
    }
  }
})();

// === 정기결제 빌링 인증 콜백 ===
(async function() {
  const url = new URLSearchParams(window.location.search);
  const authKey = url.get('authKey');
  const tier = url.get('sub');
  const ck = url.get('ck');
  if (!authKey || !tier || !ck) return;

  await window.authReady;
  for (let i = 0; i < 4 && !window.CU; i++) {
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!window.CU) {
    if (window.gpToast) window.gpToast('구독 처리를 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.', { type: 'error' });
    else alert('구독 처리를 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.');
    return;
  }

  const dedupKey = 'sub_' + authKey;
  if (localStorage.getItem(dedupKey)) return;
  localStorage.setItem(dedupKey, '1');

  let idToken;
  try { idToken = await window.CU.getIdToken(); }
  catch (e) {
    localStorage.removeItem(dedupKey);
    if (window.gpToast) window.gpToast('로그인 토큰을 가져올 수 없습니다. 다시 로그인해주세요.', { type: 'error' });
    else alert('로그인 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
    return;
  }

  try {
    const res = await fetch(window.apiUrl('/subscription/issue-billing-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken, authKey,
        customerKey: ck,
        tier,
        customerEmail: window.CU.email || '',
        customerName: window.CU.displayName || ''
      })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      history.replaceState({}, '', location.pathname);
      gtag('event', 'purchase', {
        transaction_id: data.orderId,
        value: data.amount,
        currency: 'KRW',
        items: [{ item_id: 'sub_' + tier, item_name: 'subscription_' + tier, quantity: 1, price: data.amount }],
        traffic_source: localStorage.getItem('traffic_source') || 'direct'
      });
      // 사용자 doc 다시 로드
      try {
        const snap = await window._fbGetDoc(window._fbDoc(window._fbDb, 'users', window.CU.uid));
        const d = snap.data();
        if (d.subscription) {
          window.SUB = {
            tier: d.subscription.tier,
            status: d.subscription.status,
            nextBillingMs: d.subscription.nextBillingAt?.toMillis ? d.subscription.nextBillingAt.toMillis() : 0,
            cancelledAt: d.subscription.cancelledAt || null,
            cardCompany: d.subscription.cardCompany || null,
            cardNumber: d.subscription.cardNumber || null
          };
        }
        window.COUPON = d.coupon ? { tier: d.coupon.tier, remaining: d.coupon.remaining, granted: d.coupon.granted } : null;
        window.UP = (d.subscription?.tier === 'unlimited') ? 'unlimited' : 'pro';
        if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
        const lock = document.getElementById('snavProLock');
        if (lock) lock.style.display = 'none';
      } catch(e) {}
      if (window.gpNotify) {
        window.gpNotify({
          clientId: 'subscription_' + data.orderId,
          type: 'payment',
          title: '구독 시작',
          message: '구독이 시작됐어요. Pro 탭에서 바로 사용할 수 있습니다.',
          action: { tab: 'pro' }
        }, { persist: true });
      } else alert('구독이 시작되었습니다! Pro 탭에서 바로 사용해보세요.');
      switchTab('pro');
    } else {
      localStorage.removeItem(dedupKey);
      if (window.gpToast) window.gpToast('구독 처리 실패: ' + (data.error || '알 수 없는 오류'), { type: 'error' });
      else alert('구독 처리 실패: ' + (data.error || '알 수 없는 오류'));
    }
  } catch(err) {
    localStorage.removeItem(dedupKey);
    if (window.gpToast) window.gpToast('네트워크 오류: ' + err.message, { type: 'error' });
    else alert('네트워크 오류: ' + err.message);
  }
})();

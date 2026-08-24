(function() {
  let creditPaymentProcessing = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function getCallbackUser(timeoutMs) {
    if (typeof window.waitForAuthUser === 'function') {
      return window.waitForAuthUser(timeoutMs);
    }
    await window.authReady;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (window.CU && window.CU.getIdToken) return window.CU;
      await sleep(250);
    }
    return window.CU && window.CU.getIdToken ? window.CU : null;
  }

  function cleanupPaidMarkers() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('paid_order_')) continue;
      const ts = parseInt(key.replace('paid_order_', ''), 10);
      if (!Number.isNaN(ts) && Date.now() - ts > 86400000) {
        localStorage.removeItem(key);
      }
    }
  }

  async function refreshCreditBalance(uid) {
    try {
      const snap = await window._fbGetDoc(
        window._fbDoc(window._fbDb, 'users', window.CU?.uid || uid)
      );
      window.UC = snap.data().credits || 0;
      window.updateCreditUI();
    } catch(e) {}
  }

  window.processPendingPaymentCallback = async function(options) {
    const url = new URLSearchParams(window.location.search);
    const pKey = url.get('paymentKey');
    if (!pKey) return false;

    const orderId = url.get('orderId') || '';
    const amount = url.get('amount');
    const credits = parseInt(url.get('credits') || '100', 10);
    const storageKey = orderId ? 'paid_' + orderId : '';
    const inflightKey = orderId ? 'confirming_' + orderId : '';

    // 예전 배포는 confirm 성공 전 "1"을 저장했으므로 복구 재시도를 막지 않는다.
    const paidMarker = storageKey ? localStorage.getItem(storageKey) : '';
    if (paidMarker && paidMarker !== '1') {
      history.replaceState({}, '', location.pathname);
      return true;
    }
    if (storageKey && paidMarker === '1') localStorage.removeItem(storageKey);
    if (creditPaymentProcessing) return false;

    const startedAt = inflightKey ? parseInt(sessionStorage.getItem(inflightKey) || '0', 10) : 0;
    if (startedAt && Date.now() - startedAt < 60000) return false;
    if (inflightKey) sessionStorage.setItem(inflightKey, String(Date.now()));
    creditPaymentProcessing = true;
    cleanupPaidMarkers();

    try {
      const user = await getCallbackUser(15000);
      if (!user) {
        if (window.gpTrackPaymentError) window.gpTrackPaymentError('confirm_auth_missing', {
          checkoutType: 'credits',
          orderId,
          amount,
          credits,
          uid: url.get('uid'),
          endpoint: '/confirm-payment',
          reason: options && options.reason
        });
        if (window.gpToast) window.gpToast('결제 확인을 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.', { type: 'error' });
        else alert('결제 확인을 위해 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오시면 자동으로 처리됩니다.');
        return false;
      }

      const uid = user.uid;
      const userEmail = user.email || '';
      let idToken;
      try {
        idToken = await user.getIdToken();
      } catch (e) {
        if (window.gpTrackPaymentError) window.gpTrackPaymentError('confirm_token_failed', {
          checkoutType: 'credits',
          orderId,
          amount,
          credits,
          endpoint: '/confirm-payment'
        }, e);
        if (window.gpToast) window.gpToast('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.', { type: 'error' });
        else alert('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
        return false;
      }

      const res = await fetch(window.apiUrl('/confirm-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentKey: pKey,
          orderId: orderId,
          amount: amount,
          customerEmail: userEmail,
          uid: uid,
          idToken: idToken,
          meta: window.gpMetaContext ? window.gpMetaContext() : {}
        })
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}
      if (res.ok && data.ok) {
        if (storageKey) localStorage.setItem(storageKey, String(Date.now()));
        history.replaceState({}, '', location.pathname);
        const _amt = Number(amount) || 0;
        const _plan = url.get('plan') || '';
        const _cred = data.creditAmount || credits;
        if (window.gpTrack) window.gpTrack('purchase', {
          transaction_id: orderId,
          meta_event_id: 'purchase_' + orderId,
          value: _amt,
          currency: 'KRW',
          items: [{ item_id: _plan || ('credits_' + _cred), item_name: _plan || ('크레딧 ' + _cred), quantity: 1, price: _amt }],
          traffic_source: localStorage.getItem('traffic_source') || 'direct'
        });
        await refreshCreditBalance(uid);
        const chargedCredits = data.creditAmount || credits;
        if (window.gpNotify) {
          window.gpNotify({
            clientId: 'payment_' + orderId,
            type: 'payment',
            title: '충전 완료',
            message: chargedCredits + '크레딧이 충전됐어요. 보유 크레딧을 확인해 주세요.',
            action: { tab: 'pricing' }
          }, { persist: true });
        } else alert(chargedCredits + '크레딧이 충전됐습니다.');
        return true;
      }

      if (data.error === "이미 처리된 결제입니다.") {
        if (storageKey) localStorage.setItem(storageKey, String(Date.now()));
        await refreshCreditBalance(uid);
        history.replaceState({}, '', location.pathname);
        return true;
      }

      if (window.gpTrackPaymentError) window.gpTrackPaymentError('confirm_api_failed', {
        checkoutType: 'credits',
        orderId,
        amount,
        credits,
        status: res.status,
        code: data.code || '',
        message: data.error || data.message || 'confirm failed',
        endpoint: '/confirm-payment'
      });
      if (window.gpToast) window.gpToast('충전을 마치지 못했어요. 결제가 됐는데 크레딧이 안 보이면 고객센터 이메일로 문의해 주세요.', { type: 'error' });
      else alert('충전을 마치지 못했어요. 결제가 됐는데 크레딧이 안 보이면 고객센터 이메일로 문의해 주세요.');
      return false;
    } catch(err) {
      if (window.gpTrackPaymentError) window.gpTrackPaymentError('confirm_network_failed', {
        checkoutType: 'credits',
        orderId,
        amount,
        credits,
        endpoint: '/confirm-payment'
      }, err);
      if (window.gpToast) window.gpToast('결제 확인 중 통신이 끊겼어요. 결제는 안전하니, 잠시 후 새로고침하면 자동으로 처리돼요.', { type: 'error' });
      else alert('결제 확인 중 통신이 끊겼어요. 결제는 안전하니, 잠시 후 새로고침하면 자동으로 처리돼요.');
      return false;
    } finally {
      if (inflightKey) sessionStorage.removeItem(inflightKey);
      creditPaymentProcessing = false;
    }
  };

  window.processPendingPaymentCallback({ reason: 'page_load' });
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
    if (window.gpTrackPaymentError) window.gpTrackPaymentError('subscription_auth_missing', {
      checkoutType: 'subscription',
      tier,
      uid: url.get('uid'),
      endpoint: '/subscription/issue-billing-key'
    });
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
    if (window.gpTrackPaymentError) window.gpTrackPaymentError('subscription_token_failed', {
      checkoutType: 'subscription',
      tier,
      endpoint: '/subscription/issue-billing-key'
    }, e);
    if (window.gpToast) window.gpToast('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.', { type: 'error' });
    else alert('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
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
        customerName: window.CU.displayName || '',
        meta: window.gpMetaContext ? window.gpMetaContext() : {}
      })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      history.replaceState({}, '', location.pathname);
      if (window.gpTrack) window.gpTrack('purchase', {
        transaction_id: data.orderId,
        meta_event_id: 'purchase_' + data.orderId,
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
      } else alert('구독이 시작됐어요! Pro 탭에서 바로 사용해 보세요.');
      switchTab('pro');
    } else {
      localStorage.removeItem(dedupKey);
      if (window.gpTrackPaymentError) window.gpTrackPaymentError('subscription_api_failed', {
        checkoutType: 'subscription',
        tier,
        status: res.status,
        code: data.code || '',
        message: data.error || data.message || 'subscription failed',
        endpoint: '/subscription/issue-billing-key'
      });
      if (window.gpToast) window.gpToast('구독 처리 실패: ' + (data.error || '알 수 없는 오류'), { type: 'error' });
      else alert('구독 처리 실패: ' + (data.error || '알 수 없는 오류'));
    }
  } catch(err) {
    localStorage.removeItem(dedupKey);
    if (window.gpTrackPaymentError) window.gpTrackPaymentError('subscription_network_failed', {
      checkoutType: 'subscription',
      tier,
      endpoint: '/subscription/issue-billing-key'
    }, err);
    if (window.gpToast) window.gpToast('구독 결제 확인 중 통신이 끊겼어요. 결제는 안전하니, 잠시 후 새로고침하면 다시 확인돼요.', { type: 'error' });
    else alert('구독 결제 확인 중 통신이 끊겼어요. 결제는 안전하니, 잠시 후 새로고침하면 다시 확인돼요.');
  }
})();

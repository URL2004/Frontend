(function() {
  let creditPaymentProcessing = false;
  let creditPaymentRetryCount = 0;
  let creditPaymentRetryTimer = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function schedulePaymentRetry(reason) {
    if (!window.GP_PAYMENT_CALLBACK_QUERY || !window.GP_PAYMENT_CALLBACK_QUERY.paymentKey) return false;
    if (creditPaymentRetryCount >= 2 || creditPaymentRetryTimer) return false;
    creditPaymentRetryCount += 1;
    creditPaymentRetryTimer = window.setTimeout(() => {
      creditPaymentRetryTimer = 0;
      window.processPendingPaymentCallback({ reason: reason || 'automatic_retry' });
    }, creditPaymentRetryCount * 1500);
    return true;
  }

  function finishPaymentRetry() {
    creditPaymentRetryCount = 0;
    if (creditPaymentRetryTimer) window.clearTimeout(creditPaymentRetryTimer);
    creditPaymentRetryTimer = 0;
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
    const captured = window.GP_PAYMENT_CALLBACK_QUERY;
    const url = captured ? new URLSearchParams(captured) : new URLSearchParams(window.location.search);
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
      if (typeof window.gpClearPaymentCallbackQuery === 'function') window.gpClearPaymentCallbackQuery();
      const knownUser = await getCallbackUser(5000);
      if (knownUser) await refreshCreditBalance(knownUser.uid);
      if (typeof window.gpHandleCreditPaymentSuccess === 'function') {
        await window.gpHandleCreditPaymentSuccess({ orderId, amount: Number(amount) || 0, chargedCredits: credits, data: { recoveredFromMarker: true } });
      }
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
        if (window.gpToast) window.gpToast('결제 확인을 위해 로그인이 필요해요. 로그인 후 이 페이지로 돌아오면 자동으로 처리해요.', { type: 'error' });
        else alert('결제 확인을 위해 로그인이 필요해요. 로그인 후 이 페이지로 돌아오면 자동으로 처리해요.');
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
        if (window.gpToast) window.gpToast('로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.', { type: 'error' });
        else alert('로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.');
        return false;
      }

      const res = await fetch(window.apiUrl('/confirm-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          paymentKey: pKey,
          orderId: orderId,
          amount: amount,
          customerEmail: userEmail,
          uid: uid,
          idToken: idToken,
          meta: window.gpMetaContext ? window.gpMetaContext() : {}
        }, typeof window.gpPendingCheckoutContract === 'function' ? window.gpPendingCheckoutContract() : {}))
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}
      if (res.ok && data.ok) {
        finishPaymentRetry();
        const conversionMeta = typeof window.gpPendingCheckoutMeta === 'function' ? window.gpPendingCheckoutMeta() : {};
        if (storageKey) localStorage.setItem(storageKey, String(Date.now()));
        if (typeof window.gpClearPaymentCallbackQuery === 'function') window.gpClearPaymentCallbackQuery();
        const _amt = Number(amount) || 0;
        const _plan = url.get('plan') || '';
        const _cred = data.creditAmount || credits;
        if (window.gpTrack) window.gpTrack('purchase', Object.assign({}, conversionMeta, {
          transaction_id: orderId,
          meta_event_id: 'purchase_' + orderId,
          value: _amt,
          currency: 'KRW',
          items: [{ item_id: _plan || ('credits_' + _cred), item_name: _plan || ('크레딧 ' + _cred), quantity: 1, price: _amt }],
          traffic_source: localStorage.getItem('traffic_source') || 'direct',
          bonus_credits: Number(data.bonusCredits) || 0,
          package_bonus_credits: Number(data.packageBonusCredits) || 0,
          event_bonus_credits: Number(data.eventBonusCredits) || 0,
          pricing_policy_version: data.offerPolicyVersion || conversionMeta.pricing_policy_version || '',
          offer_variant: data.experimentVariant || conversionMeta.offer_variant || ''
        }));
        await refreshCreditBalance(uid);
        const chargedCredits = data.creditAmount || credits;
        const resumed = typeof window.gpHandleCreditPaymentSuccess === 'function'
          ? await window.gpHandleCreditPaymentSuccess({ orderId, amount: _amt, chargedCredits, data })
          : false;
        if (window.gpNotify) {
          window.gpNotify({
            clientId: 'payment_' + orderId,
            type: 'payment',
            title: '충전 완료',
            message: resumed
              ? chargedCredits + '크레딧이 충전되어 방금 작업을 다시 시작했어요.'
              : chargedCredits + '크레딧이 충전됐어요. 보유 크레딧을 확인해 주세요.',
            action: { tab: resumed && conversionMeta.pending_action === 'writing_lab_generate' ? 'writingLab' : (resumed ? 'main' : 'pricing') }
          }, { persist: true });
        } else alert(chargedCredits + '크레딧이 충전됐어요.');
        return true;
      }

      if (data.error === "이미 처리된 결제입니다.") {
        finishPaymentRetry();
        if (storageKey) localStorage.setItem(storageKey, String(Date.now()));
        await refreshCreditBalance(uid);
        if (typeof window.gpClearPaymentCallbackQuery === 'function') window.gpClearPaymentCallbackQuery();
        if (typeof window.gpHandleCreditPaymentSuccess === 'function') {
          await window.gpHandleCreditPaymentSuccess({ orderId, amount: Number(amount) || 0, chargedCredits: credits, data: { duplicate: true } });
        }
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
      const willRetry = res.status >= 500 && schedulePaymentRetry('confirm_api_retry');
      if (window.gpToast) window.gpToast('충전을 마치지 못했어요. 결제가 됐는데 크레딧이 안 보이면 사이트 내 고객센터로 문의해 주세요.', { type: 'error' });
      else alert('충전을 마치지 못했어요. 결제가 됐는데 크레딧이 안 보이면 사이트 내 고객센터로 문의해 주세요.');
      if (willRetry && window.gpToast) window.gpToast('잠시 후 결제 확인을 자동으로 다시 시도할게요.', { type: 'info' });
      return false;
    } catch(err) {
      if (window.gpTrackPaymentError) window.gpTrackPaymentError('confirm_network_failed', {
        checkoutType: 'credits',
        orderId,
        amount,
        credits,
        endpoint: '/confirm-payment'
      }, err);
      const willRetry = schedulePaymentRetry('confirm_network_retry');
      const retryMessage = willRetry
        ? '결제 확인 중 통신이 끊겼어요. 페이지를 닫지 않으면 잠시 후 자동으로 다시 확인할게요.'
        : '결제 확인이 계속 지연되고 있어요. 결제 내역이 보이지 않으면 사이트 내 고객센터로 문의해 주세요.';
      if (window.gpToast) window.gpToast(retryMessage, { type: 'error' });
      else alert(retryMessage);
      return false;
    } finally {
      if (inflightKey) sessionStorage.removeItem(inflightKey);
      creditPaymentProcessing = false;
    }
  };

  window.processPendingPaymentCallback({ reason: 'page_load' });
})();

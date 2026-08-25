(function () {
  'use strict';

  var PENDING_KEY = 'gp_pending_paid_job_v1';
  var RESUMED_PREFIX = 'gp_resumed_paid_job_';
  var MAX_PENDING_AGE = 2 * 60 * 60 * 1000;
  var PLANS = [
    { amount: 2900, credits: 110, label: '스타터' },
    { amount: 8700, credits: 330, label: '라이트' },
    { amount: 14500, credits: 600, label: '스탠다드' },
    { amount: 29000, credits: 1300, label: '플러스' },
    { amount: 58000, credits: 2700, label: '맥스' }
  ];
  var contextCache = null;
  var contextUid = '';
  var modalState = null;
  var lastFocused = null;
  var contextPromise = null;

  function byId(id) { return document.getElementById(id); }
  function number(value) { return Math.max(0, Number(value) || 0); }
  function format(value) { return number(value).toLocaleString('ko-KR'); }
  function track(name, params) {
    if (typeof window.gpTrack === 'function') window.gpTrack(name, params || {});
  }

  function fallbackContext() {
    var balance = number(window.UC);
    return {
      segment: balance === 10 ? 'trial_unused' : (balance < 10 ? 'trial_engaged' : 'new_unfunded'),
      balance: balance,
      paidOrderCount: 0,
      eligibleForFirstPurchaseOffer: false,
      experiment: { key: 'first_purchase_bonus_v1', variant: 'unknown' },
      starterOffer: { amount: 2900, baseCredits: 110, bonusCredits: 0, totalCredits: 110 },
      lastPackage: null
    };
  }

  function readPending() {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var pending = JSON.parse(raw);
      if (!pending || pending.version !== 1 || number(pending.expiresAt) < Date.now()) {
        sessionStorage.removeItem(PENDING_KEY);
        return null;
      }
      return pending;
    } catch (error) {
      try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
      return null;
    }
  }

  function writePending(value) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      if (window.gpToast) window.gpToast('작업 내용을 자동으로 저장하지 못했어요. 결제 후 입력 내용을 다시 확인해 주세요.', { type: 'warning' });
      return false;
    }
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
  }

  async function currentUser() {
    if (window.CU && window.CU.getIdToken) return window.CU;
    if (typeof window.waitForAuthUser === 'function') return window.waitForAuthUser(3500);
    return null;
  }

  async function fetchContext(force) {
    var user = await currentUser();
    if (!user) return fallbackContext();
    if (!force && contextCache && contextUid === user.uid) return contextCache;
    if (!force && contextPromise) return contextPromise;
    contextPromise = (async function () {
      try {
        var idToken = await user.getIdToken();
        var response = await fetch(window.apiUrl('/checkout-context'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: idToken })
        });
        var data = await response.json().catch(function () { return null; });
        if (!response.ok || !data || !data.ok) throw new Error((data && data.error) || 'checkout context failed');
        contextCache = data;
        contextUid = user.uid;
        return data;
      } catch (error) {
        return fallbackContext();
      } finally {
        contextPromise = null;
      }
    })();
    return contextPromise;
  }

  function planTotal(plan, context) {
    if (plan.amount === 2900 && context && context.starterOffer) {
      return number(context.starterOffer.totalCredits) || plan.credits;
    }
    return plan.credits;
  }

  function choosePlan(options, context) {
    var current = number(options.currentCredits == null ? window.UC : options.currentCredits);
    var gap = Math.max(1, number(options.neededCredits) - current);
    var last = context && context.lastPackage;
    if (context && context.segment === 'returning_low_balance' && last) {
      var previous = PLANS.find(function (plan) { return plan.amount === number(last.amount); });
      if (previous && planTotal(previous, context) >= gap) return previous;
    }
    return PLANS.find(function (plan) { return planTotal(plan, context) >= gap; }) || PLANS[PLANS.length - 1];
  }

  function actionLabel(action) {
    var labels = {
      main_analysis: '작성 중인 분석',
      evasion_detect: '작성 중인 AI 감지',
      evasion_transform: '작성 중인 휴머나이징',
      evasion_fallback: '원문 보존형 작업',
      writing_lab_generate: '작성 중인 글쓰기 작업'
    };
    return labels[action] || '현재 작업';
  }

  function modalCopy(context, pending, plan) {
    if (context.segment === 'returning_low_balance' && context.lastPackage && number(context.lastPackage.amount) === plan.amount) {
      return {
        title: '이전에 쓰던 상품으로 바로 이어가세요',
        description: '결제가 끝나면 ' + actionLabel(pending.action) + '을 자동으로 다시 시작합니다.',
        badge: '빠른 재충전'
      };
    }
    if (context.segment === 'trial_unused') {
      return {
        title: '무료 크레딧은 그대로 두고 부족한 만큼 채우세요',
        description: '입력한 내용과 설정을 보관했습니다. 결제가 끝나면 중단된 지점에서 바로 이어집니다.',
        badge: '작업 자동 재개'
      };
    }
    return {
      title: '결제 후 방금 작업을 자동으로 이어갑니다',
      description: '입력한 글과 선택한 설정은 이 브라우저에 안전하게 임시 저장됩니다.',
      badge: '작업 자동 재개'
    };
  }

  function setText(id, value) {
    var node = byId(id);
    if (node) node.textContent = value;
  }

  function renderModal(context) {
    if (!modalState) return;
    var options = modalState.options;
    var pending = readPending() || modalState.pending;
    var plan = choosePlan(options, context);
    var totalCredits = planTotal(plan, context);
    var currentCredits = number(options.currentCredits == null ? window.UC : options.currentCredits);
    var neededCredits = number(options.neededCredits);
    var afterCredits = Math.max(0, currentCredits + totalCredits - neededCredits);
    var copy = modalCopy(context, pending, plan);
    var bonus = plan.amount === 2900 && context.starterOffer ? number(context.starterOffer.bonusCredits) : 0;
    modalState.context = context;
    modalState.plan = plan;
    modalState.totalCredits = totalCredits;

    setText('gpCreditCheckoutBadge', copy.badge);
    setText('gpCreditCheckoutTitle', copy.title);
    setText('gpCreditCheckoutDesc', copy.description);
    setText('gpCreditCheckoutPlan', plan.label + ' 충전');
    setText('gpCreditCheckoutPrice', format(plan.amount) + '원');
    setText('gpCreditCheckoutCredits', format(totalCredits) + '크레딧');
    setText('gpCreditCheckoutUses', '500자 기본 휴머나이징 약 ' + Math.floor(totalCredits / 10) + '회 · 1,000자 약 ' + Math.floor(totalCredits / 20) + '회');
    setText('gpCreditCheckoutCurrent', format(currentCredits) + '크레딧');
    setText('gpCreditCheckoutNeeded', format(neededCredits) + '크레딧');
    setText('gpCreditCheckoutAfter', format(afterCredits) + '크레딧');
    setText('gpCreditCheckoutButton', format(plan.amount) + '원 결제하고 ' + (pending.action === 'pricing_purchase' ? '충전하기' : '작업 이어가기'));

    var bonusNode = byId('gpCreditCheckoutBonus');
    if (bonusNode) {
      bonusNode.hidden = bonus <= 0;
      bonusNode.textContent = bonus > 0 ? '첫 결제 실험 혜택 +' + format(bonus) + '크레딧 포함' : '';
    }
    var summary = byId('gpCreditCheckoutSummary');
    if (summary) summary.hidden = neededCredits <= 0;
    var button = byId('gpCreditCheckoutButton');
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function focusableNodes(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(function (node) { return !node.hidden && node.offsetParent !== null; });
  }

  function onModalKeydown(event) {
    var modal = byId('gpCreditCheckoutModal');
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      window.gpCloseCreditCheckout();
      return;
    }
    if (event.key !== 'Tab') return;
    var nodes = focusableNodes(modal);
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  window.gpOpenCreditCheckout = async function (options) {
    options = options || {};
    var user = await currentUser();
    if (!user) {
      track('login_required', { source: 'credit_paywall' });
      if (typeof window.showScreen === 'function') window.showScreen('login');
      else alert('로그인한 뒤 충전할 수 있어요.');
      return false;
    }

    var now = Date.now();
    var pending = {
      version: 1,
      action: String(options.action || 'pricing_purchase').slice(0, 64),
      payload: options.payload || {},
      source: String(options.source || 'credit_shortage').slice(0, 64),
      neededCredits: number(options.neededCredits),
      currentCredits: number(options.currentCredits == null ? window.UC : options.currentCredits),
      uid: user.uid,
      createdAt: now,
      expiresAt: now + MAX_PENDING_AGE
    };
    writePending(pending);
    modalState = { options: options, pending: pending, context: fallbackContext(), plan: PLANS[0], totalCredits: 110 };
    lastFocused = document.activeElement;
    renderModal(modalState.context);

    var modal = byId('gpCreditCheckoutModal');
    if (!modal) {
      if (typeof window.switchTab === 'function') window.switchTab('pricing');
      return false;
    }
    modal.hidden = false;
    document.body.classList.add('gp-modal-open');
    document.addEventListener('keydown', onModalKeydown);
    var close = byId('gpCreditCheckoutClose');
    if (close) close.focus();
    track('paywall_view', {
      paywall_type: 'inline_credit_checkout',
      pending_action: pending.action,
      source: pending.source,
      needed_credits: pending.neededCredits,
      current_credits: pending.currentCredits,
      segment: modalState.context.segment
    });

    var context = await fetchContext(false);
    var latest = readPending();
    if (latest) {
      latest.segment = context.segment;
      latest.offerVariant = context.experiment && context.experiment.variant || 'unknown';
      writePending(latest);
    }
    if (modalState && !modal.hidden) renderModal(context);
    applyPricingContext(context);
    return true;
  };

  window.gpCloseCreditCheckout = function (preservePending) {
    var modal = byId('gpCreditCheckoutModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('gp-modal-open');
    document.removeEventListener('keydown', onModalKeydown);
    if (!preservePending) {
      var pending = readPending();
      if (!pending || !pending.orderId) clearPending();
    }
    modalState = null;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  };

  window.gpCreditCheckoutBackdrop = function (event) {
    if (event.target === event.currentTarget) window.gpCloseCreditCheckout();
  };

  window.gpViewAllCreditPlans = function () {
    track('view_item_list', { item_list_name: 'credit_paywall_all_plans' });
    window.gpCloseCreditCheckout(true);
    if (typeof window.switchTab === 'function') window.switchTab('pricing');
  };

  window.gpPurchaseCreditOffer = async function () {
    if (!modalState || !modalState.plan) return;
    var button = byId('gpCreditCheckoutButton');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '안전한 결제창을 여는 중…';
    }
    var pending = readPending() || modalState.pending;
    var context = modalState.context || fallbackContext();
    var plan = modalState.plan;
    var totalCredits = modalState.totalCredits || plan.credits;
    track(plan.amount === 2900 ? 'starter_offer_click' : 'credit_offer_click', {
      pending_action: pending.action,
      source: pending.source,
      segment: context.segment,
      offer_variant: context.experiment && context.experiment.variant || 'unknown',
      value: plan.amount,
      currency: 'KRW'
    });
    window.gpCloseCreditCheckout(true);
    if (typeof window.payToss === 'function') {
      await window.payToss(plan.amount, plan.credits, '크레딧 충전', '', {
        skipConfirm: true,
        displayCredits: totalCredits,
        segment: context.segment,
        offerVariant: context.experiment && context.experiment.variant || 'unknown',
        pendingAction: pending.action,
        source: pending.source
      });
    }
  };

  window.gpBindPendingCheckout = function (orderId, meta) {
    var pending = readPending();
    if (!pending || !orderId) return false;
    pending.orderId = String(orderId);
    pending.checkout = meta || {};
    pending.boundAt = Date.now();
    writePending(pending);
    return true;
  };

  window.gpUnbindPendingCheckout = function (orderId) {
    var pending = readPending();
    if (!pending || pending.orderId !== String(orderId || '')) return false;
    delete pending.orderId;
    delete pending.checkout;
    delete pending.boundAt;
    writePending(pending);
    return true;
  };

  window.gpPendingCheckoutMeta = function () {
    var pending = readPending();
    if (!pending) return {};
    return {
      pending_action: pending.action,
      paywall_source: pending.source,
      segment: pending.segment || '',
      offer_variant: pending.offerVariant || ''
    };
  };

  async function resumePendingJob(orderId, paymentData) {
    var pending = readPending();
    if (!pending || !pending.orderId || pending.orderId !== orderId) return false;
    if (pending.uid && window.CU && pending.uid !== window.CU.uid) return false;
    if (number(pending.neededCredits) > number(window.UC) && window.UP !== 'unlimited') {
      if (window.gpNotify) {
        window.gpNotify({
          clientId: 'payment_more_credit_' + orderId,
          type: 'payment',
          title: '충전 완료',
          message: '작업에 필요한 크레딧이 아직 부족해요. 입력 내용은 보관되어 있습니다.',
          action: { tab: 'pricing' }
        }, { persist: true });
      }
      return false;
    }
    var resumedKey = RESUMED_PREFIX + orderId;
    try { if (localStorage.getItem(resumedKey)) { clearPending(); return false; } } catch (_) {}
    var handlers = {
      main_analysis: 'gpResumeMainAnalysis',
      evasion_detect: 'gpResumeEvasionDetect',
      evasion_transform: 'gpResumeEvasionTransform',
      evasion_fallback: 'gpResumeEvasionFallback',
      writing_lab_generate: 'gpResumeWritingLab'
    };
    var handlerName = handlers[pending.action];
    var handler = handlerName && window[handlerName];
    if (typeof handler !== 'function') {
      if (pending.action === 'pricing_purchase') clearPending();
      return false;
    }
    try { localStorage.setItem(resumedKey, String(Date.now())); } catch (_) {}
    try {
      var result = await Promise.resolve(handler(pending.payload || {}));
      if (result === false) throw new Error('resume rejected');
      clearPending();
      track('job_resumed', {
        pending_action: pending.action,
        paywall_source: pending.source,
        segment: pending.segment || '',
        offer_variant: paymentData && paymentData.experimentVariant || pending.offerVariant || ''
      });
      return true;
    } catch (error) {
      try { localStorage.removeItem(resumedKey); } catch (_) {}
      if (window.gpToast) window.gpToast('결제는 완료됐지만 작업을 자동으로 다시 시작하지 못했어요. 입력 내용은 보관되어 있습니다.', { type: 'warning' });
      return false;
    }
  }

  window.gpHandleCreditPaymentSuccess = async function (details) {
    details = details || {};
    contextCache = null;
    contextUid = '';
    var resumed = await resumePendingJob(String(details.orderId || ''), details.data || {});
    window.gpRefreshPricingOffer(true);
    return resumed;
  };

  function starterBonusCopy(context) {
    var bonus = number(context && context.starterOffer && context.starterOffer.bonusCredits);
    return bonus > 0 ? '첫 결제 실험 혜택 +' + format(bonus) + '크레딧' : '';
  }

  function applyPricingContext(context) {
    if (!context) return;
    var offer = context.starterOffer || fallbackContext().starterOffer;
    var extraRow = byId('gpStarterExperimentBonus');
    if (extraRow) {
      extraRow.hidden = number(offer.bonusCredits) <= 0;
      var strong = extraRow.querySelector('strong');
      if (strong) strong.textContent = '+' + format(offer.bonusCredits) + ' 크레딧';
    }
    setText('gpStarterTotal', '총 ' + format(offer.totalCredits) + ' 크레딧');
    setText('gpStarterUseEstimate', '500자 기본 휴머나이징 약 ' + Math.floor(number(offer.totalCredits) / 10) + '회 · 1,000자 약 ' + Math.floor(number(offer.totalCredits) / 20) + '회');

    var panel = byId('gpPricingSegmentPanel');
    if (!panel || !window.CU) return;
    var title = byId('gpPricingSegmentTitle');
    var desc = byId('gpPricingSegmentDesc');
    var button = byId('gpPricingSegmentButton');
    var viewEvent = '';
    if (context.segment === 'trial_unused') {
      panel.hidden = false;
      panel.dataset.action = 'activate';
      if (title) title.textContent = '무료 체험 1회가 아직 남아 있어요';
      if (desc) desc.textContent = '10크레딧으로 500자 이하 기본 휴머나이징을 먼저 체험해 보세요.';
      if (button) button.textContent = '무료로 먼저 사용하기';
      viewEvent = 'activation_prompt_view';
    } else if (context.segment === 'trial_engaged') {
      panel.hidden = false;
      panel.dataset.action = 'starter';
      if (title) title.textContent = '무료 체험 다음 작업을 이어가세요';
      if (desc) desc.textContent = starterBonusCopy(context) || '2,900원 스타터 충전으로 짧은 글부터 부담 없이 이어갈 수 있어요.';
      if (button) button.textContent = '스타터 충전 보기';
      viewEvent = 'starter_offer_view';
    } else if (context.segment === 'returning_low_balance' && context.lastPackage) {
      panel.hidden = false;
      panel.dataset.action = 'repurchase';
      if (title) title.textContent = '지난번 상품으로 빠르게 다시 충전하세요';
      if (desc) desc.textContent = format(context.lastPackage.amount) + '원 · ' + format(context.lastPackage.credits) + '크레딧 상품을 바로 선택할 수 있어요.';
      if (button) button.textContent = '이전 상품 다시 충전';
      viewEvent = 'repurchase_offer_view';
    } else {
      panel.hidden = true;
    }
    if (!panel.hidden && viewEvent && panel.dataset.viewedSegment !== context.segment) {
      panel.dataset.viewedSegment = context.segment;
      track(viewEvent, { segment: context.segment, offer_variant: context.experiment && context.experiment.variant || '' });
    }
  }

  window.gpPricingSegmentAction = async function () {
    var panel = byId('gpPricingSegmentPanel');
    if (!panel) return;
    var context = await fetchContext(false);
    if (panel.dataset.action === 'activate') {
      track('activation_prompt_click', { segment: context.segment });
      if (typeof window.switchTab === 'function') window.switchTab('main');
      var input = byId('inputText');
      if (input) input.focus();
      return;
    }
    if (panel.dataset.action === 'repurchase' && context.lastPackage) {
      track('repurchase_offer_click', { segment: context.segment, value: context.lastPackage.amount, currency: 'KRW' });
      if (typeof window.payToss === 'function') {
        return window.payToss(context.lastPackage.amount, context.lastPackage.credits, '크레딧 충전', '', {
          segment: context.segment,
          offerVariant: 'repurchase_previous',
          pendingAction: 'pricing_purchase',
          source: 'pricing_segment'
        });
      }
      return;
    }
    return window.gpOpenCreditCheckout({ action: 'pricing_purchase', source: 'pricing_segment' });
  };

  window.gpRefreshPricingOffer = async function (force) {
    var context = await fetchContext(!!force);
    applyPricingContext(context);
    return context;
  };

  function bootstrapPricingContext(tries) {
    if (window.authReady && typeof window.authReady.then === 'function') {
      window.authReady.then(function () { if (window.CU) window.gpRefreshPricingOffer(false); });
      return;
    }
    if (tries > 0) setTimeout(function () { bootstrapPricingContext(tries - 1); }, 100);
  }

  function openLocalCheckoutPreview() {
    var isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (!isLocal || new URLSearchParams(location.search).get('preview_credit_checkout') !== '1') return;
    var previewContext = {
      segment: 'trial_engaged',
      balance: 4,
      paidOrderCount: 0,
      eligibleForFirstPurchaseOffer: true,
      experiment: { key: 'first_purchase_bonus_v1', variant: 'bonus_10' },
      starterOffer: { amount: 2900, baseCredits: 110, bonusCredits: 10, totalCredits: 120 },
      lastPackage: null
    };
    var previewPending = { action: 'main_analysis', source: 'local_preview' };
    modalState = {
      options: { action: 'main_analysis', neededCredits: 20, currentCredits: 4 },
      pending: previewPending,
      context: previewContext,
      plan: PLANS[0],
      totalCredits: 120
    };
    renderModal(previewContext);
    var modal = byId('gpCreditCheckoutModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('gp-modal-open');
    document.addEventListener('keydown', onModalKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootstrapPricingContext(100);
      openLocalCheckoutPreview();
    });
  } else {
    bootstrapPricingContext(100);
    openLocalCheckoutPreview();
  }
})();

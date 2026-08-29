(function () {
  'use strict';

  var PENDING_KEY = 'gp_pending_paid_job_v1';
  var RESUMED_PREFIX = 'gp_resumed_paid_job_';
  var MAX_PENDING_AGE = 2 * 60 * 60 * 1000;
  var CREDIT_EVENT_STARTS_AT_MS = Date.parse('2026-08-29T00:00:00+09:00');
  var CREDIT_EVENT_ENDS_AT_MS = Date.parse('2026-10-01T00:00:00+09:00');
  // 지급량 소스 오브 트루스는 Backend/lib/conversionOffers.js의 CREDIT_PRODUCTS다.
  // 여기·pricing.html·landing.html 표기가 어긋나면 claims-consistency 테스트가 깨진다.
  // 2026-09-30 결제 요청분까지 모든 구매자에게 기준 크레딧의 5/10/15/20/25%를 추가 지급한다.
  var PLANS = [
    { amount: 2900, paidCredits: 100, eventBonusCredits: 5, credits: 105, label: '스타터' },
    { amount: 8700, paidCredits: 300, eventBonusCredits: 30, credits: 330, label: '라이트' },
    { amount: 14500, paidCredits: 500, eventBonusCredits: 75, credits: 575, label: '스탠다드' },
    { amount: 29000, paidCredits: 1000, eventBonusCredits: 200, credits: 1200, label: '플러스' },
    { amount: 58000, paidCredits: 2000, eventBonusCredits: 500, credits: 2500, label: '맥스' }
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

  function localEventActive(now) {
    var at = number(now == null ? Date.now() : now);
    return at >= CREDIT_EVENT_STARTS_AT_MS && at < CREDIT_EVENT_ENDS_AT_MS;
  }

  function localPlanCatalog(now) {
    var active = localEventActive(now);
    return PLANS.map(function (plan) {
      var bonus = active ? plan.eventBonusCredits : 0;
      return {
        amount: plan.amount,
        paidCredits: plan.paidCredits,
        eventBonusCredits: bonus,
        credits: plan.paidCredits + bonus,
        label: plan.label
      };
    });
  }

  function planCatalog(context) {
    var offers = context && Array.isArray(context.creditOffers) ? context.creditOffers : null;
    if (!offers || !offers.length) return localPlanCatalog();
    var fallbackCatalog = localPlanCatalog();
    var eventDeclaredInactive = !!(context && context.creditEvent && context.creditEvent.active === false);
    return PLANS.map(function (plan) {
      var offer = offers.find(function (candidate) { return number(candidate.amount) === plan.amount; });
      if (!offer) return fallbackCatalog.find(function (candidate) { return candidate.amount === plan.amount; }) || plan;
      var paid = number(offer.paidCredits || offer.baseCredits) || plan.paidCredits;
      var bonus = eventDeclaredInactive ? 0 : number(offer.eventBonusCredits);
      var total = eventDeclaredInactive ? paid : (number(offer.totalCredits || offer.credits) || paid + bonus);
      return {
        amount: plan.amount,
        paidCredits: paid,
        eventBonusCredits: bonus,
        credits: Math.max(paid, total),
        label: String(offer.label || plan.label)
      };
    });
  }

  function fallbackContext() {
    var balance = number(window.UC);
    var offers = localPlanCatalog();
    var eventActive = offers.some(function (offer) { return offer.eventBonusCredits > 0; });
    return {
      segment: balance === 10 ? 'trial_unused' : (balance < 10 ? 'trial_engaged' : 'new_unfunded'),
      balance: balance,
      paidOrderCount: 0,
      experiment: { key: 'credit_event_20260930', variant: 'all_users' },
      creditEvent: { active: eventActive, displayEndsOn: '2026-09-30', endsAtMs: CREDIT_EVENT_ENDS_AT_MS },
      creditOffers: offers.map(function (offer) {
        return {
          amount: offer.amount,
          label: offer.label,
          baseCredits: offer.paidCredits,
          eventBonusCredits: offer.eventBonusCredits,
          totalCredits: offer.credits
        };
      }),
      starterOffer: {
        amount: offers[0].amount,
        paidCredits: offers[0].paidCredits,
        eventBonusCredits: offers[0].eventBonusCredits,
        totalCredits: offers[0].credits
      },
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

  function planBonus(plan) {
    return number(plan && plan.eventBonusCredits);
  }

  function planTotal(plan) {
    return number(plan && plan.credits);
  }

  function choosePlan(options, context) {
    var current = number(options.currentCredits == null ? window.UC : options.currentCredits);
    var gap = Math.max(1, number(options.neededCredits) - current);
    var last = context && context.lastPackage;
    var catalog = planCatalog(context);
    if (context && context.segment === 'returning_low_balance' && last) {
      var previous = catalog.find(function (plan) { return plan.amount === number(last.amount); });
      if (previous && planTotal(previous) >= gap) return previous;
    }
    return catalog.find(function (plan) { return planTotal(plan) >= gap; }) || catalog[catalog.length - 1];
  }

  function modalCopy(context, pending, plan) {
    var payload = pending.payload || {};
    var work = pending.action === 'evasion_detect' || (pending.action === 'composer_draft' && payload.mode === 'detect') || (pending.action === 'main_analysis' && payload.mode === 'detect')
      ? 'AI 감지'
      : pending.action === 'writing_lab_generate'
        ? '글쓰기 랩 생성'
        : pending.action === 'evasion_transform' && payload.flowMode === 'formal'
          ? '고급 휴머나이징'
          : pending.action === 'paragraph_refine'
            ? '문단 다시 다듬기'
            : '기본 휴머나이징';
    if (pending.action === 'pricing_purchase') {
      return {
        title: '결제 내용을 확인해 주세요',
        description: '지급 크레딧과 결제금액, 환불 기준을 확인한 뒤 결제를 진행해 주세요.',
        badge: '크레딧 충전'
      };
    }
    return {
      title: work + '에 필요한 크레딧을 충전해요',
      description: '입력한 내용과 설정을 보관했어요. 결제가 끝나면 중단된 작업을 자동으로 이어가요.',
      badge: '작업 자동 재개'
    };
  }

  function renderModalLoading() {
    setText('gpCreditCheckoutBadge', '충전 안내');
    setText('gpCreditCheckoutTitle', '이번 작업에 맞는 충전 상품을 계산하고 있어요');
    setText('gpCreditCheckoutDesc', '작업 종류와 부족한 크레딧을 확인한 뒤 결제를 시작할 수 있어요.');
    setText('gpCreditCheckoutPlan', '상품 확인 중');
    setText('gpCreditCheckoutPrice', '—');
    setText('gpCreditCheckoutPaid', '—');
    setText('gpCreditCheckoutEvent', '—');
    setText('gpCreditCheckoutCredits', '—');
    setText('gpCreditCheckoutNeeded', '—');
    setText('gpCreditCheckoutAfter', '—');
    var eventRow = byId('gpCreditCheckoutEventRow');
    if (eventRow) eventRow.hidden = true;
    var bonus = byId('gpCreditCheckoutBonus');
    if (bonus) bonus.hidden = true;
    var offer = document.querySelector('.gp-credit-offer');
    if (offer) offer.setAttribute('aria-busy', 'true');
    var button = byId('gpCreditCheckoutButton');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '상품을 계산하고 있어요';
    }
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
    var totalCredits = planTotal(plan);
    var currentCredits = number(options.currentCredits == null ? window.UC : options.currentCredits);
    var neededCredits = number(options.neededCredits);
    var afterCredits = Math.max(0, currentCredits + totalCredits - neededCredits);
    var copy = modalCopy(context, pending, plan);
    var bonus = planBonus(plan);
    modalState.context = context;
    modalState.plan = plan;
    modalState.totalCredits = totalCredits;

    setText('gpCreditCheckoutBadge', copy.badge);
    setText('gpCreditCheckoutTitle', copy.title);
    setText('gpCreditCheckoutDesc', copy.description);
    setText('gpCreditCheckoutPlan', plan.label + ' 충전');
    setText('gpCreditCheckoutPrice', format(plan.amount) + '원');
    setText('gpCreditCheckoutPaid', format(plan.paidCredits) + '크레딧');
    setText('gpCreditCheckoutEvent', '+' + format(bonus) + '크레딧');
    setText('gpCreditCheckoutCredits', format(totalCredits) + '크레딧');
    setText('gpCreditCheckoutCurrent', format(currentCredits) + '크레딧');
    setText('gpCreditCheckoutNeeded', format(neededCredits) + '크레딧');
    setText('gpCreditCheckoutAfter', format(afterCredits) + '크레딧');
    setText('gpCreditCheckoutButton', format(plan.amount) + '원 결제하고 ' + (pending.action === 'pricing_purchase' ? '충전하기' : '작업 이어가기'));

    var eventRow = byId('gpCreditCheckoutEventRow');
    if (eventRow) eventRow.hidden = bonus <= 0;
    var bonusNode = byId('gpCreditCheckoutBonus');
    if (bonusNode) {
      bonusNode.hidden = bonus <= 0;
      bonusNode.textContent = bonus > 0 ? '2026년 9월 30일까지 결제 요청분에 적용돼요.' : '';
    }
    var offer = document.querySelector('.gp-credit-offer');
    if (offer) offer.setAttribute('aria-busy', 'false');
    var summary = byId('gpCreditCheckoutSummary');
    if (summary) summary.hidden = neededCredits <= 0;
    var button = byId('gpCreditCheckoutButton');
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
    modalState.ready = true;
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
    modalState = { options: options, pending: pending, context: null, plan: null, totalCredits: 0, ready: false };
    lastFocused = document.activeElement;
    renderModalLoading();

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
      segment: 'loading'
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
    if (!modalState || !modalState.ready || !modalState.plan) return;
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
          message: '작업에 필요한 크레딧이 아직 부족해요. 입력 내용은 보관되어 있어요.',
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
      writing_lab_generate: 'gpResumeWritingLab',
      composer_draft: 'gpResumeComposerDraft'
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
      if (window.gpToast) window.gpToast('결제는 완료됐지만 작업을 자동으로 다시 시작하지 못했어요. 입력 내용은 보관되어 있어요.', { type: 'warning' });
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
    var starter = planCatalog(context)[0];
    if (!starter.eventBonusCredits) return '기준 ' + format(starter.paidCredits) + '크레딧';
    return '기준 ' + format(starter.paidCredits) + ' + 이벤트 ' + format(starter.eventBonusCredits)
      + ' = 총 ' + format(starter.credits) + '크레딧 · 2026년 9월 30일까지 결제 요청분';
  }

  function applyPricingCards(context) {
    var catalog = planCatalog(context);
    var anyEvent = catalog.some(function (plan) { return plan.eventBonusCredits > 0; });
    var eventPanel = document.querySelector('.gp-pricing-event');
    if (eventPanel) eventPanel.hidden = !anyEvent;
    catalog.forEach(function (plan) {
      var card = document.querySelector('[data-plan-amount="' + plan.amount + '"]');
      if (!card) return;
      card.dataset.planCredits = String(plan.credits);
      var total = card.querySelector('[data-plan-total-for="' + plan.amount + '"]');
      if (total) total.textContent = '총 ' + format(plan.credits) + ' 크레딧';
      var bonusRow = card.querySelector('.feat-bonus');
      if (bonusRow) {
        bonusRow.hidden = plan.eventBonusCredits <= 0;
        var bonusStrong = bonusRow.querySelector('strong');
        if (bonusStrong) bonusStrong.textContent = '+' + format(plan.eventBonusCredits) + ' 크레딧';
      }
      card.querySelectorAll('[data-work-cost]').forEach(function (node) {
        var cost = Math.max(1, number(node.dataset.workCost));
        node.dataset.planCredits = String(plan.credits);
        node.textContent = Math.floor(plan.credits / cost) + '회';
      });
      var button = card.querySelector('.plan-btn');
      if (button) {
        button.setAttribute('onclick', "payToss(" + plan.amount + ',' + plan.credits + ",'크레딧 충전','')");
        var grantLabel = plan.eventBonusCredits > 0
          ? '기준 ' + format(plan.paidCredits) + '크레딧과 이벤트 ' + format(plan.eventBonusCredits) + '크레딧, 총 '
          : '기준 ';
        button.setAttribute('aria-label', grantLabel + format(plan.credits) + '크레딧을 ' + format(plan.amount) + '원에 충전하기');
      }
    });
    return catalog;
  }

  function applyPricingContext(context) {
    if (!context) return;
    var catalog = applyPricingCards(context);
    // 스타터 카드 사용량: 이벤트 보너스 포함 총 지급량으로 계산한다.
    var starterTotal = catalog[0].credits;
    setText('gpStarterSvcShort', Math.floor(starterTotal / 10) + '회');
    setText('gpStarterSvcBasic', Math.floor(starterTotal / 20) + '회');
    setText('gpStarterSvcDetect', Math.floor(starterTotal / 10) + '회');

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
      if (desc) desc.textContent = starterBonusCopy(context) + ' · 짧은 글부터 부담 없이 이어갈 수 있어요.';
      if (button) button.textContent = '스타터 충전 보기';
      viewEvent = 'starter_offer_view';
    } else if (context.segment === 'returning_low_balance' && context.lastPackage) {
      var previous = catalog.find(function (plan) { return plan.amount === number(context.lastPackage.amount); });
      panel.hidden = false;
      panel.dataset.action = 'repurchase';
      if (title) title.textContent = '지난번 상품으로 빠르게 다시 충전하세요';
      if (desc) desc.textContent = format(context.lastPackage.amount) + '원 · ' + format(previous ? previous.credits : context.lastPackage.credits) + '크레딧 상품을 바로 선택할 수 있어요.';
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
      var previous = planCatalog(context).find(function (plan) { return plan.amount === number(context.lastPackage.amount); });
      var currentCredits = previous ? previous.credits : context.lastPackage.credits;
      track('repurchase_offer_click', { segment: context.segment, value: context.lastPackage.amount, currency: 'KRW' });
      if (typeof window.payToss === 'function') {
        return window.payToss(context.lastPackage.amount, currentCredits, '크레딧 충전', '', {
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

  // ── 상태별 히어로 오퍼(D) ────────────────────────────────────────────────────
  // 첫 화면 문구를 모두에게 동일하게 두면, 이미 결제한 적 있고 잔액이 바닥난 사용자에게도
  // 신규 방문자와 같은 화면을 보여주게 된다. /checkout-context의 세그먼트로 문구와 CTA를 바꾼다.
  var heroState = null;
  var heroOrderMedia = window.matchMedia('(max-width: 760px)');

  function syncHeroOfferPlacement() {
    var offer = byId('lavHeroOffer');
    var composer = document.querySelector('#lavEntry .gp-lav-composer');
    var estimate = byId('lavEstimate');
    if (!offer || !composer) return;
    if (heroOrderMedia.matches) {
      // 모바일은 글쓰기부터 시작하고, 잔액·가입·충전 안내는 입력 아래에서 이어진다.
      var anchor = estimate || composer;
      if (anchor.nextElementSibling !== offer) anchor.insertAdjacentElement('afterend', offer);
      return;
    }
    // 데스크톱은 넓은 화면에서 현재 상태를 먼저 훑고 입력으로 내려가는 순서를 유지한다.
    if (composer.previousElementSibling !== offer) composer.insertAdjacentElement('beforebegin', offer);
  }
  if (typeof heroOrderMedia.addEventListener === 'function') {
    heroOrderMedia.addEventListener('change', syncHeroOfferPlacement);
  } else if (typeof heroOrderMedia.addListener === 'function') {
    heroOrderMedia.addListener(syncHeroOfferPlacement);
  }

  function heroCopy(context) {
    var balance = window.CU && window.UC != null ? number(window.UC) : number(context.balance);
    if (context.segment === 'trial_unused') {
      return {
        badge: '무료 체험',
        title: '무료 10크레딧이 그대로 있어요',
        desc: '500자 기본 휴머나이징 한 번 또는 1,000자 AI 감지를 무료로 써볼 수 있어요.',
        cta: '지금 글 붙여넣기',
        action: 'focus',
        event: 'activation_prompt'
      };
    }
    if (context.segment === 'trial_engaged') {
      var starter = planCatalog(context)[0];
      return {
        badge: '이어하기',
        title: '체험 크레딧이 ' + format(balance) + '크레딧 남았어요',
        desc: format(starter.amount) + '원 스타터 충전이면 500자 휴머나이징을 약 ' + Math.floor(starter.credits / 10) + '번 더 할 수 있어요. (' + starterBonusCopy(context) + ')',
        cta: '스타터 충전 보기',
        action: 'starter',
        event: 'starter_offer'
      };
    }
    if (context.segment === 'returning_low_balance' && context.lastPackage) {
      var previous = planCatalog(context).find(function (plan) { return plan.amount === number(context.lastPackage.amount); });
      return {
        badge: '빠른 재충전',
        title: '잔액이 ' + format(balance) + '크레딧 남았어요',
        desc: '지난번 쓰신 ' + format(context.lastPackage.amount) + '원 · ' + format(previous ? previous.credits : context.lastPackage.credits) + '크레딧 상품으로 바로 충전할 수 있어요.',
        cta: '이전 상품 다시 충전',
        action: 'repurchase',
        event: 'repurchase_offer'
      };
    }
    if (context.segment === 'returning_funded') {
      return {
        badge: '이어하기',
        title: '보유 ' + format(balance) + '크레딧으로 이어서 작업할 수 있어요',
        desc: '지난 작업 결과는 작업 기록에서 다시 확인할 수 있어요.',
        cta: '작업 기록 보기',
        action: 'history',
        event: 'returning_prompt'
      };
    }
    return {
      badge: '시작하기',
      title: '보유 ' + format(balance) + '크레딧으로 바로 시작할 수 있어요',
      desc: '글을 붙여넣으면 이 글에 드는 크레딧을 먼저 알려드려요.',
      cta: '글 붙여넣기',
      action: 'focus',
      event: 'activation_prompt'
    };
  }

  function loggedOutHeroCopy() {
    return {
      badge: '무료 체험',
      title: '가입하면 10크레딧을 무료로 드려요',
      desc: '500자 기본 휴머나이징 한 번 또는 1,000자 AI 감지를 바로 해볼 수 있어요.',
      cta: '무료로 시작하기',
      action: 'signup',
      event: 'signup_prompt'
    };
  }

  function renderHero(copy, segment) {
    var box = byId('lavHeroOffer');
    if (!box) return;
    syncHeroOfferPlacement();
    heroState = { action: copy.action, segment: segment, event: copy.event };
    setText('lavHeroOfferBadge', copy.badge);
    setText('lavHeroOfferTitle', copy.title);
    setText('lavHeroOfferDesc', copy.desc);
    var cta = byId('lavHeroOfferCta');
    setText('lavHeroOfferCta', copy.cta);
    // 입력창 바로 위의 포커스 버튼은 화면 변화가 거의 없어 고장처럼 느껴진다.
    // 이 상태에서는 잔액·무료 범위만 정보로 보여주고, 실제 이동이 있는 행동만 버튼으로 남긴다.
    if (cta) cta.hidden = copy.action === 'focus';
    box.classList.toggle('is-passive', copy.action === 'focus');
    box.dataset.action = copy.action;
    box.dataset.segment = segment;
    box.hidden = false;
    if (box.dataset.viewedSegment !== segment) {
      box.dataset.viewedSegment = segment;
      track(copy.event + '_view', { segment: segment, surface: 'hero' });
    }
  }

  // 로컬 전용: ?preview_segment=trial_engaged 처럼 붙이면 계정 없이 각 상태를 눈으로 확인한다.
  var HERO_PREVIEW_SEGMENTS = ['logged_out', 'trial_unused', 'trial_engaged', 'new_unfunded', 'returning_funded', 'returning_low_balance'];
  function heroPreviewSegment() {
    var isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (!isLocal) return '';
    var requested = new URLSearchParams(location.search).get('preview_segment') || '';
    return HERO_PREVIEW_SEGMENTS.indexOf(requested) >= 0 ? requested : '';
  }
  function heroPreviewContext(segment) {
    var balances = { trial_unused: 10, trial_engaged: 4, new_unfunded: 30, returning_funded: 420, returning_low_balance: 12 };
    return {
      segment: segment,
      balance: balances[segment] == null ? 0 : balances[segment],
      paidOrderCount: segment.indexOf('returning') === 0 ? 3 : 0,
      experiment: { key: 'credit_event_20260930', variant: 'all_users' },
      starterOffer: { amount: 2900, paidCredits: 100, eventBonusCredits: 5, totalCredits: 105 },
      lastPackage: segment === 'returning_low_balance' ? { amount: 14500, credits: 575 } : null
    };
  }

  window.gpRefreshHeroOffer = async function (force) {
    var box = byId('lavHeroOffer');
    if (!box) return null;
    var preview = heroPreviewSegment();
    if (preview) {
      if (preview === 'logged_out') {
        window.GP_HERO_PREVIEW = '';
        var outPreview = loggedOutHeroCopy();
        renderHero(outPreview, 'logged_out');
        renderInlineOffers(outPreview, 'logged_out');
        return null;
      }
      var previewContext = heroPreviewContext(preview);
      window.GP_HERO_PREVIEW = preview;
      window.UC = previewContext.balance;
      var previewCopy = heroCopy(previewContext);
      renderHero(previewCopy, preview);
      renderInlineOffers(previewCopy, preview);
      if (typeof window.lavUpdateEstimate === 'function') window.lavUpdateEstimate();
      return previewContext;
    }
    if (!window.CU) {
      var outCopy = loggedOutHeroCopy();
      renderHero(outCopy, 'logged_out');
      renderInlineOffers(outCopy, 'logged_out');
      return null;
    }
    var context = await fetchContext(!!force);
    var copy = heroCopy(context);
    renderHero(copy, context.segment);
    renderInlineOffers(copy, context.segment);
    return context;
  };

  async function runOfferAction(surface) {
    var state = heroState || { action: 'focus', segment: 'unknown', event: 'activation_prompt' };
    track(state.event + '_click', { segment: state.segment, surface: surface });
    if (state.action === 'signup') {
      if (typeof window.showScreen === 'function') window.showScreen('login');
      return;
    }
    if (state.action === 'focus') {
      if (typeof window.switchTab === 'function') window.switchTab('main');
      var input = byId('lavInput');
      if (input) input.focus();
      return;
    }
    if (state.action === 'history') {
      if (typeof window.switchTab === 'function') window.switchTab('history');
      if (typeof window.loadHistory === 'function') window.loadHistory();
      return;
    }
    var context = await fetchContext(false);
    if (state.action === 'repurchase' && context.lastPackage && typeof window.payToss === 'function') {
      var previous = planCatalog(context).find(function (plan) { return plan.amount === number(context.lastPackage.amount); });
      return window.payToss(context.lastPackage.amount, previous ? previous.credits : context.lastPackage.credits, '크레딧 충전', '', {
        segment: context.segment,
        offerVariant: 'repurchase_previous',
        pendingAction: 'pricing_purchase',
        source: surface + '_offer'
      });
    }
    return window.gpOpenCreditCheckout({ action: 'pricing_purchase', source: surface + '_offer' });
  }

  window.gpHeroOfferAction = function () { return runOfferAction('hero'); };
  window.gpInlineOfferAction = function () { return runOfferAction('inline'); };
  window.gpOfferFloatAction = function () { return runOfferAction('floating'); };

  window.gpConversionContext = function (force) {
    return fetchContext(!!force);
  };

  window.gpCreditOfferForAmount = async function (amount, force) {
    var context = await fetchContext(!!force);
    return planCatalog(context).find(function (plan) { return plan.amount === number(amount); }) || null;
  };

  // ── 인라인 오퍼(3순위) ───────────────────────────────────────────────────────
  // 읽기용 페이지 본문 끝. 스크롤을 끝까지 내린 사람에게만 보이므로 방해가 없고,
  // 문구는 히어로와 같은 세그먼트 판정을 그대로 쓴다(페이지마다 복제하지 않는다).
  // FAQ는 정확도·환불·개인정보에 답하는 신뢰 화면이다. 전용 작업 선택기를 사용해 공통 판매 오퍼와 겹치지 않는다.
  var OFFER_PAGES = ['notice', 'community', 'blog'];

  function currentOfferPage() {
    for (var i = 0; i < OFFER_PAGES.length; i++) {
      var el = byId(OFFER_PAGES[i] + 'Content');
      if (el && el.style.display !== 'none') return OFFER_PAGES[i];
    }
    return '';
  }

  function renderInlineOffers(copy, segment) {
    var slots = document.querySelectorAll('[data-gp-offer-slot]');
    if (!slots.length) return;
    Array.prototype.forEach.call(slots, function (slot) {
      if (!slot.dataset.built) {
        slot.textContent = '';
        var badge = document.createElement('span');
        badge.className = 'gp-offer-inline-badge';
        var box = document.createElement('div');
        box.className = 'gp-offer-inline-copy';
        box.appendChild(document.createElement('strong'));
        box.appendChild(document.createElement('span'));
        var cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'gp-offer-inline-cta';
        cta.addEventListener('click', function () { window.gpInlineOfferAction(); });
        slot.appendChild(badge);
        slot.appendChild(box);
        slot.appendChild(cta);
        slot.dataset.built = '1';
      }
      slot.querySelector('.gp-offer-inline-badge').textContent = copy.badge;
      slot.querySelector('.gp-offer-inline-copy strong').textContent = copy.title;
      slot.querySelector('.gp-offer-inline-copy span').textContent = copy.desc;
      slot.querySelector('.gp-offer-inline-cta').textContent = copy.cta;
      slot.hidden = false;
    });
    var page = currentOfferPage();
    if (page && document.body.dataset.inlineOfferViewed !== page + ':' + segment) {
      document.body.dataset.inlineOfferViewed = page + ':' + segment;
      track(copy.event + '_view', { segment: segment, surface: 'inline', page: page });
    }
  }

  // ── 플로팅 오퍼(4순위) ───────────────────────────────────────────────────────
  // 지금 살 이유가 있는 두 세그먼트에만. 즉시 노출은 팝업으로 읽히므로 체류 5초 또는 스크롤 50% 이후.
  var FLOAT_SEGMENTS = ['returning_low_balance', 'trial_engaged'];
  var FLOAT_DISMISS_KEY = 'gp_offer_float_dismissed_v1';
  var floatTimer = null;
  var floatShown = false;

  function floatDismissed() {
    try { return sessionStorage.getItem(FLOAT_DISMISS_KEY) === '1'; } catch (_) { return false; }
  }

  window.gpOfferFloatDismiss = function () {
    try { sessionStorage.setItem(FLOAT_DISMISS_KEY, '1'); } catch (_) {}
    var bar = byId('gpOfferFloat');
    if (bar) bar.hidden = true;
    track('offer_dismiss', { surface: 'floating', segment: (heroState && heroState.segment) || '' });
  };

  function floatBlocked() {
    if (floatDismissed()) return true;
    if (!window.CU && !window.GP_HERO_PREVIEW) return true;   // 로컬 프리뷰는 로그인 없이 확인 가능
    if (document.body.classList.contains('gp-modal-open')) return true;
    var job = byId('lavActiveJob');   // 진행 중 작업이 있으면 상태 알림과 겹치므로 띄우지 않는다
    if (job && !job.hidden) return true;
    return !currentOfferPage();
  }

  async function showFloatingOffer(trigger) {
    if (floatShown || floatBlocked()) return;
    var preview = heroPreviewSegment();
    var context = preview && preview !== 'logged_out' ? heroPreviewContext(preview) : await fetchContext(false);
    if (!context || FLOAT_SEGMENTS.indexOf(context.segment) < 0) return;
    if (floatShown || floatBlocked()) return;
    var bar = byId('gpOfferFloat');
    if (!bar) return;
    var copy = heroCopy(context);
    heroState = { action: copy.action, segment: context.segment, event: copy.event };
    setText('gpOfferFloatText', copy.title);
    setText('gpOfferFloatCta', copy.cta);
    bar.hidden = false;
    floatShown = true;
    track(copy.event + '_view', { segment: context.segment, surface: 'floating', trigger: trigger });
  }

  function onFloatScroll() {
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - doc.clientHeight);
    var ratio = (window.scrollY || doc.scrollTop || 0) / max;
    if (ratio >= 0.5) showFloatingOffer('scroll');
  }

  // 탭이 바뀔 때마다 초기화 — 페이지를 벗어나면 즉시 내리고, 자격이 있으면 다시 무장한다.
  window.gpOnTabChange = function (tabName) {
    var bar = byId('gpOfferFloat');
    if (bar) bar.hidden = true;
    floatShown = false;
    if (floatTimer) { clearTimeout(floatTimer); floatTimer = null; }
    window.removeEventListener('scroll', onFloatScroll, true);
    if (OFFER_PAGES.indexOf(tabName) < 0) return;
    floatTimer = setTimeout(function () { showFloatingOffer('dwell'); }, 5000);
    window.addEventListener('scroll', onFloatScroll, true);
  };

  function bootstrapPricingContext(tries) {
    if (window.authReady && typeof window.authReady.then === 'function') {
      window.authReady.then(function () {
        window.gpRefreshHeroOffer(false);
        window.gpRefreshPricingOffer(false);
      });
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
      experiment: { key: 'credit_event_20260930', variant: 'all_users' },
      starterOffer: { amount: 2900, paidCredits: 100, eventBonusCredits: 5, totalCredits: 105 },
      lastPackage: null
    };
    var previewPending = { action: 'main_analysis', source: 'local_preview' };
    modalState = {
      options: { action: 'main_analysis', neededCredits: 20, currentCredits: 4 },
      pending: previewPending,
      context: previewContext,
      plan: PLANS[0],
      totalCredits: 105
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

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search || '');
  var isCreditCallback = params.has('paymentKey')
    || (params.get('fail') === '1' && ['orderId', 'amount', 'code', 'message'].some(function (key) { return params.has(key); }));
  var isSubscriptionCallback = params.get('subfail') === '1'
    || ['authKey', 'sub', 'ck'].some(function (key) { return params.has(key); });
  if (!isCreditCallback && !isSubscriptionCallback) return;

  var sensitiveKeys = [
    'paymentKey', 'orderId', 'amount', 'credits', 'plan', 'uid', 'fail', 'success', 'code', 'message',
    'authKey', 'sub', 'ck', 'subfail'
  ];
  var snapshot = {};
  sensitiveKeys.forEach(function (key) {
    if (params.has(key)) snapshot[key] = params.get(key) || '';
  });
  window.GP_PAYMENT_CALLBACK_QUERY = Object.freeze(snapshot);

  window.gpClearPaymentCallbackQuery = function () {
    var clean = new URL(window.location.href);
    sensitiveKeys.forEach(function (key) { clean.searchParams.delete(key); });
    var next = clean.pathname + (clean.searchParams.toString() ? '?' + clean.searchParams.toString() : '') + clean.hash;
    window.history.replaceState(window.history.state, '', next);
    return next;
  };

  // 결제키·주문번호·금액이 분석 SDK, 리퍼러, 화면 캡처에 남기 전에 즉시 제거한다.
  window.gpClearPaymentCallbackQuery();
})();

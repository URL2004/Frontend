// 크레딧 단가 공용 모듈(2026-08-28 P1-3) — 요금 페이지 계산기가 사용한다.
// ★단가 정본은 서버·evasion-flow와 동일해야 한다. claims-consistency 테스트가
//   evasion-flow의 공식 문자열과 이 모듈의 산출값 패리티를 함께 잠근다.
//   (감지 100자당 1 · 기본/다듬기 최소 10, 100자당 2 · 고급 1만/2만 구간 정액 200/400/600, 근거 +100)
(function () {
  'use strict';

  function detectCredit(len) {
    return Math.ceil(Math.max(0, len) / 100);
  }
  function shortCredit(len) {
    return Math.max(10, Math.ceil(Math.max(0, len) / 100) * 2);
  }
  function formalCredit(len, evidence) {
    var base = len <= 10000 ? 200 : len <= 20000 ? 400 : 600;
    return base + (evidence ? 100 : 0);
  }

  window.gpCreditPricing = {
    detectCredit: detectCredit,
    shortCredit: shortCredit,
    formalCredit: formalCredit
  };

  // 요금 페이지 계산기 UI(#gpCalc*) — 글자 수 입력 → 모드별 예상 크레딧·원화 환산
  var KRW_PER_CREDIT_MIN = 21, KRW_PER_CREDIT_MAX = 26;   // 충전 단위별 보너스 포함 단가 범위(요금표 기준)
  function won(credits) {
    var lo = (credits * KRW_PER_CREDIT_MIN).toLocaleString('ko-KR');
    var hi = (credits * KRW_PER_CREDIT_MAX).toLocaleString('ko-KR');
    return '약 ' + lo + '~' + hi + '원';
  }
  window.gpCalcUpdate = function () {
    var input = document.getElementById('gpCalcChars');
    if (!input) return;
    var len = Math.min(30000, Math.max(0, parseInt(String(input.value).replace(/[^0-9]/g, ''), 10) || 0));
    var set = function (id, credits) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = len
        ? '<b>' + credits.toLocaleString('ko-KR') + '크레딧</b><i>' + won(credits) + '</i>'
        : '<b>—</b><i>글자 수를 입력하세요</i>';
    };
    set('gpCalcDetect', detectCredit(len));
    set('gpCalcBasic', shortCredit(len));
    set('gpCalcFormal', formalCredit(len, false));
    var evNote = document.getElementById('gpCalcFormalNote');
    if (evNote) evNote.hidden = !len;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.gpCalcUpdate, { once: true });
  else window.gpCalcUpdate();
})();

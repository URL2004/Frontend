(function (global) {
  'use strict';

  var DISCLAIMER = 'AI 감지 결과는 문체 패턴을 바탕으로 한 추정치이며, 실제 작성 주체를 확정하지 않습니다.';
  var BANDS = {
    low: {
      level: 'low',
      label: 'AI 의심 낮음',
      summary: 'AI 생성 가능성 신호가 낮게 감지됐어요.',
      detail: function (p) { return '최종 점수 ' + p + '%는 낮은 구간입니다. 일부 정형적 특징은 참고 신호이며, 전체 판정은 낮은 위험입니다.'; }
    },
    moderate: {
      level: 'moderate',
      label: 'AI 의심 중간',
      summary: 'AI 생성 가능성 신호가 일부 감지됐어요.',
      detail: function (p) { return '최종 점수 ' + p + '%는 중간 구간입니다. 일부 정형적인 문체 특징이 관찰됐지만 작성 주체를 단정하기는 어렵습니다.'; }
    },
    high: {
      level: 'high',
      label: 'AI 의심 높음',
      summary: 'AI 생성 가능성 신호가 높게 감지됐어요.',
      detail: function (p) { return '최종 점수 ' + p + '%는 높은 구간입니다. 표시된 문체 특징이 점수를 높인 신호로 관찰됐습니다.'; }
    }
  };

  function probability(value) {
    if (value === null || value === undefined || value === '') return null;
    var p = Number(value);
    if (!Number.isFinite(p)) return null;
    return Math.max(0, Math.min(100, Math.round(p)));
  }

  function bandFor(value) {
    var p = probability(value);
    if (p === null) return null;
    if (p <= 20) return BANDS.low;
    if (p <= 49) return BANDS.moderate;
    return BANDS.high;
  }

  function compact(value) {
    return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  function claimsHigh(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:높|크|강)/,
      /(?:AI|인공지능|기계|자동)[^.!?\n]{0,50}(?:생성|작성|보조|의심|흔적)[^.!?\n]{0,35}(?:높|강|뚜렷|명확)/,
      /(?:AI|인공지능)[^.!?\n]{0,40}(?:작성|생성)(?:한|된)?\s*글(?:로|일)\s*(?:보|판단)/
    ].some(function (pattern) { return pattern.test(text); });
  }

  function claimsLow(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:낮|작|약)/,
      /(?:AI|인공지능|기계|자동)[^.!?\n]{0,50}(?:생성|작성|보조|의심|흔적)[^.!?\n]{0,35}(?:낮|약|없|미미)/,
      /사람이\s*(?:직접\s*)?쓴\s*글(?:로|일)\s*(?:보|판단)/
    ].some(function (pattern) { return pattern.test(text); });
  }

  function contradicts(value, level) {
    if (level === 'low') return claimsHigh(value);
    if (level === 'high') return claimsLow(value);
    return claimsHigh(value) || claimsLow(value);
  }

  function normalize(input) {
    var source = input || {};
    var p = probability(source.probability);
    var band = bandFor(p);
    if (!band) return Object.assign({}, source);
    var summary = compact(source.summary);
    var detail = compact(source.detail);
    var summaryMismatch = !summary || contradicts(summary, band.level);
    var detailMismatch = !detail || contradicts(detail, band.level);
    return Object.assign({}, source, {
      probability: p,
      riskLevel: band.level,
      riskLabel: band.label,
      summary: summaryMismatch ? band.summary : summary,
      detail: detailMismatch ? (band.detail(p) + '\n\n' + DISCLAIMER) : detail,
      narrativeConsistencyAdjusted: !!source.narrativeConsistencyAdjusted || summaryMismatch || detailMismatch
    });
  }

  global.gpNormalizeDetectPresentation = normalize;
  global.gpDetectRiskBand = bandFor;
})(window);

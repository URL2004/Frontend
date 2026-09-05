(function (global) {
  'use strict';

  var DISCLAIMER = '문체 패턴을 바탕으로 한 참고 결과이며 작성 주체나 외부 검사 결과를 확정하지 않아요.';
  var BANDS = {
    low: {
      level: 'low',
      label: 'AI식 문체 신호 · 낮음',
      summary: 'AI식 문체 신호가 낮게 감지됐어요.',
      detail: function (p) { return '문체 신호 ' + p + '/100은 낮은 구간입니다. 일부 정형적 특징은 참고 신호이며, 내용 근거는 별도로 확인해 주세요.'; }
    },
    moderate: {
      level: 'moderate',
      label: 'AI식 문체 신호 · 중간',
      summary: 'AI식 문체 신호가 일부 감지됐어요.',
      detail: function (p) { return '문체 신호 ' + p + '/100은 중간 구간이에요. 일부 정형적인 문체 특징이 관찰됐지만 작성 주체를 단정하지 않아요.'; }
    },
    high: {
      level: 'high',
      label: 'AI식 문체 신호 · 높음',
      summary: 'AI식 문체 신호가 높게 감지됐어요.',
      detail: function (p) { return '문체 신호 ' + p + '/100은 높은 구간이에요. 표시된 문체 특징이 점수를 높인 근거로 관찰됐어요.'; }
    }
  };

  function probability(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
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

  function professorRadarFor(value) {
    var p = probability(value);
    if (p === null) return { score: null, band: 'limited', label: '점수 확인 필요' };
    if (p <= 20) return { score: p, band: 'low', label: 'AI식 문체 신호 낮음' };
    if (p <= 49) return { score: p, band: 'revise', label: 'AI식 문체 신호 중간' };
    return { score: p, band: 'hard', label: 'AI식 문체 신호 높음' };
  }

  function compact(value) {
    return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  function narrative(value) {
    return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\r\n?/g, '\n').trim();
  }

  function interpretationFor(source, context) {
    if (!global.GPDetectInterpretation) return null;
    var report = source.reportView || {};
    var score = probability(source.probability);
    if (source.probability === undefined) score = probability((report.styleSignal || {}).score);
    var supplied = report.interpretation || source.interpretation;
    if (supplied && supplied.version === global.GPDetectInterpretation.VERSION
      && supplied.score === score && supplied.evidence && Array.isArray(supplied.nextSteps)
      && supplied.nextSteps.every(function (step) { return typeof step === 'string'; })
      && Array.isArray(supplied.limitations) && supplied.limitations.every(function (line) { return typeof line === 'string'; })
      && typeof supplied.label === 'string' && typeof supplied.evidence.label === 'string' && typeof supplied.evidence.reason === 'string'
      && ['ready', 'limited', 'partial', 'unavailable'].indexOf(supplied.status) >= 0
      && supplied.band === (bandFor(score) ? bandFor(score).level : 'unknown')
      && typeof supplied.headline === 'string' && typeof supplied.description === 'string') return supplied;
    var measured = report.measuredEvidence || source.measuredEvidence || {};
    // An empty editor is not evidence that a restored report analysed zero characters.
    var input = context && typeof context.inputText === 'string' && context.inputText.trim() ? context.inputText
      : typeof source.inputText === 'string' && source.inputText.trim() ? source.inputText : null;
    var sentences = measured.sentenceTotal;
    if (sentences == null) sentences = (source.sentenceMap || {}).total;
    if (sentences == null) sentences = (report.contentEvidence || {}).total;
    var modelSource = source.probSource || (report.styleSignal || {}).source || 'unknown';
    if (modelSource === 'cached_llm') modelSource = 'llm';
    return global.GPDetectInterpretation.buildDetectInterpretation({
      probability: score,
      probSource: modelSource,
      confidence: source.confidence || null,
      textLength: input !== null ? input.length : source.inputChars == null ? null : source.inputChars,
      sentenceTotal: sentences == null ? null : sentences,
      signalEvidence: Array.isArray(source.signalEvidence) ? source.signalEvidence : ((report.causeAnalysis || {}).items || []),
      causeCoverageStatus: (report.causeAnalysis || {}).status || null
    });
  }

  function interpretationText(info) {
    if (!info) return '';
    return [info.label, info.description,
      info.evidence ? info.evidence.label + '\n' + info.evidence.reason : '',
      info.nextSteps.length ? '다음으로 확인할 점\n' + info.nextSteps.map(function (step) { return '• ' + step; }).join('\n') : '',
      (info.limitations || []).join('\n')].filter(Boolean).join('\n\n');
  }

  function claimsHigh(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:높|크|강)/,
      /(?:AI식\s*)?문체\s*신호(?:가|는|도)?\s*(?:매우\s*)?높/,
      /(?:AI|인공지능|기계|자동)[^.!?\n]{0,50}(?:생성|작성|보조|의심|흔적)[^.!?\n]{0,35}(?:높|강|뚜렷|명확)/,
      /(?:AI|인공지능)[^.!?\n]{0,40}(?:작성|생성)(?:한|된)?\s*글(?:로|일)\s*(?:보|판단)/
    ].some(function (pattern) { return pattern.test(text); });
  }

  function claimsLow(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:낮|작|약)/,
      /(?:AI식\s*)?문체\s*신호(?:가|는|도)?\s*(?:매우\s*)?낮/,
      /(?:AI|인공지능|기계|자동)[^.!?\n]{0,50}(?:생성|작성|보조|의심|흔적)[^.!?\n]{0,35}(?:낮|약|없|미미)/,
      /사람이\s*(?:직접\s*)?쓴\s*글(?:로|일)\s*(?:보|판단)/
    ].some(function (pattern) { return pattern.test(text); });
  }

  function contradicts(value, level) {
    if (level === 'low') return claimsHigh(value);
    if (level === 'high') return claimsLow(value);
    return claimsHigh(value) || claimsLow(value);
  }

  function staleCalibrationNarrative(value) {
    return /(?:점수|지수|확률|원점수)[^.!?\n]{0,40}보정|보정[^.!?\n]{0,35}(?:점수|지수|확률|원점수)|(?:휴머나이징|변환)\s*이력[^.!?\n]{0,50}(?:반영|확인|조정)|확인된\s*(?:휴머나이징|변환)\s*이력/.test(value);
  }

  function numericAuthorshipClaim(value) {
    return /(?:AI|인공지능|기계|사람|인간)[^.!?\n]{0,60}(?:작성|생성|쓴|썼)[^.!?\n]{0,35}(?:확률|가능성)[^.!?\n]{0,20}\d+(?:\.\d+)?/i.test(value)
      || /(?:AI|인공지능)\s*(?:작성|생성)(?:\s*(?:비율|비중))?\s*(?:은|는|이|가|:)?\s*\d+(?:\.\d+)?\s*(?:%|퍼센트)/i.test(value);
  }

  function publicNarrative(value, info) {
    var text = narrative(value);
    if (!info || !text) return text;
    // Only stored analysis prose is handled here. Input text and quoted evidence are untouched.
    var replaced = false;
    return text.replace(/(?:[^\n.!?。！？]|\.(?=\d))+[.!?。！？]*/g, function (sentence) {
      if (!staleCalibrationNarrative(sentence) && !numericAuthorshipClaim(sentence) && !contradicts(sentence, info.band)) return sentence;
      if (replaced) return '';
      replaced = true;
      var leading = (sentence.match(/^\s*/) || [''])[0];
      return leading + info.description;
    }).trim();
  }

  function normalize(input, context) {
    var source = input || {};
    var p = probability(source.probability);
    if (source.probability === undefined) p = probability(((source.reportView || {}).styleSignal || {}).score);
    var band = bandFor(p);
    var interpretation = interpretationFor(source, context);
    if (!band) return Object.assign({}, source, {
      probability: p, interpretation: interpretation,
      summary: interpretation ? interpretation.headline : source.summary,
      detail: interpretation ? publicNarrative(source.detail, interpretation) : source.detail
    });
    var summary = narrative(source.summary);
    var detail = narrative(source.detail);
    var summaryMismatch = !summary || contradicts(summary, band.level);
    var detailMismatch = !detail || contradicts(detail, band.level);
    return Object.assign({}, source, {
      probability: p,
      riskLevel: band.level,
      riskLabel: band.label,
      summary: interpretation ? interpretation.headline : summaryMismatch ? band.summary : summary,
      detail: interpretation && detail ? publicNarrative(detail, interpretation) : detailMismatch ? (band.detail(p) + '\n\n' + DISCLAIMER) : detail,
      interpretation: interpretation,
      narrativeConsistencyAdjusted: !!source.narrativeConsistencyAdjusted || summaryMismatch || detailMismatch
    });
  }

  global.gpNormalizeDetectPresentation = normalize;
  global.gpDetectRiskBand = bandFor;
  global.gpProfessorRadarBand = professorRadarFor;
  global.gpDetectInterpretationFor = interpretationFor;
  global.gpDetectInterpretationText = interpretationText;
  global.gpDetectPublicNarrative = publicNarrative;
})(window);

(function (global) {
  'use strict';

  var DISCLAIMER = '문체 패턴을 바탕으로 한 참고 결과이며 작성 주체나 외부 검사 결과를 확정하지 않아요.';
  var BANDS = {
    low: {
      level: 'low',
      label: 'AI식 문체 점수 · 낮은 구간',
      summary: 'AI식 문체 점수가 낮은 구간이에요.',
      detail: function (p) { return 'AI식 문체 점수 ' + p + '/100은 낮은 구간입니다. 글에 나타난 AI식 표현과 전개를 종합한 점수예요.'; }
    },
    moderate: {
      level: 'moderate',
      label: 'AI식 문체 점수 · 중간 구간',
      summary: 'AI식 문체 점수가 중간 구간이에요.',
      detail: function (p) { return 'AI식 문체 점수 ' + p + '/100은 중간 구간이에요. 글에 나타난 AI식 표현과 전개를 종합한 점수예요.'; }
    },
    high: {
      level: 'high',
      label: 'AI식 문체 점수 · 높은 구간',
      summary: 'AI식 문체 점수가 높은 구간이에요.',
      detail: function (p) { return 'AI식 문체 점수 ' + p + '/100은 높은 구간이에요. 글에 나타난 AI식 표현과 전개를 종합한 점수예요.'; }
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
    if (p <= 20) return { score: p, band: 'low', label: '낮은 구간' };
    if (p <= 49) return { score: p, band: 'revise', label: '중간 구간' };
    return { score: p, band: 'hard', label: '높은 구간' };
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
    if (supplied && ['detect-interpretation-v1', 'detect-interpretation-v2', 'detect-interpretation-v3', global.GPDetectInterpretation.VERSION].indexOf(supplied.version) >= 0
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
    if (sentences == null && supplied && supplied.sample) sentences = supplied.sample.sentences;
    var modelSource = source.probSource || (report.styleSignal || {}).source || 'unknown';
    if (modelSource === 'cached_llm') modelSource = 'llm';
    return global.GPDetectInterpretation.buildDetectInterpretation({
      probability: score,
      probSource: modelSource,
      confidence: source.confidence || source.detectConfidence || null,
      textLength: input !== null ? input.length : source.inputChars == null ? null : source.inputChars,
      sentenceTotal: sentences == null ? null : sentences,
      signalEvidence: Array.isArray(source.signalEvidence) ? source.signalEvidence : Array.isArray(source.detectCauseEvidence) ? source.detectCauseEvidence : ((report.causeAnalysis || {}).items || []),
      statisticalSupport: source.statisticalSupport || source.detectStatisticalSupport || null,
      statisticalReference: source.statisticalReference || source.detectStatisticalReference || null,
      calibrationApplied: !!(source.probabilityCalibration && source.probabilityCalibration.applied),
      preCalibrationProbability: source.rawProbability,
      causeCoverageStatus: (report.causeAnalysis || {}).status || (source.detectCauseAlignment || {}).status || null
    });
  }

  // Display copy is separate from diagnostic metadata. Keep the score and
  // verified evidence unchanged; sample size does not replace the result title.
  function scoreCopy(info) {
    if (!info) return null;
    var score = probability(info.score), band = bandFor(score);
    if (!band || info.status === 'unavailable') return {
      label: '점수 확인 필요', headline: '분석 결과를 확인할 수 없어요',
      description: '저장된 결과를 다시 열거나 분석 상태를 확인해 주세요.', nextSteps: []
    };
    var pattern = info.pattern;
    var observed = pattern && pattern.locationCount > 0 && pattern.label && pattern.description;
    return {
      label: info.label || band.label,
      headline: observed ? (band.level === 'low' ? '전체 신호는 낮아요. 확인할 부분: ' : '') + pattern.label + (band.level === 'low' ? '' : '부터 살펴보세요') : band.summary,
      description: '글에 나타난 AI식 표현과 전개를 종합한 점수예요.',
      evidenceDescription: observed ? pattern.locationCount + '개 문장에서 확인한 특징: ' + pattern.description + '.' : '',
      nextSteps: observed ? (info.status === 'ready' && Array.isArray(info.nextSteps) && info.nextSteps.length
        ? info.nextSteps.slice(0, 3) : ['표시된 ' + pattern.label + ' 항목의 문장을 앞뒤 문맥과 함께 확인해 주세요.']) : []
    };
  }

  function interpretationText(info) {
    if (!info) return '';
    var copy = scoreCopy(info);
    return [copy.label, copy.description, copy.evidenceDescription,
      copy.nextSteps.length ? '다음으로 확인할 점\n' + copy.nextSteps.map(function (step) { return '• ' + step; }).join('\n') : '',
      DISCLAIMER].filter(Boolean).join('\n\n');
  }

  function claimsHigh(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:높|크|강)/,
      /(?:AI식\s*)?문체\s*신호(?:가|는|도)?\s*(?:매우\s*)?높/,
      // '높은 구간이에요/입니다'처럼 현재 결과를 단정하는 꼴만. 부정('아니에요')·과거('이었지만')·조건('이어도')은 모순이 아니다(2026-09-26 코덱스 리뷰).
      /(?:점수|문체)[^.!?\n]{0,20}높은\s*구간(?:이에요|입니다|이다|이네요|으로\s*(?:나왔|측정|판정|확인|보))/,
      /(?:AI|인공지능|기계|자동)[^.!?\n]{0,50}(?:생성|작성|보조|의심|흔적)[^.!?\n]{0,35}(?:높|강|뚜렷|명확)/,
      /(?:AI|인공지능)[^.!?\n]{0,40}(?:작성|생성)(?:한|된)?\s*글(?:로|일)\s*(?:보|판단)/
    ].some(function (pattern) { return pattern.test(text); });
  }

  function claimsLow(value) {
    var text = compact(value);
    return [
      /(?:가능성|확률|위험|의심)(?:이|은|도)?\s*(?:매우\s*)?(?:낮|작|약)/,
      /(?:AI식\s*)?문체\s*신호(?:가|는|도)?\s*(?:매우\s*)?낮/,
      /(?:점수|문체)[^.!?\n]{0,20}낮은\s*구간(?:이에요|입니다|이다|이네요|으로\s*(?:나왔|측정|판정|확인|보))/,
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
      if (/문체\s*특징[^.!?]{0,25}점수를\s*높인\s*(?:근거|신호)|점수에\s*(?:연결된|반영된)\s*(?:판단\s*)?원인/.test(sentence)) {
        return '원문에서 확인한 문체 특징을 아래에서 살펴보세요.';
      }
      if (!staleCalibrationNarrative(sentence) && !numericAuthorshipClaim(sentence) && !contradicts(sentence, info.band)) return sentence;
      if (replaced) return '';
      replaced = true;
      var leading = (sentence.match(/^\s*/) || [''])[0];
      return leading + scoreCopy(info).description;
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
      summary: interpretation ? scoreCopy(interpretation).headline : source.summary,
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
      summary: interpretation ? scoreCopy(interpretation).headline : summaryMismatch ? band.summary : summary,
      detail: interpretation && detail ? publicNarrative(detail, interpretation) : detailMismatch ? (band.detail(p) + '\n\n' + DISCLAIMER) : detail,
      interpretation: interpretation,
      narrativeConsistencyAdjusted: !!source.narrativeConsistencyAdjusted || summaryMismatch || detailMismatch
    });
  }

  function historyComparisonText(result) {
    var comparison = result && result.historyComparison;
    if (!comparison || comparison.version !== 'humanize-comparison-v1' || comparison.basis !== 'history_adjusted_style') return '';
    var before = probability(comparison.sourceProbability);
    var after = probability(comparison.probability);
    if (after === null || after !== probability(result.probability)) return '';
    // Adjustment metadata remains in the response. Do not present an adjusted
    // delta as pure writing improvement when adjustment details are not shown.
    if (before === null || comparison.calibrationApplied === true) return '';
    var delta = after - before;
    var change = delta < 0 ? Math.abs(delta) + '점 감소' : delta > 0 ? delta + '점 증가' : '점수 변화 없음';
    return '원글 ' + before + '점 → 휴머나이징 후 ' + after + '점 · ' + change + '. 같은 서비스에서 검사한 문체 신호 점수 비교예요.';
  }

  // Read-only history adapter. Never re-score or re-run a saved analysis.
  // Only a matching response snapshot may supply missing presentation fields.
  function historySource(record) {
    var row = record || {}, cache = row.detectResponseCache;
    var snapshot = cache && typeof cache === 'object' && !Array.isArray(cache)
      && probability(row.probability) !== null && probability(cache.probability) === probability(row.probability)
      && (!row.detectorVersion || cache.detectorVersion === row.detectorVersion)
      && (!cache.inputText || cache.inputText === row.inputText) ? cache : {};
    var result = Object.assign({}, row);
    ['reportView', 'measuredEvidence', 'sentenceMap', 'paragraphs', 'signalEvidence'].forEach(function (key) {
      if (result[key] == null && snapshot[key] != null) result[key] = snapshot[key];
    });
    // History locations use the original UTF-16 coordinates, not projected UI IDs.
    var evidence = Array.isArray(row.detectCauseEvidence) ? row.detectCauseEvidence
      : Array.isArray(result.signalEvidence) ? result.signalEvidence : ((result.reportView || {}).causeAnalysis || {}).items || [];
    if (!Array.isArray(evidence)) evidence = [];
    var text = typeof row.inputText === 'string' ? row.inputText : '';
    result.signalEvidence = evidence.filter(function (item) { return item && typeof item === 'object'; }).map(function (item) {
      var seen = {};
      var locations = item.locationStatus === 'source_range_verified' && Array.isArray(item.locations)
        ? item.locations.filter(function (loc) {
          if (!loc || !Number.isSafeInteger(loc.sentenceIndex) || loc.sentenceIndex < 0
            || !Number.isSafeInteger(loc.start) || !Number.isSafeInteger(loc.end)
            || loc.start < 0 || loc.end <= loc.start || loc.end > text.length || !text.slice(loc.start, loc.end).trim()) return false;
          var key = loc.start + ':' + loc.end;
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        }) : [];
      return Object.assign({}, item, { locations: locations, locationStatus: locations.length ? 'source_range_verified' : 'unlocated' });
    });
    return result;
  }

  function historySections(record) {
    var source = historySource(record), view = normalize(source), info = view.interpretation;
    var sections = [];
    var add = function (title, text) { if (typeof text === 'string' && text.trim()) sections.push({ title: title, text: text.trim() }); };
    add('분석 요약', view.summary);
    // Use the public descriptor, not the stored diagnostic prose. That prose
    // contains sample-size / calibration notices deliberately absent in the UI.
    add('점수 안내', interpretationText(info));
    add('휴머나이징 전후 비교', historyComparisonText(view));
    // Retain useful legacy analysis, excluding only diagnostic/template copy.
    // Never apply this filter to the user's original text or evidence quotes.
    var template = info ? [info.description, info.evidence && info.evidence.reason]
      .concat(info.nextSteps || [], info.limitations || [], [scoreCopy(info).description, DISCLAIMER]) : [];
    var legacy = narrative(source.detail);
    template.filter(Boolean).forEach(function (line) { legacy = legacy.split(line).join(''); });
    legacy = publicNarrative(legacy, info).split(/\n+/).filter(function (line) {
      return line.trim() && !/짧은\s*글|문장\s*수가\s*적|문장이\s*(?:적어|충분하지)|분석\s*근거\s*제한|근거가\s*제한|해석에\s*주의|비교하기\s*어려|보정|작성\s*주체.*확정/.test(line)
        && !(info && line.includes(scoreCopy(info).description));
    }).join('\n\n');
    add('상세 분석', legacy);
    if (typeof global.gpDetectHistoryMetrics === 'function') {
      global.gpDetectHistoryMetrics(source).forEach(function (section) { add(section.title, section.text); });
    }
    var labels = global.GPDetectInterpretation && global.GPDetectInterpretation.PATTERN_LABELS || {};
    var scopes = { isolated: '일부 문장', recurring: '여러 문장', pervasive: '글 전반' };
    var strengths = { weak: '약함', moderate: '뚜렷함', strong: '강함' };
    var causes = source.signalEvidence.filter(function (item) { return item.locations.length && labels[item.category]; }).map(function (item) {
      var label = labels[item.category];
      var title = (typeof label === 'string' ? label : label.label) || item.categoryLabel;
      return [title, [scopes[item.scope], strengths[item.strength]].filter(Boolean).join(' · '),
        item.locations.map(function (loc) { return '“' + source.inputText.slice(loc.start, loc.end) + '”'; }).join('\n')].filter(Boolean).join('\n');
    });
    add('원문에서 확인한 문체 특징', causes.join('\n\n'));
    return sections;
  }

  global.gpDetectHistorySource = historySource;
  global.gpDetectHistorySections = historySections;
  global.gpDetectHistoryComparisonText = historyComparisonText;
  global.gpDetectScoreCopy = scoreCopy;
  global.gpNormalizeDetectPresentation = normalize;
  global.gpDetectRiskBand = bandFor;
  global.gpProfessorRadarBand = professorRadarFor;
  global.gpDetectInterpretationFor = interpretationFor;
  global.gpDetectInterpretationText = interpretationText;
  global.gpDetectPublicNarrative = publicNarrative;
})(window);

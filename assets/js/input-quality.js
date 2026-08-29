(function (root) {
  'use strict';

  var MESSAGE = '문장으로 인식하기 어려운 반복 입력이에요. 의미가 있는 문장이나 문단을 붙여넣어 주세요.';

  function countMatches(text, pattern) {
    return (String(text || '').match(pattern) || []).length;
  }

  function repeatedPattern(signal) {
    var length = signal.length;
    if (length < 24) return false;
    var maxUnit = Math.min(16, Math.floor(length / 4));
    for (var unit = 1; unit <= maxUnit; unit += 1) {
      var matches = 0;
      for (var index = 0; index < length; index += 1) {
        if (signal.charAt(index) === signal.charAt(index % unit)) matches += 1;
      }
      if (length / unit >= 4 && matches / length >= 0.94) return true;
    }
    return false;
  }

  function assess(text) {
    var compact = String(text || '').replace(/\s+/g, '');
    if (compact.length < 24) return { readable: true, reason: null };

    var jamo = countMatches(compact, /[ㄱ-ㅎㅏ-ㅣ]/g);
    var hangulSyllables = countMatches(compact, /[가-힣]/g);
    if (jamo >= 16 && jamo / compact.length >= 0.65 && hangulSyllables < 8) {
      return { readable: false, reason: 'standalone_hangul_jamo' };
    }

    var signal = compact.replace(/[^A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
    if (repeatedPattern(signal)) return { readable: false, reason: 'repeated_pattern' };

    if (signal.length >= 32) {
      var unique = Object.create(null);
      for (var index = 0; index < signal.length; index += 1) unique[signal.charAt(index)] = true;
      var uniqueCount = Object.keys(unique).length;
      if (uniqueCount <= 5 && uniqueCount / signal.length <= 0.16) {
        return { readable: false, reason: 'low_character_variety' };
      }
    }

    return { readable: true, reason: null };
  }

  function lengthBucket(length) {
    if (length < 100) return '24_99';
    if (length < 500) return '100_499';
    if (length < 2000) return '500_1999';
    return '2000_plus';
  }

  root.gpInputQuality = {
    assess: assess,
    message: MESSAGE,
    lengthBucket: lengthBucket
  };
})(typeof window !== 'undefined' ? window : globalThis);

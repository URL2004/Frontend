(function (global) {
  'use strict';

  // Backend/lib/humanizePricing.js와 함께 유지하는 고급 휴머나이징 공개 가격 계약.
  var policy = Object.freeze({
    base: Object.freeze({
      includedLength: 3000,
      includedCredits: 100,
      mediumMaxLength: 10000,
      mediumMaxCredits: 200,
      mediumStepLength: 350,
      longMaxLength: 30000,
      longStepLength: 250,
      stepCredits: 5,
      maxCredits: 600
    }),
    evidence: Object.freeze({
      includedLength: 3000,
      includedCredits: 50,
      graduatedMaxLength: 10000,
      stepLength: 700,
      stepCredits: 5,
      maxCredits: 100
    })
  });

  function normalizedLength(length) {
    return Math.max(0, Number(length) || 0);
  }

  function advancedBaseCredits(length) {
    var len = normalizedLength(length);
    var base = policy.base;

    if (len <= base.includedLength) return base.includedCredits;
    if (len <= base.mediumMaxLength) {
      return Math.min(
        base.mediumMaxCredits,
        base.includedCredits
          + base.stepCredits * Math.ceil((len - base.includedLength) / base.mediumStepLength)
      );
    }
    if (len <= base.longMaxLength) {
      return Math.min(
        base.maxCredits,
        base.mediumMaxCredits
          + base.stepCredits * Math.ceil((len - base.mediumMaxLength) / base.longStepLength)
      );
    }
    return base.maxCredits;
  }

  function advancedEvidenceCredits(length) {
    var len = normalizedLength(length);
    var evidence = policy.evidence;

    if (len <= evidence.includedLength) return evidence.includedCredits;
    if (len <= evidence.graduatedMaxLength) {
      return Math.min(
        evidence.maxCredits,
        evidence.includedCredits
          + evidence.stepCredits * Math.floor((len - evidence.includedLength) / evidence.stepLength)
      );
    }
    return evidence.maxCredits;
  }

  function advancedCredits(length, evidenceEnabled) {
    return advancedBaseCredits(length)
      + (evidenceEnabled ? advancedEvidenceCredits(length) : 0);
  }

  global.gpHumanizePricing = Object.freeze({
    policy: policy,
    advancedBaseCredits: advancedBaseCredits,
    advancedEvidenceCredits: advancedEvidenceCredits,
    advancedCredits: advancedCredits
  });
})(window);

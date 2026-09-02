/* 회피 모드 워크스페이스 — P0 정적 목업 (더미 데이터, 백엔드 미연결) */
(function () {
  function $(id) { return document.getElementById(id); }
  var SIGNUP_GRANT_CREDITS = 20;
  var SHORT_HUMANIZE_MIN_CREDITS = 10;
  function shortHumanizeCredit(len) {
    return Math.max(SHORT_HUMANIZE_MIN_CREDITS, Math.ceil((Number(len) || 0) / 100) * 2);
  }
  function bareLength(text) {
    return String(text || '').replace(/\s/g, '').length;
  }
  function shortEstimateSec(text) {
    return Math.max(90, Math.min(1200, Math.round(bareLength(text) / 12)));
  }
  function roundUpFiveMinuteSec(seconds) {
    return Math.ceil(Math.max(0, Number(seconds) || 0) / 300) * 300;
  }
  function formalEstimateRange(text, evidence) {
    var bare = bareLength(text);
    var server = lastDiag && lastDiag.advancedTimeEstimate;
    var serverMatchesText = server
      && Number(server.sourceBareLength) === bare
      && Number(server.lowSec) > 0
      && Number(server.highSec) >= Number(server.lowSec);
    if (serverMatchesText) {
      var serverLow = Number(server.lowSec);
      var serverHigh = Number(server.highSec);
      if (evidence && server.evidenceIncluded !== true) {
        serverLow = roundUpFiveMinuteSec(serverLow + 480);
        serverHigh = roundUpFiveMinuteSec(serverHigh + 480);
      }
      return { lowSec: serverLow, highSec: serverHigh, basis: server.basis || 'v2_editable_chunk_range' };
    }
    // 진단 API가 잠시 실패한 경우에만 쓰는 보수적 폴백. 한 점을 확정하지 않고
    // 길이 기반의 넓은 범위를 보여 주며, 실제 시작 응답이 오면 서버 범위로 교체한다.
    var extra = evidence ? 480 : 0;
    var low = roundUpFiveMinuteSec(Math.max(240, Math.min(4500, 180 + (bare * 0.08) + extra)));
    var high = roundUpFiveMinuteSec(Math.max(low + 300, Math.min(5400, 360 + (bare * 0.22) + extra)));
    return { lowSec: low, highSec: high, basis: 'length_range_fallback' };
  }
  function estimateTimeLabel(seconds) {
    return '약 ' + Math.max(1, Math.round((Number(seconds) || 0) / 60)) + '분';
  }
  function estimateTimeRangeLabel(range) {
    var low = Math.max(1, Math.round((Number(range && range.lowSec) || 0) / 60));
    var high = Math.max(low, Math.round((Number(range && range.highSec) || 0) / 60));
    return low === high ? '약 ' + high + '분' : '약 ' + low + '~' + high + '분';
  }
  function estimateRangeFromPayload(payload, fallback) {
    var root = payload || {};
    var job = root.job || {};
    var low = Number(root.estLowSec || job.estLowSec);
    var high = Number(root.estHighSec || job.estHighSec || root.estSec || job.estSec);
    if (low > 0 && high >= low) {
      return { lowSec: low, highSec: high, basis: root.estimateBasis || job.estimateBasis || 'server' };
    }
    return fallback;
  }
  function advancedCredit(len, evidence) {
    return window.gpHumanizePricing.advancedCredits(len, evidence);
  }

  // ── 예상 비용(C) ─────────────────────────────────────────────────────────────
  // 붙여넣는 즉시 "이 글이 얼마인지"를 보여준다. 종전에는 회피 설정 화면(lavCtaMeta)에
  // 도달해야 금액을 처음 봤고, 그 지점에서 잔액이 모자라면 4단계를 투자한 뒤 막혔다.
  // 단가는 위 shortHumanizeCredit(기본 휴머나이징)·감지 100자당 1크레딧과 같은 소스를 쓴다.
  var DETECT_MIN_CHARS = 100;
  var CREDIT_WON = 5900 / 210;   // 현재 스타터(5,900원) 총 지급량 기준 예상 결제금액
  function detectCredit(len) {
    return Math.ceil((Number(len) || 0) / 100);
  }
  function wonLabel(credits) {
    return '약 ' + (Math.round(credits * CREDIT_WON / 10) * 10).toLocaleString('ko-KR') + '원';
  }
  function estimateBalance() {
    return Math.max(0, Number(window.UC) || 0);
  }
  function estimateState() {
    var src = $('lavInput');
    var text = src ? src.value : '';
    var detect = window.lavMode === 'detect';
    return {
      text: text,
      len: text.length,
      detect: detect,
      cost: detect ? detectCredit(text.length) : shortHumanizeCredit(text.length)
    };
  }
  function setEstimateText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }
  window.lavUpdateEstimate = function () {
    var box = $('lavEstimate');
    if (!box) return;
    var st = estimateState();
    // 입력이 비었거나 작업 화면(lavFlow)이 열려 있으면 감춘다 — 입력 화면 전용 장치다.
    var flow = $('lavFlow');
    if (!st.len || (flow && !flow.hidden)) { box.hidden = true; return; }
    box.hidden = false;

    var cta = $('lavEstimateCta');
    var note = $('lavEstimateNote');
    var tooShort = st.detect && st.len < DETECT_MIN_CHARS;
    var tooLong = st.len > (window.LAV_MAX_CHARS || 30000);

    setEstimateText('lavEstimateMode', st.detect ? 'AI 감지' : '기본 휴머나이징');
    setEstimateText('lavEstimateCost', tooShort ? '—' : st.cost.toLocaleString('ko-KR') + '크레딧');
    setEstimateText('lavEstimateWon', tooShort ? '' : wonLabel(st.cost));

    var messages = [];
    if (tooLong) messages.push('한 번에 최대 ' + (window.LAV_MAX_CHARS || 30000).toLocaleString('ko-KR') + '자까지 처리할 수 있어요.');
    else if (tooShort) messages.push('AI 감지는 ' + DETECT_MIN_CHARS + '자 이상부터 이용할 수 있어요.');
    else if (!st.detect && st.len >= 3000) messages.push('고급 휴머나이징은 입력 길이에 따라 ' + advancedCredit(st.len, false).toLocaleString('ko-KR') + '크레딧이에요.');

    if (!window.CU && !window.GP_HERO_PREVIEW) {
      setEstimateText('lavEstimateBalance', '');
      if (cta) { cta.hidden = false; cta.textContent = '로그인하고 무료 ' + SIGNUP_GRANT_CREDITS + '크레딧 받기'; cta.dataset.action = 'login'; }
      messages.unshift('가입하면 ' + SIGNUP_GRANT_CREDITS + '크레딧을 무료로 드려요.');
    } else if (window.UP === 'unlimited') {
      setEstimateText('lavEstimateBalance', '구독 이용 중');
      if (cta) { cta.hidden = true; cta.dataset.action = ''; }
    } else {
      var balance = estimateBalance();
      var gap = st.cost - balance;
      if (tooShort || tooLong || gap <= 0) {
        setEstimateText('lavEstimateBalance', '보유 ' + balance.toLocaleString('ko-KR') + '크레딧'
          + (tooShort || tooLong ? '' : ' · 작업 후 ' + (balance - st.cost).toLocaleString('ko-KR') + '크레딧'));
        if (cta) { cta.hidden = true; cta.dataset.action = ''; }
      } else {
        setEstimateText('lavEstimateBalance', '보유 ' + balance.toLocaleString('ko-KR') + '크레딧');
        if (cta) {
          cta.hidden = false;
          cta.textContent = gap.toLocaleString('ko-KR') + '크레딧 부족 · 충전하기';
          cta.dataset.action = 'charge';
        }
        messages.unshift('입력한 글은 그대로 보관하고, 결제 후 이 화면으로 돌아와요.');
      }
    }

    box.classList.toggle('is-short', !!(cta && !cta.hidden && cta.dataset.action === 'charge'));
    if (note) {
      note.hidden = !messages.length;
      note.textContent = messages.join(' ');
    }
    return st;
  };

  window.lavEstimateAction = function () {
    var st = estimateState();
    var cta = $('lavEstimateCta');
    var action = cta && cta.dataset ? cta.dataset.action : '';
    if (action === 'login' || !window.CU) {
      if (window.gpTrack) window.gpTrack('login_required', { source: 'composer_estimate' });
      if (typeof window.showScreen === 'function') window.showScreen('login');
      return;
    }
    if (window.gpTrack) {
      window.gpTrack('composer_estimate_click', {
        analysis_mode: st.detect ? 'detect' : 'humanize',
        needed_credits: st.cost,
        current_credits: estimateBalance()
      });
    }
    if (typeof window.gpOpenCreditCheckout !== 'function') {
      if (typeof window.switchTab === 'function') window.switchTab('pricing');
      return;
    }
    window.gpOpenCreditCheckout({
      action: 'composer_draft',
      source: 'composer_estimate',
      neededCredits: st.cost,
      currentCredits: estimateBalance(),
      payload: { text: st.text, mode: st.detect ? 'detect' : 'humanize' }
    });
  };

  // 결제 후 복귀: 아직 시작하지 않은 초안이므로 작업을 실행하지 않고 입력 상태만 되살린다.
  window.gpResumeComposerDraft = function (payload) {
    payload = payload || {};
    if (typeof window.switchTab === 'function') window.switchTab('main');
    if (typeof window.lavSetMode === 'function') window.lavSetMode(payload.mode === 'detect' ? 'detect' : 'humanize');
    var src = $('lavInput');
    if (src && payload.text) {
      src.value = String(payload.text);
      if (typeof window.lavSyncCount === 'function') window.lavSyncCount(src);
      src.focus();
    }
    window.lavUpdateEstimate();
    return true;
  };

  // Before/After 러너: proof 블록이 화면에 들어올 때 1회 달리기 재생(스크롤 밖에서 끝나버리는 문제 해결)
  function initProofRunner() {
    var proof = document.querySelector('.gp-lav-proof');
    if (!proof) return;
    function run() {
      proof.classList.remove('run');
      void proof.offsetWidth; // reflow로 애니 재시작
      proof.classList.add('run');
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) run(); });
      }, { threshold: 0.45 });
      io.observe(proof);
    } else {
      run();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProofRunner);
  } else {
    initProofRunner();
  }

  var STEP_LABEL = {
    analyzing: '분석', report: 'AI 감지 · 교수님 레이더', select: '방법 선택',
    detectError: 'AI 감지 다시 시도', job: '휴머나이징 중', blocked: '다시 시도', done: '완료'
  };

  // 입력 화면 → 워크스페이스 화면 전환(페이지 전환)
  function enterWorkspace() {
    var entry = $('lavEntry'), flow = $('lavFlow'), hero = document.querySelector('.gp-lav-hero');
    if (entry) entry.hidden = true;
    if (flow) flow.hidden = false;
    if (hero) hero.classList.add('flow-active');
    var top = document.querySelector('.gp-lav-main');
    if (top) top.scrollTo ? top.scrollTo({ top: 0 }) : (top.scrollTop = 0);
  }
  function exitWorkspace() {
    var entry = $('lavEntry'), flow = $('lavFlow'), hero = document.querySelector('.gp-lav-hero');
    if (flow) flow.hidden = true;
    if (entry) entry.hidden = false;
    if (hero) hero.classList.remove('flow-active');
  }

  function show(name) {
    var flow = $('lavFlow');
    if (!flow) return;
    if (name !== 'job') clearCancelWindow();   // job 화면을 벗어나면 30초 취소 버튼·타이머 정리
    enterWorkspace();
    flow.querySelectorAll('.lav-flow-card').forEach(function (c) {
      var on = c.getAttribute('data-flow') === name;
      c.hidden = !on;
      if (on) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
    });
    flow.dataset.step = name;
    var label = $('lavFlowStep'); if (label) label.textContent = STEP_LABEL[name] || '';
    var ctx = $('lavFlowCtx'), src = $('lavInput');
    if (ctx && src) ctx.textContent = '원문 ' + (src.value || '').length.toLocaleString() + '자';   // 글자수 통일: 공백 포함(과금·메인 컴포저와 동일)
    // 뒤로 버튼: 선택·보고서·감지 실패에서만 표시한다.
    var back = document.querySelector('.lav-flow-back');
    if (back) back.style.visibility = (name === 'select' || name === 'report' || name === 'detectError') ? 'visible' : 'hidden';
    var edit = document.querySelector('.lav-flow-edit');
    if (edit) edit.hidden = name === 'analyzing' || name === 'job' || name === 'blocked' || name === 'done' || name === 'detectError';
    if (name === 'report') {
      requestAnimationFrame(function () {
        var report = flow.querySelector('[data-flow="report"]');
        var heading = $('gpRepHeading');
        if (heading && typeof heading.focus === 'function') {
          try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); }
        }
        var live = $('gpRepLive');
        if (report && live) {
          live.textContent = '';
          requestAnimationFrame(function () {
            live.textContent = report.dataset.announcement || 'AI 감지 분석이 완료됐어요.';
          });
        }
      });
    }
  }

  // /diagnose 실패 시 글 길이로 등급을 추측하지 않는다. 기본 처리값으로
  // 서비스는 이어가되, 확인하지 못한 위험을 사용자에게 사실처럼 말하지 않는다.
  function fakeDiagnose() {
    return {
      grade: null,
      diagnosisUnavailable: true,
      diagnosisSource: 'fallback',
      needsUserAnchor: false,
      recommendedMode: 'blog',
      bands: { polish: '확인 필요', blog: '확인 필요', restructure: '확인 필요' }
    };
  }

  var lastDiag = null;   // 결과 화면의 예상 밴드 표기에 재사용
  var toneSelectionTouched = false;
  // 고신뢰 과제·논문 판정과 복잡한 구조를 함께 확인한 글에만 고급을 추천한다.
  // 추천 배지는 선택을 대신하지 않으며 사용자가 카드를 눌러야 실제 모드가 정해진다.
  var MODE_RECOMMENDATION_ENABLED = true;
  // 고급 추천 길이 하한. 서버 판정(advancedRouting)은 공백 제외 1,500자부터 고급을 추천하지만,
  // 짧은 글에서는 고급과 기본의 가격 차이가 커 배지와 금액이 서로 싸운다. 고급 단계형 요금과
  // 기본 종량 요금의 차액이 80크레딧 이하로 좁혀지는 3,000자부터만 배지를 띄워,
  // 뜰 때마다 가격 근거가 서게 한다.
  var ADVANCED_RECOMMEND_MIN_CHARS = 3000;
  // 고급 카드의 '기본 대비 차액' 노출 상한. 짧은 글에서는 고급이 기본의 5~10배라
  // 차액을 적어 두면 구매를 막는 문구가 된다(600자면 +188). 두 카드에 각자 금액이
  // 이미 찍히므로, 차액은 실제로 좁혀졌을 때(3,000자·1만 자처럼 구간 상한 부근)만 보여준다.
  var ADVANCED_GAP_HINT_MAX_CREDITS = 80;

  function advancedRecommendationLengthMet() {
    var src = $('lavInput');
    var text = src && src.value ? src.value : '';
    return text.replace(/\s/gu, '').length >= ADVANCED_RECOMMEND_MIN_CHARS;
  }
  var lavMemoOverride = '';   // 차단 화면 인라인 메모(재도전 시 1회 사용) — 사전 메모 아코디언 제거(2026-08-28) 후 유일한 사전 메모 경로

  function advancedUnavailable(d) {
    if (!d) return false;
    if (d.advancedEligible === false) return true;
    // 구형 백엔드 응답과의 짧은 배포 순서 호환. v2.4.11부터는
    // 한국어 장르 판정만으로 고급을 잠그지 않고 advancedEligible을 명시한다.
    return d.advancedEligible == null && d.restructureUnfit === true;
  }

  function resetToneChoice() {
    toneSelectionTouched = false;
    lavMemoOverride = '';   // 새 진단 = 새 흐름 — 차단 재도전 메모 초기화
    var blogRadio = document.querySelector('input[name="lavTone"][value="blog"]');
    if (blogRadio) blogRadio.checked = true;
  }

  function diagnosisPresentation(d) {
    if (d && d.reportContext) {
      var reportView = d.reportView || {};
      var synthesis = d.reportSynthesis || reportView.synthesis || {};
      var contentEvidence = d.contentEvidence || reportView.contentEvidence || {};
      var state = contentEvidence.status === 'strong' ? 'ready'
        : contentEvidence.status === 'weak' ? 'needs-info'
        : 'partial';
      return {
        state: state,
        title: synthesis.headline || d.title || '감지 결과를 이어서 확인해요',
        desc: synthesis.description || d.desc || '확인한 문체 신호와 내용 근거를 바탕으로 방법을 골라 주세요.',
        meta: d.reportMeta || ''
      };
    }
    if (d && d.diagnosisUnavailable) {
      return {
        state: 'neutral',
        title: '맞춤 진단을 불러오지 못했어요',
        desc: '기본 설정으로 계속 진행할 수 있어요.'
      };
    }
    var grade = String(d && d.grade || 'B').toUpperCase();
    if (grade === 'A') {
      return {
        state: 'ready',
        title: '구체성이 충분해요',
        desc: '사례와 정보는 유지하고 필요한 표현만 다듬어요.'
      };
    }
    if (grade === 'C') {
      return {
        state: 'needs-info',
        title: '구체적인 근거가 부족해요',
        desc: '일반적인 표현이 많아 문장만 바꿔도 비슷하게 느껴질 수 있어요.'
      };
    }
    return {
      state: 'partial',
      title: '일부 표현이 추상적이에요',
      desc: '구체적인 내용은 지키고 일반적인 표현만 골라 다듬어요.'
    };
  }

  function trackDiagnosisView(d) {
    if (!window.gpTrack) return;
    window.gpTrack('humanize_diagnosis_view', {
      diagnosis_grade: d && d.grade || 'unavailable',
      diagnosis_source: d && d.diagnosisSource || 'backend',
      needs_user_anchor: !!(d && d.needsUserAnchor),
      document_profile: d && d.documentProfile || 'unknown',
      recommendation_exposed: MODE_RECOMMENDATION_ENABLED
    });
  }

  function isRecommendedMode(mode) {
    if (!MODE_RECOMMENDATION_ENABLED || mode === 'polish') return false;
    var formal = !advancedUnavailable(lastDiag)
      && advancedRecommendationLengthMet()
      && !!(lastDiag && lastDiag.recommendedMode === 'formal');
    return mode === (formal ? 'formal' : 'blog');
  }

  function trackModeSelection(mode) {
    if (!window.gpTrack) return;
    window.gpTrack('humanize_mode_select', {
      selected_mode: mode,
      is_recommended: isRecommendedMode(mode),
      diagnosis_grade: lastDiag && lastDiag.grade || 'unavailable',
      needs_user_anchor: !!(lastDiag && lastDiag.needsUserAnchor),
      document_profile: lastDiag && lastDiag.documentProfile || 'unknown'
    });
  }

  function applyDiag(d) {
    lastDiag = d;
    var view = diagnosisPresentation(d);
    var summary = $('lavChoiceSummary');
    if (summary) summary.dataset.state = view.state;
    if ($('lavDiagTitle')) $('lavDiagTitle').textContent = view.title;
    if ($('lavDiagDesc')) $('lavDiagDesc').textContent = view.desc;
    var meta = $('lavDiagMeta');
    if (meta) {
      meta.textContent = view.meta || '';
      meta.hidden = !view.meta;
    }
    var b = d.bands || {};
    if ($('lavBandPolish') && b.polish) $('lavBandPolish').textContent = b.polish;
    if ($('lavBandBlog') && b.blog) $('lavBandBlog').textContent = b.blog;
    if ($('lavBandRestr') && b.restructure) $('lavBandRestr').textContent = b.restructure;
  }

  // P1 연결: 결정론 /diagnose(무과금) — 실패 시 폴백 진단으로 흐름 유지.
  window.lavFlowDiagnose = function () {
    var src = $('lavInput');
    var text = src ? src.value : '';
    if (typeof window.lavEnsureReadableInput === 'function' && !window.lavEnsureReadableInput(text)) return;
    resetToneChoice();
    cameFromReport = false;   // 진단 경유 동선 — 방법선택 뒤로가기는 입력 화면으로
    show('analyzing');
    var minWait = new Promise(function (r) { setTimeout(r, 900); });   // 스피너 최소 노출(즉답이면 화면이 깜빡임)
    console.info('[evasion] API_BASE =', window.apiBase ? window.apiBase() : '?');
    var req = fetch(window.apiUrl('/diagnose'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    }).catch(function (e) { console.warn('[evasion] /diagnose 실패 — 폴백 진단 사용:', e && e.message); return null; });
    Promise.all([req, minWait]).then(function (out) {
      var response = out[0];
      var d = response && response.body;
      if (response && response.status === 422 && d && d.code === 'UNREADABLE_INPUT') {
        exitWorkspace();
        if (typeof window.lavShowInputError === 'function') window.lavShowInputError(d.error, d.reason || 'unreadable_input', true);
        return;
      }
      var backendOk = !!(response && response.ok && d && d.ok);
      if (!backendOk) console.warn('[evasion] 진단 폴백 동작 중 — 백엔드 미연결 상태(블로그 변환은 실패함)');
      var diag = backendOk ? d : fakeDiagnose();
      diag.diagnosisSource = backendOk ? 'backend' : 'fallback';
      applyDiag(diag);
      applyAdvancedRouting();   // 3택 화면 진입 시 고급 사용 가능 여부를 즉시 반영
      applyUseCasePreset();     // 광고 use_case 맥락 → 세부 설정 글 종류 프리셋(P0-6, 1회만)
      renderSelectCosts();
      renderDetailSummary();    // 접힌 세부 설정에 현재 값(프리셋 포함) 표시
      show('select');
      trackDiagnosisView(diag);
    });
  };

  // 광고 용도 맥락(use_case, head-tracking이 파생·보존) → 글 종류 세부 설정 프리셋.
  // 자동 판별이 기본이고 서버도 원문 장르가 뚜렷하면 자동을 우선하므로, 비어 있을 때 1회만 살짝 채운다.
  var useCasePresetDone = false;
  var USE_CASE_PROFILE = { assignment: 'report_assignment', resume: 'resume_application', paper: 'academic_paper', blog: 'review_blog' };
  function applyUseCasePreset() {
    if (useCasePresetDone) return;
    useCasePresetDone = true;
    try {
      var ctx = window.gpAttribution && window.gpAttribution.getContext ? window.gpAttribution.getContext() : null;
      var profile = ctx && USE_CASE_PROFILE[ctx.use_case];
      var select = $('lavDocumentProfile');
      if (profile && select && !select.value) {
        select.value = profile;
        if (window.lavDocumentProfileChange) window.lavDocumentProfileChange();
      }
    } catch (e) { /* 프리셋 실패 시 자동 판별 유지 */ }
  }

  window.lavFlowGo = function (name) {
    show(name);
  };

  // v2 진단 결과에 따라 고급 선택 가능 여부를 동기화한다. 모드 추천 기능은
  // 플래그가 닫힌 동안 세 카드를 중립적으로 유지하고 기본 라디오만 초기화한다.
  function applyAdvancedRouting() {
    var unfit = advancedUnavailable(lastDiag);
    var recommendAdvanced = MODE_RECOMMENDATION_ENABLED
      && !unfit
      && advancedRecommendationLengthMet()
      && !!(lastDiag && lastDiag.recommendedMode === 'formal');
    var formalRadio = document.querySelector('input[name="lavTone"][value="formal"]');
    var blogRadio = document.querySelector('input[name="lavTone"][value="blog"]');
    if (formalRadio) {
      formalRadio.disabled = unfit;
      if (unfit && formalRadio.checked && blogRadio) blogRadio.checked = true;   // 고급 선택돼 있었으면 기본으로
      if (!unfit && !toneSelectionTouched) formalRadio.checked = recommendAdvanced;
    }
    if (!toneSelectionTouched && blogRadio) blogRadio.checked = !recommendAdvanced || unfit;
    // 고급 카드 잠금 표시 + 근거 체크박스 동반 잠금
    var formalCard = $('lavCardFormal');
    if (formalCard) { formalCard.classList.toggle('is-locked', unfit); formalCard.disabled = unfit; }
    var lockNote = $('lavFormalLockNote');
    if (lockNote) {
      lockNote.hidden = !unfit;
      if (unfit) lockNote.textContent = (lastDiag && lastDiag.restructureUnfitReason) || '원문 보존이 중요한 글이에요. 기본 휴머나이징을 선택해 주세요.';
    }
    // 근거 보강은 모달 안 옵션(2026-08-29) — 잠긴 글에선 비활성화만 걸어두고 노출은 lavOpenConfirm이 판단
    var ev = $('lavEvidence'); if (ev) { ev.disabled = unfit; if (unfit) ev.checked = false; }
    var basicRecommended = $('lavBasicRecommended');
    var formalRecommended = $('lavFormalRecommended');
    if (basicRecommended) basicRecommended.hidden = !MODE_RECOMMENDATION_ENABLED || recommendAdvanced;
    if (formalRecommended) formalRecommended.hidden = !MODE_RECOMMENDATION_ENABLED || !recommendAdvanced || unfit;
    var basicCard = $('lavCardBasic');
    if (basicCard) basicCard.classList.toggle('is-recommended', MODE_RECOMMENDATION_ENABLED && !recommendAdvanced);
    if (formalCard) formalCard.classList.toggle('is-recommended', MODE_RECOMMENDATION_ENABLED && recommendAdvanced && !unfit);
  }

  // 3택 카드 클릭: 숨김 라디오에 값 반영 후 확인 모달 직행(구 reduce 화면 생략 — 2026-08-28 단계 축소)
  window.lavSelectTone = function (tone) {
    var radio = document.querySelector('input[name="lavTone"][value="' + tone + '"]');
    if (!radio || radio.disabled) return;   // 고급 잠금 상태 방어
    radio.checked = true;
    toneSelectionTouched = true;
    trackModeSelection(tone);
    window.lavOpenConfirm();
  };

  // 3택 카드 인라인 비용·시간 — 서버와 동일한 단가 공식 재사용
  function renderSelectCosts() {
    var src = $('lavInput');
    var text = src ? src.value : '';
    var len = text.length;
    var evOn = !!($('lavEvidence') && $('lavEvidence').checked && !$('lavEvidence').disabled);
    var shortLabel = shortHumanizeCredit(len) + '크레딧 · ' + estimateTimeLabel(shortEstimateSec(text));
    var p = $('lavCostPolish'); if (p) p.textContent = shortLabel;
    var b = $('lavCostBlog'); if (b) b.textContent = shortLabel;
    var f = $('lavCostFormal');
    if (f) f.textContent = advancedCredit(len, evOn) + '크레딧 · ' + estimateTimeRangeLabel(formalEstimateRange(text, evOn));
    var gapEl = $('lavCostFormalGap');
    if (gapEl) {
      var gap = advancedCredit(len, evOn) - shortHumanizeCredit(len);
      gapEl.hidden = !len || gap > ADVANCED_GAP_HINT_MAX_CREDITS;
      gapEl.classList.toggle('is-even', gap <= 0);
      gapEl.textContent = gap <= 0
        ? '기본과 같은 값'
        : '기본보다 +' + gap.toLocaleString('ko-KR') + '크레딧';
    }
  }

  // 뒤로: 방법선택→(보고서 경유면) 보고서, 보고서→입력화면(원문 유지)
  window.lavFlowBack = function () {
    var step = $('lavFlow') && $('lavFlow').dataset.step;
    if (step === 'select') { if (cameFromReport) show('report'); else window.lavFlowReset(); }
    else if (step === 'report') window.lavFlowReset();
    else if (step === 'detectError') window.lavFlowReset();
    else show('select');
  };

  // ── AI 감지 분리: 유료 감지(100자당 1크레딧) → 보고서(휴머나이징 전환 퍼널) ──────────
  var cameFromReport = false;   // 설정 화면 뒤로가기가 보고서로 돌아가게(진단 경유와 동선 구분)
  var detectPending = false;
  // 응답 유실 뒤 같은 글을 다시 실행해도 서버 멱등키를 유지한다. 성공하거나
  // 서버가 명시적으로 무차감 응답을 준 경우에만 다음 작업 ID를 발급한다.
  var pendingDetectRequest = null;
  var DETECT_REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/;
  function newDetectRequestId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('det_' + Date.now());
  }
  function normalizeDetectRequestId(value) {
    var candidate = typeof value === 'string' ? value.trim() : '';
    return DETECT_REQUEST_ID_RE.test(candidate) ? candidate : '';
  }
  function detectRequestIdFor(text, requestIdOverride) {
    var override = normalizeDetectRequestId(requestIdOverride);
    if (override) {
      // 결제 successUrl 복귀에서는 메모리가 초기화된다. localStorage의 작업 payload와
      // 함께 돌아온 서버 결합 ID를 같은 원문에 다시 채워 staged 결과를 회수한다.
      pendingDetectRequest = { text: text, requestId: override };
      return override;
    }
    if (pendingDetectRequest && pendingDetectRequest.text === text) return pendingDetectRequest.requestId;
    pendingDetectRequest = { text: text, requestId: newDetectRequestId() };
    return pendingDetectRequest.requestId;
  }
  function clearPendingDetectRequest(requestId) {
    if (pendingDetectRequest && pendingDetectRequest.requestId === requestId) pendingDetectRequest = null;
  }

  function detectLengthBucket(length) {
    var value = Math.max(0, Number(length) || 0);
    if (value <= 1000) return '100_1000';
    if (value <= 3000) return '1001_3000';
    if (value <= 10000) return '3001_10000';
    return '10001_plus';
  }

  function detectLatencyBucket(milliseconds) {
    var value = Math.max(0, Number(milliseconds) || 0);
    if (value < 3000) return 'under_3s';
    if (value < 10000) return '3_10s';
    if (value < 30000) return '10_30s';
    return '30s_plus';
  }

  function renderDetectUnavailable() {
    var retry = $('lavDetectRetry');
    if (retry) retry.disabled = false;
    show('detectError');
    if (typeof window.gpAnnounce === 'function') {
      window.gpAnnounce('정밀 점수를 측정하지 못했습니다. 크레딧은 사용되지 않았습니다.');
    }
  }

  window.lavRetryDetect = function () {
    if (detectPending) return;
    if (window.gpTrack) window.gpTrack('detect_measurement_retry', { source: 'inline_error' });
    window.lavDetect({ retryAfterFailure: true });
  };

  // 실행 모드 토글(컴포저 세그먼트): 전송 버튼은 하나 — 선택된 모드가 lavRun의 동작을 결정.
  window.lavMode = 'humanize';
  window.lavSetMode = function (m, opts) {
    opts = opts || {};
    m = m === 'detect' ? 'detect' : 'humanize';
    window.lavMode = m;
    document.querySelectorAll('.gp-lav-mode button').forEach(function (b) {
      var on = b.getAttribute('data-mode') === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var ta = $('lavInput');
    if (ta) ta.placeholder = m === 'detect'
      ? 'AI가 썼는지 궁금한 글을 붙여넣어 보세요...'
      : '다듬을 초안이나 문단을 붙여넣어 보세요...';
    if (!opts.skipUrl && typeof window.gpSyncProductModeUrl === 'function') {
      window.gpSyncProductModeUrl(m);
    }
    if (typeof window.lavUpdateEstimate === 'function') window.lavUpdateEstimate();
  };

  window.lavDetect = async function (options) {
    options = options || {};
    if (detectPending) return;
    var src = $('lavInput');
    var text = src ? src.value : '';
    if (text.length < 100) {   // 글자수 통일: 공백 포함 기준(표시 카운트와 동일)
      alert('AI 감지는 100자 이상부터 할 수 있어요. (지금 ' + text.length + '자)');
      if (src) src.focus();
      return;
    }
    if (text.length > (window.LAV_MAX_CHARS || 30000)) {
      alert('한 번에 최대 30,000자까지 감지할 수 있어요.');
      return;
    }
    if (typeof window.lavEnsureReadableInput === 'function' && !window.lavEnsureReadableInput(text)) return;
    detectPending = true;
    try {
    var cost = Math.ceil(text.length / 100);
    var preToken = null;
    try { preToken = await evGetIdToken(true); } catch (e) { /* 비로그인 */ }
    if (!preToken) { alert('AI 감지는 로그인이 필요해요. 로그인 후 이용해 주세요.'); return; }
    if (window.authReady && typeof window.authReady.then === 'function') {
      try { await window.authReady; } catch (e) { /* 사용자 정보 조회 실패 시 서버 검증으로 이어간다. */ }
    }
    var unlimited = window.UP === 'unlimited';
    var balance = Number(window.UC);
    var hasKnownBalance = window.gpUserDataReady === true && !!window.CU && Number.isFinite(balance);
    if (!options.resumeAfterPayment && !unlimited && hasKnownBalance && balance < cost) {
      if (typeof window.gpOpenCreditCheckout === 'function') {
        await window.gpOpenCreditCheckout({
          action: 'evasion_detect',
          source: 'evasion_detect_preflight',
          neededCredits: cost,
          currentCredits: balance,
          payload: { text: text }
        });
      } else if (confirm('AI 감지에 ' + cost + '크레딧이 필요해요. 충전 페이지로 이동할까요?') && typeof switchTab === 'function') {
        switchTab('pricing');
      }
      return;
    }
    var detectSummary = [
      { label: '분석할 글', value: text.length.toLocaleString() + '자' },
      unlimited
        ? { label: '이용 방식', value: '무제한 이용권', emphasis: true }
        : { label: '사용 크레딧', value: cost.toLocaleString() + '크레딧', emphasis: true }
    ];
    if (!unlimited && hasKnownBalance) {
      detectSummary.push({ label: '감지 후 잔액', value: Math.max(0, balance - cost).toLocaleString() + '크레딧' });
    }
    var agree = options.resumeAfterPayment === true || options.retryAfterFailure === true
      ? true
      : (window.gpConfirm
        ? await window.gpConfirm({
            variant: 'detect',
            title: 'AI 감지를 시작할까요?',
            message: '글 전체의 AI 티 지수와 두드러진 문체 신호를 확인해요.',
            summary: detectSummary,
            safeText: unlimited
              ? '무제한 이용권으로 처리되며 크레딧은 차감되지 않아요.'
              : '감지에 실패하면 크레딧은 차감되지 않아요.',
            note: '결과는 문체 패턴 기반 참고값이며, 실제 작성 주체나 외부 검사 결과를 보장하지 않아요.',
            confirmText: unlimited ? 'AI 감지 시작' : '감지 시작 · ' + cost.toLocaleString() + '크레딧',
            cancelText: '취소'
          })
        : confirm(unlimited
          ? 'AI 감지를 시작할까요? 결과는 문체 패턴 기반 참고값입니다.'
          : 'AI 감지에 ' + cost + '크레딧을 사용해요. 전달 가능한 결과를 만들지 못하면 차감하지 않아요. 진행할까요?'));
    if (!agree) return;
    cameFromReport = false;
    var startedAt = Date.now();
    if (window.gpTrack) window.gpTrack('detect_measurement_start', {
      source: options.retryAfterFailure ? 'inline_retry' : 'composer',
      length_bucket: detectLengthBucket(text.length)
    });
    // 멱등키 — 응답이 유실된 재실행까지 같은 글·같은 작업 ID로 묶는다.
    var reqId = detectRequestIdFor(text, options.requestId);

    async function runDetect() {
      var retry = $('lavDetectRetry');
      if (retry) retry.disabled = true;
      show('analyzing');
      var idToken = null;
      try { idToken = await evGetIdToken(true); } catch (e) { /* 만료 시 서버가 401 안내 */ }
      var minWait = new Promise(function (r) { setTimeout(r, 900); });
      try {
        var resP = fetch(window.apiUrl('/detect-report'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json', 'X-Request-Id': reqId }),   // 토큰은 Authorization, 요청 식별자는 헤더·body에서 동일하게 유지
          body: JSON.stringify({ text: text, requestId: reqId })
        });
        var out = await Promise.all([resP, minWait]);
        var res = out[0];
        var d = await res.json().catch(function () { return null; });

        // 잔액 부족
        if (res.status === 402 && d && d.code === 'INSUFFICIENT_CREDITS') {
          // 서버가 과금 직전에 잔액 경합을 감지했을 수 있다. 결제 후에도 같은
          // requestId를 유지하면 이미 고정된 정밀 결과를 모델 재호출 없이 받는다.
          window.lavFlowReset();
          if (typeof window.gpOpenCreditCheckout === 'function') {
            await window.gpOpenCreditCheckout({
              action: 'evasion_detect',
              source: 'evasion_detect_402',
              neededCredits: Number(d.cost) || cost,
              currentCredits: window.UC || 0,
              payload: { text: text, requestId: reqId }
            });
          } else if (confirm('크레딧이 부족해요. 충전할까요?') && typeof switchTab === 'function') {
            switchTab('pricing');
          }
          return;
        }
        if (res.status === 401 && d && d.code === 'LOGIN_REQUIRED') {
          clearPendingDetectRequest(reqId);
          window.lavFlowReset();
          alert('AI 감지는 로그인이 필요해요.');
          return;
        }
        if (res.status === 422 && d && d.code === 'UNREADABLE_INPUT') {
          clearPendingDetectRequest(reqId);
          window.lavFlowReset();
          if (typeof window.lavShowInputError === 'function') window.lavShowInputError(d.error, d.reason || 'unreadable_input', true);
          return;
        }
        if (res.status === 503 && d && d.code === 'DETECT_MODEL_UNAVAILABLE') {
          clearPendingDetectRequest(reqId);
          if (window.gpTrack) window.gpTrack('detect_measurement_unavailable', {
            error_code: d.code,
            retryable: d.retryable !== false,
            charged_credits: 0,
            length_bucket: detectLengthBucket(text.length),
            latency_bucket: detectLatencyBucket(Date.now() - startedAt)
          });
          renderDetectUnavailable();
          return;
        }
        if (!res.ok || !d || !d.ok) {
          if (res.status >= 400 && res.status < 500) clearPendingDetectRequest(reqId);
          window.lavFlowReset();
          alert((d && d.error) || 'AI 감지에 실패했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        // 성공 — 서버 권위 잔액을 우선한다. 첫 응답이 유실된 멱등 재시도는 이번
        // 요청의 charged가 0이어도 실제 계정 잔액은 이미 줄어 있을 수 있다.
        var authoritativeRemaining = Number(d.remainingCredits);
        if (!unlimited && Number.isFinite(authoritativeRemaining) && authoritativeRemaining >= 0) {
          window.UC = Math.floor(authoritativeRemaining);
          if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
        } else if (d.charged) {
          window.UC = Math.max(0, (window.UC || 0) - d.charged);
          if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
        }
        if (d.charged && window.gpToast) {
          window.gpToast(d.charged + '크레딧을 사용했어요. (남은 크레딧 ' + (window.UC || 0) + ')', { type: 'info' });
        }
        if (window.gpTrack) window.gpTrack('detect_measurement_completed', {
          score_source: d.probSource || 'llm',
          score_band: d.riskLevel || 'unknown',
          charged_credits: Number(d.charged) || 0,
          length_bucket: detectLengthBucket(text.length),
          latency_bucket: detectLatencyBucket(Date.now() - startedAt)
        });
        renderReport(d);
        cameFromReport = true;
        show('report');
        playReportIntro();
        lavInitCollapse('lavRepParaList', 'lavRepParaToggle');
        // 응답 수신 뒤 렌더링까지 끝나야 이 작업이 클라이언트에도 전달된 것이다.
        // 그 전 단계에서 예외가 나면 같은 ID를 유지해 서버의 최초 결과를 다시 받는다.
        clearPendingDetectRequest(reqId);
      } catch (e) {
        console.warn('[evasion] /detect-report 실패:', e && e.message);
        window.lavFlowReset();
        alert('AI 감지에 실패했어요. 네트워크 상태를 확인해 주세요.');
      }
    }

    await runDetect();
    } finally {
      detectPending = false;
      var retryButton = $('lavDetectRetry');
      if (retryButton) retryButton.disabled = false;
    }
  };

  window.gpResumeEvasionDetect = function (payload) {
    payload = payload || {};
    var resumeText = typeof payload.text === 'string' ? payload.text : '';
    if (resumeText.length < 100 || resumeText.length > (window.LAV_MAX_CHARS || 30000)) return false;
    var hasRequestId = payload.requestId != null && payload.requestId !== '';
    var resumeRequestId = normalizeDetectRequestId(payload.requestId);
    if (hasRequestId && !resumeRequestId) return false;
    if (typeof window.switchTab === 'function') window.switchTab('main');
    var input = $('lavInput');
    if (!input) return false;
    input.value = resumeText;
    if (typeof window.lavSetMode === 'function') window.lavSetMode('detect');
    setTimeout(function () {
      window.lavDetect({ resumeAfterPayment: true, requestId: resumeRequestId || undefined });
    }, 120);
    return true;
  };

  // ── 교수님 레이더 인트로: 스코프 한 바퀴 스윕 → 학생 블립 점등 → 숫자 카운트업 ──
  //   중심에 교수님, 점수만큼 중심 가까이 잡힌 학생. 스윕이 지나가며 찾아내는 순간이 "판정"이다.
  var repProbTarget = null;
  function repReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function playReportIntro() {
    var p = repProbTarget;
    var scope = $('gpRepScope'), num = $('gpRepScore');
    if (!scope) return;
    scope.classList.remove('is-sweeping', 'is-found', 'is-done');
    var bands = scope.querySelectorAll('.band-on');
    var blipAt = scope.querySelector('.blip-at');
    var finish = function () {
      scope.classList.add('is-found', 'is-done');
      bands.forEach(function (b) { b.style.strokeDasharray = ''; b.style.strokeDashoffset = ''; });
      if (blipAt) blipAt.setAttribute('transform', 'translate(' + blipAt.getAttribute('data-x') + ' ' + blipAt.getAttribute('data-y') + ')');
      if (num && p != null) num.textContent = String(p);
      var radarStatic = $('gpRepRadar'); if (radarStatic) radarStatic.classList.add('is-drawn');
      repSyncParaMore();
    };
    if (p == null || repReducedMotion()) { finish(); return; }
    // 시작 상태: 띠는 비어 있고 마커는 교수님 옆(100)에
    bands.forEach(function (b) { var L = b.getTotalLength(); b.style.strokeDasharray = L + ' ' + L; b.style.strokeDashoffset = L; });
    var p0 = repGaugePoint(100, REP_GAUGE.R);
    if (blipAt) blipAt.setAttribute('transform', 'translate(' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ')');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      scope.classList.add('is-sweeping', 'is-found');
      var t0 = null, DUR = 1300;
      var step = function (ts) {
        if (t0 == null) t0 = ts;
        var k = Math.min(1, (ts - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
        var s = 100 - (100 - p) * e;   // 100(교수님 옆)에서 점수 자리로 달려간다
        // 띠: 각 구역이 달려간 만큼 채워진다(from=구역 위쪽 점수 → to=멈춘 점수)
        bands.forEach(function (b) {
          var L = b.getTotalLength();
          var from = Number(b.getAttribute('data-from')), to = Number(b.getAttribute('data-to'));
          var frac = from > to ? Math.max(0, Math.min(1, (from - s) / (from - to))) : 0;
          b.style.strokeDashoffset = L * (1 - frac);
        });
        if (blipAt) { var bp = repGaugePoint(s, REP_GAUGE.R); blipAt.setAttribute('transform', 'translate(' + bp[0].toFixed(1) + ' ' + bp[1].toFixed(1) + ')'); }
        if (num) num.textContent = String(Math.round(s));
        if (k < 1) requestAnimationFrame(step); else { scope.classList.remove('is-sweeping'); scope.classList.add('is-done'); }
      };
      requestAnimationFrame(step);
      var radar = $('gpRepRadar');
      if (radar) { radar.classList.remove('is-drawn'); setTimeout(function () { radar.classList.add('is-drawn'); }, 300); }
      repCountUpStats();
      repSyncParaMore();   // 렌더 시점엔 화면이 아직 hidden이라 높이가 0 — 보이는 지금 다시 잰다
      // 계측 띠의 '문장 보기' 알약을 한 번 깜빡여 누를 수 있다는 걸 알린다(처음 한 번만)
      var statsNudge = $('gpRepStats');
      if (statsNudge && !repMapState.pinned) {
        statsNudge.classList.remove('is-nudge');
        setTimeout(function () { statsNudge.classList.add('is-nudge'); }, 1900);
        setTimeout(function () { statsNudge.classList.remove('is-nudge'); }, 4600);
      }
    }); });
  }
  function repCountUpStats() {
    document.querySelectorAll('#gpRepStats dd').forEach(function (dd) {
      var txt = dd.firstChild && dd.firstChild.nodeType === 3 ? dd.firstChild.nodeValue : '';
      var m = /^([\d,]+(?:\.\d+)?)(.*)$/.exec(txt || '');
      if (!m) return;
      var target = Number(m[1].replace(/,/g, '')), unit = m[2], decimals = (m[1].split('.')[1] || '').length;
      if (!Number.isFinite(target)) return;
      var t0 = null, dur = 900, node = dd.firstChild;
      var step = function (ts) {
        if (t0 == null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        var v = target * e;
        node.nodeValue = (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('ko-KR')) + unit;
        if (k < 1) requestAnimationFrame(step); else node.nodeValue = txt;
      };
      requestAnimationFrame(step);
    });
  }

  // ── Before 문장 — 다듬을 때 바뀌는 자리를 원문에 표시한다(사용자 글이라 가릴 것 없다) ──
  function repPaintBefore(example) {
    var before = $('gpRepBefore');
    if (!before) return;
    before.textContent = '';
    if (!example) return;
    var text = String(example.before || '');
    var f = example.beforeFocus;
    if (f && Number.isFinite(Number(f.start)) && Number.isFinite(Number(f.end)) && f.end > f.start && f.end <= text.length) {
      before.appendChild(document.createTextNode(text.slice(0, f.start)));
      var mark = document.createElement('mark');
      mark.className = 'gp-rep-ba-focus';
      mark.title = '다듬을 때 가장 크게 바뀌는 자리';
      mark.textContent = text.slice(f.start, f.end);
      before.appendChild(mark);
      before.appendChild(document.createTextNode(text.slice(f.end)));
    } else {
      before.textContent = text;
    }
  }

  // ── After 문장 게이트 — 가장 많이 바뀐 자리만 보이고 나머지는 블러(서버가 이미 가짜 글자로 바꿔 보낸다) ──
  //   전체는 휴머나이징에서. 감지 보고서가 짧은 글의 무료 다듬기 창구가 되지 않게 한다.
  function repPaintAfter(example) {
    var after = $('gpRepAfter'), tag = $('gpRepAfterTag'), unlock = $('gpRepBaUnlock');
    var col = document.querySelector('.gp-rep-ba-col.after');
    if (!after) return;
    after.textContent = '';
    var parts = example && Array.isArray(example.afterParts) && example.afterParts.length
      ? example.afterParts
      : (example ? [{ text: example.after || '', visible: true }] : []);
    var gated = parts.some(function (p) { return p && p.visible === false; });
    parts.forEach(function (p) {
      if (!p || !p.text) return;
      if (p.visible === false) {
        var mask = document.createElement('span');
        mask.className = 'gp-rep-ba-mask';
        mask.setAttribute('aria-hidden', 'true');
        mask.textContent = p.text;
        after.appendChild(mask);
      } else {
        var vis = document.createElement('mark');
        vis.className = 'gp-rep-ba-peek';
        vis.textContent = p.text;
        after.appendChild(vis);
      }
    });
    if (gated) {
      var sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ' (다듬은 문장 중 가장 많이 바뀐 자리만 보여드려요. 나머지 ' + (Number(example.afterHidden) || 0) + '자는 휴머나이징에서 볼 수 있어요)';
      after.appendChild(sr);
    }
    if (col) col.classList.toggle('is-gated', gated);
    if (tag) tag.textContent = gated ? '휴머나이징 미리보기 · 가장 많이 바뀐 자리' : '휴머나이징 결과 · 사실은 그대로';
    if (unlock) unlock.hidden = !gated;
  }

  // ── 문단 칸 툴팁 — 번호만 보이는 칸에 "몇 번째 문단, 문장 몇, 후보 몇, 첫 줄"을 붙인다 ──
  function repShowParaTip(cell) {
    var tip = $('gpRepParaTip'), wrap = $('gpRepParaWrap');
    if (!tip || !wrap || !cell) return;
    var index = Number(cell.getAttribute('data-para'));
    var row = repMapState.paragraphs[index] || {};
    tip.textContent = '';
    var b = document.createElement('b');
    b.textContent = (index + 1) + '번째 문단 · 문장 ' + (Number(row.sentences) || 0) + ' · 다듬을 후보 ' + (Number(row.generic) || 0);
    tip.appendChild(b);
    if (row.head) { var p = document.createElement('span'); p.textContent = row.head + '…'; tip.appendChild(p); }
    tip.hidden = false;
    var cr = cell.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    var left = Math.max(8, Math.min(wr.width - tip.offsetWidth - 8, cr.left - wr.left + cr.width / 2 - tip.offsetWidth / 2));
    tip.style.left = left + 'px';
    tip.style.top = (cr.top - wr.top - tip.offsetHeight - 8) + 'px';
    if (cr.top - wr.top < tip.offsetHeight + 12) { tip.style.top = (cr.bottom - wr.top + 8) + 'px'; tip.classList.add('is-below'); } else tip.classList.remove('is-below');
  }
  function repHideParaTip() { var tip = $('gpRepParaTip'); if (tip) tip.hidden = true; }

  // ── 모바일 문단 지도 접기 — 장문은 칸이 100개를 넘어 한 화면을 먹는다 ──
  window.gpRepToggleParaMap = function () {
    var wrap = $('gpRepParaWrap'), btn = $('gpRepParaMore');
    if (!wrap || !btn) return;
    var open = wrap.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = btn.querySelector('span');
    if (label) label.textContent = open ? '문단 지도 접기' : '문단 지도 더 보기';
  };
  window.addEventListener('resize', function () { repSyncParaMore(); }, { passive: true });
  function repSyncParaMore() {
    var wrap = $('gpRepParaWrap'), btn = $('gpRepParaMore');
    if (!wrap || !btn) return;
    // 5줄(약 200px)을 넘을 때만 접는다 — 짧은 지도는 그대로.
    var cells = $('gpRepParaCells');
    var tall = cells && cells.scrollHeight > 210;
    wrap.classList.toggle('is-collapsible', !!tall);
    btn.hidden = !tall;
  }

  // ── 핵심 문장 → 전체 모달의 그 자리로 ──
  window.gpRepJumpToSentence = function (index) {
    window.gpRepOpenModal();
    var target = document.querySelector('#gpRepModalList [data-index="' + index + '"]');
    if (!target) return;
    target.scrollIntoView({ behavior: repReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    target.classList.add('is-flash');
    setTimeout(function () { target.classList.remove('is-flash'); }, 1800);
  };

  // ── 모달 걸러 보기 ──
  var repModalFilterKey = 'all';
  window.gpRepModalFilter = function (key) {
    repModalFilterKey = key || 'all';
    document.querySelectorAll('.gp-rep-modal-filters .gp-rep-chip').forEach(function (chip) {
      var on = chip.getAttribute('data-filter') === repModalFilterKey;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    repPaintModal();
  };
  function repModalMatches(sentence) {
    if (repModalFilterKey === 'generic') return sentence.kind === 'generic';
    if (repModalFilterKey === 'keep') return sentence.kind === 'lived' || sentence.kind === 'specific';
    if (repModalFilterKey === 'ending') return sentence.endingRun >= 4;
    return true;
  }

  // ── 모바일 고정 바 — 히어로를 지나면 나타나고 전환 밴드가 보이면 물러난다 ──
  var repStickyIo = null;
  function repSetupSticky(model) {
    var bar = $('gpRepSticky'), hero = document.querySelector('.gp-rep-hero'), cta = $('gpRepNext');
    if (!bar || !hero || !cta) return;
    var eligible = model.conversionEligible !== false;
    if ($('gpRepStickyScore')) $('gpRepStickyScore').textContent = model.score == null ? '--' : model.score + '점';
    if ($('gpRepStickyLabel')) $('gpRepStickyLabel').textContent = model.radar.label || 'AI식 문체 신호';
    if ($('gpRepStickyBtn')) $('gpRepStickyBtn').textContent = eligible ? '다듬기 방법 보기 →' : '전체 문장 보기';
    if ($('gpRepStickyBtn')) $('gpRepStickyBtn').onclick = eligible ? function () { window.lavReportToHumanize(); } : function () { window.gpRepOpenModal(); };
    if (repStickyIo) { repStickyIo.disconnect(); repStickyIo = null; }
    if (!('IntersectionObserver' in window)) return;
    var heroOut = false, ctaIn = false;
    var apply = function () {
      var mobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
      var show = mobile && heroOut && !ctaIn;
      bar.hidden = !show;
      bar.classList.toggle('is-on', show);
    };
    repStickyIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target === hero) heroOut = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (e.target === cta) ctaIn = e.isIntersecting;
      });
      apply();
    }, { threshold: [0, 0.2] });
    repStickyIo.observe(hero); repStickyIo.observe(cta);
    window.addEventListener('resize', apply, { passive: true });
  }

  // ── 교수님 게이지 — 반원 트랙. 교수님은 왼쪽 출발선(100)에 서 있고, 학생은 오른쪽(0, 안전)으로 달아난다. ──
  //   ★ 방향이 곧 뜻이다(사장님 9/2): 교수님 쪽으로 달리면 잡히는 그림이 된다. 우리는 반대로 달린다.
  //   띠 색은 교수님 레이더 밴드와 같다: 50~100 코랄(위험) · 21~49 라벤더(주의) · 0~20 틸(안전).
  //   학생이 달려간 만큼 띠가 뒤에 남는다 — 점수가 낮을수록 멀리 달아난 것.
  var REP_GAUGE = { W: 340, H: 214, cx: 170, cy: 166, R: 124, band: 24 };
  function repGaugeAngle(score) {
    return Math.max(0, Math.min(100, score)) / 100 * Math.PI;   // 100 → 180°(왼쪽, 교수님), 0 → 0°(오른쪽, 안전)
  }
  function repGaugePoint(score, r) {
    var a = repGaugeAngle(score);
    return [REP_GAUGE.cx + Math.cos(a) * r, REP_GAUGE.cy - Math.sin(a) * r];
  }
  // 호는 항상 높은 점수(왼쪽)에서 낮은 점수(오른쪽)로 — 시계 방향.
  function repGaugeArc(hi, lo, r) {
    var p0 = repGaugePoint(hi, r), p1 = repGaugePoint(lo, r);
    var large = (hi - lo) > 50 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  function repPaintScope(model) {
    var host = $('gpRepScope');
    if (!host) return;
    var ns = 'http://www.w3.org/2000/svg';
    var mk = function (tag, attrs) {
      var el = document.createElementNS(ns, tag);
      Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      return el;
    };
    var G = REP_GAUGE, score = model.score, band = model.radar.band || 'unknown';
    var svg = mk('svg', { viewBox: '0 0 ' + G.W + ' ' + G.H, 'aria-hidden': 'true' });
    var defs = mk('defs');
    // 학생('내 글')이 이 그림의 주인공이다 — 교수님보다 크게, 띠보다 넓게(사장님 9/2 '너무 작다').
    var clipProf = mk('clipPath', { id: 'gpRepClipProf' }); clipProf.appendChild(mk('circle', { cx: 0, cy: 0, r: 19 }));
    var clipBlip = mk('clipPath', { id: 'gpRepClipBlip' }); clipBlip.appendChild(mk('circle', { cx: 0, cy: 0, r: 23 }));
    defs.appendChild(clipProf); defs.appendChild(clipBlip); svg.appendChild(defs);

    // 옅은 띠 세 개(전체 트랙) — 왼쪽 위험부터 오른쪽 안전까지, 사이에 1점 틈
    var zones = [[100, 50, 'z-hard'], [49, 21, 'z-revise'], [20, 0, 'z-low']];
    zones.forEach(function (z) {
      svg.appendChild(mk('path', { class: 'band ' + z[2] + (band === z[2].slice(2) ? ' is-active' : ''), d: repGaugeArc(z[0], z[1], G.R) }));
    });
    // 달려간 만큼 진한 띠 — 교수님(100)에서 점수 자리까지, 구역마다 제 색으로
    if (score != null) {
      zones.forEach(function (z) {
        var lo = Math.max(score, z[1]);
        if (lo <= z[0]) svg.appendChild(mk('path', { class: 'band-on ' + z[2], d: repGaugeArc(z[0], Math.min(z[0] - 0.5, lo), G.R), 'data-from': z[0], 'data-to': Math.min(z[0] - 0.5, lo) }));
      });
    }
    // 눈금은 양 끝 두 개만(100·0). 중간 숫자는 범례가 말하니 판에서는 뺀다 — 라벨 밀집 해소(사장님 9/2).
    [[100, '100'], [0, '0']].forEach(function (t) {
      var lp = repGaugePoint(t[0], G.R - G.band / 2 - 16);
      var tx = mk('text', { class: 'tick-label', x: lp[0], y: lp[1] + 4, 'text-anchor': 'middle' });
      tx.textContent = t[1];
      svg.appendChild(tx);
    });
    // 구역 이름 — 짧고 직관적인 세 낱말.
    [[82, '위험', 'z-hard'], [35, '주의', 'z-revise'], [10, '안전', 'z-low']].forEach(function (z) {
      var lp = repGaugePoint(z[0], G.R + G.band / 2 + 14);
      var anchorAt = lp[0] < G.cx - 20 ? 'end' : lp[0] > G.cx + 20 ? 'start' : 'middle';
      if (z[0] === 35) { anchorAt = 'middle'; lp[1] -= 2; }
      var tx = mk('text', { class: 'zone-label ' + z[2], x: lp[0], y: lp[1] + 4, 'text-anchor': anchorAt });
      tx.textContent = z[1];
      svg.appendChild(tx);
    });
    // 교수님 — 출발선(100, 왼쪽 끝)에 서 있다
    var pp = repGaugePoint(100, G.R);
    var prof = mk('g', { class: 'prof', transform: 'translate(' + (pp[0] - 26).toFixed(1) + ' ' + (pp[1] - 4).toFixed(1) + ')' });
    prof.appendChild(mk('circle', { class: 'prof-ring', r: 21 }));
    prof.appendChild(mk('image', { href: '/assets/img/report/professor.png', x: -18, y: -17, width: 36, height: 36, 'clip-path': 'url(#gpRepClipProf)', preserveAspectRatio: 'xMidYMid meet' }));
    var pl = mk('text', { class: 'who', x: 0, y: 35, 'text-anchor': 'middle' }); pl.textContent = '교수님';
    prof.appendChild(pl);
    svg.appendChild(prof);
    // 학생 마커 — 점수 자리. 위치는 속성 그룹, 등장 애니는 안쪽 CSS 그룹.
    if (score != null) {
      var bp = repGaugePoint(score, G.R);
      var blipAt = mk('g', { class: 'blip-at', transform: 'translate(' + bp[0].toFixed(1) + ' ' + bp[1].toFixed(1) + ')', 'data-x': bp[0].toFixed(1), 'data-y': bp[1].toFixed(1) });
      var blip = mk('g', { class: 'blip' });
      blip.appendChild(mk('circle', { class: 'blip-halo', r: 34 }));
      blip.appendChild(mk('circle', { class: 'blip-ring', r: 25 }));
      // 전신 그림을 원 안에 통째로(meet) — 상반신 크롭은 바지·다리가 잘려 보였다(사장님 9/2)
      blip.appendChild(mk('image', { href: '/assets/img/report/runner.png', x: -22, y: -22, width: 44, height: 44, 'clip-path': 'url(#gpRepClipBlip)', preserveAspectRatio: 'xMidYMid meet' }));
      // '내 글' 이름표는 호 안쪽(중심 방향)에 둔다 — 구역 말(위험·주의·안전)은 호 바깥이라 절대 겹치지 않는다.
      var a = repGaugeAngle(score);
      var bl = mk('text', { class: 'who me', x: (-Math.cos(a) * 40).toFixed(1), y: (Math.sin(a) * 40 + 4).toFixed(1), 'text-anchor': 'middle' }); bl.textContent = '내 글';
      blip.appendChild(bl);
      blipAt.appendChild(blip);
      svg.appendChild(blipAt);
    }
    host.textContent = '';
    host.className = 'gp-rep-scope is-' + band;
    host.appendChild(svg);
    var alt = $('gpRepScopeAlt');
    if (alt) {
      alt.textContent = score == null
        ? '교수님 게이지. 점수를 확인하지 못해 내 글 위치를 표시하지 않았어요.'
        : '교수님 게이지. AI식 문체 신호 ' + score + '점, 100점 만점. ' + (model.radar.label || '') + '. 50~100 위험, 21~49 주의, 0~20 안전. 점수가 낮을수록 왼쪽 출발선의 교수님에게서 멀리 달아난 거예요.';
    }
  }

  var lastReport = null;   // 보고서 → 휴머나이저 핸드오프용(진단 배너 채움)
  var lastReportModel = null;

  function reportNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function reportCount(value) {
    var n = reportNumber(value);
    return n == null ? null : Math.max(0, Math.round(n));
  }

  function styleBandFor(score) {
    if (score == null) return 'limited';
    if (score >= 50) return 'high';
    if (score >= 21) return 'moderate';
    return 'low';
  }

  function styleLabelFor(band) {
    return band === 'high' ? 'AI식 문체 신호 · 높음'
      : band === 'moderate' ? 'AI식 문체 신호 · 중간'
      : band === 'low' ? 'AI식 문체 신호 · 낮음'
      : 'AI식 문체 신호 · 확인 필요';
  }

  // 교수님 레이더 밴드 — 서버가 준 값을 우선하고, 없으면 화면 공용 기준(detect-presentation)으로 같은 경계를 쓴다.
  //   '판정 보류'는 금지 표현(사장님 지시) — 점수가 없을 때도 다른 말로 닫는다.
  function professorRadarFor(score, supplied) {
    var radar = supplied || {};
    if (score == null) {
      return {
        score: null,
        band: radar.band || 'limited',
        label: radar.label || '간이 추정 기준',
        headline: radar.headline || '교수님 레이더: 점수 확인 필요',
        description: radar.description || '',
        disclaimer: radar.disclaimer || ''
      };
    }
    var shared = typeof window.gpProfessorRadarBand === 'function' ? window.gpProfessorRadarBand(score) : null;
    return {
      score: score,
      band: radar.band || (shared && shared.band) || 'unknown',
      label: radar.label || (shared && shared.label) || '',
      headline: radar.headline || '',
      description: radar.description || '',
      disclaimer: radar.disclaimer || ''
    };
  }

  function contentEvidenceLabel(status) {
    return status === 'strong' ? '구체 근거 충분'
      : status === 'mixed' ? '구체 근거 일부'
      : status === 'weak' ? '근거 보강 필요'
      : '분석 근거 부족';
  }

  function buildReportModel(d) {
    var reportView = d.reportView || {};
    var styleSignal = reportView.styleSignal || {};
    var measured = reportView.measuredEvidence || d.measuredEvidence || {};
    var source = styleSignal.source || (d.probSource === 'engine' ? 'engine' : d.probSource === 'llm' ? 'llm' : 'unknown');
    var sourceLabel = styleSignal.sourceLabel || (source === 'llm' ? 'AI 모델 분석' : source === 'engine' ? '문체 엔진 간이 추정' : '분석 출처 미확인');
    var score = reportNumber(styleSignal.score);
    if (score == null) score = reportNumber(d.probability);
    if (score != null) score = Math.max(0, Math.min(100, Math.round(score)));
    var styleBand = styleSignal.band || d.riskLevel || styleBandFor(score);
    var content = reportView.contentEvidence || {};
    var paragraphs = Array.isArray(d.paragraphs) ? d.paragraphs : [];
    var total = reportCount(content.total);
    if (total == null) total = reportCount(measured.genericTotal);
    if (total == null && paragraphs.length) total = paragraphs.length;
    var generic = reportCount(content.generic);
    if (generic == null) generic = reportCount(measured.genericCount);
    var lived = reportCount(content.lived);
    if (lived == null) lived = reportCount(measured.livedCount);
    var specific = reportCount(content.specific);
    if (specific == null) specific = reportCount(measured.specificCount);
    var contentStatus = content.status || 'limited';
    var contentLabel = content.label || contentEvidenceLabel(contentStatus);
    if (contentStatus === 'mixed' && !/보강/u.test(contentLabel)) contentLabel += ' · 보강 권장';
    var synthesis = reportView.synthesis || {};
    var headline = synthesis.headline;
    if (!headline) {
      headline = contentStatus === 'weak' || contentStatus === 'mixed'
        ? '문장 패턴은 정형적이고, 구체적인 근거는 일부만 확인됐어요.'
        : styleBand === 'high'
          ? 'AI식 문체 신호는 높지만, 확인된 내용 근거는 유지할 수 있어요.'
          : '문체 신호와 내용 근거를 나눠 확인했어요.';
    }
    var description = synthesis.description || (contentStatus === 'weak' || contentStatus === 'mixed'
      ? '프로젝트 경험은 유지하고, 반복되는 종결과 일반적인 결론 문장을 먼저 다듬어 보세요.'
      : '확인된 사실과 경험은 유지하고, 두드러진 문체 신호만 골라 다듬어 보세요.');
    var limitation = synthesis.limitation || '문체 패턴을 바탕으로 한 참고 결과이며 작성 주체나 외부 검사 결과를 확정하지 않아요.';
    var preservation = reportView.preservation && Array.isArray(reportView.preservation.items)
      ? reportView.preservation.items
      : ['사실·수치·고유명사', '직접 경험과 프로젝트 맥락'];
    var status = reportView.status || (score == null || source === 'engine' ? 'limited' : 'ready');
    var radar = professorRadarFor(status === 'limited' ? null : score, reportView.professorRadar);
    var conversionEligible = reportView.conversion && reportView.conversion.eligible === false ? false : status === 'ready';
    return {
      status: status,
      score: score,
      style: {
        band: styleBand,
        label: styleSignal.label || styleLabelFor(styleBand),
        source: source,
        sourceLabel: sourceLabel,
        // 보정 여부는 화면에 쓰지 않되(사장님 결정), 다음 화면 핸드오프·디버깅에서 참조할 수 있게 모델에는 남긴다.
        calibrated: styleSignal.calibrated === true || d.calibrated === true,
        rawScore: reportNumber(d.rawProbability)
      },
      radar: radar,
      content: {
        status: contentStatus,
        label: contentLabel,
        generic: generic,
        lived: lived,
        specific: specific,
        total: total
      },
      synthesis: { headline: headline, description: description, limitation: limitation },
      measured: measured,
      preservation: preservation,
      paragraphs: paragraphs,
      sentenceMap: normalizeSentenceMap(d.sentenceMap),
      conversionEligible: conversionEligible
    };
  }

  // 문장 지도는 구버전 백엔드에서 오지 않을 수 있다. 없으면 그 구획만 조용히 접는다.
  function normalizeSentenceMap(raw) {
    if (!raw || !Array.isArray(raw.sentences)) return { total: 0, shown: 0, capped: false, sentences: [], paragraphs: [] };
    var sentences = raw.sentences.map(function (item, order) {
      return {
        index: reportCount(item && item.index) != null ? item.index : order,
        paragraph: reportCount(item && item.paragraph) || 0,
        length: reportCount(item && item.length) || 0,
        kind: ['lived', 'specific', 'generic', 'plain'].indexOf(item && item.kind) >= 0 ? item.kind : 'plain',
        ending: String((item && item.ending) || ''),
        endingRun: reportCount(item && item.endingRun) || 0,
        runStart: !!(item && item.runStart),
        text: String((item && item.text) || '')
      };
    }).filter(function (item) { return item.text; });
    return {
      total: reportCount(raw.total) || sentences.length,
      shown: sentences.length,
      capped: raw.capped === true,
      sentences: sentences,
      // 문단 집계는 장문 목록의 뼈대다. 여기서 버리면 문단 구분이 화면에 영영 안 나온다.
      paragraphs: Array.isArray(raw.paragraphs) ? raw.paragraphs : []
    };
  }

  function evidenceRatio(value, total) {
    return value == null || total == null || total <= 0 ? '—' : value + '/' + total + '문장';
  }

  function safeParagraphReason(value, kind) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    text = text
      .replace(/실제 경험이나 구체 수치가 있어 사람이 쓴 글로 읽혀요\.?/g, '실제 경험이나 구체 정보가 확인돼 유지할 수 있어요.')
      .replace(/사람이\s*(?:직접\s*)?쓴\s*글(?:로)?\s*읽혀요\.?/g, '구체적인 맥락이 확인돼요.')
      .replace(/안전한 문단/g, '유지할 문단');
    if (text) return text;
    return kind === 'concrete' ? '구체적인 맥락이 확인돼요. 이 분류는 문체 판정과 별개예요.'
      : kind === 'abstract_risk' ? '정형적인 문장 패턴이 두드러져 먼저 다듬는 편이 좋아요.'
      : '경험·수치·대상을 한 가지 더 붙이면 내용이 선명해져요.';
  }

  // ── 문단 지도 ───────────────────────────────────────────────────────────────
  // 3만자 문서를 문장 200행으로 뿌리면 21화면이 된다. 어디에 신호가 몰렸는지를
  // 한 화면에서 문단으로 보이고, 고를 때만 그 문단의 문장을 연다.
  var repMapState = { paragraphs: [], sentences: [], cells: [], selected: null, capped: false, total: 0 };

  function repParaLevel(row) {
    var total = Math.max(1, Number(row && row.sentences) || 1);
    var ratio = (Number(row && row.generic) || 0) / total;
    return ratio >= 0.5 ? 2 : (ratio > 0 ? 1 : 0);
  }
  var REP_LEVEL_LABEL = ['신호 적음', '섞임', '신호 많음'];

  // 핵심 문장 고르기 — 인라인에는 전달력이 있는 것만 남긴다.
  // 다듬을 후보(일반 표현)를 원문 순서로 먼저, 자리가 남으면 유지할 근거 1개.
  // 신호가 하나도 없는 글은 앞 문장 몇 개를 그대로 보여준다(빈 패널 방지).
  var REP_INLINE_KEY = 4;
  function repKeySentences(pool) {
    // 장문에는 같은 상투 문구가 여러 문단에 반복된다. 그대로 담으면 핵심 4줄이 전부 같은 문장이 된다.
    var seen = Object.create(null);   // 문장 원문이 키가 되므로 프로토타입 이름과 충돌하지 않게
    var unique = pool.filter(function (s) {
      var key = (s.text || '').replace(/\s+/g, '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
    var candidates = unique.filter(function (s) { return s.kind === 'generic'; });
    var keeps = unique.filter(function (s) { return s.kind === 'lived' || s.kind === 'specific'; });
    var picked = candidates.slice(0, REP_INLINE_KEY);
    if (picked.length < REP_INLINE_KEY && keeps.length) picked = picked.concat(keeps.slice(0, 1));
    if (!picked.length) picked = unique.slice(0, 3);
    return picked.sort(function (a, b) { return a.index - b.index; });
  }

  function repSentenceRow(sentence, variant) {
    var modal = variant === 'modal';
    var candidate = sentence.kind === 'generic';
    var keep = sentence.kind === 'lived' || sentence.kind === 'specific';
    var row = document.createElement('li');
    row.className = (modal ? 'gp-rep-s gp-rep-s--modal' : 'gp-rep-s') + (candidate ? ' is-candidate' : '');
    row.setAttribute('data-index', String(sentence.index));
    if (!modal) {
      // 인라인 행은 누르면 전체 목록의 그 자리로 간다 — 앞뒤 문맥을 바로 본다.
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.title = '전체 문장에서 앞뒤 문맥 보기';
      row.addEventListener('click', function () { window.gpRepJumpToSentence(sentence.index); });
      row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); window.gpRepJumpToSentence(sentence.index); } });
    }

    var no = document.createElement('span');
    no.className = 'gp-rep-s-no';
    no.textContent = String(sentence.index + 1);

    var body = document.createElement('div');
    body.className = 'gp-rep-s-body';
    var text = document.createElement('p');
    text.className = 'gp-rep-s-text';
    // 같은 종결 묶음이면 그 어미를 본문에서 직접 칠한다. 라벨이 아니라 원문 자체가 근거가 되고,
    // 목록을 위에서 아래로 훑으면 반복이 세로로 눈에 들어온다 — 세어서 확인되는 우리 방식이다.
    var raw = sentence.text || '';
    // 백엔드가 가장 긴 활용 묶음(4문장 이상)만 표시 대상으로 보내므로, 여기서는 그 값만 존중한다.
    var endingAt = sentence.endingRun >= 4 && sentence.ending ? raw.lastIndexOf(sentence.ending) : -1;
    if (endingAt > 0 && raw.length - endingAt <= sentence.ending.length + 4) {
      text.appendChild(document.createTextNode(raw.slice(0, endingAt)));
      var hl = document.createElement('mark');
      hl.className = 'gp-rep-ending-hl';
      hl.textContent = raw.slice(endingAt, endingAt + sentence.ending.length);
      text.appendChild(hl);
      text.appendChild(document.createTextNode(raw.slice(endingAt + sentence.ending.length)));
    } else {
      text.textContent = raw;
    }
    body.appendChild(text);
    // 연속 칩은 인라인에서만 — 모달에서는 칠해진 어미 자체가 그 역할을 한다.
    if (!modal && sentence.runStart && sentence.endingRun >= 4 && sentence.ending) {
      var marks = document.createElement('p');
      marks.className = 'gp-rep-s-marks';
      var chip = document.createElement('span');
      chip.className = 'gp-rep-mark is-ending';
      chip.textContent = '‘' + sentence.ending + '’ ' + sentence.endingRun + '문장 연속';
      marks.appendChild(chip);
      body.appendChild(marks);
    }

    var side = document.createElement('div');
    side.className = 'gp-rep-s-side';
    if (modal) {
      // 모달은 200행까지 흐른다 — 알약 대신 한 줄 텍스트로 조용히.
      var quiet = document.createElement('span');
      quiet.className = 'gp-rep-s-tag' + (candidate ? ' bad' : keep ? ' good' : '');
      quiet.textContent = (candidate ? '다듬을 후보 · ' : keep ? '유지할 근거 · ' : '') + sentence.length + '자';
      side.appendChild(quiet);
    } else {
      if (candidate || keep) {
        var badge = document.createElement('span');
        badge.className = 'gp-rep-s-badge ' + (candidate ? 'bad' : 'good');
        badge.textContent = candidate ? '다듬을 후보' : '유지할 근거';
        side.appendChild(badge);
      }
      var len = document.createElement('span');
      len.className = 'gp-rep-s-len';
      len.textContent = sentence.length + '자';
      side.appendChild(len);
    }

    row.appendChild(no);
    row.appendChild(body);
    row.appendChild(side);
    return row;
  }

  function repPaintSentences() {
    var list = $('gpRepSentences');
    if (!list) return;
    list.textContent = '';
    var picked = repMapState.selected;
    var usingMap = (repMapState.cells || []).length > 1;
    var pool = usingMap && picked != null
      ? repMapState.sentences.filter(function (s) { return s.paragraph === picked; })
      : repMapState.sentences;
    var linkHead = $('gpRepLinkHead');
    var linked = repMapState.link ? repMatchesForAxis(repMapState.link) : null;
    if (linked) {
      var scoped = usingMap && picked != null ? linked.filter(function (s) { return s.paragraph === picked; }) : linked;
      var shown = scoped.slice(0, REP_INLINE_KEY);
      shown.forEach(function (sentence) { list.appendChild(repSentenceRow(sentence)); });
      if (linkHead) {
        var copy = REP_AXIS_COPY[repMapState.link] || { head: '', empty: '' };
        linkHead.hidden = false;
        linkHead.textContent = '';
        var chip = document.createElement('b');
        chip.className = 'gp-rep-link-chip';
        chip.textContent = REP_AXIS_NAME[repMapState.link] || '';
        linkHead.appendChild(chip);
        var desc = document.createElement('span');
        desc.textContent = scoped.length
          ? copy.head + ' · ' + scoped.length.toLocaleString('ko-KR') + '문장' + (scoped.length > shown.length ? ' 중 ' + shown.length : '')
          : copy.empty;
        linkHead.appendChild(desc);
        var clear = document.createElement('button');
        clear.type = 'button'; clear.className = 'gp-rep-link-clear';
        clear.textContent = '해제';
        clear.setAttribute('aria-label', '선택 해제하고 핵심 문장으로 돌아가기');
        var currentKey = repMapState.link;
        clear.addEventListener('click', function () { repLinkAxis(currentKey, true); });
        linkHead.appendChild(clear);
      }
      repEnterRows(list);
      var countLinked = $('gpRepMapCount');
      if (countLinked) countLinked.textContent = '';
      var emptyLinked = $('gpRepMapEmpty');
      if (emptyLinked) emptyLinked.hidden = true;
      var toggleLinked = $('gpRepMapToggle');
      if (toggleLinked) toggleLinked.hidden = true;
      return;
    }
    if (linkHead) linkHead.hidden = true;
    var key = repKeySentences(pool);
    key.forEach(function (sentence) { list.appendChild(repSentenceRow(sentence)); });
    var count = $('gpRepMapCount');
    if (count) {
      // 문단을 고른 뒤에도 "전체 786문장 중"이라고 말하면 지금 보는 범위와 어긋난다.
      count.textContent = usingMap && picked != null
        ? (picked + 1) + '번째 문단 · 핵심 ' + key.length + '문장'
        : '전체 ' + repMapState.total.toLocaleString('ko-KR') + '문장 중 핵심 ' + key.length + '문장';
    }

    repEnterRows(list);
    var empty = $('gpRepMapEmpty');
    if (empty) {
      empty.hidden = pool.length > 0;
      // 문단을 고른 경우와 글 전체에 표시할 문장이 없는 경우는 다른 상황이다.
      empty.textContent = usingMap && picked != null
        ? '이 문단은 발췌에 포함되지 않았어요. 다른 문단을 골라 보세요.'
        : '표시할 문장을 찾지 못했어요. 아래 계측 수치와 개선 포인트로 확인해 주세요.';
    }
    // 전체는 모달로 — 인라인은 핵심만 남겨 전달력을 지킨다.
    var toggle = $('gpRepMapToggle');
    if (toggle) {
      var total = repMapState.sentences.length;
      var label = toggle.querySelector('span');
      if (label) label.textContent = '전체 문장 ' + total.toLocaleString('ko-KR') + '개 보기';
      toggle.hidden = total === 0 || (total <= key.length && !usingMap);
    }
  }

  // ── 전체 문장 모달 — 문단 표지와 함께 전량을 훑는다 ──
  var repModalOpener = null;
  function repPaintModal() {
    var list = $('gpRepModalList');
    if (!list) return;
    list.textContent = '';
    var lastParagraph = null;
    var visible = repMapState.sentences.filter(repModalMatches);
    if (!visible.length) {
      var none = document.createElement('li');
      none.className = 'gp-rep-s-none';
      none.textContent = '이 조건에 맞는 문장이 없어요.';
      list.appendChild(none);
    }
    visible.forEach(function (sentence) {
      if ((repMapState.cells || []).length > 1 && sentence.paragraph !== lastParagraph) {
        lastParagraph = sentence.paragraph;
        var row = repMapState.paragraphs[sentence.paragraph] || {};
        var divider = document.createElement('li');
        divider.className = 'gp-rep-s-para';
        var name = document.createElement('b');
        name.textContent = (sentence.paragraph + 1) + '번째 문단';
        divider.appendChild(name);
        var stat = document.createElement('span');
        stat.textContent = '문장 ' + (Number(row.sentences) || 0) + ' · 다듬을 후보 ' + (Number(row.generic) || 0);
        divider.appendChild(stat);
        list.appendChild(divider);
      }
      list.appendChild(repSentenceRow(sentence, 'modal'));
    });
    var meta = $('gpRepModalMeta');
    if (meta) {
      var shown = repMapState.sentences.length;
      var candidates = repMapState.sentences.filter(function (x) { return x.kind === 'generic'; }).length;
      var keeps = repMapState.sentences.filter(function (x) { return x.kind === 'lived' || x.kind === 'specific'; }).length;
      meta.textContent = (repMapState.capped
        ? '문장 ' + repMapState.total.toLocaleString('ko-KR') + '개 중 신호 위주 ' + shown.toLocaleString('ko-KR') + '개 · '
        : '문장 ' + shown.toLocaleString('ko-KR') + '개 · ')
        + '다듬을 후보 ' + candidates.toLocaleString('ko-KR') + ' · 유지할 근거 ' + keeps.toLocaleString('ko-KR');
    }
  }

  window.gpRepOpenModal = function () {
    var modal = $('gpRepModal');
    if (!modal) return;
    repPaintModal();
    repModalOpener = document.activeElement;
    modal.hidden = false;
    document.documentElement.classList.add('gp-rep-modal-open');
    var close = modal.querySelector('.gp-rep-modal-close');
    if (close) close.focus();
    document.addEventListener('keydown', repModalKeydown);
  };

  window.gpRepCloseModal = function () {
    var modal = $('gpRepModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    repHideParaTip();
    document.documentElement.classList.remove('gp-rep-modal-open');
    document.removeEventListener('keydown', repModalKeydown);
    if (repModalOpener && typeof repModalOpener.focus === 'function') repModalOpener.focus();
    repModalOpener = null;
  };

  function repModalKeydown(event) {
    if (event.key === 'Escape') { window.gpRepCloseModal(); return; }
    if (event.key !== 'Tab') return;
    // aria-modal만으로는 키보드 초점이 뒤 화면으로 새 나간다 — 모달 안에서 순환시킨다.
    var modal = $('gpRepModal');
    if (!modal || modal.hidden) return;
    var focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function repPaintLead() {
    var lead = $('gpRepMapLead');
    if (!lead) return;
    var picked = repMapState.selected;
    if (picked == null) {
      lead.textContent = !repMapState.sentences.length
        ? ''
        : (repMapState.cells || []).length > 1
          ? '문단을 고르면 그 안의 문장을 볼 수 있어요. 진한 칸일수록 다듬을 후보가 많아요.'
          : '';
      return;
    }
    var row = repMapState.paragraphs[picked] || {};
    lead.textContent = (picked + 1) + '번째 문단 · 문장 ' + (Number(row.sentences) || 0) + '개 중 다듬을 후보 '
      + (Number(row.generic) || 0) + '개'
      + (row.head ? ' · ' + row.head + (/[.!?…]$/.test(row.head) ? '' : '…') : '');
  }

  window.gpRepPickParagraph = function (index) {
    var next = Number(index);
    repMapState.selected = repMapState.selected === next ? null : next;
    var cells = document.querySelectorAll('#gpRepParaCells .gp-rep-paracell');
    for (var i = 0; i < cells.length; i++) {
      var on = Number(cells[i].getAttribute('data-para')) === repMapState.selected;
      cells[i].classList.toggle('is-on', on);
      cells[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    repPaintLead();
    repPaintSentences();
  };

  function repSetupMap(model) {
    var map = model.sentenceMap || {};
    var sentences = Array.isArray(map.sentences) ? map.sentences : [];
    var paragraphs = Array.isArray(map.paragraphs) ? map.paragraphs : [];
    // ★ 칸은 실제로 열리는 문단만 그린다.
    //   장문은 문장 예산(200)이 문단 수보다 적어 일부 문단은 발췌가 없다. 예전엔 그런 문단도
    //   칸으로 그려서 3만자 글에서 269칸 중 153칸이 눌러도 빈 목록이었다 — 지도가 한 약속을 어겼다.
    //   백엔드가 문단마다 전달한 문장 수(excerpt)를 보내므로, 그 값이 있는 문단만 칸으로 만든다.
    var hasExcerptField = paragraphs.some(function (row) { return row && row.excerpt != null; });
    var shownIn = {};
    sentences.forEach(function (s) { shownIn[s.paragraph] = (shownIn[s.paragraph] || 0) + 1; });
    var openable = [];
    paragraphs.forEach(function (row, index) {
      var n = hasExcerptField ? (Number(row.excerpt) || 0) : (shownIn[index] || 0);
      if (n > 0) openable.push(index);
    });

    // 처음에는 문단을 고르지 않고 글 전체의 핵심 문장을 연다.
    //   예전에는 신호가 가장 센 문단을 자동 선택했는데, 장문에서 그 문단의 발췌가 1~2문장뿐이라
    //   3만자 글의 핵심 문장 패널이 두 줄로 열렸다. 패널 이름이 '핵심 문장'인 만큼 기본값은
    //   글 전체 기준이어야 하고, 문단 지도는 좁혀 보는 도구로 둔다.
    repMapState = {
      paragraphs: paragraphs, sentences: sentences, cells: openable,
      selected: null, link: null, pinned: null,
      capped: map.capped === true, total: Number(map.total) || sentences.length
    };
    var more = $('gpRepMapMore');
    if (more) {
      var hiddenParas = paragraphs.length - openable.length;
      more.hidden = !repMapState.capped;
      if (repMapState.capped) {
        more.textContent = '긴 글이라 신호가 뚜렷한 문장과 유지할 문장만 골라 담았어요. 계측 수치는 문장 '
          + repMapState.total.toLocaleString('ko-KR') + '개 전체 기준이고, 문단 지도에는 발췌가 있는 '
          + openable.length.toLocaleString('ko-KR') + '개 문단을 띄웠어요'
          + (hiddenParas > 0 ? ' (신호가 옅은 ' + hiddenParas.toLocaleString('ko-KR') + '개 문단은 생략).' : '.');
      }
    }

    var paraMap = $('gpRepParaMap');
    var cells = $('gpRepParaCells');
    var useMap = openable.length > 1;
    if (paraMap) paraMap.hidden = !useMap;
    if (cells) {
      cells.textContent = '';
      if (useMap) {
        openable.forEach(function (index) {
          var row = paragraphs[index] || {};
          var level = repParaLevel(row);
          var li = document.createElement('li');
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'gp-rep-paracell lv' + level;
          button.setAttribute('data-para', String(index));
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label',
            (index + 1) + '번째 문단, ' + REP_LEVEL_LABEL[level] + ', 문장 ' + (row.sentences || 0) + '개');
          button.textContent = String(index + 1);
          if (index === repMapState.selected) {
            button.classList.add('is-on');
            button.setAttribute('aria-pressed', 'true');
          }
          button.onclick = function () { window.gpRepPickParagraph(index); };
          button.addEventListener('mouseenter', function () { repShowParaTip(button); });
          button.addEventListener('mouseleave', repHideParaTip);
          button.addEventListener('focus', function () { repShowParaTip(button); });
          button.addEventListener('blur', repHideParaTip);
          li.appendChild(button);
          cells.appendChild(li);
        });
      }
    }
    var wrapReset = $('gpRepParaWrap');
    if (wrapReset) wrapReset.classList.remove('is-open');
    repSyncParaMore();
    repPaintLead();
    repPaintSentences();
  }

  // ── 원인 분석 축 ────────────────────────────────────────────────────────────
  // 다섯 축 모두 결정론 계측이라 추가 비용이 없다. 값이 클수록 AI식 신호가 강하다.
  // 모집단 평균선은 우리에게 없다 — 없는 비교선을 그려 넣지 않고 내 글 하나만 그린다.
  function repClamp01(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  // 계측이 없는 값(null·undefined·NaN)과 "0으로 측정된 값"은 다르다.
  //   Number(null) === 0 이라 예전에는 값이 안 온 축이 조용히 최악(0 → 부족 100%)으로 그려졌다.
  //   보고서는 측정된 것만 말한다 — 없는 축은 '측정 없음'으로 비워 둔다.
  function repMeasured(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function repRadarAxes(model) {
    var m = model.measured || {};
    var totalRaw = repMeasured(m.genericTotal);
    if (totalRaw == null) totalRaw = repMeasured(model.content.total);
    var generic = repMeasured(m.genericCount);
    // 계측 블록이 없어도 내용 근거(contentEvidence)에 같은 수가 있다 —
    // 화면 다른 곳이 "3/8개"라고 말하는데 레이더만 '측정 없음'이면 같은 것을 두 가지로 말하게 된다.
    if (generic == null) generic = repMeasured(model.content.generic);
    var cv = repMeasured(m.lengthCV);
    var run = repMeasured(m.maxEndingRun);
    var anchor = repMeasured(m.realAnchorRatio);
    var stance = repMeasured(m.stanceRatio);
    var axis = function (name, raw, compute) {
      return raw == null
        ? { name: name, value: 0, unknown: true }
        : { name: name, value: repClamp01(compute(raw)), unknown: false };
    };
    var genericRatio = (totalRaw != null && totalRaw > 0 && generic != null) ? generic / totalRaw : null;
    return [
      axis('문장 길이 균일', cv, function (v) { return 1 - v / 0.4; }),
      axis('같은 종결 반복', run, function (v) { return v / 6; }),
      axis('일반 표현 비율', genericRatio, function (v) { return v; }),
      axis('구체 앵커 부족', anchor, function (v) { return 1 - v / 0.3; }),
      axis('화자 입장 부족', stance, function (v) { return 1 - v / 0.3; })
    ];
  }

  function repRadarLevel(axis) {
    if (axis && axis.unknown) return '측정 없음';
    var value = typeof axis === 'object' ? axis.value : axis;
    return value >= 0.67 ? '높음' : (value >= 0.34 ? '보통' : '낮음');
  }

  var REP_AXIS_KEYS = ['uniform', 'ending', 'generic', 'anchor', 'stance'];
  // ── 원인 분석 = 신호 강도 바 다섯 줄 ──
  //   오각형 레이더는 값을 읽기 어렵다. 항목 · 실측 한 줄 · 막대 · 등급을 한 줄에 놓으면
  //   "무엇이, 얼마나, 왜"가 한 번에 읽힌다. 막대 색은 과녁·게이지의 세 구역 색과 같다.
  function repAxisFact(key, model) {
    var m = model.measured || {}, c = model.content || {};
    var total = Number(c.total) || Number(m.genericTotal) || 0;
    if (key === 'uniform') return Number.isFinite(Number(m.lengthCV)) ? '길이 편차 ' + (Number(m.lengthCV) * 100).toFixed(1) + '%' : '';
    if (key === 'ending') return m.maxEndingRun ? '같은 종결 ' + m.maxEndingRun + '문장 연속' : '';
    if (key === 'generic') return (c.generic != null && total) ? '일반 표현 ' + c.generic + '/' + total + '문장' : '';
    if (key === 'anchor') return m.realAnchorCount != null ? '숫자·연도·고유명사 문장 ' + m.realAnchorCount + '개' : '';
    if (key === 'stance') return (Number.isFinite(Number(m.stanceRatio)) && total) ? '화자 입장 문장 ' + Math.round(Number(m.stanceRatio) * total) + '개' : '';
    return '';
  }
  function repPaintRadar(model) {
    var host = $('gpRepRadar');
    if (!host) return;
    var axes = repRadarAxes(model);
    host.textContent = '';
    var list = document.createElement('ol');
    list.className = 'gp-rep-signals';
    axes.forEach(function (a, i) {
      var key = REP_AXIS_KEYS[i];
      var hot = !a.unknown && a.value >= 0.67;
      var level = a.unknown ? 'na' : (hot ? 'hot' : (a.value >= 0.34 ? 'mid' : 'low'));
      var li = document.createElement('li');
      li.className = 'axis lv-' + level + (hot ? ' hot' : '') + (a.unknown ? ' na' : '');
      li.setAttribute('data-axis', key);
      li.tabIndex = 0; li.setAttribute('role', 'button'); li.setAttribute('aria-pressed', 'false');
      li.style.setProperty('--i', String(i));
      li.style.setProperty('--v', a.unknown ? '0' : String(Math.round(a.value * 100)));
      var head = document.createElement('div'); head.className = 'sig-head';
      var name = document.createElement('b'); name.className = 'axis-name'; name.textContent = a.name;
      var fact = document.createElement('span'); fact.className = 'sig-fact'; fact.textContent = a.unknown ? '이번엔 재지 못했어요' : repAxisFact(key, model);
      head.appendChild(name); head.appendChild(fact);
      var bar = document.createElement('div'); bar.className = 'sig-bar';
      var fill = document.createElement('i'); fill.className = 'sig-fill'; bar.appendChild(fill);
      var lvl = document.createElement('span'); lvl.className = 'axis-val sig-level' + (a.unknown ? ' na' : (hot ? ' hot' : '')); lvl.textContent = repRadarLevel(a);
      li.appendChild(head); li.appendChild(bar); li.appendChild(lvl);
      li.addEventListener('mouseenter', function () { repLinkAxis(key, false); });
      li.addEventListener('mouseleave', function () { repLinkAxis(null, false); });
      li.addEventListener('focus', function () { repLinkAxis(key, false); });
      li.addEventListener('blur', function () { repLinkAxis(null, false); });
      li.addEventListener('click', function () { repLinkAxis(key, true); });
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); repLinkAxis(key, true); } });
      list.appendChild(li);
    });
    host.appendChild(list);
    var alt = $('gpRepRadarAccessible');
    if (alt) {
      alt.textContent = 'AI 감지 원인 분석. ' + axes.map(function (a) {
        return a.name + ' ' + repRadarLevel(a);
      }).join(', ') + '.';
    }
  }

  // ── 축 ↔ 문장 연동 ──────────────────────────────────────────────────────────
  //   레이더 축·계측 띠 숫자에 손을 올리면 그 신호를 만든 문장이 핵심 문장 자리에 켜지고,
  //   문단 지도에서는 그 문장이 든 칸이 표시된다. 데이터는 전부 문장 지도에 이미 있다.
  var REP_STANCE_RE = /(저는|제가|개인적으로|내\s*생각|제\s*생각|라고\s*본다|라고\s*봅니다|라고\s*느꼈|아쉽|문제라고\s*생각|걱정(된다|스럽)|동의하기\s*(어렵|힘들)|가볍게\s*볼\s*수\s*없|확신한다|분명하다|틀림없|싶었다|싶습니다)/;
  var REP_AXIS_COPY = {
    generic: { head: '일반적인 표현으로 읽힌 문장', empty: '일반적인 표현으로 읽힌 문장이 없어요.' },
    ending: { head: '같은 종결이 4문장 이상 이어진 자리', empty: '같은 종결이 4문장 이상 이어진 자리가 없어요.' },
    uniform: { head: '길이가 평균에 붙어 있는 문장', empty: '길이가 고르게 붙은 문장이 없어요.' },
    anchor: { head: '숫자·연도·고유명사가 있는 문장 — 여기가 유지할 근거예요', empty: '숫자·연도·고유명사가 든 문장이 아직 없어요.' },
    stance: { head: '화자의 입장이 드러난 문장', empty: '화자의 입장이 드러난 문장이 없어요.' }
  };
  function repMatchesForAxis(key) {
    var all = repMapState.sentences || [];
    if (!all.length) return [];
    if (key === 'generic') return all.filter(function (s) { return s.kind === 'generic'; });
    if (key === 'ending') return all.filter(function (s) { return s.endingRun >= 4; });
    if (key === 'anchor') return all.filter(function (s) { return s.kind === 'lived' || s.kind === 'specific'; });
    if (key === 'stance') return all.filter(function (s) { return REP_STANCE_RE.test(s.text || ''); });
    if (key === 'uniform') {
      var lens = all.map(function (s) { return Number(s.length) || 0; }).filter(Boolean);
      if (!lens.length) return [];
      var avg = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
      return all.filter(function (s) { return avg > 0 && Math.abs((Number(s.length) || 0) - avg) / avg <= 0.15; });
    }
    return [];
  }
  function repLinkAxis(key, pin) {
    // 호버(pin=false)는 표시만 한다: 항목·문단 칸에 불이 들어오고 문장 패널은 그대로.
    //   문장 패널을 바꾸는 건 클릭·Enter(고정)뿐이다 — 마우스가 지나갈 때마다 높이가 바뀌어
    //   스크롤 중 화면이 늘었다 줄었다 하던 문제(사장님 9/2).
    if (pin) {
      repMapState.pinned = (repMapState.pinned === key) ? null : key;
      repMapState.link = repMapState.pinned;
    }
    var active = repMapState.pinned || (pin ? null : key);
    document.querySelectorAll('[data-axis]').forEach(function (el) {
      var on = !!active && el.getAttribute('data-axis') === active;
      var pinnedHere = on && repMapState.pinned === active;
      el.classList.toggle('is-on', on);
      el.classList.toggle('is-pinned', pinnedHere);
      el.setAttribute('aria-pressed', pinnedHere ? 'true' : 'false');
      var go = el.querySelector('.gp-rep-stat-go');
      if (go) go.textContent = pinnedHere ? '선택됨 ✓' : '문장 보기';
    });
    var stats = $('gpRepStats');
    if (stats) stats.classList.toggle('has-pin', !!repMapState.pinned);
    var hits = active ? repMatchesForAxis(active) : [];
    var hitPara = {};
    hits.forEach(function (h) { hitPara[h.paragraph] = true; });
    document.querySelectorAll('#gpRepParaCells .gp-rep-paracell').forEach(function (cell) {
      cell.classList.toggle('is-hit', !!active && !!hitPara[cell.getAttribute('data-para')]);
      cell.classList.toggle('is-dim', !!active && !hitPara[cell.getAttribute('data-para')]);
    });
    if (!pin) return;
    repSwapSentences();
    // 모바일은 핵심 문장 패널이 위(화면 밖)에 있어 고정해도 보이는 변화가 없다 — 그 자리로 데려간다.
    if (repMapState.pinned && window.matchMedia && window.matchMedia('(max-width:640px)').matches) {
      var head = $('gpRepLinkHead');
      if (head && typeof head.scrollIntoView === 'function') head.scrollIntoView({ behavior: repReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }
  // 핵심 문장 등장 — 교수님 레이더의 스윕이 목록을 훑고 지나가며 문장이 차례로 켜지고 번호가 찍힌다.
  function repEnterRows(list) {
    if (!list) return;
    var rows = list.querySelectorAll('.gp-rep-s');
    for (var i = 0; i < rows.length; i++) rows[i].style.setProperty('--i', String(i));
    list.classList.remove('is-entering');
    if (repReducedMotion() || !rows.length) return;
    void list.offsetWidth;
    list.classList.add('is-entering');
    clearTimeout(list._enterTimer);
    list._enterTimer = setTimeout(function () { list.classList.remove('is-entering'); }, 700 + rows.length * 90);
  }
  // 문장 패널 교체 — 바뀌는 동안 높이를 잠그고 페이드로 넘긴다(레이아웃 점프 없음)
  function repSwapSentences() {
    var panel = $('gpRepSentences');
    if (!panel) { repPaintSentences(); return; }
    var wrap = panel.parentElement;
    var before = wrap ? wrap.getBoundingClientRect().height : 0;
    if (wrap && before) wrap.style.minHeight = before + 'px';
    if (repReducedMotion()) { repPaintSentences(); if (wrap) wrap.style.minHeight = ''; return; }
    panel.classList.add('is-swapping');
    setTimeout(function () {
      repPaintSentences();
      requestAnimationFrame(function () {
        panel.classList.remove('is-swapping');
        setTimeout(function () { if (wrap) wrap.style.minHeight = ''; }, 260);
      });
    }, 140);
  }
  var REP_AXIS_NAME = { generic: '다듬을 후보 문장', ending: '같은 종결 반복', uniform: '문장 길이 편차', anchor: '구체 앵커', stance: '화자 입장' };
  function repBindStatLinks() {
    document.querySelectorAll('#gpRepStats .is-link').forEach(function (tile) {
      if (tile.dataset.bound) return;
      tile.dataset.bound = '1';
      var key = tile.getAttribute('data-axis');
      if (!key) {
        // 전체 문장 수 타일 — 전체 문장 모달
        tile.addEventListener('click', function () { window.gpRepOpenModal(); });
        tile.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); window.gpRepOpenModal(); } });
        return;
      }
      tile.addEventListener('mouseenter', function () { repLinkAxis(key, false); });
      tile.addEventListener('mouseleave', function () { repLinkAxis(null, false); });
      tile.addEventListener('focus', function () { repLinkAxis(key, false); });
      tile.addEventListener('blur', function () { repLinkAxis(null, false); });
      tile.addEventListener('click', function () { repLinkAxis(key, true); });
      tile.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); repLinkAxis(key, true); } });
    });
  }

  // ── 다듬었을 때 예상 변화 — 결정론 두 축만, 점수는 예측하지 않는다 ─────────
  //   "66 → 4x"처럼 문체 점수(LLM)를 지어내지 않는다. 일반 표현 비율과 같은 종결 반복은
  //   후보 문장을 빼고 다시 세면 그대로 나오는 값이라 정직하게 말할 수 있다.
  function repExpectedEffect(model) {
    // "38% → 0%"처럼 결과를 약속하지 않는다 — 휴머나이징이 모든 후보를 바꾼다고 보장하지 않으므로
    //   무엇이 다듬을 대상인지(범위)만 센다.
    var all = repMapState.sentences || [];
    var total = Number(model.content.total) || all.length;
    var generic = Number(model.content.generic) || 0;
    if (!total || !generic) return [];
    var rows = [];
    rows.push({ label: '일반 표현', value: generic + '문장 (' + Math.round(generic / total * 100) + '%)' });
    var runNow = Number(model.measured && model.measured.maxEndingRun) || 0;
    if (runNow >= 4) {
      var inRun = all.filter(function (s) { return s.endingRun >= 4 && s.kind === 'generic'; }).length;
      rows.push({ label: '같은 종결 ' + runNow + '문장 연속 구간', value: inRun ? '그중 후보 ' + inRun + '문장' : '리듬 끊기' });
    }
    return rows;
  }

  // ── 결과 이미지(공유 카드) — 교수님 레이더 + 점수 + 유지할 근거 ───────────
  //   학생 커뮤니티에서 "내 자소서 교수님 레이더 41"이 돌아다니면 감지기 자체가 유입 채널이 된다.
  function repLoadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  window.gpRepShareCard = async function () {
    var model = lastReportModel;
    var btn = $('gpRepShare');
    if (!model) return;
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    try {
      // 항상 내려받기(크롬 다운로드) · 2배 해상도 — 공유 시트로 넘기면 일부 환경에서 축소·손상돼 보였다(사장님 9/2).
      var W = 1200, H = 630, SCALE = 2;
      var cv = document.createElement('canvas');
      cv.width = W * SCALE; cv.height = H * SCALE;
      var ctx = cv.getContext('2d');
      ctx.scale(SCALE, SCALE);
      var font = function (w, px) { return w + ' ' + px + 'px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; };
      var grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#241c5c'); grad.addColorStop(1, '#4b34cc');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // 왼쪽: 말
      ctx.fillStyle = '#c9b8ff'; ctx.font = font('800', 22); ctx.textBaseline = 'top';
      ctx.fillText('교수님 피하기 · AI 감지 보고서', 72, 64);
      ctx.fillStyle = '#ffffff'; ctx.font = font('850', 118);
      ctx.fillText(model.score == null ? '--' : String(model.score), 72, 110);
      var numW = ctx.measureText(model.score == null ? '--' : String(model.score)).width;
      ctx.fillStyle = '#b3aee0'; ctx.font = font('700', 30);
      ctx.fillText('/100 · AI식 문체 신호', 72 + numW + 16, 190);
      var chip = model.radar.label || '';
      ctx.font = font('800', 30);
      var chipW = ctx.measureText(chip).width + 44;
      ctx.fillStyle = '#f5b425';
      ctx.beginPath(); ctx.roundRect(72, 262, chipW, 56, 28); ctx.fill();
      ctx.fillStyle = '#1a1747'; ctx.fillText(chip, 94, 274);
      ctx.fillStyle = '#e2dcff'; ctx.font = font('600', 24);
      var keeps = (model.preservation || []).filter(function (item) { return !(typeof item === 'object' && item.key === 'grounding'); }).slice(0, 3).map(function (item) {
        if (typeof item !== 'object') return String(item);
        return item.label + ' ' + (item.value != null ? item.value : (Number(item.count) || 0) + '문장');
      });
      keeps.forEach(function (line, i) { ctx.fillText('· ' + line, 72, 356 + i * 40); });
      ctx.fillStyle = '#b3aee0'; ctx.font = font('700', 22);
      ctx.fillText('gpkorea.ai.kr', 72, H - 84);
      // 오른쪽: 게이지 — 화면과 같은 반원 트랙. 0 왼쪽 → 100 오른쪽, 100 끝에 교수님.
      var gx = 900, gy = 400, GR = 200, BW = 40;
      var gAngle = function (score) { return Math.max(0, Math.min(100, score)) / 100 * Math.PI; };   // 100 왼쪽(교수님) → 0 오른쪽(안전)
      var gPoint = function (score, r) { var a = gAngle(score); return [gx + Math.cos(a) * r, gy - Math.sin(a) * r]; };
      var arc = function (from, to, r, color, width) {
        ctx.beginPath(); ctx.arc(gx, gy, r, -gAngle(from), -gAngle(to), false);
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.stroke();
      };
      // 호는 왼쪽(100)에서 오른쪽(0)으로 시계 방향
      var zonesC = [[100, 50, '#fde1dc', '#e3665a'], [49, 21, '#e3daff', '#6d4aff'], [20, 0, '#d5edf2', '#3fb2c9']];
      zonesC.forEach(function (z) { arc(z[0], z[1], GR, z[2], BW); });
      if (model.score != null) zonesC.forEach(function (z) { var lo = Math.max(model.score, z[1]); if (lo <= z[0]) arc(z[0], Math.min(z[0] - 0.5, lo), GR, z[3], BW); });
      ctx.fillStyle = '#e2dcff'; ctx.font = font('700', 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [[100, '100'], [0, '0']].forEach(function (t) { var lp = gPoint(t[0], GR - BW / 2 - 26); ctx.fillText(t[1], lp[0], lp[1]); });
      var zl = function (score, text, color) { var lp = gPoint(score, GR + BW / 2 + 22); ctx.fillStyle = color; ctx.font = font('800', 22); ctx.fillText(text, lp[0], lp[1]); };
      zl(82, '위험', '#ffb9ac'); zl(35, '주의', '#c9b8ff'); zl(10, '안전', '#9fd6e2');
      ctx.setLineDash([4, 9]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, GR, -gAngle(100), -gAngle(0), false); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var imgs = await Promise.all([repLoadImage('/assets/img/report/professor.png'), repLoadImage('/assets/img/report/runner.png')]);
      var drawClipped = function (img, x, y, r) {
        if (!img) return;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        var s = Math.min((r * 2 - 6) / img.width, (r * 2 - 6) / img.height);   // 원 안에 인물 전체(contain)
        ctx.drawImage(img, x - img.width * s / 2, y - img.height * s / 2, img.width * s, img.height * s);
        ctx.restore();
      };
      var label = function (x, y, text) {
        ctx.font = font('800', 20); var w = ctx.measureText(text).width + 24;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 15, w, 30, 15); ctx.fill();
        ctx.fillStyle = '#241c5c'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(text, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      };
      var pp = gPoint(100, GR);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(pp[0] - 44, pp[1] - 6, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#241c5c'; ctx.lineWidth = 4; ctx.stroke();
      drawClipped(imgs[0], pp[0] - 44, pp[1] - 6, 32);
      label(pp[0] - 44, pp[1] + 52, '교수님');
      if (model.score != null) {
        var bp = gPoint(model.score, GR);
        ctx.fillStyle = 'rgba(109,74,255,.25)'; ctx.beginPath(); ctx.arc(bp[0], bp[1], 62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bp[0], bp[1], 48, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6d4aff'; ctx.lineWidth = 5; ctx.stroke();
        drawClipped(imgs[1], bp[0], bp[1], 44);
        var ang = gAngle(model.score);
        label(bp[0] - Math.cos(ang) * 78, bp[1] + Math.sin(ang) * 78, '내 글');
      }
      var blob = await new Promise(function (resolve) { cv.toBlob(resolve, 'image/png'); });
      if (!blob) throw new Error('canvas_blob_failed');
      var fileName = '교수님피하기-감지보고서-' + (model.score == null ? '점수미정' : model.score + '점') + '.png';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (window.gpToast) window.gpToast('결과 이미지를 저장했어요.');
    } catch (e) {
      if (window.gpToast) window.gpToast('이미지를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
    }
  };

  // ── 개선 포인트 ─────────────────────────────────────────────────────────────
  // 측정된 것만 말한다. 값이 기준을 넘은 축에서만 문장을 만들고, 없으면 유지 안내로 닫는다.
  function repBuildTips(model) {
    var m = model.measured || {};
    var tips = [];
    if (Number(m.maxEndingRun) >= 4) {
      tips.push('같은 활용(예: ~했습니다)이 ' + m.maxEndingRun + '문장 이어져요. 몇 문장만 다른 어미로 끊어 보세요.');
    }
    var smallSample = m.sampleSize === 'small' || (model.content.total != null && model.content.total < 5);
    if (!smallSample && Number.isFinite(Number(m.lengthCV)) && Number(m.lengthCV) < 0.25) {
      tips.push('문장 길이가 고르게 붙어 있어요. 짧은 문장과 긴 문장을 섞어 보세요.');
    }
    if (model.content.generic && model.content.total) {
      tips.push('일반적인 표현 문장이 ' + model.content.generic + '/' + model.content.total + '개예요. 실제로 겪은 장면으로 바꿔 보세요.');
    }
    if (Number(m.realAnchorCount) === 0) {
      tips.push('숫자·연도·고유명사 같은 구체 근거가 아직 없어요. 정확히 아는 값만 더해 보세요.');
    }
    if (!tips.length) tips.push('두드러진 문체 신호가 없어요. 지금 표현을 유지해도 좋아요.');
    return tips.slice(0, 3);
  }

  // ── 전환 밴드 ───────────────────────────────────────────────────────────────
  // 유료 전환을 권할 수 있는 상태와 그렇지 않은 상태를 같은 자리에서 다른 말로 닫는다.
  // 권하지 않는 상태에서는 버튼을 지우거나(추정 보류) 부차 버튼으로 낮춘다(이미 유리한 글).
  function repPaintCta(model) {
    var band = $('gpRepNext');
    if (!band) return;
    var title = $('gpRepCtaTitle'), desc = $('gpRepCtaDesc');
    var btn = $('gpRepCtaBtn'), help = $('gpRepCtaHelp'), cost = $('gpRepGoCost');
    var eligible = model.conversionEligible !== false;
    band.hidden = false;
    band.classList.toggle('is-quiet', !eligible);

    if (eligible) {
      if (title) {
        title.textContent = model.content.generic > 0
          ? '후보 ' + model.content.generic + '문장, 지금 휴머나이징해 볼까요?'
          : '이 글, 지금 휴머나이징해 볼까요?';
      }
      if (desc) desc.textContent = '뜻과 사실은 그대로, 문체만 다시 씁니다.';
      if (btn) { btn.hidden = false; btn.textContent = '추천 방법·비용 확인하기 →'; }
      if (help) help.hidden = false;
      // v125: 예상 변화 칩(원인 축 리드·문장 수 칩)은 밴드를 어수선하게 해 뺐다(사장님 9/2) — 제목·한 줄·버튼·비용만.
      repPaintExpect(null);
      return;
    }
    repPaintExpect(null);

    if (cost) cost.hidden = true;
    if (model.style.source === 'engine') {
      // 점수가 간이 추정이면 유료 수정을 권하지 않는다 — 다만 왜 멈췄는지는 말한다.
      if (title) title.textContent = '지금은 추천을 보류했어요';
      if (desc) desc.textContent = 'AI 모델 분석이 완료되지 않아 점수가 간이 추정이에요. 위 계측 수치와 개선 포인트는 그대로 쓸 수 있고, 잠시 뒤 다시 감지하면 정식 판정을 볼 수 있어요.';
      if (btn) btn.hidden = true;
      if (help) help.hidden = true;
      return;
    }
    if (model.radar.band === 'low') {
      if (title) title.textContent = '지금 이 글은 피하기에 유리한 편이에요';
      if (desc) desc.textContent = '두드러진 AI식 문체 신호가 없어 굳이 다듬지 않아도 괜찮아요. 그래도 문체를 손보고 싶다면 비용부터 확인해 보세요.';
      if (btn) { btn.hidden = false; btn.textContent = '그래도 방법·비용 보기 →'; }
      if (help) help.hidden = false;
      return;
    }
    if (title) title.textContent = '판단할 근거가 아직 부족해요';
    if (desc) desc.textContent = '문장 수가 적어 내용 근거를 충분히 확인하지 못했어요. 글을 더 붙여 넣고 다시 감지하면 더 정확하게 볼 수 있어요.';
    if (btn) btn.hidden = true;
    if (help) help.hidden = true;
  }

  function repPaintExpect(model) {
    var list = $('gpRepExpect');
    if (!list) return;
    list.textContent = '';
    var rows = model ? repExpectedEffect(model) : [];
    list.hidden = !rows.length;
    rows.forEach(function (row) {
      var li = document.createElement('li');
      var label = document.createElement('span'); label.textContent = row.label;
      var value = document.createElement('b'); value.textContent = row.value;
      li.appendChild(label); li.appendChild(value);
      list.appendChild(li);
    });
  }

  // ── 보고서 렌더 ─────────────────────────────────────────────────────────────
  function renderReport(d) {
    if (typeof window.gpNormalizeDetectPresentation === 'function') {
      d = window.gpNormalizeDetectPresentation(d);
    }
    var srcInput = $('lavInput');
    try { Object.defineProperty(d, '__inputText', { value: srcInput ? String(srcInput.value || '') : '', enumerable: false, writable: true }); } catch (e) { /* 동결 객체면 생략 */ }
    lastReport = d;
    var model = buildReportModel(d);
    lastReportModel = model;
    var score = model.score;
    repProbTarget = score;

    // ① 히어로 — 종합 한 문장과 유지될 내용
    if ($('gpRepHeroTitle')) $('gpRepHeroTitle').textContent = model.synthesis.headline || '';
    var keeps = $('gpRepKeeps');
    if (keeps) {
      keeps.textContent = '';
      (model.preservation || []).forEach(function (item) {
        if (!item) return;
        // '원문 밖 새 사실 생성하지 않음'은 휴머나이저의 약속이라 감지 화면에서는 뜻이 닿지 않는다(사장님 9/2) — 여기서는 뺀다.
        if (typeof item === 'object' && item.key === 'grounding') return;
        var li = document.createElement('li');
        var label = document.createElement('span');
        label.textContent = typeof item === 'object' ? item.label : String(item);
        li.appendChild(label);
        if (typeof item === 'object') {
          var value = document.createElement('b');
          value.textContent = item.value != null ? String(item.value) : (Number(item.count) || 0) + '문장';
          li.appendChild(value);
        }
        keeps.appendChild(li);
      });
      keeps.hidden = keeps.children.length === 0;
    }

    // Before / After — 한 문장까지만. 전체는 휴머나이징의 몫이다.
    var example = d.example || {};
    var usable = !!(example.before && example.after);
    // 예시가 없으면 좌우 칸이 빠지므로 3열 격자를 접어 게이지를 가운데로 둔다.
    if ($('gpRepBa')) { $('gpRepBa').hidden = false; $('gpRepBa').classList.toggle('is-solo', !usable); }
    repPaintBefore(usable ? example : null);
    repPaintAfter(usable ? example : null);
    var beforeCol = document.querySelector('.gp-rep-ba-col.before');
    var afterCol = document.querySelector('.gp-rep-ba-col.after');
    if (beforeCol) beforeCol.hidden = !usable;
    if (afterCol) afterCol.hidden = !usable;
    var baEmpty = $('gpRepBaEmpty');
    if (baEmpty) {
      baEmpty.hidden = usable;
      if (!usable) {
        // 우리 쪽 실패와 원문에 후보가 없는 경우를 구분해 말한다.
        baEmpty.textContent = d.exampleStatus === 'unavailable'
          ? '예시 문장을 다듬는 중 오류가 생겨 이번에는 미리보기를 만들지 못했어요. 아래 분석은 그대로 확인할 수 있어요.'
          : '사실을 바꾸지 않고 보여줄 예시 문장을 원문에서 찾지 못했어요. 아래 분석에서 근거를 확인해 주세요.';
      }
    }

    // 교수님 레이더
    var dial = $('gpRepDial');
    if (dial) dial.className = 'gp-rep-dial is-' + (model.radar.band || 'unknown');
    repPaintScope(model);
    if ($('gpRepScore')) $('gpRepScore').textContent = score == null ? '--' : String(score);
    if ($('gpRepBandChip')) $('gpRepBandChip').textContent = model.radar.label || '판정 준비 중';
    if ($('gpRepSource')) {
      // 엔진 간이 추정은 모델 판정과 신뢰도가 달라 점수 옆에서 밝힌다.
      // 이력 보정 사실은 화면에 표기하지 않는다(사장님 결정 2026-09-02). 값은 응답·관리자 원장에 남는다.
      $('gpRepSource').textContent = model.style.source === 'engine' ? model.style.sourceLabel : '';
    }

    // ② 계측 띠
    var measured = model.measured || {};
    var setStat = function (id, value) { var el = $(id); if (el) el.textContent = value; };
    setStat('gpRepStatTotal', model.content.total ? model.content.total.toLocaleString('ko-KR') + '문장' : '—');
    var genericEl = $('gpRepStatGeneric');
    if (genericEl) {
      genericEl.textContent = '';
      if (model.content.generic != null && model.content.total) {
        genericEl.appendChild(document.createTextNode(model.content.generic + '문장'));
        var pct = document.createElement('em');
        pct.textContent = (model.content.generic / model.content.total * 100).toFixed(1) + '%';
        genericEl.appendChild(pct);
      } else {
        genericEl.textContent = '—';
      }
    }
    setStat('gpRepStatRhythm', Number.isFinite(Number(measured.lengthCV))
      ? (Number(measured.lengthCV) * 100).toFixed(1) + '%' : '—');
    setStat('gpRepStatEnding', measured.maxEndingRun ? measured.maxEndingRun + '문장 연속' : '—');
    // 2문장 통계를 786문장과 같은 확신으로 보이지 않게 — 5문장 미만이면 한 줄 붙인다.
    var sample = $('gpRepSample');
    if (sample) {
      var small = measured.sampleSize === 'small' || (model.content.total != null && model.content.total < 5);
      sample.hidden = !small;
      sample.textContent = small
        ? '문장 ' + (model.content.total || 0) + '개는 표본이 적어요. 길이 편차·종결 반복은 참고만 하고, 글을 더 붙여 넣으면 더 정확해져요.'
        : '';
    }

    // ③ 문장·원인·개선
    repSetupMap(model);
    repPaintRadar(model);
    repBindStatLinks();
    var tips = $('gpRepTips');
    if (tips) {
      tips.textContent = '';
      var tipLines = repBuildTips(model);
      // 처방마다 그 근거 축이 있다 — 누르면 그 축이 켜져 문장이 보인다.
      var tipAxis = function (line) {
        return /같은 활용/.test(line) ? 'ending' : /문장 길이/.test(line) ? 'uniform' : /일반적인 표현/.test(line) ? 'generic' : /구체 근거/.test(line) ? 'anchor' : null;
      };
      tipLines.forEach(function (line) {
        var li = document.createElement('li');
        var axis = tipAxis(line);
        if (axis) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'gp-rep-tipbtn'; b.textContent = line;
          b.setAttribute('data-axis', axis);
          b.addEventListener('click', function () { repLinkAxis(axis, true); var head = $('gpRepLinkHead'); if (head && window.matchMedia('(max-width:1080px)').matches) head.scrollIntoView({ behavior: repReducedMotion() ? 'auto' : 'smooth', block: 'center' }); });
          b.addEventListener('mouseenter', function () { repLinkAxis(axis, false); });
          b.addEventListener('mouseleave', function () { repLinkAxis(null, false); });
          li.appendChild(b);
        } else li.textContent = line;
        tips.appendChild(li);
      });
      if ($('gpRepTipsCount')) $('gpRepTipsCount').textContent = tipLines.length + '가지';
      // 처방 아래 전환 — 유료 수정을 권하지 않는 상태(간이 추정·근거 부족·유리한 글)에서는 붙이지 않는다.
      var tipsCta = $('gpRepTipsCta');
      if (tipsCta) {
        var actionable = tipLines.filter(function (line) { return !/두드러진 문체 신호가 없어요/.test(line); }).length;
        tipsCta.hidden = model.conversionEligible === false || actionable === 0;
        if ($('gpRepTipsCtaText')) $('gpRepTipsCtaText').textContent = '이 ' + actionable + '가지를 한 번에 손보려면';
      }
    }

    // ④ 전환·한계
    //   추천을 보류하는 상황(간이 추정·근거 부족·이미 유리한 글)에서 밴드를 통째로 감추면
    //   보고서가 '개선 포인트' 뒤 허공에서 끝났다. 밀지 않되 닫는 말은 남긴다.
    repPaintCta(model);
    repSetupSticky(model);
    if ($('gpRepLimit')) {
      var limit = model.synthesis.limitation || '';
      if (model.style.source === 'engine') {
        limit = 'AI 모델 분석이 완료되지 않아 문체 엔진의 간이 추정으로 계산한 점수예요. ' + limit;
      }
      $('gpRepLimit').textContent = limit;
    }
    if ($('gpRepRemain')) {
      $('gpRepRemain').textContent = d.charged
        ? '이번 감지에 ' + d.charged + '크레딧을 사용했어요. (100자당 1크레딧)'
        : '';
      renderReportGoCost();
    }

    var report = document.querySelector('[data-flow="report"]');
    if (report) {
      report.dataset.announcement = score == null
        ? 'AI 감지 분석을 마쳤어요. 점수를 확인하지 못했어요.'
        : 'AI 감지 분석을 마쳤어요. AI식 문체 신호 ' + score + '점, 100점 만점. ' + (model.radar.label || '');
    }
  }

  // 보고서 → 휴머나이징 핸드오프: 해결 경로 선택은 보고서가 아니라
  // 기존 방법 선택(choose) 화면에서. 보고서 데이터로 진단 배너·밴드를 채워 재진단 없이 이어가고,
  // 글은 입력칸(lavInput)에 그대로 남아 있어 같은 글로 바로 진행된다(컨텍스트 바 원문 N자 표기 동일).
  window.lavReportToHumanize = function () {
    window.lavSetMode('humanize');   // 휴머나이저로 "이동" — 모드 상태도 함께 전환(입력 화면 복귀 시 일관)
    resetToneChoice();
    var d = lastReport;
    if (d) {
      var reportModel = lastReportModel || buildReportModel(d);
      var sol = d.solutions || {};
      applyDiag({
        grade: d.grade,
        title: reportModel.synthesis.headline,
        desc: reportModel.synthesis.description,
        reportContext: true,
        reportView: d.reportView || {},
        reportSynthesis: reportModel.synthesis,
        contentEvidence: reportModel.content,
        reportMeta: 'AI식 문체 신호 ' + (reportModel.score == null ? '확인 필요' : reportModel.score + '/100')
          + ' · 교수님 레이더 ' + reportModel.radar.label + ' · 내용 근거 ' + reportModel.content.label,
        abstractRiskRatio: Number(d.abstractRiskRatio) || 0,
        needsUserAnchor: Number(d.abstractRiskRatio) >= 0.5 || d.grade === 'C',
        diagnosisSource: 'paid_report',
        restructureUnfit: d.restructureUnfit === true,
        restructureUnfitReason: d.restructureUnfitReason || '',
        restructureUnfitKind: d.restructureUnfitKind || null,
        advancedEligible: d.advancedEligible,
        recommendedMode: d.recommendedMode || 'blog',
        recommendationCode: d.recommendationCode || null,
        recommendationReason: d.recommendationReason || '',
        documentProfile: d.documentProfile || 'unknown',
        profileConfidence: Number(d.profileConfidence) || 0,
        routingOverride: d.routingOverride || null,
        bands: {
          polish: sol.polish && sol.polish.band,
          blog: sol.blog && sol.blog.band,
          restructure: sol.restructure && sol.restructure.band
        }
      });
    }
    applyAdvancedRouting();   // 보고서 경유 진입도 3택 카드 상태·비용을 즉시 준비
    renderSelectCosts();
    show('select');
    trackDiagnosisView(lastDiag);
  };

  window.lavFlowReset = function () {
    if (isBlockingJobStatus(activeJobUi.status) || readJobRef()) {
      window.lavOpenActiveJob();
      return false;
    }
    exitWorkspace();
    var src = $('lavInput');
    if (src) src.focus();
    return true;
  };

  // ── 결과/보고서 본문 접기(한 화면 미리보기 + 펼쳐보기) ──
  function lavReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  window.lavToggleCollapse = function (targetId, btn) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var from = el.clientHeight;
    var open = el.classList.toggle('expanded');
    if (!lavReducedMotion() && el.animate) {
      // max-height none↔340px는 트랜지션이 안 걸리므로 실측 px 두 점을 WAAPI로 보간
      var to = open ? el.scrollHeight : el.clientHeight;
      el.style.overflow = 'hidden';
      var anim = el.animate([{ maxHeight: from + 'px' }, { maxHeight: to + 'px' }], { duration: 300, easing: 'cubic-bezier(.25,.7,.3,1)' });
      anim.onfinish = anim.oncancel = function () { el.style.overflow = ''; };
    }
    if (btn) {
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = open ? '접기' : '펼쳐보기';
    }
    // 접기: 본문이 갑자기 짧아지면 사용자가 문서 한참 아래 남으므로 섹션 머리로 시야 복귀
    if (!open && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ behavior: lavReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  };
  var collapseRegistry = [];   // 리사이즈(모바일 회전 등) 시 접힘 초과 여부 재평가용
  function lavSyncCollapse(targetId, toggleId) {
    var el = document.getElementById(targetId);
    var btn = document.getElementById(toggleId);
    if (!el || !btn) return;
    var clipped = el.scrollHeight > el.clientHeight + 6;
    // 접힌 높이를 안 넘으면 토글·하단 페이드 모두 숨김(넘칠 때만 '펼쳐보기' 노출)
    el.classList.toggle('clipped', clipped || el.classList.contains('expanded'));
    if (!el.classList.contains('expanded')) btn.hidden = !clipped;
  }
  function lavInitCollapse(targetId, toggleId) {
    var el = document.getElementById(targetId);
    var btn = document.getElementById(toggleId);
    if (!el || !btn) return;
    el.classList.remove('expanded');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    var lbl = btn.querySelector('span'); if (lbl) lbl.textContent = '펼쳐보기';
    if (!collapseRegistry.some(function (p) { return p[0] === targetId; })) collapseRegistry.push([targetId, toggleId]);
    // 레이아웃 반영(2 rAF) 후, 접힌 높이보다 내용이 길 때만 토글 노출
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        lavSyncCollapse(targetId, toggleId);
      });
    });
  }
  var collapseResizeTimer = null;
  window.addEventListener('resize', function () {
    if (!collapseRegistry.length) return;
    clearTimeout(collapseResizeTimer);
    collapseResizeTimer = setTimeout(function () {
      collapseRegistry.forEach(function (p) { lavSyncCollapse(p[0], p[1]); });
    }, 150);
  });

  function updateCtaMeta() {
    var ctaMeta = $('lavCtaMeta');
    if (!ctaMeta) return;
    var tone = document.querySelector('input[name="lavTone"]:checked');
    var formal = tone && tone.value === 'formal';
    var src = $('lavInput');
    var text = src ? src.value : '';
    var evidence = !!($('lavEvidence') && $('lavEvidence').checked && !$('lavEvidence').disabled);
    if (formal) {
      ctaMeta.textContent = estimateTimeRangeLabel(formalEstimateRange(text, evidence)) + ' · ' + advancedCredit(text.length, evidence) + '크레딧';
    } else {
      ctaMeta.textContent = estimateTimeLabel(shortEstimateSec(text)) + ' · ' + shortHumanizeCredit(text.length) + '크레딧';
    }
  }

  // 3택 화면(2026-08-28): 구 reduce 화면의 블록 토글이 사라져 라디오 변경은 비용 갱신만 담당한다.
  window.lavToneChange = function (userInitiated) {
    if (userInitiated === true) toneSelectionTouched = true;
    renderSelectCosts();
  };

  window.lavBasicStyleChange = function () {
    renderDetailSummary();
    if (window.lavToneChange) window.lavToneChange();
  };

  window.lavEvidenceChange = function () {
    renderSelectCosts();     // 선택 화면 고급 카드 비용(모달을 닫고 돌아갈 때 정합)
    renderConfirmCost();     // 모달 안에서 켜면 필요한 크레딧·시간이 즉시 바뀐다(2026-08-29)
  };

  // 확인 모달의 크레딧·시간만 다시 계산 — 근거 보강 토글이 모달 안에서 바로 반영되게 분리
  function renderConfirmCost() {
    var modal = $('lavConfirmModal');
    if (!modal || modal.hidden) return;
    if (pendingPolish) return;   // 보존형 다듬기 확인은 자체 표기를 쓴다
    var s = currentSettings();
    var src = $('lavInput');
    var text = src ? src.value : '';
    var len = text.length;
    var evidenceCredit = $('lavEvidenceCredit');
    if (evidenceCredit) evidenceCredit.textContent = '+' + window.gpHumanizePricing.advancedEvidenceCredits(len) + '크레딧';
    var credit, time;
    if (s.tone === 'formal') {
      credit = advancedCredit(len, s.evidence) + ' 크레딧';
      time = estimateTimeRangeLabel(formalEstimateRange(text, s.evidence)) + ' · 대기 제외';
    } else {
      credit = shortHumanizeCredit(len) + ' 크레딧';
      time = estimateTimeLabel(shortEstimateSec(text)) + ' · 대기 제외';
    }
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = credit;
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = time;
  }

  // 사전 메모는 차단 화면 인라인 입력(lavMemoOverride) 하나로 축소 — 경험·관점 아코디언과
  // 자동 코칭(coach-suggest)은 사후 문단 보강 루프가 대체한다(2026-08-28 흐름 단순화).
  function collectMemo() {
    return (lavMemoOverride || '').trim();
  }
  var _coachLoading = false;   // 시작 버튼 잠금 상태(효과 사전고지와 공유) — 코칭 제거 후에도 잠금 계약 유지
  function lavStartBtn() { return $('lavConfirmStartBtn'); }
  function effectNoticeRequired() {
    var notice = $('lavEffectNotice');
    return !!(notice && !notice.hidden);
  }
  function updateConfirmStartState() {
    var b = lavStartBtn(); if (!b) return;
    var accepted = !effectNoticeRequired() || !!($('lavEffectNoticeAccepted') && $('lavEffectNoticeAccepted').checked);
    b.disabled = _coachLoading || !accepted;
    b.textContent = _coachLoading ? '추천 불러오는 중…' : (!accepted ? '위 내용을 확인해 주세요' : '시작하기');
  }
  function lavStartBtnState(loading) {   // 픽 로딩 중엔 시작 잠금(빈 창에서 그냥 넘어가는 것 방지)
    _coachLoading = !!loading;
    updateConfirmStartState();
  }
  window.lavEffectNoticeChange = updateConfirmStartState;
  function renderEffectNotice(s) {
    var notice = $('lavEffectNotice');
    var checkbox = $('lavEffectNoticeAccepted');
    if (!notice) return;
    var limited = !pendingPolish
      && !!s
      && (s.tone === 'blog' || s.tone === 'formal')
      && !!lastDiag
      && lastDiag.effectExpectation === 'limited';
    notice.hidden = !limited;
    if (checkbox) checkbox.checked = false;
    updateConfirmStartState();
  }
  function effectNoticeAcceptedForRun() {
    return !effectNoticeRequired() || !!($('lavEffectNoticeAccepted') && $('lavEffectNoticeAccepted').checked);
  }
  function currentBasicStyle() {
    var style = document.querySelector('input[name="lavBasicStyle"]:checked');
    return style ? style.value : 'blog';
  }
  var DOCUMENT_PROFILE_LABELS = {
    academic_paper: '논문·학술글',
    report_assignment: '과제·보고서',
    long_explainer: '전문 설명·장문 해설',
    clinical_record: '임상·전문 기록',
    legal_contract: '계약서·약관',
    student_record_teacher: '세특·교사 관찰 기록',
    student_self_assessment: '학생 자기평가',
    resume_application: '자소서·지원서',
    personal_essay: '개인 에세이',
    review_blog: '후기·블로그',
    marketing: '홍보·광고',
    social: 'SNS 글',
    mail_notice: '메일·안내문',
    creative: '시·창작문',
    general: '일반 글'
  };
  function currentDocumentProfile() {
    var select = $('lavDocumentProfile');
    var value = select ? String(select.value || '') : '';
    return DOCUMENT_PROFILE_LABELS[value] ? value : '';
  }
  // 접힌 세부 설정에 현재 값 표시 — 열지 않아도 무엇이 적용 중인지 보이게(2026-08-29)
  function renderDetailSummary() {
    var el = $('lavDetailSummary');
    if (!el) return;
    var profile = currentDocumentProfile();
    var style = currentBasicStyle() === 'report' ? '격식 있게' : '친근하게';
    el.textContent = (profile ? DOCUMENT_PROFILE_LABELS[profile] : '자동 판별') + ' · ' + style;
    el.classList.toggle('is-custom', !!profile || currentBasicStyle() === 'report');
  }

  window.lavDocumentProfileChange = function () {
    var hint = $('lavDocumentProfileHint');
    var profile = currentDocumentProfile();
    renderDetailSummary();
    if (hint) {
      hint.textContent = profile
        ? '자동 판정이 애매할 때만 이 선택을 사용해요. 원문 장르가 뚜렷하면 안전을 위해 자동 판정을 우선해요.'
        : '원문의 구성·어휘·종결체를 보고 엔진이 글 종류를 판별해요.';
    }
  };
  function currentSettings() {
    var tone = document.querySelector('input[name="lavTone"]:checked');
    var ev = $('lavEvidence');
    var basicStyle = tone && tone.value === 'blog' ? currentBasicStyle() : null;
    var basicReport = basicStyle === 'report';
    return {
      tone: tone ? tone.value : 'blog',
      basicStyle: basicStyle || 'blog',
      documentProfile: currentDocumentProfile(),
      length: 'keep',   // 분량 옵션 화면 제거(2026-08-28) — 서버 계약은 keep 고정 유지
      memo: basicReport ? '' : collectMemo(),
      evidence: !!(ev && ev.checked && !ev.disabled),
      autoCoach: false   // 사전 코칭 제거(2026-08-28) — 사후 문단 보강이 대체
    };
  }

  // 확인 모달은 여러 모드가 같은 DOM을 공유한다. 모드를 바꿀 때 이전 고급 옵션이
  // 다듬기·기본 확인창에 남지 않도록, 열 때마다 노출과 선택값을 함께 동기화한다.
  function setConfirmEvidenceAvailability(available) {
    var row = $('lavEvidenceRow');
    var checkbox = $('lavEvidence');
    var enabled = available === true && !(checkbox && checkbox.disabled);
    var cleared = !!(checkbox && checkbox.checked && !enabled);
    if (cleared) checkbox.checked = false;
    if (row) row.hidden = !enabled;
    if (cleared) renderSelectCosts();
    return enabled;
  }

  window.lavOpenConfirm = function () {
    pendingPolish = false;   // 휴머나이징 확인 — 다듬기 플래그 정리
    var ttl = document.querySelector('#lavConfirmModal .lav-confirm-title');
    if (ttl) ttl.textContent = '이 설정으로 시작할까요?';
    var tone = document.querySelector('input[name="lavTone"]:checked');
    setConfirmEvidenceAvailability(!!(tone && tone.value === 'formal'));
    var s = currentSettings();
    lavStartBtnState(false);   // 코칭 잠금 제거(2026-08-28) — 잔여 잠금 방어
    renderEffectNotice(s);
    var sum = $('lavConfirmSummary');
    if (sum) {
      var rows = [];
      rows.push(['방식', s.tone === 'formal' ? '고급 휴머나이징 — 항상 전 문서 정밀 검증' : '기본 휴머나이징 — 장르 자동 맞춤']);
      rows.push(['글 종류', s.documentProfile ? DOCUMENT_PROFILE_LABELS[s.documentProfile] + ' · 애매할 때만 반영' : '자동 판별']);
      if (s.tone === 'blog') rows.push(['문체 보조', s.basicStyle === 'report' ? '격식 있는 표현 보조 · 원문 장르 우선' : '친근한 표현 보조 · 원문 장르 우선']);
      if (s.tone === 'formal') rows.push(['분량', '원문에 가깝게 유지']);
      if (s.memo) rows.push(['재도전 메모', '입력함 · 글에 자연스럽게 녹여요']);
      // 근거 보강은 아래 체크박스 행이 직접 보여주므로 요약 행에서 제외(2026-08-29 중복 제거)
      sum.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
      }).join('');
    }
    // 근거 보강 옵션: 고급이고 잠기지 않은 글에서만 노출(2026-08-29 선택화면 → 모달 이동)
    var subC = $('lavConfirmSub'); if (subC) subC.hidden = false;   // 회피는 탐지율 안내 노출
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
    if (window.gpTrack) window.gpTrack('humanize_confirm_view', { selected_mode: s.tone, is_recommended: isRecommendedMode(s.tone) });
    // 과금(서버와 동일): 기본 휴머나이징=최소 10크레딧 + 100자당 2크레딧,
    // 고급=입력 길이에 따른 5크레딧 단위 단계형 요금.
    renderConfirmCost();   // 모달을 연 뒤 호출 — 같은 공식을 근거 토글과 공유한다
  };

  window.lavCloseConfirm = function () {
    pendingPolish = false;   // 취소·닫기 시 플래그 정리(다음 확인에 안 새게)
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = true;
  };

  // ── P4 실연결: 근거 승인 리스트(서버 후보 — DOM 생성으로 XSS-safe) ──────────
  var pendingApproval = null;   // { jobId } — 승인 핸들러가 폴링을 재개할 때 사용

  function renderApprovalList(candidates, jobId) {
    pendingApproval = { jobId: jobId };
    var list = $('lavApproveList');
    if (!list) return;
    list.innerHTML = '';
    var recoCount = 0;
    candidates.forEach(function (c) {
      var reco = c.grade !== 'C' && !c.conflict;   // A·B + 무충돌 = 추천(기본 체크)
      if (reco) recoCount++;
      var label = document.createElement('label');
      label.className = 'lav-approve-item';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = reco;
      cb.setAttribute('data-id', c.id);
      cb.setAttribute('data-reco', reco ? '1' : '0');
      var div = document.createElement('div');
      var b = document.createElement('b');
      b.textContent = c.fact;
      var span = document.createElement('span');
      if (c.conflict) {
        span.className = 'warn';
        span.textContent = '⚠ 수치 충돌(' + (c.conflictDetail || '확인 필요') + ') — ' + (c.host || '');
      } else {
        span.textContent = (c.sourceTitle ? c.sourceTitle + ' · ' : '') + (c.host || '');
      }
      div.appendChild(b); div.appendChild(span);
      var gradeChip = document.createElement('span');
      gradeChip.className = 'lav-approve-grade ' + String(c.grade || 'b').toLowerCase();
      gradeChip.textContent = c.grade || 'B';
      label.appendChild(cb); label.appendChild(div); label.appendChild(gradeChip);
      list.appendChild(label);
    });
    if ($('lavApproveCount')) $('lavApproveCount').textContent = '검수할 근거 ' + candidates.length + '건';
    if ($('lavApproveRecoBtn')) $('lavApproveRecoBtn').textContent = '추천 ' + recoCount + '건 승인하고 계속';
  }

  async function submitApproval(mode) {
    if (!pendingApproval) return;
    var list = $('lavApproveList');
    var ids = [];
    if (list) list.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      var take = mode === 'pick' ? cb.checked : cb.getAttribute('data-reco') === '1';
      if (take) ids.push(parseInt(cb.getAttribute('data-id'), 10));
    });
    var jobId = pendingApproval.jobId;
    pendingApproval = null;
    var ap = $('lavApprove'); if (ap) ap.hidden = true;
    if ($('lavStepSlot')) $('lavStepSlot').textContent = '승인한 자료 ' + ids.length + '건으로 글 다시 쓰는 중';
    setActiveJobUi(jobId, 'running', '승인한 근거로 재구성 중');
    var gen = ++pollGen;
    var idToken = await evGetIdToken();
    fetch(window.apiUrl('/transform/' + jobId + '/approve'), {
      method: 'POST',
      headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approved: ids })
    }).then(function (res) { return res.json(); }).then(function (b) {
      if (gen !== pollGen) return;
      if (b && b.error) throw new Error(b.error);
      if (b && b.job && b.job.status === 'queued') {
        resumeTransformState(jobId, b.job);
        return;
      }
      var input = $('lavInput');
      var fallbackRange = formalEstimateRange(input ? input.value : '', true);
      replaceJobTicker(estimateRangeFromPayload(b && b.job, fallbackRange), '승인 근거로 재구성 중');
      return pollTransform(jobId, gen);
    }).catch(function (err) {
      if (gen !== pollGen) return;
      alert(err && err.message ? err.message : '승인 처리에 실패했어요.');
      show('select');
    });
  }

  // 작업 멱등 키 — 재시도·응답 유실 시 서버가 1회만 차감하도록(중복 차감 방지).
  function evGenReqId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  // 입력 주 언어 자동 판별 — 영어 글이 한글로 변환되던 버그(민원 #124·#145) 방지. 한글<15%면 영어.
  function evDetectLang(text) {
    var t = (text || '').replace(/\s+/g, '');
    if (!t.length) return 'ko';
    var ko = (t.match(/[가-힣]/g) || []).length;
    return (ko / t.length) < 0.15 ? 'en' : 'ko';
  }

  async function evGetIdToken(forceRefresh) {
    function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
    for (var i = 0; i < 20 && !window.authReady && !window._fbAuth; i++) {
      await sleep(100);
    }
    try {
      if (window.authPersistenceReady) await Promise.race([window.authPersistenceReady, sleep(500)]);
      if (window.authReady) await Promise.race([window.authReady, sleep(1000)]);
    } catch (e) {}
    if (typeof window.waitForAuthUser === 'function') {
      try {
        var waited = await window.waitForAuthUser(forceRefresh ? 8000 : 3500);
        if (waited && waited.getIdToken) return await waited.getIdToken(!!forceRefresh);
      } catch (e) {}
    }
    try {
      // forceRefresh=true → 만료된 토큰을 강제 갱신(긴 작업 폴링 중 401 복구용).
      var user = window.CU || (window._fbAuth && window._fbAuth.currentUser);
      var deadline = Date.now() + (forceRefresh ? 8000 : 3500);
      while (!(user && user.getIdToken) && Date.now() < deadline) {
        await sleep(150);
        user = window.CU || (window._fbAuth && window._fbAuth.currentUser);
      }
      if (user && user.getIdToken) {
        if (!window.CU) window.CU = user;
        return await user.getIdToken(!!forceRefresh);
      }
    } catch (e) {}
    return '';
  }

  function evAuthHeaders(idToken, extra) {
    var headers = Object.assign({}, extra || {});
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    return headers;
  }

  function setJobSteps(active) {
    var ol = $('lavSteps');
    if (!ol) return;
    ol.querySelectorAll('li').forEach(function (li, i) {
      li.classList.toggle('done', i < active);
      li.classList.toggle('active', i === active);
    });
  }

  // 단일 응답 작업이라 단계는 경과 시간 기반 추정 표시(마지막 단계는 응답 도착 시).
  // estimate는 초 또는 {lowSec, highSec}. initialSec는 재진입 시 이미 흐른 시간이다.
  function startJobTicker(estimate, label, initialSec) {
    var tickerGeneration = jobTickerGeneration;
    var t0 = initialSec || 0;
    var name = label || '문장 다듬는 중';
    var range = estimate && typeof estimate === 'object' ? estimate : null;
    var est = Math.max(60, Number(range ? range.highSec : estimate) || 300);
    var timing = range ? estimateTimeRangeLabel(range) : '예상 ' + Math.round(est / 60) + '분';
    setJobSteps(t0 > est * 0.7 ? 2 : 1);
    var paint = function () {
      if (tickerGeneration !== jobTickerGeneration) return;
      var timeText = range && t0 > est ? '예상 범위를 지나 계속 처리 중' : timing;
      if ($('lavStepSlot')) $('lavStepSlot').textContent = name + ' (' + Math.min(99, Math.round(t0 / est * 100)) + '% · ' + timeText + ')';
      if (t0 > est * 0.7) setJobSteps(2);
    };
    paint();
    var timer = setInterval(function () {
      if (tickerGeneration !== jobTickerGeneration) { clearInterval(timer); return; }
      t0 += 2;
      paint();
    }, 2000);
    return function stop() { clearInterval(timer); };
  }

  function lavQueueWaitText(sec) {
    var s = Math.max(0, Math.round(sec || 0));
    if (s < 60) return '곧 시작';
    return '약 ' + Math.max(1, Math.round(s / 60)) + '분';
  }

  function renderQueuedState(jobId, st) {
    stopFormalTicker();
    setActiveJobUi(jobId, 'queued', '휴머나이징 대기 중');
    setJobSteps(0);
    var ap = $('lavApprove'); if (ap) ap.hidden = true;
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '대기열에서 기다리고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = jobId ? '#' + jobId.slice(0, 6).toUpperCase() : '';
    var pos = st && st.queuePosition ? st.queuePosition : 1;
    var size = st && st.queueSize ? st.queueSize : pos;
    var wait = lavQueueWaitText(st && st.queueEtaSec);
    if ($('lavStepSlot')) $('lavStepSlot').textContent = '대기 ' + pos + '번째' + (size > 1 ? ' / ' + size + '명' : '') + ' · 예상 ' + wait;
  }

  // 보고서에서 넘어온 글이면 원글의 감지 점수·근거 수를 작업에 같이 보낸다.
  //   서버는 이력에 남겨 재검사 보정의 원점수 상한으로 쓰고, 결과 화면은 "유지할 근거 보존"을 같은 자로 다시 센다.
  //   입력칸의 글이 보고서 때와 다르면(사용자가 고침) 보내지 않는다 — 다른 글의 점수를 상한으로 쓰면 안 된다.
  function reportHandoffFields(text) {
    var d = lastDiag;
    if (!d || !d.reportContext || !lastReportModel) return {};
    var reportText = (lastReport && typeof lastReport.__inputText === 'string') ? lastReport.__inputText : null;
    if (reportText != null && reportText.replace(/\s+/g, '') !== String(text || '').replace(/\s+/g, '')) return {};
    var out = {};
    if (lastReportModel.score != null) out.sourceProbability = lastReportModel.score;
    var c = lastReportModel.content || {};
    if (c.total) out.sourceEvidence = { lived: Number(c.lived) || 0, specific: Number(c.specific) || 0, total: Number(c.total) || 0 };
    return out;
  }

  function renderPreservationBadge(st) {
    var wrap = $('lavTrust');
    if (!wrap || !st) return;
    var check = st.result && st.result.preservationCheck;
    var source = st.sourceEvidence;
    if (!check || !source || !source.total) return;
    var lived = Math.min(Number(check.lived) || 0, Number(source.lived) || 0);
    var specific = Math.min(Number(check.specific) || 0, Number(source.specific) || 0);
    var parts = [];
    if (Number(source.lived) > 0) parts.push('실제 경험 ' + lived + '/' + source.lived);
    if (Number(source.specific) > 0) parts.push('구체 사실 ' + specific + '/' + source.specific);
    if (!parts.length) return;
    var full = lived >= Number(source.lived) && specific >= Number(source.specific);
    var s = document.createElement('span');
    s.className = 'lav-trust-badge' + (full ? ' ok' : '');
    s.textContent = '유지할 근거 ' + (full ? '보존' : '확인 필요') + ' · ' + parts.join(' · ');
    s.title = '감지 보고서가 센 실제 경험·구체 사실 문장을 결과에서 같은 기준으로 다시 센 값이에요.';
    wrap.appendChild(s);
  }

  function renderBadges(fr, result) {
    var wrap = $('lavTrust');
    if (!wrap) return;
    wrap.innerHTML = '';
    function badge(state, txt) {
      var s = document.createElement('span');
      s.className = 'lav-trust-badge' + (state === true ? ' ok' : state === false ? ' warn' : '');
      s.textContent = txt;
      wrap.appendChild(s);
    }
    var m = (fr && fr.metrics) || {};
    if (m.novelty === 0) badge(true, '새 사실 없음');
    if (m.lostFacts === 0) badge(true, '보호 사실 유지');
    if (m.repetition === 0) badge(true, '신규 반복 없음');
    if (m.judge === 'pass') badge(true, '의미 검증 완료');
    var korean = result && result.koreanRefinement;
    if (korean && korean.pass === true) badge(true, '한국어 표현 점검 완료');
    if (m.evidenceUsed > 0) badge(true, '승인 근거 ' + m.evidenceUsed + '건 · 수치·출처 일치');
    if (typeof m.lengthRatio === 'number') badge(true, '분량 ' + Math.round(m.lengthRatio * 100) + '%');
  }

  function runShortJob(mode, s) {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    activeCancel = null;
    if ($('lavJobTitle')) $('lavJobTitle').textContent = mode === 'polish'
      ? '원문의 말투와 구조를 지키며 다듬고 있어요'
      : '원문의 장르를 지키며 문장을 다시 구성하고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    setActiveJobUi('', 'starting', mode === 'polish' ? '원문 보존 다듬기 시작 중' : '기본 휴머나이징 시작 중');
    show('job');
    armCancelWindow(0);   // 방금 시작 — 30초 취소 창 열기
    var bare = text.replace(/\s/g, '').length;
    replaceJobTicker(shortEstimateSec(text), mode === 'polish' ? '문장 완성도 정리 중' : '기본 휴머나이징 중');
    var gen = ++pollGen;
    (async function () {
      var idToken = '';
      try { idToken = await evGetIdToken(true); } catch (e) { /* 비로그인 — 서버가 401 안내 */ }
      try {
        if (!idToken) {
          var authErr = new Error('로그인 상태를 확인할 수 없어요. 다시 로그인한 뒤 이어서 시도해 주세요.');
          authErr.httpStatus = 401;
          throw authErr;
        }
        if (gen !== pollGen) return;
        var body = Object.assign({ text: text, mode: mode, memo: (s && s.memo) || '', lang: evDetectLang(text) }, reportHandoffFields(text));
        if (s && s.documentProfile) body.documentProfile = s.documentProfile;
        if (mode === 'blog') body.basicStyle = (s && s.basicStyle === 'report') ? 'report' : 'blog';
        if (mode !== 'polish') body.effectNoticeAccepted = !!(s && s.effectNoticeAccepted);
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify(body)
        }).then(parseTransformStart);
        if (gen !== pollGen) {
          if (r && r.jobId) makeJobCanceller(r.jobId)();
          return;
        }
        if ($('lavJobId')) $('lavJobId').textContent = '#' + r.jobId.slice(0, 6).toUpperCase();
        setActiveJobUi(r.jobId, r.job && r.job.status || 'running', mode === 'polish' ? '원문 보존 다듬기 진행 중' : '기본 휴머나이징 진행 중');
        saveJobRef(r.jobId, r.job && r.job.status || 'running');
        activeCancel = makeJobCanceller(r.jobId);
        if (r.job && r.job.status === 'queued') {
          resumeTransformState(r.jobId, r.job);
          return;
        }
        await pollTransform(r.jobId, gen);
      } catch (err) {
        if (gen !== pollGen) return;
        err.gpResumePayload = { flowMode: mode, text: text, settings: s || {} };
        await handleTransformStartError(err, 'select', gen);
      }
    })();
  }
  function runBlogEvasion(s) { return runShortJob('blog', s); }

  // 원문 보존 다듬기 — 바로 실행하지 않고 확인창에서 범위와 과금을 먼저 안내한다.
  var pendingPolish = false;
  window.lavRunPolish = function () {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    if (!text) { if (src) src.focus(); return; }
    trackModeSelection('polish');
    pendingPolish = true;
    setConfirmEvidenceAvailability(false);   // 직전 고급 확인창의 근거 보강 상태를 다듬기에 넘기지 않는다
    renderEffectNotice({ tone: 'polish' });
    lavStartBtnState(false);   // 잔여 시작버튼 잠금 방어
    var ttl = document.querySelector('#lavConfirmModal .lav-confirm-title');
    if (ttl) ttl.textContent = '원문 보존 다듬기를 시작할까요?';
    var sum = $('lavConfirmSummary');
    if (sum) {
      sum.innerHTML =
        '<li><span>방식</span><b>원문 보존 다듬기</b></li>' +
        '<li><span>보존 범위</span><b>장르·사실·구조 보존 · 분량 최대한 유지</b></li>' +
        '<li><span>수정 범위</span><b>맞춤법·문장 연결·중복 표현 정리</b></li>';
    }
    var subP = $('lavConfirmSub'); if (subP) subP.hidden = true;   // 원문 보존 다듬기는 탐지율과 무관
    var len = src ? src.value.length : 0;   // 글자수 통일: 공백 포함
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = shortHumanizeCredit(len) + ' 크레딧';
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = estimateTimeLabel(shortEstimateSec(text)) + ' · 대기 제외';
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
    if (window.gpTrack) window.gpTrack('humanize_confirm_view', { selected_mode: 'polish', is_recommended: false });
  };

  // ── P3+P4 실연결: 격식 유지 재구성 = POST /transform(job) + 폴링 + 근거 승인 ──────────
  var formalStop = null;   // 진행 ticker 정지 함수
  var activeCancel = null; // 현재 작업 취소 함수(blog=fetch abort, formal=POST /cancel)
  var pollGen = 0;         // 취소·새 작업 시작 시 증가 → 이전 폴링 루프 자연 종료
  var jobTickerGeneration = 0;   // 이전 작업 타이머가 새 작업 진행률을 덮어쓰지 못하게 하는 화면 세대
  var activeJobUi = { jobId: '', status: 'idle', label: '' };
  var lavBlockedJobId = null;   // 차단 화면이 띄운 job — '보존형으로 받기'(accept-fallback)에 필요
  var lavBlockedFallbackCredit = 0;   // 보존형 받기 단가 — 클릭 전 잔액(window.UC) 사전확인용

  function isBlockingJobStatus(status) {
    return ['starting', 'checking', 'queued', 'running', 'awaiting_approval', 'blocked'].indexOf(status) >= 0;
  }

  function readJobRef() {
    var ref = null;
    try { ref = JSON.parse(localStorage.getItem('lavJobRef') || 'null'); } catch (e) { }
    if (!ref || !ref.jobId) return null;
    if (!window.gpSessionSecurity || !window.gpSessionSecurity.owns(ref)) {
      clearJobRef();
      return null;
    }
    if ((Date.now() - (ref.ts || 0)) > 6 * 3600 * 1000) {
      clearJobRef();
      return null;
    }
    return ref;
  }

  function activeJobCopy() {
    var status = activeJobUi.status;
    var title = activeJobUi.label || '휴머나이징 진행 중';
    var meta = activeJobUi.jobId ? '#' + activeJobUi.jobId.slice(0, 6).toUpperCase() + ' · 진행 화면 보기' : '진행 화면 보기';
    if (status === 'starting') return { title: title || '휴머나이징 시작 중', meta: '작업을 준비하고 있어요' };
    if (status === 'checking') return { title: '작업 상태 확인 중', meta: meta };
    if (status === 'queued') return { title: '휴머나이징 대기 중', meta: meta };
    if (status === 'awaiting_approval') return { title: '근거 승인을 기다려요', meta: meta };
    if (status === 'blocked') return { title: '작업 확인이 필요해요', meta: '진행 화면에서 선택해 주세요' };
    if (status === 'done') return { title: '휴머나이징 완료', meta: '결과 보기' };
    return { title: title, meta: meta };
  }

  function syncActiveJobIndicator() {
    var chip = $('lavActiveJob');
    var visible = activeJobUi.status !== 'idle';
    var blocking = isBlockingJobStatus(activeJobUi.status);
    if (chip) {
      chip.hidden = !visible;
      if (visible) {
        chip.dataset.status = activeJobUi.status;
        chip.classList.toggle('is-active', blocking);
        var copy = activeJobCopy();
        if ($('lavActiveJobTitle')) $('lavActiveJobTitle').textContent = copy.title;
        if ($('lavActiveJobMeta')) $('lavActiveJobMeta').textContent = copy.meta;
        chip.setAttribute('aria-label', copy.title + '. ' + copy.meta);
      }
    }
    var newButton = document.querySelector('.gp-lav-new');
    if (newButton) {
      newButton.classList.toggle('is-job-active', blocking);
      var newLabel = newButton.querySelector('span');
      var newKbd = $('lavNewKbd');
      if (newLabel) newLabel.textContent = blocking ? '진행 화면 보기' : '새 글 시작';
      if (newKbd) newKbd.textContent = blocking
        ? '진행 중'
        : (navigator.platform && navigator.platform.indexOf('Mac') === -1 ? 'Ctrl N' : '⌘ N');
    }
  }

  function setActiveJobUi(jobId, status, label) {
    // 새 시작 화면은 직전 완료 작업 ID를 물려받지 않는다.
    // 실제 POST 응답이 도착한 뒤에만 새 jobId를 표시해야 작업 전환이 명확하다.
    activeJobUi.jobId = status === 'starting' && !jobId
      ? ''
      : (jobId || activeJobUi.jobId || '');
    activeJobUi.status = status || activeJobUi.status || 'checking';
    activeJobUi.label = label || activeJobUi.label || '';
    if (activeJobUi.jobId && isBlockingJobStatus(activeJobUi.status)) {
      saveJobRef(activeJobUi.jobId, activeJobUi.status);
    }
    syncActiveJobIndicator();
  }

  function clearActiveJobUi() {
    activeJobUi = { jobId: '', status: 'idle', label: '' };
    syncActiveJobIndicator();
  }

  window.lavOpenActiveJob = function () {
    var ref = readJobRef();
    if (!activeJobUi.jobId && ref) setActiveJobUi(ref.jobId, ref.status || 'checking');
    if (typeof window.switchTab === 'function') window.switchTab('main');
    if (activeJobUi.status === 'done') {
      show('done');
    } else if (activeJobUi.status === 'blocked') {
      show('blocked');
    } else if (isBlockingJobStatus(activeJobUi.status)) {
      if ($('lavJobTitle') && activeJobUi.status === 'checking') $('lavJobTitle').textContent = '작업 상태를 확인하고 있어요';
      if ($('lavJobId') && activeJobUi.jobId) $('lavJobId').textContent = '#' + activeJobUi.jobId.slice(0, 6).toUpperCase();
      show('job');
    }
  };

  window.lavPrepareNewSentence = function () {
    var ref = readJobRef();
    if (isBlockingJobStatus(activeJobUi.status) || ref) {
      if (!activeJobUi.jobId && ref) setActiveJobUi(ref.jobId, ref.status || 'checking');
      window.lavOpenActiveJob();
      if (window.gpToast) {
        window.gpToast('진행 중인 작업이 있어요. 완료하거나 중단한 뒤 새 글을 시작할 수 있어요.', {
          type: 'info',
          title: '현재 작업으로 돌아왔어요'
        });
      }
      return false;
    }
    // 완료 결과를 확인한 뒤 새 글을 시작하는 경우 상단 완료 표시를 함께 정리한다.
    clearActiveJobUi();
    return true;
  };

  // ── 30초 취소 창(2026-06-15): 시작 직후 오타·실수만 구제, 후반 취소 악용(LLM 원가만 날리는)은 차단.
  //   job 시작/재진입 시 경과시간 기준으로 남은 창만큼만 '중단' 버튼을 띄우고, 창이 지나면 영구히 숨긴다.
  var cancelWindowTimer = null;
  var CANCEL_WINDOW_SEC = 30;
  function clearCancelWindow() {
    if (cancelWindowTimer) { clearTimeout(cancelWindowTimer); cancelWindowTimer = null; }
    var btn = $('lavJobCancel');
    if (btn) btn.hidden = true;
  }
  function armCancelWindow(elapsedSec) {
    var btn = $('lavJobCancel');
    if (!btn) return;
    if (cancelWindowTimer) { clearTimeout(cancelWindowTimer); cancelWindowTimer = null; }
    var remainSec = CANCEL_WINDOW_SEC - (Number(elapsedSec) || 0);
    if (remainSec <= 0) { btn.hidden = true; return; }   // 30초 지난 작업(재진입 등) — 취소 불가
    btn.hidden = false;
    cancelWindowTimer = setTimeout(function () { btn.hidden = true; cancelWindowTimer = null; }, remainSec * 1000);
  }
  function stopFormalTicker() {
    jobTickerGeneration++;
    if (formalStop) { formalStop(); formalStop = null; }
  }
  function replaceJobTicker(estimate, label, initialSec) {
    stopFormalTicker();
    formalStop = startJobTicker(estimate, label, initialSec);
    return formalStop;
  }
  function notifyJobDone(st, label) {
    if (!window.gpNotify || !st || !st.jobId) return;
    window.gpNotify({
      clientId: 'job_done_' + st.jobId,
      type: 'job_done',
      title: '작업 완료',
      message: label + ' 결과가 준비됐어요. 작업 기록에서 확인할 수 있어요.',
      action: { tab: 'history' }
    }, { persist: true });
  }
  function notifyJobIssue(jobId, message) {
    if (!window.gpNotify || !jobId) return;
    window.gpNotify({
      clientId: 'job_failed_' + jobId,
      type: 'job_failed',
      title: '작업 확인 필요',
      message: message || '처리 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.',
      action: { tab: 'main' }
    }, { persist: true });
  }

  // 작업 중단(확인 모달 → 서버 취소/abort → 설정 화면 복귀). 차감은 완료 시에만 일어나므로 취소=항상 무과금.
  window.lavCancelJob = async function () {
    var ok = window.gpConfirm
      ? await window.gpConfirm({
        title: '작업을 중단할까요?',
        message: '크레딧은 차감되지 않아요. 진행 중인 작업만 멈춥니다.',
        confirmText: '중단하기',
        danger: true
      })
      : confirm('진행 중인 작업을 중단할까요? 크레딧은 차감되지 않아요.');
    if (!ok) return;
    pollGen++;
    if (activeCancel) { try { activeCancel(); } catch (e) { } activeCancel = null; }
    stopFormalTicker();
    clearJobRef();
    clearActiveJobUi();
    if (window.gpToast) window.gpToast('작업을 중단했어요. 크레딧은 차감하지 않았어요.', { type: 'info' });
    show('select');
  };
  // ── P5: jobId 재진입 — 새로고침·재방문 시 진행 중 작업 복원(서버 job은 어차피 계속 돌고 있음) ──
  function saveJobRef(jobId, status) {
    try {
      var value = { jobId: jobId, status: status || activeJobUi.status || 'checking', ts: Date.now() };
      localStorage.setItem('lavJobRef', JSON.stringify(window.gpSessionSecurity ? window.gpSessionSecurity.tag(value) : value));
    } catch (e) { }
  }
  function clearJobRef() { try { localStorage.removeItem('lavJobRef'); } catch (e) { } }
  function initJobResume() {
    var ref = readJobRef();
    if (!ref) return;
    var resumeGen = ++pollGen;
    setActiveJobUi(ref.jobId, ref.status || 'checking');
    evGetIdToken().then(function (idToken) {
      return fetch(window.apiUrl('/transform/' + ref.jobId), { headers: evAuthHeaders(idToken) });
    }).then(function (r) {
      var httpStatus = r.status;
      return r.json().catch(function () { return null; }).then(function (st) { return { httpStatus: httpStatus, st: st }; });
    }).then(function (o) {
      if (resumeGen !== pollGen) return;   // 확인 중 취소·교체된 작업을 늦은 응답으로 되살리지 않는다.
      // 401(토큰 만료): jobRef를 지우지 않는다 — 다음 로드에 재시도해 진행 중 작업을 복원.
      if (o.httpStatus === 401) return;
      var st = o.st;
      if (!st || !st.ok) { clearJobRef(); clearActiveJobUi(); return; }
      if (resumeTransformState(ref.jobId, st)) return;
      clearJobRef();
      clearActiveJobUi();
    }).catch(function () { /* 서버 미접속 — 다음 방문에 재시도 */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initJobResume);
  else initJobResume();

  function parseTransformStart(res) {
    return res.json().catch(function () { return null; }).then(function (b) {
      if (b && b.error) {
        var e = new Error(b.error);
        e.httpStatus = res.status;
        e.code = b.code || '';
        e.reason = b.reason || '';
        e.activeJobId = b.activeJobId || '';
        e.activeStatus = b.activeStatus || '';
        e.effectExpectation = b.effectExpectation || '';
        e.effectNoticeCode = b.effectNoticeCode || '';
        e.requiresEffectConfirmation = b.requiresEffectConfirmation === true;
        e.documentProfile = b.documentProfile || '';
        e.editableChunkCount = Number.isFinite(Number(b.editableChunkCount)) ? Number(b.editableChunkCount) : null;
        e.needed = Number.isFinite(Number(b.needed)) ? Number(b.needed) : null;
        throw e;
      }
      if (!res.ok || !b || !b.ok) throw new Error('시작하지 못했어요. 잠시 후 다시 눌러주세요. (크레딧은 차감되지 않았어요)');
      return b;
    });
  }

  function resumeTransformState(jobId, st) {
    if (!jobId || !st || !st.ok && !st.status) return false;
    st.jobId = jobId;
    if (st.status === 'done') {
      renderJobDone(st);   // blog/formal 모드별 점수·배지·보관함 — 폴링 완료와 동일 렌더
      clearJobRef();
      show('done');
      lavInitCollapse('lavDoneBody', 'lavDoneToggle');
      return true;
    }
    // 차단(blog/formal) 재진입 — 새로고침해도 동의 기반 재시도/보존형 화면 복원(blockOffer는 영속화됨)
    if (st.status === 'blocked' && (st.mode === 'blog' || st.mode === 'formal')) {
      renderBlockOffer(jobId, st);
      show('blocked');
      return true;
    }
    if (st.status !== 'running' && st.status !== 'queued' && st.status !== 'awaiting_approval') return false;
    setActiveJobUi(jobId, st.status, st.status === 'queued' ? '휴머나이징 대기 중' : '휴머나이징 진행 중');
    saveJobRef(jobId, st.status);
    activeCancel = makeJobCanceller(jobId);
    var isShort = st.mode === 'blog' || st.mode === 'polish';
    if ($('lavJobTitle')) $('lavJobTitle').textContent = isShort ? '문장을 다듬고 있어요' : '글을 다시 쓰고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '#' + jobId.slice(0, 6).toUpperCase();
    show('job');
    armCancelWindow(st.elapsedSec || 0);   // 재진입 — 시작 30초 이내일 때만 취소 버튼 노출
    if (st.status === 'queued') {
      renderQueuedState(jobId, st);
      pollTransform(jobId, ++pollGen);
      return true;
    }
    if (st.status === 'awaiting_approval') {
      stopFormalTicker();
      setJobSteps(2);
      if ($('lavStepSlot')) $('lavStepSlot').textContent = '근거 검수 대기 — 승인한 자료만 인용돼요';
      renderApprovalList(st.candidates || [], jobId);
      var ap = $('lavApprove'); if (ap) ap.hidden = false;
      return true;
    }
    stopFormalTicker();
    // 서버 예상 범위·elapsedSec로 진행률을 이어서 표시한다.
    var resumeEstimate = isShort
      ? (st.estSec || 180)
      : estimateRangeFromPayload(st, formalEstimateRange(($('lavInput') || {}).value || '', false));
    replaceJobTicker(resumeEstimate, isShort ? '문장 다듬는 중' : '재구성 중', st.elapsedSec || 0);
    pollTransform(jobId, ++pollGen);
    return true;
  }

  async function recoverActiveTransformJob(recoverGen) {
    if (recoverGen !== pollGen) return false;
    var idToken = await evGetIdToken(true);
    var res = await fetch(window.apiUrl('/transform/active'), { headers: evAuthHeaders(idToken) });
    if (!res.ok) return false;
    var data = await res.json().catch(function () { return null; });
    if (recoverGen !== pollGen) return false;
    var job = data && data.job;
    if (!data || !data.ok || !job || !job.id) return false;
    if (window.gpToast) window.gpToast('진행 중이던 작업으로 다시 들어갑니다.', { type: 'info' });
    return resumeTransformState(job.id, job);
  }

  async function handleTransformStartError(err, fallbackStep, expectedGen) {
    if (expectedGen !== pollGen) return;
    stopFormalTicker();
    if (err && err.httpStatus === 422 && err.code === 'UNREADABLE_INPUT') {
      clearJobRef();
      clearActiveJobUi();
      exitWorkspace();
      if (typeof window.lavShowInputError === 'function') window.lavShowInputError(err.message, err.reason || 'unreadable_input', true);
      else alert(err.message);
      return;
    }
    if (err && err.httpStatus === 422 && err.code === 'NO_EDITABLE_CONTENT') {
      clearJobRef();
      clearActiveJobUi();
      show(fallbackStep || 'select');
      var inputNotice = err.message || '변환할 일반 본문을 찾지 못했어요.';
      if (window.gpToast) window.gpToast(inputNotice, { type: 'warning', title: '입력 내용을 확인해 주세요' });
      else alert(inputNotice);
      return;
    }
    if (err && err.httpStatus === 409 && err.code === 'LIMITED_EFFECT_CONFIRMATION_REQUIRED') {
      clearActiveJobUi();
      var src = $('lavInput');
      lastDiag = Object.assign({}, lastDiag || fakeDiagnose(src ? src.value : ''), {
        effectExpectation: 'limited',
        effectNoticeCode: err.effectNoticeCode || 'LOW_EXPECTED_EFFECT',
        requiresEffectConfirmation: true
      });
      show(fallbackStep || 'select');
      if (window.gpToast) window.gpToast('변화가 작을 수 있는 글이에요. 예상 효과를 확인하면 진행할 수 있어요.', { type: 'warning', title: '예상 효과 확인' });
      window.lavOpenConfirm();
      return;
    }
    if (err && err.httpStatus === 409) {
      // 새 요청의 화면 세대를 종료한 뒤 서버의 실제 활성 작업만 한 번 복구한다.
      var recoverGen = ++pollGen;
      try { if (await recoverActiveTransformJob(recoverGen)) return; } catch (e) { /* 기존 안내로 폴백 */ }
      if (recoverGen !== pollGen) return;
      if (err.activeJobId) {
        setActiveJobUi(err.activeJobId, 'checking', '진행 중인 작업 확인 중');
        saveJobRef(err.activeJobId, 'checking');
        activeCancel = makeJobCanceller(err.activeJobId);
        replaceJobTicker(300, '진행 중인 작업 확인 중');
        window.lavOpenActiveJob();
        pollTransform(err.activeJobId, ++pollGen);
        return;
      }
      clearActiveJobUi();
    }
    if (err && err.httpStatus === 401) {
      clearJobRef();
      clearActiveJobUi();
      var authMsg = (err && err.message) || '로그인이 필요해요.';
      if (window.gpToast) window.gpToast(authMsg, { type: 'error', title: '로그인 확인 필요' });
      else alert(authMsg);
      if (typeof showScreen === 'function') showScreen('login');
      return;
    }
    if (err && err.httpStatus === 402 && typeof window.gpOpenCreditCheckout === 'function') {
      clearActiveJobUi();
      show(fallbackStep || 'select');
      var resumePayload = err.gpResumePayload || {};
      var resumeText = String(resumePayload.text || (($('lavInput') || {}).value || ''));
      var resumeSettings = resumePayload.settings || {};
      var resumeMode = resumePayload.flowMode || 'blog';
      var resumeNeeded = Number(err.needed) || (resumeMode === 'formal'
        ? advancedCredit(resumeText.length, !!resumeSettings.evidence)
        : shortHumanizeCredit(resumeText.length));
      await window.gpOpenCreditCheckout({
        action: 'evasion_transform',
        source: 'evasion_transform_402',
        neededCredits: resumeNeeded,
        currentCredits: window.UC || 0,
        payload: { text: resumeText, flowMode: resumeMode, settings: resumeSettings }
      });
      if (window.gpTrack) window.gpTrack('credit_insufficient', { analysis_mode: resumeMode, needed_credits: resumeNeeded, current_credits: window.UC || 0 });
      return;
    }
    var msg = (err && err.message) ? err.message : '처리 중 오류가 발생했어요.';
    // 작업 시작 실패는 차감 전 단계 — "차감 없음" 안심 문구로 결제·환불 문의 감소
    if (!/차감/.test(msg)) msg += '\n\n크레딧은 차감되지 않았어요. (차감은 작업이 완료될 때만 일어나요)';
    alert(msg);
    clearActiveJobUi();
    show(fallbackStep || 'select');
  }

  // 폴링: 6초 간격, 최대 45분(근거 검색+재구성). 창을 닫아도 서버 작업은 계속됨(job 방식).
  // gen 토큰: 사용자가 중단하거나 새 작업을 시작하면 pollGen이 올라가 이전 루프가 조용히 끝남.
  async function pollTransform(jobId, gen) {
    var deadline = Date.now() + 6 * 3600 * 1000;   // 큐 대기 + 3만자 재구성 대비. 창 닫아도 서버 작업은 계속.
    var idToken = await evGetIdToken();
    var authRetries = 0;   // 폴링 중 401(토큰 만료) 연속 횟수
    while (Date.now() < deadline) {
      await new Promise(function (ok) { setTimeout(ok, 6000); });
      if (gen !== pollGen) return;   // 중단·교체됨
      var st = null, httpStatus = 0;
      try {
        var pollRes = await fetch(window.apiUrl('/transform/' + jobId), { headers: evAuthHeaders(idToken) });
        httpStatus = pollRes.status;
        st = await pollRes.json().catch(function () { return null; });
      } catch (e) { continue; }   // 일시 네트워크 오류 — 다음 폴링
      // fetch가 진행되는 사이 새 작업·복구가 시작됐으면 이 응답은 이전 작업의 낡은 화면 갱신이다.
      if (gen !== pollGen) return;

      // ★ 401(토큰 만료): 긴 작업(10분+) 폴링 중 idToken이 만료된 경우. 작업은 서버에서 계속 돌아
      //   완료되므로 절대 jobRef를 지우지 않는다 — 토큰을 강제 갱신해 폴링을 이어간다.
      //   (2026-06-14 실사고: 401을 fatal로 보고 복귀 → 6초 뒤 완료된 결과가 사용자 화면에서 유실.)
      if (httpStatus === 401) {
        authRetries++;
        if (authRetries <= 6) { idToken = await evGetIdToken(true); continue; }
        stopFormalTicker();
        notifyJobIssue(jobId, '로그인이 만료됐어요. 다시 로그인하면 진행 중이던 작업으로 들어갈 수 있어요. (작업·결과는 사라지지 않아요)');
        if (!window.gpNotify) alert('로그인이 만료됐어요. 다시 로그인하면 진행 중이던 작업으로 들어갈 수 있어요.');
        return;   // jobRef 유지 — 재로그인·새로고침으로 복원 가능
      }
      authRetries = 0;

      if (!st) continue;
      // 404(서버 재시작·만료) 등 진짜 "작업 없음" — 무한 폴링 방지(2026-06-13 실사고:
      // 서버 재시작으로 job이 사라졌는데 화면은 진행률만 계속 올라감).
      if (httpStatus === 404 || st.ok === false || (st.error && !st.status)) {
        stopFormalTicker();
        activeCancel = null;
        clearJobRef();
        clearActiveJobUi();
        notifyJobIssue(jobId, st.error || '작업을 찾을 수 없어요. 다시 시도해 주세요.');
        if (!window.gpNotify) alert(st.error || '작업을 찾을 수 없어요. (서버가 재시작됐을 수 있어요) 다시 시도해 주세요.');
        show('select');
        return;
      }
      if (st.status === 'cancelled') {
        stopFormalTicker();
        activeCancel = null;
        clearJobRef();
        clearActiveJobUi();
        show('select');
        return;
      }
      if (st.status === 'queued') {
        renderQueuedState(jobId, st);
        continue;
      }
      if (st.status === 'running') {
        setActiveJobUi(jobId, 'running', '휴머나이징 진행 중');
        var runningShort = st.mode === 'blog' || st.mode === 'polish';
        var runningEstimate = runningShort
          ? (st.estSec || 180)
          : estimateRangeFromPayload(st, formalEstimateRange(($('lavInput') || {}).value || '', false));
        if (!formalStop) replaceJobTicker(runningEstimate, runningShort ? '문장 다듬는 중' : '재구성 중', st.elapsedSec || 0);
        continue;
      }
      if (st.status === 'awaiting_approval') {
        stopFormalTicker();
        setActiveJobUi(jobId, 'awaiting_approval', '근거 승인을 기다려요');
        setJobSteps(2);
        if ($('lavStepSlot')) $('lavStepSlot').textContent = '근거 검수 대기 — 승인한 자료만 인용돼요';
        renderApprovalList(st.candidates || [], jobId);
        var ap = $('lavApprove'); if (ap) ap.hidden = false;
        return;   // 사용자 승인 대기 — submitApproval이 폴링 재개
      }
      if (st.status === 'done') {
        stopFormalTicker();
        activeCancel = null;
        setJobSteps(4);
        st.jobId = jobId;
        renderJobDone(st);
        if (st.note) console.info('[evasion]', st.note);
        clearJobRef();
        show('done');
        lavInitCollapse('lavDoneBody', 'lavDoneToggle');
        return;
      }
      if (st.status === 'blocked' || st.status === 'error') {
        stopFormalTicker();
        if (st.gateDetail) console.warn('[evasion] 차단 상세:', st.gates, st.gateDetail);
        // 회피(blog/formal) 차단 → 동의 기반 재시도/보존형 화면. error·polish는 기존 안내.
        //   jobRef는 유지(보존형 받기 accept-fallback에 jobId 필요).
        if (st.status === 'blocked' && (st.mode === 'blog' || st.mode === 'formal')) {
          renderBlockOffer(jobId, st);
          show('blocked');
          return;
        }
        clearJobRef();
        activeCancel = null;
        clearActiveJobUi();
        notifyJobIssue(jobId, st.error || '처리 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.');
        if (!window.gpNotify) alert(st.error || '처리 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.');
        show('select');   // 방법 선택으로
        return;
      }
    }
    stopFormalTicker();
    notifyJobIssue(jobId, '작업이 예상보다 오래 걸리고 있어요. 새로고침하면 진행 중인 작업으로 다시 들어갈 수 있어요.');
    if (!window.gpNotify) alert('작업이 예상보다 오래 걸리고 있어요. 새로고침하면 진행 중인 작업으로 다시 들어갈 수 있어요.');
  }

  // 완료 렌더(폴링·재진입 공용): job mode에 따라 점수·배지·보관함 라벨 분기
  function renderJobDone(st) {
    if (st && st.jobId) setActiveJobUi(st.jobId, 'done', '휴머나이징 완료');
    var label;
    var isPreservationFallback = !!(st.result && st.result.preservationFallback);
    if (isPreservationFallback) {
      // 기본 휴머나이징에서 사용자가 선택한 원문 보존 다듬기 재처리 결과.
      label = '원문 보존 다듬기';
      renderBadges({ metrics: st.result && st.result.metrics }, st.result);
    } else if (st.mode === 'blog') {
      label = '기본 휴머나이징';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics }, st.result);
    } else if (st.mode === 'polish') {
      label = '원문 보존 다듬기';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics }, st.result);
    } else {
      label = '고급 휴머나이징';
      renderBadges({ metrics: st.result && st.result.metrics }, st.result);
    }
    renderPreservationBadge(st);   // 보고서에서 넘어온 글이면 "유지할 근거 N/N 보존"을 같은 자로 다시 센다
    // 보존형 폴백 안내 배너(정직 표기) — 일반 결과에선 항상 숨김으로 리셋
    var lavFbBanner = $('lavFallbackBanner');
    if (lavFbBanner) {
      lavFbBanner.hidden = !isPreservationFallback;
      if (isPreservationFallback && $('lavFallbackMsg')) {
        $('lavFallbackMsg').textContent = st.note || '기본 휴머나이징 결과를 안전하게 전달하기 어려워, 사용자가 선택한 원문 보존 다듬기로 다시 처리했어요.';
      }
    }
    // 결과와 무관한 예상 탐지율·난이도 대신 사용자가 실제로 완료한 작업을 표시한다.
    var RESULT_MODE_LABEL = { polish: '원문 보존', blog: '기본', formal: '고급' };
    var scoreWrap = $('lavDoneScoreWrap');
    if (scoreWrap) scoreWrap.hidden = false;
    if ($('lavDoneScore')) {
      $('lavDoneScore').textContent = RESULT_MODE_LABEL[st.mode] || '완료';
      $('lavDoneScore').style.color = 'var(--brand-strong,#4b4cc6)';
    }
    var doneNote = $('lavDoneNote');
    if (doneNote) {
      doneNote.textContent = st.mode === 'polish'
        ? '원문의 장르·사실·구조를 지키면서 맞춤법과 문장 연결을 정리했어요. 문장을 넓게 다시 쓰는 휴머나이징과는 다른 기능이에요.'
        : (st.mode === 'formal'
          ? '고급 휴머나이징과 정밀 검증이 완료됐어요. 제출 전 핵심 수치와 인용은 원문과 한 번 대조해 주세요.'
          : '기본 휴머나이징이 완료됐어요. 외부 검사 결과는 글과 도구에 따라 달라지며 점수를 보장하지 않아요.');
    }
    renderBillingDisposition(st);
    renderResultNotices(st);
    renderDoneNextStep(st);
    renderDoneBody((st.result && st.result.outputText) || '', st.result && st.result.refineTargets);
    lavRefineJobId = (st && st.jobId) || null;
    lavRefineBusy = false; refinePollGen++;   // 이전 보강 폴링 자연 종료
    renderRefineTargets(st);
    notifyJobDone(st, label);
  }

  function renderResultNotices(st) {
    var result = st && st.result || {};
    var effectWrap = $('lavResultEffectNotice');
    var qualityWrap = $('lavResultQualityNotice');
    var effectNotices = Array.isArray(result.effectNotices)
      ? result.effectNotices
      : (Array.isArray(st && st.effectNotices) ? st.effectNotices : []);
    var effectLimited = (result.effectStatus || st && st.effectStatus) === 'limited';
    if (effectWrap) {
      effectWrap.hidden = !effectLimited;
      effectWrap.textContent = effectLimited
        ? (effectNotices[0] && effectNotices[0].message || '원문을 안전하게 지키느라 바꿀 수 있는 범위가 제한적이었어요.')
        : '';
    }
    var qualityWarnings = Array.isArray(result.qualityWarnings)
      ? result.qualityWarnings
      : (Array.isArray(st && st.qualityWarnings) ? st.qualityWarnings : []);
    var needsReview = (result.qualityStatus || st && st.qualityStatus) === 'needs_review' && qualityWarnings.length > 0;
    if (qualityWrap) {
      qualityWrap.hidden = !needsReview;
      qualityWrap.textContent = needsReview
        ? (qualityWarnings[0].message || '의미·수치·인용·구조 중 원문과 대조할 부분이 있어요.')
        : '';
    }
  }

  // ── 완료 화면의 다음 작업 안내(1순위) ────────────────────────────────────────
  // 결과·복사·다운로드를 다 챙긴 아래에만 붙이고, 다음 작업이 가능한 잔액이면 아예 뜨지 않는다.
  // 금액은 추정이 아니라 이번 작업 전후 잔액 차이 — 방금 일어난 사실만 말한다.
  // 겸사겸사: 비동기 작업 잔액은 로그인 시 1회 로드한 값이라 완료 시점에 낡아 있다.
  // 여기서 서버 잔액(/checkout-context)으로 맞춰 상단 크레딧 칩까지 최신화한다.
  async function renderDoneNextStep(st) {
    var box = $('lavDoneNext');
    if (!box) return;
    box.hidden = true;
    if (!window.CU || window.UP === 'unlimited') return;

    var before = Math.max(0, Number(window.UC) || 0);
    var balance = before;
    if (typeof window.gpConversionContext === 'function') {
      try {
        var ctx = await window.gpConversionContext(true);
        if (ctx && isFinite(Number(ctx.balance))) {
          balance = Math.max(0, Number(ctx.balance));
          window.UC = balance;
          if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
        }
      } catch (_) {}
    }
    if (balance >= SHORT_HUMANIZE_MIN_CREDITS) return;   // 다음 글을 바로 시작할 수 있으면 조용히 넘어간다

    var result = (st && st.result) || {};
    var charged = (st && st.billingDisposition) === 'charged' || result.billingDisposition === 'charged';
    var used = Math.max(0, before - balance);
    setEstimateText('lavDoneNextTitle', charged && used > 0
      ? '이번 작업에 ' + used.toLocaleString('ko-KR') + '크레딧을 썼고 ' + balance.toLocaleString('ko-KR') + '크레딧 남았어요'
      : '남은 크레딧이 ' + balance.toLocaleString('ko-KR') + '크레딧이에요');
    setEstimateText('lavDoneNextDesc', '다음 글을 다듬으려면 최소 ' + SHORT_HUMANIZE_MIN_CREDITS + '크레딧이 필요해요.');
    box.hidden = false;
    if (window.gpTrack) {
      window.gpTrack('done_next_offer_view', { surface: 'done', remaining_credits: balance, used_credits: used });
    }
  }

  window.lavDoneNextAction = function () {
    var balance = Math.max(0, Number(window.UC) || 0);
    if (window.gpTrack) {
      window.gpTrack('done_next_offer_click', { surface: 'done', remaining_credits: balance });
    }
    if (typeof window.gpOpenCreditCheckout !== 'function') {
      if (typeof window.switchTab === 'function') window.switchTab('pricing');
      return;
    }
    window.gpOpenCreditCheckout({
      action: 'pricing_purchase',
      source: 'done_next',
      neededCredits: SHORT_HUMANIZE_MIN_CREDITS,
      currentCredits: balance
    });
  };

  // ── 감지 보고서 → 휴머나이저 이동 비용(2순위) ────────────────────────────────
  // 오퍼가 아니라 정보다. 이동 버튼과 경쟁하지 않도록 버튼 아래 한 줄로만 둔다.
  function renderReportGoCost() {
    var line = $('gpRepGoCost');
    if (!line) return;
    line.hidden = true;
    // 추천을 보류해 버튼을 감춘 상태에서는 비용 줄만 남아 "어디로 이동한다는 건지" 모순이 된다.
    var goBtn = $('gpRepCtaBtn');
    if (goBtn && goBtn.hidden) return;
    if (!window.CU || window.UP === 'unlimited') return;
    var src = $('lavInput');
    var len = src && src.value ? src.value.length : 0;
    if (!len) return;
    var cost = shortHumanizeCredit(len);
    var balance = Math.max(0, Number(window.UC) || 0);
    line.textContent = '기본 휴머나이징 ' + cost.toLocaleString('ko-KR') + '크레딧 · 보유 '
      + balance.toLocaleString('ko-KR') + '크레딧';
    line.classList.toggle('is-short', balance < cost);
    line.hidden = false;
  }

  function renderBillingDisposition(st) {
    var wrap = $('lavBillingNotice');
    if (!wrap) return;
    var result = st && st.result || {};
    var meta = result.engineMeta || st && st.engineMeta || {};
    var disposition = st && st.billingDisposition || result.billingDisposition || meta.billingDisposition || '';
    var labels = {
      charged: '크레딧 차감이 완료됐어요.',
      waived_quality_shortfall: '과거 무차감 정책으로 처리된 작업이에요.',
      waived_repeat_low_benefit: '과거 무차감 정책으로 처리된 작업이에요.',
      plan_unlimited: '무제한 이용권으로 처리했어요.',
      admin_no_charge: '관리자 테스트로 처리되어 크레딧을 차감하지 않았어요.'
    };
    wrap.className = 'lav-billing-notice';
    if (!labels[disposition]) {
      wrap.hidden = true;
      wrap.textContent = '';
      return;
    }
    if (disposition === 'charged' && st && st.deducted === false) {
      wrap.textContent = '크레딧 처리 상태를 확인하고 있어요. 작업 기록에서 최종 상태를 확인해 주세요.';
      wrap.classList.add('is-review');
    } else {
      wrap.textContent = labels[disposition];
      if (disposition !== 'charged') wrap.classList.add('is-waived');
    }
    wrap.hidden = false;
  }

  // ── 차단 화면(2026-06-15): 자동 폴백 대신 "왜 막혔나 + 재시도/보존형/취소"를 사용자가 고르게 한다 ──
  function renderBlockOffer(jobId, st) {
    lavBlockedJobId = jobId;
    setActiveJobUi(jobId, 'blocked', '작업 확인이 필요해요');
    var offer = (st && st.blockOffer) || {};
    var reasonEl = $('lavBlockedReason');
    if (reasonEl && st && st.reason) reasonEl.textContent = st.reason + ' 크레딧은 차감되지 않았어요.';
    // 차단 원인이 lostFacts면 실제 빠진 사실/수치를 먼저 보여준다.
    // 아니면 surfaceguard가 짚은 추상 문단(경험·사례 메모로 보강할 위치)을 보여준다.
    var abEl = $('lavBlockedAbstract'), abList = $('lavBlockedAbstractList');
    var gates = (st && st.gates) || [];
    var lost = st && st.gateDetail && st.gateDetail.lostFacts ? st.gateDetail.lostFacts : [];
    var showLost = gates.indexOf('lostFacts') >= 0 && lost.length;
    var paras = showLost ? lost.map(function (x) { return { snippet: x }; }) : (offer.abstractParas || []);
    if (abEl && abList) {
      if (paras.length) {
        var title = abEl.querySelector('.lav-blocked-abstract-title');
        var tip = abEl.querySelector('.lav-blocked-abstract-tip');
        if (title) title.textContent = showLost ? '이 사실·수치의 누락 위험이 확인됐어요' : '이 부분이 추상적이라 자연스럽게 바꾸기 어려워요';
        if (tip) tip.innerHTML = showLost
          ? '사실·수치가 많은 글은 <b>문단을 짧게 나누거나</b>, 해당 부분은 원문 표현을 더 유지해서 다시 시도해 주세요.'
          : '위 내용과 관련된 <b>실제 경험·사례·수치</b>를 경험 메모에 적고 다시 시도하면, 그 부분을 더 구체적이고 자연스럽게 바꿀 수 있어요.';
        abList.innerHTML = '';
        paras.forEach(function (p) {
          var li = document.createElement('li');
          li.textContent = showLost ? String(p.snippet || '') : '“' + (p.snippet || '') + '…”';   // textContent = XSS-safe
          abList.appendChild(li);
        });
        abEl.hidden = false;
      } else { abEl.hidden = true; }
    }
    // 근거 보강 켜고 다시(재구성·미사용 시만)
    var evBtn = $('lavBlockedEvidence');
    if (evBtn) evBtn.hidden = !offer.canEvidence;
    // 보존형으로 받기(+단가). 기본 차단 작업에만 노출하며 고급은
    // 이전 서버·캐시 응답에 fallbackOffer가 남아 있어도 다운그레이드하지 않는다.
    var fbBtn = $('lavBlockedFallback');
    lavBlockedFallbackCredit = offer.fallbackCredit || 0;
    if (fbBtn) {
      var fallbackAllowed = offer.fallbackOffer === true && st && st.mode === 'blog';
      fbBtn.hidden = !fallbackAllowed;
      if (fallbackAllowed) {
        var need = offer.fallbackCredit || 0;
        // 잔액이 단가보다 적으면 버튼에 '충전 필요'를 미리 표시(서버 precheck와 동일 기준 — 클릭 전에 알 수 있게).
        var short = need && window.UP !== 'unlimited' && (window.UC || 0) < need;
        fbBtn.textContent = '원문 보존 다듬기로 받기' + (need ? ' (' + need + ' 크레딧)' : '') + (short ? ' · 충전 필요' : '');
      }
    }
  }

  // 메모 반영해 다시 시도 — 차단 화면 인라인 메모(D6)를 다음 제출에 실어 방법 선택으로 복귀
  //   (원문은 lavInput에 유지 → 카드 선택·확인 모달 경유 재제출 = 새 작업·재과금 안내)
  window.lavBlockedRetryMemo = function () {
    var memoEl = $('lavBlockedMemo');
    lavMemoOverride = memoEl ? (memoEl.value || '').trim() : '';
    lavBlockedJobId = null;
    clearJobRef();
    clearActiveJobUi();
    applyAdvancedRouting();
    renderSelectCosts();
    show('select');
  };
  // 근거 보강 켜고 다시 — 고급(formal)+근거 ON으로 세팅 후 확인 모달 직행(화면 경유 생략)
  window.lavBlockedRetryEvidence = function () {
    lavBlockedJobId = null;
    clearJobRef();
    clearActiveJobUi();
    var formalRadio = document.querySelector('input[name="lavTone"][value="formal"]');
    if (formalRadio && !formalRadio.disabled) { formalRadio.checked = true; toneSelectionTouched = true; }
    var ev = $('lavEvidence');
    if (ev && !ev.disabled) { ev.checked = true; if (window.lavEvidenceChange) window.lavEvidenceChange(); }
    window.lavOpenConfirm();
  };
  // 보존형 다듬기로 받기 — 명시 동의로만 보존형 재처리(보존형 단가 차감). 백그라운드 처리 → 폴링으로 완료 수신.
  window.lavBlockedAcceptFallback = function () {
    if (!lavBlockedJobId) return;
    var jid = lavBlockedJobId;
    // ★ 크레딧 사전 확인(2026-06-16, 서버 precheck와 동일 기준): 부족하면 작업을 시작하지 않고 충전으로 안내.
    //   서버도 accept-fallback에서 402로 막지만, 여기서 먼저 걸러 헛클릭·헛요청을 줄인다(서버가 최종 권위).
    var need = lavBlockedFallbackCredit || 0;
    if (need && window.UP !== 'unlimited' && (window.UC || 0) < need) {
      if (typeof window.gpOpenCreditCheckout === 'function') {
        window.gpOpenCreditCheckout({
          action: 'evasion_fallback',
          source: 'evasion_fallback_precheck',
          neededCredits: need,
          currentCredits: window.UC || 0,
          payload: { jobId: jid, neededCredits: need }
        });
      } else if (confirm('원문 보존 다듬기로 받으려면 ' + need + '크레딧이 필요해요(현재 ' + (window.UC || 0) + '크레딧). 충전 페이지로 이동할까요?') && window.switchTab) {
        window.switchTab('pricing');
      }
      if (window.gpTrack) window.gpTrack('credit_insufficient', { analysis_mode: 'fallback', needed_credits: need, current_credits: window.UC || 0 });
      return;
    }
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '원문 보존형으로 처리하고 있어요';
    setActiveJobUi(jid, 'running', '원문 보존형 처리 중');
    show('job');
    armCancelWindow(0);
    var gen = ++pollGen;
    evGetIdToken().then(function (idToken) {
      if (!idToken) {
        var authErr = new Error('로그인 상태를 확인할 수 없어요. 다시 로그인한 뒤 이어서 시도해 주세요.');
        authErr.httpStatus = 401;
        throw authErr;
      }
      return fetch(window.apiUrl('/transform/' + jid + '/accept-fallback'), {
        method: 'POST', headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }), body: JSON.stringify({})
      });
    }).then(function (r) {
      if (gen !== pollGen) return;
      if (r && !r.ok) {
        // 서버가 막은 경우(잔액 부족 402 등) — 본문의 구체 메시지를 살려 보여준다(일반 실패 문구로 덮지 않음).
        return r.json().catch(function () { return null; }).then(function (b) {
          var err = new Error((b && b.error) || ('처리 요청에 실패했어요. (' + r.status + ')'));
          err.httpStatus = r.status;
          throw err;
        });
      }
      saveJobRef(jid, 'running');
      pollTransform(jid, gen);
    }).catch(function (e) {
      if (gen !== pollGen) return;
      var msg = (e && e.message) || '처리 요청에 실패했어요. 다시 시도해 주세요.';
      if (e && e.httpStatus === 401) {
        if (window.gpToast) window.gpToast(msg, { type: 'error', title: '로그인 확인 필요' });
        else alert(msg);
        if (typeof showScreen === 'function') showScreen('login');
        return;
      } else if (e && e.httpStatus === 402) {   // 잔액 부족(주로 사전확인 후 다른 탭에서 소진된 레이스) — 충전 안내
        if (typeof window.gpOpenCreditCheckout === 'function') {
          window.gpOpenCreditCheckout({
            action: 'evasion_fallback',
            source: 'evasion_fallback_402',
            neededCredits: need,
            currentCredits: window.UC || 0,
            payload: { jobId: jid, neededCredits: need }
          });
        } else if (confirm(msg + '\n충전 페이지로 이동할까요?') && window.switchTab) {
          window.switchTab('pricing');
        }
      } else if (window.gpToast) {
        window.gpToast(msg, { type: 'error' });
      }
      show('blocked');
    });
  };
  // 취소 — 무과금 종료(차단 job은 그대로 두고 화면만 방법 선택으로)
  window.lavBlockedCancel = function () {
    lavBlockedJobId = null;
    activeCancel = null;
    clearJobRef();
    clearActiveJobUi();
    show('select');
  };

  function makeJobCanceller(jobId) {
    return function () {
      evGetIdToken().then(function (idToken) {
        return fetch(window.apiUrl('/transform/' + jobId + '/cancel'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({})
        });
      }).catch(function () { });
    };
  }

  function runFormalEvasion(s) {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    activeCancel = null;
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '의미를 검증하며 다듬고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    setActiveJobUi('', 'starting', '고급 휴머나이징 시작 중');
    show('job');
    armCancelWindow(0);   // 방금 시작 — 30초 취소 창 열기
    var estimate = formalEstimateRange(text, s.evidence);
    var stageLabel = s.evidence ? '승인할 근거를 찾는 중' : '의미·구조를 검증하는 중';
    replaceJobTicker(estimate, stageLabel);
    var gen = ++pollGen;
    (async function () {
      var idToken = '';
      try { idToken = await evGetIdToken(true); } catch (e) { /* 비로그인 — 서버가 401 안내 */ }
      try {
        if (!idToken) {
          var authErr = new Error('로그인 상태를 확인할 수 없어요. 다시 로그인한 뒤 이어서 시도해 주세요.');
          authErr.httpStatus = 401;
          throw authErr;
        }
        if (gen !== pollGen) return;
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify(Object.assign({ text: text, mode: 'formal', evidence: !!s.evidence, memo: s.memo || '', autoCoach: false, lang: evDetectLang(text), length: 'keep', documentProfile: s.documentProfile || undefined, effectNoticeAccepted: !!s.effectNoticeAccepted }, reportHandoffFields(text)))
        }).then(parseTransformStart);
        if (gen !== pollGen) {
          if (r && r.jobId) makeJobCanceller(r.jobId)();
          return;
        }
        if ($('lavJobId')) $('lavJobId').textContent = '#' + r.jobId.slice(0, 6).toUpperCase();
        setActiveJobUi(r.jobId, r.job && r.job.status || 'running', stageLabel);
        saveJobRef(r.jobId, r.job && r.job.status || 'running');
        activeCancel = makeJobCanceller(r.jobId);
        if (r.job && r.job.status === 'queued') {
          resumeTransformState(r.jobId, r.job);
          return;
        }
        replaceJobTicker(estimateRangeFromPayload(r, estimate), stageLabel);
        await pollTransform(r.jobId, gen);
      } catch (err) {
        if (gen !== pollGen) return;
        err.gpResumePayload = { flowMode: 'formal', text: text, settings: s || {} };
        await handleTransformStartError(err, 'select', gen);
      }
    })();
  }

  window.lavStartJob = function () {
    // 확인 버튼 연타나 늦게 열린 이전 확인창이 새 작업을 겹쳐 시작하지 못하게 한다.
    if (typeof window.lavPrepareNewSentence === 'function' && !window.lavPrepareNewSentence()) return;
    var polish = pendingPolish;       // 확인창 닫기 전에 캡처(lavCloseConfirm이 플래그를 비움)
    var effectNoticeAccepted = effectNoticeAcceptedForRun();
    if (!polish && !effectNoticeAccepted) {
      updateConfirmStartState();
      return;
    }
    window.lavCloseConfirm();
    if (polish) return runShortJob('polish', null);    // 원문 보존 다듬기 — 확인 후 시작
    var s = currentSettings();
    s.effectNoticeAccepted = effectNoticeAccepted;
    if (s.tone === 'blog') return runBlogEvasion(s);   // ★ P2 실연결(블로그 어투)
    return runFormalEvasion(s);                        // ★ P3+P4 실연결(격식 유지 재구성, job+폴링+근거 승인)
  };

  window.gpResumeEvasionTransform = function (payload) {
    payload = payload || {};
    var text = String(payload.text || '').trim();
    if (!text) return false;
    if (typeof window.switchTab === 'function') window.switchTab('main');
    var input = $('lavInput');
    if (!input) return false;
    input.value = text;
    if (typeof window.lavSetMode === 'function') window.lavSetMode('humanize');
    var settings = payload.settings || {};
    setTimeout(function () {
      if (payload.flowMode === 'formal') runFormalEvasion(settings);
      else runShortJob(payload.flowMode === 'polish' ? 'polish' : 'blog', settings);
    }, 120);
    return true;
  };

  window.gpResumeEvasionFallback = function (payload) {
    payload = payload || {};
    if (!payload.jobId) return false;
    if (typeof window.switchTab === 'function') window.switchTab('main');
    lavBlockedJobId = String(payload.jobId);
    lavBlockedFallbackCredit = Number(payload.neededCredits) || 0;
    setActiveJobUi(lavBlockedJobId, 'blocked', '원문 보존형 작업 확인');
    show('blocked');
    setTimeout(function () { window.lavBlockedAcceptFallback(); }, 120);
    return true;
  };

  window.lavApproveReco = function () { submitApproval('reco'); };
  window.lavApprovePick = function () { submitApproval('pick'); };

  window.lavDoneCopy = function (btn) {
    var body = $('lavDoneBody');
    if (body && navigator.clipboard) {
      navigator.clipboard.writeText(body.textContent).catch(function () {});
    }
    if (btn) {
      var t = btn.textContent;
      btn.textContent = '복사됨';
      setTimeout(function () { btn.textContent = t; }, 1200);
    }
  };

  // ── 결과 .md 파일 다운로드 ──────────
  window.lavDoneDownload = function () {
    var body = $('lavDoneBody');
    var text = body ? body.textContent : '';
    if (!text.trim()) return;
    var firstLine = (text.split('\n').find(function (l) { return l.trim(); }) || '결과').trim().slice(0, 40).replace(/[\\/:*?"<>|]/g, '');
    var md = text;   // 결과 본문은 이미 줄글(첫 줄=제목). md로 저장.
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (firstLine || '변환결과') + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  // ── 사후 문단 보강(2026-08-27): 결과 아래 코칭 섹션 — 추상 문단에 실제 경험 한 줄을 받아 그 문단만 재생성.
  //   프레이밍 계약: 추상성은 원문 귀속(엔진 실패가 아님) · 최대 2개 · 결과 본문과 시각 분리 · 무변화는 정직 안내·무과금.
  var lavRefineJobId = null, lavRefineBusy = false, refinePollGen = 0;

  // 결과 본문을 문단 단위 DOM으로 렌더 — 보강 대상 문단을 본문 안에서 직접 강조한다.
  //   구분자(빈 줄)는 텍스트 노드로 보존 → container.textContent === outputText 그대로라
  //   복사·다운로드(textContent 기반)가 깨지지 않는다. flashIdx = 방금 보강된 문단(펄스 표시).
  function renderDoneBody(outputText, targets, flashIdx) {
    var body = $('lavDoneBody');
    if (!body) return;
    var text = outputText || '';
    var targetIdx = {};
    (targets || []).forEach(function (t) { targetIdx[t.index] = true; });
    body.innerHTML = '';
    var parts = text.split(/(\n[ \t]*\n+)/);
    var contentIdx = 0;
    for (var i = 0; i < parts.length; i++) {
      var piece = parts[i];
      if (!piece) continue;
      if (i % 2 === 1 || !piece.trim()) { body.appendChild(document.createTextNode(piece)); continue; }
      var span = document.createElement('span');
      span.className = 'lav-para';
      span.setAttribute('data-para-idx', String(contentIdx));
      if (targetIdx[contentIdx]) span.classList.add('is-refine-target');
      if (flashIdx === contentIdx) span.classList.add('is-refreshed');
      span.textContent = piece;
      body.appendChild(span);
      contentIdx++;
    }
    if (typeof flashIdx === 'number') {
      setTimeout(function () {
        var el = body.querySelector('.lav-para.is-refreshed');
        if (el) el.classList.remove('is-refreshed');
      }, 1800);
    }
  }

  function renderRefineTargets(st) {
    var wrap = $('lavDoneRefine'), list = $('lavDoneRefineList'), okLine = $('lavDoneRefineOk');
    if (!wrap || !list) return;
    var result = (st && st.result) || {};
    var targets = result.refineTargets;
    if (targets === undefined) { wrap.hidden = true; return; }   // 백엔드 플래그 OFF — 섹션 자체를 숨김
    wrap.hidden = false;
    list.innerHTML = '';
    var refineInfo = result.refine || {};
    var freeLeft = Math.max(0, Number(refineInfo.freeLeft) || 0);
    if (!targets.length) { if (okLine) okLine.hidden = false; return; }   // 빈 배열 = 구체성 충분(긍정 신호)
    if (okLine) okLine.hidden = true;
    targets.slice(0, 2).forEach(function (t) {
      var card = document.createElement('div');
      card.className = 'lav-refine-card';
      var quote = document.createElement('blockquote');
      quote.className = 'lav-refine-quote';
      quote.textContent = '“' + (t.snippet || '') + '…”';
      quote.title = '누르면 결과에서 이 문단 위치로 이동해요';
      quote.onclick = function () {   // 카드 ↔ 본문 강조 연결: 스니펫 클릭 = 해당 문단으로 스크롤 + 펄스
        var el = document.querySelector('#lavDoneBody .lav-para[data-para-idx="' + t.index + '"]');
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('is-pulse');
        setTimeout(function () { el.classList.remove('is-pulse'); }, 1300);
      };
      var hint = document.createElement('p');
      hint.className = 'lav-refine-hint';
      hint.textContent = '위 결과에서 보라색으로 칠해진 문단이에요. 원문에 구체적인 장면·수치가 없어 일반론으로 남아 있어요.';
      // "뭘 써야 할지" 가이드 — 정적 텍스트라 innerHTML 사용(사용자 입력 없음)
      var guide = document.createElement('div');
      guide.className = 'lav-refine-guide';
      guide.innerHTML = '<b>이 문단 주제로 직접 겪은 일을 한 줄이면 돼요</b>'
        + '<span><i>언제·어디서</i> 작년 겨울, 편의점 야간 알바에서</span>'
        + '<span><i>무슨 일</i> 정산이 30분 늦어 막차를 놓쳤다</span>'
        + '<span><i>숫자가 있으면 더 좋아요</i> 2년간 · 세 번 · 30분</span>';
      var row = document.createElement('div');
      row.className = 'lav-refine-row';
      var input = document.createElement('textarea');
      input.rows = 2;
      input.maxLength = 500;
      input.className = 'lav-refine-input';
      input.placeholder = '예) 작년 겨울 편의점 야간 알바에서 정산이 30분 늦어 막차를 놓친 적이 있다';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lav-refine-btn';
      var credit = Number(t.credit) || 0;
      btn.textContent = freeLeft > 0
        ? '내 경험 넣어 이 문단만 다시 다듬기 (무료 ' + freeLeft + '회 남음)'
        : '내 경험 넣어 이 문단만 다시 다듬기 (' + credit + '크레딧)';
      var status = document.createElement('p');
      status.className = 'lav-refine-status';
      status.hidden = true;
      btn.onclick = function () { lavRefineSubmit(t.index, credit, freeLeft, input, btn, status); };
      row.appendChild(input); row.appendChild(btn);
      card.appendChild(quote); card.appendChild(hint); card.appendChild(guide); card.appendChild(row); card.appendChild(status);
      list.appendChild(card);
    });
  }

  function lavRefineStatus(statusEl, msg, isError) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
  }

  async function lavRefineSubmit(idx, credit, freeLeft, input, btn, statusEl) {
    if (lavRefineBusy || !lavRefineJobId) return;
    var memo = (input && input.value || '').trim();
    if (memo.length < 5) { lavRefineStatus(statusEl, '실제 겪은 일을 5자 이상 적어 주세요.', true); return; }
    // 유료 회차 클라이언트 프리체크 — accept-fallback과 동일 패턴
    if (freeLeft <= 0 && credit > 0 && window.UP !== 'unlimited' && (Number(window.UC) || 0) < credit) {
      if (typeof window.gpOpenCreditCheckout === 'function') {
        window.gpOpenCreditCheckout({ action: 'paragraph_refine', source: 'refine_card', neededCredits: credit, currentCredits: Number(window.UC) || 0 });
      } else lavRefineStatus(statusEl, '크레딧이 부족해요. 충전 후 다시 시도해 주세요.', true);
      return;
    }
    lavRefineBusy = true;
    input.disabled = true; btn.disabled = true;
    var prevLabel = btn.textContent;
    btn.textContent = '문단을 다시 다듬는 중…';
    lavRefineStatus(statusEl, '실제 경험을 문단에 녹이는 중이에요. 30초~2분 정도 걸려요.');
    if (typeof window.gpTrack === 'function') window.gpTrack('refine_start', { paragraph_index: idx, memo_length: memo.length, free: freeLeft > 0 });
    try {
      var idToken = await evGetIdToken();
      var res = await fetch(window.apiUrl('/transform/' + lavRefineJobId + '/refine-paragraph'), {
        method: 'POST',
        headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ paragraphIndex: idx, memo: memo })
      });
      var d = null;
      try { d = await res.json(); } catch (e2) { d = {}; }
      if (!res.ok) {
        if (res.status === 402 && typeof window.gpOpenCreditCheckout === 'function') {
          window.gpOpenCreditCheckout({ action: 'paragraph_refine', source: 'refine_card', neededCredits: (d && d.needed) || credit, currentCredits: Number(window.UC) || 0 });
        }
        lavRefineStatus(statusEl, (d && d.error) || '문단 보강을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.', true);
        lavRefineBusy = false; input.disabled = false; btn.disabled = false; btn.textContent = prevLabel;
        return;
      }
      pollRefine(lavRefineJobId, ++refinePollGen, { input: input, btn: btn, statusEl: statusEl, prevLabel: prevLabel });
    } catch (e) {
      lavRefineStatus(statusEl, '네트워크 오류로 시작하지 못했어요. 잠시 후 다시 시도해 주세요.', true);
      lavRefineBusy = false; input.disabled = false; btn.disabled = false; btn.textContent = prevLabel;
    }
  }

  function pollRefine(jobId, gen, ui) {
    var tries = 0, MAX_TRIES = 80;   // 3초 × 80 ≈ 4분(백엔드 타임아웃 3분 + 여유)
    var restore = function () { ui.input.disabled = false; ui.btn.disabled = false; ui.btn.textContent = ui.prevLabel; };
    var tick = async function () {
      if (gen !== refinePollGen || jobId !== lavRefineJobId) { lavRefineBusy = false; return; }   // 새 작업·재보강 시작 → 자연 종료
      tries++;
      var body = null;
      try {
        var idToken = await evGetIdToken();
        var res = await fetch(window.apiUrl('/transform/' + jobId), { headers: evAuthHeaders(idToken) });
        if (res.ok) { try { body = await res.json(); } catch (e2) { body = null; } }
      } catch (e) { body = null; }
      var refine = body && body.refine;
      if (refine && refine.status === 'done') {
        lavRefineBusy = false;
        if (refine.changed) {
          var outputText = (body.result && body.result.outputText) || '';
          // 보강된 문단만 펄스로 표시 — 남은 타겟 강조도 함께 갱신
          renderDoneBody(outputText, body.result && body.result.refineTargets, refine.paragraphIndex);
          renderRefineTargets(body);   // 구체화된 문단은 카드에서 빠지고 무료 횟수 갱신
          if (window.gpToast) window.gpToast('실제 경험이 문단에 자연스럽게 녹아 들어갔어요.', { type: 'success' });
          if (typeof window.gpTrack === 'function') window.gpTrack('refine_done', { deducted: !!refine.deducted });
        } else {
          lavRefineStatus(ui.statusEl, refine.note || '문단이 크게 달라지지 않아 원래 문단을 유지했어요. 크레딧·무료 횟수는 쓰지 않았어요.');
          restore();
          if (typeof window.gpTrack === 'function') window.gpTrack('refine_noop', {});
        }
        return;
      }
      if (refine && refine.status === 'error') {
        lavRefineBusy = false;
        lavRefineStatus(ui.statusEl, refine.error || '문단 보강 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.', true);
        restore();
        if (typeof window.gpTrack === 'function') window.gpTrack('refine_error', {});
        return;
      }
      if (tries >= MAX_TRIES) {
        lavRefineBusy = false;
        lavRefineStatus(ui.statusEl, '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.', true);
        restore();
        return;
      }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  }

})();

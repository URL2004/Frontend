/* 회피 모드 워크스페이스 — P0 정적 목업 (더미 데이터, 백엔드 미연결) */
(function () {
  function $(id) { return document.getElementById(id); }
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
  function formalCredit(len, evidence) {
    var tier = Number(len) <= 10000 ? 0 : (Number(len) <= 20000 ? 1 : 2);
    return [200, 400, 600][tier] + (evidence ? 100 : 0);
  }

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
    analyzing: '분석', report: 'AI 감지 보고서', choose: '방법 선택', reduce: 'AI 티 줄이기 설정',
    job: '휴머나이징 중', blocked: '다시 도전', done: '완료'
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
    // 뒤로 버튼: 방법선택(choose)·회피설정(reduce)·감지 보고서(report)에서 표시. 분석중·작업중·완료에선 숨김.
    var back = document.querySelector('.lav-flow-back');
    if (back) back.style.visibility = (name === 'choose' || name === 'reduce' || name === 'report') ? 'visible' : 'hidden';
    var edit = document.querySelector('.lav-flow-edit');
    if (edit) edit.hidden = name === 'analyzing' || name === 'job' || name === 'blocked' || name === 'done';
  }

  // 오프라인 폴백 진단: /diagnose 실패 시 입력 길이로 등급만 흉내(서비스 연속성용).
  function fakeDiagnose(text) {
    var len = (text || '').replace(/\s/g, '').length;
    // 백엔드 BLOG_BAND/POLISH_BAND/RESTRUCTURE_BAND와 동일한 보수 표기(/diagnose 실패 시 폴백)
    if (len < 400) return { grade: 'A', bands: { polish: '30~55%', blog: '30~45%', restructure: '35~60%' }, title: '구체적인 정보가 충분한 글이에요', desc: '사례와 수치가 구체적이라 필요한 문장만 골라 다듬을 수 있어요.' };
    if (len < 1200) return { grade: 'B', bands: { polish: '60~85%', blog: '35~50%', restructure: '35~60%' }, title: '구체적인 내용과 일반적인 설명이 섞여 있어요', desc: '일부 문단에서 반복적이거나 추상적인 표현이 보여요. 해당 문장을 중심으로 다시 구성할 수 있어요.' };
    return { grade: 'C', bands: { polish: '85%+', blog: '40~55%', restructure: '35~60%' }, title: '일반적인 설명의 비중이 높은 글이에요', desc: '구체적인 사례와 수치가 적어 AI식 문체 신호가 두드러질 수 있어요. 원하는 처리 방식을 골라 주세요.' };
  }

  var lastDiag = null;   // 결과 화면의 예상 밴드 표기에 재사용
  var toneSelectionTouched = false;

  function advancedUnavailable(d) {
    if (!d) return false;
    if (d.advancedEligible === false) return true;
    // 구형 백엔드 응답과의 짧은 배포 순서 호환. v2.4.11부터는
    // 한국어 장르 판정만으로 고급을 잠그지 않고 advancedEligible을 명시한다.
    return d.advancedEligible == null && d.restructureUnfit === true;
  }

  function resetToneChoice() {
    toneSelectionTouched = false;
    var blogRadio = document.querySelector('input[name="lavTone"][value="blog"]');
    if (blogRadio) blogRadio.checked = true;
  }

  function applyDiag(d) {
    lastDiag = d;
    // resumeLike는 구형 관측 신호다. 실제 잠금은 v2 장르 판정까지 조정한 canonical 값만 사용한다.
    var unfit = advancedUnavailable(d);
    var hasAdv = !!d.advisory && !unfit;                  // 회피 난이도 안내(STEM 스펙·구조화 보고서) — 소프트, 자소서 안내가 우선
    var rn = $('lavResumeNote');
    if (rn) { rn.hidden = !unfit; if (unfit && d.restructureUnfitReason) rn.textContent = d.restructureUnfitReason; }   // 명확한 사유 노출
    var adv = $('lavAdvisoryNote');
    if (adv) { adv.hidden = !hasAdv; var at = $('lavAdvisoryText'); if (hasAdv && at) at.textContent = d.advisory; }
    var fdn = $('lavFactDenseNote'); if (fdn) fdn.hidden = !(d.factDense && !unfit && !hasAdv);   // 연도·수치 빼곡 안내(advisory 있으면 중복이라 숨김)
    if ($('lavDiagGrade')) $('lavDiagGrade').textContent = d.grade;
    if ($('lavDiagTitle')) $('lavDiagTitle').textContent = d.title;
    if ($('lavDiagDesc')) $('lavDiagDesc').textContent = d.desc;
    var b = d.bands || {};
    if ($('lavBandPolish') && b.polish) $('lavBandPolish').textContent = b.polish;
    if ($('lavBandBlog') && b.blog) $('lavBandBlog').textContent = b.blog;
    if ($('lavBandRestr') && b.restructure) $('lavBandRestr').textContent = b.restructure;
  }

  // P1 연결: 결정론 /diagnose(무과금) — 실패 시 폴백 진단으로 흐름 유지.
  window.lavFlowDiagnose = function () {
    var src = $('lavInput');
    var text = src ? src.value : '';
    resetToneChoice();
    cameFromReport = false;   // 진단 경유 동선 — 설정 화면 뒤로가기는 방법선택으로
    // ★ 코칭 픽 조기 프리페치: 자동 코칭을 사용자가 켠 경우에만 비용을 쓰고 후보를 캐시한다.
    try {
      var ac = $('lavAutoCoach');
      if (ac && ac.checked && !ac.disabled && text && text.trim().replace(/\s/g, '').length >= 80) fetchCoach(text);
    } catch (e) { }
    show('analyzing');
    var minWait = new Promise(function (r) { setTimeout(r, 900); });   // 스피너 최소 노출(즉답이면 화면이 깜빡임)
    console.info('[evasion] API_BASE =', window.apiBase ? window.apiBase() : '?');
    var req = fetch(window.apiUrl('/diagnose'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) { return r.json(); }).catch(function (e) { console.warn('[evasion] /diagnose 실패 — 폴백 진단 사용:', e && e.message); return null; });
    Promise.all([req, minWait]).then(function (out) {
      var d = out[0];
      if (!(d && d.ok)) console.warn('[evasion] 진단 폴백 동작 중 — 백엔드 미연결 상태(블로그 변환은 실패함)');
      applyDiag(d && d.ok ? d : fakeDiagnose(text));
      show('choose');
    });
  };

  window.lavFlowGo = function (name) {
    if (name === 'reduce') applyAdvancedRouting();
    show(name);
    if (name === 'reduce' && window.lavToneChange) window.lavToneChange();   // 분량/근거 블록 동기화
  };

  // v2 진단 결과에 따라 고급 잠금과 추천 선택을 한 곳에서 동기화한다.
  // 추천 선택은 설정 화면에 먼저 보여 주며, 실제 실행은 기존 확인 모달을 통과해야 한다.
  function applyAdvancedRouting() {
    var unfit = advancedUnavailable(lastDiag);
    var recommendAdvanced = !unfit && !!(lastDiag && lastDiag.recommendedMode === 'formal');
    var formalRadio = document.querySelector('input[name="lavTone"][value="formal"]');
    var blogRadio = document.querySelector('input[name="lavTone"][value="blog"]');
    var formalOpt = formalRadio ? formalRadio.closest('.lav-tone-opt') : null;
    if (formalRadio) {
      formalRadio.disabled = unfit;
      if (unfit && formalRadio.checked && blogRadio) blogRadio.checked = true;   // 고급 선택돼 있었으면 기본으로
      if (!unfit && !toneSelectionTouched) formalRadio.checked = recommendAdvanced;
    }
    if (!toneSelectionTouched && blogRadio) blogRadio.checked = !recommendAdvanced || unfit;
    if (formalOpt) formalOpt.classList.toggle('is-locked', unfit);
    var basicRecommended = $('lavBasicRecommended');
    var formalRecommended = $('lavFormalRecommended');
    if (basicRecommended) basicRecommended.hidden = recommendAdvanced;
    if (formalRecommended) formalRecommended.hidden = !recommendAdvanced;
    var advancedNote = $('lavToneAdvancedNote');
    var advancedText = $('lavToneAdvancedText');
    if (advancedNote) advancedNote.hidden = !recommendAdvanced;
    if (advancedText && recommendAdvanced) {
      advancedText.textContent = lastDiag.recommendationReason || '긴 논문·구조화 보고서는 고급의 더 넓은 재구성과 전체 문서 검증이 적합해요. 실행 전 예상 시간과 크레딧을 확인해 주세요.';
    }
    var note = $('lavToneResumeNote');
    if (note) {
      note.hidden = !unfit;
      var reason = lastDiag && lastDiag.restructureUnfitReason;   // 명확한 사유를 잠금 안내에 그대로 노출
      if (unfit && reason) note.textContent = reason;
    }
  }

  // 뒤로: 회피설정→방법선택, 방법선택→(보고서 경유면) 보고서, 보고서→입력화면(원문 유지)
  window.lavFlowBack = function () {
    var step = $('lavFlow') && $('lavFlow').dataset.step;
    if (step === 'reduce') show('choose');
    else if (step === 'choose') { if (cameFromReport) show('report'); else window.lavFlowReset(); }
    else if (step === 'report') window.lavFlowReset();
    else show('choose');
  };

  // ── AI 감지 분리: 유료 감지(100자당 1크레딧) → 보고서(휴머나이징 전환 퍼널) ──────────
  var cameFromReport = false;   // 설정 화면 뒤로가기가 보고서로 돌아가게(진단 경유와 동선 구분)

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
      : 'AI 느낌이 나는 문장을 붙여넣어 보세요...';
    if (!opts.skipUrl && typeof window.gpSyncProductModeUrl === 'function') {
      window.gpSyncProductModeUrl(m);
    }
  };

  window.lavDetect = async function (options) {
    options = options || {};
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
    // ★ 무료 제공 제거(사장님 결정 2026-07-20): 감지는 항상 유료(100자당 1크레딧·로그인 필수).
    //   시작 전에 비용을 고지하고 동의받는다 — 서버도 같은 계약(비로그인 401·잔액 선검증).
    var cost = Math.ceil(text.length / 100);
    var preToken = null;
    try { preToken = await evGetIdToken(true); } catch (e) { /* 비로그인 */ }
    if (!preToken) { alert('AI 감지는 로그인이 필요해요. 로그인 후 이용해 주세요.'); return; }
    var agree = options.resumeAfterPayment === true
      ? true
      : (window.gpConfirm
        ? await window.gpConfirm({ title: 'AI 감지', message: '이 글(' + text.length.toLocaleString() + '자) 감지에 ' + cost + '크레딧이 차감돼요. (100자당 1크레딧)', confirmText: cost + '크레딧으로 감지' })
        : confirm('AI 감지에 ' + cost + '크레딧이 차감돼요. 진행할까요?'));
    if (!agree) return;
    cameFromReport = false;
    // 멱등키 — 재시도 중복 차감 방지
    var reqId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('det_' + Date.now());

    async function runDetect() {
      show('analyzing');
      var idToken = null;
      try { idToken = await evGetIdToken(true); } catch (e) { /* 만료 시 서버가 401 안내 */ }
      var minWait = new Promise(function (r) { setTimeout(r, 900); });
      try {
        var resP = fetch(window.apiUrl('/detect-report'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify({ text: text, requestId: reqId })
        });
        var out = await Promise.all([resP, minWait]);
        var res = out[0];
        var d = await res.json().catch(function () { return null; });

        // 잔액 부족
        if (res.status === 402 && d && d.code === 'INSUFFICIENT_CREDITS') {
          window.lavFlowReset();
          if (typeof window.gpOpenCreditCheckout === 'function') {
            await window.gpOpenCreditCheckout({
              action: 'evasion_detect',
              source: 'evasion_detect_402',
              neededCredits: Number(d.cost) || cost,
              currentCredits: window.UC || 0,
              payload: { text: text }
            });
          } else if (confirm('크레딧이 부족해요. 충전할까요?') && typeof switchTab === 'function') {
            switchTab('pricing');
          }
          return;
        }
        if (res.status === 401 && d && d.code === 'LOGIN_REQUIRED') {
          window.lavFlowReset();
          alert('AI 감지는 로그인이 필요해요.');
          return;
        }
        if (!res.ok || !d || !d.ok) {
          window.lavFlowReset();
          alert((d && d.error) || 'AI 감지에 실패했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        // 성공 — 크레딧 차감 반영(unlimited 플랜은 charged 0)
        if (d.charged) {
          window.UC = Math.max(0, (window.UC || 0) - d.charged);
          if (typeof window.updateCreditUI === 'function') window.updateCreditUI();
          if (window.gpToast) window.gpToast(d.charged + '크레딧을 사용했어요. (남은 크레딧 ' + (window.UC || 0) + ')', { type: 'info' });
        }
        renderReport(d);
        cameFromReport = true;
        show('report');
        playReportIntro();
        lavInitCollapse('lavRepParaList', 'lavRepParaToggle');
      } catch (e) {
        console.warn('[evasion] /detect-report 실패:', e && e.message);
        window.lavFlowReset();
        alert('AI 감지에 실패했어요. 네트워크 상태를 확인해 주세요.');
      }
    }

    runDetect();
  };

  window.gpResumeEvasionDetect = function (payload) {
    payload = payload || {};
    if (!payload.text) return false;
    if (typeof window.switchTab === 'function') window.switchTab('main');
    var input = $('lavInput');
    if (!input) return false;
    input.value = payload.text;
    if (typeof window.lavSetMode === 'function') window.lavSetMode('detect');
    setTimeout(function () { window.lavDetect({ resumeAfterPayment: true }); }, 120);
    return true;
  };

  // ── 게이지 인트로: 화면 공개 후 호 채움(CSS 트랜지션) + 숫자 카운트업(rAF, easeOutCubic 동조) ──
  var repProbTarget = null;
  function playReportIntro() {
    var p = repProbTarget;
    var arc = $('lavRepArc'), num = $('lavRepProb');
    var LEN = Math.PI * 90;
    var target = p == null ? LEN : LEN * (1 - Math.max(0, Math.min(100, p)) / 100);
    // 모션 최소화 환경(접근성·헤드리스 검증): 애니 없이 최종 상태 즉시 — rAF 카운트업이 얼어 어긋나는 것 방지
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (arc) { arc.style.transition = 'none'; arc.style.strokeDashoffset = target; }
      if (num && p != null) num.textContent = p;
      return;
    }
    // 2프레임 양보: hidden 해제가 페인트된 뒤에 목표치를 줘야 트랜지션이 실제로 보인다.
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (arc) {
        arc.style.transition = '';
        arc.style.strokeDashoffset = target;
      }
      if (num && p != null) {
        var t0 = null, dur = 1100;
        var step = function (ts) {
          if (t0 == null) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          num.textContent = Math.round(p * e);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }); });
  }

  var lastReport = null;   // 보고서 → 휴머나이저 핸드오프용(진단 배너 채움)

  function renderReport(d) {
    if (typeof window.gpNormalizeDetectPresentation === 'function') {
      d = window.gpNormalizeDetectPresentation(d);
    }
    lastReport = d;
    var p = d.probability;
    var level = d.riskLevel || (p >= 50 ? 'high' : p >= 21 ? 'moderate' : 'low');
    var sev = p == null ? '' : level === 'high' ? 'bad' : level === 'moderate' ? 'mid' : 'good';
    if ($('lavRepProb')) $('lavRepProb').textContent = (p == null ? '—' : p);
    var score = $('lavRepScore');
    if (score) score.className = 'lav-rep-hero' + (sev ? ' ' + sev : '');
    // 게이지는 여기서 0%로 리셋만 — 채움·카운트업은 화면 공개 후 playReportIntro가
    // (카드가 hidden(display:none)인 동안 채우면 트랜지션이 안 보임 — 2026-06-13 실사고).
    repProbTarget = p;
    var arc = $('lavRepArc');
    if (arc) {
      var LEN = Math.PI * 90;
      arc.style.strokeDasharray = LEN;
      arc.style.transition = 'none';
      arc.style.strokeDashoffset = LEN;
    }
    // "판정 보류" 금지(사장님 지시) — 서버가 LLM 실패 시에도 엔진 추정 숫자를 보내므로 보류 문구 자체를 제거.
    var badge = $('lavRepBadge');
    if (badge) {
      badge.hidden = (p == null);
      badge.textContent = d.riskLabel || (sev === 'bad' ? 'AI 티 지수 높음' : sev === 'mid' ? 'AI 티 지수 중간' : 'AI 티 지수 낮음');
      badge.className = 'lav-rep-badge' + (sev ? ' ' + sev : '');
    }
    if ($('lavRepTitle')) $('lavRepTitle').textContent = d.title || '분석 결과';
    if ($('lavRepSummary')) $('lavRepSummary').textContent = d.summary || '';
    var cc = d.counts || {};
    if ($('lavRepStatRisk')) $('lavRepStatRisk').textContent = cc.risk || 0;
    if ($('lavRepStatThin')) $('lavRepStatThin').textContent = cc.thin || 0;
    if ($('lavRepStatSafe')) $('lavRepStatSafe').textContent = cc.safe || 0;

    // 문단 지도 — DOM 생성(XSS-safe)
    var list = $('lavRepParaList');
    if (list) {
      list.innerHTML = '';
      (d.paragraphs || []).forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'lav-rep-para ' + (p.kind || 'thin');
        var chip = document.createElement('span');
        chip.className = 'rp-chip';
        chip.textContent = p.kind === 'concrete' ? '안전' : (p.kind === 'abstract_risk' ? '위험' : '주의');
        var body = document.createElement('div');
        body.className = 'rp-body';
        var snip = document.createElement('p');
        var full = typeof p.text === 'string' ? p.text : '';   // 서버가 140자 초과 문단에만 전문을 보냄
        var truncated = full && full.length > (p.snippet || '').length;
        snip.textContent = p.snippet + (truncated ? '…' : '');
        var why = document.createElement('em');
        why.textContent = p.reason || '';
        body.appendChild(snip);
        if (truncated) {
          // 문단 전체보기/접기 — 미리보기만으론 어느 대목인지 확인이 안 된다는 사용자 피드백(2026-07-20)
          var more = document.createElement('button');
          more.type = 'button';
          more.className = 'rp-more';
          more.textContent = '전체보기';
          more.setAttribute('aria-expanded', 'false');
          more.onclick = function () {
            var open = more.classList.toggle('on');
            snip.textContent = open ? full : p.snippet + '…';
            snip.classList.toggle('full', open);   // 2줄 클램프 해제(전문은 줄 수 제한 없이)
            more.textContent = open ? '접기' : '전체보기';
            more.setAttribute('aria-expanded', open ? 'true' : 'false');
            // 행이 길어지며 목록이 바깥 접힘(340px)을 넘으면 아래 문단이 소리 없이 잘림 —
            // 전문을 보려는 의도이므로 바깥 접힘은 자동으로 펼치고, 접을 땐 잘림 상태만 재평가
            var listEl = document.getElementById('lavRepParaList');
            if (open && listEl && !listEl.classList.contains('expanded') && listEl.scrollHeight > listEl.clientHeight + 6) {
              window.lavToggleCollapse('lavRepParaList', document.getElementById('lavRepParaToggle'));
            } else {
              lavSyncCollapse('lavRepParaList', 'lavRepParaToggle');
            }
          };
          body.appendChild(more);
        }
        body.appendChild(why);
        // ★ 문단별 코칭(2026-06-17): 학습된 프록시 예측태그 → 채울 경험 메모 칸 안내
        if (p.coach && p.coach.length) {
          var fset = [];
          p.coach.forEach(function (c) { (c.fields || []).forEach(function (f) { if (fset.indexOf(f) < 0) fset.push(f); }); });
          var pc = document.createElement('div');
          pc.className = 'rp-coach';
          pc.textContent = '경험 메모에서 ' + fset.join(' · ') + ' 항목을 채우면 글을 더 구체적으로 다듬을 수 있어요';
          body.appendChild(pc);
        }
        row.appendChild(chip); row.appendChild(body);
        list.appendChild(row);
      });
      // ★ 글 전체 코칭 요약 배너 — 상위 예측태그 → 채울 메모 칸 + 이유
      if (d.coach && d.coach.length) {
        var bf = [];
        d.coach.forEach(function (c) { (c.fields || []).forEach(function (f) { if (bf.indexOf(f) < 0) bf.push(f); }); });
        var banner = document.createElement('div');
        banner.className = 'lav-rep-coach';
        var bt = document.createElement('b');
        bt.textContent = '글을 더 구체적으로 만들려면 경험 메모의 ' + bf.join(' · ') + ' 항목에 실제 내용을 적어 주세요';
        var bw = document.createElement('span');
        bw.textContent = '. ' + d.coach.map(function (c) { return c.why; }).join(' / ');
        banner.appendChild(bt); banner.appendChild(bw);
        list.insertBefore(banner, list.firstChild);
      }
    }
    if ($('lavRepParaCount')) $('lavRepParaCount').textContent = '총 ' + ((d.paragraphs || []).length) + '문단';

    // 실시간 1문장 미리보기 — 없으면 블록 숨김
    var ex = $('lavRepExample');
    if (ex) {
      ex.hidden = !d.example;
      if (d.example) {
        if ($('lavRepBefore')) $('lavRepBefore').textContent = d.example.before;
        if ($('lavRepAfter')) $('lavRepAfter').textContent = d.example.after;
      }
    }

    if ($('lavRepRemain')) {
      $('lavRepRemain').textContent = d.charged ? '이번 감지에 ' + d.charged + '크레딧을 사용했어요. (100자당 1크레딧)' : '';
    }
  }

  // 보고서 → 휴머나이저 핸드오프(완전 분리 — 사장님 지시): 해결 경로 선택은 보고서가 아니라
  // 기존 방법 선택(choose) 화면에서. 보고서 데이터로 진단 배너·밴드를 채워 재진단 없이 이어가고,
  // 글은 입력칸(lavInput)에 그대로 남아 있어 같은 글로 바로 진행된다(컨텍스트 바 원문 N자 표기 동일).
  window.lavReportToHumanize = function () {
    window.lavSetMode('humanize');   // 휴머나이저로 "이동" — 모드 상태도 함께 전환(입력 화면 복귀 시 일관)
    resetToneChoice();
    var d = lastReport;
    if (d) {
      var sol = d.solutions || {};
      applyDiag({
        grade: d.grade,
        title: d.title,
        desc: d.summary || '',
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
    show('choose');
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
      ctaMeta.textContent = estimateTimeRangeLabel(formalEstimateRange(text, evidence)) + ' · ' + formalCredit(text.length, evidence) + '크레딧';
    } else {
      ctaMeta.textContent = estimateTimeLabel(shortEstimateSec(text)) + ' · ' + shortHumanizeCredit(text.length) + '크레딧';
    }
  }

  window.lavToneChange = function (userInitiated) {
    if (userInitiated === true) toneSelectionTouched = true;
    var formal = document.querySelector('input[name="lavTone"]:checked');
    var isFormal = formal && formal.value === 'formal';
    var basicStyle = currentBasicStyle();
    var isReportBasic = !isFormal && basicStyle === 'report';
    var styleBlock = $('lavBasicStyleBlock');
    if (styleBlock) styleBlock.hidden = !!isFormal;
    var lenBlock = $('lavLenBlock');
    if (lenBlock) lenBlock.hidden = !isFormal;
    // 근거 보강은 고급 휴머나이징 전용 — 엔진이 blog 경로 미지원이라 기본 휴머나이징에선 기능·시각 모두 잠금
    var ev = $('lavEvidence');
    if (ev) {
      ev.disabled = !isFormal;
      if (!isFormal && ev.checked) { ev.checked = false; window.lavEvidenceChange(); }
    }
    var evBlock = $('lavEvidenceBlock');
    if (evBlock) evBlock.classList.toggle('ev-off', !isFormal);
    var evHint = $('lavEvidenceHint');
    if (evHint) evHint.hidden = isFormal;
    // ★ 자동 코칭은 친근한 표현 보조/고급에서만 적용. 격식 표현 보조는 원문 인칭·사실 보존을 위해 끈다.
    var ac = $('lavAutoCoach');
    if (ac) {
      ac.disabled = isReportBasic;
      if (isReportBasic) ac.checked = false;
    }
    var acBlock = $('lavAutoCoachBlock');
    if (acBlock) {
      acBlock.hidden = isReportBasic;
      acBlock.classList.remove('ev-off');
    }
    // 경험·관점 아코디언(래퍼) — 격식 표현 보조에서는 내부(코칭·메모)가 전부 잠기므로 통째로 숨김
    var persBlock = $('lavPersonalBlock');
    if (persBlock) persBlock.hidden = isReportBasic;
    var acHint = $('lavAutoCoachHint');
    if (acHint) acHint.hidden = true;
    if (isReportBasic) {
      var memoBlock = $('lavMemoBlock');
      if (memoBlock) memoBlock.hidden = true;
      var memoHint = $('lavMemoToggleHint');
      if (memoHint) memoHint.hidden = true;
    }
    // 서버와 같은 길이 계산식으로 예상 시간·크레딧을 표시한다. 대기열 시간은 별도다.
    updateCtaMeta();
    if (!isReportBasic) window.lavAutoCoachChange();   // 메모칸 가시성 동기화(자동 ON=숨김 / 자동OFF=노출) + 후보 프리페치
  };

  window.lavBasicStyleChange = function () {
    if (window.lavToneChange) window.lavToneChange();
  };

  window.lavEvidenceChange = function () {
    var on = $('lavEvidence') && $('lavEvidence').checked;
    var note = $('lavEvidenceNote');
    if (note) note.hidden = !on;
    updateCtaMeta();
  };

  // ★ 경험 메모 4칸(직접경험·사례·수치·내생각) → 한 줄에 한 가지씩 합쳐 memo 문자열로(엔진은 줄 단위로 녹임).
  var MEMO_FIELDS = ['lavMemoExp', 'lavMemoCase', 'lavMemoNum', 'lavMemoView'];
  function collectMemo() {
    var lines = [];
    MEMO_FIELDS.forEach(function (id) {
      var el = $(id);
      if (el && el.value.trim()) {
        el.value.split(/\n+/).forEach(function (ln) { ln = ln.trim(); if (ln) lines.push(ln); });
      }
    });
    // 자동 코칭 모달에서 체크한 추천 픽(입장·경험)도 memo로 합류 — 체크=저자 승인(무날조)
    document.querySelectorAll('#lavCoachPicksList input.lav-pick-cb:checked').forEach(function (cb) {
      var t = (cb.getAttribute('data-text') || '').trim();
      if (t && lines.indexOf(t) < 0) lines.push(t);
    });
    return lines.join('\n');
  }

  // ── 자동 코칭 후보 fetch(캐시·프리페치). /coach-suggest는 LLM 1콜(~10초)이라 시작 모달 전에 미리 받아둔다.
  var _coachCache = {}, _coachPending = {};
  function coachKey(t) { return (t || '').trim(); }
  function fetchCoach(text) {
    var key = coachKey(text);
    if (!key || key.replace(/\s/g, '').length < 80) return Promise.resolve({ stances: [], experiences: [] });
    if (_coachCache[key]) return Promise.resolve(_coachCache[key]);
    if (_coachPending[key]) return _coachPending[key];
    var p = fetch(window.apiUrl('/coach-suggest'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var out = (d && d.ok) ? { stances: d.stances || [], experiences: d.experiences || [] } : { stances: [], experiences: [] };
      _coachCache[key] = out; delete _coachPending[key]; return out;
    }).catch(function () { delete _coachPending[key]; return { stances: [], experiences: [] }; });
    _coachPending[key] = p;
    return p;
  }
  // 자동 코칭 ON ↔ 직접 메모칸 토글(가독성: 둘 중 하나만 노출)
  window.lavAutoCoachChange = function () {
    var ac = $('lavAutoCoach');
    var on = !!(ac && ac.checked && !ac.disabled);
    var memo = $('lavMemoBlock'); if (memo) memo.hidden = on;          // 자동 ON → 메모칸 숨김
    var hint = $('lavMemoToggleHint'); if (hint) hint.hidden = !on;    // 자동 ON일 때만 '직접 입력' 링크
    if (on) { var src = $('lavInput'); if (src) fetchCoach(src.value); }  // 미리 후보 받아두기(모달 즉시 표시)
  };
  window.lavMemoManual = function () {   // '경험 메모 직접 입력' → 자동 끄고 메모칸 노출
    var ac = $('lavAutoCoach');
    if (ac && !ac.disabled) { ac.checked = false; window.lavAutoCoachChange(); }
  };
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var _coachRenderGen = 0;
  var _coachLoading = false;
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
  // 시작 확인 모달에 추천 픽(입장·경험) 체크박스 렌더 — 자동 코칭 ON이면(기본/고급 둘 다).
  //   ★2026-06-18: 해요체 캐주얼 글(기본 휴머나이징)에서 자동코칭 픽이 안 뜨던 문제 — 'formal 전용' 게이트 제거.
  //   메모 경로(collectMemo→memo)는 blog(runShortJob)·formal 둘 다 전송하므로 픽이 양쪽에 적용된다.
  //   ★★2026-06-18(사장님 지적): 확인창이 먼저 뜨고 픽이 ~9초 뒤 채워져, 그 빈 순간에 사용자가 "코칭 안 되네" 하고
  //   바로 시작을 눌러 픽을 건너뛴다. → 픽 로딩 동안 '시작하기' 버튼을 잠그고(추천 불러오는 중…), 픽이 뜨거나
  //   실패/없음·15초 타임아웃 시 풀어준다. 프리페치(진단단계)가 끝나 있으면 즉시 풀려 체감 지연 거의 없음.
  function renderCoachPicks(s) {
    var wrap = $('lavCoachPicks'), list = $('lavCoachPicksList');
    if (!wrap || !list) { lavStartBtnState(false); return; }
    if (!s.autoCoach) { wrap.hidden = true; lavStartBtnState(false); return; }
    wrap.hidden = false;
    list.innerHTML = '<div class="lav-coach-picks-loading">원문과 어울리는 관점·경험 후보를 찾고 있어요…</div>';
    lavStartBtnState(true);   // 픽 뜰 때까지 시작 잠금
    var src = $('lavInput'); var text = src ? src.value : '';
    var gen = ++_coachRenderGen;
    var done = false;
    var unlock = function () { if (gen === _coachRenderGen) lavStartBtnState(false); };
    setTimeout(function () { if (!done) unlock(); }, 15000);   // 안전: 15초 넘으면 잠금 해제(무한 잠금 방지)
    fetchCoach(text).then(function (d) {
      done = true;
      if (gen !== _coachRenderGen) return;   // 더 최신 요청 있으면 무시
      lavStartBtnState(false);               // 로딩 끝 → 시작 가능
      var items = ((d.stances || []).map(function (x) { return { text: x.text, tag: '관점', pre: false }; }))
        .concat((d.experiences || []).map(function (x) { return { text: x.text, tag: '경험', pre: false }; }));
      if (!items.length) { wrap.hidden = true; return; }
      list.innerHTML = items.map(function (it) {
        return '<label class="lav-pick"><input type="checkbox" class="lav-pick-cb"' + (it.pre ? ' checked' : '') +
          ' data-text="' + escHtml(it.text) + '"><span class="lav-pick-tag">' + it.tag + '</span><span class="lav-pick-text">' + escHtml(it.text) + '</span></label>';
      }).join('');
    });
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
  window.lavDocumentProfileChange = function () {
    var hint = $('lavDocumentProfileHint');
    var profile = currentDocumentProfile();
    if (!hint) return;
    hint.textContent = profile
      ? '자동 판정이 애매할 때만 이 선택을 사용해요. 원문 장르가 뚜렷하면 안전을 위해 자동 판정을 우선합니다.'
      : '원문의 구성·어휘·종결체를 보고 엔진이 글 종류를 판별합니다.';
  };
  function currentSettings() {
    var tone = document.querySelector('input[name="lavTone"]:checked');
    var len = document.querySelector('input[name="lavLen"]');
    var ev = $('lavEvidence');
    var ac = $('lavAutoCoach');
    var basicStyle = tone && tone.value === 'blog' ? currentBasicStyle() : null;
    var basicReport = basicStyle === 'report';
    return {
      tone: tone ? tone.value : 'blog',
      basicStyle: basicStyle || 'blog',
      documentProfile: currentDocumentProfile(),
      length: len ? len.value : 'keep',
      memo: basicReport ? '' : collectMemo(),
      evidence: !!(ev && ev.checked),
      autoCoach: !basicReport && !!(ac && ac.checked && !ac.disabled)   // 자동 코칭 — 사용자가 켠 경우에만 추천 후보를 표시
    };
  }

  window.lavOpenConfirm = function () {
    pendingPolish = false;   // 휴머나이징 확인 — 다듬기 플래그 정리
    var ttl = document.querySelector('.lav-confirm-title');
    if (ttl) ttl.textContent = '이 설정으로 시작할까요?';
    var s = currentSettings();
    renderCoachPicks(s);   // 자동 코칭 ON(고급)이면 추천 픽 체크박스 표시(시작 직전 선택)
    renderEffectNotice(s);
    var sum = $('lavConfirmSummary');
    if (sum) {
      var rows = [];
      rows.push(['방식', s.tone === 'formal' ? '고급 휴머나이징 — 전 문서 의미 검증' : '기본 휴머나이징 — 장르 자동 맞춤']);
      rows.push(['글 종류', s.documentProfile ? DOCUMENT_PROFILE_LABELS[s.documentProfile] + ' · 애매할 때만 반영' : '자동 판별']);
      if (s.tone === 'blog') rows.push(['문체 보조', s.basicStyle === 'report' ? '격식 있는 표현 보조 · 원문 장르 우선' : '친근한 표현 보조 · 원문 장르 우선']);
      if (s.tone === 'formal') rows.push(['분량', '원문에 가깝게 유지']);
      // 자동 코칭 ON이면 위 추천 픽 섹션이 입력을 대신함 → 메모 행 생략(중복·혼동 방지)
      if (s.tone === 'blog' && s.basicStyle === 'report') rows.push(['추가 메모', '사용 안 함 · 원문 중심']);
      else if (!(s.tone === 'formal' && s.autoCoach)) rows.push(['경험 메모', s.memo ? '입력함 · 글에 자연스럽게 녹여요' : '없음']);
      rows.push(['근거 보강', s.tone === 'formal' ? (s.evidence ? '켬 — 검색 후 검수·승인' : '끔') : '기본 휴머나이징에선 사용 안 함']);
      sum.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
      }).join('');
    }
    // 과금(서버와 동일): 기본 휴머나이징=최소 10크레딧 + 100자당 2크레딧, 고급=건당 정액.
    var src = $('lavInput');
    var text = src ? src.value : '';
    var len = text.length;
    var credit, time;
    if (s.tone === 'formal') {
      credit = formalCredit(len, s.evidence) + ' 크레딧';
      time = estimateTimeRangeLabel(formalEstimateRange(text, s.evidence)) + ' · 대기 제외';
    } else {
      credit = shortHumanizeCredit(len) + ' 크레딧';
      time = estimateTimeLabel(shortEstimateSec(text)) + ' · 대기 제외';
    }
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = credit;
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = time;
    var subC = $('lavConfirmSub'); if (subC) subC.hidden = false;   // 회피는 탐지율 안내 노출
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
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
      show('reduce');
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

  // ★ short job(2026-06-13): 직접 fetch였던 기본 휴머나이징(blog)·원문 보존 다듬기(polish)를 /transform job으로 —
  //   새로고침·창닫기 생존 + lavJobRef 재진입(고급 휴머나이징과 동일). 둘 다 크레딧이 드는 작업이라 생존 필수(사장님 지적).
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
        var body = { text: text, mode: mode, memo: (s && s.memo) || '', lang: evDetectLang(text) };
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
        await handleTransformStartError(err, mode === 'polish' ? 'choose' : 'reduce', gen);
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
    pendingPolish = true;
    renderEffectNotice({ tone: 'polish' });
    var cp = $('lavCoachPicks'); if (cp) cp.hidden = true;   // 다듬기(최소수정)는 코칭 픽 없음 — 모달 재사용 시 직전 잔여 숨김
    lavStartBtnState(false);   // 코칭 잠금이 남아있을 수 있으니 시작 버튼 활성화 보장
    var ttl = document.querySelector('.lav-confirm-title');
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
      if (newLabel) newLabel.textContent = blocking ? '진행 화면 보기' : '새 문장 시작';
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
      message: label + ' 결과가 준비됐어요. 보관함에 저장했습니다.',
      action: { type: 'library' }
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
    if (window.gpToast) window.gpToast('작업을 중단했어요. 크레딧은 차감되지 않았습니다.', { type: 'info' });
    show('reduce');
  };
  // ── P5: jobId 재진입 — 새로고침·재방문 시 진행 중 작업 복원(서버 job은 어차피 계속 돌고 있음) ──
  function saveJobRef(jobId, status) {
    try { localStorage.setItem('lavJobRef', JSON.stringify({ jobId: jobId, status: status || activeJobUi.status || 'checking', ts: Date.now() })); } catch (e) { }
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
    if (err && err.httpStatus === 422 && err.code === 'NO_EDITABLE_CONTENT') {
      clearJobRef();
      clearActiveJobUi();
      show(fallbackStep || 'reduce');
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
      show(fallbackStep || 'reduce');
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
      show(fallbackStep || 'reduce');
      var resumePayload = err.gpResumePayload || {};
      var resumeText = String(resumePayload.text || (($('lavInput') || {}).value || ''));
      var resumeSettings = resumePayload.settings || {};
      var resumeMode = resumePayload.flowMode || 'blog';
      var resumeNeeded = Number(err.needed) || (resumeMode === 'formal'
        ? formalCredit(resumeText.length, !!resumeSettings.evidence)
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
    show(fallbackStep || 'reduce');
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
        show('choose');
        return;
      }
      if (st.status === 'cancelled') {
        stopFormalTicker();
        activeCancel = null;
        clearJobRef();
        clearActiveJobUi();
        show('reduce');
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
        show(st.mode === 'polish' ? 'choose' : 'reduce');   // 다듬기는 설정 화면이 없음 — 방법 선택으로
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
    // 보존형 폴백 안내 배너(정직 표기) — 일반 결과에선 항상 숨김으로 리셋
    var lavFbBanner = $('lavFallbackBanner');
    if (lavFbBanner) {
      lavFbBanner.hidden = !isPreservationFallback;
      if (isPreservationFallback && $('lavFallbackMsg')) {
        $('lavFallbackMsg').textContent = st.note || '기본 휴머나이징 결과를 안전하게 전달하기 어려워, 사용자가 선택한 원문 보존 다듬기로 다시 처리했어요.';
      }
    }
    // ── '예상 AI 탐지율 %' 표기 제거(2026-06-15) ──────────────────────────────
    //   결과 화면 우상단 숫자는 진단 밴드를 그대로 재표기한 값이라 실제 출력과 무관 — 격식·추상글은
    //   실제 100%인데 35~60%로 표기돼 거짓 약속·환불 사고를 냈다. 회피율은 LLM 생성·탐지기·글에 따라
    //   크게 흔들려 약속할 수 없으므로, surfaceguard가 신뢰성 있게 맞히는 '글 등급'만 정성 신호로 노출하고
    //   (다듬기·등급 미상이면 숨김), 정확한 수치는 직접 측정을 안내한다.
    var GRADE_LABEL = { A: '쉬움', B: '보통', C: '어려움' };
    var GRADE_COLOR = { A: '#1e8e3e', B: '#d9920a', C: '#d23f3f' };
    var grade = (lastDiag && lastDiag.grade) || '';
    var showGrade = st.mode !== 'polish' && !!GRADE_LABEL[grade];
    var scoreWrap = $('lavDoneScoreWrap');
    if (scoreWrap) scoreWrap.hidden = !showGrade;
    if (showGrade && $('lavDoneScore')) {
      $('lavDoneScore').textContent = GRADE_LABEL[grade];
      $('lavDoneScore').style.color = GRADE_COLOR[grade];
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
    if ($('lavDoneBody')) $('lavDoneBody').textContent = (st.result && st.result.outputText) || '';
    lavSaveToLibrary(label, st.result && st.result.outputText, grade ? grade + '등급' : '');
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
      wrap.textContent = '크레딧 처리 상태를 확인하고 있어요. 이용 기록에서 최종 상태를 확인해 주세요.';
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
          ? '사실·수치가 많은 글은 <b>문단을 짧게 나누거나</b>, 해당 부분은 원문 표현을 더 유지해서 다시 도전해 주세요.'
          : '위 내용과 관련된 <b>실제 경험·사례·수치</b>를 경험 메모에 적고 다시 도전하면, 그 부분을 더 구체적이고 자연스럽게 바꿀 수 있어요.';
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

  // 경험 메모 넣고 다시 — 설정 화면으로 돌아가 메모칸에 포커스(원문은 lavInput에 유지 → 재제출 시 새 작업)
  window.lavBlockedRetryMemo = function () {
    lavBlockedJobId = null;
    clearJobRef();
    clearActiveJobUi();
    show('reduce');
    // 접힌 아코디언을 펼치고, 자동 코칭이 켜져 있으면 꺼서 메모칸을 노출
    var pers = $('lavPersonalBlock');
    if (pers) pers.open = true;
    if (window.lavMemoManual) window.lavMemoManual();
    var memo = $('lavMemoExp');
    if (memo) { try { memo.focus(); } catch (e) { } try { memo.scrollIntoView({ block: 'center' }); } catch (e) { } }
  };
  // 근거 보강 켜고 다시 — 고급(formal)으로 전환 + 근거 토글 ON
  window.lavBlockedRetryEvidence = function () {
    lavBlockedJobId = null;
    clearJobRef();
    clearActiveJobUi();
    var formalRadio = document.querySelector('input[name="lavTone"][value="formal"]');
    if (formalRadio) { formalRadio.checked = true; if (window.lavToneChange) window.lavToneChange(); }
    var ev = $('lavEvidence');
    if (ev && !ev.disabled) { ev.checked = true; if (window.lavEvidenceChange) window.lavEvidenceChange(); }
    show('reduce');
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
    show('choose');
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
          body: JSON.stringify({ text: text, mode: 'formal', evidence: !!s.evidence, memo: s.memo || '', autoCoach: false, lang: evDetectLang(text), length: 'keep', documentProfile: s.documentProfile || undefined, effectNoticeAccepted: !!s.effectNoticeAccepted })
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
        await handleTransformStartError(err, 'reduce', gen);
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

  // ── 보관함(localStorage 기반 — Firebase 없이도 동작) ──────────
  var LIB_KEY = 'lavLibrary';
  function lavLibAll() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { return []; }
  }
  window.lavSaveToLibrary = function (kind, text, band) {
    if (!text || !text.trim()) return;
    try {
      var list = lavLibAll();
      var title = (text.split('\n').find(function (l) { return l.trim(); }) || '제목 없음').trim().slice(0, 50);
      list.unshift({ id: 'L' + (list.length ? (parseInt(list[0].id.slice(1), 10) + 1) : 1), kind: kind, band: band || '', title: title, text: text, len: text.replace(/\s/g, '').length });
      if (list.length > 50) list = list.slice(0, 50);   // 보관 상한
      localStorage.setItem(LIB_KEY, JSON.stringify(list));
      if (typeof window.lavRenderLibrary === 'function') window.lavRenderLibrary();
    } catch (e) { /* localStorage 가득참 등 — 무시 */ }
  };
  window.lavOpenLibrary = function () {
    window.lavRenderLibrary();
    var m = $('lavLibraryModal'); if (m) m.hidden = false;
    if (typeof window.lavCloseSidebar === 'function') window.lavCloseSidebar();
  };
  window.lavCloseLibrary = function () {
    var m = $('lavLibraryModal'); if (m) m.hidden = true;
  };
  window.lavRenderLibrary = function () {
    var wrap = $('lavLibraryList');
    if (!wrap) return;
    var list = lavLibAll();
    if (!list.length) { wrap.innerHTML = '<p class="lav-lib-empty">아직 보관된 결과가 없어요. 변환을 완료하면 자동으로 여기에 저장됩니다.</p>'; return; }
    wrap.innerHTML = '';
    list.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'lav-lib-item';
      var meta = document.createElement('div');
      meta.className = 'lav-lib-meta';
      var b1 = document.createElement('b'); b1.textContent = item.title;
      var sp = document.createElement('span'); sp.textContent = item.kind + ' · ' + (item.band || '') + ' · ' + item.len.toLocaleString() + '자';
      meta.appendChild(b1); meta.appendChild(sp);
      var acts = document.createElement('div');
      acts.className = 'lav-lib-acts';
      var copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'ghost'; copyBtn.textContent = '복사';
      copyBtn.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(item.text).catch(function () {}); copyBtn.textContent = '복사됨'; setTimeout(function () { copyBtn.textContent = '복사'; }, 1200); };
      var dlBtn = document.createElement('button'); dlBtn.type = 'button'; dlBtn.className = 'ghost'; dlBtn.textContent = '.md';
      dlBtn.onclick = function () { var blob = new Blob([item.text], { type: 'text/markdown;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = item.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + '.md'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      var delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'ghost lav-lib-del'; delBtn.textContent = '삭제';
      delBtn.onclick = function () { var l = lavLibAll().filter(function (x) { return x.id !== item.id; }); localStorage.setItem(LIB_KEY, JSON.stringify(l)); window.lavRenderLibrary(); };
      acts.appendChild(copyBtn); acts.appendChild(dlBtn); acts.appendChild(delBtn);
      row.appendChild(meta); row.appendChild(acts);
      wrap.appendChild(row);
    });
  };
})();

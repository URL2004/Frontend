/* 회피 모드 워크스페이스 — P0 정적 목업 (더미 데이터, 백엔드 미연결) */
(function () {
  function $(id) { return document.getElementById(id); }
  var SHORT_HUMANIZE_MIN_CREDITS = 10;
  function shortHumanizeCredit(len) {
    return Math.max(SHORT_HUMANIZE_MIN_CREDITS, Math.ceil((Number(len) || 0) / 100) * 2);
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
  }

  // 오프라인 폴백 진단: /diagnose 실패 시 입력 길이로 등급만 흉내(서비스 연속성용).
  function fakeDiagnose(text) {
    var len = (text || '').replace(/\s/g, '').length;
    // 백엔드 BLOG_BAND/POLISH_BAND/RESTRUCTURE_BAND와 동일한 보수 표기(/diagnose 실패 시 폴백)
    if (len < 400) return { grade: 'A', bands: { polish: '30~55%', blog: '30~45%', restructure: '35~60%' }, title: '구체적 정보가 충분한 글이에요', desc: '사례·수치가 풍부해, 다듬기만으로도 자연스럽게 마무리할 수 있어요.' };
    if (len < 1200) return { grade: 'B', bands: { polish: '60~85%', blog: '35~50%', restructure: '35~60%' }, title: '추상과 구체가 섞인 글이에요', desc: '일부 문단은 일반론에 가까워요. 휴머나이징으로 더 사람답게 만들 수 있어요.' };
    return { grade: 'C', bands: { polish: '85%+', blog: '40~55%', restructure: '35~60%' }, title: '추상적 일반론 비중이 높은 글이에요', desc: '구체적 사례·수치가 적어, AI가 쓴 글처럼 보이기 쉬워요. 어떻게 할지 골라주세요.' };
  }

  var lastDiag = null;   // 결과 화면의 예상 밴드 표기에 재사용

  function applyDiag(d) {
    lastDiag = d;
    var unfit = !!(d.restructureUnfit || d.resumeLike);   // 자소서·생기부·탐구문·짧고추상 → 재구성 부적합
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
    if (name === 'reduce') applyResumeLock();   // 자소서·이력이면 재구성(고급) 잠그고 기본 피하기만 허용
    show(name);
    if (name === 'reduce' && window.lavToneChange) window.lavToneChange();   // 분량/근거 블록 동기화
  };

  // 재구성 부적합(자소서·생기부·탐구문·짧고추상) → 재구성(고급) 잠금 + 기본 피하기 강제. 적합하면 원복.
  function applyResumeLock() {
    var unfit = !!(lastDiag && (lastDiag.restructureUnfit || lastDiag.resumeLike));
    var formalRadio = document.querySelector('input[name="lavTone"][value="formal"]');
    var blogRadio = document.querySelector('input[name="lavTone"][value="blog"]');
    var formalOpt = formalRadio ? formalRadio.closest('.lav-tone-opt') : null;
    if (formalRadio) {
      formalRadio.disabled = unfit;
      if (unfit && formalRadio.checked && blogRadio) blogRadio.checked = true;   // 고급 선택돼 있었으면 기본으로
    }
    if (formalOpt) formalOpt.classList.toggle('is-locked', unfit);
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

  // ── AI 감지 분리: 무료 감지 → 보고서(전환 퍼널) ──────────────────────────
  var cameFromReport = false;   // 설정 화면 뒤로가기가 보고서로 돌아가게(진단 경유와 동선 구분)

  // 실행 모드 토글(컴포저 세그먼트): 전송 버튼은 하나 — 선택된 모드가 lavRun의 동작을 결정.
  window.lavMode = 'humanize';
  window.lavSetMode = function (m) {
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
  };

  window.lavDetect = async function () {
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
    cameFromReport = false;
    // 멱등키 — 무료 호출과 유료 재요청이 같은 키를 써서 재시도 중복 차감 방지
    var reqId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('det_' + Date.now());

    async function runDetect(paid) {
      show('analyzing');
      var idToken = null;
      try { idToken = await evGetIdToken(true); } catch (e) { /* 비로그인 — 무료 감지는 IP 기준 한도 */ }
      var minWait = new Promise(function (r) { setTimeout(r, 900); });
      try {
        var resP = fetch(window.apiUrl('/detect-report'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify({ text: text, paid: !!paid, requestId: reqId })
        });
        var out = await Promise.all([resP, minWait]);
        var res = out[0];
        var d = await res.json().catch(function () { return null; });

        // 무료 한도 소진 → 유료 감지 안내(확인 후 paid:true로 재요청)
        if (res.status === 402 && d && d.code === 'FREE_EXHAUSTED') {
          window.lavFlowReset();
          if (!idToken) { alert('오늘 무료 감지(' + d.freeCap + '회)를 다 썼어요. 유료 감지는 로그인이 필요해요.'); return; }
          var ok = window.gpConfirm
            ? await window.gpConfirm({ title: '오늘 무료 감지를 다 썼어요', message: '무료 ' + d.freeCap + '회를 모두 사용했어요.\n이 글을 ' + d.cost + '크레딧으로 감지할까요? (100자당 1크레딧)', confirmText: d.cost + '크레딧으로 감지' })
            : confirm('무료 감지를 다 썼어요. ' + d.cost + '크레딧으로 감지할까요?');
          if (ok) return runDetect(true);
          return;
        }
        // 잔액 부족
        if (res.status === 402 && d && d.code === 'INSUFFICIENT_CREDITS') {
          window.lavFlowReset();
          var go = window.gpConfirm
            ? await window.gpConfirm({ title: '크레딧이 부족해요', message: '이 글 감지에 ' + d.cost + '크레딧이 필요해요. 충전하러 갈까요?', confirmText: '충전하러 가기' })
            : confirm('크레딧이 부족해요. 충전할까요?');
          if (go && typeof switchTab === 'function') switchTab('pricing');
          return;
        }
        if (res.status === 401 && d && d.code === 'LOGIN_REQUIRED') {
          window.lavFlowReset();
          alert('유료 감지는 로그인이 필요해요.');
          return;
        }
        if (!res.ok || !d || !d.ok) {
          window.lavFlowReset();
          alert((d && d.error) || 'AI 감지에 실패했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        // 성공(무료 or 유료) — 유료면 크레딧 차감 반영
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

    runDetect(false);
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
    lastReport = d;
    var p = d.probability;
    var sev = p == null ? '' : p >= 70 ? 'bad' : p >= 40 ? 'mid' : 'good';
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
      badge.textContent = sev === 'bad' ? 'AI 의심 높음' : sev === 'mid' ? 'AI 의심 중간' : 'AI 의심 낮음';
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
        snip.textContent = p.snippet + (p.snippet && p.snippet.length >= 90 ? '…' : '');
        var why = document.createElement('em');
        why.textContent = p.reason || '';
        body.appendChild(snip); body.appendChild(why);
        // ★ 문단별 코칭(2026-06-17): 학습된 프록시 예측태그 → 채울 경험 메모 칸 안내
        if (p.coach && p.coach.length) {
          var fset = [];
          p.coach.forEach(function (c) { (c.fields || []).forEach(function (f) { if (fset.indexOf(f) < 0) fset.push(f); }); });
          var pc = document.createElement('div');
          pc.className = 'rp-coach';
          pc.textContent = '💡 경험 메모 ' + fset.join(' · ') + ' 를 채우면 내려가요';
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
        bt.textContent = '글을 더 구체적으로 만들려면 → 경험 메모 ' + bf.join(' · ');
        var bw = document.createElement('span');
        bw.textContent = ' 를 채우세요. (' + d.coach.map(function (c) { return c.why; }).join(' / ') + ')';
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
      $('lavRepRemain').textContent = 'AI 감지는 무료예요' + (d.remainingToday != null ? ' (오늘 ' + d.remainingToday + '회 남음)' : '') + '.';
    }
  }

  // 보고서 → 휴머나이저 핸드오프(완전 분리 — 사장님 지시): 해결 경로 선택은 보고서가 아니라
  // 기존 방법 선택(choose) 화면에서. 보고서 데이터로 진단 배너·밴드를 채워 재진단 없이 이어가고,
  // 글은 입력칸(lavInput)에 그대로 남아 있어 같은 글로 바로 진행된다(컨텍스트 바 원문 N자 표기 동일).
  window.lavReportToHumanize = function () {
    window.lavSetMode('humanize');   // 휴머나이저로 "이동" — 모드 상태도 함께 전환(입력 화면 복귀 시 일관)
    var d = lastReport;
    if (d) {
      var sol = d.solutions || {};
      applyDiag({
        grade: d.grade,
        title: d.title,
        desc: d.summary || '',
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
    exitWorkspace();
    var src = $('lavInput');
    if (src) src.focus();
  };

  // ── 결과/보고서 본문 접기(한 화면 미리보기 + 펼쳐보기) ──
  window.lavToggleCollapse = function (targetId, btn) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var open = el.classList.toggle('expanded');
    if (btn) {
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = open ? '접기' : '펼쳐보기';
    }
  };
  function lavInitCollapse(targetId, toggleId) {
    var el = document.getElementById(targetId);
    var btn = document.getElementById(toggleId);
    if (!el || !btn) return;
    el.classList.remove('expanded');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    var lbl = btn.querySelector('span'); if (lbl) lbl.textContent = '펼쳐보기';
    // 레이아웃 반영(2 rAF) 후, 접힌 높이보다 내용이 길 때만 토글 노출
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        btn.hidden = el.scrollHeight <= el.clientHeight + 6;
      });
    });
  }

  window.lavToneChange = function () {
    var formal = document.querySelector('input[name="lavTone"]:checked');
    var isFormal = formal && formal.value === 'formal';
    var basicStyle = currentBasicStyle();
    var isReportBasic = !isFormal && basicStyle === 'report';
    var styleBlock = $('lavBasicStyleBlock');
    if (styleBlock) styleBlock.hidden = !!isFormal;
    var lenBlock = $('lavLenBlock');
    if (lenBlock) lenBlock.hidden = !isFormal;
    // 근거 보강은 고급 피하기(재구성) 전용 — 엔진이 blog 경로 미지원이라 기본 피하기에선 기능·시각 모두 잠금
    var ev = $('lavEvidence');
    if (ev) {
      ev.disabled = !isFormal;
      if (!isFormal && ev.checked) { ev.checked = false; window.lavEvidenceChange(); }
    }
    var evBlock = $('lavEvidenceBlock');
    if (evBlock) evBlock.classList.toggle('ev-off', !isFormal);
    var evHint = $('lavEvidenceHint');
    if (evHint) evHint.hidden = isFormal;
    // ★ 자동 코칭은 블로그 말투/고급에서만 적용. 과제·보고서 말투는 원문 인칭·사실 보존을 위해 끈다.
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
    var acHint = $('lavAutoCoachHint');
    if (acHint) acHint.hidden = true;
    if (isReportBasic) {
      var memoBlock = $('lavMemoBlock');
      if (memoBlock) memoBlock.hidden = true;
      var memoHint = $('lavMemoToggleHint');
      if (memoHint) memoHint.hidden = true;
    }
    // CTA 보조문(예상 시간·비용)을 어투에 맞춰 갱신 — 기본=시간·최소단가 / 고급=길이별 정액
    var ctaMeta = $('lavCtaMeta');
    if (ctaMeta) ctaMeta.textContent = isFormal ? '예상 길이별 200~600크레딧' : (isReportBasic ? '예상 1~3분 · 과제/보고서 말투' : '예상 1~3분 · 블로그 말투');
    if (!isReportBasic) window.lavAutoCoachChange();   // 메모칸 가시성 동기화(자동 ON=숨김 / 자동OFF=노출) + 후보 프리페치
  };

  window.lavBasicStyleChange = function () {
    if (window.lavToneChange) window.lavToneChange();
  };

  window.lavEvidenceChange = function () {
    var on = $('lavEvidence') && $('lavEvidence').checked;
    var note = $('lavEvidenceNote');
    if (note) note.hidden = !on;
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
  function lavStartBtn() { return $('lavConfirmStartBtn'); }
  function lavStartBtnState(loading) {   // 픽 로딩 중엔 시작 잠금(빈 창에서 그냥 넘어가는 것 방지)
    var b = lavStartBtn(); if (!b) return;
    b.disabled = !!loading;
    b.textContent = loading ? '추천 불러오는 중…' : '시작하기';
  }
  // 시작 확인 모달에 추천 픽(입장·경험) 체크박스 렌더 — 자동 코칭 ON이면(기본/고급 둘 다).
  //   ★2026-06-18: 해요체 캐주얼 글(기본 피하기)에서 자동코칭 픽이 안 뜨던 문제 — 'formal 전용' 게이트 제거.
  //   메모 경로(collectMemo→memo)는 blog(runShortJob)·formal 둘 다 전송하므로 픽이 양쪽에 적용된다.
  //   ★★2026-06-18(사장님 지적): 확인창이 먼저 뜨고 픽이 ~9초 뒤 채워져, 그 빈 순간에 사용자가 "코칭 안 되네" 하고
  //   바로 시작을 눌러 픽을 건너뛴다. → 픽 로딩 동안 '시작하기' 버튼을 잠그고(추천 불러오는 중…), 픽이 뜨거나
  //   실패/없음·15초 타임아웃 시 풀어준다. 프리페치(진단단계)가 끝나 있으면 즉시 풀려 체감 지연 거의 없음.
  function renderCoachPicks(s) {
    var wrap = $('lavCoachPicks'), list = $('lavCoachPicksList');
    if (!wrap || !list) { lavStartBtnState(false); return; }
    if (!s.autoCoach) { wrap.hidden = true; lavStartBtnState(false); return; }
    wrap.hidden = false;
    list.innerHTML = '<div class="lav-coach-picks-loading">당신에게 맞는 관점·경험을 찾고 있어요…</div>';
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
    var sum = $('lavConfirmSummary');
    if (sum) {
      var rows = [];
      rows.push(['방식', s.tone === 'formal' ? '고급 휴머나이징 — 전 문서 의미 검증' : '기본 휴머나이징 — 장르 자동 맞춤']);
      if (s.tone === 'blog') rows.push(['문체', s.basicStyle === 'report' ? '과제/보고서 말투' : '블로그 말투']);
      if (s.tone === 'formal') rows.push(['분량', '원문에 가깝게 유지']);
      // 자동 코칭 ON이면 위 추천 픽 섹션이 입력을 대신함 → 메모 행 생략(중복·혼동 방지)
      if (s.tone === 'blog' && s.basicStyle === 'report') rows.push(['추가 메모', '사용 안 함 · 원문 중심']);
      else if (!(s.tone === 'formal' && s.autoCoach)) rows.push(['경험 메모', s.memo ? '입력함 · 글에 자연스럽게 녹여요' : '없음']);
      rows.push(['근거 보강', s.tone === 'formal' ? (s.evidence ? '켬 — 검색 후 검수·승인' : '끔') : '기본 휴머나이징에선 사용 안 함']);
      sum.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
      }).join('');
    }
    // 과금(서버와 동일): 기본 피하기=최소 10크레딧 + 100자당 2크레딧, 재구성=건당 정액.
    var src = $('lavInput');
    var len = src ? src.value.length : 0;
    var credit, time;
    if (s.tone === 'formal') {
      // 길이 구간 정액(서버와 동일): ~1만 200 · ~2만 400 · ~3만 600, 근거 시 +100
      var tier = len <= 10000 ? 0 : (len <= 20000 ? 1 : 2);
      credit = ([200, 400, 600][tier] + (s.evidence ? 100 : 0)) + ' 크레딧';
      time = len <= 10000 ? '5~25분' : (len <= 20000 ? '20~50분' : '40~90분');
    } else {
      credit = shortHumanizeCredit(len) + ' 크레딧';
      time = '약 1~3분';
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
    var idToken = await evGetIdToken();
    fetch(window.apiUrl('/transform/' + jobId + '/approve'), {
      method: 'POST',
      headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approved: ids })
    }).then(function (res) { return res.json(); }).then(function (b) {
      if (b && b.error) throw new Error(b.error);
      if (b && b.job && b.job.status === 'queued') {
        resumeTransformState(jobId, b.job);
        return;
      }
      formalStop = startJobTicker(Math.max(240, Math.min(2700, Math.round(currentBareLen() / 4))), '승인 근거로 재구성 중');
      return pollTransform(jobId, ++pollGen);
    }).catch(function (err) {
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
  // estSec=예상 총 소요(초), initialSec=이미 흐른 시간(재진입 복원용 — 새로고침해도 %가 0부터 다시 안 올라감).
  function startJobTicker(estSec, label, initialSec) {
    var t0 = initialSec || 0;
    var name = label || '문장 다듬는 중';
    var est = Math.max(60, estSec || 300);
    setJobSteps(t0 > est * 0.7 ? 2 : 1);
    var paint = function () {
      if ($('lavStepSlot')) $('lavStepSlot').textContent = name + ' (' + Math.min(99, Math.round(t0 / est * 100)) + '% · 예상 ' + Math.round(est / 60) + '분)';
      if (t0 > est * 0.7) setJobSteps(2);
    };
    paint();
    var timer = setInterval(function () { t0 += 2; paint(); }, 2000);
    return function stop() { clearInterval(timer); };
  }

  function lavQueueWaitText(sec) {
    var s = Math.max(0, Math.round(sec || 0));
    if (s < 60) return '곧 시작';
    return '약 ' + Math.max(1, Math.round(s / 60)) + '분';
  }

  function renderQueuedState(jobId, st) {
    stopFormalTicker();
    setJobSteps(0);
    var ap = $('lavApprove'); if (ap) ap.hidden = true;
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '대기열에서 기다리고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = jobId ? '#' + jobId.slice(0, 6).toUpperCase() : '';
    var pos = st && st.queuePosition ? st.queuePosition : 1;
    var size = st && st.queueSize ? st.queueSize : pos;
    var wait = lavQueueWaitText(st && st.queueEtaSec);
    if ($('lavStepSlot')) $('lavStepSlot').textContent = '대기 ' + pos + '번째' + (size > 1 ? ' / ' + size + '명' : '') + ' · 예상 ' + wait;
  }

  function renderBadges(fr) {
    var wrap = $('lavTrust');
    if (!wrap) return;
    wrap.innerHTML = '';
    function badge(ok, txt) {
      var s = document.createElement('span');
      s.className = 'lav-trust-badge' + (ok ? ' ok' : '');
      s.textContent = txt;
      wrap.appendChild(s);
    }
    var m = (fr && fr.metrics) || {};
    badge(m.novelty === 0, m.novelty === 0 ? '날조 0건' : '날조 의심 ' + m.novelty + '건');
    badge(m.lostFacts === 0, m.lostFacts === 0 ? '원문 사실 보존' : '사실 누락 ' + m.lostFacts + '건');
    badge(m.repetition === 0, m.repetition === 0 ? '반복 없음' : '반복 ' + m.repetition + '건');
    badge(m.judge !== 'fail', m.judge === 'pass' ? '의미 검증 통과' : m.judge === 'fail' ? '의미 검증 실패' : '의미 검증 생략(저위험)');
    badge(true, '국립국어원 규범 기준 검사');   // 서버가 매 변환마다 어문규범·사전 데이터 기반 koreanQuality 게이트를 돌림
    if (m.evidenceUsed > 0) badge(true, '승인 근거 ' + m.evidenceUsed + '건 · 수치·출처 일치');
    if (typeof m.lengthRatio === 'number') badge(true, '분량 ' + Math.round(m.lengthRatio * 100) + '%');
  }

  // ★ short job(2026-06-13): 직접 fetch였던 기본 피하기(blog)·그대로 다듬기(polish)를 /transform job으로 —
  //   새로고침·창닫기 생존 + lavJobRef 재진입(고급 피하기와 동일). 둘 다 크레딧이 드는 작업이라 생존 필수(사장님 지적).
  function runShortJob(mode, s) {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '문장을 다듬고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    show('job');
    armCancelWindow(0);   // 방금 시작 — 30초 취소 창 열기
    var bare = text.replace(/\s/g, '').length;
    formalStop = startJobTicker(Math.max(90, Math.min(1200, bare / 12)), '문장 다듬는 중');
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
        var body = { text: text, mode: mode, memo: (s && s.memo) || '', lang: evDetectLang(text) };
        if (mode === 'blog') body.basicStyle = (s && s.basicStyle === 'report') ? 'report' : 'blog';
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify(body)
        }).then(parseTransformStart);
        if ($('lavJobId')) $('lavJobId').textContent = '#' + r.jobId.slice(0, 6).toUpperCase();
        saveJobRef(r.jobId);
        activeCancel = makeJobCanceller(r.jobId);
        if (r.job && r.job.status === 'queued') {
          resumeTransformState(r.jobId, r.job);
          return;
        }
        await pollTransform(r.jobId, gen);
      } catch (err) {
        await handleTransformStartError(err, mode === 'polish' ? 'choose' : 'reduce');
      }
    })();
  }
  function runBlogEvasion(s) { return runShortJob('blog', s); }

  // 그대로 다듬기(보존형) — 사장님: 바로 실행 말고 확인창부터(과금 있음). 확인 모달 재사용.
  var pendingPolish = false;
  window.lavRunPolish = function () {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    if (!text) { if (src) src.focus(); return; }
    pendingPolish = true;
    var cp = $('lavCoachPicks'); if (cp) cp.hidden = true;   // 다듬기(최소수정)는 코칭 픽 없음 — 모달 재사용 시 직전 잔여 숨김
    lavStartBtnState(false);   // 코칭 잠금이 남아있을 수 있으니 시작 버튼 활성화 보장
    var ttl = document.querySelector('.lav-confirm-title');
    if (ttl) ttl.textContent = '과제 어투로 다듬을까요?';
    var sum = $('lavConfirmSummary');
    if (sum) {
      sum.innerHTML =
        '<li><span>방식</span><b>과제 어투로 다듬기</b></li>' +
        '<li><span>원문 보존</span><b>사실·분량 그대로 (재작성 아님)</b></li>' +
        '<li><span>용도</span><b>어투·완성도 정리 (AI 티 줄이기 아님)</b></li>';
    }
    var subP = $('lavConfirmSub'); if (subP) subP.hidden = true;   // 과제 다듬기는 탐지율과 무관
    var len = src ? src.value.length : 0;   // 글자수 통일: 공백 포함
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = shortHumanizeCredit(len) + ' 크레딧';
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = '약 1~3분';
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
  };

  // ── P3+P4 실연결: 격식 유지 재구성 = POST /transform(job) + 폴링 + 근거 승인 ──────────
  var formalStop = null;   // 진행 ticker 정지 함수
  var activeCancel = null; // 현재 작업 취소 함수(blog=fetch abort, formal=POST /cancel)
  var pollGen = 0;         // 취소·새 작업 시작 시 증가 → 이전 폴링 루프 자연 종료
  var lavBlockedJobId = null;   // 차단 화면이 띄운 job — '보존형으로 받기'(accept-fallback)에 필요
  var lavBlockedFallbackCredit = 0;   // 보존형 받기 단가 — 클릭 전 잔액(window.UC) 사전확인용
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
  function stopFormalTicker() { if (formalStop) { formalStop(); formalStop = null; } }
  function currentBareLen() {
    var src = $('lavInput');
    return (src ? src.value : '').replace(/\s/g, '').length;
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
    if (window.gpToast) window.gpToast('작업을 중단했어요. 크레딧은 차감되지 않았습니다.', { type: 'info' });
    show('reduce');
  };
  // ── P5: jobId 재진입 — 새로고침·재방문 시 진행 중 작업 복원(서버 job은 어차피 계속 돌고 있음) ──
  function saveJobRef(jobId) { try { localStorage.setItem('lavJobRef', JSON.stringify({ jobId: jobId, ts: Date.now() })); } catch (e) { } }
  function clearJobRef() { try { localStorage.removeItem('lavJobRef'); } catch (e) { } }
  function initJobResume() {
    var ref = null;
    try { ref = JSON.parse(localStorage.getItem('lavJobRef') || 'null'); } catch (e) { }
    if (!ref || !ref.jobId || (Date.now() - (ref.ts || 0)) > 6 * 3600 * 1000) { if (ref) clearJobRef(); return; }
    evGetIdToken().then(function (idToken) {
      return fetch(window.apiUrl('/transform/' + ref.jobId), { headers: evAuthHeaders(idToken) });
    }).then(function (r) {
      var httpStatus = r.status;
      return r.json().catch(function () { return null; }).then(function (st) { return { httpStatus: httpStatus, st: st }; });
    }).then(function (o) {
      // 401(토큰 만료): jobRef를 지우지 않는다 — 다음 로드에 재시도해 진행 중 작업을 복원.
      if (o.httpStatus === 401) return;
      var st = o.st;
      if (!st || !st.ok) { clearJobRef(); return; }
      if (resumeTransformState(ref.jobId, st)) return;
      clearJobRef();   // blocked·error는 복원 의미 없음
    }).catch(function () { /* 서버 미접속 — 다음 방문에 재시도 */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initJobResume);
  else initJobResume();

  function parseTransformStart(res) {
    return res.json().catch(function () { return null; }).then(function (b) {
      if (b && b.error) {
        var e = new Error(b.error);
        e.httpStatus = res.status;
        e.activeJobId = b.activeJobId || '';
        e.activeStatus = b.activeStatus || '';
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
    saveJobRef(jobId);
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
    // 서버 estSec·elapsedSec로 진행률 이어서 표시(새로고침해도 0부터 다시 안 올라감)
    formalStop = startJobTicker(st.estSec || (isShort ? 180 : 900), isShort ? '문장 다듬는 중' : '재구성 중', st.elapsedSec || 0);
    pollTransform(jobId, ++pollGen);
    return true;
  }

  async function recoverActiveTransformJob() {
    var idToken = await evGetIdToken(true);
    var res = await fetch(window.apiUrl('/transform/active'), { headers: evAuthHeaders(idToken) });
    if (!res.ok) return false;
    var data = await res.json().catch(function () { return null; });
    var job = data && data.job;
    if (!data || !data.ok || !job || !job.id) return false;
    if (window.gpToast) window.gpToast('진행 중이던 작업으로 다시 들어갑니다.', { type: 'info' });
    return resumeTransformState(job.id, job);
  }

  async function handleTransformStartError(err, fallbackStep) {
    stopFormalTicker();
    if (err && err.httpStatus === 409) {
      try { if (await recoverActiveTransformJob()) return; } catch (e) { /* 기존 안내로 폴백 */ }
    }
    if (err && err.httpStatus === 401) {
      clearJobRef();
      var authMsg = (err && err.message) || '로그인이 필요해요.';
      if (window.gpToast) window.gpToast(authMsg, { type: 'error', title: '로그인 확인 필요' });
      else alert(authMsg);
      if (typeof showScreen === 'function') showScreen('login');
      return;
    }
    var msg = (err && err.message) ? err.message : '처리 중 오류가 발생했어요.';
    // 작업 시작 실패는 차감 전 단계 — "차감 없음" 안심 문구로 결제·환불 문의 감소
    if (!/차감/.test(msg)) msg += '\n\n크레딧은 차감되지 않았어요. (차감은 작업이 완료될 때만 일어나요)';
    alert(msg);
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
        clearJobRef();
        notifyJobIssue(jobId, st.error || '작업을 찾을 수 없어요. 다시 시도해 주세요.');
        if (!window.gpNotify) alert(st.error || '작업을 찾을 수 없어요. (서버가 재시작됐을 수 있어요) 다시 시도해 주세요.');
        show('choose');
        return;
      }
      if (st.status === 'cancelled') { stopFormalTicker(); clearJobRef(); return; }
      if (st.status === 'queued') {
        renderQueuedState(jobId, st);
        continue;
      }
      if (st.status === 'running') {
        var runningShort = st.mode === 'blog' || st.mode === 'polish';
        if (!formalStop) formalStop = startJobTicker(st.estSec || (runningShort ? 180 : 900), runningShort ? '문장 다듬는 중' : '재구성 중', st.elapsedSec || 0);
        continue;
      }
      if (st.status === 'awaiting_approval') {
        stopFormalTicker();
        setJobSteps(2);
        if ($('lavStepSlot')) $('lavStepSlot').textContent = '근거 검수 대기 — 승인한 자료만 인용돼요';
        renderApprovalList(st.candidates || [], jobId);
        var ap = $('lavApprove'); if (ap) ap.hidden = false;
        return;   // 사용자 승인 대기 — submitApproval이 폴링 재개
      }
      if (st.status === 'done') {
        stopFormalTicker();
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
    var label;
    if (st.mode === 'blog') {
      label = '블로그';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics });
    } else if (st.mode === 'polish') {
      label = '다듬기';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics });
    } else if (st.result && st.result.preservationFallback) {
      // 차단→보존형 폴백: 고급 재구성이 게이트에 막혀 원문 보존형으로 처리된 결과.
      label = '보존형';
      renderBadges({ metrics: st.result && st.result.metrics });
    } else {
      label = '고급 휴머나이징';
      renderBadges({ metrics: st.result && st.result.metrics });
    }
    // 보존형 폴백 안내 배너(정직 표기) — 일반 결과에선 항상 숨김으로 리셋
    var lavFbBanner = $('lavFallbackBanner');
    if (lavFbBanner) {
      var isFb = !!(st.result && st.result.preservationFallback);
      lavFbBanner.hidden = !isFb;
      if (isFb && $('lavFallbackMsg')) {
        $('lavFallbackMsg').textContent = st.note || '고급 검증에서 원문 보존 기준을 통과하지 못해, 대신 원문을 최대한 살린 결과를 준비했어요.';
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
    if (doneNote) doneNote.textContent = st.mode === 'polish'
      ? '과제 어투로 다듬었어요. 사실과 분량은 원문 그대로 두고 문장만 정리했어요. (AI 티 줄이기와는 다른 기능이에요)'
      : '검사 결과는 글과 도구에 따라 달라서 수치로 약속하기는 어려워요. 결과가 만족스럽지 않으면 실제 경험이나 구체 사례를 더해 다시 정리해 보세요.';
    renderQualityWarnings(st.result || {});
    if ($('lavDoneBody')) $('lavDoneBody').textContent = (st.result && st.result.outputText) || '';
    lavSaveToLibrary(label, st.result && st.result.outputText, grade ? grade + '등급' : '');
    notifyJobDone(st, label);
  }

  function renderQualityWarnings(result) {
    var wrap = $('lavQualityWarning');
    var list = $('lavQualityWarningList');
    if (!wrap || !list) return;
    list.innerHTML = '';
    var warnings = Array.isArray(result.qualityWarnings) ? result.qualityWarnings : [];
    var needsReview = result.qualityStatus === 'needs_review';
    if (!needsReview && !warnings.length) {
      wrap.hidden = true;
      return;
    }
    var messages = warnings.map(function (item) {
      return item && item.message ? String(item.message) : '';
    }).filter(Boolean).slice(0, 8);
    if (!messages.length) messages.push('자동 품질 점검에서 확인할 항목이 있어요. 제출 전에 원문과 한 번 대조해 주세요.');
    messages.forEach(function (message) {
      var li = document.createElement('li');
      li.textContent = message;
      list.appendChild(li);
    });
    wrap.hidden = false;
  }

  // ── 차단 화면(2026-06-15): 자동 폴백 대신 "왜 막혔나 + 재시도/보존형/취소"를 사용자가 고르게 한다 ──
  function renderBlockOffer(jobId, st) {
    lavBlockedJobId = jobId;
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
        if (title) title.textContent = showLost ? '이 사실·수치가 빠져 차단됐어요' : '이 부분이 추상적이라 자연스럽게 바꾸기 어려워요';
        if (tip) tip.innerHTML = showLost
          ? '사실·수치가 많은 글은 <b>문단을 짧게 나누거나</b>, 해당 부분은 원문 표현을 더 유지해서 다시 도전해 주세요.'
          : '위 내용과 관련된 <b>실제 경험·사례·수치</b>를 경험 메모에 적고 다시 도전하면, 그 부분을 구체적으로 바꿔 더 잘 통과돼요.';
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
    // 보존형으로 받기(+단가). 폴백 불가(polish 등)면 숨김.
    var fbBtn = $('lavBlockedFallback');
    lavBlockedFallbackCredit = offer.fallbackCredit || 0;
    if (fbBtn) {
      fbBtn.hidden = !offer.fallbackOffer;
      if (offer.fallbackOffer) {
        var need = offer.fallbackCredit || 0;
        // 잔액이 단가보다 적으면 버튼에 '충전 필요'를 미리 표시(서버 precheck와 동일 기준 — 클릭 전에 알 수 있게).
        var short = need && window.UP !== 'unlimited' && (window.UC || 0) < need;
        fbBtn.textContent = '원문 보존 다듬기로 받기' + (need ? ' (' + need + ' 크레딧)' : '') + (short ? ' · 충전 필요' : '');
      }
    }
  }

  // 경험 메모 넣고 다시 — 설정 화면으로 돌아가 메모칸에 포커스(원문은 lavInput에 유지 → 재제출 시 새 작업)
  window.lavBlockedRetryMemo = function () {
    show('reduce');
    var memo = $('lavMemoExp');
    if (memo) { try { memo.focus(); } catch (e) { } try { memo.scrollIntoView({ block: 'center' }); } catch (e) { } }
  };
  // 근거 보강 켜고 다시 — 고급(formal)으로 전환 + 근거 토글 ON
  window.lavBlockedRetryEvidence = function () {
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
      var go = window.gpConfirm
        ? window.gpConfirm({ title: '크레딧이 부족해요', message: '원문 보존 다듬기로 받으려면 ' + need + '크레딧이 필요해요. 현재 보유 크레딧은 ' + (window.UC || 0) + '크레딧이에요.', confirmText: '충전하러 가기' })
        : Promise.resolve(confirm('원문 보존 다듬기로 받으려면 ' + need + '크레딧이 필요해요(현재 ' + (window.UC || 0) + '크레딧). 충전 페이지로 이동할까요?'));
      Promise.resolve(go).then(function (ok) { if (ok && window.switchTab) window.switchTab('pricing'); });
      if (window.gpTrack) window.gpTrack('credit_insufficient', { analysis_mode: 'fallback', needed_credits: need, current_credits: window.UC || 0 });
      return;
    }
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '원문 보존형으로 처리하고 있어요';
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
      if (r && !r.ok) {
        // 서버가 막은 경우(잔액 부족 402 등) — 본문의 구체 메시지를 살려 보여준다(일반 실패 문구로 덮지 않음).
        return r.json().catch(function () { return null; }).then(function (b) {
          var err = new Error((b && b.error) || ('처리 요청에 실패했어요. (' + r.status + ')'));
          err.httpStatus = r.status;
          throw err;
        });
      }
      saveJobRef(jid);
      pollTransform(jid, gen);
    }).catch(function (e) {
      var msg = (e && e.message) || '처리 요청에 실패했어요. 다시 시도해 주세요.';
      if (e && e.httpStatus === 401) {
        if (window.gpToast) window.gpToast(msg, { type: 'error', title: '로그인 확인 필요' });
        else alert(msg);
        if (typeof showScreen === 'function') showScreen('login');
        return;
      } else if (e && e.httpStatus === 402) {   // 잔액 부족(주로 사전확인 후 다른 탭에서 소진된 레이스) — 충전 안내
        var go2 = window.gpConfirm
          ? window.gpConfirm({ title: '크레딧이 부족해요', message: msg, confirmText: '충전하러 가기' })
          : Promise.resolve(confirm(msg + '\n충전 페이지로 이동할까요?'));
        Promise.resolve(go2).then(function (ok) { if (ok && window.switchTab) window.switchTab('pricing'); });
      } else if (window.gpToast) {
        window.gpToast(msg, { type: 'error' });
      }
      show('blocked');
    });
  };
  // 취소 — 무과금 종료(차단 job은 그대로 두고 화면만 방법 선택으로)
  window.lavBlockedCancel = function () {
    lavBlockedJobId = null;
    clearJobRef();
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
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '의미를 검증하며 다듬고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    show('job');
    armCancelWindow(0);   // 방금 시작 — 30초 취소 창 열기
    var bare = currentBareLen();
    var estSec = Math.max(240, Math.min(2700, Math.round(bare / 4) + (s.evidence ? 480 : 0)));   // 서버 공식과 동일
    formalStop = startJobTicker(estSec, s.evidence ? '승인할 근거를 찾는 중' : '의미·구조를 검증하는 중');
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
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: evAuthHeaders(idToken, { 'Content-Type': 'application/json' }),   // idToken은 Authorization 헤더로(body 미노출)
          body: JSON.stringify({ text: text, mode: 'formal', evidence: !!s.evidence, memo: s.memo || '', autoCoach: false, lang: evDetectLang(text), length: 'keep' })
        }).then(parseTransformStart);
        if ($('lavJobId')) $('lavJobId').textContent = '#' + r.jobId.slice(0, 6).toUpperCase();
        saveJobRef(r.jobId);
        activeCancel = makeJobCanceller(r.jobId);
        if (r.job && r.job.status === 'queued') {
          resumeTransformState(r.jobId, r.job);
          return;
        }
        await pollTransform(r.jobId, gen);
      } catch (err) {
        await handleTransformStartError(err, 'reduce');
      }
    })();
  }

  window.lavStartJob = function () {
    var polish = pendingPolish;       // 확인창 닫기 전에 캡처(lavCloseConfirm이 플래그를 비움)
    window.lavCloseConfirm();
    if (polish) return runShortJob('polish', null);    // 그대로 다듬기 — 확인 후 시작
    var s = currentSettings();
    if (s.tone === 'blog') return runBlogEvasion(s);   // ★ P2 실연결(블로그 어투)
    return runFormalEvasion(s);                        // ★ P3+P4 실연결(격식 유지 재구성, job+폴링+근거 승인)
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

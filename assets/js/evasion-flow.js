/* 회피 모드 워크스페이스 — P0 정적 목업 (더미 데이터, 백엔드 미연결) */
(function () {
  function $(id) { return document.getElementById(id); }

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
    job: '재구성 중', done: '완료'
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
    if (len < 1200) return { grade: 'B', bands: { polish: '60~85%', blog: '35~50%', restructure: '35~60%' }, title: '추상과 구체가 섞인 글이에요', desc: '일부 문단은 일반론에 가까워요. 회피 모드로 더 사람답게 만들 수 있어요.' };
    return { grade: 'C', bands: { polish: '85%+', blog: '40~55%', restructure: '35~60%' }, title: '추상적 일반론 비중이 높은 글이에요', desc: '구체적 사례·수치가 적어, 그대로 제출하면 AI 탐지 위험이 높습니다. 어떻게 할지 골라주세요.' };
  }

  var lastDiag = null;   // 결과 화면의 예상 밴드 표기에 재사용

  function applyDiag(d) {
    lastDiag = d;
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

  window.lavFlowGo = function (name) { show(name); };

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
      alert('AI 감지를 하려면 최소 100자가 필요해요.');
      if (src) src.focus();
      return;
    }
    if (text.length > (window.LAV_MAX_CHARS || 30000)) {
      alert('한 번에 최대 30,000자까지 감지할 수 있어요.');
      return;
    }
    cameFromReport = false;
    show('analyzing');
    var idToken = null;
    try { if (window.CU && window.CU.getIdToken) idToken = await window.CU.getIdToken(); } catch (e) { /* 비로그인 — 무료 감지는 IP 기준 한도 */ }
    var minWait = new Promise(function (r) { setTimeout(r, 900); });
    try {
      var resP = fetch(window.apiUrl('/detect-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, idToken: idToken })
      });
      var out = await Promise.all([resP, minWait]);
      var d = await out[0].json();
      if (!out[0].ok || !d.ok) {
        window.lavFlowReset();
        alert(d.error || 'AI 감지에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
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
        row.appendChild(chip); row.appendChild(body);
        list.appendChild(row);
      });
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
  };

  window.lavEvidenceChange = function () {
    var on = $('lavEvidence') && $('lavEvidence').checked;
    var note = $('lavEvidenceNote');
    if (note) note.hidden = !on;
  };

  function currentSettings() {
    var tone = document.querySelector('input[name="lavTone"]:checked');
    var len = document.querySelector('input[name="lavLen"]:checked');
    var memo = $('lavMemo');
    var ev = $('lavEvidence');
    return {
      tone: tone ? tone.value : 'blog',
      length: len ? len.value : 'compact',
      memo: memo && memo.value.trim() ? memo.value.trim() : '',
      evidence: !!(ev && ev.checked)
    };
  }

  window.lavOpenConfirm = function () {
    pendingPolish = false;   // 휴머나이징 확인 — 다듬기 플래그 정리
    var ttl = document.querySelector('.lav-confirm-title');
    if (ttl) ttl.textContent = '이 설정으로 시작할까요?';
    var s = currentSettings();
    var sum = $('lavConfirmSummary');
    if (sum) {
      var rows = [];
      rows.push(['방식', s.tone === 'formal' ? '고급 피하기 — 논문·격식체' : '기본 피하기 — 블로그·SNS·과제']);
      if (s.tone === 'formal') rows.push(['분량', s.length === 'keep' ? '분량 유지' : '컴팩트(~60%)']);
      rows.push(['경험 메모', s.memo ? (s.tone === 'blog' ? '입력함' : '준비 중(재구성엔 다음 업데이트)') : '없음']);
      rows.push(['근거 보강', s.tone === 'formal' ? (s.evidence ? '켬 — 검색 후 검수·승인' : '끔') : '기본 피하기에선 사용 안 함']);
      sum.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
      }).join('');
    }
    // 과금(서버와 동일): 블로그=100자당 2크레딧, 재구성=건당 정액(무근거 200·근거 300).
    var src = $('lavInput');
    var len = src ? src.value.length : 0;
    var credit, time;
    if (s.tone === 'formal') {
      // 길이 구간 정액(서버와 동일): ~1만 200 · ~2만 400 · ~3만 600, 근거 시 +100
      var tier = len <= 10000 ? 0 : (len <= 20000 ? 1 : 2);
      credit = ([200, 400, 600][tier] + (s.evidence ? 100 : 0)) + ' 크레딧';
      time = len <= 10000 ? '5~25분' : (len <= 20000 ? '20~50분' : '40~90분');
    } else {
      credit = Math.max(2, Math.ceil(len / 100) * 2) + ' 크레딧';
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
    if ($('lavStepSlot')) $('lavStepSlot').textContent = '승인 ' + ids.length + '건으로 재구성 중';
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
    for (var i = 0; i < 20 && !window.authReady; i++) {
      await new Promise(function (ok) { setTimeout(ok, 100); });
    }
    try { if (window.authReady) await window.authReady; } catch (e) {}
    try {
      // forceRefresh=true → 만료된 토큰을 강제 갱신(긴 작업 폴링 중 401 복구용).
      if (window.CU && window.CU.getIdToken) return await window.CU.getIdToken(!!forceRefresh);
    } catch (e) {}
    return '';
  }

  function evAuthHeaders(idToken, extra) {
    var headers = Object.assign({}, extra || {});
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    return headers;
  }

  // ── P2 실연결: 블로그 어투 회피 = /analyze(engine:floorV2, mode:blog) ──────────
  function callEvasionApi(payload, extCtrl) {
    var ctrl = extCtrl || new AbortController();
    var timedOut = false;
    // 타임아웃은 글 길이 비례(실측: 2.3K자≈2.5분, 9K자≈13분 — API 레이트리밋 구간 포함). 진짜 hang만 차단.
    var bare = (payload.text || '').replace(/\s/g, '').length;
    var timeoutMs = Math.min(20 * 60000, Math.max(6 * 60000, bare * 120));
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs);
    return fetch(window.apiUrl('/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'humanize',
        engine: 'floorV2',
        text: payload.text,
        humanizeMode: payload.humanizeMode || 'blog',
        lang: payload.lang || evDetectLang(payload.text),
        idToken: payload.idToken || '',
        userNotes: payload.userNotes || '',
        billingMode: payload.billingMode || 'credit',
        requestId: payload.requestId || undefined,
        useWebSearch: false
      }),
      signal: ctrl.signal
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (b && b.error) throw new Error(b.error);
        if (!res.ok || !b || !b.ok) throw new Error('처리 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.');
        return b;
      });
    }).catch(function (e) {
      // AbortError 원문("signal is aborted without reason")은 사용자에게 무의미 → 사람 말로.
      if (timedOut || (e && e.name === 'AbortError')) {
        throw new Error('서버 처리가 길어져 요청을 중단했어요. 크레딧은 차감되지 않았어요. 글을 더 짧게 나눠 다시 시도해주세요.');
      }
      throw e;
    }).finally(function () { clearTimeout(timer); });
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
    var bare = text.replace(/\s/g, '').length;
    formalStop = startJobTicker(Math.max(90, Math.min(1200, bare / 12)), '문장 다듬는 중');
    var gen = ++pollGen;
    (async function () {
      var idToken = '';
      try { if (window.CU && window.CU.getIdToken) idToken = await window.CU.getIdToken(); } catch (e) { /* 비로그인 — 서버가 401 안내 */ }
      try {
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, mode: mode, memo: (s && s.memo) || '', lang: evDetectLang(text), idToken: idToken })
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
    var ttl = document.querySelector('.lav-confirm-title');
    if (ttl) ttl.textContent = '과제 어투로 다듬을까요?';
    var sum = $('lavConfirmSummary');
    if (sum) {
      sum.innerHTML =
        '<li><span>방식</span><b>과제 어투로 다듬기</b></li>' +
        '<li><span>원문 보존</span><b>사실·분량 그대로 (재작성 아님)</b></li>' +
        '<li><span>용도</span><b>어투·완성도 정리 (탐지 회피용 아님)</b></li>';
    }
    var subP = $('lavConfirmSub'); if (subP) subP.hidden = true;   // 과제 다듬기는 탐지율과 무관
    var len = src ? src.value.length : 0;   // 글자수 통일: 공백 포함
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = Math.max(1, Math.ceil(len / 100)) + ' 크레딧';
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = '약 1~3분';
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
  };

  // ── P3+P4 실연결: 격식 유지 재구성 = POST /transform(job) + 폴링 + 근거 승인 ──────────
  var formalStop = null;   // 진행 ticker 정지 함수
  var activeCancel = null; // 현재 작업 취소 함수(blog=fetch abort, formal=POST /cancel)
  var pollGen = 0;         // 취소·새 작업 시작 시 증가 → 이전 폴링 루프 자연 종료
  function stopFormalTicker() { if (formalStop) { formalStop(); formalStop = null; } }
  function currentBareLen() {
    var src = $('lavInput');
    return (src ? src.value : '').replace(/\s/g, '').length;
  }
  function notifyJobDone(st, label, score) {
    if (!window.gpNotify || !st || !st.jobId) return;
    window.gpNotify({
      clientId: 'job_done_' + st.jobId,
      type: 'job_done',
      title: '작업 완료',
      message: st.mode === 'polish'
        ? label + ' 결과가 준비됐어요. 보관함에 저장했습니다.'
        : label + ' 결과가 준비됐어요. 예상 탐지율 ' + score + '로 보관함에 저장했습니다.',
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
      if (!res.ok || !b || !b.ok) throw new Error('작업 시작에 실패했어요.');
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
    if (st.status !== 'running' && st.status !== 'queued' && st.status !== 'awaiting_approval') return false;
    saveJobRef(jobId);
    activeCancel = makeJobCanceller(jobId);
    var isShort = st.mode === 'blog' || st.mode === 'polish';
    if ($('lavJobTitle')) $('lavJobTitle').textContent = isShort ? '문장을 다듬고 있어요' : '글을 다시 쓰고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '#' + jobId.slice(0, 6).toUpperCase();
    show('job');
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
        clearJobRef();
        if (st.gateDetail) console.warn('[evasion] 차단 상세:', st.gates, st.gateDetail);
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
    var score, label;
    if (st.mode === 'blog') {
      score = (lastDiag && lastDiag.bands && lastDiag.bands.blog) || '40~55%';
      label = '블로그';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics });
    } else if (st.mode === 'polish') {
      // 과제 어투 다듬기 — 회피가 아니므로 '예상 AI 탐지율'을 표기하지 않는다(오해 방지).
      score = '과제체';
      label = '다듬기';
      renderBadges((st.result && st.result.floorReport) || { metrics: st.result && st.result.metrics });
    } else if (st.result && st.result.preservationFallback) {
      // 차단→보존형 폴백: 고급 재구성이 게이트에 막혀 원문 보존형으로 처리된 결과.
      // 재생성 회피 점수(50~60%대)를 약속하면 거짓 표기가 되므로, 다듬기와 동일하게 정직 표기 + 안내 배너.
      score = (lastDiag && lastDiag.bands && lastDiag.bands.polish) || '—';
      label = '보존형';
      renderBadges({ metrics: st.result && st.result.metrics });
    } else {
      // 예상 밴드(보수 표기): 근거 사용 시 35~60%, 미사용 시 50~60%대
      var mEv = st.result && st.result.metrics && st.result.metrics.evidenceUsed;
      score = mEv > 0 ? '35~60%' : '50~60%대';
      label = '재구성';
      renderBadges({ metrics: st.result && st.result.metrics });
    }
    // 보존형 폴백 안내 배너(정직 표기) — 일반 결과에선 항상 숨김으로 리셋
    var lavFbBanner = $('lavFallbackBanner');
    if (lavFbBanner) {
      var isFb = !!(st.result && st.result.preservationFallback);
      lavFbBanner.hidden = !isFb;
      if (isFb && $('lavFallbackMsg')) {
        $('lavFallbackMsg').textContent = st.note || '고급 변환이 원문 보존 기준을 통과하지 못해, 원문을 최대한 보존하는 방식으로 변환했어요.';
      }
    }
    // 과제 어투 다듬기: '예상 AI 탐지율' 블록 숨김 + 안내 문구 교체(회피 아님)
    var isPolish = st.mode === 'polish';
    var scoreWrap = $('lavDoneScoreWrap');
    if (scoreWrap) scoreWrap.hidden = isPolish;
    var doneNote = $('lavDoneNote');
    if (doneNote) doneNote.textContent = isPolish
      ? 'AI로 쓴 글을 과제체로 다듬었어요. 탐지 회피용이 아니라 어투·완성도 정리이고, 원문의 사실·분량은 그대로 보존했어요.'
      : '예상치예요. 글의 구체성·길이·주제에 따라 탐지율은 달라질 수 있어요. 결과가 만족스럽지 않으면 경험 메모를 더해 다시 돌려보세요.';
    if ($('lavDoneScore')) $('lavDoneScore').textContent = score;
    if ($('lavDoneBody')) $('lavDoneBody').textContent = (st.result && st.result.outputText) || '';
    lavSaveToLibrary(label, st.result && st.result.outputText, score);
    notifyJobDone(st, label, score);
  }

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
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '글을 다시 쓰고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    show('job');
    var bare = currentBareLen();
    var estSec = Math.max(240, Math.min(2700, Math.round(bare / 4) + (s.evidence ? 480 : 0)));   // 서버 공식과 동일
    formalStop = startJobTicker(estSec, s.evidence ? '실제 근거 검색·재구성 중' : '글을 다시 쓰는 중');
    var gen = ++pollGen;
    (async function () {
      var idToken = '';
      try { if (window.CU && window.CU.getIdToken) idToken = await window.CU.getIdToken(); } catch (e) { /* 비로그인 — 서버가 401 안내 */ }
      try {
        var r = await fetch(window.apiUrl('/transform'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, idToken: idToken, evidence: !!s.evidence })
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

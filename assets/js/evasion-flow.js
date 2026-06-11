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
    analyzing: '분석', choose: '방법 선택', reduce: 'AI 티 줄이기 설정',
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
    if (ctx && src) ctx.textContent = '원문 ' + (src.value || '').replace(/\s/g, '').length.toLocaleString() + '자';
    // 분석·결과 화면에선 뒤로 버튼 숨김
    var back = document.querySelector('.lav-flow-back');
    if (back) back.style.visibility = (name === 'reduce' || name === 'job') ? 'visible' : 'hidden';
  }

  // 오프라인 폴백 진단: /diagnose 실패 시 입력 길이로 등급만 흉내(서비스 연속성용).
  function fakeDiagnose(text) {
    var len = (text || '').replace(/\s/g, '').length;
    var bands = { polish: '85%+', blog: '32~41%', restructure: '36~43%' };
    if (len < 400) return { grade: 'A', bands: bands, title: '구체적 정보가 충분한 글이에요', desc: '사례·수치가 풍부해, 다듬기만으로도 자연스럽게 마무리할 수 있어요.' };
    if (len < 1200) return { grade: 'B', bands: bands, title: '추상과 구체가 섞인 글이에요', desc: '일부 문단은 일반론에 가까워요. 회피 모드로 더 사람답게 만들 수 있어요.' };
    return { grade: 'C', bands: bands, title: '추상적 일반론 비중이 높은 글이에요', desc: '구체적 사례·수치가 적어, 그대로 제출하면 AI 탐지 위험이 높습니다. 어떻게 할지 골라주세요.' };
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
    show('analyzing');
    var minWait = new Promise(function (r) { setTimeout(r, 900); });   // 스피너 최소 노출(즉답이면 화면이 깜빡임)
    var req = fetch(window.apiUrl('/diagnose'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
    Promise.all([req, minWait]).then(function (out) {
      var d = out[0];
      applyDiag(d && d.ok ? d : fakeDiagnose(text));
      show('choose');
    });
  };

  window.lavFlowGo = function (name) { show(name); };

  // 뒤로: 설정→선택, 작업→설정
  window.lavFlowBack = function () {
    var step = $('lavFlow') && $('lavFlow').dataset.step;
    if (step === 'reduce') show('choose');
    else if (step === 'job') show('reduce');
    else show('choose');
  };

  window.lavFlowReset = function () {
    exitWorkspace();
    var src = $('lavInput');
    if (src) src.focus();
  };

  window.lavToneChange = function () {
    var formal = document.querySelector('input[name="lavTone"]:checked');
    var isFormal = formal && formal.value === 'formal';
    var lenBlock = $('lavLenBlock');
    if (lenBlock) lenBlock.hidden = !isFormal;
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
    var s = currentSettings();
    var sum = $('lavConfirmSummary');
    if (sum) {
      var rows = [];
      rows.push(['어투', s.tone === 'formal' ? '격식 유지 재구성' : '블로그 말투']);
      if (s.tone === 'formal') rows.push(['분량', s.length === 'keep' ? '분량 유지' : '컴팩트(~60%)']);
      rows.push(['경험 메모', s.memo ? '입력함' : '없음']);
      rows.push(['근거 보강', s.evidence ? '켬 (검수 후 승인)' : '끔']);
      sum.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
      }).join('');
    }
    // 블로그 = 기존 휴머나이즈와 같은 글자수 차감(서버 ceil(글자수/100)). 재구성·근거는 P3·P4 단가 확정 전 안내값.
    var src = $('lavInput');
    var len = src ? src.value.length : 0;
    var blogCredit = Math.max(1, Math.ceil(len / 100));
    var credit = s.tone === 'formal' ? (s.evidence ? '단가 확정 전' : '단가 확정 전') : blogCredit + ' 크레딧';
    var time = s.tone === 'formal' ? (s.evidence ? '10~25분' : '10~25분') : '약 1~3분';
    if ($('lavConfirmCredit')) $('lavConfirmCredit').textContent = credit;
    if ($('lavConfirmTime')) $('lavConfirmTime').textContent = time;
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = false;
  };

  window.lavCloseConfirm = function () {
    var modal = $('lavConfirmModal');
    if (modal) modal.hidden = true;
  };

  // 더미 근거 후보(P0). 실제 P4 RAG가 채움.
  var FAKE_EVIDENCE = [
    { ok: true, grade: 'A', text: '오픈서베이 2024 — 한국 대학생 92.4%가 챗GPT 사용', src: 'opensurvey.co.kr' },
    { ok: true, grade: 'A', text: '성균관대 교육개발센터 2023 설문 — 학습 이해 활용 69.8%', src: 'skku.edu' },
    { ok: true, grade: 'B', text: 'KERIS 2023 실태조사 — 교수자 54.7%가 사고과정 미노출 지적', src: 'keris.or.kr' },
    { ok: true, grade: 'B', text: '스위스 비즈니스스쿨 2025 — AI 의존과 비판적 사고 상관 -0.68', src: 'arxiv.org' },
    { ok: false, grade: 'C', text: '프린스턴 관련 수치 — 출처 불명확, 블로그 재인용 (충돌)', src: 'blog (보류)' }
  ];

  function renderApprovalList() {
    var list = $('lavApproveList');
    if (!list) return;
    list.innerHTML = FAKE_EVIDENCE.map(function (e, i) {
      var checked = e.grade !== 'C' ? 'checked' : '';
      var warn = e.grade === 'C' ? '<span class="warn">⚠ 수치 충돌 — 확인 필요</span>' : '<span>' + e.src + '</span>';
      return '<label class="lav-approve-item">' +
        '<input type="checkbox" ' + checked + ' data-idx="' + i + '">' +
        '<div><b>' + e.text + '</b>' + warn + '</div>' +
        '<span class="lav-approve-grade ' + e.grade.toLowerCase() + '">' + e.grade + '</span>' +
        '</label>';
    }).join('');
  }

  function runJobSequence(withEvidence) {
    show('job');
    var jobId = '#' + (1000 + Math.floor((Date.now ? 0 : 0))).toString(36).toUpperCase();
    // Date.now 회피 — 고정 더미 id (P0)
    if ($('lavJobId')) $('lavJobId').textContent = '#A1B2';
    var steps = $('lavSteps').querySelectorAll('li');
    var slot = $('lavStepSlot');
    var n = 0, total = 7;

    function setStep(active) {
      steps.forEach(function (li, i) {
        li.classList.toggle('done', i < active);
        li.classList.toggle('active', i === active);
      });
    }
    setStep(1);

    var slotTimer = setInterval(function () {
      n++;
      if (slot) slot.textContent = '문단 재작성 ' + Math.min(n, total) + ' / ' + total;
      if (n >= total) {
        clearInterval(slotTimer);
        if (withEvidence) {
          // 검증 전 근거 승인 단계 노출
          setStep(2);
          renderApprovalList();
          var ap = $('lavApprove');
          if (ap) ap.hidden = false;
        } else {
          finishJob();
        }
      }
    }, 420);
  }

  function finishJob() {
    var ap = $('lavApprove');
    if (ap) ap.hidden = true;
    var steps = $('lavSteps').querySelectorAll('li');
    var i = 0;
    var t = setInterval(function () {
      i++;
      steps.forEach(function (li, idx) {
        li.classList.toggle('done', idx < i + 2);
        li.classList.toggle('active', idx === i + 2);
      });
      if (i >= 2) { clearInterval(t); showResult(); }
    }, 700);
  }

  function showResult() {
    var s = currentSettings();
    if ($('lavDoneScore')) $('lavDoneScore').textContent = s.tone === 'formal' ? '38%' : '34%';
    if ($('lavDoneBody')) {
      $('lavDoneBody').textContent = s.tone === 'formal'
        ? '대학 교육의 풍경이 바뀌고 있다. 강의실과 교재로 굴러가던 학습은 이제 인공지능 학습 도구를 빼고 말하기 어렵다. 오픈서베이가 2024년에 조사한 결과를 보면 한국 대학생의 92.4%가 챗GPT를 쓴다고 답했는데, 단순한 유행이라 보기엔 숫자가 묵직하다. 문제는 도구의 유무가 아니라 학생이 그 도구를 어떻게 다루느냐다. (재구성 결과 미리보기 — 실제 엔진 연결 시 전문 표시)'
        : '요즘 대학 다니면서 챗GPT 안 써본 사람 거의 없을걸요. 실제로 오픈서베이 2024 조사에서도 대학생 92.4%가 쓴다고 나왔거든요. 근데 솔직히 도구가 문제가 아니라, 그걸 어떻게 쓰느냐가 진짜 핵심이더라고요. (변환 결과 미리보기 — 실제 엔진 연결 시 전문 표시)';
    }
    show('done');
  }

  // ── P2 실연결: 블로그 어투 회피 = /analyze(engine:floorV2, mode:blog) ──────────
  function callEvasionApi(payload) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 420000);   // 서버 작업 1~4분 — hang만 차단
    return fetch(window.apiUrl('/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'humanize',
        engine: 'floorV2',
        text: payload.text,
        humanizeMode: payload.humanizeMode || 'blog',
        lang: payload.lang || 'ko',
        idToken: payload.idToken || '',
        userNotes: payload.userNotes || '',
        billingMode: payload.billingMode || 'credit',
        useWebSearch: false
      }),
      signal: ctrl.signal
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (b && b.error) throw new Error(b.error);
        if (!res.ok || !b || !b.ok) throw new Error('처리 중 오류가 발생했어요. 크레딧은 차감되지 않았어요.');
        return b;
      });
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
  function startJobTicker(charLen) {
    var t0 = 0;
    setJobSteps(1);
    if ($('lavStepSlot')) $('lavStepSlot').textContent = '문장 다듬는 중';
    var est = Math.max(60, Math.min(240, charLen / 40));   // 대략 추정(초)
    var timer = setInterval(function () {
      t0 += 2;
      if ($('lavStepSlot')) $('lavStepSlot').textContent = '문장 다듬는 중 (' + Math.min(99, Math.round(t0 / est * 100)) + '%)';
      if (t0 > est * 0.7) setJobSteps(2);
    }, 2000);
    return function stop() { clearInterval(timer); };
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
    if (typeof m.lengthRatio === 'number') badge(true, '분량 ' + Math.round(m.lengthRatio * 100) + '%');
  }

  function runBlogEvasion(s) {
    var src = $('lavInput');
    var text = (src ? src.value : '').trim();
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '문장을 다듬고 있어요';
    if ($('lavJobId')) $('lavJobId').textContent = '';
    show('job');
    var stop = startJobTicker(text.replace(/\s/g, '').length);
    (async function () {
      var idToken = '';
      try { if (window.CU && window.CU.getIdToken) idToken = await window.CU.getIdToken(); } catch (e) { /* 비로그인 — 서버가 401 안내 */ }
      try {
        var body = await callEvasionApi({ text: text, humanizeMode: 'blog', idToken: idToken, userNotes: s.memo });
        stop();
        setJobSteps(4);
        if ($('lavDoneScore')) $('lavDoneScore').textContent = (lastDiag && lastDiag.bands && lastDiag.bands.blog) || '32~41%';
        if ($('lavDoneBody')) $('lavDoneBody').textContent = (body.result && body.result.outputText) || '';
        renderBadges(body.evasion && body.evasion.floorReport);
        show('done');
      } catch (err) {
        stop();
        alert(err && err.message ? err.message : '처리 중 오류가 발생했어요.');
        show('reduce');
      }
    })();
  }

  window.lavStartJob = function () {
    window.lavCloseConfirm();
    var s = currentSettings();
    if (s.tone === 'blog') return runBlogEvasion(s);   // ★ P2 실연결(블로그 어투)
    // 격식 유지 재구성은 P3(job 백엔드) 연결 전까지 더미 시연 유지
    if ($('lavJobTitle')) $('lavJobTitle').textContent = '글을 다시 쓰고 있어요';
    runJobSequence(s.evidence);
  };

  window.lavApproveReco = function () { finishJob(); };
  window.lavApprovePick = function () { finishJob(); };

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
})();

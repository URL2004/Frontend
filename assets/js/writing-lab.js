// 글쓰기 랩(2026-08-25) — 장르 맞춤 생성 → 휴머나이징 → 무날조 검수 결합 파이프라인
// 일반 사용자: 생성은 /writing-lab/generate에서 크레딧 차감, 휴머나이징은 기존 /transform 정상 과금·기록.
// 관리자: 양쪽 모두 무과금 실험 경로(adminHumanizeLab) 사용.
(function () {
 'use strict';

 // 서버 /writing-lab/pricing이 단일 출처 — 아래는 로드 실패 시 폴백(서버와 동일 값 유지)
 var FALLBACK = {
  generation: [
   { maxChars: 800, credits: 40 },
   { maxChars: 1500, credits: 50 },
   { maxChars: 3000, credits: 60 }
  ],
  humanize: { perHundredChars: 2, minCredits: 10 },
  genres: {
   resume: { label: '자기소개서', topicLabel: '자기소개서 문항', ctx1Label: '지원 회사', ctx2Label: '지원 직무', documentProfile: 'resume_application', basicStyle: 'report', defaultLength: '600~900자',
    factLabels: { experience: '직접 겪은 일·경험', caseExample: '구체적 사례·예시', numbers: '정확히 아는 수치·출처', thoughts: '내 생각·입장' } },
   review_blog: { label: '블로그·후기', topicLabel: '글 주제', ctx1Label: '게시 플랫폼·독자', ctx2Label: '핵심 키워드', documentProfile: 'review_blog', basicStyle: 'blog', defaultLength: '1,000~1,500자',
    factLabels: { experience: '직접 경험·방문·사용 내역', caseExample: '구체적 정보·팁', numbers: '가격·날짜·수치', thoughts: '내 평가·느낌' } },
   marketing: { label: '상품·서비스 소개', topicLabel: '소개할 상품·서비스와 글의 목적', ctx1Label: '상품·서비스명', ctx2Label: '타깃 고객', documentProfile: 'marketing', basicStyle: 'blog', defaultLength: '600~900자',
    factLabels: { experience: '상품·서비스의 사실(기능·구성)', caseExample: '고객 사례·사용 장면', numbers: '수치·인증·출처', thoughts: '강조하고 싶은 포인트' } },
   general: { label: '일반 글', topicLabel: '글의 주제와 목적', ctx1Label: '글의 용도', ctx2Label: '읽는 사람', documentProfile: 'general', basicStyle: 'report', defaultLength: '700~1,000자',
    factLabels: { experience: '핵심 사실·내용', caseExample: '예시·사례', numbers: '수치·출처', thoughts: '내 관점·결론' } }
  }
 };

 var TOPIC_PLACEHOLDER = {
  resume: '예: 공동의 목표를 위해 다른 사람과 협업하며 갈등을 조정한 경험을 서술해 주세요. (600자 이내)',
  review_blog: '예: 성수동 조용한 카페 방문 후기',
  marketing: '예: 소규모 학원용 출결 관리 앱을 학부모에게 소개하는 글',
  general: '예: 동아리 신입 부원을 위한 활동 안내문'
 };
 var CTX_PLACEHOLDER = {
  resume: ['예: 우아한형제들', '예: 서비스 기획 인턴'],
  review_blog: ['예: 네이버 블로그, 20~30대 독자', '예: 성수동 카페, 조용한 카페'],
  marketing: ['예: 클래스체크 (출결 관리 앱)', '예: 초등 학원 학부모'],
  general: ['예: 동아리 공지', '예: 신입 부원']
 };

 var state = {
  config: null,
  genre: '',
  step: 1,
  factsheet: '',
  form: null,
  pollToken: 0,
  lastFinal: ''
 };

 function el(id) { return document.getElementById(id); }
 function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
   return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
 }
 function cfg() { return state.config || FALLBACK; }
 function genreCfg() { return cfg().genres[state.genre] || cfg().genres.general; }
 function isAdminUser() { return !!(window.isAdmin && window.isAdmin()); }

 async function loadConfig() {
  if (state.config) return;
  try {
   var res = await fetch(window.apiUrl('/writing-lab/pricing'));
   var data = await res.json();
   if (res.ok && data.ok && data.genres) state.config = data;
  } catch (e) { /* 폴백 사용 */ }
 }

 // ── 단계 전환 ──
 window.wlGoStep = function (step) {
  state.step = step;
  document.querySelectorAll('#writingLabContent .gp-wl-step').forEach(function (s) {
   s.hidden = Number(s.dataset.wlStep) !== step;
  });
  [1, 2, 3].forEach(function (n) {
   var dot = el('wlStepDot' + n);
   if (dot) dot.className = n < step ? 'done' : n === step ? 'on' : '';
  });
  window.scrollTo(0, 0);
 };

 window.wlPickGenre = function (genre) {
  state.genre = genre;
  var g = cfg().genres[genre] || FALLBACK.genres[genre] || FALLBACK.genres.general;
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (b) {
   b.classList.toggle('picked', b.dataset.genre === genre);
  });
  var badge = el('wlGenreBadge');
  if (badge) badge.textContent = g.label;
  var rbadge = el('wlResultGenreBadge');
  if (rbadge) rbadge.textContent = g.label;
  var tl = el('wlTopicLabel');
  if (tl) tl.innerHTML = esc(g.topicLabel) + ' <em id="wlTopicCount">0자</em>';
  var topic = el('wlTopic');
  if (topic) topic.placeholder = TOPIC_PLACEHOLDER[genre] || '';
  var c1 = el('wlCtx1Label'); if (c1) c1.textContent = g.ctx1Label + ' (선택)';
  var c2 = el('wlCtx2Label'); if (c2) c2.textContent = g.ctx2Label + ' (선택)';
  var ph = CTX_PLACEHOLDER[genre] || ['', ''];
  if (el('wlCtx1')) el('wlCtx1').placeholder = ph[0];
  if (el('wlCtx2')) el('wlCtx2').placeholder = ph[1];
  var fl = g.factLabels || FALLBACK.genres.general.factLabels;
  if (el('wlFactLabel1')) el('wlFactLabel1').textContent = fl.experience;
  if (el('wlFactLabel2')) el('wlFactLabel2').textContent = fl.caseExample;
  if (el('wlFactLabel3')) el('wlFactLabel3').textContent = fl.numbers;
  if (el('wlFactLabel4')) el('wlFactLabel4').textContent = fl.thoughts;
  var target = el('wlTargetChars');
  if (target) target.placeholder = '기본 ' + (g.defaultLength || '');
  wlUpdateQuote();
  window.wlGoStep(2);
  setTimeout(function () { if (topic) topic.focus(); }, 60);
 };

 window.wlTopicInput = function () {
  var t = el('wlTopic') ? el('wlTopic').value : '';
  var c = el('wlTopicCount');
  if (c) c.textContent = t.length.toLocaleString('ko-KR') + '자';
 };

 // ── 견적 ──
 function generationCredits(target) {
  var tiers = cfg().generation || FALLBACK.generation;
  var t = target || 800;
  for (var i = 0; i < tiers.length; i++) if (t <= tiers[i].maxChars) return tiers[i].credits;
  return tiers[tiers.length - 1].credits;
 }
 function humanizeCredits(target) {
  var h = cfg().humanize || FALLBACK.humanize;
  var t = target || 800;
  return Math.max(h.minCredits, Math.ceil(t / 100) * h.perHundredChars);
 }
 window.wlUpdateQuote = function () {
  var q = el('wlQuote');
  if (!q) return;
  if (isAdminUser()) { q.innerHTML = '관리자 실험 모드 — <b>무과금</b>으로 실행됩니다.'; return; }
  var target = Number(el('wlTargetChars') && el('wlTargetChars').value) || 0;
  var gen = generationCredits(target);
  var skipHumanize = el('wlHumanize') && el('wlHumanize').value === 'skip';
  var hum = skipHumanize ? 0 : humanizeCredits(target);
  var total = gen + hum;
  q.innerHTML = '예상 <b>' + total + '크레딧</b> <small>(생성 ' + gen + (skipHumanize ? '' : ' + 휴머나이징 약 ' + hum) + ')</small>';
 };

 function readForm() {
  return {
   genre: state.genre || 'general',
   topic: (el('wlTopic') ? el('wlTopic').value : '').trim(),
   context1: (el('wlCtx1') ? el('wlCtx1').value : '').trim(),
   context2: (el('wlCtx2') ? el('wlCtx2').value : '').trim(),
   emphasis: (el('wlEmphasis') ? el('wlEmphasis').value : '').trim(),
   tone: el('wlTone') ? el('wlTone').value : '',
   targetChars: Number(el('wlTargetChars') && el('wlTargetChars').value) || 0,
   charLimitMode: el('wlCharMode') ? el('wlCharMode').value : 'with_space',
   humanizeMode: el('wlHumanize') ? el('wlHumanize').value : 'auto',
   memo: {
    experience: (el('wlFact1') ? el('wlFact1').value : '').trim(),
    caseExample: (el('wlFact2') ? el('wlFact2').value : '').trim(),
    numbers: (el('wlFact3') ? el('wlFact3').value : '').trim(),
    thoughts: (el('wlFact4') ? el('wlFact4').value : '').trim()
   }
  };
 }

 function setStatus(id, text, type) {
  var s = el(id);
  if (!s) return;
  s.textContent = text || '';
  s.className = 'gp-wl-status' + (type ? ' ' + type : '');
 }
 function setBusy(busy) {
  var btn = el('wlRunBtn');
  if (btn) { btn.disabled = !!busy; btn.textContent = busy ? '만드는 중...' : '글 만들기'; }
 }
 function setProgress(stage, stateName) {
  // stage: 1 생성, 2 휴머나이징, 3 검수 / stateName: run|done|off|skip
  var li = el('wlProg' + stage);
  if (li) li.className = stateName || '';
 }
 function resetProgress() {
  [1, 2, 3].forEach(function (n) { setProgress(n, ''); });
 }

 // ── 실행 ──
 window.wlRun = async function () {
  if (!window.CU) {
   if (typeof showScreen === 'function') showScreen('login');
   setStatus('wlStatus2', '로그인 후 이용할 수 있어요.', 'error');
   return;
  }
  var form = readForm();
  if (form.topic.length < 5) { setStatus('wlStatus2', (genreCfg().topicLabel || '주제') + '을(를) 5자 이상 입력해 주세요.', 'error'); return; }
  if (!form.memo.experience && !form.memo.caseExample && !form.memo.numbers && !form.memo.thoughts) {
   setStatus('wlStatus2', '사실 카드를 최소 한 칸은 채워 주세요 — 지어내지 않는 글의 재료입니다.', 'error');
   return;
  }
  state.pollToken++;
  var tokenId = state.pollToken;
  state.form = form;
  state.factsheet = '';
  state.lastFinal = '';
  setBusy(true);
  setStatus('wlStatus2', '', '');
  // 결과 화면 초기화
  if (el('wlFinal')) el('wlFinal').value = '';
  if (el('wlDraft')) el('wlDraft').value = '';
  if (el('wlDraftWrap')) el('wlDraftWrap').hidden = true;
  if (el('wlReport')) { el('wlReport').hidden = true; el('wlReport').innerHTML = ''; }
  if (el('wlFollowups')) { el('wlFollowups').hidden = true; el('wlFollowups').innerHTML = ''; }
  if (el('wlFinalCount')) el('wlFinalCount').textContent = '';
  resetProgress();
  window.wlGoStep(3);
  setProgress(1, 'run');
  setStatus('wlStatus3', '사실 카드로 글을 만들고 있어요... (수십 초 걸릴 수 있어요)', 'info');
  try {
   var idToken = await window.CU.getIdToken(true);
   var res = await fetch(window.apiUrl('/writing-lab/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify({
     genre: form.genre, topic: form.topic, context1: form.context1, context2: form.context2,
     emphasis: form.emphasis, tone: form.tone,
     targetChars: form.targetChars || undefined, charLimitMode: form.charLimitMode, memo: form.memo
    })
   });
   var data = await res.json().catch(function () { return {}; });
   if (res.status === 402) {
    window.wlGoStep(2);
    setBusy(false);
    setStatus('wlStatus2', data.error || '크레딧이 부족해요.', 'error');
    if (confirm((data.error || '크레딧이 부족해요.') + '\n충전 페이지로 이동할까요?')) switchTab('pricing');
    return;
   }
   if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || '생성에 실패했습니다.'), { backToInput: true });
   if (tokenId !== state.pollToken) return;
   state.factsheet = data.factsheet || '';
   if (el('wlDraft')) el('wlDraft').value = data.draft || '';
   setProgress(1, 'done');
   renderFollowups(data.followupQuestions);
   var humanizeAllowed = form.humanizeMode !== 'skip';
   if (!humanizeAllowed) {
    finishWithText(data.draft, data.checks, { skippedHumanize: true, billing: data.billing });
    return;
   }
   if (el('wlDraftWrap')) el('wlDraftWrap').hidden = false;
   setProgress(2, 'run');
   setStatus('wlStatus3', '만든 글을 자연스럽게 다듬고 있어요...', 'info');
   var humanizeBody = isAdminUser()
    ? { text: data.draft, mode: 'blog', adminHumanizeLab: true, adminLabProfile: 'gpt_engine', humanizeExperiment: true,
       basicStyle: (data.humanize && data.humanize.basicStyle) || 'blog',
       memo: [form.memo.experience, form.memo.caseExample, form.memo.numbers, form.memo.thoughts].filter(Boolean).join('\n').slice(0, 2000),
       documentProfile: (data.humanize && data.humanize.documentProfile) || '', lang: 'ko', evidence: false, length: 'keep', effectNoticeAccepted: true }
    : { text: data.draft, mode: 'blog',
       basicStyle: (data.humanize && data.humanize.basicStyle) || 'blog',
       memo: [form.memo.experience, form.memo.caseExample, form.memo.numbers, form.memo.thoughts].filter(Boolean).join('\n').slice(0, 2000),
       documentProfile: (data.humanize && data.humanize.documentProfile) || '', lang: 'ko', evidence: false, length: 'keep', effectNoticeAccepted: true };
   var res2 = await fetch(window.apiUrl('/transform'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify(humanizeBody)
   });
   var start = await res2.json().catch(function () { return {}; });
   if (res2.status === 402) {
    // 생성은 됐지만 휴머나이징 크레딧이 부족 — 초안이라도 전달
    finishWithText(data.draft, data.checks, { humanizeFailed: '휴머나이징 크레딧이 부족해 초안까지만 완성했어요.', billing: data.billing });
    return;
   }
   if (!res2.ok || !start.ok) {
    finishWithText(data.draft, data.checks, { humanizeFailed: (start.error || '휴머나이징을 시작하지 못해') + ' 초안까지만 완성했어요.', billing: data.billing });
    return;
   }
   await pollHumanize(start.jobId, tokenId, form, data);
  } catch (e) {
   if (tokenId !== state.pollToken) return;
   setBusy(false);
   if (e && e.backToInput) {
    window.wlGoStep(2);
    setStatus('wlStatus2', e.message || '생성에 실패했습니다.', 'error');
   } else {
    setStatus('wlStatus3', e.message || '작업에 실패했습니다.', 'error');
   }
  }
 };

 async function pollHumanize(jobId, tokenId, form, genData) {
  var idToken = await window.CU.getIdToken(false);
  var deadline = Date.now() + 2 * 3600 * 1000;
  while (Date.now() < deadline && tokenId === state.pollToken) {
   await new Promise(function (r) { setTimeout(r, 3000); });
   var res = await fetch(window.apiUrl('/transform/' + jobId), { headers: { Authorization: 'Bearer ' + idToken } });
   if (res.status === 401) {
    idToken = await window.CU.getIdToken(true);
    res = await fetch(window.apiUrl('/transform/' + jobId), { headers: { Authorization: 'Bearer ' + idToken } });
   }
   var st = await res.json().catch(function () { return {}; });
   if (!res.ok || (st.error && !st.status)) throw new Error(st.error || '작업 상태를 불러오지 못했습니다.');
   if (st.status === 'queued') { setStatus('wlStatus3', '휴머나이징 대기 중이에요 · ' + (st.queuePosition || '-') + '번째', 'info'); continue; }
   if (st.status === 'running') { setStatus('wlStatus3', st.stage || '휴머나이징 중...', 'info'); continue; }
   if (st.status === 'done') {
    var finalText = (st.result && st.result.outputText) || '';
    setProgress(2, 'done');
    await checkAndFinish(finalText || (genData ? genData.draft : ''), form, genData);
    return;
   }
   if (st.status === 'blocked' || st.status === 'error' || st.status === 'cancelled') {
    finishWithText(genData ? genData.draft : '', genData ? genData.checks : null, {
     humanizeFailed: (st.reason || st.error || '휴머나이징이 중단돼') + ' 초안까지만 완성했어요.', billing: genData && genData.billing
    });
    return;
   }
  }
  throw new Error('작업이 예상보다 오래 걸려요. 잠시 후 다시 시도해 주세요.');
 }

 async function checkAndFinish(finalText, form, genData) {
  setProgress(3, 'run');
  setStatus('wlStatus3', '완성본을 검수하고 있어요...', 'info');
  var checks = genData ? genData.checks : null;
  try {
   var idToken = await window.CU.getIdToken(false);
   var res = await fetch(window.apiUrl('/writing-lab/check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify({
     text: finalText, genre: form.genre, topic: form.topic,
     context1: form.context1, context2: form.context2, emphasis: form.emphasis,
     targetChars: form.targetChars || undefined, charLimitMode: form.charLimitMode,
     memo: form.memo, factsheet: state.factsheet || undefined
    })
   });
   var data = await res.json().catch(function () { return {}; });
   if (res.ok && data.ok) checks = data.checks;
  } catch (e) { /* 검수 실패 시 초안 검사 결과로 대체 */ }
  finishWithText(finalText, checks, { billing: genData && genData.billing });
 }

 function finishWithText(text, checks, opts) {
  opts = opts || {};
  state.lastFinal = text || '';
  if (el('wlFinal')) el('wlFinal').value = state.lastFinal;
  if (el('wlFinalCount')) el('wlFinalCount').textContent = state.lastFinal ? state.lastFinal.length.toLocaleString('ko-KR') + '자' : '';
  if (opts.skippedHumanize) { setProgress(2, 'skip'); }
  setProgress(3, checks ? 'done' : 'off');
  renderReport(checks);
  setBusy(false);
  if (opts.humanizeFailed) setStatus('wlStatus3', opts.humanizeFailed, 'warn');
  else setStatus('wlStatus3', '완성됐어요. 검수 결과를 확인하고 복사해 쓰세요.', 'success');
 }

 // ── 렌더링 ──
 function pill(text, cls) { return '<span class="gp-wl-pill' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

 function renderReport(checks) {
  var box = el('wlReport');
  if (!box) return;
  if (!checks) { box.hidden = true; box.innerHTML = ''; return; }
  var c = checks.counts || {};
  var lim = checks.limit || {};
  var nov = checks.experienceNovelty || {};
  var nums = checks.fabricatedNumberCandidates || [];
  var cli = checks.cliches || { total: 0, found: [] };
  var gaps = checks.topicKeywordGaps || checks.questionKeywordGaps || [];
  var pills = [
   pill('공백포함 ' + Number(c.withSpace || 0).toLocaleString('ko-KR') + '자'),
   pill('공백제외 ' + Number(c.noSpace || 0).toLocaleString('ko-KR') + '자'),
   pill('2byte ' + Number(c.byte2 || 0).toLocaleString('ko-KR'))
  ];
  if (lim.applicable) {
   pills.push(lim.pass
    ? pill('분량 ' + lim.target + ' 통과 · ' + Math.round((lim.usageRatio || 0) * 100) + '% 사용', 'ok')
    : pill('분량 ' + lim.target + ' 초과 +' + lim.over, 'bad'));
  }
  pills.push(nov.candidate ? pill('지어낸 경험 의심', 'bad') : pill('지어낸 경험 없음', 'ok'));
  pills.push(nums.length ? pill('근거 없는 수치 ' + nums.length + '개', 'bad') : pill('수치 전부 근거 있음', 'ok'));
  pills.push(cli.total ? pill('상투 표현 ' + cli.total, 'warn') : pill('상투 표현 없음', 'ok'));
  var details = [];
  if (nums.length) details.push('<div><b>근거 없는 수치</b> — 사실 카드에 없는 숫자예요. 직접 확인하고 고쳐 주세요: ' + nums.map(esc).join(', ') + '</div>');
  if (cli.found && cli.found.length) details.push('<div><b>상투 표현</b> — ' + cli.found.map(function (x) { return esc(x.phrase + ' ×' + x.count); }).join(', ') + '</div>');
  if (gaps.length) details.push('<div><b>주제 키워드 미반영 후보</b> — ' + gaps.map(esc).join(', ') + ' <small>(자동 추정이라 정확하지 않을 수 있어요)</small></div>');
  box.innerHTML = '<h3 class="gp-wl-q">검수 결과</h3><div class="gp-wl-pills">' + pills.join('') + '</div>'
   + (details.length ? '<div class="gp-wl-report-detail">' + details.join('') + '</div>' : '');
  box.hidden = false;
 }

 function renderFollowups(list) {
  var box = el('wlFollowups');
  if (!box) return;
  if (!list || !list.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = '<h3 class="gp-wl-q">더 좋은 글을 위해 채우면 좋은 정보</h3><ul>'
   + list.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('')
   + '</ul><p class="gp-wl-hint">답을 사실 카드에 추가하고 "다시 만들기"를 누르면 더 구체적인 글이 나와요.</p>';
  box.hidden = false;
 }

 // ── 결과 액션 ──
 window.wlCopy = async function () {
  var text = state.lastFinal || (el('wlFinal') ? el('wlFinal').value : '');
  if (!text) return;
  await navigator.clipboard.writeText(text);
  if (window.gpToast) window.gpToast('완성된 글을 복사했어요.', { type: 'success', title: '복사 완료' });
  else alert('복사했습니다.');
 };
 window.wlDownload = function () {
  var text = state.lastFinal || (el('wlFinal') ? el('wlFinal').value : '');
  if (!text) return;
  var g = genreCfg();
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '글쓰기랩_' + (g.label || '글') + '_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
 };
 window.wlRunAgain = function () {
  window.wlGoStep(2);
  setStatus('wlStatus2', '내용을 보완한 뒤 다시 실행해 보세요.', 'info');
 };

 // ── 페이지 로드 ──
 window.loadWritingLab = async function () {
  var root = el('writingLabContent');
  if (!root) return;
  root.style.display = 'block';
  window.scrollTo(0, 0);
  var adminBadge = el('wlAdminBadge');
  if (adminBadge) adminBadge.hidden = !isAdminUser();
  await loadConfig();
  if (!state.genre) window.wlGoStep(1);
  wlUpdateQuote();
  var hum = el('wlHumanize');
  if (hum && !hum.dataset.bound) { hum.dataset.bound = '1'; hum.addEventListener('change', window.wlUpdateQuote); }
 };
})();

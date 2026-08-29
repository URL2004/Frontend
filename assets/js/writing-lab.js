// 글쓰기 랩 v2 — 확인 사실 원장 → 작성 가능성 → 구조화 생성 → 기존 휴머나이징 → 제출 전 최종 점검
(function () {
 'use strict';

 var STORAGE_KEY = 'gp_writing_lab_v2_draft';
 var ACTIVE_KEY = 'gp_writing_lab_v2_active';
 var PENDING_KEY = 'gp_writing_lab_v2_pending';
 var SECTION_ORDER = ['essentials', 'details', 'reflection'];
 var STATUS_LABELS = {
  READY: '작성 가능', LIMITED: '짧게 작성 가능', NEEDS_FACTS: '정보 보완 필요',
  POLICY_REVIEW: '정책 검토 필요', POLICY_BLOCKED: '자동 작성 제한'
 };
 var state = {
  config: null,
  genre: '',
  subtype: '',
  sectionIndex: 0,
  step: 1,
  answersByGenre: {},
  subtypeByGenre: {},
  assessment: null,
  assessmentToken: '',
  policy: null,
  form: null,
  candidates: [],
  verificationToken: '',
  safeDraft: '',
  lastFinal: '',
  finalReport: null,
  releasePass: false,
  edited: false,
  busy: false,
  pollToken: 0
 };

 function el(id) { return document.getElementById(id); }
 function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
   return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
 }
 function api(path) { return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path; }
 function isAdminUser() { return !!(window.isAdmin && window.isAdmin()); }
 function genreCfg() { return state.config && state.config.genres ? state.config.genres[state.genre] : null; }
 function answers() {
  if (!state.answersByGenre[state.genre]) state.answersByGenre[state.genre] = {};
  return state.answersByGenre[state.genre];
 }
 function fieldByKey(key) {
  var genre = genreCfg();
  return genre && genre.fields ? genre.fields.find(function (field) { return field.key === key; }) : null;
 }
 function sections() {
  var genre = genreCfg();
  if (!genre) return [];
  return SECTION_ORDER.filter(function (key) {
   return genre.fields.some(function (field) { return field.section === key; });
  });
 }
 function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

 function setStatus(id, message, type) {
  var node = el(id);
  if (!node) return;
  node.textContent = message || '';
  node.className = 'gp-wl-status' + (type ? ' ' + type : '');
 }

 function toast(message, type, title) {
  if (window.gpToast) window.gpToast(message, { type: type || 'success', title: title || '' });
  else setStatus('wlStatus' + state.step, message, type === 'error' ? 'error' : 'success');
 }

 async function authHeaders(fresh) {
  if (!window.CU || typeof window.CU.getIdToken !== 'function') {
   if (typeof window.showScreen === 'function') window.showScreen('login');
   var loginError = new Error('로그인 후 이용할 수 있어요.');
   loginError.code = 'LOGIN_REQUIRED';
   throw loginError;
  }
  var token = await window.CU.getIdToken(!!fresh);
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
 }

 async function request(path, options) {
  options = options || {};
  var response = await fetch(api(path), options);
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok || data.ok === false) {
   var error = new Error(data.error || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
   error.status = response.status;
   error.code = data.code || '';
   error.data = data;
   throw error;
  }
  return data;
 }

 function emitClientEvent(event) {
  if (!event || !window.CU) return;
  (async function () {
   try {
    var headers = await authHeaders(false);
    await fetch(api('/writing-lab/v2/client-event'), {
     method: 'POST', headers: headers, body: JSON.stringify({ event: event, genre: state.genre })
    });
   } catch (error) { /* 운영 지표 실패는 사용자 작업을 방해하지 않는다 */ }
  })();
 }

 async function loadConfig(force) {
  if (state.config && !force) return state.config;
  try {
   var data = await request('/writing-lab/v2/config');
   if (!data.genres || !Object.keys(data.genres).length) throw new Error('글쓰기 설정이 비어 있어요.');
   state.config = data;
   setStatus('wlStatus1', '', '');
   applyRolloutConfig(data.rollout || {});
   if (data.rollout && data.rollout.percent < 100 && data.rollout.enabled !== false) {
    setStatus('wlStatus1', '새 엔진을 단계적으로 여는 중이에요. 현재 계정이 베타 대상이 아니면 작성 확인 단계에서 안내해 드립니다.', 'info');
   }
   return data;
  } catch (error) {
   state.config = null;
   setStatus('wlStatus1', '글쓰기 설정을 불러오지 못했어요. 잠시 후 글 종류를 다시 눌러 주세요.', 'error');
   throw error;
  }
 }

 function applyRolloutConfig(rollout) {
  var disabled = new Set(Array.isArray(rollout.disabledGenres) ? rollout.disabledGenres : []);
  var allDisabled = rollout.enabled === false && !isAdminUser();
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) {
   var blocked = allDisabled || disabled.has(button.dataset.genre);
   button.disabled = blocked;
   button.classList.toggle('disabled', blocked);
   if (blocked) button.setAttribute('aria-label', (button.textContent || '').trim() + ' · 현재 이용 중지');
   else button.removeAttribute('aria-label');
  });
  if (allDisabled) setStatus('wlStatus1', '새 글쓰기 랩은 현재 관리자·베타 검증 중이에요. 출시 비율을 열면 같은 화면에서 바로 이용할 수 있습니다.', 'warn');
 }

 function saveDraft() {
  try {
   sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    genre: state.genre,
    subtypeByGenre: state.subtypeByGenre,
    answersByGenre: state.answersByGenre,
    notes: el('wlNotes') ? el('wlNotes').value : '',
    settings: {
     targetChars: el('wlTargetChars') ? el('wlTargetChars').value : '',
     charLimitMode: el('wlCharMode') ? el('wlCharMode').value : 'with_space',
     tone: el('wlTone') ? el('wlTone').value : '',
     humanizeMode: el('wlHumanize') ? el('wlHumanize').value : 'auto',
     emphasis: el('wlEmphasis') ? el('wlEmphasis').value : ''
    }
   }));
   var note = el('wlAutosaveNote');
   if (note) note.textContent = '이 탭에 임시 저장됐어요.';
  } catch (error) { /* 저장 불가 환경에서는 입력 흐름을 계속 허용 */ }
 }

 function compactGeneration(generation) {
  return {
   ok: true,
   genre: generation.genre,
   subtype: generation.subtype,
   draft: generation.draft,
   checks: generation.checks,
   semantic: generation.semantic,
   release: generation.release,
   usedFacts: generation.usedFacts || [],
   followupQuestions: generation.followupQuestions || [],
   factsheet: generation.factsheet || '',
   humanize: generation.humanize || {},
   billing: generation.billing || {}
  };
 }

 function saveActive(generation, jobId, phase) {
  try {
   sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    version: 1,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    genre: state.genre,
    subtype: state.subtype,
    form: state.form,
    verificationToken: state.verificationToken,
    generation: compactGeneration(generation),
    humanizeJobId: jobId || '',
    phase: phase || 'starting'
   }));
  } catch (error) { /* 복구 저장 실패는 현재 작업을 중단하지 않는다 */ }
 }

 function clearActive() {
  try { sessionStorage.removeItem(ACTIVE_KEY); } catch (error) { /* 무시 */ }
 }

 function newRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'wlv2_' + window.crypto.randomUUID();
  return 'wlv2_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
 }

 function savePending(requestId, shortMode) {
  try {
   sessionStorage.setItem(PENDING_KEY, JSON.stringify({
    version: 1,
    expiresAt: Date.now() + 30 * 60 * 1000,
    requestId: requestId,
    genre: state.genre,
    subtype: state.subtype,
    form: state.form,
    assessmentToken: state.assessmentToken,
    shortMode: !!shortMode
   }));
  } catch (error) { /* 현재 요청은 계속 진행 */ }
 }

 function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch (error) { /* 무시 */ }
 }

 function readPending() {
  try {
   var raw = sessionStorage.getItem(PENDING_KEY);
   if (!raw) return null;
   var value = JSON.parse(raw);
   if (!value || value.version !== 1 || Number(value.expiresAt || 0) < Date.now()) {
    clearPending();
    return null;
   }
   return value;
  } catch (error) {
   clearPending();
   return null;
  }
 }

 function readActive() {
  try {
   var raw = sessionStorage.getItem(ACTIVE_KEY);
   if (!raw) return null;
   var value = JSON.parse(raw);
   if (!value || value.version !== 1 || Number(value.expiresAt || 0) < Date.now()) {
    clearActive();
    return null;
   }
   return value;
  } catch (error) {
   clearActive();
   return null;
  }
 }

 function restoreDraft() {
  try {
   var raw = sessionStorage.getItem(STORAGE_KEY);
   if (!raw) return;
   var saved = JSON.parse(raw);
   state.answersByGenre = saved.answersByGenre && typeof saved.answersByGenre === 'object' ? saved.answersByGenre : {};
   state.subtypeByGenre = saved.subtypeByGenre && typeof saved.subtypeByGenre === 'object' ? saved.subtypeByGenre : {};
   if (el('wlNotes')) el('wlNotes').value = String(saved.notes || '').slice(0, 5000);
   var settings = saved.settings || {};
   if (el('wlTargetChars')) el('wlTargetChars').value = settings.targetChars || '';
   if (el('wlCharMode')) el('wlCharMode').value = settings.charLimitMode || 'with_space';
   if (el('wlTone')) el('wlTone').value = settings.tone || '';
   if (el('wlHumanize')) el('wlHumanize').value = settings.humanizeMode || 'auto';
   if (el('wlEmphasis')) el('wlEmphasis').value = settings.emphasis || '';
   if (saved.genre && state.config && state.config.genres[saved.genre]) {
    document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) {
     button.classList.toggle('picked', button.dataset.genre === saved.genre);
    });
    setStatus('wlStatus1', '이 탭에 저장된 입력이 있어요. 같은 글 종류를 누르면 이어서 작성할 수 있어요.', 'info');
   }
  } catch (error) { /* 손상된 임시 저장은 무시 */ }
 }

 window.wlGoStep = function (step) {
  var next = Math.max(1, Math.min(5, Number(step) || 1));
  if (state.busy && next !== 5) {
   state.pollToken += 1;
   setGenerationBusy(false);
  }
  state.step = next;
  document.querySelectorAll('#writingLabContent .gp-wl-step').forEach(function (section) {
   section.hidden = Number(section.dataset.wlStep) !== next;
  });
  for (var i = 1; i <= 5; i += 1) {
   var dot = el('wlStepDot' + i);
   if (!dot) continue;
   dot.className = i < next ? 'done' : i === next ? 'on' : '';
   if (i === next) dot.setAttribute('aria-current', 'step');
   else dot.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
 };

 function updateBadges() {
  var genre = genreCfg();
  var label = genre ? genre.label : '';
  ['wlGenreBadge', 'wlSettingsGenreBadge', 'wlReadinessGenreBadge', 'wlResultGenreBadge'].forEach(function (id) {
   if (el(id)) el(id).textContent = label;
  });
 }

 window.wlPickGenre = async function (genreKey) {
  if (!state.config) {
   try { await loadConfig(true); } catch (error) { return; }
  }
  if (!state.config.genres[genreKey]) return;
  var rollout = state.config.rollout || {};
  if ((rollout.enabled === false && !isAdminUser()) || (rollout.disabledGenres || []).indexOf(genreKey) !== -1) {
   setStatus('wlStatus1', '이 글 종류는 현재 안전 점검을 위해 잠시 닫혀 있어요.', 'warn');
   return;
  }
  collectVisibleFields();
  state.genre = genreKey;
  state.subtype = state.subtypeByGenre[genreKey] || state.config.genres[genreKey].subtypes[0].value;
  state.subtypeByGenre[genreKey] = state.subtype;
  state.sectionIndex = 0;
  state.assessment = null;
  state.assessmentToken = '';
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) {
   button.classList.toggle('picked', button.dataset.genre === genreKey);
  });
  renderSubtype();
  renderQuestionNav();
  renderFields();
  updateBadges();
  updateQuote();
  saveDraft();
  window.wlGoStep(2);
  setTimeout(function () {
   var first = document.querySelector('#wlDynamicFields input, #wlDynamicFields textarea, #wlDynamicFields select');
   if (first) first.focus();
  }, 50);
 };

 function renderSubtype() {
  var genre = genreCfg();
  var select = el('wlSubtype');
  if (!genre || !select) return;
  select.innerHTML = genre.subtypes.map(function (item) {
   return '<option value="' + esc(item.value) + '"' + (item.value === state.subtype ? ' selected' : '') + '>' + esc(item.label) + '</option>';
  }).join('');
 }

 window.wlSubtypeChanged = function () {
  collectVisibleFields();
  state.subtype = el('wlSubtype') ? el('wlSubtype').value : state.subtype;
  state.subtypeByGenre[state.genre] = state.subtype;
  state.assessment = null;
  state.assessmentToken = '';
  saveDraft();
 };

 function sectionHasAnswer(sectionKey) {
  var genre = genreCfg();
  if (!genre) return false;
  return genre.fields.some(function (field) {
   return field.section === sectionKey && String(answers()[field.key] || '').trim();
  });
 }

 function renderQuestionNav() {
  var genre = genreCfg();
  var nav = el('wlQuestionNav');
  if (!genre || !nav) return;
  var keys = sections();
  nav.innerHTML = keys.map(function (key, index) {
   var meta = genre.sections[key] || { label: key };
   var classes = [];
   if (index === state.sectionIndex) classes.push('on');
   if (sectionHasAnswer(key)) classes.push('done');
   return '<button type="button" class="' + classes.join(' ') + '" data-section-index="' + index + '">' + esc(meta.label) + '</button>';
  }).join('');
  nav.querySelectorAll('button').forEach(function (button) {
   button.addEventListener('click', function () {
    collectVisibleFields();
    state.sectionIndex = Number(button.dataset.sectionIndex) || 0;
    renderQuestionNav();
    renderFields();
   });
  });
 }

 function renderFields() {
  var genre = genreCfg();
  var wrap = el('wlDynamicFields');
  if (!genre || !wrap) return;
  var sectionKeys = sections();
  state.sectionIndex = Math.max(0, Math.min(state.sectionIndex, sectionKeys.length - 1));
  var sectionKey = sectionKeys[state.sectionIndex];
  var meta = genre.sections[sectionKey] || {};
  if (el('wlQuestionSectionTitle')) el('wlQuestionSectionTitle').textContent = meta.label || '';
  if (el('wlQuestionSectionDescription')) el('wlQuestionSectionDescription').textContent = meta.description || '';
  var currentAnswers = answers();
  var fields = genre.fields.filter(function (field) { return field.section === sectionKey; });
  wrap.innerHTML = fields.map(function (field) {
   var value = currentAnswers[field.key] || '';
   var importance = field.importance === 'core' ? '핵심' : field.importance === 'optional' ? '선택' : '추천';
   var wide = field.type === 'textarea' || Number(field.rows || 1) > 1 ? ' wide' : '';
   var control;
   if (field.type === 'select' && Array.isArray(field.options)) {
    control = '<select id="wlField_' + esc(field.key) + '" data-field-key="' + esc(field.key) + '">'
     + field.options.map(function (option) {
      var optionValue = Array.isArray(option) ? option[0] : typeof option === 'string' ? option : option.value;
      var optionLabel = Array.isArray(option) ? option[1] : typeof option === 'string' ? option : option.label;
      return '<option value="' + esc(optionValue) + '"' + (optionValue === value ? ' selected' : '') + '>' + esc(optionLabel) + '</option>';
     }).join('') + '</select>';
   } else if (field.type === 'text') {
    control = '<input id="wlField_' + esc(field.key) + '" data-field-key="' + esc(field.key) + '" type="text" maxlength="' + Number(field.maxLength || 240) + '" value="' + esc(value) + '" placeholder="' + esc(field.placeholder || '') + '">';
   } else {
    control = '<textarea id="wlField_' + esc(field.key) + '" data-field-key="' + esc(field.key) + '" rows="' + Number(field.rows || 3) + '" maxlength="' + Number(field.maxLength || 1200) + '" placeholder="' + esc(field.placeholder || '') + '">' + esc(value) + '</textarea>';
   }
   return '<label class="gp-wl-field' + wide + '"><span>' + esc(field.label) + '<small>' + importance + '</small></span>'
    + control
    + (field.help ? '<small class="gp-wl-help">' + esc(field.help) + '</small>' : '')
    + '<small class="gp-wl-help gp-wl-field-count" data-count-for="' + esc(field.key) + '">' + Array.from(String(value)).length.toLocaleString('ko-KR') + '자</small></label>';
  }).join('');
  wrap.querySelectorAll('[data-field-key]').forEach(function (control) {
   control.addEventListener('input', fieldInputChanged);
   control.addEventListener('change', fieldInputChanged);
  });
  updateQuestionButtons();
 }

 function fieldInputChanged(event) {
  var control = event.currentTarget;
  answers()[control.dataset.fieldKey] = control.value;
  var count = document.querySelector('[data-count-for="' + control.dataset.fieldKey + '"]');
  if (count) count.textContent = Array.from(control.value).length.toLocaleString('ko-KR') + '자';
  state.assessment = null;
  state.assessmentToken = '';
  saveDraft();
  renderQuestionNav();
 }

 function collectVisibleFields() {
  if (!state.genre) return;
  document.querySelectorAll('#wlDynamicFields [data-field-key]').forEach(function (control) {
   answers()[control.dataset.fieldKey] = control.value;
  });
 }

 function updateQuestionButtons() {
  var keys = sections();
  if (el('wlQuestionPrev')) el('wlQuestionPrev').hidden = state.sectionIndex === 0;
  if (el('wlQuestionNext')) el('wlQuestionNext').hidden = state.sectionIndex >= keys.length - 1;
  if (el('wlToSettings')) el('wlToSettings').hidden = state.sectionIndex < keys.length - 1;
 }

 window.wlQuestionMove = function (offset) {
  collectVisibleFields();
  var keys = sections();
  state.sectionIndex = Math.max(0, Math.min(keys.length - 1, state.sectionIndex + Number(offset || 0)));
  renderQuestionNav();
  renderFields();
  window.scrollTo(0, 0);
 };

 window.wlGoSettings = function () {
  collectVisibleFields();
  saveDraft();
  updateQuote();
  window.wlGoStep(3);
 };

 window.wlSettingsChanged = function () {
  state.assessment = null;
  state.assessmentToken = '';
  updateQuote();
  saveDraft();
 };

 function generationCredits(target) {
  var pricing = state.config && state.config.pricing ? state.config.pricing.generation : [];
  var chars = Number(target) || 800;
  for (var i = 0; i < pricing.length; i += 1) if (chars <= pricing[i].maxChars) return pricing[i].credits;
  return pricing.length ? pricing[pricing.length - 1].credits : 0;
 }

 function humanizeCredits(target) {
  var pricing = state.config && state.config.pricing ? state.config.pricing.humanize : null;
  if (!pricing) return 0;
  return Math.max(pricing.minCredits, Math.ceil((Number(target) || 800) / 100) * pricing.perHundredChars);
 }

 function updateQuote(targetOverride) {
  var quote = el('wlQuote');
  if (!quote) return;
  if (isAdminUser()) {
   quote.innerHTML = '관리자 실험 모드 — <b>생성과 휴머나이징 모두 무과금</b>으로 실행됩니다.';
   return;
  }
  var genre = genreCfg();
  var target = Number(targetOverride) || Number(el('wlTargetChars') && el('wlTargetChars').value) || (genre ? genre.defaultTarget : 800);
  var generation = generationCredits(target);
  var useHumanize = !el('wlHumanize') || el('wlHumanize').value !== 'skip';
  var humanize = useHumanize ? humanizeCredits(target) : 0;
  quote.innerHTML = '예상 <b>' + (generation + humanize).toLocaleString('ko-KR') + '크레딧</b> <small>(생성 ' + generation + (useHumanize ? ' + 휴머나이징 약 ' + humanize : '') + ')</small>';
 }

 function readForm() {
  collectVisibleFields();
  return {
   genre: state.genre,
   subtype: state.subtype || (el('wlSubtype') ? el('wlSubtype').value : ''),
   answers: Object.assign({}, answers()),
   targetChars: Number(el('wlTargetChars') && el('wlTargetChars').value) || 0,
   charLimitMode: el('wlCharMode') ? el('wlCharMode').value : 'with_space',
   tone: el('wlTone') ? el('wlTone').value : '',
   humanizeMode: el('wlHumanize') ? el('wlHumanize').value : 'auto',
   emphasis: (el('wlEmphasis') ? el('wlEmphasis').value : '').trim()
  };
 }

 function validateSettings(form) {
  if (!form.genre) return '글 종류를 먼저 선택해 주세요.';
  if (form.targetChars && (form.targetChars < 60 || form.targetChars > 3000)) return '목표 분량은 60자부터 3,000자 사이로 입력해 주세요.';
  return '';
 }

 function setPrepareBusy(busy) {
  var button = el('wlPrepareBtn');
  if (!button) return;
  button.disabled = !!busy;
  button.textContent = busy ? '확인하는 중...' : '작성 가능 여부 확인';
 }

 window.wlPrepare = async function () {
  var form = readForm();
  var invalid = validateSettings(form);
  if (invalid) { setStatus('wlStatus3', invalid, 'error'); return; }
  state.form = form;
  setPrepareBusy(true);
  setStatus('wlStatus3', '입력한 정보와 정책, 가능한 분량을 확인하고 있어요.', 'info');
  try {
   var headers = await authHeaders(true);
   var data = await request('/writing-lab/v2/prepare', { method: 'POST', headers: headers, body: JSON.stringify(form) });
   state.assessment = data.assessment;
   state.assessmentToken = data.assessmentToken || '';
   state.policy = data.policy;
   renderReadiness(data.assessment, data.policy);
   setStatus('wlStatus3', '', '');
   window.wlGoStep(4);
  } catch (error) {
   setStatus('wlStatus3', error.message, 'error');
  } finally {
   setPrepareBusy(false);
  }
 };

 function renderReadiness(assessment, policy) {
  var status = assessment.status || 'NEEDS_FACTS';
  var badge = el('wlReadinessBadge');
  if (badge) {
   badge.textContent = STATUS_LABELS[status] || status;
   badge.className = 'gp-wl-state-badge ' + (status === 'READY' ? 'ready' : status === 'LIMITED' ? 'limited' : status.indexOf('POLICY') === 0 ? (status === 'POLICY_BLOCKED' ? 'blocked' : 'review') : 'blocked');
  }
  if (el('wlReadinessSummary')) el('wlReadinessSummary').textContent = assessment.summary || '';
  if (el('wlReadyFactCount')) el('wlReadyFactCount').textContent = Number(assessment.confirmedFactCount || 0).toLocaleString('ko-KR') + '개';
  var range = assessment.feasibleRange || {};
  if (el('wlReadyRange')) el('wlReadyRange').textContent = Number(range.min || 0).toLocaleString('ko-KR') + '–' + Number(range.max || 0).toLocaleString('ko-KR') + '자 · 추천 ' + Number(range.recommended || 0).toLocaleString('ko-KR') + '자';
  if (el('wlReadyTarget')) el('wlReadyTarget').textContent = Number(assessment.requestedTarget || 0).toLocaleString('ko-KR') + '자';
  var effectiveTarget = status === 'LIMITED' ? Math.min(range.max || 0, range.recommended || 0) : assessment.requestedTarget;
  var creditText = isAdminUser() ? '0크레딧 · 관리자' : estimateCreditText(effectiveTarget);
  if (el('wlReadyCredits')) el('wlReadyCredits').textContent = creditText;
  updateQuote(effectiveTarget);

  var facts = assessment.confirmedFacts || [];
  if (el('wlConfirmedFacts')) el('wlConfirmedFacts').innerHTML = facts.length
   ? facts.map(function (fact) { return '<li><b>' + esc(fact.label) + '</b>' + esc(fact.value) + '</li>'; }).join('')
   : '<li>아직 확인된 정보가 없어요.</li>';
  var missing = assessment.missing || [];
  if (el('wlMissingFacts')) el('wlMissingFacts').innerHTML = missing.length
   ? missing.map(function (item) { return '<li>' + esc(item.label) + '</li>'; }).join('')
   : '<li>핵심 정보가 갖춰졌어요.</li>';

  var policyPanel = el('wlPolicyPanel');
  if (policyPanel) {
   var policyMessages = (policy && policy.issues ? policy.issues.map(function (issue) { return issue.message; }) : []).concat(policy && policy.notices ? policy.notices : []);
   policyPanel.hidden = !policyMessages.length;
   policyPanel.innerHTML = policyMessages.length ? '<strong>별도 정책 검사</strong><ul>' + policyMessages.map(function (message) { return '<li>' + esc(message) + '</li>'; }).join('') + '</ul>' : '';
  }
  var conflictPanel = el('wlConflictPanel');
  var conflicts = assessment.conflicts || [];
  if (conflictPanel) {
   conflictPanel.hidden = !conflicts.length;
   conflictPanel.innerHTML = conflicts.length ? '<strong>먼저 확인할 불일치</strong><ul>' + conflicts.map(function (item) { return '<li>' + esc(item.message) + '</li>'; }).join('') + '</ul>' : '';
  }

  var options = assessment.options || [];
  toggleButton('wlAddFactsBtn', options.indexOf('add_facts') !== -1 || options.indexOf('edit') !== -1);
  toggleButton('wlShortBtn', options.indexOf('write_short') !== -1);
  toggleButton('wlGenerateBtn', options.indexOf('generate') !== -1);
  if (el('wlGenerateBtn')) el('wlGenerateBtn').textContent = '이대로 글 만들기';
  setStatus('wlStatus4', status === 'LIMITED' ? '지금 정보로는 짧은 글만 정확하게 쓸 수 있어요. 정보를 더 넣거나 짧게 쓰기를 선택해 주세요.' : '', status === 'LIMITED' ? 'warn' : '');
 }

 function toggleButton(id, visible) {
  if (el(id)) el(id).hidden = !visible;
 }

 function estimateCreditText(target) {
  var generation = generationCredits(target);
  var useHumanize = state.form && state.form.humanizeMode !== 'skip';
  var humanize = useHumanize ? humanizeCredits(target) : 0;
  return (generation + humanize).toLocaleString('ko-KR') + '크레딧 예상';
 }

 function estimatedCreditsForForm(form, phase) {
  form = form || state.form || {};
  var target = Number(form.targetChars) || 800;
  if (phase === 'humanize') return humanizeCredits(target);
  return generationCredits(target) + (form.humanizeMode === 'skip' ? 0 : humanizeCredits(target));
 }

 async function openWritingCreditPaywall(source, phase, explicitNeeded) {
  if (typeof window.gpOpenCreditCheckout !== 'function') {
   if (typeof window.switchTab === 'function') window.switchTab('pricing');
   return;
  }
  await window.gpOpenCreditCheckout({
   action: 'writing_lab_generate',
   source: source,
   neededCredits: Number(explicitNeeded) || estimatedCreditsForForm(state.form, phase),
   currentCredits: window.UC || 0,
   payload: { phase: phase || 'generate' }
  });
 }

 window.wlExtractNotes = async function () {
  if (!state.genre) { setStatus('wlStatus2', '글 종류를 먼저 선택해 주세요.', 'error'); return; }
  var notes = (el('wlNotes') ? el('wlNotes').value : '').trim();
  if (notes.length < 5) { setStatus('wlStatus2', '메모를 5자 이상 붙여 넣어 주세요.', 'error'); return; }
  var button = el('wlExtractBtn');
  if (button) { button.disabled = true; button.textContent = '후보를 찾는 중...'; }
  setStatus('wlStatus2', '메모에 실제로 적힌 문장만 정보 후보로 찾고 있어요.', 'info');
  try {
   var headers = await authHeaders(false);
   var data = await request('/writing-lab/v2/extract', {
    method: 'POST', headers: headers, body: JSON.stringify({ genre: state.genre, notes: notes })
   });
   state.candidates = data.candidates || [];
   renderCandidates();
   setStatus('wlStatus2', state.candidates.length ? '후보를 찾았어요. 직접 확인한 내용만 “질문에 넣기”를 눌러 주세요.' : '확실한 정보 후보를 찾지 못했어요. 질문 칸에 직접 입력해 주세요.', state.candidates.length ? 'success' : 'warn');
  } catch (error) {
   setStatus('wlStatus2', error.message, 'error');
  } finally {
   if (button) { button.disabled = false; button.textContent = '메모에서 정보 후보 찾기'; }
  }
 };

 function renderCandidates() {
  var box = el('wlCandidateList');
  if (!box) return;
  box.hidden = !state.candidates.length;
  box.innerHTML = state.candidates.map(function (candidate, index) {
   return '<div class="gp-wl-candidate"><span class="gp-wl-state-badge">후보</span><div class="gp-wl-candidate-copy"><b>' + esc(candidate.fieldLabel) + '</b><br>' + esc(candidate.valueLabel || candidate.value) + '<small class="gp-wl-help">메모 근거: “' + esc(candidate.evidence) + '”</small></div><button type="button" class="gp-wl-secondary gp-wl-small" data-candidate-index="' + index + '">질문에 넣기</button></div>';
  }).join('');
  box.querySelectorAll('[data-candidate-index]').forEach(function (button) {
   button.addEventListener('click', function () { applyCandidate(Number(button.dataset.candidateIndex)); });
  });
 }

 function applyCandidate(index) {
  var candidate = state.candidates[index];
  var spec = candidate ? fieldByKey(candidate.fieldKey) : null;
  if (!candidate || !spec) return;
  var existing = String(answers()[spec.key] || '').trim();
  if (!existing) answers()[spec.key] = candidate.value;
  else if (existing.indexOf(candidate.value) === -1) answers()[spec.key] = (existing + '\n' + candidate.value).slice(0, spec.maxLength || 4000);
  candidate.confirmed = true;
  state.assessment = null;
  state.assessmentToken = '';
  var sectionKeys = sections();
  state.sectionIndex = Math.max(0, sectionKeys.indexOf(spec.section));
  renderQuestionNav();
  renderFields();
  renderCandidates();
  saveDraft();
  setStatus('wlStatus2', '“' + spec.label + '” 질문에 넣었어요. 문장을 확인하고 필요하면 수정해 주세요.', 'success');
 }

 function setGenerationBusy(busy) {
  state.busy = !!busy;
  ['wlGenerateBtn', 'wlShortBtn', 'wlAddFactsBtn', 'wlCancelBtn'].forEach(function (id) {
   if (el(id)) el(id).disabled = !!busy;
  });
 }

 function setProgress(stage, value) {
  var node = el('wlProg' + stage);
  if (node) node.className = value || '';
 }

 function resetResult() {
  state.verificationToken = '';
  state.safeDraft = '';
  state.lastFinal = '';
  state.finalReport = null;
  state.releasePass = false;
  state.edited = false;
  if (el('wlFinal')) el('wlFinal').value = '';
  if (el('wlDraft')) el('wlDraft').value = '';
  if (el('wlDraftWrap')) el('wlDraftWrap').hidden = true;
  if (el('wlReport')) { el('wlReport').hidden = true; el('wlReport').innerHTML = ''; }
  if (el('wlEvidence')) { el('wlEvidence').hidden = true; el('wlEvidence').innerHTML = ''; }
  if (el('wlFollowups')) { el('wlFollowups').hidden = true; el('wlFollowups').innerHTML = ''; }
  if (el('wlEditHint')) el('wlEditHint').classList.remove('on');
  if (el('wlFinalCount')) el('wlFinalCount').textContent = '';
  setResultState('확인 중', '');
  for (var i = 1; i <= 4; i += 1) setProgress(i, '');
 }

 window.wlGenerate = async function (shortMode) {
  if (!state.form || !state.assessment) { window.wlGoStep(3); setStatus('wlStatus3', '작성 가능 여부를 다시 확인해 주세요.', 'warn'); return; }
  state.pollToken += 1;
  var runToken = state.pollToken;
  setGenerationBusy(true);
  resetResult();
  window.wlGoStep(5);
  setProgress(1, 'run');
  setStatus('wlStatus5', '확인한 정보로 글의 문장과 근거를 연결하고 있어요. 수십 초 걸릴 수 있어요.', 'info');
  var requestId = newRequestId();
  savePending(requestId, shortMode);
  try {
   var headers = await authHeaders(true);
   var body = Object.assign({}, state.form, { shortMode: !!shortMode, assessmentToken: state.assessmentToken, requestId: requestId });
   var data = await request('/writing-lab/v2/generate', { method: 'POST', headers: headers, body: JSON.stringify(body) });
   if (data.status === 'PROCESSING') data = await pollWritingGeneration(data.jobId || requestId, runToken);
   await continueAfterGeneration(data, headers, runToken);
  } catch (error) {
   if (runToken !== state.pollToken) return;
   if (error.status === 402) {
    setGenerationBusy(false);
    setProgress(1, 'fail');
    setResultState('충전 후 자동 재개', 'blocked');
    setStatus('wlStatus5', '입력 내용과 작성 설정을 보관했어요. 결제가 끝나면 같은 요청을 자동으로 다시 시작합니다.', 'warn');
    await openWritingCreditPaywall('writing_lab_generate_402', 'generate', error.data && (error.data.needed || error.data.cost));
    return;
   }
   if (error.status && error.status < 500) clearPending();
   setProgress(1, 'fail');
   setProgress(2, 'off');
   setProgress(3, 'off');
   setProgress(4, 'off');
   setStatus('wlStatus5', error.message + (error.status && error.status < 500 ? ' 실패한 요청은 생성 한도에 포함되지 않아요.' : ' 연결이 끊겼다면 이 페이지를 다시 열어 작업을 복구할 수 있어요.'), 'error');
   if (error.status === 401) setResultState('로그인 필요', 'blocked');
   else setResultState('생성 실패', 'blocked');
  } finally {
   if (runToken === state.pollToken && !state.safeDraft) setGenerationBusy(false);
  }
 };

 async function continueAfterGeneration(data, headers, runToken) {
   if (runToken !== state.pollToken) return;
   clearPending();
   state.verificationToken = data.verificationToken || '';
   state.safeDraft = data.draft || '';
   if (el('wlDraft')) el('wlDraft').value = state.safeDraft;
   setProgress(1, 'done');
   setProgress(2, 'done');
   renderEvidence(data.usedFacts || []);
   renderFollowups(data.followupQuestions || []);

   if (state.form.humanizeMode === 'skip') {
    setProgress(3, 'skip');
    setProgress(4, 'done');
    finishResult(state.safeDraft, data, { message: '검증된 초안이 완성됐어요. 휴머나이징은 선택에 따라 생략했습니다.', clientEvent: 'HUMANIZE_SKIPPED' });
    return;
   }

   if (el('wlDraftWrap')) el('wlDraftWrap').hidden = false;
   saveActive(data, '', 'starting_humanize');
   setProgress(3, 'run');
   setStatus('wlStatus5', '검증된 초안을 기존 휴머나이징 엔진으로 자연스럽게 다듬고 있어요.', 'info');
   await startHumanize(data, headers, runToken);
 }

 async function pollWritingGeneration(jobId, runToken) {
  var deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline && runToken === state.pollToken) {
   await sleep(2500);
   var headers = await authHeaders(false);
   var data = await request('/writing-lab/v2/jobs/' + encodeURIComponent(jobId), { headers: headers });
   if (data.status === 'READY' && data.draft) return data;
   setStatus('wlStatus5', '서버에서 진행 중인 글쓰기 작업을 이어서 기다리고 있어요.', 'info');
  }
  var timeout = new Error('글 생성 시간이 예상보다 길어졌어요. 잠시 후 페이지를 다시 열면 같은 작업을 복구합니다.');
  timeout.code = 'WRITING_JOB_TIMEOUT';
  throw timeout;
 }

async function startHumanize(generation, headers, runToken) {
  var humanize = generation.humanize || {};
  var generationGenre = generation.genre || (state.form && state.form.genre) || state.genre;
  var transformMode = ['resume', 'general'].indexOf(generationGenre) !== -1 ? 'polish' : 'blog';
  var sourceGuard = '아래 사실 원장의 범위만 사용하세요. 새 사실·행동·순서·수치·평가를 만들지 말고 원래 분량을 유지하세요.';
  var body = {
   text: generation.draft,
   mode: transformMode,
   basicStyle: humanize.basicStyle || 'report',
   memo: (sourceGuard + '\n' + String(generation.factsheet || '')).slice(0, 2000),
   documentProfile: humanize.documentProfile || '',
   lang: 'ko', evidence: false, length: 'keep', effectNoticeAccepted: true
  };
  if (isAdminUser()) {
   body.adminHumanizeLab = true;
   body.adminLabProfile = 'gpt_engine';
   body.humanizeExperiment = true;
  }
  try {
   var start = await request('/transform', { method: 'POST', headers: headers, body: JSON.stringify(body) });
   if (!start.jobId) throw new Error('휴머나이징 작업 번호를 받지 못했어요.');
   saveActive(generation, start.jobId, 'humanizing');
   await pollHumanize(start.jobId, runToken, generation);
  } catch (error) {
   if (runToken !== state.pollToken) return;
   if (error.status === 402) {
    saveActive(generation, '', 'awaiting_credits');
    setGenerationBusy(false);
    setProgress(3, 'fail');
    setResultState('충전 후 자동 재개', 'blocked');
    setStatus('wlStatus5', '검증된 초안은 보관했어요. 결제가 끝나면 휴머나이징부터 자동으로 이어갑니다.', 'warn');
    await openWritingCreditPaywall('writing_lab_humanize_402', 'humanize', error.data && (error.data.needed || error.data.cost));
    return;
   }
   useSafeDraft(generation, '휴머나이징을 완료하지 못해 검증된 초안을 대신 보여드려요. ' + error.message, 3);
  }
 }

 async function pollHumanize(jobId, runToken, generation) {
  var deadline = Date.now() + 2 * 60 * 60 * 1000;
  var headers = await authHeaders(false);
  while (Date.now() < deadline && runToken === state.pollToken) {
   await sleep(3000);
   var response = await fetch(api('/transform/' + encodeURIComponent(jobId)), { headers: headers });
   if (response.status === 401) {
    headers = await authHeaders(true);
    response = await fetch(api('/transform/' + encodeURIComponent(jobId)), { headers: headers });
   }
   var job = await response.json().catch(function () { return {}; });
   if (!response.ok || (job.error && !job.status)) throw new Error(job.error || '휴머나이징 상태를 확인하지 못했어요.');
   if (job.status === 'queued') {
    setStatus('wlStatus5', '휴머나이징 대기 중이에요' + (job.queuePosition ? ' · ' + job.queuePosition + '번째' : '') + '.', 'info');
    continue;
   }
   if (job.status === 'running') {
    setStatus('wlStatus5', job.stage || '문체를 자연스럽게 다듬고 있어요.', 'info');
    continue;
   }
   if (job.status === 'done') {
    var finalText = job.result && job.result.outputText ? job.result.outputText : '';
    if (!finalText.trim()) throw new Error('휴머나이징 결과가 비어 있어요.');
   setProgress(3, 'done');
    saveActive(generation, jobId, 'checking_final');
    await finalCheck(finalText, generation, runToken);
    return;
   }
   if (['blocked', 'error', 'cancelled'].indexOf(job.status) !== -1) {
    useSafeDraft(generation, (job.reason || job.error || '휴머나이징이 중단됐어요.') + ' 검증된 초안을 대신 보여드려요.', 3);
    return;
   }
  }
  if (runToken === state.pollToken) useSafeDraft(generation, '휴머나이징 시간이 초과돼 검증된 초안을 대신 보여드려요.', 3);
 }

async function finalCheck(finalText, generation, runToken) {
  setProgress(4, 'run');
  setStatus('wlStatus5', '다듬어진 글을 같은 사실 원장과 별도 정책 기준으로 확인하고, 필요한 경우 안전하게 복구하고 있어요.', 'info');
  try {
   var headers = await authHeaders(false);
   var report = await request('/writing-lab/v2/finalize', {
    method: 'POST', headers: headers,
    body: JSON.stringify({ text: finalText, verificationToken: state.verificationToken })
   });
   if (runToken !== state.pollToken) return;
   if (!report.release || report.release.pass !== true) {
    useSafeDraft(generation, '휴머나이징 결과가 제출 전 점검 기준을 통과하지 못해 검증된 초안을 대신 보여드려요.', 4, report);
    return;
   }
   var delivery = report.delivery || {};
   var deliveredText = report.text || finalText;
   setProgress(4, 'done');
   if (delivery.source === 'verified_generation_fallback') {
    setProgress(3, 'fail');
    finishResult(deliveredText, report, {
     message: '휴머나이징 결과는 검수 기준을 벗어나 사용하지 않았고, 검증된 초안을 안전하게 복구했어요.',
     warning: true,
     failedReport: report.rejectedReport || report,
     clientEvent: 'HUMANIZE_FALLBACK'
    });
    return;
   }
   finishResult(deliveredText, report, {
    message: delivery.source === 'humanized_repaired'
     ? '휴머나이징 결과를 사실 원장 안에서 자동 수리해 검수 기준을 통과했어요.'
     : '글이 완성됐어요. 근거·수치·분량·정책 검사를 모두 통과했습니다.',
    clientEvent: 'HUMANIZE_READY'
   });
  } catch (error) {
   if (runToken !== state.pollToken) return;
   useSafeDraft(generation, '최종 검사를 완료하지 못해 검증된 초안을 대신 보여드려요. ' + error.message, 4);
  }
 }

 function useSafeDraft(generation, message, failedStage, failedReport) {
  setProgress(failedStage, 'fail');
  if (failedStage === 3) setProgress(4, 'done');
  if (failedStage === 4) setProgress(4, 'fail');
  finishResult(generation.draft, generation, { message: message, warning: true, failedReport: failedReport, clientEvent: 'HUMANIZE_FALLBACK' });
 }

 function finishResult(text, report, options) {
  options = options || {};
  state.lastFinal = String(text || '');
  state.finalReport = report;
  state.releasePass = !!(report && report.release && report.release.pass);
  state.edited = false;
  clearActive();
  emitClientEvent(options.clientEvent);
  if (el('wlFinal')) el('wlFinal').value = state.lastFinal;
  updateFinalCount();
  setResultState(state.releasePass ? (options.warning ? '검증된 초안' : '검수 완료') : '검수 필요', state.releasePass ? 'ready' : 'blocked');
  renderReport(report, options.failedReport);
  setStatus('wlStatus5', options.message || (state.releasePass ? '완성됐어요.' : '검수 기준을 확인해 주세요.'), options.warning ? 'warn' : state.releasePass ? 'success' : 'error');
  setGenerationBusy(false);
 }

 function setResultState(label, className) {
  var badge = el('wlResultState');
  if (!badge) return;
  badge.textContent = label;
  badge.className = 'gp-wl-state-badge' + (className ? ' ' + className : '');
 }

 function updateFinalCount() {
  var text = el('wlFinal') ? el('wlFinal').value : state.lastFinal;
  if (el('wlFinalCount')) el('wlFinalCount').textContent = Array.from(text || '').length.toLocaleString('ko-KR') + '자';
 }

 window.wlFinalEdited = function () {
  state.lastFinal = el('wlFinal') ? el('wlFinal').value : '';
  state.edited = true;
  state.releasePass = false;
  updateFinalCount();
  setResultState('수정본 검수 필요', 'edited');
  if (el('wlEditHint')) el('wlEditHint').classList.add('on');
  setStatus('wlStatus5', '결과를 수정했어요. 복사하거나 저장하기 전에 “수정본 다시 확인”을 눌러 주세요.', 'warn');
 };

 window.wlRecheck = async function () {
  var text = (el('wlFinal') ? el('wlFinal').value : '').trim();
  if (!text) { setStatus('wlStatus5', '확인할 글을 입력해 주세요.', 'error'); return; }
  if (!state.verificationToken) { setStatus('wlStatus5', '검수 기준이 없어요. 입력 화면에서 글을 다시 만들어 주세요.', 'error'); return; }
  setProgress(4, 'run');
  setStatus('wlStatus5', '수정본을 원래 확인 정보와 대조하고 있어요.', 'info');
  try {
   var headers = await authHeaders(false);
   var report = await request('/writing-lab/v2/check', {
    method: 'POST', headers: headers,
    body: JSON.stringify({ text: text, verificationToken: state.verificationToken })
   });
   state.finalReport = report;
   state.releasePass = !!(report.release && report.release.pass);
   state.edited = !state.releasePass;
   state.lastFinal = text;
   setProgress(4, state.releasePass ? 'done' : 'fail');
   setResultState(state.releasePass ? '검수 완료' : '검수 필요', state.releasePass ? 'ready' : 'blocked');
   if (el('wlEditHint')) el('wlEditHint').classList.toggle('on', !state.releasePass);
   renderReport(report);
   setStatus('wlStatus5', state.releasePass ? '수정본이 모든 검수 기준을 통과했어요.' : '수정본이 검수 기준을 통과하지 못했어요. 아래 항목을 확인해 주세요.', state.releasePass ? 'success' : 'error');
  } catch (error) {
   setProgress(4, 'fail');
   state.releasePass = false;
   setResultState('검수 실패', 'blocked');
   setStatus('wlStatus5', error.message, 'error');
  }
 };

 function pill(label, status) {
  return '<span class="gp-wl-pill' + (status ? ' ' + status : '') + '">' + esc(label) + '</span>';
 }

 function renderReport(report, failedReport) {
  var box = el('wlReport');
  if (!box || !report) return;
  var checks = report.checks || {};
  var counts = checks.counts || {};
  var length = checks.length || {};
  var numbers = checks.numbers || {};
  var meta = checks.meta || {};
  var policy = checks.policy || {};
  var cliches = checks.cliches || {};
  var semantic = report.semantic || (report.release && report.release.semantic) || {};
  var release = report.release || {};
  var pills = [
   pill('공백 포함 ' + Number(counts.withSpace || 0).toLocaleString('ko-KR') + '자'),
   pill('공백 제외 ' + Number(counts.noSpace || 0).toLocaleString('ko-KR') + '자'),
   pill('2바이트 ' + Number(counts.byte2 || 0).toLocaleString('ko-KR')),
   length.applicable ? pill(length.pass ? '분량 통과 · ' + Math.round(Number(length.usageRatio || 0) * 100) + '%' : (length.status === 'under' ? '분량 부족 ' + Number(length.under || 0) + '자' : '분량 초과 ' + Number(length.over || 0) + '자'), length.pass ? 'ok' : 'bad') : pill('분량 제한 없음', 'ok'),
   pill(numbers.pass === false ? '근거 없는 수치 있음' : '수치 근거 통과', numbers.pass === false ? 'bad' : 'ok'),
   pill(meta.pass === false ? '정보 부족 설명문 감지' : '메타 문구 없음', meta.pass === false ? 'bad' : 'ok'),
   pill(policy.pass === false ? '정책 표현 확인 필요' : '정책 검사 통과', policy.pass === false ? 'bad' : 'ok'),
   pill(semantic.pass === true ? '사실 의미 일치' : '사실 의미 확인 실패', semantic.pass === true ? 'ok' : 'bad'),
   pill(release.pass === true ? '검수 완료' : '검수 필요', release.pass === true ? 'ok' : 'bad')
  ];
  if (cliches.total) pills.push(pill('상투 표현 ' + cliches.total + '개', 'warn'));
  var details = [];
  if (length.applicable && !length.pass) details.push('<div><b>분량</b> — 목표 ' + Number(length.target || 0).toLocaleString('ko-KR') + '자의 88–100%가 기준이며 현재 ' + Number(length.used || 0).toLocaleString('ko-KR') + '자예요.</div>');
  if (numbers.pass === false) details.push('<div><b>근거 없는 수치</b> — ' + esc((numbers.addedTokens || []).join(', ')) + '</div>');
  if (meta.pass === false) details.push('<div><b>정보 부족 설명문</b> — ' + esc((meta.found || []).join(', ')) + '</div>');
  if (policy.pass === false) details.push('<div><b>정책 위반 후보</b> — ' + esc((policy.violations || []).map(function (item) { return item.phrase || item.code; }).join(', ')) + '</div>');
  if (semantic.pass !== true && semantic.violations && semantic.violations.length) details.push('<div><b>사실 의미 불일치</b> — ' + esc(semantic.violations.map(function (item) { return item.detail || item.span || item.type; }).join(' / ')) + '</div>');
  if (release.reasons && release.reasons.length) details.push('<div><b>검수 필요 사유</b> — ' + esc(release.reasons.map(reasonLabel).join(', ')) + '</div>');
  if (failedReport && failedReport.release && !failedReport.release.pass) details.push('<div><b>참고</b> — 휴머나이징 결과는 ' + esc(failedReport.release.reasons.map(reasonLabel).join(', ')) + ' 때문에 사용하지 않았고, 현재 결과에는 검증된 초안을 표시했어요.</div>');
  box.innerHTML = '<h4>제출 전 최종 점검</h4><div class="gp-wl-pills">' + pills.join('') + '</div>' + (details.length ? '<div class="gp-wl-report-detail">' + details.join('') + '</div>' : '');
  box.hidden = false;
 }

 function reasonLabel(code) {
  var labels = {
   claim_structure: '문장 근거 구조', unsupported_number: '근거 없는 수치', meta_filler: '정보 부족 설명문',
   length_under: '분량 부족', length_over: '분량 초과', length_failed: '분량 검사', policy: '별도 정책', semantic_grounding: '사실 의미 일치'
  };
  return labels[code] || code;
 }

 function renderEvidence(facts) {
  var box = el('wlEvidence');
  if (!box) return;
  box.hidden = !facts.length;
  box.innerHTML = facts.length ? '<h4>이 글에 사용한 확인 정보</h4><ul>' + facts.map(function (fact) {
   return '<li><b>' + esc(fact.label) + '</b> — ' + esc(fact.value) + '</li>';
  }).join('') + '</ul>' : '';
 }

 function renderFollowups(questions) {
  var box = el('wlFollowups');
  if (!box) return;
  box.hidden = !questions.length;
  box.innerHTML = questions.length ? '<h4>다음 글에서 더 알려주면 좋은 내용</h4><ul>' + questions.map(function (question) {
   return '<li>' + esc(question) + '</li>';
  }).join('') + '</ul>' : '';
 }

 function fallbackCopy(text) {
  var area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  var copied = false;
  try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
  area.remove();
  return copied;
 }

 window.wlCopy = async function () {
  var text = el('wlFinal') ? el('wlFinal').value : state.lastFinal;
  if (!text) return;
  if (!state.releasePass) { setStatus('wlStatus5', '최종 점검을 통과한 글만 복사할 수 있어요. “수정본 다시 확인”을 눌러 주세요.', 'warn'); return; }
  var copied = false;
  var usedFallback = false;
  try {
   if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); copied = true; }
  } catch (error) { copied = false; }
  if (!copied) { copied = fallbackCopy(text); usedFallback = copied; }
  if (copied) {
   if (usedFallback) emitClientEvent('CLIPBOARD_FALLBACK');
   toast('완성된 글을 복사했어요.', 'success', '복사 완료');
  } else {
   emitClientEvent('CLIPBOARD_FAILED');
   setStatus('wlStatus5', '자동 복사가 허용되지 않았어요. 결과 영역에서 직접 선택해 복사해 주세요.', 'warn');
  }
 };

 window.wlDownload = function () {
  var text = el('wlFinal') ? el('wlFinal').value : state.lastFinal;
  if (!text) return;
  if (!state.releasePass) { setStatus('wlStatus5', '최종 점검을 통과한 글만 저장할 수 있어요. “수정본 다시 확인”을 눌러 주세요.', 'warn'); return; }
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = '글쓰기랩_' + ((genreCfg() && genreCfg().label) || '글') + '_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(function () { URL.revokeObjectURL(anchor.href); anchor.remove(); }, 500);
 };

 window.wlRunAgain = function () {
  state.pollToken += 1;
  setGenerationBusy(false);
  window.wlGoStep(4);
  setStatus('wlStatus4', '같은 확인 정보로 다시 만들거나, 정보를 더 입력해 보세요.', 'info');
 };

 window.wlClearDraft = function () {
  if (state.busy) { setStatus('wlStatus' + state.step, '진행 중인 작업이 끝난 뒤 입력을 지울 수 있어요.', 'warn'); return; }
  if (!window.confirm('이 탭에 임시 저장된 모든 글쓰기 입력을 지울까요?')) return;
  state.genre = '';
  state.subtype = '';
  state.sectionIndex = 0;
  state.answersByGenre = {};
  state.subtypeByGenre = {};
  state.assessment = null;
  state.assessmentToken = '';
  state.form = null;
  state.candidates = [];
  clearActive();
  clearPending();
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* 무시 */ }
  ['wlNotes', 'wlTargetChars', 'wlEmphasis'].forEach(function (id) { if (el(id)) el(id).value = ''; });
  if (el('wlCharMode')) el('wlCharMode').value = 'with_space';
  if (el('wlTone')) el('wlTone').value = '';
  if (el('wlHumanize')) el('wlHumanize').value = 'auto';
  if (el('wlCandidateList')) { el('wlCandidateList').hidden = true; el('wlCandidateList').innerHTML = ''; }
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) { button.classList.remove('picked'); });
  window.wlGoStep(1);
  setStatus('wlStatus1', '이 탭의 임시 입력을 모두 지웠어요.', 'success');
 };

 function bindStaticInputs() {
  ['wlNotes', 'wlEmphasis'].forEach(function (id) {
   var node = el(id);
   if (node && !node.dataset.wlBound) {
    node.dataset.wlBound = '1';
    node.addEventListener('input', saveDraft);
   }
  });
 }

 window.loadWritingLab = async function () {
  var root = el('writingLabContent');
  if (!root) return;
  root.style.display = 'block';
  window.scrollTo(0, 0);
  if (el('wlAdminBadge')) el('wlAdminBadge').hidden = !isAdminUser();
  bindStaticInputs();
  var recovered = false;
  try {
   await loadConfig(false);
   restoreDraft();
   recovered = await recoverActivePipeline();
   if (!recovered) recovered = await recoverPendingGeneration();
  } catch (error) { /* 상태 영역에 재시도 안내 표시 */ }
  if (!recovered) window.wlGoStep(1);
  updateQuote();
 };

 async function recoverActivePipeline() {
  var active = readActive();
  if (!active || !window.CU || !active.generation || !active.verificationToken) return false;
  if (!state.config || !state.config.genres[active.genre]) { clearActive(); return false; }
  state.genre = active.genre;
  state.subtype = active.subtype || state.config.genres[active.genre].subtypes[0].value;
  state.subtypeByGenre[state.genre] = state.subtype;
  state.form = active.form || null;
  state.verificationToken = active.verificationToken;
  state.safeDraft = active.generation.draft || '';
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) {
   button.classList.toggle('picked', button.dataset.genre === state.genre);
  });
  renderSubtype();
  renderQuestionNav();
  renderFields();
  updateBadges();
  resetResult();
  state.verificationToken = active.verificationToken;
  state.safeDraft = active.generation.draft || '';
  if (el('wlDraft')) el('wlDraft').value = state.safeDraft;
  if (el('wlDraftWrap')) el('wlDraftWrap').hidden = false;
  renderEvidence(active.generation.usedFacts || []);
  renderFollowups(active.generation.followupQuestions || []);
  setProgress(1, 'done');
  setProgress(2, 'done');
  setGenerationBusy(true);
  state.pollToken += 1;
  var runToken = state.pollToken;
  window.wlGoStep(5);
  if (!active.humanizeJobId && active.phase === 'awaiting_credits') {
   setStatus('wlStatus5', '충전된 크레딧으로 보관한 초안의 휴머나이징을 이어가고 있어요.', 'info');
   (async function () {
    try {
     var resumeHeaders = await authHeaders(false);
     await startHumanize(active.generation, resumeHeaders, runToken);
    } catch (error) {
     if (runToken === state.pollToken) useSafeDraft(active.generation, '휴머나이징을 다시 시작하지 못해 검증된 초안을 보여드려요. ' + error.message, 3);
    }
   })();
   return true;
  }
  if (!active.humanizeJobId) {
   useSafeDraft(active.generation, '페이지가 새로고침되어 휴머나이징 작업 번호를 확인할 수 없어요. 검증된 초안을 복구했습니다.', 3);
   return true;
  }
  setProgress(3, 'run');
  setStatus('wlStatus5', '진행 중이던 휴머나이징 작업을 서버 상태에서 복구하고 있어요.', 'info');
  pollHumanize(active.humanizeJobId, runToken, active.generation).catch(function (error) {
   if (runToken !== state.pollToken) return;
   useSafeDraft(active.generation, '진행 중 작업을 복구하지 못해 검증된 초안을 보여드려요. ' + error.message, 3);
  });
  return true;
 }

 async function recoverPendingGeneration() {
  var pending = readPending();
  if (!pending || !window.CU || !state.config || !state.config.genres[pending.genre]) return false;
  state.genre = pending.genre;
  state.subtype = pending.subtype || state.config.genres[pending.genre].subtypes[0].value;
  state.subtypeByGenre[state.genre] = state.subtype;
  state.form = pending.form || null;
  state.assessmentToken = pending.assessmentToken || '';
  document.querySelectorAll('#writingLabContent .gp-wl-genre').forEach(function (button) {
   button.classList.toggle('picked', button.dataset.genre === state.genre);
  });
  renderSubtype();
  renderQuestionNav();
  renderFields();
  updateBadges();
  resetResult();
  setGenerationBusy(true);
  state.pollToken += 1;
  var runToken = state.pollToken;
  window.wlGoStep(5);
  setProgress(1, 'run');
  setStatus('wlStatus5', '페이지를 나가기 전에 시작한 글쓰기 작업을 서버에서 복구하고 있어요.', 'info');
  (async function () {
   try {
    var headers = await authHeaders(false);
    var recoveryBody = Object.assign({}, pending.form || {}, {
     shortMode: pending.shortMode === true,
     assessmentToken: pending.assessmentToken,
     requestId: pending.requestId
    });
    var data = await request('/writing-lab/v2/generate', { method: 'POST', headers: headers, body: JSON.stringify(recoveryBody) });
    if (data.status === 'PROCESSING') data = await pollWritingGeneration(pending.requestId, runToken);
    await continueAfterGeneration(data, headers, runToken);
   } catch (error) {
    if (runToken !== state.pollToken) return;
    if (error.status === 402) {
     setGenerationBusy(false);
     setProgress(1, 'fail');
     setResultState('충전 후 자동 재개', 'blocked');
     setStatus('wlStatus5', '보관한 작성 요청을 확인했어요. 결제가 끝나면 자동으로 다시 시작합니다.', 'warn');
     await openWritingCreditPaywall('writing_lab_recovery_402', 'generate', error.data && (error.data.needed || error.data.cost));
     return;
    }
    if (error.status === 404 || (error.status && error.status < 500)) clearPending();
    setGenerationBusy(false);
    setProgress(1, 'fail');
    setResultState('복구 실패', 'blocked');
    setStatus('wlStatus5', error.message, 'error');
   }
  })();
  return true;
 }

 window.gpResumeWritingLab = function () {
  if (typeof window.openWritingLab === 'function') {
   window.openWritingLab();
   return true;
  }
  if (typeof window.switchTab === 'function') window.switchTab('writingLab');
  if (typeof window.loadWritingLab === 'function') window.loadWritingLab();
  return true;
 };
})();

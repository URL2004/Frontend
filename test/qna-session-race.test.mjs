import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing source slice ${start}`);
  return source.slice(from, to);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const RACE_TEST_TIMEOUT_MS = 5000;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

function element(id) {
  return {
    id,
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    hidden: false,
    disabled: false,
    style: { display: '' },
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelectorAll: () => []
  };
}

function user(uid) {
  return { uid, getIdToken: async () => `token-${uid}` };
}

function docsSnapshot(items) {
  return { forEach: fn => items.forEach(item => fn({ id: item.id, data: () => ({ ...item }) })) };
}

function docSnapshot(data) {
  return { exists: () => Boolean(data), data: () => (data ? { ...data } : undefined) };
}

function jsonResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, headers: { get: () => null } };
}

async function loadQna({ admins = [] } = {}) {
  const [app, sessionSecurity] = await Promise.all([
    read('assets/js/app-module.js'),
    read('assets/js/session-security.js')
  ]);
  const helpers = between(app, 'function bearerJsonHeaders', 'window.formatCouponInput');
  const qna = between(app, '// ===== Q&A =====', '// ===== NOTICE =====');

  const ids = ['qnaListView', 'qnaDetailView', 'questionDetail', 'curQuestionId', 'questionList', 'questionResultStatus',
    'questionPagination', 'questionListTitle', 'qform', 'qtitle', 'qbody', 'qAnon', 'qsubmit', 'answerBody'];
  const nodes = Object.fromEntries(ids.map(id => [id, element(id)]));
  nodes.qnaDetailView.style.display = 'none';
  nodes.qnaListView.style.display = 'block';

  const calls = { getDocs: [], getDoc: [], fetch: [], alerts: [], confirms: [] };
  const queues = { getDocs: [], getDoc: [], fetch: [], confirm: [] };
  const next = (name, fallback) => (queues[name].length ? queues[name].shift() : fallback());

  const window = {
    apiUrl: route => `https://api.invalid${route}`,
    isAdmin: () => Boolean(window.CU && admins.includes(window.CU.uid)),
    getAdminName: () => '운영팀',
    gpConfirm: options => { calls.confirms.push(options); return next('confirm', () => Promise.resolve(true)); }
  };
  const context = {
    window,
    document: { getElementById: id => nodes[id] || null, querySelectorAll: () => [] },
    sessionStorage: storage(),
    localStorage: storage(),
    alert: message => calls.alerts.push(String(message)),
    confirm: () => true,
    prompt: () => null,
    fetch: (url, options) => {
      calls.fetch.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
      return next('fetch', () => Promise.resolve(jsonResponse(200, { ok: true, id: 'created' })));
    },
    db: {},
    collection: (_db, name) => ({ name }),
    where: (field, op, value) => ({ field, op, value }),
    query: (ref, clause) => ({ ...ref, clause }),
    doc: (_db, name, id) => ({ name, id }),
    getDocs: ref => { calls.getDocs.push(ref); return next('getDocs', () => Promise.resolve(docsSnapshot([]))); },
    getDoc: ref => { calls.getDoc.push(ref); return next('getDoc', () => Promise.resolve(docSnapshot(null))); },
    escapeHtml: value => String(value ?? ''),
    jsAttr: value => String(value ?? ''),
    paginateItems: (items, page, size) => ({
      totalItems: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / size)),
      startIndex: 0,
      endIndex: Math.min(items.length, size),
      page: 1,
      items: items.slice(0, size)
    }),
    compactPageNumbers: () => [1],
    Object, String, Boolean, JSON, Number, Promise, Error, Math, Date, Array
  };
  vm.createContext(context);
  vm.runInContext(sessionSecurity, context);
  vm.runInContext(`let CU = null;\nwindow.__setCU = u => { CU = u; window.CU = u; };\n${helpers}\n${qna}\nwindow.__postAuthedJson = postAuthedJson;`, context);

  // 실제 흐름과 같이 세션 소유자 마커를 갱신하고 계정이 바뀌면 session-security 훅이 QNA를 초기화한다.
  const signIn = next => {
    window.gpSessionSecurity.bindUser(next ? next.uid : '');
    window.__setCU(next);
  };
  return { window, nodes, calls, queues, signIn };
}

test('a slow list for the previous account cannot overwrite or fail over the current account list', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  const slowA = deferred();
  qna.queues.getDocs.push(slowA.promise);
  const loadA = qna.window.loadQuestions();

  qna.signIn(user('uid-b'));
  qna.queues.getDocs.push(Promise.resolve(docsSnapshot([{ id: 'qb', authorId: 'uid-b', title: 'B 문의' }])));
  await qna.window.loadQuestions();
  assert.equal(qna.calls.getDocs[1].clause.value, 'uid-b');
  assert.match(qna.nodes.questionList.innerHTML, /B 문의/u);

  slowA.resolve(docsSnapshot([{ id: 'qa', authorId: 'uid-a', title: 'A 비밀 문의' }]));
  await loadA;
  assert.match(qna.nodes.questionList.innerHTML, /B 문의/u);
  assert.doesNotMatch(qna.nodes.questionList.innerHTML, /A 비밀 문의/u);

  const failA = deferred();
  qna.signIn(user('uid-a'));
  qna.queues.getDocs.push(failA.promise);
  const failingLoad = qna.window.loadQuestions();
  qna.signIn(user('uid-b'));
  qna.queues.getDocs.push(Promise.resolve(docsSnapshot([{ id: 'qb', authorId: 'uid-b', title: 'B 문의' }])));
  await qna.window.loadQuestions();
  failA.reject(new Error('Missing or insufficient permissions.'));
  await failingLoad;
  assert.match(qna.nodes.questionList.innerHTML, /B 문의/u);
  assert.notEqual(qna.nodes.questionResultStatus.textContent, '문의 내역을 불러오지 못했어요.');
});

test('a slower earlier detail or a detail finishing after back navigation cannot take over the selection', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  const slowFirst = deferred();
  qna.queues.getDoc.push(slowFirst.promise, Promise.resolve(docSnapshot({ authorId: 'uid-a', title: '두 번째 문의', body: 'second' })));
  const first = qna.window.viewQuestion('q1');
  await qna.window.viewQuestion('q2');
  slowFirst.resolve(docSnapshot({ authorId: 'uid-a', title: '첫 번째 문의', body: 'first' }));
  await first;
  assert.equal(qna.nodes.curQuestionId.value, 'q2');
  assert.match(qna.nodes.questionDetail.innerHTML, /두 번째 문의/u);
  assert.doesNotMatch(qna.nodes.questionDetail.innerHTML, /첫 번째 문의/u);

  const slowThird = deferred();
  qna.queues.getDoc.push(slowThird.promise);
  const third = qna.window.viewQuestion('q3');
  assert.equal(qna.nodes.curQuestionId.value, '', 'the previous selection is cleared while the next detail loads');
  qna.window.backToQList();
  slowThird.resolve(docSnapshot({ authorId: 'uid-a', title: '세 번째 문의', body: 'third' }));
  await third;
  assert.equal(qna.nodes.curQuestionId.value, '');
  assert.equal(qna.nodes.qnaDetailView.style.display, 'none');
  assert.equal(qna.nodes.qnaListView.style.display, 'block');
  assert.doesNotMatch(qna.nodes.questionDetail.innerHTML, /세 번째 문의/u);
});

test('session invalidation clears the open private question, draft and retry request ID', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'uid-a', title: 'A 비밀 제목', body: 'A 비밀 본문' })));
  await qna.window.viewQuestion('qa');
  qna.nodes.qtitle.value = 'A 초안 제목';
  qna.nodes.qbody.value = 'A 초안 본문';
  qna.nodes.qAnon.checked = true;
  qna.nodes.qform.style.display = 'block';
  qna.nodes.qsubmit.dataset.requestId = 'qna_retry_a';
  qna.nodes.qsubmit.dataset.requestFingerprint = '["A"]';
  assert.match(qna.nodes.questionDetail.innerHTML, /A 비밀 본문/u);

  qna.signIn(user('uid-b'));
  assert.equal(qna.nodes.questionDetail.innerHTML, '');
  assert.equal(qna.nodes.curQuestionId.value, '');
  assert.equal(qna.nodes.qnaDetailView.style.display, 'none');
  assert.equal(qna.nodes.qnaListView.style.display, 'block');
  assert.equal(qna.nodes.qtitle.value, '');
  assert.equal(qna.nodes.qbody.value, '');
  assert.equal(qna.nodes.qAnon.checked, false);
  assert.equal(qna.nodes.qsubmit.dataset.requestId, undefined);
  assert.equal(qna.nodes.qsubmit.dataset.requestFingerprint, undefined);

  // 로그아웃(소유자 → guest)도 같은 훅을 탄다.
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'uid-b', title: 'B 제목', body: 'B 본문' })));
  await qna.window.viewQuestion('qb');
  qna.signIn(null);
  assert.equal(qna.nodes.questionDetail.innerHTML, '');
  assert.equal(qna.nodes.qnaDetailView.style.display, 'none');
});

test('a question write whose token resolves after an account switch never reaches the network or the new form', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  const token = deferred();
  qna.signIn({ uid: 'uid-a', getIdToken: () => token.promise });
  qna.nodes.qtitle.value = 'A 제목';
  qna.nodes.qbody.value = 'A 본문';
  const submit = qna.window.submitQuestion();
  assert.equal(qna.nodes.qsubmit.disabled, true);

  qna.signIn(user('uid-b'));
  qna.nodes.qtitle.value = 'B 초안';
  token.resolve('token-a');
  await submit;
  assert.equal(qna.calls.fetch.length, 0);
  assert.deepEqual(qna.calls.alerts, []);
  assert.equal(qna.nodes.qtitle.value, 'B 초안');
  assert.equal(qna.nodes.qsubmit.disabled, false);

  // 응답이 계정 전환 뒤에 도착하는 경우도 이전 계정 결과를 반영하지 않는다.
  const response = deferred();
  qna.queues.fetch.push(response.promise);
  qna.nodes.qbody.value = 'B 본문';
  const submitB = qna.window.submitQuestion();
  await flush();
  assert.equal(qna.calls.fetch.length, 1);
  assert.equal(qna.calls.fetch[0].auth, 'Bearer token-uid-b');
  qna.signIn(user('uid-c'));
  qna.nodes.qtitle.value = 'C 초안';
  response.resolve(jsonResponse(500, { ok: false, error: 'late failure' }));
  await submitB;
  assert.deepEqual(qna.calls.alerts, []);
  assert.equal(qna.nodes.qtitle.value, 'C 초안');
  assert.equal(qna.calls.getDocs.length, 0);
});

test('admin answer writes are fenced across token, confirmation and response boundaries', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin-a'] });
  const token = deferred();
  qna.signIn({ uid: 'admin-a', getIdToken: () => token.promise });
  qna.nodes.answerBody.value = '관리자 답변';
  const answer = qna.window.submitAnswer('q1');
  await qna.window.submitAnswer('q1');
  qna.signIn(user('uid-b'));
  token.resolve('token-admin');
  await answer;
  assert.equal(qna.calls.fetch.length, 0);
  assert.deepEqual(qna.calls.alerts, []);

  qna.signIn(user('admin-a'));
  const confirmed = deferred();
  qna.queues.confirm.push(confirmed.promise);
  const removal = qna.window.delAnswer('q1');
  qna.signIn(user('uid-b'));
  confirmed.resolve(true);
  await removal;
  assert.equal(qna.calls.fetch.length, 0);

  qna.signIn(user('admin-a'));
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'uid-b', title: '문의', body: '본문' })));
  await qna.window.viewQuestion('q1');
  const late = deferred();
  qna.queues.fetch.push(late.promise);
  qna.nodes.answerBody.value = '두 번째 답변';
  const second = qna.window.submitAnswer('q1');
  await qna.window.submitAnswer('q1');
  await flush();
  assert.equal(qna.calls.fetch.length, 1, 'a double answer submit sends one request');
  qna.signIn(user('uid-b'));
  late.resolve(jsonResponse(200, { ok: true }));
  await second;
  assert.equal(qna.calls.getDoc.length, 1, 'the old admin detail is not reloaded for the new account');
  assert.deepEqual(qna.calls.alerts, []);
});

test('question submit rejects a double submit and keeps a draft edited while the request was in flight', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  qna.nodes.qform.style.display = 'block';
  qna.nodes.qtitle.value = '제목';
  qna.nodes.qbody.value = '본문';
  const response = deferred();
  qna.queues.fetch.push(response.promise);
  const first = qna.window.submitQuestion();
  await qna.window.submitQuestion();
  await flush();
  assert.equal(qna.calls.fetch.length, 1);
  const requestId = qna.calls.fetch[0].body.requestId;
  assert.match(requestId, /^qna_/u);

  qna.nodes.qbody.value = '본문 그리고 추가 내용';
  response.resolve(jsonResponse(200, { ok: true, id: 'q-new' }));
  await first;
  assert.equal(qna.nodes.qtitle.value, '제목');
  assert.equal(qna.nodes.qbody.value, '본문 그리고 추가 내용');
  assert.equal(qna.nodes.qform.style.display, 'block');
  assert.equal(qna.nodes.qsubmit.dataset.requestId, undefined, 'the committed request ID is not reused for the edited draft');
  assert.equal(qna.nodes.qsubmit.disabled, false);

  await qna.window.submitQuestion();
  assert.notEqual(qna.calls.fetch[1].body.requestId, requestId);
  assert.equal(qna.nodes.qtitle.value, '');
  assert.equal(qna.nodes.qbody.value, '');
  assert.equal(qna.nodes.qform.style.display, 'none');
});

test('question delete rejects a double delete and treats QNA_NOT_FOUND as already deleted', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'uid-a', title: '문의', body: '본문' })));
  await qna.window.viewQuestion('q1');
  const confirmed = deferred();
  qna.queues.confirm.push(confirmed.promise);
  qna.queues.fetch.push(Promise.resolve(jsonResponse(404, { ok: false, code: 'QNA_NOT_FOUND', error: '문의를 찾을 수 없어요.' })));
  const removal = qna.window.delQuestion('q1');
  await qna.window.delQuestion('q1');
  assert.equal(qna.calls.confirms.length, 1);
  confirmed.resolve(true);
  await removal;
  await flush();
  assert.equal(qna.calls.fetch.length, 1);
  assert.deepEqual(qna.calls.alerts, []);
  assert.equal(qna.nodes.qnaDetailView.style.display, 'none');
  assert.equal(qna.nodes.curQuestionId.value, '');
  assert.equal(qna.calls.getDocs.length, 1, 'the list is refreshed after an already-gone question');

  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'uid-a', title: '문의', body: '본문' })));
  await qna.window.viewQuestion('q2');
  qna.queues.fetch.push(Promise.resolve(jsonResponse(500, { ok: false, code: 'INTERNAL', error: '서버 오류' })));
  await qna.window.delQuestion('q2');
  assert.deepEqual(qna.calls.alerts, ['삭제 실패: 서버 오류']);
  assert.equal(qna.nodes.curQuestionId.value, 'q2', 'a real failure keeps the detail open');

  // 삭제 확인 대화상자가 열린 동안 계정이 바뀌면 요청하지 않는다.
  const pendingConfirm = deferred();
  qna.queues.confirm.push(pendingConfirm.promise);
  const stale = qna.window.delQuestion('q2');
  qna.signIn(user('uid-b'));
  pendingConfirm.resolve(true);
  await stale;
  assert.equal(qna.calls.fetch.length, 2);
});

test('postAuthedJson keeps its three-argument behaviour for other callers', { timeout: RACE_TEST_TIMEOUT_MS }, async () => {
  const qna = await loadQna();
  qna.signIn(user('uid-a'));
  const data = await qna.window.__postAuthedJson('/history/backup', { requestId: 'r1' });
  assert.equal(data.ok, true);
  assert.equal(qna.calls.fetch[0].auth, 'Bearer token-uid-a');
  qna.queues.fetch.push(Promise.reject(new TypeError('offline')));
  await assert.rejects(qna.window.__postAuthedJson('/history/backup', {}), error => error.code === 'NETWORK_ERROR');
});

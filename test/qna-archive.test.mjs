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

const TIMEOUT_MS = 5000;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

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
    id, value: '', checked: false, innerHTML: '', textContent: '', hidden: false, disabled: false,
    style: { display: '' }, dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelectorAll: () => []
  };
}

const user = uid => ({ uid, getIdToken: async () => `token-${uid}` });
const timestamp = iso => ({ toDate: () => new Date(iso) });
const docsSnapshot = items => ({ forEach: fn => items.forEach(item => fn({ id: item.id, data: () => ({ ...item }) })) });
const docSnapshot = data => ({ exists: () => Boolean(data), data: () => (data ? { ...data } : undefined) });
const jsonResponse = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data, headers: { get: () => null } });

function summary(id, extra = {}) {
  return {
    id, title: `삭제 문의 ${id}`, authorId: 'uid-u', authorName: '사용자', isAnon: false, status: 'deleted',
    previousStatus: 'pending', createdAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-10T00:00:00.000Z',
    deletedBy: 'uid-u', deletedByRole: 'author', originalContentComplete: true, ...extra
  };
}

async function loadQna({ admins = [] } = {}) {
  const [app, sessionSecurity] = await Promise.all([read('assets/js/app-module.js'), read('assets/js/session-security.js')]);
  const helpers = between(app, 'function bearerJsonHeaders', 'window.formatCouponInput');
  const qna = between(app, '// ===== Q&A =====', '// ===== NOTICE =====');
  const ids = ['qnaListView', 'qnaDetailView', 'questionDetail', 'curQuestionId', 'questionList', 'questionResultStatus',
    'questionPagination', 'questionListTitle', 'qform', 'qtitle', 'qbody', 'qAnon', 'qsubmit', 'answerBody'];
  const nodes = Object.fromEntries(ids.map(id => [id, element(id)]));
  nodes.qnaDetailView.style.display = 'none';
  nodes.qnaListView.style.display = 'block';

  const calls = { getDocs: [], getDoc: [], fetch: [], alerts: [], confirms: [] };
  const queues = { getDocs: [], getDoc: [], confirm: [] };
  // 라우트별 응답 큐. 비어 있으면 빈 성공 응답.
  const routes = {};
  const next = (name, fallback) => (queues[name].length ? queues[name].shift() : fallback());
  const route = url => url.replace('https://api.invalid', '');

  const window = {
    apiUrl: r => `https://api.invalid${r}`,
    isAdmin: () => Boolean(window.CU && admins.includes(window.CU.uid)),
    getAdminName: () => '운영팀',
    gpConfirm: options => { calls.confirms.push(options); return next('confirm', () => Promise.resolve(true)); }
  };
  const context = {
    window,
    document: { getElementById: id => nodes[id] || null, querySelectorAll: () => [] },
    sessionStorage: storage(), localStorage: storage(),
    alert: message => calls.alerts.push(String(message)),
    confirm: () => true, prompt: () => null,
    fetch: (url, options) => {
      const r = route(url);
      calls.fetch.push({ route: r, body: JSON.parse(options.body), auth: options.headers.Authorization });
      const queue = routes[r] || [];
      if (queue.length) return queue.shift();
      if (r === '/admin/qna/deleted-list') return Promise.resolve(jsonResponse(200, { ok: true, items: [], nextCursor: null }));
      return Promise.resolve(jsonResponse(200, { ok: true }));
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
      totalItems: items.length, totalPages: Math.max(1, Math.ceil(items.length / size)),
      startIndex: 0, endIndex: Math.min(items.length, size), page: 1, items: items.slice(0, size)
    }),
    compactPageNumbers: () => [1],
    Object, String, Boolean, JSON, Number, Promise, Error, Math, Date, Array, Set, Symbol
  };
  vm.createContext(context);
  vm.runInContext(sessionSecurity, context);
  vm.runInContext(`let CU = null;\nwindow.__setCU = u => { CU = u; window.CU = u; };\n${helpers}\n${qna}`, context);
  const signIn = nextUser => {
    window.gpSessionSecurity.bindUser(nextUser ? nextUser.uid : '');
    window.__setCU(nextUser);
  };
  const respond = (r, ...responses) => { (routes[r] ||= []).push(...responses); };
  const fetchesTo = r => calls.fetch.filter(call => call.route === r);
  const rowOrder = () => [...nodes.questionList.innerHTML.matchAll(/data-qna-id="([^"]+)"/gu)].map(m => m[1]);
  return { window, nodes, calls, queues, signIn, respond, fetchesTo, rowOrder };
}

test('admin list includes deleted summaries with a 삭제됨 badge, after active inquiries, without loading bodies', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  const queueBoth = () => {
    qna.queues.getDocs.push(Promise.resolve(docsSnapshot([
      { id: 'a-answered', authorId: 'u1', title: '답변된 문의', status: 'answered', createdAt: timestamp('2026-10-15T00:00:00Z') },
      { id: 'a-old', authorId: 'u1', title: '오래된 대기', status: 'pending', createdAt: timestamp('2026-09-01T00:00:00Z') },
      // 서버 데이터의 status/archived 필드는 보관 여부를 결정하지 못한다.
      { id: 'a-collide', authorId: 'u2', title: '충돌 필드 문의', status: 'deleted', archived: true, createdAt: timestamp('2026-10-20T00:00:00Z') }
    ])));
    qna.respond('/admin/qna/deleted-list', Promise.resolve(jsonResponse(200, { ok: true, nextCursor: null, items: [
      summary('d-old', { deletedAt: '2026-10-02T00:00:00.000Z' }),
      summary('d-new', { deletedAt: '2026-10-18T00:00:00.000Z', body: 'LEAKED SUMMARY BODY' }),
      { title: 'id 없는 항목' }
    ] })));
  };
  queueBoth();
  await qna.window.loadQuestions('pending');
  const html = qna.nodes.questionList.innerHTML;
  assert.deepEqual(qna.rowOrder(), ['a-collide', 'a-old', 'a-answered', 'd-new', 'd-old']);
  assert.equal((html.match(/qna-status deleted">삭제됨/gu) || []).length, 2);
  assert.equal((html.match(/data-qna-archived="1"/gu) || []).length, 2);
  assert.match(html, /data-qna-id="a-collide" aria-label="충돌 필드 문의, 답변 대기"/u);
  assert.doesNotMatch(html, /LEAKED SUMMARY BODY/u);
  assert.match(qna.nodes.questionResultStatus.textContent, /전체 문의 5건 \(삭제됨 2건 포함\)/u);
  assert.equal(qna.fetchesTo('/admin/qna/deleted-get').length, 0, 'no body is loaded until a detail is selected');

  queueBoth();
  await qna.window.loadQuestions('recent');
  assert.deepEqual(qna.rowOrder(), ['a-collide', 'd-new', 'a-answered', 'd-old', 'a-old'], 'recent sorts by deletedAt or createdAt');
});

test('archive summaries are fetched page by page until the cursor ends', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  qna.respond('/admin/qna/deleted-list',
    Promise.resolve(jsonResponse(200, { ok: true, items: [summary('d1'), summary('d2')], nextCursor: 'd2' })),
    Promise.resolve(jsonResponse(200, { ok: true, items: [summary('d3')], nextCursor: 'd3' })),
    Promise.resolve(jsonResponse(200, { ok: true, items: [summary('d4')], nextCursor: null })));
  await qna.window.loadQuestions();
  const pages = qna.fetchesTo('/admin/qna/deleted-list');
  assert.deepEqual(pages.map(call => call.body.cursor ?? null), [null, 'd2', 'd3']);
  assert.ok(pages.every(call => call.body.limit === 100));
  assert.deepEqual(qna.rowOrder().sort(), ['d1', 'd2', 'd3', 'd4']);

  // 커서가 진행되지 않으면 무한 루프 대신 경고를 보여준다.
  qna.respond('/admin/qna/deleted-list',
    Promise.resolve(jsonResponse(200, { ok: true, items: [summary('d1')], nextCursor: 'd1' })),
    Promise.resolve(jsonResponse(200, { ok: true, items: [summary('d1')], nextCursor: 'd1' })));
  await qna.window.loadQuestions();
  assert.match(qna.nodes.questionList.innerHTML, /qna-archive-warning/u);
});

test('an archive failure keeps the active list visible with an explicit warning', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  qna.queues.getDocs.push(Promise.resolve(docsSnapshot([{ id: 'a1', authorId: 'u1', title: '활성 문의', createdAt: timestamp('2026-10-01T00:00:00Z') }])));
  qna.respond('/admin/qna/deleted-list', Promise.resolve(jsonResponse(500, { ok: false, code: 'INTERNAL', error: '보관함 서버 오류' })));
  await qna.window.loadQuestions();
  const html = qna.nodes.questionList.innerHTML;
  assert.match(html, /활성 문의/u);
  assert.match(html, /role="alert">삭제된 문의 보관함을 불러오지 못해 진행 중인 문의만 표시하고 있어요\. 보관함 서버 오류/u);
  assert.match(qna.nodes.questionResultStatus.textContent, /삭제된 문의를 불러오지 못했어요/u);

  // 다음 성공 로드에서 경고가 사라진다.
  await qna.window.loadQuestions();
  assert.doesNotMatch(qna.nodes.questionList.innerHTML, /qna-archive-warning/u);
});

test('ordinary users never call the archive endpoints', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('uid-u'));
  qna.queues.getDocs.push(Promise.resolve(docsSnapshot([{ id: 'mine', authorId: 'uid-u', title: '내 문의', createdAt: timestamp('2026-10-01T00:00:00Z') }])));
  await qna.window.loadQuestions();
  assert.equal(qna.calls.getDocs[0].clause.value, 'uid-u');
  assert.match(qna.nodes.questionList.innerHTML, /내 문의/u);
  assert.doesNotMatch(qna.nodes.questionList.innerHTML, /삭제됨/u);
  await qna.window.viewQuestion('mine', { archived: true });
  assert.equal(qna.calls.fetch.length, 0);
  assert.match(qna.nodes.questionDetail.innerHTML, /관리자만 볼 수 있어요/u);
});

test('archived detail shows the full original body, answer and deletion metadata with no edit actions', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  const longBody = '원문 '.repeat(900) + '끝문장';
  qna.respond('/admin/qna/deleted-get', Promise.resolve(jsonResponse(200, { ok: true, question: summary('d1', {
    previousStatus: 'answered', deletedBy: 'admin-x', deletedByRole: 'admin', isAnon: true,
    body: longBody, answer: { body: '보관된 답변 본문', answeredBy: '운영팀A', answeredAt: '2026-10-05T03:00:00.000Z' }
  }) })));
  await qna.window.viewQuestion('d1', { archived: true });
  const html = qna.nodes.questionDetail.innerHTML;
  assert.deepEqual(qna.fetchesTo('/admin/qna/deleted-get').map(call => call.body), [{ id: 'd1' }]);
  assert.equal(qna.calls.getDoc.length, 0, 'archived detail never reads the active collection');
  assert.ok(longBody.length > 600);
  assert.ok(html.includes(longBody), 'the whole original body is rendered without truncation');
  assert.match(html, /qna-status deleted">삭제됨/u);
  assert.match(html, /보관된 답변 본문/u);
  assert.match(html, /<dt>문의 ID<\/dt><dd>d1<\/dd>/u);
  assert.match(html, /<dt>원래 상태<\/dt><dd>답변 완료<\/dd>/u);
  assert.match(html, /<dt>삭제한 계정<\/dt><dd>admin-x \(관리자\)<\/dd>/u);
  assert.match(html, /<dt>삭제 시각<\/dt><dd>[^<]*2026[^<]*<\/dd>/u);
  assert.match(html, /익명 요청/u);
  assert.doesNotMatch(html, /답변 수정|답변 삭제|질문 삭제|답변 등록|answerBody/u);

  // 화면 밖에서 직접 호출해도 보관 문의에는 쓰기 요청을 보내지 않는다.
  qna.nodes.answerBody.value = '새 답변';
  await qna.window.submitAnswer('d1');
  await qna.window.editAnswer('d1');
  await qna.window.delAnswer('d1');
  await qna.window.delQuestion('d1');
  assert.equal(qna.calls.fetch.length, 1);
  assert.equal(qna.calls.confirms.length, 0);

  qna.respond('/admin/qna/deleted-get', Promise.resolve(jsonResponse(200, { ok: true, question: summary('d2', { body: '부분 원문', originalContentComplete: false, answer: null }) })));
  await qna.window.viewQuestion('d2', { archived: true });
  assert.match(qna.nodes.questionDetail.innerHTML, /원문이 완전히 보관되지 않았을 수 있어요/u);
  assert.match(qna.nodes.questionDetail.innerHTML, /삭제 당시 등록된 답변이 없었어요/u);
});

test('stale archive list and detail responses cannot overwrite a newer session or view', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin-a', 'admin-b'] });
  qna.signIn(user('admin-a'));
  const slowList = deferred();
  qna.respond('/admin/qna/deleted-list', slowList.promise);
  const loadA = qna.window.loadQuestions();
  await flush();

  qna.signIn(user('admin-b'));
  qna.queues.getDocs.push(Promise.resolve(docsSnapshot([{ id: 'b1', authorId: 'u', title: 'B 활성', createdAt: timestamp('2026-10-01T00:00:00Z') }])));
  await qna.window.loadQuestions();
  slowList.resolve(jsonResponse(200, { ok: true, items: [summary('a-secret', { title: 'A 보관 비밀' })], nextCursor: null }));
  await loadA;
  assert.match(qna.nodes.questionList.innerHTML, /B 활성/u);
  assert.doesNotMatch(qna.nodes.questionList.innerHTML, /A 보관 비밀/u);

  // 이전 로드의 늦은 보관함 실패가 최신 목록에 경고를 남기지 않는다.
  const slowFail = deferred();
  qna.respond('/admin/qna/deleted-list', slowFail.promise);
  const older = qna.window.loadQuestions();
  await flush();
  await qna.window.loadQuestions();
  slowFail.resolve(jsonResponse(500, { ok: false, error: '늦은 실패' }));
  await older;
  assert.doesNotMatch(qna.nodes.questionList.innerHTML, /늦은 실패|qna-archive-warning/u);

  // 느린 보관 상세는 이후 선택이나 로그아웃 뒤에 반영되지 않는다.
  const slowDetail = deferred();
  qna.respond('/admin/qna/deleted-get', slowDetail.promise);
  const detail = qna.window.viewQuestion('d-slow', { archived: true });
  await flush();
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'u', title: '활성 상세', body: '본문' })));
  await qna.window.viewQuestion('b1');
  slowDetail.resolve(jsonResponse(200, { ok: true, question: summary('d-slow', { body: '늦은 보관 본문' }) }));
  await detail;
  assert.match(qna.nodes.questionDetail.innerHTML, /활성 상세/u);
  assert.equal(qna.nodes.curQuestionId.value, 'b1');

  const afterLogout = deferred();
  qna.respond('/admin/qna/deleted-get', afterLogout.promise);
  const loggedOut = qna.window.viewQuestion('d-slow', { archived: true });
  await flush();
  qna.signIn(null);
  afterLogout.resolve(jsonResponse(200, { ok: true, question: summary('d-slow', { body: '로그아웃 뒤 본문' }) }));
  await loggedOut;
  assert.equal(qna.nodes.questionDetail.innerHTML, '');
  assert.equal(qna.nodes.questionList.innerHTML, '');
});

test('logout clears an archive warning and the archived selection', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  qna.respond('/admin/qna/deleted-list', Promise.resolve(jsonResponse(500, { ok: false, error: '관리자 전용 오류' })));
  await qna.window.loadQuestions();
  assert.match(qna.nodes.questionList.innerHTML, /관리자 전용 오류/u);
  qna.signIn(null);
  qna.signIn(user('uid-u'));
  await qna.window.loadQuestions();
  assert.doesNotMatch(qna.nodes.questionList.innerHTML + qna.nodes.questionResultStatus.textContent, /관리자 전용 오류|보관함|삭제된 문의/u);
});

test('delete confirmation explains retention and a delete or 404 refreshes the admin list with the archive', { timeout: TIMEOUT_MS }, async () => {
  const qna = await loadQna({ admins: ['admin'] });
  qna.signIn(user('admin'));
  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'u', title: '문의', body: '본문' })));
  await qna.window.viewQuestion('q1');
  qna.respond('/admin/qna/deleted-list', Promise.resolve(jsonResponse(200, { ok: true, items: [summary('q1', { deletedByRole: 'admin' })], nextCursor: null })));
  await qna.window.delQuestion('q1');
  await flush();
  assert.equal(qna.calls.confirms[0].message, '사용자 목록에서 삭제되며 문의 원문과 답변은 운영팀 확인을 위해 보관됩니다.');
  assert.deepEqual(qna.fetchesTo('/qna/delete').map(call => call.body), [{ id: 'q1' }]);
  assert.equal(qna.fetchesTo('/admin/qna/deleted-list').length, 1);
  assert.match(qna.nodes.questionList.innerHTML, /data-qna-id="q1" data-qna-archived="1"/u);

  qna.queues.getDoc.push(Promise.resolve(docSnapshot({ authorId: 'u', title: '문의2', body: '본문' })));
  await qna.window.viewQuestion('q2');
  qna.respond('/qna/delete', Promise.resolve(jsonResponse(404, { ok: false, code: 'QNA_NOT_FOUND', error: '없음' })));
  await qna.window.delQuestion('q2');
  await flush();
  assert.equal(qna.fetchesTo('/admin/qna/deleted-list').length, 2);
  assert.deepEqual(qna.calls.alerts, []);
});

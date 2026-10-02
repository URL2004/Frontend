/* 결과 화면 A안(2026-10-02, 같은 날 모든 사용자에게 적용)
   운영 작업 화면의 결과 카드에 원문·다듬은 글을 문단끼리 나란히 놓는다.
   작업 흐름에 들어오면 미리 불러 두고(evasion-flow), 아래 '예시 글' 띠는 관리자에게만 띄운다.
   글은 textContent로만 넣는다 — 사용자 글에 태그가 섞여도 그대로 글자로 보인다. */
(function () {
  'use strict';
  if (window.gpResultCompare) return;

  var TOP = /^(#{1,2}\s|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]|[IVX]{1,4}\.\s|<[^>]{1,20}>|제\s?\d+\s?[장절]|-\s?(서론|본론|결론))/;
  var SUB = /^(#{3,}\s|\d{1,2}(\.\d{1,2})*\.?\s|[가-하]\.\s|\[[^\]]{2,60}\]\s*$)/;
  // 한 문단을 결과가 최대 4개로 나누거나(1:k) 여러 문단을 합친 경우(k:1)까지 짝짓는다.
  var MOVES = [[1, 1], [1, 2], [1, 3], [1, 4], [2, 1], [3, 1], [4, 1], [1, 0], [0, 1]];

  function lines(s) { return String(s || '').replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
  function grams(s) { var t = s.replace(/\s+/g, ''), set = new Set(); for (var i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2)); return set; }
  function sim(A, B) {
    if (!A.size || !B.size) return 0;
    var s = A.size < B.size ? A : B, l = s === A ? B : A, n = 0;
    s.forEach(function (g) { if (l.has(g)) n++; });
    return (2 * n) / (A.size + B.size);
  }
  function union(A, B) { var u = new Set(A); B.forEach(function (g) { u.add(g); }); return u; }
  function isHeading(line) {
    if (!line || line.length > 70 || /[다요]\.\s*$/.test(line)) return false;
    return TOP.test(line) || SUB.test(line);
  }
  // groups[k-1][i] = i번째부터 k개 문단을 합친 글자쌍 집합(미리 한 번만 만든다).
  function groupsOf(list) {
    var out = [list];
    for (var k = 2; k <= 4; k++) {
      var prev = out[k - 2];
      out.push(list.map(function (s, i) { return i + k - 1 < list.length ? union(prev[i], list[i + k - 1]) : null; }));
    }
    return out;
  }
  // 줄 단위 유사도 DP. 대각선 띠 안에서만 계산해 긴 글(수백 줄)도 즉시 끝난다.
  function align(A, B) {
    var n = A.length, m = B.length, NEG = -1e9;
    var ga = groupsOf(A.map(grams)), gb = groupsOf(B.map(grams));
    var band = Math.max(14, Math.abs(n - m) + 10);
    var S = [], P = [];
    for (var r = 0; r <= n; r++) { S.push(new Float64Array(m + 1).fill(NEG)); P.push(new Int8Array(m + 1)); }
    S[0][0] = 0;
    for (var i = 0; i <= n; i++) {
      var c = n ? Math.round((i * m) / n) : 0;
      for (var j = Math.max(0, c - band); j <= Math.min(m, c + band); j++) {
        var cur = S[i][j];
        if (cur === NEG) continue;
        for (var k = 0; k < MOVES.length; k++) {
          var di = MOVES[k][0], dj = MOVES[k][1], ni = i + di, nj = j + dj;
          if (ni > n || nj > m) continue;
          var sc = -0.3;
          if (di && dj) {
            var extra = di + dj - 2;
            sc = sim(ga[di - 1][i], gb[dj - 1][j]) - (extra ? 0.1 + 0.05 * extra : 0);
          }
          if (cur + sc > S[ni][nj]) { S[ni][nj] = cur + sc; P[ni][nj] = k + 1; }
        }
      }
    }
    var out = [], x = n, y = m;
    while (x > 0 || y > 0) {
      var mv = P[x][y];
      if (!mv) { out.push([A.slice(0, x).join('\n\n'), B.slice(0, y).join('\n\n')]); break; }
      var d = MOVES[mv - 1];
      // 한 칸에 묶인 여러 문단은 빈 줄로 이어 실제 문단 나눔이 보이게 한다.
      out.push([A.slice(x - d[0], x).join('\n\n'), B.slice(y - d[1], y).join('\n\n')]);
      x -= d[0]; y -= d[1];
    }
    return out.reverse();
  }
  // 어절 LCS. 바뀐 어절 사이의 공백도 같이 칠해 끊김 없이 보이게 한다(줄바꿈은 제외).
  function segs(tokens, keep) {
    var w = 0;
    var flags = tokens.map(function (t) { return /^\s+$/.test(t) ? -1 : (keep[w++] ? 0 : 1); });
    flags.forEach(function (f, k) { if (f === -1) flags[k] = !/\n/.test(tokens[k]) && flags[k - 1] === 1 && flags[k + 1] === 1 ? 1 : 0; });
    var out = [];
    tokens.forEach(function (t, k) { var last = out[out.length - 1]; if (last && last[1] === flags[k]) last[0] += t; else out.push([t, flags[k]]); });
    return out;
  }
  function split(s) { return s ? s.split(/(\s+)/).filter(Boolean) : []; }
  function diff(a, b) {
    var ta = split(a), tb = split(b);
    var wa = ta.filter(function (t) { return !/^\s+$/.test(t); }), wb = tb.filter(function (t) { return !/^\s+$/.test(t); });
    var n = wa.length, m = wb.length, keepA = new Uint8Array(n), keepB = new Uint8Array(m);
    if (n && m && n * m <= 4e6) {
      var L = [];
      for (var r = 0; r <= n; r++) L.push(new Uint16Array(m + 1));
      for (var i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = wa[i] === wb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      for (var p = 0, q = 0; p < n && q < m;) {
        if (wa[p] === wb[q]) { keepA[p] = keepB[q] = 1; p++; q++; } else if (L[p + 1][q] >= L[p][q + 1]) p++; else q++;
      }
    }
    return { b: segs(ta, keepA), a: segs(tb, keepB) };
  }

  function build(before, after) {
    if (!before.trim()) {
      return finish({ noOrig: true, before: '', after: after, rows: lines(after).map(function (l) { return { h: isHeading(l), b: [], a: [[l, 0]], text: l }; }) });
    }
    var rows = align(lines(before), lines(after)).map(function (pair) {
      var a = pair[0], b = pair[1], d = diff(a, b);
      return { h: isHeading(a || b) && !/\n/.test(a + b), same: a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' '), b: d.b, a: d.a, text: b };
    });
    return finish({ noOrig: false, before: before, after: after, rows: rows });
  }
  // 글자 수(공백 포함·제외)와 목차에 쓸 제목 행을 미리 센다.
  function finish(M) {
    M.count = {
      with: { b: M.before.trim().length, a: M.after.trim().length },
      without: { b: M.before.replace(/\s/g, '').length, a: M.after.replace(/\s/g, '').length }
    };
    M.heads = [];
    M.rows.forEach(function (r, i) { if (r.h) M.heads.push(i); });
    return M;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function para(list, hl) {
    var p = el('p');
    list.forEach(function (s) { p.appendChild(s[1] && hl ? el('mark', '', s[0]) : document.createTextNode(s[0])); });
    return p;
  }
  function fmt(n) { return Number(n).toLocaleString('ko-KR') + '자'; }
  function toggle(label, on, disabled, onChange) {
    var wrap = el('label', 'gp-rp-switch' + (disabled ? ' is-off' : ''));
    var input = el('input');
    input.type = 'checkbox';
    input.checked = on;
    input.disabled = !!disabled;
    input.addEventListener('change', function () { onChange(input.checked); });
    var knob = el('i');
    knob.setAttribute('aria-hidden', 'true');
    wrap.append(input, knob, document.createTextNode(label));
    return wrap;
  }

  function smallButton(label, cls, onClick) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  // 데스크톱은 비교 본문이 따로 스크롤하고, 모바일은 본문이 페이지와 함께 스크롤한다(CSS가 정한다).
  function innerScroll(body) { return !!body && getComputedStyle(body).overflowY !== 'visible'; }
  function scrollToRow(body, row) {
    if (!body || !row) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var behavior = reduce ? 'auto' : 'smooth';
    if (innerScroll(body)) body.scrollTo({ top: Math.max(0, row.offsetTop - 8), behavior: behavior });
    else row.scrollIntoView({ block: 'start', behavior: behavior });   // 위에 붙은 도구줄 높이는 CSS scroll-margin-top
    row.classList.remove('is-flash');
    void row.offsetWidth;
    row.classList.add('is-flash');
    setTimeout(function () { row.classList.remove('is-flash'); }, 1600);
  }
  // 스위치·글자 수 기준을 바꿔 다시 그려도 읽던 문단이 같은 자리에 오게 한다(보이는 첫 행 기준).
  function readAnchor(host) {
    var body = host.querySelector('.gp-rp-body');
    if (!body || !body.children.length) return null;
    var tools = host.querySelector('.gp-rp-tools');
    var line = innerScroll(body) ? body.getBoundingClientRect().top : Math.max(0, tools ? tools.getBoundingClientRect().bottom : 0);
    for (var i = 0; i < body.children.length; i++) {
      var r = body.children[i].getBoundingClientRect();
      if (r.bottom > line + 1) return { index: i, top: r.top };
    }
    return null;
  }
  function keepAnchor(host, a) {
    var body = host.querySelector('.gp-rp-body');
    var row = a && body && body.children[a.index];
    if (!row) return;
    var delta = row.getBoundingClientRect().top - a.top;
    if (Math.abs(delta) < 1) return;
    if (innerScroll(body)) body.scrollTop += delta;
    else window.scrollBy(0, delta);
  }
  // 목차 메뉴는 바깥을 누르거나 Esc를 누르면 닫는다.
  function closeTocMenus() {
    document.querySelectorAll('.gp-rp-toc-menu').forEach(function (m) {
      if (m.hidden) return;
      m.hidden = true;
      var b = m.parentNode && m.parentNode.querySelector('.gp-rp-tool');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('.gp-rp-toc'))) closeTocMenus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTocMenus(); });

  // 문단 보강 대상(결과 문단 index·인용 문장)을 비교 행에 잇는다.
  function refineRow(M, refine) {
    if (!refine) return -1;
    var key = String(refine.snippet || '').replace(/\s+/g, '').slice(0, 24);
    if (key) {
      for (var i = 0; i < M.rows.length; i++) if (String(M.rows[i].text || '').replace(/\s+/g, '').indexOf(key) >= 0) return i;
    }
    var paras = M.after.split(/\n[ \t]*\n+/).filter(function (p) { return p.trim(); });
    var target = paras[refine.index];
    if (!target) return -1;
    var head = target.trim().split('\n')[0].replace(/\s+/g, '').slice(0, 24);
    for (var j = 0; j < M.rows.length; j++) if (String(M.rows[j].text || '').replace(/\s+/g, '').indexOf(head) >= 0) return j;
    return -1;
  }
  // 보강 카드(운영 #lavDoneRefine)를 대상 문단 아래로 옮긴다. 다시 그리기 전에는 제자리로 돌려놓는다.
  function undock(st) {
    var card = st.opts.refine && st.opts.refine.el;
    if (card && st.refineHome && card.parentNode !== st.refineHome) st.refineHome.insertBefore(card, st.refineNext || null);
    if (card) card.classList.remove('is-docked');
  }
  function dock(st, slot) {
    var card = st.opts.refine && st.opts.refine.el;
    if (!card || !slot) return;
    if (!st.refineHome) { st.refineHome = card.parentNode; st.refineNext = card.nextSibling; }
    slot.appendChild(card);
    card.classList.add('is-docked');
    st.refineOpen = true;
  }

  function render(host) {
    var st = host.__gpRp, M = st && st.model;
    var anchor = readAnchor(host);
    undock(st || { opts: {} });
    host.textContent = '';
    if (!M) return;
    var single = M.noOrig || !st.orig;
    var basis = st.count === 'without' ? 'without' : 'with';
    var body = el('div', 'gp-rp-body');

    var tools = el('div', 'gp-rp-tools');
    var left = el('div', 'gp-rp-tools-l'), right = el('div', 'gp-rp-tools-r');
    if (M.heads.length >= 2) {
      var tocWrap = el('div', 'gp-rp-toc');
      var tocBtn = smallButton('목차 보기', 'gp-rp-tool', function () { menu.hidden = !menu.hidden; tocBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
      tocBtn.setAttribute('aria-expanded', 'false');
      var menu = el('div', 'gp-rp-toc-menu');
      menu.hidden = true;
      M.heads.forEach(function (i) {
        var item = smallButton(String(M.rows[i].text || '').replace(/\s+/g, ' ').slice(0, 60), 'gp-rp-toc-item', function () {
          menu.hidden = true;
          tocBtn.setAttribute('aria-expanded', 'false');
          scrollToRow(body, body.children[i]);
        });
        menu.appendChild(item);
      });
      tocWrap.append(tocBtn, menu);
      left.appendChild(tocWrap);
    }
    right.append(
      toggle('바뀐 곳', st.hl && !M.noOrig, M.noOrig, function (v) { st.hl = v; render(host); }),
      toggle('원문', !single, M.noOrig, function (v) { st.orig = v; render(host); })
    );
    tools.append(left, right);

    var view = el('div', 'gp-rp-view' + (single ? ' is-single' : ''));
    var head = el('div', 'gp-rp-head');
    var hb = el('div', 'gp-rp-col gp-rp-col--b');
    hb.append(el('b', '', '원문'), el('span', '', fmt(M.count[basis].b)));
    var ha = el('div', 'gp-rp-col gp-rp-col--a');
    var basisBtn = smallButton(basis === 'with' ? '공백 포함' : '공백 제외', 'gp-rp-basis', function () { st.count = basis === 'with' ? 'without' : 'with'; render(host); });
    basisBtn.title = '글자 수 기준 바꾸기';
    ha.append(el('b', '', '다듬은 글'), el('span', '', fmt(M.count[basis].a)), basisBtn);
    head.append(hb, ha);

    var hl = st.hl && !M.noOrig;
    var refine = st.opts.refine;
    var refineAt = refineRow(M, refine);
    var slot = null;
    var frag = document.createDocumentFragment();
    M.rows.forEach(function (r, i) {
      var row = el('div', 'gp-rp-row' + (r.h ? ' is-h' : '') + (r.same ? ' is-same' : ''));
      var cb = el('div', 'gp-rp-cell gp-rp-cell--b');
      cb.appendChild(para(r.b, hl));
      var ca = el('div', 'gp-rp-cell gp-rp-cell--a');
      ca.appendChild(para(r.a, hl));
      if (i === refineAt) {
        slot = el('div', 'gp-rp-refine-slot');
        var pill = smallButton(refine.label || '내 경험 보태기', 'gp-rp-refine', function () {
          if (st.refineOpen) { undock(st); st.refineOpen = false; pill.setAttribute('aria-expanded', 'false'); return; }
          dock(st, slot);
          pill.setAttribute('aria-expanded', 'true');
          var field = slot.querySelector('textarea');
          if (field) field.focus({ preventScroll: true });
        });
        pill.setAttribute('aria-expanded', 'false');
        ca.append(pill, slot);
      }
      row.append(cb, ca);
      frag.appendChild(row);
    });
    body.appendChild(frag);
    view.append(head, body);
    host.append(tools, view);
    if (st.refineOpen && slot) dock(st, slot);
    else st.refineOpen = false;
    keepAnchor(host, anchor);
  }

  // host 하나에 비교 화면을 그린다. 같은 글이면 계산을 다시 하지 않는다.
  //   opts.refine = { snippet, index, label, el }: 문단 보강 대상(있을 때만).
  function mount(host, before, after, opts) {
    if (!host) return;
    before = String(before || '');
    after = String(after || '');
    var st = host.__gpRp || (host.__gpRp = { hl: true, orig: true, opts: {} });
    if (st.before !== before || st.after !== after || !st.model) {
      undock(st);
      st.before = before;
      st.after = after;
      st.model = after.trim() ? build(before, after) : null;
      st.refineOpen = false;
    }
    st.opts = opts || {};
    render(host);
  }

  // ── 관리자 띠: 운영 화면 하단에 예시 글 입력을 둔다(관리자 전용) ──
  var bar = null, panel = null;
  function button(label, cls, onClick) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function showBar(opts) {
    opts = opts || {};
    if (bar) { bar.hidden = false; bar.__opts = opts; return; }
    bar = el('div', 'gp-rdp');
    bar.__opts = opts;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '결과 화면 예시 글');
    panel = el('form', 'gp-rdp-panel');
    panel.hidden = true;
    var before = el('textarea', 'gp-rdp-text');
    before.placeholder = '원문';
    before.rows = 7;
    var after = el('textarea', 'gp-rdp-text');
    after.placeholder = '휴머나이징 결과';
    after.rows = 7;
    var mode = el('select', 'gp-rdp-mode');
    [['blog', '기본 휴머나이징'], ['polish', '원문 보존 다듬기'], ['formal', '고급 휴머나이징']].forEach(function (o) {
      var opt = el('option', '', o[1]);
      opt.value = o[0];
      mode.appendChild(opt);
    });
    mode.setAttribute('aria-label', '모드');
    var go = el('button', 'gp-rdp-go', '결과 화면 열기');
    go.type = 'submit';
    var texts = el('div', 'gp-rdp-texts');
    texts.append(before, after);
    var foot = el('div', 'gp-rdp-foot');
    foot.append(mode, go);
    panel.append(texts, foot);
    panel.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!after.value.trim()) { after.focus(); return; }
      var cb = bar.__opts.onSample;
      if (cb) cb(before.value, after.value, mode.value);
      panel.hidden = true;
    });
    var row = el('div', 'gp-rdp-row');
    row.append(
      el('span', 'gp-rdp-dot'),
      el('span', 'gp-rdp-label', '결과 화면 예시 글'),
      el('span', 'gp-rdp-sub', '관리자에게만 보여요'),
      button('예시 글로 열기', 'gp-rdp-btn', function () { panel.hidden = !panel.hidden; if (!panel.hidden) before.focus(); }),
      button('끄기', 'gp-rdp-btn is-quiet', function () { if (bar.__opts.onOff) bar.__opts.onOff(); })
    );
    bar.append(panel, row);
    document.body.appendChild(bar);
  }
  function hideBar() { if (bar) bar.hidden = true; }
  function openSample() {
    if (!panel) return;
    panel.hidden = false;
    var first = panel.querySelector('textarea');
    if (first) first.focus();
  }

  window.gpResultCompare = { mount: mount, showBar: showBar, hideBar: hideBar, openSample: openSample };
})();

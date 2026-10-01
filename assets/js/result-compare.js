/* 결과 화면 A안 — 관리자 미리보기(2026-10-02)
   운영 작업 화면의 결과 카드에 원문·다듬은 글을 문단끼리 나란히 놓는다.
   관리자 랩의 'A안 보기'를 켠 관리자 브라우저에서만 불러온다(일반 사용자에게는 내려가지 않는다).
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
  function nums(s) { return (String(s).match(/\d+/g) || []).sort().join(','); }

  function build(before, after) {
    if (!before.trim()) {
      return { noOrig: true, la: after.trim().length, lb: 0, rows: lines(after).map(function (l) { return { h: isHeading(l), b: [], a: [[l, 0]], warn: false }; }) };
    }
    var rows = align(lines(before), lines(after)).map(function (pair) {
      var a = pair[0], b = pair[1], d = diff(a, b);
      return {
        h: isHeading(a || b) && !/\n/.test(a + b),
        same: a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' '),
        b: d.b, a: d.a,
        warn: !!a && !!b && nums(a) !== nums(b)
      };
    });
    return { noOrig: false, rows: rows, lb: before.trim().length, la: after.trim().length };
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

  function render(host) {
    var st = host.__gpRp, M = st && st.model;
    var prevBody = host.querySelector('.gp-rp-body');
    var keepTop = prevBody ? prevBody.scrollTop : 0;
    host.textContent = '';
    if (!M) return;
    var single = M.noOrig || !st.orig;
    var tools = el('div', 'gp-rp-tools');
    tools.append(
      toggle('바뀐 곳', st.hl && !M.noOrig, M.noOrig, function (v) { st.hl = v; render(host); }),
      toggle('원문', !single, M.noOrig, function (v) { st.orig = v; render(host); })
    );
    var view = el('div', 'gp-rp-view' + (single ? ' is-single' : ''));
    var head = el('div', 'gp-rp-head');
    var hb = el('div', 'gp-rp-col gp-rp-col--b');
    hb.append(el('b', '', '원문'), el('span', '', fmt(M.lb)));
    var ha = el('div', 'gp-rp-col gp-rp-col--a');
    ha.append(el('b', '', '다듬은 글'), el('span', '', fmt(M.la)));
    head.append(hb, ha);
    var body = el('div', 'gp-rp-body');
    var frag = document.createDocumentFragment();
    var hl = st.hl && !M.noOrig;
    M.rows.forEach(function (r) {
      var row = el('div', 'gp-rp-row' + (r.h ? ' is-h' : '') + (r.same ? ' is-same' : ''));
      var cb = el('div', 'gp-rp-cell gp-rp-cell--b');
      cb.appendChild(para(r.b, hl));
      var ca = el('div', 'gp-rp-cell gp-rp-cell--a');
      ca.appendChild(para(r.a, hl));
      if (r.warn) ca.appendChild(el('span', 'gp-rp-warn', '숫자가 원문과 달라요'));
      row.append(cb, ca);
      frag.appendChild(row);
    });
    body.appendChild(frag);
    view.append(head, body);
    host.append(tools, view);
    if (keepTop) body.scrollTop = keepTop;
  }

  // host 하나에 비교 화면을 그린다. 같은 글이면 계산을 다시 하지 않는다.
  function mount(host, before, after) {
    if (!host) return;
    before = String(before || '');
    after = String(after || '');
    var st = host.__gpRp || (host.__gpRp = { hl: true, orig: true });
    if (st.before !== before || st.after !== after || !st.model) {
      st.before = before;
      st.after = after;
      st.model = after.trim() ? build(before, after) : null;
    }
    render(host);
  }

  // ── 관리자 띠: 운영 화면 하단에 A안 적용 상태와 예시 글 입력을 둔다 ──
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
    bar.setAttribute('aria-label', '결과 화면 A안 미리보기');
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
      el('span', 'gp-rdp-label', '결과 화면 A안 적용 중'),
      el('span', 'gp-rdp-sub', '관리자 화면에만 보여요'),
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

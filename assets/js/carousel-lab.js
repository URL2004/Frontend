/* 교피 캐러셀 랩 — 라이트박스 + 카드 셋트 제작 스튜디오
   캔버스 1080x1080에 배경/이미지/텍스트 레이어를 얹어 카드를 만들고,
   한 셋트(여러 장)를 같은 배경으로 이어 만들어 PNG 또는 ZIP으로 저장한다.
   미리보기와 저장 결과는 같은 캔버스에서 나오므로 항상 일치한다. */
(function () {
  'use strict';

  /* ============================ 라이트박스 ============================ */
  (function lightbox() {
    var slots = Array.prototype.slice.call(document.querySelectorAll('.card-slot'));
    var lb = document.getElementById('lb');
    if (!lb || !slots.length) return;

    var img = document.getElementById('lbImg');
    var title = document.getElementById('lbTitle');
    var dl = document.getElementById('lbDl');
    var zoom = document.getElementById('lbZoom');
    var closeBtn = document.getElementById('lbClose');
    var prev = document.getElementById('lbPrev');
    var next = document.getElementById('lbNext');
    var count = document.getElementById('lbCount');
    var stage = document.getElementById('lbStage');
    var cur = -1;
    var lastFocus = null;

    function sameSet(i, j) {
      return i >= 0 && j >= 0 && i < slots.length && j < slots.length &&
        slots[i].dataset.set === slots[j].dataset.set;
    }
    function render() {
      var d = slots[cur].dataset;
      img.src = d.img;
      img.alt = d.title;
      title.textContent = d.title;
      dl.href = d.img;
      dl.setAttribute('download', d.dl);
      count.textContent = d.pos + ' · ' + d.set + ' 셋트';
      prev.disabled = !sameSet(cur, cur - 1);
      next.disabled = !sameSet(cur, cur + 1);
    }
    function open(i) {
      cur = i;
      lastFocus = document.activeElement;
      lb.classList.remove('orig');
      zoom.textContent = '원본 100%';
      render();
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }
    function close() {
      lb.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function move(step) { if (sameSet(cur, cur + step)) { cur += step; render(); } }

    slots.forEach(function (slot, i) {
      slot.querySelectorAll('[data-open]').forEach(function (el) {
        el.addEventListener('click', function () { open(i); });
      });
    });
    closeBtn.addEventListener('click', close);
    prev.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    zoom.addEventListener('click', function () {
      var orig = lb.classList.toggle('orig');
      zoom.textContent = orig ? '화면에 맞춤' : '원본 100%';
    });
    stage.addEventListener('click', function (e) { if (e.target === stage) close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    });
  })();

  /* ============================ 제작 스튜디오 ============================ */
  var stage = document.getElementById('labStage');
  if (!stage) return;

  var W = 1080;
  var DRAFT_KEY = 'gyopi-carousel-lab-deck-v2';
  var base = document.getElementById('labCanvas');
  var over = document.getElementById('labOverlay');
  var ctx = base.getContext('2d');
  var octx = over.getContext('2d');
  base.width = base.height = over.width = over.height = W;
  over.style.pointerEvents = 'none';

  var FONTS = [
    { id: 'pretendard', label: 'Pretendard (교피 기본)', css: "'Pretendard Variable', 'Pretendard', sans-serif" },
    { id: 'noto', label: 'Noto Sans KR', css: "'Noto Sans KR', sans-serif" },
    { id: 'blackhan', label: 'Black Han Sans (임팩트)', css: "'Black Han Sans', sans-serif" },
    { id: 'gothica1', label: 'Gothic A1 (모던)', css: "'Gothic A1', sans-serif" },
    { id: 'myeongjo', label: 'Nanum Myeongjo (명조)', css: "'Nanum Myeongjo', serif" }
  ];

  var PRESETS = {
    head:    { label: '교피 헤드라인',    size: 66, weight: 900, color: '#151927', sp: -0.028, italic: false, box: 'none' },
    accent:  { label: '교피 보라 강조',   size: 66, weight: 800, color: '#5A43D6', sp: -0.030, italic: true,  box: 'none', shadow: '#D7D0FF', underline: '#9A8BFF' },
    white:   { label: '화이트 헤드라인',  size: 66, weight: 900, color: '#FFFFFF', sp: -0.028, italic: false, box: 'none' },
    glow:    { label: '다크 글로우 강조', size: 66, weight: 800, color: '#B4A6FF', sp: -0.030, italic: true,  box: 'none', glow: 'rgba(124,107,255,0.75)', underline: '#7C6BFF' },
    poster:  { label: '포스터 대형',      size: 94, weight: 900, color: '#17181D', sp: -0.035, italic: false, box: 'none' },
    marker:  { label: '마커 하이라이트',  size: 58, weight: 900, color: '#6C4AE0', sp: -0.025, italic: false, box: 'none', marker: '#FFE27A' },
    sticker: { label: '코믹 스티커',      size: 56, weight: 900, color: '#241C14', sp: -0.025, italic: false, box: 'sticker', rot: -2 },
    sub:     { label: '서브카피',         size: 31, weight: 400, color: '#4C5566', sp: -0.015, italic: false, box: 'none' },
    chip:    { label: '칩 · 배지',        size: 25, weight: 600, color: '#4947BC', sp: -0.010, italic: false, box: 'pill', fill: '#F0EEFF', stroke: '#D8D3F7' },
    credit:  { label: '무료 크레딧 배지', size: 25, weight: 700, color: '#7A5C12', sp: -0.010, italic: false, box: 'pill', fill: '#FFF1BF', stroke: '#EFD98E' },
    cta:     { label: 'CTA 버튼',         size: 34, weight: 700, color: '#FFFFFF', sp: -0.020, italic: false, box: 'pill', fill: '#5557D2', stroke: '' },
    note:    { label: '고지 문구',        size: 22, weight: 400, color: '#747C90', sp: -0.010, italic: false, box: 'none' }
  };
  var PRESET_ORDER = ['head', 'accent', 'white', 'glow', 'poster', 'marker', 'sticker', 'sub', 'chip', 'credit', 'cta', 'note'];

  var LAB = '/assets/img/carousel-lab/';
  var KEYS = ['a', 'b', 'c', 'd', 'e'];
  var SETNAME = { a: 'A 클린 스위프', b: 'B 미드나잇', c: 'C 빅 타이포', d: 'D 캠퍼스 웜', e: 'E 글래스' };
  var GALLERY = { bg: [], card: [], brand: [] };
  KEYS.forEach(function (k) {
    for (var n = 1; n <= 5; n++) {
      GALLERY.bg.push({ src: LAB + 'bg-' + k + n + '.webp', label: SETNAME[k] + ' · 배경 ' + n });
      GALLERY.card.push({ src: LAB + 'card-' + k + n + '.png', label: SETNAME[k] + ' · 카드 ' + n });
    }
  });
  GALLERY.brand.push({ src: LAB + 'logo.webp', label: '교피 로고' });
  GALLERY.brand.push({ src: LAB + 'mascot.webp', label: '달리는 마스코트' });

  var state = { cards: [], cur: 0, sel: null, guides: true };
  var imgCache = {};
  var seq = 1;
  var dragging = null;
  var activeGuides = [];

  function card() { return state.cards[state.cur]; }
  function current() {
    var c = card();
    if (!c) return null;
    return c.layers.filter(function (l) { return l.id === state.sel; })[0] || null;
  }

  /* ---------- 이미지 ---------- */
  function loadImage(src) {
    if (imgCache[src]) return Promise.resolve(imgCache[src]);
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { imgCache[src] = im; resolve(im); };
      im.onerror = function () { reject(new Error('image load failed')); };
      im.src = src;
    });
  }
  function ensureImages() {
    var srcs = [];
    state.cards.forEach(function (c) {
      if (c.bgSrc) srcs.push(c.bgSrc);
      c.layers.forEach(function (l) { if (l.type === 'image' && l.src) srcs.push(l.src); });
    });
    return Promise.all(srcs.map(function (s) { return loadImage(s).catch(function () { return null; }); }));
  }

  /* ---------- 측정 · 그리기 ---------- */
  function fontCss(l) {
    var f = FONTS.filter(function (x) { return x.id === l.font; })[0] || FONTS[0];
    return (l.italic ? 'italic ' : '') + l.weight + ' ' + l.size + 'px ' + f.css;
  }
  function applyFont(c, l) {
    c.font = fontCss(l);
    c.textBaseline = 'top';
    try { c.letterSpacing = (l.sp * l.size).toFixed(2) + 'px'; } catch (e) { /* 미지원 브라우저 */ }
  }
  function measure(c, l) {
    applyFont(c, l);
    var lines = String(l.text || ' ').split('\n');
    var widths = lines.map(function (t) { return c.measureText(t || ' ').width; });
    var maxW = Math.max.apply(null, widths.concat([1]));
    var lh = l.size * 1.18;
    return { lines: lines, widths: widths, maxW: maxW, lh: lh, textH: lh * lines.length };
  }
  function padOf(l) {
    if (l.box === 'pill') return { x: l.size * 1.05, y: l.size * 0.5 };
    if (l.box === 'sticker') return { x: l.size * 0.62, y: l.size * 0.45 };
    return { x: 0, y: 0 };
  }
  function boundsOf(c, l) {
    if (l.type === 'image') {
      var im = imgCache[l.src];
      var ratio = im ? im.height / im.width : 1;
      return { x: l.x, y: l.y, w: l.w, h: Math.round(l.w * ratio) };
    }
    var m = measure(c, l);
    var p = padOf(l);
    return { x: l.x, y: l.y, w: m.maxW + p.x * 2, h: m.textH + p.y * 2, m: m, p: p };
  }
  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawLayer(c, l) {
    var b = boundsOf(c, l);
    c.save();
    if (l.rot) {
      c.translate(b.x + b.w / 2, b.y + b.h / 2);
      c.rotate(l.rot * Math.PI / 180);
      c.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    }
    c.globalAlpha = l.alpha == null ? 1 : l.alpha;

    if (l.type === 'image') {
      var im = imgCache[l.src];
      if (im) c.drawImage(im, b.x, b.y, b.w, b.h);
      c.restore();
      return b;
    }

    var m = b.m, p = b.p;
    if (l.box === 'pill') {
      if (l.shadowBox) { c.shadowColor = 'rgba(53,54,132,0.22)'; c.shadowBlur = 22; c.shadowOffsetY = 8; }
      c.fillStyle = l.fill || '#F0EEFF';
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      c.fill();
      c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
      if (l.stroke) { c.strokeStyle = l.stroke; c.lineWidth = 1.5; c.stroke(); }
    } else if (l.box === 'sticker') {
      c.fillStyle = 'rgba(36,28,20,0.16)';
      roundRect(c, b.x + 8, b.y + 8, b.w, b.h, 20);
      c.fill();
      c.fillStyle = l.fill || '#FFFFFF';
      roundRect(c, b.x, b.y, b.w, b.h, 20);
      c.fill();
      c.strokeStyle = l.stroke || '#241C14';
      c.lineWidth = 4;
      c.stroke();
    }

    applyFont(c, l);
    m.lines.forEach(function (text, i) {
      var lineW = m.widths[i];
      var offset = l.align === 'center' ? (m.maxW - lineW) / 2 : (l.align === 'right' ? m.maxW - lineW : 0);
      var tx = b.x + p.x + offset;
      var ty = b.y + p.y + i * m.lh + (m.lh - l.size) / 2;

      if (l.marker) {
        c.fillStyle = l.marker;
        c.fillRect(tx - 5, ty + l.size * 0.56, lineW + 10, l.size * 0.46);
      }
      if (l.shadow) { c.fillStyle = l.shadow; c.fillText(text, tx + 4, ty + 3); }
      if (l.glow) {
        c.save();
        c.shadowColor = l.glow;
        c.shadowBlur = 26;
        c.fillStyle = l.color;
        c.fillText(text, tx, ty);
        c.fillText(text, tx, ty);
        c.restore();
      }
      c.fillStyle = l.color;
      c.fillText(text, tx, ty);

      if (l.underline) {
        var uy = ty + l.size * 1.03;
        c.strokeStyle = l.underline;
        c.lineWidth = Math.max(4, l.size * 0.085);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(tx + 2, uy + 3);
        c.bezierCurveTo(tx + lineW * 0.32, uy + 6, tx + lineW * 0.67, uy - 3, tx + lineW - 2, uy);
        c.stroke();
      }
    });

    c.restore();
    return b;
  }

  var boundsMap = {};
  function paintCard(c, cd, collect) {
    c.clearRect(0, 0, W, W);
    c.fillStyle = cd.bgColor || '#FFFFFF';
    c.fillRect(0, 0, W, W);
    if (cd.bgSrc && imgCache[cd.bgSrc]) {
      var im = imgCache[cd.bgSrc];
      var scale = Math.max(W / im.width, W / im.height);
      var dw = im.width * scale, dh = im.height * scale;
      c.drawImage(im, (W - dw) / 2, (W - dh) / 2, dw, dh);
    }
    if (collect) boundsMap = {};
    cd.layers.forEach(function (l) {
      var b = drawLayer(c, l);
      if (collect) boundsMap[l.id] = b;
    });
  }

  function drawOverlay() {
    octx.clearRect(0, 0, W, W);
    if (state.guides) {
      octx.save();
      octx.strokeStyle = 'rgba(90,67,214,0.22)';
      octx.lineWidth = 2;
      octx.setLineDash([9, 9]);
      [70, W - 70].forEach(function (v) {
        octx.beginPath(); octx.moveTo(v, 0); octx.lineTo(v, W); octx.stroke();
        octx.beginPath(); octx.moveTo(0, v); octx.lineTo(W, v); octx.stroke();
      });
      octx.restore();
    }
    activeGuides.forEach(function (g) {
      octx.save();
      octx.strokeStyle = '#F25C9B';
      octx.lineWidth = 2;
      octx.beginPath();
      if (g.axis === 'x') { octx.moveTo(g.at, 0); octx.lineTo(g.at, W); }
      else { octx.moveTo(0, g.at); octx.lineTo(W, g.at); }
      octx.stroke();
      octx.restore();
    });

    var l = current();
    if (!l) return;
    var b = boundsMap[l.id];
    if (!b) return;
    octx.save();
    if (l.rot) {
      octx.translate(b.x + b.w / 2, b.y + b.h / 2);
      octx.rotate(l.rot * Math.PI / 180);
      octx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    }
    octx.strokeStyle = '#5A43D6';
    octx.lineWidth = 3;
    octx.setLineDash([10, 7]);
    octx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    octx.setLineDash([]);
    octx.fillStyle = '#5A43D6';
    octx.strokeStyle = '#FFFFFF';
    octx.lineWidth = 3;
    octx.beginPath();
    octx.arc(b.x + b.w + 6, b.y + b.h + 6, 15, 0, Math.PI * 2);
    octx.fill();
    octx.stroke();
    octx.restore();
  }

  function render(skipDeck) {
    var cd = card();
    if (!cd) return;
    paintCard(ctx, cd, true);
    drawOverlay();
    renderLayerList();
    if (!skipDeck) renderDeck();
    saveDraft();
  }

  /* ---------- 카드 셋트(덱) ---------- */
  var deckBox = document.getElementById('labDeck');
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbCanvas.height = W;
  var thumbCtx = thumbCanvas.getContext('2d');

  function newCard(inherit) {
    return {
      id: 'C' + (seq++),
      bgSrc: inherit ? inherit.bgSrc : '',
      bgColor: inherit ? inherit.bgColor : '#FFFFFF',
      layers: []
    };
  }
  function addCard(copyLayers) {
    var src = card();
    var cd = newCard(src);
    if (copyLayers && src) {
      cd.layers = JSON.parse(JSON.stringify(src.layers)).map(function (l) {
        l.id = 'L' + (seq++);
        return l;
      });
    }
    state.cards.push(cd);
    state.cur = state.cards.length - 1;
    state.sel = cd.layers.length ? cd.layers[cd.layers.length - 1].id : null;
    syncPanel();
    render();
    toast(copyLayers ? '카드를 복제했습니다' : '같은 배경으로 카드를 추가했습니다');
  }
  function removeCard(i) {
    if (state.cards.length <= 1) { toast('마지막 한 장은 지울 수 없습니다'); return; }
    state.cards.splice(i, 1);
    state.cur = Math.max(0, Math.min(state.cur, state.cards.length - 1));
    state.sel = null;
    syncPanel();
    render();
  }
  function gotoCard(i) {
    state.cur = i;
    state.sel = null;
    syncPanel();
    render();
  }
  function renderDeck() {
    deckBox.innerHTML = '';
    state.cards.forEach(function (cd, i) {
      var item = document.createElement('div');
      item.className = 'deck-item' + (i === state.cur ? ' is-on' : '');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck-face';
      btn.setAttribute('aria-label', '카드 ' + (i + 1) + ' 편집');
      var cv = document.createElement('canvas');
      cv.width = cv.height = 168;
      paintCard(thumbCtx, cd, false);
      cv.getContext('2d').drawImage(thumbCanvas, 0, 0, 168, 168);
      btn.appendChild(cv);
      btn.addEventListener('click', function () { gotoCard(i); });

      var bar = document.createElement('div');
      bar.className = 'deck-bar';
      var name = document.createElement('span');
      name.textContent = '카드 ' + (i + 1);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'deck-del';
      del.textContent = '×';
      del.title = '이 카드 삭제';
      del.setAttribute('aria-label', '카드 ' + (i + 1) + ' 삭제');
      del.addEventListener('click', function (e) { e.stopPropagation(); removeCard(i); });
      bar.appendChild(name);
      bar.appendChild(del);

      item.appendChild(btn);
      item.appendChild(bar);
      deckBox.appendChild(item);
    });

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'deck-add';
    add.innerHTML = '<span class="deck-plus">＋</span><span>카드 추가<em>같은 배경으로</em></span>';
    add.addEventListener('click', function () { addCard(false); });
    deckBox.appendChild(add);

    document.getElementById('labDeckCount').textContent = state.cards.length + '장';
  }

  /* ---------- 레이어 ---------- */
  function addText(presetId) {
    var cd = card();
    var p = PRESETS[presetId];
    var l = {
      id: 'L' + (seq++), type: 'text', preset: presetId,
      text: presetId === 'cta' ? '무료 크레딧 받고 시작하기' : (presetId === 'sub' ? '서브 카피를 입력하세요' : '문구를 입력하세요'),
      x: 70, y: 120 + (cd.layers.length % 6) * 40, rot: p.rot || 0,
      size: p.size, weight: p.weight, color: p.color, sp: p.sp, italic: !!p.italic,
      align: 'left', font: 'pretendard', alpha: 1,
      box: p.box || 'none', fill: p.fill || '', stroke: p.stroke || '',
      shadow: p.shadow || '', underline: p.underline || '', glow: p.glow || '', marker: p.marker || '',
      shadowBox: presetId === 'cta'
    };
    cd.layers.push(l);
    state.sel = l.id;
    syncPanel();
    render();
  }
  function addImage(src, width) {
    return loadImage(src).then(function () {
      var cd = card();
      var l = { id: 'L' + (seq++), type: 'image', src: src, x: 120, y: 480, w: width || 420, rot: 0, alpha: 1 };
      cd.layers.push(l);
      state.sel = l.id;
      syncPanel();
      render();
    });
  }
  function removeLayer() {
    var cd = card();
    var l = current();
    if (!l) return;
    cd.layers = cd.layers.filter(function (x) { return x.id !== l.id; });
    state.sel = cd.layers.length ? cd.layers[cd.layers.length - 1].id : null;
    syncPanel();
    render();
  }
  function duplicateLayer() {
    var cd = card();
    var l = current();
    if (!l) return;
    var copy = JSON.parse(JSON.stringify(l));
    copy.id = 'L' + (seq++);
    copy.x += 28; copy.y += 28;
    cd.layers.push(copy);
    state.sel = copy.id;
    syncPanel();
    render();
  }
  function moveOrder(step) {
    var cd = card();
    var i = cd.layers.findIndex(function (l) { return l.id === state.sel; });
    var j = i + step;
    if (i < 0 || j < 0 || j >= cd.layers.length) return;
    var t = cd.layers[i];
    cd.layers[i] = cd.layers[j];
    cd.layers[j] = t;
    render();
  }

  /* ---------- 포인터 ---------- */
  function toCanvas(e) {
    var r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (W / r.height) };
  }
  function localPoint(l, pt) {
    var b = boundsMap[l.id];
    if (!b) return pt;
    if (!l.rot) return pt;
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var a = -l.rot * Math.PI / 180;
    var dx = pt.x - cx, dy = pt.y - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function hitHandle(pt) {
    var l = current();
    if (!l) return false;
    var b = boundsMap[l.id];
    if (!b) return false;
    var p = localPoint(l, pt);
    return Math.hypot(p.x - (b.x + b.w + 6), p.y - (b.y + b.h + 6)) <= 20;
  }
  function hitLayer(pt) {
    var cd = card();
    for (var i = cd.layers.length - 1; i >= 0; i--) {
      var l = cd.layers[i];
      var b = boundsMap[l.id];
      if (!b) continue;
      var p = localPoint(l, pt);
      if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) return l;
    }
    return null;
  }
  var SNAP = 10;
  function applySnap(l) {
    activeGuides = [];
    var b = boundsMap[l.id];
    if (!b || l.rot) return;
    var targets = [70, W / 2, W - 70];
    var edgesX = [{ v: l.x, off: 0 }, { v: l.x + b.w / 2, off: b.w / 2 }, { v: l.x + b.w, off: b.w }];
    var edgesY = [{ v: l.y, off: 0 }, { v: l.y + b.h / 2, off: b.h / 2 }, { v: l.y + b.h, off: b.h }];
    targets.forEach(function (t) {
      edgesX.forEach(function (e) {
        if (Math.abs(e.v - t) <= SNAP) { l.x = Math.round(t - e.off); activeGuides.push({ axis: 'x', at: t }); }
      });
      edgesY.forEach(function (e) {
        if (Math.abs(e.v - t) <= SNAP) { l.y = Math.round(t - e.off); activeGuides.push({ axis: 'y', at: t }); }
      });
    });
  }
  stage.addEventListener('pointerdown', function (e) {
    var pt = toCanvas(e);
    if (hitHandle(pt)) {
      var l0 = current();
      var b0 = boundsMap[l0.id];
      dragging = { mode: 'resize', id: l0.id, start: pt, size: l0.size, w: l0.w, base: Math.max(b0.w, b0.h) };
    } else {
      var l = hitLayer(pt);
      if (!l) { state.sel = null; syncPanel(); render(true); return; }
      state.sel = l.id;
      dragging = { mode: 'move', id: l.id, dx: pt.x - l.x, dy: pt.y - l.y };
      syncPanel();
      render(true);
    }
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', function (e) {
    var pt = toCanvas(e);
    if (!dragging) {
      stage.style.cursor = hitHandle(pt) ? 'nwse-resize' : (hitLayer(pt) ? 'move' : 'default');
      return;
    }
    var cd = card();
    var l = cd.layers.filter(function (x) { return x.id === dragging.id; })[0];
    if (!l) return;
    if (dragging.mode === 'move') {
      l.x = Math.round(pt.x - dragging.dx);
      l.y = Math.round(pt.y - dragging.dy);
      applySnap(l);
    } else {
      var delta = (pt.x - dragging.start.x + pt.y - dragging.start.y) / 2;
      var factor = 1 + delta / Math.max(120, dragging.base);
      if (l.type === 'image') l.w = Math.max(40, Math.round(dragging.w * factor));
      else l.size = Math.max(10, Math.round(dragging.size * factor));
    }
    syncPanel();
    paintCard(ctx, cd, true);
    drawOverlay();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = null;
    activeGuides = [];
    stage.classList.remove('is-dragging');
    if (e && e.pointerId != null && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    render();
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    var l = current();
    if (!l) return;
    var step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') l.x -= step;
    else if (e.key === 'ArrowRight') l.x += step;
    else if (e.key === 'ArrowUp') l.y -= step;
    else if (e.key === 'ArrowDown') l.y += step;
    else if (e.key === 'Delete' || e.key === 'Backspace') { removeLayer(); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    syncPanel();
    render();
  });

  /* ---------- 패널 ---------- */
  var el = {};
  ['labText', 'labPreset', 'labFont', 'labSize', 'labSizeN', 'labColor', 'labSp', 'labSpN',
    'labWeight', 'labX', 'labY', 'labRot', 'labRotN', 'labAlpha', 'labAlphaN', 'labBox', 'labFill', 'labStroke',
    'labLayers', 'labSelName', 'labTextBlock', 'labImageBlock', 'labWidth', 'labWidthN', 'labNoSel', 'labCommonBlock'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  function fillSelect(node, items) {
    node.innerHTML = items.map(function (it) { return '<option value="' + it.v + '">' + it.t + '</option>'; }).join('');
  }
  fillSelect(el.labPreset, PRESET_ORDER.map(function (k) { return { v: k, t: PRESETS[k].label }; }));
  fillSelect(el.labFont, FONTS.map(function (f) { return { v: f.id, t: f.label }; }));
  fillSelect(el.labWeight, [400, 500, 600, 700, 800, 900].map(function (w) { return { v: w, t: w + ' 굵기' }; }));
  fillSelect(el.labBox, [{ v: 'none', t: '없음' }, { v: 'pill', t: '알약 배경' }, { v: 'sticker', t: '스티커 박스' }]);

  function syncPanel() {
    var l = current();
    var isText = !!l && l.type === 'text';
    var isImage = !!l && l.type === 'image';
    el.labNoSel.hidden = !!l;
    el.labTextBlock.hidden = !isText;
    el.labImageBlock.hidden = !isImage;
    el.labCommonBlock.hidden = !l;
    document.getElementById('labCardNow').textContent = '카드 ' + (state.cur + 1) + ' / ' + state.cards.length;
    if (!l) { el.labSelName.textContent = '선택 없음'; return; }

    el.labSelName.textContent = isText ? ('텍스트 · ' + (PRESETS[l.preset] ? PRESETS[l.preset].label : '사용자')) : '이미지';
    el.labX.value = Math.round(l.x);
    el.labY.value = Math.round(l.y);
    el.labRot.value = el.labRotN.value = l.rot || 0;
    var alpha = Math.round((l.alpha == null ? 1 : l.alpha) * 100);
    el.labAlpha.value = alpha;
    el.labAlphaN.textContent = alpha + '%';

    if (isText) {
      if (document.activeElement !== el.labText) el.labText.value = l.text;
      el.labPreset.value = l.preset || 'head';
      el.labFont.value = l.font;
      el.labSize.value = el.labSizeN.value = l.size;
      el.labColor.value = l.color;
      el.labSp.value = el.labSpN.value = Math.round(l.sp * 1000);
      el.labWeight.value = String(l.weight);
      el.labBox.value = l.box || 'none';
      el.labFill.value = l.fill || '#FFFFFF';
      el.labStroke.value = l.stroke || '#241C14';
      document.querySelectorAll('[data-align]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.align === l.align); });
      document.querySelectorAll('[data-fx]').forEach(function (b) { b.classList.toggle('is-on', !!l[b.dataset.fx]); });
    }
    if (isImage) el.labWidth.value = el.labWidthN.value = l.w;
  }

  function onField(node, fn) {
    if (!node) return;
    node.addEventListener('input', function () {
      var l = current();
      if (!l) return;
      fn(l, node.value);
      syncPanel();
      render();
    });
  }
  onField(el.labText, function (l, v) { l.text = v; });
  onField(el.labFont, function (l, v) { l.font = v; });
  onField(el.labColor, function (l, v) { l.color = v; });
  onField(el.labWeight, function (l, v) { l.weight = parseInt(v, 10); });
  onField(el.labBox, function (l, v) {
    l.box = v;
    if (v === 'pill' && !l.fill) l.fill = '#F0EEFF';
    if (v === 'sticker') { if (!l.fill) l.fill = '#FFFFFF'; l.stroke = l.stroke || '#241C14'; }
  });
  onField(el.labFill, function (l, v) { l.fill = v; });
  onField(el.labStroke, function (l, v) { l.stroke = v; });
  onField(el.labX, function (l, v) { l.x = parseInt(v, 10) || 0; });
  onField(el.labY, function (l, v) { l.y = parseInt(v, 10) || 0; });
  onField(el.labAlpha, function (l, v) { l.alpha = Math.min(100, Math.max(0, parseInt(v, 10) || 0)) / 100; });
  [[el.labSize, el.labSizeN], [el.labSp, el.labSpN], [el.labRot, el.labRotN], [el.labWidth, el.labWidthN]].forEach(function (pair) {
    pair.forEach(function (node) {
      if (!node) return;
      node.addEventListener('input', function () {
        var l = current();
        if (!l) return;
        var v = parseFloat(node.value);
        if (isNaN(v)) return;
        if (pair[0] === el.labSize) l.size = Math.max(8, v);
        else if (pair[0] === el.labSp) l.sp = v / 1000;
        else if (pair[0] === el.labRot) l.rot = v;
        else l.w = Math.max(20, v);
        syncPanel();
        render();
      });
    });
  });
  el.labPreset.addEventListener('change', function () {
    var l = current();
    if (!l || l.type !== 'text') return;
    var p = PRESETS[el.labPreset.value];
    l.preset = el.labPreset.value;
    l.size = p.size; l.weight = p.weight; l.color = p.color; l.sp = p.sp; l.italic = !!p.italic;
    l.box = p.box || 'none'; l.fill = p.fill || ''; l.stroke = p.stroke || '';
    l.shadow = p.shadow || ''; l.underline = p.underline || ''; l.glow = p.glow || ''; l.marker = p.marker || '';
    l.rot = p.rot || 0;
    l.shadowBox = el.labPreset.value === 'cta';
    syncPanel();
    render();
  });
  document.querySelectorAll('[data-align]').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = current();
      if (!l) return;
      l.align = b.dataset.align;
      syncPanel();
      render();
    });
  });
  var FX_DEFAULT = { italic: true, shadow: '#D7D0FF', underline: '#9A8BFF', glow: 'rgba(124,107,255,0.75)', marker: '#FFE27A' };
  document.querySelectorAll('[data-fx]').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = current();
      if (!l) return;
      var k = b.dataset.fx;
      l[k] = l[k] ? (k === 'italic' ? false : '') : FX_DEFAULT[k];
      syncPanel();
      render();
    });
  });

  function renderLayerList() {
    var cd = card();
    var box = el.labLayers;
    if (!cd.layers.length) {
      box.innerHTML = '<p class="studio-empty">이 카드에는 아직 요소가 없습니다.<br>위의 <b>글자 넣기</b>나 <b>이미지 넣기</b>로 시작하세요.</p>';
      return;
    }
    box.innerHTML = cd.layers.slice().reverse().map(function (l) {
      var name = l.type === 'text' ? (l.text || '').split('\n')[0].slice(0, 22) : l.src.split('/').pop();
      return '<button type="button" class="studio-layer' + (l.id === state.sel ? ' is-on' : '') + '" data-lid="' + l.id + '">' +
        '<span class="lk">' + (l.type === 'text' ? '글자' : '이미지') + '</span>' +
        '<span class="lt">' + escapeHtml(name || '(빈 텍스트)') + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-lid]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.sel = b.dataset.lid;
        syncPanel();
        render(true);
      });
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 이미지 고르기 · 업로드 ---------- */
  var picker = document.getElementById('labPicker');
  var pickerGrid = document.getElementById('labPickerGrid');
  var pickerTitle = document.getElementById('labPickerTitle');
  var pickerMode = 'bg';
  var pickerTab = 'bg';
  var pickerApplyAll = document.getElementById('labPickerAll');

  function openPicker(mode) {
    pickerMode = mode;
    pickerTab = mode === 'bg' ? 'bg' : 'brand';
    pickerTitle.textContent = mode === 'bg' ? '배경으로 쓸 이미지' : '카드에 넣을 이미지';
    pickerApplyAll.hidden = mode !== 'bg';
    drawPicker();
    picker.hidden = false;
  }
  function drawPicker() {
    document.querySelectorAll('[data-ptab]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.ptab === pickerTab); });
    pickerGrid.innerHTML = GALLERY[pickerTab].map(function (it) {
      return '<button type="button" class="picker-item" data-src="' + it.src + '">' +
        '<img src="' + it.src + '" alt="" loading="lazy"><span>' + it.label + '</span></button>';
    }).join('');
    pickerGrid.querySelectorAll('[data-src]').forEach(function (b) {
      b.addEventListener('click', function () {
        var src = b.dataset.src;
        picker.hidden = false;
        if (pickerMode === 'bg') setBackground(src, pickerApplyAll.querySelector('input').checked);
        else addImage(src, src.indexOf('logo') > -1 ? 300 : 620);
        picker.hidden = true;
      });
    });
  }
  document.querySelectorAll('[data-ptab]').forEach(function (b) {
    b.addEventListener('click', function () { pickerTab = b.dataset.ptab; drawPicker(); });
  });
  document.getElementById('labPickerClose').addEventListener('click', function () { picker.hidden = true; });
  picker.addEventListener('click', function (e) { if (e.target === picker) picker.hidden = true; });

  function setBackground(src, all) {
    loadImage(src).then(function () {
      if (all) state.cards.forEach(function (c) { c.bgSrc = src; });
      else card().bgSrc = src;
      render();
      toast(all ? '셋트 전체 배경을 바꿨습니다' : '배경을 바꿨습니다');
    });
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  document.getElementById('labBgFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    readFile(f).then(function (src) { setBackground(src, false); });
    e.target.value = '';
  });
  document.getElementById('labImgFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    readFile(f).then(function (src) { addImage(src, 520); });
    e.target.value = '';
  });

  /* ---------- 저장 ---------- */
  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function cardBlob(cd) {
    return new Promise(function (resolve) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = W;
      paintCard(cv.getContext('2d'), cd, false);
      cv.toBlob(resolve, 'image/png');
    });
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // 최소 ZIP(무압축 store) — PNG는 이미 압축돼 있어 크기 손해가 없다.
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var crc = crc32(f.data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 파일명
      lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true);
      lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, f.data.length, true);
      lh.setUint32(22, f.data.length, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameBytes, f.data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true);
      ch.setUint16(14, 0, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, f.data.length, true);
      ch.setUint32(24, f.data.length, true);
      ch.setUint16(28, nameBytes.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameBytes);
      offset += 30 + nameBytes.length + f.data.length;
    });
    var centralSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  document.getElementById('labSave').addEventListener('click', function () {
    ensureImages().then(function () { return cardBlob(card()); }).then(function (blob) {
      saveBlob(blob, '교피-카드' + (state.cur + 1) + '-' + stamp() + '.png');
      toast('카드 ' + (state.cur + 1) + '장을 저장했습니다');
    });
  });
  document.getElementById('labSaveAll').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    ensureImages()
      .then(function () { return Promise.all(state.cards.map(cardBlob)); })
      .then(function (blobs) { return Promise.all(blobs.map(function (b) { return b.arrayBuffer(); })); })
      .then(function (buffers) {
        var s = stamp();
        var files = buffers.map(function (buf, i) {
          return { name: '교피-카드' + (i + 1) + '.png', data: new Uint8Array(buf) };
        });
        saveBlob(zipStore(files), '교피-캐러셀셋트-' + s + '.zip');
        toast(state.cards.length + '장을 ZIP으로 저장했습니다');
      })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------- 버튼 ---------- */
  document.getElementById('labPickBg').addEventListener('click', function () { openPicker('bg'); });
  document.getElementById('labPickImg').addEventListener('click', function () { openPicker('layer'); });
  document.getElementById('labUploadBg').addEventListener('click', function () { document.getElementById('labBgFile').click(); });
  document.getElementById('labUploadImg').addEventListener('click', function () { document.getElementById('labImgFile').click(); });
  document.getElementById('labAddText').addEventListener('click', function () { addText('head'); });
  document.getElementById('labAddAccent').addEventListener('click', function () { addText('accent'); });
  document.getElementById('labAddSub').addEventListener('click', function () { addText('sub'); });
  document.getElementById('labAddChip').addEventListener('click', function () { addText('credit'); });
  document.getElementById('labAddCta').addEventListener('click', function () { addText('cta'); });
  document.getElementById('labAddLogo').addEventListener('click', function () { addImage(LAB + 'logo.webp', 300); });
  document.getElementById('labDup').addEventListener('click', duplicateLayer);
  document.getElementById('labDel').addEventListener('click', removeLayer);
  document.getElementById('labUp').addEventListener('click', function () { moveOrder(1); });
  document.getElementById('labDown').addEventListener('click', function () { moveOrder(-1); });
  document.getElementById('labDupCard').addEventListener('click', function () { addCard(true); });
  document.getElementById('labBgColor').addEventListener('input', function (e) {
    card().bgColor = e.target.value;
    render();
  });
  document.getElementById('labBgClear').addEventListener('click', function () {
    card().bgSrc = '';
    render();
  });
  document.getElementById('labGuides').addEventListener('change', function (e) {
    state.guides = e.target.checked;
    drawOverlay();
    saveDraft();
  });
  document.getElementById('labReset').addEventListener('click', function () {
    if (!window.confirm('만들던 카드 ' + state.cards.length + '장을 모두 지울까요?')) return;
    state.cards = [newCard(null)];
    state.cur = 0;
    state.sel = null;
    syncPanel();
    render();
  });

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('labToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- 임시 저장 ---------- */
  function saveDraft() {
    try {
      var slim = JSON.stringify({ cards: state.cards, cur: state.cur, guides: state.guides, seq: seq });
      if (slim.length < 3500000) window.localStorage.setItem(DRAFT_KEY, slim);
    } catch (e) { /* 용량 초과 등은 무시 */ }
  }
  function loadDraft() {
    try {
      var raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.cards) || !d.cards.length) return false;
      state.cards = d.cards;
      state.cur = Math.min(d.cur || 0, d.cards.length - 1);
      state.guides = d.guides !== false;
      seq = d.seq || 100;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 시작 ---------- */
  function start() {
    if (!loadDraft()) {
      var cd = newCard(null);
      cd.bgSrc = LAB + 'bg-a1.webp';
      cd.layers = [
        {
          id: 'L' + (seq++), type: 'text', preset: 'head', text: 'AI로 시작한 글,', x: 70, y: 130, rot: 0,
          size: 66, weight: 900, color: '#151927', sp: -0.028, italic: false, align: 'left', font: 'pretendard',
          alpha: 1, box: 'none', fill: '', stroke: '', shadow: '', underline: '', glow: '', marker: ''
        },
        {
          id: 'L' + (seq++), type: 'text', preset: 'accent', text: '내 글답게 마무리.', x: 70, y: 212, rot: 0,
          size: 66, weight: 800, color: '#5A43D6', sp: -0.030, italic: true, align: 'left', font: 'pretendard',
          alpha: 1, box: 'none', fill: '', stroke: '', shadow: '#D7D0FF', underline: '#9A8BFF', glow: '', marker: ''
        }
      ];
      state.cards = [cd];
      state.cur = 0;
      state.sel = cd.layers[0].id;
    }
    document.getElementById('labGuides').checked = state.guides;
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.all([ensureImages(), fontsReady]).then(function () {
      syncPanel();
      render();
    });
  }
  start();
})();

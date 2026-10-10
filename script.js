(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const KEY = 'pixelPop.v1';
  const HEX = /^#[0-9a-f]{6}$/i;
  const COLORS = [
    '#000000', '#434343', '#9e9e9e', '#ffffff', '#ff2e93', '#ff5252',
    '#ff7a18', '#ffd600', '#b6ff3b', '#2ecc71', '#00e5ff', '#2d9cff',
    '#7b2ff7', '#c158ff', '#8d5524', '#f1c27d', '#ffb6c1', '#7fffd4',
    '#1b1464', '#0b6e4f', '#ffe9a8', '#ff9ecd', '#3f51b5', '#e53935'
  ];

  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const stage = $('#stage');
  const pal = $('#palette');

  let n = 16;
  let px = [];
  let color = '#ff2e93';
  let tool = 'draw';
  let down = false;
  let last = null;
  let undoStack = [];
  let redoStack = [];

  /* ---------- Saving ---------- */

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if ([8, 16, 32].includes(d.n) && Array.isArray(d.px) && d.px.length === d.n * d.n) {
        n = d.n;
        px = d.px.map((c) => (HEX.test(c) ? c.toLowerCase() : ''));
      }
      if (HEX.test(d.color)) color = d.color.toLowerCase();
      $('#optGrid').checked = d.grid !== false;
      $('#optMirror').checked = d.mirror === true;
    } catch (e) { /* first visit or blocked storage */ }
    if (px.length !== n * n) px = Array(n * n).fill('');
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        n, px, color, grid: $('#optGrid').checked, mirror: $('#optMirror').checked
      }));
    } catch (e) { /* storage blocked */ }
  }

  /* ---------- Drawing ---------- */

  function render() {
    cv.width = n;
    cv.height = n;
    ctx.clearRect(0, 0, n, n);
    px.forEach((c, i) => {
      if (c) { ctx.fillStyle = c; ctx.fillRect(i % n, Math.floor(i / n), 1, 1); }
    });
  }

  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * n);
    const y = Math.floor(((e.clientY - r.top) / r.height) * n);
    return x < 0 || y < 0 || x >= n || y >= n ? null : [x, y];
  }

  function put(x, y, c) {
    px[y * n + x] = c;
    if ($('#optMirror').checked) px[y * n + (n - 1 - x)] = c;
  }

  // Straight line between two cells so fast strokes leave no gaps
  function line(a, b, c) {
    let [x0, y0] = a;
    const [x1, y1] = b;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      put(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function flood(x, y, c) {
    const target = px[y * n + x];
    if (target === c) return;
    const todo = [[x, y]];
    while (todo.length) {
      const [cx, cy] = todo.pop();
      if (cx < 0 || cy < 0 || cx >= n || cy >= n || px[cy * n + cx] !== target) continue;
      px[cy * n + cx] = c;
      todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  /* ---------- Undo and redo ---------- */

  function buttons() {
    $('#undo').disabled = !undoStack.length;
    $('#redo').disabled = !redoStack.length;
  }
  function snapshot() {
    undoStack.push(px.slice());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
    buttons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(px.slice());
    px = undoStack.pop();
    render(); save(); buttons();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(px.slice());
    px = redoStack.pop();
    render(); save(); buttons();
  }

  /* ---------- Tools, colours, size ---------- */

  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool').forEach((b) => {
      const on = b.dataset.tool === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  function setColor(c) {
    color = c;
    $('#custom').value = c;
    $('#hex').textContent = c;
    $('#swatch').style.background = c;
    pal.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
    if (tool === 'erase') setTool('draw');
    save();
  }

  function applySize() {
    stage.style.setProperty('--n', n);
    document.querySelectorAll('.sizes button').forEach((b) => {
      b.setAttribute('aria-pressed', Number(b.dataset.size) === n);
    });
    render();
    buttons();
  }

  function setSize(s) {
    if (s === n) return;
    if (px.some(Boolean) && !confirm('Changing the grid size clears your drawing. Continue?')) return;
    n = s;
    px = Array(n * n).fill('');
    undoStack = [];
    redoStack = [];
    applySize();
    save();
  }

  /* ---------- Pointer input (mouse, touch and pen) ---------- */

  cv.addEventListener('pointerdown', (e) => {
    const p = cellAt(e);
    if (!p) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);

    if (tool === 'pick') {
      const c = px[p[1] * n + p[0]];
      if (c) setColor(c);
      setTool('draw');
      return;
    }

    snapshot();
    if (tool === 'fill') {
      flood(p[0], p[1], color);
      render();
      save();
      return;
    }
    down = true;
    last = p;
    line(p, p, tool === 'erase' ? '' : color);
    render();
  });

  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const p = cellAt(e);
    if (!p) return;
    line(last, p, tool === 'erase' ? '' : color);
    last = p;
    render();
  });

  const end = () => { if (down) { down = false; save(); } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  /* ---------- Buttons ---------- */

  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw';
    b.dataset.c = c;
    b.style.setProperty('--c', c);
    b.style.setProperty('--i', i);
    b.setAttribute('aria-label', 'Colour ' + c);
    b.addEventListener('click', () => setColor(c));
    pal.append(b);
  });

  document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('.sizes button').forEach((b) => b.addEventListener('click', () => setSize(Number(b.dataset.size))));
  $('#custom').addEventListener('input', (e) => setColor(e.target.value.toLowerCase()));
  $('#optGrid').addEventListener('change', (e) => { stage.classList.toggle('grid-on', e.target.checked); save(); });
  $('#optMirror').addEventListener('change', save);
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#clear').addEventListener('click', () => {
    if (!px.some(Boolean)) return;
    snapshot();
    px.fill('');
    render();
    save();
  });

  $('#download').addEventListener('click', () => {
    const out = document.createElement('canvas');
    out.width = 640;
    out.height = 640;
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, 0, 0, 640, 640);
    out.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pixel-art.png';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type="color"]')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (!mod && !e.altKey) {
      const t = { d: 'draw', e: 'erase', f: 'fill', i: 'pick' }[k];
      if (t) setTool(t);
    }
  });

  /* ---------- Start ---------- */

  load();
  stage.classList.toggle('grid-on', $('#optGrid').checked);
  setColor(color);
  applySize();

  /* ---------- Starting page ---------- */

  const home = $('#home');
  const app = $('.app');

  function homeInfo() {
    $('#start').textContent = px.some(Boolean) ? 'Continue drawing' : 'Start drawing';
  }
  $('#start').addEventListener('click', () => { home.hidden = true; app.hidden = false; });
  $('#menu').addEventListener('click', () => {
    app.hidden = true;
    home.hidden = false;
    homeInfo();
    $('#start').focus();
  });
  homeInfo();

  // A heart that draws itself, pixel by pixel
  const HEART = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'];
  const sprite = $('#sprite');
  HEART.forEach((row, y) => [...row].forEach((v) => {
    const i = document.createElement('i');
    if (v === '1') {
      i.style.setProperty('--h', 330 - y * 12);
      i.style.setProperty('--d', Math.floor(Math.random() * 900));
    } else {
      i.className = 'off';
    }
    sprite.append(i);
  }));
})();
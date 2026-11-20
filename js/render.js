/* ============================================================
 * 钢铁洪流 · Canvas 渲染
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const H = SG.hex, D = SG.data;
  const F = D.FACTIONS, U = D.UNITS, T = D.TERRAIN;

  const SIZE = 42;
  const SQRT3 = Math.sqrt(3);

  const PAL = {
    sea: '#2b4457', seaDeep: '#22394a', seaLight: '#3d6076',
    plains: '#a49b6c', plainsDark: '#948c60',
    forest: '#6d7d52', forestDark: '#3f5038', forestTree: '#455a3c',
    hills: '#b09c68', hillsDark: '#8b7a4f',
    mountain: '#918b7e', mountainDark: '#6a655c', snow: '#d6d0c2',
    river: '#4d7185', riverLight: '#7da6b8',
    city: '#918b7c', cityDark: '#615c51', building: '#7c7466', roof: '#8d5f45',
    grid: 'rgba(32, 30, 22, 0.22)',
    coast: 'rgba(160, 200, 220, 0.20)'
  };

  let canvas, ctx, dpr = 1, vw = 0, vh = 0;
  let state = null;
  const cam = { x: 0, y: 0, zoom: 0.8, tx: 0, ty: 0, tz: 0.8, smooth: true };
  const anims = new Map();
  const fx = [];
  let view = { reach: null, targets: new Set(), hover: null, selectedUnit: null, path: null, selectedCity: null };
  let hoverQ = null, hoverR = null;
  let bootTime = performance.now();

  /* ---------------- 工具 ---------------- */
  function hash(q, r, s) {
    let n = (q | 0) * 374761393 + (r | 0) * 668265263 + (s | 0) * 1013904223;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }
  function worldOf(q, r) { return H.hexToPixel(q, r, SIZE); }
  function toScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.zoom + vw / 2, y: (wy - cam.y) * cam.zoom + vh / 2 };
  }
  function hexScreen(q, r) {
    const w = worldOf(q, r);
    return toScreen(w.x, w.y);
  }
  function hexPath(cx, cy, rad) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------------- 初始化 ---------------- */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    vw = r.width; vh = r.height;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }
  function setState(s) { state = s; }
  function setView(v) { view = Object.assign(view, v); }

  /* ---------------- 相机 ---------------- */
  function bounds() {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const k in state.grid) {
      const t = state.grid[k];
      const w = worldOf(t.q, t.r);
      minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
      minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
    }
    const pad = SIZE * 1.4;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }
  function fit(instant) {
    if (!state) return;
    const b = bounds();
    const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    const z = Math.max(0.16, Math.min(1.05, Math.min(vw / bw, vh / bh)));
    cam.tx = (b.minX + b.maxX) / 2;
    cam.ty = (b.minY + b.maxY) / 2;
    cam.tz = z;
    if (instant) { cam.x = cam.tx; cam.y = cam.ty; cam.zoom = cam.tz; }
  }
  function centerOn(q, r) {
    const w = worldOf(q, r);
    cam.tx = w.x; cam.ty = w.y;
  }
  function pan(dx, dy) {
    cam.tx -= dx / cam.zoom;
    cam.ty -= dy / cam.zoom;
    cam.x = cam.tx; cam.y = cam.ty;
  }
  function zoomAt(px, py, factor) {
    const before = screenToWorld(px, py);
    const z = Math.max(0.32, Math.min(2.2, cam.tz * factor));
    cam.tz = z;
    cam.x = cam.tx = before.x - (px - vw / 2) / z;
    cam.y = cam.ty = before.y - (py - vh / 2) / z;
  }
  function screenToWorld(px, py) {
    return { x: (px - vw / 2) / cam.zoom + cam.x, y: (py - vh / 2) / cam.zoom + cam.y };
  }
  function screenToHex(px, py) {
    const w = screenToWorld(px, py);
    return H.pixelToHex(w.x, w.y, SIZE);
  }

  /* ---------------- 动效 ---------------- */
  function animateUnit(unit, fromQ, fromR, dur) {
    if (!unit) return;
    const a = worldOf(fromQ, fromR), b = worldOf(unit.q, unit.r);
    anims.set(unit.id, { fx: a.x, fy: a.y, tx: b.x, ty: b.y, t0: performance.now(), dur: dur || 220 });
  }
  function floatText(q, r, text, color) {
    const w = worldOf(q, r);
    fx.push({ type: 'text', x: w.x, y: w.y - SIZE * 0.5, text, color: color || '#ffe9b8', t0: performance.now(), life: 1300 });
  }
  function boom(q, r, color) {
    const w = worldOf(q, r);
    fx.push({ type: 'boom', x: w.x, y: w.y, color: color || '#ffb454', t0: performance.now(), life: 520 });
  }
  function tracer(aq, ar, bq, br, color) {
    const a = worldOf(aq, ar), b = worldOf(bq, br);
    fx.push({ type: 'tracer', x: a.x, y: a.y, x2: b.x, y2: b.y, color: color || '#ffd27a', t0: performance.now(), life: 260 });
  }
  function flash(q, r, color) {
    const w = worldOf(q, r);
    fx.push({ type: 'flash', x: w.x, y: w.y, color: color || 'rgba(255,220,140,0.5)', t0: performance.now(), life: 420 });
  }
  function clearFx() { fx.length = 0; anims.clear(); }

  /* ---------------- 绘制：地形 ---------------- */
  function drawHexBase(t) {
    const p = hexScreen(t.q, t.r);
    const rad = SIZE * cam.zoom + 0.6;
    if (p.x < -rad || p.x > vw + rad || p.y < -rad || p.y > vh + rad) return;

    const terr = t.t;
    let fill = PAL.plains;
    if (terr === 'water') fill = PAL.sea;
    else if (terr === 'forest') fill = PAL.forest;
    else if (terr === 'hills') fill = PAL.hills;
    else if (terr === 'mountain') fill = PAL.mountain;
    else if (terr === 'river') fill = PAL.river;
    else if (terr === 'city') fill = PAL.city;

    // 海面用较暗的底色、陆地稍微亮一点，形成海岸对比
    hexPath(p.x, p.y, rad);
    ctx.fillStyle = fill;
    ctx.fill();

    const detail = cam.zoom > 0.42;
    if (detail) {
      if (terr === 'plains') drawPlains(p, t);
      else if (terr === 'forest') drawForest(p, t);
      else if (terr === 'hills') drawHills(p, t);
      else if (terr === 'mountain') drawMountain(p, t);
      else if (terr === 'river') { drawRiver(p, t); if (t.bridge) drawBridge(p, t); }
      else if (terr === 'water') drawWater(p, t);
    }

    if (state) {
      const fort = state.forts.find(f => f.q === t.q && f.r === t.r);
      if (fort) drawFort(p, fort);
    }

    hexPath(p.x, p.y, rad);
    ctx.lineWidth = 1;
    ctx.strokeStyle = terr === 'water' ? 'rgba(15, 35, 48, 0.35)' : PAL.grid;
    ctx.stroke();
  }

  function drawFort(p, fort) {
    const s = SIZE * cam.zoom;
    const fd = state ? SG.game.forceData(state, fort.faction) : F[fort.faction];
    const col = fd ? fd.color : '#d8c090';
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.strokeStyle = col;
    ctx.fillStyle = 'rgba(24, 24, 20, 0.55)';
    if (fort.type === 'mine') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * s * 0.13, p.y + Math.sin(a) * s * 0.13);
        ctx.lineTo(p.x + Math.cos(a) * s * 0.24, p.y + Math.sin(a) * s * 0.24);
        ctx.stroke();
      }
    } else if (fort.type === 'wire') {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + i * s * 0.09, p.y - s * 0.2);
        ctx.lineTo(p.x + i * s * 0.09, p.y + s * 0.2);
        ctx.stroke();
      }
      for (const dx of [-0.18, 0, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(p.x + s * dx, p.y - s * 0.16);
        ctx.lineTo(p.x + s * dx + s * 0.12, p.y + s * 0.16);
        ctx.moveTo(p.x + s * dx, p.y + s * 0.16);
        ctx.lineTo(p.x + s * dx + s * 0.12, p.y - s * 0.16);
        ctx.stroke();
      }
    } else if (fort.type === 'trap') {
      for (let i = -1; i <= 1; i++) {
        const x = p.x + i * s * 0.18;
        ctx.beginPath();
        ctx.moveTo(x, p.y + s * 0.18);
        ctx.lineTo(x + s * 0.1, p.y - s * 0.06);
        ctx.lineTo(x + s * 0.2, p.y + s * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (fort.type === 'trench') {
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.28, p.y - s * 0.12);
      ctx.lineTo(p.x - s * 0.12, p.y + s * 0.12);
      ctx.lineTo(p.x + s * 0.04, p.y - s * 0.12);
      ctx.lineTo(p.x + s * 0.2, p.y + s * 0.12);
      ctx.lineTo(p.x + s * 0.32, p.y - s * 0.04);
      ctx.stroke();
    } else if (fort.type === 'aa') {
      ctx.beginPath();
      ctx.arc(p.x, p.y + s * 0.12, s * 0.22, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.12);
      ctx.lineTo(p.x, p.y - s * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y - s * 0.24, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlains(p, t) {
    const s = SIZE * cam.zoom;
    ctx.strokeStyle = 'rgba(80, 72, 42, 0.20)';
    ctx.lineWidth = Math.max(1, s * 0.018);
    for (let i = 0; i < 3; i++) {
      const a = hash(t.q, t.r, i + 3) * 6.283;
      const d = hash(t.q, t.r, i + 9) * 0.5 + 0.12;
      const x = p.x + Math.cos(a) * s * d, y = p.y + Math.sin(a) * s * d * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.05);
      ctx.lineTo(x - s * 0.025, y - s * 0.03);
      ctx.moveTo(x, y + s * 0.05);
      ctx.lineTo(x + s * 0.03, y - s * 0.02);
      ctx.stroke();
    }
  }

  function drawForest(p, t) {
    const s = SIZE * cam.zoom;
    for (let i = 0; i < 4; i++) {
      const a = hash(t.q, t.r, i + 20) * 6.283;
      const d = hash(t.q, t.r, i + 40) * 0.44 + 0.06;
      const x = p.x + Math.cos(a) * s * d * 0.85;
      const y = p.y + Math.sin(a) * s * d * 0.7;
      const h = s * (0.20 + hash(t.q, t.r, i + 60) * 0.08);
      ctx.fillStyle = i % 2 ? PAL.forestTree : PAL.forestDark;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h * 0.52, y + h * 0.55);
      ctx.lineTo(x - h * 0.52, y + h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(50, 38, 24, 0.55)';
      ctx.fillRect(x - s * 0.012, y + h * 0.45, s * 0.024, s * 0.09);
    }
  }

  function drawHills(p, t) {
    const s = SIZE * cam.zoom;
    ctx.strokeStyle = 'rgba(105, 90, 54, 0.5)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    for (let i = 0; i < 2; i++) {
      const ox = (hash(t.q, t.r, i + 70) - 0.5) * s * 0.5;
      const oy = (hash(t.q, t.r, i + 80) - 0.5) * s * 0.35 + s * 0.12;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, s * (0.28 - i * 0.07), Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120, 102, 60, 0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.18, s * 0.44, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMountain(p, t) {
    const s = SIZE * cam.zoom;
    const peaks = [
      { x: -s * 0.22, y: s * 0.22, h: s * 0.62 },
      { x: s * 0.26, y: s * 0.26, h: s * 0.46 }
    ];
    for (const pk of peaks) {
      const bx = p.x + pk.x, by = p.y + pk.y, h = pk.h;
      ctx.fillStyle = PAL.mountainDark;
      ctx.beginPath();
      ctx.moveTo(bx, by - h);
      ctx.lineTo(bx + h * 0.72, by + h * 0.18);
      ctx.lineTo(bx - h * 0.72, by + h * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PAL.snow;
      ctx.beginPath();
      ctx.moveTo(bx, by - h);
      ctx.lineTo(bx + h * 0.18, by - h * 0.62);
      ctx.lineTo(bx - h * 0.17, by - h * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(55, 50, 42, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by - h);
      ctx.lineTo(bx, by + h * 0.16);
      ctx.stroke();
    }
  }

  function drawRiver(p, t) {
    // 河流本体由地块底色连续填充；不再向格中心画线，避免看起来被切断
    const s = SIZE * cam.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(183, 213, 226, 0.34)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    for (const dy of [-0.26, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.26, p.y + s * dy);
      ctx.quadraticCurveTo(p.x - s * 0.12, p.y + s * (dy - 0.04), p.x + s * 0.02, p.y + s * dy);
      ctx.moveTo(p.x + s * 0.12, p.y + s * (dy + 0.03));
      ctx.quadraticCurveTo(p.x + s * 0.24, p.y + s * (dy - 0.01), p.x + s * 0.36, p.y + s * (dy + 0.03));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBridge(p, t) {
    const s = SIZE * cam.zoom;
    const half = s * 0.9;
    ctx.save();
    // 桥下阴影
    ctx.fillStyle = 'rgba(12, 18, 22, 0.34)';
    ctx.fillRect(p.x - half, p.y + s * 0.13, half * 2, s * 0.17);
    // 桥洞
    ctx.fillStyle = 'rgba(17, 27, 34, 0.78)';
    ctx.beginPath();
    ctx.arc(p.x, p.y + s * 0.12, s * 0.22, Math.PI, 0);
    ctx.lineTo(p.x + s * 0.22, p.y + s * 0.24);
    ctx.lineTo(p.x - s * 0.22, p.y + s * 0.24);
    ctx.closePath();
    ctx.fill();
    // 两端桥台，压到河岸
    ctx.fillStyle = '#7d6b53';
    ctx.strokeStyle = '#4f4232';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.fillRect(p.x - half, p.y - s * 0.06, s * 0.16, s * 0.42);
    ctx.strokeRect(p.x - half, p.y - s * 0.06, s * 0.16, s * 0.42);
    ctx.fillRect(p.x + half - s * 0.16, p.y - s * 0.06, s * 0.16, s * 0.42);
    ctx.strokeRect(p.x + half - s * 0.16, p.y - s * 0.06, s * 0.16, s * 0.42);
    // 石桥面：横跨整格，连接两岸
    ctx.fillStyle = '#cdbb97';
    ctx.strokeStyle = '#4f4232';
    ctx.lineWidth = Math.max(1.2, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(p.x - half, p.y - s * 0.10);
    ctx.quadraticCurveTo(p.x, p.y - s * 0.28, p.x + half, p.y - s * 0.10);
    ctx.lineTo(p.x + half, p.y + s * 0.10);
    ctx.quadraticCurveTo(p.x, p.y - s * 0.03, p.x - half, p.y + s * 0.10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 桥板纹理
    ctx.strokeStyle = 'rgba(79, 66, 50, 0.45)';
    ctx.lineWidth = Math.max(0.8, s * 0.016);
    for (let i = -6; i <= 6; i++) {
      const x = p.x + i * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, p.y - s * 0.08);
      ctx.lineTo(x, p.y + s * 0.08);
      ctx.stroke();
    }
    // 上护栏与立柱
    ctx.strokeStyle = '#8f7652';
    ctx.lineWidth = Math.max(1.4, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(p.x - half, p.y - s * 0.10);
    ctx.quadraticCurveTo(p.x, p.y - s * 0.28, p.x + half, p.y - s * 0.10);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const x = p.x + i * s * 0.26;
      ctx.beginPath();
      ctx.moveTo(x, p.y - s * 0.20);
      ctx.lineTo(x, p.y - s * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWater(p, t) {
    const s = SIZE * cam.zoom;
    ctx.strokeStyle = 'rgba(150, 195, 215, 0.22)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    for (let i = 0; i < 2; i++) {
      const a = hash(t.q, t.r, i + 100) * 6.283;
      const d = hash(t.q, t.r, i + 120) * 0.35 + 0.08;
      const x = p.x + Math.cos(a) * s * d;
      const y = p.y + Math.sin(a) * s * d;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.12, y);
      ctx.quadraticCurveTo(x, y - s * 0.05, x + s * 0.12, y);
      ctx.stroke();
    }
  }

  /* ---------------- 绘制：城市 ---------------- */
  function drawCity(city) {
    const p = hexScreen(city.q, city.r);
    const s = SIZE * cam.zoom;
    const rad = s * 0.86;
    if (p.x < -rad || p.x > vw + rad || p.y < -rad || p.y > vh + rad) return;

    ctx.save();
    hexPath(p.x, p.y, s * 0.78);
    ctx.fillStyle = 'rgba(52, 48, 40, 0.30)';
    ctx.fill();

    const n = city.capital ? 4 : 3;
    const seed = city.id.charCodeAt(0) + city.id.length * 7;

    if (city.kind === 'airport') {
      // 跑道 + 塔台
      ctx.fillStyle = '#5b5850';
      ctx.fillRect(p.x - s * 0.58, p.y - s * 0.12, s * 1.16, s * 0.24);
      ctx.strokeStyle = '#c9c2ad';
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.setLineDash([s * 0.12, s * 0.1]);
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.48, p.y - s * 0.02);
      ctx.lineTo(p.x + s * 0.48, p.y - s * 0.02);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8a8272';
      ctx.fillRect(p.x - s * 0.48, p.y + s * 0.04, s * 0.96, s * 0.04);
      ctx.fillStyle = '#6f6654';
      ctx.fillRect(p.x + s * 0.28, p.y - s * 0.48, s * 0.12, s * 0.30);
      ctx.fillStyle = '#a99a78';
      ctx.fillRect(p.x + s * 0.24, p.y - s * 0.54, s * 0.20, s * 0.08);
      ctx.fillStyle = 'rgba(235, 220, 180, 0.55)';
      ctx.fillRect(p.x + s * 0.31, p.y - s * 0.44, s * 0.05, s * 0.05);
    } else if (city.kind === 'village') {
      // 两间农舍 + 草顶
      for (let i = 0; i < 2; i++) {
        const bx = p.x + (i === 0 ? -s * 0.16 : s * 0.14);
        const by = p.y + s * 0.08 + (i === 0 ? 0 : s * 0.04);
        const bw = s * 0.26, bh = s * 0.20;
        ctx.fillStyle = '#8a7c62';
        ctx.fillRect(bx - bw / 2, by - bh, bw, bh);
        ctx.fillStyle = '#b09a6a';
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2 - s * 0.03, by - bh);
        ctx.lineTo(bx, by - bh - s * 0.13);
        ctx.lineTo(bx + bw / 2 + s * 0.03, by - bh);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 48, 30, 0.7)';
        ctx.fillRect(bx - s * 0.03, by - s * 0.10, s * 0.06, s * 0.10);
      }
    } else if (city.kind === 'factory' || city.kind === 'industrial_base') {
      // 厂房 + 烟囱
      ctx.fillStyle = '#6e675a';
      ctx.fillRect(p.x - s * 0.30, p.y - s * 0.08, s * 0.60, s * 0.30);
      ctx.fillStyle = '#837a68';
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.32, p.y - s * 0.08);
      ctx.lineTo(p.x - s * 0.20, p.y - s * 0.22);
      ctx.lineTo(p.x - s * 0.08, p.y - s * 0.08);
      ctx.lineTo(p.x + s * 0.04, p.y - s * 0.22);
      ctx.lineTo(p.x + s * 0.16, p.y - s * 0.08);
      ctx.lineTo(p.x + s * 0.28, p.y - s * 0.22);
      ctx.lineTo(p.x + s * 0.32, p.y - s * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c5549';
      ctx.fillRect(p.x + s * 0.18, p.y - s * 0.52, s * 0.10, s * 0.44);
      ctx.fillRect(p.x - s * 0.34, p.y - s * 0.40, s * 0.08, s * 0.32);
      ctx.fillStyle = 'rgba(225, 220, 205, 0.30)';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(p.x + s * 0.23 + k * s * 0.06, p.y - s * 0.60 - k * s * 0.07, s * 0.05 + k * s * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 226, 170, 0.55)';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(p.x - s * 0.22 + k * s * 0.12, p.y + s * 0.02, s * 0.06, s * 0.06);
      }
      if (city.kind === 'industrial_base') {
        // 工业基地：额外的储罐与炉体
        ctx.fillStyle = '#7d6b53';
        ctx.beginPath();
        ctx.arc(p.x - s * 0.44, p.y + s * 0.24, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x + s * 0.46, p.y + s * 0.24, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5c5549';
        ctx.fillRect(p.x + s * 0.38, p.y - s * 0.42, s * 0.09, s * 0.36);
        ctx.fillStyle = 'rgba(225, 220, 205, 0.30)';
        ctx.beginPath();
        ctx.arc(p.x + s * 0.42, p.y - s * 0.48, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (city.kind === 'port') {
      // 码头 + 吊机 + 货箱
      ctx.fillStyle = '#5d6b72';
      ctx.fillRect(p.x - s * 0.40, p.y + s * 0.12, s * 0.80, s * 0.10);
      ctx.fillStyle = '#4b565c';
      for (let k = 0; k < 5; k++) ctx.fillRect(p.x - s * 0.38 + k * s * 0.16, p.y + s * 0.14, s * 0.04, s * 0.07);
      ctx.strokeStyle = '#8a8272';
      ctx.lineWidth = Math.max(1, s * 0.028);
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.20, p.y + s * 0.12);
      ctx.lineTo(p.x - s * 0.20, p.y - s * 0.38);
      ctx.lineTo(p.x + s * 0.12, p.y - s * 0.44);
      ctx.stroke();
      ctx.fillStyle = '#8a8272';
      ctx.fillRect(p.x - s * 0.05, p.y - s * 0.02, s * 0.18, s * 0.14);
      ctx.fillStyle = '#7b6a54';
      ctx.fillRect(p.x + s * 0.14, p.y - s * 0.04, s * 0.14, s * 0.14);
      ctx.fillStyle = 'rgba(160, 205, 225, 0.45)';
      ctx.beginPath();
      ctx.ellipse(p.x + s * 0.10, p.y + s * 0.30, s * 0.34, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const d = s * (0.16 + (i % 2) * 0.16);
        const bx = p.x + Math.cos(a) * d;
        const by = p.y + Math.sin(a) * d * 0.8 + s * 0.06;
        const bw = s * (0.20 + hash(seed, i, 1) * 0.1);
        const bh = s * (0.18 + hash(seed, i, 2) * 0.14);
        ctx.fillStyle = PAL.building;
        ctx.fillRect(bx - bw / 2, by - bh, bw, bh);
        ctx.fillStyle = PAL.roof;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2 - s * 0.02, by - bh);
        ctx.lineTo(bx, by - bh - s * 0.09);
        ctx.lineTo(bx + bw / 2 + s * 0.02, by - bh);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 232, 180, 0.5)';
        if (s > 22) ctx.fillRect(bx - bw * 0.18, by - bh * 0.7, s * 0.035, s * 0.045);
      }
      // 中央塔楼
      if (city.capital) {
        ctx.fillStyle = '#6d6557';
        ctx.fillRect(p.x - s * 0.06, p.y - s * 0.42, s * 0.12, s * 0.34);
        ctx.fillStyle = '#8a7c62';
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.1, p.y - s * 0.42);
        ctx.lineTo(p.x, p.y - s * 0.58);
        ctx.lineTo(p.x + s * 0.1, p.y - s * 0.42);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 归属色与旗帜
    if (city.faction) {
      const col = SG.game.forceData(state, city.faction).color;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.globalAlpha = 0.85;
      hexPath(p.x, p.y, s * 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const fx0 = p.x + s * 0.34, fy0 = p.y - s * 0.34;
      ctx.strokeStyle = '#d9d2c0';
      ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.beginPath();
      ctx.moveTo(fx0, fy0);
      ctx.lineTo(fx0, fy0 - s * 0.3);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0 - s * 0.3);
      ctx.lineTo(fx0 + s * 0.2, fy0 - s * 0.24);
      ctx.lineTo(fx0, fy0 - s * 0.16);
      ctx.closePath();
      ctx.fill();
      if (city.capital) {
        ctx.strokeStyle = 'rgba(233, 197, 118, 0.75)';
        ctx.lineWidth = Math.max(1.2, s * 0.025);
        ctx.beginPath();
        ctx.arc(fx0, fy0 - s * 0.36, s * 0.045, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(230, 220, 195, 0.35)';
      ctx.lineWidth = Math.max(1, s * 0.02);
      hexPath(p.x, p.y, s * 0.8);
      ctx.stroke();
    }

    // 可生产提示（己方城市/工业区/港口，本回合尚未生产）
    if (state && city.kind !== 'village' && city.kind !== 'airport' && city.faction === state.playerFaction && state.current === state.playerFaction &&
      city.builtTurn !== state.turn && !state.over) {
      const bx = p.x - s * 0.52, by = p.y - s * 0.48;
      ctx.fillStyle = 'rgba(233, 197, 118, 0.95)';
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(2.2, s * 0.075), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 18, 12, 0.7)';
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.stroke();
    }

    // 名字
    if (cam.zoom > 0.34) {
      const fs = Math.max(11, Math.min(15, s * 0.36));
      ctx.font = `600 ${fs}px "Songti SC","SimSun",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = (city.capital ? '★ ' : '') + city.name;
      const tw = ctx.measureText(label).width;
      const ly = p.y + s * 0.63;
      ctx.fillStyle = 'rgba(10, 13, 17, 0.86)';
      ctx.fillRect(p.x - tw / 2 - 6, ly - fs * 0.76, tw + 12, fs * 1.5);
      ctx.strokeStyle = city.faction ? SG.game.forceData(state, city.faction).color : 'rgba(201, 169, 97, 0.3)';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - tw / 2 - 6, ly - fs * 0.76, tw + 12, fs * 1.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = city.capital ? '#f6e5bb' : '#f0e9d8';
      ctx.fillText(label, p.x, ly + 1);
    }
    ctx.restore();
  }

  /* ---------------- 绘制：高亮 ---------------- */
  function drawHighlights() {
    const s = SIZE * cam.zoom;
    if (view.reach) {
      for (const node of view.reach.values()) {
        if (node.blocked || node.cost <= 0) continue;
        const p = hexScreen(node.q, node.r);
        hexPath(p.x, p.y, s * 0.94);
        ctx.fillStyle = 'rgba(96, 156, 212, 0.34)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 216, 255, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = 'rgba(210, 236, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.6, s * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (view.targets && view.targets.size) {
      for (const id of view.targets) {
        const u = state.units.find(x => x.id === id);
        if (!u) continue;
        const p = hexScreen(u.q, u.r);
        hexPath(p.x, p.y, s * 0.94);
        ctx.fillStyle = 'rgba(206, 76, 58, 0.36)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 126, 100, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 准星
        ctx.strokeStyle = 'rgba(255, 190, 150, 0.9)';
        ctx.lineWidth = 1.6;
        const r0 = s * 0.26;
        ctx.beginPath();
        ctx.moveTo(p.x - r0, p.y - r0); ctx.lineTo(p.x - r0 * 0.45, p.y - r0 * 0.45);
        ctx.moveTo(p.x + r0, p.y - r0); ctx.lineTo(p.x + r0 * 0.45, p.y - r0 * 0.45);
        ctx.moveTo(p.x - r0, p.y + r0); ctx.lineTo(p.x - r0 * 0.45, p.y + r0 * 0.45);
        ctx.moveTo(p.x + r0, p.y + r0); ctx.lineTo(p.x + r0 * 0.45, p.y + r0 * 0.45);
        ctx.stroke();
      }
    }
    if (view.selectedUnit) {
      const p = hexScreen(view.selectedUnit.q, view.selectedUnit.r);
      const pulse = 0.65 + Math.sin(performance.now() / 340) * 0.25;
      hexPath(p.x, p.y, s * 0.98);
      ctx.strokeStyle = `rgba(233, 197, 118, ${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    if (view.selectedCityId) {
      const c = state.sitesById[view.selectedCityId];
      if (c) {
        const p = hexScreen(c.q, c.r);
        const pulse = 0.7 + Math.sin(performance.now() / 320) * 0.25;
        hexPath(p.x, p.y, s * 0.98);
        ctx.strokeStyle = `rgba(233, 197, 118, ${pulse})`;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = `rgba(233, 197, 118, ${pulse * 0.12})`;
        ctx.fill();
      }
    }
    if (view.supportTiles) {
      for (const t of view.supportTiles) {
        const p = hexScreen(t.q, t.r);
        hexPath(p.x, p.y, s * 0.96);
        ctx.fillStyle = 'rgba(96, 190, 150, 0.22)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(132, 220, 180, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    if (view.airportTargets) {
      for (const k of view.airportTargets) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        const pulse = 0.6 + Math.sin(performance.now() / 260) * 0.25;
        hexPath(p.x, p.y, s * 0.96);
        ctx.fillStyle = `rgba(240, 120, 90, ${pulse * 0.18})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 150, 110, ${pulse})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
    if (view.airportTiles) {
      for (const k of view.airportTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        const pulse = 0.6 + Math.sin(performance.now() / 300) * 0.25;
        hexPath(p.x, p.y, s * 0.96);
        ctx.fillStyle = `rgba(120, 210, 150, ${pulse * 0.18})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(150, 230, 170, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.buildTiles) {
      for (const k of view.buildTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        hexPath(p.x, p.y, s * 0.9);
        ctx.fillStyle = 'rgba(150, 200, 240, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.landingTiles) {
      for (const k of view.landingTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        hexPath(p.x, p.y, s * 0.9);
        ctx.fillStyle = 'rgba(220, 190, 120, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 220, 160, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.navalTiles) {
      for (const k of view.navalTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        hexPath(p.x, p.y, s * 0.9);
        ctx.fillStyle = 'rgba(120, 190, 225, 0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(150, 215, 245, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.militiaTiles) {
      for (const k of view.militiaTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        hexPath(p.x, p.y, s * 0.9);
        ctx.fillStyle = 'rgba(170, 220, 150, 0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(190, 235, 160, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.fortTiles) {
      for (const k of view.fortTiles) {
        const a = H.parse(k);
        const p = hexScreen(a.q, a.r);
        const pulse = 0.65 + Math.sin(performance.now() / 280) * 0.25;
        hexPath(p.x, p.y, s * 0.96);
        ctx.fillStyle = `rgba(230, 190, 110, ${pulse * 0.18})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(240, 205, 130, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (view.supportTargets && view.supportTargets.size) {
      for (const id of view.supportTargets) {
        const u = state.units.find(x => x.id === id);
        if (!u) continue;
        const p = hexScreen(u.q, u.r);
        const pulse = 0.65 + Math.sin(performance.now() / 280) * 0.25;
        hexPath(p.x, p.y, s * 0.98);
        ctx.strokeStyle = `rgba(235, 160, 120, ${pulse})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([s * 0.1, s * 0.07]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (view.swapTargets && view.swapTargets.size) {
      for (const id of view.swapTargets) {
        const u = state.units.find(x => x.id === id);
        if (!u) continue;
        const p = hexScreen(u.q, u.r);
        hexPath(p.x, p.y, s * 0.98);
        ctx.strokeStyle = 'rgba(120, 215, 235, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([s * 0.12, s * 0.08]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (hoverQ != null) {
      const p = hexScreen(hoverQ, hoverR);
      hexPath(p.x, p.y, s * 0.96);
      ctx.strokeStyle = 'rgba(255, 246, 220, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    if (view.path && view.path.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 222, 158, 0.95)';
      ctx.lineWidth = Math.max(2, s * 0.045);
      ctx.setLineDash([s * 0.14, s * 0.1]);
      ctx.beginPath();
      const start = view.selectedUnit ? hexScreen(view.selectedUnit.q, view.selectedUnit.r) : null;
      if (start) ctx.moveTo(start.x, start.y);
      for (const step of view.path) {
        const p = hexScreen(step.q, step.r);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      const last = view.path[view.path.length - 1];
      const lp = hexScreen(last.q, last.r);
      ctx.fillStyle = 'rgba(248, 222, 158, 0.95)';
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, Math.max(3, s * 0.075), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------- 绘制：单位 ---------------- */
  function unitPixel(u) {
    const w = worldOf(u.q, u.r);
    const a = anims.get(u.id);
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      if (t >= 1) {
        anims.delete(u.id);
      } else {
        const e = t * t * (3 - 2 * t);
        return { x: a.fx + (a.tx - a.fx) * e, y: a.fy + (a.ty - a.fy) * e };
      }
    }
    return w;
  }

  function drawUnit(u) {
    const w = unitPixel(u);
    const p = toScreen(w.x, w.y);
    const s = SIZE * cam.zoom;
    const tw = s * 0.86, th = s * 0.74;
    if (p.x < -tw || p.x > vw + tw || p.y < -th || p.y > vh + th) return;

    const stack = state ? state.units.filter(x => x.q === u.q && x.r === u.r) : [u];
    if (stack.length > 1) {
      if (stack.some(x => x.type === 'infantry_tank')) {
        const idx = stack.findIndex(x => x.id === u.id);
        p.x += (idx ? 1 : -1) * s * 0.3;
        p.y += (idx ? 1 : -1) * s * 0.18;
      } else {
        const naval = U[u.type].naval;
        p.x += (naval ? 1 : -1) * s * 0.34;
        p.y += (naval ? 1 : -1) * s * 0.18;
      }
    }

    const fo = state ? SG.game.forceData(state, u.faction) : F[u.faction];
    const done = u.hasAttacked;
    const partial = u.hasMoved && !u.hasAttacked;

    ctx.save();
    ctx.globalAlpha = done ? 0.7 : 1;

    // 协同攻击光环
    if (u.supporting) {
      ctx.save();
      ctx.setLineDash([Math.max(2, s * 0.07), Math.max(2, s * 0.05)]);
      ctx.strokeStyle = 'rgba(116, 214, 178, 0.95)';
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (u.jammed) {
      ctx.save();
      ctx.setLineDash([Math.max(2, s * 0.06), Math.max(2, s * 0.04)]);
      ctx.strokeStyle = 'rgba(130, 180, 255, 0.95)';
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150, 200, 255, 0.95)';
      ctx.font = `700 ${Math.max(8, s * 0.18)}px "Consolas", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', p.x, p.y - s * 0.58);
      ctx.restore();
    }

    // 阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + s * 0.04, p.y + th * 0.5, tw * 0.46, th * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // 底板
    const r = Math.max(3, s * 0.10);
    const x0 = p.x - tw / 2, y0 = p.y - th / 2;
    roundRect(x0, y0, tw, th, r);
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + th);
    grad.addColorStop(0, fo.color);
    grad.addColorStop(1, fo.dark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = done ? 'rgba(255,255,255,0.22)' : 'rgba(255, 246, 225, 0.55)';
    ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.stroke();

    // 顶部亮线
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(x0 + r, y0 + 1, tw - r * 2, Math.max(1, s * 0.03));

    // 兵种符号
    drawSymbol(u.type, p.x, p.y - s * 0.02, s * 0.52, (fo.icon || 'rgba(255, 250, 240, 0.94)'));

    // 搭枪卡搭载标记：左上角琥珀色载员徽标
    if (u.cargo) {
      const bx = x0 + s * 0.12, by = y0 + s * 0.12;
      ctx.save();
      ctx.fillStyle = 'rgba(233, 197, 118, 0.95)';
      ctx.strokeStyle = 'rgba(35, 25, 10, 0.85)';
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(2.2, s * 0.085), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b1d0c';
      ctx.font = `700 ${Math.max(6, s * 0.1)}px "SimSun",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('载', bx, by + 0.5);
      ctx.restore();
    }

    // 受损条：1/2/3 格同层压缩；4 格分上下两层；全部限制在单位底板内。
    const maxHits = SG.game.maxHits(u.type);
    const slots = maxHits;
    const filled = Math.max(0, maxHits - (u.hitsTaken || 0));
    const pad = Math.max(2, s * 0.05);
    const gap = Math.max(1, s * 0.018);
    const rows = slots > 3 ? 2 : 1;
    const cols = rows === 2 ? Math.ceil(slots / rows) : slots;
    const barH = rows === 2 ? Math.max(2, s * 0.036) : Math.max(3, s * 0.052);
    const availW = tw - pad * 2;
    const barW = Math.max(2, (availW - gap * (cols - 1)) / cols);
    const totalH = rows * barH + (rows - 1) * gap;
    const startX = x0 + pad;
    const startY = y0 + th - pad - totalH;
    for (let i = 0; i < slots; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const bx = startX + col * (barW + gap);
      const by = startY + row * (barH + gap);
      ctx.fillStyle = 'rgba(8, 10, 13, 0.72)';
      ctx.fillRect(bx, by, barW, barH);
      if (i < filled) {
        ctx.fillStyle = u.state === 'damaged' ? '#d2a95a' : '#8fb06c';
        ctx.fillRect(bx + 0.5, by + 0.5, Math.max(0, barW - 1), Math.max(0, barH - 1));
      }
    }

    // 受损标记：左上角红色三角
    if (u.state === 'damaged') {
      ctx.fillStyle = '#d06a52';
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 2);
      ctx.lineTo(x0 + s * 0.16, y0 + 2);
      ctx.lineTo(x0 + 2, y0 + s * 0.16);
      ctx.closePath();
      ctx.fill();
    }

    // 类型缩写（缩放足够大时）
    if (cam.zoom > 0.9 && !done) {
      ctx.font = `600 ${Math.max(7, s * 0.15)}px "Consolas","Segoe UI",monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255, 245, 220, 0.7)';
      ctx.fillText(D.UNITS[u.type].short, p.x + tw / 2 - 3, y0 + 3);
    }

    // 已行动：盖一层阴影；已移动未攻击：加一条琥珀色横线
    if (done) {
      roundRect(x0, y0, tw, th, r);
      ctx.fillStyle = 'rgba(4, 6, 10, 0.34)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      roundRect(x0 + 1.5, y0 + 1.5, tw - 3, th - 3, r);
      ctx.stroke();
    } else if (partial) {
      ctx.fillStyle = 'rgba(213, 171, 92, 0.9)';
      ctx.fillRect(x0 + r, y0, tw - r * 2, Math.max(1.5, s * 0.035));
    }

    // 待命：左下角蓝色小点
    if (u.waiting) {
      ctx.fillStyle = 'rgba(140, 190, 235, 0.95)';
      ctx.beginPath();
      ctx.arc(x0 + s * 0.1, y0 + th - s * 0.09, Math.max(1.8, s * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 20, 30, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // 战线状态外圈：夹击（琥珀）/ 包围（红）
    const fs = (SG.rules && state) ? SG.rules.frontlineStatus(state, u) : null;
    if (fs && fs.flanked) {
      ctx.save();
      ctx.strokeStyle = fs.surrounded ? 'rgba(224, 96, 70, 0.95)' : 'rgba(226, 176, 90, 0.9)';
      ctx.lineWidth = Math.max(1.6, s * 0.04);
      ctx.setLineDash(fs.surrounded ? [] : [Math.max(2, s * 0.08), Math.max(2, s * 0.05)]);
      roundRect(x0 - 2, y0 - 2, tw + 4, th + 4, r + 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSymbol(type, cx, cy, size, color) {
    const originalType = type;
    const alias = {
      stormtrooper: 'light_inf', conscript: 'militia',
      heavy_tank: 'tank', rocket_artillery: 'field_gun',
      sniper_team: 'light_inf', missile_ship: 'gunboat',
      guard: 'light_inf', siege_howitzer: 'field_gun',
      suicide_squad: 'militia', assault_boat: 'gunboat',
      infantry_column: 'light_inf', experimental_mech: 'tank',
      hover_tank: 'tank', tactical_carrier: 'gunboat', tachanka: 'armored_car',
      marine: 'light_inf', commissar: 'light_inf', infantry_tank: 'tank',
      motor_blitz: 'light_inf', guerrilla: 'light_inf', gene_warrior: 'light_inf'
    };
    if (alias[type]) type = alias[type];
    const h = size / 2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.2, size * 0.075);
    ctx.lineJoin = 'round';
    if (type === 'militia') {
      ctx.strokeRect(cx - h * 0.75, cy - h * 0.5, h * 1.5, h * 1.0);
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.75, cy - h * 0.5);
      ctx.lineTo(cx + h * 0.75, cy + h * 0.5);
      ctx.moveTo(cx + h * 0.75, cy - h * 0.5);
      ctx.lineTo(cx - h * 0.75, cy + h * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'drone_team') {
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + h * dx, cy + h * dy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + h * dx, cy + h * dy, h * 0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (type === 'light_inf' || type === 'mech_inf') {
      ctx.strokeRect(cx - h * 0.9, cy - h * 0.55, h * 1.8, h * 1.1);
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.9, cy - h * 0.55);
      ctx.lineTo(cx + h * 0.9, cy + h * 0.55);
      ctx.moveTo(cx + h * 0.9, cy - h * 0.55);
      ctx.lineTo(cx - h * 0.9, cy + h * 0.55);
      ctx.stroke();
      if (type === 'mech_inf') {
        ctx.beginPath();
        ctx.arc(cx - h * 0.45, cy + h * 0.85, h * 0.2, 0, Math.PI * 2);
        ctx.arc(cx + h * 0.45, cy + h * 0.85, h * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'armored_car') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, h * 0.72, h * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.15, cy);
      ctx.lineTo(cx + h * 0.55, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - h * 0.3, cy + h * 0.32, h * 0.1, 0, Math.PI * 2);
      ctx.arc(cx + h * 0.3, cy + h * 0.32, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'tank') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, h * 0.92, h * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.3, cy);
      ctx.lineTo(cx + h * 0.65, cy);
      ctx.stroke();
    } else if (type === 'infantry_gun') {
      ctx.beginPath();
      ctx.arc(cx, cy + h * 0.1, h * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + h * 0.55, cy - h * 0.35);
      ctx.moveTo(cx - h * 0.35, cy + h * 0.5);
      ctx.lineTo(cx + h * 0.3, cy + h * 0.5);
      ctx.stroke();
    } else if (type === 'field_gun') {
      ctx.beginPath();
      ctx.arc(cx - h * 0.2, cy + h * 0.15, h * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.2, cy);
      ctx.lineTo(cx + h * 0.85, cy - h * 0.3);
      ctx.moveTo(cx - h * 0.2, cy + h * 0.1);
      ctx.lineTo(cx - h * 0.75, cy + h * 0.5);
      ctx.stroke();
    } else if (type === 'fort_gun') {
      ctx.strokeRect(cx - h * 0.55, cy - h * 0.35, h * 1.1, h * 0.8);
      ctx.beginPath();
      ctx.arc(cx, cy - h * 0.05, h * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.1);
      ctx.lineTo(cx + h * 0.95, cy - h * 0.45);
      ctx.stroke();
    } else if (type === 'spg') {
      ctx.beginPath();
      ctx.ellipse(cx, cy + h * 0.2, h * 0.82, h * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.2, cy + h * 0.05);
      ctx.lineTo(cx + h * 0.95, cy - h * 0.38);
      ctx.moveTo(cx - h * 0.55, cy + h * 0.5);
      ctx.lineTo(cx + h * 0.55, cy + h * 0.5);
      ctx.stroke();
    } else if (type === 'battle_barge') {
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.85, cy - h * 0.15);
      ctx.lineTo(cx + h * 0.7, cy - h * 0.15);
      ctx.lineTo(cx + h * 0.9, cy + h * 0.15);
      ctx.lineTo(cx - h * 0.7, cy + h * 0.35);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - h * 0.1, cy - h * 0.05, h * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'gunboat') {
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.9, cy - h * 0.05);
      ctx.lineTo(cx + h * 0.75, cy - h * 0.05);
      ctx.lineTo(cx + h * 0.95, cy + h * 0.25);
      ctx.lineTo(cx - h * 0.75, cy + h * 0.35);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - h * 0.35, cy - h * 0.2, h * 0.18, 0, Math.PI * 2);
      ctx.arc(cx + h * 0.25, cy - h * 0.2, h * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.1, cy - h * 0.35);
      ctx.lineTo(cx + h * 0.6, cy - h * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    drawSpecialMark(originalType, cx, cy, size, color);
  }

  const SPECIAL_MARK_TYPES = new Set(['stormtrooper', 'superheavy_tank', 'conscript', 'rocket_artillery',
    'sniper_team', 'missile_ship', 'guard', 'siege_howitzer', 'suicide_squad', 'assault_boat',
    'infantry_column', 'experimental_mech', 'hover_tank', 'tactical_carrier',
    'tachanka', 'marine', 'commissar', 'infantry_tank', 'motor_blitz', 'guerrilla', 'gene_warrior']);

  function drawSpecialMark(type, cx, cy, size, color) {
    if (!SPECIAL_MARK_TYPES.has(type)) return;
    const h = size / 2;
    const x = cx + h * 0.82, y = cy - h * 0.78, r = h * 0.34;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 14, 16, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, size * 0.05);
    if (type === 'stormtrooper') {
      ctx.moveTo(x - r * 0.35, y + r * 0.55);
      ctx.lineTo(x + r * 0.05, y - r * 0.05);
      ctx.lineTo(x - r * 0.05, y - r * 0.05);
      ctx.lineTo(x + r * 0.35, y - r * 0.55);
    } else if (type === 'superheavy_tank') {
      ctx.moveTo(x - r * 0.55, y - r * 0.22); ctx.lineTo(x + r * 0.55, y - r * 0.22);
      ctx.moveTo(x - r * 0.55, y + r * 0.22); ctx.lineTo(x + r * 0.55, y + r * 0.22);
      ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55);
    } else if (type === 'conscript') {
      // 五角星
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const a2 = a + Math.PI / 5;
        const px = x + Math.cos(a) * r * 0.7, py = y + Math.sin(a) * r * 0.7;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        ctx.lineTo(x + Math.cos(a2) * r * 0.32, y + Math.sin(a2) * r * 0.32);
      }
      ctx.closePath();
    } else if (type === 'rocket_artillery') {
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(x + i * r * 0.42 - r * 0.12, y + r * 0.55);
        ctx.lineTo(x + i * r * 0.42 + r * 0.18, y - r * 0.35);
        ctx.lineTo(x + i * r * 0.42 + r * 0.05, y - r * 0.55);
        ctx.lineTo(x + i * r * 0.42 - r * 0.25, y + r * 0.35);
      }
    } else if (type === 'sniper_team') {
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.8, y); ctx.lineTo(x + r * 0.8, y);
      ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x, y + r * 0.8);
    } else if (type === 'missile_ship') {
      ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x + r * 0.4, y + r * 0.35);
      ctx.lineTo(x, y + r * 0.15); ctx.lineTo(x - r * 0.4, y + r * 0.35);
      ctx.closePath();
    } else if (type === 'guard') {
      ctx.moveTo(x, y - r * 0.65); ctx.lineTo(x + r * 0.55, y - r * 0.35);
      ctx.lineTo(x + r * 0.4, y + r * 0.45); ctx.lineTo(x, y + r * 0.7);
      ctx.lineTo(x - r * 0.4, y + r * 0.45); ctx.lineTo(x - r * 0.55, y - r * 0.35);
      ctx.closePath();
    } else if (type === 'siege_howitzer') {
      ctx.moveTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x + r * 0.55, y - r * 0.45);
      ctx.moveTo(x - r * 0.1, y + r * 0.1); ctx.lineTo(x + r * 0.65, y + r * 0.55);
      ctx.moveTo(x - r * 0.55, y + r * 0.5); ctx.lineTo(x - r * 0.15, y + r * 0.2);
    } else if (type === 'suicide_squad') {
      ctx.moveTo(x - r * 0.55, y - r * 0.55); ctx.lineTo(x + r * 0.55, y + r * 0.55);
      ctx.moveTo(x + r * 0.55, y - r * 0.55); ctx.lineTo(x - r * 0.55, y + r * 0.55);
      ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.7);
    } else if (type === 'assault_boat') {
      ctx.moveTo(x - r * 0.75, y + r * 0.35); ctx.lineTo(x + r * 0.3, y + r * 0.35);
      ctx.lineTo(x + r * 0.7, y + r * 0.05); ctx.lineTo(x - r * 0.2, y + r * 0.05);
      ctx.closePath();
      ctx.moveTo(x - r * 0.65, y + r * 0.65); ctx.lineTo(x + r * 0.4, y + r * 0.65);
    } else if (type === 'infantry_column') {
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(x + i * r * 0.4, y - r * 0.55);
        ctx.lineTo(x + i * r * 0.4, y + r * 0.55);
        ctx.arc(x + i * r * 0.4, y - r * 0.55, r * 0.12, 0, Math.PI * 2);
      }
    } else if (type === 'experimental_mech') {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const px = x + Math.cos(a) * r * 0.65, py = y + Math.sin(a) * r * 0.65;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.moveTo(x, y - r * 0.65); ctx.lineTo(x, y - r * 1.15);
    } else if (type === 'hover_tank') {
      ctx.moveTo(x - r * 0.65, y - r * 0.15); ctx.lineTo(x + r * 0.65, y - r * 0.15);
      ctx.moveTo(x - r * 0.75, y + r * 0.35); ctx.lineTo(x + r * 0.45, y + r * 0.35);
      ctx.moveTo(x - r * 0.55, y + r * 0.65); ctx.lineTo(x + r * 0.65, y + r * 0.65);
      ctx.moveTo(x - r * 0.2, y - r * 0.15); ctx.lineTo(x + r * 0.55, y - r * 0.55);
    } else if (type === 'tactical_carrier') {
      ctx.moveTo(x - r * 0.75, y + r * 0.3); ctx.lineTo(x + r * 0.65, y + r * 0.3);
      ctx.moveTo(x - r * 0.15, y + r * 0.3); ctx.lineTo(x + r * 0.35, y - r * 0.45);
      ctx.moveTo(x + r * 0.15, y - r * 0.1); ctx.lineTo(x + r * 0.55, y - r * 0.1);
    } else if (type === 'tachanka') {
      ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.7, y); ctx.lineTo(x + r * 0.7, y);
      ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.7);
    } else if (type === 'marine') {
      ctx.moveTo(x, y - r * 0.65); ctx.lineTo(x, y + r * 0.55);
      ctx.arc(x, y - r * 0.45, r * 0.25, Math.PI, 0);
      ctx.moveTo(x - r * 0.55, y + r * 0.15); ctx.quadraticCurveTo(x, y + r * 0.65, x + r * 0.55, y + r * 0.15);
    } else if (type === 'commissar') {
      ctx.moveTo(x, y - r * 0.65); ctx.lineTo(x + r * 0.55, y + r * 0.5);
      ctx.lineTo(x - r * 0.55, y + r * 0.5); ctx.closePath();
      ctx.moveTo(x - r * 0.45, y + r * 0.1); ctx.lineTo(x + r * 0.45, y + r * 0.1);
    } else if (type === 'infantry_tank') {
      ctx.ellipse(x, y + r * 0.2, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.1, y + r * 0.2); ctx.lineTo(x + r * 0.6, y - r * 0.25);
      ctx.moveTo(x - r * 0.5, y - r * 0.35); ctx.lineTo(x + r * 0.25, y - r * 0.35);
    } else if (type === 'motor_blitz') {
      ctx.moveTo(x - r * 0.45, y - r * 0.6); ctx.lineTo(x + r * 0.05, y - r * 0.1);
      ctx.lineTo(x - r * 0.1, y - r * 0.1); ctx.lineTo(x + r * 0.4, y + r * 0.6);
      ctx.moveTo(x + r * 0.4, y - r * 0.6); ctx.lineTo(x - r * 0.05, y - r * 0.1);
    } else if (type === 'guerrilla') {
      ctx.moveTo(x, y + r * 0.6); ctx.lineTo(x, y - r * 0.5);
      ctx.moveTo(x, y - r * 0.1); ctx.lineTo(x - r * 0.55, y - r * 0.5);
      ctx.moveTo(x, y + r * 0.2); ctx.lineTo(x + r * 0.55, y - r * 0.35);
    } else if (type === 'gene_warrior') {
      ctx.moveTo(x - r * 0.3, y - r * 0.65);
      ctx.bezierCurveTo(x + r * 0.7, y - r * 0.3, x - r * 0.7, y + r * 0.3, x + r * 0.3, y + r * 0.65);
      ctx.moveTo(x + r * 0.3, y - r * 0.65);
      ctx.bezierCurveTo(x - r * 0.7, y - r * 0.3, x + r * 0.7, y + r * 0.3, x - r * 0.3, y + r * 0.65);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ---------------- 绘制：特效 ---------------- */
  function drawFx(now) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const t = (now - f.t0) / f.life;
      if (t >= 1) { fx.splice(i, 1); continue; }
      const p = toScreen(f.x, f.y);
      const s = SIZE * cam.zoom;
      ctx.save();
      if (f.type === 'text') {
        ctx.globalAlpha = 1 - t * t;
        const rise = t * s * 0.9;
        ctx.font = `700 ${Math.max(13, s * 0.42)}px "Songti SC","SimSun",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, s * 0.05);
        ctx.strokeStyle = 'rgba(10, 8, 4, 0.85)';
        ctx.strokeText(f.text, p.x, p.y - rise);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, p.x, p.y - rise);
      } else if (f.type === 'boom') {
        const rr = s * (0.2 + t * 1.1);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(1.5, s * 0.06 * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 190, 90, 0.5)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.18 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + f.x;
          const rr2 = s * (0.15 + t * 0.7);
          ctx.fillStyle = 'rgba(255, 205, 120, ' + (1 - t) + ')';
          ctx.fillRect(p.x + Math.cos(a) * rr2, p.y + Math.sin(a) * rr2, Math.max(1.5, s * 0.04), Math.max(1.5, s * 0.04));
        }
      } else if (f.type === 'tracer') {
        const p2 = toScreen(f.x2, f.y2);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(1.4, s * 0.045);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (f.type === 'flash') {
        ctx.globalAlpha = (1 - t) * 0.75;
        ctx.fillStyle = f.color;
        hexScreenPath(f.x, f.y, s * 0.95);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  function hexScreenPath(wx, wy, rad) {
    const p = toScreen(wx, wy);
    hexPath(p.x, p.y, rad);
  }

  /* ---------------- 主绘制 ---------------- */
  function draw() {
    if (!state || !ctx) return;
    const now = performance.now();
    // 相机缓动
    if (cam.smooth) {
      cam.x += (cam.tx - cam.x) * 0.18;
      cam.y += (cam.ty - cam.y) * 0.18;
      cam.zoom += (cam.tz - cam.zoom) * 0.18;
      if (Math.abs(cam.tx - cam.x) < 0.3) cam.x = cam.tx;
      if (Math.abs(cam.ty - cam.y) < 0.3) cam.y = cam.ty;
      if (Math.abs(cam.tz - cam.zoom) < 0.001) cam.zoom = cam.tz;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // 背景微光
    const bg = ctx.createRadialGradient(vw * 0.5, vh * 0.45, 40, vw * 0.5, vh * 0.45, Math.max(vw, vh) * 0.75);
    bg.addColorStop(0, 'rgba(28, 42, 54, 0.55)');
    bg.addColorStop(1, 'rgba(6, 9, 12, 0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    // 地形
    for (const k in state.grid) drawHexBase(state.grid[k]);

    // 岸线微光
    if (cam.zoom > 0.45) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = PAL.coast;
      ctx.lineWidth = 1.4;
      for (const city of []) { /* 占位 */ }
      ctx.restore();
    }

    // 据点
    for (const c of state.sites) drawCity(c);
    drawHighlights();
    const units = state.units.slice();
    units.sort((a, b) => a.r - b.r || a.q - b.q);
    for (const u of units) drawUnit(u);
    drawFx(now);
  }

  function setHover(q, r) { hoverQ = q; hoverR = r; }

  SG.Render = {
    init, resize, setState, setView, draw,
    fit, centerOn, pan, zoomAt, screenToHex, screenToWorld,
    animateUnit, floatText, boom, tracer, flash, clearFx, setHover,
    hexToScreen: (q, r) => hexScreen(q, r),
    viewport: () => ({ w: vw, h: vh }),
    getCamera: () => cam
  };
})(typeof window !== 'undefined' ? window : globalThis);

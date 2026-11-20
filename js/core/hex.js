/* ============================================================
 * 六角格数学（尖顶 / axial 坐标）
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});

  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const SQRT3 = Math.sqrt(3);

  function key(q, r) { return q + ',' + r; }
  function parse(k) { const p = k.split(','); return { q: +p[0], r: +p[1] }; }

  function neighbors(q, r) {
    const out = [];
    for (let i = 0; i < 6; i++) out.push({ q: q + DIRS[i][0], r: r + DIRS[i][1] });
    return out;
  }

  function distance(aq, ar, bq, br) {
    const dq = aq - bq, dr = ar - br;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
  }

  function offsetToAxial(col, row) {
    return { q: col - ((row - (row & 1)) >> 1), r: row };
  }

  function hexToPixel(q, r, size) {
    return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
  }

  function pixelToHex(x, y, size) {
    const q = (SQRT3 / 3 * x - y / 3) / size;
    const r = (2 / 3 * y) / size;
    return axialRound(q, r);
  }

  function axialRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  function corners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
    }
    return pts;
  }

  function ring(q, r, radius) {
    if (radius <= 0) return [{ q, r }];
    const out = [];
    let cq = q + DIRS[4][0] * radius, cr = r + DIRS[4][1] * radius;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        out.push({ q: cq, r: cr });
        cq += DIRS[i][0]; cr += DIRS[i][1];
      }
    }
    return out;
  }

  SG.hex = { DIRS, key, parse, neighbors, distance, offsetToAxial, hexToPixel, pixelToHex, axialRound, corners, ring };
})(typeof window !== 'undefined' ? window : globalThis);

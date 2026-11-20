/* ============================================================
 * 钢铁洪流 · 极简合成音效（无外部资源）
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const A = { enabled: true, ctx: null, master: null, last: {} };

  function ensure() {
    if (!A.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.55;
      A.master.connect(A.ctx.destination);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }

  function tone(freq, dur, type, gain, slideTo, delay) {
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, cutoff, delay) {
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(A.master);
    src.start(t0);
  }

  const presets = {
    click() { tone(640, 0.05, 'square', 0.03, 520); },
    move() { tone(300, 0.09, 'triangle', 0.05, 380); tone(420, 0.07, 'triangle', 0.03, 480, 0.07); },
    attack() {
      noise(0.16, 0.16, 2400);
      tone(150, 0.2, 'sawtooth', 0.07, 70);
      tone(90, 0.25, 'sine', 0.08, 55, 0.02);
    },
    boom() {
      noise(0.4, 0.22, 700);
      tone(70, 0.4, 'sine', 0.1, 38);
    },
    capture() {
      tone(392, 0.18, 'triangle', 0.06);
      tone(523, 0.18, 'triangle', 0.06, null, 0.09);
      tone(659, 0.3, 'triangle', 0.05, null, 0.18);
    },
    build() { tone(880, 0.07, 'square', 0.035); tone(1180, 0.09, 'square', 0.03, null, 0.06); },
    turn() { tone(180, 0.35, 'sawtooth', 0.04, 150); tone(240, 0.3, 'triangle', 0.03, null, 0.12); },
    win() {
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.5, 'triangle', 0.06, null, i * 0.14));
    },
    lose() {
      [330, 262, 196, 147].forEach((f, i) => tone(f, 0.55, 'sine', 0.07, null, i * 0.16));
    }
  };

  A.play = function (name) {
    if (!A.enabled) return;
    const now = performance.now();
    if (A.last[name] && now - A.last[name] < 55) return;
    A.last[name] = now;
    try { (presets[name] || presets.click)(); } catch (e) { /* 忽略音频错误 */ }
  };
  A.toggle = function () {
    A.enabled = !A.enabled;
    if (A.enabled) A.play('click');
    return A.enabled;
  };
  A.unlock = function () { if (A.enabled) ensure(); };

  SG.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);

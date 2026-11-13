// The finished painting: the whole song laid out as a landscape, read left to
// right. Loudness raises the hills, harmony colours them, the loudest moments
// flower, tempo sets how busy the brushwork is, and the overall mood decides
// whether a sun or a moon hangs in the sky.
//
// It is a generator so the app can paint it a little at a time and you can
// watch it come together.
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;

  function smooth(arr, radius) {
    if (radius < 1) return arr.slice();
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j < 0 || j >= arr.length) continue;
        const wk = 1 - Math.abs(k) / (radius + 1);
        s += arr[j] * wk;
        w += wk;
      }
      out[i] = s / w;
    }
    return out;
  }
  const avg = (a) => a.reduce((p, c) => p + c, 0) / a.length;

  MB.paintFinale = function* (ctx, W, H, tl, opts = {}) {
    const rand = MB.mulberry32(opts.seed || 7);
    const n = tl.length;
    const E = smooth(tl.map((s) => s.e), 2);
    const M = smooth(tl.map((s) => s.m), 6);
    const B = smooth(tl.map((s) => s.b), 4);
    const hueShift = opts.hueShift || 0;
    const bpm = opts.bpm || 100;
    const at = (arr, t) => {
      const x = clamp(t) * (n - 1);
      const i = Math.floor(x), f = x - i;
      const j = Math.min(n - 1, i + 1);
      return arr[i] + (arr[j] - arr[i]) * f;
    };
    const moodAt = (t) => ({ mode: at(M, t), energy: at(E, t), brightness: at(B, t), hueShift });
    const avgMood = { mode: avg(M), energy: avg(E), brightness: avg(B), hueShift };
    const k = W / 2400; // scale for sizes
    // On a dark ground paint glows (screen) instead of staining (multiply).
    const dark = !!MB.theme.dark;
    const glaze = dark ? 'screen' : 'multiply';

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = MB.PAPER;
    ctx.fillRect(0, 0, W, H);
    yield;

    // 1. Sky: broad washes that drift with the song's mood over time. Pale
    //    on paper; a deep, mood-tinted night on dark grounds.
    ctx.globalCompositeOperation = dark ? 'source-over' : 'multiply';
    const skyCount = 7;
    for (let s = 0; s < skyCount; s++) {
      const t = (s + 0.5) / skyCount;
      let c = MB.moodHSL(s, moodAt(t));
      if (dark) {
        // night sky: deep blue for minor, violet dusk for major, never red
        const m = moodAt(t);
        c = {
          h: MB.lerp(228, 282, clamp(m.mode)) + hueShift + (rand() - 0.5) * 16,
          s: 38 + m.energy * 20,
          l: 13 + m.brightness * 9,
        };
      } else {
        c.l = Math.min(92, Math.max(c.l + 26, 66));
        c.s *= 0.6;
      }
      const x = t * W + (rand() - 0.5) * W * 0.08;
      const y = H * (0.1 + rand() * 0.22);
      const r = H * (0.28 + rand() * 0.12);
      const base = MB.deform(MB.polygon(x, y, r, 12, rand), 3, 0.5, rand);
      for (let L = 0; L < 36; L++) {
        MB.fillPoly(ctx, MB.deform(base, 2, 0.3, rand), MB.hsla(c, 0.017));
        if (L % 6 === 5) yield;
      }
    }

    // Stars on dark grounds: more of them for brighter-sounding songs.
    if (dark) {
      ctx.globalCompositeOperation = 'source-over';
      const stars = Math.round(60 + avgMood.brightness * 140);
      for (let i = 0; i < stars; i++) {
        const x = rand() * W, y = rand() * rand() * H * 0.55;
        const r = (0.8 + rand() * rand() * 3) * k;
        ctx.fillStyle = `rgba(250,246,236,${(0.15 + rand() * 0.6).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      yield;
    }

    // 2. A sun for songs that lean major, a moon for those that lean minor,
    //    hung above the song's loudest moment.
    let peakI = 0;
    for (let i = 1; i < n; i++) if (E[i] > E[peakI]) peakI = i;
    const peakT = n > 1 ? peakI / (n - 1) : 0.5;
    const isSun = avgMood.mode >= 0.5;
    const orb = isSun ? { h: 40 + hueShift * 0.5, s: 92, l: 70 } : { h: 222 + hueShift * 0.5, s: 28, l: 88 };
    {
      const cx = W * (0.15 + 0.7 * peakT);
      const cy = H * (0.15 + (1 - avgMood.brightness) * 0.12);
      const r = H * 0.075;
      // soft glow first
      const glow = MB.deform(MB.polygon(cx, cy, r * 2.4, 14, rand), 3, 0.3, rand);
      const glowC = dark
        ? { h: orb.h, s: orb.s * 0.7, l: 30 }
        : { h: orb.h, s: orb.s * 0.6, l: Math.min(90, orb.l + 14) };
      ctx.globalCompositeOperation = glaze;
      if (dark) {
        // a soft halo of light
        const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 4);
        g.addColorStop(0, MB.hsla(glowC, 0.55));
        g.addColorStop(0.35, MB.hsla(glowC, 0.18));
        g.addColorStop(1, MB.hsla(glowC, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
      } else {
        for (let L = 0; L < 20; L++) MB.fillPoly(ctx, MB.deform(glow, 2, 0.2, rand), MB.hsla(glowC, 0.025));
      }
      yield;
      ctx.globalCompositeOperation = 'source-over';
      const base = MB.deform(MB.polygon(cx, cy, r, 14, rand), 2, 0.12, rand);
      for (let L = 0; L < 30; L++) {
        MB.fillPoly(ctx, MB.deform(base, 2, 0.1, rand), MB.hsla(orb, 0.045));
        if (L % 10 === 9) yield;
      }
    }

    // 3. Hills: five ridges, far to near. Far ones follow the song's broad
    //    shape; near ones follow its detail.
    ctx.globalCompositeOperation = 'source-over';
    const layers = 5;
    let frontTop = null;
    const energies = tl.map((s) => s.e);
    for (let i = 0; i < layers; i++) {
      const depth = i / (layers - 1);
      const sm = smooth(energies, Math.max(1, Math.round(n * (0.08 - depth * 0.06))));
      const baseY = H * (0.44 + depth * 0.34);
      const amp = H * (0.26 - depth * 0.1);
      const topY = (x) =>
        baseY - amp * at(sm, x / W) + MB.noise3(x * 0.002 / k, i * 3.1, 0.5) * H * 0.05 * (1 - depth * 0.5);
      frontTop = topY;
      // One continuous hill whose colour flows left to right with the song.
      const pts = [];
      const P = 40;
      for (let j = 0; j <= P; j++) {
        const x = -W * 0.03 + (W * 1.06 * j) / P;
        pts.push({ x, y: topY(x), v: 0.6 + rand() * 0.8 });
      }
      pts.push({ x: W * 1.03, y: H + 60, v: 0.2 }, { x: -W * 0.03, y: H + 60, v: 0.2 });
      const base = MB.deform(pts, 2, 0.1, rand);
      const stops = 10;
      const colorStops = [];
      for (let s = 0; s <= stops; s++) {
        const c = MB.moodHSL(i * 2 + s, moodAt(s / stops));
        if (dark) {
          // at night, distant hills fade into the sky; near ones hold colour
          c.l = clamp(c.l * (0.32 + depth * 0.3), 8, 60);
          c.s *= 0.45 + depth * 0.45;
        } else {
          // atmospheric perspective: distant hills are paler and softer
          c.l = clamp(c.l + (1 - depth) * 22 - depth * 4, 10, 92);
          c.s *= 0.45 + depth * 0.3;
        }
        colorStops.push(c);
      }
      for (let L = 0; L < 14; L++) {
        const shift = (rand() - 0.5) * W * 0.12;
        const g = ctx.createLinearGradient(shift, 0, W + shift, 0);
        colorStops.forEach((c, s) => {
          const jit = { h: c.h + (rand() - 0.5) * 10, s: c.s, l: c.l + (rand() - 0.5) * 6 };
          g.addColorStop(s / stops, MB.hsla(jit, 0.06));
        });
        MB.fillPoly(ctx, MB.deform(base, 2, 0.07, rand), g);
        if (L % 4 === 3) yield;
      }
      for (let s = 0; s < 16; s++) {
        const t = rand();
        const x = t * W;
        const y = topY(x) + H * (0.03 + rand() * 0.12);
        const c = { ...colorStops[Math.round(t * stops)] };
        c.l = clamp(c.l + (rand() - 0.6) * 16, 10, 92);
        const blot = MB.deform(MB.polygon(x, y, H * (0.05 + rand() * 0.07), 10, rand), 3, 0.45, rand);
        for (let L = 0; L < 8; L++) MB.fillPoly(ctx, MB.deform(blot, 2, 0.25, rand), MB.hsla(c, 0.05));
      }
      yield;
    }

    // The voice: a thread of light across the sky, rising and falling with
    // the melody and breaking between phrases.
    {
      const P = tl.map((s) => (s.p === null || s.p === undefined ? null : s.p));
      const voiced = P.filter((v) => v !== null);
      if (voiced.length > 4) {
        const sorted = voiced.slice().sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length * 0.05)];
        const hi = Math.max(lo + 0.15, sorted[Math.floor(sorted.length * 0.95)]);
        const hue = MB.accentHSL(0, avgMood).h;
        const core = dark ? { h: hue, s: 45, l: 90 } : { h: hue, s: 40, l: 22 };
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (dark) {
          ctx.shadowColor = MB.hsla({ h: hue, s: 60, l: 80 }, 0.7);
          ctx.shadowBlur = 14 * k;
        }
        ctx.strokeStyle = MB.hsla(core, 0.85);
        let i = 0;
        while (i < n) {
          if (P[i] === null) { i++; continue; }
          // one phrase, smoothed into a flowing curve
          const idx = [];
          for (; i < n && P[i] !== null; i++) idx.push(i);
          if (idx.length < 3) continue;
          const ps = smooth(idx.map((j) => P[j]), 3);
          const pts = idx.map((j, q) => ({
            x: (j / Math.max(1, n - 1)) * W,
            y: H * (0.3 - clamp((ps[q] - lo) / (hi - lo)) * 0.16) + MB.noise3(j * 0.1, 3.3, 1) * H * 0.015,
            v: tl[j].v || 0,
          }));
          // taper in and out, thicker where the voice is louder
          for (let q = 1; q < pts.length; q++) {
            const a = pts[q - 1], b = pts[q];
            const c = pts[Math.min(pts.length - 1, q + 1)];
            const taper = Math.sin(Math.PI * (q / pts.length));
            ctx.lineWidth = Math.max(0.6, (1.2 + b.v * 5) * taper * k);
            ctx.beginPath();
            ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
            ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        yield;
      }
    }

    // 4. Flowers where the song swells.
    ctx.globalCompositeOperation = glaze;
    const peaks = [];
    for (let i = 1; i < n - 1; i++) {
      if (E[i] >= E[i - 1] && E[i] > E[i + 1] && E[i] > 0.4) peaks.push({ i, v: E[i] });
    }
    peaks.sort((a, b) => b.v - a.v);
    const K = clamp(Math.round(n / 12), 4, 18);
    for (const p of peaks.slice(0, K)) {
      const t = n > 1 ? p.i / (n - 1) : 0.5;
      const x = t * W + (rand() - 0.5) * 60 * k;
      const y = frontTop(x) + H * (0.03 + rand() * 0.12);
      // a burst of tapered petal strokes, like the live flicks
      const r = H * (0.02 + p.v * 0.035);
      const c = MB.accentHSL(Math.floor(rand() * 4), moodAt(t));
      c.s = Math.min(72, c.s);
      c.l = dark ? clamp(c.l + 4, 52, 68) : clamp(c.l - 8, 30, 55);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      const petals = 5 + Math.floor(rand() * 4);
      const turn = rand() * Math.PI * 2;
      for (let q = 0; q < petals; q++) {
        let a = turn + (q / petals) * Math.PI * 2 + (rand() - 0.5) * 0.4;
        const bend = (rand() - 0.5) * 0.6;
        const len = r * (0.5 + rand() * 0.8);
        let px = x, py = y;
        const steps = 8;
        for (let st = 0; st < steps; st++) {
          const pr = st / steps;
          a += bend / steps;
          const nx = px + Math.cos(a) * (len / steps), ny = py + Math.sin(a) * (len / steps);
          ctx.strokeStyle = MB.hsla(c, 0.62);
          ctx.lineWidth = Math.max(0.6, r * 0.2 * Math.sin(Math.PI * (0.15 + pr * 0.85)));
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
          px = nx; py = ny;
        }
      }
      const heart = dark ? { h: c.h, s: c.s * 0.6, l: 90 } : { h: c.h, s: c.s, l: Math.max(12, c.l - 25) };
      ctx.fillStyle = MB.hsla(heart, 0.9);
      for (let q = 0; q < 5; q++) {
        ctx.beginPath();
        ctx.arc(x + (rand() - 0.5) * r * 0.2, y + (rand() - 0.5) * r * 0.2, (1 + rand() * 2.5) * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = glaze;
      yield;
    }

    // 5. Brushwork: faster songs get busier strokes.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    const Lsh = smooth(tl.map((s) => (s.l === undefined ? 0.5 : s.l)), 4);
    const avgLush = avg(Lsh);
    const count = Math.round(120 + bpm * 1.2 + avgLush * 520);
    for (let s = 0; s < count; s++) {
      // place strokes where the song was full: sample x by fullness
      let x = rand() * W;
      for (let tries = 0; tries < 4 && rand() > 0.15 + at(Lsh, x / W); tries++) x = rand() * W;
      let y = H * (0.25 + rand() * 0.75);
      const t = clamp(x / W);
      const mood = moodAt(t);
      const c = MB.moodHSL(Math.floor(rand() * 6), mood);
      const steps = 10 + Math.floor(rand() * 10);
      const len = (6 + rand() * 10) * (0.6 + mood.energy) * k;
      const width = (5 + rand() * 14) * k;
      const offs = Array.from({ length: 7 }, (_, i) => (i / 6) * 2 - 1);
      let angle = MB.noise3(x * 0.0015 / k, y * 0.0015 / k, 7) * Math.PI * 2;
      ctx.strokeStyle = MB.hsla(c, 0.1 + mood.energy * 0.1);
      ctx.lineWidth = Math.max(0.6, 1.4 * k);
      ctx.beginPath();
      for (let st = 0; st < steps; st++) {
        const target = MB.noise3(x * 0.0015 / k, y * 0.0015 / k, 7) * Math.PI * 2;
        angle += (target - angle) * 0.3;
        const nx = x + Math.cos(angle) * len, ny = y + Math.sin(angle) * len;
        const w = width * Math.sin(Math.PI * ((st + 0.5) / steps));
        const px = -Math.sin(angle), py = Math.cos(angle);
        for (const o of offs) {
          if (rand() < 0.15) continue;
          ctx.moveTo(x + px * o * w * 0.5, y + py * o * w * 0.5);
          ctx.lineTo(nx + px * o * w * 0.5, ny + py * o * w * 0.5);
        }
        x = nx;
        y = ny;
      }
      ctx.stroke();
      if (s % 12 === 11) yield;
    }

    // 6. Grain over everything (lighter touch on dark grounds).
    ctx.globalCompositeOperation = dark ? 'soft-light' : 'multiply';
    ctx.globalAlpha = dark ? 0.25 : 0.5;
    ctx.fillStyle = ctx.createPattern(MB.makeGrain(512, opts.seed || 3), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
})();

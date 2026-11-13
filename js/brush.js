// Shared painting helpers: noise, randomness, watercolor shapes, palettes.
(function () {
  const MB = (window.MB = window.MB || {});

  MB.PAPER = '#f2ebdf';
  MB.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  MB.lerp = (a, b, t) => a + (b - a) * t;

  // ---------- Seeded randomness ----------
  MB.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  MB.gauss = function (rand = Math.random) {
    let u = 0;
    while (u === 0) u = rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ---------- Perlin noise (3D) ----------
  const perm = new Uint8Array(512);
  (function () {
    const r = MB.mulberry32(1337);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = MB.lerp;
  function grad(h, x, y, z) {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  MB.noise3 = function (x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u),
        lerp(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  };

  // ---------- Watercolor shapes ----------
  // A rough circle whose points carry their own "wobble" amount (v).
  MB.polygon = function (x, y, r, n, rand = Math.random) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, v: 0.5 + rand() });
    }
    return pts;
  };

  // Recursive midpoint displacement: the classic generative watercolor edge.
  MB.deform = function (pts, depth, variance, rand = Math.random) {
    let cur = pts;
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i], b = cur[(i + 1) % cur.length];
        out.push(a);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const v = (a.v + b.v) / 2;
        const sd = len * variance * v;
        out.push({
          x: (a.x + b.x) / 2 + MB.gauss(rand) * sd,
          y: (a.y + b.y) / 2 + MB.gauss(rand) * sd,
          v: v * (0.85 + rand() * 0.3),
        });
      }
      cur = out;
    }
    return cur;
  };

  MB.fillPoly = function (ctx, pts, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  };

  // ---------- Palettes ----------
  // [hue, saturation, lightness]. Major leans warm and luminous; minor leans
  // deep, cool and inky. Each mood blends between them.
  const MAJOR = [[44, 88, 60], [18, 82, 64], [352, 66, 70], [50, 90, 74], [28, 72, 54], [8, 58, 50]];
  const MINOR = [[228, 56, 32], [262, 40, 40], [200, 56, 34], [286, 30, 50], [214, 40, 56], [192, 42, 30]];
  const ACCENT_MAJOR = [[350, 72, 62], [40, 92, 58], [14, 84, 60], [330, 55, 66]];
  const ACCENT_MINOR = [[272, 48, 46], [190, 60, 40], [320, 34, 42], [240, 46, 52]];

  function mixHue(a, b, t) {
    const d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
  }
  function blend(majorSet, minorSet, i, mood) {
    const a = majorSet[i % majorSet.length], b = minorSet[i % minorSet.length];
    const t = 1 - MB.clamp(mood.mode); // mode: 1 = major, 0 = minor
    return {
      h: (mixHue(a[0], b[0], t) + (mood.hueShift || 0) + 360) % 360,
      s: MB.clamp(lerp(a[1], b[1], t) + (mood.energy - 0.5) * 22, 8, 100),
      l: MB.clamp(lerp(a[2], b[2], t) + (mood.brightness - 0.5) * 18, 10, 92),
    };
  }
  MB.moodHSL = (i, mood) => blend(MAJOR, MINOR, i, mood);
  MB.accentHSL = (i, mood) => blend(ACCENT_MAJOR, ACCENT_MINOR, i, mood);
  MB.hsla = (c, a) => `hsla(${c.h.toFixed(1)},${c.s.toFixed(1)}%,${c.l.toFixed(1)}%,${a})`;

  // Words for how the music feels right now.
  MB.moodWord = function (mode, energy) {
    if (mode > 0.6) return energy > 0.6 ? 'radiant' : energy > 0.3 ? 'warm' : 'tender';
    if (mode < 0.4) return energy > 0.6 ? 'stormy' : energy > 0.3 ? 'brooding' : 'melancholy';
    return energy > 0.6 ? 'restless' : energy > 0.3 ? 'bittersweet' : 'wistful';
  };

  // ---------- Paper grain ----------
  MB.makeGrain = function (size = 512, seed = 3) {
    const rand = MB.mulberry32(seed);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const x = i % size, y = (i / size) | 0;
      const n = MB.noise3(x * 0.04, y * 0.04, 0.3) * 10 + MB.noise3(x * 0.3, y * 0.3, 9) * 6;
      const v = MB.clamp(236 + n + (rand() - 0.5) * 22, 0, 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v - 2;
      img.data[i * 4 + 2] = v - 6;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // a few paper fibres
    g.strokeStyle = 'rgba(120,100,80,0.07)';
    for (let i = 0; i < 160; i++) {
      let x = rand() * size, y = rand() * size, a = rand() * Math.PI * 2;
      g.lineWidth = 0.4 + rand() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        a += (rand() - 0.5) * 0.8;
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  };
})();

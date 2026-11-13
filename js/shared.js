// Shared helpers: noise, randomness, the major/minor palettes and mood words.
(function () {
  const MB = (window.MB = window.MB || {});

  // The night ground everything is drawn on. `lift` and `sat` tune the
  // palette so colours read well against the dark.
  MB.theme = { bg: [15, 16, 26], lift: 12, sat: 1.22, dark: true };
  MB.PAPER = 'rgb(15,16,26)';
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

  // ---------- Palettes ----------
  // [hue, saturation, lightness]. Major leans warm and luminous; minor leans
  // deep, cool and inky. Each mood blends between them.
  const MAJOR = [[44, 88, 60], [18, 82, 64], [352, 66, 70], [50, 90, 74], [28, 72, 54], [8, 58, 50]];
  const MINOR = [[228, 56, 32], [262, 40, 40], [200, 56, 34], [286, 30, 50], [214, 40, 56], [192, 42, 30]];

  function mixHue(a, b, t) {
    const d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
  }
  function blend(majorSet, minorSet, i, mood) {
    const a = majorSet[i % majorSet.length], b = minorSet[i % minorSet.length];
    const t = 1 - MB.clamp(mood.mode); // mode: 1 = major, 0 = minor
    const lift = MB.theme.lift || 0;
    const l = lerp(a[2], b[2], t) + (mood.brightness - 0.5) * 18;
    return {
      h: (mixHue(a[0], b[0], t) + (mood.hueShift || 0) + 360) % 360,
      s: MB.clamp((lerp(a[1], b[1], t) + (mood.energy - 0.5) * 22) * (MB.theme.sat || 1), 8, 100),
      // on dark grounds, lift dark colours most and light ones least
      l: MB.clamp(l + lift * (1 - l / 100) * 1.4, 10, 92),
    };
  }
  MB.moodHSL = (i, mood) => blend(MAJOR, MINOR, i, mood);

  // Words for how the music feels right now.
  MB.moodWord = function (mode, energy) {
    if (mode > 0.6) return energy > 0.6 ? 'radiant' : energy > 0.3 ? 'warm' : 'tender';
    if (mode < 0.4) return energy > 0.6 ? 'stormy' : energy > 0.3 ? 'brooding' : 'melancholy';
    return energy > 0.6 ? 'restless' : energy > 0.3 ? 'bittersweet' : 'wistful';
  };
})();

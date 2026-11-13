// The painting.
//
// One artwork accumulates for the whole song on a fixed-size canvas. Marks
// are never erased: movement comes only from new paint being laid down.
//
// PAINT. Every mark is a planned gesture (touch-down, weighted body, taper)
// painted by a set of bristles. Each bristle carries its own pigment load,
// which runs out along the stroke. The ground has a "tooth" (a fixed texture),
// and paint only catches where the bristle's pigment beats the tooth, which
// gives broken edges, opacity variation and gaps where the surface shows.
//
// COMPOSITION. Marks gather in a few related areas of activity. New marks
// continue, run alongside or cross earlier marks in their area, and a
// coverage map keeps some breathing room.
//
// MUSIC (each response kept separate):
//   tempo   -> the rhythm of mark-making (a beat clock) and how quickly
//              strokes are laid down
//   volume  -> brush size, pressure and pigment opacity
//   density -> how often marks layer and how varied they are
//   accents -> short loaded strokes
//   peaks   -> occasional bold gestures
//   harmony -> colour (major warm, minor cool), blended gradually
//   melody  -> a fine rigger line that rises and falls with pitch
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const TAU = Math.PI * 2;
  const angleTo = (d) => Math.atan2(Math.sin(d), Math.cos(d));
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- The ground's tooth: a tileable texture, 0..1 ----------
  const TS = 256;
  const tooth = new Float32Array(TS * TS);
  (function () {
    const r = MB.mulberry32(11);
    function periodic(cells) {
      const g = new Float32Array(cells * cells);
      for (let i = 0; i < g.length; i++) g[i] = r();
      return (x, y) => {
        const fx = (x / TS) * cells, fy = (y / TS) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const x0 = ix % cells, y0 = iy % cells, x1 = (ix + 1) % cells, y1 = (iy + 1) % cells;
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
        return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      };
    }
    const n1 = periodic(16), n2 = periodic(64);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        tooth[y * TS + x] = 0.45 * n1(x, y) + 0.3 * n2(x, y) + 0.25 * r();
      }
    }
  })();
  const toothAt = (x, y) => tooth[((y | 0) & (TS - 1)) * TS + ((x | 0) & (TS - 1))];

  // ---------- Marks ----------
  // Kinds of mark and how they behave.
  const KINDS = {
    //            bristles  width  length   pigment wet   run-out speed  bristle  ridge
    detail:  { n: 3,  w: [3, 8],    len: [30, 110],  alpha: 0.65, wet: 0.15, run: 0.5,  speed: 520, lw: 1.0, ridge: false },
    dry:     { n: 9,  w: [8, 22],   len: [60, 190],  alpha: 0.5,  wet: -0.1, run: 0.75, speed: 1100, lw: 0.8, ridge: false },
    body:    { n: 18, w: [16, 38],  len: [90, 260],  alpha: 0.32, wet: 0.06, run: 0.5,  speed: 760, lw: 1.5, ridge: false },
    loaded:  { n: 20, w: [14, 32],  len: [80, 180],  alpha: 0.7,  wet: 0.14, run: 0.35, speed: 950, lw: 1.7, ridge: true },
    bold:    { n: 28, w: [46, 86],  len: [340, 620], alpha: 0.6,  wet: 0.1,  run: 0.45, speed: 820, lw: 1.7, ridge: true },
    wash:    { n: 30, w: [110, 210],len: [320, 700], alpha: 0.05, wet: 0.3,  run: 0.35, speed: 520, lw: 3.6, ridge: false, soft: true },
  };

  class Stroke {
    constructor(o) {
      Object.assign(this, o);
      const K = KINDS[o.kind];
      this.K = K;
      this.i = 0;
      this.acc = 0;
      this.ph = Math.random() * TAU;
      this.taperAt = rnd(0.6, 0.78);
      this.bristles = [];
      for (let k = 0; k < K.n; k++) {
        const off = K.n === 1 ? 0 : (k / (K.n - 1)) * 2 - 1;
        this.bristles.push({
          off: off + rnd(-0.08, 0.08),
          // outer bristles carry less paint, so edges break up
          load: o.load * (1 - 0.5 * off * off) * rnd(0.75, 1.1),
          a: rnd(0.55, 1),
          thick: Math.random() < 0.35 ? 1 : 0, // some bristles are coarser
          seed: Math.random() * 100,
        });
      }
    }

    // A touch-down, a weighted body and a natural taper.
    pressure(u) {
      const start = u < 0.1 ? 0.55 + 0.45 * Math.sin((u / 0.1) * (Math.PI / 2)) : 1;
      const end = u > this.taperAt ? Math.pow(1 - (u - this.taperAt) / (1 - this.taperAt), 1.3) : 1;
      const body = 1 + 0.08 * Math.sin(u * 9 + this.ph);
      return Math.max(0.04, start * end * body);
    }

    get done() { return this.i >= this.pts.length - 1; }

    // Lay down as much of the stroke as the brush covers in `dt` seconds.
    advance(p, dt, all) {
      if (this.done) return;
      this.acc += all ? 1e9 : (this.speed * dt) / this.step;
      let steps = Math.floor(this.acc);
      this.acc -= steps;
      steps = Math.min(steps, this.pts.length - 1 - this.i);
      if (steps <= 0) return;
      this._render(p, this.i, this.i + steps);
      this.i += steps;
    }

    _render(p, from, to) {
      const ctx = p.art.getContext('2d');
      const K = this.K, pts = this.pts, last = pts.length - 1;
      // Per-point shape of the brush for this stretch of the stroke.
      const seg = [];
      for (let i = from; i <= to; i++) {
        const P = pts[i], u = i / last, pr = this.pressure(u);
        seg.push({
          x: P.x, y: P.y, nx: -Math.sin(P.a), ny: Math.cos(P.a), u, pr,
          w: this.width * (0.25 + 0.75 * pr),
          ink: 1 - this.run * u, // pigment runs out along the stroke
        });
      }
      // pigment strength (3) x bristle thickness (2); each bristle is drawn
      // as continuous runs so paint never doubles up where pieces meet
      const paths = [0, 1, 2, 3, 4, 5].map(() => new Path2D());
      // rounded ends where a run of paint truly starts or stops
      const ends = [0, 1, 2, 3, 4, 5].map(() => []);
      const final = to === last;
      for (const b of this.bristles) {
        const bucket = (b.a > 0.85 ? 2 : b.a > 0.7 ? 1 : 0) * 2 + b.thick;
        const path = paths[bucket];
        let pen = false;
        let px = b.px ?? pts[from].x, py = b.py ?? pts[from].y;
        for (let j = 0; j < seg.length - 1; j++) {
          const A = seg[j], B = seg[j + 1];
          const oA = (b.off + MB.noise3(b.seed, A.u * 4, 0) * 0.12) * A.w * 0.5;
          const oB = (b.off + MB.noise3(b.seed, B.u * 4, 0) * 0.12) * B.w * 0.5;
          const ax = A.x + A.nx * oA, ay = A.y + A.ny * oA;
          const bx = B.x + B.nx * oB, by = B.y + B.ny * oB;
          const load = b.load * A.ink * (0.55 + 0.45 * A.pr);
          // Paint only catches where its pigment beats the surface's tooth.
          // Skips run in streaks along each bristle, like dry paint.
          const streak = 0.5 + 0.5 * MB.noise3(b.seed, (from + j) * this.step * 0.018, 2.1);
          const grain = 0.3 * toothAt((ax + bx) / 2, (ay + by) / 2) + 0.7 * streak;
          // a little hysteresis: a bristle that's painting keeps going until
          // its pigment clearly runs short, so gaps are clean, not crumbly
          const limit = load + this.wet + (b.on ? 0.06 : -0.04);
          if (grain > limit) {
            if (b.on) ends[bucket].push(px, py);
            b.on = false; pen = false;
            continue;
          }
          if (!pen) {
            path.moveTo(ax, ay);
            if (!b.on) ends[bucket].push(ax, ay);
            pen = true;
          }
          b.on = true;
          path.lineTo(bx, by);
          px = bx; py = by;
        }
        b.px = px; b.py = py;
        if (final && b.on) { ends[bucket].push(px, py); b.on = false; }
      }
      const lw = Math.max(0.7, (this.width / K.n) * K.lw * 0.8);
      const c = this.color;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      // pigment strengths differ slightly in value and hue, for streaks
      const shade = [-9, 0, 8];
      const hue = [-4, 0, 3];
      const strength = [0.55, 0.78, 1];
      const soft = K.soft ? 0.3 : 1; // washes are even, not streaky
      for (let k = 0; k < 6; k++) {
        const q = k >> 1;
        ctx.lineWidth = lw * (k & 1 ? 1.7 : 0.85);
        ctx.strokeStyle = MB.hsla(
          { h: (c.h + hue[q] * soft + 360) % 360, s: c.s, l: clamp(c.l + shade[q] * soft, 4, 96) },
          clamp(this.alpha * (K.soft ? 1 : strength[q]), 0, 1)
        );
        ctx.stroke(paths[k]);
        const e = ends[k];
        if (e.length) {
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          const r = ctx.lineWidth / 2;
          for (let j = 0; j < e.length; j += 2) { ctx.moveTo(e[j] + r, e[j + 1]); ctx.arc(e[j], e[j + 1], r, 0, TAU); }
          ctx.fill();
        }
      }
      // thick paint catches light on one edge and shadows the other
      if (K.ridge) {
        for (const [off, dl, a] of [[-0.62, 16, 0.18], [0.66, -14, 0.13]]) {
          const path = new Path2D();
          let pen = false;
          for (let j = 0; j < seg.length - 1; j++) {
            const A = seg[j], B = seg[j + 1];
            if (toothAt(A.x, A.y) > 0.75 * A.ink * (0.5 + 0.5 * A.pr)) { pen = false; continue; }
            const oA = A.w * 0.5 * off, oB = B.w * 0.5 * off;
            if (!pen) { path.moveTo(A.x + A.nx * oA, A.y + A.ny * oA); pen = true; }
            path.lineTo(B.x + B.nx * oB, B.y + B.ny * oB);
          }
          ctx.strokeStyle = MB.hsla({ h: c.h, s: c.s * 0.8, l: clamp(c.l + dl, 4, 96) }, a);
          ctx.lineWidth = Math.max(0.6, lw * 0.7);
          ctx.stroke(path);
        }
      }
      p.addCoverage(pts[to].x, pts[to].y, this.width * this.alpha * (to - from) * this.step);
    }
  }

  class LivePainter {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.art = document.createElement('canvas');
      this.resizeView();
      this.newArtwork();
      window.addEventListener('resize', () => this.resizeView());
    }

    // ---------- Canvas and view ----------
    resizeView() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this.c.width = Math.round(this.vw * dpr);
      this.c.height = Math.round(this.vh * dpr);
      this.dpr = dpr;
    }

    // A fresh artwork sized to the window's shape, long side 2400px.
    newArtwork() {
      const aspect = clamp(this.vw / this.vh, 0.6, 2.2);
      const W = aspect >= 1 ? 2400 : Math.round(2400 * aspect);
      const H = aspect >= 1 ? Math.round(2400 / aspect) : 2400;
      this.art.width = W;
      this.art.height = H;
      this.W = W;
      this.H = H;
      this.S = Math.min(W, H) / 900;
      this.paintGround();
      this.strokes = [];
      this.marks = [];
      this.areas = [];
      this.GW = 32;
      this.GH = Math.max(8, Math.round((32 * H) / W));
      this.cover = new Float32Array(this.GW * this.GH);
      this.clock = 0.4;
      this.accentCool = 0;
      this.peakCool = 6;
      this.washTimer = 0;
      this.areaTimer = 0;
      this.eLong = 0.4;
      this.lastWashMode = null;
      this.lastAreaLush = 0;
      this.voice = null;
      this.idleMarks = 0;
      this.active = false;
    }

    paintGround() {
      const ctx = this.art.getContext('2d');
      const bg = MB.theme.bg;
      // the surface itself, with its tooth, shows wherever paint skips
      const tile = document.createElement('canvas');
      tile.width = tile.height = TS;
      const tc = tile.getContext('2d');
      const img = tc.createImageData(TS, TS);
      const amp = MB.theme.dark ? 9 : 14;
      for (let i = 0; i < TS * TS; i++) {
        const d = (tooth[i] - 0.5) * amp;
        img.data[i * 4] = bg[0] + d;
        img.data[i * 4 + 1] = bg[1] + d;
        img.data[i * 4 + 2] = bg[2] + d * 1.1;
        img.data[i * 4 + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, this.W, this.H);
    }

    // Start the canvas over (keeps painting if a song is playing).
    clear() { const on = this.active; this.newArtwork(); this.active = on; }
    begin() { this.newArtwork(); this.active = true; }

    // Stop adding marks; let strokes already on the canvas finish.
    stop() {
      this.active = false;
      for (const s of this.strokes) s.advance(this, 0, true);
      this.strokes = [];
      this.voice = null;
      return this.art;
    }

    // Draw the artwork into the window (fitted, never cropped).
    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = MB.PAPER;
      ctx.fillRect(0, 0, this.c.width, this.c.height);
      const k = Math.min(this.c.width / this.W, this.c.height / this.H);
      const dw = this.W * k, dh = this.H * k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.art, (this.c.width - dw) / 2, (this.c.height - dh) / 2, dw, dh);
    }

    // ---------- Composition ----------
    addCoverage(x, y, amount) {
      const gx = clamp(Math.floor((x / this.W) * this.GW), 0, this.GW - 1);
      const gy = clamp(Math.floor((y / this.H) * this.GH), 0, this.GH - 1);
      const cell = (this.W / this.GW) * (this.H / this.GH);
      this.cover[gy * this.GW + gx] += amount / cell;
    }
    coverageAt(x, y) {
      const gx = clamp(Math.floor((x / this.W) * this.GW), 0, this.GW - 1);
      const gy = clamp(Math.floor((y / this.H) * this.GH), 0, this.GH - 1);
      return this.cover[gy * this.GW + gx];
    }

    _addArea() {
      const m = Math.min(this.W, this.H);
      if (!this.areas.length) {
        this.areas.push({
          x: this.W * rnd(0.34, 0.6), y: this.H * rnd(0.36, 0.6),
          r: m * rnd(0.2, 0.26), a: rnd(-0.6, 0.6), pal: Math.floor(rnd(0, 6)), weight: 1, last: null,
        });
        return;
      }
      // a new area grows out of an existing one, related in place and colour
      const base = this.areas[Math.floor(Math.random() * this.areas.length)];
      for (let tries = 0; tries < 8; tries++) {
        const dir = base.a + (Math.random() < 0.5 ? 1 : -1) * rnd(0.6, 1.8);
        const d = m * rnd(0.32, 0.5);
        const x = clamp(base.x + Math.cos(dir) * d, this.W * 0.2, this.W * 0.8);
        const y = clamp(base.y + Math.sin(dir) * d, this.H * 0.2, this.H * 0.8);
        if (this.areas.some((a) => Math.hypot(a.x - x, a.y - y) < m * 0.28)) continue;
        for (const a of this.areas) a.weight *= 0.6;
        this.areas.push({
          x, y, r: m * rnd(0.15, 0.24), a: base.a + rnd(-0.8, 0.8),
          pal: base.pal + (Math.random() < 0.5 ? 1 : 2), weight: 1, last: base.last,
        });
        return;
      }
    }

    _pickArea() {
      let sum = 0;
      for (const a of this.areas) sum += a.weight;
      let r = Math.random() * sum;
      for (const a of this.areas) { r -= a.weight; if (r <= 0) return a; }
      return this.areas[this.areas.length - 1];
    }

    // The direction marks tend to follow near (x, y): the area's own grain,
    // gently bent by noise.
    _field(x, y, area) {
      return area.a + MB.noise3(x * 0.0012, y * 0.0012, 3.7) * 0.9;
    }

    _plan(x, y, a, len, area, bend, kind) {
      const step = Math.max(2, 2.4 * this.S);
      const n = Math.max(3, Math.round(len / step));
      const pts = [{ x, y, a }];
      const seed = Math.random() * 50;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        a += bend / n + MB.noise3(seed, u * 2.5, 1) * 0.04;
        a += angleTo(this._field(x, y, area) - a) * 0.045;
        // a stroke lifts off before the edge of the canvas
        const mx = this.W * 0.06, my = this.H * 0.06;
        if (x < mx || x > this.W - mx || y < my || y > this.H - my) break;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push({ x, y, a });
      }
      return { pts, step };
    }

    _colour(kind, f, area, accent) {
      let c = accent ? MB.accentHSL(Math.floor(rnd(0, 4)), f) : MB.moodHSL(area.pal + Math.floor(rnd(0, 2.6)), f);
      // mix a little with the paint already used in this area
      if (area.last) {
        const L = area.last, t = 0.25;
        const dh = angleTo(((L.h - c.h) * Math.PI) / 180) * (180 / Math.PI);
        c = { h: (c.h + dh * t + 360) % 360, s: c.s + (L.s - c.s) * t, l: c.l + (L.l - c.l) * t };
      }
      c.h = (c.h + rnd(-6, 6) + 360) % 360;
      const dark = MB.theme.dark;
      if (kind === 'wash') { c.s *= 0.8; c.l = dark ? c.l * 0.75 : Math.min(90, c.l + 12); }
      if (kind === 'detail') c.l = dark ? clamp(c.l + 14, 0, 88) : clamp(c.l - 12, 10, 100);
      if (kind === 'dry') c.l = dark ? clamp(c.l + 6, 0, 88) : c.l;
      if (!accent && kind !== 'wash') area.last = { ...c };
      return c;
    }

    // Choose where a new mark goes, based on what's already there.
    _place(kind, area, len, w, lush) {
      const recent = this.marks.filter((m) => m.area === area).slice(-40);
      const ref = recent.length ? recent[Math.floor(Math.random() * recent.length)] : null;
      let x, y, a;
      if (ref && kind !== 'bold') {
        const r = Math.random();
        const cross = 0.06 + 0.14 * lush;
        if (r < 0.38) {
          // carry on from where an earlier mark ended
          const g = rnd(0.1, 0.6) * w;
          x = ref.ex + Math.cos(ref.a) * g;
          y = ref.ey + Math.sin(ref.a) * g;
          a = ref.a + rnd(-0.35, 0.35);
        } else if (r < 1 - cross) {
          // lay a mark alongside an earlier one
          const side = Math.random() < 0.5 ? -1 : 1;
          const o = side * (ref.w * 0.5 + w * 0.5) * rnd(0.7, 1.4);
          const along = rnd(-0.3, 0.3) * ref.len;
          x = ref.sx + Math.cos(ref.a) * along - Math.sin(ref.a) * o;
          y = ref.sy + Math.sin(ref.a) * along + Math.cos(ref.a) * o;
          a = ref.a + rnd(-0.2, 0.2);
        } else {
          // cross an earlier mark
          a = ref.a + (Math.random() < 0.5 ? 1 : -1) * rnd(0.9, 1.4);
          x = ref.mx - Math.cos(a) * len * rnd(0.3, 0.6);
          y = ref.my - Math.sin(a) * len * rnd(0.3, 0.6);
        }
      } else {
        x = area.x + MB.gauss() * area.r * 0.4;
        y = area.y + MB.gauss() * area.r * 0.4;
        a = this._field(x, y, area) + rnd(-0.3, 0.3);
      }
      // stay with the area
      const d = Math.hypot(x - area.x, y - area.y);
      if (d > area.r * 1.4) {
        x += (area.x - x) * 0.5;
        y += (area.y - y) * 0.5;
      }
      x = clamp(x, this.W * 0.05, this.W * 0.95);
      y = clamp(y, this.H * 0.05, this.H * 0.95);
      return { x, y, a };
    }

    _mark(kind, f, opts = {}) {
      const K = KINDS[kind];
      const S = this.S;
      const e = f.energy, lush = f.lush || 0;
      if (!this.areas.length) this._addArea();
      const area = opts.area || this._pickArea();
      // volume: size, pressure and pigment
      const vol = 0.45 + 1.1 * e;
      const w = rnd(K.w[0], K.w[1]) * S * vol;
      const len = rnd(K.len[0], K.len[1]) * S * (kind === 'wash' || kind === 'bold' ? 1 : 0.75 + 0.45 * lush);
      let place = opts.at || this._place(kind, area, len, w, lush);
      // breathing room: avoid piling onto crowded patches (peaks may)
      if (kind !== 'bold' && kind !== 'wash' && this.coverageAt(place.x, place.y) > 1.1) {
        place = this._place(kind, area, len, w, lush);
        if (this.coverageAt(place.x, place.y) > 1.1) return;
      }
      const bend = opts.bend ?? rnd(-0.6, 0.6) * (kind === 'bold' ? 1.8 : 1);
      const { pts, step } = this._plan(place.x, place.y, place.a, len, area, kind === 'wash' ? bend * 0.3 : bend, kind);
      if (pts.length < 4) return;
      const tempo = clamp(f.bpm / 100, 0.6, 1.8);
      const s = new Stroke({
        kind, pts, step,
        width: w,
        color: this._colour(kind, f, area, opts.accent),
        alpha: clamp(K.alpha * (0.5 + 0.85 * e) * (MB.theme.ink || 1) * 0.8, 0, 1),
        load: clamp(0.75 + 0.35 * e + (kind === 'loaded' || kind === 'bold' ? 0.2 : 0), 0, 1.3),
        wet: K.wet,
        run: K.run,
        speed: K.speed * S * tempo,
      });
      this.strokes.push(s);
      const lastP = pts[pts.length - 1], mid = pts[pts.length >> 1];
      this.marks.push({
        area, sx: pts[0].x, sy: pts[0].y, ex: lastP.x, ey: lastP.y, mx: mid.x, my: mid.y,
        a: lastP.a, w, len,
      });
      if (this.marks.length > 400) this.marks.shift();
    }

    _type(f) {
      const e = f.energy, L = f.lush || 0;
      if (e < 0.22) return Math.random() < 0.6 ? 'detail' : 'dry';
      const w = {
        detail: 0.5 * (1 - L) + 0.1,
        dry: 0.3 + 0.2 * L,
        body: 0.2 + 0.55 * L * (0.5 + e),
        loaded: 0.05 + 0.4 * L * e,
      };
      let sum = 0;
      for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) { r -= w[k]; if (r <= 0) return k; }
      return 'body';
    }

    // A wash that links passages, laid translucently over what's there.
    _wash(f) {
      if (this.areas.length >= 2) {
        const A = this._pickArea();
        const others = this.areas.filter((x) => x !== A);
        const B = others[Math.floor(Math.random() * others.length)];
        const a = Math.atan2(B.y - A.y, B.x - A.x);
        const start = { x: A.x - Math.cos(a) * A.r * 0.4, y: A.y - Math.sin(a) * A.r * 0.4, a };
        this._mark('wash', f, { area: A, at: start, bend: rnd(-0.4, 0.4) });
      } else {
        this._mark('wash', f);
      }
    }

    // The melody as a fine rigger line, drawn as it's sung.
    _voice(f, dt) {
      const mel = f.melody;
      if (!mel) return;
      let v = this.voice;
      if (mel.on && !v && this.active && this.areas.length) {
        const area = this._pickArea();
        const ref = this.marks.length ? this.marks[this.marks.length - 1 - Math.floor(Math.random() * Math.min(10, this.marks.length))] : null;
        const x = ref ? ref.mx : area.x, y = ref ? ref.my : area.y;
        const c = MB.accentHSL(0, f);
        v = this.voice = {
          x, y, a: Math.random() < 0.5 ? 0 : Math.PI, ink: 0, area,
          color: MB.theme.dark ? { h: c.h, s: 35, l: 86 } : { h: c.h, s: 40, l: 20 },
          lo: mel.pitch - 0.12, hi: mel.pitch + 0.12, seed: Math.random() * 50, t: 0,
        };
      }
      if (!v) return;
      v.ink += ((mel.on ? 1 : 0) - v.ink) * (1 - Math.exp(-dt / 0.15));
      v.t += dt;
      if (mel.on) { v.lo = Math.min(v.lo, mel.pitch); v.hi = Math.max(v.hi, mel.pitch); }
      const pn = clamp((mel.pitch - v.lo) / Math.max(0.15, v.hi - v.lo));
      const targetY = clamp(v.area.y + (0.5 - pn) * v.area.r * 2.4, this.H * 0.1, this.H * 0.9); // high notes rise
      const reach = v.area.r * 1.8;
      if (v.x < Math.max(this.W * 0.08, v.area.x - reach) && Math.cos(v.a) < 0) v.a = angleTo(Math.PI - v.a);
      if (v.x > Math.min(this.W * 0.92, v.area.x + reach) && Math.cos(v.a) > 0) v.a = angleTo(Math.PI - v.a);
      const dir = Math.cos(v.a) >= 0 ? 1 : -1;
      const want = Math.atan2((targetY - v.y) * 1.1, 120 * this.S * dir) + MB.noise3(v.seed, v.t, 0) * 0.3;
      v.a += angleTo(want - v.a) * 0.12;
      const sp = (95 + f.energy * 50) * this.S * dt;
      const nx = v.x + Math.cos(v.a) * sp, ny = v.y + Math.sin(v.a) * sp;
      if (v.ink > 0.04) {
        const ctx = this.art.getContext('2d');
        const w = (0.8 + mel.loud * 2.4) * this.S * v.ink;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'butt';
        ctx.strokeStyle = MB.hsla(v.color, 0.5);
        ctx.beginPath();
        // three fine bristles; the tooth breaks them up a little
        v.dist = (v.dist || 0) + sp;
        for (const o of [-0.35, 0, 0.35]) {
          const ox = -Math.sin(v.a) * o * w, oy = Math.cos(v.a) * o * w;
          const streak = 0.5 + 0.5 * MB.noise3(v.seed + o * 7, v.dist * 0.02, 4);
          if (0.5 * toothAt(v.x + ox, v.y + oy) + 0.5 * streak > 0.45 + 0.4 * v.ink) continue;
          ctx.moveTo(v.x + ox, v.y + oy);
          ctx.lineTo(nx + ox, ny + oy);
        }
        ctx.lineWidth = Math.max(0.7, w * 0.45);
        ctx.stroke();
      }
      v.x = clamp(nx, this.W * 0.04, this.W * 0.96);
      v.y = clamp(ny, this.H * 0.04, this.H * 0.96);
      if (!mel.on && v.ink < 0.04) {
        this.marks.push({ area: v.area, sx: v.x, sy: v.y, ex: v.x, ey: v.y, mx: v.x, my: v.y, a: v.a, w: 4 * this.S, len: 100 * this.S });
        this.voice = null;
      }
    }

    // ---------- Per frame ----------
    update(f, dt) {
      const idle = !this.active;
      if (idle) {
        // a few delicate marks behind the start screen, then rest
        if (this.idleMarks < 9) {
          this.clock -= dt;
          if (this.clock <= 0) {
            this.clock = rnd(1.2, 2.2);
            this.idleMarks++;
            this._mark(Math.random() < 0.5 ? 'detail' : 'dry', f);
          }
        }
      } else if (!f.silent) {
        const e = f.energy, L = f.lush || 0;
        const beat = 60 / clamp(f.bpm, 50, 190);
        // TEMPO: marks fall on a beat clock; denser music subdivides it
        const subdiv = L < 0.25 ? 2 : L < 0.55 ? 1 : 0.5;
        const maxActive = 4 + Math.round(L * 8);
        this.clock -= dt;
        if (this.clock <= 0) {
          this.clock += beat * subdiv * rnd(0.85, 1.15);
          if (this.clock < 0) this.clock = beat * subdiv;
          // quiet passages leave fewer marks
          if (this.strokes.length < maxActive && Math.random() < 0.4 + 0.6 * Math.min(1, e * 1.6)) {
            this._mark(this._type(f), f);
            // DENSITY: layers more marks per beat
            if (L > 0.6 && Math.random() < L * 0.5) this._mark(this._type(f), f);
          }
        }
        // ACCENTS: short loaded strokes on strong hits
        this.accentCool -= dt;
        if (f.beat && f.beatStrength > 0.45 && e > 0.35 && this.accentCool <= 0 && this.strokes.length < maxActive + 2) {
          this._mark('loaded', f, { accent: Math.random() < 0.35 });
          this.accentCool = beat * 0.75;
        }
        // PEAKS: a bold gesture when the music swells well above its norm
        this.eLong += (e - this.eLong) * (1 - Math.exp(-dt / 15));
        this.peakCool -= dt;
        if (e > 0.62 && e > this.eLong + 0.15 && this.peakCool <= 0) {
          this._mark('bold', f);
          this.peakCool = rnd(5, 9);
        }
        // WASHES: now and then, or when the harmony shifts, link passages
        this.washTimer += dt;
        if (this.lastWashMode === null) this.lastWashMode = f.mode;
        const shift = Math.abs(f.mode - this.lastWashMode) > 0.3;
        if ((this.washTimer > beat * 32 && L > 0.3) || (shift && this.washTimer > 6)) {
          this._wash(f);
          this.washTimer = 0;
          this.lastWashMode = f.mode;
        }
        // AREAS: a new, related area opens up over time or when the
        // arrangement changes a lot
        this.areaTimer += dt;
        const lushJump = Math.abs(L - this.lastAreaLush) > 0.35;
        if (this.areas.length < 4 && ((this.areaTimer > 22 && this.marks.length > 14) || (lushJump && this.areaTimer > 10))) {
          this._addArea();
          this.areaTimer = 0;
          this.lastAreaLush = L;
        }
        for (const a of this.areas) a.weight = Math.max(0.25, a.weight * Math.exp(-dt / 60));
      }

      for (const s of this.strokes) s.advance(this, dt);
      this.strokes = this.strokes.filter((s) => !s.done);
      if (!idle) this._voice(f, dt);
      this.render();
    }
  }

  MB.LivePainter = LivePainter;
})();

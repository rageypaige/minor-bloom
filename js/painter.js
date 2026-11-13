// The live painting.
//  - Brushes wander a flow field shaped by the music. How many there are
//    follows how full the arrangement is: a voice and a guitar get a few
//    quiet strokes; drums, bass and the rest make it lush.
//  - Strong accents flick off a brush as a quick, bright, tapered stroke,
//    with a spray of droplets on the loudest hits.
//  - The lead melody (usually the voice) is a thread of light that rises and
//    falls with its pitch, and breaks between phrases.
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const angleTo = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  class LivePainter {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.agents = [];
      this.flicks = [];
      this.t = 0;
      this.fadeTimer = 0;
      this.flowBias = 0;
      this.resize();
      this.thread = { x: this.w * 0.15, y: this.h * 0.5, a: 0, dir: 1, ink: 0 };
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      let old = null;
      if (this.c.width > 0 && this.w) {
        old = document.createElement('canvas');
        old.width = this.c.width;
        old.height = this.c.height;
        old.getContext('2d').drawImage(this.c, 0, 0);
      }
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.dpr = dpr;
      this.w = w;
      this.h = h;
      this.scale = Math.min(w, h) / 900;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = MB.PAPER;
      ctx.fillRect(0, 0, this.c.width, this.c.height);
      if (old) ctx.drawImage(old, 0, 0, this.c.width, this.c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    clear() {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = MB.PAPER;
      ctx.fillRect(0, 0, this.w, this.h);
      this.agents = [];
      this.flicks = [];
      this.thread.ink = 0;
    }

    // Where new brushes gather: a slowly wandering focus point.
    _focus() {
      const t = this.t * 0.08;
      return {
        x: this.w * clamp(0.5 + MB.noise3(t, 0.5, 1.7) * 0.9, 0.1, 0.9),
        y: this.h * clamp(0.5 + MB.noise3(0.5, t, 4.2) * 0.9, 0.1, 0.9),
      };
    }

    _spawn(f) {
      const lush = f.lush || 0;
      const fo = this._focus();
      // sparse music paints close together; full music spreads out
      const spread = Math.min(this.w, this.h) * (0.12 + lush * 0.3);
      const c = MB.moodHSL(Math.floor(Math.random() * 6), f);
      c.h = (c.h + (Math.random() - 0.5) * 16 + 360) % 360;
      const bristles = [];
      const nb = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < nb; i++) bristles.push((i / (nb - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.2);
      this.agents.push({
        x: fo.x + MB.gauss() * spread,
        y: fo.y + MB.gauss() * spread,
        angle: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 1.4 + Math.random() * 2.8, // seconds
        width: (5 + f.energy * 14 + lush * 24 + Math.random() * 6) * this.scale,
        color: c,
        bristles,
      });
    }

    // A quick, bright, tapered stroke that whips off an active brush.
    _makeFlick(f) {
      const loud = clamp(f.level * 0.75 + f.beatStrength * 0.25);
      let x, y, a;
      if (this.agents.length) {
        const ag = this.agents[Math.floor(Math.random() * this.agents.length)];
        x = ag.x; y = ag.y; a = ag.angle;
      } else {
        const fo = this._focus();
        x = fo.x; y = fo.y; a = Math.random() * Math.PI * 2;
      }
      const c = MB.accentHSL(Math.floor(Math.random() * 4), f);
      c.s = Math.min(100, c.s * 1.2);
      c.l = MB.theme.dark ? clamp(c.l + 8, 55, 72) : clamp(c.l - 8, 30, 55);
      return {
        x, y,
        a: a + (Math.random() - 0.5) * 0.9,
        bend: (Math.random() - 0.5) * 0.5,
        len: (14 + loud * loud * 120) * this.scale,
        w: (1.5 + loud * 6) * this.scale,
        c,
        steps: 6,
        done: 0,
        drops: Math.floor(loud * loud * 10),
      };
    }

    _drawFlick(fl) {
      const ctx = this.ctx;
      const seg = fl.len / fl.steps;
      const p = fl.done / fl.steps;
      const a = fl.a + fl.bend * p;
      const nx = fl.x + Math.cos(a) * seg, ny = fl.y + Math.sin(a) * seg;
      ctx.strokeStyle = MB.hsla(fl.c, 0.85);
      ctx.lineWidth = Math.max(0.4, fl.w * (1 - p * 0.85));
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      fl.x = nx; fl.y = ny; fl.a = a;
      fl.done++;
      if (fl.done === fl.steps && fl.drops) {
        ctx.fillStyle = MB.hsla(fl.c, 0.8);
        for (let i = 0; i < fl.drops; i++) {
          const d = fl.len * (0.08 + Math.random() * 0.45);
          const da = fl.a + (Math.random() - 0.5) * 0.7;
          const r = (0.6 + Math.random() * Math.random() * 2.6) * this.scale;
          ctx.beginPath();
          ctx.arc(fl.x + Math.cos(da) * d, fl.y + Math.sin(da) * d, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // The voice: one thread that drifts across the canvas, its height
    // following the melody's pitch.
    _thread(f, dt) {
      const th = this.thread, mel = f.melody;
      if (!mel) return;
      const ctx = this.ctx;
      th.ink += ((mel.on ? 1 : 0) - th.ink) * (1 - Math.exp(-dt / 0.15));
      // Stretch the song's own vocal range over the canvas height.
      if (mel.on) {
        if (th.lo === undefined) { th.lo = mel.pitch - 0.12; th.hi = mel.pitch + 0.12; }
        th.lo = Math.min(th.lo, mel.pitch);
        th.hi = Math.max(th.hi, mel.pitch);
        const k = 1 - Math.exp(-dt / 30);
        th.lo += (mel.pitch - 0.12 - th.lo) * k;
        th.hi += (mel.pitch + 0.12 - th.hi) * k;
      }
      const pn = th.lo === undefined ? 0.5 : clamp((mel.pitch - th.lo) / Math.max(0.15, th.hi - th.lo));
      const targetY = this.h * (0.82 - 0.64 * pn);
      const speed = (55 + f.energy * 35) * this.scale * dt;
      const want = Math.atan2((targetY - th.y) * 1.2, 140 * this.scale * th.dir)
        + MB.noise3(th.x * 0.004, th.y * 0.004, this.t * 0.3) * 0.35;
      th.a += angleTo(want - th.a) * 0.1;
      const nx = th.x + Math.cos(th.a) * speed;
      const ny = th.y + Math.sin(th.a) * speed;
      if (nx > this.w * 0.94) th.dir = -1;
      if (nx < this.w * 0.06) th.dir = 1;
      if (th.ink > 0.03) {
        const dark = MB.theme.dark;
        const hue = MB.accentHSL(0, f).h;
        const core = dark ? { h: hue, s: 45, l: 90 } : { h: hue, s: 40, l: 22 };
        const w = (0.8 + mel.loud * 2.8) * this.scale * th.ink;
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'source-over';
        if (dark) {
          ctx.shadowColor = MB.hsla({ h: hue, s: 60, l: 80 }, 0.7);
          ctx.shadowBlur = 10 * this.scale;
        }
        ctx.strokeStyle = MB.hsla(core, 0.8 * th.ink);
        ctx.lineWidth = Math.max(0.5, w);
        ctx.beginPath(); ctx.moveTo(th.x, th.y); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
      th.x = nx;
      th.y = ny;
    }

    update(f, dt) {
      const ctx = this.ctx;
      const lush = f.lush || 0;
      const ink = MB.theme.ink || 1;
      const tempo = clamp(f.bpm / 110, 0.5, 1.8);
      this.t += dt * (0.4 + 0.6 * tempo);
      this.flowBias += dt * 0.08 * (f.mode - 0.5);

      // Paint slowly dries back into the ground so the canvas stays fresh.
      // Sparse passages clear a little faster to keep them simple.
      this.fadeTimer += dt;
      if (this.fadeTimer > 0.5) {
        this.fadeTimer = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = MB.rgb(MB.groundFor(f), (MB.theme.tinted ? 0.045 : 0.03) + (1 - lush) * 0.02);
        ctx.fillRect(0, 0, this.w, this.h);
      }

      if (!f.silent) {
        const target = Math.round(2 + Math.pow(lush, 1.4) * 110 + f.energy * 3);
        let n = Math.min(4, target - this.agents.length);
        while (n-- > 0) this._spawn(f);
        // accents: rarer and only on real hits when the music is sparse
        const need = 0.15 + (1 - lush) * 0.35;
        if (f.beat && f.beatStrength > need && this.flicks.length < 10) this.flicks.push(this._makeFlick(f));
      }

      // Brush strokes.
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      const s = 0.0016 / Math.max(this.scale, 0.4);
      const turbulence = 1.4 + lush * 1.6;
      const speed = (60 + f.energy * 160 + lush * 60) * tempo * this.scale * dt;
      const alive = [];
      for (const a of this.agents) {
        a.life += dt;
        const n = MB.noise3(a.x * s, a.y * s, this.t * 0.06);
        const target = n * Math.PI * turbulence + this.flowBias;
        a.angle += angleTo(target - a.angle) * 0.12;
        const nx = a.x + Math.cos(a.angle) * speed;
        const ny = a.y + Math.sin(a.angle) * speed;
        const taper = Math.sin(Math.PI * clamp(a.life / a.maxLife));
        const w = a.width * taper;
        const px = -Math.sin(a.angle), py = Math.cos(a.angle);

        // soft body of the stroke
        ctx.strokeStyle = MB.hsla(a.color, (0.04 + f.energy * 0.03) * ink);
        ctx.lineWidth = Math.max(0.5, w * 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        // bristles, with a little dry-brush jitter
        ctx.strokeStyle = MB.hsla(a.color, Math.min(0.6, (0.12 + f.energy * 0.14) * ink));
        ctx.lineWidth = Math.max(0.5, 1.1 * this.scale);
        ctx.beginPath();
        for (const b of a.bristles) {
          if (Math.random() < 0.12) continue;
          const o = b * w * 0.5;
          const j = (Math.random() - 0.5) * 0.8;
          ctx.moveTo(a.x + px * o, a.y + py * o);
          ctx.lineTo(nx + px * (o + j), ny + py * (o + j));
        }
        ctx.stroke();

        a.x = nx;
        a.y = ny;
        const inside = a.x > -50 && a.y > -50 && a.x < this.w + 50 && a.y < this.h + 50;
        if (a.life < a.maxLife && inside) alive.push(a);
      }
      this.agents = alive;

      // Flicks on top of the brushwork, then the voice above everything.
      for (const fl of this.flicks) {
        this._drawFlick(fl);
        if (fl.done < fl.steps) this._drawFlick(fl);
      }
      this.flicks = this.flicks.filter((fl) => fl.done < fl.steps);
      this._thread(f, dt);
    }
  }

  MB.LivePainter = LivePainter;
})();

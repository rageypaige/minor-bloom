// The live painting: brushes wander a flow field shaped by the music, and
// accents bloom into watercolor washes.
(function () {
  const MB = (window.MB = window.MB || {});

  class LivePainter {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.agents = [];
      this.blooms = [];
      this.t = 0;
      this.fadeTimer = 0;
      this.flowBias = 0;
      this.resize();
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
      this.blooms = [];
    }

    // Where new brushes gather: a slowly wandering focus point.
    _focus() {
      const t = this.t * 0.08;
      return {
        x: this.w * MB.clamp(0.5 + MB.noise3(t, 0.5, 1.7) * 0.9, 0.1, 0.9),
        y: this.h * MB.clamp(0.5 + MB.noise3(0.5, t, 4.2) * 0.9, 0.1, 0.9),
      };
    }

    _spawn(f) {
      const fo = this._focus();
      const spread = Math.min(this.w, this.h) * 0.35;
      const idx = Math.floor(Math.random() * 6);
      const c = MB.moodHSL(idx, f);
      c.h = (c.h + (Math.random() - 0.5) * 16 + 360) % 360;
      const bristles = [];
      const nb = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < nb; i++) bristles.push((i / (nb - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.2);
      this.agents.push({
        x: fo.x + MB.gauss() * spread,
        y: fo.y + MB.gauss() * spread,
        angle: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 1.2 + Math.random() * 2.8, // seconds
        width: (8 + f.energy * 30 + Math.random() * 8) * this.scale,
        color: c,
        bristles,
      });
    }

    _makeBloom(f) {
      const r = (35 + f.beatStrength * 80 + f.energy * 60) * this.scale;
      const fo = this._focus();
      const x = fo.x + MB.gauss() * this.w * 0.2;
      const y = fo.y + MB.gauss() * this.h * 0.2;
      const accent = Math.random() < 0.4;
      const idx = Math.floor(Math.random() * 6);
      const color = accent ? MB.accentHSL(idx, f) : MB.moodHSL(idx, f);
      return {
        base: MB.deform(MB.polygon(x, y, r, 10), 3, 0.45),
        color,
        layers: 26,
        done: 0,
      };
    }

    update(f, dt) {
      const ctx = this.ctx;
      const tempo = MB.clamp(f.bpm / 110, 0.5, 1.8);
      this.t += dt * (0.4 + 0.6 * tempo);
      this.flowBias += dt * 0.08 * (f.mode - 0.5);

      // Paint slowly dries back into the paper so the canvas stays fresh.
      this.fadeTimer += dt;
      if (this.fadeTimer > 0.5) {
        this.fadeTimer = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(242,235,223,0.03)';
        ctx.fillRect(0, 0, this.w, this.h);
      }

      if (!f.silent) {
        const target = Math.round(14 + f.energy * 100);
        let n = Math.min(4, target - this.agents.length);
        while (n-- > 0) this._spawn(f);
        if (f.beat && f.beatStrength > 0.2 && this.blooms.length < 5) this.blooms.push(this._makeBloom(f));
      }

      // Watercolor blooms spread over a few frames, glazed with multiply.
      ctx.globalCompositeOperation = 'multiply';
      for (const b of this.blooms) {
        for (let k = 0; k < 2 && b.done < b.layers; k++, b.done++) {
          MB.fillPoly(ctx, MB.deform(b.base, 2, 0.28), MB.hsla(b.color, 0.035));
        }
      }
      this.blooms = this.blooms.filter((b) => b.done < b.layers);

      // Brush strokes.
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      const s = 0.0016 / Math.max(this.scale, 0.4);
      const turbulence = 1.6 + f.energy * 1.4;
      const speed = (60 + f.energy * 200) * tempo * this.scale * dt;
      const alive = [];
      for (const a of this.agents) {
        a.life += dt;
        const n = MB.noise3(a.x * s, a.y * s, this.t * 0.06);
        const target = n * Math.PI * turbulence + this.flowBias;
        let d = target - a.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a.angle += d * 0.12;
        const nx = a.x + Math.cos(a.angle) * speed;
        const ny = a.y + Math.sin(a.angle) * speed;
        const taper = Math.sin(Math.PI * MB.clamp(a.life / a.maxLife));
        const w = a.width * taper;
        const px = -Math.sin(a.angle), py = Math.cos(a.angle);

        // soft body of the stroke
        ctx.strokeStyle = MB.hsla(a.color, 0.04 + f.energy * 0.03);
        ctx.lineWidth = Math.max(0.5, w * 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        // bristles, with a little dry-brush jitter
        ctx.strokeStyle = MB.hsla(a.color, 0.12 + f.energy * 0.14);
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
    }
  }

  MB.LivePainter = LivePainter;
})();

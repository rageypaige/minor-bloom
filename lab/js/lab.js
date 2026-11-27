// BLOOM LAB: a blank canvas for new visuals. The music is already read for
// you (see music.js: this.music.dims, .vol, .bass, .mid, .high, .beats,
// .colA / .colB, ...); draw whatever you like in draw().
//
// For now it only fills the aubergine ground and breathes one faint,
// soft glow of the current palette colour, so it's clear the music is
// coming through. Press D to show a small readout of what it hears.
(function () {
  const MB = (window.MB = window.MB || {});

  class Lab {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.music = new MB.Music();
      this.dims = null;          // (read by the mood words in the corner)
      this.t = 0;
      this.debug = new URLSearchParams(location.search).has('debug');
      window.addEventListener('keydown', (e) => {
        if ((e.key === 'd' || e.key === 'D') && !(e.target instanceof HTMLInputElement)) this.debug = !this.debug;
      });
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.c.width = Math.round(window.innerWidth * this.dpr);
      this.c.height = Math.round(window.innerHeight * this.dpr);
    }

    reset() { this.music.reset(); this.dims = null; }

    update(f, dt) {
      this.t += dt;
      this.music.update(f, dt);
      this.dims = this.music.dims;
      this.draw();
    }

    draw() {
      const { ctx, c, music: m } = this;
      const W = c.width, H = c.height;
      const rgb = (col, a = 1) => `rgba(${col.map((v) => Math.round(v * 255)).join(',')},${a})`;
      // the ground
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgb(MB.INK.ground);
      ctx.fillRect(0, 0, W, H);
      // placeholder: one faint, soft glow that breathes with the music
      const r = Math.min(W, H) * (0.18 + 0.22 * m.lumin);
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
      g.addColorStop(0, rgb(m.colA, 0.10 + 0.25 * m.lumin));
      g.addColorStop(0.6, rgb(m.colB, 0.05 + 0.1 * m.lumin));
      g.addColorStop(1, rgb(m.colB, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (this.debug) this._readout();
    }

    // D: what the music module hears, as small bars
    _readout() {
      const { ctx, music: m, dpr } = this;
      const D = m.dims || {};
      const rows = [
        ['harm', D.harm], ['energy', D.energy], ['rhythm', D.rhythm], ['tension', D.tension],
        ['texture', D.texture], ['variation', D.variation], ['vol', m.vol], ['bass', m.bass],
        ['mid', m.mid], ['high', m.high], ['lumin', m.lumin], ['beat', m.beats.length ? Math.max(0, 1 - m.beats[m.beats.length - 1].t * 2) : 0],
      ];
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `${11 * dpr}px Inter, system-ui, sans-serif`;
      rows.forEach(([name, v], i) => {
        const x = 16 * dpr, y = (16 + i * 16) * dpr;
        ctx.fillStyle = 'rgba(240,235,230,0.55)';
        ctx.fillText(name, x, y + 9 * dpr);
        ctx.fillStyle = 'rgba(240,235,230,0.12)';
        ctx.fillRect(x + 64 * dpr, y, 120 * dpr, 10 * dpr);
        ctx.fillStyle = 'rgba(240,235,230,0.6)';
        ctx.fillRect(x + 64 * dpr, y, 120 * dpr * Math.max(0, Math.min(1, v || 0)), 10 * dpr);
      });
      const y0 = (16 + rows.length * 16 + 4) * dpr;
      [m.colA, m.colB].forEach((col, i) => {
        ctx.fillStyle = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
        ctx.fillRect((80 + i * 64) * dpr, y0, 56 * dpr, 12 * dpr);
      });
    }

    // A still of the current moment, for saving.
    capture() {
      this.draw();
      const out = document.createElement('canvas');
      out.width = this.c.width;
      out.height = this.c.height;
      const prev = this.debug;
      this.debug = false;
      this.draw();
      out.getContext('2d').drawImage(this.c, 0, 0);
      this.debug = prev;
      return out;
    }
  }

  MB.Lab = Lab;
})();

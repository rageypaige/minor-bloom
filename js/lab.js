// BLOOM LAB: sculptural sheets of light (prototype).
// Ties the independent systems together:
//   js/lab/synth.js       synthetic input (stands in for the music for now)
//   js/lab/geometry.js    deformable sheets: spine, width, twist, curl, skew
//   js/lab/motion.js      composition, hierarchy, drift and shape parameters
//   js/lab/material.js    how light passes through the sheets; compositing
//   js/lab/compositor.js  draws the sheets and tone-maps them
// The music is still read (js/music.js), for the words in the corner and
// for later; for now the visuals follow the synthetic input. Press A to
// let them follow the music instead (experimental), ?dev for sliders.
(function () {
  const MB = (window.MB = window.MB || {});

  class Lab {
    constructor(canvas) {
      this.c = canvas;
      this.music = new MB.Music();
      this.synth = new MB.LabSynth();
      this.material = MB.LabMaterial;
      this.comp = new MB.LabCompositor(canvas);
      this.dims = null;
      this.t = 0;
      this.source = 'synth';
      this.resize();
      this.motion = new MB.LabMotion(this.c.width / this.c.height);
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('keydown', (e) => {
        if ((e.key === 'a' || e.key === 'A') && !(e.target instanceof HTMLInputElement)) {
          this.source = this.source === 'synth' ? 'music' : 'synth';
          this._flag(this.source === 'synth' ? 'synthetic input' : 'following the music');
        }
      });
      if (new URLSearchParams(location.search).has('dev')) this._devPanel();
    }

    resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const k = dpr * this.material.scale;
      this.c.width = Math.max(64, Math.round(window.innerWidth * k));
      this.c.height = Math.max(64, Math.round(window.innerHeight * k));
      this._scale = this.material.scale;
      if (this.motion) this.motion.asp = this.c.width / this.c.height;
    }

    reset() { this.music.reset(); this.dims = null; }

    // the input the visuals follow: synthetic, or the music's own reading
    _input() {
      if (this.source === 'synth') return this.synth.v;
      const m = this.music, D = m.dims || {};
      return { ...D, lumin: m.lumin, palettePos: m.palettePos ?? 2 };
    }

    update(f, dt) {
      this.t += dt;
      this.music.update(f, dt);
      this.dims = this.music.dims;
      this.synth.update(dt);
      if (this._scale !== this.material.scale) this.resize();
      const input = this._input();
      this.motion.step(dt, input);
      this.draw(input);
    }

    draw(input = this._input()) {
      const ramp = MB.INK.ramp, pos = input.palettePos ?? 2;
      const lit = 0.55 + 0.9 * (input.lumin ?? 0.4);
      // colour: each formation takes its own stretch of the palette, so warm
      // and cool can sit side by side
      const offs = [[0, 0.7], [0.7, 1.4], [-0.6, 0.2], [1.3, 1.9]];
      const active = this.motion.active;
      const forms = active.map((F, i) => {
        MB.LabGeometry.buildFormation(this.comp.data, i, F, this.motion.p, F.t);
        return { colA: ramp(pos + offs[i][0]), colB: ramp(pos + offs[i][1]), bright: lit * F.bright };
      });
      this.comp.render(forms, this.material, this.t, MB.INK.ground);
    }

    _flag(text) {
      let tag = document.getElementById('lab-tag');
      if (!tag) {
        tag = document.createElement('p');
        tag.id = 'lab-tag';
        tag.style.cssText = 'position:fixed;top:14px;right:20px;margin:0;font-size:15px;color:var(--ink-soft);transition:opacity .8s;pointer-events:none';
        document.body.appendChild(tag);
      }
      tag.textContent = text;
      tag.style.opacity = 1;
      clearTimeout(tag._t);
      tag._t = setTimeout(() => { tag.style.opacity = 0; }, 1600);
    }

    // ?dev: sliders for the material, the movement and the synthetic input
    _devPanel() {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;top:12px;left:12px;z-index:9;padding:10px 12px;background:rgba(10,10,16,.8);color:#ddd;font:12px Inter,system-ui,sans-serif;border-radius:6px;line-height:1.8;max-height:calc(100vh - 24px);overflow:auto';
      const row = (label, lo, hi, st, get, set, fmt = (v) => v) => {
        const r = document.createElement('label');
        r.style.cssText = 'display:grid;grid-template-columns:84px 120px 44px;gap:6px;align-items:center';
        const inp = document.createElement('input');
        Object.assign(inp, { type: 'range', min: lo, max: hi, step: st, value: get() });
        const val = document.createElement('span');
        val.textContent = fmt(get());
        inp.addEventListener('input', () => { set(+inp.value); val.textContent = fmt(+inp.value); });
        r.append(label, inp, val);
        box.append(r);
      };
      const head = (t) => { const h = document.createElement('div'); h.textContent = t; h.style.cssText = 'margin-top:6px;color:#999;text-transform:uppercase;letter-spacing:.1em;font-size:10px'; box.append(h); };
      head('material');
      const M = this.material, Rg = MB.LabMaterialRanges;
      for (const k in Rg) row(k, ...Rg[k], () => M[k], (v) => { M[k] = v; });
      head('formations');
      const P = this.motion.p;
      const shape = { count: [1, 4, 1], curvature: [0, 2, 0.05], fold: [0, 1.5, 0.05], widthVar: [0, 1.5, 0.05],
        orient: [-3.14, 3.14, 0.05], scale: [0.3, 2, 0.05], depth: [0, 1.5, 0.05], speed: [0, 4, 0.05] };
      for (const k in shape) row(k, ...shape[k], () => P[k], (v) => { P[k] = v; });
      head('synthetic input (left end = automatic)');
      for (const k of ['energy', 'harm', 'tension', 'texture', 'variation']) {
        row(k, -0.05, 1, 0.01, () => this.synth.pin[k] ?? -0.05, (v) => { if (v < 0) delete this.synth.pin[k]; else this.synth.pin[k] = v; }, (v) => (v < 0 ? 'auto' : v.toFixed(2)));
      }
      document.body.appendChild(box);
    }

    // A still of the current moment, for saving (at full screen size).
    capture() {
      this.draw();
      const out = document.createElement('canvas');
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      out.width = Math.round(window.innerWidth * dpr);
      out.height = Math.round(window.innerHeight * dpr);
      const x = out.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(this.c, 0, 0, out.width, out.height);
      return out;
    }
  }

  MB.Lab = Lab;
})();

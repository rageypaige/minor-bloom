// Atmosphere: soft fields of coloured light suspended in a deep charcoal
// fog, with fine film grain and a few crisp points of light.
//
// Three WebGL passes each frame:
//   1. scene  - the forms as they are right now (half resolution; it's fog)
//   2. trace  - a slowly diffusing memory of earlier moments (feedback)
//   3. output - scene + trace, gently tone-mapped, crisp points, film grain
//
// Musical roles (all from the existing analysis):
//   volume  -> fullness, scale and luminosity of the forms
//   bass    -> deep, rounded swelling and slow pressure ripples
//   mid     -> internal folds, stretching and flowing movement
//   high    -> sparse fine points and delicate surface shimmer
//   tempo   -> the cadence of gestures
//   density -> how many layers there are and how complex the space is
//   harmony -> colour, through the existing major/minor palettes
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MAXF = 12, MAXP = 64;
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

  const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

  const NOISE = `
float hash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
const mat2 ROT = mat2(.8, .6, -.6, .8);
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = ROT * p * 2.07 + vec2(1.7, 9.2); a *= .5; } return s; }`;

  const SCENE = `#version 300 es
precision highp float;
uniform vec2 u_res; uniform float u_time, u_high, u_haze;
uniform vec3 u_tint; uniform int u_n;
uniform vec4 fA[${MAXF}], fB[${MAXF}], fC[${MAXF}], fD[${MAXF}];
out vec4 o;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;
  vec2 p = vec2((uv.x - .5) * asp, uv.y - .5);
  float t = u_time;
  // the air itself: a faint haze, slowly moving, tinted by the palette
  float h = fbm(ROT * p * 1.2 + vec2(t * .011, -t * .007) + .3 * vec2(fbm(p * .7 + 3.1), fbm(p * .7 - 5.3)));
  vec3 col = u_tint * (.25 + 1.6 * h * h * h) * u_haze;
  for (int i = 0; i < ${MAXF}; i++) {
    if (i >= u_n) break;
    vec4 A = fA[i], B = fB[i], C = fC[i], D = fD[i];
    vec2 d = p - A.xy;
    float cr = cos(B.x), sr = sin(B.x);
    d = mat2(cr, sr, -sr, cr) * d / A.zw;
    if (dot(d, d) > 10.) continue;
    float s = B.z, tt = mod(t * .035, 512.) + s;
    // folds: the form's space is bent by slow noise (midrange)
    vec2 w = vec2(fbm(d * 1.3 + vec2(tt, s)), fbm(d * 1.3 + vec2(s * 1.7, -tt))) - .47;
    // and its silhouette is pulled into an irregular shape of its own
    vec2 w2 = vec2(fbm(d * .65 + s * 3.), fbm(d * .65 - s * 2.)) - .47;
    vec2 q = d + w * B.y + w2 * 1.1;
    float r = length(q);
    // a pressure ripple travelling outward (bass)
    r += D.y * sin(r * 6.5 - D.x) * exp(-r * 1.1);
    float dens = exp(-r * r * 1.7);
    // uneven feathering into the dark
    float edge = fbm(q * 2.4 + s * 5. - tt * .6);
    dens *= smoothstep(.04, .8, dens * .85 + edge * .6 - .12);
    // internal texture, density variation and fine shimmer (highs)
    float tex = fbm(q * 4.2 + vec2(-tt * 1.3, tt));
    dens *= .5 + tex + u_high * .3 * (noise(q * 24. + t * 2.3) - .5);
    dens = max(dens, 0.);
    vec3 c = C.rgb * B.w * dens;
    // a luminous concentration, kept for strong moments
    c += mix(C.rgb, vec3(1.), .4) * C.a * pow(dens, 2.4) * 1.5;
    col += c * D.z;
  }
  o = vec4(col, 1.);
}`;

  const TRACE = `#version 300 es
precision highp float;
uniform sampler2D u_prev, u_scene; uniform vec2 u_res; uniform float u_k, u_spread;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_res, px = 1. / u_res;
  // earlier light drifts outward a little and softens as it fades
  vec2 c = uv - (uv - .5) * u_spread;
  vec3 pr = texture(u_prev, c).rgb * .4
    + (texture(u_prev, c + vec2(px.x * 1.5, 0)).rgb + texture(u_prev, c - vec2(px.x * 1.5, 0)).rgb
     + texture(u_prev, c + vec2(0, px.y * 1.5)).rgb + texture(u_prev, c - vec2(0, px.y * 1.5)).rgb) * .15;
  o = vec4(mix(pr, texture(u_scene, uv).rgb, u_k), 1.);
}`;

  const OUT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_trace; uniform vec2 u_res;
uniform float u_time, u_exposure, u_traceMix; uniform vec3 u_base;
uniform vec4 u_pts[${MAXP}]; uniform int u_np;
out vec4 o;
float hash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 L = texture(u_scene, uv).rgb * .8 + texture(u_trace, uv).rgb * u_traceMix;
  vec3 col = u_base + (1. - exp(-L * u_exposure));
  // a few crisp points
  for (int i = 0; i < ${MAXP}; i++) {
    if (i >= u_np) break;
    vec4 P = u_pts[i];
    float d = length(gl_FragCoord.xy - P.xy);
    col += vec3(1., .97, .92) * P.w * smoothstep(P.z, P.z * .55, d);
  }
  // film grain everywhere, a little stronger in the light
  float g = hash(gl_FragCoord.xy + fract(u_time * 7.13) * vec2(311., 173.)) - .5;
  float lum = dot(col, vec3(.3, .59, .11));
  col += g * (.04 + .1 * lum);
  col *= 1. + g * .06;
  o = vec4(col, 1.);
}`;

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  class Atmosphere {
    constructor(canvas) {
      this.c = canvas;
      const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false }));
      if (!gl) throw new Error('WebGL2 is not available');
      this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
      this.progScene = this._prog(SCENE);
      this.progTrace = this._prog(TRACE);
      this.progOut = this._prog(OUT);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.t = rnd(0, 100);
      this.forms = [];
      this.points = [];
      this.focus = { x: 0, y: 0, seed: rnd(0, 50) };
      this.vol = 0.1;
      this.eLong = 0.3;
      this.clock = 1;
      this.spawnCool = 0;
      this.rippleNext = 0;
      this.tint = [0.1, 0.1, 0.12];
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.reset();
    }

    _prog(fs) {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'a');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u };
    }

    _target(w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb, w, h };
    }

    resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.dpr = dpr;
      this.asp = w / h;
      const sw = Math.max(64, Math.round(w * 0.5)), shh = Math.max(64, Math.round(h * 0.5));
      this.scene = this._target(sw, shh);
      this.traces = [this._target(sw, shh), this._target(sw, shh)];
    }

    reset() {
      this.forms = [];
      this.points = [];
      for (const tr of this.traces) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tr.fb);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      // the air: two broad, barely visible clouds that extend past the edges
      for (let i = 0; i < 2; i++) this._spawn('air');
      this._spawn('body');
    }

    // ---------- Forms ----------
    _spawn(kind) {
      const A = this.asp;
      let best = null, bestScore = -1e9;
      // look for a spot with some room, near the current area of focus,
      // sometimes reaching past the edge of the screen
      for (let k = 0; k < 10; k++) {
        const x = rnd(-0.62, 0.62) * A, y = rnd(-0.6, 0.6);
        let room = 1;
        for (const f of this.forms) if (f.kind === 'body') room = Math.min(room, Math.hypot(f.x - x, f.y - y));
        const toFocus = Math.hypot(this.focus.x - x, this.focus.y - y);
        const score = (kind === 'air' ? 0 : room) - 0.45 * toFocus + rnd(0, 0.15);
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
      const air = kind === 'air';
      const size = air ? rnd(0.55, 0.85) : rnd(0.12, 0.24);
      this.forms.push({
        kind, x: best.x, y: best.y, vx: 0, vy: 0,
        hx: best.x, hy: best.y,
        size, aspect: rnd(0.65, 1.5), rot: rnd(0, Math.PI), spin: rnd(-0.02, 0.02),
        seed: rnd(0, 9), pal: Math.floor(rnd(0, 6)),
        age: 0, span: air ? rnd(70, 140) : rnd(18, 50), presence: 0,
        col: null, swell: 0, rip: 0, ripAmp: 0, glow: 0,
        bassy: Math.random() < 0.6, // not every form answers the bass
      });
    }

    _colour(form, f) {
      const c = MB.moodHSL(form.pal, f);
      // restrained: muted, with lightness kept in a soft middle range
      const rgb = hslToRgb(c.h, c.s * (form.kind === 'air' ? 0.42 : 0.6), clamp(c.l * 0.75 + 16, 30, 66));
      return rgb;
    }

    update(f, dt) {
      const lush = f.lush || 0;
      const t = (this.t += dt);
      // volume with a quick, gentle attack and a slower release
      const lvl = f.silent ? 0 : (f.level ?? f.energy);
      this.vol += (lvl - this.vol) * ease(dt, lvl > this.vol ? 0.12 : 1.2);
      const vol = this.vol;
      const bass = f.bass || 0, mid = f.mid ?? 0.3, high = f.high || 0;
      this.eLong += (f.energy - this.eLong) * ease(dt, 20);
      const peak = clamp((f.energy - this.eLong - 0.08) * 3);

      // the area of focus wanders slowly over the whole screen
      const fs = this.focus.seed;
      this.focus.x = MB.noise3(t * 0.012, fs, 0) * 1.6 * this.asp * 0.5;
      this.focus.y = MB.noise3(fs, t * 0.012, 3) * 0.8;

      // DENSITY: how many forms there are
      const want = Math.round(1 + lush * 4.5 + vol * 1.5);
      const bodies = this.forms.filter((x) => x.kind === 'body' && x.age < x.span);
      this.spawnCool -= dt;
      if (bodies.length < want && this.spawnCool <= 0 && !f.silent) {
        this._spawn('body');
        this.spawnCool = rnd(1.5, 4);
      }
      if (bodies.length > want + 1) {
        const oldest = bodies.reduce((a, b) => (a.age / a.span > b.age / b.span ? a : b));
        oldest.span = Math.min(oldest.span, oldest.age + 6);
      }
      const airs = this.forms.filter((x) => x.kind === 'air' && x.age < x.span);
      if (airs.length < 2 + (lush > 0.55 ? 1 : 0)) this._spawn('air');

      // TEMPO: gestures fall on a slow beat clock, one form at a time
      const beat = 60 / clamp(f.bpm || 90, 50, 190);
      this.clock -= dt;
      if (this.clock <= 0 && this.forms.length) {
        this.clock = beat * (lush < 0.3 ? 4 : lush < 0.6 ? 2 : 1) * rnd(0.9, 1.1);
        const g = this.forms[Math.floor(Math.random() * this.forms.length)];
        const a = rnd(0, Math.PI * 2), k = 0.012 * (0.4 + vol) * (g.kind === 'air' ? 0.4 : 1);
        g.vx += Math.cos(a) * k;
        g.vy += Math.sin(a) * k;
        g.spin += rnd(-0.03, 0.03);
      }

      // BASS: a hit sends a pressure ripple through one form, not all
      if (f.bassHit) {
        const cands = this.forms.filter((x) => x.bassy && x.presence > 0.3);
        if (cands.length) {
          const g = cands[this.rippleNext++ % cands.length];
          g.rip = 0;
          g.ripAmp = 0.05 + 0.12 * f.bassHit;
          g.swell = Math.min(1, g.swell + 0.35 * f.bassHit);
        }
      }

      const others = this.forms;
      for (const g of this.forms) {
        g.age += dt;
        const fadeIn = clamp(g.age / (g.kind === 'air' ? 10 : 5));
        const fadeOut = clamp((g.span - g.age) / (g.kind === 'air' ? 14 : 7));
        g.presence = Math.min(fadeIn, fadeOut);

        // slow underlying drift with inertia; the midrange makes it flow
        const flow = 0.25 + mid * 0.9;
        g.hx += MB.noise3(g.seed, t * 0.02, 1) * 0.004 * flow;
        g.hy += MB.noise3(g.seed, t * 0.02, 5) * 0.004 * flow;
        g.hx = clamp(g.hx, -0.7 * this.asp, 0.7 * this.asp);
        g.hy = clamp(g.hy, -0.7, 0.7);
        const wx = g.hx + MB.noise3(g.seed, t * 0.05 * flow, 2) * 0.25;
        const wy = g.hy + MB.noise3(g.seed, t * 0.05 * flow, 7) * 0.2;
        g.vx += (wx - g.x) * 0.25 * dt;
        g.vy += (wy - g.y) * 0.25 * dt;
        g.vx *= Math.exp(-dt / 2.5);
        g.vy *= Math.exp(-dt / 2.5);
        g.x += g.vx * dt * 10;
        g.y += g.vy * dt * 10;
        g.rot += g.spin * dt * (0.5 + mid);
        g.spin *= Math.exp(-dt / 8);

        // BASS: deep, rounded swelling with a slow release
        const bassTarget = g.bassy ? bass * 0.5 : bass * 0.12;
        g.swell += (bassTarget - g.swell) * ease(dt, bassTarget > g.swell ? 0.15 : 1.6);
        g.rip += dt * 5;
        g.ripAmp *= Math.exp(-dt / 0.9);

        // PEAKS: the brightest light is kept for strong moments, near focus
        const near = Math.exp(-Math.hypot(g.x - this.focus.x, g.y - this.focus.y) * 2);
        const glowT = g.kind === 'body' ? peak * near : 0;
        g.glow += (glowT - g.glow) * ease(dt, glowT > g.glow ? 0.25 : 2.5);

        // colour: the palette, muted, mingling with nearby forms
        let target = this._colour(g, f);
        let wsum = 0;
        const mixc = [0, 0, 0];
        for (const o of others) {
          if (o === g || !o.col) continue;
          const w = Math.exp(-Math.hypot(o.x - g.x, o.y - g.y) * 3) * o.presence;
          wsum += w;
          for (let i = 0; i < 3; i++) mixc[i] += o.col[i] * w;
        }
        if (wsum > 0) target = target.map((v, i) => v * 0.75 + (mixc[i] / wsum) * 0.25);
        if (!g.col) g.col = target;
        else g.col = g.col.map((v, i) => v + (target[i] - v) * ease(dt, 5));
      }
      this.forms = this.forms.filter((g) => g.age < g.span);

      // HIGHS: sparse, fine points embedded in the brighter forms
      const rate = high * high * 10 + (f.spark ? 2 : 0);
      let n = Math.floor(rate * dt + Math.random());
      if (rate <= 0) n = 0;
      const hosts = this.forms.filter((g) => g.kind === 'body' && g.presence > 0.4);
      while (n-- > 0 && hosts.length && this.points.length < MAXP) {
        const g = hosts[Math.floor(Math.random() * hosts.length)];
        const r = g.size * (1 + g.swell * 0.4);
        this.points.push({
          g, ox: MB.gauss() * r * 0.45, oy: MB.gauss() * r * 0.45,
          age: 0, life: rnd(0.8, 3.5), size: rnd(1.3, 2.4), bright: rnd(0.6, 1),
        });
      }
      for (const p of this.points) p.age += dt;
      this.points = this.points.filter((p) => p.age < p.life);

      // background tint follows the palette
      const tint = [0, 0, 0];
      let tw = 0;
      for (const g of this.forms) {
        if (!g.col) continue;
        const w = g.presence * g.size;
        tw += w;
        for (let i = 0; i < 3; i++) tint[i] += g.col[i] * w;
      }
      if (tw > 0) for (let i = 0; i < 3; i++) this.tint[i] += (tint[i] / tw - this.tint[i]) * ease(dt, 4);

      this.render(f, dt);
    }

    // ---------- Drawing ----------
    render(f, dt) {
      const gl = this.gl;
      const lush = f.lush || 0, vol = this.vol, mid = f.mid ?? 0.3, high = f.high || 0;
      const A = new Float32Array(MAXF * 4), B = new Float32Array(MAXF * 4);
      const C = new Float32Array(MAXF * 4), D = new Float32Array(MAXF * 4);
      // draw broad air first, then bodies
      const list = this.forms.slice().sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'air' ? -1 : 1)).slice(0, MAXF);
      list.forEach((g, i) => {
        const air = g.kind === 'air';
        // VOLUME: fullness, scale and luminosity
        const scale = g.size * (0.72 + 0.5 * vol) * (1 + 0.32 * g.swell);
        const stretch = g.aspect * (1 + mid * 0.45 * Math.sin(g.seed + this.t * 0.07));
        A.set([g.x, g.y, scale * stretch, scale / Math.sqrt(stretch)], i * 4);
        const warp = (air ? 0.5 : 0.3) + mid * 0.7 + lush * 0.25;
        const lum = air ? 0.025 + 0.045 * vol + 0.035 * lush : 0.08 + 0.5 * vol;
        B.set([g.rot, warp, g.seed, lum * g.presence], i * 4);
        const c = g.col || [0.5, 0.5, 0.5];
        C.set([c[0], c[1], c[2], g.glow * g.presence], i * 4);
        D.set([g.rip, g.ripAmp, 1, 0], i * 4);
      });

      gl.bindVertexArray(null);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // 1. scene
      const S = this.scene;
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fb);
      gl.viewport(0, 0, S.w, S.h);
      let P = this.progScene;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.u_res, S.w, S.h);
      gl.uniform1f(P.u.u_time, this.t);
      gl.uniform1f(P.u.u_high, high);
      // quiet passages keep the air thin and spacious
      gl.uniform1f(P.u.u_haze, 0.07 + 0.2 * lush + 0.08 * vol);
      gl.uniform3fv(P.u.u_tint, this.tint.map((v) => v * 0.22));
      gl.uniform1i(P.u.u_n, list.length);
      gl.uniform4fv(P.u.fA, A);
      gl.uniform4fv(P.u.fB, B);
      gl.uniform4fv(P.u.fC, C);
      gl.uniform4fv(P.u.fD, D);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 2. trace: traces of earlier moments linger and diffuse
      const [prev, next] = this.traces;
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.fb);
      P = this.progTrace;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.tex);
      gl.uniform1i(P.u.u_prev, 0);
      gl.uniform1i(P.u.u_scene, 1);
      gl.uniform2f(P.u.u_res, next.w, next.h);
      gl.uniform1f(P.u.u_k, ease(dt || 1 / 60, 1.6 + lush * 1.4));
      gl.uniform1f(P.u.u_spread, 0.0009 * (dt || 1 / 60) * 60);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.traces = [next, prev];

      // 3. output
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.c.width, this.c.height);
      P = this.progOut;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, next.tex);
      gl.uniform1i(P.u.u_scene, 0);
      gl.uniform1i(P.u.u_trace, 1);
      gl.uniform2f(P.u.u_res, this.c.width, this.c.height);
      gl.uniform1f(P.u.u_time, this.t);
      gl.uniform1f(P.u.u_exposure, 1.35);
      gl.uniform1f(P.u.u_traceMix, 0.5);
      const base = [0.055, 0.055, 0.062].map((v, i) => v + this.tint[i] * 0.03);
      gl.uniform3fv(P.u.u_base, base);
      const pts = new Float32Array(MAXP * 4);
      let np = 0;
      for (const p of this.points) {
        const g = p.g;
        const x = ((g.x + p.ox) / this.asp + 0.5) * this.c.width;
        const y = (g.y + p.oy + 0.5) * this.c.height;
        const life = Math.min(1, p.age / 0.15) * Math.min(1, (p.life - p.age) / (p.life * 0.6));
        pts.set([x, y, p.size * this.dpr, p.bright * life * g.presence], np * 4);
        np++;
      }
      gl.uniform4fv(P.u.u_pts, pts);
      gl.uniform1i(P.u.u_np, np);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // A still of the current moment, for saving.
    capture(f) {
      this.render(f, 1 / 60);
      const out = document.createElement('canvas');
      out.width = this.c.width;
      out.height = this.c.height;
      out.getContext('2d').drawImage(this.c, 0, 0);
      return out;
    }
  }

  MB.Atmosphere = Atmosphere;
})();

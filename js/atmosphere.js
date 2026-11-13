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
//   bass    -> gently displaces and expands the larger forms
//   mid     -> internal folds and flowing movement
//   high    -> fleeting fine detail: points, shimmer, small lights
//   tempo   -> the cadence of gestures
//   density -> how many layers there are and how complex the space is
//   peaks   -> occasionally one broad form dominates, then dissolves
//   harmony -> colour, through the existing major/minor palettes; each
//              chord change washes its own colour outward through the forms
//   builds  -> the scene draws in (darker edges, gathered, tighter light);
//              an arrival breaks it open in a large luminous bloom
//   phrases -> the whole scene slowly breathes over each phrase (16 beats)
//
// Depth comes from three layers with different speeds and lifespans:
//   distant  - broad, barely visible colour fields, very slow
//   midground - washes, blooms, veils and wisps with flowing texture
//   foreground - a few small concentrated lights, more sharply defined
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MAXF = 12, MAXP = 24, MAXE = 6;
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  const angleTo = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  // Kinds of form. sil: how irregular the silhouette is; fall: how quickly
  // density falls off (higher = denser, more defined); tex: strength of
  // internal texture; edge: how broken the feathered edge is; fold: base
  // folding; drift: speed on the shared current; grow: seconds to open out.
  const KINDS = {
    field: { layer: 0, size: [0.6, 1.05], aspect: [0.9, 1.8], span: [90, 180], grow: 14, sil: 0.9, fall: 1.0, tex: 0.3, edge: 0.45, fold: 0.25, drift: 0.3, lum: 1, sat: 0.36 },
    wash:  { layer: 1, size: [0.3, 0.5],  aspect: [1.2, 2.2], span: [35, 70],  grow: 8,  sil: 1.0, fall: 1.25, tex: 0.5, edge: 0.65, fold: 0.35, drift: 0.55, lum: 0.55, sat: 0.48 },
    bloom: { layer: 1, size: [0.11, 0.2], aspect: [0.8, 1.35], span: [14, 32], grow: 3.5, sil: 0.85, fall: 2.6, tex: 0.65, edge: 0.75, fold: 0.25, drift: 0.8, lum: 1.0, sat: 0.6 },
    veil:  { layer: 1, size: [0.17, 0.27], aspect: [2.4, 3.8], span: [20, 45],  grow: 5,  sil: 1.0, fall: 0.95, tex: 0.85, edge: 1.0, fold: 0.85, drift: 1.0, lum: 0.5, sat: 0.55 },
    wisp:  { layer: 1, size: [0.16, 0.27], aspect: [0.7, 1.4], span: [15, 38],  grow: 4,  sil: 1.1, fall: 1.7, tex: 1.0, edge: 1.0, fold: 1.0, drift: 0.9, lum: 0.85, sat: 0.6 },
  };

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
uniform vec4 fA[${MAXF}], fB[${MAXF}], fC[${MAXF}], fD[${MAXF}], fE[${MAXF}];
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
    vec4 A = fA[i], B = fB[i], C = fC[i], D = fD[i], E = fE[i];
    vec2 d = p - A.xy;
    float cr = cos(B.x), sr = sin(B.x);
    d = mat2(cr, sr, -sr, cr) * d / A.zw;
    if (dot(d, d) > 10.) continue;
    float s = B.z, tt = mod(t * .035, 512.) + s;
    // folds: the form's space is bent by slow noise (midrange)
    // the form morphs in place like a cloud; growth speeds the billowing
    float ph = D.w * .22;
    vec2 w = vec2(fbm(d * 1.3 + vec2(tt + ph, s)), fbm(d * 1.3 + vec2(s * 1.7, -tt - ph * .8))) - .47;
    // and its silhouette is pulled into an irregular shape of its own
    vec2 w2 = vec2(fbm(d * .65 + s * 3.), fbm(d * .65 - s * 2.)) - .47;
    vec2 q = d + w * B.y + w2 * E.x;
    float r = length(q);
    // a pressure ripple travelling outward (bass)
    r += D.y * sin(r * 6.5 - D.x) * exp(-r * 1.1);
    float dens = exp(-r * r * E.y);
    // uneven feathering into the dark
    float edge = fbm(q * 2.4 + s * 5. + vec2(-tt * .6, ph * .5));
    dens *= smoothstep(.04, .8, dens * .85 + edge * .6 * E.w - .12 + (1. - E.w) * .25);
    // internal texture, density variation and fine shimmer (highs)
    float tex = fbm(q * 4.2 + vec2(-tt * 1.3 - ph * .6, tt + ph * .4));
    dens *= mix(1., .5 + tex, E.z) + u_high * .3 * E.z * (noise(q * 24. + t * 2.3) - .5);
    dens = max(dens, 0.);
    vec3 c = C.rgb * B.w * dens;
    // a luminous concentration, kept for strong moments
    c += mix(C.rgb, vec3(1.), .22) * C.a * pow(dens, 2.4) * 1.2;
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
uniform float u_time, u_exposure, u_traceMix, u_vig; uniform vec3 u_base;
uniform vec4 u_pts[${MAXP}]; uniform int u_np;
uniform vec4 u_emb[${MAXE}]; uniform vec3 u_embC[${MAXE}]; uniform int u_ne;
out vec4 o;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 L = texture(u_scene, uv).rgb * .8 + texture(u_trace, uv).rgb * u_traceMix;
  // foreground: small concentrated lights, more sharply defined than the
  // clouds, with uneven edges of their own
  for (int i = 0; i < ${MAXE}; i++) {
    if (i >= u_ne) break;
    vec4 Em = u_emb[i];
    vec2 dd = (gl_FragCoord.xy - Em.xy) / Em.z;
    float rr = length(dd);
    if (rr > 4.) continue;
    rr += (fbm(dd * 1.6 + Em.xy * .013) - .47) * 1.1 + (noise(dd * 4. + Em.xy * .02) - .5) * .35;
    float de = exp(-rr * rr * 2.6);
    de *= smoothstep(.02, .5, de + (noise(dd * 6. + u_time * .3) - .5) * .25);
    L += u_embC[i] * Em.w * de;
  }
  vec3 col = u_base + (1. - exp(-L * u_exposure));
  // during a build the edges draw in toward darkness
  float vd = length((uv - .5) * vec2(1.25, 1.)) * 1.5;
  col = mix(col, u_base * .7, u_vig * smoothstep(.3, 1.1, vd));
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
      this.embers = [];
      this.domCool = rnd(40, 70);
      for (const tr of this.traces) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tr.fb);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      // distant layer: broad, barely visible colour fields past the edges
      for (let i = 0; i < 2; i++) this._spawn('field');
      this._spawn('bloom');
    }

    // ---------- Forms ----------
    // Two areas of focus shape where things gather: one stays near the
    // middle, the other roams wider, and their pull shifts slowly, so
    // density and darkness move around the screen over time.
    _focusPoint() {
      const t = this.t, fs = this.focus.seed;
      const main = { x: MB.noise3(t * 0.01, fs, 0) * 0.45 * this.asp * 0.5, y: MB.noise3(fs, t * 0.01, 3) * 0.25 };
      const roam = { x: MB.noise3(t * 0.007, fs, 11) * 1.1 * this.asp * 0.5, y: MB.noise3(fs, t * 0.007, 13) * 0.7 };
      const w = 0.65 + 0.35 * MB.noise3(t * 0.004, fs, 21); // 0.3 .. 1
      return Math.random() < w ? main : roam;
    }

    _pickKind(f) {
      const vol = this.vol, lush = f.lush || 0, up = this.up || 0;
      const quiet = clamp(1 - vol * 1.5);
      const w = {
        wash: 0.25 + 0.45 * quiet,
        bloom: 0.2 + 0.5 * up,
        veil: 0.15 + 0.35 * lush,
        wisp: 0.15 + 0.45 * lush * (1 - quiet),
      };
      // avoid repeating the same kind of shape across the screen
      for (const g of this.forms) if (w[g.kind] !== undefined && g.age < g.span) w[g.kind] *= 0.55;
      let sum = 0;
      for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) { r -= w[k]; if (r <= 0) return k; }
      return 'bloom';
    }

    _spawn(kind, opts = {}) {
      const K = KINDS[kind];
      const A = this.asp;
      const up = this.up || 0;
      let best = opts.at || null;
      if (!best) {
        let bestScore = -1e9;
        for (let k = 0; k < 10; k++) {
          const fp = kind === 'field' ? { x: 0, y: 0 } : this._focusPoint();
          const spread = kind === 'field' ? 0.6 : kind === 'wash' ? 0.3 : 0.2;
          const x = clamp(fp.x + MB.gauss() * spread * A, -0.62 * A, 0.62 * A);
          const y = clamp(fp.y + MB.gauss() * spread, -0.58, 0.58);
          let room = 1;
          for (const g of this.forms) if (KINDS[g.kind].layer === K.layer) room = Math.min(room, Math.hypot(g.x - x, g.y - y) / (g.size + 0.1));
          const score = (kind === 'field' ? 0 : Math.min(room, 2)) + rnd(0, 0.3);
          if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
      }
      const size = (opts.size || rnd(K.size[0], K.size[1])) * (kind === 'bloom' ? 1 + up * 0.4 : 1);
      const g = {
        kind, x: best.x, y: best.y, size,
        aspect: rnd(K.aspect[0], K.aspect[1]), rot: rnd(0, Math.PI),
        seed: rnd(0, 9), pal: opts.pal ?? Math.floor(rnd(0, 6)),
        age: 0, span: opts.span || rnd(K.span[0], K.span[1]) * (K.layer === 1 ? 1 - up * 0.3 : 1),
        growTau: (opts.grow || K.grow) * rnd(0.8, 1.2) * (K.layer === 1 ? 1 - up * 0.4 : 1),
        // each form gets its own variation on its kind's character
        sil: K.sil * rnd(0.75, 1.25), fall: K.fall * rnd(0.8, 1.2), tex: K.tex * rnd(0.8, 1.1), edge: K.edge,
        presence: 0, grow: 0, billow: 0, billowKick: 0,
        col: opts.col ? opts.col.slice() : null, swell: 0, rip: 0, ripAmp: 0, glow: 0,
        dom: !!opts.dom, split: false, lumMul: opts.lumMul || 1,
      };
      this.forms.push(g);
      return g;
    }

    // The colour of a chord: warm and lighter for major, colder and darker
    // for minor, turned around the colour wheel by its root.
    _chordColour(f, pal, satMul) {
      const fifths = ((f.chordRoot || 0) * 7) % 12;
      const mood = { ...f, mode: f.chordQual ? 0.9 : 0.1, hueShift: Math.sin((fifths / 12) * Math.PI * 2) * 22 };
      const c = MB.moodHSL(pal, mood);
      const l = clamp(c.l * 0.75 + 16 + (f.chordQual ? 6 : -8), 26, 70);
      return hslToRgb(c.h, c.s * 0.8 * satMul, l);
    }

    // An arrival after a build: the scene breaks open.
    _release(f) {
      this.release = 1;
      this.tension = 0;
      this.relCool = 16;
      const fp = { x: this.focus.x, y: this.focus.y };
      if (this.forms.length >= MAXF) {
        const old = this.forms.filter((g) => !g.dom && KINDS[g.kind].layer === 1).sort((a, b) => b.age - a.age)[0];
        if (old) old.span = old.age; // make room
        this.forms = this.forms.filter((g) => g.age < g.span);
      }
      this._spawn('bloom', { at: fp, size: rnd(0.45, 0.6), span: rnd(16, 24), grow: 1.6, dom: true, lumMul: 1.15 });
      for (const g of this.forms) g.billowKick += 1.2;
      this.phase = Math.PI; // breathe out from here
      this.domCool = Math.max(this.domCool, 25);
    }

    // A dominant form: one broad, bright gesture for a musical peak. When it
    // begins to fade it breaks up into smaller overlapping forms.
    _dominant(f) {
      const fp = this._focusPoint();
      this._spawn('bloom', {
        at: { x: fp.x * 0.6, y: fp.y * 0.6 }, size: rnd(0.42, 0.6), span: rnd(18, 28), grow: 5,
        dom: true, lumMul: 1.35,
      });
      this.domCool = rnd(30, 55);
    }

    _dissolve(g) {
      g.split = true;
      const n = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n && this.forms.length < MAXF; k++) {
        const kind = ['wisp', 'bloom', 'veil'][k % 3];
        const r = g.size * (0.35 + 0.5 * Math.random());
        const a = rnd(0, Math.PI * 2);
        this._spawn(kind, {
          at: { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r },
          pal: g.pal + k, col: g.col, grow: 3, span: rnd(14, 26),
        });
      }
    }

    _colour(form, f, satMul = 1) {
      const K = KINDS[form.kind];
      const c = MB.moodHSL(form.pal, f);
      c.s *= satMul;
      // restrained: muted, with lightness kept in a soft middle range; the
      // distant layer is greyer and dimmer, like colour seen through haze
      const l = clamp(c.l * 0.75 + 16, 30, 66) - (K.layer === 0 ? 6 : 0);
      return hslToRgb(c.h, c.s * K.sat, l);
    }

    update(f, dt) {
      const lush = f.lush || 0;
      const t = (this.t += dt);
      // volume with a quick, gentle attack and a slower release
      const lvl = f.silent ? 0 : (f.level ?? f.energy);
      this.vol += (lvl - this.vol) * ease(dt, lvl > this.vol ? 0.12 : 1.4);
      const vol = this.vol;
      const bass = f.bass || 0, mid = f.mid ?? 0.3, high = f.high || 0;
      this.eLong += (f.energy - this.eLong) * ease(dt, 20);
      const peak = clamp((f.energy - this.eLong - 0.08) * 3);
      // quiet passages soften and open up
      this.quiet = (this.quiet ?? 0.5) + (clamp(1 - vol * 1.5) - (this.quiet ?? 0.5)) * ease(dt, 2.5);
      // tempo, smoothed again here so the pace of gestures never lurches
      this.bpm = (this.bpm ?? f.bpm ?? 90) + ((f.bpm || 90) - (this.bpm ?? 90)) * ease(dt, 6);

      // BUILD AND RELEASE. Tension follows how steadily loudness and
      // fullness have been climbing over the last few seconds. It releases on
      // a sudden arrival, or when a build tops out at a loud, full level.
      const e = f.energy || 0;
      this.heardT = (this.heardT || 0) + (f.silent ? 0 : dt);
      this.eFast = (this.eFast ?? e) + (e - (this.eFast ?? e)) * ease(dt, 0.3);
      this.eMid = (this.eMid ?? e) + (e - (this.eMid ?? e)) * ease(dt, 2);
      this.lMid = (this.lMid ?? lush) + (lush - (this.lMid ?? lush)) * ease(dt, 2);
      this.hist = this.hist || [];
      this.histT = (this.histT || 0) + dt;
      if (this.histT >= 0.5) { this.histT = 0; this.hist.push([this.eMid, this.lMid]); if (this.hist.length > 9) this.hist.shift(); }
      const h0 = this.hist[0] || [this.eMid, this.lMid];
      const span = Math.max(1, (this.hist.length - 1) * 0.5);
      const slope = (this.eMid - h0[0]) / span + 0.7 * (this.lMid - h0[1]) / span; // per second
      const rising = this.heardT < 8 ? 0 : clamp(slope * 9);
      this.rising = rising;
      this.relCool = (this.relCool ?? 8) - dt;
      const t0 = this.tension ?? 0;
      this.tension = this.relCool > 6 ? 0 : t0 + (rising - t0) * ease(dt, rising > t0 ? 2 : 3.5);
      this.tensionPeak = Math.max(this.tension, (this.tensionPeak ?? 0) * Math.exp(-dt / 3));
      const arrival = this.eFast - this.eMid > 0.25 && this.eFast > 0.55 && this.heardT > 8;
      const toppedOut = this.tensionPeak > 0.4 && rising < this.tensionPeak * 0.6 && e > 0.45;
      if (this.relCool <= 0 && !f.silent && (arrival || toppedOut)) { this._release(f); this.tensionPeak = 0; }
      this.release = (this.release ?? 0) * Math.exp(-dt / 6);
      const tension = this.tension, release = this.release;
      // how vivid colour is: deeper at emotional high points, toward grey in quiet
      this.satMul = clamp(0.9 + 0.5 * release + 0.25 * peak - 0.25 * this.quiet - 0.15 * tension, 0.45, 1.5);

      // BREATHING: one slow inhale and exhale per phrase (16 beats)
      this.phase = (this.phase ?? 0) + (dt * Math.PI * 2) / (16 * (60 / clamp(this.bpm, 50, 190)));
      this.breath = 0.5 - 0.5 * Math.cos(this.phase);

      // CHORDS: each change sends a wave of its colour out through the forms
      if (f.chordId && f.chordId !== this.chordId) {
        this.chordId = f.chordId;
        const fp = this._focusPoint();
        this.wave = { id: f.chordId, x: fp.x, y: fp.y, t: 0, f: { ...f } };
      }
      if (this.wave) this.wave.t += dt;

      // the main area of focus (for glow and the gentle pull to the middle)
      const fs = this.focus.seed;
      this.focus.x = MB.noise3(t * 0.01, fs, 0) * 0.45 * this.asp * 0.5;
      this.focus.y = MB.noise3(fs, t * 0.01, 3) * 0.25;

      // how upbeat the music is right now: full, loud and quick
      const tempoUp = clamp((this.bpm - 80) / 70);
      const upRaw = clamp(0.45 * lush + 0.35 * (f.energy || 0) + 0.2 * tempoUp);
      this.up = (this.up ?? 0) + (upRaw - (this.up ?? 0)) * ease(dt, upRaw > (this.up ?? 0) ? 1.5 : 5);
      const up = this.up;

      // DENSITY: how many midground forms there are
      const mids = this.forms.filter((x) => KINDS[x.kind].layer === 1 && x.age < x.span);
      const want = Math.min(7, Math.round(1 + lush * 2.5 + vol * 0.8 + up * 2.2));
      this.spawnCool -= dt;
      if (mids.length < want && this.spawnCool <= 0 && !f.silent && this.forms.length < MAXF) {
        this._spawn(this._pickKind(f));
        this.spawnCool = rnd(1.5, 4) * (1 - up * 0.55);
      }
      if (mids.length > want + 1) {
        const oldest = mids.filter((x) => !x.dom).reduce((a, b) => (a.age / a.span > b.age / b.span ? a : b), mids[0]);
        oldest.span = Math.min(oldest.span, oldest.age + 8);
      }
      // distant layer: two or three slow fields
      const fields = this.forms.filter((x) => x.kind === 'field' && x.age < x.span);
      if (fields.length < 2 + (lush > 0.55 ? 1 : 0) && this.forms.length < MAXF) this._spawn('field');

      // PEAKS: now and then a single broad form takes over
      this.domCool -= dt;
      const hasDom = this.forms.some((x) => x.dom && x.age < x.span);
      if (!hasDom && this.domCool <= 0 && !f.silent && (peak > 0.45 || (this.domCool < -60 && vol > 0.4))) this._dominant(f);

      // TEMPO: on a slow beat clock, one form at a time billows a little
      const beat = 60 / clamp(this.bpm, 50, 190);
      this.clock -= dt;
      if (this.clock <= 0 && this.forms.length) {
        this.clock = beat * (up < 0.3 ? 4 : up < 0.6 ? 2 : 1) * rnd(0.9, 1.1);
        const g = this.forms[Math.floor(Math.random() * this.forms.length)];
        g.billowKick += 0.25 + 0.5 * vol;
      }
      // upbeat: a strong bass hit drops new ink near the middle
      if (f.bassHit > 0.6 && up > 0.5 && mids.length < want + 2 && this.forms.length < MAXF && this.spawnCool < 1) {
        this._spawn('bloom');
        this.spawnCool = 1.2;
      }
      // BASS: a hit sends a soft pressure wave through one larger form
      if (f.bassHit) {
        const big = this.forms.filter((x) => x.size > 0.25 && x.presence > 0.3);
        if (big.length) {
          const g = big[this.rippleNext++ % big.length];
          g.rip = 0;
          g.ripAmp = 0.025 + 0.06 * f.bassHit;
        }
      }

      const dominant = this.forms.find((x) => x.dom && x.age < x.span);
      for (const g of this.forms) {
        const K = KINDS[g.kind];
        g.age += dt;
        const fadeIn = clamp(g.age / (K.layer === 0 ? 12 : 4 + g.growTau));
        const fadeOut = clamp((g.span - g.age) / (K.layer === 0 ? 16 : 8));
        g.presence = Math.min(fadeIn, fadeOut);
        if (g.dom && !g.split && g.span - g.age < 9) this._dissolve(g);

        // growth: opens out, then keeps spreading slowly as it thins
        g.grow = (1 - Math.exp(-g.age / g.growTau)) * (1 + g.age * 0.005);
        // MID: internal movement; each layer has its own pace
        const pace = K.layer === 0 ? 0.35 : 1;
        g.billowKick *= Math.exp(-dt / 1.2);
        g.billow += dt * pace * (0.1 + 0.4 * mid + 0.4 * tension + 1.4 * Math.exp(-g.age / g.growTau) + g.billowKick);

        // drift on one shared current; distant fields barely move
        const cx = MB.noise3(g.x * 0.6, g.y * 0.6, t * 0.015) * 0.022;
        const cy = MB.noise3(g.x * 0.6 + 7.1, g.y * 0.6, t * 0.015) * 0.016;
        const pull = K.layer === 0 ? 0 : 0.018 * (1 + 3 * tension);
        const sp = K.drift * (0.5 + mid * 0.8);
        g.x += (cx * sp - (g.x - this.focus.x) * pull) * dt;
        g.y += (cy * sp - (g.y - this.focus.y) * pull) * dt;
        // veils lie along the current
        if (g.kind === 'veil') g.rot += angleTo(Math.atan2(cy, cx) - g.rot) * ease(dt, 6);
        else g.rot += MB.noise3(g.seed, t * 0.02, 9) * 0.02 * dt;

        // BASS: larger forms expand and are gently displaced, with a long release
        const big = clamp((g.size - 0.12) / 0.4);
        const bt = bass * (0.15 + 0.6 * big);
        g.swell += (bt - g.swell) * ease(dt, bt > g.swell ? 0.2 : 2.2);
        g.rip += dt * 4;
        g.ripAmp *= Math.exp(-dt / 1.2);

        // brightness: kept for peaks, and for the dominant form
        const near = Math.exp(-Math.hypot(g.x - this.focus.x, g.y - this.focus.y) * 2);
        let glowT = K.layer === 1 ? Math.max(peak, up * 0.3) * near : 0;
        if (g.dom) glowT = Math.max(glowT, 0.55 + 0.45 * peak);
        g.glow += (glowT - g.glow) * ease(dt, glowT > g.glow ? 0.3 : 3);
        // while one form dominates, the others step back
        const back = dominant && dominant !== g && K.layer === 1 ? 1 - 0.4 * dominant.presence : 1;
        g.dim = (g.dim ?? 1) + (back - (g.dim ?? 1)) * ease(dt, 2);

        // colour: the palette, muted, mingling with nearby forms
        let target = this._colour(g, f, this.satMul);
        // the chord wave reaches this form: take on the chord's colour
        const wv = this.wave;
        if (wv && g.waveId !== wv.id && Math.hypot(g.x - wv.x, g.y - wv.y) - g.size * 0.6 < wv.t * 0.35) {
          g.waveId = wv.id;
          g.chordCol = this._chordColour(wv.f, g.pal, this.satMul);
          g.chordAmt = 1;
        }
        g.chordAmt = (g.chordAmt || 0) * Math.exp(-dt / 8);
        if (g.chordCol) target = target.map((v, i) => v + (g.chordCol[i] - v) * 0.7 * g.chordAmt);
        let wsum = 0;
        const mixc = [0, 0, 0];
        for (const o of this.forms) {
          if (o === g || !o.col) continue;
          const w = Math.exp(-Math.hypot(o.x - g.x, o.y - g.y) * 3) * o.presence;
          wsum += w;
          for (let i = 0; i < 3; i++) mixc[i] += o.col[i] * w;
        }
        if (wsum > 0) target = target.map((v, i) => v * 0.75 + (mixc[i] / wsum) * 0.25);
        if (!g.col) g.col = target;
        else g.col = g.col.map((v, i) => v + (target[i] - v) * ease(dt, g.chordAmt > 0.6 ? 1.2 : 5));
      }
      this.forms = this.forms.filter((g) => g.age < g.span);

      // HIGHS: fleeting fine points inside the brighter midground forms
      const hosts = this.forms.filter((g) => KINDS[g.kind].layer === 1 && g.presence > 0.4);
      const rate = high * high * 5 + (f.spark ? 0.6 : 0);
      let n = rate > 0 ? Math.floor(rate * dt + Math.random()) : 0;
      while (n-- > 0 && hosts.length && this.points.length < MAXP) {
        const g = hosts[Math.floor(Math.random() * hosts.length)];
        const r = g.size * (1 + g.swell * 0.4);
        this.points.push({
          g, ox: MB.gauss() * r * 0.45, oy: MB.gauss() * r * 0.45,
          age: 0, life: rnd(0.6, 2.5), size: rnd(1.2, 2.2), bright: rnd(0.5, 0.95),
        });
      }
      for (const p of this.points) p.age += dt;
      this.points = this.points.filter((p) => p.age < p.life);

      // FOREGROUND: a few small concentrated lights, brought by bright highs
      // and peaks; they drift a little faster than everything behind them
      const er = high * high * 0.35 + peak * 0.5 + (f.spark ? 0.15 : 0);
      if (hosts.length && this.embers.length < MAXE && Math.random() < er * dt) {
        const g = hosts[Math.floor(Math.random() * hosts.length)];
        const c = g.col || [0.6, 0.6, 0.6];
        this.embers.push({
          x: g.x + MB.gauss() * g.size * 0.5, y: g.y + MB.gauss() * g.size * 0.5,
          r: rnd(0.008, 0.02) * (0.8 + 0.5 * vol), age: 0, life: rnd(3, 9),
          col: c.map((v) => Math.min(1, v * 1.15 + 0.05)), bright: rnd(0.45, 0.8),
        });
      }
      for (const e of this.embers) {
        e.age += dt;
        e.x += MB.noise3(e.x * 0.6, e.y * 0.6, t * 0.015) * 0.035 * dt;
        e.y += MB.noise3(e.x * 0.6 + 7.1, e.y * 0.6, t * 0.015) * 0.026 * dt;
      }
      this.embers = this.embers.filter((e) => e.age < e.life);

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
      const C = new Float32Array(MAXF * 4), D = new Float32Array(MAXF * 4), E = new Float32Array(MAXF * 4);
      // distant layer first, then the midground
      const list = this.forms.slice().sort((a, b) => KINDS[a.kind].layer - KINDS[b.kind].layer).slice(0, MAXF);
      // the more forms there are, the less each adds, so overlaps stay luminous
      // rather than burning to white
      const nb = list.filter((g) => KINDS[g.kind].layer === 1).reduce((a, g) => a + g.presence, 0);
      const share = 1 / Math.sqrt(Math.max(1, nb * 0.7));
      const up = this.up || 0, quiet = this.quiet ?? 0.5;
      const tension = this.tension || 0, release = this.release || 0;
      // breathing, a little deeper when the music is fuller
      const depth = 0.35 + 0.65 * clamp(vol * 1.3);
      const br = ((this.breath ?? 0.5) - 0.5) * 2 * depth;          // -1 .. 1
      const brFar = (0.5 - 0.5 * Math.cos((this.phase || 0) - 0.9) - 0.5) * 2 * depth; // fields lag behind
      list.forEach((g, i) => {
        const K = KINDS[g.kind];
        const far = K.layer === 0;
        // VOLUME: fullness, scale and luminosity; BASS: expansion
        const b = far ? brFar : br;
        const scale = g.size * (0.15 + 0.85 * Math.min(g.grow, 1.4)) * (0.78 + 0.45 * vol) * (1 + 0.28 * g.swell)
          * (1 - 0.18 * tension + 0.15 * release) * (1 + 0.06 * b);
        const stretch = g.aspect * (1 + mid * 0.3 * Math.sin(g.seed + this.t * 0.07));
        // BASS: larger forms are gently pushed away from the centre of focus
        const dx = g.x - this.focus.x, dy = g.y - this.focus.y, dl = Math.hypot(dx, dy) + 0.05;
        const push = g.swell * g.size * 0.18;
        A.set([g.x + (dx / dl) * push, g.y + (dy / dl) * push, scale * Math.sqrt(stretch), scale / Math.sqrt(stretch)], i * 4);
        // MID: folding; quiet passages fold less
        const warp = (K.fold + mid * 0.6 * (far ? 0.4 : 1) + lush * 0.2) * (1 - 0.35 * quiet);
        // a fresh drop is densest; it thins as it spreads
        const fresh = 0.75 + 0.5 * Math.exp(-g.age / (g.growTau * 3));
        const lum = far
          ? 0.025 + 0.04 * vol + 0.03 * lush
          : K.lum * g.lumMul * (0.07 + 0.42 * vol + 0.2 * up) * fresh * share * (g.dim ?? 1);
        B.set([g.rot, warp, g.seed, lum * g.presence * (1 + 0.14 * b) * (1 + 0.18 * release)], i * 4);
        const c = g.col || [0.5, 0.5, 0.5];
        C.set([c[0], c[1], c[2], g.glow * g.presence], i * 4);
        D.set([g.rip, g.ripAmp, 1, g.billow], i * 4);
        // quiet passages soften: lower falloff and gentler texture
        E.set([g.sil, g.fall * (1 - 0.3 * quiet) * (1 + 0.4 * tension), g.tex * (1 - 0.35 * quiet), g.edge], i * 4);
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
      gl.uniform1f(P.u.u_haze, (0.07 + 0.2 * lush + 0.08 * vol) * (1 + 0.08 * br) * (1 - 0.3 * (this.tension || 0)) + 0.05 * (this.release || 0));
      gl.uniform3fv(P.u.u_tint, this.tint.map((v) => v * 0.22));
      gl.uniform1i(P.u.u_n, list.length);
      gl.uniform4fv(P.u.fA, A);
      gl.uniform4fv(P.u.fB, B);
      gl.uniform4fv(P.u.fC, C);
      gl.uniform4fv(P.u.fD, D);
      gl.uniform4fv(P.u.fE, E);
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
      gl.uniform1f(P.u.u_exposure, 1.3 + 0.15 * (this.up || 0) + 0.15 * (this.release || 0));
      gl.uniform1f(P.u.u_vig, clamp(0.12 + 0.6 * (this.tension || 0) - 0.12 * (this.release || 0), 0, 0.8));
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
      const em = new Float32Array(MAXE * 4), emc = new Float32Array(MAXE * 3);
      let ne = 0;
      for (const e of this.embers) {
        const life = Math.min(1, e.age / 0.8) * Math.min(1, (e.life - e.age) / 2.5);
        em.set([(e.x / this.asp + 0.5) * this.c.width, (e.y + 0.5) * this.c.height, e.r * this.c.height, e.bright * life * 0.9], ne * 4);
        emc.set(e.col, ne * 3);
        ne++;
      }
      gl.uniform4fv(P.u.u_emb, em);
      gl.uniform3fv(P.u.u_embC, emc);
      gl.uniform1i(P.u.u_ne, ne);
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

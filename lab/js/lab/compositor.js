// BLOOM LAB · RENDERING AND COMPOSITING
// One full-screen pass. For every pixel and every formation, it finds the
// nearest point on the formation's spine: how far along the body (s) and
// how far across it relative to the local width (u, -1..1). The optical
// material turns (s, u) into light: a soft, asymmetric interior; a defined
// rim only where the body's edge is lit; edge softness that varies along
// its length; tapering ends. The space itself is gently bent by a slow
// noise field first, so shapes fold organically. Formations are layered
// back to front like coloured gels: each adds its light and slightly dims
// what lies behind it. No particles, trails or lines.
(function () {
  const MB = (window.MB = window.MB || {});
  const { NS } = MB.LabGeometry;
  const NF = 3, NP = NS + 1;

  const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

  const FS = `#version 300 es
precision highp float;
#define NF ${NF}
#define NS ${NS}
#define NP ${NP}
uniform vec2 u_res; uniform float u_asp, u_time;
uniform vec4 u_pts[NF * NP];          // per sample: x, y, half width, lit edge (-1..1)
uniform vec3 u_colA[NF], u_colB[NF];  // colour along each body
uniform float u_live[NF];             // each formation's light
uniform float u_maxW[NF];             // each formation's widest half width (to skip empty space)
uniform int u_order[NF];              // back to front
uniform float u_density, u_asym, u_rim, u_soft, u_softVar, u_warp, u_warpScale;
uniform float u_absorb, u_exposure, u_compress, u_sat, u_grain;
uniform vec3 u_ground;
out vec4 o;

float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float grainHash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
// a slow, low-frequency vector field that bends the space (-.5 .. .5)
vec2 warpField(vec2 p){
  vec2 q = p * u_warpScale;
  float a = vnoise(q + vec2(u_time * .02, 1.3)) + .5 * vnoise(q * 2.1 + vec2(7., -u_time * .015));
  float b = vnoise(q + vec2(4.1, -u_time * .018)) + .5 * vnoise(q * 2.1 + vec2(-3., u_time * .02));
  return vec2(a, b) / 1.5 - .5;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2((uv.x - .5) * u_asp, uv.y - .5);
  vec2 pw = p + warpField(p) * 2. * u_warp;
  vec3 C = vec3(0.);
  for (int k = 0; k < NF; k++) {
    int f = u_order[k], base = f * NP;
    // GEOMETRY: where this pixel sits relative to the formation's spine.
    // First the nearest distance; then a smooth blend of the nearby stretches
    // of spine (weighted by how close each is), so position along (s),
    // signed distance across, width and lit edge all change continuously,
    // with no seams where the nearest stretch jumps at a bend.
    float dmin = 1e9;
    for (int i = 0; i < NS; i++) {
      vec4 a = u_pts[base + i], b = u_pts[base + i + 1];
      vec2 ab = b.xy - a.xy;
      float t = clamp(dot(pw - a.xy, ab) / max(dot(ab, ab), 1e-8), 0., 1.);
      dmin = min(dmin, length(pw - (a.xy + ab * t)));
    }
    // far from this formation: nothing to draw (most of the screen)
    if (dmin > u_maxW[f] * (1. + 2. * u_soft) + .01) continue;
    float sw = 0., s = 0., sd = 0., w = 0., e = 0.;
    for (int i = 0; i < NS; i++) {
      vec4 a = u_pts[base + i], b = u_pts[base + i + 1];
      vec2 ab = b.xy - a.xy;
      float t = clamp(dot(pw - a.xy, ab) / max(dot(ab, ab), 1e-8), 0., 1.);
      vec2 dq = pw - (a.xy + ab * t);
      float d = length(dq);
      float wi = mix(a.z, b.z, t);
      float k = exp(-(d - dmin) / (.08 * wi + .003));
      if (k < .002) continue;
      vec2 n = normalize(vec2(-ab.y, ab.x) + 1e-9);
      sw += k;
      s += k * (float(i) + t) / float(NS);
      sd += k * (dot(dq, n) >= 0. ? d : -d);
      w += k * wi;
      e += k * mix(a.w, b.w, t);
    }
    s /= sw; sd /= sw; w /= sw; e /= sw;
    float u = sd / w;                              // -1..1 across the body
    // MATERIAL
    // edge softness varies along the body: crisp in places, dissolving in others
    float sv = .5 + .5 * sin(s * 7.3 + float(f) * 2.1 + u_time * .07 + 1.7 * sin(s * 3.1 - u_time * .05));
    float soft = u_soft * mix(1., .25 + 1.5 * sv, u_softVar);
    float body = 1. - smoothstep(1. - soft, 1. + soft, abs(u));
    // the lit side (and how strongly) changes gradually along the body
    // (continuous through e = 0: there the body is evenly lit, so the lit
    // side can cross over without a seam)
    float ls = e >= 0. ? 1. : -1., la = smoothstep(0., .45, abs(e));
    float across = clamp(.5 + .5 * u * ls, 0., 1.);      // 0 far side .. 1 lit side
    float inner = mix(1., .04 + 1.5 * pow(across, 2.2), u_asym * la);
    inner *= .55 + .45 * (1. - abs(u)) + .25 * across;   // a little thickness toward the core
    // a defined rim only on the lit side, strongest where the edge is crisp
    float rd = (u * ls - (1. - soft * .6)) / max(soft * .5, .035);
    float rim = exp(-rd * rd) * la * (1. - sv * .6);
    float ends = smoothstep(0., .14, s) * smoothstep(1., .86, s);
    float dens = (body * inner * u_density + rim * u_rim * .6) * ends * u_live[f];
    vec3 col = mix(u_colA[f], u_colB[f], clamp(s * .8 + .2 * across, 0., 1.));
    // COMPOSITING: like a coloured gel, adds its light and dims what's behind
    float alpha = 1. - exp(-dens * 1.5);
    C = C * (1. - alpha * u_absorb) + col * dens;
  }
  // TONE: highlight compression (keeps colour), exposure, saturation, ground
  float lm = dot(C, vec3(.3, .59, .11)), kn = .5;
  if (u_compress > 0. && lm > kn) C *= (kn + (lm - kn) / (1. + (lm - kn) * u_compress * 2.)) / lm;
  vec3 tm = 1. - exp(-C * u_exposure);
  float Y = dot(tm, vec3(.3, .59, .11));
  tm = clamp(mix(vec3(Y), tm, u_sat), 0., 1.);
  vec3 col = u_ground + tm;
  col += (grainHash(gl_FragCoord.xy + fract(u_time * 7.31) * vec2(311., 173.)) - .5) * .03 * u_grain;
  o = vec4(col, 1.);
}`;

  class LabCompositor {
    constructor(canvas) {
      const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true }));
      if (!gl) throw new Error('WebGL2 is not available');
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = (this.p = gl.createProgram());
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      this.u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        this.u[name] = gl.getUniformLocation(p, name);
      }
      this.vao = gl.createVertexArray();
      this.pts = new Float32Array(NF * NP * 4);
    }

    // forms: [{ ctrl, depth, colA, colB, live }], M: material settings
    render(forms, M, time, ground) {
      const gl = this.gl, u = this.u, c = gl.canvas;
      forms.forEach((F, f) => MB.LabGeometry.sampleSpine(F.ctrl, this.pts, f * NP));
      const order = forms.map((F, i) => [F.depth, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
      gl.viewport(0, 0, c.width, c.height);
      gl.useProgram(this.p);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(u.u_res, c.width, c.height);
      gl.uniform1f(u.u_asp, c.width / c.height);
      gl.uniform1f(u.u_time, time);
      gl.uniform4fv(u.u_pts, this.pts);
      gl.uniform3fv(u.u_colA, forms.flatMap((F) => F.colA));
      gl.uniform3fv(u.u_colB, forms.flatMap((F) => F.colB));
      gl.uniform1fv(u.u_live, forms.map((F) => F.live));
      gl.uniform1fv(u.u_maxW, forms.map((F, f) => { let m = 0; for (let j = 0; j < NP; j++) m = Math.max(m, this.pts[(f * NP + j) * 4 + 2]); return m; }));
      gl.uniform1iv(u.u_order, order);
      for (const k of ['density', 'asym', 'rim', 'soft', 'softVar', 'warp', 'warpScale', 'absorb', 'exposure', 'compress', 'grain']) gl.uniform1f(u['u_' + k], M[k]);
      gl.uniform1f(u.u_sat, M.saturation);
      gl.uniform3fv(u.u_ground, ground);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  MB.LabCompositor = LabCompositor;
})();

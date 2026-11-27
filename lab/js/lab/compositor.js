// BLOOM LAB · RENDERING AND COMPOSITING
// Each formation is drawn as a mesh (K x M vertices) built in the vertex
// shader from its samples (geometry.js). For every vertex the shader also
// works out how much of the sheet is squeezed into each bit of screen (the
// surface's projected density): face-on, light spreads thin (a soft veil);
// edge-on or folded, it concentrates (a defined edge of light); where the
// sheet folds over itself, both layers add. Sheets are drawn additively
// into a float light buffer, then tone-mapped onto the ground. No
// particles or trails: one pass of surfaces per frame.
(function () {
  const MB = (window.MB = window.MB || {});
  const { K, M, MAXF } = MB.LabGeometry;

  const SHEET_VS = `#version 300 es
precision highp float;
uniform sampler2D u_geo; uniform int u_f; uniform float u_asp, u_conc;
out vec2 v_sv; out float v_I; out vec2 v_attr; out float v_z;
const int K = ${K}, M = ${M};
vec4 T(int k, int c){ return texelFetch(u_geo, ivec2(k * 2 + c, u_f), 0); }
// position on the sheet: spine + width * (twisted, curled cross-section);
// z is depth (toward / away from the viewer)
vec3 P3(int k, float v){
  vec4 a = T(k, 0), b = T(k, 1);
  vec2 n = vec2(cos(a.z), sin(a.z));
  float c = cos(b.x), sn = sin(b.x), q = b.y * (v * v - .333);
  return vec3(a.xy + n * a.w * (v * c - q * sn), a.w * (v * sn + q * c));
}
void main(){
  int quad = gl_VertexID / 6, corner = gl_VertexID % 6;
  int qi = quad % (K - 1), qj = quad / (K - 1);
  int dx = (corner == 1 || corner == 4 || corner == 5) ? 1 : 0;
  int dy = (corner == 2 || corner == 3 || corner == 5) ? 1 : 0;
  int k = qi + dx;
  float v = -1. + 2. * float(qj + dy) / float(M - 1);
  vec3 p = P3(k, v);
  // projected density: how the sheet's area maps onto the screen here
  vec4 a = T(k, 0), b = T(k, 1);
  vec2 Ps = (P3(min(k + 1, K - 1), v) - P3(max(k - 1, 0), v)).xy;
  vec2 n = vec2(cos(a.z), sin(a.z));
  vec2 Pv = n * a.w * (cos(b.x) - 2. * b.y * v * sin(b.x));
  float J = abs(Ps.x * Pv.y - Ps.y * Pv.x);
  float J0 = length(Ps) * a.w;                    // the same stretch seen face-on
  v_I = J0 / sqrt(J * J + J0 * J0 / (u_conc * u_conc));
  v_sv = vec2(float(k) / float(K - 1), v);
  v_attr = b.zw;                                  // edge softness, light along the body
  v_z = p.z / max(a.w, 1e-4);
  gl_Position = vec4(p.x / (u_asp * .5), p.y / .5, 0., 1.);
}`;

  const SHEET_FS = `#version 300 es
precision highp float;
in vec2 v_sv; in float v_I; in vec2 v_attr; in float v_z;
uniform vec3 u_colA, u_colB; uniform float u_bright, u_soft, u_backDim;
out vec4 o;
void main(){
  float soft = clamp(v_attr.x * u_soft, .03, 1.);
  float edge = smoothstep(1., 1. - soft, abs(v_sv.y));          // edge definition varies along the body
  float ends = smoothstep(0., .14, v_sv.x) * smoothstep(1., .86, v_sv.x);
  float back = 1. - u_backDim * smoothstep(-.3, .6, v_z);        // the far side is a little dimmer
  vec3 col = mix(u_colA, u_colB, clamp(v_sv.x * .75 + .25 * (.5 + .5 * v_sv.y), 0., 1.));
  o = vec4(col * v_I * edge * ends * back * v_attr.y * u_bright, 1.);
}`;

  const QUAD_VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

  const OUT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_light; uniform vec2 u_res; uniform float u_time, u_exposure, u_compress, u_sat, u_grain; uniform vec3 u_ground;
out vec4 o;
float grainHash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
void main(){
  vec3 C = texture(u_light, gl_FragCoord.xy / u_res).rgb;
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
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not available');
      this.sheet = this._prog(SHEET_VS, SHEET_FS);
      this.out = this._prog(QUAD_VS, OUT_FS);
      this.vao = gl.createVertexArray();
      // geometry texture: 2 texels per sample, one row per formation
      this.geo = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.geo);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, K * 2, MAXF, 0, gl.RGBA, gl.FLOAT, null);
      this.data = new Float32Array(K * MAXF * 8);
    }

    _prog(vs, fs) {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    }

    _target() {
      const gl = this.gl, c = gl.canvas;
      if (this.light && this.light.w === c.width && this.light.h === c.height) return this.light;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, c.width, c.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return (this.light = { tex, fb, w: c.width, h: c.height });
    }

    // forms: [{ colA, colB, bright }] (their shapes already built into
    // this.data, one row each), Mt: material settings
    render(forms, Mt, time, ground) {
      const gl = this.gl, c = gl.canvas, L = this._target();
      gl.bindTexture(gl.TEXTURE_2D, this.geo);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, K * 2, MAXF, gl.RGBA, gl.FLOAT, this.data);
      // 1. sheets of light, added into the light buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.fb);
      gl.viewport(0, 0, c.width, c.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.vao);
      const S = this.sheet;
      gl.useProgram(S.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.geo);
      gl.uniform1i(S.u.u_geo, 0);
      gl.uniform1f(S.u.u_asp, c.width / c.height);
      gl.uniform1f(S.u.u_conc, Mt.concentrate);
      gl.uniform1f(S.u.u_soft, Mt.edgeSoft);
      gl.uniform1f(S.u.u_backDim, Mt.backDim);
      forms.forEach((F, f) => {
        gl.uniform1i(S.u.u_f, f);
        gl.uniform3fv(S.u.u_colA, F.colA);
        gl.uniform3fv(S.u.u_colB, F.colB);
        gl.uniform1f(S.u.u_bright, F.bright * Mt.flux);
        gl.drawArrays(gl.TRIANGLES, 0, (K - 1) * (M - 1) * 6);
      });
      gl.disable(gl.BLEND);
      // 2. tone map onto the ground
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const O = this.out;
      gl.useProgram(O.p);
      gl.bindTexture(gl.TEXTURE_2D, L.tex);
      gl.uniform1i(O.u.u_light, 0);
      gl.uniform2f(O.u.u_res, c.width, c.height);
      gl.uniform1f(O.u.u_time, time);
      gl.uniform1f(O.u.u_exposure, Mt.exposure);
      gl.uniform1f(O.u.u_compress, Mt.compress);
      gl.uniform1f(O.u.u_sat, Mt.saturation);
      gl.uniform1f(O.u.u_grain, Mt.grain);
      gl.uniform3fv(O.u.u_ground, ground);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  MB.LabCompositor = LabCompositor;
})();

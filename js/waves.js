// Waves: a second style, tried at ?style=waves.
//
// Tens of thousands of particles of light are drawn onto a set of slowly
// changing wave lines (the contour lines of a moving noise field) and stream
// along them, leaving short fading trails. Together they form flowing
// filaments and silky sheets; where many overlap on a crest the light builds
// and warms toward white. It all sits in the same night sky: dark space,
// faint twinkling stars and fine film grain.
//
// MOOD shapes the composition itself, not just its colour. The existing
// analysis (major/minor, loudness, drive, tempo) is read as a blend of four
// moods, an artistic interpretation rather than a measurement:
//   warm     - expansive, loose ribbons, gentle curves, copper and champagne
//   tender   - sparse, very fine filaments, delicate, lots of space, lavender
//              and pearl
//   stormy   - intersecting currents, layered turbulence, unstable direction,
//              deep indigo with occasional luminous accents
//   restless - tighter loops, more curvature, irregular turns, overlapping
//              textures, sharper rhythmic accents
// The blend moves continuously; half of it is the song's own average so far,
// and the key seeds the wave field, so each song settles into a recognisable
// landscape of its own.
//
// On top of the mood, the music moment to moment:
//   volume   -> brightness, speed, and how long the trails are
//   fullness -> how many wave lines there are, and how far they spread
//   mid      -> the shape of the waves: how they curve and fold
//   bass     -> a slow swell rolling through the waves
//   highs    -> a fine dust of particles drifting off the lines
//   harmony  -> colour (the same major/minor palettes); chords shift it
//
// GPU passes each frame:
//   1. simulate  - move every particle (positions live in a float texture)
//   2. trails    - fade the previous frame's light a little, then draw the
//                  particles on top (additive)
//   3. output    - gentle tone mapping, warm crests, stars and film grain
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  const MAXS = 70;

  const QUAD_VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

  const NOISE = `
float hash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
const mat2 ROT = mat2(.8, .6, -.6, .8);
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = ROT * p * 2.07 + vec2(1.7, 9.2); a *= .5; } return s; }
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }`;

  // 1. Move every particle.
  const SIM = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_time, u_dt, u_asp;
uniform float u_freq, u_warp, u_levels, u_pull, u_flow, u_dust, u_spread, u_bassAmp, u_bassPhase;
uniform vec2 u_center, u_seedOff; uniform float u_ang, u_thick, u_cross, u_crossAng, u_turb, u_strands, u_deep, u_deepPh, u_loosen;
uniform vec4 u_rip[4];
out vec4 o;
${NOISE}
// Long wave lines that run across the screen (not closed loops): the field
// rises steadily in one direction, and noise bends the lines into waves.
float field(vec2 p, float ang, vec2 off){
  // LOW FREQUENCIES: deep, slow currents carry the whole field; large-scale
  // displacement that every strand rides on
  p += u_deep * (vec2(fbm(p * .35 + vec2(u_deepPh, 2.1)), fbm(p * .35 + vec2(7.4, -u_deepPh))) - .47) * 2.;
  float ca = cos(ang), sa = sin(ang);
  vec2 r = mat2(ca, sa, -sa, ca) * p;
  vec2 q = r * u_freq + off;
  // the waves bend and fold (midrange, and the mood's curvature)
  float w = fbm(q * .55 + vec2(u_time * .018, 1.7))
          + .5 * fbm(q * 1.1 + vec2(-u_time * .025, 8.3) + fbm(q * .4 + 3.1));
  // a slow swell rolling along them (bass)
  float swell = u_bassAmp * sin(r.x * 2.2 + u_bassPhase);
  return r.y * u_freq * .9 + u_warp * w + swell;
}
float life(float seed){ return 5. + 9. * h1(seed * 3.1); }
void main(){
  vec4 s = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0);
  vec2 p = s.xy; float age = s.z, seed = s.w;
  float e = .003;
  // STORMY: some particles follow a second set of currents that cross the first
  bool crossing = h1(seed * 5.9) < u_cross;
  float ang = crossing ? u_ang + u_crossAng : u_ang;
  vec2 off = u_seedOff + (crossing ? vec2(17.3, -4.1) : vec2(0.));
  float n = field(p, ang, off);
  vec2 g = vec2(field(p + vec2(e, 0.), ang, off) - n, field(p + vec2(0., e), ang, off) - n) / e;
  float g2 = dot(g, g) + 1e-3;
  // pulled onto the nearest wave line (a contour of the field)...
  // each particle sits a little off its line; louder music makes the band
  // of particles around each wave wider, so the waves get thicker
  // Each wave is a bundle of strands: tender music has only a few, with
  // clear gaps between them (fine filaments); other moods have many, which
  // blend into a silky ribbon.
  float lane = (floor(h1(seed * 4.3) * u_strands) + .5) / u_strands - .5;
  float d = fract(n * u_levels + lane * u_thick) - .5;
  vec2 toLine = (-d / u_levels) * g / g2;
  // ...and streaming along it
  // half the particles flow each way along the waves, so the light builds
  // evenly across the screen instead of piling up downstream
  vec2 along = vec2(-g.y, g.x) / sqrt(g2) * (h1(seed * 11.3) < .5 ? -1. : 1.);
  // some particles (more with the highs) drift off the lines as dust
  float dusty = step(1. - u_dust, h1(seed * 7.7));
  // background particles (see the point shader) drift more slowly: parallax
  float layerSpeed = h1(seed * 6.1) < .45 ? .6 : 1.;
  // QUIET / SILENCE: the lines loosen their hold, so strands slowly dissolve
  vec2 v = toLine * u_pull * (1. - .85 * dusty) * (1. - .75 * u_loosen) + along * u_flow * (1. + .5 * dusty) * layerSpeed;
  // PERCUSSION: ripples travel outward through the strands, nudging them
  // across their lines; the lines then draw them back
  vec2 nrm = g / sqrt(g2);
  for (int i = 0; i < 4; i++) {
    vec4 R = u_rip[i];
    if (R.w <= 0.) continue;
    float dd = length(p - R.xy) - R.z * .42;
    v += nrm * R.w * exp(-dd * dd / .004) * sin(dd * 55.) * exp(-R.z * .9);
  }
  // TURBULENCE: layered eddies that push particles off their lines
  if (u_turb > .001) {
    vec2 tq = p * 3.2 + u_seedOff;
    vec2 eddy = vec2(fbm(tq + vec2(u_time * .21, 0.)), fbm(tq + vec2(5.2, -u_time * .19))) - .47;
    v += eddy * u_turb * .55;
  }
  // the waves spread out as the music fills out, and gather when it's sparse
  vec2 c = p - u_center;
  vec2 cn = abs(c / vec2(u_spread * u_asp * .6, u_spread * .6));
  float r = pow(pow(cn.x, 4.) + pow(cn.y, 4.), .25); // a soft rectangle, reaching the corners
  v -= c * max(r - 1., 0.) * .6;
  p += v * u_dt;
  age += u_dt;
  bool out_ = abs(p.x) > u_asp * .62 || abs(p.y) > .62;
  if (age > life(seed) || out_) {
    // reborn somewhere inside the current spread
    // reborn anywhere inside the current spread, evenly
    vec2 j = vec2(h1(seed + u_time * 1.3), h1(seed * 1.7 + u_time)) * 2. - 1.;
    p = u_center + j * vec2(u_spread * u_asp * .6, u_spread * .6) * .95;
    age = 0.;
  }
  o = vec4(p, age, seed);
}`;

  // ===================== EXPERIMENTAL: GUIDED RIBBONS =====================
  // (?style=ribbons) A composition-driven alternative to the noise-contour
  // SIM above. Three persistent cubic Bezier guide curves (one dominant, two
  // subordinates derived from it) are computed on the CPU each frame and
  // passed as uniforms. The particle state texture keeps its RGBA32F layout,
  // reinterpreted as:  R = u (position along the ribbon, 0..1),
  //                    G = age (s), B = life (s), A = seed.
  // Ribbon identity and transverse offset are pure functions of the seed,
  // so they never change. Screen positions are not stored: the point shader
  // evaluates curve(u) + normal * offset every frame, so particles stay on
  // their curve and follow it continuously as it deforms.
  const GUIDE_COMMON = `
uniform vec2 u_P[12];     // 3 curves x 4 control points (dominant first)
uniform float u_W[3];     // ribbon half-widths
uniform float u_gtime, u_twist;
uniform vec4 u_grip[4];   // rhythm waves: (ribbon, u start, age s, amplitude)
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
int ribbonOf(float seed){ float h = h1(seed * 2.13); return h < .6 ? 0 : (h < .8 ? 1 : 2); }
vec2 bez(int k, float u){
  vec2 a = u_P[k * 4], b = u_P[k * 4 + 1], c = u_P[k * 4 + 2], d = u_P[k * 4 + 3];
  float m = 1. - u;
  return m * m * m * a + 3. * m * m * u * b + 3. * m * u * u * c + u * u * u * d;
}
vec2 bezD(int k, float u){
  vec2 a = u_P[k * 4], b = u_P[k * 4 + 1], c = u_P[k * 4 + 2], d = u_P[k * 4 + 3];
  float m = 1. - u;
  return 3. * m * m * (b - a) + 6. * m * u * (c - b) + 3. * u * u * (d - c);
}`;

  // Advance each particle along its own ribbon; respawn on the same ribbon.
  const SIM_GUIDE = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_dt, u_flow, u_time;
out vec4 o;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
  vec4 s = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0);
  float u = s.x, age = s.y, life = s.z, seed = s.w;
  // per-particle speed variation; background layer drifts slower (parallax)
  float sp = u_flow * (.8 + .4 * h1(seed * 3.7)) * (h1(seed * 6.1) < .45 ? .6 : 1.);
  u += sp * u_dt;
  age += u_dt;
  if (age > life || u > 1.03) {
    // reborn somewhere along the SAME ribbon, same lane; fades in from age 0
    u = h1(seed * 1.3 + u_time * .731) * .98;
    age = 0.;
    life = 6. + 8. * h1(seed * 9.1 + u_time * .17);
  }
  o = vec4(u, age, life, seed);
}`;

  const PTS_GUIDE_VS = `#version 300 es
precision highp float;
uniform sampler2D u_state; uniform int u_w; uniform float u_asp, u_size, u_visible, u_subLight, u_lanes, u_jit, u_dust;
${GUIDE_COMMON}
out float v_a; out float v_s; out float v_acc; out float v_layer; out float v_sharp;
void main(){
  ivec2 ij = ivec2(gl_VertexID % u_w, gl_VertexID / u_w);
  vec4 s = texelFetch(u_state, ij, 0);
  float u = s.x, age = s.y, life = s.z, seed = s.w;
  int k = ribbonOf(seed);
  vec2 B = bez(k, u);
  vec2 T = normalize(bezD(k, u) + vec2(1e-5, 0.));
  vec2 N = vec2(-T.y, T.x);
  // a fixed lane across the ribbon: layered filaments with controlled spacing
  float lane = (floor(h1(seed * 4.3) * u_lanes) + .5) / u_lanes - .5;
  lane += (h1(seed * 7.9) - .5) * u_jit / u_lanes;
  // a few particles drift a little further out as fine dust (still bounded)
  lane += step(1. - u_dust, h1(seed * 7.7)) * (h1(seed * 5.5) - .5) * .5;
  lane = clamp(lane, -.75, .75);
  // the ribbon slowly turns over itself (bounded: it never fully collapses)
  float twist = cos(u_twist * sin(u * 2.4 + u_gtime * .035 + float(k) * 1.7));
  // gentle per-filament undulation along the length
  float und = .05 * sin(u * 9. + u_gtime * .22 + h1(seed * 4.3) * 6.2832) * (.5 + .5 * h1(seed * 2.7));
  // ribbons thin toward their ends
  float taper = .35 + .65 * pow(sin(3.14159 * clamp(u, 0., 1.)), .6);
  float off = (lane * 2. * twist + und) * u_W[k] * taper;
  // RHYTHM: small waves travelling along the ribbon
  for (int i = 0; i < 4; i++) {
    vec4 R = u_grip[i];
    if (R.w <= 0. || int(R.x + .5) != k) continue;
    float d = u - (R.y + R.z * .16);
    off += R.w * exp(-d * d / .0016) * sin(d * 120.) * exp(-R.z * .8);
  }
  vec2 pos = B + N * off;
  v_a = smoothstep(0., 2., age) * (1. - smoothstep(life - 2., life, age))
      * smoothstep(-.02, .06, u) * (1. - smoothstep(.94, 1.02, u));
  v_a *= step(h1(seed * 2.9), u_visible);
  v_a *= k == 0 ? 1. : u_subLight;
  v_s = seed;
  v_acc = step(h1(seed * 13.7), .035);
  // DEPTH, as in the original renderer
  float lh = h1(seed * 6.1);
  float layer = lh < .45 ? 0. : lh < .87 ? 1. : 2.;
  v_layer = layer;
  pos *= layer == 0. ? .96 : layer == 2. ? 1.02 : 1.;
  float size = layer == 0. ? .75 : layer == 2. ? 1.35 : 1.;
  v_sharp = layer == 0. ? 0. : layer == 2. ? 1. : .55;
  v_a *= layer == 0. ? .45 : layer == 2. ? 1.15 : 1.;
  gl_Position = vec4(pos.x / (u_asp * .5), pos.y / .5, 0., 1.);
  gl_PointSize = u_size * size * (.7 + .6 * h1(seed * 5.3));
}`;

  // 2a. Fade the trails a little each frame.
  const FADE = `#version 300 es
precision highp float;
uniform sampler2D u_prev; uniform vec2 u_res; uniform float u_keep;
out vec4 o;
void main(){ o = vec4(texture(u_prev, gl_FragCoord.xy / u_res).rgb * u_keep, 1.); }`;

  // 2b. Draw the particles as points of light.
  const PTS_VS = `#version 300 es
precision highp float;
uniform sampler2D u_state; uniform int u_w; uniform float u_asp, u_size, u_spread, u_visible;
uniform vec2 u_center;
out float v_a; out float v_s; out float v_acc; out float v_layer; out float v_sharp;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
  ivec2 ij = ivec2(gl_VertexID % u_w, gl_VertexID / u_w);
  vec4 s = texelFetch(u_state, ij, 0);
  float life = 5. + 9. * h1(s.w * 3.1);
  v_a = smoothstep(0., 2.5, s.z) * (1. - smoothstep(life - 2.5, life, s.z));
  // thin out softly toward the edge of the spread
  vec2 cn = abs((s.xy - u_center) / vec2(u_spread * u_asp * .6, u_spread * .6));
  float r = pow(pow(cn.x, 4.) + pow(cn.y, 4.), .25);
  v_a *= 1. - smoothstep(.7, 1.1, r);
  v_s = s.w;
  // TENDER: only some particles are drawn, so the filaments are sparse
  v_a *= step(h1(s.w * 2.9), u_visible);
  v_acc = step(h1(s.w * 13.7), .035); // a few particles can carry luminous accents

  // DEPTH: background (45%), middle (42%), foreground (13%)
  float lh = h1(s.w * 6.1);
  float layer = lh < .45 ? 0. : lh < .87 ? 1. : 2.;
  v_layer = layer;
  vec2 pos = s.xy;
  // the background sits a little further back: drawn slightly closer to the
  // centre (parallax) and fainter; the foreground slightly forward
  pos = u_center + (pos - u_center) * (layer == 0. ? .9 : layer == 2. ? 1.04 : 1.);
  float size = layer == 0. ? .75 : layer == 2. ? 1.35 : 1.;
  v_sharp = layer == 0. ? 0. : layer == 2. ? 1. : .55;
  v_a *= layer == 0. ? .45 : layer == 2. ? 1.15 : 1.;

  gl_Position = vec4(pos.x / (u_asp * .5), pos.y / .5, 0., 1.);
  gl_PointSize = u_size * size * (.7 + .6 * h1(s.w * 5.3));
}`;
  const PTS_FS = `#version 300 es
precision highp float;
uniform vec3 u_colA, u_colB, u_colAcc; uniform float u_bright, u_accent, u_lumin, u_shimmer, u_time;
in float v_a; in float v_s; in float v_acc; in float v_layer; in float v_sharp;
out vec4 o;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
  vec2 c = gl_PointCoord - .5;
  float rr = length(c);
  // sharper points in front, softer behind
  float disc = mix(exp(-rr * rr * 14.), smoothstep(.5, .15, rr), v_sharp);
  vec3 col = mix(u_colA, u_colB, h1(v_s * 9.1));
  vec3 lit = col * (.6 + .8 * h1(v_s * 2.3));
  // TONAL ACCENTS: a few strands carry a lighter shade of their own colour,
  // revealed as the music grows more intense
  float tone = step(h1(v_s * 21.7), .07) * step(.5, v_layer);
  lit = mix(lit, mix(col, vec3(1., .97, .92), .45) * 1.6, tone * u_lumin * .8);
  // HIGH FREQUENCIES: a fine, fleeting shimmer on the surface of the
  // strands (each particle catching a little more or less light, changing
  // several times a second), like light moving over silk
  float fl = h1(v_s * 31.7 + floor(u_time * 9. + h1(v_s * 3.3) * 9.) * 1.618);
  lit *= 1. + u_shimmer * (fl * fl * 2.2 - .55) * step(.5, v_layer);
  // STORMY / RESTLESS: occasional luminous accent strands
  lit += u_colAcc * v_acc * u_accent * 4.;
  o = vec4(lit * u_bright * v_a * disc, 1.);
}`;

  // 2c. A soft glow source: a quarter-size copy of only the brightest light.
  const GLOW = `#version 300 es
precision highp float;
uniform sampler2D u_light; uniform vec2 u_px; uniform float u_thresh;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy * u_px;
  vec3 a = vec3(0.);
  for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++)
    a += texture(u_light, uv + (vec2(i, j) - 1.5) * u_px * .25).rgb;
  a /= 16.;
  float l = dot(a, vec3(.3, .59, .11));
  o = vec4(a * smoothstep(u_thresh, u_thresh * 2.5, l), 1.);
}`;

  // 3. Tone map, warm crests, stars and film grain.
  const OUT = `#version 300 es
precision highp float;
uniform sampler2D u_light, u_glow; uniform vec2 u_res, u_gpx; uniform float u_time, u_exposure, u_lumin, u_glowAmt; uniform vec3 u_base;
uniform vec4 u_stars[${MAXS}]; uniform int u_ns;
out vec4 o;
float hash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 L = texture(u_light, uv).rgb;
  // SELECTIVE LUMINOSITY: where strands converge and overlap the light builds
  // up faster than it adds; intense music reveals this, quiet music doesn't
  float ll = dot(L, vec3(.3, .59, .11));
  L *= 1. + u_lumin * 2.4 * smoothstep(.1, .8, ll);
  // SOFT DIFFUSED LIGHT around the most luminous filaments (wide, faint)
  vec3 G = vec3(0.);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * .5236, rad = (i % 2 == 0) ? 2.5 : 5.;
    G += texture(u_glow, uv + vec2(cos(a), sin(a)) * rad * u_gpx).rgb;
  }
  G += texture(u_glow, uv).rgb * 2.;
  L += G / 14. * u_glowAmt;
  // stars, hidden where the waves are bright
  float fog = dot(L, vec3(.3, .59, .11));
  float clear = 1. - smoothstep(.05, .45, fog);
  if (clear > .01) {
    for (int i = 0; i < ${MAXS}; i++) {
      if (i >= u_ns) break;
      vec4 S = u_stars[i];
      float d = length(gl_FragCoord.xy - S.xy);
      if (d > S.z * 3.) continue;
      L += vec3(.9, .93, 1.) * S.w * clear * (smoothstep(S.z, S.z * .3, d) + .25 * exp(-d * d / (S.z * S.z * 4.)));
    }
  }
  vec3 tm = 1. - exp(-L * u_exposure);
  // where light piles up on a crest it warms toward soft white
  float crest = smoothstep(.45, 1., dot(tm, vec3(.3, .59, .11)));
  tm = mix(tm, vec3(1., .93, .82) * max(tm.r, max(tm.g, tm.b)), crest * .55);
  vec3 col = u_base + tm;
  float gf = floor(u_time * 12.);
  float g = hash(gl_FragCoord.xy + fract(gf * .618) * vec2(311., 173.) + vec2(mod(gf, 97.), 0.)) - .5;
  float lum = dot(col, vec3(.3, .59, .11));
  col += g * (.022 + .09 * lum);
  o = vec4(col, 1.);
}`;

  // Tuning for the experimental guided-ribbon mode (?style=ribbons).
  // Coordinates: x spans about -asp/2..asp/2, y spans -0.5..0.5.
  const GUIDE = {
    // composition: the dominant curve's base control points (x in units of
    // the screen's aspect, y in screen heights). A long, low-to-high sweep.
    base: [[-0.66, -0.2], [-0.18, 0.6], [0.2, -0.58], [0.66, 0.18]],
    subOffset: [0.2, 0.24],   // how far the two subordinates sit above/below
    subSpread: [1.25, 0.55, 0.55, 1.25], // per control point: close mid-screen, fanning out at the edges
    subFlatten: 0.8,          // subordinates echo the dominant curve, flatter
    subWidth: 0.55,           // subordinate width relative to the dominant
    subLight: 0.25, subLightTexture: 0.35, // subordinate brightness (+ with texture)
    // slow, low-frequency drift of the control points (no independent structures)
    driftX: 0.05, driftY: 0.09, driftSpeed: 0.012,
    tauShape: 2.5,            // s: how quickly control points glide to targets
    // ribbon body
    width: 0.06, widthVolume: 0.06, // half-width, + volume
    lanes: 22, laneJitter: 0.35, // filaments across a ribbon, and their looseness
    twist: 0.5, twistTension: 0.55, // slow turning-over of the ribbon (bounded)
    dust: 0.04, dustHigh: 0.08, // bounded stray fibres (+ highs)
    visible: 0.55,            // share of particles drawn
    flow: 0.03, flowMid: 0.09, // travel speed along ribbons (+ midrange)
    // music -> structure (all bounded; smoothed by the taus below)
    bassSwayX: 0.035, bassSwayY: 0.06, // whole structure sways with bass
    midDeformX: 0.05, midDeformY: 0.09, // inner control points bend with mids
    volExpand: 0.15,          // modest vertical expansion with volume
    tensionCurve: 0.3,        // extra curvature with harmonic tension
    rippleAmp: 0.018,         // rhythm waves along the ribbons
    tauVolume: 3, tauMid: 4, tauBass: 3, tauTension: 6, tauTexture: 6,
  };

  // Colour families by tonal temperature. They share a similar lightness on
  // purpose: harmony changes the temperature of the light, never how dark it
  // is. (Minor is not darker, major is not brighter.)
  // (Strong chroma: thousands of additive particles lighten any colour, so
  // these hold their tint as the light builds up.)
  const WARM_A = [0.92, 0.5, 0.34], WARM_B = [0.95, 0.76, 0.5];    // copper rose, champagne
  const COOL_A = [0.5, 0.44, 0.96], COOL_B = [0.72, 0.62, 0.98];   // slate lavender, pearl lilac

  function rgbToHsl([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  class Waves {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      // 'guides' = experimental composition-driven ribbons (?style=ribbons)
      this.guides = opts.mode === 'guides';
      const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false }));
      if (!gl) throw new Error('WebGL2 is not available');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not available');
      this.pSim = this._prog(QUAD_VS, SIM);
      this.pFade = this._prog(QUAD_VS, FADE);
      this.pPts = this._prog(PTS_VS, PTS_FS);
      this.pOut = this._prog(QUAD_VS, OUT);
      this.pGlow = this._prog(QUAD_VS, GLOW);
      if (this.guides) {
        this.pSimG = this._prog(QUAD_VS, SIM_GUIDE);
        this.pPtsG = this._prog(PTS_GUIDE_VS, PTS_FS);
      }
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.vao = gl.createVertexArray(); // particles need no attributes
      // fewer particles on small screens
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      this.PW = small ? 256 : 384;
      this.PH = small ? 192 : 256;
      this.t = rnd(0, 100);
      this.focus = { x: 0, y: 0, seed: rnd(0, 50) };
      this.colA = [0.45, 0.55, 0.9];
      this.colB = [0.7, 0.6, 0.95];
      this.bassPhase = 0;
      this.forms = []; // (kept so shared debug tools don't trip)
      this.resize();
      this._makeStars();
      window.addEventListener('resize', () => this.resize());
      this.reset();
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

    _tex(w, h, type, data = null) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (type === 'state') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const filt = type === 'state' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { tex: t, fb, w, h };
    }

    resize() {
      const gl = this.gl;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.dpr = dpr;
      this.asp = w / h;
      this.light = [this._tex(this.c.width, this.c.height, 'light'), this._tex(this.c.width, this.c.height, 'light')];
      this.glow = this._tex(Math.max(16, Math.round(this.c.width / 4)), Math.max(16, Math.round(this.c.height / 4)), 'light');
      for (const L of this.light) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, L.fb);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    // Particles start scattered loosely around the middle.
    reset() {
      // a new song starts a new fingerprint
      this.songD = null;
      this.dims = null;
      this.songT = 0;
      const n = this.PW * this.PH;
      const data = new Float32Array(n * 4);
      this.gP = null; // guide control points re-settle from their base shape
      this.gRip = [];
      for (let i = 0; i < n && this.guides; i++) {
        data[i * 4] = Math.random();          // u along the ribbon
        data[i * 4 + 1] = Math.random() * 8;  // age, staggered
        data[i * 4 + 2] = 6 + Math.random() * 8; // life
        data[i * 4 + 3] = Math.random() * 1000; // seed
      }
      for (let i = 0; i < n && !this.guides; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.35;
        data[i * 4] = Math.cos(a) * r * this.asp;
        data[i * 4 + 1] = Math.sin(a) * r;
        data[i * 4 + 2] = Math.random() * 8; // age, staggered so they don't all fade at once
        data[i * 4 + 3] = Math.random() * 1000; // seed
      }
      this.state = [this._tex(this.PW, this.PH, 'state', data), this._tex(this.PW, this.PH, 'state', null)];
      const gl = this.gl;
      for (const L of this.light || []) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, L.fb);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    _makeStars() {
      const seed = rnd(0, 50);
      this.stars = [];
      const want = Math.round(clamp((window.innerWidth * window.innerHeight) / (1280 * 800), 0.35, 1) * MAXS);
      let tries = 0;
      while (this.stars.length < want && tries++ < 4000) {
        const x = Math.random(), y = Math.random();
        const dens = 0.5 + 0.5 * MB.noise3(x * 2.2, y * 2.2, seed);
        if (Math.random() > dens * dens * 1.6) continue;
        const r = Math.random();
        this.stars.push({ x, y, size: 0.9 + r * r * 1.2, base: 0.1 + Math.pow(Math.random(), 3) * 0.5, tw: rnd(0.25, 1.1), ph: rnd(0, Math.PI * 2), glint: 0 });
      }
    }

    // muted palette colours (the same major/minor logic as the rest of the app)
    // Read the music along six independent, continuous dimensions. Each is a
    // sustained characteristic: smoothed over seconds, so the interpretation
    // never jumps, and 30% of it is the song's own running average (its
    // fingerprint). Then each dimension shapes its own part of the picture.
    _mood(f, dt) {
      const on = !f.silent;
      // raw readings, reused from the analysis
      this.rmsL = (this.rmsL ?? 0.05) + ((on ? f.rms || 0 : 0) - (this.rmsL ?? 0.05)) * ease(dt, 3);
      this.onsetRate = (this.onsetRate ?? 1.5) + ((f.beat ? 1 / Math.max(dt, 1e-3) : 0) - (this.onsetRate ?? 1.5)) * ease(dt, 5);
      if (f.chordId !== undefined && f.chordId !== this.lastChordId) {
        if (this.lastChordId !== undefined) this.chordHits = (this.chordHits || 0) + 1;
        this.lastChordId = f.chordId;
      }
      this.chordRate = (this.chordRate ?? 0.3) + (((this.chordHits || 0) / Math.max(dt, 1e-3)) - (this.chordRate ?? 0.3)) * ease(dt, 8);
      this.chordHits = 0;
      const drive = this.drive ?? 0.5;
      const level = this.vol ?? 0.3;

      // HARMONIC CHARACTER: tonal temperature, from major/minor and how bright
      // the sound is. Colour only.
      const harm = clamp(0.5 + 0.55 * ((f.mode ?? 0.5) - 0.5) + 0.35 * ((f.brightness ?? 0.5) - 0.5));
      // ENERGY: loudness against the song's own levels, plus drive and how
      // full the sound is. Raw loudness counts only a little, because most
      // recordings are mastered loud; an intimate song with no drums and
      // little layering reads as calm however it was mastered.
      const energy = on ? clamp(0.3 * level + 0.15 * clamp(this.rmsL / 0.12) + 0.33 * drive + 0.22 * clamp(f.lush ?? 0)) : 0;
      // RHYTHMIC ACTIVITY: how often notes strike, and how driven they are
      const rhythm = on ? clamp(0.5 * clamp((this.onsetRate - 1) / 3) + 0.5 * drive) : 0;
      // HARMONIC TENSION: computed in update() from chord fit and distance
      const tension = this.tension ?? 0;
      // TEXTURE: how full and layered the sound is (spread across the
      // spectrum, low weight, shimmer up high)
      const texture = on ? clamp(0.75 * (f.lush ?? 0) + 0.25 * (this.high ?? 0)) : 0;
      // DYNAMIC VARIATION: how much the music is changing: energy moving away
      // from its long-term level, and the pace of chord changes
      this.eLong = (this.eLong ?? energy) + (energy - (this.eLong ?? energy)) * ease(dt, 20);
      this.eDev = (this.eDev ?? 0) + (Math.abs(energy - this.eLong) - (this.eDev ?? 0)) * ease(dt, 6);
      const variation = clamp(0.65 * clamp(this.eDev * 5) + 0.35 * clamp((this.chordRate - 0.1) / 0.7));

      const raw = { harm, energy, rhythm, tension, texture, variation };
      const tau = { harm: 6, energy: 3, rhythm: 4, tension: 3, texture: 5, variation: 6 };
      if (!this.idle && on) {
        this.songT = (this.songT || 0) + dt;
        this.songD = this.songD || { ...raw };
        const k2 = Math.min(1, dt / Math.max(4, this.songT));
        for (const k in raw) this.songD[k] += (raw[k] - this.songD[k]) * k2;
      }
      this.dims = this.dims || { ...raw };
      for (const k in raw) {
        const target = this.songD && !this.idle ? 0.7 * raw[k] + 0.3 * this.songD[k] : raw[k];
        this.dims[k] += (target - this.dims[k]) * ease(dt, tau[k]);
      }
      const D = this.dims;
      const { energy: E, rhythm: R, texture: X, variation: V } = D;
      const T = D.tension;

      // Each dimension has its own, restrained contribution.
      this.M = {
        // TEXTURE: how many strands, how many fibres per strand, softness
        density: 0.75 + 0.5 * X,
        strands: 3 + 13 * X,          // fewer, bolder fibres per strand
        visible: 0.3 + 0.3 * X,       // fewer particles drawn, each thicker
        dust: 0.12 + 0.4 * X,         // less loose, hair-like dust
        thick: 0.55 + 0.6 * X + 0.25 * E,
        // TENSION: curvature and structural complexity (more is added in
        // render, where tension also folds and crosses the strands)
        curve: 0.85 + 0.35 * T,
        fold: 0.65 + 0.2 * R,
        turb: 0.04 + 0.25 * R * E,
        cross: 0,
        instab: 0.08 + 0.45 * T * (0.4 + 0.6 * R) + 0.2 * V,
        // ENERGY: speed, expansion, luminosity
        speed: 0.55 + 0.75 * E,
        spread: 0.72 + 0.48 * E,
        light: 0.75 + 0.35 * E,
        // RHYTHM: disturbances and their sharpness
        trail: 1.3 - 0.55 * R,
        accent: 0.45 * R * E,
        swell: 0.5 + 0.6 * E,
      };
      // DYNAMIC VARIATION: how quickly the composition transforms
      this.evolveT = (this.evolveT ?? this.t) + dt * (0.45 + 1.1 * V + 0.3 * E);

      // the key seeds the shape of the wave field, so a song returns to a
      // similar landscape (moves smoothly if the key estimate changes)
      if (!this.idle && f.tonic !== undefined) {
        const tx = (f.tonic || 0) * 2.37 + (f.keyMode > 0.5 ? 0 : 7.1), ty = (f.tonic || 0) * 1.13;
        this.seedOff = this.seedOff || [tx, ty];
        this.seedOff[0] += (tx - this.seedOff[0]) * ease(dt, 10);
        this.seedOff[1] += (ty - this.seedOff[1]) * ease(dt, 10);
      }
    }

    // ---------- EXPERIMENTAL: guide curves (all tuning lives in GUIDE) ----------
    // Structural values follow their inputs slowly (seconds); luminosity is
    // handled elsewhere and responds faster, so light leads and form follows.
    _guideUpdate(dt) {
      const G = GUIDE, D = this.dims || {}, a = this.asp, t = this.t, sd = this.focus.seed;
      const N = MB.noise3;
      const slow = (key, x, tau) => { const c = this[key] ?? x; this[key] = c + (x - c) * ease(dt, tau); return this[key]; };
      const vol = slow('gVol', this.idle ? 0.3 : (this.vol ?? 0.3), G.tauVolume);
      const mid = slow('gMid', this.idle ? 0.25 : (this.mid ?? 0.3), G.tauMid);
      const bass = slow('gBass', this.idle ? 0.1 : (this.bass ?? 0), G.tauBass);
      const ten = slow('gTen', this.idle ? 0 : (this.tension ?? 0), G.tauTension);
      const tex = slow('gTex', this.idle ? 0.3 : (D.texture ?? 0.3), G.tauTexture);
      // BASS: the whole structure sways slowly as one
      this.gPh = (this.gPh || 0) + dt * (0.2 + 0.5 * bass);
      const sway = [G.bassSwayX * bass * a * Math.sin(this.gPh), G.bassSwayY * bass * Math.sin(this.gPh * 0.7 + 1)];
      // VOLUME: modest expansion; TENSION: bounded extra curvature
      const amp = (1 + G.volExpand * vol) * (1 + G.tensionCurve * ten);
      const dom = G.base.map(([bx, by], i) => {
        const inner = i === 1 || i === 2;
        let x = bx * a + G.driftX * a * N(t * G.driftSpeed, i * 1.9, sd);
        let y = by * amp + G.driftY * N(i * 2.3, t * G.driftSpeed * 0.85, sd + 3);
        // MID: subtle deformation of the inner control points
        if (inner) {
          x += G.midDeformX * a * mid * N(t * 0.04, i + 7, sd);
          y += G.midDeformY * mid * N(i + 11, t * 0.045, sd);
        }
        return [x + sway[0], clamp(y + sway[1], -0.7, 0.7)];
      });
      // two subordinate curves, derived from the dominant one
      const pts = dom.slice();
      for (const [j, side] of [[1, 1], [2, -1]]) {
        const shift = G.subOffset[j - 1] + 0.04 * N(t * 0.01, j * 5, sd);
        for (let i = 0; i < 4; i++) {
          const [x, y] = dom[i];
          pts.push([x + 0.04 * a * N(t * 0.017, i + j * 13, sd), clamp(y * G.subFlatten + side * shift * G.subSpread[i] + 0.05 * N(i + j * 17, t * 0.015, sd), -0.62, 0.62)]);
        }
      }
      // control points glide toward their targets: no jumps, ever
      if (!this.gP) this.gP = pts.map((p) => p.slice());
      for (let i = 0; i < 12; i++) for (let c = 0; c < 2; c++) this.gP[i][c] += (pts[i][c] - this.gP[i][c]) * ease(dt, G.tauShape);
      // VOLUME: ribbon width
      const w0 = G.width + G.widthVolume * vol;
      this.gW = [w0, w0 * G.subWidth, w0 * G.subWidth * 0.92];
      // TEXTURE (slow): how present the subordinates are; their count never changes
      this.gSub = G.subLight + G.subLightTexture * tex;
      this.gTwist = G.twist + G.twistTension * ten;
      // RHYTHM: waves travel along existing ribbons
      this.gRip = (this.gRip || []).filter((r) => (r.t += dt) < 5);
    }

    update(f, dt) {
      this.idle = !!f.idle;
      const t = (this.t += dt);
      // THE MUSICAL LAYERS. Each signal has its own attack and decay, matched
      // to the part of the composition it moves. The band and loudness inputs
      // are already measured against each track's own sustained levels (see
      // listener.js), so differently mastered songs behave alike.
      const follow = (key, x, up, down) => {
        const cur = this[key] ?? x;
        this[key] = cur + (x - cur) * ease(dt, x > cur ? up : down);
        return this[key];
      };
      const on = !f.silent;
      // dynamic intensity: luminosity, expansion, density
      follow('vol', on ? (f.level ?? f.energy ?? 0.3) : 0, 0.9, 2.5);
      // low: deep, slow currents (slow to build, slower to settle)
      follow('bass', on ? (f.bass ?? 0) : 0, 0.6, 3);
      // mid: the filaments' form, curvature and expressive movement
      follow('mid', on ? (f.mid ?? 0.3) : 0, 0.5, 1.6);
      // high: fleeting surface detail (quick, but not jittery)
      follow('high', on ? (f.high ?? 0) : 0, 0.15, 0.7);
      // HARMONIC TENSION, only where it can be read reliably: the harmony
      // fits a triad poorly, or the chord sits far from the key on the circle
      // of fifths; confidence fades out when the music is quiet or thin
      // (conservative: flowing arpeggios and melody notes blur the fit a
      // little, so only a clearly poor fit counts)
      const fitT = clamp((0.78 - (f.triadFit ?? 0.86)) / 0.38);
      const k5 = ((((f.chordRoot ?? 0) - (f.tonic ?? 0)) * 7) % 12 + 12) % 12;
      const farT = clamp((Math.min(k5, 12 - k5) - 1.5) / 3);
      const conf = on ? clamp((f.mid ?? 0) * 2) : 0;
      follow('tension', this.idle ? 0 : (0.7 * fitT + 0.3 * farT) * conf, 2, 3);
      // SILENCE: builds up over a few seconds of quiet, clears quickly when
      // the music returns
      const hush = f.silent ? 1 : clamp(1 - (f.level ?? 0.5) * 3.5);
      follow('quietAmt', this.idle ? 0 : hush, 3, 0.6);
      // PERCUSSION: ripples. Onset strength is judged against this song's
      // own typical onsets, and scaled by drive, so drums ripple clearly and
      // a piano barely does
      this.ripples = (this.ripples || []).filter((r) => (r.t += dt) < 4);
      if (f.beat && on && !this.idle) {
        const bs = f.beatStrength || 0.3;
        this.beatAvg = (this.beatAvg ?? bs) + (bs - (this.beatAvg ?? bs)) * 0.08;
        const rel = clamp(bs / Math.max(0.15, this.beatAvg * 1.6));
        this.ripCool = (this.ripCool || 0);
        const R = this.dims ? this.dims.rhythm : 0.3;
        if (rel > 0.85 - 0.45 * R && this.ripCool <= 0 && this.ripples.length < 4) {
          const amp = 0.07 * rel * (0.12 + 0.88 * R);
          if (this.guides) {
            // starts along a ribbon (mostly the dominant one) and travels along it
            const k = Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 1 : 2;
            this.gRip = this.gRip || [];
            if (this.gRip.length < 4) this.gRip.push({ k, u: rnd(0.05, 0.45), t: 0, a: GUIDE.rippleAmp * rel * (0.12 + 0.88 * R) });
          } else {
            const sp = (this.spreadNow || 0.8) * 0.5;
            this.ripples.push({ x: this.focus.x + rnd(-sp, sp) * this.asp, y: this.focus.y + rnd(-sp, sp) * 0.8, t: 0, a: amp });
          }
          this.ripCool = 0.25 + 2.5 * (1 - R) * (1 - R);
        }
      }
      this.ripCool = (this.ripCool || 0) - dt;
      // fullness, as far as the visuals are concerned, needs some drive (drums)
      const hiN = clamp((Math.log10(((f.dbg && f.dbg.hi) || 0) + 1e-9) + 5) / 2.7);
      this.drive = (this.drive ?? 0.5) + (hiN - (this.drive ?? 0.5)) * ease(dt, 3);
      const lushRaw = (f.lush || 0) * (0.35 + 0.65 * this.drive);
      this.lush = (this.lush ?? lushRaw) + (lushRaw - (this.lush ?? lushRaw)) * ease(dt, 2.5);
      this.bpm = (this.bpm ?? f.bpm ?? 90) + ((f.bpm || 90) - (this.bpm ?? 90)) * ease(dt, 6);
      this.bassPhase += dt * (0.6 + 1.6 * this.bass) * (this.M ? 0.4 + 0.6 * this.M.swell : 1);
      this.deepPh = (this.deepPh || 0) + dt * (0.01 + 0.06 * this.bass);
      this._mood(f, dt);
      const M = this.M;
      // the waves' direction turns slowly; restless and stormy music makes it
      // wander and change course irregularly
      const wander = MB.noise3((this.evolveT ?? t) * (0.012 + 0.05 * M.instab), this.focus.seed, 7.7);
      this.ang = 0.3 * Math.sin(t * 0.013 + this.focus.seed) + 0.9 * M.instab * wander;
      // LUMINOSITY follows energy (and a little texture and rhythm), not the
      // key: quiet, intimate music stays restrained however deep its feeling
      const Dm = this.dims;
      const lumRaw = this.idle ? 0.15 : clamp(0.6 * Dm.energy * (0.4 + 0.6 * (this.vol ?? 0.3)) + 0.25 * Dm.texture * (this.vol ?? 0.3) + 0.15 * Dm.rhythm * Dm.energy);
      this.lumin = (this.lumin ?? lumRaw) + (lumRaw - (this.lumin ?? lumRaw)) * ease(dt, lumRaw > (this.lumin ?? lumRaw) ? 1.5 : 4);
      // rhythmic accents (restless, stormy): a quick rise on strong beats
      if (f.beat && !f.silent) this.acc = Math.max(this.acc || 0, f.beatStrength || 0.5);
      this.acc = (this.acc || 0) * Math.exp(-dt / 0.35);

      // the waves' centre drifts slowly near the middle
      const fs = this.focus.seed;
      this.focus.x = MB.noise3(t * 0.01, fs, 0) * 0.3 * this.asp * 0.5;
      this.focus.y = MB.noise3(fs, t * 0.01, 3) * 0.18;

      // HARMONIC CHARACTER: colour temperature. Brighter, major-leaning
      // harmony warms toward copper and champagne; darker-hued, minor-leaning
      // harmony cools toward lavender and pearl; the light stays equally
      // bright either way. Low energy mutes the colour (melancholy reads as
      // muted, not dark). The key turns the hue a little, and the current
      // chord sets the second family: close to home it stays a neighbour,
      // far from home it reaches toward a contrasting colour.
      // (stretched, so leaning one way reads clearly; the middle still blends)
      const tw = clamp((Dm.harm - 0.25) / 0.5);
      const twS = tw * tw * (3 - 2 * tw);
      const mute = 0.22 - 0.16 * Dm.energy;
      const shift = (f.hueShift || 0) * 0.6;
      const finish = (c) => {
        const [h, sat, l] = rgbToHsl(c);
        const g = hslToRgb(h + shift, sat * 100, l * 100);
        const y = 0.3 * g[0] + 0.59 * g[1] + 0.11 * g[2];
        return g.map((v) => v + (y - v) * mute);
      };
      const ta = finish(WARM_A.map((v, i) => v * twS + COOL_A[i] * (1 - twS)));
      let tb = finish(WARM_B.map((v, i) => v * twS + COOL_B[i] * (1 - twS)));
      if (!this.idle && f.chordId) {
        const dist = Math.min(k5, 12 - k5) / 6; // 0 home .. 1 farthest
        const [h, sat, l] = rgbToHsl(ta);
        const rel = hslToRgb(h + (f.chordQual ? 1 : -1) * (12 + 70 * dist), sat * 100, Math.min(0.85, l + 0.08) * 100);
        tb = tb.map((v, i) => 0.6 * v + 0.4 * rel[i]);
      }
      // accents are a lighter shade within the same family
      this.colAcc = tb.map((v) => Math.min(1, v * 1.15 + 0.08));
      this.colA = this.colA.map((v, i) => v + (ta[i] - v) * ease(dt, 5));
      this.colB = this.colB.map((v, i) => v + (tb[i] - v) * ease(dt, 3));

      // stars
      // stars
      for (const st of this.stars) {
        st.x = (st.x + dt * 0.0012 + 1) % 1;
        st.glint *= Math.exp(-dt / 0.7);
        if (Math.random() < 0.05 * dt) st.glint = Math.max(st.glint, rnd(0.35, 0.7));
      }
      if (f.spark && Math.random() < 0.6) {
        const st = this.stars[Math.floor(Math.random() * this.stars.length)];
        if (st) st.glint = Math.min(1, st.glint + 0.8);
      }

      if (this.guides) this._guideUpdate(dt);
      this.render(f, dt);
    }

    render(f, dt) {
      const gl = this.gl;
      dt = Math.min(dt || 1 / 60, 0.05);
      const vol = this.vol ?? 0.3, mid = this.mid ?? 0.3, high = this.high ?? 0, lush = this.lush ?? 0.3, bass = this.bass ?? 0;
      const tempo = clamp((this.bpm ?? 90) / 100, 0.6, 1.6);
      const M = this.M || { density: 1, thick: 1, dust: 1, swell: 1, strands: 20, curve: 1, fold: 1, turb: 0, cross: 0, instab: 0, speed: 1, spread: 1, light: 1, visible: 1, trail: 1, accent: 0 };
      const acc = this.acc || 0;
      gl.disable(gl.BLEND);

      const quietG = this.quietAmt || 0;
      let P;
      if (this.guides) {
        // 1. (guides) advance particles along their ribbons
        const [gIn, gOut] = this.state;
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, gOut.fb);
        gl.viewport(0, 0, this.PW, this.PH);
        const PG = this.pSimG;
        gl.useProgram(PG.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gIn.tex);
        gl.uniform1i(PG.u.u_state, 0);
        gl.uniform1f(PG.u.u_dt, dt);
        gl.uniform1f(PG.u.u_time, this.t);
        // MID + TEMPO: speed along the ribbon (slows in quiet passages)
        gl.uniform1f(PG.u.u_flow, (GUIDE.flow + GUIDE.flowMid * (this.gMid ?? mid)) * tempo * (1 - 0.65 * quietG) / (1.35 * this.asp));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.state = [gOut, gIn];
      }
      // 1. simulate
      const [sIn, sOut] = this.guides ? [this.state[0], this.state[0]] : this.state;
      if (!this.guides) {
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sOut.fb);
      gl.viewport(0, 0, this.PW, this.PH);
      P = this.pSim;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sIn.tex);
      gl.uniform1i(P.u.u_state, 0);
      // DYNAMIC VARIATION: the field transforms faster when the music changes
      gl.uniform1f(P.u.u_time, this.evolveT ?? this.t);
      gl.uniform1f(P.u.u_dt, dt);
      gl.uniform1f(P.u.u_asp, this.asp);
      const tension = this.tension || 0, quiet = this.quietAmt || 0;
      gl.uniform1f(P.u.u_freq, (1.0 + 0.3 * mid) * M.curve);     // MID + MOOD: the curvature of the filaments
      gl.uniform1f(P.u.u_warp, (0.5 + 0.5 * mid + 0.25 * tension) * M.fold); // MID + TENSION: how they fold
      gl.uniform1f(P.u.u_levels, (1.4 + 0.8 * lush + 0.5 * vol) * M.density); // INTENSITY + MOOD: strand density
      gl.uniform1f(P.u.u_thick, clamp((0.08 + 0.34 * vol) * M.thick, 0.03, 0.42)); // INTENSITY + MOOD: thickness
      gl.uniform1f(P.u.u_pull, 3.5 + 2 * (1 - high));            // tighter lines when it's clean
      // MID + TEMPO + MOOD: the filaments' expressive movement (not volume);
      // it softens and slows in quiet passages
      gl.uniform1f(P.u.u_flow, (0.03 + 0.11 * mid) * tempo * M.speed * (1 + 0.5 * M.instab * acc) * (1 - 0.65 * quiet));
      gl.uniform1f(P.u.u_dust, (0.1 + 0.2 * high + 0.35 * quiet) * M.dust); // HIGH + SILENCE: strands fray into dust
      gl.uniform1f(P.u.u_turb, M.turb * (0.5 + 0.5 * mid) + 0.45 * tension); // MOOD + TENSION: turbulence
      gl.uniform1f(P.u.u_deep, 0.06 + 0.32 * bass);              // LOW: deep currents displace the field
      gl.uniform1f(P.u.u_deepPh, this.deepPh || 0);
      gl.uniform1f(P.u.u_loosen, quiet);                         // SILENCE: lines loosen their hold
      const rip = new Float32Array(16);
      (this.ripples || []).slice(0, 4).forEach((r, i) => rip.set([r.x, r.y, r.t, r.a], i * 4));
      gl.uniform4fv(P.u.u_rip, rip);                             // PERCUSSION: ripples
      gl.uniform1f(P.u.u_strands, Math.max(2, M.strands));       // MOOD: filaments or silk
      gl.uniform1f(P.u.u_cross, Math.min(0.6, M.cross + 0.3 * tension)); // MOOD + TENSION: intersecting currents
      gl.uniform1f(P.u.u_crossAng, 1.05 + 0.4 * Math.sin(this.t * 0.02));
      gl.uniform2f(P.u.u_seedOff, (this.seedOff || [0, 0])[0], (this.seedOff || [0, 0])[1]);
      this.spreadNow = (0.5 + 0.35 * lush + 0.35 * vol) * M.spread * (1 - 0.2 * (this.quietAmt || 0)); // INTENSITY + MOOD: expansion
      gl.uniform1f(P.u.u_spread, this.spreadNow);                // FULLNESS: how far it spreads
      gl.uniform1f(P.u.u_bassAmp, (0.04 + 0.2 * bass) * M.swell); // LOW + MOOD: a slow swell
      gl.uniform1f(P.u.u_bassPhase, this.bassPhase);
      gl.uniform2f(P.u.u_center, this.focus.x, this.focus.y);
      gl.uniform1f(P.u.u_ang, this.ang);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.state = [sOut, sIn];
      }

      // 2. trails: fade the light a little, then draw particles on top
      const [lIn, lOut] = this.light;
      gl.bindFramebuffer(gl.FRAMEBUFFER, lOut.fb);
      gl.viewport(0, 0, lOut.w, lOut.h);
      P = this.pFade;
      gl.useProgram(P.p);
      gl.bindTexture(gl.TEXTURE_2D, lIn.tex);
      gl.uniform1i(P.u.u_prev, 0);
      gl.uniform2f(P.u.u_res, lOut.w, lOut.h);
      // VOLUME: louder music leaves longer, silkier trails
      gl.uniform1f(P.u.u_keep, Math.exp(-dt / ((0.18 + 0.45 * vol) * M.trail)));  // MOOD: soft or sharp
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.vao);
      P = this.guides ? this.pPtsG : this.pPts;
      gl.useProgram(P.p);
      gl.bindTexture(gl.TEXTURE_2D, this.state[0].tex);
      gl.uniform1i(P.u.u_state, 0);
      gl.uniform1i(P.u.u_w, this.PW);
      if (this.guides) {
        gl.uniform2fv(P.u.u_P, new Float32Array(this.gP.flat()));
        gl.uniform1fv(P.u.u_W, new Float32Array(this.gW));
        gl.uniform1f(P.u.u_gtime, this.t);
        gl.uniform1f(P.u.u_twist, this.gTwist);
        gl.uniform1f(P.u.u_subLight, this.gSub);
        gl.uniform1f(P.u.u_lanes, GUIDE.lanes);
        gl.uniform1f(P.u.u_jit, GUIDE.laneJitter);
        gl.uniform1f(P.u.u_dust, GUIDE.dust + GUIDE.dustHigh * high);
        const gr = new Float32Array(16);
        (this.gRip || []).slice(0, 4).forEach((r, i) => gr.set([r.k, r.u, r.t, r.a], i * 4));
        gl.uniform4fv(P.u.u_grip, gr);
      } else {
        gl.uniform1f(P.u.u_spread, this.spreadNow);
        gl.uniform2f(P.u.u_center, this.focus.x, this.focus.y);
      }
      gl.uniform1f(P.u.u_asp, this.asp);
      gl.uniform1f(P.u.u_size, 2.4 * this.dpr);                 // thicker lines
      gl.uniform3fv(P.u.u_colA, this.colA);
      gl.uniform3fv(P.u.u_colB, this.colB);
      gl.uniform3fv(P.u.u_colAcc, this.colAcc || [1, 1, 1]);
      gl.uniform1f(P.u.u_visible, (this.guides ? GUIDE.visible : M.visible) * (1 - 0.8 * quietG)); // SILENCE: strands dissolve
      gl.uniform1f(P.u.u_shimmer, this.idle ? 0.1 : 0.6 * high * (0.4 + 0.6 * (this.lumin ?? 0.2))); // HIGH: surface shimmer
      gl.uniform1f(P.u.u_time, this.t);
      gl.uniform1f(P.u.u_lumin, this.lumin ?? 0.2);
      gl.uniform1f(P.u.u_accent, M.accent * (0.15 + 0.85 * acc) * (this.idle ? 0 : 1)); // MOOD: luminous accents
      // brightness per particle: louder is brighter; fewer particles each brighter
      const per = (98304 / (this.PW * this.PH)) * (this.idle ? 0.006 : 0.0085 + 0.013 * vol);
      // MOOD: luminosity (sparser moods draw fewer particles, each a touch brighter)
      gl.uniform1f(P.u.u_bright, per * dt * 60 * M.light / Math.sqrt(Math.max(0.3, M.visible)));
      gl.drawArrays(gl.POINTS, 0, this.PW * this.PH);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      this.light = [lOut, lIn];

      // 2c. soft glow source from the brightest light only
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.glow.fb);
      gl.viewport(0, 0, this.glow.w, this.glow.h);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      P = this.pGlow;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lOut.tex);
      gl.uniform1i(P.u.u_light, 0);
      gl.uniform2f(P.u.u_px, 1 / this.glow.w, 1 / this.glow.h);
      gl.uniform1f(P.u.u_thresh, 0.16);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3. output
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      P = this.pOut;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lOut.tex);
      gl.uniform1i(P.u.u_light, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.glow.tex);
      gl.uniform1i(P.u.u_glow, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(P.u.u_res, this.c.width, this.c.height);
      gl.uniform2f(P.u.u_gpx, 1 / this.glow.w, 1 / this.glow.h);
      gl.uniform1f(P.u.u_time, this.t);
      const lum2 = this.lumin ?? 0.2;
      gl.uniform1f(P.u.u_lumin, lum2);
      gl.uniform1f(P.u.u_glowAmt, 0.15 + 0.55 * lum2);
      // quiet passages sit lower; intense ones open up
      gl.uniform1f(P.u.u_exposure, 0.95 + 0.75 * lum2);
      const tint = this.colA.map((v) => v * 0.02);
      gl.uniform3fv(P.u.u_base, [0.03 + tint[0], 0.03 + tint[1], 0.04 + tint[2]]);
      const sa = new Float32Array(MAXS * 4);
      let ns = 0;
      const skyVis = 0.75 - 0.15 * lush;
      for (const st of this.stars) {
        const n = clamp(0.5 + 0.8 * MB.noise3(st.ph * 7.3, this.t * st.tw * 2.4, 0.7));
        const tw = 0.3 + 0.7 * Math.pow(n, 1.4);
        const b = (st.base * tw + st.glint * 0.6) * skyVis;
        sa.set([st.x * this.c.width, st.y * this.c.height, st.size * this.dpr * (0.85 + 0.3 * tw + 0.3 * st.glint), b], ns * 4);
        ns++;
      }
      gl.uniform4fv(P.u.u_stars, sa);
      gl.uniform1i(P.u.u_ns, ns);
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

  MB.Waves = Waves;
})();

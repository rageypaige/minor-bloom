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

  // SOFT COMPOSITIONAL GUIDANCE (?style=ribbons, the "hybrid"). The original
  // simulation below runs unchanged; guidance is an extra layer on top:
  //  - a guide curve y = gY(x), three layered sines whose amplitudes and
  //    phases evolve on slow / medium / bass-driven timescales;
  //  - the wave field rises with distance FROM that curve (instead of
  //    straight up), so filaments run along the gesture but still fold,
  //    curl and stretch with the noise;
  //  - a soft restoring force inside a band around the curve: particles move
  //    freely within it and are drawn back gently when they stray;
  //  - a travelling pinch along the curve makes the ribbon narrow, twist
  //    and widen, catching more light where it folds.
  const GUIDE_FN = `
uniform float u_guide, u_gBand, u_gPull, u_gWarp, u_gSwell, u_gArch, u_gLen, u_gFine;
uniform vec3 u_gA, u_gK, u_gPh, u_gTw;
// (u_gArch bows the whole gesture into an arc)
float gY(float x){ return u_gA.x * sin(u_gK.x * x + u_gPh.x) + u_gA.y * sin(u_gK.y * x + u_gPh.y) + u_gA.z * sin(u_gK.z * x + u_gPh.z) + u_gArch * x * x; }
float gDY(float x){ return u_gA.x * u_gK.x * cos(u_gK.x * x + u_gPh.x) + u_gA.y * u_gK.y * cos(u_gK.y * x + u_gPh.y) + u_gA.z * u_gK.z * cos(u_gK.z * x + u_gPh.z) + 2. * u_gArch * x; }
// signed distance from the guide (approximate), in the guide's frame
float gDist(vec2 r){ float sl = gDY(r.x); return (r.y - gY(r.x)) / sqrt(1. + sl * sl); }
// 1 = full width; smaller where the ribbon pinches and turns over
float gPinch(float x){ return mix(1., .32 + .68 * abs(cos(u_gTw.y * x + u_gTw.z)), u_gTw.x); }`;

  const FIELD_FN = `
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
  // (guided: the finer octave, which makes filaments cross at odd angles,
  // is scaled by u_gFine)
  float w = fbm(q * .55 + vec2(u_time * .018, 1.7))
          + .5 * (u_guide > .5 ? u_gFine : 1.) * fbm(q * 1.1 + vec2(-u_time * .025, 8.3) + fbm(q * .4 + 3.1));
  // a slow swell rolling along them (bass)
  float swell = u_bassAmp * sin(r.x * 2.2 + u_bassPhase);
  float rise = r.y;
  if (u_guide > .5) {
    // guided: rise with distance from the guide curve, compressed where it
    // pinches (so the ribbon narrows and turns over there)
    vec2 rg = mat2(ca, sa, -sa, ca) * (p - u_center);
    rise = gDist(rg) / gPinch(rg.x);
  }
  // (guided: the noise folds filaments WITHIN the gesture rather than
  // displacing whole lines away from it; the large-scale motion comes from
  // the guide itself, which keeps both forces in agreement)
  float gw = u_guide > .5 ? u_gWarp : 1., gs = u_guide > .5 ? u_gSwell : 1.;
  return rise * u_freq * .9 + u_warp * w * gw + swell * gs;
}`;

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
${GUIDE_FN}
${FIELD_FN}
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
  float d = fract(n * u_levels + lane * u_thick + .5 * u_guide) - .5;
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
  // GUIDANCE: free inside the band around the guide; outside it, a soft
  // force draws particles back toward the composition
  if (u_guide > .5) {
    float ca = cos(u_ang), sa = sin(u_ang);
    mat2 Rm = mat2(ca, sa, -sa, ca);
    vec2 rg = Rm * (p - u_center);
    float gd = gDist(rg);
    float ex = clamp(gd - clamp(gd, -u_gBand, u_gBand), -.3, .3);
    vec2 nR = normalize(vec2(-gDY(rg.x), 1.));
    v -= transpose(Rm) * nR * ex * u_gPull;
  }
  // the waves spread out as the music fills out, and gather when it's sparse
  vec2 c = p - u_center;
  vec2 cn = abs(c / vec2(u_spread * u_asp * .6, u_spread * .6));
  if (u_guide > .5) {
    // guided: the same soft rectangle, but aligned with the gesture
    float ca = cos(u_ang), sa = sin(u_ang);
    cn = abs((mat2(ca, sa, -sa, ca) * c) / vec2(u_spread * u_gLen * .6, u_spread * .6 + u_gBand));
  }
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
    if (u_guide > .5) {
      // guided: reborn along the gesture, within its band
      float ca = cos(u_ang), sa = sin(u_ang);
      float rx = j.x * u_spread * u_gLen * .6;
      vec2 rg = vec2(rx, gY(rx) + j.y * u_gBand * .8);
      p = u_center + transpose(mat2(ca, sa, -sa, ca)) * rg;
    }
    age = 0.;
  }
  o = vec4(p, age, seed);
}`;

  // 2s. SILK: the direction and bend of the wave line each particle is on,
  // read from the same field the simulation uses (rendering only).
  const TAN = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_time, u_freq, u_warp, u_bassAmp, u_bassPhase, u_deep, u_deepPh, u_ang, u_cross, u_crossAng;
uniform vec2 u_center, u_seedOff;
out vec4 o;
${NOISE}
${GUIDE_FN}
${FIELD_FN}
float gmag;
vec2 tang(vec2 p, float ang, vec2 off){
  // (a wide, centred difference: the direction of the wave over a stroke's
  // length, not every small ripple in it, so strokes run smooth and parallel)
  float e = .014;
  vec2 g = vec2(field(p + vec2(e, 0.), ang, off) - field(p - vec2(e, 0.), ang, off),
                field(p + vec2(0., e), ang, off) - field(p - vec2(0., e), ang, off)) / (2. * e);
  gmag = length(g);
  return normalize(vec2(-g.y, g.x) + 1e-7);
}
void main(){
  vec4 s = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0);
  bool crossing = h1(s.w * 5.9) < u_cross;
  float ang = crossing ? u_ang + u_crossAng : u_ang;
  vec2 off = u_seedOff + (crossing ? vec2(17.3, -4.1) : vec2(0.));
  vec2 t = tang(s.xy, ang, off);
  float gm = gmag;
  float h = .04;
  vec2 t2 = tang(s.xy + t * h, ang, off);
  if (dot(t, t2) < 0.) t2 = -t2;
  float k = clamp((t.x * t2.y - t.y * t2.x) / h, -40., 40.); // signed curvature
  o = vec4(t, k, gm);
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
uniform sampler2D u_state; uniform int u_w; uniform float u_asp, u_size, u_spread, u_visible, u_ang;
uniform float u_mat, u_strands, u_cross, u_time;
// RIBBON PROFILE (rendering only): (amount, asymmetry, width variation,
// edge softness), (density falloff, density variation, dissolve, twist)
uniform vec4 u_rib1, u_rib2; uniform float u_ribGain;
// SHEER (rendering only): (channel depth, channel scale, second layer, interior clarity)
uniform vec4 u_rib3;
// smooth, low-frequency variation in 0..1 (coherent along the ribbon)
float lf(float x, float t, float s){ return clamp(.5 + .3 * sin(x * 1.3 + t * .045 + s) + .2 * sin(x * 2.9 - t * .06 + s * 2.7), 0., 1.); }
${GUIDE_FN}
uniform vec2 u_center;
out float v_a; out float v_s; out float v_acc; out float v_layer; out float v_sharp; out vec2 v_pos; out float v_sig;
#ifdef SEG
#define NSEG 8
uniform sampler2D u_tan; uniform vec2 u_res; uniform float u_lineW, u_len, u_dust, u_arcFocus; uniform int u_stride;
out float v_d; out float v_w;
#endif
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
#ifdef SEG
  int id = gl_InstanceID * u_stride; // long strokes: only every few particles need one
#else
  int id = gl_VertexID;
#endif
  ivec2 ij = ivec2(id % u_w, id / u_w);
  vec4 s = texelFetch(u_state, ij, 0);
  float life = 5. + 9. * h1(s.w * 3.1);
  float env = smoothstep(0., 2.5, s.z) * (1. - smoothstep(life - 2.5, life, s.z));
  v_a = env;
  // thin out softly toward the edge of the spread
  vec2 cn = abs((s.xy - u_center) / vec2(u_spread * u_asp * .6, u_spread * .6));
  float r = pow(pow(cn.x, 4.) + pow(cn.y, 4.), .25);
  v_a *= 1. - smoothstep(.7, 1.1, r);
  v_s = s.w;
  v_pos = s.xy;
  float expr = 1.; // how expressive this spot is (the guide's core and folds)
  if (u_guide > .5) {
    // the core of the gesture is brightest; filaments that wander out from
    // it are fainter; where the ribbon pinches and folds it catches light
    float ca = cos(u_ang), sa = sin(u_ang);
    vec2 rg = mat2(ca, sa, -sa, ca) * (s.xy - u_center);
    float gd = gDist(rg) / (u_gBand * .8);
    v_a *= (.3 + .7 * exp(-gd * gd)) * (1. + .7 * (1. - gPinch(rg.x)));
    // small groups that stray well clear of the ribbon fade away rather than
    // leaving short comb-like trails out in the dark
    v_a *= 1. - smoothstep(1.3, 1.9, abs(gd));

    // ASYMMETRIC RIBBON PROFILE. Instead of a round, evenly lit tube, the
    // light across the ribbon follows a profile that varies smoothly along
    // its length: a concentrated luminous edge on one side falling away
    // nonlinearly into darkness on the other, a width that swells into
    // broad sheets and narrows into fine ribbons, the bright edge migrating
    // across as if the ribbon were twisting in space, soft bands of density
    // and stretches that dissolve. Particles are not moved: only how much
    // light each one gives depends on where it sits across the ribbon.
    if (u_rib1.x > 0.) {
      float X = rg.x, T = u_time;
      float asym = u_rib1.y, wv = u_rib1.z, soft = max(.03, u_rib1.w);
      float fall = u_rib2.x, dv = u_rib2.y, diss = u_rib2.z, tw = u_rib2.w;
      // twist: the ribbon's angle to the viewer drifts along its length and in time
      float th = X * 1.4 * tw + T * .11 * tw + 1.8 * sin(X * .6 + T * .03);
      float face = cos(th);
      // width along the length (a fraction of the band), times how much of
      // the ribbon faces the viewer: edge-on it narrows to a fine line
      float width = mix(1., mix(.35, 1.2, lf(X, T, 1.)), wv) * mix(1., .55 + .45 * abs(face), tw > 0. ? 1. : 0.);
      float u = gd / max(width, .05);                 // -1..1 across the visible ribbon
      // the luminous edge sits on the side the ribbon faces. Rather than
      // flipping sides where the ribbon turns edge-on (which left a seam),
      // both orientations are computed and blended gradually over a long
      // stretch, so the edge migrates smoothly across.
      float wPos = smoothstep(-.7, .7, face);
      float asymShape = 0.;
      for (int k = 0; k < 2; k++) {
        float sg = k == 0 ? 1. : -1.;
        float wk = k == 0 ? wPos : 1. - wPos;
        if (wk < .001) continue;
        float e = sg * (.9 - .3 * (1. - abs(face)) * (tw > 0. ? 1. : 0.));
        float d = (e - u) * sg;                         // 0 at the edge, growing inward
        float beyond = exp(-pow(max(-d, 0.) / soft, 2.));                 // crisp outside the edge
        float inner = exp(-pow(max(d, 0.) / 1.5, fall) * 1.4);           // nonlinear falloff to darkness
        float edgeGlow = exp(-pow(d / (soft * .6), 2.));                   // concentrated bright edge
        // SHEER FABRIC. The interior turns more transparent while the edge
        // stays defined; darker translucent channels run through the lit
        // material; and a second, fainter sheet overlaps inside the first,
        // its own soft edge offset from the main one. All slow and coherent.
        float interior = smoothstep(.05, .55, d);       // 0 at the edge, 1 inside
        float chPh = u * 3.14159 * u_rib3.y + .9 * sin(X * .8 + T * .04) + 6.28 * lf(X * .6, T * .5, 21.);
        float channel = 1. - u_rib3.x * smoothstep(.45, .95, .5 + .5 * sin(chPh)) * interior;
        inner *= (1. - .6 * u_rib3.w * interior) * channel;
        float e2 = e - sg * (.5 + .4 * lf(X * 1.1, T * .7, 31.));   // the overlapping layer's edge
        float d2 = (e2 - u) * sg;
        float layer2 = (d2 < 0. ? exp(-pow(-d2 / (soft * 1.6), 2.)) : exp(-pow(d2 / 1.1, fall) * 1.6)) * (1. - .5 * u_rib3.w)
                     + .35 * exp(-pow(d2 / (soft * .9), 2.));
        layer2 *= .55 * u_rib3.z * smoothstep(-.1, .2, d) * channel * (.4 + .6 * lf(X * .9 + 2., T * .6, 41.));
        asymShape += wk * ((d < 0. ? beyond : inner) + .9 * edgeGlow + layer2);
      }
      float symShape = exp(-u * u * 1.2);
      float shape = mix(symShape, asymShape, asym) * (1. - smoothstep(1.05, 1.6, abs(u)));
      // narrower stretches shine only slightly more (strong boosts made knots)
      shape *= inversesqrt(max(width, .6)) * .85;
      // smooth bands of density across the width
      shape *= mix(1., .3 + 1.1 * lf(X * 1.2 + u * 1.9, T * .8, 9.), dv);
      // some stretches dissolve into darkness, others stay clearly defined
      if (diss > 0.) shape *= mix(.25, 1., smoothstep(diss - .3, diss + .3, lf(X * .85, T * .6, 13.)));
      v_a *= mix(1., shape * u_ribGain, u_rib1.x);  // (gain restores the light the profile takes away)
    }
    expr = exp(-gd * gd * 1.6) * (.6 + 1.4 * (1. - gPinch(rg.x)));
  }
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
  float par = layer == 0. ? .9 : layer == 2. ? 1.04 : 1.;
  pos = u_center + (pos - u_center) * par;
  float size = layer == 0. ? .75 : layer == 2. ? 1.35 : 1.;
  v_sharp = layer == 0. ? 0. : layer == 2. ? 1. : .55;
  v_a *= layer == 0. ? .45 : layer == 2. ? 1.15 : 1.;
  v_sig = 0.;

  // SILK MATERIAL (rendering only; the particles move exactly the same).
  // Three tiers of the same particles: most become fine, faint supporting
  // filaments with uneven visibility; a few become crisp signature
  // filaments along the expressive curves; the soft atmospheric veil is
  // made from all of them in the output pass.
  if (u_mat > .5) {
    float sig = step(h1(s.w * 17.3), .06) * step(.5, layer);
    // supporting filaments: visibility varies by strand lane (so the lanes
    // are no longer evenly spaced lines), drifting slowly over time, and
    // per particle; one flow direction and the crossing currents recede,
    // so intersecting trails stop competing
    float laneI = floor(h1(s.w * 4.3) * u_strands);
    float lr = h1(laneI * 7.31 + 1.7);
    float laneW = smoothstep(.1, .9, lr) * (.55 + .45 * sin(u_time * (.05 + .08 * h1(laneI * 3.1)) + lr * 6.28));
    float pv = pow(h1(s.w * 8.7), 1.6);
    float dirW = h1(s.w * 11.3) < .5 ? 1. : .45;
    float crossW = h1(s.w * 5.9) < u_cross ? .4 : 1.;
    float support = .5 * (.12 + 1.1 * laneW) * (.35 + .9 * pv) * dirW * crossW;
    // signature filaments: luminous and sharp, strongest where the
    // gesture is most expressive; a few stay present even elsewhere
    float signature = 1.6 * (.2 + .8 * clamp(expr, 0., 1.6));
    v_a *= mix(support, signature, sig);
    v_sig = sig;
    v_sharp = mix(v_sharp * .3, .85, sig);
    // taper: fine at the start and end of each particle's life
    size *= mix(.62 * (.55 + .45 * env), 1.45, sig);
  }

#ifdef SEG
  // SILK: each particle draws a short, tapered arc of light along the wave
  // line it sits on, bent with the line's curvature. Overlapping arcs from
  // neighbouring particles join into smooth, continuous filaments that
  // follow the ribbon's current shape (instead of the paths particles took
  // while the ribbon moved, which is what crosshatched).
  vec4 tk = texelFetch(u_tan, ij, 0);
  vec2 t = tk.xy, nr = vec2(-t.y, t.x);
  float len = u_len * par * mix(.7 + .6 * h1(s.w * 9.4), 1.7, v_sig);
  // dust drifting off the lines stays a short, faint mote
  float dusty = step(1. - u_dust, h1(s.w * 7.7));
  len *= 1. - .8 * dusty; v_a *= 1. - .65 * dusty;
  // where the lines bunch into a knot their direction is unreliable: fade
  v_a *= smoothstep(.15, .6, tk.w) / (1. + .15 * tk.z * tk.z * len * len);
  float k = clamp(tk.z, -2.5 / len, 2.5 / len);
  int seg = gl_VertexID / 2;
  float u = float(seg) / float(NSEG);
  float x = (u - .5) * len, th = k * x;
  vec2 P = pos + t * x + nr * (.5 * k * x * x);
  vec2 dir = normalize(t + nr * th);
  float taper = sin(3.14159 * u);
  vec2 q = P * u_res.y;                      // world -> pixels (isotropic)
  float w = u_lineW * size * (.7 + .6 * h1(s.w * 5.3)) * (.35 + .65 * taper);
  float side = (gl_VertexID & 1) == 0 ? -1. : 1.;
  float e = w + 1.;
  q += vec2(-dir.y, dir.x) * side * e;
  v_d = side * e; v_w = w;
  v_a *= taper * taper;
  // GALLERY: crisp accents gather at the concentrated bends and folds;
  // elsewhere they fade, so the detail blends into the light around it
  v_a *= mix(1., smoothstep(.35, 1.3, expr) * 1.8, u_arcFocus);
  gl_Position = vec4(q / (.5 * u_res), 0., 1.);
#else
  gl_Position = vec4(pos.x / (u_asp * .5), pos.y / .5, 0., 1.);
  gl_PointSize = u_size * size * (.7 + .6 * h1(s.w * 5.3));
#endif
}`;
  const PTS_FS = `#version 300 es
precision highp float;
uniform vec3 u_colA, u_colB, u_colAcc; uniform float u_bright, u_accent, u_lumin, u_shimmer, u_time, u_irid;
in float v_a; in float v_s; in float v_acc; in float v_layer; in float v_sharp; in vec2 v_pos; in float v_sig;
#ifdef SEG
in float v_d; in float v_w;
#endif
// rotate a colour's hue (YIQ), keeping its brightness
vec3 hueRot(vec3 c, float a){
  vec3 y = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c;
  float cs = cos(a), sn = sin(a);
  y.yz = vec2(y.y * cs - y.z * sn, y.y * sn + y.z * cs);
  return max(mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * y, 0.);
}
out vec4 o;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
#ifdef SEG
  // coverage across the line (box-filtered, so hairlines stay smooth)
  float disc = clamp(v_w + .5 - abs(v_d), 0., 1.);
#else
  vec2 c = gl_PointCoord - .5;
  float rr = length(c);
  // sharper points in front, softer behind
  float disc = mix(exp(-rr * rr * 14.), smoothstep(.5, .15, rr), v_sharp);
#endif
  vec3 col = mix(u_colA, u_colB, h1(v_s * 9.1));
  // IRIDESCENCE: an understated hue drift across the field and between
  // fibres, within the palette (u_irid = max shift in radians; 0 = off)
  if (u_irid > 0.) col = hueRot(col, u_irid * sin(dot(v_pos, vec2(3.1, 2.3)) + u_time * .07 + h1(v_s * 3.3) * 1.2));
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
  // signature filaments hold a little more of their own colour's light
  lit = mix(lit, col * 1.25, v_sig);
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
  o = vec4(u_thresh > 0. ? a * smoothstep(u_thresh, u_thresh * 2.5, l) : a, 1.);
}`;

  // 3. Tone map, warm crests, stars and film grain.
  const OUT = `#version 300 es
precision highp float;
uniform sampler2D u_light, u_glow, u_veil, u_arcs; uniform vec2 u_res, u_gpx, u_vpx; uniform float u_time, u_exposure, u_lumin, u_glowAmt, u_veilAmt, u_trailAmt, u_arcOn; uniform vec3 u_base;
// which layers are shown (trails, arcs, veil, glow); for isolating them
uniform vec4 u_show;
uniform float u_compress; // SHEER: highlight compression (0 = off)
uniform float u_sat;      // colour saturation (1 = as before)
uniform float u_yshift;   // steer yellow/olive hues toward amber/peach (0 = off)
// GALLERY treatment (each 0 = off, grain 1 = as before)
uniform float u_toe, u_lc, u_halation, u_split, u_drift, u_grain;
const mat3 TOYIQ = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312);
const mat3 FROMYIQ = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
out vec4 o;
float hash(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673U, 3812015801U); uint n = (q.x ^ q.y) * 1597334673U; return float(n) * (1. / 4294967295.); }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 L = texture(u_light, uv).rgb;
  // SELECTIVE LUMINOSITY: where strands converge and overlap the light builds
  // up faster than it adds; intense music reveals this, quiet music doesn't
  float ll = dot(L, vec3(.3, .59, .11));
  L *= 1. + u_lumin * 2.4 * smoothstep(.1, .8, ll);
  // LAYER 1, particle trails: weighted (and shown or hidden) on their own
  vec3 T = L;
  L = T * u_trailAmt * u_show.x;
  // SOFT DIFFUSED LIGHT around the most luminous filaments (wide, faint)
  vec3 G = vec3(0.);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * .5236, rad = (i % 2 == 0) ? 2.5 : 5.;
    G += texture(u_glow, uv + vec2(cos(a), sin(a)) * rad * u_gpx).rgb;
  }
  G += texture(u_glow, uv).rgb * 2.;
  L += G / 14. * u_glowAmt * u_show.w;                  // LAYER 4, glow
  if (u_arcOn > 0.) L += texture(u_arcs, uv).rgb * u_show.y; // LAYER 2, SILK: this frame's arcs
  // SILK: ATMOSPHERIC VEIL. A wide, faint translucent haze of coloured light
  // made from the filaments themselves (no fog of its own): it gathers
  // where they are dense and falls away fast where they aren't, so the
  // black ground and the negative space stay clean. Sharp detail on top is
  // untouched (no global blur).
  if (u_veilAmt > 0.) {
    vec3 V = texture(u_veil, uv).rgb * 2.;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * .5236 + .26, rad = (i % 2 == 0) ? 2.2 : 4.6;
      V += texture(u_veil, uv + vec2(cos(a), sin(a)) * rad * u_vpx).rgb;
    }
    V /= 14.;
    float vl = dot(V, vec3(.3, .59, .11));
    L += V * smoothstep(.004, .05, vl) * u_veilAmt * u_show.z; // LAYER 3, veil
  }
  // GALLERY 2, selective light: faint, diffuse light is held lower, so the
  // shadows stay rich and the darkness generous, while the focal areas
  // keep their brightness
  if (u_toe > 0.) {
    float lm = dot(L, vec3(.3, .59, .11));
    // (eased in quiet music, which is already restrained, so it never fades out)
    L *= mix(1. - u_toe * (.35 + .65 * u_lumin), 1., smoothstep(.03, .5, lm));
  }
  // GALLERY 5, local contrast: light set against its own soft surround (the
  // veil source), so concentrated bends read clearly and diffuse stretches
  // fall back; scaled by brightness so faint edges dissolve gently
  if (u_lc > 0. && u_veilAmt > 0.) {
    vec3 S = texture(u_veil, uv).rgb;
    float lm = dot(L, vec3(.3, .59, .11));
    L = max(L + (L - S * 1.3) * u_lc * smoothstep(.06, .5, lm), 0.);
  }
  // GALLERY 3, halation: a warm, slightly irregular bleed around only the
  // strongest highlights (the thresholded glow source), carrying a little
  // of their own colour out beyond them
  if (u_halation > 0.) {
    vec3 H = vec3(0.);
    for (int i = 0; i < 10; i++) {
      float a = float(i) * .628 + 1.2 * sin(uv.x * 6.1 + uv.y * 4.3 + u_time * .05);
      float rad = 4.5 + 2.5 * sin(uv.y * 8.7 - uv.x * 3.9 + float(i) * 1.7);
      H += texture(u_glow, uv + vec2(cos(a), sin(a)) * rad * u_gpx).rgb;
    }
    H /= 10.;
    float hl = dot(H, vec3(.3, .59, .11));
    L += mix(H, hl * vec3(1.2, .7, .48), .5) * u_halation;
  }
  // SHEER: compress the brightest light (above a knee) by luminance only, so
  // the brightest regions keep their colour and detail instead of burning
  // out to white
  if (u_compress > 0.) {
    float lm = dot(L, vec3(.3, .59, .11)), k = .45;
    if (lm > k) L *= (k + (lm - k) / (1. + (lm - k) * u_compress * 2.)) / lm;
  }
  // (stars are drawn afterwards as small points; see STAR_VS/STAR_FS)
  vec3 tm = 1. - exp(-L * u_exposure);
  // where light piles up on a crest it warms toward soft white
  float crest = smoothstep(.45, 1., dot(tm, vec3(.3, .59, .11)));
  tm = mix(tm, vec3(1., .93, .82) * max(tm.r, max(tm.g, tm.b)), crest * .55 * (1. - .7 * u_compress));
  // SATURATION: richer colour at the same brightness (luminance kept);
  // eased off in the very brightest light so crests don't clip
  float Y = dot(tm, vec3(.3, .59, .11));
  float satK = mix(u_sat, 1. + (u_sat - 1.) * .4, smoothstep(.6, .95, Y));
  // keep golds from turning olive: yellows and greens are turned toward
  // amber/peach and saturated less
  if (u_yshift > 0.) {
    vec3 q = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * tm;  // YIQ
    float h = atan(q.z, q.y), c = length(q.yz);
    float yel = smoothstep(-.15, -.55, h) * (1. - smoothstep(-2.3, -2.7, h));
    h += yel * u_yshift;
    satK = mix(satK, 1., yel * .6);
    q.yz = vec2(cos(h), sin(h)) * c;
    tm = max(mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * q, 0.);
  }
  tm = clamp(mix(vec3(Y), tm, satK), 0., 1.);
  // GALLERY 4, nuanced colour: like split-toning a print, the brighter
  // light leans toward amber and rose, the dimmer toward mauve and violet,
  // with a slow spatial drift so warm and cool coexist within one
  // formation. Only the hue direction moves (within the palette's own warm
  // to cool arc), never the brightness, and only part of the way.
  if (u_split > 0.) {
    vec3 q = TOYIQ * tm;
    float c = length(q.yz);
    float drift = .5 * sin(uv.x * 2.3 + uv.y * 1.7 + u_time * .021) + .3 * sin(uv.y * 3.1 - uv.x * 1.4 - u_time * .016);
    float warmth = clamp(smoothstep(.12, .7, q.x) + u_drift * drift, 0., 1.);
    float ta = mix(1.3, .12, warmth);              // mauve .. amber-rose (YIQ hue angle)
    q.yz = mix(q.yz, vec2(cos(ta), sin(ta)) * c, u_split * .45);
    tm = clamp(FROMYIQ * q, 0., 1.);
  }
  vec3 col = u_base + tm;
  float gf = floor(u_time * 12.);
  float g = hash(gl_FragCoord.xy + fract(gf * .618) * vec2(311., 173.) + vec2(mod(gf, 97.), 0.)) - .5;
  float lum = dot(col, vec3(.3, .59, .11));
  col += g * (.022 + .09 * lum) * u_grain;   // GALLERY: grain (1 = as before)
  o = vec4(col, 1.);
}`;

  // 4. Stars, drawn once each as a small point (much cheaper than checking
  // every star at every pixel), hidden where the light behind them is bright.
  const STAR_VS = `#version 300 es
precision highp float;
uniform vec4 u_stars[${MAXS}]; uniform vec2 u_res;
out vec4 v_star;
void main(){
  vec4 S = u_stars[gl_VertexID];
  v_star = S;
  gl_Position = vec4(S.xy / u_res * 2. - 1., 0., 1.);
  gl_PointSize = S.z * 6. + 1.;
}`;
  const STAR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_light; uniform vec2 u_res; uniform float u_exposure;
in vec4 v_star;
out vec4 o;
void main(){
  float d = length(gl_FragCoord.xy - (v_star.xy));
  float z = v_star.z;
  float clear = 1. - smoothstep(.05, .45, dot(texture(u_light, gl_FragCoord.xy / u_res).rgb, vec3(.3, .59, .11)));
  float s = v_star.w * clear * (smoothstep(z, z * .3, d) + .25 * exp(-d * d / (z * z * 4.)));
  o = vec4(vec3(.9, .93, 1.) * (1. - exp(-s * u_exposure)), 1.);
}`;

  // Tuning for the soft guidance (?style=ribbons). Distances are in screen
  // heights. Three timescales: slow (the main sweep), medium (folds and the
  // travelling pinch, driven by mids/energy) and bass (a rolling swell).
  const GUIDE = {
    // (speeds are kept below what the particles can follow, so the gesture
    // bends and travels without tearing apart)
    sweepAmp: 0.17, sweepAmpVol: 0.05, sweepCycles: 1.0, sweepSpeed: 0.04, sweepSpeedEnergy: 0.04,
    foldAmp: 0.04, foldAmpMid: 0.09, foldK: 2.1, foldSpeed: 0.08, foldSpeedMid: 0.22,
    rollAmp: 0.025, rollAmpBass: 0.1, rollK: 0.6, rollSpeed: 0.3,
    pinch: 0.5, pinchTension: 0.25, pinchK: 1.3, pinchSpeed: 0.08, pinchSpeedEnergy: 0.15,
    turb: 0.3,          // share of the original eddy turbulence kept
    band: 0.12, bandLush: 0.08, bandVol: 0.06, // free-movement band around the guide
    warp: 0.3, swell: 0.4, // share of the original noise warp / bass swell kept inside the band
    pull: 1.5,          // strength of the soft restoring force outside the band
    wander: 0.35,       // how much of the original directional wander remains

    // VARIETY. Each refinement is independent; set its amount to 0 to turn
    // it off. All evolve continuously from slow noise (minutes), never switch.
    orient: 1.2,        // rad: how far the gesture's axis turns (diagonal..near-vertical)
    orientSpeed: 0.011, //   how quickly it turns
    arch: 0.45,         // bow into sweeping arcs (curvature at the ends)
    archSpeed: 0.009,
    scaleRange: 0.35,   // scale drift: 1 +/- this (intimate .. expansive)
    scaleEnergy: 0.25,  //   energetic music opens it up a little more
    scaleSpeed: 0.008,
    curl: 1.3,          // occasional swelling of the folds into curls/overlaps
    curlSpeed: 0.014,
    fine: 0.25,         // share of the fine warp octave kept (1 = as before; less = less crosshatching)
    irid: 0.32,         // rad: max secondary-hue shift (iridescence; 0 = off)
  };

  // Colour families by tonal temperature. They share a similar lightness on
  // purpose: harmony changes the temperature of the light, never how dark it
  // is. (Minor is not darker, major is not brighter.)
  // (Strong chroma: thousands of additive particles lighten any colour, so
  // these hold their tint as the light builds up.)
  const WARM_A = [0.92, 0.5, 0.34], WARM_B = [0.95, 0.76, 0.5];    // copper rose, champagne
  const COOL_A = [0.5, 0.44, 0.96], COOL_B = [0.72, 0.62, 0.98];   // slate lavender, pearl lilac

  // INK palette (Paige's): a ramp from cool to warm. Minor-leaning harmony
  // sits toward the inky blues, major-leaning toward copper rose and
  // tarnished gold, with plum and black cherry as the bridge. The swatches
  // are muted, dark colours; as additive light they are lifted part of the
  // way toward full brightness (the darker ones less), keeping their hue.
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lift = (c) => { const k = Math.pow(0.92 / Math.max(...c), 0.6); return c.map((v) => Math.min(1, v * k)); };
  const INK = ['#284F5B', '#526B86', '#70516D', '#8E475B', '#B7796B', '#B59A66'].map((h) => lift(hex(h)));
  //          petrol ink  storm blue  bruised plum black cherry copper rose tarnished gold
  const INK_GROUND = hex('#111016'); // aubergine charcoal
  const inkRamp = (p) => {
    p = Math.max(0, Math.min(INK.length - 1, p));
    const i = Math.min(INK.length - 2, Math.floor(p)), t = p - i;
    return INK[i].map((v, k) => v + (INK[i + 1][k] - v) * t);
  };

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

  // SILK material tuning (rendering only)
  const SILK = {
    lineW: 0.32,  // half-width of a filament line, in CSS pixels (x tier size)
    // (arc brightness, stride, length and the veil now live in
    // RENDER_PRESETS below, so they can be adjusted live with ?dev)
  };

  // RENDERING DEVELOPMENT CONTROLS (drawing only: the simulation, guidance,
  // particle counts, flow and musical response are untouched).
  //   trailBase/trailVol: how long trails last, seconds: (base + vol * loudness) * mood
  //   trailOpacity:  how much the particle trails count in the final image
  //   comp:          make up for light lost to shorter trails (0 = none,
  //                  1 = full) by brightening the particles, not lengthening trails
  //   silkBright/stride/len: the silk arc layer (silkBright 0 = off)
  //   veil, glow:    the atmospheric veil and the soft glow
  // ?render=baseline / shortTrails / tuned picks a preset (tuned is the default); ?dev shows sliders; L cycles
  // through viewing each layer on its own.
  const RENDER_PRESETS = {
    baseline:   { trailBase: 0.18, trailVol: 0.45, trailOpacity: 1, comp: 0, silkBright: 0.2, stride: 4, len: 0.11, veil: 0.2, glow: 1 },
    shortTrails: { trailBase: 0.04, trailVol: 0.12, trailOpacity: 0.75, comp: 0.6, silkBright: 0, stride: 4, len: 0.11, veil: 0.6, glow: 1 },
    // Paige's tuning (the default): long, faint trails; short, bright silk
    // strokes from a sparse set of particles; a strong veil and glow
    tuned:      { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.2, comp: 0, silkBright: 1, stride: 10, len: 0.03, veil: 1.2, glow: 2.25 },
    // tuned with richer colour: more saturation, and the brightest light
    // compressed so it keeps its colour instead of washing out (the default)
    vivid:      { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.2, comp: 0, silkBright: 1, stride: 10, len: 0.03, veil: 1.2, glow: 2.25,
                  saturation: 1.7, compress: 0.5, yellowShift: 0.6 },
    // GALLERY (the default): vivid, refined toward experimental photography.
    // Fewer, focused crisp accents; less haze; rich shadows; warm halation
    // only around the strongest highlights; split-toned colour; finer grain.
    gallery:    { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.3, comp: 0, silkBright: 0.45, stride: 10, len: 0.03, veil: 0.95, glow: 1.4,
                  saturation: 1.3, compress: 0.75, yellowShift: 0.6,
                  arcFocus: 1, toe: 0.32, localContrast: 0.12, halation: 0.6, splitTone: 0.6, colourDrift: 0.35, grain: 0.35 },
    // INK (the default): gallery with Paige's ink palette and aubergine
    // charcoal ground; split-toning and saturation eased so the palette's
    // own hues lead
    ink:        { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.3, comp: 0, silkBright: 0.45, stride: 10, len: 0.03, veil: 0.95, glow: 1.4,
                  saturation: 1.1, compress: 0.75, yellowShift: 0.25,
                  arcFocus: 1, toe: 0.32, localContrast: 0.12, halation: 0.6, splitTone: 0, colourDrift: 0.35, grain: 0.35, palette: 'ink' },
    // tuned + the experimental asymmetric ribbon profile (the default)
    curtain:    { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.2, comp: 0, silkBright: 1, stride: 10, len: 0.03, veil: 1.2, glow: 2.25,
                  ribbon: 1, asym: 0.8, widthVar: 0.6, edgeSoft: 0.3, falloff: 1.4, densityVar: 0.45, dissolve: 0.08, twist: 1, gain: 2.8 },
    // curtain + sheer-fabric interior (the default)
    sheer:      { trailBase: 0.4, trailVol: 0.55, trailOpacity: 0.2, comp: 0, silkBright: 1, stride: 10, len: 0.03, veil: 1.2, glow: 2.25,
                  ribbon: 1, asym: 0.8, widthVar: 0.6, edgeSoft: 0.3, falloff: 1.4, densityVar: 0.45, dissolve: 0.08, twist: 1, gain: 3.3,
                  channels: 0.55, channelScale: 2.2, layers: 0.7, clarity: 0.5, compress: 0.6 },
  };
  // ribbon profile settings default to off, so older presets look as they did
  const RIBBON_OFF = { ribbon: 0, asym: 0.8, widthVar: 0.6, edgeSoft: 0.3, falloff: 1.4, densityVar: 0.45, dissolve: 0.08, twist: 1, gain: 2.8,
                       channels: 0, channelScale: 2.2, layers: 0, clarity: 0, compress: 0, saturation: 1, yellowShift: 0,
                       arcFocus: 0, toe: 0, localContrast: 0, halation: 0, splitTone: 0, colourDrift: 0, grain: 1, palette: 'original' };
  for (const k in RENDER_PRESETS) RENDER_PRESETS[k] = { ...RIBBON_OFF, ...RENDER_PRESETS[k] };
  const DEFAULT_PRESET = 'ink';
  const LAYERS = ['all', 'trails', 'arcs', 'veil', 'glow'];

  class Waves {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      // 'guides': the original simulation plus soft compositional guidance
      this.guides = opts.mode === 'guides';
      // the 'silk' rendering material (see PTS_VS and OUT); toggled live
      // with the M key so it can be compared on the very same particles
      this.silk = !!opts.silk;
      const q = new URLSearchParams(location.search);
      this.R = { ...RENDER_PRESETS[RENDER_PRESETS[q.get('render')] ? q.get('render') : DEFAULT_PRESET] };
      this.layer = Math.max(0, LAYERS.indexOf(q.get('layer') || 'all'));
      window.addEventListener('keydown', (e) => {
        if ((e.key === 'l' || e.key === 'L') && !(e.target instanceof HTMLInputElement)) {
          this.layer = (this.layer + 1) % LAYERS.length;
          this._flag('layer: ' + LAYERS[this.layer]);
          if (this._devSync) this._devSync();
        }
      });
      if (q.has('dev')) this._devPanel();
      const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false }));
      if (!gl) throw new Error('WebGL2 is not available');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not available');
      this.pSim = this._prog(QUAD_VS, SIM);
      this.pFade = this._prog(QUAD_VS, FADE);
      this.pPts = this._prog(PTS_VS, PTS_FS);
      const seg = (src) => src.replace('precision highp float;', '#define SEG\nprecision highp float;');
      this.pSeg = this._prog(seg(PTS_VS), seg(PTS_FS));
      this.pTan = this._prog(QUAD_VS, TAN);
      this.pOut = this._prog(QUAD_VS, OUT);
      this.pGlow = this._prog(QUAD_VS, GLOW);
      this.pStar = this._prog(STAR_VS, STAR_FS);
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
      // silk arcs are drawn fresh each frame into their own buffer (no trails),
      // so they show only the ribbon's present shape and never pile up
      this.arcs = this._tex(this.c.width, this.c.height, 'light');
      this.veil = this._tex(Math.max(8, Math.round(this.c.width / 10)), Math.max(8, Math.round(this.c.height / 10)), 'light');
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
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.35;
        data[i * 4] = Math.cos(a) * r * this.asp;
        data[i * 4 + 1] = Math.sin(a) * r;
        data[i * 4 + 2] = Math.random() * 8; // age, staggered so they don't all fade at once
        data[i * 4 + 3] = Math.random() * 1000; // seed
      }
      this.state = [this._tex(this.PW, this.PH, 'state', data), this._tex(this.PW, this.PH, 'state', null)];
      this.tan = this.tan || this._tex(this.PW, this.PH, 'light');
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
      // (testing only: MB.debug.atmos._harmOverride = 0..1 pins the harmony)
      if (this._harmOverride != null) this.dims.harm = this._harmOverride;
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
      if (!this.idle && f.tonic !== undefined && !this.guides) {
        const tx = (f.tonic || 0) * 2.37 + (f.keyMode > 0.5 ? 0 : 7.1), ty = (f.tonic || 0) * 1.13;
        this.seedOff = this.seedOff || [tx, ty];
        this.seedOff[0] += (tx - this.seedOff[0]) * ease(dt, 10);
        this.seedOff[1] += (ty - this.seedOff[1]) * ease(dt, 10);
      }
    }

    // The guide curve's parameters, on three timescales. Uses the same
    // smoothed signals as the original renderer (no extra smoothing).
    _guideStep(dt) {
      const G = GUIDE, t = this.t, sd = this.focus.seed, N = MB.noise3;
      const vol = this.vol ?? 0.3, mid = this.mid ?? 0.3, bass = this.bass ?? 0;
      const E = this.dims ? this.dims.energy : 0.3, T = this.tension || 0, lush = this.lush ?? 0.3;
      const k1 = (Math.PI * 2 * G.sweepCycles) / Math.max(1, this.asp);
      const g = (this.g = this.g || { ph: [rnd(0, 6), rnd(0, 6), 0], tw: rnd(0, 6) });
      // slow: the main sweep evolves and breathes
      g.ph[0] += dt * (G.sweepSpeed + G.sweepSpeedEnergy * E);
      g.A = [
        G.sweepAmp * (1 + 0.35 * N(t * 0.02, sd, 1)) + G.sweepAmpVol * vol,
        // medium: folds that travel along it, shaped by the midrange
        G.foldAmp + G.foldAmpMid * mid,
        // bass: a rolling swell through the whole composition
        G.rollAmp + G.rollAmpBass * bass,
      ];
      g.ph[1] += dt * (G.foldSpeed + G.foldSpeedMid * mid);
      g.ph[2] = this.bassPhase * G.rollSpeed;
      g.K = [k1, k1 * G.foldK, k1 * G.rollK];
      // medium: the travelling pinch where the ribbon narrows and turns over
      g.tw += dt * (G.pinchSpeed + G.pinchSpeedEnergy * E);
      g.Tw = [clamp(G.pinch + G.pinchTension * T, 0, 0.9), k1 * G.pinchK, g.tw];
      g.band = G.band + G.bandLush * lush + G.bandVol * vol;

      // ---- VARIETY (slow, continuous) ----
      const sn = (sp, z) => clamp(N(t * sp, sd * 1.3, z) * 2.6, -1, 1); // smooth, roughly -1..1
      // orientation: the whole composition turns slowly
      g.orient = G.orient * sn(G.orientSpeed, 31);
      this.ang += g.orient;
      // arched sweeps
      g.arch = G.arch * sn(G.archSpeed, 47);
      // scale: intimate .. expansive (energy opens it a little)
      g.scale = clamp(1 + G.scaleRange * sn(G.scaleSpeed, 59) + G.scaleEnergy * (E - 0.4), 0.5, 1.6);
      g.A = g.A.map((v) => v * g.scale);
      g.band *= Math.sqrt(g.scale);
      // curls: now and then the folds swell enough to overlap
      g.A[1] *= 1 + G.curl * Math.max(0, sn(G.curlSpeed, 73));
      // length of the gesture across the screen for its current orientation
      g.len = Math.abs(Math.cos(this.ang)) * this.asp + Math.abs(Math.sin(this.ang));
      g.K = g.K.map((k) => k * Math.max(1, this.asp) / Math.max(0.8, g.len));
    }
    _gY(x) { const g = this.g; return g.A[0] * Math.sin(g.K[0] * x + g.ph[0]) + g.A[1] * Math.sin(g.K[1] * x + g.ph[1]) + g.A[2] * Math.sin(g.K[2] * x + g.ph[2]); }
    _setGuide(P) {
      const gl = this.gl, g = this.g;
      gl.uniform1f(P.u.u_guide, this.guides && g ? 1 : 0);
      if (!this.guides || !g) return;
      gl.uniform3f(P.u.u_gA, g.A[0], g.A[1], g.A[2]);
      gl.uniform3f(P.u.u_gK, g.K[0], g.K[1], g.K[2]);
      gl.uniform3f(P.u.u_gPh, g.ph[0], g.ph[1], g.ph[2]);
      gl.uniform3f(P.u.u_gTw, g.Tw[0], g.Tw[1], g.Tw[2]);
      gl.uniform1f(P.u.u_gBand, g.band);
      gl.uniform1f(P.u.u_gPull, GUIDE.pull);
      gl.uniform1f(P.u.u_gWarp, GUIDE.warp);
      gl.uniform1f(P.u.u_gSwell, GUIDE.swell);
      gl.uniform1f(P.u.u_gArch, g.arch || 0);
      gl.uniform1f(P.u.u_gLen, g.len || this.asp);
      gl.uniform1f(P.u.u_gFine, GUIDE.fine);
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
          const sp = (this.spreadNow || 0.8) * 0.5;
          if (this.guides && this.g) {
            // guided: start on the gesture, so the wave travels through it
            const rx = rnd(-sp, sp) * this.asp, ry = this._gY(rx), ca = Math.cos(this.ang), sa = Math.sin(this.ang);
            this.ripples.push({ x: this.focus.x + ca * rx + sa * ry, y: this.focus.y - sa * rx + ca * ry, t: 0, a: amp });
          } else {
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
      if (this.guides) {
        this.ang *= GUIDE.wander;
        this._guideStep(dt);
      }
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
      let ta = finish(WARM_A.map((v, i) => v * twS + COOL_A[i] * (1 - twS)));
      let tb = finish(WARM_B.map((v, i) => v * twS + COOL_B[i] * (1 - twS)));
      const ink = this.R && this.R.palette === 'ink';
      if (ink) {
        // position on the ink ramp: harmony sets it, the key nudges it a
        // little; the second colour is the next one along (a neighbour)
        const pos = twS * 4 + (f.hueShift || 0) / 90;  // 0 petrol+storm .. 2 plum+cherry .. 4 copper+gold
        const inkMute = (c) => { const y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return c.map((v) => v + (y - v) * mute * 0.5); };
        ta = inkMute(inkRamp(pos));
        tb = inkMute(inkRamp(pos + 1));
        // the current chord moves the second colour along the same ramp
        // (major chords toward the warm end, minor toward the cool), farther
        // the farther the chord is from home: never off the palette
        if (!this.idle && f.chordId) {
          const dist = Math.min(k5, 12 - k5) / 6;
          tb = tb.map((v, i) => 0.6 * v + 0.4 * inkMute(inkRamp(pos + 1 + (f.chordQual ? 1 : -1) * (0.4 + 1.4 * dist)))[i]);
        }
      } else if (!this.idle && f.chordId) {
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

      // 1. simulate
      const [sIn, sOut] = this.state;
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sOut.fb);
      gl.viewport(0, 0, this.PW, this.PH);
      let P = this.pSim;
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
      gl.uniform1f(P.u.u_turb, (M.turb * (0.5 + 0.5 * mid) + 0.45 * tension) * (this.guides ? GUIDE.turb : 1)); // MOOD + TENSION: turbulence
      const FU = { // the field's shape, shared with the silk tangent pass
        u_time: this.evolveT ?? this.t, u_freq: (1.0 + 0.3 * mid) * M.curve,
        u_warp: (0.5 + 0.5 * mid + 0.25 * tension) * M.fold, u_deep: 0.06 + 0.32 * bass, u_deepPh: this.deepPh || 0,
        u_bassAmp: (0.04 + 0.2 * bass) * M.swell, u_bassPhase: this.bassPhase, u_ang: this.ang,
        u_cross: this.guides ? 0 : Math.min(0.6, M.cross + 0.3 * tension), u_crossAng: 1.05 + 0.4 * Math.sin(this.t * 0.02),
      };
      gl.uniform1f(P.u.u_deep, 0.06 + 0.32 * bass);              // LOW: deep currents displace the field
      gl.uniform1f(P.u.u_deepPh, this.deepPh || 0);
      gl.uniform1f(P.u.u_loosen, quiet);                         // SILENCE: lines loosen their hold
      const rip = new Float32Array(16);
      (this.ripples || []).slice(0, 4).forEach((r, i) => rip.set([r.x, r.y, r.t, r.a], i * 4));
      gl.uniform4fv(P.u.u_rip, rip);                             // PERCUSSION: ripples
      gl.uniform1f(P.u.u_strands, Math.max(2, M.strands));       // MOOD: filaments or silk
      // (guided: no independent crossing currents)
      gl.uniform1f(P.u.u_cross, this.guides ? 0 : Math.min(0.6, M.cross + 0.3 * tension)); // MOOD + TENSION: intersecting currents
      gl.uniform1f(P.u.u_crossAng, 1.05 + 0.4 * Math.sin(this.t * 0.02));
      gl.uniform2f(P.u.u_seedOff, (this.seedOff || [0, 0])[0], (this.seedOff || [0, 0])[1]);
      this.spreadNow = (0.5 + 0.35 * lush + 0.35 * vol) * M.spread * (1 - 0.2 * (this.quietAmt || 0)) * (this.guides && this.g ? this.g.scale : 1); // INTENSITY + MOOD (+ VARIETY scale): expansion
      gl.uniform1f(P.u.u_spread, this.spreadNow);                // FULLNESS: how far it spreads
      gl.uniform1f(P.u.u_bassAmp, (0.04 + 0.2 * bass) * M.swell); // LOW + MOOD: a slow swell
      gl.uniform1f(P.u.u_bassPhase, this.bassPhase);
      gl.uniform2f(P.u.u_center, this.focus.x, this.focus.y);
      gl.uniform1f(P.u.u_ang, this.ang);
      gl.uniform1f(P.u.u_irid, this.guides ? GUIDE.irid : 0);
      this._setGuide(P);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.state = [sOut, sIn];
      if (this.silk) {
        // 1s. silk: the wave line's direction and bend at every particle
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.tan.fb);
        P = this.pTan;
        gl.useProgram(P.p);
        gl.bindTexture(gl.TEXTURE_2D, sOut.tex);
        gl.uniform1i(P.u.u_state, 0);
        for (const k in FU) gl.uniform1f(P.u[k], FU[k]);
        gl.uniform2f(P.u.u_center, this.focus.x, this.focus.y);
        gl.uniform2f(P.u.u_seedOff, (this.seedOff || [0, 0])[0], (this.seedOff || [0, 0])[1]);
        this._setGuide(P);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
      const R = this.R;
      const trailTau = (R.trailBase + R.trailVol * vol) * M.trail;
      // (the previous trail length, used only to keep overall light level)
      const baseTau = (0.18 + 0.45 * vol) * M.trail;
      gl.uniform1f(P.u.u_keep, Math.exp(-dt / trailTau));  // MOOD: soft or sharp
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.vao);
      // SILK: the original points stay as they are; the silk arcs are a
      // second, gentler layer of the same particles drawn on top of them
      for (const isSeg of this.silk ? [false, true] : [false]) {
      if (isSeg) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.arcs.fb);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      P = isSeg ? this.pSeg : this.pPts;
      gl.useProgram(P.p);
      gl.bindTexture(gl.TEXTURE_2D, this.state[0].tex);
      gl.uniform1i(P.u.u_state, 0);
      if (isSeg) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.tan.tex);
        gl.uniform1i(P.u.u_tan, 1);
        gl.uniform1f(P.u.u_len, R.len);
        gl.uniform1f(P.u.u_arcFocus, R.arcFocus);
        gl.uniform1f(P.u.u_dust, (0.1 + 0.2 * high + 0.35 * quiet) * M.dust);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(P.u.u_res, lOut.w, lOut.h);
        gl.uniform1f(P.u.u_lineW, SILK.lineW * this.dpr);
      }
      gl.uniform1i(P.u.u_w, this.PW);
      gl.uniform1f(P.u.u_spread, this.spreadNow);
      gl.uniform2f(P.u.u_center, this.focus.x, this.focus.y);
      gl.uniform1f(P.u.u_asp, this.asp);
      gl.uniform1f(P.u.u_ang, this.ang);
      gl.uniform1f(P.u.u_irid, this.guides ? GUIDE.irid : 0);
      this._setGuide(P);
      gl.uniform1f(P.u.u_mat, isSeg ? 1 : 0);
      gl.uniform4f(P.u.u_rib1, this.guides ? R.ribbon : 0, R.asym, R.widthVar, R.edgeSoft);
      gl.uniform4f(P.u.u_rib2, R.falloff, R.densityVar, R.dissolve, R.twist);
      gl.uniform1f(P.u.u_ribGain, R.gain);
      gl.uniform4f(P.u.u_rib3, R.channels, R.channelScale, R.layers, R.clarity);
      gl.uniform1f(P.u.u_strands, Math.max(2, M.strands));
      gl.uniform1f(P.u.u_cross, this.guides ? 0 : Math.min(0.6, M.cross + 0.3 * tension));
      gl.uniform1f(P.u.u_size, 2.4 * this.dpr);                 // thicker lines
      gl.uniform3fv(P.u.u_colA, this.colA);
      gl.uniform3fv(P.u.u_colB, this.colB);
      gl.uniform3fv(P.u.u_colAcc, this.colAcc || [1, 1, 1]);
      gl.uniform1f(P.u.u_visible, M.visible * (1 - 0.8 * quiet)); // MOOD + SILENCE: strands dissolve
      gl.uniform1f(P.u.u_shimmer, this.idle ? 0.1 : 0.6 * high * (0.4 + 0.6 * (this.lumin ?? 0.2))); // HIGH: surface shimmer
      gl.uniform1f(P.u.u_time, this.t);
      gl.uniform1f(P.u.u_lumin, this.lumin ?? 0.2);
      gl.uniform1f(P.u.u_accent, M.accent * (0.15 + 0.85 * acc) * (this.idle ? 0 : 1)); // MOOD: luminous accents
      // brightness per particle: louder is brighter; fewer particles each brighter
      const per = (98304 / (this.PW * this.PH)) * (this.idle ? 0.006 : 0.0085 + 0.013 * vol);
      // MOOD: luminosity (sparser moods draw fewer particles, each a touch brighter)
      // shorter trails hold less light; brighten the particles to make up
      // for it (by R.comp) rather than letting their trajectories linger
      const comp = Math.pow(baseTau / Math.max(1e-3, trailTau), R.comp);
      gl.uniform1f(P.u.u_bright, comp * per * dt * 60 * M.light / Math.sqrt(Math.max(0.3, M.visible)));
      if (isSeg) {
        // lines deposit light once per pass, not once per frame
        // (no trails here, so each arc carries what a trail would have built up)
        gl.uniform1f(P.u.u_bright, R.silkBright * per * baseTau * 60 * M.light / Math.sqrt(Math.max(0.3, M.visible)));
        const stride = Math.max(1, Math.round(R.stride));
        gl.uniform1i(P.u.u_stride, stride);
        if (R.silkBright > 0) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 18, Math.floor(this.PW * this.PH / stride));
      } else gl.drawArrays(gl.POINTS, 0, this.PW * this.PH);
      }
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
      if (this.silk) {
        // 2d. the atmospheric veil source: all the light, very low resolution
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.veil.fb);
        gl.viewport(0, 0, this.veil.w, this.veil.h);
        gl.uniform2f(P.u.u_px, 1 / this.veil.w, 1 / this.veil.h);
        gl.uniform1f(P.u.u_thresh, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

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
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.veil.tex);
      gl.uniform1i(P.u.u_veil, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.arcs.tex);
      gl.uniform1i(P.u.u_arcs, 3);
      gl.uniform2f(P.u.u_vpx, 1 / this.veil.w, 1 / this.veil.h);
      gl.uniform1f(P.u.u_veilAmt, this.silk ? R.veil * (0.7 + 0.6 * (this.lumin ?? 0.2)) : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(P.u.u_res, this.c.width, this.c.height);
      gl.uniform2f(P.u.u_gpx, 1 / this.glow.w, 1 / this.glow.h);
      gl.uniform1f(P.u.u_time, this.t);
      const lum2 = this.lumin ?? 0.2;
      gl.uniform1f(P.u.u_lumin, lum2);
      gl.uniform1f(P.u.u_glowAmt, (0.15 + 0.55 * lum2) * R.glow);
      gl.uniform1f(P.u.u_trailAmt, R.trailOpacity);
      gl.uniform1f(P.u.u_compress, R.compress);
      gl.uniform1f(P.u.u_sat, R.saturation);
      gl.uniform1f(P.u.u_yshift, R.yellowShift);
      gl.uniform1f(P.u.u_toe, R.toe);
      gl.uniform1f(P.u.u_lc, R.localContrast);
      gl.uniform1f(P.u.u_halation, R.halation);
      gl.uniform1f(P.u.u_split, R.splitTone);
      gl.uniform1f(P.u.u_drift, R.colourDrift);
      gl.uniform1f(P.u.u_grain, R.grain);
      gl.uniform1f(P.u.u_arcOn, this.silk && R.silkBright > 0 ? 1 : 0);
      const ly = LAYERS[this.layer];
      gl.uniform4f(P.u.u_show, ly === 'all' || ly === 'trails' ? 1 : 0, ly === 'all' || ly === 'arcs' ? 1 : 0,
        ly === 'all' || ly === 'veil' ? 1 : 0, ly === 'all' || ly === 'glow' ? 1 : 0);
      // quiet passages sit lower; intense ones open up
      gl.uniform1f(P.u.u_exposure, 0.95 + 0.75 * lum2);
      const tint = this.colA.map((v) => v * 0.02);
      gl.uniform3fv(P.u.u_base, this.R.palette === 'ink' ? INK_GROUND.map((v, i) => v * 0.8 + tint[i] * 0.5) : [0.03 + tint[0], 0.03 + tint[1], 0.04 + tint[2]]);
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
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 4. stars on top, one small point each, faded behind bright light
      if (ns) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.vao);
        const PS = this.pStar;
        gl.useProgram(PS.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lOut.tex);
        gl.uniform1i(PS.u.u_light, 0);
        gl.uniform2f(PS.u.u_res, this.c.width, this.c.height);
        gl.uniform1f(PS.u.u_exposure, 0.95 + 0.75 * lum2);
        gl.uniform4fv(PS.u.u_stars, sa);
        gl.drawArrays(gl.POINTS, 0, ns);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
      }
    }

    _flag(text) {
      let tag = document.getElementById('render-tag');
      if (!tag) {
        tag = document.createElement('p');
        tag.id = 'render-tag';
        tag.style.cssText = 'position:fixed;top:36px;right:20px;margin:0;font-size:15px;color:var(--ink-soft);transition:opacity .8s;pointer-events:none';
        document.body.appendChild(tag);
      }
      tag.textContent = text;
      tag.style.opacity = 1;
      clearTimeout(tag._t);
      tag._t = setTimeout(() => { tag.style.opacity = 0; }, 1600);
    }

    // ?dev: a small panel of sliders for the rendering controls above
    _devPanel() {
      const R = this.R;
      const specs = [
        ['trailBase', 0, 1, 0.01], ['trailVol', 0, 1.2, 0.01], ['trailOpacity', 0, 1.5, 0.05], ['comp', 0, 1, 0.05],
        ['silkBright', 0, 3, 0.02], ['stride', 1, 12, 1], ['len', 0.02, 0.25, 0.01], ['veil', 0, 2, 0.05], ['glow', 0, 3, 0.05],
        ['ribbon', 0, 1, 0.05], ['asym', 0, 1, 0.05], ['widthVar', 0, 1, 0.05], ['edgeSoft', 0.03, 1, 0.01],
        ['falloff', 0.5, 4, 0.1], ['densityVar', 0, 1, 0.05], ['dissolve', 0, 0.8, 0.02], ['twist', 0, 2.5, 0.05], ['gain', 0.5, 4, 0.05],
        ['channels', 0, 1, 0.05], ['channelScale', 0.5, 5, 0.1], ['layers', 0, 1.5, 0.05], ['clarity', 0, 1, 0.05], ['compress', 0, 1.5, 0.05], ['saturation', 0.5, 2.5, 0.05], ['yellowShift', 0, 1.2, 0.05],
        ['arcFocus', 0, 1, 0.05], ['toe', 0, 0.9, 0.05], ['localContrast', 0, 1, 0.05], ['halation', 0, 1.5, 0.05],
        ['splitTone', 0, 1, 0.05], ['colourDrift', 0, 1, 0.05], ['grain', 0, 1.5, 0.05],
      ];
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;top:12px;left:12px;z-index:9;padding:10px 12px;background:rgba(10,10,16,.8);color:#ddd;font:12px Inter,system-ui,sans-serif;border-radius:6px;line-height:1.9';
      const inputs = {};
      for (const [k, lo, hi, st] of specs) {
        const row = document.createElement('label');
        row.style.cssText = 'display:grid;grid-template-columns:88px 120px 40px;gap:6px;align-items:center';
        const inp = document.createElement('input');
        Object.assign(inp, { type: 'range', min: lo, max: hi, step: st, value: R[k] });
        const val = document.createElement('span');
        val.textContent = R[k];
        inp.addEventListener('input', () => { R[k] = +inp.value; val.textContent = inp.value; });
        row.append(k, inp, val);
        box.append(row);
        inputs[k] = [inp, val];
      }
      const sel = document.createElement('select');
      LAYERS.forEach((n, i) => sel.add(new Option('view: ' + n, i)));
      sel.addEventListener('change', () => { this.layer = +sel.value; });
      const pre = document.createElement('select');
      Object.keys(RENDER_PRESETS).forEach((n) => pre.add(new Option('preset: ' + n, n)));
      pre.value = Object.keys(RENDER_PRESETS).find((n) => ['trailBase', 'veil', 'ribbon', 'layers', 'saturation', 'toe', 'palette'].every((k) => RENDER_PRESETS[n][k] === R[k])) || DEFAULT_PRESET;
      pre.addEventListener('change', () => { Object.assign(R, RENDER_PRESETS[pre.value]); this._devSync(); });
      box.append(sel, document.createElement('br'), pre);
      this._devSync = () => {
        sel.value = this.layer;
        for (const k in inputs) { inputs[k][0].value = R[k]; inputs[k][1].textContent = R[k]; }
      };
      document.body.appendChild(box);
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

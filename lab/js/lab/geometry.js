// BLOOM LAB · GEOMETRY: deformable sheets of light
// A formation is a continuous surface, parameterised by s (0..1 along it)
// and v (-1..1 across it). Along its length:
//   a spine     bends (curvature), turns sharply in places (folding), and
//               stretches or compresses;
//   a width     that swells into broad planes or fans and narrows to threads;
//   a twist     that turns the cross-section toward or away from the viewer
//               (edge-on it collapses into a concentrated line of light);
//   a curl      that bends the cross-section into an arc (folds over itself
//               where it turns away);
//   a skew      that tilts the cross-section, so it fans out obliquely.
// Every quantity comes from slow, coherent noise along s and in time, so
// different regions deform differently while the whole stays continuous.
// The result is K samples per formation, packed into a float texture.
(function () {
  const MB = (window.MB = window.MB || {});
  const K = 48;        // samples along a formation
  const M = 16;        // vertices across
  const MAXF = 4;      // formations at most
  const N = (x, y, z) => MB.noise3(x, y, z); // about -0.7..0.7

  // F: { seed, x, y, heading, len, w, fan, depthBias }, P: shape parameters,
  // t: this formation's deformation time. Writes 8 floats per sample.
  function buildFormation(out, row, F, P, t) {
    const s0 = F.seed, xs = new Float32Array(K), ys = new Float32Array(K), hs = new Float32Array(K);
    const mid = Math.floor(K / 2);
    const dl = F.len / (K - 1);
    // turning rate along the spine: smooth bending plus sparse, sharper folds
    const turn = (s) => {
      const bend = P.curvature * 4.5 * N(s0 + s * 1.3, t * 0.55, 0.5);
      const f = N(s0 + 20 + s * 2.4, t * 0.75, 1.5);
      return bend + P.fold * 18 * f * Math.abs(f);
    };
    // local stretch: some regions extend, others compress
    const stretch = (s) => 0.55 + 0.9 * (0.5 + N(s0 + 30 + s * 1.7, t * 0.5, 2.5));
    xs[mid] = F.x; ys[mid] = F.y; hs[mid] = F.heading;
    for (let k = mid + 1; k < K; k++) {
      const s = k / (K - 1), d = dl * stretch(s);
      hs[k] = hs[k - 1] + turn(s) * d;
      xs[k] = xs[k - 1] + Math.cos(hs[k]) * d;
      ys[k] = ys[k - 1] + Math.sin(hs[k]) * d;
    }
    for (let k = mid - 1; k >= 0; k--) {
      const s = k / (K - 1), d = dl * stretch(s);
      hs[k] = hs[k + 1] - turn(s) * d;
      xs[k] = xs[k + 1] - Math.cos(hs[k]) * d;
      ys[k] = ys[k + 1] - Math.sin(hs[k]) * d;
    }
    for (let k = 0; k < K; k++) {
      const s = k / (K - 1);
      // width: swelling and narrowing, plus a fan that opens toward one end
      const swell = Math.max(0.06, 1 + P.widthVar * 1.7 * N(s0 + 40 + s * 1.6, t * 0.6, 3.5));
      const fan = Math.exp(P.widthVar * F.fan * (s - 0.5) * 2.4 * (0.6 + N(s0 + 45, t * 0.2, 4.5)));
      const w = F.w * P.scale * swell * fan;
      // twist (apparent depth): the sheet turns toward and away from view
      const twist = F.twist0 + P.depth * 2.4 * N(s0 + 50 + s * 1.15, t * 0.45, 5.5);
      // curl: the cross-section bends into an arc
      const curl = P.fold * 1.6 * N(s0 + 60 + s * 1.4, t * 0.6, 6.5);
      // skew: the cross-section tilts, so it fans obliquely
      const skew = P.curvature * 0.7 * N(s0 + 70 + s * 0.9, t * 0.35, 7.5);
      // edge definition and light vary along the body
      const soft = 0.12 + 0.55 * (0.5 + N(s0 + 80 + s * 1.7, t * 0.5, 8.5)) + F.depthBias * 0.35;
      const lum = 0.45 + 0.9 * (0.5 + N(s0 + 90 + s * 1.2, t * 0.4, 9.5));
      const o = (row * K + k) * 8;
      out[o] = xs[k]; out[o + 1] = ys[k]; out[o + 2] = hs[k] + Math.PI / 2 + skew; out[o + 3] = w;
      out[o + 4] = twist; out[o + 5] = curl; out[o + 6] = Math.min(1, soft); out[o + 7] = lum;
    }
  }

  MB.LabGeometry = { K, M, MAXF, buildFormation };
})();

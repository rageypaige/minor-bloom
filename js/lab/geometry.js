// BLOOM LAB · GEOMETRY
// A formation is a spine: a smooth curve through a few control points, each
// with a position, a width and an edge value (which side of the body catches
// the light, -1..1; 0 = neither). The spine is sampled into NS segments for
// the shader, which measures every pixel against it.
(function () {
  const MB = (window.MB = window.MB || {});
  const NS = 32; // segments per formation (NS + 1 samples)

  // centripetal-ish Catmull-Rom through the control points (ends repeated)
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // ctrl: [{x, y, w, e}], out: Float32Array, at: start index (in vec4s)
  function sampleSpine(ctrl, out, at) {
    const m = ctrl.length;
    const P = (i) => ctrl[Math.max(0, Math.min(m - 1, i))];
    for (let j = 0; j <= NS; j++) {
      const u = (j / NS) * (m - 1);
      const i = Math.min(m - 2, Math.floor(u)), t = u - i;
      const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
      const o = (at + j) * 4;
      out[o] = catmull(a.x, b.x, c.x, d.x, t);
      out[o + 1] = catmull(a.y, b.y, c.y, d.y, t);
      out[o + 2] = Math.max(0.002, catmull(a.w, b.w, c.w, d.w, t));
      out[o + 3] = Math.max(-1, Math.min(1, catmull(a.e, b.e, c.e, d.e, t)));
    }
  }

  MB.LabGeometry = { NS, sampleSpine };
})();

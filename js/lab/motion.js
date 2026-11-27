// BLOOM LAB · MOVEMENT AND COMPOSITION
// A clear hierarchy: one dominant formation in front, and up to three
// secondary ones, smaller, dimmer, softer-edged and further back, placed
// toward the edges so they are partly concealed. Each formation has its own
// deformation clock (so regions keep transforming at different paces) and
// its placement and orientation drift slowly. Shape parameters (the ?dev
// sliders) live here too.
(function () {
  const MB = (window.MB = window.MB || {});
  const N = (x, y, z) => MB.noise3(x, y, z);

  // x across (-1..1 of the half width), y (-0.5 bottom .. 0.5 top)
  const LAYOUT = [
    // dominant: large, low centre-left, sweeping up to the right
    { x: -0.12, y: -0.04, heading: 0.35, len: 2.0, w: 0.17, fan: 1, bright: 1, depth: 0, rate: 1 },
    // secondary: upper right, angled down
    { x: 0.55, y: 0.26, heading: -0.6, len: 1.2, w: 0.1,  fan: -1, bright: 0.55, depth: 0.45, rate: 1.3 },
    // background veil, upper left, partly off-screen
    { x: -0.78, y: 0.34, heading: -0.15, len: 1.3, w: 0.14, fan: 1, bright: 0.38, depth: 0.7, rate: 0.8 },
    // low accent, partly off the bottom
    { x: 0.35, y: -0.44, heading: 0.1, len: 0.8, w: 0.05, fan: -1, bright: 0.32, depth: 0.85, rate: 1.6 },
  ];

  class LabMotion {
    constructor(asp) {
      this.asp = asp;
      const seed = Math.random() * 50;
      this.forms = LAYOUT.map((L, f) => ({ L, seed: seed + f * 17.3, t: Math.random() * 40, depth: L.depth, bright: L.bright }));
      this.T = 0;
      // the development parameters
      this.p = {
        count: 3,        // formations shown (1..4)
        curvature: 0.6,  // how much the spines bend (and the sheets skew)
        fold: 0.75,      // sharp folds along the spine, and curl across it
        widthVar: 0.95,  // swelling, narrowing and fanning of the width
        orient: 0,       // turns the whole composition (radians)
        scale: 1,        // spatial scale of the formations
        depth: 1.15,     // how far the sheets twist toward and away from view
        speed: 1,        // deformation speed
      };
    }

    step(dt, input) {
      const P = this.p;
      const pace = P.speed * (0.45 + 0.55 * (input.variation ?? 0.5) + 0.3 * (input.energy ?? 0.5));
      this.T += dt * pace;
      const ax = this.asp * 0.5;
      for (const F of this.forms) {
        const L = F.L;
        F.t += dt * pace * 0.09 * L.rate;
        // placement and orientation drift slowly around the layout
        F.x = (L.x + 0.08 * N(F.seed, this.T * 0.02, 0)) * ax;
        F.y = L.y + 0.06 * N(F.seed + 3, this.T * 0.02, 1);
        F.heading = L.heading + P.orient + 0.35 * N(F.seed + 6, this.T * 0.015, 2);
        F.len = L.len * P.scale * (0.85 + 0.3 * (input.energy ?? 0.5));
        F.w = L.w;
        F.fan = L.fan;
        F.twist0 = 0.3 * L.fan;
        F.depthBias = L.depth;
      }
    }

    get active() { return this.forms.slice(0, Math.max(1, Math.min(this.forms.length, Math.round(this.p.count)))); }
  }

  MB.LabMotion = LabMotion;
})();

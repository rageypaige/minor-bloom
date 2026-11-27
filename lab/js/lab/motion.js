// BLOOM LAB · MOVEMENT
// Each formation has a resting layout (an asymmetric composition) and its
// control points drift around it on slow, smooth noise, each formation at
// its own pace. Widths swell and narrow, and the lit edge moves gradually
// from side to side. Formations push each other's control points apart when
// they come close, so the spaces between them keep shifting without the
// bodies merging. Inputs (energy, tension, variation) scale the movement.
(function () {
  const MB = (window.MB = window.MB || {});
  const N = (x, y, z) => MB.noise3(x, y, z); // about -0.7..0.7

  // resting layouts in screen units: x across (-1..1 of the half width),
  // y from -0.5 (bottom) to 0.5 (top); w is the half width of the body
  const LAYOUTS = [
    // a large, low sweep rising to the right
    { pts: [[-0.98, -0.18], [-0.62, -0.28], [-0.25, -0.24], [0.08, -0.1], [0.36, 0.06], [0.58, 0.26]], w: 0.1, speed: 1, depth: 0.25 },
    // a narrower arc crossing over it from the upper left
    { pts: [[0.05, 0.34], [0.3, 0.3], [0.52, 0.16], [0.62, -0.04], [0.6, -0.24], [0.48, -0.38]], w: 0.06, speed: 1.35, depth: 0.55 },
    // a small accent, low right
    { pts: [[-0.62, 0.3], [-0.48, 0.36], [-0.32, 0.33], [-0.2, 0.38]], w: 0.025, speed: 1.8, depth: 0.8 },
  ];

  class LabMotion {
    constructor(asp) {
      this.t = Math.random() * 100;
      this.asp = asp;
      this.seed = Math.random() * 50;
      this.forms = LAYOUTS.map((L, f) => ({
        depth: L.depth,
        ctrl: L.pts.map(() => ({ x: 0, y: 0, w: L.w, e: 0 })),
        L,
        seed: this.seed + f * 13.7,
      }));
      this.p = { drift: 1, swell: 1, repel: 1, pace: 1 };
    }

    step(dt, input) {
      const p = this.p;
      // the music's variation and energy set the pace (slowly)
      this.t += dt * p.pace * (0.5 + 0.6 * (input.variation ?? 0.5) + 0.4 * (input.energy ?? 0.5));
      const t = this.t, ax = this.asp * 0.5;
      const amp = (0.13 + 0.1 * (input.tension ?? 0.3)) * p.drift;
      for (const F of this.forms) {
        const L = F.L, s = F.seed, ts = t * 0.045 * L.speed;
        const m = L.pts.length;
        F.ctrl.forEach((c, i) => {
          const [bx, by] = L.pts[i];
          // drift: low-frequency displacement, larger toward the free ends
          const free = 0.6 + 0.4 * Math.abs(i / (m - 1) - 0.5) * 2;
          c.x = bx * ax + amp * free * 1.6 * N(ts + i * 0.35, s, 0.3);
          c.y = by + amp * free * N(s + 7.1, ts + i * 0.35, 1.7);
          // width: swells and narrows along the body and over time; the
          // ends taper to fine points
          const end = i === 0 || i === m - 1 ? 0.15 : 1;
          const sw = 0.55 + 0.9 * (0.5 + N(ts * 0.8 + i * 0.6, s, 4.4));
          c.w = L.w * end * Math.max(0.15, sw) * (0.75 + 0.5 * (input.energy ?? 0.5)) * p.swell;
          // the lit edge moves gradually from one side to the other
          c.e = Math.max(-1, Math.min(1, 1.8 * N(ts * 0.6 + i * 0.45, s, 9.9)));
        });
      }
      // interactions: control points of different formations push apart
      // softly when they come close
      const R = 0.16 * p.repel;
      for (let a = 0; a < this.forms.length; a++) {
        for (let b = 0; b < this.forms.length; b++) {
          if (a === b) continue;
          const A = this.forms[a], B = this.forms[b];
          for (const c of A.ctrl) {
            for (const o of B.ctrl) {
              const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy);
              if (d > 1e-4 && d < R) {
                // the shallower formation gives way more
                const k = (R - d) / R * 0.5 * (A.depth > B.depth ? 0.7 : 0.3);
                c.x += (dx / d) * k * R;
                c.y += (dy / d) * k * R;
              }
            }
          }
        }
      }
    }
  }

  MB.LabMotion = LabMotion;
})();

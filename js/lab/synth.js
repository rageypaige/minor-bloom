// BLOOM LAB · SYNTHETIC INPUT
// Stands in for the music while the visual system is developed. It produces
// the same kind of values as js/music.js (six slow dimensions, a luminosity
// driver and a colour position on the ink palette), from slow, smooth
// curves. Any value can be pinned from the ?dev panel.
(function () {
  const MB = (window.MB = window.MB || {});
  const n = (x, y) => MB.noise3(x, y, 4.2); // about -0.7..0.7

  class LabSynth {
    constructor() {
      this.t = 0;
      this.pin = {}; // name -> value (0..1), set from the dev panel
      this.v = {};
      this.update(0);
    }

    update(dt) {
      const t = (this.t += dt);
      const c = (x) => Math.max(0, Math.min(1, x));
      const auto = {
        // energy swells over ~40 s phrases with smaller wandering on top
        energy: c(0.5 + 0.3 * Math.sin(t * 0.16) + 0.35 * n(t * 0.05, 1)),
        // harmony sweeps slowly across the whole palette (minor .. major)
        harm: c(0.5 + 0.48 * Math.sin(t * 0.035 + 1)),
        tension: c(0.3 + 0.5 * n(t * 0.04, 2)),
        texture: c(0.5 + 0.5 * n(t * 0.03, 3)),
        variation: c(0.4 + 0.5 * n(t * 0.05, 5)),
        rhythm: c(0.4 + 0.5 * n(t * 0.07, 6)),
      };
      for (const k in auto) this.v[k] = this.pin[k] ?? auto[k];
      const v = this.v;
      v.lumin = c(0.15 + 0.7 * v.energy * (0.6 + 0.4 * v.texture));
      // palette position, as in music.js (0 petrol+storm .. 4 copper+gold)
      const tw = c((v.harm - 0.25) / 0.5);
      v.palettePos = tw * tw * (3 - 2 * tw) * 4;
      return v;
    }
  }

  MB.LabSynth = LabSynth;
})();

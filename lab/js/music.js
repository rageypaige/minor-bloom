// The music, interpreted: everything a visual needs to know about the song,
// separate from how it is drawn. (Moved unchanged from the earlier
// particle-waves renderer, so any new visual responds the same way.)
//
// Each frame, update(f, dt) takes the listener's raw analysis `f` and keeps:
//   layers      vol, bass, mid, high (each with its own attack and decay),
//               drive (how driven / percussive), lush (fullness), bpm,
//               tension, quietAmt (builds up in silence), acc (beat accents)
//   beats       this.beats: recent percussive hits worth showing
//               ({ t: seconds since, strength 0..1 }), already judged against
//               the song's own typical hits and its rhythmic activity
//   dims        six sustained dimensions, 0..1, smoothed over seconds, 30%
//               the song's own running average (its fingerprint):
//                 harm      harmonic character (minor .. major, dark .. bright)
//                 energy    loudness against the song, drive, fullness
//                 rhythm    how often notes strike, how driven
//                 tension   poor chord fit, chords far from home
//                 texture   how full and layered
//                 variation how much the music is changing
//   lumin       overall luminosity driver (quiet music stays restrained)
//   colA, colB  the current colour pair from the ink palette (see below)
//   colAcc      a lighter shade within the same family
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

  // INK palette (Paige's): a ramp from cool to warm. Minor-leaning harmony
  // sits at petrol ink and storm blue, in-between at bruised plum and black
  // cherry, major-leaning at copper rose and tarnished gold. The swatches are
  // muted, dark colours; as light they are lifted part of the way toward full
  // brightness (the darker ones less), keeping their hue.
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lift = (c) => { const k = Math.pow(0.92 / Math.max(...c), 0.6); return c.map((v) => Math.min(1, v * k)); };
  const INK_HEX = ['#284F5B', '#526B86', '#70516D', '#8E475B', '#B7796B', '#B59A66'];
  //               petrol ink storm blue bruised plum black cherry copper rose tarnished gold
  const INK = INK_HEX.map((h) => lift(hex(h)));
  const INK_GROUND = hex('#111016'); // aubergine charcoal
  const inkRamp = (p) => {
    p = Math.max(0, Math.min(INK.length - 1, p));
    const i = Math.min(INK.length - 2, Math.floor(p)), t = p - i;
    return INK[i].map((v, k) => v + (INK[i + 1][k] - v) * t);
  };
  MB.INK = { hex: INK_HEX, colours: INK, ground: INK_GROUND, ramp: inkRamp };

  class Music {
    constructor() { this.reset(); }

    reset() {
      this.t = 0;
      this.dims = null;
      this.songD = null;
      this.songT = 0;
      this.beats = [];
      this.colA = inkRamp(1.5);
      this.colB = inkRamp(2.5);
      this.colAcc = this.colB;
      this.lumin = 0.2;
    }

    update(f, dt) {
      this.idle = !!f.idle;
      this.t += dt;
      const on = !f.silent;
      const follow = (key, x, up, down) => {
        const cur = this[key] ?? x;
        this[key] = cur + (x - cur) * ease(dt, x > cur ? up : down);
        return this[key];
      };
      // THE MUSICAL LAYERS. Each signal has its own attack and decay. The
      // band and loudness inputs are already measured against each track's
      // own sustained levels (see listener.js).
      follow('vol', on ? (f.level ?? f.energy ?? 0.3) : 0, 0.9, 2.5);   // dynamic intensity
      follow('bass', on ? (f.bass ?? 0) : 0, 0.6, 3);                   // deep, slow
      follow('mid', on ? (f.mid ?? 0.3) : 0, 0.5, 1.6);                 // form, expressive movement
      follow('high', on ? (f.high ?? 0) : 0, 0.15, 0.7);                // fleeting surface detail
      // HARMONIC TENSION, only where it can be read reliably: the harmony
      // fits a triad poorly, or the chord sits far from the key on the circle
      // of fifths; confidence fades when the music is quiet or thin
      const fitT = clamp((0.78 - (f.triadFit ?? 0.86)) / 0.38);
      const k5 = ((((f.chordRoot ?? 0) - (f.tonic ?? 0)) * 7) % 12 + 12) % 12;
      this.chordDist = Math.min(k5, 12 - k5) / 6; // 0 home .. 1 farthest
      const farT = clamp((Math.min(k5, 12 - k5) - 1.5) / 3);
      const conf = on ? clamp((f.mid ?? 0) * 2) : 0;
      follow('tension', this.idle ? 0 : (0.7 * fitT + 0.3 * farT) * conf, 2, 3);
      // SILENCE: builds over a few seconds of quiet, clears quickly
      const hush = f.silent ? 1 : clamp(1 - (f.level ?? 0.5) * 3.5);
      follow('quietAmt', this.idle ? 0 : hush, 3, 0.6);
      // drive: how much high-frequency percussive energy there is (drums)
      const hiN = clamp((Math.log10(((f.dbg && f.dbg.hi) || 0) + 1e-9) + 5) / 2.7);
      this.drive = (this.drive ?? 0.5) + (hiN - (this.drive ?? 0.5)) * ease(dt, 3);
      const lushRaw = (f.lush || 0) * (0.35 + 0.65 * this.drive);
      this.lush = (this.lush ?? lushRaw) + (lushRaw - (this.lush ?? lushRaw)) * ease(dt, 2.5);
      this.bpm = (this.bpm ?? f.bpm ?? 90) + ((f.bpm || 90) - (this.bpm ?? 90)) * ease(dt, 6);

      this._dims(f, dt);

      // PERCUSSION: hits judged against this song's own typical hits and
      // scaled by rhythmic activity, so drums register clearly and a piano
      // barely does
      this.beats = this.beats.filter((b) => (b.t += dt) < 4);
      if (f.beat && on && !this.idle) {
        const bs = f.beatStrength || 0.3;
        this.beatAvg = (this.beatAvg ?? bs) + (bs - (this.beatAvg ?? bs)) * 0.08;
        const rel = clamp(bs / Math.max(0.15, this.beatAvg * 1.6));
        const R = this.dims.rhythm;
        if (rel > 0.85 - 0.45 * R && (this.beatCool || 0) <= 0 && this.beats.length < 4) {
          this.beats.push({ t: 0, strength: rel * (0.12 + 0.88 * R) });
          this.beatCool = 0.25 + 2.5 * (1 - R) * (1 - R);
        }
        this.acc = Math.max(this.acc || 0, f.beatStrength || 0.5);
      }
      this.beatCool = (this.beatCool || 0) - dt;
      this.acc = (this.acc || 0) * Math.exp(-dt / 0.35);

      // LUMINOSITY: energy and fullness light it up; quiet music stays restrained
      const Dm = this.dims;
      const lumRaw = this.idle ? 0.15 : clamp(0.6 * Dm.energy * (0.4 + 0.6 * this.vol) + 0.25 * Dm.texture * this.vol + 0.15 * Dm.rhythm * Dm.energy);
      this.lumin += (lumRaw - this.lumin) * ease(dt, lumRaw > this.lumin ? 1.5 : 4);

      // COLOUR: position on the ink ramp from harmonic character, nudged a
      // little by the key; the second colour is the next one along, and the
      // current chord moves it along the same ramp (major chords warmer, minor
      // cooler, farther the farther from home). Low energy mutes it slightly.
      const tw = clamp((Dm.harm - 0.25) / 0.5);
      const twS = tw * tw * (3 - 2 * tw);
      const mute = (0.22 - 0.16 * Dm.energy) * 0.5;
      const muted = (c) => { const y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return c.map((v) => v + (y - v) * mute); };
      const pos = twS * 4 + (f.hueShift || 0) / 90;
      this.palettePos = pos;
      const ta = muted(inkRamp(pos));
      let tb = muted(inkRamp(pos + 1));
      if (!this.idle && f.chordId) {
        const tc = muted(inkRamp(pos + 1 + (f.chordQual ? 1 : -1) * (0.4 + 1.4 * this.chordDist)));
        tb = tb.map((v, i) => 0.6 * v + 0.4 * tc[i]);
      }
      this.colAcc = tb.map((v) => Math.min(1, v * 1.15 + 0.08));
      this.colA = this.colA.map((v, i) => v + (ta[i] - v) * ease(dt, 5));
      this.colB = this.colB.map((v, i) => v + (tb[i] - v) * ease(dt, 3));
    }

    // Read the music along six independent, continuous dimensions.
    _dims(f, dt) {
      const on = !f.silent;
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
      // HARMONIC CHARACTER: tonal temperature, from major/minor and brightness
      const harm = clamp(0.5 + 0.55 * ((f.mode ?? 0.5) - 0.5) + 0.35 * ((f.brightness ?? 0.5) - 0.5));
      // ENERGY: loudness against the song's own levels, drive and fullness
      // (raw loudness counts only a little: most recordings are mastered loud)
      const energy = on ? clamp(0.3 * level + 0.15 * clamp(this.rmsL / 0.12) + 0.33 * drive + 0.22 * clamp(f.lush ?? 0)) : 0;
      // RHYTHMIC ACTIVITY
      const rhythm = on ? clamp(0.5 * clamp((this.onsetRate - 1) / 3) + 0.5 * drive) : 0;
      // HARMONIC TENSION (from update())
      const tension = this.tension ?? 0;
      // TEXTURE: how full and layered the sound is
      const texture = on ? clamp(0.75 * (f.lush ?? 0) + 0.25 * (this.high ?? 0)) : 0;
      // DYNAMIC VARIATION: energy moving away from its long-term level, and
      // the pace of chord changes
      this.eLong = (this.eLong ?? energy) + (energy - (this.eLong ?? energy)) * ease(dt, 20);
      this.eDev = (this.eDev ?? 0) + (Math.abs(energy - this.eLong) - (this.eDev ?? 0)) * ease(dt, 6);
      const variation = clamp(0.65 * clamp(this.eDev * 5) + 0.35 * clamp((this.chordRate - 0.1) / 0.7));

      const raw = { harm, energy, rhythm, tension, texture, variation };
      const tau = { harm: 6, energy: 3, rhythm: 4, tension: 3, texture: 5, variation: 6 };
      if (!this.idle && on) {
        this.songT += dt;
        this.songD = this.songD || { ...raw };
        const k2 = Math.min(1, dt / Math.max(4, this.songT));
        for (const k in raw) this.songD[k] += (raw[k] - this.songD[k]) * k2;
      }
      this.dims = this.dims || { ...raw };
      for (const k in raw) {
        const target = this.songD && !this.idle ? 0.7 * raw[k] + 0.3 * this.songD[k] : raw[k];
        this.dims[k] += (target - this.dims[k]) * ease(dt, tau[k]);
      }
      // (testing only: MB.debug.music.harmOverride = 0..1 pins the harmony)
      if (this.harmOverride != null) this.dims.harm = this.harmOverride;
    }
  }

  MB.Music = Music;
})();

// Getting sound in (tab/system audio, microphone, or a file) and listening to it:
// loudness, brightness of tone, major vs minor, key and tempo.
(function () {
  const MB = (window.MB = window.MB || {});
  const clamp = MB.clamp;
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

  MB.NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  // Krumhansl–Kessler key profiles.
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function correlate(chroma, profile, tonic) {
    let ma = 0, mb = 0;
    for (let i = 0; i < 12; i++) { ma += chroma[i]; mb += profile[i]; }
    ma /= 12; mb /= 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      const x = chroma[(i + tonic) % 12] - ma, y = profile[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return num / (Math.sqrt(da * db) || 1e-9);
  }

  // Best-fitting key for a chroma vector.
  MB.detectKey = function (chroma) {
    let bestMaj = -2, bestMin = -2, tMaj = 0, tMin = 0;
    for (let t = 0; t < 12; t++) {
      const a = correlate(chroma, MAJOR_PROFILE, t);
      const b = correlate(chroma, MINOR_PROFILE, t);
      if (a > bestMaj) { bestMaj = a; tMaj = t; }
      if (b > bestMin) { bestMin = b; tMin = t; }
    }
    const major = bestMaj >= bestMin;
    return {
      tonic: major ? tMaj : tMin,
      major,
      // 0 = clearly minor, 1 = clearly major
      modeValue: clamp(0.5 + (bestMaj - bestMin) * 4),
      confidence: Math.max(bestMaj, bestMin),
    };
  };

  class Analyzer {
    constructor(ctx, source) {
      this.ctx = ctx;
      const an = (this.an = ctx.createAnalyser());
      an.fftSize = 8192;
      an.smoothingTimeConstant = 0;
      source.connect(an);
      const bins = an.frequencyBinCount;
      this.binHz = ctx.sampleRate / an.fftSize;
      this.freq = new Float32Array(bins);
      this.wave = new Float32Array(an.fftSize);
      this.prev = new Float32Array(bins);
      this.binPc = new Int8Array(bins).fill(-1);
      for (let i = 1; i < bins; i++) {
        const f = i * this.binHz;
        if (f < 65 || f > 4200) continue;
        const midi = 69 + 12 * Math.log2(f / 440);
        this.binPc[i] = ((Math.round(midi) % 12) + 12) % 12;
      }
      // Log-spaced bands for judging how full the arrangement is.
      this.mag = new Float32Array(bins);
      this.NB = 24;
      this.binBand = new Int8Array(bins).fill(-1);
      for (let i = 1; i < bins; i++) {
        const hz = i * this.binHz;
        if (hz >= 40 && hz < 14000) this.binBand[i] = Math.floor((this.NB * Math.log(hz / 40)) / Math.log(14000 / 40));
      }
      this.bandPow = new Float32Array(this.NB);
      // Candidate pitches for the lead melody, C3 to A5 in quarter tones.
      this.cands = [];
      for (let m = 48; m <= 81; m += 0.5) this.cands.push(440 * Math.pow(2, (m - 69) / 12));
      this.melOnFor = 0;
      this.melOffFor = 0;
      this.chromaFrame = new Float32Array(12);
      this.chromaShort = new Float32Array(12);
      this.chromaLong = new Float32Array(12);
      this.chromaSong = new Float32Array(12);
      this.peak = 0.02;
      this.fluxMean = 0;
      this.sinceOnset = 1;
      this.env = [];
      this.envDt = [];
      this.tempoTimer = 0;
      this.keyTimer = 0;
      this.elapsed = 0;
      this.heard = 0; // seconds of non-silent audio
      this.beats = 0;
      this.f = {
        rms: 0, level: 0, energy: 0, brightness: 0.5,
        mode: 0.5, keyMode: 0.5, chordMode: 0.5,
        tonic: 0, hueShift: 0, bpm: 100,
        beat: false, beatStrength: 0, silent: true,
        // how full the arrangement is: 0 = one voice and a guitar, 1 = everything
        lush: 0,
        // the lead melody (often the voice): pitch 0 = low, 1 = high
        melody: { on: false, pitch: 0.5, loud: 0, conf: 0 },
      };
    }

    update(dt) {
      const f = this.f;
      this.elapsed += dt;
      this.an.getFloatFrequencyData(this.freq);
      this.an.getFloatTimeDomainData(this.wave);

      // Loudness, normalised against a slowly decaying peak so quiet and loud
      // sources both fill the range.
      let sq = 0;
      for (let i = 0; i < this.wave.length; i++) sq += this.wave[i] * this.wave[i];
      const rms = Math.sqrt(sq / this.wave.length);
      // compare against the loudest *sustained* level, not single drum hits
      this.rmsS = (this.rmsS || 0) + (rms - (this.rmsS || 0)) * ease(dt, 0.4);
      this.peak = Math.max(this.rmsS, this.peak * Math.exp(-dt / 25), 0.01);
      f.rms = rms;
      f.silent = rms < 0.003;
      f.level = clamp(rms / this.peak);
      f.energy += (f.level - f.energy) * ease(dt, 0.25);

      // Spectrum: brightness (centroid), onset flux, and pitch classes.
      let num = 0, den = 0, flux = 0, hiPow = 0, lowPow = 0, totPow = 0;
      const cf = this.chromaFrame.fill(0);
      const bp = this.bandPow.fill(0);
      for (let i = 1; i < this.freq.length; i++) {
        let db = this.freq[i];
        if (!isFinite(db)) db = -160;
        const m = Math.pow(10, db / 20);
        this.mag[i] = m;
        const hz = i * this.binHz;
        const band = this.binBand[i];
        if (band >= 0) {
          bp[band] += m * m;
          totPow += m * m;
          if (hz > 5000) hiPow += m * m;
          if (hz < 150) lowPow += m * m;
        }
        if (hz < 12000) { num += hz * m; den += m; }
        const lm = Math.log1p(m * 1000);
        const d = lm - this.prev[i];
        if (d > 0 && hz < 10000) flux += d;
        this.prev[i] = lm;
        const pc = this.binPc[i];
        if (pc >= 0) cf[pc] += m * m;
      }
      const centroid = den > 0 ? num / den : 1000;
      const bright = clamp(Math.log2(Math.max(centroid, 1) / 400) / Math.log2(4000 / 400));
      if (!f.silent) f.brightness += (bright - f.brightness) * ease(dt, 0.6);

      // Fullness: how evenly energy spreads across the bands, plus the shimmer
      // of drums and cymbals up high.
      let ent = 0;
      if (totPow > 0) {
        for (let b = 0; b < this.NB; b++) {
          const q = bp[b] / totPow;
          if (q > 0) ent -= q * Math.log(q);
        }
      }
      if (!f.silent && totPow > 0) {
        const k2 = ease(dt, 2);
        this.spreadS = (this.spreadS ?? 0.5) + (ent / Math.log(this.NB) - (this.spreadS ?? 0.5)) * k2;
        this.hiS = (this.hiS ?? 0) + (hiPow / totPow - (this.hiS ?? 0)) * k2;
        this.lowS = (this.lowS ?? 0) + (lowPow / totPow - (this.lowS ?? 0)) * k2;
      }
      f.dbg = { spread: this.spreadS || 0, hi: this.hiS || 0, low: this.lowS || 0 };
      const lushRaw = 0.4 * clamp(((this.spreadS || 0) - 0.5) / 0.25)
        + 0.3 * clamp((Math.log10((this.hiS || 0) + 1e-7) + 4) / 2.5)
        + 0.3 * clamp((this.lowS || 0) * 4);
      f.lush += ((f.silent ? 0 : lushRaw) - f.lush) * ease(dt, 1.5);

      this._melody(dt);

      if (!f.silent) {
        this.heard += dt;
        let s = 0;
        for (let i = 0; i < 12; i++) s += cf[i];
        if (s > 0) {
          const kS = ease(dt, 0.3), kL = ease(dt, 6);
          for (let i = 0; i < 12; i++) {
            const v = cf[i] / s;
            this.chromaShort[i] += (v - this.chromaShort[i]) * kS;
            this.chromaLong[i] += (v - this.chromaLong[i]) * kL;
            this.chromaSong[i] += v * dt;
          }
        }
      }

      // Key and chord quality, a few times a second.
      this.keyTimer += dt;
      if (this.keyTimer > 0.3 && !f.silent) {
        this.keyTimer = 0;
        const key = MB.detectKey(this.chromaLong);
        f.keyMode = key.modeValue;
        f.tonic = key.tonic;
        f.chordMode = this._chordMode(this.chromaShort);
      }
      const target = 0.65 * f.keyMode + 0.35 * f.chordMode;
      f.mode += (target - f.mode) * ease(dt, this.heard < 4 ? 0.8 : 3);
      // Hue drifts with the key's place on the circle of fifths.
      const fifths = (f.tonic * 7) % 12;
      const hs = Math.sin((fifths / 12) * Math.PI * 2) * 14;
      f.hueShift += (hs - f.hueShift) * ease(dt, 4);

      // Onsets (beats / accents).
      this.fluxMean += (flux - this.fluxMean) * ease(dt, 1.5);
      this.sinceOnset += dt;
      f.beat = false;
      if (!f.silent && this.fluxMean > 0 && flux > this.fluxMean * 1.5 && this.sinceOnset > 0.12) {
        f.beat = true;
        f.beatStrength = clamp(flux / this.fluxMean - 1.5);
        this.sinceOnset = 0;
        this.beats++;
      }

      // Tempo from the autocorrelation of the onset envelope.
      this.env.push(flux);
      this.envDt.push(dt);
      if (this.env.length > 480) { this.env.shift(); this.envDt.shift(); }
      this.tempoTimer += dt;
      if (this.tempoTimer > 1) { this.tempoTimer = 0; this._tempo(); }
      return f;
    }

    // Find the strongest harmonic series in the vocal range. It follows the
    // singer when there is one, or whatever carries the tune otherwise.
    _melody(dt) {
      const f = this.f, mel = f.melody, mag = this.mag, bh = this.binHz;
      let best = 0, bestF = 0, sum = 0;
      for (const f0 of this.cands) {
        let s = 0;
        for (let h = 1; h <= 5; h++) {
          const b = Math.round((h * f0) / bh);
          if (b + 1 >= mag.length) break;
          s += Math.max(mag[b - 1], mag[b], mag[b + 1]) / Math.sqrt(h);
        }
        sum += s;
        if (s > best) { best = s; bestF = f0; }
      }
      const conf = sum > 0 ? best / (sum / this.cands.length) : 0;
      mel.raw = conf;
      mel.rawF = bestF;
      mel.conf += (conf - mel.conf) * ease(dt, 0.08);
      // A sung note holds a steady pitch above the bass for a moment;
      // strummed chords jump between candidates.
      const semis = this.lastF ? Math.abs(12 * Math.log2(bestF / this.lastF)) : 99;
      this.lastF = bestF;
      this.steady = semis < 1.2 ? (this.steady || 0) + dt : 0;
      const voiced = !f.silent && conf > 6 && bestF >= 165 && this.steady > 0.06;
      if (voiced) { this.melOnFor += dt; this.melOffFor = 0; } else { this.melOffFor += dt; this.melOnFor = 0; }
      if (!mel.on && this.melOnFor > 0.12) mel.on = true;
      if (mel.on && this.melOffFor > 0.35) mel.on = false;
      if (voiced) {
        const p = clamp(Math.log2(bestF / 130) / Math.log2(880 / 130));
        mel.pitch += (p - mel.pitch) * ease(dt, mel.on ? 0.07 : 0.01);
      }
      mel.loud += ((voiced ? f.level : 0) - mel.loud) * ease(dt, 0.1);
    }

    _chordMode(c) {
      let maj = 0, min = 0;
      for (let r = 0; r < 12; r++) {
        const root = c[r], fifth = c[(r + 7) % 12];
        maj = Math.max(maj, root + c[(r + 4) % 12] + 0.8 * fifth);
        min = Math.max(min, root + c[(r + 3) % 12] + 0.8 * fifth);
      }
      return clamp(0.5 + (maj - min) * 3);
    }

    _tempo() {
      const n = this.env.length;
      if (n < 180) return;
      let dtSum = 0, mean = 0;
      for (let i = 0; i < n; i++) { dtSum += this.envDt[i]; mean += this.env[i]; }
      const dt = dtSum / n;
      mean /= n;
      const x = this.env.map((v) => v - mean);
      const minLag = Math.max(1, Math.floor(60 / 180 / dt));
      const maxLag = Math.min(n - 2, Math.ceil(60 / 60 / dt));
      let best = 0, bestBpm = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let s = 0;
        for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
        s /= n - lag;
        const bpm = 60 / (lag * dt);
        const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.8, 2));
        if (s * w > best) { best = s * w; bestBpm = bpm; }
      }
      if (bestBpm) this.f.bpm += (bestBpm - this.f.bpm) * 0.3;
    }

    // Whole-song key estimate.
    summary() {
      const key = MB.detectKey(this.chromaSong);
      return { ...key, keyName: `${MB.NOTE_NAMES[key.tonic]} ${key.major ? 'major' : 'minor'}` };
    }
  }

  class Listener {
    constructor() {
      this.ctx = null;
      this.stream = null;
      this.audioEl = null;
      this.analyzer = null;
      this.onEnded = null;
    }

    async _context() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }

    async fromDevice() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('This browser can’t listen to other tabs or apps. Try Chrome or Edge on a computer, or use the microphone.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      const tracks = stream.getAudioTracks();
      if (!tracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No sound came through. When you choose what to share, make sure “Share tab audio” (or “Share system audio”) is switched on.');
      }
      this.stream = stream;
      const ctx = await this._context();
      const src = ctx.createMediaStreamSource(new MediaStream(tracks));
      this.analyzer = new Analyzer(ctx, src);
      tracks[0].addEventListener('ended', () => this.onEnded && this.onEnded());
    }

    async fromMic() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser doesn’t allow microphone access here.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.stream = stream;
      const ctx = await this._context();
      this.analyzer = new Analyzer(ctx, ctx.createMediaStreamSource(stream));
    }

    async fromFile(file) {
      const ctx = await this._context();
      const el = (this.audioEl = new Audio());
      el.src = URL.createObjectURL(file);
      const src = ctx.createMediaElementSource(el);
      src.connect(ctx.destination); // so you can hear it
      this.analyzer = new Analyzer(ctx, src);
      el.addEventListener('ended', () => this.onEnded && this.onEnded());
      await el.play();
    }

    stop() {
      this.onEnded = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.audioEl) {
        this.audioEl.pause();
        URL.revokeObjectURL(this.audioEl.src);
      }
      if (this.ctx) this.ctx.close().catch(() => {});
      this.stream = this.audioEl = this.ctx = null;
    }
  }

  MB.Listener = Listener;
})();

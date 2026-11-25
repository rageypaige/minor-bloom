// Wires everything together: start screen → listening → a still of the moment.
(function () {
  const MB = window.MB;
  const $ = (s) => document.querySelector(s);

  document.documentElement.dataset.ground = MB.theme.dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--bg', MB.PAPER);

  // Listening to a tab or the whole computer only exists in desktop browsers.
  const canTab = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  document.documentElement.dataset.tab = canTab ? 'yes' : 'no';

  let atmos = null;
  // The particle waves are the default; ?style=sky keeps the night-sky style
  // Default: the guided ribbons. ?style=waves keeps the unguided particle
  // waves, ?style=sky the night-sky style. (?style=ribbons still works.)
  const styleQ = new URLSearchParams(location.search).get('style');
  const wantWaves = styleQ !== 'sky';
  const waveOpts = styleQ === 'waves' ? {} : { mode: 'guides' };
  // ?material=silk turns on the softer 'silk' light; M toggles it live
  waveOpts.silk = new URLSearchParams(location.search).get('material') === 'silk';
  try { atmos = wantWaves && MB.Waves ? new MB.Waves($('#atmos'), waveOpts) : new MB.Atmosphere($('#atmos')); } catch (e) {
    console.warn('Style unavailable:', e);
    if (wantWaves) { try { atmos = new MB.Atmosphere($('#atmos')); } catch (e2) { /* no WebGL2 */ } }
  }
  let lastF = null;

  const finalCanvas = $('#final');
  const fctx = finalCanvas.getContext('2d');

  let state = 'intro';
  let listener = null;
  let timeline = [];
  let recTimer = 0, hudTimer = 0, quietTimer = 0;
  let summary = null;
  let last = performance.now();

  // A calm sky behind the start screen.
  // A few soft blooms drifting slowly, their colours shifting between warm
  // and cool over a minute or so.
  const idleMood = {
    idle: true,
    energy: 0.45, level: 0.55, lush: 0.3, mode: 0.55, brightness: 0.55, hueShift: 0, bpm: 70,
    melody: { on: false, pitch: 0.5, loud: 0 },
    beat: false, beatStrength: 0, silent: false,
    bass: 0.12, mid: 0.3, high: 0.04, bassHit: 0, spark: 0,
    rms: 0.07, dbg: { hi: 3e-4 },
  };
  let idleT = Math.random() * 100;

  function show(el, on) { el.hidden = !on; }
  function setError(msg) { const e = $('#error'); e.textContent = msg || ''; show(e, !!msg); }

  function friendly(err) {
    if (!err) return 'Something went wrong.';
    if (err.name === 'NotAllowedError') return 'Sharing was cancelled or blocked. Try again, and allow access when your browser asks.';
    if (err.name === 'NotFoundError') return 'No microphone was found.';
    if (err.name === 'NotSupportedError') return 'This browser can’t capture audio this way. Try Chrome or Edge on a computer.';
    return err.message || String(err);
  }

  async function start(kind, file) {
    setError('');
    const l = new MB.Listener();
    try {
      if (kind === 'device') await l.fromDevice();
      else if (kind === 'mic') await l.fromMic();
      else await l.fromFile(file);
    } catch (err) {
      l.stop();
      setError(friendly(err));
      return;
    }
    listener = l;
    l.onEnded = finish;
    atmos.reset();
    timeline = [];
    recTimer = hudTimer = quietTimer = 0;
    resetHud();
    state = 'listening';
    show($('#intro'), false);
    show($('#credit'), false);
    show($('#hud'), true);
    $('#hud').classList.remove('quiet');
    $('#mood-word').textContent = 'listening…';
    $('#mood-detail').textContent = '';
  }

  function finish() {
    if (state !== 'listening') return;
    const an = listener.analyzer;
    summary = an.summary();
    const heard = an.heard;
    listener.stop();
    listener = null;
    show($('#hud'), false);

    if (timeline.length < 12 || heard < 3) {
      state = 'intro';
      show($('#intro'), true);
      show($('#credit'), true);
      setError('That was too short or too quiet. Let it listen for at least a few seconds of music.');
      return;
    }

    state = 'finale';
    const bpms = timeline.map((s) => s.bpm).sort((a, b) => a - b);
    const bpm = bpms[Math.floor(bpms.length / 2)];
    const modes = timeline.map((s) => s.m);
    const avgMode = modes.reduce((a, b) => a + b, 0) / modes.length;
    const avgEnergy = timeline.reduce((a, s) => a + s.e, 0) / timeline.length;
    const secs = Math.round(timeline[timeline.length - 1].t);
    const dur = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    summary.bpm = Math.round(bpm);
    summary.caption = `${dur} · leaning ${summary.keyName} · about ${summary.bpm} bpm · ${MB.moodWord(0.5 * avgMode + 0.5 * summary.modeValue, avgEnergy)}`;
    $('#caption').textContent = summary.caption;

    // keep a still of the last moment
    const art = atmos.capture(lastF || idleMood);
    finalCanvas.width = art.width;
    finalCanvas.height = art.height;
    fctx.drawImage(art, 0, 0);
    $('.frame').style.aspectRatio = `${art.width} / ${art.height}`;
    finalCanvas.classList.remove('reveal');
    void finalCanvas.offsetWidth; // restart the reveal animation
    finalCanvas.classList.add('reveal');
    $('#btn-save').disabled = false;
    $('#btn-save').textContent = 'save still';
    show($('#finale'), true);
  }

  // Download a canvas as a PNG, with an optional title and a small caption.
  function downloadStill(src, title, caption, fallbackName) {
    const W = src.width, H = src.height;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const c = out.getContext('2d');
    c.drawImage(src, 0, 0);
    const k = Math.min(W, H) / 1350;
    c.textAlign = 'right';
    c.fillStyle = MB.theme.dark ? 'rgba(244, 240, 234, 0.8)' : 'rgba(30, 24, 34, 0.72)';
    if (title) {
      c.font = `${Math.round(56 * k)}px "Cormorant Garamond", Georgia, serif`;
      c.fillText(title, W - 60 * k, H - 94 * k);
    }
    c.font = `${Math.round(23 * k)}px "Cormorant Garamond", Georgia, serif`;
    c.fillStyle = MB.theme.dark ? 'rgba(244, 240, 234, 0.55)' : 'rgba(30, 24, 34, 0.55)';
    c.fillText(`${caption} · Minor Bloom`, W - 60 * k, H - 54 * k);
    out.toBlob((blob) => {
      const a = document.createElement('a');
      const slug = (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.download = `minor-bloom-${slug || fallbackName}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  function save() {
    downloadStill(finalCanvas, $('#title').value.trim(), summary.caption, 'moment');
  }

  // Save the sky as it is right now, without stopping the music.
  let snapTimer = null;
  function snap() {
    if (state !== 'listening' || !listener) return;
    const secs = Math.round(listener.analyzer.elapsed);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const parts = [time];
    if (hud && hud.key) parts.push(`leaning ${hud.key}`);
    if (hud && hud.word) parts.push(hud.word);
    downloadStill(atmos.capture(lastF || idleMood), '', parts.join(' · '), `moment-${time.replace(':', '-')}`);
    const b = $('#btn-snap');
    b.textContent = 'saved';
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => { b.textContent = 'save'; }, 1600);
  }

  function again() {
    state = 'intro';
    show($('#finale'), false);
    show($('#intro'), true);
    show($('#credit'), true);
    setError('');
    $('#title').value = '';
    atmos.reset();
  }

  // The mood readout only changes on a real shift in the song: it follows a
  // slow average, needs to cross a boundary by a clear margin, and the new
  // mood has to hold for a few seconds before it's shown.
  const WORDS = [
    ['melancholy', 'brooding', 'stormy'],
    ['wistful', 'bittersweet', 'restless'],
    ['tender', 'warm', 'radiant'],
  ];
  let hud;
  function resetHud() {
    hud = { mode: null, energy: null, modeBand: null, energyBand: null, word: null, cand: null, candFor: 0,
      key: null, keyCand: null, keyCandFor: 0, bpm: null };
  }
  resetHud();

  function band(v, cur, lo, hi, margin) {
    const raw = v < lo ? 0 : v > hi ? 2 : 1;
    if (cur === null || raw === cur) return raw;
    if (raw > cur) return v > (cur === 0 ? lo : hi) + margin ? raw : cur;
    return v < (cur === 2 ? hi : lo) - margin ? raw : cur;
  }

  function updateHud(f, dt) {
    if (f.silent) {
      if (!hud.word) {
        $('#mood-word').textContent = 'listening…';
        $('#mood-detail').textContent = 'waiting for sound';
      }
      return;
    }
    hud.warmup = (hud.warmup || 0) + dt;
    if (hud.warmup < 3) {
      $('#mood-word').textContent = 'listening…';
      $('#mood-detail').textContent = 'getting a feel for it';
      return;
    }
    // The words are an interpretive layer only: they read the same sustained
    // dimensions as the visuals (harmonic character, energy, tension) but
    // don't choose anything visual.
    const D = atmos && atmos.dims;
    const modeIn = D ? D.harm : f.mode, energyIn = D ? D.energy : f.energy;
    if (hud.mode === null) { hud.mode = modeIn; hud.energy = energyIn; }
    hud.mode += (modeIn - hud.mode) * (1 - Math.exp(-dt / 4));
    hud.energy += (energyIn - hud.energy) * (1 - Math.exp(-dt / 4));
    hud.modeBand = band(hud.mode, hud.modeBand, 0.4, 0.6, 0.08);
    hud.energyBand = D ? band(hud.energy, hud.energyBand, 0.48, 0.72, 0.06) : band(hud.energy, hud.energyBand, 0.3, 0.6, 0.08);
    let word = WORDS[hud.modeBand][hud.energyBand];
    // energetic music is only stormy when it is also tense
    const tense = D ? D.tension : 0.5;
    if (hud.energyBand === 2 && hud.modeBand === 0 && tense < 0.35) word = 'urgent';
    if (hud.energyBand === 2 && hud.modeBand === 1 && tense < 0.35) word = 'soaring';
    if (!hud.word) hud.word = word;
    else if (word !== hud.word) {
      if (word !== hud.cand) { hud.cand = word; hud.candFor = 0; }
      hud.candFor += dt;
      if (hud.candFor >= 3) { hud.word = word; hud.cand = null; }
    } else hud.cand = null;

    const keyName = `${MB.NOTE_NAMES[f.tonic]} ${f.keyMode >= 0.5 ? 'major' : 'minor'}`;
    if (!hud.key || hud.heard < 4) hud.key = keyName;
    else if (keyName !== hud.key) {
      if (keyName !== hud.keyCand) { hud.keyCand = keyName; hud.keyCandFor = 0; }
      hud.keyCandFor += dt;
      if (hud.keyCandFor >= 5) { hud.key = keyName; hud.keyCand = null; }
    } else hud.keyCand = null;
    hud.heard = (hud.heard || 0) + dt;

    if (hud.bpm === null || Math.abs(f.bpm - hud.bpm) > 8) hud.bpm = Math.round(f.bpm);

    $('#mood-word').textContent = hud.word;
    $('#mood-detail').textContent = `leaning ${hud.key} · about ${hud.bpm} bpm`;
  }

  function frame(now) {
    // The start screen's slow drift is drawn at ~30 fps to spare the
    // computer while it waits; listening runs at the full frame rate.
    if (state === 'intro' && now - last < 30) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (!atmos) {
      // nothing to draw without WebGL2
    } else if (state === 'intro') {
      idleT += dt;
      idleMood.mode = 0.5 + 0.35 * Math.sin(idleT / 25);
      idleMood.hueShift = 10 * Math.sin(idleT / 37);
      atmos.update(idleMood, dt);
    } else if (state === 'listening' && listener && listener.analyzer) {
      const an = listener.analyzer;
      const f = an.update(dt);
      lastF = f;
      atmos.update(f, dt);
      recTimer += dt;
      if (recTimer >= 0.25) {
        recTimer = 0;
        if (!f.silent || timeline.length) {
          timeline.push({
            t: an.elapsed, e: f.silent ? 0 : f.energy, b: f.brightness, m: f.mode, bpm: f.bpm, l: f.lush,
            p: f.melody.on ? f.melody.pitch : null, v: f.melody.loud,
          });
        }
      }
      hudTimer += dt;
      if (hudTimer > 0.5) { updateHud(f, hudTimer); hudTimer = 0; }
      quietTimer += dt;
      if (quietTimer > 6) $('#hud').classList.add('quiet');
    }

    requestAnimationFrame(frame);
  }

  $('#btn-device').addEventListener('click', () => start('device'));
  $('#btn-mic').addEventListener('click', () => start('mic'));
  $('#file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) start('file', file);
  });
  $('#btn-finish').addEventListener('click', finish);
  $('#btn-snap').addEventListener('click', snap);
  $('#btn-save').addEventListener('click', save);
  $('#btn-again').addEventListener('click', again);
  // moving the mouse or touching the screen brings the quiet controls back
  const wake = () => {
    quietTimer = 0;
    $('#hud').classList.remove('quiet');
  };
  window.addEventListener('mousemove', wake);
  window.addEventListener('pointerdown', wake);

  if (!atmos) {
    document.querySelectorAll('#intro .links').forEach((n) => { n.hidden = true; });
    setError('Minor Bloom needs WebGL2 to draw its sky. Try a recent version of Chrome, Edge, Safari or Firefox.');
  }

  // M switches the rendering material (current / silk) on the very same
  // particles, for comparing; a small word says which one is showing.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'm' && e.key !== 'M') return;
    if (!atmos || !('silk' in atmos) || e.target instanceof HTMLInputElement) return;
    atmos.silk = !atmos.silk;
    let tag = document.getElementById('mat-tag');
    if (!tag) {
      tag = document.createElement('p');
      tag.id = 'mat-tag';
      tag.style.cssText = 'position:fixed;top:14px;right:20px;margin:0;font-size:15px;color:var(--ink-soft);transition:opacity .8s;pointer-events:none';
      document.body.appendChild(tag);
    }
    tag.textContent = atmos.silk ? 'silk' : 'original';
    tag.style.opacity = 1;
    clearTimeout(tag._t);
    tag._t = setTimeout(() => { tag.style.opacity = 0; }, 1600);
  });

  // For testing from the console.
  MB.debug = { atmos, get listener() { return listener; }, get timeline() { return timeline; }, finish };

  requestAnimationFrame(frame);
})();

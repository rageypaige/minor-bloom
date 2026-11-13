// Wires everything together: start screen → live painting → finished painting.
(function () {
  const MB = window.MB;
  const $ = (s) => document.querySelector(s);

  // Background: ?bg=paper|white|mist|night|charcoal
  MB.setTheme(new URLSearchParams(location.search).get('bg') || 'night');
  document.documentElement.dataset.ground = MB.theme.dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--bg', MB.PAPER);

  const painter = new MB.LivePainter($('#live'));
  $('#grain').style.backgroundImage = `url(${MB.makeGrain(400).toDataURL()})`;
  $('#grain').style.opacity = MB.theme.grain;

  const finalCanvas = $('#final');
  const fctx = finalCanvas.getContext('2d');

  let state = 'intro';
  let listener = null;
  let timeline = [];
  let recTimer = 0, hudTimer = 0, quietTimer = 0;
  let summary = null;
  let last = performance.now();

  // Gentle brushwork behind the start screen.
  const idleMood = {
    energy: 0.12, level: 0.12, lush: 0.12, mode: 0.55, brightness: 0.55, hueShift: 0, bpm: 70,
    melody: { on: false, pitch: 0.5, loud: 0 },
    beat: false, beatStrength: 0, silent: false,
  };

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
    painter.begin();
    timeline = [];
    recTimer = hudTimer = quietTimer = 0;
    resetHud();
    state = 'listening';
    show($('#intro'), false);
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
      painter.clear();
      state = 'intro';
      show($('#intro'), true);
      setError('That was too short or too quiet to paint. Let it listen for at least a few seconds of music.');
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

    // Stop adding marks and keep the painting exactly as it stands.
    const art = painter.stop();
    finalCanvas.width = art.width;
    finalCanvas.height = art.height;
    fctx.drawImage(art, 0, 0);
    $('.frame').style.aspectRatio = `${art.width} / ${art.height}`;
    $('#btn-save').disabled = false;
    $('#btn-save').textContent = 'save painting';
    show($('#finale'), true);
  }

  function save() {
    const W = finalCanvas.width, H = finalCanvas.height;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const c = out.getContext('2d');
    c.drawImage(finalCanvas, 0, 0);
    const title = $('#title').value.trim();
    const k = Math.min(W, H) / 1350;
    c.textAlign = 'right';
    c.fillStyle = MB.theme.dark ? 'rgba(244, 240, 234, 0.8)' : 'rgba(30, 24, 34, 0.72)';
    if (title) {
      c.font = `${Math.round(56 * k)}px "Cormorant Garamond", Georgia, serif`;
      c.fillText(title, W - 70 * k, H - 108 * k);
    }
    c.font = `${Math.round(26 * k)}px Inter, system-ui, sans-serif`;
    c.fillStyle = MB.theme.dark ? 'rgba(244, 240, 234, 0.55)' : 'rgba(30, 24, 34, 0.55)';
    c.fillText(`${summary.caption} · Minor Bloom`, W - 70 * k, H - 62 * k);
    out.toBlob((blob) => {
      const a = document.createElement('a');
      const slug = (title || 'painting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.download = `minor-bloom-${slug || 'painting'}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  function again() {
    state = 'intro';
    show($('#finale'), false);
    show($('#intro'), true);
    setError('');
    $('#title').value = '';
    painter.clear();
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
    if (hud.mode === null) { hud.mode = f.mode; hud.energy = f.energy; }
    hud.mode += (f.mode - hud.mode) * (1 - Math.exp(-dt / 4));
    hud.energy += (f.energy - hud.energy) * (1 - Math.exp(-dt / 4));
    hud.modeBand = band(hud.mode, hud.modeBand, 0.4, 0.6, 0.08);
    hud.energyBand = band(hud.energy, hud.energyBand, 0.3, 0.6, 0.08);
    const word = WORDS[hud.modeBand][hud.energyBand];
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

  function clearCanvas() {
    painter.clear();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (state === 'intro') {
      painter.update(idleMood, dt);
    } else if (state === 'listening' && listener && listener.analyzer) {
      const an = listener.analyzer;
      const f = an.update(dt);
      painter.update(f, dt);
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
  $('#btn-clear').addEventListener('click', clearCanvas);
  $('#btn-save').addEventListener('click', save);
  $('#btn-again').addEventListener('click', again);
  window.addEventListener('mousemove', () => {
    quietTimer = 0;
    $('#hud').classList.remove('quiet');
  });

  // For testing from the console.
  MB.debug = { painter, get listener() { return listener; }, get timeline() { return timeline; }, finish };

  requestAnimationFrame(frame);
})();

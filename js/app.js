// Wires everything together: start screen → live painting → finished painting.
(function () {
  const MB = window.MB;
  const $ = (s) => document.querySelector(s);

  const painter = new MB.LivePainter($('#live'));
  $('#grain').style.backgroundImage = `url(${MB.makeGrain(400).toDataURL()})`;

  const finalCanvas = $('#final');
  const fctx = finalCanvas.getContext('2d');

  let state = 'intro';
  let listener = null;
  let timeline = [];
  let recTimer = 0, hudTimer = 0, quietTimer = 0;
  let finaleGen = null;
  let summary = null;
  let last = performance.now();

  // Gentle brushwork behind the start screen.
  const idleMood = {
    energy: 0.12, mode: 0.55, brightness: 0.55, hueShift: 0, bpm: 70,
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
    painter.clear();
    timeline = [];
    recTimer = hudTimer = quietTimer = 0;
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
    const hueShift = an.f.hueShift;
    listener.stop();
    listener = null;
    show($('#hud'), false);

    if (timeline.length < 12 || heard < 3) {
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
    $('#btn-save').disabled = true;
    $('#btn-save').textContent = 'Painting…';
    show($('#finale'), true);
    const seed = Math.floor(timeline.reduce((a, s, i) => a + s.e * 1000 * (i + 1), 0)) || 7;
    finaleGen = MB.paintFinale(fctx, finalCanvas.width, finalCanvas.height, timeline, { seed, hueShift, bpm });
  }

  function finaleDone() {
    $('#btn-save').disabled = false;
    $('#btn-save').textContent = 'Save painting';
  }

  function save() {
    const W = finalCanvas.width, H = finalCanvas.height;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const c = out.getContext('2d');
    c.drawImage(finalCanvas, 0, 0);
    const title = $('#title').value.trim();
    c.textAlign = 'right';
    c.fillStyle = 'rgba(30, 24, 34, 0.72)';
    if (title) {
      c.font = 'italic 56px "Cormorant Garamond", Georgia, serif';
      c.fillText(title, W - 70, H - 108);
    }
    c.font = '26px Inter, system-ui, sans-serif';
    c.fillStyle = 'rgba(30, 24, 34, 0.55)';
    c.fillText(`${summary.caption} · Minor Bloom`, W - 70, H - 62);
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
    finaleGen = null;
    state = 'intro';
    show($('#finale'), false);
    show($('#intro'), true);
    setError('');
    $('#title').value = '';
    painter.clear();
  }

  function updateHud(f) {
    if (f.silent) {
      $('#mood-word').textContent = 'listening…';
      $('#mood-detail').textContent = 'waiting for sound';
      return;
    }
    const keyName = `${MB.NOTE_NAMES[f.tonic]} ${f.keyMode >= 0.5 ? 'major' : 'minor'}`;
    $('#mood-word').textContent = MB.moodWord(f.mode, f.energy);
    $('#mood-detail').textContent = `leaning ${keyName} · about ${Math.round(f.bpm)} bpm`;
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
          timeline.push({ t: an.elapsed, e: f.silent ? 0 : f.energy, b: f.brightness, m: f.mode, bpm: f.bpm });
        }
      }
      hudTimer += dt;
      if (hudTimer > 0.5) { hudTimer = 0; updateHud(f); }
      quietTimer += dt;
      if (quietTimer > 6) $('#hud').classList.add('quiet');
    }

    if (finaleGen) {
      const t0 = performance.now();
      while (performance.now() - t0 < 12) {
        if (finaleGen.next().done) { finaleGen = null; finaleDone(); break; }
      }
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
  $('#btn-save').addEventListener('click', save);
  $('#btn-again').addEventListener('click', again);
  window.addEventListener('mousemove', () => {
    quietTimer = 0;
    $('#hud').classList.remove('quiet');
  });

  // For testing from the console.
  MB.debug = { get listener() { return listener; }, get timeline() { return timeline; }, finish };

  requestAnimationFrame(frame);
})();

# Minor Bloom: bloom lab

This is the `bloom-lab` branch: a place to experiment with new visuals for
Minor Bloom from a blank canvas, without touching the live site.

- Live site (the `main` branch): [paigelatimer.ca/minor-bloom](https://paigelatimer.ca/minor-bloom/)
- This lab: [paigelatimer.ca/minor-bloom/lab](https://paigelatimer.ca/minor-bloom/lab/)

## What is kept

Everything except the visuals works exactly as on the main site: listening
to a tab, the microphone or an audio file; the analysis of the music
(`js/listener.js`); the mood words and key in the corner; and saving a still.

The musical interpretation that used to live inside the old renderer is now
its own module, `js/music.js`, so any new visual responds the same way:

- smoothed layers: `vol`, `bass`, `mid`, `high`, `drive`, `lush`, `bpm`,
  `tension`, `quietAmt`, `acc`
- `beats`: recent percussive hits worth showing, judged against the song's
  own typical hits
- `dims`: six sustained dimensions (`harm`, `energy`, `rhythm`, `tension`,
  `texture`, `variation`), with the song's own fingerprint
- `lumin`: an overall luminosity driver (quiet music stays restrained)
- `colA`, `colB`, `colAcc`: colours from the ink palette (petrol ink, storm
  blue, bruised plum, black cherry, copper rose, tarnished gold), chosen by
  harmony and moved by chords; `MB.INK.ground` is the aubergine charcoal

## What is new: translucent fields of light (prototype)

Three formations of continuous, translucent light, rendered per pixel on the
GPU: no particles, trails or lines. Each formation is a smooth spine with a
varying width and a lit edge that moves from side to side; every pixel is
measured against the spines (how far along, how far across), and an optical
material turns that into light: soft, asymmetric interiors, a defined rim
only where the edge is lit, edge softness that varies along the body,
tapering ends. The space is bent by a slow noise field so the shapes fold
organically. Formations drift on slow noise, push each other apart when
they meet, and are layered back to front like coloured gels.

For now the visuals follow a **synthetic input** (slow made-up curves for
energy, harmony, tension, texture and variation), so the system can be
developed before it is connected to the music. Press **A** to let it follow
the music instead (experimental). `?dev` shows sliders for the material,
the movement and the synthetic input (each input can be pinned).

The systems are separate files in `js/lab/`:

- `synth.js`: the synthetic input
- `geometry.js`: formation spines (position, width, lit edge)
- `motion.js`: how the formations drift, swell and interact (layouts here)
- `material.js`: the optical material and compositing settings
- `compositor.js`: the single GPU pass that renders and layers them

`js/lab.js` ties them together.

The previous renderers (the particle waves and the night sky) are on the
`main` branch and in the git history.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis
- `js/music.js`: the music, interpreted (layers, beats, dimensions, colour)
- `js/lab.js` and `js/lab/`: the translucent light fields (see above)
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it all together

No build step and nothing to install.

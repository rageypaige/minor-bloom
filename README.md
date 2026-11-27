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

## What is new: sculptural sheets of light (prototype)

Formations are continuous, deformable **surfaces of light**, drawn as meshes
on the GPU: no particles, trails or lines. Along each sheet, independently
and slowly over time:

- the spine bends, folds sharply in places, stretches and compresses;
- the width swells into broad planes and fans, and narrows to threads;
- the cross-section **twists** toward and away from the viewer, **curls**
  into an arc and **skews**.

Light behaves as if passing through a moving sheet: for every point, the
renderer measures how compressed the surface appears on screen. Face-on it
spreads into a soft veil; edge-on or folded it concentrates into a defined
edge; where a sheet folds over itself, both layers add. So the defined
edges come from the geometry itself, not added detail.

The composition has a hierarchy: one dominant formation in front, and up to
three secondary ones (smaller, dimmer, softer-edged, further back, partly
off-screen). Each has its own deformation clock.

For now the visuals follow a **synthetic input**, so the system can be
developed before it is connected to the music. Press **A** to let it follow
the music instead (experimental). `?dev` shows sliders:

- formations: `count`, `curvature`, `fold`, `widthVar`, `orient`, `scale`,
  `depth` (how far sheets twist), `speed` (deformation speed)
- material: `flux` (face-on light), `concentrate` (edge brightness),
  `edgeSoft`, `backDim`, `exposure`, `compress`, `saturation`, `grain`,
  `scale` (render resolution)
- the synthetic input (each value can be pinned)

The systems are separate files in `js/lab/`:

- `synth.js`: the synthetic input
- `geometry.js`: the deformable sheets (spine, width, twist, curl, skew)
- `motion.js`: composition, hierarchy, drift and the shape parameters
- `material.js`: how light passes through the sheets; compositing settings
- `compositor.js`: draws the sheets into a light buffer and tone-maps them

`js/lab.js` ties them together.

The previous renderers (the particle waves and the night sky) are on the
`main` branch and in the git history.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis
- `js/music.js`: the music, interpreted (layers, beats, dimensions, colour)
- `js/lab.js` and `js/lab/`: the sheets of light (see above)
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it all together

No build step and nothing to install.

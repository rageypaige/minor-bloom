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

## What is new

`js/lab.js` is the blank canvas. It fills the ground and shows one faint
placeholder glow in the current palette colour, so it's clear the music is
coming through. New visuals go in its `draw()`.

Press **D** (or open with `?debug`) for a small readout of everything the
music module hears.

The previous renderers (the particle waves and the night sky) are on the
`main` branch and in the git history.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis
- `js/music.js`: the music, interpreted (layers, beats, dimensions, colour)
- `js/lab.js`: the blank canvas
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it all together

No build step and nothing to install.

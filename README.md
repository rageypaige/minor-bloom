# Minor Bloom

*music, rendered in light.*

Minor Bloom listens to a song and draws it as a single flowing line of light
on a deep aubergine ground. The line follows the music as it plays, and you
can keep a still of any moment.

Live at [paigelatimer.ca/minor-bloom](https://paigelatimer.ca/minor-bloom/).

## How to use it

1. Open the page in a recent browser (Chrome, Edge, Safari or Firefox).
2. Choose how it should listen:
   - **listen to a tab** (computers, Chrome or Edge). Play your song in
     another tab (YouTube, or the Spotify web player at open.spotify.com),
     click this, pick that tab and switch on **Share tab audio**. On Windows
     you can share your **entire screen** with **Share system audio** on
     instead, which works with desktop apps.
   - **microphone**, to listen to music playing in the room.
   - **audio file**, to play a song saved on your device.

   Not sure what to play? The start screen suggests one of Paige's favourite
   songs, picked at random each visit. Clicking it opens the song on YouTube
   in a new tab; play it there, come back and choose **listen to a tab**.
3. Keep the Minor Bloom window visible while you listen. Browsers pause
   pages hidden in background tabs, so put the windows side by side or start
   the song and switch back.
4. **save** keeps the moment you tap it, then asks what you're listening to
   (optional, and filled in already if Minor Bloom knows it). Press Enter or
   **save** to download the still. The music keeps playing.
5. When the song ends (or you click **finish**, or stop sharing), you get
   the last moment to name and save.

**On a phone:** phones don't let websites hear other apps, so Minor Bloom
can't listen to music playing on the same phone. Play the song on another
speaker or computer and choose **microphone**, or pick a song saved on the
phone with **audio file**.

## What you'll see

- **One line of light** made of tens of thousands of particles streaming
  along it, with a brighter core strand running through it, fine silk
  highlights and a soft veil of light around it.
- **It moves like a drawn line.** Its backbone rises and falls freely along
  its length, like a string, so it keeps finding new shapes. Calm, sparse
  music lets it relax toward a gentle, nearly straight line; energetic,
  changing music swings and folds it, turns it and moves it around the
  screen. Strong beats pluck it, sending a ripple along it.
- **Two currents that intertwine with the music.** A second current runs
  alongside the first. When the music is calm and sparse they flow
  independently with generous space between them. As the music becomes
  active, layered and rich, they draw together, cross, wind around each other
  and partly overlap, their colours mixing where they meet; as it softens
  they gently part again. How engaged they are comes only from the music:
  sustained energy (against the song's own peak), rhythmic density, spectral
  richness and change in intensity, gated by a calm threshold with
  hysteresis and eased in and out over seconds. (`?dev` shows a live readout
  of why, and sliders for strength, threshold, amplitude and speeds.)
- **Colour follows the harmony**, on Paige's ink palette: minor-leaning
  music sits in petrol ink and storm blue, in-between harmony in bruised
  plum and black cherry, major-leaning music in copper rose and tarnished
  gold. Chords move the colour along the palette. (Minor is not darker,
  major is not brighter: harmony changes the colour, never the light.)
- **Quiet music stays quiet.** In silence the line thins to a faint thread
  that keeps slowly bobbing, and fills back out when the music returns.

## How it reads the music

The analysis (`js/listener.js`) measures loudness, bass, mid and high
frequencies, brightness, key, chords, tempo, beats and melody, each against
the song's own levels so differently mastered songs behave alike. From
these, six sustained dimensions are smoothed over seconds, with a share of
each song's running average so every song settles into a recognisable
landscape of its own:

| Dimension | What it shapes |
| --- | --- |
| Harmonic character (major/minor, tonal brightness) | Colour |
| Energy (loudness against the song, drive, fullness) | How far the line swings, how bright it is, how far it spreads |
| Rhythmic activity | How often beats pluck it; how quickly its shape moves |
| Harmonic tension (poor chord fit, distant chords) | How deeply it folds |
| Texture (fullness, shimmer) | How full and layered the light is |
| Dynamic variation (how much the music is changing) | How quickly the composition transforms and turns |

The mood words and key in the corner are a poetic reading of the same
dimensions; they don't choose anything visual. Key and tempo are estimates:
they are usually close, but can mix up relative keys (C major and A minor),
and tempo is folded into 72-144 bpm.

## Experiment panel

Add `?dev` to the address
([paigelatimer.ca/minor-bloom/?dev](https://paigelatimer.ca/minor-bloom/?dev))
for a panel of plain-language sliders: the shape and movement of the wave,
how much the music reshapes, turns and moves it, the two currents and
intertwining (with a live readout of the music-derived interaction
strength), the free-drawn line, the
strands and core strand, side waves (off by default), light and texture,
and colour. Hover a slider to see what it does. Changes are live and are
remembered in your browser on the `?dev` link only; **copy settings**
copies them so they can be pasted into a message, **reset** restores the
defaults and **T** hides the panel. The normal link is never affected.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis
- `js/waves.js`: the line of light (WebGL2): the particle simulation, the
  music-driven shape, the silk material, colour and the experiment panel.
  Its main settings are the `GUIDE` table (shape and movement), `this.tw`
  (the panel's overall adjustments) and `RENDER` (how the light is drawn).
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it together: start screen, listening, saving, the song
  suggestions (`SUGGESTIONS`)

No build step and nothing to install. It's plain HTML, CSS and JavaScript.
Earlier styles (paint, the night sky, and the experiments along the way) are
in the git history.

# Minor Bloom

Minor Bloom turns a song into a slowly evolving night sky: soft fields of
coloured light drifting in a deep charcoal fog, with fine film grain and faint
stars. It listens as the music plays and lets the song's mood, harmony and
shape move the light. You can keep a still of any moment.

Live at [paigelatimer.ca/minor-bloom](https://paigelatimer.ca/minor-bloom/).

## How to use it

1. Open the page in a recent browser (Chrome, Edge, Safari or Firefox).
2. Choose how it should listen:
   - **listen to a tab** (computers, Chrome or Edge). Open your song in the
     Spotify web player (open.spotify.com) in another tab, click this, pick
     that tab and switch on **Share tab audio**. On Windows you can share your
     **entire screen** with **Share system audio** on instead, which works with
     the Spotify app.
   - **microphone**, to listen to music playing in the room.
   - **audio file**, to play a song saved on your device.
3. Keep the Minor Bloom window visible while you listen. Browsers pause pages
   hidden in background tabs, so put the windows side by side or start the
   song and switch back.
4. Optionally, type what you're listening to on the start screen. It shows
   in the corner while you listen and on the stills you save (for an audio
   file, its name is used if you leave it empty).
5. **save** keeps a still of the sky as it is right now, and the music plays
   on. When the song ends (or you click **finish**, or stop sharing), you get
   the last moment to name and save.

**On a phone:** phones don't let websites hear other apps, so Minor Bloom
can't listen to Spotify playing on the same phone. Play the song on another
speaker or computer and choose **microphone**, or pick a song saved on the
phone with **audio file**.

## What you'll see in the night-sky style

- **One form of light** that lives for the whole song, with a soft aura
  around it, in a deep charcoal fog with fine film grain. The music shapes
  its **size** (volume and fullness), its **shape** (it stretches, turns and
  folds with the midrange), how far its light **spreads** (the aura widens as
  the arrangement fills out) and its **colour** (the key, and each chord
  washing through).
- **Tendrils** that grow out of it while the music sustains and swells, and
  draw back when it quiets.
- **A faint night sky** behind: sparse stars that twinkle, hide behind bright
  fog, and glint now and then with a cymbal or a bright high note.
- **The song's shape:** as it builds, the light draws in and the edges
  darken; when it arrives, it opens back up with deeper colour. The whole
  scene slowly breathes once per musical phrase.
- **Gentle songs stay gentle:** soft or undriven music (like solo piano) keeps
  the form smaller and softer; full, driving music makes it larger and
  brighter.

## Styles

- **Guided ribbons** (the default): the particle simulation with soft compositional guidance. A guide
  curve evolving on slow, medium and bass-driven timescales shapes the wave
  field, and particles move freely within a band around it, drawn back
  gently when they stray. The gesture stretches, folds, pinches and turns
  over; filaments drift out and rejoin. Over minutes the composition also
  slowly turns (horizontal, diagonal, near-vertical), arches, grows from
  intimate to expansive and now and then curls over itself, with a faint
  iridescent hue drift. Tuning lives in the `GUIDE` table in `js/waves.js`;
  each variety setting can be set to 0 to turn it off.
- **Silk light** (the default; `?material=original` shows the plain points,
  and **M** switches between them while it plays): the original points stay,
  and on top of them some particles also draw a faint, fine, tapered arc of
  light along the wave line they sit on, fresh each frame (so they never pile
  up into a tangle), adding smooth threads that follow the
  ribbon's current shape, a few brighter signature strands and a soft veil
  of coloured light around them. Rendering only: the movement is identical.
  Tuning lives in the `RENDER_PRESETS` table in `js/waves.js`.
- **Experiment panel**: open with `?dev`. Plain-language sliders for the
  shape and movement (number of waves, thickness, size, the big sweeping
  curve, bends, wiggles, roughness, turbulence, curls, how much the music reshapes the wave,
  turning and moving with the music, the free-drawn line (share, height,
  movement speed, plucking by beats), flow speed, tilting, beat ripples), the strands (how many, how fine, and a grounding **core
  strand**: how many particles gather into it, its brightness, width and
  where it runs across the wave), the side waves (clean, thinner lines
  running parallel to the main wave with their own particles: how much they
  show, how many particles they have, how far out they run, how thin they
  are, and how much fuller, more upbeat passages bring them forward), the light and texture (brightness, trails, silk streaks,
  haze, glow, warm halo, shadow depth, grain) and the colour (richness,
  warm highlights / cool shadows, colour shimmer, keeping bright colours
  coloured). Hover a slider for what it does. Changes are live and are
  remembered in your browser on the `?dev` link only; **copy settings**
  copies them so they can be pasted into a message; **reset** restores the
  defaults; **T** hides the panel. **L** still shows each light layer on
  its own.

- **Unguided particle waves**, at
  [paigelatimer.ca/minor-bloom/?style=waves](https://paigelatimer.ca/minor-bloom/?style=waves): tens of thousands of particles of light
  stream along flowing wave lines, layering into silky sheets in a night sky.
  Volume sets their speed and brightness and how thick the waves get;
  fullness how many waves there are and how far they spread; the midrange how
  they curve and fold; bass a slow swell rolling through; highs a dust of
  particles drifting off; harmony their colour.
  **The music is read along six independent dimensions,** each a sustained,
  smoothed characteristic rather than a mood preset:
  - *harmonic character* (major/minor leaning, tonal brightness): colour
    temperature and colour relationships only. Minor is not darker or
    stormier; major is not brighter or happier.
  - *energy* (loudness relative to the song, drive, fullness): movement
    speed, expansion and luminosity.
  - *rhythmic activity* (onset rate, drive): how often and how strongly
    ripples disturb the strands.
  - *harmonic tension* (poor chord fit, distant chords, where reliably
    detectable): curvature, folding and structural complexity.
  - *texture* (fullness, spectral spread, shimmer): how many strands, how
    soft and how layered.
  - *dynamic variation* (how much the music is changing): how quickly the
    composition transforms.
  So a slow, intimate, melancholic acoustic song gives a few long, gently
  undulating filaments in generous space, low turbulence, restrained light,
  slow transformation and muted, cool colour: profound without being
  visually intense. The mood words in the corner are a poetic annotation
  read from the same dimensions; they don't choose anything visual.
  **Light is selective and depth is layered:** strands sit in a faint,
  soft background, a middle layer and a few crisper foreground strands; light
  builds where strands converge and when the music grows intense, with a
  faint diffused glow around the most luminous filaments; a few strands carry
  a lighter shade of their colour. Quiet passages stay very subtle.
  Moods glide into each other rather than switching. Half of the blend is
  the song's running average, and the key seeds the shape of the wave field,
  so each song settles into a recognisable landscape of its own.
  **Each part of the music has its own role** in the same living field:
  - *low frequencies*: deep, slow currents that carry the whole field
  - *mid frequencies*: the filaments' curvature and expressive movement
  - *high frequencies*: a fine, fleeting shimmer on the strands' surface
  - *percussive hits*: soft ripples travelling through the strands (strong
    for drums, faint for a piano)
  - *harmony*: gradual colour changes; chords far from the key reach toward
    a contrasting colour family
  - *harmonic tension* (dissonance, chromatic or distant chords): more
    intersection, folding and turbulence
  - *dynamic intensity*: luminosity, expansion and strand density
  - *silence and quiet*: movement softens and strands gradually dissolve
  Each has its own attack and decay, and levels are measured against each
  track's own sustained loudness, so differently mastered songs behave alike.
- **Night sky**, at
  [paigelatimer.ca/minor-bloom/?style=sky](https://paigelatimer.ca/minor-bloom/?style=sky):
  one soft form of light with growing tendrils, described below.

## What it listens for

| In the music | In the sky |
| --- | --- |
| Major vs minor (the key and each chord) | Warm golds, peaches and roses ↔ cool violets and blues, muted, blended gradually; each chord change washes its colour through |
| Volume | How large and luminous the form is |
| Bass | Gentle swelling and soft pressure ripples |
| Midrange | Its shape: stretching, turning and folding |
| High frequencies | Fleeting fine points of light and shimmer; stars glint |
| Tempo | The cadence of gestures and the length of each breath |
| How full and driven it is | How big and bright it gets, and how far its aura spreads |
| Builds and arrivals | The light draws in, then opens back up |

Key and tempo detection are estimates. They are usually close, but can mix up
relative keys (for example C major and A minor). Tempo is read over about 12
seconds and folded into 72-144 bpm, so very slow or very fast songs show as
double or half time; it changes only when a new tempo holds for a few seconds,
and then glides there.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis (loudness, bass/mid/high,
  brightness, key, chords, tempo, melody)
- `js/waves.js`: the particle-waves style, the default (WebGL2)
- `js/atmosphere.js`: the night-sky style, at `?style=sky` (WebGL2)
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it all together

No build step and nothing to install. It's plain HTML, CSS and JavaScript.
An earlier paint style lives in the git history if it's ever wanted again.

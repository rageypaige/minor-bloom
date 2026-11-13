# Minor Bloom

Minor Bloom paints a unique abstract painting from a song. As the track plays,
brush marks accumulate into one composition; when it ends, you can save the
finished artwork.

## How to use it

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it.
2. Open `index.html` in **Chrome or Edge** on a computer.
3. Choose how it should listen:
   - **Listen to a tab or my computer.** Open your song in the Spotify web
     player (open.spotify.com) in another tab, click this button, pick that tab
     and switch on **Share tab audio**. On Windows you can share your **entire
     screen** with **Share system audio** on instead, which works with the
     Spotify app.
   - **Use the microphone** to listen to music playing in the room.
   - **Choose an audio file** from your computer.
4. Keep the Minor Bloom window visible while it paints. Browsers pause pages
   hidden in background tabs, so put the windows side by side or start the song
   and switch back.
5. When the song ends (or you click **finish**, or stop sharing), painting stops
   and the canvas is kept exactly as it is. Name it and click **save painting**
   for a PNG. **clear** starts the canvas over.

## What it listens for

| In the music | In the painting |
| --- | --- |
| Major vs minor (key and current chord) | Warm golds, corals and roses ↔ deep indigos, violets and teals, blended gradually |
| The key itself | A gentle hue shift, following the circle of fifths |
| Tempo | The rhythm of mark-making (marks fall on a beat clock) and how quickly strokes are laid down |
| Volume | Brush size, pressure and pigment opacity |
| How full the arrangement is | How many marks layer up and how varied they are, from fine details and dry brush to loaded strokes and washes |
| Strong accents | Short, loaded strokes |
| Peaks | Occasional bold gestures |
| The lead melody (usually the voice) | A fine line that rises and falls with pitch |

## How it paints

- **Marks are physical.** Each stroke is painted by a set of bristles. It has a
  touch-down, a weighted body and a taper, and its pigment runs out as it goes.
  The surface has a texture, and paint only catches where there's enough
  pigment, so edges break up and the ground shows through.
- **Nothing fades.** Marks stay where they land, and earlier passages show
  beneath later ones. Occasional translucent washes link passages without
  covering them.
- **One composition.** Marks gather in a few related areas, each with its own
  direction. New marks continue, run alongside or cross earlier ones, and the
  painter keeps some open space.

Key and tempo detection are estimates. They are usually close, but can mix up
relative keys (for example C major and A minor) or settle on half or double
the tempo.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis (loudness, brightness, key, chords, tempo)
- `js/painter.js`: the brush, the composition and the painting itself
- `js/brush.js`: shared noise, palettes and canvas grounds
- `js/app.js`: ties it all together

The canvas is midnight by default. To try other grounds, add `?bg=paper`,
`?bg=white`, `?bg=mist` or `?bg=charcoal` to the address.

No build step and nothing to install. It's plain HTML, CSS and JavaScript.

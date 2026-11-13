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

## Two styles

Switch on the start screen (*atmosphere · paint*); your choice is remembered.

- **Atmosphere** (default): soft fields of coloured light suspended in a deep
  charcoal fog, with fine film grain and a few crisp points. Three layers give
  depth: distant colour fields that barely move, midground washes, blooms,
  veils and wisps with flowing texture, and a few small foreground lights.
  Forms open out like ink in water and drift on one slow current; traces of
  earlier moments linger and diffuse. Volume sets how full and luminous they
  are; bass gently swells and displaces the larger forms; the midrange moves
  their insides; high frequencies bring fleeting points and small lights;
  tempo sets the cadence of gestures; fuller, more upbeat music blooms more.
  At peaks a single broad form can take over, then dissolve into smaller ones.
  The scene follows the song's shape: as it builds, the edges darken and the
  light gathers and tightens; when the chorus or drop arrives it breaks open
  in a luminous bloom with fuller colour, then settles. Each chord change sends
  a wave of its colour through the fog (warmer for major chords, colder and
  darker for minor), and the whole scene slowly breathes over each phrase.
  Far behind it is a faint night sky: sparse stars that twinkle slowly, hide
  behind bright fog, show more in quiet passages, and glint now and then with
  a cymbal or a bright high note.
  Quiet passages soften and open up. **finish** keeps a still you can save.
  Needs WebGL2 (current Chrome, Edge, Safari, Firefox); otherwise paint is used.
- **Paint**: flowing brushwork while you listen, with a permanent textured
  painting revealed at the end.

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

While the song plays you watch **wet paint**: brushes that flow with the music
in real time, sparse when it's just a voice and a guitar and lush when the band
comes in, with bright flicks on accents and a glowing line for the voice. It
dries away after a few seconds. Out of sight, a **permanent painting** builds up
slowly; it's revealed when the song ends, and that's what you save.

The permanent painting:

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
relative keys (for example C major and A minor). Tempo is read over about 12
seconds and folded into 72-144 bpm, so very slow or very fast songs show as
double or half time; it changes only when a new tempo holds for a few seconds,
and then glides there.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis (loudness, bass/mid/high, brightness, key, chords, tempo, melody)
- `js/atmosphere.js`: the atmosphere style (WebGL)
- `js/flow.js`: the wet paint, the moving layer you watch while listening
- `js/painter.js`: the permanent painting: brush, composition and accumulation
- `js/brush.js`: shared noise, palettes and canvas grounds
- `js/app.js`: ties it all together

The canvas is midnight by default. To try other grounds, add `?bg=paper`,
`?bg=white`, `?bg=mist` or `?bg=charcoal` to the address.

No build step and nothing to install. It's plain HTML, CSS and JavaScript.

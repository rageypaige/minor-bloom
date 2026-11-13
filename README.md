# Minor Bloom

A painterly audio visualizer. Play a song and watch it paint itself as a moving
watercolor, then see it gathered into one finished painting of the whole song.

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
5. Click **Finish painting** when the song ends (or stop sharing). The finished
   painting builds itself; name it and click **Save painting** for a PNG.

## What it listens for

| In the music | In the painting |
| --- | --- |
| Major vs minor (key and current chord) | Warm golds, corals and roses ↔ deep indigos, violets and teals |
| The key itself | A gentle hue shift, following the circle of fifths |
| Loudness | How many brushes paint, how wide and saturated they are |
| Tempo | How fast the brushes travel and how lively the strokes are |
| Brightness of tone | Lighter or darker paint |
| Accents and beats | Watercolor blooms that spread across the page |

The finished painting reads left to right like the song itself: loudness
shapes the hills, harmony colours them, the biggest moments flower, and a sun
or moon rises over the loudest moment depending on whether the song leans major
or minor.

Key and tempo detection are estimates. They are usually close, but can mix up
relative keys (for example C major and A minor) or settle on half or double
the tempo.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis (loudness, brightness, key, chords, tempo)
- `js/painter.js`: the live painting
- `js/finale.js`: the finished painting
- `js/brush.js`: shared noise, watercolor shapes and palettes
- `js/app.js`: ties it all together

The canvas is midnight by default. To try other grounds, add `?bg=paper`,
`?bg=white`, `?bg=mist` or `?bg=charcoal` to the address.

No build step and nothing to install. It's plain HTML, CSS and JavaScript.

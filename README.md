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
4. **save** keeps a still of the sky as it is right now, and the music plays
   on. When the song ends (or you click **finish**, or stop sharing), you get
   the last moment to name and save.

**On a phone:** phones don't let websites hear other apps, so Minor Bloom
can't listen to Spotify playing on the same phone. Play the song on another
speaker or computer and choose **microphone**, or pick a song saved on the
phone with **audio file**.

## What you'll see

- **Soft forms of light:** broad washes, dense blooms, long veils and folded
  wisps, in front of distant colour fields that barely move. They open out
  like ink in water and drift on one slow current, and traces of earlier
  moments linger and diffuse.
- **A faint night sky** far behind: sparse stars that twinkle slowly, hide
  behind bright fog, show more in quiet passages and glint now and then with a
  cymbal or a bright high note.
- **The song's shape:** as it builds, the edges darken and the light gathers
  and tightens; when the chorus or drop arrives it breaks open in a luminous
  bloom with fuller colour, then settles. The whole scene slowly breathes once
  per musical phrase.
- **Gentle songs stay gentle:** soft, slow or undriven music (like solo piano)
  gets smaller, dimmer forms and lots of darkness; full, driving music gets
  larger, brighter, layered light.

## What it listens for

| In the music | In the sky |
| --- | --- |
| Major vs minor (the key and each chord) | Warm golds, peaches and roses ↔ cool violets and blues, muted, blended gradually; each chord change sends a wave of its colour through the fog |
| Volume | How full, large and luminous the forms are |
| Bass | Larger forms swell and are gently pushed; soft pressure waves |
| Midrange | Movement and folding inside the forms |
| High frequencies | Fleeting fine points of light and shimmer; stars glint |
| Tempo | The cadence of gestures and the length of each breath |
| How full and driven it is | How many forms, how bright, and how often new light blooms |
| Builds and arrivals | Tension (gathering, darker edges) and release (a large bloom) |

Key and tempo detection are estimates. They are usually close, but can mix up
relative keys (for example C major and A minor). Tempo is read over about 12
seconds and folded into 72-144 bpm, so very slow or very fast songs show as
double or half time; it changes only when a new tempo holds for a few seconds,
and then glides there.

## Project layout

- `index.html`, `css/style.css`: the page
- `js/listener.js`: audio capture and analysis (loudness, bass/mid/high,
  brightness, key, chords, tempo, melody)
- `js/atmosphere.js`: the sky (WebGL2)
- `js/shared.js`: noise, palettes and mood words
- `js/app.js`: ties it all together

No build step and nothing to install. It's plain HTML, CSS and JavaScript.
An earlier paint style lives in the git history if it's ever wanted again.

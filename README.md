# SoundLab

A browser lab for guitarists, in four sections:

- **Tone Lab:** learn how guitar effects shape sound. Load a clean DI
  recording (or a test signal, or play live), run it through pedals, an amp
  and effects modelled stage by stage, and compare before and after by ear
  and on screen. See [the plan](Guitar%20tone%20lab%20implementation%20plan.md)
  for the why.
- **Live:** play your guitar through an audio interface in real time, with
  the smallest buffer the browser allows: dry, through a Tone Lab branch, or
  as a bass (an octave down into a generic amp or a tube bass head circuit
  model, a cabinet and EQ). It keeps playing while you use the other
  sections.
- **Drum Lab:** a drummer to play along with: simple beats and real
  drummers' grooves on a recorded kit, at any tempo.
- **Theory Lab:** a circle of fifths, the notes and chords of a key, and a
  12-fret fretboard showing any scale by note name or interval.

**Try it online: https://tomasnfh.github.io/SOUND_LAB/**

## Run it

With Docker (app on http://localhost:5173, files in the `tone-data` volume):

```bash
docker compose up --build
```

Without Docker (files in `api/data/`):

```bash
npm --prefix api install && npm --prefix api run dev
```

```bash
npm --prefix web install && npm --prefix web run dev
```

Put clean WAVs (48 kHz, 24-bit, mono, peaks around -12 dBFS) in
`recordings/`, or add them from the page. Cabinet and reverb impulse
responses go in `irs/cabinets/` and `irs/reverbs/`.

## The public version

The [online version](https://tomasnfh.github.io/SOUND_LAB/) runs on GitHub Pages without the api. It's the same
app built with `VITE_STATIC=1`, and recordings, impulse responses and
presets added there stay in the visitor's browser (IndexedDB, see
`web/src/browserStore.ts`). Exports are only downloaded.

- **Daily work:** on `main`, with `docker compose up` as above. Pushing to
  `main` doesn't change the public site.
- **Publishing a new version:** tag it and push the tag. Tags matching `v*`
  are allowed to deploy by the `github-pages` environment's tag rule.

```bash
git tag v0.4.0 && git push origin v0.4.0
```

The `Deploy to GitHub Pages` workflow (`.github/workflows/pages.yml`) builds
and deploys it. To try the static build locally on
http://localhost:4173/SOUND_LAB/:

```bash
cd web && VITE_STATIC=1 BASE_PATH=/SOUND_LAB/ npm run build && BASE_PATH=/SOUND_LAB/ npx vite preview
```

## What's in it

| Part | Where |
| --- | --- |
| Audio engine: sources, A/B crossfade, level matching | `web/src/audio/AudioEngine.ts` |
| Signal chain, built from settings (same code for live and export) | `web/src/audio/Chain.ts`, `settings.ts` |
| EQ, pedals, amp, delay, reverb | `web/src/audio/blocks/` |
| 6V6 combo circuit model (from its service schematic) and its mods | `web/src/audio/combo/` |
| Views: spectrum, waveform, filters, harmonics, transfer, delay & reverb | `web/src/views/` |
| Presets and WAV export | `web/src/components/PresetPanel.tsx`, `web/src/audio/render.ts` |
| File and preset api | `api/src/server.js` |

Keys: Space plays or pauses, B switches between branch A and branch B. The
source feeds two complete chains (A starts dry) and the views compare them.

The 6V6 combo is a small single-ended amp modelled from its service
schematic: the tone stack is solved exactly from its parts, the tube stages use real
component values, and the feedback loop runs per sample in an AudioWorklet.
Its Amp panel has a test-point table comparing the model with the service
manual. Mods (tone knobs, R19 lifted, stack bypass, cathode caps, feedback,
bias, preamp tube, speaker) are switches; put stock in one branch and a mod
in the other to hear exactly that change.

The models are simplified on purpose: they keep the behaviour that matters
for learning (where the clipping happens, which frequencies get gain, what
the tone stack and cabinet do) but won't match a real pedal or amp exactly.

The pedals:

| Pedal | What it shows |
| --- | --- |
| Clean boost (4558) | An op-amp boost; a second circuit adds cuts, a Baxandall and a mid control |
| Mid-hump overdrive | Mid hump, clean bass path, soft diode clipping; a 4558 mode has every part editable |
| Amp-like overdrive | Transistor-style stages, gradual clipping, flatter mids |
| Hard distortion | Hard clipping and a scooped tone; mode II boosts the mids first |
| Clean-blend overdrive | Clean signal blended with clipped signal, keeps the attack |

### Live's tube bass head

The tube head in Live's Bass sound is a circuit model. Its preamp parts and
wiring come from J. Fleig's re-drawing of a classic tube bass preamp's
factory schematic and his LTspice simulation of it, published in
["Bass guitar preamplifier in the … tradition"](http://www.frontiernet.net/~jff/SonOfSVPCL/DIYSVTBassPreamplifierSimulation.html).
The power amp is modelled from published specifications, not a schematic.

## Trademarks

Tone Lab is an independent, non-commercial educational project. The pedals
and amp have generic names and are built from general circuit principles and
commonly published part values. Any product names, brands or trademarks that
may come to mind belong to their respective owners; this project is not
affiliated with, sponsored by or endorsed by any of them, and its models are
approximations that don't claim to reproduce any commercial product.

## License

Code: [MIT](LICENSE). The audio clips in `web/public/clips/` are not part
of the MIT grant; publish only clips you have the right to share.

### Drum Lab sounds and grooves

- **Drum samples** in `web/public/drums/kit/` come from
  [Virtuosity Drums](https://versilian-studios.com/virtuosity-drums/) by
  Versilian Studios, released under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). A few kick,
  snare and hi-hat hits were mixed from their close, overhead and room mics
  and encoded as AAC.
- **Real drummer grooves** in `web/src/drums/grooves.ts` are two-bar excerpts
  from the [Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove)
  by Google LLC, used under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: cut to
  two bars, aligned to the bar line, mapped to five drums and velocities
  scaled. Dataset paper: Jon Gillick, Adam Roberts, Jesse Engel, Douglas Eck
  and David Bamman, "Learning to Groove with Inverse Sequence
  Transformations", ICML 2019.

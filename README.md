# Tone Lab

A browser lab for learning how guitar effects shape sound: load a clean DI
recording (or a test signal, or play live), run it through pedals, an amp
and effects modelled stage by stage, and compare before and after by ear
and on screen. See [the plan](Guitar%20tone%20lab%20implementation%20plan.md)
for the why.

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

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
| Fender Champion 600 circuit model (from the service schematic) and its mods | `web/src/audio/champ/` |
| Views: spectrum, waveform, filters, harmonics, transfer, delay & reverb | `web/src/views/` |
| Presets and WAV export | `web/src/components/PresetPanel.tsx`, `web/src/audio/render.ts` |
| File and preset api | `api/src/server.js` |

Keys: Space plays or pauses, B switches between branch A and branch B. The
source feeds two complete chains (A starts dry) and the views compare them.

The Champion 600 amp is modelled from Fender's schematic (722CAX003): the
tone stack is solved exactly from its parts, the tube stages use real
component values, and the feedback loop runs per sample in an AudioWorklet.
Its Amp panel has a test-point table comparing the model with the service
manual. Mods (tone knobs, R19 lifted, stack bypass, cathode caps, feedback,
bias, preamp tube, speaker) are switches; put stock in one branch and a mod
in the other to hear exactly that change.

The models are simplified on purpose: they keep the behaviour that matters
for learning (where the clipping happens, which frequencies get gain, what
the tone stack and cabinet do) but won't match a real pedal or amp exactly.

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
| Views: spectrum, waveform, filters, harmonics, transfer, delay & reverb | `web/src/views/` |
| Presets and WAV export | `web/src/components/PresetPanel.tsx`, `web/src/audio/render.ts` |
| File and preset api | `api/src/server.js` |

Keys: Space plays or pauses, B switches A (dry) and B (processed).

The models are simplified on purpose: they keep the behaviour that matters
for learning (where the clipping happens, which frequencies get gain, what
the tone stack and cabinet do) but won't match a real pedal or amp exactly.

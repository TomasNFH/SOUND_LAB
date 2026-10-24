# Guitar tone lab: implementation plan

Oct 24, 2026 · @Tomas

## Goal and recommendation

Build a React web page on the browser's Web Audio API: load a clean guitar recording, run it through a Tube Screamer model and a parametric EQ, and compare before and after by ear and on screen.

Why this is the best option:

- **No install, no plugins.** Web Audio runs in any browser and can play, process and analyse audio in real time.
- **You already know React.** The UI (knobs, toggles, charts) is ordinary React; the audio graph lives outside React state.
- **The effects map to real circuits.** Web Audio's `BiquadFilterNode` gives you EQ bands, and `WaveShaperNode` gives you clipping curves. Together they can imitate the Tube Screamer stage by stage.
- **Live input later.** The same graph can take your audio interface as input, so you can play through it once the file version works.

The point is learning, not studio quality. Each block should be switchable and visible, so you can hear and see what every part of the circuit does on its own.

## Tech stack and architecture

Keep it small: React for the controls, the Web Audio API for sound, canvas for the graphs. No backend is needed.

| Part | Choice | Why |
| --- | --- | --- |
| Project setup | Vite + React + TypeScript | Fast to start; types help with audio node wiring |
| Audio engine | Web Audio API, in a plain `AudioEngine` class | Keeps audio out of React re-renders |
| State | React state or Zustand for knob values | Knobs push values to the engine, never the other way |
| Graphs | Canvas 2D + `requestAnimationFrame` | Smooth at 60 fps |
| Knobs | A small custom knob component, or `react-rotary-knob` style | Feels like a pedal |
| Files | `<input type="file">` + `decodeAudioData` | Load your WAVs locally, nothing uploaded |

&#91;embedded content: signal chain · Tube Screamer split into stages\]

The signal splits inside the pedal: the mid branch is driven into the clipper while the bass path stays clean, then both are mixed. Analysers tap the signal at the source and at the output to draw before and after.

### Docker setup

Run everything with Docker Compose, with one volume holding your audio library so files survive rebuilds.

| Service | Role | Notes |
| --- | --- | --- |
| `web` | Vite dev server (later nginx serving the built React app) | Port 5173 in dev |
| `api` | Small Node/Express server | Lists, uploads and serves files from the volume; saves presets as JSON |
| `tone-data` volume | Mounted at `/data` in `api` | Folders: `recordings/`, `irs/cabinets/`, `irs/reverbs/`, `presets/`, `exports/` |

- The browser can't read a Docker volume directly, which is why the small `api` service is needed.
- Audio processing still runs in the browser; Docker only serves the app and stores files.

### What else you need

- **Impulse responses:** a few free speaker cabinet IRs (ideally a 1x8 like the Champion's) and reverb IRs (spring, room, hall).
- **Test signals:** generated sine waves and sweeps for the harmonics and response views.
- **Monitoring:** headphones or monitors through the interface; laptop speakers hide the low end and fizz.
- **AudioWorklet:** for the custom clippers and tape delay wobble, if `WaveShaperNode` and `DelayNode` aren't flexible enough.
- **Real-amp comparison: done by ear in the room with your Champion 600, outside the app (no recordings loaded for now).**

## Effects to implement

Model the Tube Screamer as separate stages that mirror the real circuit, so each one can be bypassed and studied.

### Tube Screamer model

| Stage | Real circuit | Web Audio version | Knob |
| --- | --- | --- | --- |
| Input buffer | Transistor buffer | Skip (no effect on tone) | None |
| Mid hump | 4.7 kΩ + 0.047 µF in feedback, about 720 Hz | Highpass `BiquadFilterNode` on the branch that gets gain | Hump frequency |
| Gain | 4558 op-amp, gain up to about 118x | `GainNode` before the clipper | Drive |
| Soft clipping | Two diodes in the feedback loop | `WaveShaperNode` with a tanh curve, `oversample: '4x'` | Clip type |
| Clean bass path | Gain of 1 below the hump | Parallel dry branch, lowpassed, summed back | None |
| High cut | 51 pF across the drive pot | Lowpass `BiquadFilterNode`, frequency falls as drive rises | None |
| Tone | Passive and active tone stage | Lowpass or high-shelf filter | Tone |
| Level | Output stage | `GainNode` | Level |

The key trick is the split: only the highpassed branch is driven into the clipper, and the bass branch stays clean. That is what makes it different from just boosting mids with an EQ.

Extra switches for learning:

- **Clip type:** symmetric (diodes, odd harmonics) or asymmetric (tube-like, adds even harmonics).
- **Hump frequency:** about 340 Hz, 720 Hz or 1.5 kHz, matching the cap swaps you could make on the real pedal.

### Parametric EQ

- 3 or 4 peaking bands with `BiquadFilterNode` type `peaking`: frequency, gain (±15 dB) and Q per band.
- Optional low-shelf and high-shelf bands at the ends.
- A **position switch**: EQ before or after the Tube Screamer. This is the main experiment: before, it changes what distorts; after, it only colours the result.

One honest limit: this is a simplified model. It captures the behaviour that matters for learning, but it won't match a real pedal exactly.

### More pedals from the same blocks

Build every pedal from shared blocks (filters, gain stages, clippers, clean blend), so comparing them shows what each design choice does.

| Pedal | Key idea to learn | Blocks |
| --- | --- | --- |
| Tube Screamer | Mid hump, clean bass path, soft clipping | Highpass branch, tanh clipper, high cut |
| Boss Blues Driver | Transistor stages, gradual clipping, flatter mids, amp-like | Two or three gentle clippers in series, mild EQ between |
| Boss DS-2 Turbo | Hard clipping, more high harmonics; Turbo mode adds a mid boost before clipping | Peaking EQ, hard clipper, tone filter |
| Klon Centaur | Clean signal blended with clipped signal, keeps the attack | Parallel clean path that rises with gain, soft clipper |

### Amp block

Model your own amp, the Fender Champion 600, as stages you can see and switch. It won't match the real amp exactly, but you can compare it by ear with your Champion.

- **Preamp:** a waveshaper that saturates gently as volume rises.
- **Tone stack:** Fender-style bass/middle/treble filters, with the response curve drawn.
- **Power amp:** mild saturation and compression at high volume.
- **Cabinet:** a `ConvolverNode` loading a speaker impulse response (IR) WAV. It cuts the harsh highs and matters as much as the amp.
- **Key experiment:** the same pedal into a clean amp vs a crunchy amp.

### Delay and reverb

Put them after the amp, as on a real pedalboard's effects loop or at the end of the chain, and add a pre/post-amp switch to hear the difference.

| Effect | Web Audio version | Knobs | What to learn |
| --- | --- | --- | --- |
| Digital delay | `DelayNode` with a feedback `GainNode` | Time, feedback, mix | Echo spacing and repeats |
| Tape/analog-style delay | Same, plus a lowpass in the feedback loop and slow LFO modulation of the time | Time, feedback, tone, wow | Why repeats get darker and wobble |
| Spring reverb | Convolver with a spring IR, or a short delay network with a drip-like filter | Mix, tone | The splashy surf sound |
| Room/hall reverb | `ConvolverNode` with room or hall IRs | Mix, size (choice of IR) | Space and depth |

- **Visual:** draw the delay's repeats as decaying spikes, and the reverb's IR as a fading waveform.

## Visualizations

Show four views, each answering one question about the sound. Before and after always share the same scale so the difference is honest.

| View | Question it answers | How to build it |
| --- | --- | --- |
| Waveform overlay | How does the shape change? | Zoom on a few cycles of one note; dry in grey, processed in colour, from `AnalyserNode.getFloatTimeDomainData` |
| Spectrum, before vs after | How does the colour of the sound change? | Two `AnalyserNode`s (fftSize 8192), log frequency axis 20 Hz to 20 kHz, dB axis, smoothed |
| Frequency response | What does this EQ or filter do on its own? | `BiquadFilterNode.getFrequencyResponse` for each band, multiplied together |
| Harmonics bars | Which new frequencies did the distortion add? | Play a test sine (for example 220 Hz) through the chain and plot the level of 1x to 10x |

Useful extras:

- **Difference curve:** after minus before, in dB, on the spectrum view. It shows exactly where the colour moved.
- **Transfer curve:** input level against output level for the clipper. Hard and soft clipping look obviously different here.
- **Band highlight:** when you drag an EQ band, shade that frequency range on the spectrum.
- **Level matching (A/B):** match loudness between dry and processed before comparing. Louder almost always sounds "better," so without this the comparison lies.

For charts, draw on `<canvas>` with `requestAnimationFrame`. Chart libraries are too slow for 60 updates per second.

## Recording clean guitar

Record a DI track: guitar straight into the interface's instrument (Hi-Z) input, no amp, no pedals, no plugins.

- **Format:** WAV, 48 kHz, 24-bit, mono.
- **Level:** peaks around −12 dBFS, never clipping. The model's drive knob should do all the distorting.
- **Clips to record:** single open notes (low E, A, high E), a power chord, an open chord, a short riff, and the same riff picked hard and soft. Picking dynamics matter a lot with a Tube Screamer.
- **Both pickups:** neck and bridge, so you can hear how the input tone changes the result.
- **Live input (later):** `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` all off, otherwise the browser will ruin the tone. Expect some latency in the browser; it's fine for learning.

### Input sources, in priority order

| Priority | Input | Use it for |
| --- | --- | --- |
| 1, main | Recorded clean WAV, looped | Every listening comparison: same playing each time, so only the settings change |
| 2, analysis | Built-in sine and frequency sweep generator | Harmonics bars, transfer curve, EQ and filter response |
| 3, optional, last step | Live input from the interface | Playing through the chain for fun; adds latency and varies each take |

## Roadmap

Build in five phases, each one usable on its own. Don't start the next until the current one is done.

1. **Player and A/B.** Load a WAV, play and loop it, bypass switch, level matching.
   - Done when: you can switch dry and processed mid-playback with no click or volume jump.
2. **Visualizations.** Waveform overlay and before/after spectrum, with a plain gain node as the "effect."
   - Done when: raising the gain shows up correctly on both views.
3. **Parametric EQ.** Bands with knobs, the frequency response curve, the before/after position switch.
   - Done when: the drawn response curve matches the change you see on the spectrum.
4. **Tube Screamer model.** The stages from the effects table, the clip type switch, the hump switch, the harmonics and transfer views.
   - Done when: low drive sounds like a mid boost, and high drive adds harmonics you can see on the bars.
5. **Presets and export.** Save and load settings, export a processed WAV.
   - Done when: you can recall a saved preset and export a processed clip.

6) **More pedals and the amp.** Blues Driver, DS-2 and Klon models, then the Champion 600 model with a cabinet IR.
   - Done when: you can swap pedals in front of the amp and hear the same pedal into clean vs crunchy amp settings.
7) **Delay and reverb.** Digital and tape-style delay, spring and room reverb, pre/post-amp switch.
   - Done when: you can hear and see why tape repeats get darker and how the reverb IR shapes the space.

8. **Live input (optional, last).** Play through the interface with `getUserMedia`, browser processing turned off.
   - Done when: you can play live with acceptable latency.

Phases 1 and 2 are the base for everything; most of the learning happens in 3 and 4.

## Learning experiments

Once it works, use it to answer these questions by ear first, then check the screen:

- [ ] Boost 800 Hz by 9 dB with the EQ, then compare with the Tube Screamer at low drive. Why do they sound different?
- [ ] Put the EQ before vs after the Tube Screamer with the same settings. Which changes the character more?
- [ ] Switch the hump between 340 Hz, 720 Hz and 1.5 kHz. Which sounds full, which sounds tight?
- [ ] Compare symmetric and asymmetric clipping on a single note. Can you hear the octave harmonic?
- [ ] Bypass the clean bass path. What happens to low notes and chords?
- [ ] Sweep a narrow EQ boost across a tone you like and name the bands: mud, honk, bite, fizz.
- [ ] Turn drive up on a chord vs a single note. Where does it start to sound messy, and why?

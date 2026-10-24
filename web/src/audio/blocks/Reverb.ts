import { loadIr, runBiquad } from '../ir';
import type { ReverbSettings } from '../settings';
import { lerp, setParam, type Block } from '../util';

// Convolution reverb: the sound of a space (or a spring tank) captured as
// an impulse response. The built-in IRs are generated here; any IR WAV in
// irs/reverbs can be used instead.
//
//   in ─┬────────────────────────────── out
//       └─ convolver ─ tone LP ─ mix ──┘

export const BUILT_IN_REVERBS = {
  spring: { name: 'Spring tank', rt60: 2.2 },
  room: { name: 'Room', rt60: 0.7 },
  hall: { name: 'Hall', rt60: 2.8 },
} as const;
export type BuiltInReverb = keyof typeof BUILT_IN_REVERBS;

export const isBuiltInReverb = (t: string): t is BuiltInReverb => t in BUILT_IN_REVERBS;

export function reverbTail(s: ReverbSettings, irSeconds?: number) {
  if (!s.on) return 0;
  return isBuiltInReverb(s.type) ? BUILT_IN_REVERBS[s.type].rt60 : (irSeconds ?? 3);
}

// Seeded noise, so the same IR (and so the same export) comes out every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

// Room and hall: a few early reflections, then dense noise decaying
// exponentially, losing highs faster than lows (air and walls absorb
// treble), which is why a tail sounds darker as it fades.
function synthSpace(ctx: BaseAudioContext, rt60: number, predelay: number, reflections: number[], seed: number) {
  const sr = ctx.sampleRate;
  const n = Math.round((rt60 + predelay + 0.1) * sr);
  const ir = ctx.createBuffer(1, n, sr);
  const d = ir.getChannelData(0);
  const rand = rng(seed);
  const pre = Math.round(predelay * sr);
  const decay = Math.log(1000) / rt60; // amplitude e^(-decay t) is -60 dB at rt60

  let lp = 0;
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / sr;
    // One-pole lowpass whose cutoff falls as the tail goes on.
    const cutoff = lerp(9000, 1500, Math.min(1, t / rt60));
    const a = Math.exp((-2 * Math.PI * cutoff) / sr);
    lp = (1 - a) * rand() + a * lp;
    // Fade the diffuse tail in over the first 30 ms.
    d[i] = lp * Math.exp(-decay * t) * Math.min(1, t / 0.03);
  }
  reflections.forEach((ms, k) => {
    const i = pre + Math.round((ms / 1000) * sr);
    if (i < n) d[i] += (k % 2 ? -1 : 1) * 0.5 * Math.exp((-decay * ms) / 1000);
  });
  return normalizeEnergy(ir);
}

// Spring tank: a dispersive "boing". Each pass along the spring smears
// the sound into a chirp, and it bounces back and forth every ~30 ms,
// decaying each time. Bandlimited like a real tank's transducers.
function synthSpring(ctx: BaseAudioContext, seed: number) {
  const sr = ctx.sampleRate;
  const rt60 = BUILT_IN_REVERBS.spring.rt60;
  const n = Math.round(rt60 * sr);
  const ir = ctx.createBuffer(1, n, sr);
  const d = ir.getChannelData(0);
  const rand = rng(seed);
  const decay = Math.log(1000) / rt60;
  const roundTrip = 0.033;
  const chirpLen = 0.025;

  for (let k = 0; k * roundTrip < rt60; k++) {
    const start = Math.round(k * roundTrip * sr + 0.004 * sr);
    const amp = Math.exp(-decay * k * roundTrip);
    // Each bounce smears more: the chirp gets longer and noisier.
    const len = Math.round(chirpLen * (1 + 0.15 * k) * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sr;
      const T = len / sr;
      // Frequency falls from ~3 kHz to ~300 Hz across the chirp.
      const phase = 2 * Math.PI * (3000 * t - ((3000 - 300) * t * t) / (2 * T));
      const env = Math.sin((Math.PI * i) / len);
      d[start + i] += amp * env * (0.8 * Math.sin(phase) + 0.25 * rand());
    }
  }
  runBiquad(d, sr, { type: 'highpass', f: 180, q: 0.7 });
  runBiquad(d, sr, { type: 'lowpass', f: 4500, q: 0.7 });
  return normalizeEnergy(ir);
}

// Unit energy: noise through the reverb comes out at the same power, so
// the mix knob means the same thing for every IR.
export function normalizeEnergy(ir: AudioBuffer) {
  let e = 0;
  for (let c = 0; c < ir.numberOfChannels; c++) for (const v of ir.getChannelData(c)) e += v * v;
  const g = e > 0 ? 1 / Math.sqrt(e / ir.numberOfChannels) : 1;
  for (let c = 0; c < ir.numberOfChannels; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return ir;
}

export function builtInReverbIR(ctx: BaseAudioContext, type: BuiltInReverb) {
  switch (type) {
    case 'spring':
      return synthSpring(ctx, 7);
    case 'room':
      return synthSpace(ctx, BUILT_IN_REVERBS.room.rt60, 0.004, [7, 11, 17, 23, 31], 11);
    case 'hall':
      return synthSpace(ctx, BUILT_IN_REVERBS.hall.rt60, 0.025, [19, 31, 43, 61, 79], 23);
  }
}

export class Reverb implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly conv: ConvolverNode;
  private readonly tone: BiquadFilterNode;
  private readonly wet: GainNode;
  private type: string | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.conv.normalize = false;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.wet = ctx.createGain();
    this.input.connect(this.output);
    this.input.connect(this.conv).connect(this.tone).connect(this.wet).connect(this.output);
  }

  get impulseResponse() {
    return this.conv.buffer;
  }

  ready() {
    return this.pending;
  }

  apply(s: ReverbSettings) {
    setParam(this.wet.gain, s.mix, this.ctx);
    setParam(this.tone.frequency, lerp(1500, 16000, s.tone * s.tone), this.ctx);
    if (s.type === this.type) return;
    this.type = s.type;
    if (isBuiltInReverb(s.type)) {
      this.conv.buffer = builtInReverbIR(this.ctx, s.type);
      this.pending = Promise.resolve();
      return;
    }
    const name = s.type;
    this.pending = loadIr('reverbs', name)
      .then((buf) => {
        if (this.type !== name) return;
        // Copy before normalizing: the cached buffer is shared.
        const copy = this.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
        for (let c = 0; c < buf.numberOfChannels; c++) copy.copyToChannel(buf.getChannelData(c), c);
        this.conv.buffer = normalizeEnergy(copy);
      })
      .catch((err) => console.warn(`Reverb IR ${name} failed to load, keeping the previous one`, err));
  }
}

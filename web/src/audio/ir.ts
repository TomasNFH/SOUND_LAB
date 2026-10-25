import { fetchFile, type AudioFolder } from '../api';

// Impulse responses: built-in ones synthesized here, user ones loaded
// from the api's IR folders. Loaded files are cached and shared between
// the live context and offline export contexts (both run at 48 kHz).

export type BiquadSpec = { type: 'lowpass' | 'highpass' | 'peaking'; f: number; q: number; gain?: number };

// RBJ cookbook biquad run over a buffer in place (direct form I).
export function runBiquad(data: Float32Array, sr: number, s: BiquadSpec) {
  const w0 = (2 * Math.PI * s.f) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * s.q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (s.type === 'peaking') {
    const A = Math.pow(10, (s.gain ?? 0) / 40);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    const lp = s.type === 'lowpass';
    b0 = lp ? (1 - cos) / 2 : (1 + cos) / 2;
    b1 = lp ? 1 - cos : -(1 + cos);
    b2 = b0;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

// Built-in speakers, as filter shapes turned into impulse responses.
// Each has a low end set by cone size and cabinet, resonance and cone
// break-up peaks, and a steep fall above ~5 kHz. That steep top is what
// takes the fizz off distortion; it matters as much as the amp.
export const BUILT_IN_CABS = {
  champ6: 'Stock 6"',
  smooth6: 'Upgraded 6" (smoother)',
  cab10: '10" cabinet',
  builtin: 'Generic small combo',
} as const;
export type BuiltInCab = keyof typeof BUILT_IN_CABS;
export const isBuiltInCab = (c: string): c is BuiltInCab => c in BUILT_IN_CABS;

const CAB_VOICINGS: Record<BuiltInCab, BiquadSpec[]> = {
  // Small 6" in a small open-back box: little below ~130 Hz, a forward,
  // slightly harsh upper-mid peak, early top-end roll-off.
  champ6: [
    { type: 'highpass', f: 130, q: 0.9 },
    { type: 'highpass', f: 90, q: 0.6 },
    { type: 'peaking', f: 180, q: 1.6, gain: 3 },
    { type: 'peaking', f: 1100, q: 1.0, gain: 2 },
    { type: 'peaking', f: 3000, q: 2.2, gain: 5 },
    { type: 'lowpass', f: 5500, q: 0.8 },
    { type: 'lowpass', f: 6000, q: 0.6 },
  ],
  // Same size, better speaker: fuller low-mids, a tamer upper-mid peak.
  smooth6: [
    { type: 'highpass', f: 115, q: 0.8 },
    { type: 'highpass', f: 85, q: 0.6 },
    { type: 'peaking', f: 220, q: 1.2, gain: 3 },
    { type: 'peaking', f: 3000, q: 2.0, gain: 2 },
    { type: 'lowpass', f: 5200, q: 0.8 },
    { type: 'lowpass', f: 6000, q: 0.6 },
  ],
  // A 10" in a bigger box: an octave more bass, darker top.
  cab10: [
    { type: 'highpass', f: 75, q: 0.8 },
    { type: 'highpass', f: 55, q: 0.6 },
    { type: 'peaking', f: 110, q: 1.4, gain: 4 },
    { type: 'peaking', f: 450, q: 1.2, gain: -2 },
    { type: 'peaking', f: 2200, q: 1.5, gain: 3 },
    { type: 'lowpass', f: 4600, q: 0.8 },
    { type: 'lowpass', f: 5200, q: 0.6 },
  ],
  builtin: [
    { type: 'highpass', f: 85, q: 0.8 },
    { type: 'highpass', f: 60, q: 0.6 },
    { type: 'peaking', f: 120, q: 1.4, gain: 4 },
    { type: 'peaking', f: 450, q: 1.2, gain: -2 },
    { type: 'peaking', f: 1800, q: 1.2, gain: 3 },
    { type: 'peaking', f: 3200, q: 2.5, gain: 4 },
    { type: 'lowpass', f: 4800, q: 0.8 },
    { type: 'lowpass', f: 5200, q: 0.6 },
    { type: 'lowpass', f: 7000, q: 0.5 },
  ],
};

export function synthCabinetIR(ctx: BaseAudioContext, voicing: BuiltInCab = 'builtin') {
  const sr = ctx.sampleRate;
  const n = Math.round(0.08 * sr);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  d[0] = 1;
  for (const s of CAB_VOICINGS[voicing]) runBiquad(d, sr, s);
  return buffer;
}

// Scale an IR so its average gain over 500 Hz–2 kHz is 0 dB. Use it with
// convolver.normalize = false: switching between IRs (or the cab on and
// off) then changes the tone, not the loudness.
export function levelIr(ctx: BaseAudioContext, ir: AudioBuffer) {
  const freqs = [500, 700, 1000, 1400, 2000];
  const d = ir.getChannelData(0);
  let sum = 0;
  for (const f of freqs) {
    const w = (2 * Math.PI * f) / ir.sampleRate;
    let re = 0;
    let im = 0;
    for (let i = 0; i < d.length; i++) {
      re += d[i] * Math.cos(w * i);
      im -= d[i] * Math.sin(w * i);
    }
    sum += Math.hypot(re, im);
  }
  const scale = sum > 0 ? freqs.length / sum : 1;
  const out = ctx.createBuffer(ir.numberOfChannels, ir.length, ir.sampleRate);
  for (let c = 0; c < ir.numberOfChannels; c++) {
    const src = ir.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * scale;
  }
  return out;
}

const cache = new Map<string, Promise<AudioBuffer>>();

// Decode needs a realtime or offline context; any one at 48 kHz works and
// the result can be used in all of them.
let decoder: BaseAudioContext | null = null;
export function setIrDecoder(ctx: BaseAudioContext) {
  decoder = ctx;
}

export function loadIr(folder: AudioFolder, name: string): Promise<AudioBuffer> {
  const key = `${folder}/${name}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const data = await fetchFile(folder, name);
      const ctx = decoder ?? new OfflineAudioContext(1, 1, 48000);
      return ctx.decodeAudioData(data);
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

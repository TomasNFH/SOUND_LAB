// Built-in test signals, for analysis rather than listening.

// Pink noise (equal energy per octave): flat on a log spectrum, so EQ and
// filter curves show up directly in the before/after difference.
// Paul Kellet's filter on white noise.
export function makePinkNoise(ctx: BaseAudioContext, seconds: number, peakDb = -12) {
  const n = Math.round(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  normalize(d, peak, peakDb);
  fadeEdges(d, ctx.sampleRate);
  return buffer;
}

// Exponential sweep from f0 to f1, with a short silence after it so each
// pass is separate when looped.
export function makeLogSweep(ctx: BaseAudioContext, seconds: number, f0 = 20, f1 = 20000, peakDb = -12) {
  const sr = ctx.sampleRate;
  const sweepN = Math.round(seconds * sr);
  const buffer = ctx.createBuffer(1, sweepN + Math.round(0.5 * sr), sr);
  const d = buffer.getChannelData(0);
  const k = Math.log(f1 / f0);
  for (let i = 0; i < sweepN; i++) {
    const t = i / sr;
    // Phase of an exponential chirp: integral of f0 * e^(k t / T).
    const phase = ((2 * Math.PI * f0 * seconds) / k) * (Math.exp((k * t) / seconds) - 1);
    d[i] = Math.sin(phase);
  }
  normalize(d, 1, peakDb);
  fadeEdges(d.subarray(0, sweepN), sr);
  return buffer;
}

function normalize(d: Float32Array, peak: number, peakDb: number) {
  const g = Math.pow(10, peakDb / 20) / (peak || 1);
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

function fadeEdges(d: Float32Array, sr: number) {
  const n = Math.min(Math.round(0.005 * sr), d.length >> 1);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    d[i] *= g;
    d[d.length - 1 - i] *= g;
  }
}

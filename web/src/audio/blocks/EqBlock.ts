import type { EqSettings } from '../settings';
import { setParam, type Block } from '../util';

// Parametric EQ: one BiquadFilterNode per band, in series. A band that is
// off keeps its place in the chain with 0 dB gain, so toggling it never
// rewires the graph.
export class EqBlock implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly filters: BiquadFilterNode[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    bandCount: number,
  ) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    let prev: AudioNode = this.input;
    for (let i = 0; i < bandCount; i++) {
      const f = ctx.createBiquadFilter();
      prev.connect(f);
      prev = f;
      this.filters.push(f);
    }
    prev.connect(this.output);
  }

  apply(eq: EqSettings) {
    eq.bands.forEach((band, i) => {
      const f = this.filters[i];
      if (!f) return;
      if (f.type !== band.type) f.type = band.type;
      setParam(f.frequency, band.freq, this.ctx);
      setParam(f.gain, band.on ? band.gain : 0, this.ctx);
      setParam(f.Q, band.q, this.ctx);
    });
  }
}

// Magnitude response in dB of filters in series, at the given frequencies.
// Computed from the settings with a throwaway filter, so it shows the
// target curve rather than a value halfway through a ramp.
export function filterResponseDb(
  ctx: BaseAudioContext,
  specs: { type: BiquadFilterType; freq: number; gain: number; q: number }[],
  freqs: Float32Array,
) {
  const total = new Float32Array(freqs.length);
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  const f = ctx.createBiquadFilter();
  for (const s of specs) {
    f.type = s.type;
    f.frequency.value = s.freq;
    f.gain.value = s.gain;
    f.Q.value = s.q;
    f.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < freqs.length; i++) total[i] += 20 * Math.log10(Math.max(mag[i], 1e-9));
  }
  return total;
}

export function eqResponseDb(ctx: BaseAudioContext, eq: EqSettings, freqs: Float32Array, onlyBand?: number) {
  const bands = eq.bands
    .map((b, i) => ({ ...b, i }))
    .filter((b) => b.on && (onlyBand === undefined || b.i === onlyBand));
  return filterResponseDb(
    ctx,
    bands.map((b) => ({ type: b.type, freq: b.freq, gain: b.gain, q: b.q })),
    freqs,
  );
}

// Frequency range a band mostly acts on, for highlighting on the spectrum.
export function bandRange(band: { type: string; freq: number; q: number }) {
  if (band.type === 'lowshelf') return { lo: 20, hi: band.freq };
  if (band.type === 'highshelf') return { lo: band.freq, hi: 20000 };
  // Bandwidth in octaves for a peaking filter of quality Q.
  const bw = (2 / Math.LN2) * Math.asinh(1 / (2 * band.q));
  return { lo: band.freq * Math.pow(2, -bw / 2), hi: band.freq * Math.pow(2, bw / 2) };
}

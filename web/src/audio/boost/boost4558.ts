// Clean boost with a JRC4558, from the netlist clean_boost_4558.cir:
// a non-inverting op-amp stage on a single 9 V supply.
//
//   in ─ C1 ─┬─ U1A + ─┬─ out ─ C3 ─ volume pot (A10k) ─┬─ out ─ amp (1 MΩ)
//            R1        │                                 │
//          (VREF)      └─ Rgain (A250k) ─ − ─ R2 ─ C2 ─ gnd
//
// Every part is a setting. In the audio band the gain is 1 + Rgain / R2;
// C2 makes it fall back to 1 at very low frequency; C1·R1 and C3 into the
// volume pot and the amp's input are high-passes. The netlist's op-amp
// model is linear; here the output also clips about 1.5 V short of each
// supply rail, as a real 4558 does.

import { bilinear, cascade, type Filter } from '../combo/circuit';
import type { BoostSettings } from '../settings';

const S0 = 2 * Math.PI * 1000;
const GBW = 3e6; // 4558 gain-bandwidth product, Hz
const AMP_INPUT = 1e6; // what the pedal drives
const RAIL_MARGIN = 1.5; // V the output can't reach from each rail

// Audio-taper pot: 10% of the resistance at half rotation.
const taper = (pos: number) => (Math.pow(81, Math.min(1, Math.max(0, pos))) - 1) / 80;

export function boostValues(s: BoostSettings) {
  const rGain = Math.max(1, taper(s.gainPos) * s.gainPot);
  const rv = Math.max(1e-4, taper(s.volPos));
  const rTop = Math.max(1, (1 - rv) * s.volPot);
  const rBottom = Math.max(1, rv * s.volPot);
  const zLow = (rBottom * AMP_INPUT) / (rBottom + AMP_INPUT);
  const gain = 1 + rGain / s.r2; // op-amp gain in the audio band
  const outLevel = zLow / (rTop + zLow); // volume pot (and amp load) divider
  return {
    rGain,
    rTop,
    zLow,
    gain,
    outLevel,
    headroom: s.supply / 2 - RAIL_MARGIN, // V peak at the op-amp output
    corners: {
      input: 1 / (2 * Math.PI * s.r1 * s.c1), // C1 into R1
      shelfLow: 1 / (2 * Math.PI * (s.r2 + rGain) * s.c2), // gain starts rising
      shelfHigh: 1 / (2 * Math.PI * s.r2 * s.c2), // full gain from here up
      output: 1 / (2 * Math.PI * s.c3 * (rTop + zLow)), // C3 into the volume pot
      bandwidth: GBW / gain, // op-amp runs out of gain
    },
  };
}

// The three sections as filters in σ = s / s0 (ascending powers).
function sections(s: BoostSettings) {
  const v = boostValues(s);
  const t1 = s.r1 * s.c1;
  const input = { num: [0, t1 * S0], den: [1, t1 * S0] };
  const gainShelf = { num: [1, s.c2 * (s.r2 + v.rGain) * S0], den: [1, s.c2 * s.r2 * S0] };
  const bw = { num: [1], den: [1, S0 / (2 * Math.PI * v.corners.bandwidth)] };
  const t3 = s.c3 * (v.rTop + v.zLow);
  const output = { num: [0, s.c3 * v.zLow * S0], den: [1, t3 * S0] };
  return { v, input, gainShelf, bw, output };
}

type Poly = { num: number[]; den: number[] };
function polyAt(p: Poly, w: number) {
  const ev = (cs: number[]) => {
    let re = 0;
    let im = 0;
    const x = w / S0;
    cs.forEach((cf, k) => {
      // (jx)^k
      const mag = cf * Math.pow(x, k);
      const r = k % 4;
      if (r === 0) re += mag;
      else if (r === 1) im += mag;
      else if (r === 2) re -= mag;
      else im -= mag;
    });
    return { re, im };
  };
  const n = ev(p.num);
  const d = ev(p.den);
  return Math.hypot(n.re, n.im) / Math.hypot(d.re, d.im);
}

// Small-signal response of the whole pedal, in dB (no clipping).
export function boostResponseDb(s: BoostSettings, freqs: Float32Array) {
  const sec = sections(s);
  const out = new Float32Array(freqs.length);
  freqs.forEach((f, i) => {
    const w = 2 * Math.PI * f;
    const g = polyAt(sec.input, w) * polyAt(sec.gainShelf, w) * polyAt(sec.bw, w) * polyAt(sec.output, w);
    out[i] = 20 * Math.log10(Math.max(1e-9, g));
  });
  return out;
}

// Op-amp output clipping near the rails: straight, then a fairly hard knee.
export const railClip = (x: number, v: number) => x / Math.pow(1 + Math.pow(Math.abs(x / v), 5), 1 / 5);

// Input volts → output volts in the audio band, for the transfer view.
export function boostTransfer(s: BoostSettings) {
  const v = boostValues(s);
  return (x: number) => v.outLevel * railClip(v.gain * x, v.headroom);
}

export type BoostWorkletParams = { pre: Filter; headroom: number; post: Filter };

// Coefficients at the oversampled rate: everything up to the op-amp
// output, the clip, then C3 and the volume pot.
export function boostWorkletParams(s: BoostSettings, fsOversampled: number): BoostWorkletParams {
  const sec = sections(s);
  const d = (p: Poly) => bilinear(p.num, p.den, fsOversampled, S0);
  return {
    pre: cascade(d(sec.input), d(sec.gainShelf), d(sec.bw)),
    headroom: sec.v.headroom,
    post: d(sec.output),
  };
}

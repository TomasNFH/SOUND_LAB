// Boost + EQ with two JRC4558s, from boost_eq_cortes_bypass_2x4558.cir:
//
//   in ─ C1 ─ U2A boost ─┬─ cut block (CLC/RLC low cut, RHC/CHC high cut) ─┐
//                        └──────────────── bypass ────────────────── SPDT ─┴─ U2B Baxandall
//        ─ U1A mids (resonant arm: RQ, CRES and the U1B gyrator) ─ C3 ─ volume ─ out
//
// The circuit is split at the three op-amp outputs that carry the signal
// (U2A, U2B, U1A): each is close to an ideal voltage source, so each
// stage is a linear network solved from its parts, and each output clips
// about 1.5 V short of the supply rails, as a real 4558 does. All stages
// sit at VREF (4.5 V) and are DC-coupled, so VREF is ground for the signal.

import type { Filter } from '../combo/circuit';
import type { BoostEqSettings } from '../settings';
import { gainAt, sections, transferPolys, type El } from './opampNet';

const S0 = 2 * Math.PI * 1000;
const GBW = 3e6;
const AMP_INPUT = 1e6;
const RAIL_MARGIN = 1.5;

const taper = (pos: number) => (Math.pow(81, Math.min(1, Math.max(0, pos))) - 1) / 80;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const atLeast1 = (r: number) => Math.max(1, r);

// What each knob turns into, in ohms, as in the netlist's .param line.
export function boostEqValues(s: BoostEqSettings) {
  const rGain = atLeast1(taper(s.gainPos) * s.gainPot); // BOOST
  const corteG = (1 - clamp01(s.lowCut)) * s.lowCutPot; // CORTEG: full pot = least cut
  const corteA = clamp01(s.highCut) * s.highCutPot; // CORTEA
  const frec = (1 - clamp01(s.freq)) * s.freqPot; // FREC: 0 Ω = highest mid
  const q = clamp01(s.width) * s.qPot; // Q
  const gain = 1 + rGain / s.r2;
  // Gyrator: U1B makes CA, RF and RS look like an inductor L = RS·RF·CA
  // (with RS in series), resonating with CRES.
  const rfTotal = s.rf + frec;
  const inductance = s.rs * rfTotal * s.ca;
  const rv = Math.max(1e-4, taper(s.volPos));
  const rTop = atLeast1((1 - rv) * s.volPot);
  const rBottom = atLeast1(rv * s.volPot);
  const zLow = (rBottom * AMP_INPUT) / (rBottom + AMP_INPUT);
  return {
    rGain,
    corteG,
    corteA,
    frec,
    q,
    gain,
    rfTotal,
    inductance,
    rTop,
    rBottom,
    zLow,
    outLevel: zLow / (rTop + zLow),
    headroom: s.supply / 2 - RAIL_MARGIN,
    corners: {
      input: 1 / (2 * Math.PI * s.r1 * s.c1),
      shelfLow: 1 / (2 * Math.PI * (s.r2 + rGain) * s.c2),
      shelfHigh: 1 / (2 * Math.PI * s.r2 * s.c2),
      bandwidth: GBW / gain,
      // The cut corners are approximate: the Baxandall loads the block.
      lowCut: 1 / (2 * Math.PI * (s.rlc + corteG) * s.clc),
      highCut: 1 / (2 * Math.PI * (s.rhc + corteA) * s.chc),
      bass: 1 / (2 * Math.PI * (s.bassPot / 2) * s.cb1),
      treble: 1 / (2 * Math.PI * s.rt3 * s.ct1),
      mid: 1 / (2 * Math.PI * Math.sqrt(inductance * s.cres)),
      output: 1 / (2 * Math.PI * s.c3 * (rTop + zLow)),
    },
  };
}

// The four linear stages as netlists, node names as in the .cir file.
export function stages(s: BoostEqSettings) {
  const v = boostEqValues(s);
  const R = (a: string, b: string, value: number): El => ({ kind: 'R', a, b, value: atLeast1(value) });
  const C = (a: string, b: string, value: number): El => ({ kind: 'C', a, b, value });
  const pot = (pos: number, total: number) => [atLeast1(total * (1 - clamp01(pos))), atLeast1(total * clamp01(pos))];

  // U2A: input → O2A
  const boost: El[] = [
    C('in', 'NP', s.c1),
    R('NP', 'gnd', s.r1),
    { kind: 'OA', p: 'NP', n: 'N2A', out: 'O2A' },
    R('O2A', 'N2A', v.rGain),
    R('N2A', 'NC2', s.r2),
    C('NC2', 'gnd', s.c2),
  ];

  // Cut block (unless bypassed) and U2B: O2A → O2B. The source is U2A's
  // output, renamed 'in'.
  const [rga, rgb] = pot(s.bass, s.bassPot);
  const [raa, rab] = pot(s.treble, s.treblePot);
  const bin = s.bypass ? 'in' : 'LP';
  const baxandall: El[] = [
    ...(s.bypass
      ? []
      : [C('in', 'LC', s.clc), R('LC', 'gnd', s.rlc + v.corteG), R('LC', 'LP', s.rhc + v.corteA), C('LP', 'gnd', s.chc)]),
    R(bin, 'BA', s.rb1),
    R('BA', 'BW', rga),
    R('BW', 'BB', rgb),
    C('BA', 'BW', s.cb1),
    C('BW', 'BB', s.cb2),
    R('BB', 'O2B', s.rb2),
    R('BW', 'N2B', s.rb3),
    C(bin, 'TA', s.ct1),
    R('TA', 'TW', raa),
    R('TW', 'TB', rab),
    C('TB', 'O2B', s.ct2),
    R('TW', 'N2B', s.rt3),
    { kind: 'OA', p: 'gnd', n: 'N2B', out: 'O2B' },
  ];

  // U1A mids with the U1B gyrator: O2B → O1A.
  const [rmb, rma] = pot(s.mid, s.midPot); // RMa = MED · pot, RMb = (1 − MED) · pot
  const mids: El[] = [
    R('in', 'P', s.ra),
    R('O1A', 'NN', s.rb),
    R('P', 'W', rma),
    R('W', 'NN', rmb),
    R('W', 'NQ', s.rq + v.q),
    C('NQ', 'X', s.cres),
    { kind: 'OA', p: 'P', n: 'NN', out: 'O1A' },
    C('X', 'GP', s.ca),
    R('GP', 'gnd', v.rfTotal),
    R('GO', 'X', s.rs),
    { kind: 'OA', p: 'GP', n: 'GO', out: 'GO' },
  ];

  // C3, volume pot and the amp's input: O1A → OUT.
  const output: El[] = [C('in', 'N3', s.c3), R('N3', 'OUT', v.rTop), R('OUT', 'gnd', v.rBottom), R('OUT', 'gnd', AMP_INPUT)];

  return {
    v,
    list: [
      { els: boost, out: 'O2A' },
      { els: baxandall, out: 'O2B' },
      { els: mids, out: 'O1A' },
      { els: output, out: 'OUT' },
    ],
  };
}

const bwAt = (bandwidth: number, f: number) => {
  const x = f / bandwidth;
  return { re: 1 / (1 + x * x), im: -x / (1 + x * x) };
};

// Small-signal response of the whole pedal in dB, solved directly at
// each frequency (no clipping). `upTo` stops after that many stages.
export function boostEqResponseDb(s: BoostEqSettings, freqs: Float32Array, upTo = 4) {
  const st = stages(s);
  const out = new Float32Array(freqs.length);
  freqs.forEach((f, i) => {
    const w = 2 * Math.PI * f;
    let re = 1;
    let im = 0;
    st.list.slice(0, upTo).forEach((stage, k) => {
      const g = gainAt(stage.els, stage.out, w);
      const h = k === 0 ? mulC(g, bwAt(st.v.corners.bandwidth, f)) : g;
      [re, im] = [re * h.re - im * h.im, re * h.im + im * h.re];
    });
    out[i] = 20 * Math.log10(Math.max(1e-9, Math.hypot(re, im)));
  });
  return out;
}
const mulC = (a: { re: number; im: number }, b: { re: number; im: number }) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const railClip = (x: number, v: number) => x / Math.pow(1 + Math.pow(Math.abs(x / v), 5), 1 / 5);

// Input volts → output volts at 1 kHz: each op-amp's gain, then its rails.
export function boostEqTransfer(s: BoostEqSettings) {
  const st = stages(s);
  const w = 2 * Math.PI * 1000;
  const g = st.list.map((stage) => {
    const h = gainAt(stage.els, stage.out, w);
    return Math.sign(h.re || 1) * Math.hypot(h.re, h.im);
  });
  const h = st.v.headroom;
  return (x: number) => g[3] * railClip(g[2] * railClip(g[1] * railClip(g[0] * x, h), h), h);
}

export type BoostEqWorkletParams = { stages: Filter[][]; headroom: number };

// Each stage as second-order sections at the oversampled rate; the first
// three end in a clip, the last (volume) doesn't.
export function boostEqWorkletParams(s: BoostEqSettings, fsOversampled: number): BoostEqWorkletParams {
  const st = stages(s);
  const list = st.list.map((stage) => {
    const p = transferPolys(stage.els, stage.out, S0);
    return sections(p.num, p.den, fsOversampled, S0);
  });
  // U2A's bandwidth limit: a first-order lowpass at GBW / gain.
  const bw = st.v.corners.bandwidth;
  list[0].push(...sections([1], [1, S0 / (2 * Math.PI * bw)], fsOversampled, S0));
  return { stages: list, headroom: st.v.headroom };
}

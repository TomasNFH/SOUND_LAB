// Mid-hump overdrive (classic op-amp design) at component level, built around a JRC4558:
//
//   in ─ C_in/R_in ─ buffer ─ C_couple/R_bias ─ IC1a ─ R7/C6 ─ IC1b tone ─ C_out ─ level ─ buffer ─ out
//                                                │
//                     feedback: (R_fixed + drive pot) ∥ C_fb ∥ diodes
//                     to ground: R_gnd + C_gnd
//
// IC1a is a non-inverting stage with the diodes in its feedback loop: its
// output is the input itself plus the voltage across the feedback, and the
// diodes limit that voltage. R_gnd + C_gnd only pass the mids and highs,
// so only they get gain and clip (the mid hump); the bass passes at unity.
// IC1b is the active tone control: the tone pot sits between its two
// inputs and its wiper shunts treble to VREF through R8 + C7, cutting
// treble at one end and boosting it at the other.
//
// Every value is a setting. The op-amps are ideal apart from their gain-
// bandwidth and their output swing (1.5 V short of each supply rail).

import { bilinear, cascade, type Filter } from '../combo/circuit';
import type { Drive4558Settings } from '../settings';

const S0 = 2 * Math.PI * 1000;
const GBW = 3e6; // 4558 gain-bandwidth, Hz
const RAIL_MARGIN = 1.5;

// Audio-taper pot (drive, level): 10% of the resistance at half rotation.
const taper = (pos: number) => (Math.pow(81, Math.min(1, Math.max(0, pos))) - 1) / 80;

// Diode clipping in the feedback loop: the voltage across the feedback
// can't exceed the diodes' forward voltage. Silicon (1N914) ~0.6 V,
// germanium ~0.3 V and softer, LEDs ~1.7 V and harder; asymmetric is one
// diode one way and two the other (a lopsided wave, even harmonics).
export const DIODES = {
  si: { name: 'Silicon 1N914 (stock)', pos: 0.6, neg: 0.6, p: 2.5 },
  ge: { name: 'Germanium', pos: 0.3, neg: 0.3, p: 1.6 },
  led: { name: 'LEDs', pos: 1.7, neg: 1.7, p: 4 },
  asym: { name: 'Asymmetric (1 + 2 Si)', pos: 0.6, neg: 1.2, p: 2.5 },
  none: { name: 'None (op-amp rails only)', pos: 1e9, neg: 1e9, p: 4 },
} as const;
export type DiodeType = keyof typeof DIODES;

const knee = (x: number, v: number, p: number) => x / Math.pow(1 + Math.pow(Math.abs(x / v), p), 1 / p);
export function diodeClip(x: number, d: DiodeType) {
  const c = DIODES[d];
  return x >= 0 ? knee(x, c.pos, c.p) : knee(x, c.neg, c.p);
}
export const railClip = (x: number, v: number) => knee(x, v, 5);

export function drive4558Values(s: Drive4558Settings) {
  const rDrive = s.rFixed + Math.max(1, taper(s.drive) * s.drivePot);
  const t = Math.min(0.999, Math.max(0.001, s.tone));
  const ra = t * s.tonePot; // wiper to the + input side (treble cut end)
  const rb = (1 - t) * s.tonePot; // wiper to the − input side (treble boost end)
  const level = Math.max(1e-4, taper(s.level));
  const gain = 1 + rDrive / s.rGnd; // clipping-stage gain above the hump
  return {
    rDrive,
    ra,
    rb,
    gain,
    level,
    headroom: s.supply / 2 - RAIL_MARGIN,
    corners: {
      input: 1 / (2 * Math.PI * s.rIn * s.cIn),
      coupling: 1 / (2 * Math.PI * s.rBias * s.cCouple),
      gainRise: 1 / (2 * Math.PI * rDrive * s.cGnd), // feedback gain passes ×1 here
      hump: 1 / (2 * Math.PI * s.rGnd * s.cGnd), // full gain from here up
      highCut: 1 / (2 * Math.PI * rDrive * s.cFb), // 51 pF across the drive
      bandwidth: GBW / gain,
      passiveLp: 1 / (2 * Math.PI * s.r7 * s.c6),
      toneShelf: 1 / (2 * Math.PI * s.r8 * s.c7),
      output: 1 / (2 * Math.PI * s.cOut * (s.rOut + s.levelPot)),
    },
  };
}

type Poly = { num: number[]; den: number[] };
const pmul = (p: number[], q: number[]) => {
  const out = Array(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => (out[i + j] += a * b)));
  return out;
};
const padd = (p: number[], q: number[]) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] ?? 0) + (q[i] ?? 0));
const pscale = (p: number[], k: number) => p.map((v) => v * k);

// Linear sections as polynomials in σ = s / s0 (ascending powers).
function sections(s: Drive4558Settings) {
  const v = drive4558Values(s);
  const hp = (tau: number): Poly => ({ num: [0, tau * S0], den: [1, tau * S0] });
  // Voltage across the feedback per volt at the + input: Zf / Zg with
  // Zf = R_d ∥ C_fb and Zg = R_gnd + 1/(s C_gnd).
  const rd = v.rDrive;
  const fb: Poly = {
    num: [0, rd * s.cGnd * S0],
    den: pmul([1, rd * s.cFb * S0], [1, s.rGnd * s.cGnd * S0]),
  };
  const bw: Poly = { num: [1], den: [1, S0 / (2 * Math.PI * v.corners.bandwidth)] };
  // Passive lowpass (R7, C6) plus IC1b tone stage, solved together with
  // an ideal op-amp (both inputs at the same voltage, no input current):
  //   H = (G + s C7 (R8 G + 1 + Rf Gb)) /
  //       [(G + s C7 (R8 G + 1 + Rin Ga)) (1 + R7/Rin + s R7 C6) − (R7/Rin)(G + s C7 (R8 G + 1))]
  // with Ga = 1/Ra, Gb = 1/Rb, G = Ga + Gb.
  const ga = 1 / Math.max(1, v.ra);
  const gb = 1 / Math.max(1, v.rb);
  const g = ga + gb;
  const c7 = s.c7 * S0;
  const num = [g, c7 * (s.r8 * g + 1 + s.rToneFb * gb)];
  const left = [g, c7 * (s.r8 * g + 1 + s.rTone * ga)];
  const k = s.r7 / s.rTone;
  const den = padd(pmul(left, [1 + k, s.r7 * s.c6 * S0]), pscale([g, c7 * (s.r8 * g + 1)], -k));
  const tone: Poly = { num, den };
  const out: Poly = {
    num: [0, s.cOut * s.levelPot * S0 * v.level],
    den: [1, s.cOut * (s.rOut + s.levelPot) * S0],
  };
  return { v, input: hp(s.rIn * s.cIn), coupling: hp(s.rBias * s.cCouple), fb, bw, tone, out };
}

function evalAt(p: Poly, w: number) {
  const ev = (cs: number[]) => {
    let re = 0;
    let im = 0;
    const x = w / S0;
    cs.forEach((cf, k) => {
      const m = cf * Math.pow(x, k);
      const r = k % 4;
      if (r === 0) re += m;
      else if (r === 1) im += m;
      else if (r === 2) re -= m;
      else im -= m;
    });
    return { re, im };
  };
  return { n: ev(p.num), d: ev(p.den) };
}
const ratio = (p: Poly, w: number) => {
  const { n, d } = evalAt(p, w);
  const dd = d.re * d.re + d.im * d.im;
  return { re: (n.re * d.re + n.im * d.im) / dd, im: (n.im * d.re - n.re * d.im) / dd };
};
const cmul = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

// Small-signal response of the whole pedal in dB (no clipping): input
// high-passes × (1 + feedback) × tone stage × output.
export function drive4558ResponseDb(s: Drive4558Settings, freqs: Float32Array) {
  const sec = sections(s);
  const out = new Float32Array(freqs.length);
  freqs.forEach((f, i) => {
    const w = 2 * Math.PI * f;
    let h = cmul(ratio(sec.input, w), ratio(sec.coupling, w));
    const fb = cmul(ratio(sec.fb, w), ratio(sec.bw, w));
    h = cmul(h, { re: 1 + fb.re, im: fb.im });
    h = cmul(h, cmul(ratio(sec.tone, w), ratio(sec.out, w)));
    out[i] = 20 * Math.log10(Math.max(1e-9, Math.hypot(h.re, h.im)));
  });
  return out;
}

// Input volts → clipping-stage output, mid band, for the transfer view.
export function drive4558Transfer(s: Drive4558Settings) {
  const v = drive4558Values(s);
  return (x: number) => railClip(x + diodeClip((v.gain - 1) * x, s.diodes), v.headroom);
}

export type Drive4558WorkletParams = {
  input: Filter; // C_in / R_in and the coupling cap, before IC1a
  feedback: Filter; // voltage across the feedback per volt at the + input
  diodes: DiodeType;
  headroom: number;
  post: Filter; // R7/C6, tone stage, output cap and level
};

export function drive4558WorkletParams(s: Drive4558Settings, fsOversampled: number): Drive4558WorkletParams {
  const sec = sections(s);
  const d = (p: Poly) => bilinear(p.num, p.den, fsOversampled, S0);
  return {
    input: cascade(d(sec.input), d(sec.coupling)),
    feedback: cascade(d(sec.fb), d(sec.bw)),
    diodes: s.diodes,
    headroom: sec.v.headroom,
    post: cascade(d(sec.tone), d(sec.out)),
  };
}

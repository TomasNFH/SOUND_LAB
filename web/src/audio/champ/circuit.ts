// Fender Champion 600 (2007 reissue) from its service schematic,
// drawing 722CAX003 rev A. Everything here is plain maths on component
// values: the audio worklet, the views and the test-point check all use
// it, so the sound, the curves and the numbers can't disagree.
//
//   input ─ V2-A ─ tone stack ─ volume ─ V2-B ─ C2 ─ V1 6V6 ─ T2 ─ speaker
//                                          ↑                       │
//                                          └──── R7 / R23 ─────────┘ feedback

import type { ChampSettings } from '../settings';

// ---------------------------------------------------------------------------
// Complex numbers and a small nodal-analysis solver

type C = { re: number; im: number };
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = (a: C) => Math.hypot(a.re, a.im);

// A two-terminal part between nodes a and b ('gnd' is ground).
export type Part = { kind: 'R' | 'C'; a: string; b: string; value: number; name?: string };

// A linear network driven at node `input` by an ideal voltage source
// behind `sourceR` (the driving tube's output resistance).
export type Network = { parts: Part[]; input: string; sourceR: number };

// Scale admittances to keep matrix entries near 1 (only ratios matter).
const Y_SCALE = 1e5;

function admittanceMatrix(net: Network, s: C) {
  const nodes = [...new Set(net.parts.flatMap((p) => [p.a, p.b]).filter((n) => n !== 'gnd'))];
  if (!nodes.includes(net.input)) nodes.push(net.input);
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length;
  const Y: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0)));
  for (const p of net.parts) {
    const y = p.kind === 'R' ? c(Y_SCALE / p.value) : mul(s, c(Y_SCALE * p.value));
    const i = idx.get(p.a);
    const j = idx.get(p.b);
    if (i !== undefined) Y[i][i] = add(Y[i][i], y);
    if (j !== undefined) Y[j][j] = add(Y[j][j], y);
    if (i !== undefined && j !== undefined) {
      Y[i][j] = sub(Y[i][j], y);
      Y[j][i] = sub(Y[j][i], y);
    }
  }
  const gs = c(Y_SCALE / net.sourceR);
  const k = idx.get(net.input)!;
  Y[k][k] = add(Y[k][k], gs);
  const rhs = nodes.map((_, i) => (i === k ? gs : c(0)));
  return { Y, rhs, idx };
}

// Gaussian elimination with partial pivoting; returns the solution and
// the determinant of the matrix.
function solve(Yin: C[][], rhsIn: C[]) {
  const n = Yin.length;
  const Y = Yin.map((r) => r.slice());
  const b = rhsIn.slice();
  let det = c(1);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (abs(Y[r][col]) > abs(Y[piv][col])) piv = r;
    if (abs(Y[piv][col]) === 0) return { x: b.map(() => c(0)), det: c(0) };
    if (piv !== col) {
      [Y[piv], Y[col]] = [Y[col], Y[piv]];
      [b[piv], b[col]] = [b[col], b[piv]];
      det = c(-det.re, -det.im);
    }
    det = mul(det, Y[col][col]);
    for (let r = col + 1; r < n; r++) {
      const f = div(Y[r][col], Y[col][col]);
      if (f.re === 0 && f.im === 0) continue;
      for (let k = col; k < n; k++) Y[r][k] = sub(Y[r][k], mul(f, Y[col][k]));
      b[r] = sub(b[r], mul(f, b[col]));
    }
  }
  const x: C[] = Array(n).fill(c(0));
  for (let r = n - 1; r >= 0; r--) {
    let acc = b[r];
    for (let k = r + 1; k < n; k++) acc = sub(acc, mul(Y[r][k], x[k]));
    x[r] = div(acc, Y[r][r]);
  }
  return { x, det };
}

// Voltage at `node` per volt of source, at angular frequency w (rad/s).
export function nodeGain(net: Network, node: string, w: number): C {
  const { Y, rhs, idx } = admittanceMatrix(net, c(0, w));
  const i = idx.get(node);
  return i === undefined ? c(0) : solve(Y, rhs).x[i];
}

// Exact transfer function source → node as a ratio of polynomials in the
// normalized variable σ = s / s0. det(Y) and Cramer's numerator are
// polynomials whose degree is at most the number of capacitors; they are
// sampled on the unit circle and recovered with an inverse DFT, which is
// well conditioned because σ is normalized.
export function transferPolys(net: Network, node: string, s0: number) {
  const order = net.parts.filter((p) => p.kind === 'C').length;
  const M = 8;
  const numS: C[] = [];
  const denS: C[] = [];
  for (let k = 0; k < M; k++) {
    const sigma = c(Math.cos((2 * Math.PI * k) / M), Math.sin((2 * Math.PI * k) / M));
    const { Y, rhs, idx } = admittanceMatrix(net, mul(sigma, c(s0)));
    const col = idx.get(node)!;
    const Yn = Y.map((row, r) => row.map((v, j) => (j === col ? rhs[r] : v)));
    denS.push(solve(Y, rhs).det);
    numS.push(solve(Yn, rhs).det);
  }
  const coeffs = (samples: C[]) => {
    const out: number[] = [];
    for (let j = 0; j <= order; j++) {
      let re = 0;
      for (let k = 0; k < M; k++) {
        const ang = (-2 * Math.PI * j * k) / M;
        re += samples[k].re * Math.cos(ang) - samples[k].im * Math.sin(ang);
      }
      out.push(re / M);
    }
    return out;
  };
  return { num: coeffs(numS), den: coeffs(denS) };
}

// ---------------------------------------------------------------------------
// Analog → digital (bilinear transform) for filters given in σ = s / s0

export type Filter = { b: number[]; a: number[] };

function polyMul(p: number[], q: number[]) {
  const out = Array(p.length + q.length - 1).fill(0);
  p.forEach((x, i) => q.forEach((y, j) => (out[i + j] += x * y)));
  return out;
}

const binomialPoly = (k: number, n: number) => {
  // (1 - z^-1)^k (1 + z^-1)^(n-k), ascending powers of z^-1
  let p = [1];
  for (let i = 0; i < k; i++) p = polyMul(p, [1, -1]);
  for (let i = 0; i < n - k; i++) p = polyMul(p, [1, 1]);
  return p;
};

export function bilinear(num: number[], den: number[], fs: number, s0: number): Filter {
  const n = Math.max(num.length, den.length) - 1;
  const K = (2 * fs) / s0;
  const b = Array(n + 1).fill(0);
  const a = Array(n + 1).fill(0);
  for (let k = 0; k <= n; k++) {
    const t = binomialPoly(k, n);
    const kk = Math.pow(K, k);
    t.forEach((v, i) => {
      b[i] += (num[k] ?? 0) * kk * v;
      a[i] += (den[k] ?? 0) * kk * v;
    });
  }
  const a0 = a[0];
  return { b: b.map((v) => v / a0), a: a.map((v) => v / a0) };
}

export const cascade = (...fs: Filter[]): Filter => ({
  b: fs.reduce((p, f) => polyMul(p, f.b), [1]),
  a: fs.reduce((p, f) => polyMul(p, f.a), [1]),
});

const S0 = 2 * Math.PI * 1000;

// ---------------------------------------------------------------------------
// The circuit

type Tube = { name: string; mu: number; rp: number; headroom: number };

// Small-signal constants near this circuit's operating point (100k plate,
// 1.5k cathode, about 1 to 2 mA). 12AX7 is stock; the swaps are the usual
// "less gain, more headroom" choices. The 12AT7's datasheet rp (15k) is
// for 10 mA; at this current it is nearer 30k.
export const PREAMP_TUBES: Record<ChampSettings['tube'], Tube> = {
  '12AX7': { name: '12AX7', mu: 100, rp: 62500, headroom: 1 },
  '5751': { name: '5751', mu: 70, rp: 58000, headroom: 1.2 },
  '12AT7': { name: '12AT7', mu: 55, rp: 30000, headroom: 1.5 },
};

const RA = 100e3; // R8 / R9 plate resistors
const RK = 1.5e3; // R2 / R3 cathode resistors
const R23 = 47; // unbypassed cathode resistor under V2-B, where feedback enters
const R4 = 220e3; // 6V6 grid leak
const C2 = 0.022e-6; // coupling cap into the 6V6
const VOLUME_POT = 1e6; // R13, 1 MΩ audio taper

const CATHODE_CAPS: Record<ChampSettings['v2aCap'], number> = { '22u': 22e-6, '1u': 1e-6, '470n': 0.47e-6 };
const FEEDBACK_R: Record<ChampSettings['feedback'], number> = { stock: 2200, less: 4700, off: Infinity };

// Fender's test-point levels for 25 mV at the High input, volume full up.
export const FENDER_TEST_POINTS = { tp2: 1.18, tp3: 0.18, tp4: 0.18, tp5: 7.0, tp9: 175, tp13: 3.35 };
// Output transformer voltage ratio from TP9 (plate) and TP13 (speaker).
const OT_RATIO = FENDER_TEST_POINTS.tp13 / FENDER_TEST_POINTS.tp9;
// 6V6 stage gain, grid to plate, from TP5 and TP9.
const POWER_GAIN = FENDER_TEST_POINTS.tp9 / FENDER_TEST_POINTS.tp5;

// Audio-taper pot: 10% of the resistance at half rotation.
export const audioTaper = (pos: number) => (Math.pow(81, Math.min(1, Math.max(0, pos))) - 1) / 80;

// Interstage network: V2-A plate → tone stack → volume pot → V2-B grid.
export function interstage(s: ChampSettings, volume: number): Network {
  const tube = PREAMP_TUBES[s.tube];
  const sourceR = (RA * tube.rp) / (RA + tube.rp); // plate output resistance
  const r = Math.max(1e-4, audioTaper(volume));
  const volumeParts: Part[] = [
    { kind: 'R', a: 'W', b: 'V', value: Math.max(1, (1 - r) * VOLUME_POT), name: 'R13 upper' },
    { kind: 'R', a: 'V', b: 'gnd', value: Math.max(1, r * VOLUME_POT), name: 'R13 lower' },
  ];
  if (s.toneStack === 'bypass') {
    // A switch around the stack: plate → coupling cap → volume (5F1-style).
    return {
      input: 'P',
      sourceR,
      parts: [{ kind: 'C', a: 'P', b: 'W', value: 0.022e-6, name: 'bypass cap' }, ...volumeParts],
    };
  }
  const knobs = s.toneStack === 'knobs';
  const t = Math.min(0.999, Math.max(0.001, s.treble));
  const trebleTop = knobs ? (1 - t) * 250e3 : 180e3; // R21
  const trebleBottom = knobs ? t * 250e3 : 75e3; // R20
  const bass = knobs ? Math.max(1, s.bass * 250e3) : 75e3; // R22
  const mid = knobs ? Math.max(1, s.middle * 25e3) : 15e3; // R19
  const c1 = s.c1 * 1e-12;
  const parts: Part[] = [
    { kind: 'C', a: 'P', b: 'T', value: c1, name: 'C1' },
    { kind: 'R', a: 'P', b: 'S', value: 100e3, name: 'R18' },
    { kind: 'C', a: 'S', b: 'B', value: 0.1e-6, name: 'C8' },
    { kind: 'C', a: 'S', b: 'M', value: 0.047e-6, name: 'C9' },
    { kind: 'R', a: 'T', b: 'W', value: trebleTop, name: 'R21' },
    { kind: 'R', a: 'W', b: 'B', value: trebleBottom, name: 'R20' },
    { kind: 'R', a: 'B', b: 'M', value: bass, name: 'R22' },
    ...volumeParts,
  ];
  // Lifting one leg of R19 leaves the stack with no ground return.
  if (s.toneStack !== 'liftR19') parts.push({ kind: 'R', a: 'M', b: 'gnd', value: mid, name: 'R19' });
  return { input: 'P', sourceR, parts };
}

// Stock tone-stack knob positions: where 250k/250k/25k pots reproduce the
// fixed resistors (R21+R20 split, R22 75k, R19 15k).
export const STOCK_KNOBS = { treble: 75 / 255, bass: 0.3, middle: 0.6 };

// Triode gain with a partly bypassed cathode: flat A_lf at low frequency,
// A_hf above the bypass cap's corner. Returned as (gain, τz, τp) for
// A_lf · (1 + sτz) / (1 + sτp).
function cathodeShelf(mu: number, ra: number, rp: number, rBypassed: number, rFixed: number, cap: number | null) {
  const aLf = (mu * ra) / (ra + rp + (mu + 1) * (rBypassed + rFixed));
  const aHf = (mu * ra) / (ra + rp + (mu + 1) * rFixed);
  if (cap === null) return { aLf, aHf: aLf, tz: 0, tp: 0 };
  const rSeen = (ra + rp + (mu + 1) * rFixed) / (mu + 1); // looking into the cathode
  const rEff = (rBypassed * rSeen) / (rBypassed + rSeen);
  return { aLf, aHf, tz: cap * rBypassed, tp: cap * rEff };
}

export function stageGains(s: ChampSettings) {
  const tube = PREAMP_TUBES[s.tube];
  const a = cathodeShelf(tube.mu, RA, tube.rp, RK, 0, CATHODE_CAPS[s.v2aCap]);
  const raB = (RA * R4) / (RA + R4); // V2-B plate load includes the 6V6 grid leak
  const b = cathodeShelf(tube.mu, raB, tube.rp, RK, R23, s.v2bCap === 'none' ? null : 22e-6);
  const r7 = FEEDBACK_R[s.feedback];
  const beta = Number.isFinite(r7) ? R23 / (r7 + R23) : 0;
  return { tube, a, b, beta, r7 };
}

// 6V6 operating point for a cathode resistor. Stock: 22 V across 470 Ω
// (TP8) = 47 mA. A larger resistor biases it cooler; the current scaling
// is an estimate, not a measured curve.
export function powerTube(biasR: number) {
  const ik = 0.047 * Math.pow(470 / biasR, 0.6);
  const vk = ik * biasR;
  const vPlate = 355; // B+ 366 V minus the output transformer's DC drop
  const plateWatts = (vPlate - vk) * ik * 0.92; // ~8% of the current is screen current
  return { ik, vk, plateWatts, gainScale: Math.sqrt(ik / 0.047) };
}

// ---------------------------------------------------------------------------
// Responses and test points

const shelfAt = (sh: { aLf: number; tz: number; tp: number }, w: number) =>
  div(mul(c(sh.aLf), c(1, w * sh.tz)), c(1, w * sh.tp));
const hp1At = (tau: number, w: number) => div(c(0, w * tau), c(1, w * tau));
const OT_HP = 70; // Hz: small output transformer, limited primary inductance
const OT_LP = 9000;
function otAt(w: number) {
  const wh = 2 * Math.PI * OT_HP;
  const hp = div(c(-w * w), c(wh * wh - w * w, Math.SQRT2 * wh * w));
  const lp = div(c(1), c(1, w / (2 * Math.PI * OT_LP)));
  return mul(hp, lp);
}
const inputScale = (s: ChampSettings) => (s.input === 'high' ? 0.97 : 0.49);

// Level from V2-A's plate (as a source) to V2-B's grid, in dB: what the
// tone stack and volume pot do on their own.
export function interstageResponseDb(s: ChampSettings, volume: number, freqs: Float32Array) {
  const net = interstage(s, volume);
  const out = new Float32Array(freqs.length);
  freqs.forEach((f, i) => (out[i] = 20 * Math.log10(Math.max(1e-9, abs(nodeGain(net, 'V', 2 * Math.PI * f))))));
  return out;
}

export type TestPoint = { id: string; label: string; model: number; fender: number };

// The service manual's check: 25 mV at 1 kHz into High, volume full up.
// Small-signal, so the linear parts of the model are enough.
export function testPoints(s: ChampSettings): TestPoint[] {
  const w = 2 * Math.PI * 1000;
  const g = stageGains(s);
  const net = interstage({ ...s, input: 'high' }, 1);
  const vs = mul(shelfAt(g.a, w), c(-0.025 * 0.97)); // V2-A open-circuit output
  const vP = mul(vs, nodeGain(net, 'P', w));
  const vW = mul(vs, nodeGain(net, 'W', w));
  const vV = mul(vs, nodeGain(net, 'V', w));
  const pt = powerTube(s.bias);
  const tauC = C2 * (R4 + (RA * g.tube.rp) / (RA + g.tube.rp));
  const a2 = shelfAt(g.b, w);
  // Forward gain from V2-B grid-cathode voltage to the speaker.
  const toPlate6 = mul(mul(a2, hp1At(tauC, w)), c(POWER_GAIN * pt.gainScale));
  const forward = mul(toPlate6, mul(otAt(w), c(OT_RATIO)));
  const vgk = div(vV, add(c(1), mul(c(g.beta), forward)));
  const tp5 = mul(a2, vgk);
  const tp9 = mul(toPlate6, vgk);
  const tp13 = mul(forward, vgk);
  const F = FENDER_TEST_POINTS;
  return [
    { id: 'TP2', label: 'V2-A plate', model: abs(vP), fender: F.tp2 },
    { id: 'TP3', label: 'Tone stack out', model: abs(vW), fender: F.tp3 },
    { id: 'TP4', label: 'V2-B grid', model: abs(vV), fender: F.tp4 },
    { id: 'TP5', label: 'V2-B plate', model: abs(tp5), fender: F.tp5 },
    { id: 'TP9', label: '6V6 plate', model: abs(tp9), fender: F.tp9 },
    { id: 'TP13', label: 'Speaker', model: abs(tp13), fender: F.tp13 },
  ];
}

// ---------------------------------------------------------------------------
// Parameters for the audio worklet (all filters at the oversampled rate)

export type WorkletParams = {
  inScale: number;
  stageA: { vpos: number; vneg: number; shelf: Filter };
  net: Filter;
  stageB: { vpos: number; vneg: number; shelf: Filter };
  beta: number;
  coupling: Filter;
  power: { vpos: number; vneg: number; gain: number; plateLimit: number };
  ot: Filter;
  sag: number;
  outScale: number;
};

const shelfFilter = (sh: { aLf: number; tz: number; tp: number }, sign: number, fs: number) =>
  sh.tz === 0
    ? { b: [sign * sh.aLf], a: [1] }
    : bilinear([sign * sh.aLf, sign * sh.aLf * sh.tz * S0], [1, sh.tp * S0], fs, S0);

// Speaker volts → digital full scale. 5 W into 4 Ω is about 6.3 V peak.
const SPEAKER_FULL_SCALE = 8;

export function workletParams(s: ChampSettings, volume: number, fsOversampled: number): WorkletParams {
  const fs = fsOversampled;
  const g = stageGains(s);
  const pt = powerTube(s.bias);
  const net = interstage(s, volume);
  const poly = transferPolys(net, 'V', S0);
  const tauC = C2 * (R4 + (RA * g.tube.rp) / (RA + g.tube.rp));
  const wh = (2 * Math.PI * OT_HP) / S0;
  const otHp = bilinear([0, 0, 1], [wh * wh, Math.SQRT2 * wh, 1], fs, S0);
  const otLp = bilinear([1], [1, S0 / (2 * Math.PI * OT_LP)], fs, S0);
  const ot = cascade(otHp, otLp);
  // Preamp triodes: grid conduction at the cathode bias (+1.7 V at TP6/TP7)
  // and cutoff about the same distance below it.
  const bias = 1.7 * g.tube.headroom;
  return {
    inScale: inputScale(s),
    stageA: { vpos: bias, vneg: bias * 1.15, shelf: shelfFilter(g.a, -1, fs) },
    net: bilinear(poly.num, poly.den, fs, S0),
    stageB: { vpos: bias, vneg: bias * 1.15, shelf: shelfFilter(g.b, -1, fs) },
    beta: g.beta,
    coupling: bilinear([0, tauC * S0], [1, tauC * S0], fs, S0),
    // 6V6: grid conduction at +Vk, cutoff around -44 V grid-cathode.
    // Plate swing: enough for the rated 5 W into 4 Ω (6.3 V peak at the
    // speaker) before it flattens.
    power: { vpos: pt.vk, vneg: Math.max(6, 44 - pt.vk), gain: -POWER_GAIN * pt.gainScale, plateLimit: 380 },
    ot: { b: ot.b.map((v) => v * OT_RATIO), a: ot.a },
    sag: 0.12,
    outScale: 1 / SPEAKER_FULL_SCALE,
  };
}

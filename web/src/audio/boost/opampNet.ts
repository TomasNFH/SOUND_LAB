// Nodal analysis for op-amp circuits: resistors, capacitors and ideal
// op-amps (no input current, both inputs at the same voltage, any output
// current), driven by an ideal voltage source at node 'in'. 'gnd' is AC
// ground; a single-supply circuit's VREF is ground for the signal too.
//
// Each stage is solved from its parts, then turned into second-order
// sections for the worklet: a 6th-order filter at 4x oversampling in one
// direct form would be numerically fragile, a cascade of biquads is not.

import { bilinear, type Filter } from '../champ/circuit';

export type El =
  | { kind: 'R' | 'C'; a: string; b: string; value: number }
  | { kind: 'OA'; p: string; n: string; out: string };

type C = { re: number; im: number };
const cx = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => cx(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => cx(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = (a: C) => Math.hypot(a.re, a.im);

const Y_SCALE = 1e4; // keeps conductances near 1 next to the op-amp rows

// Unknowns: node voltages, then one output current per op-amp, then the
// source current. Rows: KCL per node, then V+ = V− per op-amp, then
// V(in) = 1.
function system(els: El[], s: C) {
  const nodes = [...new Set(['in', ...els.flatMap((e) => (e.kind === 'OA' ? [e.p, e.n, e.out] : [e.a, e.b]))])].filter((n) => n !== 'gnd');
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const amps = els.filter((e): e is Extract<El, { kind: 'OA' }> => e.kind === 'OA');
  const n = nodes.length + amps.length + 1;
  const M: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0)));
  const put = (r: number | undefined, c: number | undefined, v: C) => {
    if (r !== undefined && c !== undefined) M[r][c] = add(M[r][c], v);
  };
  for (const e of els) {
    if (e.kind === 'OA') continue;
    const y = e.kind === 'R' ? cx(Y_SCALE / e.value) : mul(s, cx(Y_SCALE * e.value));
    const i = idx.get(e.a);
    const j = idx.get(e.b);
    put(i, i, y);
    put(j, j, y);
    put(i, j, cx(-y.re, -y.im));
    put(j, i, cx(-y.re, -y.im));
  }
  amps.forEach((a, k) => {
    const row = nodes.length + k;
    put(idx.get(a.out), row, cx(-1)); // output current into the node
    put(row, idx.get(a.p), cx(1));
    put(row, idx.get(a.n), cx(-1));
  });
  const src = n - 1;
  put(idx.get('in'), src, cx(-1));
  put(src, idx.get('in'), cx(1));
  const rhs = Array.from({ length: n }, (_, i) => cx(i === src ? 1 : 0));
  return { M, rhs, idx };
}

function solve(Min: C[][], rhsIn: C[]) {
  const n = Min.length;
  const M = Min.map((r) => r.slice());
  const b = rhsIn.slice();
  let det = cx(1);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (abs(M[r][col]) > abs(M[piv][col])) piv = r;
    if (abs(M[piv][col]) === 0) return { x: b.map(() => cx(0)), det: cx(0) };
    if (piv !== col) {
      [M[piv], M[col]] = [M[col], M[piv]];
      [b[piv], b[col]] = [b[col], b[piv]];
      det = cx(-det.re, -det.im);
    }
    det = mul(det, M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const f = div(M[r][col], M[col][col]);
      if (f.re === 0 && f.im === 0) continue;
      for (let k = col; k < n; k++) M[r][k] = sub(M[r][k], mul(f, M[col][k]));
      b[r] = sub(b[r], mul(f, b[col]));
    }
  }
  const x: C[] = Array(n).fill(cx(0));
  for (let r = n - 1; r >= 0; r--) {
    let acc = b[r];
    for (let k = r + 1; k < n; k++) acc = sub(acc, mul(M[r][k], x[k]));
    x[r] = div(acc, M[r][r]);
  }
  return { x, det };
}

// Voltage at `node` per volt at 'in', at angular frequency w.
export function gainAt(els: El[], node: string, w: number) {
  const { M, rhs, idx } = system(els, cx(0, w));
  return solve(M, rhs).x[idx.get(node)!];
}

// Transfer function as polynomials in σ = s / s0 (ascending powers), from
// Cramer's rule sampled on the unit circle and an inverse DFT.
export function transferPolys(els: El[], node: string, s0: number) {
  const order = els.filter((e) => e.kind === 'C').length;
  const N = 32;
  const num: C[] = [];
  const den: C[] = [];
  for (let k = 0; k < N; k++) {
    const sigma = cx(Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N));
    const { M, rhs, idx } = system(els, mul(sigma, cx(s0)));
    const col = idx.get(node)!;
    den.push(solve(M, rhs).det);
    num.push(solve(M.map((row, r) => row.map((v, j) => (j === col ? rhs[r] : v))), rhs).det);
  }
  const coeffs = (samples: C[]) => {
    const out: number[] = [];
    for (let j = 0; j <= order; j++) {
      let re = 0;
      for (let k = 0; k < N; k++) {
        const ang = (-2 * Math.PI * j * k) / N;
        re += samples[k].re * Math.cos(ang) - samples[k].im * Math.sin(ang);
      }
      out.push(re / N);
    }
    return out;
  };
  return { num: coeffs(num), den: coeffs(den) };
}

// Roots of a real polynomial (ascending coefficients): Laguerre's method
// with deflation, each root polished on the full polynomial.
const csqrt = (a: C): C => {
  const r = abs(a);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  const im = Math.sqrt(Math.max(0, (r - a.re) / 2));
  return cx(re, a.im < 0 ? -im : im);
};

function laguerre(a: C[], start: C) {
  // a: ascending coefficients, complex
  const n = a.length - 1;
  let x = start;
  for (let it = 0; it < 200; it++) {
    let p = a[n];
    let d1 = cx(0);
    let d2 = cx(0);
    for (let i = n - 1; i >= 0; i--) {
      d2 = add(mul(d2, x), d1);
      d1 = add(mul(d1, x), p);
      p = add(mul(p, x), a[i]);
    }
    if (abs(p) === 0) return x;
    const g = div(d1, p);
    const h = sub(mul(g, g), div(mul(cx(2), d2), p));
    const sq = csqrt(mul(cx(n - 1), sub(mul(cx(n), h), mul(g, g))));
    const gp = add(g, sq);
    const gm = sub(g, sq);
    const den = abs(gp) > abs(gm) ? gp : gm;
    const step = abs(den) === 0 ? cx(1 + abs(x)) : div(cx(n), den);
    x = sub(x, step);
    if (abs(step) <= 1e-15 * Math.max(abs(x), 1e-30)) break;
  }
  return x;
}

export function roots(p: number[]): C[] {
  const q = p.slice();
  while (q.length > 1 && q[q.length - 1] === 0) q.pop();
  let a = q.map((v) => cx(v));
  const full = a.slice();
  const out: C[] = [];
  // Roots at zero come out exactly.
  while (a.length > 1 && a[0].re === 0 && a[0].im === 0) {
    out.push(cx(0));
    a = a.slice(1);
  }
  while (a.length > 1) {
    let r = laguerre(a, cx(0));
    r = laguerre(full, r);
    if (Math.abs(r.im) <= 1e-9 * abs(r)) r = cx(r.re);
    out.push(r);
    // Deflate: divide by (σ − r).
    const n = a.length - 1;
    const b: C[] = Array(n);
    let carry = a[n];
    for (let i = n - 1; i >= 0; i--) {
      b[i] = carry;
      carry = add(a[i], mul(carry, r));
    }
    a = b;
  }
  return out;
}

// Drop the high-order coefficients that are only round-off.
function trim(p: number[]) {
  const peak = Math.max(...p.map(Math.abs));
  const q = p.slice();
  while (q.length > 1 && Math.abs(q[q.length - 1]) < peak * 1e-12) q.pop();
  return q;
}

// Group roots into real polynomials of order 1 or 2 (conjugate pairs and
// pairs of real roots), as ascending coefficients.
// A root whose imaginary part is only round-off counts as real; each
// complex root with im > 0 stands for its conjugate pair.
function factors(rs: C[]) {
  const isReal = (r: C) => Math.abs(r.im) <= 1e-6 * abs(r);
  const real = rs.filter(isReal).map((r) => r.re);
  const cplx = rs.filter((r) => !isReal(r) && r.im > 0);
  const out: number[][] = cplx.map((r) => [r.re * r.re + r.im * r.im, -2 * r.re, 1]);
  real.sort((x, y) => x - y);
  for (let i = 0; i < real.length; i += 2) {
    if (i + 1 < real.length) out.push([real[i] * real[i + 1], -(real[i] + real[i + 1]), 1]);
    else out.push([-real[i], 1]);
  }
  return out;
}

// num/den in σ → second-order sections at sample rate fs.
export function sections(num: number[], den: number[], fs: number, s0: number): Filter[] {
  const n = trim(num);
  const d = trim(den);
  const gain = n[n.length - 1] / d[d.length - 1];
  const nf = factors(roots(n));
  const df = factors(roots(d));
  const count = Math.max(nf.length, df.length);
  const out: Filter[] = [];
  for (let i = 0; i < count; i++) {
    const f = bilinear(nf[i] ?? [1], df[i] ?? [1], fs, s0);
    out.push(f);
  }
  if (out.length === 0) out.push({ b: [gain], a: [1] });
  else out[0] = { b: out[0].b.map((v) => v * gain), a: out[0].a };
  return out;
}

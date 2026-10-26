// A transfer function of any order as a chain of first- and second-order
// filters. One high-order IIR filter loses precision badly when its poles
// sit far below the sample rate (a bass amp's do, at 4x oversampling);
// the same poles split into small sections stay accurate.

import { bilinear, type Filter } from './combo/circuit';

type Cx = { re: number; im: number };

// Roots of a real polynomial, coefficients ascending (p[0] + p[1]x + ...),
// by simultaneous Newton iteration (Durand–Kerner). The polynomials here
// come from circuits normalized to 1 kHz, so the roots are within a few
// decades of 1 and the iteration converges quickly.
export function polyRoots(pIn: number[]): Cx[] {
  let p = pIn.slice();
  // Drop leading (highest-order) coefficients that are numerically zero.
  const big = Math.max(...p.map(Math.abs));
  while (p.length > 1 && Math.abs(p[p.length - 1]) < big * 1e-13) p.pop();
  const roots: Cx[] = [];
  // Roots at zero: trailing zero coefficients at the low end.
  while (p.length > 1 && Math.abs(p[0]) < big * 1e-13) {
    roots.push({ re: 0, im: 0 });
    p = p.slice(1);
  }
  const n = p.length - 1;
  if (n < 1) return roots;
  const lead = p[n];
  const a = p.map((v) => v / lead); // monic
  const evalP = (z: Cx): Cx => {
    let re = a[n];
    let im = 0;
    for (let i = n - 1; i >= 0; i--) {
      const r = re * z.re - im * z.im + a[i];
      im = re * z.im + im * z.re;
      re = r;
    }
    return { re, im };
  };
  // Start on a circle of the polynomial's geometric-mean root size.
  const radius = Math.pow(Math.abs(a[0]) || 1, 1 / n);
  const z: Cx[] = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    return { re: radius * Math.cos(ang), im: radius * Math.sin(ang) };
  });
  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const num = evalP(z[i]);
      let dre = 1;
      let dim = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ere = z[i].re - z[j].re;
        const eim = z[i].im - z[j].im;
        const r = dre * ere - dim * eim;
        dim = dre * eim + dim * ere;
        dre = r;
      }
      const d = dre * dre + dim * dim || 1e-300;
      const qre = (num.re * dre + num.im * dim) / d;
      const qim = (num.im * dre - num.re * dim) / d;
      z[i] = { re: z[i].re - qre, im: z[i].im - qim };
      moved = Math.max(moved, Math.hypot(qre, qim) / (Math.hypot(z[i].re, z[i].im) + 1e-12));
    }
    if (moved < 1e-14) break;
  }
  return [...roots, ...z];
}

// Group roots into real polynomials of degree 1 or 2: conjugate pairs
// together, real roots in pairs.
function realFactors(roots: Cx[]): number[][] {
  const tol = 1e-7;
  const complex = roots.filter((r) => Math.abs(r.im) > tol * (Math.abs(r.re) + 1)).filter((r) => r.im > 0);
  const real = roots.filter((r) => Math.abs(r.im) <= tol * (Math.abs(r.re) + 1)).map((r) => r.re);
  real.sort((x, y) => Math.abs(x) - Math.abs(y));
  const out: number[][] = complex.map((r) => [r.re * r.re + r.im * r.im, -2 * r.re, 1]);
  for (let i = 0; i < real.length; i += 2) {
    out.push(i + 1 < real.length ? [real[i] * real[i + 1], -(real[i] + real[i + 1]), 1] : [-real[i], 1]);
  }
  return out;
}

// Natural frequency of a factor, to pair zeros with the nearest poles.
const factorScale = (f: number[]) => (f.length === 3 ? Math.sqrt(Math.abs(f[0])) : Math.abs(f[0]));

// H(σ) = num(σ)/den(σ), σ = s / s0, as digital sections at sample rate fs.
export function toSections(num: number[], den: number[], fs: number, s0: number): Filter[] {
  const trim = (p: number[]) => {
    const q = p.slice();
    const big = Math.max(...q.map(Math.abs));
    while (q.length > 1 && Math.abs(q[q.length - 1]) < big * 1e-13) q.pop();
    return q;
  };
  const n = trim(num);
  const d = trim(den);
  const zeros = realFactors(polyRoots(n));
  const poles = realFactors(polyRoots(d));
  // Highest-Q / lowest pole sections first; give each the nearest zeros.
  poles.sort((x, y) => factorScale(x) - factorScale(y));
  zeros.sort((x, y) => factorScale(x) - factorScale(y));
  const sections: Filter[] = [];
  const gain = n[n.length - 1] / d[d.length - 1];
  const zs = zeros.slice();
  for (const pole of poles) {
    // Take zeros up to the pole factor's degree, nearest in frequency.
    let zNum = [1];
    let degLeft = pole.length - 1;
    while (degLeft > 0 && zs.length) {
      const target = factorScale(pole);
      let best = -1;
      for (let i = 0; i < zs.length; i++) {
        if (zs[i].length - 1 > degLeft) continue;
        if (best < 0 || Math.abs(Math.log((factorScale(zs[i]) + 1e-12) / (target + 1e-12))) < Math.abs(Math.log((factorScale(zs[best]) + 1e-12) / (target + 1e-12)))) best = i;
      }
      if (best < 0) break;
      const z = zs.splice(best, 1)[0];
      zNum = polyMul(zNum, z);
      degLeft -= z.length - 1;
    }
    sections.push(bilinear(zNum, pole, fs, s0));
  }
  // Zeros left over (more zeros than poles never happens in these circuits;
  // a pure gain section keeps it correct if it ever did).
  for (const z of zs) sections.push(bilinear(z, [1], fs, s0));
  if (!sections.length) sections.push({ b: [1], a: [1] });
  // Every factor is monic, so all that is left is the ratio of the leading
  // coefficients; it goes on the first section.
  const first = sections[0];
  sections[0] = { b: first.b.map((v) => v * gain), a: first.a };
  return sections;
}

function polyMul(p: number[], q: number[]) {
  const out = Array(p.length + q.length - 1).fill(0);
  p.forEach((x, i) => q.forEach((y, j) => (out[i + j] += x * y)));
  return out;
}

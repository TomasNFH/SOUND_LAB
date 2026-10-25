// Signal-processing pieces shared by the audio worklets. They run inside
// AudioWorkletGlobalScope, so nothing here may touch the DOM.

import type { Filter } from './champ/circuit';

// Transposed direct form II, any order. Keeps its state when the
// coefficients change (the volume knob recomputes the tone stack).
export class Iir {
  private b = new Float64Array([1]);
  private a = new Float64Array([1]);
  private z = new Float64Array(1);

  set(f: Filter) {
    const n = Math.max(f.b.length, f.a.length);
    const b = new Float64Array(n);
    const a = new Float64Array(n);
    b.set(f.b);
    a.set(f.a);
    if (n !== this.b.length) this.z = new Float64Array(n);
    this.b = b;
    this.a = a;
  }

  process(x: number) {
    const { b, a, z } = this;
    const n = b.length - 1;
    const y = b[0] * x + z[0];
    for (let i = 0; i < n; i++) z[i] = b[i + 1] * x - a[i + 1] * y + (i + 1 < n ? z[i + 1] : 0);
    return y;
  }
}

// 4th-order Butterworth lowpass (two RBJ biquads) for the up/down sampling.
export function antiAlias(fs: number, fc: number): Iir[] {
  return [0.5412, 1.3066].map((q) => {
    const w = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const f = new Iir();
    f.set({ b: [(1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0], a: [1, (-2 * cos) / a0, (1 - alpha) / a0] });
    return f;
  });
}

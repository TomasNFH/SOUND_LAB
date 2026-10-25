// Champion 600 as one AudioWorklet processor, so the global negative
// feedback (speaker → R7 → V2-B cathode) can be a real loop: per sample,
// at 4x the sample rate. Every coefficient is computed on the main thread
// (circuit.ts) and posted here; this file only runs the signal.

import type { Filter, WorkletParams } from './circuit';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const OS = 4;

// Transposed direct form II, any order. Keeps its state when the
// coefficients change (the volume knob recomputes the tone stack).
class Iir {
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
function antiAlias(fs: number, fc: number): Iir[] {
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

// Straight until near the limit v, then flattening; `p` sets how sudden
// the knee is (higher = harder).
const knee = (x: number, v: number, p: number) => x / Math.pow(1 + Math.pow(Math.abs(x / v), p), 1 / p);

// Preamp triode, input-referred: grid conduction above +vpos is fairly
// abrupt, cutoff below -vneg is gradual, and the triode's curved transfer
// adds a little 2nd harmonic even at low level. Any DC this adds is
// removed by the coupling capacitors downstream.
function triode(x: number, vpos: number, vneg: number) {
  const u = x >= 0 ? knee(x, vpos, 3) : vneg * Math.tanh(x / vneg);
  return u + (0.15 * u * u) / (vpos + vneg);
}

// Single-ended 6V6, grid-referred: one tube handles both halves of the
// wave on a curved (roughly square-law) characteristic, so its distortion
// is mostly 2nd harmonic, growing with level until the grid conducts at
// +vpos or the tube cuts off at -vneg.
function power6v6(x: number, vpos: number, vneg: number) {
  const u = x >= 0 ? knee(x, vpos, 4) : knee(x, vneg, 4);
  return u + (0.11 * u * u) / ((vpos + vneg) / 2);
}

class Champ600 extends AudioWorkletProcessor {
  private p: WorkletParams | null = null;
  private readonly up = antiAlias(sampleRate * OS, 20000);
  private readonly down = antiAlias(sampleRate * OS, 20000);
  private readonly shelfA = new Iir();
  private readonly net = new Iir();
  private readonly shelfB = new Iir();
  private readonly coupling = new Iir();
  private readonly ot = new Iir();
  private speaker = 0; // last speaker voltage, for the feedback loop
  private env = 0; // power-supply sag envelope
  private readonly attack = 1 - Math.exp(-1 / (0.01 * sampleRate * OS));
  private readonly release = 1 - Math.exp(-1 / (0.15 * sampleRate * OS));

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<WorkletParams>) => {
      const p = e.data;
      this.shelfA.set(p.stageA.shelf);
      this.net.set(p.net);
      this.shelfB.set(p.stageB.shelf);
      this.coupling.set(p.coupling);
      this.ot.set(p.ot);
      this.p = p;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const p = this.p;
    const input = inputs[0];
    if (!p || !input || input.length === 0) {
      out.fill(0);
      return true;
    }
    const { stageA: A, stageB: B, power: P } = p;
    for (let i = 0; i < out.length; i++) {
      let x = 0;
      for (let ch = 0; ch < input.length; ch++) x += input[ch][i];
      x = (x / input.length) * p.inScale; // volts at V2-A's grid (1.0 = 1 V)
      let y = 0;
      for (let k = 0; k < OS; k++) {
        // Zero-stuff and filter: one sample becomes four.
        let v = k === 0 ? x * OS : 0;
        v = this.up[1].process(this.up[0].process(v));

        // V2-A, then the tone stack and volume pot.
        v = this.shelfA.process(triode(v, A.vpos, A.vneg));
        v = this.net.process(v);

        // V2-B with the global feedback subtracted at its cathode.
        v = this.shelfB.process(triode(v - p.beta * this.speaker, B.vpos, B.vneg));

        // C2 into the 6V6: grid clips at +Vk and cuts off below; the
        // plate swing is limited and shrinks as the supply sags.
        v = this.coupling.process(v);
        let plate = P.gain * power6v6(v, P.vpos, P.vneg);
        const level = Math.min(1, Math.abs(plate) / P.plateLimit);
        this.env += (level > this.env ? this.attack : this.release) * (level - this.env);
        const limit = P.plateLimit * (1 - p.sag * this.env);
        plate = knee(plate, limit, 4);

        // Output transformer to the speaker; that voltage feeds back.
        this.speaker = this.ot.process(plate);
        y = this.down[1].process(this.down[0].process(this.speaker));
      }
      out[i] = y * p.outScale;
    }
    return true;
  }
}

registerProcessor('champ600', Champ600);

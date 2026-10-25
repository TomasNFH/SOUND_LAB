// The two-chip Boost + EQ, per sample at 4x so the rail clipping doesn't
// alias: U2A, U2B and U1A each as second-order sections, each followed by
// its op-amp's rails, then the volume. Coefficients come from boostEq.ts.

import { antiAlias, Iir } from '../dsp';
import { railClip, type BoostEqWorkletParams } from './boostEq';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const OS = 4;

class BoostEq4558 extends AudioWorkletProcessor {
  private headroom = 3;
  private stages: Iir[][] = [];
  private readonly up = antiAlias(sampleRate * OS, 20000);
  private readonly down = antiAlias(sampleRate * OS, 20000);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<BoostEqWorkletParams>) => {
      // Keep each section's state when only the coefficients change.
      this.stages = e.data.stages.map((secs, i) =>
        secs.map((f, j) => {
          const iir = this.stages[i]?.[j] ?? new Iir();
          iir.set(f);
          return iir;
        }),
      );
      this.headroom = e.data.headroom;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const input = inputs[0];
    const stages = this.stages;
    if (stages.length === 0 || !input || input.length === 0) {
      out.fill(0);
      return true;
    }
    const last = stages.length - 1;
    for (let i = 0; i < out.length; i++) {
      let x = 0;
      for (let ch = 0; ch < input.length; ch++) x += input[ch][i];
      x /= input.length; // volts (1.0 = 1 V)
      let y = 0;
      for (let k = 0; k < OS; k++) {
        let v = k === 0 ? x * OS : 0;
        v = this.up[1].process(this.up[0].process(v));
        for (let s = 0; s <= last; s++) {
          for (const sec of stages[s]) v = sec.process(v);
          if (s < last) v = railClip(v, this.headroom); // U2A, U2B, U1A outputs
        }
        y = this.down[1].process(this.down[0].process(v));
      }
      out[i] = y;
    }
    return true;
  }
}

registerProcessor('boostEq4558', BoostEq4558);

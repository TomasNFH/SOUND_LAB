// The 4558 clean boost, per sample at 4x so the rail clipping doesn't
// alias. Coefficients come from boost4558.ts on the main thread.

import { antiAlias, Iir } from '../dsp';
import { railClip, type BoostWorkletParams } from './boost4558';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const OS = 4;

class Boost4558 extends AudioWorkletProcessor {
  private p: BoostWorkletParams | null = null;
  private readonly up = antiAlias(sampleRate * OS, 20000);
  private readonly down = antiAlias(sampleRate * OS, 20000);
  private readonly pre = new Iir();
  private readonly post = new Iir();

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<BoostWorkletParams>) => {
      this.pre.set(e.data.pre);
      this.post.set(e.data.post);
      this.p = e.data;
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
    for (let i = 0; i < out.length; i++) {
      let x = 0;
      for (let ch = 0; ch < input.length; ch++) x += input[ch][i];
      x /= input.length; // volts (1.0 = 1 V)
      let y = 0;
      for (let k = 0; k < OS; k++) {
        let v = k === 0 ? x * OS : 0;
        v = this.up[1].process(this.up[0].process(v));
        v = railClip(this.pre.process(v), p.headroom); // U1A output, limited by the rails
        v = this.post.process(v); // C3 and the volume pot
        y = this.down[1].process(this.down[0].process(v));
      }
      out[i] = y;
    }
    return true;
  }
}

registerProcessor('boost4558', Boost4558);

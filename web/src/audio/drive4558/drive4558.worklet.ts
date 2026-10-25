// The 4558 mid-hump overdrive, per sample at 4x so the diode and rail
// clipping don't alias. Coefficients come from ts4558.ts on the main
// thread.

import { antiAlias, Iir } from '../dsp';
import { diodeClip, railClip, type Drive4558WorkletParams } from './drive4558';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const OS = 4;

class Drive4558 extends AudioWorkletProcessor {
  private p: Drive4558WorkletParams | null = null;
  private readonly up = antiAlias(sampleRate * OS, 20000);
  private readonly down = antiAlias(sampleRate * OS, 20000);
  private readonly input = new Iir();
  private readonly feedback = new Iir();
  private readonly post = new Iir();

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<Drive4558WorkletParams>) => {
      this.input.set(e.data.input);
      this.feedback.set(e.data.feedback);
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
        v = this.input.process(v); // IC1a + input
        // IC1a output: the input plus the voltage across the feedback,
        // which the diodes hold down; then the rails.
        v = railClip(v + diodeClip(this.feedback.process(v), p.diodes), p.headroom);
        v = this.post.process(v); // R7/C6, tone stage, output cap, level
        y = this.down[1].process(this.down[0].process(v));
      }
      out[i] = y;
    }
    return true;
  }
}

registerProcessor('drive4558', Drive4558);

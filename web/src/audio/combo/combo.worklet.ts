// The 6V6 combo as one AudioWorklet processor, so the global negative
// feedback (speaker → R7 → V2-B cathode) can be a real loop: per sample,
// at 4x the sample rate. Every coefficient is computed on the main thread
// (circuit.ts) and posted here; this file only runs the signal.

import { antiAlias, Iir } from '../dsp';
import type { WorkletParams } from './circuit';
import { knee, power6v6, triode } from './curves';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const OS = 4;

class Combo6V6 extends AudioWorkletProcessor {
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

registerProcessor('combo6v6', Combo6V6);

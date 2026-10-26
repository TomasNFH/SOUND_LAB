// The tube bass head as one AudioWorklet processor, at 4x the sample rate.
// Every coefficient is computed on the main thread (circuit.ts) and posted
// here; this file only runs the signal:
//
//   in ─ U3 curve ─ input network ─ U1 curve ─ tone / midrange network ─┐
//   ┌────────────────────────────────────────────────────────────────────┘
//   └─ (−β·speaker) ─ drivers ─ 6550 push-pull ─ output transformer ─ speaker
//          ↑                                                            │
//          └────────────────────── negative feedback ───────────────────┘

import { antiAlias, Iir } from '../dsp';
import { knee, triode } from '../combo/curves';
import type { TubeBassParams } from './circuit';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}

const OS = 4;

// Keep filter state when only the coefficients change (turning a knob),
// so the sound doesn't click.
function setSections(current: Iir[], sections: TubeBassParams['netIn']) {
  const chain = current.length === sections.length ? current : sections.map(() => new Iir());
  chain.forEach((iir, i) => iir.set(sections[i]));
  return chain;
}

const run = (chain: Iir[], x: number) => {
  let v = x;
  for (const f of chain) v = f.process(v);
  return v;
};

class TubeBass extends AudioWorkletProcessor {
  private p: TubeBassParams | null = null;
  private netIn: Iir[] = [];
  private netPost: Iir[] = [];
  private ot: Iir[] = [];
  private driver: Iir[] = [];
  private readonly up = antiAlias(sampleRate * OS, 20000);
  private readonly down = antiAlias(sampleRate * OS, 20000);
  private speaker = 0; // last speaker voltage, for the feedback loop
  private env = 0; // power-supply sag envelope
  private readonly attack = 1 - Math.exp(-1 / (0.02 * sampleRate * OS));
  private readonly release = 1 - Math.exp(-1 / (0.2 * sampleRate * OS));

  constructor(options: { processorOptions?: TubeBassParams }) {
    super(options);
    // Parameters in the constructor options are in place before the first
    // sample, even in an offline render; later changes come as messages.
    if (options.processorOptions) this.update(options.processorOptions);
    this.port.onmessage = (e: MessageEvent<TubeBassParams>) => this.update(e.data);
  }

  private update(p: TubeBassParams) {
    this.netIn = setSections(this.netIn, p.netIn);
    this.netPost = setSections(this.netPost, p.netPost);
    this.ot = setSections(this.ot, p.ot);
    this.driver = setSections(this.driver, p.driver);
    this.p = p;
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
    const x = input[0];
    const { u3, u1, pa } = p;
    const toPlate = pa.speaker / pa.grid; // grid volts at clipping → full speaker swing
    for (let i = 0; i < out.length; i++) {
      let y = 0;
      for (let k = 0; k < OS; k++) {
        // Zero-stuff and filter: one sample becomes four. Input in volts.
        let v = this.up[1].process(this.up[0].process(k === 0 ? x[i] * OS : 0));

        // Preamp: the two stages that clip, with the circuit between them.
        v = run(this.netIn, triode(v, u3.vpos, u3.vneg));
        v = run(this.netPost, triode(v, u1.vpos, u1.vneg));

        // Power amp: feedback subtracted at the phase inverter; the drivers
        // swing the 6550 grids, which clip symmetrically near their bias
        // (push-pull: odd harmonics, a trace of even from imbalance).
        const drive = run(this.driver, pa.drive * (v - pa.beta * this.speaker));
        let grid = knee(drive, pa.grid, 3);
        grid += (0.02 * grid * grid) / pa.grid;
        let plate = grid * toPlate;
        // The supply sags as the plates work hard, lowering the ceiling.
        const level = Math.min(1, Math.abs(plate) / pa.plate);
        this.env += (level > this.env ? this.attack : this.release) * (level - this.env);
        plate = knee(plate, pa.plate * (1 - pa.sag * this.env), 4);

        this.speaker = run(this.ot, plate);
        y = this.down[1].process(this.down[0].process(this.speaker));
      }
      out[i] = y * p.outScale;
    }
    return true;
  }
}

registerProcessor('tubeBass', TubeBass);

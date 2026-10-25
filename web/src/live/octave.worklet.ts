// Octave down by frequency division, the way analog octave pedals do it:
//
//   guitar ─ tracking filter ─┬─ zero-crossing flip-flop (toggles every
//                             │  other cycle: half the frequency)
//                             └─ × ── note one octave down
//
// The tracking filter keeps mostly the fundamental, so the flip-flop counts
// the note and not its overtones. Multiplying that filtered note by the
// ±1 flip-flop gives a wave at half the frequency that follows the
// picking dynamics. It reacts sample by sample: no added delay. It follows
// one note at a time; chords make it warble, as on the pedals.

import { Iir } from '../audio/dsp';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}

export interface OctaveParams {
  tracking: number; // Hz, the tracking filter's corner
  gate: number; // linear level under which the octave fades out
}

function biquad(type: 'lowpass' | 'highpass', f: number, q: number) {
  const w = (2 * Math.PI * f) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const k = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos);
  const iir = new Iir();
  iir.set({ b: [k / a0, b1 / a0, k / a0], a: [1, (-2 * cos) / a0, (1 - alpha) / a0] });
  return iir;
}

const coef = (seconds: number) => 1 - Math.exp(-1 / (seconds * sampleRate));

class OctaveDown extends AudioWorkletProcessor {
  private p: OctaveParams = { tracking: 250, gate: 0.003 };
  private hp = biquad('highpass', 45, 0.7);
  private lp: Iir[] = [];
  private env = 0;
  private high = false; // Schmitt trigger state
  private flip = 1; // the divided square, ±1
  private flipSmooth = 1; // rounded edges, so the switch doesn't click
  private gate = 0;
  private readonly envAttack = coef(0.001);
  private readonly envRelease = coef(0.05);
  private readonly flipSlew = coef(0.0004);
  private readonly gateOpen = coef(0.004);
  private readonly gateClose = coef(0.04);

  constructor(options: { processorOptions?: Partial<OctaveParams> }) {
    super(options);
    this.update({ ...this.p, ...options.processorOptions });
    this.port.onmessage = (e: MessageEvent<Partial<OctaveParams>>) => this.update({ ...this.p, ...e.data });
  }

  private update(p: OctaveParams) {
    this.p = p;
    // Two 2nd-order sections: 24 dB per octave above the fundamental.
    this.lp = [biquad('lowpass', p.tracking, 0.6), biquad('lowpass', p.tracking, 0.6)];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0];
    const out = outputs[0][0];
    if (!out) return true;
    if (!input || input.length === 0) {
      out.fill(0);
      return true;
    }
    const x = input[0];
    const [lp0, lp1] = this.lp;
    for (let i = 0; i < out.length; i++) {
      const t = lp1.process(lp0.process(this.hp.process(x[i])));
      const a = Math.abs(t);
      this.env += (a > this.env ? this.envAttack : this.envRelease) * (a - this.env);
      // Hysteresis around zero, scaled to the note's level: overtones and
      // noise riding on the wave can't make it count twice.
      const h = 0.15 * this.env;
      if (!this.high && t > h) {
        this.high = true;
        this.flip = -this.flip;
      } else if (this.high && t < -h) {
        this.high = false;
      }
      this.flipSmooth += this.flipSlew * (this.flip - this.flipSmooth);
      const open = this.env > this.p.gate ? 1 : 0;
      this.gate += (open > this.gate ? this.gateOpen : this.gateClose) * (open - this.gate);
      out[i] = t * this.flipSmooth * this.gate;
    }
    return true;
  }
}

registerProcessor('octaveDown', OctaveDown);

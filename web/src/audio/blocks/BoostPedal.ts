import type { BoostSettings } from '../settings';
import { dbToGain, setParam, type Block } from '../util';

// Clean boost: a plain gain stage. Useful as a reference next to the
// drive pedals: same loudness change, no new harmonics.
export class BoostPedal implements Block {
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = this.input;
  }

  apply(s: BoostSettings) {
    setParam(this.input.gain, dbToGain(s.gain), this.ctx);
  }
}

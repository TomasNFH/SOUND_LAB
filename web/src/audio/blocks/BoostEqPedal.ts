import workletUrl from '../boost/boostEq.worklet.ts?worker&url';
import { boostEqWorkletParams } from '../boost/boostEq';
import type { BoostEqSettings } from '../settings';
import type { Block } from '../util';
import { loadWorklet } from '../worklets';

const OVERSAMPLE = 4;

// Boost + EQ: the two-JRC4558 circuit from
// boost_eq_cortes_bypass_2x4558.cir, every part a setting, running in an
// AudioWorklet. Silent until the module loads;
// ready() resolves once it is in place.
export class BoostEqPedal implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private last: BoostEqSettings | null = null;
  private postedKey = '';
  private readonly loading: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.loading = loadWorklet(ctx, workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, 'boostEq4558', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.input.connect(this.node).connect(this.output);
      if (this.last) this.post(this.last);
    });
  }

  ready() {
    return this.loading;
  }

  apply(s: BoostEqSettings) {
    this.last = s;
    this.post(s);
  }

  private post(s: BoostEqSettings) {
    const key = JSON.stringify(s);
    if (!this.node || key === this.postedKey) return;
    this.postedKey = key;
    this.node.port.postMessage(boostEqWorkletParams(s, this.ctx.sampleRate * OVERSAMPLE));
  }
}

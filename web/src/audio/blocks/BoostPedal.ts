import workletUrl from '../boost/boost.worklet.ts?worker&url';
import { boostWorkletParams } from '../boost/boost4558';
import type { BoostSettings } from '../settings';
import type { Block } from '../util';
import { loadWorklet } from '../worklets';

const OVERSAMPLE = 4;

// Clean boost: the JRC4558 circuit from clean_boost_4558.cir, every part
// a setting, running in an AudioWorklet. Silent until the module loads;
// ready() resolves once it is in place.
export class BoostPedal implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private last: BoostSettings | null = null;
  private postedKey = '';
  private readonly loading: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.loading = loadWorklet(ctx, workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, 'boost4558', {
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

  apply(s: BoostSettings) {
    this.last = s;
    this.post(s);
  }

  private post(s: BoostSettings) {
    const key = JSON.stringify(s);
    if (!this.node || key === this.postedKey) return;
    this.postedKey = key;
    this.node.port.postMessage(boostWorkletParams(s, this.ctx.sampleRate * OVERSAMPLE));
  }
}

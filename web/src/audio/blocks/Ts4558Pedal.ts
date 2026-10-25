import workletUrl from '../ts4558/ts4558.worklet.ts?worker&url';
import { ts4558WorkletParams } from '../ts4558/ts4558';
import type { Ts4558Settings } from '../settings';
import type { Block } from '../util';
import { loadWorklet } from '../worklets';

const OVERSAMPLE = 4;

// Mid-hump overdrive built from its circuit around a JRC4558, every part
// a setting, running in an AudioWorklet. Silent until the module loads;
// ready() resolves once it is in place.
export class Ts4558Pedal implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private last: Ts4558Settings | null = null;
  private postedKey = '';
  private readonly loading: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.loading = loadWorklet(ctx, workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, 'ts4558', {
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

  apply(s: Ts4558Settings) {
    this.last = s;
    this.post(s);
  }

  private post(s: Ts4558Settings) {
    const key = JSON.stringify(s);
    if (!this.node || key === this.postedKey) return;
    this.postedKey = key;
    this.node.port.postMessage(ts4558WorkletParams(s, this.ctx.sampleRate * OVERSAMPLE));
  }
}

import workletUrl from '../drive4558/drive4558.worklet.ts?worker&url';
import { drive4558WorkletParams } from '../drive4558/drive4558';
import type { Drive4558Settings } from '../settings';
import type { Block } from '../util';
import { loadWorklet } from '../worklets';

const OVERSAMPLE = 4;

// Mid-hump overdrive built from its circuit around a JRC4558, every part
// a setting, running in an AudioWorklet. Silent until the module loads;
// ready() resolves once it is in place.
export class Drive4558Pedal implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private last: Drive4558Settings | null = null;
  private postedKey = '';
  private readonly loading: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.loading = loadWorklet(ctx, workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, 'drive4558', {
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

  apply(s: Drive4558Settings) {
    this.last = s;
    this.post(s);
  }

  private post(s: Drive4558Settings) {
    const key = JSON.stringify(s);
    if (!this.node || key === this.postedKey) return;
    this.postedKey = key;
    this.node.port.postMessage(drive4558WorkletParams(s, this.ctx.sampleRate * OVERSAMPLE));
  }
}

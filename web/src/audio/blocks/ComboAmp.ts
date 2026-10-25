import workletUrl from '../combo/combo.worklet.ts?worker&url';
import { workletParams } from '../combo/circuit';
import type { AmpSettings } from '../settings';
import type { Block } from '../util';
import { loadWorklet } from '../worklets';

const OVERSAMPLE = 4;

// 6V6 combo preamp and power amp (everything before the speaker),
// running in an AudioWorklet. Silent until the module has loaded, which
// takes a moment at startup; ready() resolves once it is in place.
export class ComboAmp implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private last: AmpSettings | null = null;
  private postedKey = '';
  private readonly loading: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.loading = loadWorklet(ctx, workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, 'combo6v6', {
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

  apply(amp: AmpSettings) {
    this.last = amp;
    if (this.node) this.post(amp);
  }

  private post(amp: AmpSettings) {
    // Settings are re-applied on every change to either branch; only send
    // coefficients when this amp's circuit actually changed.
    const key = JSON.stringify([amp.champ, amp.volume]);
    if (!this.node || key === this.postedKey) return;
    this.postedKey = key;
    this.node.port.postMessage(workletParams(amp.champ, amp.volume, this.ctx.sampleRate * OVERSAMPLE));
  }
}

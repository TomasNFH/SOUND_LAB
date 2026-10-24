import { EqBlock } from './blocks/EqBlock';
import { PedalBlock } from './blocks/PedalBlock';
import type { ToneSettings } from './settings';
import { Slot } from './util';

// The processing chain between the source and the A/B switch. It only
// depends on a BaseAudioContext, so the same chain can be built in an
// OfflineAudioContext to export a processed file.
//
//   input ─ [EQ pre] ─ pedal ─ [EQ post] ─ output
export class Chain {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly eq: EqBlock;
  readonly pedal: PedalBlock;
  private readonly eqSlot: Slot;
  private readonly pedalSlot: Slot;
  private orderKey = '';

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.eq = new EqBlock(ctx, 6);
    this.pedal = new PedalBlock(ctx);
    this.eqSlot = new Slot(ctx, this.eq);
    this.pedalSlot = new Slot(ctx, this.pedal);
  }

  apply(s: ToneSettings) {
    this.eq.apply(s.eq);
    this.eqSlot.setEnabled(s.eq.on);
    this.pedal.apply(s.pedal);
    this.pedalSlot.setEnabled(s.pedal.on);
    this.connect(s);
  }

  private order(s: ToneSettings): Slot[] {
    return s.eq.position === 'pre' ? [this.eqSlot, this.pedalSlot] : [this.pedalSlot, this.eqSlot];
  }

  // Rewire only when the order actually changes. While playing, fade the
  // output out around the rewire so the switch doesn't click.
  private connect(s: ToneSettings) {
    const slots = this.order(s);
    const key = slots.map((sl) => this.slotName(sl)).join('>');
    if (key === this.orderKey) return;
    const first = this.orderKey === '';
    this.orderKey = key;

    const rewire = () => {
      this.input.disconnect();
      for (const sl of slots) sl.output.disconnect();
      let prev: AudioNode = this.input;
      for (const sl of slots) {
        prev.connect(sl.input);
        prev = sl.output;
      }
      prev.connect(this.output);
    };

    if (first || this.ctx instanceof OfflineAudioContext) {
      rewire();
      return;
    }
    const g = this.output.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.004);
    window.setTimeout(() => {
      rewire();
      g.setTargetAtTime(1, this.ctx.currentTime, 0.004);
    }, 25);
  }

  private slotName(sl: Slot) {
    return sl === this.eqSlot ? 'eq' : 'pedal';
  }
}

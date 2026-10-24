import { Amp } from './blocks/Amp';
import { Delay, delayTail } from './blocks/Delay';
import { EqBlock } from './blocks/EqBlock';
import { PedalBlock } from './blocks/PedalBlock';
import { Reverb, reverbTail } from './blocks/Reverb';
import type { ToneSettings } from './settings';
import { Slot } from './util';

// The processing chain between the source and the A/B switch. It only
// depends on a BaseAudioContext, so the same chain can be built in an
// OfflineAudioContext to export a processed file.
//
//   input ─ [EQ pre] ─ pedal ─ [EQ post] ─ [fx pre] ─ amp ─ [fx post] ─ output
//
// where fx is delay then reverb, before or after the amp.
export class Chain {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly eq: EqBlock;
  readonly pedal: PedalBlock;
  readonly amp: Amp;
  readonly delay: Delay;
  readonly reverb: Reverb;
  private readonly eqSlot: Slot;
  private readonly delaySlot: Slot;
  private readonly reverbSlot: Slot;
  private readonly pedalSlot: Slot;
  private readonly ampSlot: Slot;
  private orderKey = '';

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.eq = new EqBlock(ctx, 6);
    this.pedal = new PedalBlock(ctx);
    this.eqSlot = new Slot(ctx, this.eq);
    this.pedalSlot = new Slot(ctx, this.pedal);
    this.amp = new Amp(ctx);
    this.ampSlot = new Slot(ctx, this.amp);
    this.delay = new Delay(ctx);
    this.delaySlot = new Slot(ctx, this.delay);
    this.reverb = new Reverb(ctx);
    this.reverbSlot = new Slot(ctx, this.reverb);
  }

  // Seconds of sound after the input ends (delay repeats, reverb decay);
  // an export renders this much extra.
  // irSeconds: length of a user reverb IR, when one is selected.
  static tailSeconds(s: ToneSettings, irSeconds?: number) {
    return delayTail(s.delay) + reverbTail(s.reverb, irSeconds);
  }

  // Resolves once anything the chain loads asynchronously is in place.
  async ready() {
    await Promise.all([this.amp.ready(), this.reverb.ready(), this.delay.ready()]);
  }

  apply(s: ToneSettings) {
    this.eq.apply(s.eq);
    this.eqSlot.setEnabled(s.eq.on);
    this.pedal.apply(s.pedal);
    this.pedalSlot.setEnabled(s.pedal.on);
    this.amp.apply(s.amp);
    this.ampSlot.setEnabled(s.amp.on);
    this.delay.apply(s.delay);
    this.delaySlot.setEnabled(s.delay.on);
    this.reverb.apply(s.reverb);
    this.reverbSlot.setEnabled(s.reverb.on);
    this.connect(s);
  }

  private order(s: ToneSettings): Slot[] {
    const front = s.eq.position === 'pre' ? [this.eqSlot, this.pedalSlot] : [this.pedalSlot, this.eqSlot];
    const fx = [this.delaySlot, this.reverbSlot];
    return s.fxPosition === 'pre' ? [...front, ...fx, this.ampSlot] : [...front, this.ampSlot, ...fx];
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
    const names = new Map<Slot, string>([
      [this.eqSlot, 'eq'],
      [this.pedalSlot, 'pedal'],
      [this.ampSlot, 'amp'],
      [this.delaySlot, 'delay'],
      [this.reverbSlot, 'reverb'],
    ]);
    return names.get(sl) ?? '?';
  }
}

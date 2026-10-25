import { Amp } from '../audio/blocks/Amp';
import { Delay } from '../audio/blocks/Delay';
import { EqBlock } from '../audio/blocks/EqBlock';
import { PedalBlock } from '../audio/blocks/PedalBlock';
import { Reverb } from '../audio/blocks/Reverb';
import type { ToneSettings } from '../audio/settings';
import { clippersReady, type Block } from '../audio/util';

// What decides which nodes exist: blocks on or off, their order, and which
// pedal circuit and amp model. Two settings with the same key differ only
// in knob values, which apply() handles in place.
export function liveStructure(s: ToneSettings) {
  return JSON.stringify([
    s.eq.on && s.eq.position,
    s.pedal.on && [s.pedal.type, s.pedal.boostCircuit, s.pedal.ts.mode],
    s.amp.on && s.amp.model,
    s.delay.on,
    s.reverb.on,
    s.fxPosition,
  ]);
}

interface Stage extends Block {
  apply(s: ToneSettings): void;
  ready?(): Promise<unknown>;
}

// A Tone Lab branch with only what you hear in it. Tone Lab's Chain builds
// every block and every pedal and amp model, running side by side so you
// can switch and bypass without clicks; here a block that is off, or a
// model that isn't selected, doesn't exist and costs nothing. Changing
// which ones are in use means building a new LiveChain.
export class LiveChain implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly key: string;
  private readonly stages: Stage[];

  constructor(
    private readonly ctx: BaseAudioContext,
    s: ToneSettings,
  ) {
    this.key = liveStructure(s);
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const eq: Stage | null = s.eq.on ? wrap(new EqBlock(ctx, 6), (b, t) => b.apply(t.eq)) : null;
    const pedal: Stage | null = s.pedal.on ? wrap(new PedalBlock(ctx, s.pedal), (b, t) => b.apply(t.pedal)) : null;
    const amp: Stage | null = s.amp.on ? wrap(new Amp(ctx, s.amp.model), (b, t) => b.apply(t.amp)) : null;
    const delay: Stage | null = s.delay.on ? wrap(new Delay(ctx), (b, t) => b.apply(t.delay)) : null;
    const reverb: Stage | null = s.reverb.on ? wrap(new Reverb(ctx), (b, t) => b.apply(t.reverb)) : null;

    // Same order as Tone Lab's Chain.
    const front = s.eq.position === 'pre' ? [eq, pedal] : [pedal, eq];
    const fx = [delay, reverb];
    const order = s.fxPosition === 'pre' ? [...front, ...fx, amp] : [...front, amp, ...fx];
    this.stages = order.filter((b): b is Stage => b !== null);

    let prev: AudioNode = this.input;
    for (const stage of this.stages) {
      prev.connect(stage.input);
      prev = stage.output;
    }
    prev.connect(this.output);
    this.apply(s);
  }

  apply(s: ToneSettings) {
    for (const stage of this.stages) stage.apply(s);
  }

  ready() {
    return Promise.all([...this.stages.map((b) => b.ready?.()), clippersReady(this.ctx)]).then(() => undefined);
  }
}

function wrap<B extends Block & { ready?(): Promise<unknown> }>(block: B, apply: (b: B, s: ToneSettings) => void): Stage {
  return { input: block.input, output: block.output, apply: (s) => apply(block, s), ready: block.ready?.bind(block) };
}

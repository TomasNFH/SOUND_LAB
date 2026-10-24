import type { PedalSettings, PedalType } from '../settings';
import { setParam, type Block } from '../util';
import { BoostPedal } from './BoostPedal';
import { TubeScreamer } from './TubeScreamer';

type Model = Block & { apply(s: PedalSettings): void };

// The pedal slot: every model is built once and runs in parallel; picking
// a pedal crossfades to it. Switching pedals mid-playback is click-free,
// and each model keeps its own knob settings.
export class PedalBlock implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly models: Record<PedalType, Model>;
  private readonly selectors = new Map<PedalType, GainNode>();
  private current: PedalType | null = null;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const boost = new BoostPedal(ctx);
    const ts = new TubeScreamer(ctx);
    this.models = {
      boost: { input: boost.input, output: boost.output, apply: (s) => boost.apply(s.boost) },
      ts: { input: ts.input, output: ts.output, apply: (s) => ts.apply(s.ts) },
    };

    for (const [type, model] of Object.entries(this.models) as [PedalType, Model][]) {
      const sel = ctx.createGain();
      sel.gain.value = 0;
      this.input.connect(model.input);
      model.output.connect(sel).connect(this.output);
      this.selectors.set(type, sel);
    }
  }

  apply(s: PedalSettings) {
    for (const model of Object.values(this.models)) model.apply(s);
    if (s.type !== this.current) {
      this.current = s.type;
      for (const [type, sel] of this.selectors) setParam(sel.gain, type === s.type ? 1 : 0, this.ctx);
    }
  }
}

import type { PedalSettings, PedalType } from '../settings';
import { setParam, type Block } from '../util';
import { BluesDriver } from './BluesDriver';
import { BoostPedal } from './BoostPedal';
import { Ds2 } from './Ds2';
import { Klon } from './Klon';
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
  private readonly boost: BoostPedal;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const boost = new BoostPedal(ctx);
    this.boost = boost;
    const ts = new TubeScreamer(ctx);
    const bd = new BluesDriver(ctx);
    const ds2 = new Ds2(ctx);
    const klon = new Klon(ctx);
    this.models = {
      boost: { input: boost.input, output: boost.output, apply: (s) => boost.apply(s.boost) },
      ts: { input: ts.input, output: ts.output, apply: (s) => ts.apply(s.ts) },
      bd: { input: bd.input, output: bd.output, apply: (s) => bd.apply(s.bd) },
      ds2: { input: ds2.input, output: ds2.output, apply: (s) => ds2.apply(s.ds2) },
      klon: { input: klon.input, output: klon.output, apply: (s) => klon.apply(s.klon) },
    };

    for (const [type, model] of Object.entries(this.models) as [PedalType, Model][]) {
      const sel = ctx.createGain();
      sel.gain.value = 0;
      this.input.connect(model.input);
      model.output.connect(sel).connect(this.output);
      this.selectors.set(type, sel);
    }
  }

  // Resolves once every model that loads something (worklets) is ready.
  ready() {
    return this.boost.ready();
  }

  apply(s: PedalSettings) {
    for (const model of Object.values(this.models)) model.apply(s);
    if (s.type !== this.current) {
      this.current = s.type;
      for (const [type, sel] of this.selectors) setParam(sel.gain, type === s.type ? 1 : 0, this.ctx);
    }
  }
}

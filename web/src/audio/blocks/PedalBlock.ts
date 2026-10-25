import type { PedalSettings, PedalType } from '../settings';
import { clippersReady, setGate, type Block } from '../util';
import { AmpLikeDrive } from './AmpLikeDrive';
import { BoostEqPedal } from './BoostEqPedal';
import { BoostPedal } from './BoostPedal';
import { HardDistortion } from './HardDistortion';
import { CleanBlendDrive } from './CleanBlendDrive';
import { Drive4558Pedal } from './Drive4558Pedal';
import { MidHumpDrive } from './MidHumpDrive';

type Model = Block & { apply(s: PedalSettings): void };

// The pedal slot: every model is built once and runs in parallel; picking
// a pedal crossfades to it. Switching pedals mid-playback is click-free,
// and each model keeps its own knob settings. Unselected models get true
// silence at their input, so their clippers idle.
//
// With `only`, just the circuit those settings select is built (Live:
// nothing unheard runs at all); picking another pedal then needs a new
// PedalBlock.
export class PedalBlock implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly models = new Map<PedalType, Model>();
  private readonly gates = new Map<PedalType, GainNode[]>();
  private current: PedalType | null = null;
  private readonly loading: Promise<unknown>[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    only?: PedalSettings,
  ) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const want = (type: PedalType) => !only || only.type === type;

    if (want('boost')) {
      const eq = only?.boostCircuit === 'eq';
      const simple = !only || !eq ? new BoostPedal(ctx) : null;
      const boostEq = !only || eq ? new BoostEqPedal(ctx) : null;
      this.loading.push(simple?.ready() ?? Promise.resolve(), boostEq?.ready() ?? Promise.resolve());
      this.add(
        'boost',
        this.twoModes(simple, boostEq, (s) => {
          simple?.apply(s.boost);
          boostEq?.apply(s.boostEq);
          return s.boostCircuit === 'eq';
        }),
      );
    }
    if (want('ts')) {
      const c4558 = only?.ts.mode === '4558';
      const classic = !only || !c4558 ? new MidHumpDrive(ctx) : null;
      const ts4558 = !only || c4558 ? new Drive4558Pedal(ctx) : null;
      this.loading.push(ts4558?.ready() ?? Promise.resolve());
      this.add(
        'ts',
        this.twoModes(classic, ts4558, (s) => {
          classic?.apply(s.ts);
          ts4558?.apply(s.ts.c4558);
          return s.ts.mode === '4558';
        }),
      );
    }
    if (want('bd')) {
      const bd = new AmpLikeDrive(ctx);
      this.add('bd', { input: bd.input, output: bd.output, apply: (s) => bd.apply(s.bd) });
    }
    if (want('ds2')) {
      const ds2 = new HardDistortion(ctx);
      this.add('ds2', { input: ds2.input, output: ds2.output, apply: (s) => ds2.apply(s.ds2) });
    }
    if (want('klon')) {
      const klon = new CleanBlendDrive(ctx);
      this.add('klon', { input: klon.input, output: klon.output, apply: (s) => klon.apply(s.klon) });
    }
  }

  // Wire a model between an input gate and an output switch.
  private add(type: PedalType, model: Model) {
    const inGate = this.ctx.createGain();
    const outGate = this.ctx.createGain();
    inGate.gain.value = 0;
    outGate.gain.value = 0;
    this.input.connect(inGate).connect(model.input);
    model.output.connect(outGate).connect(this.output);
    this.models.set(type, model);
    this.gates.set(type, [inGate, outGate]);
  }

  // A pedal with two circuits (the clean boost's two netlists, the
  // mid-hump overdrive's classic and 4558 modes), either of which may be
  // left out: `apply` sets them and returns whether the second one is
  // selected; the choice crossfades between them.
  private twoModes(first: Block | null, second: Block | null, apply: (s: PedalSettings) => boolean): Model {
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const gates = [first, second].map((circuit) => {
      const inGate = this.ctx.createGain();
      const outGate = this.ctx.createGain();
      inGate.gain.value = 0;
      outGate.gain.value = 0;
      if (circuit) {
        input.connect(inGate).connect(circuit.input);
        circuit.output.connect(outGate).connect(output);
      }
      return [inGate, outGate];
    });
    return {
      input,
      output,
      apply: (s) => {
        const useSecond = apply(s);
        gates.forEach((pair, i) => pair.forEach((g) => setGate(g.gain, (i === 1) === useSecond, this.ctx)));
      },
    };
  }

  // Resolves once every model that loads something (worklets) is ready.
  ready() {
    return Promise.all([...this.loading, clippersReady(this.ctx)]).then(() => undefined);
  }

  apply(s: PedalSettings) {
    for (const model of this.models.values()) model.apply(s);
    if (s.type !== this.current) {
      this.current = s.type;
      for (const [type, gates] of this.gates) for (const g of gates) setGate(g.gain, type === s.type, this.ctx);
    }
  }
}

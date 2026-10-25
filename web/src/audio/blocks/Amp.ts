import { isBuiltInCab, levelIr, loadIr, synthCabinetIR } from '../ir';
import type { AmpSettings } from '../settings';
import { dbToGain, lerp, setParam, ShaperStage, Slot, type Block } from '../util';
import { ChampAmp } from './ChampAmp';
import { asymSoftClip, tubeClip } from './clippers';

// The amp block holds two models that share the cabinet:
//
//   in ─┬─ 6V6 combo (circuit model, AudioWorklet) ──┬─ cabinet ─ out
//       └─ generic small combo ─────────────────────────┘
//
// Generic: a hand-tuned small combo, as stages:
//
//   preamp gain ─ tube stage ─ tone stack ─ power drive ─ power stage ─ sag
//
// Volume pushes both the preamp and the power stage: low is clean, high
// breaks up, and a pedal in front breaks it up sooner. The tone stack is
// a classic bass / middle / treble approximated with three filters
// (the real one is a passive network whose controls interact).

export const ampStages = (volume: number) => ({
  pre: dbToGain(lerp(-4, 30, volume)),
  power: dbToGain(lerp(-10, 10, volume)),
});

const POWER = asymSoftClip(1, 0.85); // single-ended output stage: a bit lopsided

export const ampPreampTransfer = (s: AmpSettings) => {
  const { pre } = ampStages(s.volume);
  return (x: number) => tubeClip(pre * x);
};

export const toneStackSpecs = (s: AmpSettings) => [
  { type: 'lowshelf' as const, freq: 120, gain: lerp(-12, 6, s.bass), q: 0.7 },
  // These stacks always scoop the mids; "middle" fills the scoop back in.
  { type: 'peaking' as const, freq: 500, gain: lerp(-12, 0, s.middle), q: 0.8 },
  { type: 'highshelf' as const, freq: 2500, gain: lerp(-12, 8, s.treble), q: 0.7 },
];

export class Amp implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly preGain: GainNode;
  private readonly stack: BiquadFilterNode[];
  private readonly powerGain: GainNode;
  private readonly sag: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private readonly cab: ConvolverNode;
  private readonly cabSlot: Slot;
  private readonly champ: ChampAmp;
  private readonly champSel: GainNode;
  private readonly genericSel: GainNode;
  private model: AmpSettings['model'] | null = null;
  private cabName: string | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.preGain = ctx.createGain();
    const pre = new ShaperStage(ctx, tubeClip);
    const coupling = ctx.createBiquadFilter(); // coupling caps: no DC, little sub-bass
    coupling.type = 'highpass';
    coupling.frequency.value = 40;
    this.stack = [0, 1, 2].map(() => ctx.createBiquadFilter());
    this.powerGain = ctx.createGain();
    const power = new ShaperStage(ctx, POWER);
    const dc = ctx.createBiquadFilter();
    dc.type = 'highpass';
    dc.frequency.value = 20;
    // Power supply sag: loud passages pull the level down a little.
    this.sag = ctx.createDynamicsCompressor();
    this.sag.knee.value = 12;
    this.sag.attack.value = 0.01;
    this.sag.release.value = 0.15;
    this.makeup = ctx.createGain();
    this.cab = ctx.createConvolver();
    this.cab.normalize = false;
    this.cab.buffer = levelIr(ctx, synthCabinetIR(ctx, 'champ6'));
    const cabBlock = { input: this.cab, output: this.cab };
    this.cabSlot = new Slot(ctx, cabBlock);

    let prev: AudioNode = this.input.connect(this.preGain);
    prev.connect(pre.input);
    prev = pre.output.connect(coupling);
    for (const f of this.stack) prev = prev.connect(f);
    prev.connect(this.powerGain).connect(power.input);
    this.genericSel = ctx.createGain();
    this.genericSel.gain.value = 0;
    power.output.connect(dc).connect(this.sag).connect(this.makeup).connect(this.genericSel).connect(this.cabSlot.input);

    this.champ = new ChampAmp(ctx);
    this.champSel = ctx.createGain();
    this.champSel.gain.value = 0;
    this.input.connect(this.champ.input);
    this.champ.output.connect(this.champSel).connect(this.cabSlot.input);
    this.cabSlot.output.connect(this.output);
  }

  apply(s: AmpSettings) {
    const c = this.ctx;
    this.champ.apply(s);
    if (s.model !== this.model) {
      this.model = s.model;
      setParam(this.champSel.gain, s.model === 'champ600' ? 1 : 0, c);
      setParam(this.genericSel.gain, s.model === 'generic' ? 1 : 0, c);
    }
    const { pre, power } = ampStages(s.volume);
    setParam(this.preGain.gain, pre, c);
    toneStackSpecs(s).forEach((spec, i) => {
      const f = this.stack[i];
      if (f.type !== spec.type) f.type = spec.type;
      setParam(f.frequency, spec.freq, c);
      setParam(f.gain, spec.gain, c);
      setParam(f.Q, spec.q, c);
    });
    setParam(this.powerGain.gain, power, c);
    // Sag starts to act as the power stage gets pushed.
    setParam(this.sag.threshold, lerp(-6, -24, s.volume), c);
    setParam(this.sag.ratio, lerp(1.5, 4, s.volume), c);
    // Keep the overall output in a sensible range across the volume knob
    // (level matching does the exact job for A/B).
    setParam(this.makeup.gain, dbToGain(lerp(0, -6, s.volume)), c);
    this.setCab(s.cab);
  }

  // Resolves when the selected cabinet IR is loaded and in place.
  ready() {
    return Promise.all([this.pending, this.champ.ready()]).then(() => undefined);
  }

  private setCab(cab: string) {
    this.cabSlot.setEnabled(cab !== 'off');
    if (cab === this.cabName || cab === 'off') return;
    this.cabName = cab;
    if (isBuiltInCab(cab)) {
      this.cab.buffer = levelIr(this.ctx, synthCabinetIR(this.ctx, cab));
      this.pending = Promise.resolve();
      return;
    }
    this.pending = loadIr('cabinets', cab)
      .then((buf) => {
        if (this.cabName === cab) this.cab.buffer = levelIr(this.ctx, buf);
      })
      .catch((err) => console.warn(`Cabinet IR ${cab} failed to load, keeping the previous one`, err));
  }
}

import type { KlonSettings } from '../settings';
import { dbToGain, latencyMatchedPath, lerp, setParam, ShaperStage, type Block } from '../util';
import { softClip } from './clippers';

// Clean-blend overdrive, simplified: a clean path and a clipped path, summed.
// Germanium diodes clip early and very softly. The gain pot is dual-gang:
// turning it up raises the dirty path's gain and, at the same time, makes
// the clean path a smaller part of the mix. At low gain the clean signal
// keeps the attack of each note intact; the clipped signal adds hair on
// top. Then an active treble control and the output.
//
//   in ─┬─ HP 300 Hz ─ gain ─ germanium clip ─ dirty mix ─┐
//       └─ clean path ─────────────────────── clean mix ──┴─ treble ─ output ─ out

const CLIP = softClip(0.3);

// At low gain the dirty path is a small addition to a clean boost; by
// the top of the knob it dominates.
export const klonMix = (gain: number) => ({
  drive: Math.pow(10, lerp(0.3, 1.9, gain)),
  clean: lerp(1.2, 0.3, gain),
  dirty: lerp(0.05, 1, Math.pow(gain, 1.5)),
});

export const klonTransfer = (s: KlonSettings) => {
  const m = klonMix(s.gain);
  return (x: number) => m.clean * x + m.dirty * CLIP(m.drive * x);
};

export class Klon implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly drive: GainNode;
  private readonly clean: GainNode;
  private readonly dirty: GainNode;
  private readonly treble: BiquadFilterNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    hp.Q.value = 0.5;
    this.drive = ctx.createGain();
    const clip = new ShaperStage(ctx, CLIP);
    this.dirty = ctx.createGain();
    this.clean = ctx.createGain();
    const aligned = latencyMatchedPath(ctx);
    const sum = ctx.createGain();
    this.treble = ctx.createBiquadFilter();
    this.treble.type = 'highshelf';
    this.treble.frequency.value = 1800;

    this.input.connect(hp).connect(this.drive).connect(clip.input);
    clip.output.connect(this.dirty).connect(sum);
    this.input.connect(this.clean).connect(aligned.input);
    aligned.output.connect(sum);
    sum.connect(this.treble).connect(this.output);
  }

  apply(s: KlonSettings) {
    const m = klonMix(s.gain);
    setParam(this.drive.gain, m.drive, this.ctx);
    setParam(this.clean.gain, m.clean, this.ctx);
    setParam(this.dirty.gain, m.dirty, this.ctx);
    setParam(this.treble.gain, lerp(-10, 8, s.treble), this.ctx);
    setParam(this.output.gain, dbToGain(s.output), this.ctx);
  }
}

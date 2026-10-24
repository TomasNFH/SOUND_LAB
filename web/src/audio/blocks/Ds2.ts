import type { Ds2Settings } from '../settings';
import { dbToGain, lerp, setParam, ShaperStage, type Block } from '../util';
import { hardClip } from './clippers';

// Boss DS-2 Turbo Distortion, simplified: high gain into hard clipping
// diodes, then a tone control that blends a lowpass and a highpass. The
// blend leaves a dip between them: the scooped-mid distortion sound.
// Turbo (mode II) adds a mid boost before the clipper, so the mids are
// clipped harder and come through thicker.
//
//   in ─ HP 100 Hz ─ [turbo: mid boost] ─ gain ─ hard clip ─┬─ LP ─┐
//                                                           └─ HP ─┴─ level ─ out

const CLIP = hardClip(0.5);

export const ds2Gain = (dist: number, turbo: boolean) => Math.pow(10, lerp(1.2, 2.6, dist)) * (turbo ? 1.6 : 1);

export const ds2Transfer = (s: Ds2Settings) => {
  const g = ds2Gain(s.dist, s.turbo);
  return (x: number) => CLIP(g * x);
};

export class Ds2 implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly turboEq: BiquadFilterNode;
  private readonly drive: GainNode;
  private readonly lowGain: GainNode;
  private readonly highGain: GainNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 100;
    this.turboEq = ctx.createBiquadFilter();
    this.turboEq.type = 'peaking';
    this.turboEq.frequency.value = 800;
    this.turboEq.Q.value = 0.9;
    this.drive = ctx.createGain();
    const clip = new ShaperStage(ctx, CLIP);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.5;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 1800;
    hp2.Q.value = 0.5;
    this.lowGain = ctx.createGain();
    this.highGain = ctx.createGain();
    // Highs above ~6 kHz from a hard clipper are pure fizz; real pedals
    // roll them off too.
    const fizz = ctx.createBiquadFilter();
    fizz.type = 'lowpass';
    fizz.frequency.value = 6500;
    fizz.Q.value = 0.6;

    this.input.connect(hp).connect(this.turboEq).connect(this.drive).connect(clip.input);
    clip.output.connect(lp).connect(this.lowGain).connect(fizz);
    clip.output.connect(hp2).connect(this.highGain).connect(fizz);
    fizz.connect(this.output);
  }

  apply(s: Ds2Settings) {
    const c = this.ctx;
    setParam(this.turboEq.gain, s.turbo ? 10 : 0, c);
    setParam(this.drive.gain, ds2Gain(s.dist, s.turbo), c);
    // Equal-power blend: 0 = lowpass only (dark), 1 = highpass only.
    setParam(this.lowGain.gain, Math.cos((s.tone * Math.PI) / 2), c);
    setParam(this.highGain.gain, Math.sin((s.tone * Math.PI) / 2) * 1.4, c);
    setParam(this.output.gain, dbToGain(s.level), c);
  }
}

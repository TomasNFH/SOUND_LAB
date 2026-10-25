import type { AmpLikeSettings } from '../settings';
import { dbToGain, lerp, setParam, ShaperStage, type Block } from '../util';
import { asymSoftClip, softClip } from './clippers';

// Amp-like overdrive, simplified: discrete transistor gain stages
// that each clip a little, in series, with gentle filtering between them.
// No mid hump and no clean blend: the full band is driven, so it stays
// flatter and more amp-like than the mid-hump overdrive, and the clipping builds
// up gradually across stages instead of all at once.
//
//   in ─ HP 70 Hz ─ gain A ─ clip 1 ─ LP 5 kHz ─ gain B ─ clip 2 ─ tone ─ level ─ out

const stage1 = asymSoftClip(0.7, 0.9);
const stage2 = softClip(0.6);

// Both stages gain up together; the second only starts to work hard in
// the upper half of the knob, which is what makes the breakup gradual.
export const ampLikeGains = (gain: number) => ({
  a: lerp(1, 7, gain),
  b: lerp(1, 5, gain * gain),
});

export const ampLikeTransfer = (s: AmpLikeSettings) => {
  const { a, b } = ampLikeGains(s.gain);
  return (x: number) => stage2(b * stage1(a * x));
};

export class AmpLikeDrive implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly gainA: GainNode;
  private readonly gainB: GainNode;
  private readonly tone: BiquadFilterNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    hp.Q.value = 0.6;
    this.gainA = ctx.createGain();
    const clip1 = new ShaperStage(ctx, stage1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    lp.Q.value = 0.6;
    this.gainB = ctx.createGain();
    const clip2 = new ShaperStage(ctx, stage2);
    const dc = ctx.createBiquadFilter();
    dc.type = 'highpass';
    dc.frequency.value = 15;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'highshelf';
    this.tone.frequency.value = 1500;

    this.input.connect(hp).connect(this.gainA).connect(clip1.input);
    clip1.output.connect(lp).connect(this.gainB).connect(clip2.input);
    clip2.output.connect(dc).connect(this.tone).connect(this.output);
  }

  apply(s: AmpLikeSettings) {
    const { a, b } = ampLikeGains(s.gain);
    setParam(this.gainA.gain, a, this.ctx);
    setParam(this.gainB.gain, b, this.ctx);
    setParam(this.tone.gain, lerp(-12, 8, s.tone), this.ctx);
    setParam(this.output.gain, dbToGain(s.level), this.ctx);
  }
}

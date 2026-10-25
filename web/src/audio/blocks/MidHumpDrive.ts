import type { MidHumpSettings } from '../settings';
import { dbToGain, latencyMatchedPath, lerp, setParam, ShaperStage, type Block } from '../util';

// Mid-hump overdrive clipping stage, split into its parts:
//
//   input ─┬─ hump highpass ─ drive gain ─ diode clipper ─ high cut ─┐
//          │                                                         ├─ tone ─ level ─ out
//          └─ clean path (unity: the op-amp's "+1") ─────────────────┘
//
// The op-amp stage is non-inverting with the diodes in its feedback loop,
// so its output is the input itself (+1) plus the gained-up, clipped
// difference signal. The 4.7 kΩ + C leg to ground only passes frequencies
// above the hump, so only those get gain and clip; the bass stays clean.

const R_HUMP = 4700;
const HUMP_CAPS: Record<MidHumpSettings['hump'], number> = {
  340: 0.1e-6,
  720: 0.047e-6,
  1500: 0.022e-6,
};
const R_FIXED = 51000;
const R_DRIVE = 500000;
const C_HIGH_CUT = 51e-12;
// Diode forward voltage. The signal is treated as volts (1.0 = 1 V), so a
// DI clip peaking at -12 dBFS swings about ±0.25 V, like a real guitar.
const V_DIODE = 0.6;

export const humpFrequency = (hump: MidHumpSettings['hump']) => 1 / (2 * Math.PI * R_HUMP * HUMP_CAPS[hump]);

// The drive pot is audio taper: most of its resistance comes in the last
// part of the rotation.
const driveResistance = (drive: number) => (R_DRIVE * (Math.pow(10, 2 * drive) - 1)) / 99;

// Gain of the op-amp stage above the hump frequency.
export const midHumpGain = (drive: number) => 1 + (R_FIXED + driveResistance(drive)) / R_HUMP;

export const midHumpHighCut = (drive: number) => 1 / (2 * Math.PI * (R_FIXED + driveResistance(drive)) * C_HIGH_CUT);

// Diode clipping. Symmetric: a matched pair, so both half-waves clip the
// same and only odd harmonics appear. Asymmetric: the negative side needs
// more voltage to clip (like 2 diodes against 1), the wave gets lopsided
// and even harmonics (the octave) appear.
export function clipCurve(type: MidHumpSettings['clip']) {
  if (type === 'sym') return (x: number) => V_DIODE * Math.tanh(x / V_DIODE);
  const vNeg = V_DIODE * 1.8;
  return (x: number) => (x >= 0 ? V_DIODE * Math.tanh(x / V_DIODE) : vNeg * Math.tanh(x / vNeg));
}

// Static transfer for a signal in the mid band (above the hump): what the
// clipping stage does to the waveform, before tone and level.
export function midHumpTransfer(s: MidHumpSettings) {
  const g = midHumpGain(s.drive) - 1;
  const clip = clipCurve(s.clip);
  return (x: number) => (s.bassPath ? x : 0) + clip(g * x);
}

// First-order highpass from the bilinear transform, matching the RC leg.
function firstOrderHighpass(ctx: BaseAudioContext, fc: number) {
  const k = Math.tan((Math.PI * fc) / ctx.sampleRate);
  const norm = 1 / (1 + k);
  return ctx.createIIRFilter([norm, -norm], [1, (k - 1) * norm]);
}

export class MidHumpDrive implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private hump: IIRFilterNode;
  private humpSetting: MidHumpSettings['hump'] = 720;
  private readonly driveGain: GainNode;
  private readonly clipper: ShaperStage;
  private clipSetting: MidHumpSettings['clip'] = 'sym';
  private readonly dcBlock: BiquadFilterNode;
  private readonly highCut: BiquadFilterNode;
  private readonly clean: GainNode;
  private readonly sum: GainNode;
  private readonly tone: BiquadFilterNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.hump = firstOrderHighpass(ctx, humpFrequency(720));
    this.driveGain = ctx.createGain();
    this.clipper = new ShaperStage(ctx, clipCurve('sym'));
    // Asymmetric clipping adds a DC offset; a real pedal's output cap
    // removes it.
    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = 'highpass';
    this.dcBlock.frequency.value = 10;
    this.highCut = ctx.createBiquadFilter();
    this.highCut.type = 'lowpass';
    this.highCut.Q.value = 0.5;
    this.clean = ctx.createGain();
    this.sum = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'highshelf';
    this.tone.frequency.value = 1000;

    this.input.connect(this.hump).connect(this.driveGain).connect(this.clipper.input);
    this.clipper.output.connect(this.highCut).connect(this.sum);
    const aligned = latencyMatchedPath(ctx);
    this.input.connect(this.clean).connect(aligned.input);
    aligned.output.connect(this.sum);
    this.sum.connect(this.dcBlock).connect(this.tone).connect(this.output);
  }

  apply(s: MidHumpSettings) {
    const c = this.ctx;
    if (s.hump !== this.humpSetting) {
      this.humpSetting = s.hump;
      const next = firstOrderHighpass(c, humpFrequency(s.hump));
      this.input.connect(next).connect(this.driveGain);
      this.input.disconnect(this.hump);
      this.hump.disconnect();
      this.hump = next;
    }
    if (s.clip !== this.clipSetting) {
      this.clipSetting = s.clip;
      this.clipper.setCurve(clipCurve(s.clip));
    }
    setParam(this.driveGain.gain, midHumpGain(s.drive) - 1, c);
    setParam(this.highCut.frequency, s.highCut ? Math.min(midHumpHighCut(s.drive), c.sampleRate * 0.45) : c.sampleRate * 0.45, c);
    setParam(this.clean.gain, s.bassPath ? 1 : 0, c);
    // Tone: dark at 0, bright at 1, roughly the range of the real control.
    setParam(this.tone.gain, lerp(-15, 6, s.tone), c);
    setParam(this.output.gain, dbToGain(s.level), c);
  }
}

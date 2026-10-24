export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-12));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PARAM_TC = 0.02;

// Smoothly move a parameter while playing; set it outright when rendering
// offline, so an exported file doesn't start with a ramp.
export function setParam(param: AudioParam, value: number, ctx: BaseAudioContext) {
  if (ctx instanceof OfflineAudioContext) {
    param.value = value;
  } else {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, PARAM_TC);
  }
}

// An audio block with one input and one output.
export interface Block {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

// Wraps a block with a click-free bypass: the block and a dry path run
// side by side and the switch crossfades between them.
export class Slot implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private enabled = true;

  constructor(
    private readonly ctx: BaseAudioContext,
    readonly block: Block,
  ) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(block.input);
    block.output.connect(this.wet).connect(this.output);
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    const t = this.ctx.currentTime;
    if (this.ctx instanceof OfflineAudioContext) {
      this.dry.gain.value = on ? 0 : 1;
      this.wet.gain.value = on ? 1 : 0;
    } else {
      this.dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
      this.wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
    }
  }
}

// Waveshaper curve for y = f(x) over x in [-range, range]. Inputs are
// pre-scaled by 1/range before the shaper, since WaveShaperNode only maps
// [-1, 1]; see makeShaperStage.
export function makeCurve(f: (x: number) => number, range: number, points = 8193) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * range;
    curve[i] = f(x);
  }
  return curve;
}

// A clipper that works on signals larger than ±1: scale down, shape, and
// the curve itself restores the output level.
export class ShaperStage implements Block {
  readonly input: GainNode;
  readonly output: WaveShaperNode;

  constructor(
    ctx: BaseAudioContext,
    f: (x: number) => number,
    readonly range = 32,
  ) {
    this.input = ctx.createGain();
    this.input.gain.value = 1 / range;
    this.output = ctx.createWaveShaper();
    this.output.oversample = '4x';
    this.output.curve = makeCurve(f, range);
    this.input.connect(this.output);
  }

  setCurve(f: (x: number) => number) {
    this.output.curve = makeCurve(f, this.range);
  }
}

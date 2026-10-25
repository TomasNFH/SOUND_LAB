import clipUrl from './clip/clip.worklet.ts?worker&url';
import { loadWorklet } from './worklets';

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

// Open or close a path completely: a short linear ramp that lands exactly
// on 0, so whatever is behind a closed gate sees true silence and the
// worklets there can idle.
export function setGate(param: AudioParam, open: boolean, ctx: BaseAudioContext) {
  if (ctx instanceof OfflineAudioContext) {
    param.value = open ? 1 : 0;
    return;
  }
  const t = ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(open ? 1 : 0, t + 0.03);
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

// Worklet nodes still loading, per context: anything rendering has to wait
// for them (see clippersReady).
const pendingWorklets = new WeakMap<BaseAudioContext, Promise<void>[]>();

function track(ctx: BaseAudioContext, p: Promise<void>) {
  const list = pendingWorklets.get(ctx) ?? [];
  list.push(p);
  pendingWorklets.set(ctx, list);
}

// Resolves once every clipper and compressor built in this context so far
// is in place.
export function clippersReady(ctx: BaseAudioContext) {
  return Promise.all(pendingWorklets.get(ctx) ?? []).then(() => undefined);
}

// A clipper that works on signals larger than ±1: scale down, shape, and
// the curve itself restores the output level. Oversampled clippers run in
// an AudioWorklet with low-delay filters (about 0.03 ms, against 4 ms for
// WaveShaperNode's own 4x oversampling), so playing live doesn't lag; they
// are silent for the moment the module takes to load. Without
// oversampling it is a plain WaveShaperNode, which adds no delay.
export class ShaperStage implements Block {
  readonly input: GainNode;
  readonly output: AudioNode;
  private curve: ReturnType<typeof makeCurve>;
  private shaper: WaveShaperNode | null = null;
  private clipper: AudioWorkletNode | null = null;

  constructor(
    ctx: BaseAudioContext,
    f: (x: number) => number,
    readonly range = 32,
    oversample: OverSampleType = '4x',
  ) {
    this.input = ctx.createGain();
    this.input.gain.value = 1 / range;
    this.curve = makeCurve(f, range);
    if (oversample === 'none') {
      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = this.curve;
      this.input.connect(this.shaper);
      this.output = this.shaper;
      return;
    }
    const output = ctx.createGain();
    this.output = output;
    track(
      ctx,
      loadWorklet(ctx, clipUrl).then(() => {
        // The curve goes in the constructor options, not a message: an
        // offline render can finish before a message arrives.
        this.clipper = new AudioWorkletNode(ctx, 'clipper', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          processorOptions: { curve: this.curve },
        });
        this.input.connect(this.clipper).connect(output);
      }),
    );
  }

  setCurve(f: (x: number) => number) {
    this.curve = makeCurve(f, this.range);
    if (this.shaper) this.shaper.curve = this.curve;
    this.clipper?.port.postMessage({ curve: this.curve });
  }
}

export interface CompressorSettings {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
}

// DynamicsCompressorNode's job without its 6 ms look-ahead, in a worklet.
export class LowLatencyCompressor implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private settings: Partial<CompressorSettings> = {};

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    track(
      ctx,
      loadWorklet(ctx, clipUrl).then(() => {
        this.node = new AudioWorkletNode(ctx, 'compressor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          processorOptions: this.settings,
        });
        this.input.connect(this.node).connect(this.output);
      }),
    );
  }

  set(s: Partial<CompressorSettings>) {
    const changed = Object.entries(s).some(([k, v]) => this.settings[k as keyof CompressorSettings] !== v);
    if (!changed) return;
    this.settings = { ...this.settings, ...s };
    this.node?.port.postMessage(this.settings);
  }
}

// A clean path to sum with an oversampled clipper. The oversampling filters
// shift the clipper's output a little in time; summing that with an
// unshifted copy comb-filters the top end. Passing the clean copy through an
// identical clipper with a straight-line curve shifts it exactly the same.
export function latencyMatchedPath(ctx: BaseAudioContext): Block {
  return new ShaperStage(ctx, (x) => x);
}

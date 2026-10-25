// Low-latency replacements for two built-in nodes whose delay you can feel
// when playing live:
//
// - clipper: a waveshaper with 4x oversampling. WaveShaperNode's own
//   oversampling uses long linear-phase filters (about 4 ms at 4x); these
//   are the 4th-order IIR filters the 6V6 combo uses, a few hundredths of a
//   millisecond, with the same anti-aliasing purpose.
// - compressor: the amp's power-supply sag. DynamicsCompressorNode looks
//   6 ms ahead; this one reacts as the signal arrives.

import { antiAlias, Iir } from '../dsp';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}

const OS = 4;
// Silent blocks in a row before an idle channel stops filtering (its
// filters have settled by then), so unselected models cost almost nothing.
const IDLE_BLOCKS = 8;

interface ClipChannel {
  up: Iir[];
  down: Iir[];
  idle: number;
}

// y = curve(x) for x in [-1, 1], like WaveShaperNode: linear interpolation
// between curve points, the end values beyond the ends.
class Clipper extends AudioWorkletProcessor {
  private curve: Float32Array | null = null;
  private atZero = 0;
  private channels: ClipChannel[] = [];

  constructor(options: { processorOptions?: { curve?: Float32Array } }) {
    super(options);
    const setCurve = (curve: Float32Array) => {
      this.curve = curve;
      this.atZero = this.shape(0);
      for (const c of this.channels) c.idle = 0;
    };
    if (options.processorOptions?.curve) setCurve(options.processorOptions.curve);
    this.port.onmessage = (e: MessageEvent<{ curve: Float32Array }>) => setCurve(e.data.curve);
  }

  private shape(x: number) {
    const curve = this.curve!;
    const last = curve.length - 1;
    const pos = (x + 1) * 0.5 * last;
    if (pos <= 0) return curve[0];
    if (pos >= last) return curve[last];
    const i = Math.floor(pos);
    const t = pos - i;
    return curve[i] + (curve[i + 1] - curve[i]) * t;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0];
    const output = outputs[0];
    if (!this.curve || !input || input.length === 0) {
      for (const out of output) out.fill(this.curve ? this.atZero : 0);
      return true;
    }
    for (let ch = 0; ch < output.length; ch++) {
      const x = input[Math.min(ch, input.length - 1)];
      const out = output[ch];
      let c = this.channels[ch];
      if (!c) {
        c = { up: antiAlias(sampleRate * OS, 20000), down: antiAlias(sampleRate * OS, 20000), idle: 0 };
        this.channels[ch] = c;
      }
      let silent = true;
      for (let i = 0; i < x.length; i++) {
        if (x[i] !== 0) {
          silent = false;
          break;
        }
      }
      if (silent && c.idle >= IDLE_BLOCKS) {
        out.fill(this.atZero);
        continue;
      }
      c.idle = silent ? c.idle + 1 : 0;
      const [u0, u1] = c.up;
      const [d0, d1] = c.down;
      for (let i = 0; i < x.length; i++) {
        let y = 0;
        for (let k = 0; k < OS; k++) {
          // Zero-stuff and filter: one sample becomes four.
          const v = u1.process(u0.process(k === 0 ? x[i] * OS : 0));
          y = d1.process(d0.process(this.shape(v)));
        }
        out[i] = y;
      }
    }
    return true;
  }
}

interface CompressorParams {
  threshold: number; // dB
  knee: number; // dB, above the threshold
  ratio: number;
  attack: number; // seconds
  release: number; // seconds
}

// A feed-forward compressor shaped like DynamicsCompressorNode (same
// parameters, a soft knee above the threshold and the same automatic
// make-up gain) but with no look-ahead. Channels share one gain.
class Compressor extends AudioWorkletProcessor {
  private p: CompressorParams = { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 };
  private reduction = 0; // dB, smoothed
  private makeup = 1;
  private aAttack = 0;
  private aRelease = 0;

  constructor(options: { processorOptions?: Partial<CompressorParams> }) {
    super(options);
    this.p = { ...this.p, ...options.processorOptions };
    this.update();
    this.port.onmessage = (e: MessageEvent<Partial<CompressorParams>>) => {
      this.p = { ...this.p, ...e.data };
      this.update();
    };
  }

  private update() {
    const { attack, release } = this.p;
    this.aAttack = 1 - Math.exp(-1 / (Math.max(attack, 1e-4) * sampleRate));
    this.aRelease = 1 - Math.exp(-1 / (Math.max(release, 1e-4) * sampleRate));
    // Full scale in, how far below full scale out: make up 60% of it, as
    // the Web Audio compressor does.
    this.makeup = Math.pow(10, (0.6 * -this.curve(0)) / 20);
  }

  // Output level for an input level, in dB.
  private curve(x: number) {
    const { threshold: t, knee: k, ratio: r } = this.p;
    if (x <= t) return x;
    if (k > 0 && x < t + k) return x + ((1 / r - 1) * (x - t) ** 2) / (2 * k);
    const top = k > 0 ? t + k + ((1 / r - 1) * k) / 2 : t;
    return top + (x - t - k) / r;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      for (const out of output) out.fill(0);
      return true;
    }
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (const ch of input) peak = Math.max(peak, Math.abs(ch[i]));
      const level = 20 * Math.log10(peak + 1e-12);
      const target = level - this.curve(level);
      this.reduction += (target > this.reduction ? this.aAttack : this.aRelease) * (target - this.reduction);
      const gain = Math.pow(10, -this.reduction / 20) * this.makeup;
      for (let ch = 0; ch < output.length; ch++) output[ch][i] = input[Math.min(ch, input.length - 1)][i] * gain;
    }
    return true;
  }
}

registerProcessor('clipper', Clipper);
registerProcessor('compressor', Compressor);

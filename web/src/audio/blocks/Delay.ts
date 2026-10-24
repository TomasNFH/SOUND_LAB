import type { DelaySettings } from '../settings';
import { lerp, setParam, ShaperStage, type Block } from '../util';
import { softClip } from './clippers';

// Delay with a feedback loop:
//
//   in ─┬───────────────────────────────────────────────────── out
//       └─ pre ─ delay ─┬─ wet mix ───────────────────────────┘
//                  ↑    └─ loop LP ─ loop HP ─ saturation ─ feedback ─┐
//                  └──────────────────────────────────────────────────┘
//
// Digital: the loop is transparent, every repeat is a copy.
// Tape/analog: each pass goes through the filters and a little
// saturation again, so repeats get darker, thinner and softer; an LFO on
// the delay time adds the wow of a stretched tape.
//
// Timing: the browser runs a feedback cycle one processing block late, so
// every round trip takes the delay time plus that block. The loop's delay
// is shortened by the measured amount and a fixed pre-delay outside the
// loop puts the first repeat back on time: repeats land on exact
// multiples of the delay time.

const MAX_TIME = 2;
const LOOP_CLIP = softClip(0.8);
const DEFAULT_LOOP_LATENCY = 128; // samples; what Chromium adds per cycle

// Seconds until the repeats have died down by 60 dB.
export function delayTail(s: DelaySettings) {
  if (!s.on || s.feedback <= 0) return s.on ? s.time : 0;
  return Math.min(12, s.time * (1 + Math.log(0.001) / Math.log(Math.min(s.feedback, 0.95))));
}

export const tapeLoopCutoff = (tone: number) => lerp(1200, 7000, tone);

// Measure, once, how many samples a feedback cycle adds in this browser:
// render an impulse through a 20 ms delay loop and see when the second
// echo arrives.
let loopLatency: Promise<number> | null = null;
export function measureLoopLatency(): Promise<number> {
  loopLatency ??= (async () => {
    const sr = 48000;
    const step = Math.round(0.02 * sr);
    const ctx = new OfflineAudioContext(1, step * 4, sr);
    const imp = ctx.createBuffer(1, 1, sr);
    imp.getChannelData(0)[0] = 1;
    const src = ctx.createBufferSource();
    src.buffer = imp;
    const sum = ctx.createGain();
    const d = ctx.createDelay(1);
    d.delayTime.value = step / sr;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    src.connect(sum).connect(d).connect(ctx.destination);
    d.connect(fb).connect(sum);
    src.start();
    const y = (await ctx.startRendering()).getChannelData(0);
    let at = -1;
    for (let i = step + step / 2; i < y.length; i++) {
      if (Math.abs(y[i]) > 0.25) {
        at = i;
        break;
      }
    }
    return at < 0 ? DEFAULT_LOOP_LATENCY : Math.max(0, at - 2 * step);
  })().catch(() => DEFAULT_LOOP_LATENCY);
  return loopLatency;
}

export class Delay implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly pre: DelayNode;
  private readonly delay: DelayNode;
  private readonly loopLp: BiquadFilterNode;
  private readonly loopHp: BiquadFilterNode;
  private readonly sat: ShaperStage;
  private readonly feedback: GainNode;
  private readonly wet: GainNode;
  private readonly wowDepth: GainNode;
  private readonly flutterDepth: GainNode;
  private mode: DelaySettings['mode'] | null = null;
  private latencySamples = DEFAULT_LOOP_LATENCY;
  private last: DelaySettings | null = null;
  private readonly measured: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.pre = ctx.createDelay(0.1);
    this.delay = ctx.createDelay(MAX_TIME);
    this.loopLp = ctx.createBiquadFilter();
    this.loopLp.type = 'lowpass';
    this.loopLp.Q.value = 0.5;
    this.loopHp = ctx.createBiquadFilter();
    this.loopHp.type = 'highpass';
    this.loopHp.Q.value = 0.5;
    // No oversampling here: it delays the signal by a few ms, and inside a
    // feedback loop that delay is added again on every repeat. The loop
    // saturation is gentle, so aliasing isn't an issue.
    this.sat = new ShaperStage(ctx, (x) => x, 4, 'none');
    this.feedback = ctx.createGain();
    this.wet = ctx.createGain();

    this.input.connect(this.output);
    this.input.connect(this.pre).connect(this.delay);
    this.delay.connect(this.wet).connect(this.output);
    this.delay.connect(this.loopLp).connect(this.loopHp).connect(this.sat.input);
    this.sat.output.connect(this.feedback).connect(this.delay);

    // Wow (slow) and flutter (fast) wobble the delay time.
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.6;
    this.wowDepth = ctx.createGain();
    wow.connect(this.wowDepth).connect(this.delay.delayTime);
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 7;
    this.flutterDepth = ctx.createGain();
    flutter.connect(this.flutterDepth).connect(this.delay.delayTime);
    wow.start();
    flutter.start();

    this.measured = measureLoopLatency().then((n) => {
      this.latencySamples = n;
      if (this.last) this.apply(this.last);
    });
  }

  ready() {
    return this.measured;
  }

  apply(s: DelaySettings) {
    this.last = s;
    const c = this.ctx;
    const tape = s.mode === 'tape';
    const lat = this.latencySamples / c.sampleRate;
    setParam(this.pre.delayTime, lat, c);
    setParam(this.delay.delayTime, Math.max(s.time - lat, 128 / c.sampleRate), c);
    setParam(this.feedback.gain, s.feedback, c);
    setParam(this.wet.gain, s.mix, c);
    setParam(this.loopLp.frequency, tape ? tapeLoopCutoff(s.tone) : c.sampleRate / 2, c);
    setParam(this.loopHp.frequency, tape ? 150 : 5, c);
    setParam(this.wowDepth.gain, tape ? 0.004 * s.wow : 0, c);
    setParam(this.flutterDepth.gain, tape ? 0.0004 * s.wow : 0, c);
    if (s.mode !== this.mode) {
      this.mode = s.mode;
      this.sat.setCurve(tape ? LOOP_CLIP : (x) => x);
    }
  }
}

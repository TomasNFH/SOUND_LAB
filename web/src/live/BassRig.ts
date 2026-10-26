import { EqBlock } from '../audio/blocks/EqBlock';
import type { EqSettings } from '../audio/settings';
import { clippersReady, dbToGain, lerp, LowLatencyCompressor, setParam, ShaperStage, type Block } from '../audio/util';
import { loadWorklet } from '../audio/worklets';
import { DEFAULT_TUBE_BASS, tubeBassParams, type TubeBassSettings } from '../audio/tubebass/circuit';
import tubeUrl from '../audio/tubebass/tubebass.worklet.ts?worker&url';
import octaveUrl from './octave.worklet.ts?worker&url';

export type BassCab = '410' | '115' | '810' | 'off';
// generic: compressor, drive and simple tone filters; tube: a circuit model
// of the classic 300 W tube bass head.
export type BassAmpModel = 'generic' | 'tube';

export interface BassSettings {
  octaveOn: boolean;
  ampOn: boolean; // the amp and its cabinet; the EQ has eq.on
  ampModel: BassAmpModel;
  tube: TubeBassSettings;
  octave: number; // octave-down level, 0..1
  guitar: number; // original guitar level, 0..1 (attack and definition)
  tracking: number; // Hz: lower tracks low notes cleanly, higher reaches high ones
  compress: number; // 0..1
  drive: number; // 0..1
  bass: number; // dB at 70 Hz
  mid: number; // dB at midFreq
  midFreq: number; // Hz
  treble: number; // dB above 2.5 kHz
  cab: BassCab;
  level: number; // dB
  eq: EqSettings;
}

export const DEFAULT_BASS: BassSettings = {
  octaveOn: true,
  ampOn: true,
  ampModel: 'generic',
  tube: DEFAULT_TUBE_BASS,
  octave: 1,
  guitar: 0.2,
  tracking: 250,
  compress: 0.5,
  drive: 0.15,
  bass: 3,
  mid: 0,
  midFreq: 500,
  treble: -2,
  cab: '410',
  level: 0,
  eq: {
    on: true,
    position: 'post',
    bands: [
      { type: 'lowshelf', on: true, freq: 60, gain: 0, q: 0.7 },
      { type: 'peaking', on: true, freq: 150, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 400, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 800, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 2000, gain: 0, q: 1 },
      { type: 'highshelf', on: true, freq: 4000, gain: 0, q: 0.7 },
    ],
  },
};

type FilterSpec = { type: BiquadFilterType; freq: number; gain?: number; q: number };

// The octave block and the amp (compressor make-up, bass boost) each add
// level; take it back so Level at 0 dB comes out about as loud as the
// guitar went in, whichever blocks are on.
const OCTAVE_TRIM_DB = -2;
const AMP_TRIM_DB: Record<BassAmpModel, number> = { generic: -9.5, tube: 1 };

// Which blocks exist. Turning one off or on builds a new rig without or
// with it, so a block that is off costs nothing.
export const bassStructure = (s: BassSettings) => JSON.stringify([s.octaveOn, s.ampOn && s.ampModel, s.eq.on]);

// Transparent up to about -1 dBFS, then rounds off: a hard-picked note
// can't crackle at the output. No oversampling, so no delay; it only
// ever touches the loudest peaks.
const safety = (x: number) => {
  const knee = 0.9;
  const a = Math.abs(x);
  return a <= knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
};

// Bass cabinets as filters: no impulse response, so no delay and almost no
// CPU. 4x10: tight lows, a little presence. 1x15: deeper and rounder, a
// mid scoop, little top.
const CABS: Record<BassCab, FilterSpec[]> = {
  '410': [
    { type: 'highpass', freq: 45, q: 0.7 },
    { type: 'peaking', freq: 100, gain: 3, q: 1 },
    { type: 'peaking', freq: 3000, gain: 2, q: 1.5 },
    { type: 'lowpass', freq: 5000, q: 0.7 },
    { type: 'lowpass', freq: 5000, q: 0.7 },
  ],
  '115': [
    { type: 'highpass', freq: 35, q: 0.7 },
    { type: 'peaking', freq: 70, gain: 4, q: 1 },
    { type: 'peaking', freq: 700, gain: -3, q: 1 },
    { type: 'lowpass', freq: 2500, q: 0.7 },
    { type: 'lowpass', freq: 2500, q: 0.7 },
  ],
  // 8x10: the classic partner of a 300 W tube head. Sealed, so the lows
  // fall away below about 50 Hz; a punchy low-mid bump; ten-inch cones
  // give some bite around 2 to 3 kHz and little above 4.5 kHz.
  '810': [
    { type: 'highpass', freq: 50, q: 0.8 },
    { type: 'peaking', freq: 90, gain: 2, q: 1 },
    { type: 'peaking', freq: 2500, gain: 3, q: 1.2 },
    { type: 'lowpass', freq: 4500, q: 0.7 },
    { type: 'lowpass', freq: 4500, q: 0.7 },
  ],
  off: [
    { type: 'highpass', freq: 20, q: 0.7 },
    { type: 'peaking', freq: 100, gain: 0, q: 1 },
    { type: 'peaking', freq: 1000, gain: 0, q: 1 },
    { type: 'lowpass', freq: 20000, q: 0.7 },
    { type: 'lowpass', freq: 20000, q: 0.7 },
  ],
};

// The guitar becomes a bass, in three blocks that can each be off:
//
//   guitar ─ [octave] ─ [bass amp] ─ [EQ] ─ level ─ safety
//
//   octave:   ─┬─ octave down ───────┬─   mostly the octave, with a little
//              └─ lowpass 2.5 kHz ───┘    of the original for the attack
//   bass amp: generic:  compressor ─ drive ─ bass / mid / treble ─ cabinet
//             tube head: the circuit model (preamp, power amp) ─ cabinet
export class BassRig implements Block {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly key: string;
  private octave: AudioWorkletNode | null = null;
  private octaveGain: GainNode | null = null;
  private guitarGain: GainNode | null = null;
  private amp: {
    comp: LowLatencyCompressor;
    driveIn: GainNode;
    driveOut: GainNode;
    tone: BiquadFilterNode[];
  } | null = null;
  private tube: { node: AudioWorkletNode | null; posted: string } | null = null;
  private cab: BiquadFilterNode[] | null = null;
  private eq: EqBlock | null = null;
  private readonly levelGain: GainNode;
  private readonly loading: Promise<unknown>[] = [];
  private last: BassSettings;

  constructor(
    private readonly ctx: BaseAudioContext,
    s: BassSettings,
  ) {
    this.last = s;
    this.key = bassStructure(s);
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    let prev: AudioNode = this.input;

    if (s.octaveOn) {
      const octaveGain = ctx.createGain();
      const guitarGain = ctx.createGain();
      const sum = ctx.createGain();
      this.octaveGain = octaveGain;
      this.guitarGain = guitarGain;
      // The original guitar, its treble rolled off.
      let g: AudioNode = prev;
      for (let i = 0; i < 2; i++) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2500;
        lp.Q.value = 0.6;
        g = g.connect(lp);
      }
      g.connect(guitarGain).connect(sum);
      const from = prev;
      this.loading.push(loadWorklet(ctx, octaveUrl).then(() => {
        // Settings in the constructor options: they must be in place before
        // the first sample, even in an offline render.
        this.octave = new AudioWorkletNode(ctx, 'octaveDown', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { tracking: this.last.tracking },
        });
        from.connect(this.octave).connect(octaveGain).connect(sum);
      }));
      prev = sum;
    }

    if (s.ampOn && s.ampModel === 'generic') {
      const comp = new LowLatencyCompressor(ctx);
      const driveIn = ctx.createGain();
      const clip = new ShaperStage(ctx, Math.tanh, 8);
      const driveOut = ctx.createGain();
      const tone = ['lowshelf', 'peaking', 'highshelf'].map((type) => {
        const f = ctx.createBiquadFilter();
        f.type = type as BiquadFilterType;
        return f;
      });
      prev.connect(comp.input);
      comp.output.connect(driveIn).connect(clip.input);
      prev = clip.output.connect(driveOut);
      for (const f of tone) prev = prev.connect(f);
      this.amp = { comp, driveIn, driveOut, tone };
    }
    if (s.ampOn && s.ampModel === 'tube') {
      // The whole head in one worklet; it is silent for the moment the
      // module takes to load. Volts in, speaker volts / 49 out.
      const tube: { node: AudioWorkletNode | null; posted: string } = { node: null, posted: JSON.stringify(s.tube) };
      this.tube = tube;
      const from = prev;
      const out = ctx.createGain();
      this.loading.push(
        loadWorklet(ctx, tubeUrl).then(() => {
          tube.node = new AudioWorkletNode(ctx, 'tubeBass', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: tubeBassParams(this.last.tube, ctx.sampleRate * 4),
          });
          tube.posted = JSON.stringify(this.last.tube);
          from.connect(tube.node).connect(out);
        }),
      );
      prev = out;
    }
    if (s.ampOn) {
      this.cab = CABS.off.map(() => ctx.createBiquadFilter());
      for (const f of this.cab) prev = prev.connect(f);
    }

    if (s.eq.on) {
      this.eq = new EqBlock(ctx, 6);
      prev.connect(this.eq.input);
      prev = this.eq.output;
    }

    this.levelGain = ctx.createGain();
    const limit = new ShaperStage(ctx, safety, 4, 'none');
    prev.connect(this.levelGain).connect(limit.input);
    limit.output.connect(this.output);
    this.apply(s);
  }

  ready() {
    return Promise.all([...this.loading, clippersReady(this.ctx)]).then(() => undefined);
  }

  // Knob values, in place. Blocks turned on or off need a new BassRig.
  apply(s: BassSettings) {
    const c = this.ctx;
    if (s.tracking !== this.last.tracking) this.octave?.port.postMessage({ tracking: s.tracking });
    this.last = s;
    if (this.octaveGain && this.guitarGain) {
      setParam(this.octaveGain.gain, s.octave * 2, c); // the divided wave comes out a little quieter
      setParam(this.guitarGain.gain, s.guitar, c);
    }
    const amp = this.amp;
    if (amp) {
      amp.comp.set({ threshold: lerp(0, -32, s.compress), ratio: lerp(1, 8, s.compress), knee: 6, attack: 0.005, release: 0.12 });
      // Drive pushes into a soft clipper and takes the level back after.
      setParam(amp.driveIn.gain, dbToGain(lerp(0, 24, s.drive)), c);
      setParam(amp.driveOut.gain, dbToGain(-lerp(0, 18, s.drive)), c);
      const tone: FilterSpec[] = [
        { type: 'lowshelf', freq: 70, gain: s.bass, q: 0.7 },
        { type: 'peaking', freq: s.midFreq, gain: s.mid, q: 0.9 },
        { type: 'highshelf', freq: 2500, gain: s.treble, q: 0.7 },
      ];
      tone.forEach((spec, i) => this.setFilter(amp.tone[i], spec));
    }
    const tube = this.tube;
    if (tube?.node) {
      // Coefficients only when this head's knobs actually changed.
      const key = JSON.stringify(s.tube);
      if (key !== tube.posted) {
        tube.posted = key;
        tube.node.port.postMessage(tubeBassParams(s.tube, c.sampleRate * 4));
      }
    }
    const cab = this.cab;
    if (cab) CABS[s.cab].forEach((spec, i) => this.setFilter(cab[i], spec));
    this.eq?.apply(s.eq);
    const ampTrim = amp ? AMP_TRIM_DB.generic : tube ? AMP_TRIM_DB.tube : 0;
    const trim = (this.octaveGain ? OCTAVE_TRIM_DB : 0) + ampTrim;
    setParam(this.levelGain.gain, dbToGain(s.level + trim), c);
  }

  private setFilter(f: BiquadFilterNode, spec: FilterSpec) {
    if (f.type !== spec.type) f.type = spec.type;
    setParam(f.frequency, spec.freq, this.ctx);
    setParam(f.Q, spec.q, this.ctx);
    setParam(f.gain, spec.gain ?? 0, this.ctx);
  }
}

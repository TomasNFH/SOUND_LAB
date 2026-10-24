// Web Audio graph for the tone lab. Lives outside React: the UI pushes
// values in through setters and reads state back through getState().
//
//   source ─┬─────────────────────────────── dryGain ──┐
//           │                                           ├─ master ─ destination
//           └─ chain ──────── levelMatch ─── wetGain ──┘
//
// Dry and processed run in parallel all the time, so A/B is a crossfade
// between dryGain and wetGain rather than a reconnect (no clicks).

import { Chain } from './Chain';
import type { ToneSettings } from './settings';
import { setIrDecoder } from './ir';
import { makeLogSweep, makePinkNoise } from './signals';
import { dbToGain, gainToDb } from './util';

const CROSSFADE_TC = 0.01; // seconds; ~50 ms to settle
const PARAM_TC = 0.02;
const MATCH_TC = 0.25;
const MATCH_LIMIT_DB = 24;
const SILENCE_RMS = 1e-4;

// Where the signal comes from. The clip is for listening; the generated
// signals are for analysis (harmonics, transfer, filter responses).
export type SourceKind = 'clip' | 'sine' | 'noise' | 'sweep';

export type EngineState = {
  playing: boolean;
  canPlay: boolean;
  source: SourceKind;
  position: number; // seconds into the buffer
  duration: number;
  levelMatchDb: number; // gain currently applied by level matching
};

export class AudioEngine {
  readonly ctx: AudioContext;

  private clip: AudioBuffer | null = null;
  private generated = new Map<SourceKind, AudioBuffer>();
  private kind: SourceKind = 'clip';
  private source: AudioScheduledSourceNode | null = null;
  private readonly sineLevel: GainNode;
  private sineFreq = 220;
  private startedAt = 0; // ctx time when playback (re)started
  private offset = 0; // buffer position at startedAt
  private loop = true;

  private readonly input: GainNode;
  private readonly effectIn: GainNode;
  private readonly effectOut: GainNode;
  private readonly levelMatch: GainNode;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly master: GainNode;

  readonly chain: Chain;
  private settings: ToneSettings | null = null;

  // Analysers used to measure loudness of each path for level matching.
  // They also become the before/after taps for the phase 2 views.
  readonly dryAnalyser: AnalyserNode;
  readonly wetAnalyser: AnalyserNode;
  private readonly dryData: Float32Array;
  private readonly wetData: Float32Array;
  private dryPower = 0;
  private wetPower = 0;
  private levelMatchOn = true;
  private matchTimer: number | null = null;

  private bypassed = false;

  constructor() {
    // 48 kHz matches the recording format in the plan, so clips aren't resampled.
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    const c = this.ctx;

    this.input = c.createGain();
    this.sineLevel = c.createGain();
    this.sineLevel.gain.value = dbToGain(-12);
    this.sineLevel.connect(this.input);
    this.effectIn = c.createGain();
    this.effectOut = c.createGain();
    setIrDecoder(c);
    this.chain = new Chain(c);
    this.levelMatch = c.createGain();
    this.dryGain = c.createGain();
    this.wetGain = c.createGain();
    this.master = c.createGain();

    this.dryAnalyser = c.createAnalyser();
    this.wetAnalyser = c.createAnalyser();
    for (const a of [this.dryAnalyser, this.wetAnalyser]) {
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0.8;
    }
    this.dryData = new Float32Array(this.dryAnalyser.fftSize);
    this.wetData = new Float32Array(this.wetAnalyser.fftSize);

    this.input.connect(this.dryGain).connect(this.master);
    this.input.connect(this.dryAnalyser);

    this.input.connect(this.effectIn);
    this.effectIn.connect(this.chain.input);
    this.chain.output.connect(this.effectOut);
    // Measure the effect before level matching, so the correction
    // doesn't feed back into its own measurement.
    this.effectOut.connect(this.wetAnalyser);
    this.effectOut.connect(this.levelMatch).connect(this.wetGain).connect(this.master);

    this.master.connect(c.destination);

    this.dryGain.gain.value = 0;
    this.wetGain.gain.value = 1;
    this.master.gain.value = dbToGain(-6);

    this.matchTimer = window.setInterval(() => this.updateLevelMatch(), 50);
  }

  async loadArrayBuffer(data: ArrayBuffer) {
    const buffer = await this.ctx.decodeAudioData(data);
    this.clip = buffer;
    if (this.kind === 'clip') this.resetTransport();
    return buffer;
  }

  get clipBuffer() {
    return this.clip;
  }

  // Switching source stops playback; the level-match average starts over
  // because the new signal has a different loudness.
  setSource(kind: SourceKind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.resetTransport();
  }

  get sourceKind() {
    return this.kind;
  }

  setSine(freq: number, levelDb: number) {
    this.sineFreq = freq;
    if (this.source instanceof OscillatorNode) {
      this.source.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
    }
    this.sineLevel.gain.setTargetAtTime(dbToGain(levelDb), this.ctx.currentTime, PARAM_TC);
  }

  get sineFrequency() {
    return this.sineFreq;
  }

  get canPlay() {
    return this.kind !== 'clip' || this.clip !== null;
  }

  private get buffer(): AudioBuffer | null {
    if (this.kind === 'clip') return this.clip;
    if (this.kind === 'sine') return null;
    let b = this.generated.get(this.kind);
    if (!b) {
      b = this.kind === 'noise' ? makePinkNoise(this.ctx, 8) : makeLogSweep(this.ctx, 4);
      this.generated.set(this.kind, b);
    }
    return b;
  }

  private resetTransport() {
    this.stop();
    this.dryPower = 0;
    this.wetPower = 0;
  }

  async play() {
    if (this.source || !this.canPlay) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    if (this.kind === 'sine') {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = this.sineFreq;
      osc.connect(this.sineLevel);
      osc.start();
      this.startedAt = this.ctx.currentTime;
      this.source = osc;
      return;
    }

    const buffer = this.buffer!;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    // Generated signals always loop; the clip follows the loop switch.
    src.loop = this.kind !== 'clip' || this.loop;
    src.connect(this.input);
    src.onended = () => {
      // Fires on stop() too; only reset when the clip ran out by itself.
      if (this.source === src) {
        this.source = null;
        this.offset = 0;
      }
    };
    if (this.offset >= buffer.duration) this.offset = 0;
    src.start(0, this.offset);
    this.startedAt = this.ctx.currentTime;
    this.source = src;
  }

  pause() {
    if (!this.source) return;
    this.offset = this.currentPosition();
    this.stopSource();
  }

  stop() {
    this.stopSource();
    this.offset = 0;
  }

  seek(seconds: number) {
    if (!this.buffer) return;
    const wasPlaying = this.source !== null;
    this.stopSource();
    this.offset = Math.min(Math.max(seconds, 0), this.buffer.duration);
    if (wasPlaying) void this.play();
  }

  setLoop(loop: boolean) {
    this.loop = loop;
    if (this.source instanceof AudioBufferSourceNode && this.kind === 'clip') this.source.loop = loop;
  }

  // A/B switch: crossfade between the dry and processed paths.
  setBypass(bypassed: boolean) {
    this.bypassed = bypassed;
    const t = this.ctx.currentTime;
    this.dryGain.gain.setTargetAtTime(bypassed ? 1 : 0, t, CROSSFADE_TC);
    this.wetGain.gain.setTargetAtTime(bypassed ? 0 : 1, t, CROSSFADE_TC);
  }

  get isBypassed() {
    return this.bypassed;
  }

  setLevelMatch(on: boolean) {
    this.levelMatchOn = on;
    if (!on) this.levelMatch.gain.setTargetAtTime(1, this.ctx.currentTime, PARAM_TC);
  }

  applySettings(settings: ToneSettings) {
    this.settings = settings;
    this.chain.apply(settings);
  }

  get currentSettings() {
    return this.settings;
  }

  setMasterDb(db: number) {
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, PARAM_TC);
  }

  // Gain level matching currently applies to the processed path. Views
  // use it to draw "matched" curves; the analysers tap before it.
  getMatchGain() {
    return this.levelMatchOn ? this.levelMatch.gain.value : 1;
  }

  getState(): EngineState {
    return {
      playing: this.source !== null,
      canPlay: this.canPlay,
      source: this.kind,
      position: this.currentPosition(),
      duration: this.kind === 'sine' ? 0 : (this.buffer?.duration ?? 0),
      levelMatchDb: gainToDb(this.levelMatch.gain.value),
    };
  }

  dispose() {
    if (this.matchTimer !== null) window.clearInterval(this.matchTimer);
    this.stopSource();
    void this.ctx.close();
  }

  private currentPosition() {
    if (this.kind === 'sine') return this.source ? this.ctx.currentTime - this.startedAt : 0;
    const buffer = this.buffer;
    if (!buffer) return 0;
    if (!this.source) return this.offset;
    const elapsed = this.offset + (this.ctx.currentTime - this.startedAt);
    const loops = this.kind !== 'clip' || this.loop;
    return loops ? elapsed % buffer.duration : Math.min(elapsed, buffer.duration);
  }

  private stopSource() {
    if (!this.source) return;
    const src = this.source;
    this.source = null;
    src.onended = null;
    src.stop();
    src.disconnect();
  }

  // Loudness matching: keep a slow running average of each path's power
  // and set levelMatch so the processed path is as loud as the dry one.
  // Measured, not computed, so it keeps working once the effect is
  // nonlinear (distortion changes loudness in ways a formula can't predict).
  private updateLevelMatch() {
    if (!this.levelMatchOn || !this.source) return;

    this.dryAnalyser.getFloatTimeDomainData(this.dryData);
    this.wetAnalyser.getFloatTimeDomainData(this.wetData);
    const dry = meanSquare(this.dryData);
    const wet = meanSquare(this.wetData);
    if (Math.sqrt(dry) < SILENCE_RMS || Math.sqrt(wet) < SILENCE_RMS) return;

    // ~1.5 s averaging window at a 50 ms tick.
    const k = 0.035;
    this.dryPower = this.dryPower === 0 ? dry : this.dryPower + k * (dry - this.dryPower);
    this.wetPower = this.wetPower === 0 ? wet : this.wetPower + k * (wet - this.wetPower);

    const db = 10 * Math.log10(this.dryPower / this.wetPower);
    const clamped = Math.max(-MATCH_LIMIT_DB, Math.min(MATCH_LIMIT_DB, db));
    this.levelMatch.gain.setTargetAtTime(dbToGain(clamped), this.ctx.currentTime, MATCH_TC);
  }
}

function meanSquare(data: Float32Array) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return sum / data.length;
}

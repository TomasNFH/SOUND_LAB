// Web Audio graph for the tone lab. Lives outside React: the UI pushes
// values in through setters and reads state back through getState().
//
//   source ─┬─────────────────────────────── dryGain ──┐
//           │                                           ├─ master ─ destination
//           └─ effect chain ─ levelMatch ─── wetGain ──┘
//
// Dry and processed run in parallel all the time, so A/B is a crossfade
// between dryGain and wetGain rather than a reconnect (no clicks).

const CROSSFADE_TC = 0.01; // seconds; ~50 ms to settle
const PARAM_TC = 0.02;
const MATCH_TC = 0.25;
const MATCH_LIMIT_DB = 24;
const SILENCE_RMS = 1e-4;

export type EngineState = {
  playing: boolean;
  position: number; // seconds into the buffer
  duration: number;
  levelMatchDb: number; // gain currently applied by level matching
};

const dbToGain = (db: number) => Math.pow(10, db / 20);
const gainToDb = (g: number) => 20 * Math.log10(g);

export class AudioEngine {
  readonly ctx: AudioContext;

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
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

  // Phase 1 placeholder effect: a plain gain stage, enough to prove that
  // level matching keeps A/B honest. Later phases replace the chain
  // between effectIn and effectOut.
  private readonly testGain: GainNode;

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
    this.effectIn = c.createGain();
    this.effectOut = c.createGain();
    this.testGain = c.createGain();
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
    this.effectIn.connect(this.testGain).connect(this.effectOut);
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
    this.stop();
    this.buffer = buffer;
    this.offset = 0;
    this.dryPower = 0;
    this.wetPower = 0;
    return buffer;
  }

  get hasBuffer() {
    return this.buffer !== null;
  }

  async play() {
    if (!this.buffer || this.source) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.connect(this.input);
    src.onended = () => {
      // Fires on stop() too; only reset when the clip ran out by itself.
      if (this.source === src) {
        this.source = null;
        this.offset = 0;
      }
    };
    if (this.offset >= this.buffer.duration) this.offset = 0;
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
    if (this.source) this.source.loop = loop;
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

  setTestGainDb(db: number) {
    this.testGain.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, PARAM_TC);
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
      position: this.currentPosition(),
      duration: this.buffer?.duration ?? 0,
      levelMatchDb: gainToDb(this.levelMatch.gain.value),
    };
  }

  dispose() {
    if (this.matchTimer !== null) window.clearInterval(this.matchTimer);
    this.stopSource();
    void this.ctx.close();
  }

  private currentPosition() {
    if (!this.buffer) return 0;
    if (!this.source) return this.offset;
    const elapsed = this.offset + (this.ctx.currentTime - this.startedAt);
    const d = this.buffer.duration;
    return this.loop ? elapsed % d : Math.min(elapsed, d);
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

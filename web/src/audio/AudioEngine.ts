// Web Audio graph for the tone lab. Lives outside React: the UI pushes
// values in through setters and reads state back through getState().
//
//   source ─┬─ chain A ──────────────── gainA ──┐
//           │                                   ├─ master ─ destination
//           └─ chain B ── levelMatch ── gainB ──┘
//
// Two complete processing branches run in parallel all the time, so A/B
// is a crossfade between gainA and gainB rather than a reconnect (no
// clicks). Branch A starts dry (every block off), which makes the default
// A/B the classic dry vs processed comparison.

import { Chain } from './Chain';
import type { BranchId, Branches } from './settings';
import { setIrDecoder } from './ir';
import { preferPlaybackSession, unlockPlayback } from './iosAudio';
import { makeLogSweep, makePinkNoise } from './signals';
import { dbToGain, gainToDb } from './util';

const CROSSFADE_TC = 0.01; // seconds; ~50 ms to settle
const PARAM_TC = 0.02;
const MATCH_TC = 0.25;
const MATCH_LIMIT_DB = 24;
const SILENCE_RMS = 1e-4;

// Where the signal comes from. The clip is for listening; the generated
// signals are for analysis (harmonics, transfer, filter responses).
export type SourceKind = 'clip' | 'sine' | 'noise' | 'sweep' | 'live';

export type LiveOptions = {
  deviceId: string; // '' = the default input
  channel: 'left' | 'right' | 'both'; // interfaces put input 1 on the left
  trimDb: number;
};

type LiveInput = { stream: MediaStream; node: MediaStreamAudioSourceNode; splitter: ChannelSplitterNode };

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
  private live: LiveInput | null = null;
  private liveOpts: LiveOptions = { deviceId: '', channel: 'left', trimDb: 0 };
  private readonly liveTrim: GainNode;
  private liveError: string | null = null;
  private liveStarting = false; // a permission prompt can stay open a long time
  private sineFreq = 220;
  private startedAt = 0; // ctx time when playback (re)started
  private offset = 0; // buffer position at startedAt
  private loop = true;

  private readonly input: GainNode;
  private readonly levelMatch: GainNode;
  private readonly gainA: GainNode;
  private readonly gainB: GainNode;
  private readonly master: GainNode;

  readonly chains: Record<BranchId, Chain>;
  private settings: Branches | null = null;

  // One analyser per branch output: the A and B curves in the views, and
  // the loudness measurement for level matching.
  readonly analyserA: AnalyserNode;
  readonly analyserB: AnalyserNode;
  private readonly dataA: Float32Array;
  private readonly dataB: Float32Array;
  private powerA = 0;
  private powerB = 0;
  private levelMatchOn = true;
  private matchTimer: number | null = null;

  private listening: BranchId = 'b';

  constructor() {
    preferPlaybackSession();
    // 48 kHz matches the recording format in the plan, so clips aren't resampled.
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    const c = this.ctx;

    this.input = c.createGain();
    this.sineLevel = c.createGain();
    this.sineLevel.gain.value = dbToGain(-12);
    this.sineLevel.connect(this.input);
    this.liveTrim = c.createGain();
    this.liveTrim.connect(this.input);
    setIrDecoder(c);
    this.chains = { a: new Chain(c), b: new Chain(c) };
    this.levelMatch = c.createGain();
    this.gainA = c.createGain();
    this.gainB = c.createGain();
    this.master = c.createGain();

    this.analyserA = c.createAnalyser();
    this.analyserB = c.createAnalyser();
    for (const a of [this.analyserA, this.analyserB]) {
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0.8;
    }
    this.dataA = new Float32Array(this.analyserA.fftSize);
    this.dataB = new Float32Array(this.analyserB.fftSize);

    this.input.connect(this.chains.a.input);
    this.chains.a.output.connect(this.analyserA);
    this.chains.a.output.connect(this.gainA).connect(this.master);

    this.input.connect(this.chains.b.input);
    // Measure B before level matching, so the correction doesn't feed
    // back into its own measurement.
    this.chains.b.output.connect(this.analyserB);
    this.chains.b.output.connect(this.levelMatch).connect(this.gainB).connect(this.master);

    this.master.connect(c.destination);

    this.gainA.gain.value = 0;
    this.gainB.gain.value = 1;
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
    if (this.kind === 'live') return !!navigator.mediaDevices?.getUserMedia;
    return this.kind !== 'clip' || this.clip !== null;
  }

  get liveInputError() {
    return this.liveError;
  }

  // Seconds between sound arriving and leaving: the browser's own input
  // and output buffering, plus whatever the device reports.
  get latency() {
    const track = this.live?.stream.getAudioTracks()[0];
    const input = (track?.getSettings() as { latency?: number } | undefined)?.latency ?? 0;
    return { base: this.ctx.baseLatency ?? 0, output: this.ctx.outputLatency ?? 0, input };
  }

  setLiveOptions(opts: LiveOptions) {
    const restart = this.live && (opts.deviceId !== this.liveOpts.deviceId || opts.channel !== this.liveOpts.channel);
    this.liveOpts = opts;
    this.liveTrim.gain.setTargetAtTime(dbToGain(opts.trimDb), this.ctx.currentTime, PARAM_TC);
    if (restart) {
      this.stopLive();
      void this.play();
    }
  }

  private async startLive() {
    if (this.liveStarting) return;
    this.liveStarting = true;
    this.liveError = null;
    try {
      // Every browser "voice" feature off: they are made for speech and
      // would gate, filter and level the guitar.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.liveOpts.deviceId ? { exact: this.liveOpts.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Not in every browser's typings, but honoured where supported.
          ...({ latency: 0 } as object),
        },
      });
      if (this.kind !== 'live') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const node = this.ctx.createMediaStreamSource(stream);
      const splitter = this.ctx.createChannelSplitter(2);
      node.connect(splitter);
      const { channel } = this.liveOpts;
      const deviceChannels = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
      if (channel === 'both' || deviceChannels < 2) {
        node.disconnect();
        node.connect(this.liveTrim);
      } else {
        splitter.connect(this.liveTrim, channel === 'left' ? 0 : 1);
      }
      this.live = { stream, node, splitter };
      this.startedAt = this.ctx.currentTime;
    } catch (err) {
      this.liveError = (err as Error).message || 'Could not open the audio input';
    } finally {
      this.liveStarting = false;
    }
  }

  private stopLive() {
    if (!this.live) return;
    this.live.stream.getTracks().forEach((t) => t.stop());
    this.live.node.disconnect();
    this.live.splitter.disconnect();
    this.live = null;
  }

  private get buffer(): AudioBuffer | null {
    if (this.kind === 'clip') return this.clip;
    if (this.kind === 'sine' || this.kind === 'live') return null;
    let b = this.generated.get(this.kind);
    if (!b) {
      b = this.kind === 'noise' ? makePinkNoise(this.ctx, 8) : makeLogSweep(this.ctx, 4);
      this.generated.set(this.kind, b);
    }
    return b;
  }

  private resetTransport() {
    this.stop();
    this.powerA = 0;
    this.powerB = 0;
  }

  async play() {
    if (this.source || this.live || !this.canPlay) return;
    unlockPlayback();
    // Safari also reports "interrupted" (after a call, or coming back from
    // the background), which needs a resume as well.
    if (this.ctx.state !== 'running') await this.ctx.resume();

    if (this.kind === 'live') {
      await this.startLive();
      return;
    }

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
    if (this.live) return this.stopLive();
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

  // A/B switch: crossfade between the two branches.
  setListen(branch: BranchId) {
    this.listening = branch;
    const t = this.ctx.currentTime;
    this.gainA.gain.setTargetAtTime(branch === 'a' ? 1 : 0, t, CROSSFADE_TC);
    this.gainB.gain.setTargetAtTime(branch === 'b' ? 1 : 0, t, CROSSFADE_TC);
  }

  get listeningTo() {
    return this.listening;
  }

  setLevelMatch(on: boolean) {
    this.levelMatchOn = on;
    if (!on) this.levelMatch.gain.setTargetAtTime(1, this.ctx.currentTime, PARAM_TC);
  }

  applySettings(settings: Branches) {
    this.settings = settings;
    this.chains.a.apply(settings.a);
    this.chains.b.apply(settings.b);
  }

  get currentSettings() {
    return this.settings;
  }

  setMasterDb(db: number) {
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, PARAM_TC);
  }

  // Gain level matching currently applies to branch B. Views
  // use it to draw "matched" curves; the analysers tap before it.
  getMatchGain() {
    return this.levelMatchOn ? this.levelMatch.gain.value : 1;
  }

  getState(): EngineState {
    return {
      playing: this.source !== null || this.live !== null,
      canPlay: this.canPlay,
      source: this.kind,
      position: this.currentPosition(),
      duration: this.kind === 'sine' || this.kind === 'live' ? 0 : (this.buffer?.duration ?? 0),
      levelMatchDb: gainToDb(this.levelMatch.gain.value),
    };
  }

  dispose() {
    if (this.matchTimer !== null) window.clearInterval(this.matchTimer);
    this.stopSource();
    void this.ctx.close();
  }

  private currentPosition() {
    if (this.kind === 'sine' || this.kind === 'live') {
      return this.source || this.live ? this.ctx.currentTime - this.startedAt : 0;
    }
    const buffer = this.buffer;
    if (!buffer) return 0;
    if (!this.source) return this.offset;
    const elapsed = this.offset + (this.ctx.currentTime - this.startedAt);
    const loops = this.kind !== 'clip' || this.loop;
    return loops ? elapsed % buffer.duration : Math.min(elapsed, buffer.duration);
  }

  private stopSource() {
    this.stopLive();
    if (!this.source) return;
    const src = this.source;
    this.source = null;
    src.onended = null;
    src.stop();
    src.disconnect();
  }

  // Loudness matching: keep a slow running average of each path's power
  // and set levelMatch so branch B is as loud as branch A.
  // Measured, not computed, so it keeps working once the effect is
  // nonlinear (distortion changes loudness in ways a formula can't predict).
  private updateLevelMatch() {
    if (!this.levelMatchOn || !(this.source || this.live)) return;

    this.analyserA.getFloatTimeDomainData(this.dataA);
    this.analyserB.getFloatTimeDomainData(this.dataB);
    const a = meanSquare(this.dataA);
    const b = meanSquare(this.dataB);
    if (Math.sqrt(a) < SILENCE_RMS || Math.sqrt(b) < SILENCE_RMS) return;

    // ~1.5 s averaging window at a 50 ms tick.
    const k = 0.035;
    this.powerA = this.powerA === 0 ? a : this.powerA + k * (a - this.powerA);
    this.powerB = this.powerB === 0 ? b : this.powerB + k * (b - this.powerB);

    const db = 10 * Math.log10(this.powerA / this.powerB);
    const clamped = Math.max(-MATCH_LIMIT_DB, Math.min(MATCH_LIMIT_DB, db));
    this.levelMatch.gain.setTargetAtTime(dbToGain(clamped), this.ctx.currentTime, MATCH_TC);
  }
}

function meanSquare(data: Float32Array) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return sum / data.length;
}

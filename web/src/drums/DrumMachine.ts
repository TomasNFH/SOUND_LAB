import { preferPlaybackSession, unlockPlayback } from '../audio/iosAudio';
import { hit } from './kit';
import { patternById, patternLength, VOICES, velocityAt, type PatternId } from './patterns';

export interface DrumState {
  playing: boolean;
  bpm: number;
  patternId: PatternId;
  volume: number;
}

export const MIN_BPM = 40;
export const MAX_BPM = 220;

// Timers in the page are not sample-accurate, so a short timer looks ahead
// and books every hit in the next 120 ms on the audio clock, which is.
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

// One drum machine for the page, outside React, so the beat keeps going when
// you switch to another section (playing along while reading a scale).
class DrumMachine {
  private state: DrumState = { playing: false, bpm: 90, patternId: 'rock', volume: 0.8 };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private nextStep = 0;
  private nextTime = 0;
  // Steps already booked, so the UI can light the one being heard now.
  private booked: { step: number; time: number }[] = [];

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(p: Partial<DrumState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }

  private stepSeconds(patternId = this.state.patternId) {
    return 60 / this.state.bpm / patternById(patternId).stepsPerBeat;
  }

  // Call from inside a click or key handler (browsers only start audio then).
  play() {
    if (this.state.playing) return;
    if (!this.ctx) {
      preferPlaybackSession();
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.state.volume;
      // Kick or snare landing with the hi-hat can sum past full scale; a fast
      // limiter keeps those hits from clipping.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      this.out.connect(limiter).connect(this.ctx.destination);
    }
    unlockPlayback();
    void this.ctx.resume();
    this.nextStep = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.booked = [];
    this.timer = window.setInterval(this.tick, TICK_MS);
    this.set({ playing: true });
    this.tick();
  }

  stop() {
    window.clearInterval(this.timer);
    this.booked = [];
    this.set({ playing: false });
  }

  toggle() {
    if (this.state.playing) this.stop();
    else this.play();
  }

  setBpm(bpm: number) {
    this.set({ bpm: Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))) });
  }

  setVolume(volume: number) {
    this.out?.gain.setTargetAtTime(volume, this.ctx!.currentTime, 0.02);
    this.set({ volume });
  }

  // Changing beat mid-play waits for the next beat, then starts the new
  // pattern from that beat, so the groove never stumbles.
  setPattern(patternId: PatternId) {
    const from = patternById(this.state.patternId);
    if (this.state.playing && patternId !== from.id) {
      const to = patternById(patternId);
      const toBeat = (from.stepsPerBeat - (this.nextStep % from.stepsPerBeat)) % from.stepsPerBeat;
      this.nextTime += toBeat * this.stepSeconds();
      const beat = Math.floor((this.nextStep + toBeat) / from.stepsPerBeat);
      this.nextStep = (beat * to.stepsPerBeat) % patternLength(to);
    }
    this.set({ patternId });
  }

  // The step sounding right now, or -1 when stopped.
  currentStep() {
    if (!this.ctx || !this.state.playing) return -1;
    const now = this.ctx.currentTime;
    while (this.booked.length > 1 && this.booked[1].time <= now) this.booked.shift();
    const first = this.booked[0];
    return first && first.time <= now ? first.step : -1;
  }

  private tick = () => {
    const ctx = this.ctx!;
    const pattern = patternById(this.state.patternId);
    // A background tab slows timers to about once a second; skip the steps
    // that went by rather than playing them all at once.
    while (this.nextTime < ctx.currentTime) {
      this.nextTime += this.stepSeconds();
      this.nextStep = (this.nextStep + 1) % patternLength(pattern);
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const { id } of VOICES) {
        const v = velocityAt(pattern, id, this.nextStep);
        if (v > 0) hit(ctx, this.out!, id, this.nextTime, v);
      }
      this.booked.push({ step: this.nextStep, time: this.nextTime });
      this.nextTime += this.stepSeconds();
      this.nextStep = (this.nextStep + 1) % patternLength(pattern);
    }
  };
}

export const drums = new DrumMachine();

// Dev only: poke the machine from the browser console.
if (import.meta.env.DEV) (window as unknown as { drums: DrumMachine }).drums = drums;

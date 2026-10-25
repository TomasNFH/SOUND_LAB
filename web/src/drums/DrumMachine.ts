import { preferPlaybackSession, unlockPlayback } from '../audio/iosAudio';
import { hit, kitReady, loadKit } from './kit';
import { grooveById, type Groove } from './patterns';

export interface DrumState {
  playing: boolean;
  // True while the samples download before the first beat.
  loading: boolean;
  bpm: number;
  grooveId: string;
  volume: number;
}

export const MIN_BPM = 40;
export const MAX_BPM = 220;

// Timers in the page are not sample-accurate, so a short timer looks ahead
// and books every hit in the next 120 ms on the audio clock, which is.
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
// Real drummers sometimes hit the downbeat a hair early; start the clock
// this many beats before 1 so those notes are not lost on the first loop.
const PRE_ROLL = 0.25;

// Programmed beats get this much random timing and level, so they breathe.
const HUMAN_MS = 6;
const HUMAN_VEL = 0.08;

// One drum machine for the page, outside React, so the beat keeps going when
// you switch to another section (playing along while reading a scale).
class DrumMachine {
  private state: DrumState = { playing: false, loading: false, bpm: 90, grooveId: 'rock', volume: 0.8 };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  // Beats count up from the first downbeat; tempo changes re-anchor them.
  private anchorTime = 0;
  private anchorBeat = 0;
  private scheduledTo = 0;
  // A groove picked mid-play takes over at this beat.
  private pending: { grooveId: string; at: number } | null = null;
  private current: Groove = grooveById(this.state.grooveId);

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(p: Partial<DrumState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }

  private beatAt(t: number) {
    return this.anchorBeat + ((t - this.anchorTime) * this.state.bpm) / 60;
  }

  private timeAt(beat: number) {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.state.bpm;
  }

  preload() {
    void loadKit().catch(() => {});
  }

  // Call from inside a click or key handler (browsers only start audio then).
  async play() {
    if (this.state.playing || this.state.loading) return;
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
    if (!kitReady()) {
      this.set({ loading: true });
      try {
        await loadKit();
      } finally {
        this.set({ loading: false });
      }
    }
    this.current = grooveById(this.state.grooveId);
    this.pending = null;
    this.anchorTime = this.ctx.currentTime + 0.1;
    this.anchorBeat = 0;
    this.scheduledTo = -PRE_ROLL;
    this.timer = window.setInterval(this.tick, TICK_MS);
    this.set({ playing: true });
    this.tick();
  }

  stop() {
    window.clearInterval(this.timer);
    this.set({ playing: false });
    // Let the audio thread rest until the next Play (it keeps running, and
    // using CPU, while a context is open even when silent).
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (ctx && !this.state.playing && ctx.state === 'running') void ctx.suspend();
    }, 2000);
  }

  toggle() {
    if (this.state.playing) this.stop();
    else void this.play();
  }

  setBpm(bpm: number) {
    const next = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
    if (this.ctx && this.state.playing) {
      // Keep the beat where it is and change speed from here on.
      const now = this.ctx.currentTime;
      this.anchorBeat = this.beatAt(now);
      this.anchorTime = now;
    }
    this.set({ bpm: next });
  }

  setVolume(volume: number) {
    this.out?.gain.setTargetAtTime(volume, this.ctx!.currentTime, 0.02);
    this.set({ volume });
  }

  // A new groove waits for the next beat, then joins at the same place in
  // the bar, so the groove never stumbles.
  setGroove(grooveId: string) {
    if (this.state.playing) this.pending = { grooveId, at: Math.ceil(this.scheduledTo) };
    else this.current = grooveById(grooveId);
    this.set({ grooveId });
  }

  // Where the listener is now: beats into the loop, or -1 when stopped.
  position() {
    if (!this.ctx || !this.state.playing) return -1;
    const beat = this.beatAt(this.ctx.currentTime);
    if (beat < 0) return -1;
    const groove = this.pending && beat >= this.pending.at ? grooveById(this.pending.grooveId) : this.current;
    return beat % groove.beats;
  }

  private tick = () => {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // A background tab slows timers to about once a second; skip the beats
    // that went by rather than playing them all at once.
    this.scheduledTo = Math.max(this.scheduledTo, this.beatAt(now));
    const end = this.beatAt(now + LOOKAHEAD);
    while (this.scheduledTo < end) {
      const until = this.pending ? Math.min(end, this.pending.at) : end;
      this.book(this.current, this.scheduledTo, until);
      this.scheduledTo = until;
      if (this.pending && until >= this.pending.at) {
        this.current = grooveById(this.pending.grooveId);
        this.pending = null;
      }
    }
  };

  // Book every hit of the looping groove that falls in [from, to) beats.
  private book(groove: Groove, from: number, to: number) {
    const length = groove.beats;
    const hits: [number, Groove['events'][number]][] = [];
    for (let loop = Math.floor(from / length) - 1; loop * length < to + 1; loop++) {
      for (const e of groove.events) {
        // Hits a hair before the loop start belong to the end of the loop.
        const beat = loop * length + (((e[0] % length) + length) % length);
        if (beat >= from && beat < to) hits.push([beat, e]);
      }
    }
    hits.sort((a, b) => a[0] - b[0]);
    const human = !groove.source;
    for (const [beat, [, voice, velocity]] of hits) {
      const jitter = human ? ((Math.random() * 2 - 1) * HUMAN_MS) / 1000 : 0;
      const v = human ? velocity * (1 + (Math.random() * 2 - 1) * HUMAN_VEL) : velocity;
      hit(this.ctx!, this.out!, voice, Math.max(this.ctx!.currentTime, this.timeAt(beat) + jitter), v);
    }
  }
}

export const drums = new DrumMachine();

// Dev only: poke the machine from the browser console.
if (import.meta.env.DEV) (window as unknown as { drums: DrumMachine }).drums = drums;

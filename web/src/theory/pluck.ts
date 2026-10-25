import { preferPlaybackSession, unlockPlayback } from '../audio/iosAudio';
import { midiToHz } from './music';

// A tiny plucked-string voice so fretboard notes can be heard. It has its own
// context, separate from Tone Lab's engine, and is created on the first tap.
let ctx: AudioContext | null = null;

// Call from inside a click handler.
export function pluck(midi: number, at = 0) {
  if (!ctx) {
    preferPlaybackSession();
    ctx = new AudioContext();
  }
  unlockPlayback();
  if (ctx.state === 'suspended') void ctx.resume();

  const t = ctx.currentTime + at;
  const hz = midiToHz(midi);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = hz;
  // The filter closes as the note decays, like a string losing its brightness.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(Math.min(hz * 8, 12000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(hz * 1.5, 200), t + 0.8);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.25, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  osc.connect(lp).connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 1.7);
}

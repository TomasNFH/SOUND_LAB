import { mod12, noteName } from '../theory/music';

// Guitar range with room either side: drop tunings down to ~60 Hz, up past
// the 24th fret of the high E (1.3 kHz).
const MIN_HZ = 60;
const MAX_HZ = 1400;
// YIN's dip threshold: lower is stricter about calling something a pitch.
const THRESHOLD = 0.15;
// Below this RMS (about -50 dBFS) there is nothing to tune.
const MIN_RMS = 0.003;

export interface Pitch {
  hz: number;
  // 0..1, how periodic the signal is (1 - YIN's dip).
  clarity: number;
}

// YIN (de Cheveigné & Kawahara, 2002): the squared difference between the
// signal and itself shifted by tau, normalised by its running mean, dips
// towards 0 at the period. The first dip under the threshold is taken (not
// the deepest), which avoids octave errors on harmonic-rich guitar notes,
// and refined between samples with a parabola.
export function detectPitch(buf: Float32Array, sampleRate: number): Pitch | null {
  const maxTau = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const window = buf.length - maxTau;

  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / buf.length) < MIN_RMS) return null;

  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < window; i++) {
      const diff = buf[i] - buf[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tau = -1;
  for (let t = minTau; t < maxTau; t++) {
    if (cmnd[t] < THRESHOLD) {
      // Walk down to the bottom of this dip.
      while (t + 1 < maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  const a = cmnd[tau - 1];
  const b = cmnd[tau];
  const c = cmnd[tau + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { hz: sampleRate / (tau + shift), clarity: 1 - b };
}

export interface Note {
  name: string;
  octave: number;
  // Signed distance from the nearest note, -50..+50.
  cents: number;
  midi: number;
}

export function nearestNote(hz: number, a4: number): Note {
  const exact = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  return { name: noteName(mod12(midi), false), octave: Math.floor(midi / 12) - 1, cents: (exact - midi) * 100, midi };
}

// Standard tuning, low to high, as MIDI notes: E2 A2 D3 G3 B3 E4.
export const STANDARD_TUNING = [
  { string: 6, name: 'E', midi: 40 },
  { string: 5, name: 'A', midi: 45 },
  { string: 4, name: 'D', midi: 50 },
  { string: 3, name: 'G', midi: 55 },
  { string: 2, name: 'B', midi: 59 },
  { string: 1, name: 'E', midi: 64 },
];

// The open string closest to a pitch, and how far off it is in cents
// (so tuning a string up from a semitone flat still points at it).
export function nearestString(hz: number, a4: number) {
  const exact = 69 + 12 * Math.log2(hz / a4);
  let best = STANDARD_TUNING[0];
  for (const s of STANDARD_TUNING) if (Math.abs(exact - s.midi) < Math.abs(exact - best.midi)) best = s;
  return { ...best, cents: (exact - best.midi) * 100 };
}

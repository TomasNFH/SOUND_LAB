import { GROOVES } from './grooves';

export type Voice = 'kick' | 'snare' | 'hat' | 'open' | 'pedal';

// One hit: when (in beats from the loop start), which drum, how hard (0-1).
export type Hit = [beat: number, voice: Voice, velocity: number];

export interface Groove {
  id: string;
  label: string;
  description: string;
  // The tempo it was played at; any tempo works.
  bpm: number;
  // Loop length: whole bars of 4/4.
  beats: number;
  // Grid for the step display: 4 = sixteenths, 3 = triplets (swing).
  stepsPerBeat: number;
  // Who played it, for real grooves; programmed beats get a little
  // random timing instead so they don't sound like a machine.
  source?: string;
  events: Hit[];
}

// Simple beats as one line per drum, one character per step:
// X = accent, x = normal hit, o = ghost note, . = rest.
function programmed(stepsPerBeat: number, tracks: Partial<Record<Voice, string>>): Hit[] {
  const velocity: Record<string, number> = { X: 1, x: 0.7, o: 0.3 };
  return Object.entries(tracks).flatMap(([voice, line]) =>
    [...line].flatMap((ch, step): Hit[] => (ch in velocity ? [[step / stepsPerBeat, voice as Voice, velocity[ch]]] : [])),
  );
}

const SIMPLE: Groove[] = [
  {
    id: 'basic-rock',
    label: 'Rock',
    description: 'Straight eighths on the hi-hat, snare on 2 and 4.',
    bpm: 90,
    beats: 4,
    stepsPerBeat: 4,
    events: programmed(4, {
      hat: 'X.x.X.x.X.x.X.x.',
      snare: '....X.......X...',
      kick: 'x.......x.x.....',
    }),
  },
  {
    id: 'basic-shuffle',
    label: 'Shuffle',
    description: 'Swung triplet feel: long-short on the hi-hat, like a blues.',
    bpm: 90,
    beats: 4,
    stepsPerBeat: 3,
    events: programmed(3, {
      hat: 'X.xX.xX.xX.x',
      snare: '...X....oX..',
      kick: 'x.....x....x',
    }),
  },
];

export const GROOVE_GROUPS: { label: string; grooves: Groove[] }[] = [
  { label: 'Simple', grooves: SIMPLE },
  { label: 'Real drummer', grooves: GROOVES },
];

const ALL = [...SIMPLE, ...GROOVES];

export const grooveById = (id: string) => ALL.find((g) => g.id === id) ?? ALL[0];

// Rows of the step grid; open and pedal hi-hat share the hi-hat row.
export const ROWS: { label: string; voices: Voice[] }[] = [
  { label: 'Hi-hat', voices: ['hat', 'open', 'pedal'] },
  { label: 'Snare', voices: ['snare'] },
  { label: 'Kick', voices: ['kick'] },
];

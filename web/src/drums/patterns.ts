// Beats as one line per drum, one character per step:
// X = accent, x = normal hit, o = ghost note, . = rest.

export type Voice = 'hat' | 'snare' | 'kick';
export type PatternId = 'rock' | 'shuffle';

export interface Pattern {
  id: PatternId;
  label: string;
  description: string;
  // 4 = straight sixteenths, 3 = triplets (the swing in a shuffle).
  stepsPerBeat: number;
  tracks: Record<Voice, string>;
}

export const VOICES: { id: Voice; label: string }[] = [
  { id: 'hat', label: 'Hi-hat' },
  { id: 'snare', label: 'Snare' },
  { id: 'kick', label: 'Kick' },
];

export const PATTERNS: Pattern[] = [
  {
    id: 'rock',
    label: 'Rock',
    description: 'Straight eighths on the hi-hat, snare on 2 and 4.',
    stepsPerBeat: 4,
    tracks: {
      hat: 'X.x.X.x.X.x.X.x.',
      snare: '....X.......X...',
      kick: 'x.......x.x.....',
    },
  },
  {
    id: 'shuffle',
    label: 'Shuffle',
    description: 'Swung triplet feel: long-short on the hi-hat, like a blues.',
    stepsPerBeat: 3,
    tracks: {
      hat: 'X.xX.xX.xX.x',
      snare: '...X....oX..',
      kick: 'x.....x....x',
    },
  },
];

export const patternById = (id: PatternId) => PATTERNS.find((p) => p.id === id)!;

export const patternLength = (p: Pattern) => p.tracks.hat.length;

const VELOCITY: Record<string, number> = { X: 1, x: 0.7, o: 0.3 };

export const velocityAt = (p: Pattern, voice: Voice, step: number) => VELOCITY[p.tracks[voice][step]] ?? 0;

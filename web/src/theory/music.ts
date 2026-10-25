// Pitch classes, scales and key spelling for Theory Lab. A pitch class is
// 0..11 with C = 0; notes are spelled by scale degree so every key reads
// the way it does on paper (F major has B♭, not A♯).

export type PitchClass = number;
export type Tonality = 'major' | 'minor';

export type ScaleId =
  | 'major'
  | 'minor'
  | 'majorPent'
  | 'minorPent'
  | 'blues'
  | 'dorian'
  | 'mixolydian'
  | 'harmonicMinor';

export interface Scale {
  id: ScaleId;
  label: string;
  // Semitones above the root, with the matching degree ('b3' = flat third).
  intervals: number[];
  degrees: string[];
  // Which ring of the circle the key sits on, and which chords to list.
  tonality: Tonality;
}

export const SCALES: Scale[] = [
  { id: 'major', label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'], tonality: 'major' },
  { id: 'minor', label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'], tonality: 'minor' },
  { id: 'majorPent', label: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], degrees: ['1', '2', '3', '5', '6'], tonality: 'major' },
  { id: 'minorPent', label: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], degrees: ['1', 'b3', '4', '5', 'b7'], tonality: 'minor' },
  { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10], degrees: ['1', 'b3', '4', 'b5', '5', 'b7'], tonality: 'minor' },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'], tonality: 'minor' },
  { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ['1', '2', '3', '4', '5', '6', 'b7'], tonality: 'major' },
  { id: 'harmonicMinor', label: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'], tonality: 'minor' },
];

export const scaleById = (id: ScaleId) => SCALES.find((s) => s.id === id)!;

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const LETTERS = 'CDEFGAB';
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

// Major keys written with flats: F, B♭, E♭, A♭, D♭. (F♯ / G♭ is drawn with sharps.)
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1]);

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

export const usesFlats = (root: PitchClass, tonality: Tonality) =>
  FLAT_MAJORS.has(tonality === 'major' ? root : mod12(root + 3));

export const noteName = (pc: PitchClass, flats: boolean) => (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];

// Root choices for the picker, each with both spellings where they differ.
export const ROOTS = SHARP_NAMES.map((s, pc) => (s === FLAT_NAMES[pc] ? s : `${s}/${FLAT_NAMES[pc]}`));

const accidental = (n: number) => (n > 0 ? '♯'.repeat(n) : '♭'.repeat(-n)).replace('♯♯', '𝄪').replace('♭♭', '𝄫');

// Spell `pc` on a given letter: E♭ rather than D♯ when the letter is E.
function spellOnLetter(letter: number, pc: PitchClass) {
  const diff = mod12(pc - NATURAL_PC[letter] + 6) - 6;
  return LETTERS[letter] + accidental(diff);
}

export const prettyDegree = (d: string) => d.replace('b', '♭').replace('#', '♯');

export interface ScaleNote {
  pc: PitchClass;
  name: string;
  degree: string;
}

export function scaleNotes(root: PitchClass, scale: Scale): ScaleNote[] {
  const rootName = noteName(root, usesFlats(root, scale.tonality));
  const rootLetter = LETTERS.indexOf(rootName[0]);
  return scale.intervals.map((iv, i) => {
    const pc = mod12(root + iv);
    const step = parseInt(scale.degrees[i].replace(/[b#]/g, ''), 10) - 1;
    return { pc, name: spellOnLetter((rootLetter + step) % 7, pc), degree: prettyDegree(scale.degrees[i]) };
  });
}

// The circle, clockwise from the top: each step adds a sharp (or drops a flat).
export const FIFTHS: PitchClass[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export const relativeMinor = (major: PitchClass) => mod12(major + 9);
export const relativeMajor = (minor: PitchClass) => mod12(minor + 3);

// Sharps (positive) or flats (negative) in the key signature of a major key.
export function keySignature(major: PitchClass) {
  const i = FIFTHS.indexOf(major);
  return i <= 6 ? i : i - 12;
}

export const signatureLabel = (n: number) => (n === 0 ? 'no ♯ or ♭' : n === 6 ? '6♯ / 6♭' : n > 0 ? `${n}♯` : `${-n}♭`);

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface Chord {
  numeral: string;
  name: string;
  root: PitchClass;
  quality: 'maj' | 'min' | 'dim' | 'aug';
}

// The triads built on each degree. Pentatonic and blues borrow the chords of
// their parent key (major pentatonic -> major, minor pentatonic -> minor).
export function diatonicChords(root: PitchClass, scale: Scale): Chord[] {
  const reference = scaleById(scale.tonality === 'major' ? 'major' : 'minor');
  const parent = scale.intervals.length === 7 ? scale : reference;
  const notes = scaleNotes(root, parent);
  return notes.map((n, i) => {
    const third = mod12(notes[(i + 2) % 7].pc - n.pc);
    const fifth = mod12(notes[(i + 4) % 7].pc - n.pc);
    const quality = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : fifth === 6 ? 'dim' : 'min';
    // Numerals are relative to plain major or natural minor, so only a
    // lowered degree is marked: Mixolydian's ♭VII, but minor's III stays III.
    const acc = parent.degrees[i].startsWith('b') && !reference.degrees[i].startsWith('b') ? '♭' : '';
    const roman = quality === 'maj' || quality === 'aug' ? ROMAN[i] : ROMAN[i].toLowerCase();
    const suffix = { maj: '', min: 'm', dim: '°', aug: '+' }[quality];
    const mark = { maj: '', min: '', dim: '°', aug: '+' }[quality];
    return { numeral: acc + roman + mark, name: n.name + suffix, root: n.pc, quality };
  });
}

// Standard tuning, low E to high E, as MIDI notes.
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

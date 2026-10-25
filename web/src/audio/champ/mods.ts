import type { ChampSettings } from '../settings';

export type StageId = 'input' | 'v2a' | 'stack' | 'volume' | 'v2b' | 'feedback' | 'power' | 'speaker';

type Option<V> = { value: V; label: string };

// One way to change the amp: which part it touches, the choices (stock
// first), and the card text: what changes physically, what to listen
// for, and where to see it in the app.
export type Mod<K extends keyof ChampSettings = keyof ChampSettings> = {
  key: K;
  stage: StageId;
  label: string;
  part: string;
  options: Option<ChampSettings[K]>[];
  what: string;
  listen: string;
  look: string;
  // Shown with the option when it is a value we estimated rather than
  // took from the schematic or a documented mod.
  estimate?: string;
};

const mod = <K extends keyof ChampSettings>(m: Mod<K>) => m as unknown as Mod;

export const MODS: Mod[] = [
  mod({
    key: 'input',
    stage: 'input',
    label: 'Input jack',
    part: 'J1 / J2',
    options: [
      { value: 'high', label: 'High' },
      { value: 'low', label: 'Low' },
    ],
    what: 'Low goes through the R5/R6 68k divider, so V2-A gets half the signal (−6 dB).',
    listen: 'Low cleans up hot pickups: the same playing breaks up later.',
    look: 'Harmonics: fewer and lower bars at the same volume.',
  }),
  mod({
    key: 'v2aCap',
    stage: 'v2a',
    label: 'First-stage cathode cap',
    part: 'C3',
    options: [
      { value: '22u', label: '22 µF' },
      { value: '1u', label: '1 µF' },
      { value: '470n', label: '0.47 µF' },
    ],
    what: 'C3 decides which frequencies get V2-A’s full gain. 22 µF boosts everything down to ~10 Hz; smaller caps only boost above ~200–450 Hz.',
    listen: 'Smaller is tighter: less low-end flub when the amp breaks up, chords stay clearer.',
    look: 'Spectrum: the B − A strip dips below about 200 Hz.',
  }),
  mod({
    key: 'toneStack',
    stage: 'stack',
    label: 'Tone stack',
    part: 'C1, C8, C9, R18–R22',
    options: [
      { value: 'stock', label: 'Stock' },
      { value: 'knobs', label: 'Tone knobs' },
      { value: 'liftR19', label: 'R19 lifted' },
      { value: 'bypass', label: 'Bypassed' },
    ],
    what: 'A classic treble/bass/middle stack with fixed resistors. It scoops the mids and throws away about 17 dB. Knobs swap the resistors for pots (a bigger middle pot than the usual 25k loses less level and can reach flat); lifting R19 removes its ground return; bypassing routes around it (like 1950s amps without one).',
    listen: 'Lifted or bypassed, the amp gets much louder and breaks up at lower volume, with flat mids instead of the scoop.',
    look: 'Filters: the amp curve shows the scoop and the level loss for each version.',
  }),
  mod({
    key: 'c1',
    stage: 'stack',
    label: 'Treble cap',
    part: 'C1',
    options: [
      { value: 250, label: '250 pF' },
      { value: 500, label: '+250 pF' },
    ],
    what: 'A second 250 pF in parallel with C1 lets more upper mids and treble past the stack.',
    listen: 'Brighter and a little louder, without losing the stack’s bass.',
    look: 'Filters: the right side of the amp curve rises.',
  }),
  mod({
    key: 'tube',
    stage: 'v2a',
    label: 'Preamp tube',
    part: 'V2',
    options: [
      { value: '12AX7', label: '12AX7' },
      { value: '5751', label: '5751' },
      { value: '12AT7', label: '12AT7' },
    ],
    what: 'Both preamp stages use V2. A 5751 or 12AT7 has a lower μ, so each stage gains less and clips later.',
    listen: 'Cleaner and quieter at the same volume setting; the breakup arrives higher up the knob.',
    look: 'Circuit: the stage gains drop. Harmonics: lower bars.',
    estimate: 'Tube constants are typical values at this operating point.',
  }),
  mod({
    key: 'v2bCap',
    stage: 'v2b',
    label: 'Second-stage cathode cap',
    part: 'C10',
    options: [
      { value: '22u', label: '22 µF' },
      { value: 'none', label: 'Removed' },
    ],
    what: 'Without C10, R3 is unbypassed: V2-B gains about half as much.',
    listen: 'Tames the distortion: more headroom, a cleaner and slightly thinner sound.',
    look: 'Harmonics: lower bars. Waveform: a rounder shape.',
  }),
  mod({
    key: 'feedback',
    stage: 'feedback',
    label: 'Negative feedback',
    part: 'R7',
    options: [
      { value: 'stock', label: '2.2k' },
      { value: 'less', label: '4.7k' },
      { value: 'off', label: 'Removed' },
    ],
    what: 'R7 feeds part of the speaker signal back into V2-B’s cathode (through R23, 47 Ω). It lowers gain and distortion and tightens the bass.',
    listen: 'Less or no feedback is louder, looser and more alive, with a rawer breakup.',
    look: 'Harmonics: the 2× bar grows. Circuit: the loop gain readout drops.',
  }),
  mod({
    key: 'bias',
    stage: 'power',
    label: '6V6 bias resistor',
    part: 'R10',
    options: [
      { value: 470, label: '470 Ω' },
      { value: 560, label: '560 Ω' },
      { value: 680, label: '680 Ω' },
    ],
    what: 'The 6V6 biases itself through R10. Stock runs it hot (about 14 W on the plate); a larger resistor lowers the current.',
    listen: 'Slightly less power and an earlier, more lopsided breakup; the tube lives longer.',
    look: 'Circuit: plate dissipation. Transfer (amp): the curve flattens sooner on one side.',
    estimate: 'The 560 and 680 Ω currents are estimates, not measured.',
  }),
];

export const STAGE_NAMES: Record<StageId, string> = {
  input: 'Inputs',
  v2a: '1st triode V2-A',
  stack: 'Tone stack',
  volume: 'Volume R13',
  v2b: '2nd triode V2-B',
  feedback: 'Feedback',
  power: 'Power tube V1',
  speaker: 'Speaker',
};

export const SPEAKER_MOD = {
  what: 'The stock 6" has little bass and a forward upper-mid peak. Owners commonly fit a better 6"; a bigger cabinet adds an octave of low end.',
  listen: 'The upgraded 6" sounds fuller and less harsh; the 10" much bigger.',
  look: 'Spectrum: compare the low end and the 2–4 kHz region between branches.',
};

// Which settings differ from stock.
export function changedMods(s: ChampSettings, stock: ChampSettings) {
  return MODS.filter((m) => s[m.key] !== stock[m.key]);
}

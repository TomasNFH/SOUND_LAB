import { DEFAULT_SETTINGS, withDefaults, type ToneSettings } from './settings';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type BuiltInPreset = { name: string; about: string; settings: ToneSettings };

const flatEq = DEFAULT_SETTINGS.eq.bands;
const withBand = (index: number, patch: Partial<(typeof flatEq)[number]>) =>
  flatEq.map((b, i) => (i === index ? { ...b, ...patch } : b));

const preset = (name: string, about: string, s: DeepPartial<ToneSettings>): BuiltInPreset => ({
  name,
  about,
  settings: withDefaults(s),
});

// Starting points for the learning experiments in the plan.
export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  preset('Clean (everything flat)', 'Pedal off, EQ flat: the reference.', { pedal: { on: false } }),
  preset('EQ: 800 Hz +9 dB', 'Compare with "TS low drive": same mid lift, no clipping.', {
    pedal: { on: false },
    eq: { on: true, bands: withBand(2, { freq: 800, gain: 9, q: 1 }) },
  }),
  preset('TS low drive', 'Mostly a mid boost with a little grit.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.1, tone: 0.5, level: -6 } },
  }),
  preset('TS high drive', 'Lots of clipping: watch the harmonics bars.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.9, tone: 0.5, level: -12 } },
  }),
  preset('TS asymmetric', 'Same drive, lopsided clipping: listen for the octave.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.6, clip: 'asym', level: -10 } },
  }),
  preset('TS without clean bass path', 'Low notes and chords lose weight and get fuzzier.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.6, bassPath: false, level: -6 } },
  }),
  preset('TS into a clean amp', 'Same pedal as the next preset; only the amp volume differs.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.4, level: -6 } },
    amp: { volume: 0.2 },
  }),
  preset('TS into a crunchy amp', 'The amp is already breaking up; the TS tightens and pushes it.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.4, level: -6 } },
    amp: { volume: 0.75 },
  }),
  preset('Amp alone, cranked', 'No pedal: just the amp breaking up.', {
    pedal: { on: false },
    amp: { volume: 0.85 },
  }),
  preset('Klon, low gain', 'Clean attack with a little hair on top.', {
    pedal: { on: true, type: 'klon', klon: { gain: 0.25 } },
  }),
  preset('DS-2 Turbo', 'Hard clipping with the mid boost in front.', {
    pedal: { on: true, type: 'ds2', ds2: { dist: 0.6, turbo: true, tone: 0.45 } },
  }),
  preset('No cabinet (fizz)', 'Hear why the speaker matters as much as the amp.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.7, level: -10 } },
    amp: { volume: 0.5, cab: 'off' },
  }),
  preset('EQ before TS: scoop', 'An EQ cut before the pedal changes what distorts.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.6, level: -10 } },
    eq: { on: true, position: 'pre', bands: withBand(2, { freq: 800, gain: -9, q: 1 }) },
  }),
];

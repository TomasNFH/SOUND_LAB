import { DEFAULT_SETTINGS, STOCK_BOOST, STOCK_CHAMP, withDefaults, type ChampSettings, type ToneSettings } from './settings';

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

// A stock Champion 600 with no pedal, plus one change: load the stock one
// into one branch and a mod into the other to hear exactly that mod.
const champ = (name: string, about: string, patch: Partial<ChampSettings>, extra: DeepPartial<ToneSettings> = {}) =>
  preset(name, about, {
    ...extra,
    pedal: { on: false },
    eq: { on: false },
    amp: { on: true, model: 'champ600', volume: 0.6, cab: 'champ6', ...extra.amp, champ: { ...STOCK_CHAMP, ...patch } },
  });

// Starting points for the learning experiments in the plan.
export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  champ('Champion 600 stock', 'The amp as it ships, at 60% volume. Load a mod into the other branch to compare.', {}),
  champ('Champion: tone knobs', 'Pots instead of the fixed resistors, set to stock positions: turn them.', { toneStack: 'knobs' }),
  champ('Champion: flat tone knobs, 250k middle', 'Tone knobs with a 250k middle pot, set flat: no scoop and little level lost.', {
    toneStack: 'knobs',
    midPot: 250,
    treble: 0,
    bass: 0.2,
    middle: 1,
  }),
  champ('Champion: R19 lifted', 'The stack loses its ground return: much more gain, a darker sound.', { toneStack: 'liftR19' }),
  champ('Champion: no tone stack (5F1-style)', 'The stack switched out, like a 1950s tweed Champ: loud and raw.', { toneStack: 'bypass' }),
  champ('Champion: brighter (C1 doubled)', 'A second 250 pF across C1: more treble through the stack.', { c1: 500 }),
  champ('Champion: tighter bass (C3 1 µF)', 'Less low-end gain in the first stage: clearer when it breaks up.', { v2aCap: '1u' }),
  champ('Champion: tamed (C10 removed)', 'Less gain in the second stage: more headroom, less distortion.', { v2bCap: 'none' }),
  champ('Champion: no feedback', 'R7 removed: louder, looser, more 2nd harmonic.', { feedback: 'off' }),
  champ('Champion: cooler bias (680 Ω)', 'The 6V6 runs about 11 W instead of 14 W.', { bias: 680 }),
  champ('Champion: 12AT7 preamp tube', 'Less preamp gain: the breakup comes later on the knob.', { tube: '12AT7' }),
  champ('Champion: upgraded 6" speaker', 'Same amp, a fuller and smoother 6".', {}, { amp: { cab: 'smooth6' } }),
  preset('Clean (everything flat)', 'Pedal off, EQ flat: the reference.', { pedal: { on: false } }),
  preset('EQ: 800 Hz +9 dB', 'Compare with "TS low drive": same mid lift, no clipping.', {
    pedal: { on: false },
    eq: { on: true, bands: withBand(2, { freq: 800, gain: 9, q: 1 }) },
  }),
  // The TS gain stage is the same non-inverting 4558 circuit as the clean
  // boost: 4.7k + 47 nF to ground (instead of R2/C2) makes the 720 Hz
  // hump, a 500k pot the drive. What's missing is the TS's soft diode
  // clipping: this one clips harder, at the op-amp's supply rails.
  preset('TS from the 4558 boost', 'The clean boost rebuilt as a TS gain stage (R2 4.7k, C2 47 nF, 500k pot), EQ after it as the tone control. Compare with the real TS model.', {
    pedal: {
      on: true,
      type: 'boost',
      // Gain 95% gives about the same distortion as the TS model at 60% drive;
      // volume set to about the same loudness.
      boost: { ...STOCK_BOOST, r2: 4.7e3, c2: 47e-9, gainPot: 500e3, gainPos: 0.95, volPos: 0.46 },
    },
    eq: { on: true, position: 'post', bands: withBand(5, { freq: 3000, gain: -6 }) },
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
  preset('Tape echo after the amp', 'Repeats get darker and wobble: tape in the effects loop.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.4 } },
    amp: { volume: 0.55 },
    fxPosition: 'post',
    delay: { on: true, mode: 'tape', time: 0.42, feedback: 0.55, mix: 0.4, tone: 0.3, wow: 0.5 },
  }),
  preset('Delay before a crunchy amp', 'The amp distorts the echoes too: muddier, but more "in" the sound.', {
    pedal: { on: false },
    amp: { volume: 0.75 },
    fxPosition: 'pre',
    delay: { on: true, mode: 'digital', time: 0.35, feedback: 0.45, mix: 0.45 },
  }),
  preset('Surf spring', 'Clean amp drenched in spring reverb.', {
    pedal: { on: false },
    amp: { volume: 0.25, treble: 0.75 },
    reverb: { on: true, type: 'spring', mix: 0.6, tone: 0.7 },
  }),
  preset('EQ before TS: scoop', 'An EQ cut before the pedal changes what distorts.', {
    pedal: { on: true, type: 'ts', ts: { drive: 0.6, level: -10 } },
    eq: { on: true, position: 'pre', bands: withBand(2, { freq: 800, gain: -9, q: 1 }) },
  }),
];

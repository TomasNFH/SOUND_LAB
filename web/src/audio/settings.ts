// Everything that shapes the sound, as plain data. The UI edits it, the
// Chain applies it, and presets save it as JSON.

export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export type EqBand = { type: EqBandType; on: boolean; freq: number; gain: number; q: number };

export type EqSettings = {
  on: boolean;
  position: 'pre' | 'post'; // before or after the pedal
  bands: EqBand[];
};

// Clean boost (JRC4558): pot positions and every part value, in ohms,
// farads and volts.
export type BoostSettings = {
  gainPos: number; // gain pot rotation, 0..1 (A250k as a variable resistor)
  volPos: number; // volume pot rotation, 0..1 (A10k)
  r1: number; // input bias resistor
  c1: number; // input cap
  gainPot: number; // gain pot value
  r2: number; // gain-setting resistor to C2
  c2: number;
  c3: number; // output cap
  volPot: number; // volume pot value
  supply: 9 | 18;
};

export type TsSettings = {
  drive: number; // 0..1, pot rotation
  tone: number; // 0..1
  level: number; // dB
  clip: 'sym' | 'asym';
  hump: 340 | 720 | 1500; // Hz, from the cap in the 4.7 kΩ leg
  bassPath: boolean; // the clean "+1" path that keeps the bass undistorted
  highCut: boolean; // the 51 pF cap across the drive pot
};

export type BdSettings = { gain: number; tone: number; level: number };
export type Ds2Settings = { dist: number; tone: number; level: number; turbo: boolean };
export type KlonSettings = { gain: number; treble: number; output: number };

// The values in clean_boost_4558.cir.
export const STOCK_BOOST: BoostSettings = {
  gainPos: 0.5,
  volPos: 0.85,
  r1: 1.65e6, // two 3.3M in parallel
  c1: 0.1e-6,
  gainPot: 250e3,
  r2: 10e3,
  c2: 10e-6,
  c3: 10e-6,
  volPot: 10e3,
  supply: 9,
};

export type PedalType = 'boost' | 'ts' | 'bd' | 'ds2' | 'klon';

export type PedalSettings = {
  on: boolean;
  type: PedalType;
  boost: BoostSettings;
  ts: TsSettings;
  bd: BdSettings;
  ds2: Ds2Settings;
  klon: KlonSettings;
};

// Fender Champion 600 built from its schematic. Every field is a part of
// the real circuit; the defaults are the stock amp.
export type ChampSettings = {
  input: 'high' | 'low';
  // stock: fixed resistors · knobs: pots instead · liftR19: R19 lifted
  // (no ground return) · bypass: switched around, 5F1-style
  toneStack: 'stock' | 'knobs' | 'liftR19' | 'bypass';
  treble: number; // pot positions, used when toneStack is 'knobs'
  bass: number;
  middle: number;
  midPot: 25 | 50 | 100 | 250; // kΩ, the middle pot when toneStack is 'knobs'
  c1: 250 | 500; // pF; 500 = a second 250 pF in parallel with C1
  v2aCap: '22u' | '1u' | '470n'; // C3, first-stage cathode bypass
  v2bCap: '22u' | 'none'; // C10, second-stage cathode bypass
  feedback: 'stock' | 'less' | 'off'; // R7 2.2k / 4.7k / removed
  bias: 470 | 560 | 680; // R10, 6V6 cathode resistor in ohms
  tube: '12AX7' | '5751' | '12AT7'; // V2
};

export type AmpModel = 'champ600' | 'generic';

export const STOCK_CHAMP: ChampSettings = {
  input: 'high',
  toneStack: 'stock',
  treble: 75 / 255,
  bass: 0.3,
  middle: 0.6,
  midPot: 25,
  c1: 250,
  v2aCap: '22u',
  v2bCap: '22u',
  feedback: 'stock',
  bias: 470,
  tube: '12AX7',
};

export type AmpSettings = {
  on: boolean;
  model: AmpModel;
  champ: ChampSettings;
  volume: number; // 0..1: clean at the bottom, breaks up near the top
  bass: number;
  middle: number;
  treble: number;
  // 'champ6' (stock 6"), 'smooth6' (upgraded 6"), 'cab10', 'builtin'
  // (generic small combo), 'off', or a file name in irs/cabinets
  cab: string;
};

export type DelaySettings = {
  on: boolean;
  mode: 'digital' | 'tape';
  time: number; // seconds
  feedback: number; // 0..0.95, share of each repeat fed back
  mix: number; // wet level
  tone: number; // tape: how bright the repeats stay
  wow: number; // tape: depth of the time wobble
};

export type ReverbSettings = {
  on: boolean;
  type: string; // 'spring' | 'room' | 'hall' or a file name in irs/reverbs
  mix: number;
  tone: number;
};

export type ToneSettings = {
  eq: EqSettings;
  pedal: PedalSettings;
  amp: AmpSettings;
  fxPosition: 'pre' | 'post'; // delay and reverb before or after the amp
  delay: DelaySettings;
  reverb: ReverbSettings;
};

export const DEFAULT_SETTINGS: ToneSettings = {
  eq: {
    on: true,
    position: 'post',
    bands: [
      { type: 'lowshelf', on: true, freq: 100, gain: 0, q: 0.7 },
      { type: 'peaking', on: true, freq: 250, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 800, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 2000, gain: 0, q: 1 },
      { type: 'peaking', on: true, freq: 4500, gain: 0, q: 1 },
      { type: 'highshelf', on: true, freq: 7000, gain: 0, q: 0.7 },
    ],
  },
  pedal: {
    on: true,
    type: 'ts',
    boost: STOCK_BOOST,
    ts: { drive: 0.3, tone: 0.5, level: -9, clip: 'sym', hump: 720, bassPath: true, highCut: true },
    bd: { gain: 0.5, tone: 0.5, level: -9 },
    ds2: { dist: 0.5, tone: 0.5, level: -7, turbo: false },
    klon: { gain: 0.35, treble: 0.5, output: 3 },
  },
  amp: {
    on: true,
    model: 'champ600',
    champ: STOCK_CHAMP,
    volume: 0.4,
    bass: 0.5,
    middle: 0.5,
    treble: 0.6,
    cab: 'champ6',
  },
  fxPosition: 'post',
  delay: { on: false, mode: 'tape', time: 0.38, feedback: 0.45, mix: 0.35, tone: 0.4, wow: 0.3 },
  reverb: { on: false, type: 'spring', mix: 0.3, tone: 0.6 },
};

// Merge saved settings over the defaults, so presets saved by an older
// version still load after new controls are added.
export function withDefaults(partial: unknown): ToneSettings {
  const p = partial as { amp?: { model?: unknown; cab?: unknown } } | null;
  // Presets saved before the Champion model existed used the generic amp.
  // (A saved amp always has a cab; built-in presets only list what they change.)
  const amp = p && typeof p === 'object' ? p.amp : undefined;
  const legacy = !!amp && typeof amp === 'object' && amp.cab !== undefined && amp.model === undefined;
  const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), partial) as ToneSettings;
  if (legacy) merged.amp.model = 'generic';
  return merged;
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base;
    return base.map((b, i) => deepMerge(b, over[i]));
  }
  if (typeof base === 'object' && base !== null) {
    if (typeof over !== 'object') return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const key of Object.keys(out)) out[key] = deepMerge(out[key], (over as Record<string, unknown>)[key]);
    return out;
  }
  return typeof over === typeof base ? over : base;
}

// Two complete chains fed by the same source; the output switch picks
// which one you hear and the views compare them.
export type BranchId = 'a' | 'b';
export type Branches = Record<BranchId, ToneSettings>;

// Every block off: the source passes through untouched.
export function drySettings(): ToneSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.eq.on = false;
  s.pedal.on = false;
  s.amp.on = false;
  s.delay.on = false;
  s.reverb.on = false;
  return s;
}

export const isDry = (s: ToneSettings) => !s.eq.on && !s.pedal.on && !s.amp.on && !s.delay.on && !s.reverb.on;

// Branch A starts dry and B with the default chain, so the default A/B is
// dry vs processed.
export function defaultBranches(): Branches {
  return { a: drySettings(), b: structuredClone(DEFAULT_SETTINGS) };
}

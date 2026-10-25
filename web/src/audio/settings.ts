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

export type MidHumpSettings = {
  drive: number; // 0..1, pot rotation
  tone: number; // 0..1
  level: number; // dB
  clip: 'sym' | 'asym';
  hump: 340 | 720 | 1500; // Hz, from the cap in the 4.7 kΩ leg
  bassPath: boolean; // the clean "+1" path that keeps the bass undistorted
  highCut: boolean; // the 51 pF cap across the drive pot
  mode: 'classic' | '4558'; // classic: the simplified model above · 4558: the circuit, part by part
  c4558: Drive4558Settings;
};

// Mid-hump overdrive built from its circuit (classic op-amp design, JRC4558): pot
// positions and every part, in ohms, farads and volts.
export type Drive4558Settings = {
  drive: number; // drive pot rotation, 0..1 (A500k)
  tone: number; // 0 dark .. 1 bright
  level: number; // level pot rotation, 0..1 (A100k)
  rIn: number; // input bias
  cIn: number; // input cap
  cCouple: number; // buffer to IC1a coupling cap
  rBias: number; // IC1a + input bias
  rFixed: number; // in series with the drive pot (feedback)
  drivePot: number;
  cFb: number; // across the drive (high cut)
  rGnd: number; // feedback leg to ground: sets max gain
  cGnd: number; // ... and the hump
  diodes: 'si' | 'ge' | 'led' | 'asym' | 'none';
  r7: number; // passive lowpass after IC1a
  c6: number;
  rTone: number; // into IC1b +
  tonePot: number;
  r8: number; // tone pot wiper to C7
  c7: number;
  rToneFb: number; // IC1b feedback
  cOut: number; // output cap
  rOut: number; // in series with the level pot
  levelPot: number;
  supply: 9 | 18;
};

// Stock values (the commonly published schematic).
export const STOCK_DRIVE4558: Drive4558Settings = {
  drive: 0.5,
  tone: 0.5,
  level: 0.5,
  rIn: 1e6,
  cIn: 0.02e-6,
  cCouple: 1e-6,
  rBias: 10e3,
  rFixed: 51e3,
  drivePot: 500e3,
  cFb: 51e-12,
  rGnd: 4.7e3,
  cGnd: 0.047e-6,
  diodes: 'si',
  r7: 1e3,
  c6: 0.22e-6,
  rTone: 1e3,
  tonePot: 20e3,
  r8: 220,
  c7: 0.22e-6,
  rToneFb: 1e3,
  cOut: 1e-6,
  rOut: 100,
  levelPot: 100e3,
  supply: 9,
};

export type AmpLikeSettings = { gain: number; tone: number; level: number };
export type HardDistortionSettings = { dist: number; tone: number; level: number; turbo: boolean };
export type CleanBlendSettings = { gain: number; treble: number; output: number };

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

// Boost + EQ with two JRC4558s, from boost_eq_cortes_bypass_2x4558.cir:
// the clean boost, a passive bass/treble cut block with a bypass switch,
// a Baxandall bass/treble stage, a mid boost/cut tuned by a gyrator and
// the volume. Knob positions 0..1, then every part in ohms and farads.
export type BoostEqSettings = {
  gainPos: number; // BOOST, A250k
  lowCut: number; // CORTE G, B10k: 0 = least cut
  highCut: number; // CORTE A, B1k: 0 = least cut
  bypass: boolean; // the SPDT that skips the cut block
  bass: number; // GRAVES, B100k: 0.5 flat
  treble: number; // AGUDOS, B100k: 0.5 flat
  mid: number; // MEDIOS, B10k: 0.5 flat
  freq: number; // FREC, B100k: 0 = lowest mid frequency
  width: number; // Q, B1k: 0 = narrowest
  volPos: number; // VOLUMEN, A10k
  // U2A boost
  r1: number;
  c1: number;
  gainPot: number;
  r2: number;
  c2: number;
  // cut block
  clc: number;
  rlc: number; // fixed, in series with the low-cut pot
  lowCutPot: number;
  rhc: number; // fixed, in series with the high-cut pot
  highCutPot: number;
  chc: number;
  // U2B Baxandall
  rb1: number;
  bassPot: number;
  cb1: number;
  cb2: number;
  rb2: number;
  rb3: number;
  ct1: number;
  treblePot: number;
  ct2: number;
  rt3: number;
  // U1A mids + U1B gyrator
  ra: number;
  rb: number;
  midPot: number;
  rq: number; // fixed, in series with the Q pot
  qPot: number;
  cres: number;
  ca: number;
  rf: number; // fixed, in series with the FREC pot
  freqPot: number;
  rs: number;
  // output
  c3: number;
  volPot: number;
  supply: 9 | 18;
};

// The values in boost_eq_cortes_bypass_2x4558.cir (knobs at its .param
// line, except the boost and volume, set like the simple boost).
export const STOCK_BOOST_EQ: BoostEqSettings = {
  gainPos: 0.5,
  lowCut: 0,
  highCut: 0,
  bypass: false,
  bass: 0.5,
  treble: 0.5,
  mid: 0.5,
  freq: 0.7, // FREC = 30k
  width: 0,
  volPos: 0.85,
  r1: 1.65e6,
  c1: 0.1e-6,
  gainPot: 250e3,
  r2: 10e3,
  c2: 10e-6,
  clc: 1e-6,
  rlc: 1e3,
  lowCutPot: 10e3,
  rhc: 100,
  highCutPot: 1e3,
  chc: 47e-9,
  rb1: 10e3,
  bassPot: 100e3,
  cb1: 22e-9,
  cb2: 22e-9,
  rb2: 10e3,
  rb3: 3.3e3,
  ct1: 4.7e-9,
  treblePot: 100e3,
  ct2: 4.7e-9,
  rt3: 3.3e3,
  ra: 1.5e3,
  rb: 1.5e3,
  midPot: 10e3,
  rq: 100,
  qPot: 1e3,
  cres: 220e-9,
  ca: 47e-9,
  rf: 4.7e3,
  freqPot: 100e3,
  rs: 220,
  c3: 10e-6,
  volPot: 10e3,
  supply: 9,
};

export type PedalType = 'boost' | 'ts' | 'bd' | 'ds2' | 'klon';

export type PedalSettings = {
  on: boolean;
  type: PedalType;
  boost: BoostSettings;
  boostCircuit: 'simple' | 'eq'; // which clean boost netlist
  boostEq: BoostEqSettings;
  ts: MidHumpSettings;
  bd: AmpLikeSettings;
  ds2: HardDistortionSettings;
  klon: CleanBlendSettings;
};

// Small single-ended 6V6 combo built from its schematic. Every field is a part of
// the real circuit; the defaults are the stock amp.
export type ComboSettings = {
  input: 'high' | 'low';
  // stock: fixed resistors · knobs: pots instead · liftR19: R19 lifted
  // (no ground return) · bypass: switched around, 1950s-style
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

export const STOCK_COMBO: ComboSettings = {
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
  champ: ComboSettings;
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
    boostCircuit: 'simple',
    boostEq: STOCK_BOOST_EQ,
    ts: { drive: 0.3, tone: 0.5, level: -9, clip: 'sym', hump: 720, bassPath: true, highCut: true, mode: 'classic', c4558: STOCK_DRIVE4558 },
    bd: { gain: 0.5, tone: 0.5, level: -9 },
    ds2: { dist: 0.5, tone: 0.5, level: -7, turbo: false },
    klon: { gain: 0.35, treble: 0.5, output: 3 },
  },
  amp: {
    on: true,
    model: 'champ600',
    champ: STOCK_COMBO,
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
  // Presets saved before the 6V6 combo model existed used the generic amp.
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

// Everything that shapes the sound, as plain data. The UI edits it, the
// Chain applies it, and presets save it as JSON.

export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export type EqBand = { type: EqBandType; on: boolean; freq: number; gain: number; q: number };

export type EqSettings = {
  on: boolean;
  position: 'pre' | 'post'; // before or after the pedal
  bands: EqBand[];
};

export type BoostSettings = { gain: number }; // dB

export type TsSettings = {
  drive: number; // 0..1, pot rotation
  tone: number; // 0..1
  level: number; // dB
  clip: 'sym' | 'asym';
  hump: 340 | 720 | 1500; // Hz, from the cap in the 4.7 kΩ leg
  bassPath: boolean; // the clean "+1" path that keeps the bass undistorted
  highCut: boolean; // the 51 pF cap across the drive pot
};

export type PedalType = 'boost' | 'ts';

export type PedalSettings = {
  on: boolean;
  type: PedalType;
  boost: BoostSettings;
  ts: TsSettings;
};

export type ToneSettings = {
  eq: EqSettings;
  pedal: PedalSettings;
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
    boost: { gain: 0 },
    ts: { drive: 0.3, tone: 0.5, level: -6, clip: 'sym', hump: 720, bassPath: true, highCut: true },
  },
};

// Merge saved settings over the defaults, so presets saved by an older
// version still load after new controls are added.
export function withDefaults(partial: unknown): ToneSettings {
  return deepMerge(structuredClone(DEFAULT_SETTINGS), partial) as ToneSettings;
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

import { tsTransfer } from './blocks/TubeScreamer';
import type { PedalSettings } from './settings';
import { dbToGain } from './util';

export type Transfer = { fn: (x: number) => number; note: string };

// Input-to-output curve of the selected pedal's clipping stage, for the
// transfer view. Pure functions of the settings, no audio nodes.
export function pedalTransfer(p: PedalSettings): Transfer {
  switch (p.type) {
    case 'boost': {
      const g = dbToGain(p.boost.gain);
      return { fn: (x) => g * x, note: 'A straight line: louder or quieter, never a new shape.' };
    }
    case 'ts':
      return {
        fn: tsTransfer(p.ts),
        note: 'Clipping stage for mid frequencies (above the hump), before tone and level.',
      };
  }
}

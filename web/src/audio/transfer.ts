import { ampPreampTransfer } from './blocks/Amp';
import { bdTransfer } from './blocks/BluesDriver';
import { ds2Transfer } from './blocks/Ds2';
import { klonTransfer } from './blocks/Klon';
import { tsTransfer } from './blocks/TubeScreamer';
import type { AmpSettings, PedalSettings } from './settings';
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
    case 'bd':
      return {
        fn: bdTransfer(p.bd),
        note: 'Two gentle stages in series: the bend builds up gradually as gain rises.',
      };
    case 'ds2':
      return {
        fn: ds2Transfer(p.ds2),
        note: 'Hard clipping: straight, then flat. Close to a square wave at high distortion.',
      };
    case 'klon':
      return {
        fn: klonTransfer(p.klon),
        note: 'Clipped signal plus clean signal: the clean part keeps the line rising, so dynamics survive.',
      };
  }
}

export function ampTransfer(a: AmpSettings): Transfer {
  return {
    fn: ampPreampTransfer(a),
    note: 'Amp preamp stage at this volume. Lopsided like a tube: low volume stays near the straight part.',
  };
}

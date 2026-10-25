import { ampPreampTransfer } from './blocks/Amp';
import { boostTransfer } from './boost/boost4558';
import { boostEqTransfer } from './boost/boostEq';
import { v2bTransfer } from './champ/circuit';
import { bdTransfer } from './blocks/BluesDriver';
import { ds2Transfer } from './blocks/Ds2';
import { klonTransfer } from './blocks/Klon';
import { tsTransfer } from './blocks/TubeScreamer';
import { tsTransfer4558 } from './ts4558/ts4558';
import type { AmpSettings, PedalSettings, ToneSettings } from './settings';

export type Transfer = { fn: (x: number) => number; note: string };

// Input-to-output curve of the selected pedal's clipping stage, for the
// transfer view. Pure functions of the settings, no audio nodes.
export function pedalTransfer(p: PedalSettings): Transfer {
  switch (p.type) {
    case 'boost':
      if (p.boostCircuit === 'eq')
        return {
          fn: boostEqTransfer(p.boostEq),
          note: 'At 1 kHz: straight until one of the three 4558 stages (boost, Baxandall, mids) runs out of supply voltage.',
        };
      return {
        fn: boostTransfer(p.boost),
        note: 'A straight line (only louder) until the 4558 runs out of supply voltage, then it flattens.',
      };
    case 'ts':
      if (p.ts.mode === '4558')
        return {
          fn: tsTransfer4558(p.ts.c4558),
          note: 'IC1a output for mid frequencies: the input plus the feedback voltage, which the diodes cap. Before tone and level.',
        };
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

const BYPASSED: Transfer = { fn: (x) => x, note: 'Off: a straight line, the signal passes unchanged.' };

// What a branch's pedal or amp stage does, counting a bypassed block as a
// straight line, so branches can be drawn on top of each other.
export const branchPedalTransfer = (s: ToneSettings) => (s.pedal.on ? pedalTransfer(s.pedal) : BYPASSED);
export const branchAmpTransfer = (s: ToneSettings) => (s.amp.on ? ampTransfer(s.amp) : BYPASSED);

export function ampTransfer(a: AmpSettings): Transfer {
  if (a.model === 'champ600') {
    return {
      fn: v2bTransfer(a.champ),
      note: 'Champion V2-B, grid to plate (inverted, as a tube does). Grid conduction flattens one side early; cutoff rounds the other.',
    };
  }
  return {
    fn: ampPreampTransfer(a),
    note: 'Amp preamp stage at this volume. Lopsided like a tube: low volume stays near the straight part.',
  };
}

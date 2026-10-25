import { eqResponseDb } from './blocks/EqBlock';
import { boostResponseDb } from './boost/boost4558';
import { boostEqResponseDb } from './boost/boostEq';
import type { ToneSettings } from './settings';

// The response the chain should have, when every active block is linear
// (EQ and clean boost). Drawn over the measured difference on the
// spectrum, so you can check the filters do what the curve says.
// Returns null once a block that distorts is in the path: then there is
// no single response curve to predict.
export function expectedResponseDb(
  ctx: BaseAudioContext,
  s: ToneSettings,
  freqs: Float32Array,
): Float32Array | null {
  const pedalLinear = !s.pedal.on || s.pedal.type === 'boost';
  // Delay and reverb are linear too, but their combs and tails don't
  // compare cleanly with a smoothed spectrum.
  if (!pedalLinear || s.amp.on || s.delay.on || s.reverb.on) return null;

  const out = s.eq.on ? eqResponseDb(ctx, s.eq, freqs) : new Float32Array(freqs.length);
  if (s.pedal.on && s.pedal.type === 'boost') {
    // Small-signal: right as long as the boost isn't clipping.
    const b = s.pedal.boostCircuit === 'eq' ? boostEqResponseDb(s.pedal.boostEq, freqs) : boostResponseDb(s.pedal.boost, freqs);
    for (let i = 0; i < out.length; i++) out[i] += b[i];
  }
  return out;
}

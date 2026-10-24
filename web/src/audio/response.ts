import { eqResponseDb } from './blocks/EqBlock';
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
  if (!pedalLinear) return null;

  const out = s.eq.on ? eqResponseDb(ctx, s.eq, freqs) : new Float32Array(freqs.length);
  if (s.pedal.on && s.pedal.type === 'boost') {
    for (let i = 0; i < out.length; i++) out[i] += s.pedal.boost.gain;
  }
  return out;
}

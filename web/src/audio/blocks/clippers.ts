// Shared clipping curves, in volts. Each pedal combines these with its
// own gain and filters; comparing pedals is comparing those choices.

// Soft clipping: silicon diodes, smooth knee.
export const softClip = (v: number) => (x: number) => v * Math.tanh(x / v);

// Asymmetric soft clipping: the negative half needs more voltage to clip,
// so the wave gets lopsided and even harmonics appear.
export const asymSoftClip = (vPos: number, vNeg: number) => (x: number) =>
  x >= 0 ? vPos * Math.tanh(x / vPos) : vNeg * Math.tanh(x / vNeg);

// Hard clipping: diodes to ground after a high-gain stage. Almost linear
// up to the threshold, then flat: a squarer wave and stronger high
// harmonics. `sharpness` sets how sudden the knee is.
export const hardClip = (v: number, sharpness = 6) => (x: number) =>
  (v * (x / v)) / Math.pow(1 + Math.pow(Math.abs(x / v), sharpness), 1 / sharpness);

// Tube-like stage: the two halves of the wave clip at different levels
// (grid conduction on one side, cutoff on the other), so a tube stage
// adds even harmonics as it breaks up.
export const tubeClip = asymSoftClip(1, 0.7);

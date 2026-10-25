// Tube transfer curves for the 6V6 combo model, shared by the audio
// worklet and the transfer view.

// Straight until near the limit v, then flattening; `p` sets how sudden
// the knee is (higher = harder).
export const knee = (x: number, v: number, p: number) => x / Math.pow(1 + Math.pow(Math.abs(x / v), p), 1 / p);

// Preamp triode, input-referred: grid conduction above +vpos is fairly
// abrupt, cutoff below -vneg is gradual, and the triode's curved transfer
// adds a little 2nd harmonic even at low level. Any DC this adds is
// removed by the coupling capacitors downstream.
export function triode(x: number, vpos: number, vneg: number) {
  const u = x >= 0 ? knee(x, vpos, 3) : vneg * Math.tanh(x / vneg);
  return u + (0.15 * u * u) / (vpos + vneg);
}

// Single-ended 6V6, grid-referred: one tube handles both halves of the
// wave on a curved (roughly square-law) characteristic, so its distortion
// is mostly 2nd harmonic, growing with level until the grid conducts at
// +vpos or the tube cuts off at -vneg.
export function power6v6(x: number, vpos: number, vneg: number) {
  const u = x >= 0 ? knee(x, vpos, 4) : knee(x, vneg, 4);
  return u + (0.11 * u * u) / ((vpos + vneg) / 2);
}

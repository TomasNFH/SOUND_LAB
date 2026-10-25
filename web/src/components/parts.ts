// Part values for the circuit panels: formatting, and snapping a knob to
// values you can buy.

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

// Snap to the nearest standard (E12) value, so turning a knob picks parts
// you can buy. The stock value is kept even when it isn't E12 (like two
// 3.3M in parallel = 1.65M).
export function snap(v: number, stock: number) {
  if (Math.abs(v - stock) / stock < 0.03) return stock;
  const decade = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / decade;
  let best = E12[0];
  for (const e of [...E12, 10]) if (Math.abs(Math.log(m / e)) < Math.abs(Math.log(m / best))) best = e;
  return best * decade;
}

export const ohms = (v: number) =>
  v >= 1e6 ? `${+(v / 1e6).toFixed(2)} MΩ` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)} kΩ` : `${Math.round(v)} Ω`;
export const farads = (v: number) =>
  v >= 1e-6 ? `${+(v * 1e6).toFixed(2)} µF` : v >= 1e-9 ? `${+(v * 1e9).toFixed(1)} nF` : `${Math.round(v * 1e12)} pF`;
export const hz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(1)} kHz` : f >= 10 ? `${Math.round(f)} Hz` : `${f.toFixed(1)} Hz`);
export const potLabel = (r: number) => ohms(r).replace(' kΩ', 'k').replace(' MΩ', 'M');

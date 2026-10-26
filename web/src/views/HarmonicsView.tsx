import { useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { COLORS, useCanvasLoop } from './canvas';

type Props = { engine: AudioEngine };

const HARMONICS = 10;
const DB_FLOOR = -90;

export type HarmonicLevels = { sigA: number[]; sigB: number[]; thd: number };

// Level of each harmonic (1× to 10× the test tone) relative to the
// fundamental, read from the analysers. Branch A (grey) vs branch B
// (colour): with A dry, bars that only exist in B are new frequencies made
// by the distortion.
export function measureHarmonics(engine: AudioEngine, sigA: Float32Array, sigB: Float32Array): HarmonicLevels {
  engine.analyserA.getFloatFrequencyData(sigA);
  engine.analyserB.getFloatFrequencyData(sigB);
  const binHz = engine.ctx.sampleRate / engine.analyserA.fftSize;
  const f0 = engine.sineFrequency;
  const nyquist = engine.ctx.sampleRate / 2;

  const peak = (data: Float32Array, f: number) => {
    const c = Math.round(f / binHz);
    let max = -Infinity;
    for (let b = Math.max(0, c - 3); b <= Math.min(data.length - 1, c + 3); b++) max = Math.max(max, data[b]);
    return max;
  };

  const levels = (data: Float32Array) => {
    const fund = peak(data, f0);
    const out: number[] = [];
    for (let k = 1; k <= HARMONICS; k++) {
      out.push(k * f0 < nyquist ? Math.max(DB_FLOOR, peak(data, k * f0) - fund) : DB_FLOOR);
    }
    return out;
  };

  const w = levels(sigB);
  let sum = 0;
  for (let k = 1; k < w.length; k++) sum += Math.pow(10, w[k] / 10);
  return { sigA: levels(sigA), sigB: w, thd: Math.sqrt(sum) * 100 };
}

export function HarmonicsView({ engine }: Props) {
  const bufs = useRef<{ sigA: Float32Array; sigB: Float32Array } | null>(null);
  const smooth = useRef<HarmonicLevels | null>(null);

  const canvasRef = useCanvasLoop((g, w, h) => {
    const bins = engine.analyserA.frequencyBinCount;
    if (!bufs.current || bufs.current.sigA.length !== bins) {
      bufs.current = { sigA: new Float32Array(bins), sigB: new Float32Array(bins) };
    }

    if (engine.sourceKind !== 'sine' || !engine.getState().playing) {
      g.fillStyle = COLORS.label;
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Choose Sine as the source and press Play', w / 2, h / 2);
      g.textAlign = 'start';
      smooth.current = null;
      return;
    }

    const m = measureHarmonics(engine, bufs.current.sigA, bufs.current.sigB);
    // Light smoothing so bars are readable.
    if (smooth.current) {
      const s = smooth.current;
      for (let k = 0; k < HARMONICS; k++) {
        s.sigA[k] += 0.2 * (m.sigA[k] - s.sigA[k]);
        s.sigB[k] += 0.2 * (m.sigB[k] - s.sigB[k]);
      }
      s.thd += 0.2 * (m.thd - s.thd);
    } else smooth.current = m;
    const { sigA, sigB, thd } = smooth.current;

    const top = 18;
    const bottom = h - 22;
    const yOf = (db: number) => top + (db / DB_FLOOR) * (bottom - top);
    g.font = '10px system-ui, sans-serif';
    for (let db = 0; db >= DB_FLOOR; db -= 15) {
      const y = Math.round(yOf(db)) + 0.5;
      g.strokeStyle = db === 0 ? COLORS.gridStrong : COLORS.grid;
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(w, y);
      g.stroke();
      g.fillStyle = COLORS.label;
      g.fillText(`${db}`, 4, y + 3);
    }

    const slot = (w - 34) / HARMONICS;
    const barW = Math.min(22, slot * 0.32);
    for (let k = 0; k < HARMONICS; k++) {
      const x = 34 + k * slot + slot / 2;
      g.fillStyle = COLORS.dry;
      g.fillRect(x - barW - 1, yOf(sigA[k]), barW, bottom - yOf(sigA[k]));
      g.fillStyle = k === 0 ? COLORS.wet : k % 2 === 1 ? COLORS.diff : COLORS.wet;
      g.fillRect(x + 1, yOf(sigB[k]), barW, bottom - yOf(sigB[k]));
      g.fillStyle = COLORS.label;
      g.textAlign = 'center';
      g.fillText(`${k + 1}×`, x, h - 8);
      g.textAlign = 'start';
    }

    g.fillStyle = COLORS.label;
    g.fillText(`${Math.round(engine.sineFrequency)} Hz test tone · THD ${thd.toFixed(1)}%`, 34, 12);
  });

  return (
    <>
      <canvas ref={canvasRef} className="view-canvas tall" />
      <p className="muted small">
        Grey is branch A, colour is branch B. Amber bars are even harmonics (2×, 4×…): the octave colour that
        asymmetric clipping adds. Symmetric clipping makes odd ones (3×, 5×…).
      </p>
    </>
  );
}

import { useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { COLORS, dbToY, drawFreqGrid, freqToX, logFrequencies, useCanvasLoop, xToFreq } from './canvas';

type Props = {
  engine: AudioEngine;
  matchLevels: boolean;
  showDiff: boolean;
  // Frequency range to shade, e.g. the EQ band being edited.
  highlight?: { lo: number; hi: number } | null;
  // Predicted after-minus-before curve, drawn dashed in the difference strip.
  expected?: ((freqs: Float32Array) => Float32Array | null) | null;
};

const DB_MIN = -110;
const DB_MAX = -10;
const DIFF_RANGE = 24; // ± dB shown in the difference strip
const SILENCE_DB = -100;

// Before/after spectrum on a log frequency axis, same dB scale for both,
// with an optional "after minus before" strip underneath.
export function SpectrumView({ engine, matchLevels, showDiff, highlight, expected }: Props) {
  const raw = useRef<{ dry: Float32Array; wet: Float32Array } | null>(null);

  const canvasRef = useCanvasLoop((g, w, h) => {
    const bins = engine.dryAnalyser.frequencyBinCount;
    if (!raw.current || raw.current.dry.length !== bins) {
      raw.current = { dry: new Float32Array(bins), wet: new Float32Array(bins) };
    }
    const { dry, wet } = raw.current;
    engine.dryAnalyser.getFloatFrequencyData(dry);
    engine.wetAnalyser.getFloatFrequencyData(wet);
    const wetOffset = matchLevels ? 20 * Math.log10(engine.getMatchGain()) : 0;

    const specH = showDiff ? Math.round(h * 0.7) : h;
    const diffTop = specH + 8;
    const diffH = h - diffTop;

    if (highlight) {
      const x0 = freqToX(highlight.lo, w);
      const x1 = freqToX(highlight.hi, w);
      g.fillStyle = COLORS.highlight;
      g.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    }

    g.save();
    g.beginPath();
    g.rect(0, 0, w, specH);
    g.clip();
    drawFreqGrid(g, w, specH, DB_MIN, DB_MAX, 20);
    g.restore();

    const columns = Math.max(2, Math.floor(w));
    const binHz = engine.ctx.sampleRate / engine.dryAnalyser.fftSize;
    const dryCurve = toColumns(dry, columns, w, binHz);
    const wetCurve = toColumns(wet, columns, w, binHz);
    for (let i = 0; i < columns; i++) wetCurve[i] += wetOffset;

    const plot = (curve: Float32Array, color: string, lineWidth: number) => {
      g.strokeStyle = color;
      g.lineWidth = lineWidth;
      g.beginPath();
      for (let i = 0; i < columns; i++) {
        const y = dbToY(Math.max(DB_MIN, curve[i]), specH, DB_MIN, DB_MAX);
        if (i === 0) g.moveTo(i, y);
        else g.lineTo(i, y);
      }
      g.stroke();
    };
    plot(dryCurve, COLORS.dry, 1.5);
    plot(wetCurve, COLORS.wet, 2);

    if (!showDiff || diffH < 20) return;

    // Difference strip: positive = processed is louder at that frequency.
    const mid = diffTop + diffH / 2;
    g.strokeStyle = COLORS.gridStrong;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, Math.round(mid) + 0.5);
    g.lineTo(w, Math.round(mid) + 0.5);
    g.stroke();
    g.fillStyle = COLORS.label;
    g.font = '10px system-ui, sans-serif';
    g.fillText(`after − before, ±${DIFF_RANGE} dB`, 4, diffTop + 10);

    const predicted = expected?.(logFrequencies(columns));
    if (predicted) {
      // The level-matching offset applies to the measurement, so apply it
      // to the prediction as well.
      g.strokeStyle = COLORS.accent2;
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.beginPath();
      for (let i = 0; i < columns; i++) {
        const d = Math.max(-DIFF_RANGE, Math.min(DIFF_RANGE, predicted[i] + wetOffset));
        const y = mid - (d / DIFF_RANGE) * (diffH / 2);
        if (i === 0) g.moveTo(i, y);
        else g.lineTo(i, y);
      }
      g.stroke();
      g.setLineDash([]);
    }

    g.strokeStyle = COLORS.diff;
    g.lineWidth = 1.5;
    g.beginPath();
    let pen = false;
    for (let i = 0; i < columns; i++) {
      if (dryCurve[i] < SILENCE_DB && wetCurve[i] < SILENCE_DB) {
        pen = false;
        continue;
      }
      const d = Math.max(-DIFF_RANGE, Math.min(DIFF_RANGE, wetCurve[i] - dryCurve[i]));
      const y = mid - (d / DIFF_RANGE) * (diffH / 2);
      if (!pen) g.moveTo(i, y);
      else g.lineTo(i, y);
      pen = true;
    }
    g.stroke();
  });

  return <canvas ref={canvasRef} className="view-canvas tall" />;
}

// Resample analyser bins (linear in Hz) to one value per pixel column on
// the log axis, then smooth to 1/6 octave so the curve is readable.
function toColumns(bins: Float32Array, columns: number, width: number, binHz: number) {
  const power = new Float32Array(columns);
  for (let i = 0; i < columns; i++) {
    const f0 = xToFreq(i - 0.5, width);
    const f1 = xToFreq(i + 0.5, width);
    const b0 = f0 / binHz;
    const b1 = f1 / binHz;
    let p: number;
    if (Math.floor(b1) - Math.ceil(b0) >= 1) {
      // Several bins in this column: take the strongest.
      let max = -Infinity;
      for (let b = Math.ceil(b0); b <= Math.floor(b1) && b < bins.length; b++) max = Math.max(max, bins[b]);
      p = max;
    } else {
      // Less than a bin per column: interpolate.
      const b = Math.min(bins.length - 2, Math.max(0, (b0 + b1) / 2));
      const k = Math.floor(b);
      const t = b - k;
      p = bins[k] * (1 - t) + bins[k + 1] * t;
    }
    power[i] = Math.pow(10, (Number.isFinite(p) ? p : -200) / 10);
  }

  const out = new Float32Array(columns);
  const half = Math.max(1, Math.round(columns / 10 / 12)); // ±1/12 octave
  for (let i = 0; i < columns; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(columns - 1, i + half); j++) {
      sum += power[j];
      n++;
    }
    out[i] = 10 * Math.log10(sum / n + 1e-20);
  }
  return out;
}

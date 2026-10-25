import { useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { COLORS, useCanvasLoop } from './canvas';

type Props = {
  engine: AudioEngine;
  windowMs: number;
  matchLevels: boolean;
};

// Branch A (grey) and branch B (colour) on the same vertical scale, both
// starting at the same rising zero crossing of A so a few cycles of a
// note stand still on screen.
export function WaveformView({ engine, windowMs, matchLevels }: Props) {
  const buffers = useRef<{ sigA: Float32Array; sigB: Float32Array } | null>(null);
  const scale = useRef(0.1);

  const canvasRef = useCanvasLoop((g, w, h) => {
    const size = engine.analyserA.fftSize;
    if (!buffers.current || buffers.current.sigA.length !== size) {
      buffers.current = { sigA: new Float32Array(size), sigB: new Float32Array(size) };
    }
    const { sigA, sigB } = buffers.current;
    engine.analyserA.getFloatTimeDomainData(sigA);
    engine.analyserB.getFloatTimeDomainData(sigB);
    const gainB = matchLevels ? engine.getMatchGain() : 1;

    const count = Math.min(size, Math.round((windowMs / 1000) * engine.ctx.sampleRate));
    const start = findTrigger(sigA, size - count);

    // Shared scale: follows the larger of the two peaks, decays slowly so
    // the picture doesn't pump.
    let peak = 1e-3;
    for (let i = start; i < start + count; i++) {
      peak = Math.max(peak, Math.abs(sigA[i]), Math.abs(sigB[i] * gainB));
    }
    scale.current = peak > scale.current ? peak : scale.current * 0.98 + peak * 0.02;
    const yScale = (h / 2 - 6) / (scale.current * 1.1);
    const mid = h / 2;

    g.strokeStyle = COLORS.gridStrong;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, Math.round(mid) + 0.5);
    g.lineTo(w, Math.round(mid) + 0.5);
    g.stroke();

    // Time grid every 5 ms.
    g.font = '10px system-ui, sans-serif';
    for (let ms = 5; ms < windowMs; ms += 5) {
      const x = Math.round((ms / windowMs) * w) + 0.5;
      g.strokeStyle = COLORS.grid;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.fillStyle = COLORS.label;
      g.fillText(`${ms} ms`, x + 3, h - 4);
    }

    const trace = (data: Float32Array, gain: number, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * w;
        const y = mid - data[start + i] * gain * yScale;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    trace(sigA, 1, COLORS.dry, 1.5);
    trace(sigB, gainB, COLORS.wet, 2);

    g.fillStyle = COLORS.label;
    g.fillText(`scale ±${(scale.current * 1.1).toFixed(3)}`, 4, 12);
  });

  return <canvas ref={canvasRef} className="view-canvas" />;
}

// First rising zero crossing that follows a clearly negative stretch, so
// noise around zero doesn't move the trigger point.
function findTrigger(data: Float32Array, maxStart: number) {
  let peak = 0;
  for (let i = 0; i < maxStart; i++) peak = Math.max(peak, Math.abs(data[i]));
  const threshold = peak * 0.1;
  let armed = false;
  for (let i = 1; i < maxStart; i++) {
    if (data[i] < -threshold) armed = true;
    else if (armed && data[i - 1] < 0 && data[i] >= 0) return i;
  }
  return 0;
}

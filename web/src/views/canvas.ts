import { useEffect, useRef } from 'react';

export type DrawFn = (g: CanvasRenderingContext2D, width: number, height: number) => void;

// Runs `draw` every animation frame on a canvas sized to its CSS box at
// device pixel ratio. `draw` always sees the latest props via a ref, so
// the loop is never restarted by re-renders.
export function useCanvasLoop(draw: DrawFn, animate = true) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (!animate) render();
    });
    ro.observe(canvas);

    let raf = 0;
    const render = () => {
      if (width > 0 && height > 0) {
        g.clearRect(0, 0, width, height);
        drawRef.current(g, width, height);
      }
    };
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    if (animate) raf = requestAnimationFrame(loop);
    else render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animate]);

  // Static views redraw when their inputs change.
  useEffect(() => {
    if (animate) return;
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const rect = canvas.getBoundingClientRect();
    g.clearRect(0, 0, rect.width, rect.height);
    drawRef.current(g, rect.width, rect.height);
  });

  return canvasRef;
}

export const COLORS = {
  grid: 'rgba(255,255,255,0.07)',
  gridStrong: 'rgba(255,255,255,0.16)',
  label: '#7d808a',
  dry: '#8d909a',
  wet: '#6fcf6f',
  diff: '#f0a848',
  accent2: '#6fa8ff',
  highlight: 'rgba(111,207,111,0.10)',
};

export const LOG_MIN_HZ = 20;
export const LOG_MAX_HZ = 20000;

// Log-frequency axis mapping shared by spectrum and response views.
export const freqToX = (f: number, width: number) =>
  (Math.log10(f / LOG_MIN_HZ) / Math.log10(LOG_MAX_HZ / LOG_MIN_HZ)) * width;
export const xToFreq = (x: number, width: number) =>
  LOG_MIN_HZ * Math.pow(LOG_MAX_HZ / LOG_MIN_HZ, x / width);

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const fmtHz = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

export function drawFreqGrid(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  dbMin: number,
  dbMax: number,
  dbStep: number,
) {
  g.font = '10px system-ui, sans-serif';
  g.lineWidth = 1;
  for (const f of FREQ_TICKS) {
    const x = Math.round(freqToX(f, w)) + 0.5;
    g.strokeStyle = COLORS.grid;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    g.fillStyle = COLORS.label;
    g.fillText(fmtHz(f), Math.min(x + 3, w - 22), h - 4);
  }
  for (let db = Math.ceil(dbMin / dbStep) * dbStep; db <= dbMax; db += dbStep) {
    const y = Math.round(dbToY(db, h, dbMin, dbMax)) + 0.5;
    g.strokeStyle = db === 0 ? COLORS.gridStrong : COLORS.grid;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
    g.fillStyle = COLORS.label;
    g.fillText(`${db}`, 3, y - 3);
  }
}

export const dbToY = (db: number, h: number, dbMin: number, dbMax: number) =>
  h - ((db - dbMin) / (dbMax - dbMin)) * h;

// Frequencies spaced evenly on the log axis, one per pixel column.
export function logFrequencies(count: number) {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = xToFreq(i, count - 1);
  return out;
}

import { COLORS, dbToY, drawFreqGrid, freqToX, logFrequencies, useCanvasLoop } from './canvas';

type Props = {
  current: (freqs: Float32Array) => Float32Array;
  stock: (freqs: Float32Array) => Float32Array;
  marks: [number, string][]; // corner frequencies to label
  dbMin: number;
  dbMax: number;
};

// A circuit's own frequency response (small signal, before clipping): the
// current values in colour, the stock values as a dashed ghost, and a
// marker at each corner frequency that falls in the audio band.
export function CompareResponseView({ current, stock, marks, dbMin, dbMax }: Props) {
  const canvasRef = useCanvasLoop((g, w, h) => {
    drawFreqGrid(g, w, h, dbMin, dbMax, 6);
    const columns = Math.max(2, Math.floor(w));
    const freqs = logFrequencies(columns);
    const plot = (curve: Float32Array, color: string, width: number, dash: number[]) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash);
      g.beginPath();
      for (let i = 0; i < columns; i++) {
        const y = dbToY(Math.max(dbMin, Math.min(dbMax, curve[i])), h, dbMin, dbMax);
        if (i === 0) g.moveTo(i, y);
        else g.lineTo(i, y);
      }
      g.stroke();
      g.setLineDash([]);
    };
    plot(stock(freqs), COLORS.dry, 1.5, [5, 4]);
    plot(current(freqs), COLORS.wet, 2.5, []);

    g.font = '10px system-ui, sans-serif';
    let labelY = 12;
    for (const [f, label] of marks) {
      if (f < 20 || f > 20000) continue;
      const x = Math.round(freqToX(f, w)) + 0.5;
      g.strokeStyle = COLORS.diff;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = COLORS.diff;
      g.fillText(label, Math.min(x + 3, w - 40), labelY);
      labelY += 12;
    }
  }, false);

  return <canvas ref={canvasRef} className="view-canvas boost-canvas" />;
}

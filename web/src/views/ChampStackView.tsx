import { interstageResponseDb } from '../audio/champ/circuit';
import type { Branches } from '../audio/settings';
import { COLORS, dbToY, drawFreqGrid, logFrequencies, useCanvasLoop } from './canvas';

type Props = { branches: Branches };

const DB_MIN = -36;
const DB_MAX = 6;

const usesChamp = (b: Branches[keyof Branches]) => b.amp.on && b.amp.model === 'champ600';

// The 6V6 combo's tone stack, from V2-A's plate to V2-B's grid with the
// volume full up, in absolute dB: the scoop and the level the stack throws
// away. Branch A grey, branch B colour.
export function ChampStackView({ branches }: Props) {
  const canvasRef = useCanvasLoop((g, w, h) => {
    drawFreqGrid(g, w, h, DB_MIN, DB_MAX, 6);
    const columns = Math.max(2, Math.floor(w));
    const freqs = logFrequencies(columns);
    const plot = (curve: Float32Array, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let i = 0; i < columns; i++) {
        const y = dbToY(Math.max(DB_MIN, Math.min(DB_MAX, curve[i])), h, DB_MIN, DB_MAX);
        if (i === 0) g.moveTo(i, y);
        else g.lineTo(i, y);
      }
      g.stroke();
    };
    if (usesChamp(branches.a)) plot(interstageResponseDb(branches.a.amp.champ, 1, freqs), COLORS.dry, 2);
    if (usesChamp(branches.b)) plot(interstageResponseDb(branches.b.amp.champ, 1, freqs), COLORS.wet, 2.5);
  }, false);

  if (!usesChamp(branches.a) && !usesChamp(branches.b)) return null;
  return (
    <>
      <p className="muted small view-caption">Tone stack (V2-A plate → V2-B grid, volume full up)</p>
      <canvas ref={canvasRef} className="view-canvas" />
      <p className="muted small">
        <i className="swatch dry" /> A <i className="swatch wet" /> B. 0 dB would be no loss at all: the stock
        stack sits around −18 dB with its scoop near 500 Hz.
      </p>
    </>
  );
}

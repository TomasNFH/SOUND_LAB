import { toneStackSpecs } from '../audio/blocks/Amp';
import { eqResponseDb, filterResponseDb } from '../audio/blocks/EqBlock';
import type { ToneSettings } from '../audio/settings';
import { COLORS, dbToY, drawFreqGrid, logFrequencies, useCanvasLoop } from './canvas';

type Props = {
  ctx: BaseAudioContext;
  settings: ToneSettings;
  activeBand: number | null;
};

const DB_RANGE = 18;

// What the filters do on their own: each EQ band (thin), the EQ total
// (thick), and the amp's tone stack, from getFrequencyResponse.
export function ResponseView({ ctx, settings, activeBand }: Props) {
  const canvasRef = useCanvasLoop((g, w, h) => {
    drawFreqGrid(g, w, h, -DB_RANGE, DB_RANGE, 6);
    const columns = Math.max(2, Math.floor(w));
    const freqs = logFrequencies(columns);
    const eq = settings.eq;

    const plot = (curve: Float32Array, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let i = 0; i < columns; i++) {
        const y = dbToY(Math.max(-DB_RANGE, Math.min(DB_RANGE, curve[i])), h, -DB_RANGE, DB_RANGE);
        if (i === 0) g.moveTo(i, y);
        else g.lineTo(i, y);
      }
      g.stroke();
    };

    eq.bands.forEach((band, i) => {
      if (!band.on) return;
      plot(eqResponseDb(ctx, eq, freqs, i), i === activeBand ? COLORS.diff : 'rgba(111,168,255,0.45)', i === activeBand ? 2 : 1);
    });
    const genericStack = settings.amp.on && settings.amp.model === 'generic';
    if (genericStack) {
      g.setLineDash([6, 4]);
      plot(filterResponseDb(ctx, toneStackSpecs(settings.amp), freqs), COLORS.diff, 2);
      g.setLineDash([]);
    }
    plot(eqResponseDb(ctx, eq, freqs), eq.on ? COLORS.wet : COLORS.dry, 2.5);

    g.font = '10px system-ui, sans-serif';
    g.fillStyle = eq.on ? COLORS.wet : COLORS.label;
    g.fillText(eq.on ? 'EQ total' : 'EQ total (EQ is off)', w - 130, 12);
    if (genericStack) {
      g.fillStyle = COLORS.diff;
      g.fillText('Amp tone stack (dashed)', w - 130, 26);
    }
  }, false);

  return <canvas ref={canvasRef} className="view-canvas" />;
}

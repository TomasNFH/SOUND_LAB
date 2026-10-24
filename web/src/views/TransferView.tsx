import type { Transfer } from '../audio/transfer';
import { COLORS, useCanvasLoop } from './canvas';

type Props = { transfer: Transfer; inputRange?: number };

// Input level against output level. A straight line means the stage only
// changes loudness; the bend is the clipping, and its shape (gentle or
// sharp, same on both sides or not) decides which harmonics appear.
export function TransferView({ transfer, inputRange = 0.5 }: Props) {
  const canvasRef = useCanvasLoop((g, w, h) => {
    const pad = 28;
    const size = Math.min(w, h) - pad * 2;
    const ox = w / 2;
    const oy = h / 2;
    const steps = 400;

    let outRange = 1e-6;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * 2 * inputRange - inputRange;
      outRange = Math.max(outRange, Math.abs(transfer.fn(x)));
    }
    outRange *= 1.1;
    const sx = size / 2 / inputRange;
    const sy = size / 2 / outRange;

    g.lineWidth = 1;
    g.strokeStyle = COLORS.gridStrong;
    g.beginPath();
    g.moveTo(ox - size / 2, oy);
    g.lineTo(ox + size / 2, oy);
    g.moveTo(ox, oy - size / 2);
    g.lineTo(ox, oy + size / 2);
    g.stroke();
    g.strokeStyle = COLORS.grid;
    g.strokeRect(ox - size / 2, oy - size / 2, size, size);

    g.fillStyle = COLORS.label;
    g.font = '10px system-ui, sans-serif';
    g.fillText(`in ±${inputRange} V`, ox + size / 2 - 52, oy + 12);
    g.fillText(`out ±${outRange.toFixed(2)} V`, ox + 4, oy - size / 2 + 10);

    g.strokeStyle = COLORS.wet;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * 2 * inputRange - inputRange;
      const px = ox + x * sx;
      const py = oy - transfer.fn(x) * sy;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }, false);

  return (
    <>
      <canvas ref={canvasRef} className="view-canvas tall" />
      <p className="muted small">{transfer.note}</p>
    </>
  );
}

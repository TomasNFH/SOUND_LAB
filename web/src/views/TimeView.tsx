import { tapeLoopCutoff } from '../audio/blocks/Delay';
import type { AudioEngine } from '../audio/AudioEngine';
import type { ToneSettings } from '../audio/settings';
import { COLORS, useCanvasLoop } from './canvas';

type Props = { engine: AudioEngine; settings: ToneSettings };

const WINDOW_S = 3;

// Top: the delay's repeats as decaying spikes. For tape, each repeat has
// been through the loop filter once more, so its brightness (bar colour)
// and its top end (label) fall with every pass.
// Bottom: the reverb's impulse response, a fading waveform.
export function TimeView({ engine, settings }: Props) {
  const canvasRef = useCanvasLoop((g, w, h) => {
    const half = h / 2;
    const xOf = (t: number) => 30 + (t / WINDOW_S) * (w - 40);
    g.font = '10px system-ui, sans-serif';

    // Time grid shared by both halves.
    for (let t = 0; t <= WINDOW_S; t += 0.5) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = COLORS.grid;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.fillStyle = COLORS.label;
      g.fillText(`${t} s`, x + 3, h - 4);
    }
    g.strokeStyle = COLORS.gridStrong;
    g.beginPath();
    g.moveTo(0, Math.round(half) + 0.5);
    g.lineTo(w, Math.round(half) + 0.5);
    g.stroke();

    // Delay repeats.
    const d = settings.delay;
    const top = 34; // below the two caption lines
    const base = half - 10;
    g.fillStyle = COLORS.label;
    g.fillText(d.on ? `Delay · ${d.mode}` : 'Delay (off)', 4, 12);
    const tape = d.mode === 'tape';
    // The dry hit, then each repeat: level = mix * feedback^(k-1).
    const spike = (t: number, level: number, color: string) => {
      const x = xOf(t);
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x, base - level * (base - top));
      g.stroke();
    };
    spike(0, 1, COLORS.dry);
    if (d.on) {
      let level = d.mix;
      for (let k = 1; d.time * k <= WINDOW_S && level > 0.005; k++) {
        // Tape: the loop lowpass applies k-1 more times; show how much
        // top end is left as the colour fading from green to dark.
        const bright = tape ? Math.pow(Math.min(1, tapeLoopCutoff(d.tone) / 8000), k - 1) : 1;
        spike(d.time * k, level, `rgba(111,207,111,${0.25 + 0.75 * bright})`);
        level *= d.feedback;
      }
      if (tape) {
        g.fillStyle = COLORS.label;
        g.fillText(`each pass: lowpass at ${(tapeLoopCutoff(d.tone) / 1000).toFixed(1)} kHz`, 4, 26);
      }
    }

    // Reverb impulse response, as an envelope (peak per pixel column).
    const r = settings.reverb;
    const ir = engine.chain.reverb.impulseResponse;
    g.fillStyle = COLORS.label;
    g.fillText(r.on ? 'Reverb impulse response' : 'Reverb (off)', 4, half + 14);
    if (ir) {
      const data = ir.getChannelData(0);
      const mid = half + (h - half) / 2;
      const amp = (h - half) / 2 - 14;
      let peak = 1e-9;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      g.strokeStyle = r.on ? COLORS.accent2 : COLORS.dry;
      g.lineWidth = 1;
      g.beginPath();
      const x0 = xOf(0);
      const x1 = xOf(Math.min(WINDOW_S, ir.duration));
      for (let x = Math.floor(x0); x < x1; x++) {
        const i0 = Math.floor(((x - x0) / (xOf(WINDOW_S) - x0)) * WINDOW_S * ir.sampleRate);
        const i1 = Math.min(data.length, Math.floor(((x + 1 - x0) / (xOf(WINDOW_S) - x0)) * WINDOW_S * ir.sampleRate));
        let hi = 0;
        let lo = 0;
        for (let i = i0; i < i1; i++) {
          hi = Math.max(hi, data[i]);
          lo = Math.min(lo, data[i]);
        }
        g.moveTo(x + 0.5, mid - (hi / peak) * amp);
        g.lineTo(x + 0.5, mid - (lo / peak) * amp);
      }
      g.stroke();
    }
  });

  return <canvas ref={canvasRef} className="view-canvas tall" />;
}

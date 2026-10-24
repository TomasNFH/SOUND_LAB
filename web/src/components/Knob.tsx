import { useRef } from 'react';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  // 'log' spreads the range evenly in ratios (for Hz, Q, times).
  scale?: 'lin' | 'log';
  defaultValue?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onActive?: (active: boolean) => void;
  size?: 'normal' | 'small';
};

const SWEEP = 270; // degrees of rotation from min to max
const KEY_STEPS = 100; // arrow-key steps across the whole range

// Drag up/down to turn (shift for fine), double-click to reset,
// arrow keys when focused.
export function Knob({
  label,
  value,
  min,
  max,
  step,
  scale = 'lin',
  defaultValue,
  format,
  onChange,
  onActive,
  size = 'normal',
}: Props) {
  const drag = useRef<{ y: number; frac: number } | null>(null);

  const toFrac = (v: number) =>
    scale === 'log' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  const fromFrac = (f: number) => {
    const t = Math.min(1, Math.max(0, f));
    let v = scale === 'log' ? min * Math.pow(max / min, t) : min + t * (max - min);
    if (step) v = Math.round(v / step) * step;
    else if (scale === 'log') v = roundSig(v, 3);
    return Math.min(max, Math.max(min, v));
  };

  const frac = toFrac(value);
  const angle = -SWEEP / 2 + frac * SWEEP;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, frac };
    onActive?.(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pixelsForFullRange = e.shiftKey ? 800 : 200;
    onChange(fromFrac(drag.current.frac + (drag.current.y - e.clientY) / pixelsForFullRange));
  };
  const onPointerUp = () => {
    drag.current = null;
    onActive?.(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = step && scale === 'lin' ? step / (max - min) : 1 / KEY_STEPS;
    let dir: number;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') dir = -1;
    else return;
    let next = fromFrac(frac + dir * delta);
    // Make sure every press moves the value, even after rounding.
    if (next === value && step) next = Math.min(max, Math.max(min, value + dir * step));
    onChange(next);
    e.preventDefault();
  };

  return (
    <div className={`knob ${size}`}>
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format ? format(value) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onFocus={() => onActive?.(true)}
        onBlur={() => onActive?.(false)}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onKeyDown={onKeyDown}
      >
        <div className="knob-pointer" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <div className="knob-value">{format ? format(value) : value.toFixed(1)}</div>
      <div className="knob-label">{label}</div>
    </div>
  );
}

function roundSig(v: number, digits: number) {
  if (v === 0) return 0;
  const p = Math.pow(10, digits - Math.ceil(Math.log10(Math.abs(v))));
  return Math.round(v * p) / p;
}

export const fmt = {
  db: (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`,
  hz: (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${Math.round(f)} Hz`),
  q: (q: number) => q.toFixed(2),
  pct: (v: number) => `${Math.round(v * 100)}%`,
  ms: (s: number) => `${Math.round(s * 1000)} ms`,
  num: (v: number) => v.toFixed(1),
};

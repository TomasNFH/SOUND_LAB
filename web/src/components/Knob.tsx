import { useRef } from 'react';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
};

const SWEEP = 270; // degrees of rotation from min to max

// Drag up/down to turn (shift for fine), double-click to reset,
// arrow keys when focused.
export function Knob({ label, value, min, max, step = 0.1, defaultValue, format, onChange }: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const frac = (value - min) / (max - min);
  const angle = -SWEEP / 2 + frac * SWEEP;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pixelsForFullRange = e.shiftKey ? 800 : 200;
    const dv = ((drag.current.y - e.clientY) / pixelsForFullRange) * (max - min);
    onChange(clamp(drag.current.v + dv));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step));
    else return;
    e.preventDefault();
  };

  return (
    <div className="knob">
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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

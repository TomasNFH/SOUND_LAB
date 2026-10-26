import type { ReactNode } from 'react';

// Schematic symbols for the circuit diagrams. Coordinates in SVG units;
// `hot` draws a part that differs from stock in amber.

export const ohms = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`);
export const farads = (v: number) =>
  v >= 1e-6 ? `${+(v * 1e6).toFixed(2)}µ` : v >= 1e-9 ? `${+(v * 1e9).toFixed(1)}n` : `${Math.round(v * 1e12)}p`;

// --- Symbols -------------------------------------------------------------

// Resistor zigzag between two points on a horizontal or vertical line.
export function Resistor({ x1, y1, x2, y2, hot }: { x1: number; y1: number; x2: number; y2: number; hot?: boolean }) {
  const vertical = x1 === x2;
  const len = vertical ? y2 - y1 : x2 - x1;
  const body = 32;
  const lead = (len - body) / 2;
  const pts: string[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = lead + (body * i) / steps;
    const off = i === 0 || i === steps ? 0 : i % 2 ? 5 : -5;
    pts.push(vertical ? `${x1 + off},${y1 + t}` : `${x1 + t},${y1 + off}`);
  }
  const d = vertical
    ? `M${x1} ${y1} V${y1 + lead} L${pts.join(' L')} V${y2}`
    : `M${x1} ${y1} H${x1 + lead} L${pts.join(' L')} H${x2}`;
  return <path className={`sch-part ${hot ? 'hot' : ''}`} d={d} />;
}

// Capacitor: two plates across the line; `polar` marks an electrolytic's +.
export function Cap({ x1, y1, x2, y2, hot, polar }: { x1: number; y1: number; x2: number; y2: number; hot?: boolean; polar?: 'start' | 'end' }) {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const g = 3;
  const w = 9;
  const cls = `sch-part ${hot ? 'hot' : ''}`;
  return vertical ? (
    <g className={cls}>
      <path d={`M${x1} ${y1} V${my - g} M${mx - w} ${my - g} H${mx + w} M${mx - w} ${my + g} H${mx + w} M${x1} ${my + g} V${y2}`} />
      {polar && (
        <text className="sch-plus" x={mx + w + 2} y={polar === 'start' ? my - g - 2 : my + g + 9}>
          +
        </text>
      )}
    </g>
  ) : (
    <g className={cls}>
      <path d={`M${x1} ${y1} H${mx - g} M${mx - g} ${my - w} V${my + w} M${mx + g} ${my - w} V${my + w} M${mx + g} ${y1} H${x2}`} />
      {polar && (
        <text className="sch-plus" x={polar === 'start' ? mx - g - 9 : mx + g + 2} y={my + w + 10}>
          +
        </text>
      )}
    </g>
  );
}

export const Ground = ({ x, y }: { x: number; y: number }) => (
  <path className="sch-wire" d={`M${x} ${y} V${y + 6} M${x - 8} ${y + 6} H${x + 8} M${x - 5} ${y + 9} H${x + 5} M${x - 2} ${y + 12} H${x + 2}`} />
);

export const Dot = ({ x, y }: { x: number; y: number }) => <circle className="sch-dot" cx={x} cy={y} r="2.5" />;

export const Wire = ({ d }: { d: string }) => <path className="sch-wire" d={d} />;

export const Label = ({ x, y, children, anchor = 'start', hot }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; hot?: boolean }) => (
  <text className={`sch-label ${hot ? 'hot' : ''}`} x={x} y={y} textAnchor={anchor}>
    {children}
  </text>
);

// Op-amp triangle pointing right; inputs on the left (+ on top).
export function OpAmp({ x, y, h = 70, name }: { x: number; y: number; h?: number; name: string }) {
  const w = h * 0.95;
  return (
    <g>
      <path className="sch-part" d={`M${x} ${y} V${y + h} L${x + w} ${y + h / 2} Z`} />
      <text className="sch-pin" x={x + 5} y={y + h * 0.3 + 4}>
        +
      </text>
      <text className="sch-pin" x={x + 5} y={y + h * 0.7 + 4}>
        −
      </text>
      <text className="sch-label" x={x + w * 0.32} y={y + h / 2 + 4}>
        {name}
      </text>
    </g>
  );
}

// NPN transistor with its base at (x, y): collector up, emitter down.
// Returns the collector and emitter lead ends at y ∓ 18.
export function Npn({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <g>
      <path className="sch-part" d={`M${x} ${y} H${x + 10} M${x + 10} ${y - 12} V${y + 12} M${x + 10} ${y - 5} L${x + 24} ${y - 18} M${x + 10} ${y + 5} L${x + 24} ${y + 18}`} />
      <path className="sch-part" d={`M${x + 24} ${y + 18} l-8 -1 M${x + 24} ${y + 18} l-3 -7`} />
      <text className="sch-label" x={x + 28} y={y + 4}>
        {name}
      </text>
    </g>
  );
}

// A diode pointing in the +x (dir 1) or −x (dir −1) direction, centred at
// (x, y); `led` adds the light arrows.
export function Diode({ x, y, dir, hot, led }: { x: number; y: number; dir: 1 | -1; hot?: boolean; led?: boolean }) {
  const a = x - 6 * dir; // anode side of the triangle
  const k = x + 6 * dir; // bar (cathode)
  return (
    <g className={`sch-part ${hot ? 'hot' : ''}`}>
      <path d={`M${a} ${y - 6} V${y + 6} L${k} ${y} Z M${k} ${y - 6} V${y + 6}`} />
      {led && <path d={`M${x} ${y - 8} l5 -6 M${x + 5} ${y - 14} l-3 0 M${x + 5} ${y - 14} l0 3 M${x + 5} ${y - 8} l5 -6`} />}
    </g>
  );
}

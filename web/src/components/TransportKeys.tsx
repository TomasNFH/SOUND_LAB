import type { ReactNode } from 'react';

export interface TransportKey {
  id: string;
  // Printed on the key, and its accessible name.
  label: string;
  icon: ReactNode;
  onPress: () => void;
  // Held down, like a latched deck key (playing, stopped, loop on): it sinks,
  // fills with its colour and lights its LED.
  latched?: boolean;
  color: 'turq' | 'terra' | 'tan';
  // A toggle reports on/off to screen readers; a momentary key doesn't.
  toggle?: boolean;
  disabled?: boolean;
  title?: string;
}

// A row of tall mechanical deck keys: a numbered plate with an LED at the
// top, grip ridges, and the name with its symbol at the bottom.
export function TransportKeys({ keys, label = 'Transport' }: { keys: TransportKey[]; label?: string }) {
  return (
    <div className="mech-keys" role="group" aria-label={label}>
      {keys.map((k, i) => (
        <button
          key={k.id}
          className={`mech-key ${k.color} ${k.latched ? 'latched' : ''}`}
          onClick={k.onPress}
          disabled={k.disabled}
          title={k.title}
          aria-label={k.label}
          aria-pressed={k.toggle ? !!k.latched : undefined}
        >
          <span className="mech-key-top" aria-hidden="true">
            <span className="mech-key-index">
              {String(i + 1).padStart(2, '0')}
              <span className="mech-key-index-name"> / {k.label}</span>
            </span>
            <span className="mech-led" />
          </span>
          <span className="mech-ridges" aria-hidden="true" />
          <span className="mech-key-bottom" aria-hidden="true">
            <span className="mech-key-name">{k.label}</span>
            {k.icon}
          </span>
        </button>
      ))}
    </div>
  );
}

const icon = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    {d}
  </svg>
);

export const TAPE_ICONS = {
  play: icon(<path d="M8 5v14l11-7z" fill="currentColor" />),
  pause: icon(
    <g fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </g>,
  ),
  stop: icon(<path d="M6 6h12v12H6z" fill="currentColor" />),
  loop: icon(
    <path
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
};

// The scale printed round a deck's rotary dial: 16 ticks over the knob's
// 270° sweep.
export function DialTicks() {
  const ticks = Array.from({ length: 16 }, (_, i) => ((-135 + (i * 270) / 15) * Math.PI) / 180);
  return (
    <svg className="dial-ticks" viewBox="0 0 100 100" aria-hidden="true">
      {ticks.map((a, i) => (
        <line key={i} x1={50 + 38 * Math.sin(a)} y1={50 - 38 * Math.cos(a)} x2={50 + 45 * Math.sin(a)} y2={50 - 45 * Math.cos(a)} />
      ))}
    </svg>
  );
}

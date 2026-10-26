import type { ReactNode } from 'react';

export interface TransportKey {
  id: string;
  // Printed under the key, and its accessible name.
  label: string;
  icon: ReactNode;
  onPress: () => void;
  // Held down, like a latched tape-deck key (playing, loop on).
  latched?: boolean;
  // A toggle reports on/off to screen readers; a momentary key doesn't.
  toggle?: boolean;
  // A small light above the key, lit while latched.
  lamp?: 'terra' | 'turq';
  disabled?: boolean;
  title?: string;
}

// A row of chunky cassette-deck keys: square metal caps on a dark strip,
// a lamp above the ones that latch, the name printed underneath.
export function TransportKeys({ keys, label = 'Transport' }: { keys: TransportKey[]; label?: string }) {
  return (
    <div className="tape-deck" role="group" aria-label={label}>
      {keys.map((k) => (
        <div key={k.id} className="tape-slot">
          <span className={`tape-lamp ${k.lamp ?? 'none'} ${k.lamp && k.latched ? 'on' : ''}`} aria-hidden="true" />
          <button
            className={`tape-key ${k.latched ? 'latched' : ''}`}
            onClick={k.onPress}
            disabled={k.disabled}
            title={k.title}
            aria-label={k.label}
            aria-pressed={k.toggle ? !!k.latched : undefined}
          >
            {k.icon}
          </button>
          <span className="tape-label" aria-hidden="true">
            {k.label}
          </span>
        </div>
      ))}
    </div>
  );
}

const icon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    {d}
  </svg>
);

// Outlined like the symbols engraved on a deck's keys.
export const TAPE_ICONS = {
  play: icon(<path d="M7 5.5v13l11-6.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />),
  pause: icon(
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="6.5" y="5.5" width="3.5" height="13" rx="0.5" />
      <rect x="14" y="5.5" width="3.5" height="13" rx="0.5" />
    </g>,
  ),
  stop: icon(<rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />),
  loop: icon(
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 8.5A7 7 0 1 0 19 13" />
      <path d="M18 4v4.5h-4.5" />
    </g>,
  ),
};

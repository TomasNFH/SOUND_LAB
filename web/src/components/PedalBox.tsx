import type { ReactNode } from 'react';

type Props = {
  // Printed above and below the footswitch, like a stompbox's model name.
  name: string;
  subtitle?: string;
  // The enclosure's paint; each pedal gets its own (see .pedal-* in styles.css).
  color: 'teal';
  on: boolean;
  onToggle: () => void;
  // The knobs across the top of the box.
  children: ReactNode;
};

// An illustrated stompbox: a painted enclosure with corner screws, the
// knobs on top, a status LED, and the name printed around a metal
// footswitch that turns the effect on and off. Input and output jacks
// stick out of the sides.
export function PedalBox({ name, subtitle, color, on, onToggle, children }: Props) {
  return (
    <div className={`pedal pedal-${color} ${on ? 'is-on' : 'is-off'}`}>
      <span className="pedal-jack in" aria-hidden="true" />
      <span className="pedal-jack out" aria-hidden="true" />
      <span className="pedal-screw tl" aria-hidden="true" />
      <span className="pedal-screw tr" aria-hidden="true" />
      <span className="pedal-screw bl" aria-hidden="true" />
      <span className="pedal-screw br" aria-hidden="true" />
      <div className="pedal-knobs">{children}</div>
      <span className="pedal-led" aria-hidden="true" />
      <div className="pedal-plate">
        <span className="pedal-name" aria-hidden="true">
          {name}
        </span>
        <button
          className="pedal-switch"
          onClick={onToggle}
          aria-pressed={on}
          aria-label={`${name}${subtitle ? ` ${subtitle}` : ''} on`}
          title={on ? 'On: click to bypass' : 'Bypassed: click to turn on'}
        />
        {subtitle && (
          <span className="pedal-name sub" aria-hidden="true">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

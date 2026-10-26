import type { ReactNode } from 'react';

export type PedalPaint = 'teal' | 'cream' | 'skyblue' | 'orange' | 'navy' | 'eqorange' | 'mint' | 'rust' | 'amp';
export type PedalShape = 'upright' | 'small' | 'slim' | 'wide' | 'amp';
export type PedalLettering = 'display' | 'script' | 'block' | 'tall' | 'serif';

type Props = {
  // Printed above and below the footswitch, like a stompbox's model name.
  name: string;
  subtitle?: string;
  paint: PedalPaint;
  shape?: PedalShape;
  lettering?: PedalLettering;
  // A speaker-style grille printed on the lower half, like a distortion box.
  grille?: boolean;
  on: boolean;
  onToggle: () => void;
  // The knobs across the top of the box.
  children: ReactNode;
};

// An illustrated stompbox: a painted enclosure with corner screws, the
// knobs on top, a status LED, and the name printed around a metal
// footswitch that turns the effect on and off. Input and output jacks
// stick out of the sides. The amp shape is a head instead: a faceplate
// with the knobs and a jewel lamp power switch over a grille cloth.
export function PedalBox({ name, subtitle, paint, shape = 'upright', lettering = 'display', grille, on, onToggle, children }: Props) {
  const label = `${name}${subtitle ? ` ${subtitle}` : ''}`;
  const toggle = (
    <button
      className={shape === 'amp' ? 'amp-power' : 'pedal-switch'}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${label} on`}
      title={on ? 'On: click to bypass' : 'Bypassed: click to turn on'}
    />
  );

  if (shape === 'amp') {
    return (
      <div className={`pedal pedal-amp shape-amp ${on ? 'is-on' : 'is-off'}`}>
        <span className="pedal-jack out" aria-hidden="true" />
        <div className="amp-face">
          <span className={`pedal-name amp-name font-${lettering}`} aria-hidden="true">
            {name}
            {subtitle && <span className="amp-sub"> {subtitle}</span>}
          </span>
          <div className="pedal-knobs">{children}</div>
          <div className="amp-power-wrap">
            <span className="pedal-led" aria-hidden="true" />
            {toggle}
            <span className="amp-power-label" aria-hidden="true">
              Power
            </span>
          </div>
        </div>
        <div className="amp-grille" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`pedal pedal-${paint} shape-${shape} ${on ? 'is-on' : 'is-off'}`}>
      <span className="pedal-jack in" aria-hidden="true" />
      <span className="pedal-jack out" aria-hidden="true" />
      <span className="pedal-screw tl" aria-hidden="true" />
      <span className="pedal-screw tr" aria-hidden="true" />
      <span className="pedal-screw bl" aria-hidden="true" />
      <span className="pedal-screw br" aria-hidden="true" />
      <div className="pedal-knobs">{children}</div>
      <span className="pedal-led" aria-hidden="true" />
      <div className={`pedal-plate ${grille ? 'with-grille' : ''}`}>
        <span className={`pedal-name font-${lettering}`} aria-hidden="true">
          {name}
        </span>
        {grille && <span className="pedal-grille" aria-hidden="true" />}
        {toggle}
        {subtitle && (
          <span className={`pedal-name sub font-${lettering === 'script' ? 'display' : lettering}`} aria-hidden="true">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

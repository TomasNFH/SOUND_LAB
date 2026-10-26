import type { ReactNode } from 'react';

export type PedalPaint = 'teal' | 'cream' | 'skyblue' | 'orange' | 'navy' | 'eqorange' | 'mint' | 'rust' | 'amp' | 'tuner' | 'tin' | 'can';
export type PedalShape = 'upright' | 'small' | 'slim' | 'wide' | 'amp' | 'tin' | 'can';
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
  // What the footswitch does, for screen readers; "<name> on" by default.
  switchLabel?: string;
  // The knobs across the top of the box.
  children: ReactNode;
  // Tin shape only: the big knob in the top band, beside the toggle.
  feature?: ReactNode;
};

// An illustrated stompbox: a painted enclosure with corner screws, the
// knobs on top, a status LED, and the name printed around a metal
// footswitch that turns the effect on and off. Input and output jacks
// stick out of the sides. The amp shape is a head instead: a faceplate
// with the knobs and a jewel lamp power switch over a grille cloth. The
// tin shape is a box built from an old sewing-machine tin: a rusty cream
// band with a toggle and one big knob over a green printed panel. The can
// shape is a round tin lid: two thumbwheels and an aluminium knob glued
// on, a keyboard key for a footswitch and label-maker tape for the names.
export function PedalBox({ name, subtitle, paint, shape = 'upright', lettering = 'display', grille, on, onToggle, switchLabel, children, feature }: Props) {
  const label = `${name}${subtitle ? ` ${subtitle}` : ''}`;
  const toggle = (
    <button
      className={shape === 'amp' ? 'amp-power' : shape === 'tin' ? 'tin-toggle' : shape === 'can' ? 'can-key' : 'pedal-switch'}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={switchLabel ?? `${label} on`}
      title={switchLabel ?? (on ? 'On: click to bypass' : 'Bypassed: click to turn on')}
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

  if (shape === 'can') {
    return (
      <div className={`pedal pedal-${paint} shape-can ${on ? 'is-on' : 'is-off'}`}>
        <span className="pedal-jack in" aria-hidden="true" />
        <span className="pedal-jack out" aria-hidden="true" />
        {toggle}
        <span className="pedal-led" aria-hidden="true" />
        <div className="pedal-knobs">{children}</div>
        <span className="can-tape" aria-hidden="true">
          {name}
          {subtitle && ` ${subtitle}`}
        </span>
      </div>
    );
  }

  if (shape === 'tin') {
    return (
      <div className={`pedal pedal-${paint} shape-tin ${on ? 'is-on' : 'is-off'}`}>
        <span className="pedal-jack in" aria-hidden="true" />
        <span className="pedal-jack out" aria-hidden="true" />
        <div className="tin-top">
          <span className="tin-toggle-wrap">{toggle}</span>
          <span className="pedal-led" aria-hidden="true" />
          <span className="tin-stamp" aria-hidden="true" />
          {feature && <div className="tin-feature">{feature}</div>}
        </div>
        <div className="tin-panel">
          <span className="tin-name" aria-hidden="true">
            {name}
          </span>
          {subtitle && (
            <span className="tin-sub" aria-hidden="true">
              {subtitle}
            </span>
          )}
          <div className="pedal-knobs">{children}</div>
        </div>
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

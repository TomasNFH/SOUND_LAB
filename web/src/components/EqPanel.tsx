import type { EqBand, EqSettings } from '../audio/settings';
import { fmt, Knob } from './Knob';

type Props = {
  eq: EqSettings;
  onChange: (eq: EqSettings) => void;
  onActiveBand: (index: number | null) => void;
  // Off where there is no distortion to be before or after (Live's bass).
  showPosition?: boolean;
};

const BAND_NAMES: Record<EqBand['type'], string> = {
  lowshelf: 'Low shelf',
  peaking: 'Peak',
  highshelf: 'High shelf',
};

export function EqPanel({ eq, onChange, onActiveBand, showPosition = true }: Props) {
  const setBand = (i: number, patch: Partial<EqBand>) =>
    onChange({ ...eq, bands: eq.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Parametric EQ</h2>
        <label className="check">
          <input type="checkbox" checked={eq.on} onChange={(e) => onChange({ ...eq, on: e.target.checked })} />
          On
        </label>
        {showPosition && (
          <div className="seg" role="group" aria-label="EQ position">
            {(['pre', 'post'] as const).map((p) => (
              <button
                key={p}
                className={eq.position === p ? 'on' : ''}
                onClick={() => onChange({ ...eq, position: p })}
              >
                {p === 'pre' ? 'Before distortion' : 'After distortion'}
              </button>
            ))}
          </div>
        )}
      </div>
      {showPosition && (
        <p className="muted small">
          Before the distortion, the EQ changes what gets distorted. After it, the EQ only colours the result.
        </p>
      )}

      <div className={`eq-bands ${eq.on ? '' : 'disabled'}`}>
        {eq.bands.map((band, i) => (
          <div
            key={i}
            className={`eq-band ${band.on ? '' : 'off'}`}
            onPointerEnter={() => onActiveBand(i)}
            onPointerLeave={() => onActiveBand(null)}
          >
            <label className="check band-title">
              <input type="checkbox" checked={band.on} onChange={(e) => setBand(i, { on: e.target.checked })} />
              {BAND_NAMES[band.type]}
            </label>
            <Knob
              size="small"
              label="Freq"
              value={band.freq}
              min={band.type === 'highshelf' ? 1000 : 30}
              max={band.type === 'lowshelf' ? 1000 : 16000}
              scale="log"
              format={fmt.hz}
              onChange={(freq) => setBand(i, { freq })}
              onActive={(a) => onActiveBand(a ? i : null)}
            />
            <Knob
              size="small"
              label="Gain"
              value={band.gain}
              min={-15}
              max={15}
              step={0.5}
              defaultValue={0}
              format={fmt.db}
              onChange={(gain) => setBand(i, { gain })}
              onActive={(a) => onActiveBand(a ? i : null)}
            />
            {band.type === 'peaking' && (
              <Knob
                size="small"
                label="Q"
                value={band.q}
                min={0.3}
                max={12}
                scale="log"
                defaultValue={1}
                format={fmt.q}
                onChange={(q) => setBand(i, { q })}
                onActive={(a) => onActiveBand(a ? i : null)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

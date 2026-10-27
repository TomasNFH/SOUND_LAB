import type { EqBand, EqSettings } from '../audio/settings';
import { fmt, Knob } from './Knob';
import { PedalBox } from './PedalBox';

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

// Scale ends printed beside a knob: 30, 1k, 16k.
const scaleHz = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

// The band's curve printed where a shelf has no Q knob.
function ShelfIcon({ high }: { high: boolean }) {
  return (
    <svg className="eq-shelf" viewBox="0 0 48 24" aria-hidden="true">
      <path d={high ? 'M4 18 H20 C28 18 28 6 36 6 H44' : 'M4 6 H12 C20 6 20 18 28 18 H44'} />
    </svg>
  );
}

export function EqPanel({ eq, onChange, onActiveBand, showPosition = true }: Props) {
  const setBand = (i: number, patch: Partial<EqBand>) =>
    onChange({ ...eq, bands: eq.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Parametric EQ</h2>
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

      <div className="pedal-stage">
        <PedalBox name="equalizer" paint="blue" shape="studio" on={eq.on} onToggle={() => onChange({ ...eq, on: !eq.on })}>
          <div className="eq-bands">
            {eq.bands.map((band, i) => {
              const fMin = band.type === 'highshelf' ? 1000 : 30;
              const fMax = band.type === 'lowshelf' ? 1000 : 16000;
              return (
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
                  {band.type === 'peaking' ? (
                    <div className="eq-knob q" data-lo="0.3" data-hi="12">
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
                    </div>
                  ) : (
                    <ShelfIcon high={band.type === 'highshelf'} />
                  )}
                  <div className="eq-knob" data-lo={scaleHz(fMin)} data-hi={scaleHz(fMax)}>
                    <Knob
                      size="small"
                      label="Freq"
                      value={band.freq}
                      min={fMin}
                      max={fMax}
                      scale="log"
                      format={fmt.hz}
                      onChange={(freq) => setBand(i, { freq })}
                      onActive={(a) => onActiveBand(a ? i : null)}
                    />
                  </div>
                  <div className="eq-knob" data-lo="−15" data-hi="+15">
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
                  </div>
                </div>
              );
            })}
          </div>
        </PedalBox>
      </div>
    </section>
  );
}

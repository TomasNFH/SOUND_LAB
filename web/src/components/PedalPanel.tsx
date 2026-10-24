import type { PedalSettings, PedalType } from '../audio/settings';
import { fmt, Knob } from './Knob';

type Props = {
  pedal: PedalSettings;
  onChange: (pedal: PedalSettings) => void;
};

const PEDALS: { id: PedalType; name: string; idea: string }[] = [
  { id: 'boost', name: 'Clean boost', idea: 'Only louder: no new harmonics. The reference for every other pedal.' },
];

export function PedalPanel({ pedal, onChange }: Props) {
  const info = PEDALS.find((p) => p.id === pedal.type);
  return (
    <section className="panel pedal-panel">
      <div className="panel-head">
        <h2>Pedal</h2>
        <label className="check">
          <input type="checkbox" checked={pedal.on} onChange={(e) => onChange({ ...pedal, on: e.target.checked })} />
          On
        </label>
        <select
          className="compact"
          value={pedal.type}
          onChange={(e) => onChange({ ...pedal, type: e.target.value as PedalType })}
        >
          {PEDALS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {info && <p className="muted small">{info.idea}</p>}

      <div className={`knobs ${pedal.on ? '' : 'disabled'}`}>
        {pedal.type === 'boost' && (
          <Knob
            label="Gain"
            value={pedal.boost.gain}
            min={-12}
            max={18}
            step={0.5}
            defaultValue={0}
            format={fmt.db}
            onChange={(gain) => onChange({ ...pedal, boost: { gain } })}
          />
        )}
      </div>
    </section>
  );
}

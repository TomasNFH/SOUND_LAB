import { humpFrequency, tsGain, tsHighCut } from '../audio/blocks/TubeScreamer';
import type { PedalSettings, PedalType, TsSettings } from '../audio/settings';
import { fmt, Knob } from './Knob';

type Props = {
  pedal: PedalSettings;
  onChange: (pedal: PedalSettings) => void;
};

const PEDALS: { id: PedalType; name: string; idea: string }[] = [
  { id: 'boost', name: 'Clean boost', idea: 'Only louder: no new harmonics. The reference for every other pedal.' },
  {
    id: 'ts',
    name: 'Tube Screamer',
    idea: 'Mid hump, clean bass path, soft diode clipping. Only the highpassed branch is driven into the diodes.',
  },
];

export function PedalPanel({ pedal, onChange }: Props) {
  const info = PEDALS.find((p) => p.id === pedal.type);
  const setTs = (patch: Partial<TsSettings>) => onChange({ ...pedal, ts: { ...pedal.ts, ...patch } });

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

      <div className={pedal.on ? '' : 'disabled'}>
        {pedal.type === 'boost' && (
          <div className="knobs">
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
          </div>
        )}

        {pedal.type === 'ts' && (
          <>
            <div className="knobs">
              <Knob label="Drive" value={pedal.ts.drive} min={0} max={1} step={0.01} defaultValue={0.3} format={fmt.pct} onChange={(drive) => setTs({ drive })} />
              <Knob label="Tone" value={pedal.ts.tone} min={0} max={1} step={0.01} defaultValue={0.5} format={fmt.pct} onChange={(tone) => setTs({ tone })} />
              <Knob label="Level" value={pedal.ts.level} min={-30} max={6} step={0.5} defaultValue={-6} format={fmt.db} onChange={(level) => setTs({ level })} />
            </div>
            <div className="switches">
              <div className="switch-row">
                <span className="switch-label">Clipping</span>
                <div className="seg">
                  {(['sym', 'asym'] as const).map((c) => (
                    <button key={c} className={pedal.ts.clip === c ? 'on' : ''} onClick={() => setTs({ clip: c })}>
                      {c === 'sym' ? 'Symmetric' : 'Asymmetric'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="switch-row">
                <span className="switch-label">Hump</span>
                <div className="seg">
                  {([340, 720, 1500] as const).map((h) => (
                    <button key={h} className={pedal.ts.hump === h ? 'on' : ''} onClick={() => setTs({ hump: h })}>
                      {fmt.hz(humpFrequency(h))}
                    </button>
                  ))}
                </div>
              </div>
              <div className="switch-row">
                <label className="check">
                  <input type="checkbox" checked={pedal.ts.bassPath} onChange={(e) => setTs({ bassPath: e.target.checked })} />
                  Clean bass path
                </label>
                <label className="check">
                  <input type="checkbox" checked={pedal.ts.highCut} onChange={(e) => setTs({ highCut: e.target.checked })} />
                  High cut (51 pF)
                </label>
              </div>
            </div>
            <p className="muted small">
              Op-amp gain {tsGain(pedal.ts.drive).toFixed(0)}× above {fmt.hz(humpFrequency(pedal.ts.hump))}
              {pedal.ts.highCut && <>, high cut at {fmt.hz(tsHighCut(pedal.ts.drive))}</>}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

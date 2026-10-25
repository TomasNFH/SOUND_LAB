import { humpFrequency, tsGain, tsHighCut } from '../audio/blocks/TubeScreamer';
import type { BdSettings, Ds2Settings, KlonSettings, PedalSettings, PedalType, TsSettings } from '../audio/settings';
import { BoostPanel } from './BoostPanel';
import { fmt, Knob } from './Knob';

type Props = {
  pedal: PedalSettings;
  onChange: (pedal: PedalSettings) => void;
};

const PEDALS: { id: PedalType; name: string; idea: string }[] = [
  {
    id: 'boost',
    name: 'Clean boost (4558)',
    idea: 'A JRC4558 op-amp boost on 9 V, from clean_boost_4558.cir: louder with no new harmonics, until the op-amp runs out of supply voltage. Every part is editable.',
  },
  {
    id: 'ts',
    name: 'Tube Screamer',
    idea: 'Mid hump, clean bass path, soft diode clipping. Only the highpassed branch is driven into the diodes.',
  },
  {
    id: 'bd',
    name: 'Blues Driver',
    idea: 'Gentle clipping in two stages, full range, flatter mids: closer to an amp breaking up.',
  },
  {
    id: 'ds2',
    name: 'DS-2 Turbo',
    idea: 'Hard clipping and a scooped tone control. Turbo boosts the mids before the clipper.',
  },
  {
    id: 'klon',
    name: 'Klon Centaur',
    idea: 'Clean signal blended with soft clipping, so the attack of each note survives.',
  },
];

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };

export function PedalPanel({ pedal, onChange }: Props) {
  const info = PEDALS.find((p) => p.id === pedal.type);
  const setTs = (patch: Partial<TsSettings>) => onChange({ ...pedal, ts: { ...pedal.ts, ...patch } });
  const setBd = (patch: Partial<BdSettings>) => onChange({ ...pedal, bd: { ...pedal.bd, ...patch } });
  const setDs2 = (patch: Partial<Ds2Settings>) => onChange({ ...pedal, ds2: { ...pedal.ds2, ...patch } });
  const setKlon = (patch: Partial<KlonSettings>) => onChange({ ...pedal, klon: { ...pedal.klon, ...patch } });

  return (
    <section className="panel pedal-panel">
      <div className="panel-head">
        <h2>Distortion</h2>
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
        {pedal.type === 'boost' && <BoostPanel boost={pedal.boost} onChange={(boost) => onChange({ ...pedal, boost })} />}

        {pedal.type === 'ts' && (
          <>
            <div className="knobs">
              <Knob label="Drive" value={pedal.ts.drive} min={0} max={1} step={0.01} defaultValue={0.3} format={fmt.pct} onChange={(drive) => setTs({ drive })} />
              <Knob label="Tone" value={pedal.ts.tone} min={0} max={1} step={0.01} defaultValue={0.5} format={fmt.pct} onChange={(tone) => setTs({ tone })} />
              <Knob label="Level" value={pedal.ts.level} min={-30} max={6} step={0.5} defaultValue={-9} format={fmt.db} onChange={(level) => setTs({ level })} />
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

        {pedal.type === 'bd' && (
          <div className="knobs">
            <Knob label="Gain" value={pedal.bd.gain} {...unit} defaultValue={0.5} onChange={(gain) => setBd({ gain })} />
            <Knob label="Tone" value={pedal.bd.tone} {...unit} defaultValue={0.5} onChange={(tone) => setBd({ tone })} />
            <Knob label="Level" value={pedal.bd.level} min={-30} max={6} step={0.5} defaultValue={-9} format={fmt.db} onChange={(level) => setBd({ level })} />
          </div>
        )}

        {pedal.type === 'ds2' && (
          <>
            <div className="knobs">
              <Knob label="Dist" value={pedal.ds2.dist} {...unit} defaultValue={0.5} onChange={(dist) => setDs2({ dist })} />
              <Knob label="Tone" value={pedal.ds2.tone} {...unit} defaultValue={0.5} onChange={(tone) => setDs2({ tone })} />
              <Knob label="Level" value={pedal.ds2.level} min={-30} max={6} step={0.5} defaultValue={-7} format={fmt.db} onChange={(level) => setDs2({ level })} />
            </div>
            <div className="switches">
              <div className="switch-row">
                <span className="switch-label">Mode</span>
                <div className="seg">
                  <button className={pedal.ds2.turbo ? '' : 'on'} onClick={() => setDs2({ turbo: false })}>
                    I
                  </button>
                  <button className={pedal.ds2.turbo ? 'on' : ''} onClick={() => setDs2({ turbo: true })}>
                    II · Turbo
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {pedal.type === 'klon' && (
          <div className="knobs">
            <Knob label="Gain" value={pedal.klon.gain} {...unit} defaultValue={0.35} onChange={(gain) => setKlon({ gain })} />
            <Knob label="Treble" value={pedal.klon.treble} {...unit} defaultValue={0.5} onChange={(treble) => setKlon({ treble })} />
            <Knob label="Output" value={pedal.klon.output} min={-30} max={6} step={0.5} defaultValue={3} format={fmt.db} onChange={(output) => setKlon({ output })} />
          </div>
        )}
      </div>
    </section>
  );
}

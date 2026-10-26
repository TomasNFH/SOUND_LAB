import { humpFrequency, midHumpGain, midHumpHighCut } from '../audio/blocks/MidHumpDrive';
import type { AmpLikeSettings, HardDistortionSettings, CleanBlendSettings, PedalSettings, PedalType, MidHumpSettings } from '../audio/settings';
import { BoostEqPanel } from './BoostEqPanel';
import { BoostPanel } from './BoostPanel';
import { fmt, Knob } from './Knob';
import { Drive4558Panel } from './Drive4558Panel';
import { PedalBox } from './PedalBox';

type Props = {
  pedal: PedalSettings;
  onChange: (pedal: PedalSettings) => void;
};

const PEDALS: { id: PedalType; name: string; idea: string }[] = [
  {
    id: 'boost',
    name: 'Clean boost (4558)',
    idea: 'JRC4558 op-amp boosts on 9 V: louder with no new harmonics, until the op-amp runs out of supply voltage. Simple: clean_boost_4558.cir. Boost + EQ: boost_eq_cortes_bypass_2x4558.cir, with cuts, a Baxandall and mids. Every part is editable.',
  },
  {
    id: 'ts',
    name: 'Mid-hump overdrive',
    idea: 'Mid hump, clean bass path, soft diode clipping. Classic: the idea, simplified. 4558: the classic op-amp circuit with every part editable.',
  },
  {
    id: 'bd',
    name: 'Amp-like overdrive',
    idea: 'Gentle clipping in two stages, full range, flatter mids: closer to an amp breaking up.',
  },
  {
    id: 'ds2',
    name: 'Hard distortion',
    idea: 'Hard clipping and a scooped tone control. Mode II boosts the mids before the clipper.',
  },
  {
    id: 'klon',
    name: 'Clean-blend overdrive',
    idea: 'Clean signal blended with soft clipping, so the attack of each note survives.',
  },
];

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };

export function PedalPanel({ pedal, onChange }: Props) {
  const info = PEDALS.find((p) => p.id === pedal.type);
  const setMidHump = (patch: Partial<MidHumpSettings>) => onChange({ ...pedal, ts: { ...pedal.ts, ...patch } });
  const setAmpLike = (patch: Partial<AmpLikeSettings>) => onChange({ ...pedal, bd: { ...pedal.bd, ...patch } });
  const setHardDistortion = (patch: Partial<HardDistortionSettings>) => onChange({ ...pedal, ds2: { ...pedal.ds2, ...patch } });
  const setCleanBlend = (patch: Partial<CleanBlendSettings>) => onChange({ ...pedal, klon: { ...pedal.klon, ...patch } });
  // Every pedal is drawn as a stompbox whose footswitch is the on/off control.
  const box = { on: pedal.on, onToggle: () => onChange({ ...pedal, on: !pedal.on }) };
  const dimIfOff = pedal.on ? '' : 'disabled';

  return (
    <section className="panel pedal-panel">
      <div className="panel-head">
        <h2>Distortion</h2>
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

      <div>
        {pedal.type === 'boost' && (
          <div className="switches">
            <div className="switch-row">
              <span className="switch-label">Circuit</span>
              <div className="seg">
                {(['simple', 'eq'] as const).map((c) => (
                  <button key={c} className={pedal.boostCircuit === c ? 'on' : ''} onClick={() => onChange({ ...pedal, boostCircuit: c })}>
                    {c === 'simple' ? 'Simple' : 'Boost + EQ (2× 4558)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {pedal.type === 'boost' && pedal.boostCircuit !== 'eq' && (
          <BoostPanel boost={pedal.boost} onChange={(boost) => onChange({ ...pedal, boost })} box={box} />
        )}
        {pedal.type === 'boost' && pedal.boostCircuit === 'eq' && (
          <BoostEqPanel eq={pedal.boostEq} onChange={(boostEq) => onChange({ ...pedal, boostEq })} box={box} />
        )}

        {pedal.type === 'ts' && (
          <div className="switches">
            <div className="switch-row">
              <span className="switch-label">Mode</span>
              <div className="seg">
                {(['classic', '4558'] as const).map((m) => (
                  <button key={m} className={pedal.ts.mode === m ? 'on' : ''} onClick={() => setMidHump({ mode: m })}>
                    {m === 'classic' ? 'Classic' : '4558'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {pedal.type === 'ts' && pedal.ts.mode === '4558' && (
          <Drive4558Panel ts={pedal.ts.c4558} onChange={(c4558) => setMidHump({ c4558 })} box={box} />
        )}

        {pedal.type === 'ts' && pedal.ts.mode !== '4558' && (
          <div className="pedal-stage">
            <PedalBox name="Mid" subtitle="Hump" paint="teal" {...box}>
              <Knob label="Drive" value={pedal.ts.drive} min={0} max={1} step={0.01} defaultValue={0.3} format={fmt.pct} onChange={(drive) => setMidHump({ drive })} />
              <Knob label="Tone" value={pedal.ts.tone} min={0} max={1} step={0.01} defaultValue={0.5} format={fmt.pct} onChange={(tone) => setMidHump({ tone })} />
              <Knob label="Level" value={pedal.ts.level} min={-30} max={6} step={0.5} defaultValue={-9} format={fmt.db} onChange={(level) => setMidHump({ level })} />
            </PedalBox>
            <div className={`pedal-mods ${dimIfOff}`}>
              <div className="switches">
                <div className="switch-row">
                  <span className="switch-label">Clipping</span>
                  <div className="seg">
                    {(['sym', 'asym'] as const).map((c) => (
                      <button key={c} className={pedal.ts.clip === c ? 'on' : ''} onClick={() => setMidHump({ clip: c })}>
                        {c === 'sym' ? 'Symmetric' : 'Asymmetric'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="switch-row">
                  <span className="switch-label">Hump</span>
                  <div className="seg">
                    {([340, 720, 1500] as const).map((h) => (
                      <button key={h} className={pedal.ts.hump === h ? 'on' : ''} onClick={() => setMidHump({ hump: h })}>
                        {fmt.hz(humpFrequency(h))}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="switch-row">
                  <label className="check">
                    <input type="checkbox" checked={pedal.ts.bassPath} onChange={(e) => setMidHump({ bassPath: e.target.checked })} />
                    Clean bass path
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={pedal.ts.highCut} onChange={(e) => setMidHump({ highCut: e.target.checked })} />
                    High cut (51 pF)
                  </label>
                </div>
              </div>
              <p className="muted small">
                Op-amp gain {midHumpGain(pedal.ts.drive).toFixed(0)}× above {fmt.hz(humpFrequency(pedal.ts.hump))}
                {pedal.ts.highCut && <>, high cut at {fmt.hz(midHumpHighCut(pedal.ts.drive))}</>}.
              </p>
            </div>
          </div>
        )}

        {pedal.type === 'bd' && (
          <div className="pedal-stage">
            <PedalBox name="Amp-like" subtitle="Overdrive" paint="skyblue" shape="wide" lettering="script" {...box}>
              <Knob label="Gain" value={pedal.bd.gain} {...unit} defaultValue={0.5} onChange={(gain) => setAmpLike({ gain })} />
              <Knob label="Tone" value={pedal.bd.tone} {...unit} defaultValue={0.5} onChange={(tone) => setAmpLike({ tone })} />
              <Knob label="Level" value={pedal.bd.level} min={-30} max={6} step={0.5} defaultValue={-9} format={fmt.db} onChange={(level) => setAmpLike({ level })} />
            </PedalBox>
          </div>
        )}

        {pedal.type === 'ds2' && (
          <div className="pedal-stage">
            <PedalBox name="Distortion" paint="orange" lettering="block" grille {...box}>
              <Knob label="Dist" value={pedal.ds2.dist} {...unit} defaultValue={0.5} onChange={(dist) => setHardDistortion({ dist })} />
              <Knob label="Tone" value={pedal.ds2.tone} {...unit} defaultValue={0.5} onChange={(tone) => setHardDistortion({ tone })} />
              <Knob label="Level" value={pedal.ds2.level} min={-30} max={6} step={0.5} defaultValue={-7} format={fmt.db} onChange={(level) => setHardDistortion({ level })} />
            </PedalBox>
            <div className={`pedal-mods switches ${dimIfOff}`}>
              <div className="switch-row">
                <span className="switch-label">Mode</span>
                <div className="seg">
                  <button className={pedal.ds2.turbo ? '' : 'on'} onClick={() => setHardDistortion({ turbo: false })}>
                    I
                  </button>
                  <button className={pedal.ds2.turbo ? 'on' : ''} onClick={() => setHardDistortion({ turbo: true })}>
                    II · Mid boost
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pedal.type === 'klon' && (
          <div className="pedal-stage">
            <PedalBox name="Clean Blend" paint="navy" lettering="script" {...box}>
              <Knob label="Treble" value={pedal.klon.treble} {...unit} defaultValue={0.5} onChange={(treble) => setCleanBlend({ treble })} />
              <Knob label="Gain" value={pedal.klon.gain} {...unit} defaultValue={0.35} onChange={(gain) => setCleanBlend({ gain })} />
              <Knob label="Output" value={pedal.klon.output} min={-30} max={6} step={0.5} defaultValue={3} format={fmt.db} onChange={(output) => setCleanBlend({ output })} />
            </PedalBox>
          </div>
        )}
      </div>
    </section>
  );
}

import { boostValues } from '../audio/boost/boost4558';
import { STOCK_BOOST, type BoostSettings } from '../audio/settings';
import { BoostResponseView } from '../views/BoostResponseView';
import { BoostSchematic } from '../views/BoostSchematic';
import { fmt, Knob } from './Knob';
import { PedalBox } from './PedalBox';
import { farads, hz, ohms, potLabel, snap } from './parts';

type Props = { boost: BoostSettings; onChange: (b: BoostSettings) => void; box: { on: boolean; onToggle: () => void } };

type PartKey = 'r1' | 'c1' | 'r2' | 'c2' | 'c3';

const PARTS: { key: PartKey; label: string; min: number; max: number; format: (v: number) => string; role: string }[] = [
  { key: 'r1', label: 'R1', min: 100e3, max: 10e6, format: ohms, role: 'input bias' },
  { key: 'c1', label: 'C1', min: 1e-9, max: 1e-6, format: farads, role: 'input cap' },
  { key: 'r2', label: 'R2', min: 1e3, max: 100e3, format: ohms, role: 'sets gain' },
  { key: 'c2', label: 'C2', min: 1e-9, max: 100e-6, format: farads, role: 'bass gain' },
  { key: 'c3', label: 'C3', min: 1e-9, max: 100e-6, format: farads, role: 'output cap' },
];

export function BoostPanel({ boost, onChange, box }: Props) {
  const set = (patch: Partial<BoostSettings>) => onChange({ ...boost, ...patch });
  const v = boostValues(boost);
  const stock = boostValues(STOCK_BOOST);
  const changedCount = (Object.keys(STOCK_BOOST) as (keyof BoostSettings)[]).filter(
    (k) => k !== 'gainPos' && k !== 'volPos' && boost[k] !== STOCK_BOOST[k],
  ).length;

  // What each corner frequency does, which parts set it, and the stock value.
  const corners = [
    { label: 'Input high-pass', f: v.corners.input, s: stock.corners.input, parts: 'C1 · R1', note: 'Below this the boost cuts.' },
    { label: 'Gain starts rising', f: v.corners.shelfLow, s: stock.corners.shelfLow, parts: 'C2 · (R2 + Rgain)', note: 'Below this the boost has unity gain.' },
    { label: 'Full gain from', f: v.corners.shelfHigh, s: stock.corners.shelfHigh, parts: 'C2 · R2', note: 'Bass between the two C2 corners gets less boost.' },
    { label: 'Output high-pass', f: v.corners.output, s: stock.corners.output, parts: 'C3 · volume pot + amp', note: 'Moves with the volume knob.' },
    { label: 'Treble limit', f: v.corners.bandwidth, s: stock.corners.bandwidth, parts: '4558 GBW ÷ gain', note: 'More gain, less bandwidth.' },
  ];
  const db = (x: number) => 20 * Math.log10(x);

  return (
    <div className={`boost ${box.on ? '' : 'pedal-off'}`}>
      <div className="pedal-stage">
        <PedalBox name="Clean Boost" paint="cream" shape="small" lettering="serif" {...box}>
          <Knob label="Gain" value={boost.gainPos} min={0} max={1} step={0.01} defaultValue={STOCK_BOOST.gainPos} format={fmt.pct} onChange={(gainPos) => set({ gainPos })} />
          <Knob label="Volume" value={boost.volPos} min={0} max={1} step={0.01} defaultValue={STOCK_BOOST.volPos} format={fmt.pct} onChange={(volPos) => set({ volPos })} />
        </PedalBox>
      </div>
      <p className="muted small">
        Rgain {ohms(v.rGain)} → op-amp gain ×{v.gain.toFixed(1)} ({db(v.gain) >= 0 ? '+' : ''}
        {db(v.gain).toFixed(1)} dB), volume {db(v.outLevel).toFixed(1)} dB: overall{' '}
        {db(v.gain * v.outLevel) >= 0 ? '+' : ''}
        {db(v.gain * v.outLevel).toFixed(1)} dB. Clips above {(v.headroom / v.gain).toFixed(2)} V at the input (
        {v.headroom.toFixed(1)} V at the op-amp).
      </p>

      <div className="mods-head">
        <h3>Parts</h3>
        <span className="muted inline">{changedCount ? `${changedCount} changed from the netlist` : 'All as in the netlist'}</span>
        <button onClick={() => onChange({ ...STOCK_BOOST, gainPos: boost.gainPos, volPos: boost.volPos })} disabled={!changedCount}>
          Reset parts
        </button>
      </div>
      <div className="boost-parts">
        {PARTS.map((p) => {
          const changed = boost[p.key] !== STOCK_BOOST[p.key];
          return (
            <div key={p.key} className={`boost-part ${changed ? 'changed' : ''}`}>
              <Knob
                size="small"
                label={`${p.label} · ${p.role}`}
                value={boost[p.key]}
                min={p.min}
                max={p.max}
                scale="log"
                defaultValue={STOCK_BOOST[p.key]}
                format={p.format}
                onChange={(x) => set({ [p.key]: snap(x, STOCK_BOOST[p.key]) } as Partial<BoostSettings>)}
              />
            </div>
          );
        })}
      </div>
      <div className="switches">
        <div className="switch-row">
          <span className="switch-label">Gain pot</span>
          <div className="seg">
            {[50e3, 100e3, 250e3, 500e3, 1e6].map((r) => (
              <button key={r} className={boost.gainPot === r ? 'on' : ''} onClick={() => set({ gainPot: r })}>
                {potLabel(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Volume pot</span>
          <div className="seg">
            {[10e3, 25e3, 50e3, 100e3].map((r) => (
              <button key={r} className={boost.volPot === r ? 'on' : ''} onClick={() => set({ volPot: r })}>
                {potLabel(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Supply</span>
          <div className="seg">
            {([9, 18] as const).map((sv) => (
              <button key={sv} className={boost.supply === sv ? 'on' : ''} onClick={() => set({ supply: sv })}>
                {sv} V
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="muted small view-caption">Frequency response: your values (terracotta) vs the netlist (dashed)</p>
      <BoostResponseView boost={boost} />

      <table className="corner-table">
        <thead>
          <tr>
            <th>Corner</th>
            <th>Now</th>
            <th>Netlist</th>
            <th>Set by</th>
          </tr>
        </thead>
        <tbody>
          {corners.map((c) => {
            const moved = Math.abs(c.f - c.s) / c.s > 0.01;
            return (
              <tr key={c.label} className={moved ? 'moved' : ''} title={c.note}>
                <td>{c.label}</td>
                <td>{hz(c.f)}</td>
                <td className="muted">{hz(c.s)}</td>
                <td className="muted">{c.parts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        Corners below 20 Hz don't change the sound you hear; try a smaller C1 or C3 (or R1) to bring one into the
        audio band and cut bass. The output corner moves with the volume knob because C3 feeds the pot.
      </p>

      <div className="mods-head">
        <h3>Schematic</h3>
        <span className="muted inline">clean_boost_4558.cir · changed parts in amber</span>
      </div>
      <div className="schematic-wrap">
        <BoostSchematic boost={boost} />
      </div>
    </div>
  );
}

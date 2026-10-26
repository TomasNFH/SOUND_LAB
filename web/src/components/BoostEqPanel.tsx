import { boostEqResponseDb, boostEqValues } from '../audio/boost/boostEq';
import { STOCK_BOOST_EQ, type BoostEqSettings } from '../audio/settings';
import { BoostEqSchematic } from '../views/BoostEqSchematic';
import { CompareResponseView } from '../views/CompareResponseView';
import { fmt, Knob } from './Knob';
import { farads, hz, ohms, potLabel, snap } from './parts';

type Props = { eq: BoostEqSettings; onChange: (s: BoostEqSettings) => void };

type KnobKey = 'gainPos' | 'lowCut' | 'highCut' | 'bass' | 'treble' | 'mid' | 'freq' | 'width' | 'volPos';
const KNOBS: KnobKey[] = ['gainPos', 'lowCut', 'highCut', 'bass', 'treble', 'mid', 'freq', 'width', 'volPos'];

type PartKey = 'r1' | 'c1' | 'r2' | 'c2' | 'clc' | 'rlc' | 'rhc' | 'chc' | 'rb1' | 'cb1' | 'cb2' | 'rb2' | 'rb3' | 'ct1' | 'ct2' | 'rt3' | 'ra' | 'rb' | 'rq' | 'cres' | 'ca' | 'rf' | 'rs' | 'c3';
type Part = { key: PartKey; label: string; min: number; max: number; role: string };
type PotKey = 'gainPot' | 'lowCutPot' | 'highCutPot' | 'bassPot' | 'treblePot' | 'midPot' | 'freqPot' | 'qPot' | 'volPot';

// Parts by section of the circuit, named as in the netlist.
const SECTIONS: { name: string; parts: Part[] }[] = [
  {
    name: 'U2A boost',
    parts: [
      { key: 'c1', label: 'C1', min: 1e-9, max: 1e-6, role: 'input cap' },
      { key: 'r1', label: 'R1', min: 100e3, max: 10e6, role: 'input bias' },
      { key: 'r2', label: 'R2', min: 1e3, max: 100e3, role: 'sets gain' },
      { key: 'c2', label: 'C2', min: 1e-9, max: 100e-6, role: 'bass gain' },
    ],
  },
  {
    name: 'Cut block',
    parts: [
      { key: 'clc', label: 'CLC', min: 10e-9, max: 10e-6, role: 'low cut cap' },
      { key: 'rlc', label: 'RLC', min: 100, max: 10e3, role: 'low cut fixed' },
      { key: 'rhc', label: 'RHC', min: 10, max: 4.7e3, role: 'high cut fixed' },
      { key: 'chc', label: 'CHC', min: 1e-9, max: 1e-6, role: 'high cut cap' },
    ],
  },
  {
    name: 'U2B Baxandall',
    parts: [
      { key: 'rb1', label: 'RB1', min: 1e3, max: 100e3, role: 'bass in' },
      { key: 'cb1', label: 'CB1', min: 1e-9, max: 1e-6, role: 'bass corner' },
      { key: 'cb2', label: 'CB2', min: 1e-9, max: 1e-6, role: 'bass corner' },
      { key: 'rb2', label: 'RB2', min: 1e3, max: 100e3, role: 'bass out' },
      { key: 'rb3', label: 'RB3', min: 330, max: 33e3, role: 'bass to U2B' },
      { key: 'ct1', label: 'CT1', min: 100e-12, max: 100e-9, role: 'treble corner' },
      { key: 'ct2', label: 'CT2', min: 100e-12, max: 100e-9, role: 'treble corner' },
      { key: 'rt3', label: 'RT3', min: 330, max: 33e3, role: 'treble to U2B' },
    ],
  },
  {
    name: 'U1A mids · U1B gyrator',
    parts: [
      { key: 'ra', label: 'RA', min: 100, max: 10e3, role: 'mid range' },
      { key: 'rb', label: 'RB', min: 100, max: 10e3, role: 'mid range' },
      { key: 'rq', label: 'RQ', min: 10, max: 4.7e3, role: 'Q fixed' },
      { key: 'cres', label: 'CRES', min: 10e-9, max: 2.2e-6, role: 'mid frequency' },
      { key: 'ca', label: 'CA', min: 1e-9, max: 1e-6, role: 'gyrator cap' },
      { key: 'rf', label: 'RF', min: 470, max: 47e3, role: 'FREC fixed' },
      { key: 'rs', label: 'RS', min: 22, max: 2.2e3, role: 'gyrator series' },
    ],
  },
  {
    name: 'Output',
    parts: [{ key: 'c3', label: 'C3', min: 1e-9, max: 100e-6, role: 'output cap' }],
  },
];

const POTS: { key: PotKey; label: string; options: number[] }[] = [
  { key: 'gainPot', label: 'Boost pot', options: [100e3, 250e3, 500e3, 1e6] },
  { key: 'lowCutPot', label: 'Low cut pot', options: [5e3, 10e3, 25e3, 50e3] },
  { key: 'highCutPot', label: 'High cut pot', options: [500, 1e3, 2e3, 5e3] },
  { key: 'bassPot', label: 'Bass pot', options: [50e3, 100e3, 250e3] },
  { key: 'treblePot', label: 'Treble pot', options: [50e3, 100e3, 250e3] },
  { key: 'midPot', label: 'Mid pot', options: [5e3, 10e3, 25e3] },
  { key: 'freqPot', label: 'Freq pot', options: [50e3, 100e3, 250e3] },
  { key: 'qPot', label: 'Q pot', options: [500, 1e3, 2e3, 5e3] },
  { key: 'volPot', label: 'Volume pot', options: [10e3, 25e3, 50e3, 100e3] },
];

const isCap = (k: PartKey) => k.startsWith('c');
// Centre-detent controls: 0.5 is flat.
const centred = (v: number) => (Math.abs(v - 0.5) < 0.005 ? 'flat' : `${v > 0.5 ? '+' : '−'}${Math.round(Math.abs(v - 0.5) * 200)}%`);

export function BoostEqPanel({ eq, onChange }: Props) {
  const set = (patch: Partial<BoostEqSettings>) => onChange({ ...eq, ...patch });
  const knobsOf = (s: BoostEqSettings) => Object.fromEntries(KNOBS.map((k) => [k, s[k]])) as Pick<BoostEqSettings, KnobKey>;
  const stockAtKnobs: BoostEqSettings = { ...STOCK_BOOST_EQ, ...knobsOf(eq), bypass: eq.bypass };
  const v = boostEqValues(eq);
  const stock = boostEqValues(stockAtKnobs);
  const changedCount = (Object.keys(STOCK_BOOST_EQ) as (keyof BoostEqSettings)[]).filter(
    (k) => !(KNOBS as string[]).includes(k) && k !== 'bypass' && eq[k] !== STOCK_BOOST_EQ[k],
  ).length;
  const db = (x: number) => 20 * Math.log10(x);

  const corners = [
    { label: 'Input high-pass', f: v.corners.input, s: stock.corners.input, parts: 'C1 · R1' },
    { label: 'Boost starts rising', f: v.corners.shelfLow, s: stock.corners.shelfLow, parts: 'C2 · (R2 + boost)' },
    { label: 'Full boost from', f: v.corners.shelfHigh, s: stock.corners.shelfHigh, parts: 'C2 · R2' },
    { label: 'Op-amp limit (U2A)', f: v.corners.bandwidth, s: stock.corners.bandwidth, parts: '4558 GBW ÷ gain' },
    ...(eq.bypass
      ? []
      : [
          { label: 'Low cut ≈', f: v.corners.lowCut, s: stock.corners.lowCut, parts: 'CLC · (RLC + low cut pot)' },
          { label: 'High cut ≈', f: v.corners.highCut, s: stock.corners.highCut, parts: '(RHC + high cut pot) · CHC' },
        ]),
    { label: 'Bass shelf ≈', f: v.corners.bass, s: stock.corners.bass, parts: 'bass pot / 2 · CB' },
    { label: 'Treble shelf ≈', f: v.corners.treble, s: stock.corners.treble, parts: 'RT3 · CT' },
    { label: 'Mid centre', f: v.corners.mid, s: stock.corners.mid, parts: 'CRES with L = RS · (RF + FREC) · CA' },
    { label: 'Output high-pass', f: v.corners.output, s: stock.corners.output, parts: 'C3 · volume pot + amp' },
  ];

  return (
    <div className="boost">
      <div className="knobs">
        <Knob label="Boost" value={eq.gainPos} min={0} max={1} step={0.01} defaultValue={STOCK_BOOST_EQ.gainPos} format={fmt.pct} onChange={(gainPos) => set({ gainPos })} />
        <Knob label="Low cut" value={eq.lowCut} min={0} max={1} step={0.01} defaultValue={0} format={fmt.pct} onChange={(lowCut) => set({ lowCut })} />
        <Knob label="High cut" value={eq.highCut} min={0} max={1} step={0.01} defaultValue={0} format={fmt.pct} onChange={(highCut) => set({ highCut })} />
        <Knob label="Bass" value={eq.bass} min={0} max={1} step={0.01} defaultValue={0.5} format={centred} onChange={(bass) => set({ bass })} />
        <Knob label="Treble" value={eq.treble} min={0} max={1} step={0.01} defaultValue={0.5} format={centred} onChange={(treble) => set({ treble })} />
      </div>
      <div className="knobs">
        <Knob label="Mid" value={eq.mid} min={0} max={1} step={0.01} defaultValue={0.5} format={centred} onChange={(mid) => set({ mid })} />
        <Knob label="Freq" value={eq.freq} min={0} max={1} step={0.01} defaultValue={STOCK_BOOST_EQ.freq} format={() => hz(v.corners.mid)} onChange={(freq) => set({ freq })} />
        <Knob label="Q (width)" value={eq.width} min={0} max={1} step={0.01} defaultValue={0} format={fmt.pct} onChange={(width) => set({ width })} />
        <Knob label="Volume" value={eq.volPos} min={0} max={1} step={0.01} defaultValue={STOCK_BOOST_EQ.volPos} format={fmt.pct} onChange={(volPos) => set({ volPos })} />
      </div>
      <div className="switches">
        <div className="switch-row">
          <span className="switch-label">Cut block</span>
          <div className="seg">
            <button className={eq.bypass ? '' : 'on'} onClick={() => set({ bypass: false })}>
              Active
            </button>
            <button className={eq.bypass ? 'on' : ''} onClick={() => set({ bypass: true })}>
              Bypassed (SPDT)
            </button>
          </div>
        </div>
      </div>
      <p className="muted small">
        Boost {ohms(v.rGain)} → U2A gain ×{v.gain.toFixed(1)} (+{db(v.gain).toFixed(1)} dB), clipping above{' '}
        {(v.headroom / v.gain).toFixed(2)} V at the input. Mids centred at {hz(v.corners.mid)} (gyrator L ={' '}
        {v.inductance.toFixed(2)} H). Volume {db(v.outLevel).toFixed(1)} dB. The Baxandall inverts the phase; for a
        guitar alone it doesn't matter.
      </p>

      <div className="mods-head">
        <h3>Parts</h3>
        <span className="muted inline">{changedCount ? `${changedCount} changed from the netlist` : 'All as in the netlist'}</span>
        <button onClick={() => onChange({ ...STOCK_BOOST_EQ, ...knobsOf(eq), bypass: eq.bypass })} disabled={!changedCount}>
          Reset parts
        </button>
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.name}>
          <p className="muted small part-section">{sec.name}</p>
          <div className="boost-parts">
            {sec.parts.map((p) => (
              <div key={p.key} className={`boost-part ${eq[p.key] !== STOCK_BOOST_EQ[p.key] ? 'changed' : ''}`}>
                <Knob
                  size="small"
                  label={`${p.label} · ${p.role}`}
                  value={eq[p.key]}
                  min={p.min}
                  max={p.max}
                  scale="log"
                  defaultValue={STOCK_BOOST_EQ[p.key]}
                  format={isCap(p.key) ? farads : ohms}
                  onChange={(x) => set({ [p.key]: snap(x, STOCK_BOOST_EQ[p.key]) } as Partial<BoostEqSettings>)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="switches">
        {POTS.map((pot) => (
          <div key={pot.key} className="switch-row">
            <span className="switch-label">{pot.label}</span>
            <div className="seg">
              {pot.options.map((r) => (
                <button key={r} className={eq[pot.key] === r ? 'on' : ''} onClick={() => set({ [pot.key]: r } as Partial<BoostEqSettings>)}>
                  {potLabel(r)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="switch-row">
          <span className="switch-label">Supply</span>
          <div className="seg">
            {([9, 18] as const).map((sv) => (
              <button key={sv} className={eq.supply === sv ? 'on' : ''} onClick={() => set({ supply: sv })}>
                {sv} V
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="muted small view-caption">Frequency response: your values (terracotta) vs the netlist (dashed), same knobs</p>
      <CompareResponseView
        current={(f) => boostEqResponseDb(eq, f)}
        stock={(f) => boostEqResponseDb(stockAtKnobs, f)}
        marks={[
          ...(eq.bypass ? [] : ([[v.corners.lowCut, 'low cut'], [v.corners.highCut, 'high cut']] as [number, string][])),
          [v.corners.mid, 'mid'],
        ]}
        dbMin={-24}
        dbMax={48}
      />

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
          {corners.map((c) => (
            <tr key={c.label} className={Math.abs(c.f - c.s) / c.s > 0.01 ? 'moved' : ''}>
              <td>{c.label}</td>
              <td>{hz(c.f)}</td>
              <td className="muted">{hz(c.s)}</td>
              <td className="muted">{c.parts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Corners marked ≈ are the simple RC estimates: the stages load each other, and the curve above is the exact
        solution of the whole netlist. The mid control boosts or cuts around its centre; Q widens the bell and also
        lowers how far it goes.
      </p>

      <div className="mods-head">
        <h3>Schematic</h3>
        <span className="muted inline">boost_eq_cortes_bypass_2x4558.cir · changed parts in amber</span>
      </div>
      <div className="schematic-wrap">
        <BoostEqSchematic eq={eq} />
      </div>
    </div>
  );
}

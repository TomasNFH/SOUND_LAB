import { DIODES, drive4558ResponseDb, drive4558Values, type DiodeType } from '../audio/drive4558/drive4558';
import { STOCK_DRIVE4558, type Drive4558Settings } from '../audio/settings';
import { CompareResponseView } from '../views/CompareResponseView';
import { Drive4558Schematic } from '../views/Drive4558Schematic';
import { fmt, Knob } from './Knob';
import { farads, hz, ohms, potLabel, snap } from './parts';

type Props = { ts: Drive4558Settings; onChange: (t: Drive4558Settings) => void };

type PartKey = 'rIn' | 'cIn' | 'cCouple' | 'rBias' | 'rFixed' | 'cFb' | 'rGnd' | 'cGnd' | 'r7' | 'c6' | 'rTone' | 'r8' | 'c7' | 'rToneFb' | 'cOut' | 'rOut';
type Part = { key: PartKey; label: string; min: number; max: number; role: string };

// Parts grouped by the section of the circuit they belong to.
const SECTIONS: { name: string; parts: Part[] }[] = [
  {
    name: 'Input buffer',
    parts: [
      { key: 'cIn', label: 'C in', min: 1e-9, max: 1e-6, role: 'input cap' },
      { key: 'rIn', label: 'R in', min: 100e3, max: 10e6, role: 'input bias' },
      { key: 'cCouple', label: 'C couple', min: 1e-9, max: 10e-6, role: 'to IC1a' },
      { key: 'rBias', label: 'R bias', min: 1e3, max: 1e6, role: 'IC1a bias' },
    ],
  },
  {
    name: 'Clipping stage (IC1a)',
    parts: [
      { key: 'rFixed', label: 'R fixed', min: 1e3, max: 220e3, role: 'min gain' },
      { key: 'cFb', label: 'C fb', min: 10e-12, max: 1e-9, role: 'high cut' },
      { key: 'rGnd', label: 'R gnd', min: 1e3, max: 22e3, role: 'max gain' },
      { key: 'cGnd', label: 'C gnd', min: 10e-9, max: 1e-6, role: 'mid hump' },
    ],
  },
  {
    name: 'Tone stage (IC1b)',
    parts: [
      { key: 'r7', label: 'R7', min: 100, max: 10e3, role: 'treble roll-off' },
      { key: 'c6', label: 'C6', min: 10e-9, max: 1e-6, role: 'treble roll-off' },
      { key: 'rTone', label: 'R in', min: 100, max: 10e3, role: 'into IC1b' },
      { key: 'r8', label: 'R8', min: 47, max: 4.7e3, role: 'tone range' },
      { key: 'c7', label: 'C7', min: 10e-9, max: 1e-6, role: 'tone corner' },
      { key: 'rToneFb', label: 'R fb', min: 100, max: 10e3, role: 'treble boost' },
    ],
  },
  {
    name: 'Output',
    parts: [
      { key: 'cOut', label: 'C out', min: 1e-9, max: 10e-6, role: 'output cap' },
      { key: 'rOut', label: 'R out', min: 10, max: 10e3, role: 'series' },
    ],
  },
];

const isCap = (k: PartKey) => k.startsWith('c');
const POT_FIELDS = ['drive', 'tone', 'level'] as const;

export function Drive4558Panel({ ts, onChange }: Props) {
  const set = (patch: Partial<Drive4558Settings>) => onChange({ ...ts, ...patch });
  const v = drive4558Values(ts);
  const stockAtKnobs = { ...STOCK_DRIVE4558, drive: ts.drive, tone: ts.tone, level: ts.level };
  const stock = drive4558Values(stockAtKnobs);
  const changedCount = (Object.keys(STOCK_DRIVE4558) as (keyof Drive4558Settings)[]).filter(
    (k) => !(POT_FIELDS as readonly string[]).includes(k) && ts[k] !== STOCK_DRIVE4558[k],
  ).length;

  const corners = [
    { label: 'Input high-pass', f: v.corners.input, s: stock.corners.input, parts: 'C in · R in', note: 'Below this the pedal cuts.' },
    { label: 'Coupling high-pass', f: v.corners.coupling, s: stock.corners.coupling, parts: 'C couple · R bias', note: 'Bass into IC1a.' },
    { label: 'Gain starts rising', f: v.corners.gainRise, s: stock.corners.gainRise, parts: 'C gnd · (R fixed + drive)', note: 'Below this the clipping stage passes at ×1: clean bass.' },
    { label: 'Full gain (the hump)', f: v.corners.hump, s: stock.corners.hump, parts: 'C gnd · R gnd', note: 'Above this the mids get the full gain and clip first.' },
    { label: 'High cut in the loop', f: v.corners.highCut, s: stock.corners.highCut, parts: 'C fb · (R fixed + drive)', note: 'Comes down as the drive goes up.' },
    { label: 'Op-amp limit', f: v.corners.bandwidth, s: stock.corners.bandwidth, parts: '4558 GBW ÷ gain', note: 'More gain, less bandwidth.' },
    { label: 'Treble roll-off', f: v.corners.passiveLp, s: stock.corners.passiveLp, parts: 'R7 · C6', note: 'Takes the fizz off the clipping.' },
    { label: 'Tone shelf', f: v.corners.toneShelf, s: stock.corners.toneShelf, parts: 'R8 · C7', note: 'Where the tone knob cuts or boosts.' },
    { label: 'Output high-pass', f: v.corners.output, s: stock.corners.output, parts: 'C out · level pot', note: 'Almost always below hearing.' },
  ];
  const db = (x: number) => 20 * Math.log10(x);
  const clipIn = DIODES[ts.diodes].pos / (v.gain - 1);

  return (
    <div className="boost">
      <div className="knobs">
        <Knob label="Drive" value={ts.drive} min={0} max={1} step={0.01} defaultValue={STOCK_DRIVE4558.drive} format={fmt.pct} onChange={(drive) => set({ drive })} />
        <Knob label="Tone" value={ts.tone} min={0} max={1} step={0.01} defaultValue={STOCK_DRIVE4558.tone} format={fmt.pct} onChange={(tone) => set({ tone })} />
        <Knob label="Level" value={ts.level} min={0} max={1} step={0.01} defaultValue={STOCK_DRIVE4558.level} format={fmt.pct} onChange={(level) => set({ level })} />
      </div>
      <p className="muted small">
        Feedback {ohms(v.rDrive)} → IC1a gain ×{v.gain.toFixed(1)} ({db(v.gain).toFixed(1)} dB) above{' '}
        {hz(v.corners.hump)}, unity in the bass.{' '}
        {ts.diodes === 'none'
          ? `No diodes: it clips on the op-amp rails (±${v.headroom.toFixed(1)} V).`
          : `The diodes start clipping at about ${(clipIn * 1000).toFixed(0)} mV at the input (mids).`}{' '}
        Level {db(v.level).toFixed(1)} dB.
      </p>

      <div className="mods-head">
        <h3>Parts</h3>
        <span className="muted inline">{changedCount ? `${changedCount} changed from stock` : 'All stock'}</span>
        <button onClick={() => onChange({ ...STOCK_DRIVE4558, drive: ts.drive, tone: ts.tone, level: ts.level })} disabled={!changedCount}>
          Reset parts
        </button>
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.name}>
          <p className="muted small part-section">{sec.name}</p>
          <div className="boost-parts">
            {sec.parts.map((p) => {
              const changed = ts[p.key] !== STOCK_DRIVE4558[p.key];
              return (
                <div key={p.key} className={`boost-part ${changed ? 'changed' : ''}`}>
                  <Knob
                    size="small"
                    label={`${p.label} · ${p.role}`}
                    value={ts[p.key]}
                    min={p.min}
                    max={p.max}
                    scale="log"
                    defaultValue={STOCK_DRIVE4558[p.key]}
                    format={isCap(p.key) ? farads : ohms}
                    onChange={(x) => set({ [p.key]: snap(x, STOCK_DRIVE4558[p.key]) } as Partial<Drive4558Settings>)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="switches">
        <div className="switch-row">
          <span className="switch-label">Diodes</span>
          <div className="seg">
            {(Object.keys(DIODES) as DiodeType[]).map((k) => (
              <button key={k} className={ts.diodes === k ? 'on' : ''} title={DIODES[k].name} onClick={() => set({ diodes: k })}>
                {k === 'si' ? 'Silicon' : k === 'ge' ? 'Germanium' : k === 'led' ? 'LED' : k === 'asym' ? 'Asym' : 'None'}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Drive pot</span>
          <div className="seg">
            {[100e3, 250e3, 500e3, 1e6].map((r) => (
              <button key={r} className={ts.drivePot === r ? 'on' : ''} onClick={() => set({ drivePot: r })}>
                {potLabel(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Tone pot</span>
          <div className="seg">
            {[10e3, 20e3, 50e3, 100e3].map((r) => (
              <button key={r} className={ts.tonePot === r ? 'on' : ''} onClick={() => set({ tonePot: r })}>
                {potLabel(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Level pot</span>
          <div className="seg">
            {[10e3, 50e3, 100e3, 250e3].map((r) => (
              <button key={r} className={ts.levelPot === r ? 'on' : ''} onClick={() => set({ levelPot: r })}>
                {potLabel(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span className="switch-label">Supply</span>
          <div className="seg">
            {([9, 18] as const).map((sv) => (
              <button key={sv} className={ts.supply === sv ? 'on' : ''} onClick={() => set({ supply: sv })}>
                {sv} V
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="muted small view-caption">Frequency response before clipping: your values (terracotta) vs stock (dashed), same knobs</p>
      <CompareResponseView
        current={(f) => drive4558ResponseDb(ts, f)}
        stock={(f) => drive4558ResponseDb(stockAtKnobs, f)}
        marks={[
          [v.corners.gainRise, 'gain ×1'],
          [v.corners.hump, 'hump'],
          [v.corners.passiveLp, 'R7·C6'],
          [v.corners.toneShelf, 'tone'],
        ]}
        dbMin={-30}
        dbMax={42}
      />

      <table className="corner-table">
        <thead>
          <tr>
            <th>Corner</th>
            <th>Now</th>
            <th>Stock</th>
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
        The mid hump is the gap between "gain starts rising" and "full gain": everything above it gets the full gain and
        hits the diodes, the bass stays clean. A bigger C gnd lowers the hump (fuller, like the 340 Hz mod); a smaller
        one makes it thinner. The response is the small-signal curve: once the diodes clip, the gain flattens out.
      </p>

      <div className="mods-head">
        <h3>Schematic</h3>
        <span className="muted inline">Classic op-amp overdrive with a JRC4558 · changed parts in amber</span>
      </div>
      <div className="schematic-wrap">
        <Drive4558Schematic ts={ts} />
      </div>
      <p className="muted small">
        Values from the commonly published schematic of this classic circuit. The two transistor buffers (Q1, Q2) are drawn but modelled
        as perfect followers; the bypass switching and power filtering are left out.
      </p>
    </div>
  );
}

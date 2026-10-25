import { flatKnobs, interstageResponseDb, powerTube, stageGains, stockKnobs, testPoints } from '../audio/champ/circuit';
import { MODS } from '../audio/champ/mods';
import { STOCK_CHAMP, type AmpSettings, type ChampSettings } from '../audio/settings';
import { fmt, Knob } from './Knob';

type Props = {
  amp: AmpSettings;
  onChange: (amp: AmpSettings) => void;
  otherBranch: string; // 'A' or 'B'
  onStockToOther: () => void;
};

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };
const db = (x: number) => 20 * Math.log10(x);

// Controls for the Champion 600 circuit model: the real amp's one knob,
// and every mod as a switch, stock first.
export function ChampPanel({ amp, onChange, otherBranch, onStockToOther }: Props) {
  const champ = amp.champ;
  const set = (patch: Partial<ChampSettings>) => onChange({ ...amp, champ: { ...champ, ...patch } });
  const g = stageGains(champ);
  const pt = powerTube(champ.bias);
  const changed = MODS.filter((m) => champ[m.key] !== STOCK_CHAMP[m.key]).length;
  const stockPos = stockKnobs(champ.midPot);
  // Level through the stack at 1 kHz, volume full up: shows the loss
  // shrinking as the middle pot gets bigger.
  const stackDb = interstageResponseDb(champ, 1, new Float32Array([1000]))[0];

  return (
    <div className="champ">
      <div className="knobs">
        <Knob label="Volume" value={amp.volume} {...unit} defaultValue={0.4} onChange={(volume) => onChange({ ...amp, volume })} />
      </div>
      <p className="muted small">
        The real amp's only control: a 1 MΩ audio-taper pot after the tone stack, so it sets how hard the second
        tube and the 6V6 are driven.
      </p>

      <div className="mods-head">
        <h3>Mods</h3>
        <span className="muted inline">{changed ? `${changed} changed from stock` : 'All stock'}</span>
        <button onClick={() => onChange({ ...amp, champ: structuredClone(STOCK_CHAMP) })} disabled={!changed}>
          Reset to stock
        </button>
        <button onClick={onStockToOther} title={`Branch ${otherBranch} gets this amp with every mod undone`}>
          Stock in branch {otherBranch}
        </button>
      </div>

      <div className="mods">
        {MODS.map((m) => {
          const isChanged = champ[m.key] !== STOCK_CHAMP[m.key];
          return (
            <div key={m.key} className={`mod ${isChanged ? 'changed' : ''}`}>
              <div className="mod-label">
                <span>{m.label}</span>
                <span className="mod-part">{m.part}</span>
              </div>
              <div className="seg">
                {m.options.map((o) => (
                  <button
                    key={String(o.value)}
                    className={champ[m.key] === o.value ? 'on' : ''}
                    onClick={() => set({ [m.key]: o.value } as Partial<ChampSettings>)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {isChanged && <p className="muted small mod-note">{m.listen}</p>}
              {isChanged && m.estimate && <p className="muted small mod-note">{m.estimate}</p>}
              {m.key === 'toneStack' && champ.toneStack === 'knobs' && (
                <div className="mod-knobs">
                  <div className="knobs">
                    <Knob size="small" label="Treble" value={champ.treble} {...unit} defaultValue={stockPos.treble} onChange={(treble) => set({ treble })} />
                    <Knob size="small" label="Bass" value={champ.bass} {...unit} defaultValue={stockPos.bass} onChange={(bass) => set({ bass })} />
                    <Knob size="small" label="Middle" value={champ.middle} {...unit} defaultValue={stockPos.middle} onChange={(middle) => set({ middle })} />
                  </div>
                  <div className="switch-row mid-pot">
                    <span className="switch-label">Middle pot</span>
                    <div className="seg">
                      {([25, 50, 100, 250] as const).map((k) => (
                        <button key={k} className={champ.midPot === k ? 'on' : ''} onClick={() => set({ midPot: k })}>
                          {k}k
                        </button>
                      ))}
                    </div>
                    <span className="muted inline">{stackDb.toFixed(1)} dB at 1 kHz</span>
                  </div>
                  <p className="muted small">
                    Treble and bass are 250k; the middle pot is {champ.midPot}k
                    {champ.midPot === 25 ? ' (the usual Fender value)' : ', bigger than Fender’s 25k: the stack loses less level, so the amp is louder and breaks up sooner'}
                    . At {fmt.pct(stockPos.treble)} / {fmt.pct(stockPos.bass)} / {fmt.pct(stockPos.middle)} the knobs match the stock
                    resistors exactly. Treble 0, bass low and middle full up is the flattest a Fender stack gets.{' '}
                    <button className="link" onClick={() => set({ ...stockPos })}>
                      Set to stock
                    </button>{' '}
                    ·{' '}
                    <button className="link" onClick={() => set({ ...flatKnobs(champ.midPot) })}>
                      Flat
                    </button>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="champ-readout">
        <span>
          V2-A gain ×{g.a.aHf.toFixed(0)} ({g.a.tz ? `×${g.a.aLf.toFixed(0)} in the deep bass` : 'flat'})
        </span>
        <span>
          V2-B gain ×{g.b.aHf.toFixed(0)}
          {g.b.tz ? '' : ' (C10 removed)'}
        </span>
        <span>Feedback {g.beta ? `${(g.beta * 100).toFixed(1)}% of the speaker signal` : 'off'}</span>
        <span>
          6V6: {(pt.ik * 1000).toFixed(0)} mA, about {pt.plateWatts.toFixed(1)} W on the plate
          {pt.plateWatts > 12 ? ' (above the usual 12 W rating)' : ''}
        </span>
      </div>

      <details className="testpoints">
        <summary>Test points: model vs Fender service manual</summary>
        <p className="muted small">25 mV at 1 kHz into High, volume full up, as in the service manual.</p>
        <table>
          <thead>
            <tr>
              <th>Point</th>
              <th>Where</th>
              <th>Model</th>
              <th>Fender</th>
            </tr>
          </thead>
          <tbody>
            {testPoints(champ).map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.label}</td>
                <td>{p.model < 1 ? `${(p.model * 1000).toFixed(0)} mV` : `${p.model.toFixed(2)} V`}</td>
                <td>
                  {p.fender < 1 ? `${(p.fender * 1000).toFixed(0)} mV` : `${p.fender} V`}
                  <span className="muted"> ({db(p.model / p.fender) >= 0 ? '+' : ''}{db(p.model / p.fender).toFixed(1)} dB)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">With mods the model column moves away from Fender's: that is the mod's effect on gain.</p>
      </details>
    </div>
  );
}

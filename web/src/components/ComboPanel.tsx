import { flatKnobs, interstageResponseDb, powerTube, stageGains, stockKnobs, testPoints } from '../audio/combo/circuit';
import { MODS } from '../audio/combo/mods';
import { STOCK_COMBO, type AmpSettings, type ComboSettings } from '../audio/settings';
import { fmt, Knob } from './Knob';
import { PedalBox } from './PedalBox';

type Props = {
  amp: AmpSettings;
  onChange: (amp: AmpSettings) => void;
  otherBranch: string; // 'A' or 'B'
  onStockToOther: () => void;
  // The amp head's power switch.
  box: { on: boolean; onToggle: () => void };
};

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };
const db = (x: number) => 20 * Math.log10(x);

// Controls for the 6V6 combo circuit model: the real amp's one knob,
// and every mod as a switch, stock first.
export function ComboPanel({ amp, onChange, otherBranch, onStockToOther, box }: Props) {
  const combo = amp.champ;
  const set = (patch: Partial<ComboSettings>) => onChange({ ...amp, champ: { ...combo, ...patch } });
  const g = stageGains(combo);
  const pt = powerTube(combo.bias);
  const changed = MODS.filter((m) => combo[m.key] !== STOCK_COMBO[m.key]).length;
  const stockPos = stockKnobs(combo.midPot);
  // Level through the stack at 1 kHz, volume full up: shows the loss
  // shrinking as the middle pot gets bigger.
  const stackDb = interstageResponseDb(combo, 1, new Float32Array([1000]))[0];

  return (
    <div className={`combo ${box.on ? '' : 'pedal-off'}`}>
      <div className="pedal-stage">
        <PedalBox name="Combo" subtitle="6V6" paint="amp" shape="amp" lettering="script" {...box}>
          <Knob label="Volume" value={amp.volume} {...unit} defaultValue={0.4} onChange={(volume) => onChange({ ...amp, volume })} />
        </PedalBox>
      </div>
      <p className="muted small">
        The real amp's only control: a 1 MΩ audio-taper pot after the tone stack, so it sets how hard the second
        tube and the 6V6 are driven.
      </p>

      <div className="mods-head">
        <h3>Mods</h3>
        <span className="muted inline">{changed ? `${changed} changed from stock` : 'All stock'}</span>
        <button onClick={() => onChange({ ...amp, champ: structuredClone(STOCK_COMBO) })} disabled={!changed}>
          Reset to stock
        </button>
        <button onClick={onStockToOther} title={`Branch ${otherBranch} gets this amp with every mod undone`}>
          Stock in branch {otherBranch}
        </button>
      </div>

      <div className="mods">
        {MODS.map((m) => {
          const isChanged = combo[m.key] !== STOCK_COMBO[m.key];
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
                    className={combo[m.key] === o.value ? 'on' : ''}
                    onClick={() => set({ [m.key]: o.value } as Partial<ComboSettings>)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {isChanged && <p className="muted small mod-note">{m.listen}</p>}
              {isChanged && m.estimate && <p className="muted small mod-note">{m.estimate}</p>}
              {m.key === 'toneStack' && combo.toneStack === 'knobs' && (
                <div className="mod-knobs">
                  <div className="knobs">
                    <Knob size="small" label="Treble" value={combo.treble} {...unit} defaultValue={stockPos.treble} onChange={(treble) => set({ treble })} />
                    <Knob size="small" label="Bass" value={combo.bass} {...unit} defaultValue={stockPos.bass} onChange={(bass) => set({ bass })} />
                    <Knob size="small" label="Middle" value={combo.middle} {...unit} defaultValue={stockPos.middle} onChange={(middle) => set({ middle })} />
                  </div>
                  <div className="switch-row mid-pot">
                    <span className="switch-label">Middle pot</span>
                    <div className="seg">
                      {([25, 50, 100, 250] as const).map((k) => (
                        <button key={k} className={combo.midPot === k ? 'on' : ''} onClick={() => set({ midPot: k })}>
                          {k}k
                        </button>
                      ))}
                    </div>
                    <span className="muted inline">{stackDb.toFixed(1)} dB at 1 kHz</span>
                  </div>
                  <p className="muted small">
                    Treble and bass are 250k; the middle pot is {combo.midPot}k
                    {combo.midPot === 25 ? ' (the usual value)' : ', bigger than the usual 25k: the stack loses less level, so the amp is louder and breaks up sooner'}
                    . At {fmt.pct(stockPos.treble)} / {fmt.pct(stockPos.bass)} / {fmt.pct(stockPos.middle)} the knobs match the stock
                    resistors exactly. Treble 0, bass low and middle full up is the flattest this kind of stack gets.{' '}
                    <button className="link" onClick={() => set({ ...stockPos })}>
                      Set to stock
                    </button>{' '}
                    ·{' '}
                    <button className="link" onClick={() => set({ ...flatKnobs(combo.midPot) })}>
                      Flat
                    </button>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="combo-readout">
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
        <summary>Test points: model vs the service manual</summary>
        <p className="muted small">25 mV at 1 kHz into High, volume full up, as in the service manual.</p>
        <table>
          <thead>
            <tr>
              <th>Point</th>
              <th>Where</th>
              <th>Model</th>
              <th>Manual</th>
            </tr>
          </thead>
          <tbody>
            {testPoints(combo).map((p) => (
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
        <p className="muted small">With mods the model column moves away from the manual's: that is the mod's effect on gain.</p>
      </details>
    </div>
  );
}

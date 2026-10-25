import { useState } from 'react';
import { EqPanel } from '../components/EqPanel';
import { fmt, Knob } from '../components/Knob';
import type { BassCab, BassSettings } from './BassRig';
import { DEFAULT_BASS } from './BassRig';
import { live, type InputChannel } from './LiveEngine';

type BassBlock = 'octave' | 'amp' | 'eq';
type Opened = BassBlock | 'output';

const CABS: { id: BassCab; label: string }[] = [
  { id: '410', label: '4×10"' },
  { id: '115', label: '1×15"' },
  { id: 'off', label: 'Off' },
];

const CHANNEL_NAMES: Record<InputChannel, string> = { left: 'Input 1', right: 'Input 2', both: 'Inputs 1 + 2' };

const Arrow = () => (
  <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
    <path d="M1 6h19M15 1.5 21 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PowerIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M8 2v6M4.5 4.5a5 5 0 1 0 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// What each block in the chain shows under its name.
function describe(b: BassSettings, block: BassBlock): { label: string; on: boolean; detail: string } {
  if (block === 'octave') return { label: 'Octave', on: b.octaveOn, detail: `${fmt.pct(b.octave)} · ${fmt.hz(b.tracking)}` };
  if (block === 'amp') {
    const cab = CABS.find((c) => c.id === b.cab)?.label ?? '';
    return { label: 'Bass amp', on: b.ampOn, detail: `${b.cab === 'off' ? 'no cab' : cab} · drive ${fmt.pct(b.drive)}` };
  }
  const shaped = b.eq.bands.filter((band) => band.on && band.gain !== 0).length;
  return { label: 'Parametric EQ', on: b.eq.on, detail: shaped ? `${shaped} band${shaped > 1 ? 's' : ''} shaped` : 'flat' };
}

// Live's bass, laid out like a Tone Lab chain: guitar into octave, bass amp
// and EQ, each with a power switch. Tap a block to open its controls below.
export function BassPanel({ bass, channel }: { bass: BassSettings; channel: InputChannel }) {
  const [open, setOpen] = useState<Opened>('octave');
  const set = (patch: Partial<BassSettings>) => live.setBass(patch);
  const toggle = (block: BassBlock) => {
    if (block === 'octave') set({ octaveOn: !bass.octaveOn });
    else if (block === 'amp') set({ ampOn: !bass.ampOn });
    else set({ eq: { ...bass.eq, on: !bass.eq.on } });
  };
  const d = DEFAULT_BASS;

  return (
    <>
      <section className="matrix-wrap" aria-label="Bass chain">
        <div className="matrix">
          <div className="mx-end">
            <span className="chain-label">Guitar</span>
            <span className="chain-detail">{CHANNEL_NAMES[channel]}</span>
          </div>
          <span className="mx-link" aria-hidden="true">
            <Arrow />
          </span>
          <div className="bass-blocks">
            {(['octave', 'amp', 'eq'] as BassBlock[]).map((block) => {
              const info = describe(bass, block);
              const sel = open === block;
              return (
                <div key={block} className={['mx-cell', info.on ? '' : 'off', sel ? 'selected' : ''].filter(Boolean).join(' ')}>
                  <button
                    className="chain-main"
                    onClick={() => setOpen(block)}
                    aria-pressed={sel}
                    aria-label={`${info.label}: ${info.on ? info.detail : 'off'}`}
                  >
                    <span className="chain-label">{info.label}</span>
                    <span className="chain-detail">{info.on ? info.detail : 'off'}</span>
                  </button>
                  <button
                    className={`chain-power ${info.on ? 'is-on' : ''}`}
                    onClick={() => toggle(block)}
                    aria-label={`${info.on ? 'Turn off' : 'Turn on'} ${info.label}`}
                    title={info.on ? 'Turn off' : 'Turn on'}
                  >
                    <PowerIcon />
                  </button>
                </div>
              );
            })}
          </div>
          <span className="mx-link" aria-hidden="true">
            <Arrow />
          </span>
          <button
            className={`mx-end mx-output ${open === 'output' ? 'selected' : ''}`}
            onClick={() => setOpen('output')}
            aria-pressed={open === 'output'}
          >
            <span className="chain-label">Output</span>
            <span className="chain-detail">level {fmt.db(bass.level)}</span>
          </button>
        </div>
      </section>

      {open === 'octave' && (
        <section className={`panel ${bass.octaveOn ? '' : 'block-off'}`}>
          <div className="panel-head">
            <h2>Octave</h2>
            {!bass.octaveOn && <span className="muted small inline">Off: the guitar goes on unchanged</span>}
          </div>
          <p className="muted small">
            One octave down, like a bass. It follows one note at a time: play single notes on the low strings, with the
            neck pickup and the tone knob down a little. Chords make it warble.
          </p>
          <div className="knobs">
            <Knob label="Octave" value={bass.octave} min={0} max={1} step={0.01} defaultValue={d.octave} format={fmt.pct} onChange={(octave) => set({ octave })} />
            <Knob label="Guitar" value={bass.guitar} min={0} max={1} step={0.01} defaultValue={d.guitar} format={fmt.pct} onChange={(guitar) => set({ guitar })} />
            <Knob label="Tracking" value={bass.tracking} min={120} max={600} scale="log" defaultValue={d.tracking} format={fmt.hz} onChange={(tracking) => set({ tracking: Math.round(tracking) })} />
          </div>
          <p className="muted small">
            Guitar adds a little of the original for attack. Tracking: lower follows low notes most cleanly, higher
            reaches notes up the neck; turn it down if the octave jumps around.
          </p>
        </section>
      )}

      {open === 'amp' && (
        <section className={`panel ${bass.ampOn ? '' : 'block-off'}`}>
          <div className="panel-head">
            <h2>Bass amp</h2>
            {!bass.ampOn && <span className="muted small inline">Off: no compressor, drive, tone or cabinet</span>}
          </div>
          <div className="knobs">
            <Knob label="Compressor" value={bass.compress} min={0} max={1} step={0.01} defaultValue={d.compress} format={fmt.pct} onChange={(compress) => set({ compress })} />
            <Knob label="Drive" value={bass.drive} min={0} max={1} step={0.01} defaultValue={d.drive} format={fmt.pct} onChange={(drive) => set({ drive })} />
            <Knob label="Bass" value={bass.bass} min={-12} max={12} step={0.5} defaultValue={d.bass} format={fmt.db} onChange={(v) => set({ bass: v })} />
            <Knob label="Mid" value={bass.mid} min={-12} max={12} step={0.5} defaultValue={d.mid} format={fmt.db} onChange={(mid) => set({ mid })} />
            <Knob label="Mid freq" value={bass.midFreq} min={200} max={1500} scale="log" defaultValue={d.midFreq} format={fmt.hz} onChange={(midFreq) => set({ midFreq: Math.round(midFreq) })} />
            <Knob label="Treble" value={bass.treble} min={-12} max={12} step={0.5} defaultValue={d.treble} format={fmt.db} onChange={(treble) => set({ treble })} />
          </div>
          <div className="live-row" style={{ marginTop: 12 }}>
            <span className="switch-label">Cabinet</span>
            <div className="seg" role="group" aria-label="Bass cabinet">
              {CABS.map((c) => (
                <button key={c.id} className={bass.cab === c.id ? 'on' : ''} onClick={() => set({ cab: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            4×10" is tight with a little bite; 1×15" is deeper and rounder. Mid between 400 and 800 Hz is where a bass
            cuts through a band.
          </p>
          <button
            className="link-btn"
            onClick={() => set({ ...DEFAULT_BASS, octaveOn: bass.octaveOn, ampOn: bass.ampOn, eq: bass.eq, level: bass.level })}
          >
            Reset octave and amp knobs
          </button>
        </section>
      )}

      {open === 'output' && (
        <section className="panel">
          <h2>Output</h2>
          <div className="knobs">
            <Knob label="Level" value={bass.level} min={-24} max={12} step={0.5} defaultValue={d.level} format={fmt.db} onChange={(level) => set({ level })} />
          </div>
          <p className="muted small">
            The level of the whole bass sound. At 0 dB it comes out about as loud as the guitar goes in, whichever blocks
            are on, so you can switch them off and on without jumps.
          </p>
        </section>
      )}

      {open === 'eq' && (
        <div className={bass.eq.on ? '' : 'block-off'}>
          <EqPanel eq={bass.eq} onChange={(eq) => set({ eq })} onActiveBand={() => {}} showPosition={false} />
        </div>
      )}
    </>
  );
}

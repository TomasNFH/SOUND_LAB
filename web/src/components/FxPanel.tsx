import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILT_IN_REVERBS } from '../audio/blocks/Reverb';
import type { DelaySettings, ReverbSettings, ToneSettings } from '../audio/settings';
import { listFiles, uploadFile, type AudioFile } from '../api';
import { fmt, Knob } from './Knob';

type Props = {
  settings: ToneSettings;
  onChange: (patch: Partial<Pick<ToneSettings, 'delay' | 'reverb' | 'fxPosition'>>) => void;
  // Show just one of the two effects (each has its own block in the chain).
  only?: 'delay' | 'reverb';
};

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };

export function FxPanel({ settings, onChange, only }: Props) {
  const { delay, reverb, fxPosition } = settings;
  const setDelay = (p: Partial<DelaySettings>) => onChange({ delay: { ...delay, ...p } });
  const setReverb = (p: Partial<ReverbSettings>) => onChange({ reverb: { ...reverb, ...p } });
  const [irs, setIrs] = useState<AudioFile[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setIrs(await listFiles('reverbs'));
    } catch {
      setIrs(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addIr = async (file: File) => {
    try {
      const saved = await uploadFile('reverbs', file, file.name);
      await refresh();
      setReverb({ type: saved.name });
      setStatus(`Added ${saved.name}.`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{only === 'delay' ? 'Delay' : only === 'reverb' ? 'Reverb' : 'Delay and reverb'}</h2>
        <div className="seg" role="group" aria-label="Position">
          {(['pre', 'post'] as const).map((p) => (
            <button key={p} className={fxPosition === p ? 'on' : ''} onClick={() => onChange({ fxPosition: p })}>
              {p === 'pre' ? 'Before amp' : 'After amp'}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        After the amp (an effects loop) the echoes stay clean. Before it, the amp distorts the echoes and tail too.
      </p>

      {only !== 'reverb' && (
        <div className="fx-block">
          <div className="panel-head">
            <label className="check sub-title">
              <input type="checkbox" checked={delay.on} onChange={(e) => setDelay({ on: e.target.checked })} />
              Delay
            </label>
            <div className="seg">
              {(['digital', 'tape'] as const).map((m) => (
                <button key={m} className={delay.mode === m ? 'on' : ''} onClick={() => setDelay({ mode: m })}>
                  {m === 'digital' ? 'Digital' : 'Tape'}
                </button>
              ))}
            </div>
          </div>
          <div className={`knobs ${delay.on ? '' : 'disabled'}`}>
            <Knob size="small" label="Time" value={delay.time} min={0.05} max={1.2} scale="log" defaultValue={0.38} format={fmt.ms} onChange={(time) => setDelay({ time })} />
            <Knob size="small" label="Feedback" value={delay.feedback} min={0} max={0.95} step={0.01} defaultValue={0.45} format={fmt.pct} onChange={(feedback) => setDelay({ feedback })} />
            <Knob size="small" label="Mix" value={delay.mix} {...unit} defaultValue={0.35} onChange={(mix) => setDelay({ mix })} />
            {delay.mode === 'tape' && (
              <>
                <Knob size="small" label="Tone" value={delay.tone} {...unit} defaultValue={0.4} onChange={(tone) => setDelay({ tone })} />
                <Knob size="small" label="Wow" value={delay.wow} {...unit} defaultValue={0.3} onChange={(wow) => setDelay({ wow })} />
              </>
            )}
          </div>
        </div>
      )}

      {only !== 'delay' && (
        <div className="fx-block">
          <div className="panel-head">
            <label className="check sub-title">
              <input type="checkbox" checked={reverb.on} onChange={(e) => setReverb({ on: e.target.checked })} />
              Reverb
            </label>
            <select className="compact" value={reverb.type} onChange={(e) => setReverb({ type: e.target.value })}>
              {Object.entries(BUILT_IN_REVERBS).map(([id, r]) => (
                <option key={id} value={id}>
                  {r.name}
                </option>
              ))}
              {irs?.map((ir) => (
                <option key={ir.name} value={ir.name}>
                  {ir.name}
                </option>
              ))}
            </select>
            {irs !== null && <button onClick={() => fileInput.current?.click()}>Add IR…</button>}
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.wav"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addIr(file);
                e.target.value = '';
              }}
            />
          </div>
          <div className={`knobs ${reverb.on ? '' : 'disabled'}`}>
            <Knob size="small" label="Mix" value={reverb.mix} {...unit} defaultValue={0.3} onChange={(mix) => setReverb({ mix })} />
            <Knob size="small" label="Tone" value={reverb.tone} {...unit} defaultValue={0.6} onChange={(tone) => setReverb({ tone })} />
          </div>
          {status && <p className="muted small">{status}</p>}
        </div>
      )}
    </section>
  );
}

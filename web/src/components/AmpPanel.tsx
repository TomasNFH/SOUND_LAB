import { useCallback, useEffect, useRef, useState } from 'react';
import type { AmpSettings } from '../audio/settings';
import { listFiles, uploadFile, type AudioFile } from '../api';
import { fmt, Knob } from './Knob';

type Props = {
  amp: AmpSettings;
  onChange: (amp: AmpSettings) => void;
};

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };

export function AmpPanel({ amp, onChange }: Props) {
  const [irs, setIrs] = useState<AudioFile[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<AmpSettings>) => onChange({ ...amp, ...patch });

  const refresh = useCallback(async () => {
    try {
      setIrs(await listFiles('cabinets'));
    } catch {
      setIrs(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addIr = async (file: File) => {
    try {
      const saved = await uploadFile('cabinets', file, file.name);
      await refresh();
      set({ cab: saved.name });
      setStatus(`Added ${saved.name}.`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Amp · Champion 600 style</h2>
        <label className="check">
          <input type="checkbox" checked={amp.on} onChange={(e) => set({ on: e.target.checked })} />
          On
        </label>
      </div>
      <p className="muted small">
        Volume drives the preamp and power stage: low is clean, high breaks up. Try the same pedal at both.
      </p>

      <div className={amp.on ? '' : 'disabled'}>
        <div className="knobs">
          <Knob label="Volume" value={amp.volume} {...unit} defaultValue={0.3} onChange={(volume) => set({ volume })} />
          <Knob label="Bass" value={amp.bass} {...unit} defaultValue={0.5} onChange={(bass) => set({ bass })} />
          <Knob label="Middle" value={amp.middle} {...unit} defaultValue={0.5} onChange={(middle) => set({ middle })} />
          <Knob label="Treble" value={amp.treble} {...unit} defaultValue={0.6} onChange={(treble) => set({ treble })} />
        </div>
        <div className="switches">
          <div className="switch-row">
            <span className="switch-label">Cabinet</span>
            <select className="compact" value={amp.cab} onChange={(e) => set({ cab: e.target.value })}>
              <option value="builtin">Built-in small combo</option>
              <option value="off">Off (no speaker)</option>
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
        </div>
        <p className="muted small">
          {amp.cab === 'off'
            ? 'Without a speaker, distortion sounds fizzy: the cabinet is what cuts the harsh highs.'
            : 'Speaker cabinet as an impulse response (convolution). Add your own cab IR WAVs to compare.'}
        </p>
        {status && <p className="muted small">{status}</p>}
      </div>
    </section>
  );
}

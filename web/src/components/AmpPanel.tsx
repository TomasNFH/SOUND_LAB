import { useCallback, useEffect, useRef, useState } from 'react';
import { SPEAKER_MOD } from '../audio/champ/mods';
import { BUILT_IN_CABS } from '../audio/ir';
import type { AmpSettings } from '../audio/settings';
import { listFiles, uploadFile, type AudioFile } from '../api';
import { ChampPanel } from './ChampPanel';
import { fmt, Knob } from './Knob';

type Props = {
  amp: AmpSettings;
  onChange: (amp: AmpSettings) => void;
  otherBranch: string;
  onStockToOther: () => void;
};

const unit = { min: 0, max: 1, step: 0.01, format: fmt.pct };

export function AmpPanel({ amp, onChange, otherBranch, onStockToOther }: Props) {
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
        <h2>Amp</h2>
        <label className="check">
          <input type="checkbox" checked={amp.on} onChange={(e) => set({ on: e.target.checked })} />
          On
        </label>
        <div className="seg" role="group" aria-label="Amp model">
          <button className={amp.model === 'champ600' ? 'on' : ''} onClick={() => set({ model: 'champ600' })}>
            Champion 600
          </button>
          <button className={amp.model === 'generic' ? 'on' : ''} onClick={() => set({ model: 'generic' })}>
            Generic
          </button>
        </div>
      </div>
      <p className="muted small">
        {amp.model === 'champ600'
          ? 'Built from the Fender service schematic (722CAX003): two 12AX7 stages, a fixed tone stack, a single-ended 6V6 and its feedback loop.'
          : 'A hand-tuned small Fender combo. Volume drives the preamp and power stage: low is clean, high breaks up.'}
      </p>

      <div className={amp.on ? '' : 'disabled'}>
        {amp.model === 'champ600' ? (
          <ChampPanel amp={amp} onChange={onChange} otherBranch={otherBranch} onStockToOther={onStockToOther} />
        ) : (
          <div className="knobs">
            <Knob label="Volume" value={amp.volume} {...unit} defaultValue={0.3} onChange={(volume) => set({ volume })} />
            <Knob label="Bass" value={amp.bass} {...unit} defaultValue={0.5} onChange={(bass) => set({ bass })} />
            <Knob label="Middle" value={amp.middle} {...unit} defaultValue={0.5} onChange={(middle) => set({ middle })} />
            <Knob label="Treble" value={amp.treble} {...unit} defaultValue={0.6} onChange={(treble) => set({ treble })} />
          </div>
        )}
        <div className="switches">
          <div className="switch-row">
            <span className="switch-label">Cabinet</span>
            <select className="compact" value={amp.cab} onChange={(e) => set({ cab: e.target.value })}>
              {Object.entries(BUILT_IN_CABS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
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
            : amp.cab === 'smooth6' || amp.cab === 'cab10'
              ? SPEAKER_MOD.listen
              : 'Speaker cabinet as an impulse response (convolution). Add your own cab IR WAVs to compare.'}
        </p>
        {status && <p className="muted small">{status}</p>}
      </div>
    </section>
  );
}

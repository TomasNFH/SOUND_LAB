import { useCallback, useEffect, useState } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { BUILT_IN_PRESETS } from '../audio/presets';
import { renderProcessed } from '../audio/render';
import { withDefaults, type ToneSettings } from '../audio/settings';
import { encodeWav } from '../audio/wav';
import { deletePreset, listPresets, loadPreset, savePreset, uploadFile, type PresetInfo } from '../api';
import { fmt } from './Knob';

type Props = {
  engine: AudioEngine;
  settings: ToneSettings;
  onLoad: (settings: ToneSettings) => void;
};

const BUILT_IN = 'builtin:';
const SAVED = 'saved:';

export function PresetPanel({ engine, settings, onLoad }: Props) {
  const [saved, setSaved] = useState<PresetInfo[] | null>(null);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [matchLoudness, setMatchLoudness] = useState(true);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSaved(await listPresets());
    } catch {
      setSaved(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const builtIn = selected.startsWith(BUILT_IN)
    ? BUILT_IN_PRESETS.find((p) => p.name === selected.slice(BUILT_IN.length))
    : undefined;

  const load = async (value: string) => {
    setSelected(value);
    if (!value) return;
    try {
      if (value.startsWith(BUILT_IN)) {
        const p = BUILT_IN_PRESETS.find((b) => b.name === value.slice(BUILT_IN.length));
        if (p) onLoad(structuredClone(p.settings));
        setStatus(null);
      } else {
        const presetName = value.slice(SAVED.length);
        onLoad(withDefaults(await loadPreset(presetName)));
        setName(presetName);
        setStatus(`Loaded "${presetName}".`);
      }
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await savePreset(n, settings);
      await refresh();
      setSelected(SAVED + n);
      setStatus(`Saved "${n}".`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const remove = async () => {
    if (!selected.startsWith(SAVED)) return;
    const n = selected.slice(SAVED.length);
    try {
      await deletePreset(n);
      await refresh();
      setSelected('');
      setStatus(`Deleted "${n}".`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const exportClip = async () => {
    const clip = engine.clipBuffer;
    if (!clip) return;
    setExporting(true);
    setStatus('Rendering…');
    try {
      const t0 = performance.now();
      const result = await renderProcessed(clip, settings, { matchLoudness });
      const blob = encodeWav(result.buffer);
      const fileName = `tone-lab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      let where = 'downloaded';
      try {
        await uploadFile('exports', blob, fileName);
        where = 'downloaded and saved to exports/';
      } catch {
        // api offline: the download is enough
      }
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      setStatus(
        `${fileName} ${where} (${result.buffer.duration.toFixed(1)} s rendered in ${secs} s, ` +
          `gain ${fmt.db(result.gainDb)}${result.peakLimited ? ', lowered to avoid clipping' : ''}).`,
      );
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <h2>Presets and export</h2>
      <div className="row">
        <select value={selected} onChange={(e) => void load(e.target.value)}>
          <option value="">Load a preset…</option>
          <optgroup label="Experiments">
            {BUILT_IN_PRESETS.map((p) => (
              <option key={p.name} value={BUILT_IN + p.name}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved && saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map((p) => (
                <option key={p.name} value={SAVED + p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {selected.startsWith(SAVED) && <button onClick={() => void remove()}>Delete</button>}
      </div>
      {builtIn && <p className="muted small">{builtIn.about}</p>}

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="text"
          placeholder="Preset name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button onClick={() => void save()} disabled={!name.trim() || saved === null}>
          Save
        </button>
      </div>
      {saved === null && <p className="muted small">Saving presets needs the api.</p>}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" onClick={() => void exportClip()} disabled={!engine.clipBuffer || exporting}>
          Export processed WAV
        </button>
        <label className="check">
          <input type="checkbox" checked={matchLoudness} onChange={(e) => setMatchLoudness(e.target.checked)} />
          Match loudness to dry clip
        </label>
      </div>
      {!engine.clipBuffer && <p className="muted small">Load a clip to export it.</p>}
      {status && <p className="muted small">{status}</p>}
    </section>
  );
}

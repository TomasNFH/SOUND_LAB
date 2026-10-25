import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { fetchRecording, listRecordings, uploadRecording, type Recording } from '../api';

type Props = {
  engine: AudioEngine;
  onApiStatus?: (ok: boolean) => void;
};

// Clips shipped with the app (web/public/clips), so there is something to
// play straight away, with or without the api. The first one loads on start.
const INCLUDED_CLIPS = ['hat.wav', 'jenry.wav'];

const INCLUDED = 'included:';
const LIBRARY = 'library:';

const fetchIncluded = async (name: string) => {
  const res = await fetch(`${import.meta.env.BASE_URL}clips/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.arrayBuffer();
};

// Choose an included clip, a recording from the library (the api's data
// volume), or add a local WAV, which is also uploaded to the library when
// the api is up.
export function ClipPanel({ engine, onApiStatus }: Props) {
  const [selected, setSelected] = useState(''); // select value of the loaded clip
  const [localName, setLocalName] = useState<string | null>(null); // a picked file not in the list
  const [status, setStatus] = useState<string | null>(null);
  const [library, setLibrary] = useState<Recording[] | null>(null);
  const [apiOk, setApiOk] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const autoLoaded = useRef(false);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await listRecordings());
      setApiOk(true);
      onApiStatus?.(true);
    } catch {
      setApiOk(false);
      setLibrary(null);
      onApiStatus?.(false);
    }
  }, [onApiStatus]);

  const load = useCallback(
    async (value: string, name: string, getData: () => Promise<ArrayBuffer>) => {
      setStatus(`Loading ${name}…`);
      try {
        const buffer = await engine.loadArrayBuffer(await getData());
        setSelected(value);
        setStatus(
          `${buffer.numberOfChannels === 1 ? 'Mono' : `${buffer.numberOfChannels} ch`}, ` +
            `${buffer.duration.toFixed(1)} s, playing at ${buffer.sampleRate / 1000} kHz`,
        );
      } catch (err) {
        setStatus(`Could not load ${name}: ${(err as Error).message}`);
      }
    },
    [engine],
  );

  useEffect(() => {
    void refreshLibrary();
    // Start with the first included clip, unless something is already loaded.
    if (!autoLoaded.current && !engine.clipBuffer) {
      autoLoaded.current = true;
      const first = INCLUDED_CLIPS[0];
      void load(INCLUDED + first, first, () => fetchIncluded(first));
    }
  }, [refreshLibrary, load, engine]);

  const pick = (value: string) => {
    if (value.startsWith(INCLUDED)) {
      const name = value.slice(INCLUDED.length);
      void load(value, name, () => fetchIncluded(name));
    } else if (value.startsWith(LIBRARY)) {
      const name = value.slice(LIBRARY.length);
      void load(value, name, () => fetchRecording(name));
    }
  };

  const onFilePicked = async (file: File) => {
    let value = `local:${file.name}`;
    if (apiOk) {
      try {
        await uploadRecording(file);
        await refreshLibrary();
        value = LIBRARY + file.name;
      } catch (err) {
        setStatus((err as Error).message);
      }
    }
    setLocalName(value.startsWith('local:') ? file.name : null);
    await load(value, file.name, () => file.arrayBuffer());
  };

  const clipName = selected.replace(/^(included|library|local):/, '');

  return (
    <>
      <div className="row">
        <select value={selected} onChange={(e) => pick(e.target.value)} aria-label="Clip">
          {!selected && <option value="">Choose a clip…</option>}
          {localName && <option value={`local:${localName}`}>{localName} (local file)</option>}
          <optgroup label="Included">
            {INCLUDED_CLIPS.map((n) => (
              <option key={n} value={INCLUDED + n}>
                {n}
              </option>
            ))}
          </optgroup>
          {library && library.length > 0 && (
            <optgroup label="Your library">
              {library.map((r) => (
                <option key={r.name} value={LIBRARY + r.name}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button onClick={() => fileInput.current?.click()}>{apiOk ? 'Add WAV…' : 'Open WAV…'}</button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.wav"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFilePicked(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted">
        {clipName ? <strong>{clipName}</strong> : 'No clip loaded.'} {status}
      </p>
      {!apiOk && (
        <p className="muted">The api isn't reachable, so added files open locally and aren't saved to the library.</p>
      )}
    </>
  );
}

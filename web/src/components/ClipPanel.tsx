import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { fetchRecording, listRecordings, uploadRecording, type Recording } from '../api';

type Props = {
  engine: AudioEngine;
  onApiStatus?: (ok: boolean) => void;
};

// Choose a recording from the library (the api's data volume) or add a
// local WAV, which is also uploaded to the library when the api is up.
export function ClipPanel({ engine, onApiStatus }: Props) {
  const [clipName, setClipName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [library, setLibrary] = useState<Recording[] | null>(null);
  const [apiOk, setApiOk] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const load = async (name: string, getData: () => Promise<ArrayBuffer>) => {
    setStatus(`Loading ${name}…`);
    try {
      const buffer = await engine.loadArrayBuffer(await getData());
      setClipName(name);
      setStatus(
        `${buffer.numberOfChannels === 1 ? 'Mono' : `${buffer.numberOfChannels} ch`}, ` +
          `${buffer.duration.toFixed(1)} s, playing at ${buffer.sampleRate / 1000} kHz`,
      );
    } catch (err) {
      setStatus(`Could not load ${name}: ${(err as Error).message}`);
    }
  };

  const onFilePicked = async (file: File) => {
    if (apiOk) {
      try {
        await uploadRecording(file);
        void refreshLibrary();
      } catch (err) {
        setStatus((err as Error).message);
      }
    }
    await load(file.name, () => file.arrayBuffer());
  };

  return (
    <>
      <div className="row">
        <select
          value={clipName && library?.some((r) => r.name === clipName) ? clipName : ''}
          disabled={!library || library.length === 0}
          onChange={(e) => {
            const name = e.target.value;
            if (name) void load(name, () => fetchRecording(name));
          }}
        >
          <option value="">
            {!apiOk ? 'Library offline' : library?.length ? 'Choose a recording…' : 'Library is empty'}
          </option>
          {library?.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
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
        <p className="muted">The api isn't reachable, so files open locally and aren't saved to the library.</p>
      )}
    </>
  );
}

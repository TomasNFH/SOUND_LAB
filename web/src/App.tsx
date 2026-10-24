import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type EngineState } from './audio/AudioEngine';
import { Knob } from './components/Knob';
import { fetchRecording, listRecordings, uploadRecording, type Recording } from './api';
import { ViewsPanel } from './views/ViewsPanel';

// One engine for the page's lifetime; created outside React so re-renders
// (and StrictMode double effects) never rebuild the audio graph.
let engine: AudioEngine | null = null;
const getEngine = () => {
  if (!engine) {
    engine = new AudioEngine();
    // Handy for poking at the graph from the browser console in dev.
    if (import.meta.env.DEV) (window as unknown as { engine: AudioEngine }).engine = engine;
  }
  return engine;
};

const formatTime = (s: number) => {
  const tenths = Math.floor(s * 10);
  const sec = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${sec.toFixed(1).padStart(4, '0')}`;
};
const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;

export function App() {
  const [clipName, setClipName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [library, setLibrary] = useState<Recording[] | null>(null);
  const [apiOk, setApiOk] = useState(true);

  const [engineState, setEngineState] = useState<EngineState>({
    playing: false,
    position: 0,
    duration: 0,
    levelMatchDb: 0,
  });
  const [bypassed, setBypassed] = useState(false);
  const [loop, setLoop] = useState(true);
  const [levelMatch, setLevelMatch] = useState(true);
  const [testGainDb, setTestGainDb] = useState(6);
  const [masterDb, setMasterDb] = useState(-6);
  const fileInput = useRef<HTMLInputElement>(null);

  // Push UI values into the engine. Values only ever flow this way.
  useEffect(() => getEngine().setBypass(bypassed), [bypassed]);
  useEffect(() => getEngine().setLoop(loop), [loop]);
  useEffect(() => getEngine().setLevelMatch(levelMatch), [levelMatch]);
  useEffect(() => getEngine().setTestGainDb(testGainDb), [testGainDb]);
  useEffect(() => getEngine().setMasterDb(masterDb), [masterDb]);

  // Poll the engine for transport position and the level-match readout.
  useEffect(() => {
    const id = window.setInterval(() => setEngineState(getEngine().getState()), 100);
    return () => window.clearInterval(id);
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await listRecordings());
      setApiOk(true);
    } catch {
      setApiOk(false);
      setLibrary(null);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const load = async (name: string, getData: () => Promise<ArrayBuffer>) => {
    setStatus(`Loading ${name}…`);
    try {
      const buffer = await getEngine().loadArrayBuffer(await getData());
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
    // Save to the shared library when the api is up, so it's there next time.
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

  const togglePlay = useCallback(() => {
    const e = getEngine();
    if (!e.hasBuffer) return;
    if (e.getState().playing) e.pause();
    else void e.play();
  }, []);

  // Space = play/pause, B = A/B switch.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        togglePlay();
      } else if (ev.code === 'KeyB') {
        setBypassed((b) => !b);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  const { playing, position, duration, levelMatchDb } = engineState;

  return (
    <main className="app">
      <header className="header">
        <h1>Tone Lab</h1>
      </header>

      <div className="layout">
        <div className="col-views">
          <ViewsPanel engine={getEngine()} />
        </div>
        <div className="col-controls">

      <section className="panel">
        <h2>Clip</h2>
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
          <button onClick={() => fileInput.current?.click()}>
            {apiOk ? 'Add WAV…' : 'Open WAV…'}
          </button>
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
          <p className="muted">
            The api isn't reachable, so files open locally and aren't saved to the library.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Transport</h2>
        <div className="row">
          <button className="primary" onClick={togglePlay} disabled={!duration}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => getEngine().stop()} disabled={!duration}>
            Stop
          </button>
          <label className="check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop
          </label>
          <span className="time">
            {formatTime(position)} / {formatTime(duration)}
          </span>
        </div>
        <input
          className="seek"
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={position}
          disabled={!duration}
          onChange={(e) => getEngine().seek(Number(e.target.value))}
        />
      </section>

      <section className="panel">
        <h2>A/B</h2>
        <div className="ab">
          <button
            className={`ab-switch ${bypassed ? 'is-dry' : 'is-wet'}`}
            onClick={() => setBypassed((b) => !b)}
            aria-pressed={!bypassed}
          >
            <span className={bypassed ? 'on' : ''}>A · Dry</span>
            <span className={bypassed ? '' : 'on'}>B · Processed</span>
          </button>
          <p className="muted">Press B to switch, Space to play or pause.</p>
        </div>

        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={levelMatch}
              onChange={(e) => setLevelMatch(e.target.checked)}
            />
            Level matching
          </label>
          <span className="muted">
            {levelMatch ? `Processed corrected by ${formatDb(levelMatchDb)}` : 'Off: louder will sound better'}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Effect</h2>
        <p className="muted">
          A plain gain stage stands in for the effect for now. With level matching on, A and B
          should sound equally loud at any setting.
        </p>
        <div className="knobs">
          <Knob
            label="Test gain"
            value={testGainDb}
            min={-12}
            max={18}
            step={0.5}
            defaultValue={6}
            format={formatDb}
            onChange={setTestGainDb}
          />
          <Knob
            label="Volume"
            value={masterDb}
            min={-40}
            max={0}
            step={0.5}
            defaultValue={-6}
            format={formatDb}
            onChange={setMasterDb}
          />
        </div>
      </section>
        </div>
      </div>
    </main>
  );
}

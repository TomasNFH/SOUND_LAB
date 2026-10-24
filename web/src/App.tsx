import { useCallback, useEffect, useState } from 'react';
import { AudioEngine, type EngineState, type SourceKind } from './audio/AudioEngine';
import { bandRange } from './audio/blocks/EqBlock';
import { DEFAULT_SETTINGS, type ToneSettings } from './audio/settings';
import { AmpPanel } from './components/AmpPanel';
import { ClipPanel } from './components/ClipPanel';
import { EqPanel } from './components/EqPanel';
import { FxPanel } from './components/FxPanel';
import { fmt, Knob } from './components/Knob';
import { PedalPanel } from './components/PedalPanel';
import { PresetPanel } from './components/PresetPanel';
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

const SOURCES: { id: SourceKind; label: string }[] = [
  { id: 'clip', label: 'Clip' },
  { id: 'sine', label: 'Sine' },
  { id: 'noise', label: 'Pink noise' },
  { id: 'sweep', label: 'Sweep' },
];

const formatTime = (s: number) => {
  const tenths = Math.floor(s * 10);
  const sec = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${sec.toFixed(1).padStart(4, '0')}`;
};

export function App() {
  const [settings, setSettings] = useState<ToneSettings>(() => structuredClone(DEFAULT_SETTINGS));
  const [engineState, setEngineState] = useState<EngineState>({
    playing: false,
    canPlay: false,
    source: 'clip',
    position: 0,
    duration: 0,
    levelMatchDb: 0,
  });
  const [bypassed, setBypassed] = useState(false);
  const [loop, setLoop] = useState(true);
  const [levelMatch, setLevelMatch] = useState(true);
  const [masterDb, setMasterDb] = useState(-6);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const [source, setSource] = useState<SourceKind>('clip');
  const [sineFreq, setSineFreq] = useState(220);
  const [sineDb, setSineDb] = useState(-12);

  // Push UI values into the engine. Values only ever flow this way.
  useEffect(() => getEngine().applySettings(settings), [settings]);
  useEffect(() => getEngine().setBypass(bypassed), [bypassed]);
  useEffect(() => getEngine().setLoop(loop), [loop]);
  useEffect(() => getEngine().setLevelMatch(levelMatch), [levelMatch]);
  useEffect(() => getEngine().setMasterDb(masterDb), [masterDb]);
  useEffect(() => getEngine().setSource(source), [source]);
  useEffect(() => getEngine().setSine(sineFreq, sineDb), [sineFreq, sineDb]);

  // Dev only: drive the UI state from the browser console or tests.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { ui: { setSettings, setSource, setSineFreq, setBypassed } });
  }, []);

  // Poll the engine for transport position and the level-match readout.
  useEffect(() => {
    const id = window.setInterval(() => setEngineState(getEngine().getState()), 100);
    return () => window.clearInterval(id);
  }, []);

  const patch = useCallback(
    <K extends keyof ToneSettings>(key: K, value: ToneSettings[K]) => setSettings((s) => ({ ...s, [key]: value })),
    [],
  );

  const togglePlay = useCallback(() => {
    const e = getEngine();
    if (!e.canPlay) return;
    if (e.getState().playing) e.pause();
    else void e.play();
  }, []);

  // Space = play/pause, B = A/B switch.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
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

  const { playing, canPlay, position, duration, levelMatchDb } = engineState;
  const highlight =
    activeBand !== null && settings.eq.on && settings.eq.bands[activeBand]?.on
      ? bandRange(settings.eq.bands[activeBand])
      : null;

  return (
    <main className="app">
      <header className="header">
        <h1>Tone Lab</h1>
      </header>

      <div className="layout">
        <div className="col-views">
          <ViewsPanel engine={getEngine()} settings={settings} highlight={highlight} activeBand={activeBand} />
        </div>

        <div className="col-controls">
          <section className="panel">
            <div className="panel-head">
              <h2>Source</h2>
              <div className="seg" role="group" aria-label="Source">
                {SOURCES.map((s) => (
                  <button key={s.id} className={source === s.id ? 'on' : ''} onClick={() => setSource(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Kept mounted so the chosen clip survives switching to a test signal. */}
            <div hidden={source !== 'clip'}>
              <ClipPanel engine={getEngine()} />
            </div>
            {source === 'sine' && (
              <>
                <p className="muted small">A pure tone: anything above its frequency on the spectrum was added by the chain.</p>
                <div className="knobs">
                  <Knob label="Frequency" value={sineFreq} min={40} max={2000} scale="log" defaultValue={220} format={fmt.hz} onChange={setSineFreq} />
                  <Knob label="Level" value={sineDb} min={-40} max={0} step={0.5} defaultValue={-12} format={fmt.db} onChange={setSineDb} />
                </div>
              </>
            )}
            {source === 'noise' && (
              <p className="muted small">Pink noise is flat on this log spectrum, so the difference curve shows the chain's frequency response directly.</p>
            )}
            {source === 'sweep' && (
              <p className="muted small">A 4 s sweep from 20 Hz to 20 kHz. Watch the spectrum peak travel across while filters change its height.</p>
            )}
          </section>

          <section className="panel">
            <h2>Transport</h2>
            <div className="row">
              <button className="primary" onClick={togglePlay} disabled={!canPlay}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => getEngine().stop()} disabled={!canPlay}>
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
                <input type="checkbox" checked={levelMatch} onChange={(e) => setLevelMatch(e.target.checked)} />
                Level matching
              </label>
              <span className="muted inline">
                {levelMatch ? `Processed corrected by ${fmt.db(levelMatchDb)}` : 'Off: louder will sound better'}
              </span>
            </div>
            <div className="knobs">
              <Knob
                label="Volume"
                value={masterDb}
                min={-40}
                max={0}
                step={0.5}
                defaultValue={-6}
                format={fmt.db}
                onChange={setMasterDb}
              />
            </div>
          </section>

          <EqPanel eq={settings.eq} onChange={(eq) => patch('eq', eq)} onActiveBand={setActiveBand} />
          <PedalPanel pedal={settings.pedal} onChange={(pedal) => patch('pedal', pedal)} />
          <AmpPanel amp={settings.amp} onChange={(amp) => patch('amp', amp)} />
          <FxPanel settings={settings} onChange={(p) => setSettings((s) => ({ ...s, ...p }))} />
          <PresetPanel engine={getEngine()} settings={settings} onLoad={setSettings} />
        </div>
      </div>
    </main>
  );
}

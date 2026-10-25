import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type EngineState, type SourceKind } from './audio/AudioEngine';
import { bandRange } from './audio/blocks/EqBlock';
import {
  defaultBranches,
  drySettings,
  isDry,
  STOCK_CHAMP,
  type BranchId,
  type Branches,
  type ToneSettings,
} from './audio/settings';
import { AmpPanel } from './components/AmpPanel';
import { ChainMatrix, type BlockId, type Selection } from './components/ChainMatrix';
import { ClipPanel } from './components/ClipPanel';
import { EqPanel } from './components/EqPanel';
import { LivePanel } from './components/LivePanel';
import { Logo } from './components/Logo';
import { FxPanel } from './components/FxPanel';
import { fmt, Knob } from './components/Knob';
import { PedalPanel } from './components/PedalPanel';
import { PresetPanel } from './components/PresetPanel';
import { DEFAULT_VIEW, ViewsPanel, type ViewOptions } from './views/ViewsPanel';

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
  { id: 'live', label: 'Live' },
];

const formatTime = (s: number) => {
  const tenths = Math.floor(s * 10);
  const sec = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${sec.toFixed(1).padStart(4, '0')}`;
};

export function App() {
  const [branches, setBranches] = useState<Branches>(defaultBranches);
  // The branch whose blocks are open below; panels edit this one.
  const [editing, setEditing] = useState<BranchId>('b');
  const [listening, setListening] = useState<BranchId>('b');
  // Auto A/B: flip the branch you hear every few seconds while playing.
  const [auto, setAuto] = useState(false);
  const [autoSeconds, setAutoSeconds] = useState(5);
  const [autoCycle, setAutoCycle] = useState(0);
  const [engineState, setEngineState] = useState<EngineState>({
    playing: false,
    canPlay: false,
    source: 'clip',
    position: 0,
    duration: 0,
    levelMatchDb: 0,
  });
  const [loop, setLoop] = useState(true);
  const [levelMatch, setLevelMatch] = useState(true);
  const [masterDb, setMasterDb] = useState(-6);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const [source, setSource] = useState<SourceKind>('clip');
  const [sineFreq, setSineFreq] = useState(220);
  const [sineDb, setSineDb] = useState(-12);
  const [selection, setSelection] = useState<Selection>({ branch: 'b', block: 'pedal' });
  const [showPresets, setShowPresets] = useState(false);
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const patchView = useCallback((p: Partial<ViewOptions>) => setView((v) => ({ ...v, ...p })), []);

  // Mini view: when the full views panel scrolls out of sight, a floating
  // copy keeps the chart visible while you change settings below. Closing
  // it keeps it away until the full panel has been back on screen.
  const viewsRef = useRef<HTMLDivElement>(null);
  const [viewsVisible, setViewsVisible] = useState(true);
  const [miniClosed, setMiniClosed] = useState(false);
  useEffect(() => {
    const el = viewsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      // Once less than 60% of the panel is on screen the chart is cut off,
      // so the mini view takes over.
      const visible = entry.intersectionRatio >= 0.6;
      setViewsVisible(visible);
      if (visible) setMiniClosed(false);
    }, { threshold: [0, 0.3, 0.6, 0.9, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showMini = !viewsVisible && !miniClosed;

  // Push UI values into the engine. Values only ever flow this way.
  useEffect(() => getEngine().applySettings(branches), [branches]);
  useEffect(() => getEngine().setListen(listening), [listening]);
  useEffect(() => getEngine().setLoop(loop), [loop]);
  useEffect(() => getEngine().setLevelMatch(levelMatch), [levelMatch]);
  useEffect(() => getEngine().setMasterDb(masterDb), [masterDb]);
  useEffect(() => getEngine().setSource(source), [source]);
  useEffect(() => getEngine().setSine(sineFreq, sineDb), [sineFreq, sineDb]);

  // Dev only: drive the UI state from the browser console or tests.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { ui: { setBranches, setSource, setSineFreq, setListening } });
  }, []);

  // Poll the engine for transport position and the level-match readout.
  useEffect(() => {
    const id = window.setInterval(() => setEngineState(getEngine().getState()), 100);
    return () => window.clearInterval(id);
  }, []);

  const settings = branches[editing];

  // Change part of the branch being edited.
  const patch = useCallback(
    (p: Partial<ToneSettings>) => setBranches((b) => ({ ...b, [editing]: { ...b[editing], ...p } })),
    [editing],
  );

  const select = useCallback((s: Selection) => {
    setSelection(s);
    if (s !== 'source') setEditing(s.branch);
  }, []);

  const toggleBlock = useCallback((branch: BranchId, block: BlockId) => {
    setBranches((b) => ({ ...b, [branch]: { ...b[branch], [block]: { ...b[branch][block], on: !b[branch][block].on } } }));
  }, []);

  const copyBranch = useCallback((from: BranchId, to: BranchId) => {
    setBranches((b) => ({ ...b, [to]: structuredClone(b[from]) }));
  }, []);

  // The other branch gets this whole chain with a stock Champion 600, so
  // the amp mods are the only difference between A and B.
  const stockToOther = useCallback(() => {
    setBranches((b) => {
      const other: BranchId = editing === 'a' ? 'b' : 'a';
      const copy = structuredClone(b[editing]);
      const speakerMod = copy.amp.cab === 'smooth6' || copy.amp.cab === 'cab10';
      copy.amp = { ...copy.amp, on: true, model: 'champ600', champ: structuredClone(STOCK_CHAMP), cab: speakerMod ? 'champ6' : copy.amp.cab };
      return { ...b, [other]: copy };
    });
  }, [editing]);

  // Picking a branch by hand takes over from auto switching.
  const listenTo = useCallback((branch: BranchId | 'other') => {
    setAuto(false);
    setListening((l) => (branch === 'other' ? (l === 'a' ? 'b' : 'a') : branch));
  }, []);

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
        listenTo('other');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, listenTo]);

  const { playing, canPlay, position, duration, levelMatchDb } = engineState;

  useEffect(() => {
    if (!auto || !playing) return;
    // A new cycle restarts the countdown bar in sync with this timer.
    setAutoCycle((c) => c + 1);
    const id = window.setInterval(() => {
      setListening((l) => (l === 'a' ? 'b' : 'a'));
      setAutoCycle((c) => c + 1);
    }, autoSeconds * 1000);
    return () => window.clearInterval(id);
  }, [auto, autoSeconds, playing]);

  const highlight =
    activeBand !== null && settings.eq.on && settings.eq.bands[activeBand]?.on
      ? bandRange(settings.eq.bands[activeBand])
      : null;

  return (
    <main className={`app ${showMini ? 'with-mini' : ''}`}>
      <header className="header">
        <Logo />
        <h1>Tone Lab</h1>
        <button className="header-btn" onClick={() => setShowPresets((v) => !v)} aria-expanded={showPresets}>
          Presets and export
        </button>
      </header>

      <div hidden={!showPresets}>
        <PresetPanel
          engine={getEngine()}
          branches={branches}
          editing={editing}
          listening={listening}
          onLoad={setBranches}
        />
      </div>

      <div ref={viewsRef}>
        <ViewsPanel
          engine={getEngine()}
          branches={branches}
          editing={editing}
          highlight={highlight}
          activeBand={activeBand}
          view={view}
          onView={patchView}
        />
      </div>

      <section className="panel control-bar">
        <div className="transport">
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
          <input
            className="seek"
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={position}
            disabled={!duration}
            onChange={(e) => getEngine().seek(Number(e.target.value))}
            aria-label="Position"
          />
        </div>
        <div className="monitor">
          <button
            className={`ab-switch ${listening === 'a' ? 'is-dry' : 'is-wet'}`}
            onClick={() => listenTo('other')}
            title="Press B to switch"
          >
            <span className={listening === 'a' ? 'on' : ''}>A{isDry(branches.a) ? ' · Dry' : ''}</span>
            <span className={listening === 'b' ? 'on' : ''}>B{isDry(branches.b) ? ' · Dry' : ''}</span>
          </button>
          <label className="check" title={levelMatch ? `B corrected by ${fmt.db(levelMatchDb)} to match A` : 'Off: louder will sound better'}>
            <input type="checkbox" checked={levelMatch} onChange={(e) => setLevelMatch(e.target.checked)} />
            Level match {levelMatch && <span className="muted inline">{fmt.db(levelMatchDb)}</span>}
          </label>
          <Knob size="small" label="Volume" value={masterDb} min={-40} max={0} step={0.5} defaultValue={-6} format={fmt.db} onChange={setMasterDb} />
        </div>
      </section>

      <ChainMatrix
        branches={branches}
        source={source}
        listening={listening}
        selection={selection}
        onSelect={select}
        onToggle={toggleBlock}
        onListen={listenTo}
        auto={{ on: auto, seconds: autoSeconds, cycle: autoCycle, running: auto && playing }}
        onAuto={setAuto}
        onAutoSeconds={setAutoSeconds}
        onCopy={copyBranch}
        onResetA={() => setBranches((b) => ({ ...b, a: drySettings() }))}
      />

      {/* The source panel stays mounted (the clip picker keeps its state); block panels show for the selected cell. */}
      <div className="block-detail">
        <div hidden={selection !== 'source'}>
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
        {source === 'live' && <LivePanel engine={getEngine()} playing={playing} />}
        {source === 'sweep' && (
          <p className="muted small">A 4 s sweep from 20 Hz to 20 kHz. Watch the spectrum peak travel across while filters change its height.</p>
        )}
      </section>
        </div>
        {selection !== 'source' && (
          <div className={`branch-detail branch-${editing}`}>
            <p className="editing-tag">Branch {editing.toUpperCase()}</p>
            {selection.block === 'eq' && <EqPanel eq={settings.eq} onChange={(eq) => patch({ eq })} onActiveBand={setActiveBand} />}
            {selection.block === 'pedal' && <PedalPanel pedal={settings.pedal} onChange={(pedal) => patch({ pedal })} />}
            {selection.block === 'amp' && (
              <AmpPanel
                amp={settings.amp}
                onChange={(amp) => patch({ amp })}
                otherBranch={editing === 'a' ? 'B' : 'A'}
                onStockToOther={stockToOther}
              />
            )}
            {(selection.block === 'delay' || selection.block === 'reverb') && (
              <FxPanel only={selection.block} settings={settings} onChange={patch} />
            )}
          </div>
        )}
      </div>
      {showMini && (
        <div className="mini-dock">
          <ViewsPanel
            engine={getEngine()}
            branches={branches}
            editing={editing}
            highlight={highlight}
            activeBand={activeBand}
            view={view}
            onView={patchView}
            mini={{
              onExpand: () => viewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              onClose: () => setMiniClosed(true),
            }}
          />
        </div>
      )}
    </main>
  );
}

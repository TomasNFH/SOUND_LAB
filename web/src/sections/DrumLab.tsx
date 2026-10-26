import { useEffect, useRef, useState } from 'react';
import { Knob } from '../components/Knob';
import { SectionHero } from '../components/SectionHero';
import { drums, MAX_BPM, MIN_BPM } from '../drums/DrumMachine';
import { GROOVE_GROUPS, grooveById, ROWS, type Groove, type Voice } from '../drums/patterns';
import { useCurrentStep, useDrums } from '../drums/useDrums';

// How each step is counted out loud: "1 e & a" in sixteenths, "1 & a" in triplets.
const COUNTS: Record<number, string[]> = { 4: ['', 'e', '&', 'a'], 3: ['', '&', 'a'] };

// Tap tempo: the average of the last few gaps between taps.
function useTapTempo() {
  const taps = useRef<number[]>([]);
  return () => {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t < 2000);
    recent.push(now);
    taps.current = recent.slice(-5);
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      drums.setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  };
}

interface Cell {
  voice: Voice;
  velocity: number;
}

// Snap each hit to the nearest grid step for display (the sound keeps the
// drummer's real timing). When two hits share a step, the louder one shows.
function gridOf(groove: Groove) {
  const steps = groove.beats * groove.stepsPerBeat;
  const cells = new Map<string, Cell>();
  for (const [beat, voice, velocity] of groove.events) {
    const step = (((Math.round(beat * groove.stepsPerBeat) % steps) + steps) % steps);
    const row = ROWS.findIndex((r) => r.voices.includes(voice));
    const key = `${row}:${step}`;
    if ((cells.get(key)?.velocity ?? 0) < velocity) cells.set(key, { voice, velocity });
  }
  return cells;
}

export function DrumLab() {
  const { playing, loading, bpm, grooveId, volume } = useDrums();
  const groove = grooveById(grooveId);
  const spb = groove.stepsPerBeat;
  const stepsPerBar = 4 * spb;
  const bars = groove.beats / 4;
  const step = useCurrentStep(playing, spb);
  const tap = useTapTempo();
  const [viewBar, setViewBar] = useState(0);
  // While playing, the grid follows the bar being heard.
  const bar = step >= 0 ? Math.floor(step / stepsPerBar) % bars : Math.min(viewBar, bars - 1);
  const cells = gridOf(groove);
  const counts = COUNTS[spb];

  useEffect(() => drums.preload(), []);

  // Space = play/stop while Drum Lab is open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        drums.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <SectionHero title="Drum Lab" tagline="Real drummers' grooves to play along with" />
      <section className="panel drum-lab">
        <div className="panel-head">
          <h2>Beat</h2>
        </div>
        <div className="groove-groups">
          {GROOVE_GROUPS.map((group) => (
            <div key={group.label} className="groove-group">
              <span className="groove-group-label">{group.label}</span>
              <div className="seg" role="group" aria-label={`${group.label} beats`}>
                {group.grooves.map((g) => (
                  <button key={g.id} className={grooveId === g.id ? 'on' : ''} onClick={() => drums.setGroove(g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          {groove.description}{' '}
          {groove.source ? (
            <>
              Played by a real drummer at {groove.bpm} BPM, with their timing and dynamics.{' '}
              {bpm !== groove.bpm && (
                <button className="link-btn" onClick={() => drums.setBpm(groove.bpm)}>
                  Use {groove.bpm} BPM
                </button>
              )}
            </>
          ) : (
            'Programmed, with a little random timing so it breathes.'
          )}
        </p>

        <div className="drum-transport">
          <button className="primary drum-play" onClick={() => drums.toggle()} disabled={loading} title="Space">
            {loading ? 'Loading…' : playing ? 'Stop' : 'Play'}
          </button>
          <div className="bpm">
            <button onClick={() => drums.setBpm(bpm - 1)} aria-label="Slower" disabled={bpm <= MIN_BPM}>
              −
            </button>
            <span className="bpm-value">
              <strong>{bpm}</strong> BPM
            </span>
            <button onClick={() => drums.setBpm(bpm + 1)} aria-label="Faster" disabled={bpm >= MAX_BPM}>
              +
            </button>
            <button onClick={tap} title="Tap along with the song to set its tempo">
              Tap
            </button>
          </div>
          <Knob size="small" label="Volume" value={volume} min={0} max={1} step={0.01} defaultValue={0.8} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => drums.setVolume(v)} />
        </div>
        <input
          className="bpm-slider"
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={(e) => drums.setBpm(Number(e.target.value))}
          aria-label="Tempo in BPM"
        />

        {bars > 1 && (
          <div className="bar-picker" role="group" aria-label="Bar shown">
            {Array.from({ length: bars }, (_, b) => (
              <button key={b} className={bar === b ? 'on' : ''} onClick={() => setViewBar(b)} disabled={playing}>
                Bar {b + 1}
              </button>
            ))}
          </div>
        )}
        <div className="step-grid" style={{ '--steps': stepsPerBar } as React.CSSProperties} aria-label={`${groove.label}, bar ${bar + 1}`}>
          <span />
          {Array.from({ length: stepsPerBar }, (_, i) => (
            <span key={i} className={`step-count ${i % spb === 0 ? 'beat' : ''} ${step === bar * stepsPerBar + i ? 'now' : ''}`}>
              {i % spb === 0 ? i / spb + 1 : counts[i % spb]}
            </span>
          ))}
          {ROWS.map((row, r) => (
            <div className="step-row" key={row.label}>
              <span className="step-voice">{row.label}</span>
              {Array.from({ length: stepsPerBar }, (_, i) => {
                const at = bar * stepsPerBar + i;
                const cell = cells.get(`${r}:${at}`);
                const strength = cell && (cell.velocity >= 0.8 ? 'accent' : cell.velocity < 0.4 ? 'ghost' : '');
                return (
                  <span key={i} className={`step ${i % spb === 0 ? 'beat' : ''} ${step === at ? 'now' : ''}`}>
                    {cell && <i className={`${strength} ${cell.voice === 'open' ? 'open' : cell.voice === 'pedal' ? 'pedal' : ''}`} />}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted small drum-legend">
          {[['accent', 'accent'], ['', 'normal'], ['ghost', 'ghost note'], ['open', 'open hi-hat'], ['pedal', 'hi-hat pedal']].map(([kind, label]) => (
            <span key={label}>
              <i className={kind} /> {label}
            </span>
          ))}
        </p>
      </section>
    </>
  );
}

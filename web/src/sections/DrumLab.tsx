import { useEffect, useRef } from 'react';
import { Knob } from '../components/Knob';
import { drums, MAX_BPM, MIN_BPM } from '../drums/DrumMachine';
import { patternById, patternLength, PATTERNS, VOICES, velocityAt } from '../drums/patterns';
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

export function DrumLab() {
  const { playing, bpm, patternId, volume } = useDrums();
  const step = useCurrentStep(playing);
  const tap = useTapTempo();
  const pattern = patternById(patternId);
  const length = patternLength(pattern);
  const counts = COUNTS[pattern.stepsPerBeat];

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
    <section className="panel drum-lab">
      <div className="panel-head">
        <h2>Beat</h2>
        <div className="seg" role="group" aria-label="Beat">
          {PATTERNS.map((p) => (
            <button key={p.id} className={patternId === p.id ? 'on' : ''} onClick={() => drums.setPattern(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">{pattern.description} It keeps playing when you switch to another section.</p>

      <div className="drum-transport">
        <button className="primary drum-play" onClick={() => drums.toggle()} title="Space">
          {playing ? 'Stop' : 'Play'}
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

      <div className="step-grid" style={{ '--steps': length } as React.CSSProperties} aria-label={`${pattern.label} pattern`}>
        <span />
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`step-count ${i % pattern.stepsPerBeat === 0 ? 'beat' : ''} ${step === i ? 'now' : ''}`}>
            {i % pattern.stepsPerBeat === 0 ? i / pattern.stepsPerBeat + 1 : counts[i % pattern.stepsPerBeat]}
          </span>
        ))}
        {VOICES.map((voice) => (
          <div className="step-row" key={voice.id}>
            <span className="step-voice">{voice.label}</span>
            {Array.from({ length }, (_, i) => {
              const v = velocityAt(pattern, voice.id, i);
              return (
                <span
                  key={i}
                  className={`step ${i % pattern.stepsPerBeat === 0 ? 'beat' : ''} ${step === i ? 'now' : ''}`}
                >
                  {v > 0 && <i className={v >= 1 ? 'accent' : v < 0.5 ? 'ghost' : ''} />}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

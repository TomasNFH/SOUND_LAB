import { useEffect, useState } from 'react';
import { Knob } from '../components/Knob';
import { PedalBox } from '../components/PedalBox';
import { live } from './LiveEngine';
import { nearestNote, nearestString, STANDARD_TUNING, type Note } from './pitch';
import { useLive } from './useLive';

// Within this many cents a note counts as in tune.
const IN_TUNE = 3;
// The needle's swing either side of centre, in degrees, for ±50 cents.
const SWING = 60;
// How long the last note stays on the display after the string goes quiet.
const HOLD_MS = 700;

interface Reading {
  hz: number;
  note: Note;
  string: ReturnType<typeof nearestString>;
}

// The pitch of the dry input, read about 30 times a second while Live runs
// and the section is on screen. The median of the last few readings keeps
// the needle steady through a note's attack; the last note is held briefly
// after the string goes quiet.
function useTuner(running: boolean, a4: number) {
  const [reading, setReading] = useState<Reading | null>(null);
  useEffect(() => {
    if (!running) {
      setReading(null);
      return;
    }
    let raf = 0;
    let frame = 0;
    let recent: number[] = [];
    let lastHeard = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 2) return;
      const p = live.tunerPitch();
      if (p) {
        recent = [...recent.slice(-4), p.hz];
        lastHeard = now;
        const hz = [...recent].sort((x, y) => x - y)[Math.floor(recent.length / 2)];
        setReading({ hz, note: nearestNote(hz, a4), string: nearestString(hz, a4) });
      } else if (now - lastHeard > HOLD_MS) {
        recent = [];
        setReading(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, a4]);
  return reading;
}

// The meter window: a ±50 cent scale with a needle, the note name under it.
function TunerMeter({ reading, running }: { reading: Reading | null; running: boolean }) {
  const cents = reading ? Math.max(-50, Math.min(50, reading.note.cents)) : 0;
  const inTune = reading !== null && Math.abs(reading.note.cents) <= IN_TUNE;
  const ticks = Array.from({ length: 11 }, (_, i) => -50 + i * 10);
  const at = (c: number, r: number) => {
    const a = ((c / 50) * SWING * Math.PI) / 180;
    return [100 + r * Math.sin(a), 96 - r * Math.cos(a)];
  };
  return (
    <div className={`tuner-meter ${reading ? (inTune ? 'in-tune' : 'off-pitch') : 'idle'}`}>
      <svg viewBox="0 0 200 104" aria-hidden="true">
        {ticks.map((c) => {
          const major = c % 50 === 0;
          const [x1, y1] = at(c, major ? 70 : 76);
          const [x2, y2] = at(c, 84);
          return <line key={c} className={major ? 'major' : ''} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        <text x="22" y="40">♭</text>
        <text x="170" y="40">♯</text>
        <line
          className="tuner-needle"
          x1="100"
          y1="96"
          x2="100"
          y2="16"
          style={{ transform: `rotate(${(cents / 50) * SWING}deg)` }}
        />
        <circle className="tuner-hub" cx="100" cy="96" r="6" />
      </svg>
      <div className="tuner-note" aria-live="polite">
        {reading ? (
          <>
            {reading.note.name}
            <sub>{reading.note.octave}</sub>
          </>
        ) : (
          '–'
        )}
      </div>
      <div className="tuner-cents">
        {reading
          ? `${reading.note.cents >= 0 ? '+' : '−'}${Math.abs(reading.note.cents).toFixed(0).padStart(2, '0')} ¢ · ${reading.hz.toFixed(1)} Hz`
          : running
            ? 'Play one string'
            : 'Press Start'}
      </div>
    </div>
  );
}

const centsWord = (c: number) => (Math.abs(c) <= IN_TUNE ? 'in tune' : `${Math.abs(c).toFixed(0)} cents ${c < 0 ? 'flat: tune up' : 'sharp: tune down'}`);

export function TunerPanel({ active }: { active: boolean }) {
  const { running, a4, tunerMute } = useLive();
  const reading = useTuner(running && active, a4);
  const str = reading?.string;

  return (
    <section className="panel tuner-panel">
      <h2>Tuner</h2>
      <p className="muted small">
        Listens to the guitar before any effect. Play one open string and turn its peg until the needle sits in the
        middle. The footswitch mutes the output while you tune, like a tuner pedal.
      </p>
      <div className="pedal-stage">
        <PedalBox
          name="Tuner"
          paint="tuner"
          on={tunerMute}
          onToggle={() => live.setTunerMute(!tunerMute)}
          switchLabel="Mute the output while tuning"
        >
          <TunerMeter reading={reading} running={running} />
          <Knob label="Calib" value={a4} min={430} max={450} step={1} defaultValue={440} format={(v) => `A ${v} Hz`} onChange={(v) => live.setA4(v)} />
        </PedalBox>
        <div className="pedal-mods">
          <div className="tuner-strings" role="list" aria-label="Standard tuning">
            {STANDARD_TUNING.map((s) => {
              const on = str?.string === s.string;
              const tuned = on && Math.abs(str!.cents) <= IN_TUNE;
              return (
                <span key={s.string} role="listitem" className={`tuner-string ${on ? 'on' : ''} ${tuned ? 'tuned' : ''}`}>
                  <strong>{s.name}</strong>
                  <span>{s.string}</span>
                </span>
              );
            })}
          </div>
          <p className="tuner-advice">
            {!running
              ? 'Start Live above to use the tuner.'
              : str
                ? `String ${str.string} (${str.name}): ${centsWord(str.cents)}.`
                : 'Play an open string.'}
          </p>
          {tunerMute && <p className="muted small">Output muted. Press the footswitch again to play.</p>}
        </div>
      </div>
    </section>
  );
}

import { useState } from 'react';
import { CircleOfFifths } from '../theory/CircleOfFifths';
import { Fretboard, type FretLabel, type FretShow } from '../theory/Fretboard';
import {
  diatonicChords,
  mod12,
  ROOTS,
  scaleById,
  scaleNotes,
  SCALES,
  usesFlats,
  type Chord,
  type PitchClass,
  type ScaleId,
  type Tonality,
} from '../theory/music';
import { pluck } from '../theory/pluck';

// Picking the other ring on the circle swaps to the matching scale of that
// tonality, so A minor pentatonic becomes C major pentatonic, not C minor.
const COUNTERPART: Record<ScaleId, ScaleId> = {
  major: 'minor',
  minor: 'major',
  majorPent: 'minorPent',
  minorPent: 'majorPent',
  blues: 'majorPent',
  dorian: 'major',
  mixolydian: 'minor',
  harmonicMinor: 'major',
};

// Middle of the guitar's range, E3..D♯4.
const midiFor = (pc: PitchClass) => 52 + mod12(pc - 4);

const CHORD_SHAPE = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };

const strum = (chord: Chord) =>
  CHORD_SHAPE[chord.quality].forEach((iv, i) => pluck(midiFor(chord.root) + iv, i * 0.04));

export function TheoryLab() {
  const [root, setRoot] = useState<PitchClass>(9);
  const [scaleId, setScaleId] = useState<ScaleId>('minorPent');
  const [show, setShow] = useState<FretShow>('scale');
  const [label, setLabel] = useState<FretLabel>('notes');
  const [focus, setFocus] = useState<PitchClass | null>(null);

  const scale = scaleById(scaleId);
  const notes = scaleNotes(root, scale);
  const chords = diatonicChords(root, scale);
  const flats = usesFlats(root, scale.tonality);

  const pickKey = (pc: PitchClass, tonality: Tonality) => {
    setRoot(pc);
    if (scale.tonality !== tonality) setScaleId(COUNTERPART[scaleId]);
    setFocus(null);
  };

  return (
    <div className="theory-lab">
      <section className="panel">
        <div className="panel-head">
          <h2>Key and scale</h2>
          <select value={scaleId} onChange={(e) => setScaleId(e.target.value as ScaleId)} aria-label="Scale" className="theory-select">
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="root-picker" role="group" aria-label="Root note">
          {ROOTS.map((name, pc) => (
            <button
              key={name}
              className={root === pc ? 'on' : ''}
              onClick={() => {
                setRoot(pc);
                setFocus(null);
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="theory-grid">
          <CircleOfFifths root={root} tonality={scale.tonality} onPick={pickKey} />
          <div className="theory-side">
            <h3>
              {notes[0].name} {scale.label.toLowerCase()}
            </h3>
            <p className="muted small">Tap a note to hear it and find it on the neck. Tap it again to see the whole scale.</p>
            <div className="scale-notes">
              {notes.map((n) => (
                <button
                  key={n.pc}
                  className={`scale-note ${n.pc === root ? 'root' : ''} ${focus === n.pc ? 'on' : ''}`}
                  onClick={() => {
                    pluck(midiFor(n.pc));
                    setFocus((f) => (f === n.pc ? null : n.pc));
                  }}
                  aria-pressed={focus === n.pc}
                >
                  <strong>{n.name}</strong>
                  <span>{n.degree}</span>
                </button>
              ))}
            </div>

            <h3>Chords in the key</h3>
            <p className="muted small">
              {scale.intervals.length === 7
                ? 'The triad built on each note of the scale.'
                : `Borrowed from ${notes[0].name} ${scale.tonality}, the scale this one comes from.`}{' '}
              Tap one to hear it.
            </p>
            <div className="chord-list">
              {chords.map((c) => (
                <button key={c.numeral} className={`chord ${c.quality}`} onClick={() => strum(c)}>
                  <span>{c.numeral}</span>
                  <strong>{c.name}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Fretboard</h2>
          <div className="seg" role="group" aria-label="Notes shown">
            <button className={show === 'scale' ? 'on' : ''} onClick={() => setShow('scale')}>
              Scale
            </button>
            <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>
              All notes
            </button>
          </div>
          <div className="seg" role="group" aria-label="Labels">
            <button className={label === 'notes' ? 'on' : ''} onClick={() => setLabel('notes')}>
              Names
            </button>
            <button className={label === 'intervals' ? 'on' : ''} onClick={() => setLabel('intervals')}>
              Intervals
            </button>
          </div>
        </div>
        <p className="muted small">Standard tuning, frets 0 to 12. The root is terracotta; tap any fret to hear it.</p>
        <Fretboard notes={notes} flats={flats} show={show} label={label} focus={focus} />
      </section>
    </div>
  );
}

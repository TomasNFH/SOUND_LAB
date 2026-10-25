import { mod12, noteName, STANDARD_TUNING, type PitchClass, type ScaleNote } from './music';
import { pluck } from './pluck';

const FRETS = 12;
const MARKERS = new Set([3, 5, 7, 9]);
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

export type FretShow = 'scale' | 'all';
export type FretLabel = 'notes' | 'intervals';

interface Props {
  notes: ScaleNote[];
  flats: boolean;
  show: FretShow;
  label: FretLabel;
  // A pitch class picked in the legend; the rest of the scale dims.
  focus: PitchClass | null;
}

export function Fretboard({ notes, flats, show, label, focus }: Props) {
  const byPc = new Map(notes.map((n) => [n.pc, n]));
  const root = notes[0].pc;
  // High e on top, as you look down at the neck while playing (and as in tab).
  const strings = STANDARD_TUNING.map((open, s) => ({ open, name: STRING_NAMES[s] })).reverse();

  return (
    <div className="fretboard-scroll">
      <div className="fretboard" role="grid" aria-label="Fretboard, frets 0 to 12">
        {strings.map((str) => (
          <div className="fb-string" role="row" key={str.name}>
            <span className="fb-string-name">{str.name}</span>
            {Array.from({ length: FRETS + 1 }, (_, fret) => {
              const midi = str.open + fret;
              const pc = mod12(midi);
              const note = byPc.get(pc);
              const dimmed = focus !== null && focus !== pc;
              const text = note ? (label === 'intervals' ? note.degree : note.name) : noteName(pc, flats);
              const visible = note || show === 'all';
              return (
                <button
                  key={fret}
                  role="gridcell"
                  className={`fb-cell ${fret === 0 ? 'open' : ''}`}
                  onClick={() => pluck(midi)}
                  aria-label={`${str.name} string, fret ${fret}: ${noteName(pc, flats)}${note ? `, ${note.degree}` : ''}`}
                >
                  {visible && (
                    <span className={`fb-note ${note ? 'in' : 'out'} ${pc === root ? 'root' : ''} ${dimmed ? 'dim' : ''}`}>
                      {text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="fb-markers" aria-hidden="true">
          <span className="fb-string-name" />
          {Array.from({ length: FRETS + 1 }, (_, fret) => (
            <span key={fret} className="fb-marker">
              {fret}
              <i>{fret === FRETS ? '••' : MARKERS.has(fret) ? '•' : ''}</i>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

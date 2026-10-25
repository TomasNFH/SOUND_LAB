import {
  FIFTHS,
  keySignature,
  noteName,
  relativeMajor,
  relativeMinor,
  signatureLabel,
  usesFlats,
  type PitchClass,
  type Tonality,
} from './music';

const C = 160;
const RINGS = { major: [150, 104], minor: [104, 66] } as const;

// Roman numerals of the six chords that sit next to the key on the circle,
// for steps -1, 0, +1 around it.
const FAMILY: Record<Tonality, Record<Tonality, string[]>> = {
  major: { major: ['IV', 'I', 'V'], minor: ['ii', 'vi', 'iii'] },
  minor: { major: ['VI', 'III', 'VII'], minor: ['iv', 'i', 'v'] },
};

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

// One ring segment, 30° wide, centred on the circle position `i`.
function sector(i: number, outer: number, inner: number) {
  const [a0, a1] = [i * 30 - 15, i * 30 + 15];
  const [x0, y0] = polar(outer, a0);
  const [x1, y1] = polar(outer, a1);
  const [x2, y2] = polar(inner, a1);
  const [x3, y3] = polar(inner, a0);
  return `M${x0} ${y0} A${outer} ${outer} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 0 0 ${x3} ${y3}Z`;
}

const majorLabel = (pc: PitchClass) => (pc === 6 ? 'F♯/G♭' : noteName(pc, usesFlats(pc, 'major')));
const minorRoot = (pc: PitchClass) => (pc === 3 ? 'D♯/E♭' : noteName(pc, usesFlats(pc, 'minor')));
const minorLabel = (pc: PitchClass) => (pc === 3 ? 'D♯m/E♭m' : `${minorRoot(pc)}m`);

interface Props {
  root: PitchClass;
  tonality: Tonality;
  onPick: (root: PitchClass, tonality: Tonality) => void;
}

export function CircleOfFifths({ root, tonality, onPick }: Props) {
  const home = FIFTHS.indexOf(tonality === 'major' ? root : relativeMajor(root));
  const sig = keySignature(FIFTHS[home]);

  const ring = (ringTonality: Tonality) =>
    FIFTHS.map((majorPc, i) => {
      const pc = ringTonality === 'major' ? majorPc : relativeMinor(majorPc);
      const step = ((i - home + 18) % 12) - 6; // -6..5, distance from the key
      const inFamily = Math.abs(step) <= 1;
      const selected = step === 0 && ringTonality === tonality;
      const [outer, inner] = RINGS[ringTonality];
      const mid = (outer + inner) / 2;
      const [lx, ly] = polar(mid + (inFamily ? 5 : 0), i * 30);
      const [nx, ny] = polar(mid - 12, i * 30);
      const label = ringTonality === 'major' ? majorLabel(pc) : minorLabel(pc);
      return (
        <g
          key={`${ringTonality}-${i}`}
          className={`cof-cell ${ringTonality} ${inFamily ? 'family' : ''} ${selected ? 'selected' : ''}`}
          onClick={() => onPick(pc, ringTonality)}
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={ringTonality === 'major' ? `${label} major` : `${minorRoot(pc)} minor`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(pc, ringTonality);
            }
          }}
        >
          <path d={sector(i, outer, inner)} />
          <text x={lx} y={ly} className={label.length > 4 ? 'long' : ''}>
            {label}
          </text>
          {inFamily && (
            <text x={nx} y={ny} className="numeral">
              {FAMILY[tonality][ringTonality][step + 1]}
            </text>
          )}
        </g>
      );
    });

  return (
    <svg className="cof" viewBox="0 0 320 320" role="group" aria-label="Circle of fifths">
      {ring('major')}
      {ring('minor')}
      <circle cx={C} cy={C} r={64} className="cof-hub" />
      <text x={C} y={C - 6} className="cof-key">
        {tonality === 'major' ? majorLabel(root) : minorRoot(root)}
      </text>
      <text x={C} y={C + 12} className="cof-sub">
        {tonality === 'major' ? 'major' : 'minor'} · {signatureLabel(sig)}
      </text>
    </svg>
  );
}

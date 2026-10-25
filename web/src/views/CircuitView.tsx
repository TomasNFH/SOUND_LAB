import { useEffect, useState } from 'react';
import { audioTaper, interstageResponseDb, powerTube, stageGains } from '../audio/champ/circuit';
import { MODS, SPEAKER_MOD, STAGE_NAMES, type StageId } from '../audio/champ/mods';
import { BUILT_IN_CABS, isBuiltInCab } from '../audio/ir';
import { STOCK_CHAMP, type AmpSettings, type ChampSettings } from '../audio/settings';

type Props = { amp: AmpSettings; branch: string };

// What each stage does in the stock amp, for the card.
const STAGE_INFO: Record<StageId, string> = {
  input: 'Two jacks into a 68k/68k/1M network. High is the normal input; Low is about 6 dB quieter, for hot pickups.',
  v2a: 'Half of the 12AX7: the first amplifier, 100k plate resistor, 1.5k cathode resistor bypassed by C3. 25 mV in becomes about 1.2 V.',
  stack: 'A classic treble/bass/middle network with fixed resistors where the pots would be. It gives the classic scooped voice and loses most of the level.',
  volume: 'R13, 1 MΩ audio taper, after the tone stack: it sets how hard V2-B and the 6V6 are driven, so the amp gets cleaner as you turn it down.',
  v2b: 'The other half of the 12AX7. Most of the breakup happens here at high volume. R23 (47 Ω) under its cathode is where the feedback enters.',
  feedback: 'R7 (2.2k) brings about 2% of the speaker signal back to V2-B’s cathode: less gain, less distortion, tighter bass.',
  power: 'One 6V6 in single-ended class A, self-biased by R10 (470 Ω) and C4. One tube handles both halves of the wave, so it clips lopsided: even harmonics.',
  speaker: 'T2 turns the 6V6’s high voltage into what a 4 Ω speaker needs; the stock speaker is a 6" in a small open-back box.',
};

const optionLabel = (key: keyof ChampSettings, value: unknown) =>
  MODS.find((m) => m.key === key)?.options.find((o) => o.value === value)?.label ?? String(value);

type Box = { id: StageId; title: string; lines: string[]; tube?: boolean };

const W = 146;
const H = 84;

// Two layouts for the same eight stages in signal order: four across on
// wide screens, two across on phones (so the text stays readable).
const LAYOUTS = {
  wide: { cols: 4, x0: 8, y0: 16, dx: 168, dy: 140, width: 666 },
  narrow: { cols: 2, x0: 14, y0: 16, dx: 168, dy: 128, width: 336 },
};

function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

export function CircuitView({ amp, branch }: Props) {
  const [stage, setStage] = useState<StageId>('stack');
  const L = useNarrow() ? LAYOUTS.narrow : LAYOUTS.wide;
  const c = amp.champ;
  const g = stageGains(c);
  const pt = powerTube(c.bias);
  const stackDb = interstageResponseDb({ ...c }, 1, new Float32Array([1000]))[0];
  const volDb = 20 * Math.log10(Math.max(1e-4, audioTaper(amp.volume)));
  const stageChanged = (id: StageId) =>
    MODS.some((m) => m.stage === id && c[m.key] !== STOCK_CHAMP[m.key]) ||
    (id === 'stack' && c.toneStack === 'knobs' && c.midPot !== STOCK_CHAMP.midPot) ||
    (id === 'speaker' && amp.cab !== 'champ6');
  const cabName = isBuiltInCab(amp.cab) ? BUILT_IN_CABS[amp.cab] : amp.cab === 'off' ? 'No speaker' : amp.cab;

  const boxes: Box[] = [
    { id: 'input', title: 'Inputs', lines: [c.input === 'high' ? 'High input' : 'Low input (−6 dB)', 'J1 / J2'] },
    {
      id: 'v2a',
      title: 'V2-A',
      tube: true,
      lines: [`${c.tube} · ×${g.a.aHf.toFixed(0)}`, `C3 ${optionLabel('v2aCap', c.v2aCap)}`],
    },
    {
      id: 'stack',
      title: 'Tone stack',
      lines: [
        c.toneStack === 'knobs' ? `Tone knobs · ${c.midPot}k mid` : optionLabel('toneStack', c.toneStack),
        `${stackDb.toFixed(1)} dB at 1 kHz`,
      ],
    },
    { id: 'volume', title: 'Volume R13', lines: [`${Math.round(amp.volume * 100)}%`, `${volDb.toFixed(0)} dB`] },
    {
      id: 'v2b',
      title: 'V2-B',
      tube: true,
      lines: [`×${g.b.aHf.toFixed(0)}`, `C10 ${optionLabel('v2bCap', c.v2bCap)}`],
    },
    {
      id: 'power',
      title: 'V1 6V6',
      tube: true,
      lines: [`R10 ${c.bias} Ω`, `${pt.plateWatts.toFixed(1)} W on the plate`],
    },
    { id: 'speaker', title: 'Transformer T2', lines: ['175 V → 3.35 V', 'Single-ended'] },
    { id: 'speaker', title: 'Speaker', lines: [cabName, '4 Ω'] },
  ];

  const feedbackOn = c.feedback !== 'off';
  const mods = MODS.filter((m) => m.stage === stage);

  const pos = (i: number) => ({ x: L.x0 + (i % L.cols) * L.dx, y: L.y0 + Math.floor(i / L.cols) * L.dy });
  // Wires in signal order: straight within a row, an elbow to the next row.
  const wires = boxes.slice(1).map((_, i) => {
    const a = pos(i);
    const b = pos(i + 1);
    if (a.y === b.y) return `M${a.x + W} ${a.y + H / 2} H${b.x - 2}`;
    const mid = (a.y + H + b.y) / 2;
    return `M${a.x + W / 2} ${a.y + H} V${mid} H${b.x + W / 2} V${b.y - 2}`;
  });
  // Feedback: from the speaker back to V2-B's cathode.
  const spk = pos(7);
  const v2b = pos(4);
  const bottom = Math.max(spk.y, v2b.y) + H;
  const feedbackPath =
    L === LAYOUTS.wide
      ? `M${spk.x + W / 2} ${spk.y + H} V${bottom + 24} H${v2b.x + W / 2} V${v2b.y + H + 2}`
      : `M${spk.x + W / 2} ${spk.y + H} V${bottom + 18} H${L.x0 - 8} V${v2b.y + H / 2} H${v2b.x - 2}`;
  const height = bottom + 60;

  return (
    <div className="circuit-view">
      <p className="muted small view-caption">Branch {branch} · 6V6 combo · tap a stage</p>
      <svg viewBox={`0 0 ${L.width} ${height}`} className="circuit-svg" role="img" aria-label="6V6 combo signal path">
        <defs>
          <marker id="cv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {wires.map((d, i) => (
          <path key={i} className="cv-wire" d={d} markerEnd="url(#cv-arrow)" />
        ))}
        <g className={`cv-feedback ${feedbackOn ? '' : 'off'} ${stage === 'feedback' ? 'selected' : ''}`} onClick={() => setStage('feedback')}>
          <path d={feedbackPath} markerEnd="url(#cv-arrow)" />
          <text x={L.width / 2} y={bottom + 44} textAnchor="middle">
            {feedbackOn ? `Feedback R7 ${optionLabel('feedback', c.feedback)} → R23 47 Ω` : 'Feedback removed'}
          </text>
        </g>
        {boxes.map((b, i) => {
          const { x, y } = pos(i);
          return (
            <g
              key={i}
              className={['cv-box', b.tube ? 'tube' : '', stageChanged(b.id) ? 'changed' : '', stage === b.id ? 'selected' : ''].join(' ')}
              onClick={() => setStage(b.id)}
            >
              <rect x={x} y={y} width={W} height={H} rx="8" />
              <text className="cv-title" x={x + W / 2} y={y + 24} textAnchor="middle">
                {b.title}
              </text>
              {b.lines.map((l, j) => (
                <text key={j} className="cv-line" x={x + W / 2} y={y + 46 + j * 18} textAnchor="middle">
                  {l}
                </text>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="cv-card">
        <h3>{STAGE_NAMES[stage]}</h3>
        <p>{STAGE_INFO[stage]}</p>
        {mods.map((m) => {
          const changed = c[m.key] !== STOCK_CHAMP[m.key];
          return (
            <div key={m.key} className={`cv-mod ${changed ? 'changed' : ''}`}>
              <p className="cv-mod-title">
                {m.label} ({m.part}): <strong>{optionLabel(m.key, c[m.key])}</strong>
                {changed && <span className="muted"> · stock: {optionLabel(m.key, STOCK_CHAMP[m.key])}</span>}
              </p>
              <p>{m.what}</p>
              <p>
                <span className="cv-k">Listen</span> {m.listen}
              </p>
              <p>
                <span className="cv-k">Look</span> {m.look}
              </p>
              {m.estimate && <p className="muted small">{m.estimate}</p>}
            </div>
          );
        })}
        {stage === 'speaker' && (
          <div className={`cv-mod ${amp.cab !== 'champ6' ? 'changed' : ''}`}>
            <p className="cv-mod-title">
              Speaker: <strong>{cabName}</strong>
            </p>
            <p>{SPEAKER_MOD.what}</p>
            <p>
              <span className="cv-k">Listen</span> {SPEAKER_MOD.listen}
            </p>
            <p>
              <span className="cv-k">Look</span> {SPEAKER_MOD.look}
            </p>
          </div>
        )}
        {mods.length > 0 || stage === 'speaker' ? (
          <p className="muted small">Change these in the Amp block below the chain.</p>
        ) : null}
      </div>
    </div>
  );
}

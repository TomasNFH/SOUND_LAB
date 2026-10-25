import type { CSSProperties } from 'react';
import type { SourceKind } from '../audio/AudioEngine';
import { BUILT_IN_REVERBS, isBuiltInReverb } from '../audio/blocks/Reverb';
import { changedMods } from '../audio/champ/mods';
import { STOCK_CHAMP, type BranchId, type Branches, type PedalType, type ToneSettings } from '../audio/settings';
import { fmt } from './Knob';

export type BlockId = 'pedal' | 'eq' | 'amp' | 'delay' | 'reverb';
export type Selection = 'source' | { branch: BranchId; block: BlockId };

type Props = {
  branches: Branches;
  source: SourceKind;
  listening: BranchId;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onToggle: (branch: BranchId, block: BlockId) => void;
  onListen: (branch: BranchId) => void;
  // Auto A/B: `cycle` changes on every switch (restarting the countdown);
  // `running` is false while paused or stopped.
  auto: { on: boolean; seconds: number; cycle: number; running: boolean };
  onAuto: (on: boolean) => void;
  onAutoSeconds: (seconds: number) => void;
  onCopy: (from: BranchId, to: BranchId) => void;
  onResetA: () => void;
};

const BLOCKS: { id: BlockId; label: string }[] = [
  { id: 'pedal', label: 'Distortion' },
  { id: 'eq', label: 'EQ' },
  { id: 'amp', label: 'Amp' },
  { id: 'delay', label: 'Delay' },
  { id: 'reverb', label: 'Reverb' },
];
const BRANCHES: BranchId[] = ['a', 'b'];
const AUTO_INTERVALS = [2, 5, 10];

const PEDAL_NAMES: Record<PedalType, string> = {
  boost: 'Clean boost 4558',
  ts: 'Tube Screamer',
  bd: 'Blues Driver',
  ds2: 'DS-2 Turbo',
  klon: 'Klon',
};

const SOURCE_NAMES: Record<SourceKind, string> = {
  clip: 'Clip',
  sine: 'Sine',
  noise: 'Pink noise',
  sweep: 'Sweep',
  live: 'Live input',
};

// What a cell shows: the block's main setting, plus a tag when its
// position switch has moved it from the default place in the chain.
function describe(s: ToneSettings, block: BlockId): { on: boolean; detail: string; tag?: string } {
  switch (block) {
    case 'pedal':
      return { on: s.pedal.on, detail: PEDAL_NAMES[s.pedal.type] };
    case 'eq': {
      const boosted = s.eq.bands.filter((b) => b.on && b.gain !== 0).length;
      return {
        on: s.eq.on,
        detail: boosted ? `${boosted} band${boosted > 1 ? 's' : ''} moved` : 'flat',
        tag: s.eq.position === 'pre' ? 'before distortion' : undefined,
      };
    }
    case 'amp': {
      if (s.amp.model !== 'champ600') return { on: s.amp.on, detail: `generic · ${fmt.pct(s.amp.volume)}` };
      const mods = changedMods(s.amp.champ, STOCK_CHAMP).length + (s.amp.cab !== 'champ6' ? 1 : 0);
      return {
        on: s.amp.on,
        detail: `Champ · ${fmt.pct(s.amp.volume)}`,
        tag: mods ? `${mods} mod${mods > 1 ? 's' : ''}` : undefined,
      };
    }
    case 'delay':
      return {
        on: s.delay.on,
        detail: `${s.delay.mode} · ${fmt.ms(s.delay.time)}`,
        tag: s.fxPosition === 'pre' ? 'before amp' : undefined,
      };
    case 'reverb':
      return {
        on: s.reverb.on,
        detail: isBuiltInReverb(s.reverb.type) ? BUILT_IN_REVERBS[s.reverb.type].name : s.reverb.type,
        tag: s.fxPosition === 'pre' ? 'before amp' : undefined,
      };
  }
}

// Grid position, as CSS variables: rows are branches and columns blocks on
// wide screens; the stylesheet swaps them on phones.
const at = (row: number, col: number) => ({ '--r': row, '--c': col }) as CSSProperties;

const Arrow = () => (
  <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
    <path d="M1 6h19M15 1.5 21 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// The source splits into two complete chains, A and B, that meet at the
// output switch. Tap a cell to open that branch's block below.
export function ChainMatrix(props: Props) {
  const { branches, source, listening, selection, onSelect, onToggle, onListen, onCopy, onResetA } = props;
  const { auto, onAuto, onAutoSeconds } = props;
  const isSelected = (branch: BranchId, block: BlockId) =>
    selection !== 'source' && selection.branch === branch && selection.block === block;

  return (
    <section className="matrix-wrap" aria-label="Signal chain">
      <div className="matrix">
        <button
          className={`mx-end mx-source ${selection === 'source' ? 'selected' : ''}`}
          onClick={() => onSelect('source')}
          aria-pressed={selection === 'source'}
        >
          <span className="chain-label">Source</span>
          <span className="chain-detail">{SOURCE_NAMES[source]}</span>
        </button>
        <span className="mx-link" aria-hidden="true">
          <Arrow />
        </span>

        <div className="mx-grid">
          {BLOCKS.map((b, i) => (
            <span key={b.id} className="mx-head" style={at(1, i + 2)}>
              {b.label}
            </span>
          ))}
          {BRANCHES.map((branch, r) => (
            <span
              key={branch}
              className={`mx-branch ${listening === branch ? 'live' : ''}`}
              style={at(r + 2, 1)}
              title={listening === branch ? 'You are hearing this branch' : undefined}
            >
              {branch.toUpperCase()}
            </span>
          ))}
          {BRANCHES.map((branch, r) =>
            BLOCKS.map((b, i) => {
              const d = describe(branches[branch], b.id);
              const sel = isSelected(branch, b.id);
              return (
                <div
                  key={`${branch}-${b.id}`}
                  className={['mx-cell', d.on ? '' : 'off', sel ? 'selected' : ''].filter(Boolean).join(' ')}
                  style={at(r + 2, i + 2)}
                >
                  <button
                    className="chain-main"
                    onClick={() => onSelect({ branch, block: b.id })}
                    aria-pressed={sel}
                    aria-label={`Branch ${branch.toUpperCase()} ${b.label}: ${d.on ? d.detail : 'off'}`}
                  >
                    <span className="chain-label mx-cell-label">{b.label}</span>
                    <span className="chain-detail">{d.on ? d.detail : 'off'}</span>
                    {d.tag && <span className="mx-tag">{d.tag}</span>}
                  </button>
                  <button
                    className={`chain-power ${d.on ? 'is-on' : ''}`}
                    onClick={() => onToggle(branch, b.id)}
                    aria-label={`${d.on ? 'Bypass' : 'Turn on'} branch ${branch.toUpperCase()} ${b.label}`}
                    title={d.on ? 'Bypass' : 'Turn on'}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M8 2v6M4.5 4.5a5 5 0 1 0 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            }),
          )}
        </div>

        <span className="mx-link" aria-hidden="true">
          <Arrow />
        </span>
        <div className="mx-end mx-output">
          <span className="chain-label">Output</span>
          <div className="seg mx-listen" role="group" aria-label="Branch you hear">
            {BRANCHES.map((branch) => (
              <button key={branch} className={listening === branch ? 'on' : ''} onClick={() => onListen(branch)}>
                {branch.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mx-auto">
            <button
              className={`mx-auto-toggle ${auto.on ? 'on' : ''}`}
              onClick={() => onAuto(!auto.on)}
              aria-pressed={auto.on}
              title="Switch between A and B automatically while playing"
            >
              Auto
            </button>
            <select
              className="compact"
              value={auto.seconds}
              onChange={(e) => onAutoSeconds(Number(e.target.value))}
              aria-label="Auto switch interval"
            >
              {AUTO_INTERVALS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec} s
                </option>
              ))}
            </select>
          </div>
          {auto.on && (
            <div className="mx-auto-track" aria-hidden="true">
              {auto.running && (
                <span key={auto.cycle} className="mx-auto-progress" style={{ animationDuration: `${auto.seconds}s` }} />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-actions">
        <button onClick={() => onCopy('a', 'b')}>Copy A → B</button>
        <button onClick={() => onCopy('b', 'a')}>Copy B → A</button>
        <button onClick={onResetA}>Reset A to dry</button>
      </div>
    </section>
  );
}

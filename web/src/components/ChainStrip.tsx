import { Fragment } from 'react';
import type { SourceKind } from '../audio/AudioEngine';
import { BUILT_IN_REVERBS, isBuiltInReverb } from '../audio/blocks/Reverb';
import type { PedalType, ToneSettings } from '../audio/settings';
import { fmt } from './Knob';

export type BlockId = 'source' | 'eq' | 'pedal' | 'amp' | 'delay' | 'reverb';

type Props = {
  settings: ToneSettings;
  source: SourceKind;
  selected: BlockId;
  onSelect: (id: BlockId) => void;
  onToggle: (id: Exclude<BlockId, 'source'>) => void;
};

const PEDAL_NAMES: Record<PedalType, string> = {
  boost: 'Clean boost',
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

type Block = { id: BlockId | 'out'; label: string; detail: string; on: boolean };

// The blocks in the order the sound actually goes through them: the EQ
// and the delay/reverb pair move when their position switches change.
function chainOrder(s: ToneSettings, source: SourceKind): Block[] {
  const eq: Block = { id: 'eq', label: 'EQ', detail: s.eq.position === 'pre' ? 'before pedal' : 'after pedal', on: s.eq.on };
  const pedal: Block = { id: 'pedal', label: 'Pedal', detail: PEDAL_NAMES[s.pedal.type], on: s.pedal.on };
  const amp: Block = { id: 'amp', label: 'Amp', detail: `volume ${fmt.pct(s.amp.volume)}`, on: s.amp.on };
  const delay: Block = { id: 'delay', label: 'Delay', detail: `${s.delay.mode} · ${fmt.ms(s.delay.time)}`, on: s.delay.on };
  const reverbName = isBuiltInReverb(s.reverb.type) ? BUILT_IN_REVERBS[s.reverb.type].name : s.reverb.type;
  const reverb: Block = { id: 'reverb', label: 'Reverb', detail: reverbName, on: s.reverb.on };

  const front = s.eq.position === 'pre' ? [eq, pedal] : [pedal, eq];
  const back = s.fxPosition === 'pre' ? [delay, reverb, amp] : [amp, delay, reverb];
  return [
    { id: 'source', label: 'Source', detail: SOURCE_NAMES[source], on: true },
    ...front,
    ...back,
    { id: 'out', label: 'Output', detail: 'A/B · volume', on: true },
  ];
}

// The signal chain as connected blocks. Tap a block to open its controls
// below; the power button bypasses it without opening it.
export function ChainStrip({ settings, source, selected, onSelect, onToggle }: Props) {
  const blocks = chainOrder(settings, source);
  return (
    <nav className="chain" aria-label="Signal chain">
      {blocks.map((b, i) => (
        <Fragment key={b.id}>
          {i > 0 && (
            <span className={`chain-link ${b.on && blocks[i - 1].on ? '' : 'dim'}`} aria-hidden="true">
              <svg viewBox="0 0 24 12" width="24" height="12">
                <path d="M1 6h19M15 1.5 21 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <div
            className={['chain-block', b.on ? '' : 'off', b.id === selected ? 'selected' : '', b.id === 'out' ? 'static' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {b.id === 'out' ? (
              <div className="chain-main">
                <span className="chain-label">{b.label}</span>
                <span className="chain-detail">{b.detail}</span>
              </div>
            ) : (
              <button className="chain-main" onClick={() => onSelect(b.id as BlockId)} aria-pressed={b.id === selected}>
                <span className="chain-label">{b.label}</span>
                <span className="chain-detail">{b.detail}</span>
              </button>
            )}
            {b.id !== 'source' && b.id !== 'out' && (
              <button
                className={`chain-power ${b.on ? 'is-on' : ''}`}
                onClick={() => onToggle(b.id as Exclude<BlockId, 'source'>)}
                aria-label={`${b.on ? 'Bypass' : 'Turn on'} ${b.label}`}
                title={b.on ? 'Bypass' : 'Turn on'}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M8 2v6M4.5 4.5a5 5 0 1 0 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </Fragment>
      ))}
    </nav>
  );
}

import type { AudioEngine } from '../audio/AudioEngine';
import { expectedResponseDb } from '../audio/response';
import { isDry, type BranchId, type Branches } from '../audio/settings';
import { branchAmpTransfer, branchPedalTransfer } from '../audio/transfer';
import { ToneStackView } from './ToneStackView';
import { CircuitView } from './CircuitView';
import { HarmonicsView } from './HarmonicsView';
import { ResponseView } from './ResponseView';
import { TimeView } from './TimeView';
import { TransferView } from './TransferView';
import { SpectrumView } from './SpectrumView';
import { WaveformView } from './WaveformView';

export const TABS = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'response', label: 'Filters' },
  { id: 'harmonics', label: 'Harmonics' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'time', label: 'Delay & reverb' },
  { id: 'circuit', label: 'Circuit' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

// Which view is showing and its options. Held by the app so the full
// panel and the floating mini view always show the same thing.
export type ViewOptions = {
  tab: TabId;
  matchLevels: boolean;
  showDiff: boolean;
  windowMs: number;
  transferOf: 'pedal' | 'amp';
};

export const DEFAULT_VIEW: ViewOptions = {
  tab: 'spectrum',
  matchLevels: false,
  showDiff: true,
  windowMs: 20,
  transferOf: 'pedal',
};

type Props = {
  engine: AudioEngine;
  branches: Branches;
  editing: BranchId; // the branch whose blocks are open below; single-branch views show it
  highlight?: { lo: number; hi: number } | null;
  activeBand: number | null;
  view: ViewOptions;
  onView: (patch: Partial<ViewOptions>) => void;
  // Mini: the floating copy shown while the full panel is scrolled away.
  // Compact header instead of tabs and options; notes under charts hidden.
  mini?: { onExpand: () => void; onClose: () => void };
};

export function ViewsPanel({ engine, branches, editing, highlight, activeBand, view, onView, mini }: Props) {
  const settings = branches[editing];
  const { tab, matchLevels, showDiff, windowMs, transferOf } = view;

  return (
    <section className={`panel views ${mini ? 'mini' : ''}`} aria-label={mini ? 'Mini view' : undefined}>
      {mini ? (
        <div className="mini-head">
          <select className="compact" value={tab} onChange={(e) => onView({ tab: e.target.value as TabId })} aria-label="View">
            {TABS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="legend">
            <i className="swatch dry" /> A <i className="swatch wet" /> B
          </span>
          <button className="icon-btn" onClick={mini.onExpand} aria-label="Back to the full view" title="Back to the full view">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="icon-btn" onClick={mini.onClose} aria-label="Close the mini view" title="Close">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab on' : 'tab'}
              onClick={() => onView({ tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'spectrum' && (
        <SpectrumView
          engine={engine}
          matchLevels={matchLevels}
          showDiff={showDiff}
          highlight={highlight}
          // Predictable only while A is dry: then B − A is B's own response.
          expected={(freqs) => (isDry(branches.a) ? expectedResponseDb(engine.ctx, branches.b, freqs) : null)}
        />
      )}
      {tab === 'response' && (
        <div className="filters-pair">
          <p className="muted small view-caption">Branch {editing.toUpperCase()}</p>
          <ResponseView ctx={engine.ctx} settings={settings} activeBand={activeBand} />
          <ToneStackView branches={branches} />
        </div>
      )}
      {tab === 'circuit' &&
        (settings.amp.model === 'champ600' ? (
          <CircuitView amp={settings.amp} branch={editing.toUpperCase()} />
        ) : (
          <p className="muted small view-caption">
            Branch {editing.toUpperCase()} uses the generic amp. Pick the 6V6 combo in its Amp block to see the circuit.
          </p>
        ))}
      {tab === 'harmonics' && <HarmonicsView engine={engine} />}
      {tab === 'transfer' && (
        <>
          {!mini && (
            <div className="seg view-switch">
              <button className={transferOf === 'pedal' ? 'on' : ''} onClick={() => onView({ transferOf: 'pedal' })}>
                Distortion
              </button>
              <button className={transferOf === 'amp' ? 'on' : ''} onClick={() => onView({ transferOf: 'amp' })}>
                Amp preamp
              </button>
            </div>
          )}
          <TransferView
            a={transferOf === 'pedal' ? branchPedalTransfer(branches.a) : branchAmpTransfer(branches.a)}
            b={transferOf === 'pedal' ? branchPedalTransfer(branches.b) : branchAmpTransfer(branches.b)}
            inputRange={transferOf === 'pedal' ? 0.5 : settings.amp.model === 'champ600' ? 3 : 1}
          />
        </>
      )}
      {tab === 'time' && <TimeView engine={engine} settings={settings} branch={editing} />}
      {tab === 'waveform' && <WaveformView engine={engine} windowMs={windowMs} matchLevels={matchLevels} />}

      {!mini && (tab === 'spectrum' || tab === 'waveform') && (
        <div className="row view-options">
          <span className="legend">
            <i className="swatch dry" /> A <i className="swatch wet" /> B
            {tab === 'spectrum' && showDiff && (
              <>
                <i className="swatch diff" /> Measured <i className="swatch alt" /> Expected
              </>
            )}
          </span>
          <label className="check">
            <input type="checkbox" checked={matchLevels} onChange={(e) => onView({ matchLevels: e.target.checked })} />
            Level-matched
          </label>
          {tab === 'spectrum' && (
            <label className="check">
              <input type="checkbox" checked={showDiff} onChange={(e) => onView({ showDiff: e.target.checked })} />
              Difference
            </label>
          )}
          {tab === 'waveform' && (
            <select className="compact" value={windowMs} onChange={(e) => onView({ windowMs: Number(e.target.value) })}>
              {[10, 20, 40, 80, 160].map((ms) => (
                <option key={ms} value={ms}>
                  {ms} ms
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </section>
  );
}

import { useState } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { expectedResponseDb } from '../audio/response';
import { isDry, type BranchId, type Branches } from '../audio/settings';
import { branchAmpTransfer, branchPedalTransfer } from '../audio/transfer';
import { HarmonicsView } from './HarmonicsView';
import { ResponseView } from './ResponseView';
import { TimeView } from './TimeView';
import { TransferView } from './TransferView';
import { SpectrumView } from './SpectrumView';
import { WaveformView } from './WaveformView';

type Props = {
  engine: AudioEngine;
  branches: Branches;
  editing: BranchId; // the branch whose blocks are open below; single-branch views show it
  highlight?: { lo: number; hi: number } | null;
  activeBand: number | null;
};

const TABS = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'response', label: 'Filters' },
  { id: 'harmonics', label: 'Harmonics' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'time', label: 'Delay & reverb' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ViewsPanel({ engine, branches, editing, highlight, activeBand }: Props) {
  const settings = branches[editing];
  const [tab, setTab] = useState<TabId>('spectrum');
  const [matchLevels, setMatchLevels] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [windowMs, setWindowMs] = useState(20);
  const [transferOf, setTransferOf] = useState<'pedal' | 'amp'>('pedal');

  return (
    <section className="panel views">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab on' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

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
        <>
          <p className="muted small view-caption">Branch {editing.toUpperCase()}</p>
          <ResponseView ctx={engine.ctx} settings={settings} activeBand={activeBand} />
        </>
      )}
      {tab === 'harmonics' && <HarmonicsView engine={engine} />}
      {tab === 'transfer' && (
        <>
          <div className="seg view-switch">
            <button className={transferOf === 'pedal' ? 'on' : ''} onClick={() => setTransferOf('pedal')}>
              Pedal
            </button>
            <button className={transferOf === 'amp' ? 'on' : ''} onClick={() => setTransferOf('amp')}>
              Amp preamp
            </button>
          </div>
          <TransferView
            a={transferOf === 'pedal' ? branchPedalTransfer(branches.a) : branchAmpTransfer(branches.a)}
            b={transferOf === 'pedal' ? branchPedalTransfer(branches.b) : branchAmpTransfer(branches.b)}
            inputRange={transferOf === 'pedal' ? 0.5 : 1}
          />
        </>
      )}
      {tab === 'time' && <TimeView engine={engine} settings={settings} branch={editing} />}
      {tab === 'waveform' && <WaveformView engine={engine} windowMs={windowMs} matchLevels={matchLevels} />}

      {(tab === 'spectrum' || tab === 'waveform') && (
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
            <input type="checkbox" checked={matchLevels} onChange={(e) => setMatchLevels(e.target.checked)} />
            Level-matched
          </label>
          {tab === 'spectrum' && (
            <label className="check">
              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
              Difference
            </label>
          )}
          {tab === 'waveform' && (
            <select className="compact" value={windowMs} onChange={(e) => setWindowMs(Number(e.target.value))}>
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

import { useState } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { expectedResponseDb } from '../audio/response';
import type { ToneSettings } from '../audio/settings';
import { pedalTransfer } from '../audio/transfer';
import { HarmonicsView } from './HarmonicsView';
import { ResponseView } from './ResponseView';
import { TransferView } from './TransferView';
import { SpectrumView } from './SpectrumView';
import { WaveformView } from './WaveformView';

type Props = {
  engine: AudioEngine;
  settings: ToneSettings;
  highlight?: { lo: number; hi: number } | null;
  activeBand: number | null;
};

const TABS = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'response', label: 'EQ response' },
  { id: 'harmonics', label: 'Harmonics' },
  { id: 'transfer', label: 'Transfer' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ViewsPanel({ engine, settings, highlight, activeBand }: Props) {
  const [tab, setTab] = useState<TabId>('spectrum');
  const [matchLevels, setMatchLevels] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [windowMs, setWindowMs] = useState(20);

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
          expected={(freqs) => expectedResponseDb(engine.ctx, settings, freqs)}
        />
      )}
      {tab === 'response' && <ResponseView ctx={engine.ctx} settings={settings} activeBand={activeBand} />}
      {tab === 'harmonics' && <HarmonicsView engine={engine} />}
      {tab === 'transfer' && <TransferView transfer={pedalTransfer(settings.pedal)} />}
      {tab === 'waveform' && <WaveformView engine={engine} windowMs={windowMs} matchLevels={matchLevels} />}

      {(tab === 'spectrum' || tab === 'waveform') && (
        <div className="row view-options">
          <span className="legend">
            <i className="swatch dry" /> Before <i className="swatch wet" /> After
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

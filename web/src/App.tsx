import { useEffect, useState } from 'react';
import { Logo } from './components/Logo';
import { DrumLab } from './sections/DrumLab';
import { TheoryLab } from './sections/TheoryLab';
import { ToneLab } from './ToneLab';

type Section = 'tone' | 'theory' | 'drums';

const SECTIONS: { id: Section; label: string; short: string }[] = [
  { id: 'tone', label: 'Tone Lab', short: 'Tone' },
  { id: 'theory', label: 'Theory Lab', short: 'Theory' },
  { id: 'drums', label: 'Drum Lab', short: 'Drums' },
];

// The section lives in the URL hash (#/tone, #/theory, #/drums) so links and
// the back button work, including on the static GitHub Pages build.
const sectionFromHash = (): Section => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return SECTIONS.some((s) => s.id === id) ? (id as Section) : 'tone';
};

export function App() {
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <main className="app">
      <header className="header">
        <div className="brand">
          <Logo />
          <h1>SoundLab</h1>
        </div>
        <nav className="section-tabs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#/${s.id}`} className={section === s.id ? 'on' : ''} aria-current={section === s.id ? 'page' : undefined}>
              <span className="long">{s.label}</span>
              <span className="short">{s.short}</span>
            </a>
          ))}
        </nav>
        {/* Actions for the open section only, so the header never crowds. */}
        <div className="header-actions">
          {section === 'tone' && (
            <button className="header-btn" onClick={() => setShowPresets((v) => !v)} aria-expanded={showPresets}>
              Presets and export
            </button>
          )}
        </div>
      </header>

      <ToneLab active={section === 'tone'} showPresets={showPresets} />
      {section === 'theory' && <TheoryLab />}
      {section === 'drums' && <DrumLab />}

      <footer className="site-footer muted small">
        SoundLab is an independent educational project, MIT licensed. Its pedal and amp models have generic names and
        are approximations; any product names or trademarks belong to their owners, and this project is not affiliated
        with or endorsed by them.
      </footer>
    </main>
  );
}

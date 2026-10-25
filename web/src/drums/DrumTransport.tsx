import { drums } from './DrumMachine';
import { grooveById } from './patterns';
import { useCurrentStep, useDrums } from './useDrums';

// True on the first step of each beat while playing, to pulse in time.
function useOnBeat() {
  const { playing } = useDrums();
  const step = useCurrentStep(playing, 4);
  return step >= 0 && step % 4 === 0;
}

// Header control for a beat that is playing while another section is open.
export function DrumTransport() {
  const { playing, bpm, grooveId } = useDrums();
  const onBeat = useOnBeat();
  if (!playing) return null;
  return (
    <div className="drum-mini">
      <a href="#/drums" className="drum-mini-link" title="Open Drum Lab">
        <span className={`drum-mini-pulse ${onBeat ? 'on' : ''}`} />
        {grooveById(grooveId).label} · {bpm} BPM
      </a>
      <button onClick={() => drums.stop()} aria-label="Stop the drums">
        ■
      </button>
    </div>
  );
}

// On phones the header has no room for that control, so the Drums tab
// pulses instead; one tap there reaches Stop.
export function DrumTabPulse() {
  const { playing } = useDrums();
  const onBeat = useOnBeat();
  if (!playing) return null;
  return <span className={`drum-mini-pulse tab-pulse ${onBeat ? 'on' : ''}`} aria-label="Drums playing" />;
}

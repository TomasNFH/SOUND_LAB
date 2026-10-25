import { drums } from './DrumMachine';
import { patternById } from './patterns';
import { useCurrentStep, useDrums } from './useDrums';

// True for the first step of each beat while playing, to pulse in time.
function useOnBeat() {
  const { playing, patternId } = useDrums();
  const step = useCurrentStep(playing);
  return step >= 0 && step % patternById(patternId).stepsPerBeat === 0;
}

// Header control for a beat that is playing while another section is open.
export function DrumTransport() {
  const { playing, bpm, patternId } = useDrums();
  const onBeat = useOnBeat();
  const pattern = patternById(patternId);
  if (!playing) return null;
  return (
    <div className="drum-mini">
      <a href="#/drums" className="drum-mini-link" title="Open Drum Lab">
        <span className={`drum-mini-pulse ${onBeat ? 'on' : ''}`} />
        {pattern.label} · {bpm} BPM
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

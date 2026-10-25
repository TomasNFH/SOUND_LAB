import { useEffect, useState, useSyncExternalStore } from 'react';
import { drums } from './DrumMachine';

export const useDrums = () => useSyncExternalStore(drums.subscribe, drums.getState);

// The grid step being heard (counted across the whole loop), refreshed every
// frame while playing; -1 when stopped. Only re-renders when the step changes.
export function useCurrentStep(playing: boolean, stepsPerBeat: number) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!playing) {
      setStep(-1);
      return;
    }
    let raf = 0;
    const frame = () => {
      const beat = drums.position();
      setStep(beat < 0 ? -1 : Math.floor(beat * stepsPerBeat + 0.0001));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, stepsPerBeat]);
  return step;
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import { drums } from './DrumMachine';

export const useDrums = () => useSyncExternalStore(drums.subscribe, drums.getState);

// The step being heard, refreshed every frame while playing.
export function useCurrentStep(playing: boolean) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!playing) {
      setStep(-1);
      return;
    }
    let raf = 0;
    const frame = () => {
      setStep(drums.currentStep());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return step;
}

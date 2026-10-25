import { live } from './LiveEngine';
import { useLive } from './useLive';

// Header control while Live runs and another section is open.
export function LiveIndicator() {
  const { running } = useLive();
  if (!running) return null;
  return (
    <div className="drum-mini live-mini">
      <a href="#/live" className="drum-mini-link" title="Open Live">
        <span className="live-dot" />
        Live
      </a>
      <button onClick={() => live.stop()} aria-label="Stop live input">
        ■
      </button>
    </div>
  );
}

// On phones the Live tab shows a dot instead.
export function LiveTabDot() {
  const { running } = useLive();
  return running ? <span className="live-dot tab-pulse" aria-label="Live is on" /> : null;
}

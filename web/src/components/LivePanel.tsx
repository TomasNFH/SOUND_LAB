import { useEffect, useState } from 'react';
import type { AudioEngine, LiveOptions } from '../audio/AudioEngine';
import { fmt, Knob } from './Knob';

type Props = { engine: AudioEngine; playing: boolean };

// Live input from the audio interface. Device names only appear after the
// browser has been given microphone permission once.
export function LivePanel({ engine, playing }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [opts, setOpts] = useState<LiveOptions>({ deviceId: '', channel: 'left', trimDb: 0 });
  const [, tick] = useState(0);

  useEffect(() => engine.setLiveOptions(opts), [engine, opts]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const refresh = () =>
      md
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput')))
        .catch(() => setDevices([]));
    void refresh();
    md.addEventListener?.('devicechange', refresh);
    return () => md.removeEventListener?.('devicechange', refresh);
  }, [playing]);

  // Refresh the latency readout while live.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  if (!navigator.mediaDevices?.getUserMedia) {
    return <p className="muted small">This browser can't open audio inputs here (it needs https or localhost).</p>;
  }

  const lat = engine.latency;
  const totalMs = (lat.base + lat.output + lat.input) * 1000;
  const error = engine.liveInputError;

  return (
    <>
      <p className="muted small">
        Use headphones: with speakers the processed sound feeds back into the input. Press Play to start
        listening.
      </p>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={opts.deviceId} onChange={(e) => setOpts({ ...opts, deviceId: e.target.value })}>
          <option value="">Default input</option>
          {devices
            .filter((d) => d.deviceId && d.deviceId !== 'default')
            .map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${i + 1}`}
              </option>
            ))}
        </select>
      </div>
      <div className="switches">
        <div className="switch-row">
          <span className="switch-label">Channel</span>
          <div className="seg">
            {(['left', 'right', 'both'] as const).map((c) => (
              <button key={c} className={opts.channel === c ? 'on' : ''} onClick={() => setOpts({ ...opts, channel: c })}>
                {c === 'left' ? 'Input 1' : c === 'right' ? 'Input 2' : 'Both'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="knobs">
        <Knob label="Input trim" value={opts.trimDb} min={-24} max={24} step={0.5} defaultValue={0} format={fmt.db} onChange={(trimDb) => setOpts({ ...opts, trimDb })} />
      </div>
      {playing && !error && (
        <p className="muted small">
          Latency about {totalMs.toFixed(0)} ms (browser {(lat.base * 1000).toFixed(0)} + output{' '}
          {(lat.output * 1000).toFixed(0)}
          {lat.input > 0 && <> + input {(lat.input * 1000).toFixed(0)}</>} ms). Under ~15 ms feels immediate.
        </p>
      )}
      {error && <p className="muted small error">Input failed: {error}</p>}
    </>
  );
}

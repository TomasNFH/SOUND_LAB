import { useEffect, useState } from 'react';
import { getEngine } from '../audio/toneEngine';
import type { ToneSettings } from '../audio/settings';
import { fmt, Knob } from '../components/Knob';
import { canPickOutput, live, type InputChannel, type LatencyMode, type LiveTone } from '../live/LiveEngine';
import { useLive } from '../live/useLive';

const CHANNELS: { id: InputChannel; label: string }[] = [
  { id: 'left', label: 'Input 1' },
  { id: 'right', label: 'Input 2' },
  { id: 'both', label: 'Both' },
];

const LATENCY: { id: LatencyMode; label: string; hint: string }[] = [
  { id: 'lowest', label: 'Lowest', hint: 'Smallest buffer the browser allows.' },
  { id: 'low', label: 'Low', hint: "The browser's usual setting for live audio." },
  { id: 'safe', label: 'Safe', hint: 'A bigger buffer, for when Lowest crackles.' },
];

// Which blocks a Tone Lab branch has switched on, in chain order.
function chainSummary(s: ToneSettings | undefined) {
  if (!s) return 'not set up yet';
  const on = [
    s.pedal.on && 'Distortion',
    s.eq.on && 'EQ',
    s.amp.on && 'Amp',
    s.delay.on && 'Delay',
    s.reverb.on && 'Reverb',
  ].filter(Boolean);
  return on.length ? on.join(' · ') : 'everything bypassed';
}

function useDevices(kind: MediaDeviceKind, refreshKey: unknown) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const refresh = () =>
      md
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default')))
        .catch(() => setDevices([]));
    void refresh();
    md.addEventListener?.('devicechange', refresh);
    return () => md.removeEventListener?.('devicechange', refresh);
  }, [kind, refreshKey]);
  return devices;
}

// Input level and latency, refreshed every frame while live and on screen.
function useLiveReadout(running: boolean) {
  const [peak, setPeak] = useState(-Infinity);
  const [held, setHeld] = useState(-Infinity);
  const [clipAt, setClipAt] = useState(0);
  useEffect(() => {
    if (!running) {
      setPeak(-Infinity);
      return;
    }
    let raf = 0;
    let hold = -Infinity;
    let holdUntil = 0;
    const frame = (now: number) => {
      const db = live.inputPeakDb();
      setPeak(db);
      if (db >= hold || now > holdUntil) {
        hold = db;
        holdUntil = now + 1200;
        setHeld(db);
      }
      if (db > -1) setClipAt(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return { peak, held, clipping: running && performance.now() - clipAt < 1500 };
}

// Meter scale: -60 dBFS at the left, 0 at the right.
const meterPos = (db: number) => `${Math.max(0, Math.min(1, (db + 60) / 60)) * 100}%`;

export function LiveLab({ active }: { active: boolean }) {
  const state = useLive();
  const { running, starting, error } = state;
  const inputs = useDevices('audioinput', running);
  const outputs = useDevices('audiooutput', running);
  const { peak, held, clipping } = useLiveReadout(running && active);
  const settings = getEngine().currentSettings;
  const lat = running ? live.latency() : null;
  const totalMs = lat ? (lat.base + lat.output + lat.input) * 1000 : 0;

  // Pick up Tone Lab edits when coming back to this section.
  useEffect(() => {
    if (active) live.refreshTone();
  }, [active]);

  if (!navigator.mediaDevices?.getUserMedia) {
    return (
      <section className="panel">
        <h2>Live</h2>
        <p className="muted">This browser can't open audio inputs here (it needs https or localhost).</p>
      </section>
    );
  }

  return (
    <div className="live-lab">
      <section className="panel">
        <div className="panel-head">
          <h2>Live</h2>
          <span className={`live-status ${running ? 'on' : ''}`}>{running ? 'Live' : starting ? 'Starting…' : 'Off'}</span>
        </div>
        <p className="muted small">
          Your guitar through the audio interface, straight to your headphones. Live runs on its own with the smallest
          audio buffer, and Tone Lab pauses while it's on. It keeps playing in the other sections, so you can play
          along with Drum Lab.
        </p>
        <div className="live-start">
          <button className={`primary live-btn ${running ? 'stop' : ''}`} onClick={() => live.toggle()} disabled={starting}>
            {running ? 'Stop' : starting ? 'Starting…' : 'Start'}
          </button>
          <div className="live-meter" aria-label="Input level">
            <div className="live-meter-bar">
              <span className="live-meter-fill" style={{ clipPath: `inset(0 calc(100% - ${meterPos(peak)}) 0 0)` }} />
              {running && <span className="live-meter-hold" style={{ left: meterPos(held) }} />}
              <span className="live-meter-target" />
            </div>
            <div className="live-meter-scale">
              <span>-60</span>
              <span>-18</span>
              <span>0 dB</span>
            </div>
          </div>
          <span className={`live-clip ${clipping ? 'on' : ''}`}>{clipping ? 'Clipping' : running ? fmt.db(held) : ''}</span>
        </div>
        {clipping && (
          <p className="muted small error">
            The input is clipping: turn the gain knob on the interface down until the meter peaks around -12 dB.
          </p>
        )}
        {error && <p className="muted small error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Input and output</h2>
        <div className="live-rows">
          <label className="live-row">
            <span className="switch-label">Input</span>
            <select value={state.deviceId} onChange={(e) => live.setDevice(e.target.value)}>
              <option value="">Default input</option>
              {inputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="live-row">
            <span className="switch-label">Channel</span>
            <div className="seg" role="group" aria-label="Input channel">
              {CHANNELS.map((c) => (
                <button key={c.id} className={state.channel === c.id ? 'on' : ''} onClick={() => live.setChannel(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {canPickOutput && (
            <label className="live-row">
              <span className="switch-label">Output</span>
              <select value={state.outputId} onChange={(e) => live.setOutput(e.target.value)}>
                <option value="">System output</option>
                {outputs.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Output ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!running && inputs.every((d) => !d.label) && (
          <p className="muted small">Device names appear after you press Start once and allow the microphone.</p>
        )}
        <p className="muted small">
          Scarlett Solo: the guitar jack is Input 2 (Input 1 is the microphone). Pick the Scarlett as the output too, so
          input and output share one clock.
        </p>
        <div className="knobs">
          <Knob label="Input" value={state.inputDb} min={-24} max={24} step={0.5} defaultValue={0} format={fmt.db} onChange={(v) => live.setInputDb(v)} />
          <Knob label="Volume" value={state.outputDb} min={-40} max={6} step={0.5} defaultValue={-6} format={fmt.db} onChange={(v) => live.setOutputDb(v)} />
        </div>
      </section>

      <section className="panel">
        <h2>Sound</h2>
        <div className="seg live-tone" role="group" aria-label="Sound">
          {(['dry', 'a', 'b'] as LiveTone[]).map((t) => (
            <button key={t} className={state.tone === t ? 'on' : ''} onClick={() => live.setTone(t)}>
              {t === 'dry' ? 'Dry' : `Tone Lab ${t.toUpperCase()}`}
            </button>
          ))}
        </div>
        <p className="muted small">
          {state.tone === 'dry'
            ? 'The guitar as it comes in: no processing at all, the lowest latency and CPU use.'
            : `Branch ${state.tone.toUpperCase()} of Tone Lab: ${chainSummary(settings?.[state.tone])}. Only those blocks run, each adding well under a millisecond. Change it in Tone Lab; it updates here when you come back.`}
        </p>
        {state.tone !== 'dry' && (
          <p className="muted small">
            Turn the interface's Direct Monitor off, or you'll hear the dry guitar on top of the processed one.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Latency</h2>
        <div className="seg" role="group" aria-label="Buffer size">
          {LATENCY.map((l) => (
            <button key={l.id} className={state.latencyMode === l.id ? 'on' : ''} onClick={() => live.setLatencyMode(l.id)} title={l.hint}>
              {l.label}
            </button>
          ))}
        </div>
        <p className="muted small">{LATENCY.find((l) => l.id === state.latencyMode)?.hint}</p>
        {lat ? (
          <p className="live-latency">
            <strong>{totalMs.toFixed(1)} ms</strong>
            <span className="muted small inline">
              {' '}
              browser buffer {(lat.base * 1000).toFixed(1)} + output {(lat.output * 1000).toFixed(1)}
              {lat.input > 0 && <> + input {(lat.input * 1000).toFixed(1)}</>} ms, at {(lat.sampleRate / 1000).toFixed(1)} kHz.
              Under about 10 ms feels like an amp in the room.
            </span>
          </p>
        ) : (
          <p className="muted small">Start to see the measured latency.</p>
        )}
        <ul className="muted small live-tips">
          <li>Use Chrome or Edge: they give the smallest buffers.</li>
          <li>Plug headphones into the interface, not the computer.</li>
          <li>Close other tabs that play audio, and other music apps.</li>
          <li>On a laptop, plug in the charger: power saving slows the audio thread.</li>
        </ul>
      </section>
    </div>
  );
}

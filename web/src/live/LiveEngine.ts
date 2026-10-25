import { inputClosed, inputOpening, unlockPlayback } from '../audio/iosAudio';
import { getEngine } from '../audio/toneEngine';
import type { BranchId } from '../audio/settings';
import { LiveChain, liveStructure } from './LiveChain';

export type InputChannel = 'left' | 'right' | 'both';
// dry: the guitar as it comes in; a / b: through that Tone Lab branch.
export type LiveTone = 'dry' | BranchId;
// How small an audio buffer to ask for. Smaller is faster but crackles
// sooner on a busy computer.
export type LatencyMode = 'lowest' | 'low' | 'safe';

export interface LiveState {
  running: boolean;
  starting: boolean;
  error: string | null;
  deviceId: string;
  // Where the sound goes; '' = the system output.
  outputId: string;
  channel: InputChannel;
  tone: LiveTone;
  latencyMode: LatencyMode;
  inputDb: number;
  outputDb: number;
}

export interface Latency {
  // Seconds: the browser's own buffer, the output device, the input device.
  base: number;
  output: number;
  input: number;
  sampleRate: number;
}

const LATENCY_HINT: Record<LatencyMode, AudioContextLatencyCategory | number> = {
  lowest: 0, // the smallest buffer the browser and device allow
  low: 'interactive',
  safe: 0.02,
};

const STORE_KEY = 'soundlab.live';
const dbToGain = (db: number) => 10 ** (db / 20);

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

// One audio context and everything in it: input, the chosen sound, meter,
// output. A different sound (dry or a branch, a block on or off, another
// pedal or amp model) gets a whole new Graph and the old context is
// closed, which is the only way to stop its worklets: they otherwise keep
// running, silent, as long as the context lives.
interface Graph {
  ctx: SinkContext;
  source: MediaStreamAudioSourceNode;
  inputGain: GainNode;
  outputGain: GainNode;
  meter: AnalyserNode;
  chain: LiveChain | null;
  branch: BranchId | null;
}

// Guitar in, sound out, nothing else: its own audio context with the
// smallest buffer, no analysers or A/B branches, only the blocks you hear,
// and Tone Lab put to sleep while it runs. It stays on when you switch
// sections, to play along with Drum Lab or a scale in Theory Lab.
class LiveEngine {
  private state: LiveState = {
    running: false,
    starting: false,
    error: null,
    deviceId: '',
    outputId: '',
    // A Focusrite Scarlett Solo's instrument jack is input 2 (right).
    channel: 'right',
    tone: 'dry',
    latencyMode: 'lowest',
    inputDb: 0,
    outputDb: -6,
    ...LiveEngine.restore(),
  };
  private listeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private graph: Graph | null = null;
  // Bumped on every rebuild and stop, so a slow build that lost the race
  // closes itself instead of taking over.
  private generation = 0;
  private meterData = new Float32Array(256);
  // Whether this engine holds the record-capable audio session.
  private holdsInput = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(p: Partial<LiveState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
    const { deviceId, outputId, channel, tone, latencyMode, inputDb, outputDb } = this.state;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ deviceId, outputId, channel, tone, latencyMode, inputDb, outputDb }));
    } catch {
      // Storage off (private window): settings just won't be remembered.
    }
  }

  private static restore(): Partial<LiveState> {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  // Call from inside a click handler (browsers only start audio then).
  async start() {
    if (this.state.running || this.state.starting) return;
    this.set({ starting: true, error: null });
    const generation = ++this.generation;
    inputOpening();
    this.holdsInput = true;
    unlockPlayback();
    // Tone Lab's graph (two chains, analysers, worklets) keeps processing
    // even when silent; put it to sleep so the CPU goes to the guitar.
    void getEngine().sleep();
    try {
      // The context comes first so the input can be asked for at its rate.
      const ctx = this.newContext();
      // Every browser "voice" feature off: they are made for speech and
      // would gate, filter and level the guitar, and they add delay.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.state.deviceId ? { exact: this.state.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          // Same rate as the output, so nothing gets resampled on the way.
          sampleRate: { ideal: ctx.sampleRate },
          // Not in every browser's typings, but honoured where supported.
          ...({ latency: 0 } as object),
        },
      });
      if (generation !== this.generation) {
        // Stopped while the permission prompt was open.
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        return;
      }
      this.stream = stream;
      await this.rebuild(ctx);
      // No graph means Stop was pressed while it was being built.
      if (this.graph) this.set({ running: true });
    } catch (err) {
      this.teardown();
      const e = err as Error;
      this.set({
        error: e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : e.message || 'Could not open the audio input.',
      });
    } finally {
      this.set({ starting: false });
    }
  }

  stop() {
    this.teardown();
    this.set({ running: false, starting: false });
  }

  toggle() {
    if (this.state.running) this.stop();
    else void this.start();
  }

  private teardown() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.holdsInput) {
      this.holdsInput = false;
      inputClosed();
    }
    // Closing the context frees its audio thread and everything in it.
    void this.graph?.ctx.close().catch(() => {});
    this.graph = null;
  }

  private newContext(): SinkContext {
    return new AudioContext({ latencyHint: LATENCY_HINT[this.state.latencyMode] });
  }

  // Build the whole graph for the current settings in a new context (or the
  // one given), wait until every worklet is in place, then swap it in and
  // close the old one. The old graph plays until the new one is ready, so
  // the gap is at most a few milliseconds.
  private async rebuild(ctx: SinkContext = this.newContext()) {
    const stream = this.stream;
    if (!stream) return;
    const generation = ++this.generation;
    try {
      if (ctx.setSinkId && canPickOutput) await ctx.setSinkId(this.state.outputId);
      const source = ctx.createMediaStreamSource(stream);
      const inputGain = ctx.createGain();
      const outputGain = ctx.createGain();
      const meter = ctx.createAnalyser();
      meter.fftSize = 256;
      inputGain.gain.value = dbToGain(this.state.inputDb);
      outputGain.gain.value = 0; // faded in once swapped in
      inputGain.connect(meter);
      outputGain.connect(ctx.destination);

      const { tone } = this.state;
      const settings = getEngine().currentSettings;
      let chain: LiveChain | null = null;
      if (tone !== 'dry' && settings) {
        chain = new LiveChain(ctx, settings[tone]);
        await chain.ready();
        inputGain.connect(chain.input);
        chain.output.connect(outputGain);
      } else {
        inputGain.connect(outputGain);
      }
      const graph: Graph = { ctx, source, inputGain, outputGain, meter, chain, branch: tone === 'dry' ? null : tone };
      this.connectInput(graph);
      await ctx.resume();
      if (generation !== this.generation) {
        void ctx.close();
        return;
      }
      const old = this.graph;
      this.graph = graph;
      outputGain.gain.setTargetAtTime(dbToGain(this.state.outputDb), ctx.currentTime, 0.005);
      if (old) {
        old.outputGain.gain.setTargetAtTime(0, old.ctx.currentTime, 0.005);
        window.setTimeout(() => void old.ctx.close().catch(() => {}), 60);
      }
    } catch (err) {
      void ctx.close().catch(() => {});
      throw err;
    }
  }

  // Changing device needs a new stream.
  private async restart() {
    if (!this.state.running) return;
    this.stop();
    await this.start();
  }

  setDevice(deviceId: string) {
    this.set({ deviceId });
    void this.restart();
  }

  setOutput(outputId: string) {
    this.set({ outputId });
    const ctx = this.graph?.ctx;
    if (ctx?.setSinkId && canPickOutput) void ctx.setSinkId(outputId).catch((e: Error) => this.set({ error: `Output: ${e.message}` }));
  }

  // A new buffer size needs a new context; the input stream stays.
  setLatencyMode(latencyMode: LatencyMode) {
    this.set({ latencyMode });
    if (this.state.running) void this.rebuild().catch((e: Error) => this.set({ error: e.message }));
  }

  setChannel(channel: InputChannel) {
    this.set({ channel });
    if (this.graph) this.connectInput(this.graph);
  }

  setTone(tone: LiveTone) {
    this.set({ tone });
    if (this.state.running) void this.rebuild().catch((e: Error) => this.set({ error: e.message }));
  }

  setInputDb(inputDb: number) {
    this.set({ inputDb });
    const g = this.graph;
    g?.inputGain.gain.setTargetAtTime(dbToGain(inputDb), g.ctx.currentTime, 0.01);
  }

  setOutputDb(outputDb: number) {
    this.set({ outputDb });
    const g = this.graph;
    g?.outputGain.gain.setTargetAtTime(dbToGain(outputDb), g.ctx.currentTime, 0.01);
  }

  // Take one channel of a stereo interface (each input is its own channel),
  // or both mixed.
  private connectInput(g: Graph) {
    g.source.disconnect();
    const channels = this.stream?.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    if (this.state.channel === 'both' || channels < 2) {
      g.source.connect(g.inputGain);
    } else {
      const splitter = g.ctx.createChannelSplitter(2);
      g.source.connect(splitter);
      splitter.connect(g.inputGain, this.state.channel === 'left' ? 0 : 1);
    }
  }

  // Pick up Tone Lab edits made since the graph was built: knob values in
  // place, anything that changes which blocks exist with a rebuild.
  refreshTone() {
    const g = this.graph;
    const settings = getEngine().currentSettings;
    if (!g?.chain || !g.branch || !settings) return;
    const s = settings[g.branch];
    if (liveStructure(s) === g.chain.key) g.chain.apply(s);
    else void this.rebuild().catch((e: Error) => this.set({ error: e.message }));
  }

  // What is running now, for checking that nothing unheard is.
  describe() {
    const g = this.graph;
    return g ? { contextState: g.ctx.state, sound: g.branch ?? 'dry', blocks: g.chain?.key ?? null } : null;
  }

  // Peak of the input over the last few milliseconds, in dBFS.
  inputPeakDb() {
    const g = this.graph;
    if (!g) return -Infinity;
    g.meter.getFloatTimeDomainData(this.meterData);
    let peak = 0;
    for (const x of this.meterData) peak = Math.max(peak, Math.abs(x));
    return 20 * Math.log10(peak / dbToGain(this.state.inputDb) || 1e-9);
  }

  latency(): Latency | null {
    const ctx = this.graph?.ctx;
    if (!ctx) return null;
    const track = this.stream?.getAudioTracks()[0];
    const input = (track?.getSettings() as { latency?: number } | undefined)?.latency ?? 0;
    return { base: ctx.baseLatency ?? 0, output: ctx.outputLatency ?? 0, input, sampleRate: ctx.sampleRate };
  }
}

// Output on the same interface as the input: one clock, no resampling.
export const canPickOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

export const live = new LiveEngine();

// Dev only: poke the engine from the browser console.
if (import.meta.env.DEV) (window as unknown as { live: LiveEngine }).live = live;

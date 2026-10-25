import type { Voice } from './patterns';

// Recorded one-shots from Virtuosity Drums (Versilian Studios, CC0): each drum
// hit at several strengths, close, overhead and room mics mixed to stereo.
// kit.json lists every file with the loudness of its attack.

interface Entry {
  file: string;
  layer: number;
  level: number;
}

interface Sample {
  buffer: AudioBuffer;
  layer: number;
  level: number;
}

const BASE = `${import.meta.env.BASE_URL}drums/kit/`;

// How much quieter the softest note is than the loudest, in dB.
const RANGE_DB: Record<Voice, number> = { kick: 30, snare: 32, hat: 30, open: 20, pedal: 12 };
// Balance between the drums, in dB, with headroom for hits that land together.
const TRIM_DB: Record<Voice, number> = { kick: -5, snare: 0, hat: -1, open: -4, pedal: -1 };

const dbToGain = (db: number) => 10 ** (db / 20);

let samples: Record<Voice, Sample[]> | null = null;
let loading: Promise<void> | null = null;

// Decoding needs no running audio, so this can start before the first tap.
export function loadKit() {
  loading ??= (async () => {
    const manifest: Record<Voice, Entry[]> = await (await fetch(`${BASE}kit.json`)).json();
    const decoder = new OfflineAudioContext(2, 1, 48000);
    const out = {} as Record<Voice, Sample[]>;
    await Promise.all(
      Object.entries(manifest).map(async ([voice, entries]) => {
        out[voice as Voice] = await Promise.all(
          entries.map(async (e) => {
            const data = await (await fetch(BASE + e.file)).arrayBuffer();
            return { buffer: trimOnset(await decoder.decodeAudioData(data)), layer: e.layer, level: e.level };
          }),
        );
      }),
    );
    samples = out;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export const kitReady = () => samples !== null;

// AAC decoders differ in how much silence they put before the sound; cut to
// just before the hit so every drum lands exactly when it is scheduled.
function trimOnset(buf: AudioBuffer) {
  const data = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  let start = 0;
  while (start < data.length && Math.abs(data[start]) < peak * 0.05) start++;
  start = Math.max(0, start - Math.round(buf.sampleRate * 0.002));
  if (start === 0) return buf;
  const out = new AudioBuffer({ length: buf.length - start, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(start), c);
  return out;
}

// Pick the recording nearest the loudness asked for. Takes of the same
// strength alternate, and the snare (one take per strength) alternates with
// its neighbour, so repeated notes never sound copy-pasted.
const lastPick = new Map<string, number>();

function pick(voice: Voice, target: number) {
  const list = samples![voice];
  const dist = (s: Sample) => Math.abs(Math.log(s.level / target));
  const sorted = [...list].sort((a, b) => dist(a) - dist(b));
  const best = sorted[0];
  const same = list.filter((s) => s.layer === best.layer);
  const pool = same.length > 1 ? same : sorted.slice(0, 2);
  const key = `${voice}:${best.layer}`;
  const i = ((lastPick.get(key) ?? -1) + 1) % pool.length;
  lastPick.set(key, i);
  return pool[i];
}

// The open hi-hat rings until the hat is closed (a closed or pedal hit).
const ringing = new WeakMap<BaseAudioContext, GainNode>();

export function hit(ctx: BaseAudioContext, out: AudioNode, voice: Voice, t: number, velocity: number) {
  if (!samples) return;
  const list = samples[voice];
  const loudest = list[list.length - 1].level;
  const target = loudest * dbToGain((Math.min(1, velocity) - 1) * RANGE_DB[voice]);
  const sample = pick(voice, target);
  // Fine-tune between recorded strengths, within a few dB.
  const gain = Math.min(1.6, Math.max(0.6, target / sample.level)) * dbToGain(TRIM_DB[voice]);

  if (voice === 'hat' || voice === 'pedal' || voice === 'open') {
    const open = ringing.get(ctx);
    if (open) {
      open.gain.setTargetAtTime(0, t, 0.015);
      ringing.delete(ctx);
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.connect(amp).connect(out);
  src.start(t);
  if (voice === 'open') ringing.set(ctx, amp);
}

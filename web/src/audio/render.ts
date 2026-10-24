import { isBuiltInReverb } from './blocks/Reverb';
import { Chain } from './Chain';
import { loadIr } from './ir';
import type { ToneSettings } from './settings';
import { dbToGain } from './util';

export type RenderResult = {
  buffer: AudioBuffer;
  gainDb: number; // gain applied after rendering (loudness match / peak safety)
  peakLimited: boolean;
};

const PEAK_CEILING_DB = -0.3;

// Process a whole clip through the chain, faster than real time, in an
// OfflineAudioContext. The chain is built from the same settings as the
// live one, so the file sounds like what you hear.
export async function renderProcessed(
  input: AudioBuffer,
  settings: ToneSettings,
  opts: { matchLoudness: boolean },
): Promise<RenderResult> {
  const sr = input.sampleRate;
  let irSeconds: number | undefined;
  if (settings.reverb.on && !isBuiltInReverb(settings.reverb.type)) {
    irSeconds = (await loadIr('reverbs', settings.reverb.type)).duration;
  }
  const tail = Chain.tailSeconds(settings, irSeconds);
  const ctx = new OfflineAudioContext(input.numberOfChannels, input.length + Math.round(tail * sr), sr);
  const chain = new Chain(ctx);
  chain.apply(settings);
  await chain.ready();

  const src = ctx.createBufferSource();
  src.buffer = input;
  src.connect(chain.input);
  chain.output.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();

  // Loudness match against the dry clip (over the clip's own length, not
  // the tail), so a before/after comparison of the files is fair.
  let gain = 1;
  if (opts.matchLoudness) {
    const dryRms = rms(input, input.length);
    const wetRms = rms(out, input.length);
    if (wetRms > 0) gain = dryRms / wetRms;
  }
  // Never write a clipped file.
  const peak = peakOf(out) * gain;
  const ceiling = dbToGain(PEAK_CEILING_DB);
  const peakLimited = peak > ceiling;
  if (peakLimited) gain *= ceiling / peak;

  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return { buffer: out, gainDb: 20 * Math.log10(gain), peakLimited };
}

function rms(b: AudioBuffer, length: number) {
  let sum = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < length; i++) sum += d[i] * d[i];
  }
  return Math.sqrt(sum / (length * b.numberOfChannels));
}

function peakOf(b: AudioBuffer) {
  let peak = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  return peak;
}

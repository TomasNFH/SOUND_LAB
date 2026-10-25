import type { Voice } from './patterns';

// A synthesized kit: no samples to load, so the first beat is instant.

let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: BaseAudioContext) {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function envelope(ctx: BaseAudioContext, t: number, peak: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  return g;
}

function noiseBurst(ctx: BaseAudioContext, t: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
  return src;
}

// Kick: a sine whose pitch falls fast, the thump of a beater on a big head.
function kick(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  osc.connect(envelope(ctx, t, v, 0.4)).connect(out);
  osc.start(t);
  osc.stop(t + 0.45);
}

// Snare: a short drum tone plus the rattle of the wires (filtered noise).
function snare(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(190, t);
  body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  body.connect(envelope(ctx, t, v * 0.4, 0.1)).connect(out);
  body.start(t);
  body.stop(t + 0.15);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  noiseBurst(ctx, t, 0.2).connect(hp).connect(envelope(ctx, t, v * 0.45, 0.18)).connect(out);
}

// Closed hi-hat: very bright noise, very short.
function hat(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  noiseBurst(ctx, t, 0.06).connect(hp).connect(envelope(ctx, t, v * 0.35, 0.05)).connect(out);
}

const VOICES: Record<Voice, typeof kick> = { kick, snare, hat };

export const hit = (ctx: BaseAudioContext, out: AudioNode, voice: Voice, t: number, velocity: number) =>
  VOICES[voice](ctx, out, t, velocity);

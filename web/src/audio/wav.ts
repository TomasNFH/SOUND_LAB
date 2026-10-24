// Encode an AudioBuffer as a PCM WAV file (24-bit by default).
export function encodeWav(buffer: AudioBuffer, bits: 16 | 24 = 24): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerSample = bits / 8;
  const dataSize = frames * channels * bytesPerSample;
  const out = new DataView(new ArrayBuffer(44 + dataSize));

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  out.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, channels, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  out.setUint16(32, channels * bytesPerSample, true);
  out.setUint16(34, bits, true);
  writeStr(36, 'data');
  out.setUint32(40, dataSize, true);

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const max = Math.pow(2, bits - 1) - 1;
  let pos = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.round(Math.max(-1, Math.min(1, data[c][i])) * max);
      if (bits === 16) {
        out.setInt16(pos, v, true);
      } else {
        out.setUint8(pos, v & 0xff);
        out.setUint8(pos + 1, (v >> 8) & 0xff);
        out.setUint8(pos + 2, (v >> 16) & 0xff);
      }
      pos += bytesPerSample;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

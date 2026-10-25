// iOS mutes Web Audio while the phone is in silent mode, unless the page's
// audio session is "playback" (like a music app). Safari 17+ lets a page
// say so directly; older versions switch over once an <audio> element
// plays, so a short silent one is played on the first tap.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

const setSessionType = (type: string) => {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session && session.type !== type) session.type = type;
};

// Inputs open right now. Safari refuses audio capture in a "playback"
// session, so while any is open the session is "play-and-record" (which
// still plays in silent mode) and nothing switches it back.
let openInputs = 0;

export function preferPlaybackSession() {
  if (openInputs === 0) setSessionType('playback');
}

// Call before getUserMedia, and inputClosed() once that input is done
// (or failed to open).
export function inputOpening() {
  openInputs++;
  setSessionType('play-and-record');
}

export function inputClosed() {
  openInputs = Math.max(0, openInputs - 1);
  if (openInputs === 0) setSessionType('playback');
}

let unlocked = false;

// Call from inside a tap or click handler.
export function unlockPlayback() {
  if (unlocked || (navigator as AudioSessionNavigator).audioSession) return;
  unlocked = true;
  const el = new Audio(URL.createObjectURL(silentWav()));
  el.setAttribute('playsinline', '');
  el.loop = true;
  void el.play().catch(() => {
    unlocked = false;
  });
}

// 0.1 s of 8-bit mono silence at 8 kHz.
function silentWav() {
  const samples = 800;
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => buf.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  buf.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); // PCM
  buf.setUint16(22, 1, true); // mono
  buf.setUint32(24, 8000, true);
  buf.setUint32(28, 8000, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true);
  text(36, 'data');
  buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128);
  return new Blob([buf], { type: 'audio/wav' });
}

import { AudioEngine } from './AudioEngine';

// One Tone Lab engine for the page's lifetime; created outside React so
// re-renders (and StrictMode double effects) never rebuild the audio graph.
// The Live section reads its settings and pauses it while live.
let engine: AudioEngine | null = null;

export const getEngine = () => {
  if (!engine) {
    engine = new AudioEngine();
    // Handy for poking at the graph from the browser console in dev.
    if (import.meta.env.DEV) (window as unknown as { engine: AudioEngine }).engine = engine;
  }
  return engine;
};

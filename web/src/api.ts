import * as browserStore from './browserStore';

export type AudioFile = { name: string; size: number; modified: string };
export type Recording = AudioFile;
export type AudioFolder = 'recordings' | 'exports' | 'cabinets' | 'reverbs';

async function check(res: Response, what: string) {
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      // not JSON
    }
    throw new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

async function serverListFiles(folder: AudioFolder): Promise<AudioFile[]> {
  return (await check(await fetch(`/api/${folder}`), 'Listing')).json();
}

async function serverFetchFile(folder: AudioFolder, name: string): Promise<ArrayBuffer> {
  return (await check(await fetch(`/api/${folder}/${encodeURIComponent(name)}`), `Loading ${name}`)).arrayBuffer();
}

async function serverUploadFile(folder: AudioFolder, file: Blob, name: string): Promise<AudioFile> {
  const body = new FormData();
  body.append('file', file, name);
  return (await check(await fetch(`/api/${folder}`, { method: 'POST', body }), 'Upload')).json();
}

export type PresetInfo = { name: string; modified: string };

async function serverListPresets(): Promise<PresetInfo[]> {
  return (await check(await fetch('/api/presets'), 'Listing presets')).json();
}

async function serverLoadPreset(name: string): Promise<unknown> {
  return (await check(await fetch(`/api/presets/${encodeURIComponent(name)}`), 'Loading preset')).json();
}

async function serverSavePreset(name: string, data: unknown) {
  await check(
    await fetch(`/api/presets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    'Saving preset',
  );
}

async function serverDeletePreset(name: string) {
  await check(await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' }), 'Deleting preset');
}

// The static build (VITE_STATIC=1, for GitHub Pages) has no api and keeps
// files and presets in the browser instead; the dev setup uses the api.
const server = {
  listFiles: serverListFiles,
  fetchFile: serverFetchFile,
  uploadFile: serverUploadFile,
  listPresets: serverListPresets,
  loadPreset: serverLoadPreset,
  savePreset: serverSavePreset,
  deletePreset: serverDeletePreset,
};
const backend = import.meta.env.VITE_STATIC ? browserStore : server;

export const { listFiles, fetchFile, uploadFile, listPresets, loadPreset, savePreset, deletePreset } = backend;

export const listRecordings = () => listFiles('recordings');
export const fetchRecording = (name: string) => fetchFile('recordings', name);
export const uploadRecording = (file: File) => uploadFile('recordings', file, file.name);

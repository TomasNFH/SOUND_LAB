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

export async function listFiles(folder: AudioFolder): Promise<AudioFile[]> {
  return (await check(await fetch(`/api/${folder}`), 'Listing')).json();
}

export async function fetchFile(folder: AudioFolder, name: string): Promise<ArrayBuffer> {
  return (await check(await fetch(`/api/${folder}/${encodeURIComponent(name)}`), `Loading ${name}`)).arrayBuffer();
}

export async function uploadFile(folder: AudioFolder, file: Blob, name: string): Promise<AudioFile> {
  const body = new FormData();
  body.append('file', file, name);
  return (await check(await fetch(`/api/${folder}`, { method: 'POST', body }), 'Upload')).json();
}

export const listRecordings = () => listFiles('recordings');
export const fetchRecording = (name: string) => fetchFile('recordings', name);
export const uploadRecording = (file: File) => uploadFile('recordings', file, file.name);

export type PresetInfo = { name: string; modified: string };

export async function listPresets(): Promise<PresetInfo[]> {
  return (await check(await fetch('/api/presets'), 'Listing presets')).json();
}

export async function loadPreset(name: string): Promise<unknown> {
  return (await check(await fetch(`/api/presets/${encodeURIComponent(name)}`), 'Loading preset')).json();
}

export async function savePreset(name: string, data: unknown) {
  await check(
    await fetch(`/api/presets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    'Saving preset',
  );
}

export async function deletePreset(name: string) {
  await check(await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' }), 'Deleting preset');
}

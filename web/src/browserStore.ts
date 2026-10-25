import type { AudioFile, AudioFolder, PresetInfo } from './api';

// Stand-in for the api in the static build (GitHub Pages): files and
// presets live in this browser's IndexedDB, one record per file, keyed
// "<folder>/<name>".
type Entry = { name: string; modified: string; data: Blob | unknown };

const DB_NAME = 'tone-lab';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await openDb()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = op(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function list(folder: string): Promise<Entry[]> {
  const range = IDBKeyRange.bound(`${folder}/`, `${folder}/￿`);
  const entries = (await run('readonly', (s) => s.getAll(range))) as Entry[];
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function get(folder: string, name: string): Promise<Entry> {
  const entry = (await run('readonly', (s) => s.get(`${folder}/${name}`))) as Entry | undefined;
  if (!entry) throw new Error(`${name} not found`);
  return entry;
}

const put = (folder: string, name: string, data: Entry['data']) =>
  run('readwrite', (s) => s.put({ name, modified: new Date().toISOString(), data }, `${folder}/${name}`));

export async function listFiles(folder: AudioFolder): Promise<AudioFile[]> {
  return (await list(folder)).map((e) => ({ name: e.name, size: (e.data as Blob).size, modified: e.modified }));
}

export async function fetchFile(folder: AudioFolder, name: string): Promise<ArrayBuffer> {
  return ((await get(folder, name)).data as Blob).arrayBuffer();
}

export async function uploadFile(folder: AudioFolder, file: Blob, name: string): Promise<AudioFile> {
  // Exports are downloaded anyway; keeping copies would only fill the quota.
  if (folder !== 'exports') await put(folder, name, file);
  return { name, size: file.size, modified: new Date().toISOString() };
}

export async function listPresets(): Promise<PresetInfo[]> {
  return (await list('presets')).map((e) => ({ name: e.name, modified: e.modified }));
}

export async function loadPreset(name: string): Promise<unknown> {
  return (await get('presets', name)).data;
}

export async function savePreset(name: string, data: unknown) {
  await put('presets', name, data);
}

export async function deletePreset(name: string) {
  await run('readwrite', (s) => s.delete(`presets/${name}`));
}

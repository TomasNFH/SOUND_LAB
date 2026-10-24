export type Recording = { name: string; size: number; modified: string };

export async function listRecordings(): Promise<Recording[]> {
  const res = await fetch('/api/recordings');
  if (!res.ok) throw new Error(`api ${res.status}`);
  return res.json();
}

export async function fetchRecording(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return res.arrayBuffer();
}

export async function uploadRecording(file: File): Promise<Recording> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/recordings', { method: 'POST', body });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

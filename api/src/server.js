import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const PORT = Number(process.env.PORT ?? 3001);

// Folder layout of the tone-data volume (see the plan's Docker section).
const FOLDERS = ['recordings', 'irs/cabinets', 'irs/reverbs', 'presets', 'exports'];
const AUDIO_EXT = new Set(['.wav', '.flac', '.mp3', '.ogg', '.aiff', '.aif']);

for (const folder of FOLDERS) {
  await fs.mkdir(path.join(DATA_DIR, folder), { recursive: true });
}

// Only allow plain file names, so requests can't escape the data folder.
function safeName(name) {
  const base = path.basename(name);
  if (!base || base !== name || base.startsWith('.')) return null;
  return base;
}

async function listAudio(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    files.push({ name: entry.name, size: stat.size, modified: stat.mtime });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

const recordingsDir = path.join(DATA_DIR, 'recordings');
const upload = multer({
  storage: multer.diskStorage({
    destination: recordingsDir,
    filename: (_req, file, cb) => cb(null, path.basename(file.originalname)),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, AUDIO_EXT.has(path.extname(file.originalname).toLowerCase())),
});

const app = express();

app.get('/api/health', (_req, res) => res.json({ ok: true, dataDir: DATA_DIR }));

app.get('/api/recordings', async (_req, res, next) => {
  try {
    res.json(await listAudio(recordingsDir));
  } catch (err) {
    next(err);
  }
});

app.get('/api/recordings/:name', (req, res) => {
  const name = safeName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid file name' });
  res.sendFile(name, { root: recordingsDir }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});

app.post('/api/recordings', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Expected an audio file in "file"' });
  res.status(201).json({ name: req.file.filename, size: req.file.size });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`api listening on :${PORT}, data in ${DATA_DIR}`));

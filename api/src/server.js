import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const PORT = Number(process.env.PORT ?? 3001);

// Audio folders of the tone-data volume (see the plan's Docker section),
// by the name used in the URL.
const AUDIO_FOLDERS = {
  recordings: 'recordings',
  exports: 'exports',
  cabinets: 'irs/cabinets',
  reverbs: 'irs/reverbs',
};
const PRESETS_DIR = path.join(DATA_DIR, 'presets');
const AUDIO_EXT = new Set(['.wav', '.flac', '.mp3', '.ogg', '.aiff', '.aif']);

for (const folder of [...Object.values(AUDIO_FOLDERS), 'presets']) {
  await fs.mkdir(path.join(DATA_DIR, folder), { recursive: true });
}

// Only allow plain file names, so requests can't escape the data folder.
function safeName(name) {
  const base = path.basename(name);
  if (!base || base !== name || base.startsWith('.')) return null;
  return base;
}

async function listFiles(dir, keep) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !keep(entry.name)) continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    files.push({ name: entry.name, size: stat.size, modified: stat.mtime });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

const isAudio = (name) => AUDIO_EXT.has(path.extname(name).toLowerCase());

const app = express();

app.get('/api/health', (_req, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// Audio files: list, fetch and upload, one set of routes per folder.
for (const [route, folder] of Object.entries(AUDIO_FOLDERS)) {
  const dir = path.join(DATA_DIR, folder);
  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, path.basename(file.originalname)),
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, isAudio(file.originalname)),
  });

  app.get(`/api/${route}`, async (_req, res, next) => {
    try {
      res.json(await listFiles(dir, isAudio));
    } catch (err) {
      next(err);
    }
  });

  app.get(`/api/${route}/:name`, (req, res) => {
    const name = safeName(req.params.name);
    if (!name) return res.status(400).json({ error: 'Invalid file name' });
    res.sendFile(name, { root: dir }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
    });
  });

  app.post(`/api/${route}`, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Expected an audio file in "file"' });
    res.status(201).json({ name: req.file.filename, size: req.file.size });
  });
}

// Presets: one JSON file per preset, named after it.
const presetFile = (name) => {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean || clean.length > 80 || !/^[\w\- .()]+$/.test(clean)) return null;
  return safeName(`${clean}.json`);
};

app.get('/api/presets', async (_req, res, next) => {
  try {
    const files = await listFiles(PRESETS_DIR, (n) => n.endsWith('.json'));
    res.json(files.map((f) => ({ name: f.name.slice(0, -5), modified: f.modified })));
  } catch (err) {
    next(err);
  }
});

app.get('/api/presets/:name', async (req, res, next) => {
  const file = presetFile(req.params.name);
  if (!file) return res.status(400).json({ error: 'Invalid preset name' });
  try {
    res.type('json').send(await fs.readFile(path.join(PRESETS_DIR, file), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

app.put('/api/presets/:name', express.json({ limit: '256kb' }), async (req, res, next) => {
  const file = presetFile(req.params.name);
  if (!file) return res.status(400).json({ error: 'Use letters, numbers, spaces, - _ . ( ) only' });
  if (typeof req.body !== 'object' || req.body === null) return res.status(400).json({ error: 'Expected JSON' });
  try {
    await fs.writeFile(path.join(PRESETS_DIR, file), JSON.stringify(req.body, null, 2));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.delete('/api/presets/:name', async (req, res, next) => {
  const file = presetFile(req.params.name);
  if (!file) return res.status(400).json({ error: 'Invalid preset name' });
  try {
    await fs.unlink(path.join(PRESETS_DIR, file));
    res.status(204).end();
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`api listening on :${PORT}, data in ${DATA_DIR}`));

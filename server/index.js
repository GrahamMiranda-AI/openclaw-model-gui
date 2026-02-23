const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { z } = require('zod');
const { execSync } = require('child_process');
const service = require('./configService');

const app = express();
const PORT = process.env.PORT || 8787;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'change-me-now';
const sessions = new Set();

app.use(cors());
app.use(express.json());

function authRequired(req, res, next) {
  if (req.path === '/api/health' || req.path === '/api/auth/login') return next();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.use(authRequired);

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.post('/api/auth/login', (req, res) => {
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
  if (password !== PANEL_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  res.json({ ok: true, token });
});

app.get('/api/models/state', (_, res) => res.json(service.getModelState()));
app.get('/api/config/backups', (req, res) => {
  const limit = Number(req.query.limit || 30);
  res.json({ items: service.listBackups(limit) });
});
app.post('/api/config/restore', (req, res) => {
  const { file } = z.object({ file: z.string().min(3) }).parse(req.body);
  service.restoreBackup(file);
  res.json({ ok: true });
});
app.post('/api/models/primary', (req, res) => {
  const schema = z.object({ model: z.string().min(3) });
  const { model } = schema.parse(req.body);
  service.setPrimary(model);
  res.json({ ok: true });
});
app.post('/api/models/fallbacks', (req, res) => {
  const { model } = z.object({ model: z.string().min(3) }).parse(req.body);
  service.addFallback(model);
  res.json({ ok: true });
});
app.delete('/api/models/fallbacks/:model', (req, res) => {
  service.removeFallback(decodeURIComponent(req.params.model));
  res.json({ ok: true });
});
app.delete('/api/models/fallbacks', (_, res) => { service.clearFallbacks(); res.json({ ok: true }); });
app.post('/api/models/register', (req, res) => {
  const payload = z.object({ providerId:z.string(), modelId:z.string(), name:z.string().optional(), contextWindow:z.number().optional(), maxTokens:z.number().optional() }).parse(req.body);
  service.registerModel(payload);
  res.json({ ok: true });
});
app.delete('/api/models/catalog/:model', (req, res) => {
  service.deleteCatalogModel(decodeURIComponent(req.params.model));
  res.json({ ok: true });
});
app.post('/api/providers/upsert', (req, res) => {
  const payload = z.object({ id:z.string(), baseUrl:z.string().optional(), api:z.string().optional(), apiKey:z.string().optional() }).parse(req.body);
  service.upsertProvider(payload);
  res.json({ ok: true });
});
app.post('/api/config/backup', (_, res) => res.json({ ok: true, backup: service.backupConfig() }));
app.post('/api/gateway/restart', (_, res) => {
  try {
    execSync('pkill -f "openclaw gateway" || true');
    execSync('nohup openclaw gateway >/tmp/openclaw-gateway.out 2>&1 &');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/', express.static(path.join(__dirname, '..', 'web', 'dist')));

app.use((err, req, res, next) => {
  if (err?.issues) return res.status(400).json({ error: err.issues.map(i => i.message).join(', ') });
  return res.status(500).json({ error: err.message || 'Unknown error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`OpenClaw Model GUI server running on http://localhost:${PORT}`));
}

module.exports = app;

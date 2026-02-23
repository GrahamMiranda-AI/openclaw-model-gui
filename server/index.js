const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const { execSync } = require('child_process');
const service = require('./configService');
const authService = require('./authService');

const app = express();
const PORT = process.env.PORT || 8787;
const sessions = new Map();

app.use(express.json());

function authRequired(req, res, next) {
  if (req.path === '/api/health' || req.path === '/api/auth/login') return next();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session;
  next();
}

function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  next();
}

function tailLines(filePath, maxLines = 200) {
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split('\n').slice(-maxLines).join('\n');
}

function lineDiff(a, b) {
  const aa = a.split('\n');
  const bb = b.split('\n');
  const max = Math.max(aa.length, bb.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const left = aa[i] ?? '';
    const right = bb[i] ?? '';
    if (left !== right) {
      if (left) out.push(`- ${left}`);
      if (right) out.push(`+ ${right}`);
    }
  }
  return out.slice(0, 600).join('\n');
}

app.use(authRequired);

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.post('/api/auth/login', (req, res) => {
  const { username, password } = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(req.body);
  const user = authService.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user);
  res.json({ ok: true, token, user });
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
app.get('/api/users', adminRequired, (_, res) => res.json({ users: authService.listUsers() }));
app.post('/api/users', adminRequired, (req, res) => {
  const payload = z.object({ username: z.string().min(1), password: z.string().min(6), role: z.enum(['admin', 'viewer']) }).parse(req.body);
  authService.upsertUser(payload);
  res.json({ ok: true });
});
app.delete('/api/users/:username', adminRequired, (req, res) => {
  authService.deleteUser(req.params.username);
  res.json({ ok: true });
});

app.get('/api/models/state', (_, res) => {
  const state = service.getModelState();
  const cfg = service.readConfig();
  const maxConcurrent = cfg?.agents?.defaults?.maxConcurrent ?? null;
  const subagentMaxConcurrent = cfg?.agents?.defaults?.subagents?.maxConcurrent ?? null;
  res.json({ ...state, maxConcurrent, subagentMaxConcurrent });
});
app.get('/api/config/backups', (req, res) => {
  const limit = Number(req.query.limit || 30);
  res.json({ items: service.listBackups(limit) });
});
app.post('/api/config/restore-preview', adminRequired, (req, res) => {
  const { file } = z.object({ file: z.string().min(3) }).parse(req.body);
  const safe = path.basename(file);
  const current = fs.readFileSync(service.CONFIG_PATH, 'utf8');
  const backupPath = path.join(service.BACKUP_DIR, safe);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup not found' });
  const oldText = fs.readFileSync(backupPath, 'utf8');
  res.json({ diff: lineDiff(current, oldText) || 'No differences.' });
});
app.post('/api/config/restore', adminRequired, (req, res) => {
  const { file } = z.object({ file: z.string().min(3) }).parse(req.body);
  service.restoreBackup(file);
  res.json({ ok: true });
});

app.post('/api/models/primary', adminRequired, (req, res) => {
  const schema = z.object({ model: z.string().min(3) });
  const { model } = schema.parse(req.body);
  service.setPrimary(model);
  res.json({ ok: true });
});
app.post('/api/models/fallbacks', adminRequired, (req, res) => {
  const { model } = z.object({ model: z.string().min(3) }).parse(req.body);
  service.addFallback(model);
  res.json({ ok: true });
});
app.delete('/api/models/fallbacks/:model', adminRequired, (req, res) => {
  service.removeFallback(decodeURIComponent(req.params.model));
  res.json({ ok: true });
});
app.delete('/api/models/fallbacks', adminRequired, (_, res) => { service.clearFallbacks(); res.json({ ok: true }); });
app.post('/api/models/register', adminRequired, (req, res) => {
  const payload = z.object({ providerId:z.string(), modelId:z.string(), name:z.string().optional(), contextWindow:z.number().optional(), maxTokens:z.number().optional() }).parse(req.body);
  service.registerModel(payload);
  res.json({ ok: true });
});
app.delete('/api/models/catalog/:model', adminRequired, (req, res) => {
  service.deleteCatalogModel(decodeURIComponent(req.params.model));
  res.json({ ok: true });
});
app.post('/api/providers/upsert', adminRequired, (req, res) => {
  const payload = z.object({ id:z.string(), baseUrl:z.string().optional(), api:z.string().optional(), apiKey:z.string().optional() }).parse(req.body);
  service.upsertProvider(payload);
  res.json({ ok: true });
});
app.post('/api/concurrency', adminRequired, (req, res) => {
  const payload = z.object({ maxConcurrent: z.number().min(1).max(20), subagentsMaxConcurrent: z.number().min(1).max(20) }).parse(req.body);
  service.setConcurrency(payload);
  res.json({ ok: true });
});
app.post('/api/config/backup', adminRequired, (_, res) => res.json({ ok: true, backup: service.backupConfig() }));
app.post('/api/gateway/restart', adminRequired, (_, res) => {
  try {
    execSync('pkill -f "openclaw gateway" || true');
    execSync('nohup openclaw gateway >/tmp/openclaw-gateway.out 2>&1 &');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/models/test', async (req, res) => {
  try {
    const { model, prompt } = z.object({ model: z.string().min(3), prompt: z.string().min(1) }).parse(req.body);
    const cfg = service.readConfig();
    const [providerId, ...parts] = model.split('/');
    const modelId = parts.join('/');
    const p = cfg?.models?.providers?.[providerId];
    if (!p?.baseUrl || !p?.apiKey) return res.status(400).json({ error: 'Provider missing baseUrl/apiKey' });
    const response = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }], max_tokens: 120 })
    });
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data?.error?.message || 'Test call failed' });
    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning || '[empty response]';
    res.json({ ok: true, output: text.slice(0, 600) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/featherless/advice', (req, res) => {
  const model = String(req.query.model || '');
  const planLimit = Number(req.query.planLimit || 4);
  const cfg = service.readConfig();
  const maxConcurrent = Number(cfg?.agents?.defaults?.maxConcurrent || 1);
  const subMax = Number(cfg?.agents?.defaults?.subagents?.maxConcurrent || 1);

  const costByModelClass = {
    'moonshotai/Kimi-K2.5': 4,
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': 1,
    'zai-org/GLM-4.6': 1,
    'zai-org/GLM-4.7': 1
  };

  const parts = model.split('/');
  const bare = parts.length >= 2 ? parts.slice(1).join('/') : model;
  const cost = costByModelClass[bare] || 1;
  const safeMaxConcurrent = Math.max(1, Math.floor(planLimit / cost));
  const warning = maxConcurrent > safeMaxConcurrent || subMax > safeMaxConcurrent
    ? `Current concurrency may exceed safe value for this model. Recommended maxConcurrent/subagents.maxConcurrent <= ${safeMaxConcurrent}.`
    : null;

  res.json({ model, planLimit, modelConcurrencyCost: cost, safeMaxConcurrent, current: { maxConcurrent, subMax }, warning });
});

app.get('/api/logs', (req, res) => {
  const type = req.query.type || 'gateway';
  if (type === 'audit') {
    return res.json({ text: tailLines(service.AUDIT_LOG, Number(req.query.lines || 200)) });
  }
  return res.json({ text: tailLines('/tmp/openclaw/openclaw-2026-02-23.log', Number(req.query.lines || 200)) });
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

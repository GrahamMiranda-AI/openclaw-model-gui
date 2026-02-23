const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const BACKUP_DIR = process.env.OPENCLAW_BACKUP_DIR || path.join(process.env.HOME, '.openclaw', 'backups');
const AUDIT_LOG = process.env.OPENCLAW_AUDIT_LOG || path.join(process.env.HOME, '.openclaw', 'logs', 'model-gui-audit.log');

function ensure(obj, key, fallback) {
  if (!obj[key] || typeof obj[key] !== 'object') obj[key] = fallback;
  return obj[key];
}

function ensureDirs() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeReason(reason = 'manual') {
  return String(reason).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
}

function snapshotConfig(reason = 'manual') {
  ensureDirs();
  const backupPath = path.join(BACKUP_DIR, `openclaw-${stamp()}-${sanitizeReason(reason)}.json`);
  fs.copyFileSync(CONFIG_PATH, backupPath);
  return backupPath;
}

function backupConfig() {
  return snapshotConfig('backup');
}

function listBackups(limit = 30) {
  ensureDirs();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('openclaw-') && f.endsWith('.json'))
    .map((f) => {
      const p = path.join(BACKUP_DIR, f);
      const st = fs.statSync(p);
      return { file: f, path: p, size: st.size, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
  return files;
}

function restoreBackup(fileName) {
  ensureDirs();
  const safe = path.basename(fileName);
  const src = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(src)) throw new Error('Backup file not found');
  snapshotConfig('pre-restore');
  fs.copyFileSync(src, CONFIG_PATH);
}

function logAudit(action, detail = {}, actor = 'panel') {
  ensureDirs();
  const line = JSON.stringify({ ts: new Date().toISOString(), actor, action, detail }) + '\n';
  fs.appendFileSync(AUDIT_LOG, line, 'utf8');
}

function fullModel(providerId, modelId) {
  return `${providerId}/${modelId}`;
}

function getModelState() {
  const cfg = readConfig();
  const primary = cfg?.agents?.defaults?.model?.primary || null;
  const fallbacks = cfg?.agents?.defaults?.model?.fallbacks || [];
  const catalog = Object.keys(cfg?.agents?.defaults?.models || {});
  return { configPath: CONFIG_PATH, backupDir: BACKUP_DIR, auditLog: AUDIT_LOG, primary, fallbacks, catalog };
}

function setPrimary(model) {
  snapshotConfig('set-primary');
  const cfg = readConfig();
  cfg.agents = ensure(cfg, 'agents', {});
  cfg.agents.defaults = ensure(cfg.agents, 'defaults', {});
  cfg.agents.defaults.model = ensure(cfg.agents.defaults, 'model', { primary: model, fallbacks: [] });
  cfg.agents.defaults.models = ensure(cfg.agents.defaults, 'models', {});
  cfg.agents.defaults.model.primary = model;
  if (!cfg.agents.defaults.models[model]) cfg.agents.defaults.models[model] = {};
  writeConfig(cfg);
  logAudit('setPrimary', { model });
}

function addFallback(model) {
  snapshotConfig('add-fallback');
  const cfg = readConfig();
  cfg.agents = ensure(cfg, 'agents', {});
  cfg.agents.defaults = ensure(cfg.agents, 'defaults', {});
  cfg.agents.defaults.model = ensure(cfg.agents.defaults, 'model', { primary: null, fallbacks: [] });
  cfg.agents.defaults.models = ensure(cfg.agents.defaults, 'models', {});
  const list = cfg.agents.defaults.model.fallbacks || [];
  if (!list.includes(model)) list.push(model);
  cfg.agents.defaults.model.fallbacks = list;
  if (!cfg.agents.defaults.models[model]) cfg.agents.defaults.models[model] = {};
  writeConfig(cfg);
  logAudit('addFallback', { model });
}

function removeFallback(model) {
  snapshotConfig('remove-fallback');
  const cfg = readConfig();
  const list = cfg?.agents?.defaults?.model?.fallbacks || [];
  cfg.agents.defaults.model.fallbacks = list.filter((m) => m !== model);
  writeConfig(cfg);
  logAudit('removeFallback', { model });
}

function clearFallbacks() {
  snapshotConfig('clear-fallbacks');
  const cfg = readConfig();
  cfg.agents.defaults.model.fallbacks = [];
  writeConfig(cfg);
  logAudit('clearFallbacks');
}

function registerModel({ providerId, modelId, name, contextWindow = 32000, maxTokens = 4096, input = ['text'], reasoning = false }) {
  snapshotConfig('register-model');
  const cfg = readConfig();
  cfg.models = ensure(cfg, 'models', {});
  cfg.models.providers = ensure(cfg.models, 'providers', {});
  const provider = ensure(cfg.models.providers, providerId, {});
  provider.models = Array.isArray(provider.models) ? provider.models : [];

  const existing = provider.models.find((m) => m.id === modelId);
  const payload = { id: modelId, name: name || modelId, reasoning, input, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow, maxTokens };
  if (existing) Object.assign(existing, payload); else provider.models.push(payload);

  cfg.agents = ensure(cfg, 'agents', {});
  cfg.agents.defaults = ensure(cfg.agents, 'defaults', {});
  cfg.agents.defaults.models = ensure(cfg.agents.defaults, 'models', {});
  cfg.agents.defaults.models[fullModel(providerId, modelId)] = cfg.agents.defaults.models[fullModel(providerId, modelId)] || {};

  writeConfig(cfg);
  logAudit('registerModel', { providerId, modelId });
}

function upsertProvider({ id, baseUrl, api, apiKey }) {
  snapshotConfig('upsert-provider');
  const cfg = readConfig();
  cfg.models = ensure(cfg, 'models', {});
  cfg.models.providers = ensure(cfg.models, 'providers', {});
  const provider = ensure(cfg.models.providers, id, {});
  if (baseUrl) provider.baseUrl = baseUrl;
  if (api) provider.api = api;
  if (apiKey) provider.apiKey = apiKey;
  writeConfig(cfg);
  logAudit('upsertProvider', { id, baseUrl, api, apiKeyUpdated: !!apiKey });
}

function deleteCatalogModel(full) {
  snapshotConfig('delete-model');
  const cfg = readConfig();
  if (cfg?.agents?.defaults?.model?.primary === full) throw new Error('Cannot delete primary model');
  cfg.agents.defaults.models = cfg.agents.defaults.models || {};
  delete cfg.agents.defaults.models[full];

  const [providerId, ...idParts] = full.split('/');
  const modelId = idParts.join('/');
  const p = cfg?.models?.providers?.[providerId];
  if (p && Array.isArray(p.models)) {
    p.models = p.models.filter((m) => m.id !== modelId);
  }
  cfg.agents.defaults.model.fallbacks = (cfg.agents.defaults.model.fallbacks || []).filter((m) => m !== full);
  writeConfig(cfg);
  logAudit('deleteCatalogModel', { full });
}

function setConcurrency({ maxConcurrent = 1, subagentsMaxConcurrent = 1 }) {
  snapshotConfig('set-concurrency');
  const cfg = readConfig();
  cfg.agents = ensure(cfg, 'agents', {});
  cfg.agents.defaults = ensure(cfg.agents, 'defaults', {});
  cfg.agents.defaults.maxConcurrent = Number(maxConcurrent);
  cfg.agents.defaults.subagents = ensure(cfg.agents.defaults, 'subagents', {});
  cfg.agents.defaults.subagents.maxConcurrent = Number(subagentsMaxConcurrent);
  writeConfig(cfg);
  logAudit('setConcurrency', { maxConcurrent, subagentsMaxConcurrent });
}

module.exports = {
  CONFIG_PATH,
  BACKUP_DIR,
  AUDIT_LOG,
  readConfig,
  writeConfig,
  backupConfig,
  listBackups,
  restoreBackup,
  getModelState,
  setPrimary,
  addFallback,
  removeFallback,
  clearFallbacks,
  registerModel,
  upsertProvider,
  deleteCatalogModel,
  setConcurrency
};

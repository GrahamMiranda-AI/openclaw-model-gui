const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || path.join(process.env.HOME, '.openclaw', 'openclaw.json');

function ensure(obj, key, fallback) {
  if (!obj[key] || typeof obj[key] !== 'object') obj[key] = fallback;
  return obj[key];
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function backupConfig() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${CONFIG_PATH}.backup-${ts}.json`;
  fs.copyFileSync(CONFIG_PATH, backupPath);
  return backupPath;
}

function fullModel(providerId, modelId) {
  return `${providerId}/${modelId}`;
}

function getModelState() {
  const cfg = readConfig();
  const primary = cfg?.agents?.defaults?.model?.primary || null;
  const fallbacks = cfg?.agents?.defaults?.model?.fallbacks || [];
  const catalog = Object.keys(cfg?.agents?.defaults?.models || {});
  return { configPath: CONFIG_PATH, primary, fallbacks, catalog };
}

function setPrimary(model) {
  const cfg = readConfig();
  cfg.agents = ensure(cfg, 'agents', {});
  cfg.agents.defaults = ensure(cfg.agents, 'defaults', {});
  cfg.agents.defaults.model = ensure(cfg.agents.defaults, 'model', { primary: model, fallbacks: [] });
  cfg.agents.defaults.models = ensure(cfg.agents.defaults, 'models', {});
  cfg.agents.defaults.model.primary = model;
  if (!cfg.agents.defaults.models[model]) cfg.agents.defaults.models[model] = {};
  writeConfig(cfg);
}

function addFallback(model) {
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
}

function removeFallback(model) {
  const cfg = readConfig();
  const list = cfg?.agents?.defaults?.model?.fallbacks || [];
  cfg.agents.defaults.model.fallbacks = list.filter((m) => m !== model);
  writeConfig(cfg);
}

function clearFallbacks() {
  const cfg = readConfig();
  cfg.agents.defaults.model.fallbacks = [];
  writeConfig(cfg);
}

function registerModel({ providerId, modelId, name, contextWindow = 32000, maxTokens = 4096, input = ['text'], reasoning = false }) {
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
}

function upsertProvider({ id, baseUrl, api, apiKey }) {
  const cfg = readConfig();
  cfg.models = ensure(cfg, 'models', {});
  cfg.models.providers = ensure(cfg.models, 'providers', {});
  const provider = ensure(cfg.models.providers, id, {});
  if (baseUrl) provider.baseUrl = baseUrl;
  if (api) provider.api = api;
  if (apiKey) provider.apiKey = apiKey;
  writeConfig(cfg);
}

function deleteCatalogModel(full) {
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
}

module.exports = {
  CONFIG_PATH,
  readConfig,
  writeConfig,
  backupConfig,
  getModelState,
  setPrimary,
  addFallback,
  removeFallback,
  clearFallbacks,
  registerModel,
  upsertProvider,
  deleteCatalogModel
};

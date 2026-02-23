const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function seedConfig(p) {
  fs.writeFileSync(p, JSON.stringify({ agents:{defaults:{model:{primary:'openai-codex/gpt-5.3-codex',fallbacks:[]},models:{'openai-codex/gpt-5.3-codex':{}}}},models:{providers:{}} }, null, 2));
}

test('register model and set primary', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocg-'));
  const cfg = path.join(dir, 'openclaw.json');
  seedConfig(cfg);
  process.env.OPENCLAW_CONFIG_PATH = cfg;
  delete require.cache[require.resolve('../configService')];
  const s = require('../configService');

  s.registerModel({ providerId:'featherless', modelId:'moonshotai/Kimi-K2.5', name:'Kimi' });
  s.setPrimary('featherless/moonshotai/Kimi-K2.5');
  const state = s.getModelState();
  assert.equal(state.primary, 'featherless/moonshotai/Kimi-K2.5');
  assert.ok(state.catalog.includes('featherless/moonshotai/Kimi-K2.5'));
});

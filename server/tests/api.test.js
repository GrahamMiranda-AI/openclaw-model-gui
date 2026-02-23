const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function seedConfig(p) {
  fs.writeFileSync(p, JSON.stringify({ agents:{defaults:{model:{primary:'openai-codex/gpt-5.3-codex',fallbacks:[]},models:{'openai-codex/gpt-5.3-codex':{}}}},models:{providers:{}} }, null, 2));
}

test('GET /api/models/state (auth flow)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocg-api-'));
  const cfg = path.join(dir, 'openclaw.json');
  seedConfig(cfg);
  process.env.OPENCLAW_CONFIG_PATH = cfg;
  process.env.PANEL_PASSWORD = 'test-pass';
  delete require.cache[require.resolve('../index')];
  const app = require('../index');

  const login = await request(app).post('/api/auth/login').send({ password: 'test-pass' });
  assert.equal(login.statusCode, 200);
  assert.ok(login.body.token);

  const res = await request(app).get('/api/models/state').set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.primary, 'openai-codex/gpt-5.3-codex');
});

# OpenClaw Model GUI / Control Panel

![OpenClaw Model GUI Logo](./docs/logo.jpg)

A modern, professional web control panel for managing OpenClaw models in production-like environments.

**Project by:** https://www.grahammiranda.com/

---

## Why this project exists

OpenClaw is extremely powerful, but advanced model operations are often done through CLI or direct JSON edits. That works for technical operators, but it is error-prone when the workflow includes:

- Switching between providers (OpenAI, Featherless, etc.)
- Managing primary and fallback model chains
- Registering provider-specific models with correct names and metadata
- Preventing failover loops and accidental misconfiguration
- Backing up and safely editing `~/.openclaw/openclaw.json`

This control panel turns those tasks into a structured and safer UI flow.

---

## Core features

### 0) Authenticated operator access (Phase 2)
- Login screen with server-side password (`PANEL_PASSWORD`)
- Bearer token session for API operations
- Prevents anonymous config edits

### 1) Primary model management
- View current active primary model
- Switch primary model from model catalog
- Auto-ensure selected model is tracked in `agents.defaults.models`

### 2) Fallback chain management
- Add fallback models
- Remove individual fallback entries
- Clear entire fallback list in one click

### 3) Provider management
- Add/update provider settings (`baseUrl`, API mode, `apiKey`)
- Designed for OpenAI-compatible providers such as Featherless

### 4) Model catalog management
- Register models (provider + model id + context metadata)
- Delete models from catalog (with primary model protection)

### 5) Operational safety actions
- Create timestamped config backups
- Restore from backup directly in UI
- Trigger gateway restart from the panel
- Automatic snapshot before every mutating config operation
- Append-only audit log for model/provider changes

### 6) Professional operator UX
- Dark, modern panel UI
- Single-screen management without editing raw JSON

---

## Architecture

The project is intentionally simple and auditable:

```text
openclaw-model-gui/
├─ server/                 # Express API for config operations
│  ├─ index.js             # REST endpoints
│  ├─ configService.js     # Read/write/backup model config logic
│  └─ tests/               # Node tests (service + API)
├─ web/                    # React + Vite SPA
│  ├─ src/App.jsx          # Main control panel
│  └─ src/styles.css       # UI styles
├─ docs/
│  └─ logo.jpg
└─ README.md
```

### Runtime model

- The web SPA calls `/api/*` on local server
- The server updates OpenClaw config JSON directly
- Restart endpoint launches `openclaw gateway` in background

---

## Requirements

- Linux host with OpenClaw installed
- Node.js 20+ (22 recommended)
- npm 10+
- Access to `~/.openclaw/openclaw.json`

---

## Installation

```bash
cd /root/.openclaw/workspace/openclaw-model-gui
npm install
```

---

## Development

Set a strong panel password before running:

```bash
export PANEL_PASSWORD='change-this-to-a-strong-password'
```

Optional:

```bash
export OPENCLAW_CONFIG_PATH="$HOME/.openclaw/openclaw.json"
export OPENCLAW_BACKUP_DIR="$HOME/.openclaw/backups"
export OPENCLAW_AUDIT_LOG="$HOME/.openclaw/logs/model-gui-audit.log"
```

Run API + web UI together:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8787

---

## Production build

```bash
npm run build
npm start
```

Then open:

- http://localhost:8787

---

## Testing

Run backend tests:

```bash
npm test
```

Current coverage includes:

- Model registration
- Primary switching
- API health/state response flow

You can extend this by adding endpoint integration tests for:

- Fallback add/remove/clear
- Provider upsert
- Catalog delete protection

---

## API reference

### `GET /api/models/state`
Returns current model state:
- `primary`
- `fallbacks[]`
- `catalog[]`
- `configPath`

### `POST /api/models/primary`
Body:
```json
{ "model": "featherless/moonshotai/Kimi-K2.5" }
```

### `POST /api/models/fallbacks`
Body:
```json
{ "model": "featherless/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B" }
```

### `DELETE /api/models/fallbacks/:model`
Remove one fallback entry.

### `DELETE /api/models/fallbacks`
Clear all fallbacks.

### `POST /api/models/register`
Body example:
```json
{
  "providerId": "featherless",
  "modelId": "moonshotai/Kimi-K2.5",
  "name": "Kimi K2.5",
  "contextWindow": 32000,
  "maxTokens": 4096
}
```

### `POST /api/providers/upsert`
Body example:
```json
{
  "id": "featherless",
  "baseUrl": "https://api.featherless.ai/v1",
  "api": "openai-completions",
  "apiKey": "rc_xxx"
}
```

### `DELETE /api/models/catalog/:model`
Deletes a catalog model unless it is the active primary.

### `POST /api/config/backup`
Creates a timestamped copy of OpenClaw config.

### `POST /api/gateway/restart`
Stops and restarts OpenClaw gateway using:
- `pkill -f "openclaw gateway"`
- `nohup openclaw gateway ... &`

---

## Security considerations

This panel can modify live model configuration and restart services. Treat it as an operator console.

Recommended safeguards:

1. Keep it bound to localhost unless behind auth proxy.
2. Restrict shell/server access to trusted admins.
3. Rotate exposed API keys immediately if ever pasted publicly.
4. Use backups before every major config change.
5. Run OpenClaw in VPS/VM isolation as best practice.

---

## Featherless notes

For plans where one model call consumes all concurrency units (for example Kimi-K2.5), set OpenClaw global concurrency safely:

```bash
openclaw config set agents.defaults.maxConcurrent 1
openclaw config set agents.defaults.subagents.maxConcurrent 1
```

This prevents overlap storms from heartbeat/cron/manual messages.

---

## Publishing workflow (GitHub)

```bash
git init
git add .
git commit -m "feat: initial OpenClaw Model GUI"
git branch -M main
git remote add origin git@github.com:<YOUR_USER>/openclaw-model-gui.git
git push -u origin main
```

---

## Product roadmap (next phase)

- Auth layer (password or OIDC)
- Per-agent model profiles editor
- Provider health checks + test-call button
- Structured change history and diff view
- Built-in backup restore UX
- Cron-aware load warnings for high-concurrency models
- Multi-node fleet panel

---

## License

MIT (recommended for broad adoption).

---

Built with ❤️ for OpenClaw operators who want speed without configuration risk.

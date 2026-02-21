# OpenClaw — Self-Hosted AI Agent Gateway

A fully autonomous AI agent gateway running in Docker. The agent writes code, installs packages, runs tests, fixes errors, and reports back — without manual intervention. Connected to Telegram for real-time interaction.

## What's in this folder

```
openclaw/
├── Dockerfile              # Container image (Node 22 + Python 3 + Chromium + sudo)
├── docker-compose.yml      # Service definition with configuration-first volume mounts
├── docker-entrypoint.sh    # Startup script: auto-configures auth, browser, gateway
├── .env.template           # Environment variable template (copy to .env, never commit)
└── workspace/              # Agent instruction files — mounted into container on init
    ├── AGENTS.md                    # Main agent operating manual
    ├── orchestrator-AGENTS.md       # Multi-agent coordination specialist
    ├── infra-architect-AGENTS.md    # Infrastructure & Docker specialist
    ├── cicd-architect-AGENTS.md     # CI/CD pipeline specialist
    ├── cloud-architect-AGENTS.md    # Cloud architecture specialist
    ├── backend-dev-AGENTS.md        # NestJS / Python backend specialist
    ├── frontend-dev-AGENTS.md       # React / Next.js frontend specialist
    ├── product-manager-AGENTS.md    # Product specs & PRD specialist
    ├── seo-growth-AGENTS.md         # SEO & growth specialist
    ├── qa-reliability-AGENTS.md     # Testing & QA specialist
    └── security-compliance-AGENTS.md # Security audit specialist
```

## Configuration-first design

Agent instructions (`workspace/*.md`) live **in this repo** — version-controlled, reviewable, and portable. They are mounted directly into the container at `/home/node/.openclaw/workspace/` on every start.

To update agent behaviour: edit the relevant `*-AGENTS.md` file, commit, then restart the container:
```bash
docker compose restart
```
No rebuild needed.

---

## Quick start

### 1. Prerequisites

- Docker Desktop or Docker Engine + Compose plugin
- At least one AI provider API key (OpenAI recommended)
- Optional: Telegram bot token from [@BotFather](https://t.me/BotFather)
- Optional: OpenAI Codex CLI installed locally (for `gpt-5.3-codex` model access)

### 2. Configure

```bash
cd openclaw
cp .env.template .env
# Edit .env — fill in OPENCLAW_GATEWAY_TOKEN, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN
```

Generate a secure gateway token:
```bash
openssl rand -hex 32
```

### 3. Build & start

```bash
docker compose up -d
docker compose logs -f          # watch startup
docker compose exec openclaw-gateway node dist/index.js health
```

Expected startup output:
```
🦞 OpenClaw Docker Entrypoint - Automatic Configuration
  ✓ Auth profiles created
  ✓ Gateway token synced
  ✓ Browser configured (headless, noSandbox)
  ✓ Paired device scopes include operator.write (enables sub-agent spawning)
  ✓ exec-approvals.json created (full access, no prompts)
✅ Configuration complete!
🚀 Starting OpenClaw Gateway...
```

### 4. Verify

```bash
docker compose exec openclaw-gateway node dist/index.js health
# → Telegram: ok (@yourbot)
# → Agents: main (default), orchestrator, backend-dev, ...

docker compose exec openclaw-gateway node dist/index.js models
# → Default: openai-codex/gpt-5.3-codex
# → OAuth/token status: ok, expires in Xd
```

---

## Model configuration

### Default model stack (set in `~/.openclaw/openclaw.json`)

| Priority | Model | Auth |
|---|---|---|
| Primary | `openai-codex/gpt-5.3-codex` | Codex CLI OAuth |
| Fallback 1 | `openai/o3-mini` | OpenAI API key |
| Fallback 2 | `openai/gpt-4o` | OpenAI API key |

### Using OpenAI Codex (recommended for coding tasks)

The Codex model uses OAuth from the [OpenAI Codex CLI](https://github.com/openai/codex). If you have it installed and authenticated:

```bash
# Your credentials at ~/.codex/auth.json are mounted read-only into the container
# On first run, they are injected into OpenClaw's auth-profiles automatically
# Token validity is displayed in: docker compose exec openclaw-gateway node dist/index.js models
```

To refresh after token expiry: run any `codex` command on your host, then restart the container.

---

## What the agent can do out of the box

- **Write & run code**: Python and Node.js with full package install (`pip install`, `npm install`)
- **Self-heal**: missing deps → install; syntax errors → fix; API failures → retry/switch source
- **Browse the web**: `web_fetch` (free, no API key) or headless Chromium browser tool
- **Spawn sub-agents**: up to 8 concurrent specialist agents (orchestrator, backend-dev, etc.)
- **Telegram integration**: full DM and group chat support, streaming responses
- **Cron jobs**: schedule recurring tasks via the `cron` tool
- **Memory**: daily logs at `workspace/memory/YYYY-MM-DD.md`, long-term at `workspace/MEMORY.md`
- **Loop detection**: auto-circuit-breaker prevents infinite agent loops

---

## Architecture

```
Host Machine
├── ~/.openclaw/           ← persistent state (auth, devices, sessions, logs)
│   ├── openclaw.json      ← gateway & agent config
│   ├── agents/main/agent/ ← auth-profiles.json
│   └── devices/           ← paired.json (device trust store)
│
└── openclaw/workspace/    ← THIS REPO (agent instructions, mounted into container)
    ├── AGENTS.md          ← main operating manual
    ├── *-AGENTS.md        ← specialist agent instructions
    └── memory/            ← agent creates this at runtime (gitignored)

Docker Container (openclaw-gateway)
├── /app/                  ← OpenClaw application (built from source)
├── /home/node/.openclaw/  ← mounted from ~/.openclaw
├── /home/node/.openclaw/workspace/ ← mounted from ./workspace
├── /home/node/.codex/     ← mounted from ~/.codex (read-only, Codex auth)
└── /home/node/venv/       ← Python virtualenv (pip installs go here)
```

---

## Configuration files

### `~/.openclaw/openclaw.json` — gateway & agent config

Key sections (auto-managed by `docker-entrypoint.sh`):

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai-codex/gpt-5.3-codex",
        "fallbacks": ["openai/o3-mini", "openai/gpt-4o"]
      }
    },
    "list": [{
      "id": "main",
      "tools": {
        "profile": "coding",
        "alsoAllow": ["cron", "gateway", "browser", "web_fetch", "web_search", "nodes", "message", "image"],
        "exec": { "security": "full", "ask": "off", "timeoutSec": 3600 },
        "elevated": { "enabled": true, "allowFrom": { "*": ["*"] } }
      }
    }]
  },
  "channels": {
    "telegram": { "enabled": true, "botToken": "...", "streamMode": "partial" }
  }
}
```

### `workspace/AGENTS.md` — main agent operating manual

Loaded by the agent every session. Contains:
- Quick commands for all tools
- Workspace map
- DO/DON'T rules
- Self-healing procedures
- Memory system guide
- Sub-agent spawning guide
- Boundaries (always / ask first / never)

### `workspace/*-AGENTS.md` — specialist agents

Each specialist file defines the role, goals, edit scope, standards, and boundaries for that agent type. Loaded when the agent spawns a specialist via `sessions_spawn`.

---

## Entrypoint auto-configuration

`docker-entrypoint.sh` runs on every container start and handles:

1. **Auth profiles** — generates `auth-profiles.json` from environment API keys (skips if exists, use `FORCE_REGENERATE_AUTH=true` to override)
2. **Gateway token sync** — writes `OPENCLAW_GATEWAY_TOKEN` into `openclaw.json` to prevent token mismatch errors
3. **Browser config** — sets `headless: true`, `noSandbox: true`, detects Chromium path
4. **Chrome singleton cleanup** — removes stale `SingletonLock` files from unclean shutdowns
5. **Agent defaults** — ensures `tools.elevated`, `commands.restart/bash/config`, and `gateway.reload.hybrid` are set
6. **exec-approvals** — creates full-access `exec-approvals.json` so the agent can run shell commands without prompts
7. **Device scope patch** — adds `operator.write` to paired devices so sub-agent spawning works without manual re-pairing
8. **Permissions** — `chown -R node:node ~/.openclaw`

---

## Sub-agent system

The gateway supports spawning specialist sub-agents via the `sessions_spawn` tool. Each runs as an isolated session with its own system prompt loaded from the corresponding `*-AGENTS.md` file.

Available specialists:
- `orchestrator` — coordinates all other agents
- `infra-architect` — Terraform, Docker, networking
- `cicd-architect` — GitHub Actions, pipelines
- `cloud-architect` — AWS/GCP/Azure design
- `backend-dev` — NestJS, FastAPI, PostgreSQL
- `frontend-dev` — React, Next.js, Tailwind
- `product-manager` — PRDs, specs, acceptance criteria
- `seo-growth` — technical SEO, analytics
- `qa-reliability` — Jest, pytest, Playwright
- `security-compliance` — audits, OWASP, secrets scanning

### Sub-agent fix applied

The paired device registry (`~/.openclaw/devices/paired.json`) must include `operator.write` scope for `sessions_spawn` to work. The entrypoint ensures this automatically on every boot.

---

## Telegram usage

Once `TELEGRAM_BOT_TOKEN` is set and the gateway is running:

1. Start a DM with your bot
2. Send `/start` — the bot will send a pairing link
3. Open the link in a browser to approve DM pairing
4. Start chatting — the agent responds directly

Example interactions:
```
You: Write a Python script to fetch Bitcoin price and run it
Bot: [writes bitcoin_price.py, pip installs requests, runs it, returns the price]

You: Create a REST API with NestJS for a todo app
Bot: [writes full NestJS project, installs deps, starts dev server, tests endpoints]
```

---

## Updating

To update to the latest OpenClaw version:

```bash
git pull origin main   # pull latest gateway source
docker compose build --no-cache
docker compose down && docker compose up -d
docker compose exec openclaw-gateway node dist/index.js --version
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pairing required` on sub-agents | Entrypoint patches this automatically — ensure `docker-entrypoint.sh` is being used |
| `pip install` hits PEP 668 | Venv is active — `pip` should resolve to `/home/node/venv/bin/pip`. Check `exec.pathPrepend` in config |
| Browser tool unavailable | Clear Chrome singleton locks: entrypoint does this on each start |
| TLS errors in web_fetch | Set `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt` (already in compose) |
| Telegram 409 Conflict | Only one polling loop allowed per token — don't run a separate bot script alongside OpenClaw |
| Codex token expired | Run `codex` on host (auto-refreshes `~/.codex/auth.json`), then restart container |
| Gateway token mismatch | Entrypoint syncs `.env` token into `openclaw.json` automatically on start |

---

## Security notes

- `OPENCLAW_GATEWAY_BIND=loopback` — gateway only accepts local connections (safest default)
- API keys are environment variables, never baked into the image
- `~/.openclaw/` state directory (auth tokens, device keys) is on the host, not in the image
- `exec.security=full` gives the agent broad shell access — this is intentional for autonomous coding; adjust if needed
- Never commit `.env` or `auth-profiles.json`

---

## License

OpenClaw is maintained at [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw). This configuration is MIT licensed.

# OpenClaw Tech Company Team Config Pack

This project contains **configuration-focused files only** for setting up a multi-agent OpenClaw team for building and operating a tech company.

## Included
- `openclaw.team.example.json` — gateway config template with multiple preconfigured agents + routing bindings.
- `agents/<agentId>/SOUL.md` — role/persona for each specialist agent.
- `agents/<agentId>/AGENTS.md` — operating instructions for each specialist.

## Team roles included
- `orchestrator` (CEO/COO router)
- `infra-architect`
- `cicd-architect`
- `cloud-architect`
- `backend-dev`
- `frontend-dev`
- `product-manager`
- `seo-growth`
- `qa-reliability`
- `security-compliance`

## How to use
1. Copy `openclaw.team.example.json` to your OpenClaw config path (or merge manually).
2. Set absolute workspace paths for each agent in `agents.list[].workspace`.
3. Set provider/model/env settings for your deployment.
4. Restart gateway.

## Notes
- These are templates; adjust tools and policies per environment.
- Keep secrets out of repo.

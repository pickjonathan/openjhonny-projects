# GitHub Copilot Context — Agent Marketplace POC

## What this codebase does
Builds a multi-agent financial marketplace POC where lenders bid on customer loan requests.
The latest implementation is in `v2/` and includes OpenAI-based agents + hard guardrails.

## Important architecture choices
- Event-driven marketplace core
- Lender policies stored in JSON (`v2/policies/lenders.json`)
- LLM proposals are never trusted directly; all outputs are validated
- Real-time observability through SSE + JSONL audit log

## Main entrypoints
- `llm_marketplace.js` (single-run LLM auction)
- `v2/marketplace_v2.js` (enhanced single-run with event timeline)
- `v2/server_v21.js` (HTTP + SSE service)

## Coding expectations
- Keep deterministic validation separate from LLM reasoning
- Never hardcode secrets
- Preserve event schema compatibility (`type`, `ts`, `payload`)
- Keep response JSON schemas strict when calling OpenAI

## Quick test payload
```json
{
  "type": "LOAN_REQUEST",
  "customerId": "CUS-1002",
  "customerName": "Jonathan",
  "amount": 18000,
  "termMonths": 36,
  "creditScore": 705,
  "minAprPct": 4.5,
  "maxAprPct": 11.0,
  "purpose": "Car"
}
```

## TODO shortlist
- Add DB storage (SQLite/Postgres)
- Add retries + idempotency keys on offer submission
- Add policy versioning and migration format
- Add scoring explanation endpoint for customer-side selection

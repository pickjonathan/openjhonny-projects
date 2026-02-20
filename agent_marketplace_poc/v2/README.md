# LLM Agent Marketplace POC v2

## What this adds
- Real LLM lender + customer agents (OpenAI)
- Policy-driven lender configuration (`policies/lenders.json`)
- Deterministic guardrails and compliance validation
- Real-time event feed (everything that happens)
- Persistent audit trail (`logs/marketplace-events.jsonl`)

## Run
```bash
export OPENAI_API_KEY=... 
node agent_marketplace_poc/v2/marketplace_v2.js
```

## Output
- Live console timeline of all marketplace events
- Full event log in JSONL file for audit/debugging

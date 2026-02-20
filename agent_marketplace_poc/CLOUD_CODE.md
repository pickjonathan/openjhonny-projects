# Cloud Code Handoff — Agent Marketplace POC

## Project purpose
This project is a proof-of-concept marketplace where:
- customer agents publish financial instrument requests (currently loans)
- lender/company agents respond with offers
- guardrails enforce lender policy boundaries
- customer-side agent selects best compliant offer

## Key files
- `index.js` — basic non-LLM event-driven POC
- `llm_marketplace.js` — LLM-based lender/customer agents using OpenAI
- `v2/marketplace_v2.js` — policy-driven + full event logging (JSONL)
- `v2/server_v21.js` — API + SSE live event stream
- `v2/policies/lenders.json` — lender policy configuration
- `v2/.env.example` — required env vars template

## Runtime requirements
- Node.js 18+
- `OPENAI_API_KEY` set in env
- Optional: `OPENAI_MODEL` (default: `gpt-4o-mini`)

## Run
```bash
node agent_marketplace_poc/llm_marketplace.js
node agent_marketplace_poc/v2/marketplace_v2.js
node agent_marketplace_poc/v2/server_v21.js
```

## API (v2.1)
- `POST /requests` run auction for request payload
- `GET /events` live SSE event feed
- `GET /requests` list requests
- `GET /offers/:requestId` list offers for request

## Guardrail model
1. LLM generates proposal JSON.
2. Deterministic post-validator enforces:
   - amount bounds
   - term bounds
   - APR bounds (lender + customer)
   - credit-score threshold
3. Non-compliant output is rejected and logged.

## Suggested next tasks
- add SQLite persistence for requests/offers/events
- add auth + tenant isolation (per financial company)
- add compliance rule packs (jurisdiction-specific)
- add dashboard UI consuming `/events`

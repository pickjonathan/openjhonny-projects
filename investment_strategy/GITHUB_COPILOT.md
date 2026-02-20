# GitHub Copilot Context — Investment Strategy Folder

## What this folder is
A research sandbox for intraday strategy design and robustness testing.
Most scripts are self-contained runners that print JSON-like results.

## Design principles
- Prefer robust profitability over peak in-sample gains.
- Treat walk-forward and full-history as separate quality gates.
- Avoid hidden assumptions; keep parameters explicit in each script.

## Current best practical script
- `intraday_max_profit_under_guardrails.js`

## Key metrics to preserve
- `avgMonthly` (walk-forward + full-history)
- `maxDD`
- `trades`
- `winRate`
- `profitFactor` / `expectancy` where applicable

## Safe refactor guidance
- Keep shared utilities deterministic (EMA/RSI/ATR)
- Keep scoring function visible and configurable
- Prefer JSON output for downstream automation

## Future enhancement ideas
- unify all scripts into one configurable CLI
- persist experiment runs to JSON files
- add Monte Carlo resampling module
- add risk-of-ruin estimation

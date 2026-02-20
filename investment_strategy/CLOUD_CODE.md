# Cloud Code Handoff — Investment Strategy Experiments

## Project purpose
This directory contains iterative backtesting experiments for intraday FX-like strategies (mostly EURUSDT as EUR/USD proxy), including:
- trend-following variants
- mean-reversion variants
- breakout variants
- strict robustness gates and walk-forward validation

## Important files
- `intraday_strategy_lab.js` — multi-strategy optimizer baseline
- `intraday_compare_timeframes.js` — 5m/15m/1h comparison
- `intraday_strict_gate.js` — strict acceptance filter
- `intraday_max_profit_under_guardrails.js` — higher-return under guardrails search
- `trade_report.js` — detailed trigger/PnL/exit diagnostics
- historical variants: `eurusd_*.js`, `strategy.js`

## Run examples
```bash
node investment_strategy/intraday_strict_gate.js
node investment_strategy/intraday_max_profit_under_guardrails.js
node investment_strategy/trade_report.js
```

## Methodology notes
- Walk-forward metrics can overstate performance; always compare with full-history result.
- Robustness criteria used in scripts include drawdown caps, minimum trades, and positive OOS/full-history profitability.
- Data source is Binance klines (`EURUSDT`), used as a practical proxy.

## Suggested next tasks
- add spread/slippage model per interval
- add parameter stability heatmaps
- add nested walk-forward with frozen holdout set
- add forward paper-trading harness for live validation

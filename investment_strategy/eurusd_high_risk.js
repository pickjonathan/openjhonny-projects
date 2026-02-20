const axios = require('axios');

async function fetchEURUSD() {
  const end = new Date().toISOString().slice(0, 10);
  const start = '2010-01-01';
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
  const res = await axios.get(url, { timeout: 20000 });
  return Object.entries(res.data.rates)
    .map(([date, v]) => ({
      time: new Date(date + 'T00:00:00Z').getTime(),
      close: Number(v.USD),
    }))
    .filter(r => Number.isFinite(r.close))
    .sort((a, b) => a.time - b.time);
}

const ema = (arr, p) => {
  const k = 2 / (p + 1);
  let prev = arr[0];
  return arr.map((v, i) => (i === 0 ? prev : (prev = v * k + prev * (1 - k))));
};

function rsi(values, p = 14) {
  const gains = Array(values.length).fill(0);
  const losses = Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  const avgG = ema(gains, p);
  const avgL = ema(losses, p);
  return values.map((_, i) => (avgL[i] === 0 ? 100 : 100 - 100 / (1 + avgG[i] / avgL[i])));
}

function backtest(rows, p) {
  const close = rows.map(r => r.close);
  const fast = ema(close, p.fast);
  const slow = ema(close, p.slow);
  const mom = rsi(close, p.rsiPeriod);

  let equity = 10000;
  let peak = equity;
  let maxDD = 0;

  let position = 0; // units
  let entry = 0;
  let stop = 0;
  let take = 0;
  let trades = 0;

  const monthlyMark = [];
  let lastMonth = null;

  for (let i = Math.max(p.slow + 2, 30); i < close.length; i++) {
    const price = close[i];
    const crossUp = fast[i] > slow[i] && fast[i - 1] <= slow[i - 1];
    const crossDn = fast[i] < slow[i] && fast[i - 1] >= slow[i - 1];

    if (position === 0 && crossUp && mom[i] <= p.buyRsiMax) {
      const riskCash = equity * p.riskPct;
      const stopDist = Math.max(price * p.stopPct, 0.0010);
      const units = (riskCash / stopDist) * p.leverage;
      const notional = units * price;
      const feeIn = notional * p.fee;

      if (equity > feeIn) {
        position = units;
        entry = price;
        stop = price - stopDist;
        take = price + stopDist * p.rr;
        equity -= feeIn;
        trades++;
      }
    }

    if (position > 0) {
      const exitSignal = crossDn || mom[i] >= p.sellRsiMin;
      const stopHit = price <= stop;
      const takeHit = price >= take;
      if (exitSignal || stopHit || takeHit) {
        const pnl = (price - entry) * position;
        const feeOut = position * price * p.fee;
        equity += pnl - feeOut;
        position = 0;
      }
    }

    if (position > 0) {
      const mtm = equity + (price - entry) * position;
      if (mtm > peak) peak = mtm;
      const dd = (peak - mtm) / peak;
      if (dd > maxDD) maxDD = dd;
    } else {
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    const d = new Date(rows[i].time);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (m !== lastMonth) {
      monthlyMark.push({ month: m, eq: equity });
      lastMonth = m;
    } else {
      monthlyMark[monthlyMark.length - 1].eq = equity;
    }
  }

  const mrets = [];
  for (let i = 1; i < monthlyMark.length; i++) {
    const r = (monthlyMark[i].eq - monthlyMark[i - 1].eq) / monthlyMark[i - 1].eq;
    mrets.push(r);
  }
  const avgMonthly = mrets.length ? mrets.reduce((a, b) => a + b, 0) / mrets.length : 0;

  return {
    finalEquity: equity,
    totalReturnPct: ((equity / 10000) - 1) * 100,
    avgMonthlyPct: avgMonthly * 100,
    maxDrawdownPct: maxDD * 100,
    trades,
  };
}

function optimize(trainRows, targetMonthly = 20) {
  let best = null;
  const fasts = [3, 5, 8, 10];
  const slows = [13, 21, 34];
  const buyR = [60, 65, 70, 75];
  const rr = [1.0, 1.3, 1.6, 2.0];
  const risk = [0.03, 0.05, 0.08, 0.12];
  const lev = [5, 10, 20, 30];
  const stopPct = [0.003, 0.005, 0.008, 0.012];

  for (const fast of fasts) for (const slow of slows) {
    if (fast >= slow) continue;
    for (const buyRsiMax of buyR) for (const rrv of rr) {
      for (const riskPct of risk) for (const leverage of lev) for (const sp of stopPct) {
        const p = {
          fast, slow, rsiPeriod: 14,
          buyRsiMax, sellRsiMin: 62,
          rr: rrv, riskPct, leverage, stopPct: sp,
          fee: 0.00005,
        };
        const res = backtest(trainRows, p);
        // prefer hitting target monthly, then lower drawdown
        const dist = Math.abs(targetMonthly - res.avgMonthlyPct);
        const penalty = Math.max(0, res.maxDrawdownPct - 35) * 0.5;
        const score = -dist - penalty + res.totalReturnPct * 0.02;
        if (!best || score > best.score) best = { params: p, train: res, score };
      }
    }
  }
  return best;
}

(async () => {
  const rows = await fetchEURUSD();
  const split = Math.floor(rows.length * 0.75);
  const train = rows.slice(0, split);
  const test = rows.slice(split);

  const best = optimize(train, 20);
  const testRes = backtest(test, best.params);

  console.log({
    targetMonthlyPct: 20,
    bestParams: best.params,
    train: best.train,
    test: testRes,
  });
})();

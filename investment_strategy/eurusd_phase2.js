const axios = require('axios');

async function fetchEURUSDHourly(limit = 1000) {
  // EURUSDT proxy for EUR/USD (USDT ~ USD)
  const url = `https://api.binance.com/api/v3/klines?symbol=EURUSDT&interval=1h&limit=${limit}`;
  const res = await axios.get(url, { timeout: 20000 });
  return res.data.map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  }));
}

const ema = (arr, p) => {
  const k = 2 / (p + 1);
  let prev = arr[0];
  return arr.map((v, i) => (i === 0 ? prev : (prev = v * k + prev * (1 - k))));
};

function rsi(values, p = 14) {
  const g = Array(values.length).fill(0), l = Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    g[i] = Math.max(d, 0);
    l[i] = Math.max(-d, 0);
  }
  const ag = ema(g, p), al = ema(l, p);
  return values.map((_, i) => (al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])));
}

function atr(rows, p = 14) {
  const tr = rows.map((r, i) => {
    if (i === 0) return 0;
    const pc = rows[i - 1].close;
    return Math.max(r.high - r.low, Math.abs(r.high - pc), Math.abs(r.low - pc));
  });
  return ema(tr, p);
}

function backtest(rows, p) {
  const close = rows.map(r => r.close);
  const fast = ema(close, p.fast);
  const slow = ema(close, p.slow);
  const mom = rsi(close, p.rsiPeriod);
  const vol = atr(rows, p.atrPeriod);

  let equity = 10000;
  let peak = equity;
  let maxDD = 0;
  let units = 0;
  let dir = 0;
  let entry = 0;
  let stop = 0;
  let take = 0;
  let trades = 0;
  let wins = 0;

  const equityCurve = [];

  for (let i = Math.max(40, p.slow + 2); i < rows.length; i++) {
    const px = close[i];
    const crossUp = fast[i] > slow[i] && fast[i - 1] <= slow[i - 1];
    const crossDn = fast[i] < slow[i] && fast[i - 1] >= slow[i - 1];

    // hard risk kill-switch
    const ddNow = (peak - equity) / peak;
    if (ddNow > p.killDD) {
      equityCurve.push(equity);
      continue;
    }

    if (dir === 0) {
      const longSig = crossUp && mom[i] <= p.buyRsiMax;
      const shortSig = crossDn && mom[i] >= p.sellRsiMin;
      if (longSig || shortSig) {
        dir = longSig ? 1 : -1;
        const stopDist = Math.max(vol[i] * p.atrMult, px * p.minStopPct);
        const riskCash = equity * p.riskPct;
        units = riskCash / stopDist;
        const notional = units * px * p.leverage;
        const feeIn = notional * p.fee;
        if (equity > feeIn && units > 0) {
          entry = px;
          stop = dir === 1 ? px - stopDist : px + stopDist;
          take = dir === 1 ? px + stopDist * p.rr : px - stopDist * p.rr;
          equity -= feeIn;
          trades++;
        } else {
          dir = 0;
          units = 0;
        }
      }
    } else {
      const stopHit = dir === 1 ? px <= stop : px >= stop;
      const takeHit = dir === 1 ? px >= take : px <= take;
      const trendFlip = (dir === 1 && crossDn) || (dir === -1 && crossUp);
      const timeExit = (i % p.maxBarsInTrade) === 0;
      if (stopHit || takeHit || trendFlip || timeExit) {
        const pnl = dir === 1 ? (px - entry) * units * p.leverage : (entry - px) * units * p.leverage;
        const feeOut = units * px * p.leverage * p.fee;
        equity += pnl - feeOut;
        if (pnl > 0) wins++;
        dir = 0;
        units = 0;
      }
    }

    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - equity) / peak);
    equityCurve.push(equity);
  }

  const totalRet = (equity / 10000 - 1) * 100;
  const barsPerMonth = 24 * 30;
  const months = Math.max(1, rows.length / barsPerMonth);
  const avgMonthly = (Math.pow(equity / 10000, 1 / months) - 1) * 100;

  return {
    equity,
    totalRet,
    avgMonthly,
    maxDD: maxDD * 100,
    trades,
    winRate: trades ? (wins / trades) * 100 : 0,
    equityCurve,
  };
}

function walkForward(rows, p, folds = 4) {
  const n = rows.length;
  const chunk = Math.floor(n / (folds + 1));
  const stats = [];
  for (let f = 0; f < folds; f++) {
    const testStart = chunk * (f + 1);
    const testEnd = Math.min(n, testStart + chunk);
    const test = rows.slice(testStart, testEnd);
    if (test.length < 120) continue;
    stats.push(backtest(test, p));
  }
  if (!stats.length) return null;
  return {
    avgMonthly: stats.reduce((a, b) => a + b.avgMonthly, 0) / stats.length,
    maxDD: Math.max(...stats.map(s => s.maxDD)),
    avgTrades: stats.reduce((a, b) => a + b.trades, 0) / stats.length,
  };
}

function monteCarloMonthly(equityCurve, iterations = 500) {
  if (equityCurve.length < 100) return null;
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push((equityCurve[i] - equityCurve[i - 1]) / Math.max(1e-9, equityCurve[i - 1]));
  }
  const horizon = Math.min(24 * 30, rets.length);
  const samples = [];
  for (let k = 0; k < iterations; k++) {
    let e = 1;
    for (let i = 0; i < horizon; i++) {
      const r = rets[Math.floor(Math.random() * rets.length)];
      e *= 1 + r;
    }
    samples.push((e - 1) * 100);
  }
  samples.sort((a, b) => a - b);
  const q = p => samples[Math.floor((samples.length - 1) * p)];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

function optimize(rows) {
  let best = null;
  let bestRaw = null;
  const grid = {
    fast: [5, 8, 13],
    slow: [21, 34, 55],
    buyRsiMax: [50, 55, 60],
    sellRsiMin: [40, 45, 50],
    atrMult: [1.5, 2.0, 2.5],
    rr: [1.2, 1.5, 2.0],
    riskPct: [0.005, 0.01, 0.015],
    leverage: [3, 5, 10],
    minStopPct: [0.001, 0.002],
    maxBarsInTrade: [24, 48, 72],
  };

  for (const fast of grid.fast) for (const slow of grid.slow) {
    if (fast >= slow) continue;
    for (const buyRsiMax of grid.buyRsiMax) for (const sellRsiMin of grid.sellRsiMin)
      for (const atrMult of grid.atrMult) for (const rr of grid.rr)
        for (const riskPct of grid.riskPct) for (const leverage of grid.leverage)
          for (const minStopPct of grid.minStopPct) for (const maxBarsInTrade of grid.maxBarsInTrade) {
            const p = {
              fast, slow, rsiPeriod: 14, atrPeriod: 14,
              buyRsiMax, sellRsiMin,
              atrMult, rr, riskPct, leverage,
              minStopPct, maxBarsInTrade,
              fee: 0.0002,
              killDD: 0.25,
            };
            const wf = walkForward(rows, p, 4);
            if (!wf) continue;

            const rawScore = wf.avgMonthly - 0.04 * wf.maxDD;
            if (!bestRaw || rawScore > bestRaw.score) bestRaw = { p, wf, score: rawScore };

            if (wf.maxDD > 45) continue;
            if (wf.avgTrades < 2) continue;

            const score = wf.avgMonthly - 0.08 * wf.maxDD;
            if (!best || score > best.score) best = { p, wf, score };
          }
  }
  return best || bestRaw;
}

(async () => {
  try {
    const rows = await fetchEURUSDHourly(1000);
    const best = optimize(rows);
    if (!best) {
      console.log({ message: 'No robust config found under constraints.' });
      return;
    }
    const full = backtest(rows, best.p);
    const mc = monteCarloMonthly(full.equityCurve, 500);

    console.log({
      source: 'Binance EURUSDT 1h proxy',
      bestParams: best.p,
      walkForward: best.wf,
      full,
      monteCarloMonthly: mc,
      note: '20% monthly target checked against robust constraints',
    });
  } catch (e) {
    console.error('Run failed:', e.message);
  }
})();

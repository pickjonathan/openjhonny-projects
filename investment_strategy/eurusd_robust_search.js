const axios = require('axios');

async function fetchEURUSD() {
  const end = new Date().toISOString().slice(0, 10);
  const start = '2010-01-01';
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
  const res = await axios.get(url, { timeout: 20000 });
  return Object.entries(res.data.rates)
    .map(([date, v]) => ({ time: new Date(date + 'T00:00:00Z').getTime(), close: Number(v.USD) }))
    .filter(r => Number.isFinite(r.close))
    .sort((a, b) => a.time - b.time);
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
    g[i] = Math.max(d, 0); l[i] = Math.max(-d, 0);
  }
  const ag = ema(g, p), al = ema(l, p);
  return values.map((_, i) => al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
}

function backtest(rows, p) {
  const c = rows.map(r => r.close);
  const f = ema(c, p.fast), s = ema(c, p.slow), m = rsi(c, p.rsiPeriod);
  let equity = 10000, peak = 10000, maxDD = 0;
  let units = 0, entry = 0, stop = 0, take = 0;
  let trades = 0;
  const monthly = [];
  let curMonth = null;

  for (let i = Math.max(30, p.slow + 2); i < c.length; i++) {
    const price = c[i];
    const up = f[i] > s[i] && f[i - 1] <= s[i - 1];
    const down = f[i] < s[i] && f[i - 1] >= s[i - 1];

    if (units === 0 && up && m[i] <= p.buyRsiMax) {
      const riskCash = equity * p.riskPct;
      const stopDist = Math.max(price * p.stopPct, 0.0008);
      const qty = (riskCash / stopDist) * p.leverage;
      const feeIn = qty * price * p.fee;
      if (equity > feeIn && qty > 0) {
        units = qty;
        entry = price;
        stop = price - stopDist;
        take = price + stopDist * p.rr;
        equity -= feeIn;
        trades++;
      }
    }

    if (units > 0) {
      const exit = down || m[i] >= p.sellRsiMin || price <= stop || price >= take;
      if (exit) {
        equity += (price - entry) * units;
        equity -= units * price * p.fee;
        units = 0;
      }
    }

    const mtm = units > 0 ? equity + (price - entry) * units : equity;
    peak = Math.max(peak, mtm);
    maxDD = Math.max(maxDD, (peak - mtm) / peak);

    const d = new Date(rows[i].time);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    if (key !== curMonth) {
      monthly.push({ key, eq: mtm });
      curMonth = key;
    } else {
      monthly[monthly.length - 1].eq = mtm;
    }
  }

  const rets = [];
  for (let i = 1; i < monthly.length; i++) rets.push((monthly[i].eq - monthly[i-1].eq)/monthly[i-1].eq);
  const avgMonthly = rets.length ? rets.reduce((a,b)=>a+b,0)/rets.length : 0;

  return {
    finalEquity: equity,
    totalReturnPct: (equity/10000 - 1) * 100,
    avgMonthlyPct: avgMonthly * 100,
    maxDrawdownPct: maxDD * 100,
    trades,
  };
}

function walkForward(rows, p, folds = 4) {
  const n = rows.length;
  const chunk = Math.floor(n / (folds + 1));
  const tests = [];
  for (let f = 0; f < folds; f++) {
    const trainEnd = chunk * (f + 1);
    const testEnd = Math.min(trainEnd + chunk, n);
    const train = rows.slice(0, trainEnd);
    const test = rows.slice(trainEnd, testEnd);
    if (train.length < 200 || test.length < 40) continue;
    tests.push(backtest(test, p));
  }
  if (!tests.length) return null;
  return {
    avgMonthlyPct: tests.reduce((a,b)=>a+b.avgMonthlyPct,0)/tests.length,
    maxDrawdownPct: Math.max(...tests.map(t=>t.maxDrawdownPct)),
    avgTrades: tests.reduce((a,b)=>a+b.trades,0)/tests.length,
  };
}

async function main() {
  const rows = await fetchEURUSD();
  let best = null;

  for (const fast of [3,5,8,10]) for (const slow of [13,21,34]) {
    if (fast >= slow) continue;
    for (const buyRsiMax of [55,60,65,70]) for (const rr of [1.0,1.3,1.6,2.0]) {
      for (const riskPct of [0.01,0.02,0.03,0.05]) for (const leverage of [3,5,10,20]) {
        for (const stopPct of [0.002,0.003,0.005,0.008]) {
          const p = {
            fast, slow, rsiPeriod:14, buyRsiMax, sellRsiMin:62,
            rr, riskPct, leverage, stopPct, fee:0.00005
          };
          const wf = walkForward(rows, p, 4);
          if (!wf) continue;
          // Robustness constraints
          if (wf.maxDrawdownPct > 35) continue;
          if (wf.avgTrades < 2) continue;

          const score = wf.avgMonthlyPct - 0.08 * wf.maxDrawdownPct;
          if (!best || score > best.score) best = { p, wf, score };
        }
      }
    }
  }

  if (!best) {
    console.log({ message: 'No robust strategy found under risk constraints.' });
    return;
  }

  const final = backtest(rows, best.p);
  console.log({ bestParams: best.p, walkForward: best.wf, fullHistory: final });
}

main().catch(e => console.error('Run failed:', e.message));

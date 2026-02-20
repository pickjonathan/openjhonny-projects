const axios = require('axios');

async function fetchEURUSD() {
  const end = new Date().toISOString().slice(0, 10);
  const start = '2010-01-01';
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
  const res = await axios.get(url, { timeout: 20000 });
  return Object.entries(res.data.rates)
    .map(([d, v]) => ({ time: new Date(d + 'T00:00:00Z').getTime(), close: Number(v.USD) }))
    .filter(r => Number.isFinite(r.close))
    .sort((a, b) => a.time - b.time);
}

const ema = (arr, p) => {
  const k = 2 / (p + 1); let prev = arr[0];
  return arr.map((v, i) => i === 0 ? prev : (prev = v * k + prev * (1 - k)));
};

function std(arr, i, w) {
  if (i < w) return 0;
  const s = arr.slice(i - w + 1, i + 1);
  const m = s.reduce((a, b) => a + b, 0) / s.length;
  return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
}

function rsi(v, p = 14) {
  const g = Array(v.length).fill(0), l = Array(v.length).fill(0);
  for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1]; g[i] = Math.max(d, 0); l[i] = Math.max(-d, 0); }
  const ag = ema(g, p), al = ema(l, p);
  return v.map((_, i) => al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
}

function run(rows, p) {
  const c = rows.map(x => x.close);
  const f = ema(c, p.fast), s = ema(c, p.slow), r = rsi(c, p.rsi);
  let eq = 10000, peak = 10000, maxDD = 0;
  let pos = 0, entry = 0, stop = 0, take = 0; // pos: +1 long, -1 short
  let units = 0, trades = 0;

  const monthly = []; let mk = null;

  for (let i = Math.max(p.slow + 2, 30); i < c.length; i++) {
    const px = c[i];
    const sigTrend = f[i] > s[i] ? 1 : -1;
    const z = std(c, i, p.bbWin) ? (px - ema(c, p.bbWin)[i]) / std(c, i, p.bbWin) : 0;

    const longEntry = (sigTrend === 1 && r[i] <= p.rsiBuy) || (z < -p.zEntry);
    const shortEntry = (sigTrend === -1 && r[i] >= p.rsiSell) || (z > p.zEntry);

    if (pos === 0) {
      if (longEntry || shortEntry) {
        pos = longEntry ? 1 : -1;
        const stopDist = Math.max(px * p.stopPct, 0.0006);
        const riskCash = eq * p.riskPct;
        units = (riskCash / stopDist) * p.leverage;
        if (units <= 0) { pos = 0; continue; }
        entry = px;
        stop = pos === 1 ? px - stopDist : px + stopDist;
        take = pos === 1 ? px + stopDist * p.rr : px - stopDist * p.rr;
        eq -= units * px * p.fee;
        trades++;
      }
    } else {
      const hitStop = pos === 1 ? px <= stop : px >= stop;
      const hitTake = pos === 1 ? px >= take : px <= take;
      const trendFlip = (pos === 1 && sigTrend === -1) || (pos === -1 && sigTrend === 1);
      const meanRevert = Math.abs(z) < p.zExit;
      if (hitStop || hitTake || trendFlip || meanRevert) {
        const pnl = pos === 1 ? (px - entry) * units : (entry - px) * units;
        eq += pnl;
        eq -= units * px * p.fee;
        pos = 0; units = 0;
      }
    }

    const mtm = pos === 0 ? eq : eq + (pos === 1 ? (px - entry) * units : (entry - px) * units);
    peak = Math.max(peak, mtm);
    maxDD = Math.max(maxDD, (peak - mtm) / peak);

    const d = new Date(rows[i].time);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key !== mk) { monthly.push({ key, eq: mtm }); mk = key; } else monthly[monthly.length - 1].eq = mtm;
  }

  const mret = [];
  for (let i = 1; i < monthly.length; i++) mret.push((monthly[i].eq - monthly[i - 1].eq) / monthly[i - 1].eq);
  const avgM = mret.length ? mret.reduce((a, b) => a + b, 0) / mret.length : 0;
  return { final: eq, totalPct: (eq / 10000 - 1) * 100, avgMonthlyPct: avgM * 100, maxDDPct: maxDD * 100, trades };
}

function wf(rows, p, folds = 5) {
  const n = rows.length; const chunk = Math.floor(n / (folds + 1));
  const out = [];
  for (let i = 0; i < folds; i++) {
    const trainEnd = chunk * (i + 1), testEnd = Math.min(n, trainEnd + chunk);
    const test = rows.slice(trainEnd, testEnd);
    if (test.length < 60) continue;
    out.push(run(test, p));
  }
  if (!out.length) return null;
  return {
    avgMonthlyPct: out.reduce((a, b) => a + b.avgMonthlyPct, 0) / out.length,
    maxDDPct: Math.max(...out.map(x => x.maxDDPct)),
    avgTrades: out.reduce((a, b) => a + b.trades, 0) / out.length,
  };
}

async function main() {
  const rows = await fetchEURUSD();
  let best = null;

  const grid = {
    fast: [3, 5, 8], slow: [13, 21], rsi: [14],
    rsiBuy: [45, 50, 55], rsiSell: [45, 55],
    bbWin: [10, 20], zEntry: [1.0, 1.8], zExit: [0.2, 0.5],
    stopPct: [0.002, 0.004], rr: [0.8, 1.2, 1.8],
    riskPct: [0.01, 0.03, 0.05], leverage: [3, 10, 20], fee: [0.00005]
  };

  for (const fast of grid.fast) for (const slow of grid.slow) {
    if (fast >= slow) continue;
    for (const rsiP of grid.rsi) for (const rb of grid.rsiBuy) for (const rs of grid.rsiSell)
      for (const bbWin of grid.bbWin) for (const ze of grid.zEntry) for (const zx of grid.zExit)
        for (const stopPct of grid.stopPct) for (const rr of grid.rr)
          for (const riskPct of grid.riskPct) for (const leverage of grid.leverage)
            for (const fee of grid.fee) {
              const p = { fast, slow, rsi: rsiP, rsiBuy: rb, rsiSell: 100-rs, bbWin, zEntry: ze, zExit: zx, stopPct, rr, riskPct, leverage, fee };
              const val = wf(rows, p, 5);
              if (!val) continue;
              if (val.avgTrades < 2) continue;
              const score = val.avgMonthlyPct - 0.12 * val.maxDDPct;
              if (!best || score > best.score) best = { p, val, score };
            }
  }

  if (!best) return console.log({ message: 'No viable config' });
  const full = run(rows, best.p);
  console.log({ bestParams: best.p, walkForward: best.val, full });
}

main().catch(e => console.error('Run failed:', e.message));

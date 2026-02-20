const axios = require('axios');

async function fetchEURUSDHourly(limit = 1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=EURUSDT&interval=1h&limit=${limit}`;
  const res = await axios.get(url, { timeout: 20000 });
  return res.data.map(k => ({
    time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4])
  }));
}

const ema = (arr, p) => {
  const k = 2 / (p + 1); let prev = arr[0];
  return arr.map((v, i) => i === 0 ? prev : (prev = v * k + prev * (1 - k)));
};

function rsi(values, p = 14) {
  const g = Array(values.length).fill(0), l = Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]; g[i] = Math.max(d, 0); l[i] = Math.max(-d, 0);
  }
  const ag = ema(g, p), al = ema(l, p);
  return values.map((_, i) => al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
}

function atr(rows, p = 14) {
  const tr = rows.map((r, i) => i === 0 ? 0 : Math.max(r.high-r.low, Math.abs(r.high-rows[i-1].close), Math.abs(r.low-rows[i-1].close)));
  return ema(tr, p);
}

function backtest(rows, p) {
  const c = rows.map(r => r.close), f = ema(c, p.fast), s = ema(c, p.slow), m = rsi(c, p.rsi), a = atr(rows, p.atr);
  let eq = 10000, peak = 10000, maxDD = 0;
  let dir = 0, units = 0, entry = 0, stop = 0, take = 0;
  let trades = 0, wins = 0;

  for (let i = Math.max(40, p.slow + 2); i < c.length; i++) {
    const px = c[i];
    const up = f[i] > s[i] && f[i - 1] <= s[i - 1];
    const dn = f[i] < s[i] && f[i - 1] >= s[i - 1];

    if (dir === 0) {
      const longSig = up && m[i] <= p.buyRsi;
      const shortSig = dn && m[i] >= p.sellRsi;
      if (longSig || shortSig) {
        dir = longSig ? 1 : -1;
        const stopDist = Math.max(a[i] * p.atrMult, px * p.minStop);
        const riskCash = eq * p.risk;
        units = (riskCash / stopDist) * p.leverage;
        const feeIn = units * px * p.fee;
        if (eq > feeIn && units > 0) {
          entry = px;
          stop = dir === 1 ? px - stopDist : px + stopDist;
          take = dir === 1 ? px + stopDist * p.rr : px - stopDist * p.rr;
          eq -= feeIn;
          trades++;
        } else { dir = 0; units = 0; }
      }
    } else {
      const stopHit = dir === 1 ? px <= stop : px >= stop;
      const takeHit = dir === 1 ? px >= take : px <= take;
      const flip = (dir === 1 && dn) || (dir === -1 && up);
      if (stopHit || takeHit || flip) {
        const pnl = dir === 1 ? (px - entry) * units : (entry - px) * units;
        const feeOut = units * px * p.fee;
        eq += pnl - feeOut;
        if (pnl > 0) wins++;
        dir = 0; units = 0;
      }
    }

    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak - eq) / peak);
  }

  const months = Math.max(1, rows.length / (24 * 30));
  return {
    equity: eq,
    totalPct: (eq / 10000 - 1) * 100,
    avgMonthlyPct: (Math.pow(eq / 10000, 1 / months) - 1) * 100,
    maxDDPct: maxDD * 100,
    trades,
    winRate: trades ? (wins / trades) * 100 : 0
  };
}

function walkForward(rows, p, folds = 4) {
  const n = rows.length, chunk = Math.floor(n / (folds + 1));
  const out = [];
  for (let i = 0; i < folds; i++) {
    const s = chunk * (i + 1), e = Math.min(n, s + chunk);
    const test = rows.slice(s, e);
    if (test.length < 120) continue;
    out.push(backtest(test, p));
  }
  if (!out.length) return null;
  return {
    avgMonthlyPct: out.reduce((a, b) => a + b.avgMonthlyPct, 0) / out.length,
    maxDDPct: Math.max(...out.map(x => x.maxDDPct)),
    avgTrades: out.reduce((a, b) => a + b.trades, 0) / out.length,
  };
}

function optimizeSpec(rows) {
  let best = null;
  for (const fast of [3,5,8]) for (const slow of [13,21,34]) {
    if (fast >= slow) continue;
    for (const buyRsi of [55,60,65]) for (const sellRsi of [35,40,45])
      for (const atrMult of [1.2,1.5,2.0]) for (const rr of [0.8,1.0,1.2,1.5])
        for (const risk of [0.02,0.05,0.1,0.15]) for (const leverage of [10,20,30,50]) {
          const p = { fast, slow, rsi:14, atr:14, buyRsi, sellRsi, atrMult, rr, risk, leverage, minStop:0.0008, fee:0.0002 };
          const wf = walkForward(rows, p, 4);
          if (!wf) continue;
          const score = wf.avgMonthlyPct - 0.03 * wf.maxDDPct + 0.02 * wf.avgTrades;
          if (!best || score > best.score) best = { p, wf, score };
        }
  }
  return best;
}

(async () => {
  const rows = await fetchEURUSDHourly(1000);
  const best = optimizeSpec(rows);
  if (!best) return console.log({ message: 'No config found' });
  const full = backtest(rows, best.p);
  console.log({ mode:'speculative', bestParams: best.p, walkForward: best.wf, full });
})();

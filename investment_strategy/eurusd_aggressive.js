const axios = require('axios');

async function fetchEURUSD() {
  const end = new Date().toISOString().slice(0, 10);
  const start = '2010-01-01';
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
  const res = await axios.get(url, { timeout: 20000 });
  return Object.entries(res.data.rates)
    .map(([date, v]) => ({ time: new Date(date).getTime(), close: Number(v.USD) }))
    .filter(r => Number.isFinite(r.close))
    .sort((a, b) => a.time - b.time);
}

const ema = (arr, p) => {
  const k = 2 / (p + 1);
  let prev = arr[0];
  return arr.map((v, i) => (i === 0 ? prev : (prev = v * k + prev * (1 - k))));
};

const rsi = (arr, p = 14) => {
  const g = Array(arr.length).fill(0), l = Array(arr.length).fill(0);
  for (let i = 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    g[i] = Math.max(d, 0); l[i] = Math.max(-d, 0);
  }
  const ag = ema(g, p), al = ema(l, p);
  return arr.map((_, i) => (al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])));
};

function backtest(rows, p) {
  const c = rows.map(r => r.close);
  const f = ema(c, p.fast), s = ema(c, p.slow), m = rsi(c, p.rsi);
  let eq = 10000, pos = 0, entry = 0;
  const monthly = new Map();

  for (let i = p.slow + 2; i < c.length; i++) {
    const crossUp = f[i] > s[i] && f[i - 1] <= s[i - 1];
    const crossDn = f[i] < s[i] && f[i - 1] >= s[i - 1];

    if (!pos && crossUp && m[i] < p.buyRsi) {
      pos = (eq * p.risk * p.leverage) / c[i];
      entry = c[i];
    } else if (pos && (crossDn || m[i] > p.sellRsi)) {
      const pnl = (c[i] - entry) * pos;
      eq += pnl - Math.abs(pos * c[i]) * p.fee;
      pos = 0;
    }

    const d = new Date(rows[i].time);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthly.set(k, eq + pos * c[i]);
  }

  const vals = [...monthly.values()];
  const mr = [];
  for (let i = 1; i < vals.length; i++) mr.push((vals[i] - vals[i - 1]) / vals[i - 1]);
  const avgMonthly = mr.reduce((a, b) => a + b, 0) / (mr.length || 1);
  return { final: eq, avgMonthlyPct: avgMonthly * 100 };
}

(async () => {
  const rows = await fetchEURUSD();
  const split = Math.floor(rows.length * 0.75);
  const train = rows.slice(0, split), test = rows.slice(split);

  let best = null;
  for (const fast of [5, 8, 10, 12]) for (const slow of [13, 21, 34]) {
    if (fast >= slow) continue;
    for (const buyRsi of [55, 60, 65, 70]) for (const lev of [2, 3, 5, 8, 10]) {
      const p = { fast, slow, rsi: 14, buyRsi, sellRsi: 60, risk: 0.03, leverage: lev, fee: 0.00005 };
      const tr = backtest(train, p);
      if (!best || tr.avgMonthlyPct > best.train.avgMonthlyPct) best = { p, train: tr };
    }
  }

  const testRes = backtest(test, best.p);
  console.log({ bestParams: best.p, train: best.train, test: testRes });
})();

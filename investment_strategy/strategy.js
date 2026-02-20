const axios = require('axios');

async function fetchBTC(days = 730) {
  const limit = Math.min(1000, days);
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${limit}`;
  const res = await axios.get(url, { timeout: 20000 });
  return res.data.map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  }));
}

async function fetchEURUSD() {
  // Frankfurter daily ECB rates (free, no key)
  const end = new Date().toISOString().slice(0, 10);
  const start = '2018-01-01';
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
  const res = await axios.get(url, { timeout: 20000 });
  const rows = Object.entries(res.data.rates)
    .map(([date, v]) => ({ time: new Date(date).getTime(), close: Number(v.USD) }))
    .filter(r => Number.isFinite(r.close))
    .sort((a, b) => a.time - b.time);
  return rows;
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(values, period = 14) {
  const gains = Array(values.length).fill(0);
  const losses = Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  const avgGain = ema(gains, period);
  const avgLoss = ema(losses, period);
  return values.map((_, i) => {
    if (avgLoss[i] === 0) return 100;
    const rs = avgGain[i] / avgLoss[i];
    return 100 - 100 / (1 + rs);
  });
}

function atrFromClose(rows, period = 14) {
  const tr = rows.map((r, i) => {
    if (i === 0) return 0;
    if (Number.isFinite(r.high) && Number.isFinite(r.low)) {
      return Math.max(
        r.high - r.low,
        Math.abs(r.high - rows[i - 1].close),
        Math.abs(r.low - rows[i - 1].close)
      );
    }
    return Math.abs(r.close - rows[i - 1].close);
  });
  return ema(tr, period);
}

function backtest(rows, p) {
  const close = rows.map(r => r.close);
  const fast = ema(close, p.fast);
  const slow = ema(close, p.slow);
  const mom = rsi(close, p.rsiPeriod);
  const atr = atrFromClose(rows, p.atrPeriod);

  let cash = 10000;
  let units = 0;
  let entry = 0;
  let stop = 0;
  let trades = 0;
  const fee = p.fee;

  for (let i = Math.max(p.slow + 2, 30); i < close.length; i++) {
    const price = close[i];
    const crossUp = fast[i] > slow[i] && fast[i - 1] <= slow[i - 1];
    const crossDown = fast[i] < slow[i] && fast[i - 1] >= slow[i - 1];

    if (units === 0 && crossUp && mom[i] < p.rsiBuyMax) {
      const risk = cash * p.riskPct;
      const stopDist = Math.max(atr[i] * p.atrMult, price * p.minStopPct);
      const qty = risk / stopDist;
      const maxAffordable = cash / (price * (1 + fee));
      units = Math.min(qty, maxAffordable);
      if (units > 0) {
        entry = price;
        stop = price - stopDist;
        cash -= units * price * (1 + fee);
        trades++;
      }
      continue;
    }

    if (units > 0) {
      const take = entry + (entry - stop) * p.rr;
      const stopHit = price <= stop;
      const takeHit = price >= take;
      const trendExit = crossDown || mom[i] > p.rsiSellMin;

      if (stopHit || takeHit || trendExit) {
        cash += units * price * (1 - fee);
        units = 0;
        trades++;
      }
    }
  }

  const equity = cash + units * close[close.length - 1];
  const retPct = (equity / 10000 - 1) * 100;
  return { equity, retPct, trades };
}

function optimize(rows, baseOverrides = {}) {
  const split = Math.floor(rows.length * 0.7);
  const train = rows.slice(0, split);
  const test = rows.slice(split);

  let best = null;
  for (const fast of [5, 8, 10, 12]) {
    for (const slow of [13, 21, 26, 34]) {
      if (fast >= slow) continue;
      for (const rsiBuyMax of [60, 70, 85, 100]) {
        for (const rr of [1.2, 1.5, 2.0]) {
          const p = {
            fast, slow, rsiPeriod: 14, rsiBuyMax,
            rsiSellMin: 60, atrPeriod: 14, atrMult: 1.8,
            minStopPct: 0.006, rr, riskPct: 0.01, fee: 0.001,
            ...baseOverrides,
          };
          const tr = backtest(train, p);
          const score = tr.retPct - Math.max(0, tr.trades - 120) * 0.03;
          if (!best || score > best.score) best = { p, train: tr, score };
        }
      }
    }
  }

  const out = backtest(test, best.p);
  return { params: best.p, train: best.train, test: out };
}

(async () => {
  try {
    const [btc, eurusd] = await Promise.all([fetchBTC(730), fetchEURUSD()]);

    const btcRes = optimize(btc);
    const fxRes = optimize(eurusd, {
      fee: 0.00005,
      minStopPct: 0.001,
      riskPct: 0.005,
      atrMult: 1.2,
    });

    console.log('BTC optimized:', btcRes);
    console.log('EURUSD optimized:', fxRes);
  } catch (e) {
    console.error('Run failed:', e.message);
  }
})();

const axios = require('axios');

async function fetchKlines(symbol = 'EURUSDT', interval = '1h', target = 5000) {
  const out = [];
  let endTime = Date.now();
  while (out.length < target) {
    const limit = Math.min(1000, target - out.length);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&endTime=${endTime}`;
    const res = await axios.get(url, { timeout: 20000 });
    const rows = res.data.map(k => ({
      time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), vol: Number(k[5])
    }));
    if (!rows.length) break;
    out.unshift(...rows);
    endTime = rows[0].time - 1;
    if (rows.length < limit) break;
  }
  // dedupe by time
  const m = new Map();
  out.forEach(r => m.set(r.time, r));
  return [...m.values()].sort((a, b) => a.time - b.time);
}

const ema = (arr, p) => { const k = 2/(p+1); let prev = arr[0]; return arr.map((v,i)=>i? (prev=v*k+prev*(1-k)) : prev); };
const sma = (arr,p) => arr.map((_,i)=> i<p-1?null: arr.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);
function std(arr,i,p){ if(i<p-1) return null; const s=arr.slice(i-p+1,i+1); const m=s.reduce((a,b)=>a+b,0)/p; return Math.sqrt(s.reduce((a,b)=>a+(b-m)*(b-m),0)/p); }
function rsi(values,p=14){ const g=Array(values.length).fill(0),l=Array(values.length).fill(0); for(let i=1;i<values.length;i++){const d=values[i]-values[i-1]; g[i]=Math.max(d,0); l[i]=Math.max(-d,0);} const ag=ema(g,p), al=ema(l,p); return values.map((_,i)=>al[i]===0?100:100-100/(1+ag[i]/al[i])); }
function atr(rows,p=14){ const tr=rows.map((r,i)=>i===0?0:Math.max(r.high-r.low, Math.abs(r.high-rows[i-1].close), Math.abs(r.low-rows[i-1].close))); return ema(tr,p); }

function runStrategy(rows, cfg, type) {
  const c = rows.map(r=>r.close), h=rows.map(r=>r.high), l=rows.map(r=>r.low);
  const fast = ema(c, cfg.fast || 8), slow = ema(c, cfg.slow || 21), mom = rsi(c, cfg.rsi || 14), A = atr(rows, cfg.atr || 14);
  const mid = sma(c, cfg.bb || 20);

  let eq = 10000, peak = 10000, maxDD = 0;
  let pos = 0, units = 0, entry = 0, stop = 0, take = 0;
  let trades = 0, wins = 0;

  for (let i = 50; i < rows.length; i++) {
    const px = c[i];
    const up = fast[i] > slow[i] && fast[i-1] <= slow[i-1];
    const dn = fast[i] < slow[i] && fast[i-1] >= slow[i-1];

    let longSig = false, shortSig = false, exitSig = false;

    if (type === 'trend_ema_rsi') {
      longSig = up && mom[i] < cfg.rsiLong;
      shortSig = dn && mom[i] > cfg.rsiShort;
      exitSig = (pos===1 && dn) || (pos===-1 && up);
    }
    if (type === 'bb_mean_revert') {
      const sd = std(c, i, cfg.bb || 20); if (!sd || mid[i]==null) continue;
      const upper = mid[i] + cfg.bbK * sd, lower = mid[i] - cfg.bbK * sd;
      longSig = px < lower && mom[i] < 45;
      shortSig = px > upper && mom[i] > 55;
      exitSig = (pos===1 && px >= mid[i]) || (pos===-1 && px <= mid[i]);
    }
    if (type === 'donchian_breakout') {
      const w = cfg.dc;
      if (i < w) continue;
      const hh = Math.max(...h.slice(i-w, i));
      const ll = Math.min(...l.slice(i-w, i));
      longSig = px > hh;
      shortSig = px < ll;
      exitSig = false;
    }

    if (pos === 0 && (longSig || shortSig)) {
      pos = longSig ? 1 : -1;
      const stopDist = Math.max((A[i]||0)*cfg.atrMult, px*cfg.minStop);
      const riskCash = eq * cfg.riskPct;
      units = (riskCash / stopDist) * cfg.leverage;
      if (!Number.isFinite(units) || units <= 0) { pos = 0; continue; }
      entry = px;
      stop = pos===1 ? px-stopDist : px+stopDist;
      take = pos===1 ? px+stopDist*cfg.rr : px-stopDist*cfg.rr;
      eq -= units * px * cfg.fee;
      trades++;
    } else if (pos !== 0) {
      const stopHit = pos===1 ? px<=stop : px>=stop;
      const tpHit = pos===1 ? px>=take : px<=take;
      const timeout = (i % cfg.maxBars)===0;
      if (stopHit || tpHit || exitSig || timeout) {
        const pnl = pos===1 ? (px-entry)*units : (entry-px)*units;
        eq += pnl - units*px*cfg.fee;
        if (pnl>0) wins++;
        pos = 0; units = 0;
      }
    }

    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak-eq)/peak);
    if (eq <= 0) return { eq, avgMonthly:-100, maxDD:100, trades, winRate:0 };
  }

  const months = Math.max(1, rows.length/(24*30));
  const avgMonthly = (Math.pow(eq/10000, 1/months)-1)*100;
  return { eq, avgMonthly, maxDD:maxDD*100, trades, winRate: trades? (wins/trades)*100:0 };
}

function wf(rows, cfg, type, folds=5){
  const n=rows.length, chunk=Math.floor(n/(folds+1));
  const out=[];
  for(let i=0;i<folds;i++){
    const s=chunk*(i+1), e=Math.min(n,s+chunk);
    const test=rows.slice(s,e);
    if(test.length<200) continue;
    out.push(runStrategy(test,cfg,type));
  }
  if(!out.length) return null;
  return {
    avgMonthly: out.reduce((a,b)=>a+b.avgMonthly,0)/out.length,
    maxDD: Math.max(...out.map(x=>x.maxDD)),
    trades: out.reduce((a,b)=>a+b.trades,0)/out.length,
    winRate: out.reduce((a,b)=>a+b.winRate,0)/out.length,
  };
}

function score(res){ return res.avgMonthly - 0.25*res.maxDD + 0.01*res.trades; }

async function main(){
  const rows = await fetchKlines('EURUSDT','1h',5000);
  const base = { fee:0.0002, riskPct:0.005, leverage:3, rr:1.5, atrMult:2.0, minStop:0.0008, maxBars:72, fast:8, slow:21, rsi:14, rsiLong:60, rsiShort:40, bb:20, bbK:2, dc:20 };

  let best = null;
  const types = ['trend_ema_rsi','bb_mean_revert','donchian_breakout'];
  for (const type of types) {
    for (const leverage of [2,3,5,8])
    for (const riskPct of [0.003,0.005,0.01])
    for (const rr of [1.2,1.5,2.0])
    for (const atrMult of [1.5,2.0,2.5])
    for (const fast of [5,8,13])
    for (const slow of [21,34,55]) {
      if (fast>=slow) continue;
      const cfg = { ...base, leverage, riskPct, rr, atrMult, fast, slow };
      if (type==='trend_ema_rsi') {
        for (const rsiLong of [55,60,65]) for (const rsiShort of [35,40,45]) {
          const c2={...cfg,rsiLong,rsiShort};
          const res=wf(rows,c2,type,5); if(!res) continue;
          if (res.avgMonthly <= 0 || res.maxDD > 35 || res.trades < 5) continue;
          const sc=score(res);
          if(!best || sc>best.score) best={type,cfg:c2,wf:res,score:sc};
        }
      } else if (type==='bb_mean_revert') {
        for (const bbK of [1.5,2.0,2.5]) {
          const c2={...cfg,bbK};
          const res=wf(rows,c2,type,5); if(!res) continue;
          if (res.avgMonthly <= 0 || res.maxDD > 35 || res.trades < 5) continue;
          const sc=score(res);
          if(!best || sc>best.score) best={type,cfg:c2,wf:res,score:sc};
        }
      } else {
        for (const dc of [10,20,30,40]) {
          const c2={...cfg,dc};
          const res=wf(rows,c2,type,5); if(!res) continue;
          if (res.avgMonthly <= 0 || res.maxDD > 35 || res.trades < 5) continue;
          const sc=score(res);
          if(!best || sc>best.score) best={type,cfg:c2,wf:res,score:sc};
        }
      }
    }
  }

  if(!best){ console.log({message:'No strategy found'}); return; }

  const full = runStrategy(rows,best.cfg,best.type);
  console.log({
    dataPoints: rows.length,
    bestType: best.type,
    bestParams: best.cfg,
    walkForward: best.wf,
    fullHistory: full
  });
}

main().catch(e=>console.error('Run failed:',e.message));

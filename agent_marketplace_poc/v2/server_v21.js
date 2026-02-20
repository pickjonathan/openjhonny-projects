const fs = require('fs');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PORT = Number(process.env.PORT || 8080);
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'marketplace-events.jsonl');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logEvent(evt) { fs.appendFileSync(LOG_FILE, JSON.stringify(evt) + '\n'); }
function uid(prefix) { return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function callOpenAIJSON({ schemaName, schema, system, user, temperature = 0.2 }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } }
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return JSON.parse(j.choices[0].message.content);
}

function monthlyPayment(principal, aprPct, months) {
  const r = (aprPct / 100) / 12;
  if (r <= 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

class Marketplace extends EventEmitter {
  constructor(lenders) {
    super();
    this.requests = new Map();
    this.offers = new Map();
    this.lenders = lenders;
    this.sseClients = new Set();
  }

  emitEvt(type, payload) {
    const evt = { ts: new Date().toISOString(), type, payload };
    this.emit('event', evt);
    logEvent(evt);
    const msg = `event: ${type}\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const res of this.sseClients) res.write(msg);
  }

  registerSSE(res) {
    this.sseClients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    res.on('close', () => this.sseClients.delete(res));
  }

  publishRequest(req) {
    const row = { id: uid('REQ'), createdAt: new Date().toISOString(), status: 'OPEN', ...req };
    this.requests.set(row.id, row);
    this.offers.set(row.id, []);
    this.emitEvt('request.published', row);
    return row;
  }

  submitOffer(requestId, offer) {
    const wrapped = { offerId: uid('OFF'), createdAt: new Date().toISOString(), ...offer };
    this.offers.get(requestId).push(wrapped);
    this.emitEvt('offer.submitted', { requestId, offer: wrapped });
    return wrapped;
  }

  rejectOffer(requestId, companyId, reason, proposal) {
    this.emitEvt('offer.rejected', { requestId, companyId, reason, proposal });
  }

  closeRequest(requestId, result) {
    const req = this.requests.get(requestId);
    if (!req) return;
    req.status = 'CLOSED';
    req.closedAt = new Date().toISOString();
    this.requests.set(requestId, req);
    this.emitEvt('request.closed', { requestId, result });
  }

  getRequest(id) { return this.requests.get(id); }
  getOffers(id) { return this.offers.get(id) || []; }
  listRequests() { return [...this.requests.values()]; }
}

function validateOffer(policy, request, p) {
  const errs = [];
  if (p.decision !== 'OFFER') errs.push('decision not OFFER');
  if (p.approvedAmount < policy.minAmount || p.approvedAmount > policy.maxAmount) errs.push('amount out of policy');
  if (p.approvedAmount > request.amount) errs.push('amount > request');
  if (p.termMonths < policy.minTerm || p.termMonths > policy.maxTerm) errs.push('term out of policy');
  if (p.aprPct < policy.minAprPct || p.aprPct > policy.maxAprPct) errs.push('APR out of lender bounds');
  if (p.aprPct < request.minAprPct || p.aprPct > request.maxAprPct) errs.push('APR out of customer bounds');
  return { ok: errs.length === 0, errs };
}

class LenderAgent {
  constructor(policy) { this.policy = policy; }
  async quote(request, market) {
    if (request.creditScore < this.policy.minCreditScore) {
      market.emitEvt('lender.declined', { requestId: request.id, companyId: this.policy.companyId, reason: 'credit score below minimum' });
      return;
    }
    const schema = {
      type: 'object', additionalProperties: false,
      properties: {
        decision: { type: 'string', enum: ['OFFER', 'DECLINE'] },
        aprPct: { type: 'number' }, approvedAmount: { type: 'number' }, termMonths: { type: 'integer' }, rationale: { type: 'string' }
      },
      required: ['decision', 'aprPct', 'approvedAmount', 'termMonths', 'rationale']
    };
    const proposal = await callOpenAIJSON({
      schemaName: `lender_${this.policy.companyId}`,
      schema,
      system: `You are ${this.policy.companyName} lending AI. Follow policy strictly; if uncertain return DECLINE.`,
      user: JSON.stringify({ policy: this.policy, request }, null, 2),
      temperature: 0.1
    });
    const v = validateOffer(this.policy, request, proposal);
    if (!v.ok) {
      market.rejectOffer(request.id, this.policy.companyId, v.errs.join('; '), proposal);
      return;
    }
    market.submitOffer(request.id, {
      companyId: this.policy.companyId,
      companyName: this.policy.companyName,
      aprPct: Number(proposal.aprPct.toFixed(2)),
      approvedAmount: proposal.approvedAmount,
      termMonths: proposal.termMonths,
      estimatedMonthlyPayment: Number(monthlyPayment(proposal.approvedAmount, proposal.aprPct, proposal.termMonths).toFixed(2)),
      rationale: proposal.rationale
    });
  }
}

class CustomerAgent {
  async select(request, offers) {
    const schema = {
      type: 'object', additionalProperties: false,
      properties: { selectedOfferId: { type: 'string' }, explanation: { type: 'string' } },
      required: ['selectedOfferId', 'explanation']
    };
    return callOpenAIJSON({
      schemaName: 'customer_pick',
      schema,
      system: 'You are a customer finance advisor. Pick best customer offer by APR and payment burden.',
      user: JSON.stringify({ request, offers }, null, 2),
      temperature: 0.1
    });
  }
}

function loadLenders() {
  const file = path.join(__dirname, 'policies', 'lenders.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (json.lenders || []).map(p => new LenderAgent(p));
}

const market = new Marketplace(loadLenders());
const customerAgent = new CustomerAgent();

async function runAuction(reqObj) {
  const request = market.publishRequest(reqObj);
  for (const lender of market.lenders) {
    try { await lender.quote(request, market); }
    catch (e) { market.emitEvt('lender.error', { requestId: request.id, companyId: lender.policy.companyId, error: e.message }); }
  }
  const offers = market.getOffers(request.id);
  if (!offers.length) {
    market.closeRequest(request.id, { selectedOfferId: null, reason: 'no compliant offers' });
    return { request, offers, decision: null };
  }
  const decision = await customerAgent.select(request, offers);
  const winner = offers.find(o => o.offerId === decision.selectedOfferId) || offers.sort((a,b)=>a.aprPct-b.aprPct)[0];
  market.emitEvt('customer.selected', { requestId: request.id, decision, winner });
  market.closeRequest(request.id, { selectedOfferId: winner.offerId });
  return { request, offers, decision, winner };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      market.registerSSE(res);
      return;
    }

    if (req.method === 'GET' && req.url === '/requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(market.listRequests()));
    }

    if (req.method === 'POST' && req.url === '/requests') {
      const body = await parseBody(req);
      const result = await runAuction(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result, null, 2));
    }

    if (req.method === 'GET' && req.url.startsWith('/offers/')) {
      const id = req.url.split('/').pop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(market.getOffers(id), null, 2));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Marketplace v2.1 listening on :${PORT}`);
  console.log('POST /requests -> run auction');
  console.log('GET /events -> live SSE feed');
  console.log('GET /requests, GET /offers/:requestId');
});

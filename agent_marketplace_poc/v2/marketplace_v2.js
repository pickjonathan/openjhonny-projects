const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'marketplace-events.jsonl');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function appendEvent(event) {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n');
}

function monthlyPayment(principal, aprPct, months) {
  const r = (aprPct / 100) / 12;
  if (r <= 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

async function callOpenAIJSON({ schemaName, schema, system, user, temperature = 0.2 }) {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema
      }
    }
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 400)}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

class Marketplace extends EventEmitter {
  constructor() {
    super();
    this.requests = new Map();
    this.offers = new Map();
  }

  emitEvent(type, payload) {
    const evt = {
      ts: new Date().toISOString(),
      type,
      payload
    };
    this.emit('event', evt);
    appendEvent(evt);
  }

  publishRequest(req) {
    const id = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const row = { id, status: 'OPEN', createdAt: new Date().toISOString(), ...req };
    this.requests.set(id, row);
    this.offers.set(id, []);
    this.emitEvent('request.published', row);
    return row;
  }

  submitOffer(requestId, offer) {
    if (!this.requests.has(requestId)) throw new Error('Request not found');
    const req = this.requests.get(requestId);
    if (req.status !== 'OPEN') return null;

    const wrapped = {
      offerId: `OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...offer
    };
    this.offers.get(requestId).push(wrapped);
    this.emitEvent('offer.submitted', { requestId, offer: wrapped });
    return wrapped;
  }

  rejectOffer(requestId, companyId, reason, rawProposal) {
    this.emitEvent('offer.rejected', { requestId, companyId, reason, rawProposal });
  }

  closeRequest(requestId, result) {
    const req = this.requests.get(requestId);
    if (!req) return;
    req.status = 'CLOSED';
    req.closedAt = new Date().toISOString();
    this.requests.set(requestId, req);
    this.emitEvent('request.closed', { requestId, result });
  }

  getOffers(requestId) {
    return this.offers.get(requestId) || [];
  }
}

function validateOfferGuardrails(policy, request, proposal) {
  const errors = [];

  if (proposal.decision !== 'OFFER') {
    return { ok: false, errors: ['decision=DECLINE'] };
  }

  if (proposal.approvedAmount < policy.minAmount || proposal.approvedAmount > policy.maxAmount) {
    errors.push('approvedAmount outside lender policy');
  }
  if (proposal.approvedAmount > request.amount) {
    errors.push('approvedAmount exceeds requested amount');
  }
  if (proposal.termMonths < policy.minTerm || proposal.termMonths > policy.maxTerm) {
    errors.push('termMonths outside lender policy');
  }
  if (proposal.aprPct < policy.minAprPct || proposal.aprPct > policy.maxAprPct) {
    errors.push('aprPct outside lender policy');
  }
  if (proposal.aprPct < request.minAprPct || proposal.aprPct > request.maxAprPct) {
    errors.push('aprPct outside customer constraints');
  }

  return { ok: errors.length === 0, errors };
}

class FinancialCompanyAgent {
  constructor(policy) {
    this.policy = policy;
  }

  async respond(request, market) {
    if (request.creditScore < this.policy.minCreditScore) {
      market.emitEvent('lender.declined', {
        requestId: request.id,
        companyId: this.policy.companyId,
        reason: 'credit score below threshold'
      });
      return;
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        decision: { type: 'string', enum: ['OFFER', 'DECLINE'] },
        aprPct: { type: 'number' },
        approvedAmount: { type: 'number' },
        termMonths: { type: 'integer' },
        rationale: { type: 'string' }
      },
      required: ['decision', 'aprPct', 'approvedAmount', 'termMonths', 'rationale']
    };

    const system = [
      `You are lending agent for ${this.policy.companyName}.`,
      'You must follow policy exactly and remain conservative.',
      'If any mismatch, return DECLINE.'
    ].join(' ');

    const user = JSON.stringify({ policy: this.policy, request }, null, 2);
    const proposal = await callOpenAIJSON({
      schemaName: `loan_offer_${this.policy.companyId}`,
      schema,
      system,
      user,
      temperature: 0.1
    });

    const guard = validateOfferGuardrails(this.policy, request, proposal);
    if (!guard.ok) {
      market.rejectOffer(request.id, this.policy.companyId, guard.errors.join('; '), proposal);
      return;
    }

    const offer = {
      companyId: this.policy.companyId,
      companyName: this.policy.companyName,
      aprPct: Number(proposal.aprPct.toFixed(2)),
      approvedAmount: proposal.approvedAmount,
      termMonths: proposal.termMonths,
      estimatedMonthlyPayment: Number(monthlyPayment(proposal.approvedAmount, proposal.aprPct, proposal.termMonths).toFixed(2)),
      rationale: proposal.rationale
    };

    market.submitOffer(request.id, offer);
  }
}

class CustomerAgent {
  async pickOffer(request, offers) {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        selectedOfferId: { type: 'string' },
        explanation: { type: 'string' }
      },
      required: ['selectedOfferId', 'explanation']
    };

    const system = 'You are a customer-side negotiation agent. Pick best offer for customer financial benefit and explain briefly.';
    const user = JSON.stringify({ request, offers }, null, 2);

    return callOpenAIJSON({
      schemaName: 'offer_selection',
      schema,
      system,
      user,
      temperature: 0.1
    });
  }
}

function loadLenderPolicies() {
  const file = path.join(__dirname, 'policies', 'lenders.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return json.lenders || [];
}

function printEvent(evt) {
  const p = evt.payload;
  if (evt.type === 'request.published') {
    console.log(`\n📢 [${evt.ts}] Request ${p.id} published by ${p.customerName}: $${p.amount}, ${p.termMonths}m, score ${p.creditScore}, APR ${p.minAprPct}-${p.maxAprPct}%`);
  } else if (evt.type === 'offer.submitted') {
    const o = p.offer;
    console.log(`✅ [${evt.ts}] Offer ${o.offerId} from ${o.companyName}: APR ${o.aprPct}% | $${o.estimatedMonthlyPayment}/mo`);
  } else if (evt.type === 'offer.rejected') {
    console.log(`⛔ [${evt.ts}] Offer rejected for ${p.companyId}: ${p.reason}`);
  } else if (evt.type === 'lender.declined') {
    console.log(`ℹ️ [${evt.ts}] Lender ${p.companyId} declined: ${p.reason}`);
  } else if (evt.type === 'request.closed') {
    console.log(`🏁 [${evt.ts}] Request ${p.requestId} closed.`);
  }
}

async function runPOC() {
  const market = new Marketplace();
  market.on('event', printEvent);

  const lenderPolicies = loadLenderPolicies();
  const lenders = lenderPolicies.map(p => new FinancialCompanyAgent(p));
  const customerAgent = new CustomerAgent();

  const req = market.publishRequest({
    type: 'LOAN_REQUEST',
    customerId: 'CUS-1001',
    customerName: 'Jonathan',
    amount: 25000,
    termMonths: 48,
    creditScore: 710,
    minAprPct: 4.0,
    maxAprPct: 12.0,
    purpose: 'Home renovation'
  });

  for (const lender of lenders) {
    try {
      await lender.respond(req, market);
    } catch (e) {
      market.emitEvent('lender.error', {
        requestId: req.id,
        companyId: lender.policy.companyId,
        error: e.message
      });
      console.log(`❌ Lender ${lender.policy.companyId} error: ${e.message}`);
    }
  }

  const offers = market.getOffers(req.id);
  if (!offers.length) {
    console.log('\nNo compliant offers available.');
    market.closeRequest(req.id, { selectedOfferId: null, reason: 'no compliant offers' });
    return;
  }

  const decision = await customerAgent.pickOffer(req, offers);
  const winner = offers.find(o => o.offerId === decision.selectedOfferId) || offers.sort((a,b)=>a.aprPct-b.aprPct)[0];

  market.emitEvent('customer.selected', {
    requestId: req.id,
    decision,
    winner
  });

  console.log(`\n🧠 Customer decision: ${decision.explanation}`);
  console.log(`🏆 Winner: ${winner.companyName} | APR ${winner.aprPct}% | Payment ~$${winner.estimatedMonthlyPayment}/mo`);

  market.closeRequest(req.id, { selectedOfferId: winner.offerId });

  console.log(`\n📁 Full event log written to: ${LOG_FILE}`);
}

runPOC().catch(err => {
  console.error('POC v2 failed:', err.message);
  process.exit(1);
});

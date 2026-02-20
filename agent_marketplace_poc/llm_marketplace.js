/*
  LLM Agent Marketplace POC
  - Real LLM-based lender agents (OpenAI API)
  - Deterministic guardrails (policy + post-validation)
  - Customer agent ranks compliant offers
*/

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in environment.');
  process.exit(1);
}

class Marketplace {
  constructor() {
    this.requests = new Map();
    this.offers = new Map();
  }

  publishRequest(request) {
    const id = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const row = { id, createdAt: new Date().toISOString(), status: 'OPEN', ...request };
    this.requests.set(id, row);
    this.offers.set(id, []);
    return row;
  }

  submitOffer(requestId, offer) {
    if (!this.requests.has(requestId)) throw new Error('Unknown requestId');
    if (this.requests.get(requestId).status !== 'OPEN') return null;
    const wrapped = {
      offerId: `OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...offer,
    };
    this.offers.get(requestId).push(wrapped);
    return wrapped;
  }

  closeRequest(requestId) {
    const req = this.requests.get(requestId);
    if (!req) return;
    req.status = 'CLOSED';
    this.requests.set(requestId, req);
  }

  getOffers(requestId) {
    return this.offers.get(requestId) || [];
  }
}

async function callOpenAIJSON(system, user, schemaName) {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema: {
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
        }
      }
    }
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  return JSON.parse(text);
}

function monthlyPayment(principal, aprPct, months) {
  const r = (aprPct / 100) / 12;
  if (r <= 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function validateOfferGuardrails(policy, request, proposal) {
  const errors = [];

  if (proposal.decision !== 'OFFER') return { ok: false, errors: ['Decision is DECLINE'] };

  if (proposal.approvedAmount < policy.minAmount || proposal.approvedAmount > policy.maxAmount) {
    errors.push('approvedAmount outside company policy');
  }
  if (proposal.approvedAmount > request.amount) {
    errors.push('approvedAmount exceeds requested amount');
  }

  if (proposal.termMonths < policy.minTerm || proposal.termMonths > policy.maxTerm) {
    errors.push('termMonths outside company policy');
  }

  if (proposal.aprPct < policy.minAprPct || proposal.aprPct > policy.maxAprPct) {
    errors.push('aprPct outside company policy');
  }

  if (proposal.aprPct < request.minAprPct || proposal.aprPct > request.maxAprPct) {
    errors.push('aprPct outside customer request bounds');
  }

  return { ok: errors.length === 0, errors };
}

class FinancialCompanyAgent {
  constructor(policy) {
    this.policy = policy;
  }

  async makeProposal(request) {
    if (request.creditScore < this.policy.minCreditScore) {
      return { decision: 'DECLINE', rationale: 'Credit score below policy threshold' };
    }

    const system = `You are a lending decision agent for ${this.policy.companyName}. Follow policy exactly. Never exceed policy bounds.`;
    const user = JSON.stringify({ policy: this.policy, request }, null, 2);

    const proposal = await callOpenAIJSON(system, user, `loan_offer_${this.policy.companyId}`);

    const check = validateOfferGuardrails(this.policy, request, proposal);
    if (!check.ok) {
      return {
        decision: 'DECLINE',
        rationale: `Guardrail rejection: ${check.errors.join('; ')}`
      };
    }

    return {
      decision: 'OFFER',
      companyId: this.policy.companyId,
      companyName: this.policy.companyName,
      aprPct: proposal.aprPct,
      approvedAmount: proposal.approvedAmount,
      termMonths: proposal.termMonths,
      estimatedMonthlyPayment: Number(monthlyPayment(proposal.approvedAmount, proposal.aprPct, proposal.termMonths).toFixed(2)),
      rationale: proposal.rationale
    };
  }
}

class CustomerAgent {
  async pickBestOffer(request, offers) {
    if (!offers.length) return null;

    const system = 'You are a customer-side decision agent. Choose the best offer for customer benefit (low APR, feasible payment, acceptable term). Return JSON.';
    const user = JSON.stringify({ request, offers }, null, 2);

    const body = {
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'offer_selection',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              selectedOfferId: { type: 'string' },
              explanation: { type: 'string' }
            },
            required: ['selectedOfferId', 'explanation']
          }
        }
      }
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Customer agent failed: ${res.status}`);
    const data = await res.json();
    const picked = JSON.parse(data.choices[0].message.content);
    return picked;
  }
}

async function main() {
  const marketplace = new Marketplace();

  const lenders = [
    new FinancialCompanyAgent({
      companyId: 'BANK_A', companyName: 'Bank Alpha',
      minAmount: 5000, maxAmount: 60000,
      minTerm: 12, maxTerm: 84,
      minAprPct: 5.0, maxAprPct: 13.0,
      minCreditScore: 640
    }),
    new FinancialCompanyAgent({
      companyId: 'BANK_B', companyName: 'Bank Beta',
      minAmount: 10000, maxAmount: 120000,
      minTerm: 24, maxTerm: 96,
      minAprPct: 4.5, maxAprPct: 11.5,
      minCreditScore: 680
    }),
    new FinancialCompanyAgent({
      companyId: 'FINTECH_C', companyName: 'Fintech Capital',
      minAmount: 3000, maxAmount: 40000,
      minTerm: 6, maxTerm: 48,
      minAprPct: 7.0, maxAprPct: 18.0,
      minCreditScore: 600
    })
  ];

  const request = marketplace.publishRequest({
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

  console.log(`Request ${request.id} published for ${request.customerName}`);

  for (const lender of lenders) {
    const p = await lender.makeProposal(request);
    if (p.decision === 'OFFER') {
      const offer = marketplace.submitOffer(request.id, p);
      console.log(`Offer: ${offer.companyName} APR ${offer.aprPct}% | $${offer.estimatedMonthlyPayment}/mo`);
    } else {
      console.log(`Decline: ${lender.policy.companyName} -> ${p.rationale}`);
    }
  }

  const offers = marketplace.getOffers(request.id);
  console.log(`\nCompliant offers: ${offers.length}`);

  if (!offers.length) {
    marketplace.closeRequest(request.id);
    console.log('No valid offers after guardrails.');
    return;
  }

  const customerAgent = new CustomerAgent();
  const decision = await customerAgent.pickBestOffer(request, offers);
  const selected = offers.find(o => o.offerId === decision.selectedOfferId);

  console.log('\nCustomer agent selection:');
  console.log(decision);
  console.log('\nWinner:');
  console.log(selected);

  marketplace.closeRequest(request.id);
}

main().catch(err => {
  console.error('LLM marketplace POC failed:', err.message);
  process.exit(1);
});

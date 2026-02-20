const { EventEmitter } = require('events');

class Marketplace extends EventEmitter {
  constructor() {
    super();
    this.requests = new Map();
    this.offers = new Map();
  }

  publishRequest(request) {
    const id = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const enriched = { id, status: 'OPEN', createdAt: new Date().toISOString(), ...request };
    this.requests.set(id, enriched);
    this.offers.set(id, []);
    this.emit('request:published', enriched);
    return enriched;
  }

  submitOffer(requestId, offer) {
    if (!this.requests.has(requestId)) throw new Error('Request not found');
    if (this.requests.get(requestId).status !== 'OPEN') return null;

    const enriched = {
      offerId: `OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...offer,
    };

    const list = this.offers.get(requestId) || [];
    list.push(enriched);
    this.offers.set(requestId, list);
    this.emit('offer:submitted', requestId, enriched);
    return enriched;
  }

  getOffers(requestId) {
    return (this.offers.get(requestId) || []).slice();
  }

  closeRequest(requestId) {
    if (!this.requests.has(requestId)) throw new Error('Request not found');
    const req = this.requests.get(requestId);
    req.status = 'CLOSED';
    this.requests.set(requestId, req);
    this.emit('request:closed', req);
  }
}

class FinancialCompanyAgent {
  constructor(config) {
    this.config = config;
  }

  subscribe(marketplace) {
    marketplace.on('request:published', (request) => {
      const offer = this.tryCreateOffer(request);
      if (offer) marketplace.submitOffer(request.id, offer);
    });
  }

  tryCreateOffer(request) {
    const c = this.config;

    const amountOk = request.amount >= c.minAmount && request.amount <= c.maxAmount;
    const termOk = request.termMonths >= c.minTerm && request.termMonths <= c.maxTerm;
    const scoreOk = request.creditScore >= c.minCreditScore;

    if (!amountOk || !termOk || !scoreOk) return null;

    const riskAdjustment = Math.max(0, (760 - request.creditScore) * c.riskSlopeBps / 10000);
    const baseRate = c.baseRate + riskAdjustment;

    if (baseRate < request.maxInterestRate && baseRate >= request.minInterestRate) {
      const monthlyRate = baseRate / 12;
      const payment = (request.amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -request.termMonths));

      return {
        companyId: c.companyId,
        companyName: c.companyName,
        apr: Number((baseRate * 100).toFixed(2)),
        approvedAmount: request.amount,
        termMonths: request.termMonths,
        estimatedMonthlyPayment: Number(payment.toFixed(2)),
        notes: c.notes,
      };
    }

    return null;
  }
}

class CustomerAgent {
  constructor({ customerId, customerName }) {
    this.customerId = customerId;
    this.customerName = customerName;
  }

  requestLoan(marketplace, criteria) {
    return marketplace.publishRequest({
      type: 'LOAN_REQUEST',
      customerId: this.customerId,
      customerName: this.customerName,
      ...criteria,
    });
  }

  chooseBestOffer(offers) {
    if (!offers.length) return null;
    return offers.sort((a, b) => a.apr - b.apr)[0];
  }
}

function buildCompanyAgents() {
  return [
    new FinancialCompanyAgent({
      companyId: 'BANK_A',
      companyName: 'Bank Alpha',
      minAmount: 5000,
      maxAmount: 60000,
      minTerm: 12,
      maxTerm: 84,
      minCreditScore: 640,
      baseRate: 0.062,
      riskSlopeBps: 6,
      notes: 'Fast approval, flexible prepayment',
    }),
    new FinancialCompanyAgent({
      companyId: 'BANK_B',
      companyName: 'Bank Beta',
      minAmount: 10000,
      maxAmount: 120000,
      minTerm: 24,
      maxTerm: 96,
      minCreditScore: 680,
      baseRate: 0.054,
      riskSlopeBps: 4,
      notes: 'Best rates for strong credit',
    }),
    new FinancialCompanyAgent({
      companyId: 'FINTECH_C',
      companyName: 'Fintech Capital',
      minAmount: 3000,
      maxAmount: 40000,
      minTerm: 6,
      maxTerm: 48,
      minCreditScore: 600,
      baseRate: 0.075,
      riskSlopeBps: 8,
      notes: 'Accepts lower credit profiles',
    }),
  ];
}

async function runDemo() {
  const marketplace = new Marketplace();
  const lenderAgents = buildCompanyAgents();
  lenderAgents.forEach((a) => a.subscribe(marketplace));

  marketplace.on('request:published', (r) => {
    console.log(`\n📢 Request published: ${r.id} by ${r.customerName}`);
    console.log(`   Amount: $${r.amount}, Term: ${r.termMonths} months, CreditScore: ${r.creditScore}`);
    console.log(`   Acceptable APR range: ${r.minInterestRate * 100}% - ${r.maxInterestRate * 100}%`);
  });

  marketplace.on('offer:submitted', (requestId, offer) => {
    console.log(`✅ Offer on ${requestId} from ${offer.companyName}: APR ${offer.apr}%`);
  });

  const customer = new CustomerAgent({ customerId: 'CUS-1001', customerName: 'Jonathan' });

  const request = customer.requestLoan(marketplace, {
    amount: 25000,
    termMonths: 48,
    creditScore: 710,
    minInterestRate: 0.04,
    maxInterestRate: 0.12,
    purpose: 'Home renovation',
  });

  // In a real system this would be async over time; for POC we collect after short delay
  await new Promise((r) => setTimeout(r, 250));

  const offers = marketplace.getOffers(request.id);
  console.log(`\n📬 Total offers received: ${offers.length}`);
  offers.forEach((o, idx) => {
    console.log(`${idx + 1}. ${o.companyName} | APR ${o.apr}% | Monthly ~$${o.estimatedMonthlyPayment}`);
  });

  const winner = customer.chooseBestOffer(offers);
  if (winner) {
    console.log(`\n🏆 Selected offer: ${winner.companyName} at ${winner.apr}% APR`);
  } else {
    console.log('\n⚠️ No offers matched customer criteria.');
  }

  marketplace.closeRequest(request.id);
}

runDemo().catch((e) => {
  console.error('POC failed:', e.message);
  process.exit(1);
});

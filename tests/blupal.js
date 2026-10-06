'use strict';
/* BluPal (بلوپال · blupal.top) gateway tests — the documented invoice contract, the settlement
 * rules, the server handlers, the storefront wiring and the environment templates.
 * Every network call is stubbed; nothing leaves this machine and no real key is used. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BluPal = require('../lib/blupal.js');

/* The handlers log verification problems on purpose; these expected warnings are filtered out of
 * the test output so a real defect still shows up. */
const logError = console.error.bind(console);
console.error = (...args) => { if (/^BluPal (status check|callback)/.test(String(args[0] || ''))) return; logError(...args); };

const ROOT = path.join(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '202610050001_blupal_provider.sql');

const apiKey = 'blu_test_' + crypto.randomBytes(16).toString('hex');
const liveKey = 'blu_live_' + crypto.randomBytes(16).toString('hex');
const stateSecret = crypto.randomBytes(32).toString('hex');
const env = {
  BLUPAL_MODE: 'sandbox',
  BLUPAL_API_KEY: apiKey,
  BLUPAL_STATE_SECRET: stateSecret,
  BLUPAL_API_BASE: 'https://blupal.top/api'
};
const fixedNow = Date.UTC(2026, 9, 5, 9, 30, 0);
const orderId = '20000000-0000-4000-8000-000000000002';
const paymentId = '30000000-0000-4000-8000-000000000003';
const userId = '10000000-0000-4000-8000-000000000001';
const amountToman = 125000;
const amountRial = amountToman * 10;
const invoiceId = '123';                       // مستندات: شناسهٔ فاکتور کوتاه و عددی است
const longInvoiceId = '9876543210';
const paymentUrl = 'https://blupal.top/sandbox/payment/tok_abc123';
const destinationCard = '6219861012345678';
const transactionId = '456';
const req = { method: 'POST', headers: { origin: 'https://shop.example.test', host: 'shop.example.test' } };
const authHeaders = { ...req.headers, authorization: 'Bearer test-access-token-1234567890' };
const dbConfig = {
  baseUrl: 'https://commerce-test.supabase.co',
  publicKey: 'publishable-test-key',
  serviceRoleKey: 'service-role-test-key',
  configured: true,
  serviceConfigured: true
};

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key] = value; },
    end(body = '') { this.body = body; }
  };
}

function parseBody(res) { return JSON.parse(res.body || '{}'); }

function invoicePayload(overrides = {}) {
  return {
    success: true,
    invoice_id: invoiceId,
    amount: amountRial,
    final_amount: amountRial + 123,
    status: 'PENDING',
    payment_link: paymentUrl,
    card_number: destinationCard,
    mode: 'sandbox',
    expires_at: null,
    ...overrides
  };
}

function statusPayload(overrides = {}) {
  return {
    success: true,
    invoice_id: invoiceId,
    status: 'PAID',
    transaction_id: transactionId,
    amount: amountRial,
    final_amount: amountRial + 123,
    mode: 'sandbox',
    expires_at: null,
    payer_name: ' مهمان مهمان',
    payer_card: '6219861999888777',
    payer_bank_name: 'ملت',
    ...overrides
  };
}

function webhookPayload(overrides = {}) {
  return {
    success: true,
    event: 'payment.completed',
    invoice_id: invoiceId,
    status: 'PAID',
    amount: amountRial,
    final_amount: amountRial + 123,
    mode: 'sandbox',
    payer_name: 'مهمان مهمان',
    payer_card: '6219861999888777',
    payer_bank_name: 'ملت',
    ...overrides
  };
}

function paymentRow(overrides = {}) {
  return {
    id: paymentId,
    order_id: orderId,
    status: 'pending',
    amount_toman: amountToman,
    authority: invoiceId,
    provider: 'blupal',
    provider_reference: null,
    provider_code: 'PENDING',
    callback_payload: {
      provider: 'blupal',
      invoiceId,
      paymentUrl,
      cardNumber: destinationCard,
      amountRial,
      finalAmountRial: amountRial + 123,
      status: 'PENDING',
      attempts: []
    },
    created_at: new Date(fixedNow - 60000).toISOString(),
    updated_at: new Date(fixedNow - 60000).toISOString(),
    ...overrides
  };
}

function orderRow(overrides = {}) {
  return {
    id: orderId,
    user_id: userId,
    status: 'pending_payment',
    total_toman: amountToman,
    number: 'TB-20261005-ABC12345',
    ...overrides
  };
}

/* Mock of both worlds: the BluPal REST API and the Supabase REST/RPC surface. */
function makeFetch(state, gateway = {}) {
  return async (url, options = {}) => {
    const target = String(url);
    state.urls.push(target);
    if (target.includes('/v1/invoices/create')) {
      const body = JSON.parse(options.body || '{}');
      state_creates(state, body, options);
      const handler = gateway.create || (() => response(invoicePayload({ amount: body.amount, final_amount: body.amount + 123 })));
      return handler(body, state);
    }
    if (target.includes('/v1/sandbox/invoices/')) {
      const asked = decodeURIComponent(target.split('/invoices/')[1].split('/simulate')[0]);
      const body = JSON.parse(options.body || '{}');
      state.simulations.push({ asked, body, headers: options.headers || {}, method: options.method });
      const handler = gateway.simulate || (() => response({ success: true, status: 'PAID', invoice_id: asked, transaction_id: transactionId }));
      return handler(body, state);
    }
    if (/\/v1\/invoices\/[^/]+$/.test(target)) {
      const asked = decodeURIComponent(target.split('/invoices/')[1].split('?')[0]);
      state.statuses.push({ asked, headers: options.headers || {}, method: options.method, hasBody: options.body !== undefined });
      const handler = gateway.status || (() => response(statusPayload({ invoice_id: asked })));
      return handler(asked, state);
    }
    if (target.includes('/rest/v1/rpc/')) {
      state.rpc.push({ name: target.split('/rpc/')[1].split('?')[0], body: JSON.parse(options.body || '{}') });
      return response(state.rpcResponse ?? { success: true });
    }
    if (target.includes('/rest/v1/payments')) {
      const query = new URL(target).searchParams;
      assert.equal(query.get('provider'), 'eq.blupal', 'payment rows must always be scoped to the blupal provider');
      if (state.payments && state.payments.length && String(query.get('authority') || '').startsWith('eq.')) {
        const wanted = query.get('authority').slice(3);
        const payment = state.payments.find(row => String(row.authority) === wanted);
        return response(payment ? [{ ...payment, orders: [state.order || orderRow()] }] : []);
      }
      return response(state.payments || []);
    }
    if (target.includes('/rest/v1/orders')) return response(state.order ? [state.order] : [orderRow()]);
    if (target.includes('/auth/v1/user')) return response({ id: userId });
    if (target.includes('/rest/v1/profiles')) return response([{ id: userId, role: 'customer', is_active: true }]);
    throw new Error(`Unexpected mocked fetch: ${target}`);
  };
}

function state_creates(state, body, options) {
  state.creates.push({ body, headers: options.headers || {}, method: options.method });
}

function newState(extra = {}) {
  return { urls: [], creates: [], statuses: [], simulations: [], rpc: [], ...extra };
}

const results = [];
function section(name) { results.push(name); }

/* Handlers read process.env, so every handler test runs with a complete but fake
 * environment (BluPal keys + Supabase URLs) and an injected fetch. */
function withEnv(extra, run) {
  const base = {
    BLUPAL_MODE: 'sandbox',
    BLUPAL_API_KEY: apiKey,
    BLUPAL_STATE_SECRET: stateSecret,
    BLUPAL_API_BASE: 'https://blupal.top/api',
    SUPABASE_URL: dbConfig.baseUrl,
    SUPABASE_PUBLISHABLE_KEY: dbConfig.publicKey,
    SUPABASE_SERVICE_ROLE_KEY: dbConfig.serviceRoleKey
  };
  const names = [...new Set([...Object.keys(base), ...Object.keys(extra)])];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, base, extra);
  const restore = () => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  };
  try { return Promise.resolve(run()).then(value => { restore(); return value; }, error => { restore(); throw error; }); }
  catch (error) { restore(); throw error; }
}

async function runHandler(handler, { state, request, env: extraEnv = {}, gateway: inlineGateway = {} }, gateway = {}) {
  const stubs = { ...inlineGateway, ...gateway };
  return withEnv(extraEnv, async () => {
    const original = globalThis.fetch;
    const mocked = makeFetch(state, stubs);
    globalThis.fetch = (url, options = {}) => mocked(url, options);
    try {
      const res = makeRes();
      await handler(request, res);
      return { res, body: parseBody(res), state };
    } finally {
      globalThis.fetch = original;
    }
  });
}

(async () => {
  /* 1) configuration: key shape, mode matching, the live-money lock */
  const config = BluPal.getConfig(env);
  assert.equal(config.configured, true);
  assert.equal(config.sandbox, true);
  assert.equal(config.keyKind, 'test');
  assert.equal(config.payHosts.join(','), 'blupal.top', 'the payment page host is derived from the API host');
  assert.equal(config.minAmountRial, 100000, 'documented invoice minimum');
  assert.equal(config.maxAmountRial, 500000000, 'documented invoice maximum');
  assert.equal(config.livePaymentsAllowed, true, 'sandbox is always allowed to create test invoices');
  assert.equal(BluPal.productionGateError(config), null);
  for (const key of ['merchantId', 'webhookSecret', 'requireWebhookSignature']) {
    assert.equal(config[key], undefined, `${key} belongs to a gateway we do not use`);
  }
  assert.equal(BluPal.getConfig({ ...env, BLUPAL_API_KEY: 'sk_test_abcdefgh1234' }).validApiKey, false, 'the old vendor key shape must not be accepted');
  assert.equal(BluPal.getConfig({ ...env, BLUPAL_API_KEY: 'blu_test_short' }).validApiKey, false);
  assert.match(BluPal.configurationError(BluPal.getConfig({ ...env, BLUPAL_API_KEY: '' })).message, /blu_test_.*blu_live_/s);
  assert.match(BluPal.configurationError(BluPal.getConfig({ ...env, BLUPAL_MODE: 'production' })).message, /هم‌خوانی ندارد/);
  assert.match(BluPal.configurationError({ ...config, validStateSecret: false }).message, /BLUPAL_STATE_SECRET/);
  assert.match(BluPal.configurationError({ ...config, validCardNumber: false }).message, /BLUPAL_CARD_NUMBER/);
  const production = BluPal.getConfig({ ...env, BLUPAL_MODE: 'production', BLUPAL_API_KEY: liveKey });
  assert.equal(production.validApiKey, true);
  assert.equal(production.livePaymentsAllowed, false, 'real money stays locked until the enable flag is set');
  assert.match(BluPal.productionGateError(production).message, /BLUPAL_ENABLE_LIVE_PAYMENTS/);
  assert.equal(BluPal.productionGateError({ ...production, livePaymentsRequested: true, livePaymentsAllowed: true }), null);
  assert.match(BluPal.getConfig({ ...env, BLUPAL_CARD_NUMBER: '6219861' }).validCardNumber ? 'x' : 'invalid', /invalid/, 'short card numbers are rejected');
  section('config and production gates');

  /* 2) POST /v1/invoices/create contract: integer RIAL, optional card, header-only key */
  const state = newState();
  const created = await BluPal.createInvoice({ config, amountToman, fetchImpl: makeFetch(state) });
  assert.equal(state.creates.length, 1);
  assert.deepEqual(state.creates[0].body, { amount: amountRial }, 'only the documented fields are sent (amount in rial)');
  assert.equal(state.creates[0].method, 'POST');
  assert.equal(state.creates[0].headers['X-API-Key'], apiKey);
  assert.equal(state.creates[0].headers.Authorization, undefined, 'the key must never travel as a bearer token');
  assert.equal(state.creates[0].body.merchant_id, undefined, 'no merchant id exists in this gateway');
  assert.equal(state.creates[0].body.callback_url, undefined, 'the return page is configured in the panel, not per invoice');
  assert.equal(created.invoiceId, invoiceId);
  assert.equal(created.amountRial, amountRial);
  assert.equal(created.finalAmountRial, amountRial + 123, 'final_amount (amount + 3 random digits) is kept for the customer');
  assert.equal(created.paymentUrl, paymentUrl);
  assert.equal(created.cardNumber, destinationCard);
  assert.equal(created.status, 'PENDING');
  assert.equal(created.mode, 'sandbox');
  section('POST /v1/invoices/create contract');

  /* 3) optional destination card */
  const cardState = newState();
  await BluPal.createInvoice({ config, amountToman, cardNumber: '6037-7011-1234-5678', fetchImpl: makeFetch(cardState) });
  assert.equal(cardState.creates[0].body.card_number, '6037701112345678', 'dashes are stripped, digits forwarded');
  const envCardState = newState();
  await BluPal.createInvoice({ config: { ...config, cardNumber: '6037701112345678' }, amountToman, fetchImpl: makeFetch(envCardState) });
  assert.equal(envCardState.creates[0].body.card_number, '6037701112345678', 'BLUPAL_CARD_NUMBER is honoured when set');
  section('destination card');

  /* 4) documented amount bounds — the store floor is Toman, the gateway speaks RIAL */
  assert.equal(BluPal.toRial(10000), 100000);
  await assert.rejects(() => BluPal.createInvoice({ config, amountToman: 9999, fetchImpl: makeFetch(newState()) }),
    (error) => error.status === 400 && error.blupalError === 'amount_too_low', '1000 Toman is below the 100000 RIAL minimum');
  const floorState = newState();
  const floorInvoice = await BluPal.createInvoice({ config, amountToman: 10000, fetchImpl: makeFetch(floorState) });
  assert.equal(floorState.creates[0].body.amount, 100000, 'exactly the documented minimum is allowed');
  assert.equal(floorInvoice.amountRial, 100000);
  await assert.rejects(() => BluPal.createInvoice({ config, amountToman: 50000001, fetchImpl: makeFetch(newState()) }),
    (error) => error.status === 400 && error.blupalError === 'amount_too_high');
  assert.equal(BluPal.assertRialBounds(100000), undefined, 'the floor itself passes');
  assert.equal(BluPal.assertRialBounds(500000000), undefined, 'the ceiling itself passes');
  section('invoice amount bounds');

  /* 5) documented error payloads are mapped, not swallowed */
  for (const [error, expected] of [
    [{ error: 'unauthorized', message: 'کلید API نامعتبر است.' }, /کلید API بلوپال/],
    [{ error: 'no_active_card' }, /کارت فعال/],
    [{ error: 'mode_mismatch' }, /حالت کلید/],
    [{ error: 'amount_too_low', message: 'مبلغ باید حداقل 100,000 ریال باشد' }, /100٬000/]
  ]) {
    const failing = newState();
    await assert.rejects(() => BluPal.createInvoice({
      config, amountToman,
      fetchImpl: makeFetch(failing, { create: () => response(error, error.error === 'unauthorized' ? 401 : 400) })
    }), expected, `${error.error} must surface as a Persian message`);
  }
  const softState = newState();
  await assert.rejects(() => BluPal.createInvoice({
    config, amountToman: 5000,
    fetchImpl: makeFetch(softState, { create: () => response({ success: false, error: 'amount_too_low' }, 400) })
  }), /100٬000 ریال/, 'the vendor error is replaced by our own floor message');
  section('documented error codes');

  /* 6) response validation: no invoice id, wrong amount, suspicious final_amount, foreign host */
  const broken = [
    [{ create: () => response({ success: true }) }, /invoice_id/, 'a payload without an invoice id is refused'],
    [{ create: () => response(invoicePayload({ amount: amountRial + 10 })) }, /هم‌خوانی ندارد/, 'a different amount on the invoice is refused'],
    [{ create: () => response(invoicePayload({ final_amount: amountRial + 5000 })) }, /final_amount/, 'an offset bigger than three digits is refused'],
    [{ create: () => response(invoicePayload({ payment_link: 'http://blupal.top/pay/1' })) }, /امن نیست/, 'plain http payment pages are refused'],
    [{ create: () => response(invoicePayload({ payment_link: 'https://phishing.example.test/pay/1' })) }, /تعلق ندارد/, 'payment pages on foreign hosts are refused'],
    [{ create: () => response(invoicePayload({ mode: 'live' })) }, /حالت فاکتور/, 'a live invoice under a sandbox key is refused'],
    [{ create: () => response('not json', 200) }, /قابل خواندن نبود/, 'a 200 with a non-JSON body is never read as success']
  ];
  for (const [gateway, expected] of broken) {
    await assert.rejects(() => BluPal.createInvoice({ config, amountToman, fetchImpl: makeFetch(newState(), gateway) }), expected);
  }
  const shortId = newState();
  const shortCreated = await BluPal.createInvoice({ config, amountToman, fetchImpl: makeFetch(shortId, { create: () => response(invoicePayload({ invoice_id: 7 })) }) });
  assert.equal(shortCreated.invoiceId, '7', 'numeric invoice ids survive the {1,20} pattern');
  assert.equal(BluPal.readInvoiceId({ invoice_id: 123 }), '123');
  assert.equal(BluPal.readInvoiceId({ invoice_id: '12.5' }), '', 'non-numeric ids are refused');
  assert.equal(BluPal.readInvoiceId({ invoice_id: '1'.repeat(30) }), '', 'absurd ids are refused');
  assert.deepEqual(BluPal.INVOICE_ID_PATTERN.source, '^[0-9]{1,20}$');
  section('invoice response validation');

  /* 7) GET /v1/invoices/{invoice_id} — the only source of truth */
  const statusState = newState();
  const paid = await BluPal.checkInvoiceStatus({
    config, invoiceId, expectedAmountRial: amountRial, fetchImpl: makeFetch(statusState, {
      status: () => response(statusPayload())
    })
  });
  assert.equal(statusState.statuses[0].method, 'GET');
  assert.equal(statusState.statuses[0].asked, invoiceId);
  assert.equal(statusState.statuses[0].hasBody, false, 'a status query never carries a body');
  assert.equal(statusState.statuses[0].headers['X-API-Key'], apiKey);
  assert.equal(paid.outcome, 'paid');
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.transactionId, transactionId);
  assert.equal(paid.amountRial, amountRial);
  assert.equal(payfinal(paid), amountRial + 123, 'the final amount is echoed for display only');
  assert.deepEqual(paid.payer, { name: 'مهمان مهمان', cardTail: '8777', bank: 'ملت' }, 'the payer card is reduced to its last four digits');
  assert.equal(paid.modeMatches, true);
  for (const [statusText, outcome] of [['PENDING', 'pending'], ['EXPIRED', 'expired'], ['CANCELED', 'cancelled'], ['WEIRD', 'unknown']]) {
    const row = await BluPal.checkInvoiceStatus({ config, invoiceId, fetchImpl: makeFetch(newState(), { status: () => response(statusPayload({ status: statusText, transaction_id: null, payer_name: null })) }) });
    assert.equal(row.outcome, outcome, `${statusText} maps to ${outcome}`);
  }
  await assert.rejects(() => BluPal.checkInvoiceStatus({ config, invoiceId: 'not-a-number', fetchImpl: makeFetch(newState()) }), /شناسهٔ فاکتور/);
  let amountClash = null;
  try {
    await BluPal.checkInvoiceStatus({
      config, invoiceId, expectedAmountRial: amountRial,
      fetchImpl: makeFetch(newState(), { status: () => response(statusPayload({ amount: amountRial - 1000 })) })
    });
  } catch (error) { amountClash = error; }
  assert.equal(amountClash?.status, 409, 'a mismatched amount is a hard refusal, never a silent settle');
  assert.equal(amountClash?.blupalError, 'amount_mismatch');
  const crossMode = await BluPal.checkInvoiceStatus({ config, invoiceId, fetchImpl: makeFetch(newState(), { status: () => response(statusPayload({ mode: 'live' })) }) });
  assert.equal(crossMode.outcome, 'error', 'a live invoice must never settle against a sandbox key');
  section('GET /v1/invoices/{invoice_id} contract');

  function payfinal(row) { return Number(row.finalAmountRial); }

  /* 8) sandbox simulation: only from the CLI, never from a route */
  const simState = newState();
  const simulated = await BluPal.simulatePayment({ config, invoiceId, scenario: 'success', fetchImpl: makeFetch(simState) });
  assert.equal(simState.simulations[0].asked, invoiceId);
  assert.deepEqual(simState.simulations[0].body, { scenario: 'success' });
  assert.equal(simulated.status, 'PAID');
  assert.equal(simulated.transactionId, transactionId);
  for (const scenario of ['wrong_amount', 'expire', 'cancel']) {
    const row = await BluPal.simulatePayment({ config, invoiceId, scenario, fetchImpl: makeFetch(newState()) });
    assert.equal(row.scenario, scenario);
  }
  await assert.rejects(() => BluPal.simulatePayment({ config, invoiceId, scenario: 'almost', fetchImpl: makeFetch(newState()) }), /سناریوی شبیه‌سازی/);
  await assert.rejects(() => BluPal.simulatePayment({
    config: { ...config, sandbox: false, mode: 'production' }, invoiceId, fetchImpl: makeFetch(newState())
  }), (error) => error.status === 403 && error.blupalError === 'mode_mismatch', 'a live key must not be able to simulate money');
  const apiDir = path.join(ROOT, 'api', 'payment', 'blupal');
  for (const entry of fs.readdirSync(apiDir)) {
    const body = fs.readFileSync(path.join(apiDir, entry), 'utf8');
    assert.ok(!/simulate/i.test(body), `${entry} must never expose the sandbox simulation endpoint`);
  }
  assert.ok(!fs.existsSync(path.join(apiDir, 'simulate.js')));
  assert.ok(!/simulate/i.test(fs.readFileSync(path.join(ROOT, 'local-server.js'), 'utf8')), 'the local server must not mount a simulate route');
  section('sandbox simulation');

  /* 9) signed receipt: order+invoice+amount are pinned by the HMAC */
  const receiptConfig = BluPal.getConfig({ ...env, BLUPAL_STATE_SECRET: stateSecret });
  const token = BluPal.makeReceipt({ orderId, amountToman, invoiceId }, receiptConfig, { outcome: 'pending', providerCode: 'INVOICE_CREATED', now: () => fixedNow });
  const readBack = BluPal.readReceipt(token, receiptConfig, fixedNow);
  assert.equal(readBack.orderId, orderId);
  assert.equal(readBack.invoiceId, invoiceId);
  assert.equal(readBack.amountToman, amountToman);
  assert.equal(readBack.provider, 'blupal');
  assert.throws(() => BluPal.readReceipt(token, { ...receiptConfig, stateSecret: 'a-different-secret' }, fixedNow), /امضای وضعیت/);
  assert.throws(() => BluPal.readReceipt(BluPal.signPayload({ v: 1, provider: 'blupal', orderId, amountToman, invoiceId }, 'other'), receiptConfig, fixedNow), /امضای وضعیت/);
  assert.throws(() => BluPal.readReceipt(`${token}.extra`, receiptConfig, fixedNow), /رسید پرداخت معتبر نیست/);
  assert.throws(() => BluPal.readReceipt(token, receiptConfig, fixedNow + 25 * 60 * 60 * 1000), /مهلت اعتبار/);
  assert.throws(() => BluPal.readReceipt(BluPal.signPayload({ v: 1, provider: 'other', orderId, amountToman, invoiceId }, stateSecret), receiptConfig, fixedNow), /رسید بلوپال/);
  assert.throws(() => BluPal.readReceipt(BluPal.signPayload({ v: 1, provider: 'blupal', orderId, amountToman, invoiceId: '1;drop' }, stateSecret), receiptConfig, fixedNow), /رسید بلوپال/, 'a forged invoice id inside the receipt is refused');
  section('signed receipt');

  /* 10) POST /api/payment/blupal/request creates the invoice and records it */
  const requestState = newState({ payments: [paymentRow()], order: orderRow() });
  const requestRun = await runHandler(BluPal.request, {
    state: requestState,
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId }) },
    gateway: { create: () => response(invoicePayload({ invoice_id: longInvoiceId, final_amount: amountRial + 42 })) }
  });
  assert.equal(requestRun.res.statusCode, 200, JSON.stringify(requestRun.body));
  const body = requestRun.body;
  assert.equal(body.invoiceId, longInvoiceId);
  assert.equal(body.authority, longInvoiceId, 'the invoice id is stored as the payment authority');
  assert.equal(body.paymentUrl, paymentUrl);
  assert.equal(body.amountToman, amountToman);
  assert.equal(body.amountRial, amountRial);
  assert.equal(body.finalAmountRial, amountRial + 42, 'the customer must be shown the exact amount to transfer');
  assert.equal(body.finalAmountToman, Math.round((amountRial + 42) / 10));
  assert.equal(body.destinationCard, destinationCard);
  assert.equal(body.invoiceStatus, 'PENDING');
  assert.equal(body.openMode, 'redirect');
  assert.equal(body.webhookPath, '/api/payment/blupal/notify');
  assert.ok(body.receipt && body.receipt.includes('.'), 'a signed receipt is handed to the browser');
  assert.match(body.note, /مبلغ اصلاحی|دقیقاً/, 'the response tells the customer the transfer must be exact');
  assert.equal(JSON.stringify(body).includes(apiKey), false, 'the API key never reaches the browser');
  assert.equal(JSON.stringify(body).includes(stateSecret), false, 'the signing secret never reaches the browser');
  const attach = requestState.rpc.find(row => row.name === 'attach_blupal_payment');
  assert.ok(attach, 'the invoice must be recorded before the customer leaves the site');
  assert.equal(attach.body.p_order_id, orderId);
  assert.equal(attach.body.p_invoice_id, longInvoiceId);
  assert.equal(attach.body.p_amount_rial, amountRial);
  assert.equal(attach.body.p_final_amount_rial, amountRial + 42);
  assert.equal(attach.body.p_card_number, destinationCard);
  assert.equal(attach.body.p_status, 'PENDING');
  assert.equal(attach.body.p_callback_token, undefined, 'this gateway has no per-invoice callback token');
  assert.equal(requestState.creates.length, 1);
  assert.equal(requestState.creates[0].body.amount, amountRial, 'the amount sent is the DB total in rial, never the browser claim');
  assert.equal(requestState.creates[0].headers['X-API-Key'], apiKey);
  section('request handler records the invoice');

  /* 11) request handler guards: session, origin, amount bounds, gateway failure */
  const anonRun = await runHandler(BluPal.request, {
    state: newState(),
    request: { method: 'POST', headers: req.headers, body: JSON.stringify({ orderId }) }
  });
  assert.ok([401, 403].includes(anonRun.res.statusCode), 'a signed-in customer is required');
  const methodRun = await runHandler(BluPal.request, { state: newState(), request: { method: 'GET', headers: req.headers } });
  assert.equal(methodRun.res.statusCode, 405);
  const foreignRun = await runHandler(BluPal.request, {
    state: newState(),
    request: { method: 'POST', headers: { origin: 'https://evil.example', host: 'shop.example.test' }, body: JSON.stringify({ orderId }) }
  });
  assert.equal(foreignRun.res.statusCode, 403, 'cross-site payment requests are refused');
  const badOrderRun = await runHandler(BluPal.request, {
    state: newState(),
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId: '1 or 1=1' }) }
  });
  assert.equal(badOrderRun.res.statusCode, 400);
  const smallCartRun = await runHandler(BluPal.request, {
    state: newState({ payments: [paymentRow({ amount_toman: 5000 })], order: orderRow({ total_toman: 5000 }) }),
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId }) }
  });
  assert.equal(smallCartRun.res.statusCode, 400, 'the order total is checked against the gateway minimum before any invoice is created');
  assert.equal(smallCartRun.state.creates.length, 0, 'no invoice is attempted for an impossible amount');
  assert.match(smallCartRun.body.error, /10٬000 تومان/);
  const gatewayDownState = newState({ payments: [paymentRow()], order: orderRow() });
  const gatewayDownRun = await runHandler(BluPal.request, {
    state: gatewayDownState,
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId }) },
    gateway: { create: () => { throw new Error('socket hang up'); } }
  });
  assert.equal(gatewayDownRun.res.statusCode, 502);
  assert.match(gatewayDownRun.body.error, /اتصال امن/);
  assert.equal(gatewayDownState.rpc.filter(row => row.name === 'attach_blupal_payment').length, 0, 'nothing is recorded when the invoice was not created');
  const unconfiguredRun = await runHandler(BluPal.request, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId }) },
    env: { BLUPAL_API_KEY: '' }
  });
  assert.equal(unconfiguredRun.res.statusCode, 503, 'a half-configured gateway refuses instead of guessing');
  section('request handler guards');

  /* 12) the result page settles a payment only from the gateway status */
  const pollState = newState({ payments: [paymentRow()], order: orderRow() });
  const pollRun = await runHandler(BluPal.receipt, {
    state: pollState,
    request: {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ orderId, receipt: BluPal.makeReceipt({ orderId, amountToman, invoiceId }, BluPal.getConfig(env), { outcome: 'pending' }) })
    },
    gateway: { status: () => response(statusPayload()) }
  });
  assert.equal(pollRun.res.statusCode, 200, JSON.stringify(pollRun.body));
  const pollBody = pollRun.body;
  assert.equal(pollBody.outcome, 'paid');
  assert.equal(pollBody.status, 'PAID');
  assert.equal(pollBody.invoiceId, invoiceId);
  assert.equal(pollBody.referenceId, transactionId);
  assert.equal(pollBody.amountRial, amountRial);
  assert.equal(pollBody.finalAmountRial, amountRial + 123);
  assert.equal(pollBody.waitingForPayment, false);
  assert.equal(pollBody.payer.cardTail, '8777');
  assert.equal(pollBody.paymentUrl, paymentUrl, 'the stored payment link is echoed for support');
  assert.equal(pollState.statuses.length, 1, 'the browser poll is answered with exactly one gateway query');
  assert.equal(pollState.statuses[0].method, 'GET');
  const settle = pollState.rpc.find(row => row.name === 'settle_blupal_payment');
  assert.ok(settle, 'a confirmed transfer is settled through the single-use RPC');
  assert.equal(settle.body.p_order_id, orderId);
  assert.equal(settle.body.p_invoice_id, invoiceId);
  assert.equal(settle.body.p_outcome, 'paid');
  assert.equal(settle.body.p_amount_toman, amountToman, 'the amount comes from the stored order, in Toman');
  assert.equal(settle.body.p_reference_id, transactionId);
  assert.equal(settle.body.p_provider_code, 'PAID');
  assert.equal(settle.body.p_callback_payload.source, 'client-poll');
  assert.equal(settle.body.p_callback_payload.payerCardTail, '8777');
  assert.equal(settle.body.p_callback_payload.finalAmountRial, amountRial + 123, 'the offset is kept as evidence, never as the charged amount');
  const lyingReceipt = await runHandler(BluPal.receipt, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId, receipt: 'forged.token' }) }
  });
  assert.ok(lyingReceipt.res.statusCode >= 400, 'a forged receipt is refused');
  const wrongOrderReceipt = BluPal.makeReceipt({ orderId: '40000000-0000-4000-8000-000000000004', amountToman, invoiceId }, BluPal.getConfig(env), { outcome: 'paid' });
  const mismatchRun = await runHandler(BluPal.receipt, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'POST', headers: authHeaders, body: JSON.stringify({ orderId, receipt: wrongOrderReceipt }) }
  });
  assert.equal(mismatchRun.res.statusCode, 403, 'a receipt from another order cannot settle this one');
  section('result poll settles from the gateway');

  /* 13) pending, expired and cancelled statuses; nothing is invented */
  const pendingState = newState({ payments: [paymentRow()], order: orderRow() });
  const pendingResult = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(pendingState, { status: () => response(statusPayload({ status: 'PENDING', transaction_id: null, payer_name: null, payer_card: null, payer_bank_name: null })) })
  });
  assert.equal(pendingResult.outcome, 'pending');
  assert.equal(pendingResult.status, 'PENDING');
  assert.equal(pendingResult.waitingForPayment, true);
  assert.equal(pendingResult.referenceId, '', 'an unpaid invoice has no reference to show');
  assert.equal(pendingResult.destinationCard, destinationCard, 'the customer keeps the destination card while waiting');
  assert.equal(pendingState.rpc.length, 0, 'pending is never written to the database');
  const expiredState = newState({ payments: [paymentRow()], order: orderRow() });
  const expiredResult = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(expiredState, { status: () => response(statusPayload({ status: 'EXPIRED' })) })
  });
  assert.equal(expiredResult.outcome, 'expired');
  const expiredSettle = expiredState.rpc.find(row => row.name === 'settle_blupal_payment');
  assert.equal(expiredSettle.body.p_outcome, 'cancelled', 'an expired invoice releases the reservation');
  assert.equal(expiredSettle.body.p_provider_code, 'EXPIRED');
  const cancelledState = newState({ payments: [paymentRow()], order: orderRow() });
  await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(cancelledState, { status: () => response(statusPayload({ status: 'CANCELED' })) })
  });
  assert.equal(cancelledState.rpc[0].body.p_outcome, 'cancelled');
  const unavailableState = newState({ payments: [paymentRow()], order: orderRow() });
  const unavailable = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(unavailableState, { status: () => { throw new Error('down'); } })
  });
  assert.equal(unavailable.outcome, 'pending', 'a transport failure must never look like a payment');
  assert.equal(unavailable.providerCode, 'STATUS_UNAVAILABLE');
  assert.equal(unavailableState.rpc.length, 0);
  const mismatchedState = newState({ payments: [paymentRow()], order: orderRow() });
  const mismatched = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(mismatchedState, { status: () => response(statusPayload({ amount: amountRial - 1000 })) })
  });
  assert.equal(mismatched.outcome, 'pending');
  assert.equal(mismatched.providerCode, 'AMOUNT_MISMATCH', 'a wrong-amount transfer is not settled by us; the customer must contact support');
  assert.equal(mismatchedState.rpc.length, 0);
  const notFound = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow() }), { status: () => response({ success: false, error: 'not_found', message: 'invoice not found' }, 404) })
  });
  assert.equal(notFound.outcome, 'pending');
  assert.equal(notFound.providerCode, 'NOT_FOUND', 'the gateway reason is recorded for the admin, without touching the order');
  const rejectedKey = await BluPal.settleStatus({
    orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow,
    fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow() }), { status: () => response({ success: false, error: 'unauthorized' }, 401) })
  });
  assert.equal(rejectedKey.outcome, 'pending');
  assert.equal(rejectedKey.providerCode, 'UNAUTHORIZED', 'a revoked key must not look like an unpaid customer');
  const verifiedState = newState({ payments: [paymentRow({ status: 'verified', provider_reference: transactionId, provider_code: 'PAID' })], order: orderRow() });
  const verifiedRun = await BluPal.settleStatus({ orderId, config, dbConfig, source: 'client-poll', now: () => fixedNow, fetchImpl: makeFetch(verifiedState) });
  assert.equal(verifiedRun.outcome, 'paid');
  assert.equal(verifiedState.statuses.length, 0, 'a settled order is not asked about again');
  assert.equal(verifiedState.rpc.length, 0, 'settling twice never happens');
  section('pending, expired, cancelled and unreachable');

  /* 14) settlement integrity: amounts, authority and reuse */
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId, amountToman: amountToman + 1000, outcome: 'paid' },
    { dbConfig, fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow() })) }), /مبلغ رسید با سفارش ذخیره‌شده مطابقت ندارد/);
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'paid' },
    { dbConfig, fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow({ total_toman: amountToman + 1000 }) })) }),
    /رکورد پرداخت سفارش معتبر نیست/, 'an order and payment row that disagree are never settled');
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId: longInvoiceId, amountToman, outcome: 'paid' },
    { dbConfig, fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow() })) }), /هم‌خوانی ندارد/);
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId: '', amountToman, outcome: 'paid' },
    { dbConfig, fetchImpl: makeFetch(newState({ payments: [paymentRow({ authority: null })], order: orderRow() })) }), /شناسهٔ فاکتور/);
  const alreadyPaid = newState({ payments: [paymentRow({ status: 'verified', provider_reference: transactionId })], order: orderRow() });
  const idempotent = await BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'paid', status: 'PAID' }, { dbConfig, fetchImpl: makeFetch(alreadyPaid) });
  assert.equal(idempotent.idempotent, true, 'a second confirmation is acknowledged without a second write');
  assert.equal(alreadyPaid.rpc.length, 0);
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'expired' }, { dbConfig, fetchImpl: makeFetch(alreadyPaid) }), /پیش‌تر پرداخت شده/, 'a paid order cannot be flipped to expired');
  const deadRow = newState({ payments: [paymentRow({ status: 'failed' })], order: orderRow() });
  const reCancelled = await BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'cancelled' }, { dbConfig, fetchImpl: makeFetch(deadRow) });
  assert.equal(reCancelled.idempotent, true);
  assert.equal(deadRow.rpc.length, 0, 'an expired invoice is never reopened by a webhook retry');
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'paid' }, { dbConfig, fetchImpl: makeFetch(deadRow) }), /منقضی یا لغو شده/);
  assert.equal(await BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'pending' }, { dbConfig, fetchImpl: makeFetch(newState()) }), null);
  assert.equal(await BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'unknown' }, { dbConfig, fetchImpl: makeFetch(newState()) }), null);
  await assert.rejects(() => BluPal.persistSettlement({ orderId, invoiceId, amountToman, outcome: 'paid', amountRial: amountRial - 1 },
    { dbConfig, fetchImpl: makeFetch(newState({ payments: [paymentRow()], order: orderRow() })) }), /هم‌خوانی ندارد/);
  const settleArgs = BluPal.settlementArguments({ orderId, invoiceId, outcome: 'paid', amountToman, referenceId: transactionId, providerCode: 'PAID' });
  assert.deepEqual(Object.keys(settleArgs).sort(), ['p_amount_toman', 'p_callback_payload', 'p_invoice_id', 'p_order_id', 'p_outcome', 'p_provider_code', 'p_reference_id']);
  section('settlement integrity');

  /* 15) webhook: a hint only — 200 fast, re-verified, idempotent, never trusted */
  const hookState = newState({ payments: [paymentRow()], order: orderRow() });
  const hookRun = await runHandler(BluPal.notify, {
    state: hookState,
    request: { method: 'POST', headers: {}, body: webhookPayload({ amount: 1, final_amount: 999999999, payer_card: '6219861000000000' }) }
  }, { status: () => response(statusPayload()) });
  assert.equal(hookRun.res.statusCode, 200, 'the panel demands HTTP 200 within ten seconds');
  assert.equal(hookRun.body.received, true);
  assert.equal(hookRun.body.handled, true);
  assert.equal(hookRun.body.outcome, 'paid');
  assert.equal(hookState.statuses.length, 1, 'the webhook triggers exactly one gateway query');
  assert.equal(hookState.statuses[0].asked, invoiceId, 'the invoice id is looked up in our own database first');
  assert.equal(hookState.creates.length, 0, 'a webhook never creates anything');
  const hookSettle = hookState.rpc.find(row => row.name === 'settle_blupal_payment');
  assert.equal(hookSettle.body.p_amount_toman, amountToman, 'the amount in the webhook body is ignored; the order total is used');
  assert.equal(hookSettle.body.p_callback_payload.source, 'provider-webhook');
  const ignoreCases = [
    [{ event: 'invoice.created', status: 'PENDING', invoice_id: invoiceId }, 'ignored_event'],
    [{ event: 'payment.completed', status: 'CANCELED', invoice_id: invoiceId }, 'ignored_status'],
    [{ event: 'payment.completed', status: 'PAID' }, 'no_invoice_id'],
    [{ event: 'payment.completed', status: 'PAID', invoice_id: 'abc' }, 'no_invoice_id'],
    ['garbage', 'invalid_body']
  ];
  for (const [payload, reason] of ignoreCases) {
    const ignored = await runHandler(BluPal.notify, { state: newState({ payments: [paymentRow()], order: orderRow() }), request: { method: 'POST', headers: {}, body: payload } });
    assert.equal(ignored.res.statusCode, 200, `${reason} must be acknowledged so the gateway stops retrying`);
    assert.equal(ignored.body.reason, reason);
    assert.equal(ignored.body.handled, false);
    assert.equal(ignored.state.rpc.length, 0, `${reason} must not touch the database`);
  }
  const unknownRun = await runHandler(BluPal.notify, {
    state: newState({ payments: [] }),
    request: { method: 'POST', headers: {}, body: webhookPayload({ invoice_id: '999999' }) }
  });
  assert.equal(unknownRun.res.statusCode, 200, 'an invoice that is not ours is acknowledged, not retried forever');
  assert.equal(unknownRun.body.reason, 'unknown_invoice');
  const gatewayDownHook = await runHandler(BluPal.notify, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'POST', headers: {}, body: webhookPayload() },
    gateway: { status: () => { throw new Error('gateway down'); } }
  });
  assert.equal(gatewayDownHook.res.statusCode, 200, 'a verification problem must not trigger a retry storm; the result page polls anyway');
  assert.equal(gatewayDownHook.body.outcome, 'pending');
  const dbDownHook = await runHandler(BluPal.notify, {
    state: newState(),
    request: { method: 'POST', headers: {}, body: webhookPayload() },
    env: { SUPABASE_SERVICE_ROLE_KEY: '' }
  });
  assert.equal(dbDownHook.res.statusCode, 500, 'without the service role we cannot settle: ask for a retry');
  assert.equal(dbDownHook.body.retry, true);
  const noDbIgnored = await runHandler(BluPal.notify, {
    state: newState(),
    request: { method: 'POST', headers: {}, body: { event: 'invoice.created', invoice_id: invoiceId } },
    env: { SUPABASE_SERVICE_ROLE_KEY: '' }
  });
  assert.equal(noDbIgnored.res.statusCode, 200, 'an unrelated event is acked even while the database is down');
  const hookMethodRes = makeRes();
  await BluPal.notify({ method: 'GET', headers: {}, body: {} }, hookMethodRes);
  assert.equal(hookMethodRes.statusCode, 405, 'webhooks are POST only');
  section('webhook handling');

  /* 16) browser return: the callback never trusts query parameters */
  const callbackState = newState({ payments: [paymentRow()], order: orderRow() });
  const callbackRun = await runHandler(BluPal.callback, {
    state: callbackState,
    request: { method: 'GET', url: `https://shop.example.test/api/payment/blupal/callback?invoice_id=${invoiceId}` },
    gateway: { status: () => response(statusPayload()) }
  });
  assert.equal(callbackRun.res.statusCode, 302);
  assert.equal(callbackRun.res.headers.Location, `/payment/result/${orderId}`, 'the invoice id is resolved through our own database');
  assert.equal(callbackRun.res.headers['Cache-Control'], 'no-store');
  assert.equal(callbackState.statuses.length, 1, 'the callback settles by re-asking the gateway');
  assert.equal(callbackState.statuses[0].headers['X-API-Key'], apiKey);
  const byOrderRun = await runHandler(BluPal.callback, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'GET', url: `https://shop.example.test/api/payment/blupal/callback?order=${orderId}&amount=1&status=PAID` },
    gateway: { status: () => response(statusPayload()) }
  });
  assert.equal(byOrderRun.res.headers.Location, `/payment/result/${orderId}`, 'query amounts are ignored entirely');
  const bareRun = await runHandler(BluPal.callback, { state: newState({ payments: [] }), request: { method: 'GET', url: 'https://shop.example.test/api/payment/blupal/callback' } });
  assert.equal(bareRun.res.statusCode, 302);
  assert.equal(bareRun.res.headers.Location, '/account', 'a return without identifiers lands on the account page; nothing is settled');
  const injectionRun = await runHandler(BluPal.callback, {
    state: newState({ payments: [paymentRow()], order: orderRow() }),
    request: { method: 'GET', url: 'https://shop.example.test/api/payment/blupal/callback?order=..%2F..%2Fetc%2Fpasswd&invoice_id=%3Cscript%3E' }
  });
  assert.equal(injectionRun.res.headers.Location, '/account', 'malformed identifiers are never echoed into a redirect');
  assert.equal(injectionRun.state.statuses.length, 0);
  const foreignInvoiceRun = await runHandler(BluPal.callback, {
    state: newState({ payments: [] }),
    request: { method: 'GET', url: 'https://shop.example.test/api/payment/blupal/callback?invoice_id=999999' }
  });
  assert.equal(foreignInvoiceRun.res.headers.Location, '/account', 'an invoice id that is not ours redirects without leaking anything');
  const callbackMethodRun = await runHandler(BluPal.callback, { state: newState(), request: { method: 'POST', url: 'https://shop.example.test/api/payment/blupal/callback' } });
  assert.equal(callbackMethodRun.res.statusCode, 405);
  section('browser return handling');

  /* 17) status endpoint: what the operator sees, and what must never appear */
  const statusRun = await runHandler(BluPal.status, { state: newState(), request: { method: 'GET', headers: {} } });
  assert.equal(statusRun.res.statusCode, 200);
  const statusBody = statusRun.body;
  assert.equal(statusBody.provider, 'blupal');
  assert.equal(statusBody.configured, true);
  assert.equal(statusBody.paymentEnabled, true, 'sandbox payments work without the live lock');
  assert.equal(statusBody.amountUnit, 'IRR');
  assert.equal(statusBody.minAmountRial, 100000);
  assert.equal(statusBody.maxAmountRial, 500000000);
  assert.equal(statusBody.minAmountToman, 10000, 'the storefront needs the floor in Toman');
  assert.deepEqual(statusBody.invoiceMethods, ['POST /v1/invoices/create', 'GET /v1/invoices/{invoice_id}']);
  assert.deepEqual(statusBody.sandboxMethods, ['POST /v1/sandbox/invoices/{invoice_id}/simulate']);
  assert.deepEqual(statusBody.invoiceStatuses, ['PENDING', 'PAID', 'EXPIRED', 'CANCELED']);
  assert.equal(statusBody.errorCodes.includes('mode_mismatch'), true);
  assert.equal(statusBody.requiresWebhook, false, 'settlement works even if the webhook is not registered yet');
  assert.equal(statusBody.webhookSignatureAvailable, false, 'the panel documents no webhook signature');
  assert.equal(statusBody.merchantIdConfigured, undefined, 'the other vendor has no merchant concept here');
  assert.equal(statusBody.apiKeyKind, 'test');
  assert.equal(statusBody.settleGraceMinutes, 60);
  assert.equal(JSON.stringify(statusBody).includes(apiKey), false, 'the key never leaks through the status route');
  assert.equal(JSON.stringify(statusBody).includes(stateSecret), false, 'the receipt secret never leaks either');
  const statusMethodRun = await runHandler(BluPal.status, { state: newState(), request: { method: 'POST', headers: {} } });
  assert.equal(statusMethodRun.res.statusCode, 405);
  const unconfiguredStatus = await runHandler(BluPal.status, { state: newState(), request: { method: 'GET', headers: {} }, env: { BLUPAL_API_KEY: '' } });
  assert.equal(unconfiguredStatus.body.configured, false);
  assert.equal(unconfiguredStatus.body.paymentEnabled, false);
  assert.equal(unconfiguredStatus.res.statusCode, 200, 'the health endpoint answers even when nothing is configured');
  /* an owner who has not wired Vercel yet must be told exactly what is missing — by name only */
  const supabaseServer = require('../lib/supabase-server.js');
  assert.deepEqual(supabaseServer.missingServerKeys({ SUPABASE_URL: 'https://x.supabase.co' }),
    ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], 'the missing list names the key that is absent');
  assert.deepEqual(supabaseServer.missingServerKeys({
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc'
  }), [], 'a complete configuration reports nothing missing');
  assert.deepEqual(supabaseServer.missingServerKeys({ SUPABASE_URL: 'https://x.supabase.co/rest/v1' }),
    ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], 'a project URL with a path is still unusable');
  let configError = null;
  try { supabaseServer.serverConfiguration({}); } catch (error) { configError = error; }
  assert.equal(configError.status, 503);
  assert.match(configError.message, /SUPABASE_URL/, 'the refusal the shopper sees names the missing variables');
  assert.match(configError.message, /Redeploy/, 'and tells the owner the deployment has to be rebuilt');
  assert.deepEqual(unconfiguredStatus.body.missingDatabaseKeys, [], 'the gateway key being absent is not a Supabase problem');
  const partialStatus = await runHandler(BluPal.status, {
    state: newState(), request: { method: 'GET', headers: {} }, env: { SUPABASE_SERVICE_ROLE_KEY: '' }
  });
  assert.deepEqual(partialStatus.body.missingDatabaseKeys, ['SUPABASE_SERVICE_ROLE_KEY'],
    'the health endpoint names the variable the owner has to add in Vercel');
  assert.equal(partialStatus.body.configured, false, 'and the payment stays off until it is there');
  assert.equal(JSON.stringify(unconfiguredStatus.body).includes('eyJ'), false, 'a service key value must never be printed');
  /* the two Supabase keys are not interchangeable — each swap gets its own message */
  const anonJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.sig`;
  const serviceJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.sig`;
  const swapped = supabaseServer.supabaseServerConfig({
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: anonJwt, SUPABASE_SERVICE_ROLE_KEY: anonJwt
  });
  assert.equal(swapped.serviceKeyIsPublic, true, 'the anon key in the service slot is detected');
  assert.equal(swapped.serviceConfigured, false, 'and does not count as a service configuration');
  let swapError = null;
  try { supabaseServer.serverConfiguration({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: anonJwt, SUPABASE_SERVICE_ROLE_KEY: anonJwt }); }
  catch (error) { swapError = error; }
  assert.match(swapError.message, /کلید عمومی/, 'the owner is told which key is in the wrong slot');
  assert.match(swapError.message, /sb_secret_/, 'and where the right one comes from');
  assert.equal(supabaseServer.supabaseServerConfig({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a', SUPABASE_SECRET_KEY: 'sb_secret_b' }).serviceConfigured,
    true, 'SUPABASE_SECRET_KEY is accepted as an alias, because Supabase renamed the key');
  assert.deepEqual(supabaseServer.missingServerKeys({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a' }), ['SUPABASE_SERVICE_ROLE_KEY'],
    'but the guide and the error always name the canonical variable');
  assert.equal(supabaseServer.looksLikeSecretKey(serviceJwt), true, 'a legacy service_role JWT is recognised');
  assert.equal(supabaseServer.looksLikeSecretKey(anonJwt), false, 'a legacy anon JWT is not');
  assert.equal(supabaseServer.looksLikeSecretKey('sb_publishable_abc'), false, 'the publishable key is public by design');
  let leakError = null;
  try { supabaseServer.serverConfiguration({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: serviceJwt, SUPABASE_SERVICE_ROLE_KEY: serviceJwt }); }
  catch (error) { leakError = error; }
  assert.equal(leakError.status, 503, 'a secret key in the public slot stops the storefront instead of shipping it');
  assert.match(leakError.message, /مرورگر|Rotate/, 'and says the key leaked and must be rotated');
  section('status endpoint');


  /* 18) Supabase migration contract */
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  for (const marker of [
    "check (provider in ('blupal','zarinpal','balepay','bluepal'))",
    'function public.attach_blupal_payment(',
    'function public.settle_blupal_payment(',
    'function public.expire_stale_blupal_checkouts(',
    "p_invoice_id !~ '^[0-9]{1,20}$'",
    'create trigger payments_enforce_blupal_provider',
    "if new.provider is distinct from 'blupal' then",
    "or pg_catalog.pg_get_constraintdef(con.oid) ilike '%provider = any%'",
    'grant execute on function public.attach_blupal_payment(uuid,text,text,text,bigint,bigint,text) to service_role;',
    'grant execute on function public.settle_blupal_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;',
    'revoke all on function public.expire_stale_blupal_checkouts(integer) from public, anon;',
    "v_payment.provider <> 'blupal'",
    'if v_payment.amount_toman <> p_amount_toman or v_order.total_toman <> p_amount_toman then',
    "raise exception using errcode = '23505', message = 'verified payment cannot be changed';",
    'drop default'
  ]) assert.ok(sql.includes(marker), `migration marker missing: ${marker}`);
  assert.ok(!/p_track_id|p_authority|p_gateway_amount|p_callback_token/.test(sql), 'the previous gateway request shape must not survive in SQL');
  assert.match(sql, /v_total < 10000/, 'the order floor equals the invoice minimum (100000 RIAL)');
  assert.match(sql, /p_amount_rial is not null and p_amount_rial < 0/);
  assert.match(sql, /p_final_amount_rial > p_amount_rial \+ 999/, 'a final amount outside the documented 3-digit offset is refused');
  assert.match(sql, /p_status not in \('PENDING','PAID','EXPIRED','CANCELED'\)/);
  assert.match(sql, /' BluPal invoice was never paid'|'BluPal invoice was never paid'/);
  assert.match(sql, /greatest\(coalesce\(p_grace_minutes, 60\), 15\)/);
  assert.match(sql, /payment status can only be confirmed by the BluPal invoice status check/);
  const legacyLines = sql.split('\n').filter(line => /balepay|zarinpal|bluepal/i.test(line));
  assert.ok(legacyLines.length > 0, 'legacy rows must still be handled, not ignored');
  for (const line of legacyLines) {
    const isGuard = /^\s*--|not in \(|in \('zarinpal'|drop constraint|drop function|unknown provider|retired gateway|check \(provider in \('blupal'|pg_get_constraintdef|comment on column public\.payments\.provider/.test(line);
    assert.ok(isGuard, `legacy identifiers are only allowed inside history guards and drops: ${line.trim()}`);
  }
  assert.ok(!/settled rows from the retired gateway/.test(sql), 'a settled legacy row must never block the switch');
  assert.match(sql, /raise notice 'blupal: % retired-gateway payment row\(s\)/, 'the migration reports preserved history instead of aborting');
  assert.ok(!/set provider = 'blupal', status = 'failed'/.test(sql), 'closed-out legacy rows keep the provider label they were paid under');
  assert.match(sql, /and provider in \('zarinpal','balepay','bluepal'\);/, 'the cleanup must touch retired rows only');
  assert.ok(!/provider is distinct from 'balepay'/.test(sql), 'fail-closed filters were replaced by explicit cleanup');
  /* a status literal that is not an enum member aborts the whole RPC with 22P02 on real Postgres */
  const STATUS_MEMBERS = new Set(['pending', 'verified', 'failed', 'refunded', 'pending_payment', 'paid',
    'processing', 'shipped', 'delivered', 'cancelled', 'PENDING', 'PAID', 'EXPIRED', 'CANCELED']);
  const statusGroups = [
    ...[...sql.matchAll(/\b\w*status\s*(?:not\s+)?in\s*\(([^)]*)\)/gi)].map(match => match[1]),
    ...[...sql.matchAll(/\b\w*status\s*(?:<>|=)\s*'([^']*)'/gi)].map(match => `'${match[1]}'`)
  ];
  assert.ok(statusGroups.length >= 20, 'the status-enum guard must actually find the comparisons');
  for (const group of statusGroups) {
    for (const quoted of group.match(/'[^']*'/g) || []) {
      const value = quoted.slice(1, -1);
      assert.ok(STATUS_MEMBERS.has(value), `'${value}' is not a member of public.payment_status/public.order_status, so real Postgres rejects the query`);
    }
  }
  assert.ok(!/'manual'/.test(sql), "there is no 'manual' payment_status; the app derives MANUAL from provider_code");
  section('Supabase migration contract');

  /* 18b) the manual chunks: no lost line, no unbalanced dollar-quote, files in sync */
  const chunks = require('../scripts/blupal-sql-chunks.js');
  const built = chunks.build(sql);
  assert.equal(built.length, chunks.CHUNKS.length, 'every declared chunk is produced');
  const flatten = value => value.split('\n').filter(line => !/^\s*(begin|commit)\s*;\s*$/i.test(line)).join('\n').replace(/\s+/g, ' ').trim();
  assert.equal(flatten(built.map(chunk => chunk.body).join('\n')), flatten(sql),
    'the chunks must contain the migration byte-for-byte (only begin/commit are moved)');
  for (const chunk of built) {
    assert.equal(chunks.dollarBalance(chunk.sql).depth, 0, `${chunk.file} must close every $$ body`);
    assert.match(chunk.sql.trim(), /commit;$/, `${chunk.file} must be a complete transaction`);
    assert.ok(chunk.bytes < 20000, `${chunk.file} must stay small enough to paste safely`);
  }
  for (const chunk of built) {
    const onDisk = path.join(ROOT, 'supabase', 'manual', chunk.file);
    assert.ok(fs.existsSync(onDisk), `${chunk.file} must be committed for hand-running`);
    assert.equal(fs.readFileSync(onDisk, 'utf8'), chunk.sql, `${chunk.file} is out of date; run node scripts/blupal-sql-chunks.js`);
  }
  const readme = fs.readFileSync(path.join(ROOT, 'BLUPAL_OPERATIONS.md'), 'utf8');
  assert.ok(/supabase\/manual\/01_schema_and_legacy\.sql/.test(readme), 'the guide must document the chunked fallback');
  for (const chunk of built) assert.ok(readme.includes(chunk.file), `the guide must list ${chunk.file} in the run order`);
  assert.match(readme, /commit;/, 'the guide must tell the reader to check that the paste ends with commit;');
  assert.match(readme, /P0001/, 'the guide must explain the retired-gateway history error');
  assert.match(readme, /retired-gateway payment row\(s\)/, 'the guide must quote the notice that history was kept');
  const supabaseReadme = fs.readFileSync(path.join(ROOT, 'supabase', 'README.md'), 'utf8');
  assert.match(supabaseReadme, /supabase\/manual\//, 'the Supabase README must point at the paste-safe chunks');
  assert.match(supabaseReadme, /tests\/blupal-sql\.js/, 'the Supabase README must mention the real-Postgres test');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'blupal-sql.js')) && fs.existsSync(path.join(ROOT, 'tests', 'blupal-sql-itest.py')),
    'the SQL must also be exercised against a real Postgres, not only against stubs');
  const testChain = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.test;
  assert.ok(testChain.includes('node tests/blupal-sql.js'), 'the real-Postgres run belongs in npm test');
  section('manual SQL chunks');

  /* 19) the service layer stays narrow: three RPCs, provider-scoped reads */
  const libJs = fs.readFileSync(path.join(ROOT, 'lib', 'blupal.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(ROOT, 'lib', 'supabase-server.js'), 'utf8');
  const rpcNames = [...libJs.matchAll(/callServiceRpc\('([a-z_]+)'/g)].map(match => match[1]);
  const cliJs = fs.readFileSync(path.join(ROOT, 'scripts', 'blupal-cli.js'), 'utf8');
  assert.deepEqual([...new Set(rpcNames)].sort(), ['attach_blupal_payment', 'settle_blupal_payment'], 'the gateway core only attaches and settles');
  assert.ok(cliJs.includes("'expire_stale_blupal_checkouts'"), 'the ops CLI uses the SQL expiry sweep');
  assert.deepEqual([...serverJs.matchAll(/^  '([a-z_]+)',?$/gm)].map(m => m[1]).sort(), ['attach_blupal_payment', 'expire_stale_blupal_checkouts', 'settle_blupal_payment'], 'the service RPC allow-list is exactly the BluPal set');
  assert.equal((serverJs.match(/provider:\s*'eq\.blupal'/g) || []).length, 2, 'every payment read must be provider-scoped');
  assert.ok(!/eq\.balepay|eq\.zarinpal|eq\.bluepal/.test(serverJs), 'no retired provider filter may remain');
  assert.match(serverJs, /A-Za-z0-9_-\]\{1,64\}/, 'short invoice ids must be lookup-able by authority');
  assert.ok(!/A-Za-z0-9_-\]\{6,64\}/.test(serverJs), 'the old six-character floor would reject invoice id 123');
  for (const name of ['simulatePayment', 'createInvoice', 'checkInvoiceStatus']) assert.ok(libJs.includes(`async function ${name}`));
  assert.ok(!/Authorization/.test(libJs.split('/* ------------------------------------------------------------ BluPal API */')[1] || ''), 'the gateway is called with X-API-Key only');
  section('service layer boundaries');

  /* 20) environment templates: same keys in both files, everything the code reads */
  const templates = ['vercel.env.example', '.env.example'];
  const keySets = templates.map(file => new Set([...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(match => match[1])));
  assert.equal(keySets[0].size, keySets[1].size, 'templates must declare the same number of keys');
  for (const key of keySets[0]) assert.ok(keySets[1].has(key), `${key} missing from .env.example`);
  const readNames = new Set();
  const scanDirs = ['lib', 'api', 'services', 'scripts', 'repositories'];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : (/\.(js|json)$/.test(entry.name) ? [path.join(dir, entry.name)] : []));
  for (const file of [...scanDirs.flatMap(walk), 'local-server.js']) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/env\.(BLUPAL_[A-Z0-9_]*)/g)) readNames.add(match[1]);
  }
  assert.equal(readNames.size, new Set(['BLUPAL_MODE','BLUPAL_API_KEY','BLUPAL_STATE_SECRET','BLUPAL_API_BASE','BLUPAL_CARD_NUMBER','BLUPAL_ALLOWED_PAY_HOSTS','BLUPAL_SETTLE_GRACE_MINUTES','BLUPAL_ENABLE_LIVE_PAYMENTS']).size, 'exactly the documented knobs are read from the environment');
  for (const name of readNames) assert.ok(keySets[0].has(name), `${name} is read by the code but missing from the templates`);
  assert.ok(!libJs.includes('BLUPAL_PUBLIC_ORIGIN'), 'this gateway takes the return page from the panel, so no public-origin knob exists');
  for (const retired of ['BLUPAL_MERCHANT_ID', 'BLUPAL_REQUIRE_MERCHANT_ID', 'BLUPAL_WEBHOOK_SECRET', 'BLUPAL_REQUIRE_WEBHOOK_SIGNATURE', 'BLUPAL_WEBHOOK_SIGNATURE_HEADER', 'BLUPAL_PUBLIC_ORIGIN']) {
    assert.ok(![...keySets[0], ...keySets[1]].includes(retired), `${retired} belongs to the gateway we replaced`);
    assert.ok(!libJs.includes(retired), `${retired} must not be read by the code`);
  }
  const envScanner = fs.readFileSync(path.join(ROOT, 'scripts', 'vercel-env.js'), 'utf8');
  for (const required of ['BLUPAL_MODE', 'BLUPAL_API_KEY', 'BLUPAL_STATE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.ok(envScanner.includes(`'${required}'`), `${required} must be a required key for the Vercel helper`);
  }
  const plainList = envScanner.split('PUBLIC_NAMES = new Set([')[1].split(']);')[0];
  for (const key of ['BLUPAL_API_KEY', 'BLUPAL_STATE_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY']) {
    assert.ok(!new RegExp(`'${key}',?\n`).test(plainList), `${key} must never be stored as a plain Vercel variable`);
  }
  for (const key of ['BLUPAL_MODE', 'BLUPAL_SETTLE_GRACE_MINUTES', 'BLUPAL_ENABLE_LIVE_PAYMENTS']) {
    assert.ok(new RegExp(`'${key}',?\n`).test(plainList), `${key} is not a secret and stays readable`);
  }
  for (const file of templates) {
    const fileBody = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/balepay|BALEPAY|zarinpal|bluepal|Bale Pay/i.test(fileBody), `${file} must not mention a retired gateway`);
    assert.ok(fileBody.includes('BLUPAL_ENABLE_LIVE_PAYMENTS=false'), `${file} must ship the real-money lock closed`);
    assert.ok(!/BLUPAL_WEBHOOK_SECRET/.test(fileBody));
  }
  section('environment templates');

  /* 21) route wiring: five functions, vercel.json, local server and the CSP-safe script tag */
  const routes = ['request', 'receipt', 'status', 'callback', 'notify'];
  for (const route of routes) {
    const file = path.join(ROOT, 'api', 'payment', 'blupal', `${route}.js`);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, new RegExp(`require\\('\\.\\./\\.\\./\\.\\./lib/blupal\\.js'\\)\\.${route}`), `${route} shim must re-export lib/blupal.js#${route}`);
    if (route !== 'status') assert.match(source, /bodyParser/, `${route} must pin its body limit`);
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const route of ['request', 'receipt', 'callback', 'notify']) {
    assert.ok(Object.keys(vercel.functions || {}).includes(`api/payment/blupal/${route}.js`), `${route} needs a function entry`);
  }
  assert.ok(!Object.keys(vercel.functions || {}).some(key => /balepay|zarinpal|bluepal/i.test(key)));
  const localServer = fs.readFileSync(path.join(ROOT, 'local-server.js'), 'utf8');
  for (const route of routes) assert.ok(localServer.includes(`/api/payment/blupal/${route}`), `local-server must mount /api/payment/blupal/${route}`);
  assert.ok(!/readBody\(req, 256/.test(localServer), 'the notify cap must match the function config');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /<script src="\/services\/blupal-pay\.js"/, 'the client bridge must be loaded');
  assert.ok(!/balepay|ble\.ir|tapi\.bale/i.test(indexHtml), 'no messenger SDK may be loaded on the storefront');
  assert.ok(!fs.existsSync(path.join(ROOT, 'lib', 'bluepal.js')), 'the replaced gateway implementation must be gone');
  assert.ok(!fs.existsSync(path.join(ROOT, 'api', 'payment', 'bluepal')), 'the replaced gateway routes must be gone');
  assert.ok(!fs.existsSync(path.join(ROOT, 'services', 'bluepal-pay.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'BLUEPAL_OPERATIONS.md')));
  section('route wiring');

  /* 22) storefront: redirect flow, invoice wording, no messenger wallet */
  const stage3 = fs.readFileSync(path.join(ROOT, 'stage3.js'), 'utf8');
  assert.match(stage3, /window\.ToubaBluPal/, 'the storefront must use the BluPal bridge');
  assert.match(stage3, /ToubaBluPal\.requestGateway\(orderId\)/);
  assert.match(stage3, /ToubaBluPal\.openPayment\(gateway\)/);
  assert.match(stage3, /row\.waitingForPayment/, 'the result page must read the new waiting flag');
  assert.match(stage3, /row\.invoiceId/, 'the result page shows the invoice id, not a track id');
  assert.match(stage3, /finalAmountRial/, 'the exact transfer amount is surfaced while pending');
  assert.ok(!/waitingForVerify|trackId/.test(stage3), 'the previous gateway vocabulary is gone from the storefront');
  assert.ok(!/ToubaBalePay|supportsOpenInvoice|openInvoice|WebApp\.sendPayment/.test(stage3), 'the messenger wallet flow is gone');
  const stage4 = fs.readFileSync(path.join(ROOT, 'stage4.js'), 'utf8');
  assert.match(stage4, /بلوپال/, 'the payment method card must name BluPal');
  assert.match(stage4, /کارت‌به‌کارت/, 'the customer is told this is a card-to-card transfer');
  assert.match(stage4, /۱۰٬۰۰۰ تومان/, 'the invoice minimum is stated on the checkout page');
  assert.ok(!/Bale Pay|بله‌پی|درگاه بانکی/.test(stage4), 'no retired gateway wording may remain in checkout');
  for (const file of ['app.js', 'enhancements.js', 'services/application-services.js', 'repositories/supabase-repository.js', 'types/domain.js', 'package.json']) {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/balepay|Bale Pay|بله‌پی|zarinpal|bluepal/i.test(body), `${file} still names a retired gateway`);
  }
  const authUi = fs.readFileSync(path.join(ROOT, 'services', 'auth-ui.js'), 'utf8');
  assert.match(authUi, /g\.checkBluPalStatus = async function/, 'the admin panel needs the BluPal status action');
  assert.match(authUi, /fetch\('\/api\/payment\/blupal\/status'/);
  assert.match(authUi, /payment\.provider === 'blupal'/, 'the transactions table must filter BluPal rows');
  assert.match(authUi, /\/api\/payment\/blupal\/notify/, 'the admin panel must show the webhook URL to register');
  assert.match(authUi, /Callback page/, 'the admin panel must point at the panel-level return page setting');
  assert.match(authUi, /blu_test_/);
  assert.ok(!/merchant_id|sk_test_|sk_live_|BLUPAL_WEBHOOK_SECRET/.test(authUi), 'the admin card must describe this gateway only');
  section('storefront and admin wiring');

  /* 23) client bridge: receipt storage, https-only redirect, polling that asks the server */
  const bridge = fs.readFileSync(path.join(ROOT, 'services', 'blupal-pay.js'), 'utf8');
  const store = new Map();
  const calls = [];
  const sandbox = {
    console,
    setTimeout: (fn) => { calls.push('tick'); return fn(); },
    URLSearchParams,
    fetch: async (endpoint, options = {}) => {
      calls.push(`${options.method || 'GET'} ${endpoint}`);
      if (endpoint === '/api/payment/blupal/status') return response({ minAmountToman: 10000, maxAmountToman: 50000000, paymentEnabled: true, mode: 'sandbox' });
      if (endpoint === '/api/payment/blupal/request') {
        return response({ success: true, provider: 'blupal', orderId, paymentUrl, invoiceId, finalAmountRial: amountRial + 123, receipt: 'server-receipt-token' });
      }
      calls.push(`body:${options.body}`);
      return response({ success: true, provider: 'blupal', orderId, outcome: 'pending', receipt: 'server-receipt-token' });
    },
    sessionStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      key: index => [...store.keys()][index] ?? null,
      get length() { return store.size; }
    },
    location: { search: '', assign(url) { calls.push(`assign:${url}`); } },
    ToubaAuth: { getAccessToken: async () => 'browser-access-token' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(bridge, sandbox, { filename: 'services/blupal-pay.js' });
  const api = sandbox.ToubaBluPal;
  assert.equal(typeof api.requestGateway, 'function');
  assert.equal(typeof api.retryPayment, 'function');
  assert.equal(api.REQUEST_ENDPOINT, '/api/payment/blupal/request');
  assert.equal(api.RECEIPT_ENDPOINT, '/api/payment/blupal/receipt');
  assert.equal(api.STATUS_ENDPOINT, '/api/payment/blupal/status');
  const bounds = await api.limits();
  assert.equal(bounds.minAmountToman, 10000);
  await assert.rejects(() => api.requestGateway(orderId, { amountToman: 5000 }), /حداقل مبلغ قابل پرداخت/, 'a too-small cart is refused before an invoice is attempted');
  await assert.rejects(() => api.requestGateway(orderId, { amountToman: 60000000 }), /سقف هر فاکتور/);
  const gateway = await api.requestGateway(orderId);
  assert.equal(gateway.paymentUrl, paymentUrl);
  assert.equal(gateway.finalAmountRial, amountRial + 123);
  assert.equal(store.get('touba.blupal.receipt.' + orderId) !== undefined, true, 'the receipt must survive the redirect to the payment page');
  assert.equal(store.get('touba.blupal.pending.' + orderId) !== undefined, true, 'a pending order must be remembered for the result page');
  assert.equal(api.pendingOrderId(), orderId);
  assert.equal(api.receiptFor(orderId), 'server-receipt-token');
  assert.equal(api.openPayment({ paymentUrl }), paymentUrl);
  assert.equal(calls.includes(`assign:${paymentUrl}`), true, 'the browser is redirected to the gateway page');
  assert.throws(() => api.openPayment({ paymentUrl: 'http://blupal.top/pay/1' }), /معتبر نیست/, 'plain http is never opened');
  assert.throws(() => api.openPayment({ paymentUrl: 'javascript:alert(1)' }), /معتبر نیست/);
  assert.throws(() => api.openPayment({}), /معتبر نیست/);
  assert.equal(api.normalizeStatus('PAID'), 'paid', 'a gateway invoice status maps to the same outcome');
  assert.equal(api.normalizeStatus('CANCELED'), 'cancelled', 'the one-L spelling is normalised too');
  assert.equal(api.normalizeStatus({ outcome: 'paid' }), 'paid');
  assert.equal(api.normalizeStatus({ outcome: 'failed_attempt' }), 'pending', 'the invented failed-attempt outcome is gone');
  assert.equal(api.normalizeStatus({ outcome: 'manual' }), 'pending');
  assert.equal(api.normalizeStatus('SOMETHING_ELSE'), 'pending', 'an unknown status must never look like a payment');
  assert.equal(api.groupDigits(1250123), '1٬250٬123');
  assert.ok(!/tapi\.bale|Bale\.WebApp|openInvoice|ble\.ir/.test(bridge), 'no messenger SDK in the client bridge');
  assert.ok(!/X-API-Key|BLUPAL_API_KEY/.test(bridge), 'the API key must never appear in browser code');
  assert.ok(!/fetch\(['"`]https?:/.test(bridge), 'the browser must never call the gateway directly');
  assert.deepEqual([...bridge.matchAll(/const (?:REQUEST|RECEIPT|STATUS)_ENDPOINT = '([^']+)'/g)].map(m => m[1]),
    ['/api/payment/blupal/request', '/api/payment/blupal/receipt', '/api/payment/blupal/status'], 'the bridge only talks to our own server');
  assert.match(bridge, /Authorization: `Bearer \$\{token\}`/);
  assert.match(bridge, /GET \/v1\/invoices\/\{invoice_id\}/, 'the bridge documents that only the server verifies');
  api.clearPending(orderId);
  assert.equal(store.has('touba.blupal.pending.' + orderId), false);
  api.forgetReceipt(orderId);
  assert.equal(store.has('touba.blupal.receipt.' + orderId), false);
  section('client bridge behaviour');

  /* 24) ops CLI: no invented commands, and the sandbox helper is documented */
  assert.match(cliJs, /command === 'simulate'/);
  assert.match(cliJs, /blupal\.simulatePayment/);
  assert.match(cliJs, /config: blupal\.getConfig\(\)/.test(cliJs) ? /const config = blupal\.getConfig\(\);/ : /x/);
  for (const removed of ['merchantId', 'verifyPayment', 'requestPayment', 'BLUPAL_MERCHANT_ID']) {
    assert.ok(!cliJs.includes(removed), `the CLI must not keep ${removed}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['blupal:status'], 'node scripts/blupal-cli.js config');
  assert.equal(packageJson.scripts['blupal:check'], 'node scripts/blupal-cli.js verify');
  assert.match(packageJson.scripts.test, /tests\/blupal\.js/);
  const ops = fs.readFileSync(path.join(ROOT, 'BLUPAL_OPERATIONS.md'), 'utf8');
  for (const must of ['blupal.top', 'X-API-Key', 'final_amount', 'Webhook درگاه', 'Callback page', 'simulate', '200', 'invoice_id',
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'missingDatabaseKeys',
    'API Keys', 'Create new key', 'Redeploy', 'sb_publishable_']) {
    assert.ok(ops.includes(must), `the operations guide must cover ${must}`);
  }
  assert.ok(!/bluepal\.ir|sk_test_|sk_live_|merchant_id/i.test(ops), 'the operations guide must not describe the other vendor');
  assert.ok(!/balepay|Bale Pay|بله‌پی|zarinpal/i.test(ops), 'no retired gateway may reappear in the guide');
  section('ops CLI and guide');

  /* 25) floating transfer-amount guide + admin shipping labels */
  section('floating payment guide and shipping labels');
  const guideSource = fs.readFileSync(path.join(ROOT, 'services', 'payment-guide.js'), 'utf8');
  assert.match(guideSource, /۹۹۰ ریال/, 'the guide must explain the gateway amount-correction band');
  assert.match(guideSource, /عودت/, 'a mismatched transfer must be explained together with its refund path');
  assert.match(guideSource, /رقم‌به‌رقم/, 'the guide must demand digit-exact transfers');
  for (const pathMarker of ["'/cart'", "'/checkout'", '/payment/result/']) {
    assert.ok(guideSource.includes(pathMarker), `the guide must appear on ${pathMarker}`);
  }
  assert.ok(!/fetch\(/.test(guideSource), 'the guide is static text and must never hit the network');
  assert.match(guideSource, /z-index:70/, 'the guide must sit below the modal layer (z-index 90)');
  const guideIndexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(guideIndexHtml, /<script src="\/services\/payment-guide\.js" defer><\/script>/, 'the guide must be loaded by the storefront');
  assert.ok(guideIndexHtml.indexOf('/services/blupal-pay.js') < guideIndexHtml.indexOf('/services/payment-guide.js'), 'the guide loads after the payment bridge');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'build-vercel.js'), 'utf8'), /'services\/payment-guide\.js'/, 'the guide must ship to Vercel');
  // The module must be eval-safe for Node (no DOM at load) and expose its pure logic.
  const fakeWindow = {
    location: { pathname: '/checkout' },
    sessionStorage: (() => { const box = new Map(); return { getItem: key => (box.has(key) ? box.get(key) : null), setItem: (key, value) => box.set(key, value) }; })()
  };
  new Function('window', guideSource)(fakeWindow);
  const guide = fakeWindow.ToubaPaymentGuide;
  assert.ok(guide && Array.isArray(guide.STEPS) && guide.STEPS.length >= 4, 'the guide exposes its steps without a browser');
  assert.equal(guide.isGuidePath('/checkout'), true);
  assert.equal(guide.isGuidePath('/cart'), true);
  assert.equal(guide.isGuidePath('/payment/result/tb-1'), true);
  assert.equal(guide.isGuidePath('/product/shoe'), false);
  assert.equal(guide.isGuidePath('/admin'), false);
  assert.equal(guide.isResultPath('/payment/result/tb-1'), true);
  assert.equal(guide.isResultPath('/checkout'), false);
  assert.equal(guide.acknowledged(), false, 'a fresh tab has not read the guide yet');
  guide.acknowledge();
  assert.equal(guide.acknowledged(), true, '«فهمیدم» must stick for the rest of the tab session');
  const authUiSource = fs.readFileSync(path.join(ROOT, 'services', 'auth-ui.js'), 'utf8');
  const authUiExports = authUiSource.match(/g\.ToubaAuthUI = Object\.freeze\(\{[\s\S]*?\}\);/)?.[0] || '';
  assert.match(authUiExports, /shippingLabelModal/, 'the modal must be on the public panel API');
  assert.match(authUiExports, /copyShippingLabel/, 'the clipboard helper must be on the public panel API');
  assert.ok((authUiSource.match(/onclick="ToubaAuthUI\.shippingLabelModal\(/g) || []).length >= 2, 'both the orders section and the dashboard must offer the label');
  assert.match(authUiSource, /کد پستی: /, 'the label carries the postal code for the post office');
  assert.match(authUiSource, /آدرس: /, 'the label carries the full address');
  assert.match(authUiSource, /هنوز نزد درگاه تأیید نشده/, 'the label must block shipping while the gateway has not confirmed payment');
  assert.match(authUiSource, /execCommand/, 'the copy helper needs a fallback for browsers without the clipboard API');

  /* 26) the whole suite ran; nothing may have touched the network */
  assert.ok(results.length >= 20, `all documented areas must be covered (only ${results.length})`);
  for (const required of ['POST /v1/invoices/create contract', 'GET /v1/invoices/{invoice_id} contract', 'sandbox simulation', 'Supabase migration contract', 'environment templates', 'client bridge behaviour', 'floating payment guide and shipping labels']) {
    assert.ok(results.includes(required), `missing covered area: ${required}`);
  }
  assert.equal(BluPal.PROVIDER, 'blupal');
  assert.equal(BluPal.PROVIDER_LABEL.includes('بلوپال'), true);
  assert.equal(BluPal.DEFAULT_API_BASE, 'https://blupal.top/api');
  assert.deepEqual(BluPal.SANDBOX_SCENARIOS, ['success', 'wrong_amount', 'expire', 'cancel']);
  assert.equal(typeof BluPal.BLUPAL_CODES, 'undefined', 'the numeric result-code table belonged to the other gateway');
  console.log(`PASS: BluPal invoice→card-to-card→webhook contract, rial bounds, short invoice ids, single-source settlement from GET /v1/invoices/{id}, sandbox-only simulation, webhook retry etiquette, Supabase migration, RPC allow-list, env templates, route wiring and the client bridge (${results.length} sections)`);
})().catch(error => { console.error(error); process.exit(1); });

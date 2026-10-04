'use strict';
/* BluePal (بلو پال) gateway tests — the three documented calls, the settlement rules, the
 * server handlers, the storefront wiring and the environment templates.
 * Every network call is stubbed; nothing leaves this machine and no real key is used. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BluePal = require('../lib/bluepal.js');

const ROOT = path.join(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '202610050001_bluepal_provider.sql');

const apiKey = 'sk_test_' + crypto.randomBytes(16).toString('hex');
const liveKey = 'sk_live_' + crypto.randomBytes(16).toString('hex');
const stateSecret = crypto.randomBytes(32).toString('hex');
const env = {
  BLUEPAL_MODE: 'sandbox',
  BLUEPAL_API_KEY: apiKey,
  BLUEPAL_MERCHANT_ID: 'MRC-1001',
  BLUEPAL_STATE_SECRET: stateSecret,
  BLUEPAL_API_BASE: 'https://www.bluepal.ir/api'
};
const fixedNow = Date.UTC(2026, 9, 5, 9, 30, 0);
const orderId = '20000000-0000-4000-8000-000000000002';
const paymentId = '30000000-0000-4000-8000-000000000003';
const userId = '10000000-0000-4000-8000-000000000001';
const amountToman = 125000;
const trackId = 'TRK-8841203991';
const paymentUrl = `https://www.bluepal.ir/pay/${trackId}`;
const referenceId = 'rr_139876543210';
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

function paymentRow(overrides = {}) {
  return {
    id: paymentId,
    order_id: orderId,
    status: 'pending',
    amount_toman: amountToman,
    authority: trackId,
    provider: 'bluepal',
    provider_reference: null,
    provider_code: null,
    callback_payload: { provider: 'bluepal', trackId, paymentUrl, gatewayAmountToman: amountToman, attempts: [] },
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

/* Mock of both worlds: the BluePal REST API and the Supabase REST/RPC surface. */
function makeFetch(state, gateway = {}) {
  return async (url, options = {}) => {
    const target = String(url);
    state.urls.push(target);
    if (target.includes('/v1/payments/request')) {
      const body = JSON.parse(options.body || '{}');
      state.requests.push({ body, headers: options.headers || {}, method: options.method });
      const handler = gateway.request || (() => response({ result: 100, track_id: trackId, payment_url: paymentUrl, amount: body.amount }));
      return handler(body, state);
    }
    if (target.includes('/v1/payments/verify/')) {
      const asked = decodeURIComponent(target.split('/verify/')[1].split('?')[0]);
      state.verifies.push({ asked, headers: options.headers || {}, method: options.method, hasBody: options.body !== undefined });
      const handler = gateway.verify || (() => response({ result: 100, status: 'success', amount: amountToman, reference_id: referenceId }));
      return handler(asked, state);
    }
    if (target.includes('/rest/v1/rpc/')) {
      state.rpc.push({ name: target.split('/rpc/')[1].split('?')[0], body: JSON.parse(options.body || '{}') });
      return response(state.rpcResponse ?? { success: true });
    }
    if (target.includes('/rest/v1/payments')) {
      const query = new URL(target).searchParams;
      assert.equal(query.get('provider'), 'eq.bluepal', 'payment rows must always be scoped to the bluepal provider');
      if (state.payments && state.payments.length && String(query.get('authority') || '').startsWith('eq.')) {
        const wanted = query.get('authority').slice(3);
        const payment = state.payments.find(row => row.authority === wanted);
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

function newState(extra = {}) {
  return { urls: [], requests: [], verifies: [], rpc: [], ...extra };
}

const results = [];
function section(name) { results.push(name); }

(async () => {
  /* 1) request contract: integer toman, merchant_id, callback_url, header-only key */
  const state = newState();
  const fetchImpl = makeFetch(state);
  const config = BluePal.getConfig(env);
  assert.equal(config.configured, true);
  assert.equal(config.keyKind, 'test');
  assert.equal(config.payHosts.includes('www.bluepal.ir'), true);
  const created = await BluePal.requestPayment({
    config,
    amountToman,
    callbackUrl: `https://shop.example.test${BluePal.CALLBACK_PATH}?order=${orderId}`,
    description: 'سفارش TB-20261005-ABC12345',
    orderId,
    fetchImpl
  });
  assert.equal(created.trackId, trackId);
  assert.equal(created.paymentUrl, paymentUrl);
  assert.equal(created.amountToman, amountToman);
  assert.equal(state.urls[0], 'https://www.bluepal.ir/api/v1/payments/request');
  assert.equal(state.requests[0].method, 'POST');
  assert.equal(state.requests[0].body.amount, amountToman, 'BluePal amounts are integer TOMAN, never rial');
  assert.equal(state.requests[0].body.merchant_id, 'MRC-1001');
  assert.equal(state.requests[0].body.callback_url, `https://shop.example.test${BluePal.CALLBACK_PATH}?order=${orderId}`);
  assert.match(state.requests[0].body.description, /TB-20261005/);
  assert.equal(state.requests[0].headers.Authorization, `Bearer ${apiKey}`, 'documented auth is a bearer header');
  assert.equal(state.requests[0].headers['Content-Type'], 'application/json');
  assert(!JSON.stringify(state.requests[0].body).includes(apiKey), 'the key must never travel in the body');
  assert(!Object.keys(state.requests[0].body).some(key => /api_key|token/i.test(key)));
  section('POST /v1/payments/request contract');

  /* 2) tolerant response shapes: data nesting and a bare numeric track id */
  const nested = await BluePal.requestPayment({
    config, amountToman: 42000, callbackUrl: 'https://shop.example.test/cb',
    fetchImpl: makeFetch(newState(), {
      request: () => response({ data: { result: 100, track_id: '8841203991', payment_url: 'https://www.bluepal.ir/pay/8841203991' } })
    })
  });
  assert.equal(nested.trackId, '8841203991');
  assert.equal(nested.paymentUrl, 'https://www.bluepal.ir/pay/8841203991');
  assert.equal(nested.amountToman, 42000);
  assert.equal(BluePal.readTrackId({ track_id: 'TRK-123456' }), 'TRK-123456');
  assert.equal(BluePal.readTrackId({ track_id: 'ab' }), '', 'short or malformed track ids are refused');
  assert.equal(BluePal.readTrackId({ track_id: 'x'.repeat(80) }), '');
  section('response shape tolerance');

  /* 3) payment_url is validated before the browser is sent anywhere */
  for (const [url, pattern] of [
    ['https://evil.example.test/pay/1', /میزبان/],
    ['http://www.bluepal.ir/pay/1', /امن نیست/],
    ['not-a-url', /معتبر برنگرداند/],
    ['https://user:pw@www.bluepal.ir/pay/1', /امن نیست/]
  ]) {
    await assert.rejects(() => BluePal.requestPayment({
      config, amountToman, callbackUrl: 'https://shop.example.test/cb',
      fetchImpl: makeFetch(newState(), { request: () => response({ result: 100, track_id: trackId, payment_url: url }) })
    }), pattern);
  }
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_ALLOWED_PAY_HOSTS: 'pay.bluepal.ir, www.bluepal.ir ' }).payHosts.join(','), 'pay.bluepal.ir,www.bluepal.ir');
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_ALLOWED_PAY_HOSTS: 'evil.test' }).payHosts.join(','), 'evil.test', 'operator may widen the allow-list');
  section('payment_url host pinning');

  /* 4) documented result codes on the request call */
  for (const [code, expectedStatus, messagePattern] of [
    [102, 502, /پارامتر الزامی|parameter/i],
    [105, 502, /فعال نیست|پنل|accept|پذیرنده/i],
    [202, 502, /ناموفق/],
    [429, 503, /حد مجاز/]
  ]) {
    const error = await BluePal.requestPayment({
      config, amountToman, callbackUrl: 'https://shop.example.test/cb',
      fetchImpl: makeFetch(newState(), { request: () => response({ result: code, message: code === 429 ? 'تعداد درخواست‌ها بیش از حد مجاز است' : undefined }) })
    }).catch(err => err);
    assert.ok(error instanceof Error, `code ${code} must reject`);
    assert.equal(error.status, expectedStatus, `code ${code} must map to HTTP ${expectedStatus}`);
    assert.match(error.message, messagePattern);
    assert.equal(error.bluepalCode, code, 'the gateway code is preserved for the UI/DB');
  }
  const unknownCode = await BluePal.requestPayment({
    config, amountToman, callbackUrl: 'https://shop.example.test/cb',
    fetchImpl: makeFetch(newState(), { request: () => response({ result: 999, message: '???' }) })
  }).catch(err => err);
  assert.match(unknownCode.message, /ناشناخته/, 'an undocumented code must never be treated as success');
  const httpAuth = await BluePal.requestPayment({
    config, amountToman, callbackUrl: 'https://shop.example.test/cb',
    fetchImpl: () => response({ message: 'unauthorized' }, 401)
  }).catch(err => err);
  assert.match(httpAuth.message, /BLUEPAL_API_KEY/);
  assert.equal(httpAuth.status, 502);
  section('result-code mapping (102/105/202/429/999/401)');

  /* 5) verify is a GET with no body and header-only auth */
  const verifyState = newState();
  const verified = await BluePal.verifyPayment({
    config, trackId, expectedAmountToman: amountToman,
    fetchImpl: makeFetch(verifyState, { verify: () => response({ result: 100, status: 'success', amount: amountToman, reference_id: referenceId, card_pan: '502229******0008' }) })
  });
  assert.equal(verified.outcome, 'paid');
  assert.equal(verified.referenceId, referenceId);
  assert.equal(verified.cardPan, '0008');
  assert.equal(verified.alreadyVerified, false);
  assert.equal(verifyState.verifies[0].method, 'GET');
  assert.equal(verifyState.verifies[0].hasBody, false, 'verify takes no body');
  assert.equal(verifyState.verifies[0].asked, trackId);
  assert.equal(verifyState.verifies[0].headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(verifyState.verifies[0].headers['Content-Type'], undefined);
  section('GET /v1/payments/verify/{track_id} contract');

  /* 6) verify outcomes drive the settlement decision */
  const outcomes = [
    [100, 'success', 'paid', false],
    [201, 'success', 'paid', true],
    [100, 'failed', 'failed', false],
    [202, 'failed', 'failed', false],
    [404, '', 'unknown', false],
    [429, '', 'throttled', false],
    [105, '', 'error', false]
  ];
  for (const [code, status, outcome, already] of outcomes) {
    const result = await BluePal.verifyPayment({
      config, trackId, expectedAmountToman: amountToman,
      fetchImpl: makeFetch(newState(), { verify: () => response({ result: code, status, amount: amountToman }) })
    });
    assert.equal(result.outcome, outcome, `verify ${code}/${status} must map to ${outcome}`);
    assert.equal(result.alreadyVerified, already);
    assert.equal(result.amountToman, amountToman);
  }
  await assert.rejects(() => BluePal.verifyPayment({
    config, trackId, expectedAmountToman: amountToman,
    fetchImpl: makeFetch(newState(), { verify: () => response({ result: 100, status: 'success', amount: 100 }) })
  }), /هم‌خوانی ندارد/, 'a gateway amount that differs from the order blocks settlement');
  await assert.rejects(() => BluePal.verifyPayment({ config, trackId: 'nope', fetchImpl: () => response({}) }), /کد پیگیری/);
  section('verify outcomes and amount cross-check');

  /* 7) signed receipt round-trip, tampering and expiry */
  const receipt = BluePal.makeReceipt({ orderId, amountToman, trackId }, config, { outcome: 'pending', providerCode: 'REQUEST_CREATED', now: () => fixedNow });
  const readBack = BluePal.readReceipt(receipt, config, fixedNow + 1000);
  assert.equal(readBack.orderId, orderId);
  assert.equal(readBack.amountToman, amountToman);
  assert.equal(readBack.trackId, trackId);
  assert.equal(readBack.provider, 'bluepal');
  assert.throws(() => BluePal.readReceipt(receipt.slice(0, -1) + (receipt.endsWith('a') ? 'b' : 'a'), config, fixedNow), /امضای وضعیت پرداخت معتبر نیست/);
  assert.throws(() => BluePal.readReceipt('zzzz.yyyy', config, fixedNow), /معتبر نیست/, 'a malformed receipt is refused');
  assert.throws(() => BluePal.readReceipt('a.b.c', config, fixedNow), /رسید پرداخت معتبر نیست/);
  assert.throws(() => BluePal.readReceipt(receipt, config, fixedNow + 25 * 60 * 60 * 1000), /مهلت اعتبار/, 'receipts must expire');
  const forged = BluePal.signPayload({ v: 1, provider: 'bluepal', orderId, amountToman: 1, trackId }, 'a-different-secret');
  assert.throws(() => BluePal.readReceipt(forged, config, fixedNow), /امضای وضعیت پرداخت معتبر نیست/);
  section('signed receipt round-trip');

  /* 8) callback token signs the order and track id */
  const token = BluePal.makeCallbackToken({ orderId, trackId }, config, () => fixedNow);
  assert.match(token, /^\d+\.[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(BluePal.readCallbackToken({ orderId, trackId, token }, config, fixedNow).trackId, trackId);
  assert.throws(() => BluePal.readCallbackToken({ orderId, trackId: 'TRK-9999999999', token }, config, fixedNow), /هم‌خوانی ندارد/, 'the token is bound to the track id');
  assert.throws(() => BluePal.readCallbackToken({ orderId, trackId, token: '1.deadbeefdeadbeefdeadbeef' }, config, fixedNow), /امضای آدرس بازگشت/);
  const staleIssued = Math.floor((fixedNow - 25 * 60 * 60 * 1000) / 1000);
  const staleBody = `cb|${orderId}|${trackId}|${staleIssued}`;
  const staleSig = require('node:crypto').createHmac('sha256', stateSecret).update(staleBody).digest('base64url').slice(0, 22);
  assert.throws(() => BluePal.readCallbackToken({ orderId, trackId, token: `${staleIssued}.${staleSig}` }, config, fixedNow), /مهلت اعتبار/);
  section('callback token binding');

  /* 9) request handler: DB amount wins, attach RPC, signed callback url, auth gates */
  const handlerState = newState({ order: orderRow(), payments: [paymentRow({ authority: null, callback_payload: {} })] });
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  const useEnv = (overrides = {}) => Object.assign(process.env, {
    ...env,
    BLUEPAL_API_KEY: apiKey,
    SUPABASE_URL: dbConfig.baseUrl,
    SUPABASE_PUBLISHABLE_KEY: dbConfig.publicKey,
    SUPABASE_SERVICE_ROLE_KEY: dbConfig.serviceRoleKey,
    ...overrides
  });
  try {
    useEnv();
    globalThis.fetch = makeFetch(handlerState);
    const okRes = makeRes();
    await BluePal.request({ method: 'POST', headers: authHeaders, body: { orderId, amountToman: 1 } }, okRes);
    assert.equal(okRes.statusCode, 200);
    const body = parseBody(okRes);
    assert.equal(body.provider, 'bluepal');
    assert.equal(body.success, true);
    assert.equal(body.trackId, trackId);
    assert.equal(body.paymentUrl, paymentUrl);
    assert.equal(body.openMode, 'redirect');
    assert.equal(body.amountToman, amountToman, 'the server must charge the stored order total, not the client number');
    assert.equal(body.amountRial, amountToman * 10, 'rial is display-only');
    assert.match(body.callbackUrl, new RegExp(`^https://shop\\.example\\.test/api/payment/bluepal/callback\\?order=${orderId}&sig=\\d+\\.[A-Za-z0-9_-]{22}$`));
    assert.ok(body.receipt.length > 40);
    assert.equal(body.pollAfterMs > 0 && body.pollAfterMs < 120000, true);
    const attach = handlerState.rpc.find(call => call.name === 'attach_bluepal_payment');
    assert.ok(attach, 'the track id must be recorded through the service-role RPC');
    assert.equal(attach.body.p_order_id, orderId);
    assert.equal(attach.body.p_track_id, trackId);
    assert.equal(attach.body.p_payment_url, paymentUrl);
    assert.equal(attach.body.p_gateway_amount, amountToman);
    assert.equal(typeof attach.body.p_last_code, 'string', 'PostgREST resolves text params; numbers break the call');
    assert.equal(typeof attach.body.p_gateway_amount, 'number', 'the bigint param must stay numeric');
    assert.equal(handlerState.requests[0].body.amount, amountToman);

    const evilRes = makeRes();
    await BluePal.request({ method: 'POST', headers: { origin: 'https://evil.test', host: 'shop.example.test', authorization: authHeaders.authorization }, body: { orderId } }, evilRes);
    assert.equal(evilRes.statusCode, 403, 'a foreign Origin must be refused');
    const anonRes = makeRes();
    await BluePal.request({ method: 'POST', headers: req.headers, body: { orderId } }, anonRes);
    assert.equal(anonRes.statusCode, 401, 'anonymous callers cannot create gateway requests');
    const badIdRes = makeRes();
    await BluePal.request({ method: 'POST', headers: authHeaders, body: { orderId: '1; drop table' } }, badIdRes);
    assert.equal(badIdRes.statusCode, 400);
    const methodRes = makeRes();
    await BluePal.request({ method: 'GET', headers: authHeaders }, methodRes);
    assert.equal(methodRes.statusCode, 405);
    section('POST /api/payment/bluepal/request');

    /* 10) polling settles through the single-use settle RPC */
    const paidState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(paidState);
    const pollRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId } }, pollRes);
    assert.equal(pollRes.statusCode, 200);
    const pollBody = parseBody(pollRes);
    assert.equal(pollBody.outcome, 'paid');
    assert.equal(pollBody.code, 100);
    assert.equal(pollBody.referenceId, referenceId);
    assert.equal(pollBody.waitingForVerify, false);
    const settle = paidState.rpc.find(call => call.name === 'settle_bluepal_payment');
    assert.ok(settle, 'settlement must go through settle_bluepal_payment');
    assert.equal(settle.body.p_outcome, 'paid');
    assert.equal(settle.body.p_amount_toman, amountToman);
    assert.equal(settle.body.p_authority, trackId);
    assert.equal(settle.body.p_reference_id, referenceId);
    assert.equal(settle.body.p_callback_payload.provider, 'bluepal');
    assert.equal(paidState.verifies.length, 1, 'exactly one verify call per settlement attempt');

    /* 11) 202 leaves the row untouched so the customer can retry */
    const failedState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(failedState, { verify: () => response({ result: 202, message: 'تراکنش ناموفق بود' }) });
    const failedRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId } }, failedRes);
    assert.equal(parseBody(failedRes).outcome, 'failed_attempt', 'a failed attempt is not a closed payment');
    assert.equal(failedState.rpc.length, 0, 'nothing may be written for a 202 so the retry stays possible');

    /* 12) 404 (wrong/foreign track id) is never a payment */
    const missingState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(missingState, { verify: () => response({ result: 404, message: 'not found' }) });
    const missingRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId } }, missingRes);
    const missingBody = parseBody(missingRes);
    assert.equal(missingBody.outcome, 'pending');
    assert.equal(missingBody.providerCode, 'NOT_FOUND_404');
    assert.equal(missingState.rpc.length, 0);

    /* 13) an already verified row replays without touching the gateway */
    const replayState = newState({ order: orderRow({ status: 'paid' }), payments: [paymentRow({ status: 'verified', provider_reference: referenceId, verified_at: new Date(fixedNow).toISOString() })] });
    globalThis.fetch = makeFetch(replayState);
    const replayRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId } }, replayRes);
    assert.equal(parseBody(replayRes).outcome, 'paid');
    assert.equal(replayState.verifies.length, 0, 'a verified payment must not be re-verified');
    assert.equal(replayState.rpc.length, 0, 'and must not be settled twice');

    /* 14) the receipt token ties the poll to one order and amount */
    const wrongOrder = BluePal.makeReceipt({ orderId: '40000000-0000-4000-8000-000000000004', amountToman, trackId }, BluePal.getConfig(), { outcome: 'pending' });
    const wrongRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId, receipt: wrongOrder } }, wrongRes);
    assert.equal(wrongRes.statusCode, 403, 'a receipt for another order is refused');
    const wrongAmount = BluePal.makeReceipt({ orderId, amountToman: 1, trackId }, BluePal.getConfig(), { outcome: 'pending' });
    const wrongAmountRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId, receipt: wrongAmount } }, wrongAmountRes);
    assert.equal(wrongAmountRes.statusCode, 403, 'a receipt whose amount differs from the order is refused');
    assert.match(parseBody(wrongAmountRes).error, /هم‌خوانی ندارد/);
    const goodReceipt = BluePal.makeReceipt({ orderId, amountToman, trackId }, BluePal.getConfig(), { outcome: 'pending' });
    const goodState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(goodState);
    const goodRes = makeRes();
    await BluePal.receipt({ method: 'POST', headers: authHeaders, body: { orderId, receipt: goodReceipt } }, goodRes);
    assert.equal(goodRes.statusCode, 200);
    assert.equal(goodState.rpc.some(call => call.name === 'settle_bluepal_payment'), true);
    section('receipt polling, replay and retry rules');

    /* 15) browser callback: only a DB-backed verify may finalise, then the user is redirected */
    const warnSink = console.warn;
    console.warn = () => {};
    const callbackState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(callbackState);
    const redirect = makeRes();
    await BluePal.callback({ method: 'GET', url: `https://shop.example.test/api/payment/bluepal/callback?order=${orderId}&track_id=${encodeURIComponent(trackId)}&sig=garbage`, headers: { host: 'shop.example.test' } }, redirect);
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.Location, `/payment/result/${orderId}`);
    assert.equal(redirect.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(callbackState.verifies.length, 1, 'the callback re-reads the gateway instead of trusting the browser');
    assert.equal(callbackState.rpc.some(call => call.name === 'settle_bluepal_payment'), true);
    const callbackSettle = callbackState.rpc.find(call => call.name === 'settle_bluepal_payment');
    assert.equal(callbackSettle.body.p_callback_payload.source, 'browser-callback:invalid', 'the audit trail records that the browser token was not trusted');
    const paid = makeRes();
    await BluePal.callback({ method: 'GET', url: `https://shop.example.test/api/payment/bluepal/callback?order=${orderId}&result=fail`, headers: { host: 'shop.example.test' } }, paid);
    assert.equal(paid.headers.Location, `/payment/result/${orderId}`, 'the result page, not the query string, decides what the customer sees');
    const junk = makeRes();
    await BluePal.callback({ method: 'GET', url: 'https://shop.example.test/api/payment/bluepal/callback?order=../etc/passwd', headers: { host: 'shop.example.test' } }, junk);
    assert.equal(junk.statusCode, 302);
    assert.equal(junk.headers.Location, '/checkout', 'an unusable order id never reaches the database');
    const wrongMethod = makeRes();
    await BluePal.callback({ method: 'POST', url: 'https://shop.example.test/api/payment/bluepal/callback', body: {} }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
    section('browser callback redirect');

    console.warn = warnSink;
    /* 16) a valid signed callback token is accepted and bound to the order */
    const signedToken = BluePal.makeCallbackToken({ orderId, trackId }, BluePal.getConfig(), () => Date.now());
    const signedRes = makeRes();
    await BluePal.callback({ method: 'GET', url: `https://shop.example.test/api/payment/bluepal/callback?order=${orderId}&sig=${encodeURIComponent(signedToken)}`, headers: { host: 'shop.example.test' } }, signedRes);
    assert.equal(signedRes.statusCode, 302);
    assert.equal(signedRes.headers.Location, `/payment/result/${orderId}`);
    section('signed callback token accepted');

    /* 17) notify: the body is a hint, never a source of truth */
    const notifyState = newState({ order: orderRow(), payments: [paymentRow()] });
    globalThis.fetch = makeFetch(notifyState);
    const notifyRes = makeRes();
    await BluePal.notify({ method: 'POST', headers: {}, body: { track_id: trackId, result: 100, status: 'success', amount: 1 } }, notifyRes);
    assert.equal(notifyRes.statusCode, 200);
    const notifyBody = parseBody(notifyRes);
    assert.equal(notifyBody.handled, true);
    assert.equal(notifyBody.outcome, 'paid');
    assert.equal(notifyState.verifies[0].asked, trackId, 'notify must re-ask the gateway with the stored track id');
    assert.equal(notifyState.rpc.some(call => call.name === 'settle_bluepal_payment'), true);
    const paidByGateway = notifyState.rpc.find(call => call.name === 'settle_bluepal_payment');
    assert.equal(paidByGateway.body.p_amount_toman, amountToman, 'the notify body amount (1) is ignored in favour of the order total');
    const ignoreRes = makeRes();
    await BluePal.notify({ method: 'POST', headers: {}, body: { foo: 'bar' } }, ignoreRes);
    assert.equal(ignoreRes.statusCode, 200);
    assert.equal(parseBody(ignoreRes).reason, 'no_track_id', 'unknown payloads are acked without side effects');
    const notifyMethod = makeRes();
    await BluePal.notify({ method: 'GET', headers: {} }, notifyMethod);
    assert.equal(notifyMethod.statusCode, 405);
    const spoofRes = makeRes();
    await BluePal.notify({ method: 'POST', headers: {}, body: { track_id: 'TRK-0000000000', result: 100 } }, spoofRes);
    assert.equal(spoofRes.statusCode, 404, 'a track id we never issued is refused, and never settled');
    assert.equal(parseBody(spoofRes).received, false);
    const gatewayDownRes = makeRes();
    globalThis.fetch = async () => { throw new Error('gateway down'); };
    await BluePal.notify({ method: 'POST', headers: {}, body: { track_id: trackId } }, gatewayDownRes);
    assert.equal(gatewayDownRes.statusCode, 500, 'a transport failure asks the gateway to try again');
    assert.equal(parseBody(gatewayDownRes).retry, true);
    globalThis.fetch = makeFetch(newState({ order: orderRow(), payments: [paymentRow()] }));
    const wrongSignature = makeRes();
    process.env.BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE = 'true';
    process.env.BLUEPAL_WEBHOOK_SECRET = 'a-reasonably-long-webhook-secret';
    await BluePal.notify({ method: 'POST', headers: {}, body: { track_id: trackId } }, wrongSignature);
    assert.equal(wrongSignature.statusCode, 401, 'signature enforcement is opt-in but strict');
    const rightHeader = makeRes();
    await BluePal.notify({ method: 'POST', headers: { 'x-bluepal-signature': 'a-reasonably-long-webhook-secret' }, body: { track_id: trackId } }, rightHeader);
    assert.equal(rightHeader.statusCode, 200);
    delete process.env.BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE;
    delete process.env.BLUEPAL_WEBHOOK_SECRET;
    section('provider notify handling');

    /* 18) status endpoint shape and secret hygiene */
    const statusRes = makeRes();
    BluePal.status({ method: 'GET' }, statusRes);
    const statusBody = parseBody(statusRes);
    assert.equal(statusBody.provider, 'bluepal');
    assert.equal(statusBody.configured, true);
    assert.equal(statusBody.paymentEnabled, true, 'sandbox checkout is live once the keys are set');
    assert.equal(statusBody.livePaymentsAllowed, true);
    assert.equal(statusBody.mode, 'sandbox');
    assert.equal(statusBody.apiKeyKind, 'test');
    assert.equal(statusBody.amountIsTomanInteger, true);
    assert.equal(statusBody.checkoutStorage, 'supabase-postgres');
    assert.equal(statusBody.liveCheckoutSafe, false);
    assert.equal(statusBody.requiresWebhook, false, 'the notify URL is optional; verify is authoritative');
    assert.deepEqual(statusBody.resultCodes, [100, 102, 105, 201, 202, 404, 429]);
    assert.deepEqual(statusBody.testCards, ['5022291000000008', '5022291000000016', '5022291000000024']);
    const leaked = JSON.stringify(statusBody);
    assert.ok(!leaked.includes(apiKey) && !leaked.includes(stateSecret) && !leaked.includes(dbConfig.serviceRoleKey), 'no secret may reach the browser');
    const statusMethod = makeRes();
    BluePal.status({ method: 'POST' }, statusMethod);
    assert.equal(statusMethod.statusCode, 405);
    process.env.BLUEPAL_MODE = 'production';
    process.env.BLUEPAL_API_KEY = liveKey;
    const productionRes = makeRes();
    BluePal.status({ method: 'GET' }, productionRes);
    const productionBody = parseBody(productionRes);
    assert.equal(productionBody.mode, 'production');
    assert.equal(productionBody.apiKeyKind, 'live');
    assert.equal(productionBody.paymentEnabled, false, 'real money stays locked until BLUEPAL_ENABLE_LIVE_PAYMENTS=true');
    assert.equal(productionBody.livePaymentsAllowed, false);
    delete process.env.BLUEPAL_MODE;
    delete process.env.BLUEPAL_API_KEY;
    section('status endpoint');
  } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith('BLUEPAL_') || key.startsWith('SUPABASE_')) delete process.env[key];
    Object.assign(process.env, savedEnv);
    globalThis.fetch = savedFetch;
  }

  /* 19) configuration and production guard rails */
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_MODE: 'not-a-mode' }).mode, 'sandbox');
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_MODE: 'not-a-mode' }).configured, false, 'an unknown mode fails closed');
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_MODE: 'nope' })).message, /BLUEPAL_MODE/);
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_API_KEY: 'sk_live_short' }).configured, false);
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_API_KEY: 'abc' })).message, /sk_test_/);
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_MERCHANT_ID: '' })).message, /BLUEPAL_MERCHANT_ID/);
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_STATE_SECRET: 'short' })).message, /BLUEPAL_STATE_SECRET/);
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_WEBHOOK_SECRET: 'short' })).message, /BLUEPAL_WEBHOOK_SECRET/);
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_API_BASE: 'http://x.test/path?y=1' })).message, /BLUEPAL_API_BASE/);
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_API_KEY: liveKey }).keyMatchesMode, false, 'a live key in sandbox is refused');
  assert.match(BluePal.configurationError(BluePal.getConfig({ ...env, BLUEPAL_API_KEY: liveKey })).message, /هم‌خوانی ندارد/);
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_API_BASE: 'https://www.bluepal.ir' }).apiBase, 'https://www.bluepal.ir');
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_SETTLE_GRACE_MINUTES: '5' }).settleGraceMinutes, 60, 'the grace window is floored at one hour, like the SQL guard');
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_SETTLE_GRACE_MINUTES: 'garbage' }).settleGraceMinutes, 180);
  assert.equal(BluePal.getConfig({ ...env, BLUEPAL_SETTLE_GRACE_MINUTES: '240' }).settleGraceMinutes, 240);
  assert.equal(BluePal.productionGateError(config), null, 'sandbox needs no extra switch');
  const productionLocked = BluePal.getConfig({ ...env, BLUEPAL_MODE: 'production', BLUEPAL_API_KEY: liveKey });
  assert.equal(productionLocked.livePaymentsAllowed, false);
  assert.match(BluePal.productionGateError(productionLocked).message, /BLUEPAL_ENABLE_LIVE_PAYMENTS/);
  const productionTestKey = BluePal.getConfig({ ...env, BLUEPAL_MODE: 'production', BLUEPAL_ENABLE_LIVE_PAYMENTS: 'true' });
  assert.match(BluePal.productionGateError(productionTestKey).message, /sk_live_/);
  const productionLive = BluePal.getConfig({ ...env, BLUEPAL_MODE: 'production', BLUEPAL_ENABLE_LIVE_PAYMENTS: 'true', BLUEPAL_API_KEY: liveKey });
  assert.equal(productionLive.livePaymentsAllowed, true);
  await assert.rejects(() => BluePal.createPaymentIntent({
    body: { orderId, amountToman }, req, origin: 'https://shop.example.test', env: { ...env, BLUEPAL_MODE: 'production', BLUEPAL_API_KEY: liveKey },
    fetchImpl: () => { throw new Error('production must stay blocked until the live switch is set'); }
  }), error => error.status === 503 && /BLUEPAL_ENABLE_LIVE_PAYMENTS/.test(error.message));
  await assert.rejects(() => BluePal.createPaymentIntent({
    body: { orderId, amountToman }, req, origin: 'https://attacker.example.test', env,
    fetchImpl: () => { throw new Error('must not fetch'); }
  }), /مبدأ درخواست با دامنه/);
  await assert.rejects(() => BluePal.createPaymentIntent({
    body: { orderId, amountToman: 0 }, req, origin: 'https://shop.example.test', env,
    fetchImpl: () => { throw new Error('must not fetch'); }
  }), /عدد صحیح/);
  await assert.rejects(() => BluePal.requestPayment({
    config, amountToman: 125000.5, callbackUrl: 'https://x.test/cb', fetchImpl: () => { throw new Error('must not fetch'); }
  }), /عدد صحیح/, 'fractional toman is refused before the gateway sees it');
  section('config and production gates');

  /* 20) persistSettlement refuses to write anything unsafe */
  const guardDb = { ...dbConfig };
  await assert.rejects(() => BluePal.persistSettlement(
    { orderId, authority: trackId, amountToman: 1, outcome: 'paid' },
    { dbConfig: guardDb, fetchImpl: makeFetch(newState({ order: orderRow(), payments: [paymentRow()] })) }
  ), /مبلغ/, 'a mismatched amount is rejected');
  await assert.rejects(() => BluePal.persistSettlement(
    { orderId, authority: 'TRK-0000000001', amountToman, outcome: 'paid' },
    { dbConfig: guardDb, fetchImpl: makeFetch(newState({ order: orderRow(), payments: [paymentRow()] })) }
  ), /کد پیگیری/, 'another track id cannot settle this order');
  await assert.rejects(() => BluePal.persistSettlement(
    { orderId, authority: trackId, amountToman, outcome: 'paid' },
    { dbConfig: guardDb, fetchImpl: makeFetch(newState({ order: orderRow(), payments: [paymentRow({ status: 'failed' })] })) }
  ), /منقضی|پشتیبانی/, 'an expired payment cannot be resurrected by a late notify');
  const idempotent = await BluePal.persistSettlement(
    { orderId, authority: trackId, amountToman, outcome: 'paid' },
    { dbConfig: guardDb, fetchImpl: makeFetch(newState({ order: orderRow({ status: 'paid' }), payments: [paymentRow({ status: 'verified', provider_reference: referenceId })] })) }
  );
  assert.deepEqual(idempotent, { success: true, idempotent: true, orderId, outcome: 'paid' });
  for (const outcome of ['pending', 'failed', 'throttled', 'unknown']) {
    const skipped = await BluePal.persistSettlement({ orderId, outcome, amountToman }, { dbConfig: guardDb, fetchImpl: () => { throw new Error('must not read the database'); } });
    assert.equal(skipped, null, `${outcome} must never write`);
  }
  section('settlement safety rails');

  /* 21) migration contract: provider constraint, single-use settlement, legacy drops */
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  for (const marker of [
    "add constraint payments_provider_bluepal_check check (provider = 'bluepal')",
    'alter column provider drop default',
    "insert into public.payments(order_id, provider, status, amount_toman)\n  values (v_order_id, 'bluepal', 'pending', v_total)",
    'function public.attach_bluepal_payment(',
    'function public.settle_bluepal_payment(',
    'function public.expire_stale_bluepal_checkouts(',
    "p_track_id !~ '^[A-Za-z0-9_-]{6,64}$'",
    "v_payment.provider <> 'bluepal'",
    "if v_payment.status = 'verified' then",
    "if v_payment.status not in ('pending','manual') then",
    'gateway_verification_pending',
    'drop function if exists public.attach_balepay_invoice(uuid,text,text)',
    'drop function if exists public.settle_zarinpal_payment(uuid,text,text,bigint,text,text,jsonb)',
    "provider not in ('zarinpal','balepay','bluepal')",
    "if v_total < 1000 then",
    "message = 'payment track id does not match'",
    'payment status can only be confirmed by the BluePal verify call'
  ]) assert.ok(sql.includes(marker), `migration must contain: ${marker}`);
  assert.match(sql, /begin;\n/, 'the migration must run in one transaction');
  assert.match(sql, /\ncommit;\n/, 'and commit atomically');
  assert.match(sql, /notify pgrst, 'reload schema';/, 'PostgREST must reload the schema');
  assert.ok(!/create trigger|create extension/.test(sql), 'no side effects beyond functions and the provider constraint');
  assert.ok(!/blp_|final_amount|invoice_payload|pre_checkout|sendInvoice|answerPreCheckoutQuery|createInvoiceLink/.test(sql), 'no retired gateway field may survive in SQL');
  // تنها جاهای مجاز برای نام درگاه بازنشسته: جاروب تبدیل ردیف‌های قدیمی و drop های پایانی.
  const legacyLines = sql.split('\n').filter(line => /balepay/i.test(line));
  assert.ok(legacyLines.length > 0, 'the migration must still close out legacy rows and drop the retired RPCs');
  for (const line of legacyLines) {
    assert.ok(/provider (not )?in \('zarinpal','balepay'|payments_provider_balepay_check|drop function if exists public\.\w*balepay/.test(line),
      `legacy gateway may only be named while retiring it, found: ${line.trim()}`);
  }
  section('Supabase migration contract');

  /* 22) RPC names used by the server must be allowed and defined */
  const serverJs = fs.readFileSync(path.join(ROOT, 'lib', 'supabase-server.js'), 'utf8');
  const libJs = fs.readFileSync(path.join(ROOT, 'lib', 'bluepal.js'), 'utf8');
  const rpcSources = ['lib/bluepal.js', 'lib/supabase-server.js', 'scripts/bluepal-cli.js', 'repositories/supabase-repository.js']
    .map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  const rpcNames = [...rpcSources.matchAll(/callServiceRpc\('([a-z_]+)'/g)].map(match => match[1]);
  const gatewayRpcNames = [...libJs.matchAll(/callServiceRpc\('([a-z_]+)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(gatewayRpcNames)].sort(), ['attach_bluepal_payment', 'settle_bluepal_payment'], 'the gateway core only attaches and settles');
  assert.ok(rpcNames.includes('expire_stale_bluepal_checkouts'), 'the ops CLI must use the SQL expiry sweep');
  assert.deepEqual([...serverJs.matchAll(/^  '([a-z_]+)',?$/gm)].map(m => m[1]).sort(), [...new Set(['attach_bluepal_payment','settle_bluepal_payment','expire_stale_bluepal_checkouts'])].sort(), 'the service RPC allow-list is exactly the BluePal set');
  for (const name of new Set(rpcNames)) {
    assert.ok(serverJs.includes(`'${name}'`), `${name} must be on the service RPC allow-list`);
    assert.ok(new RegExp(`function public\\.${name}\\(`).test(sql), `${name} must be defined by the migration`);
  }
  assert.equal((serverJs.match(/provider:\s*'eq\.bluepal'/g) || []).length, 2, 'every payment read must be provider-scoped');
  assert.ok(!/eq\.balepay|eq\.zarinpal/.test(serverJs), 'no retired provider filter may remain');
  section('RPC allow-list parity');

  /* 23) environment templates: same keys in both files, everything the code reads */
  const templates = ['vercel.env.example', '.env.example'];
  const keySets = templates.map(file => new Set([...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(match => match[1])));
  assert.equal(keySets[0].size, keySets[1].size, 'templates must declare the same number of keys');
  for (const key of keySets[0]) assert.ok(keySets[1].has(key), `${key} missing from .env.example`);
  const readNames = new Set();
  const scanDirs = ['lib', 'api', 'services', 'scripts', 'repositories'];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : (/\.(js|json)$/.test(entry.name) ? [path.join(dir, entry.name)] : []));
  for (const file of [...scanDirs.flatMap(walk), 'local-server.js']) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/env\.(BLUEPAL_[A-Z0-9_]*)/g)) readNames.add(match[1]);
  }
  assert.ok(readNames.size >= 13, 'the gateway reads its knobs from BLUEPAL_* variables');
  for (const name of readNames) assert.ok(keySets[0].has(name), `${name} is read by the code but missing from the templates`);
  const envScanner = fs.readFileSync(path.join(ROOT, 'scripts', 'vercel-env.js'), 'utf8');
  for (const required of ['BLUEPAL_MODE', 'BLUEPAL_API_KEY', 'BLUEPAL_MERCHANT_ID', 'BLUEPAL_STATE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.ok(envScanner.includes(`'${required}'`), `${required} must be a required key for the Vercel helper`);
  }
  const plainList = envScanner.split('PUBLIC_NAMES = new Set([')[1].split(']);')[0];
  for (const key of ['BLUEPAL_API_KEY', 'BLUEPAL_STATE_SECRET', 'BLUEPAL_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY']) {
    assert.ok(!new RegExp(`'${key}',?\n`).test(plainList), `${key} must never be stored as a plain Vercel variable`);
  }
  for (const key of ['BLUEPAL_MODE', 'BLUEPAL_SETTLE_GRACE_MINUTES', 'BLUEPAL_ENABLE_LIVE_PAYMENTS']) {
    assert.ok(new RegExp(`'${key}',?\n`).test(plainList), `${key} is not a secret and stays readable`);
  }
  for (const file of templates) {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/balepay|BALEPAY|zarinpal|blupal|Bale Pay/i.test(body), `${file} must not mention a retired gateway`);
    assert.ok(body.includes('BLUEPAL_ENABLE_LIVE_PAYMENTS=false'), `${file} must ship the real-money lock closed`);
  }
  section('environment templates');

  /* 24) route wiring: five functions, vercel.json, local server and the CSP-safe script tag */
  const routes = ['request', 'receipt', 'status', 'callback', 'notify'];
  for (const route of routes) {
    const file = path.join(ROOT, 'api', 'payment', 'bluepal', `${route}.js`);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, new RegExp(`require\\('\\.\\./\\.\\./\\.\\./lib/bluepal\\.js'\\)\\.${route}`), `${route} shim must re-export lib/bluepal.js#${route}`);
    if (route !== 'status') assert.match(source, /bodyParser/, `${route} must pin its body limit`);
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const route of ['request', 'receipt', 'callback', 'notify']) {
    assert.ok(Object.keys(vercel.functions || {}).includes(`api/payment/bluepal/${route}.js`), `${route} needs a function entry`);
  }
  assert.ok(!Object.keys(vercel.functions || {}).some(key => /balepay|zarinpal/i.test(key)));
  const localServer = fs.readFileSync(path.join(ROOT, 'local-server.js'), 'utf8');
  for (const route of routes) assert.ok(localServer.includes(`/api/payment/bluepal/${route}`), `local-server must mount /api/payment/bluepal/${route}`);
  assert.ok(!/readBody\(req, 256/.test(localServer), 'the notify cap must match the function config');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /<script src="\/services\/bluepal-pay\.js"/, 'the client bridge must be loaded');
  assert.ok(!/balepay|ble\.ir|tapi\.bale/i.test(indexHtml), 'no messenger SDK may be loaded on the storefront');
  section('route wiring');

  /* 25) storefront: redirect flow, no messenger wallet, no fabricated invoice UI */
  const stage3 = fs.readFileSync(path.join(ROOT, 'stage3.js'), 'utf8');
  assert.match(stage3, /window\.ToubaBluePal/, 'the storefront must use the BluePal bridge');
  assert.match(stage3, /ToubaBluePal\.requestGateway\(orderId\)/);
  assert.match(stage3, /ToubaBluePal\.openPayment\(gateway\)/);
  assert.ok(!/ToubaBalePay|supportsOpenInvoice|openInvoice|WebApp\.sendPayment/.test(stage3), 'the messenger wallet flow is gone');
  const stage4 = fs.readFileSync(path.join(ROOT, 'stage4.js'), 'utf8');
  assert.match(stage4, /بلو پال/, 'the payment method card must name BluePal');
  assert.ok(!/Bale Pay|بله‌پی/.test(stage4));
  for (const file of ['app.js', 'enhancements.js', 'services/auth-ui.js', 'services/application-services.js', 'repositories/supabase-repository.js', 'types/domain.js', 'package.json']) {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/balepay|Bale Pay|بله‌پی|zarinpal/i.test(body), `${file} still names a retired gateway`);
  }
  const authUi = fs.readFileSync(path.join(ROOT, 'services', 'auth-ui.js'), 'utf8');
  assert.match(authUi, /g\.checkBluePalStatus = async function/, 'the admin panel needs the BluePal status action');
  assert.match(authUi, /fetch\('\/api\/payment\/bluepal\/status'/);
  assert.match(authUi, /payment\.provider === 'bluepal'/, 'the transactions table must filter BluePal rows');
  assert.match(authUi, /\/api\/payment\/bluepal\/notify/, 'the admin panel must show the notify URL to register');
  section('storefront and admin wiring');

  /* 26) client bridge: receipt storage, https-only redirect, polling that asks the server */
  const bridge = fs.readFileSync(path.join(ROOT, 'services', 'bluepal-pay.js'), 'utf8');
  const store = new Map();
  const calls = [];
  const sandbox = {
    console,
    setTimeout: (fn) => { calls.push('tick'); return fn(); },
    URLSearchParams,
    sessionStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      key: index => [...store.keys()][index] ?? null,
      get length() { return store.size; }
    },
    location: { search: '', assign(url) { calls.push(`assign:${url}`); } },
    ToubaAuth: { getAccessToken: async () => 'browser-access-token' },
    fetch: async (endpoint, options = {}) => {
      calls.push(`${options.method || 'GET'} ${endpoint}`);
      if (endpoint === '/api/payment/bluepal/request') {
        return response({ success: true, provider: 'bluepal', orderId, paymentUrl, trackId, receipt: 'server-receipt-token' });
      }
      calls.push(`body:${options.body}`);
      return response({ success: true, provider: 'bluepal', orderId, outcome: 'pending', receipt: 'server-receipt-token' });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(bridge, sandbox, { filename: 'services/bluepal-pay.js' });
  const api = sandbox.ToubaBluePal;
  assert.equal(typeof api.requestGateway, 'function');
  assert.equal(typeof api.retryPayment, 'function');
  assert.equal(api.REQUEST_ENDPOINT, '/api/payment/bluepal/request');
  assert.equal(api.RECEIPT_ENDPOINT, '/api/payment/bluepal/receipt');
  const gateway = await api.requestGateway(orderId);
  assert.equal(gateway.paymentUrl, paymentUrl);
  assert.equal(store.get('touba.bluepal.receipt.' + orderId) !== undefined, true, 'the receipt must survive the redirect to the bank');
  assert.equal(store.get('touba.bluepal.pending.' + orderId) !== undefined, true, 'a pending order must be remembered for the result page');
  assert.equal(api.pendingOrderId(), orderId);
  assert.equal(api.receiptFor(orderId), 'server-receipt-token');
  assert.equal(api.openPayment({ paymentUrl }), paymentUrl);
  assert.equal(calls.includes(`assign:${paymentUrl}`), true, 'the browser is redirected to the gateway page');
  assert.throws(() => api.openPayment({ paymentUrl: 'http://www.bluepal.ir/pay/x' }), /معتبر نیست/, 'plain http is never opened');
  assert.throws(() => api.openPayment({ paymentUrl: 'javascript:alert(1)' }), /معتبر نیست/);
  assert.throws(() => api.openPayment({}), /معتبر نیست/);
  assert.equal(api.normalizeStatus('PAID'), 'paid');
  assert.equal(api.normalizeStatus({ outcome: 'failed_attempt' }), 'failed_attempt');
  assert.equal(api.normalizeStatus('SOMETHING_ELSE'), 'pending', 'an unknown status must never look like a payment');
  assert.ok(!/tapi\.bale|Bale\.WebApp|openInvoice|ble\.ir/.test(bridge), 'no messenger SDK in the client bridge');
  assert.ok(!/fetch\(['"`]https?:/.test(bridge), 'the browser must never call the gateway directly');
  assert.deepEqual([...bridge.matchAll(/const (?:REQUEST|RECEIPT)_ENDPOINT = '([^']+)'/g)].map(m => m[1]), ['/api/payment/bluepal/request', '/api/payment/bluepal/receipt'], 'the bridge only talks to our own server');
  assert.match(bridge, /Authorization: `Bearer \$\{token\}`/);
  api.clearPending(orderId);
  assert.equal(store.has('touba.bluepal.pending.' + orderId), false);
  api.forgetReceipt(orderId);
  assert.equal(store.has('touba.bluepal.receipt.' + orderId), false);
  section('client bridge behaviour');

  /* 27) the whole suite ran; nothing may have touched the network */
  assert.ok(results.length >= 20, `all documented areas must be covered (only ${results.length})`);
  for (const required of ['POST /v1/payments/request contract', 'GET /v1/payments/verify/{track_id} contract', 'Supabase migration contract', 'environment templates', 'client bridge behaviour']) {
    assert.ok(results.includes(required), `missing covered area: ${required}`);
  }
  assert.equal(BluePal.PROVIDER, 'bluepal');
  assert.equal(BluePal.PROVIDER_LABEL.includes('بلو پال'), true);
  assert.equal(BluePal.DEFAULT_API_BASE, 'https://www.bluepal.ir/api');
  assert.deepEqual(BluePal.TRACK_ID_PATTERN.source, '^[A-Za-z0-9_-]{6,64}$');
  console.log(`PASS: BluePal request→redirect→verify contract, result-code mapping, signed receipt/callback tokens, single-use settlement, notify retry, config and production gates, Supabase migration, RPC allow-list, env templates, route wiring and the client bridge (${results.length} sections)`);
})().catch(error => { console.error(error); process.exit(1); });
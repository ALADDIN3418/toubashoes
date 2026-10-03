'use strict';

const crypto = require('node:crypto');
const { sendJson, requestBody, sameOrigin } = require('./vercel-api.js');
const { supabaseServerConfig, serverConfiguration, authenticateCustomer, selectOwnedPendingOrder, selectOrderPayment, callServiceRpc } = require('./supabase-server.js');

const CALLBACK_PATH = '/api/payment/zarinpal/callback';
const RECEIPT_PATH = '/api/payment/zarinpal/receipt';
const MINIMUM_AMOUNT_RIAL = 10000;
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const AUTHORITY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function getConfig(env = process.env) {
  const mode = String(env.ZARINPAL_MODE || 'sandbox').trim().toLowerCase();
  const merchantId = String(env.ZARINPAL_MERCHANT_ID || '').trim();
  const stateSecret = String(env.ZARINPAL_STATE_SECRET || '');
  const validMode = mode === 'sandbox' || mode === 'production';
  const normalizedMode = validMode ? mode : 'sandbox';
  const validMerchantId = /^[A-Za-z0-9-]{36}$/.test(merchantId);
  const validStateSecret = Buffer.byteLength(stateSecret, 'utf8') >= 32;
  const sandbox = normalizedMode === 'sandbox';
  return {
    mode: validMode ? mode : 'sandbox',
    sandbox,
    merchantId,
    stateSecret,
    validMode,
    validMerchantId,
    validStateSecret,
    configured: validMode && validMerchantId && validStateSecret,
    requestUrl: sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
      : 'https://payment.zarinpal.com/pg/v4/payment/request.json',
    verifyUrl: sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://payment.zarinpal.com/pg/v4/payment/verify.json',
    startPayUrl: sandbox
      ? 'https://sandbox.zarinpal.com/pg/StartPay/'
      : 'https://www.zarinpal.com/pg/StartPay/'
  };
}

function configurationError(config) {
  if (!config.validMode) return Object.assign(new Error('ZARINPAL_MODE باید sandbox یا production باشد.'), { status:503 });
  if (!config.validMerchantId) return Object.assign(new Error('شناسه پذیرندهٔ زرین‌پال تنظیم نشده یا معتبر نیست؛ ZARINPAL_MERCHANT_ID باید ۳۶ کاراکتر باشد.'), { status:503 });
  if (!config.validStateSecret) return Object.assign(new Error('کلید امضای بازگشت زرین‌پال تنظیم نشده است؛ ZARINPAL_STATE_SECRET را با یک مقدار تصادفی حداقل ۳۲ کاراکتری در محیط سرور قرار دهید.'), { status:503 });
  return null;
}

function safeStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const config = getConfig(), database = supabaseServerConfig();
  const serverCommerceReady = config.configured && database.serviceConfigured;
  return sendJson(res, 200, {
    success: true,
    provider: 'ZarinPal',
    configured: serverCommerceReady,
    paymentEnabled: serverCommerceReady && config.sandbox,
    mode: config.mode,
    sandbox: config.sandbox,
    callbackPath: CALLBACK_PATH,
    receiptPath: RECEIPT_PATH,
    amountUnit: 'IRR',
    minimumAmountToman: MINIMUM_AMOUNT_RIAL / 10,
    checkoutStorage: 'supabase-postgres',
    liveCheckoutSafe: false,
    note: serverCommerceReady ? 'سفارش، پرداخت و موجودی به Supabase متصل هستند؛ پرداخت واقعی عمداً تا بازبینی Production غیرفعال است.' : 'پیکربندی سروری Supabase یا زرین‌پال کامل نیست؛ پرداخت غیرفعال است.'
  });
}

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function getOrigin(req, explicitOrigin) {
  const originHeader = String(explicitOrigin || req?.headers?.origin || '').trim();
  let origin;
  try { origin = new URL(originHeader); }
  catch { throw Object.assign(new Error('مبدأ معتبر برای ساخت آدرس بازگشت پیدا نشد.'), { status:400 }); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw Object.assign(new Error('مبدأ درخواست پرداخت معتبر نیست.'), { status:400 });
  }
  const requestHost = firstHeader(req?.headers?.['x-forwarded-host'] || req?.headers?.host).toLowerCase();
  if (requestHost && origin.host.toLowerCase() !== requestHost) {
    throw Object.assign(new Error('مبدأ درخواست با دامنهٔ فروشگاه یکسان نیست.'), { status:403 });
  }
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.host);
  if (origin.protocol !== 'https:' && !localHost) {
    throw Object.assign(new Error('درخواست پرداخت فقط روی HTTPS مجاز است.'), { status:400 });
  }
  return origin.origin;
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[\s()-]/g, '');
}

function normalizeOrder(body) {
  const orderId = String(body?.orderId || '').trim();
  const amountToman = Number(body?.amountToman);
  if (!ORDER_ID_PATTERN.test(orderId)) throw Object.assign(new Error('شناسهٔ سفارش معتبر نیست.'), { status:400 });
  if (!Number.isSafeInteger(amountToman) || amountToman <= 0 || amountToman > Math.floor(Number.MAX_SAFE_INTEGER / 10)) {
    throw Object.assign(new Error('مبلغ سفارش باید یک عدد صحیح و معتبر به تومان باشد.'), { status:400 });
  }
  const amountRial = amountToman * 10;
  if (!Number.isSafeInteger(amountRial) || amountRial < MINIMUM_AMOUNT_RIAL) {
    throw Object.assign(new Error('حداقل مبلغ قابل پرداخت زرین‌پال ۱۰۰۰ تومان است.'), { status:400 });
  }
  const mobile = normalizeDigits(body?.phone);
  if (mobile && !/^09\d{9}$/.test(mobile)) throw Object.assign(new Error('شمارهٔ موبایل پرداخت معتبر نیست.'), { status:400 });
  return { orderId, amountToman, amountRial, mobile };
}

function signPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readSignedPayload(token, secret) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra !== undefined || encoded.length > 8192 || signature.length > 128) {
    throw Object.assign(new Error('رسید پرداخت معتبر نیست.'), { status:400 });
  }
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const actualBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    throw Object.assign(new Error('امضای وضعیت پرداخت معتبر نیست.'), { status:403 });
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw Object.assign(new Error('ساختار رسید پرداخت معتبر نیست.'), { status:400 }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('ساختار رسید پرداخت معتبر نیست.'), { status:400 });
  return payload;
}

function assertFresh(timestamp, now) {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at > now + 5 * 60 * 1000 || now - at > MAX_TOKEN_AGE_MS) {
    throw Object.assign(new Error('مهلت اعتبار این درخواست پرداخت به پایان رسیده است.'), { status:410 });
  }
}

async function postZarinpal(url, payload, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw Object.assign(new Error('ارتباط شبکهٔ سرور برای درگاه زرین‌پال در دسترس نیست.'), { status:503 });
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept:'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw Object.assign(new Error('اتصال امن به سرویس زرین‌پال برقرار نشد؛ کمی بعد دوباره تلاش کنید.'), { status:502 });
  }
  let result;
  try { result = await response.json(); }
  catch { throw Object.assign(new Error('پاسخ زرین‌پال قابل‌خواندن نبود.'), { status:502 }); }
  if (!response.ok || !result || typeof result !== 'object') {
    throw Object.assign(new Error(`سرویس زرین‌پال پاسخ موفق نداد (${response.status || 'نامشخص'}).`), { status:502 });
  }
  return result;
}

async function createPaymentRequest({ body, req, origin, env = process.env, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  if (!config.sandbox) throw Object.assign(new Error('دریافت وجه واقعی تا اتصال قیمت، سفارش و موجودی به منبع پایدار سمت سرور غیرفعال است؛ برای آزمایش از حالت sandbox استفاده کنید.'), { status:503 });
  const order = normalizeOrder(body);
  const safeOrigin = getOrigin(req, origin);
  const issuedAt = now();
  const state = signPayload({
    v:1,
    orderId:order.orderId,
    amountToman:order.amountToman,
    issuedAt,
    nonce:crypto.randomBytes(12).toString('base64url')
  }, config.stateSecret);
  const callbackUrl = new URL(CALLBACK_PATH, safeOrigin);
  callbackUrl.searchParams.set('state', state);
  const providerPayload = {
    merchant_id:config.merchantId,
    amount:order.amountRial,
    callback_url:callbackUrl.href,
    description:`پرداخت سفارش کفش طوبی ${order.orderId}`.slice(0,255),
    metadata:{ order_id:order.orderId, ...(order.mobile ? { mobile:order.mobile } : {}) }
  };
  const result = await postZarinpal(config.requestUrl, providerPayload, fetchImpl);
  const data = result?.data;
  if (Number(data?.code) !== 100 || !AUTHORITY_PATTERN.test(String(data?.authority || ''))) {
    throw Object.assign(new Error(`زرین‌پال درخواست پرداخت را نپذیرفت${data?.code !== undefined ? ` (کد ${String(data.code).slice(0,16)})` : ''}.`), { status:502, providerCode:data?.code });
  }
  const authority = String(data.authority);
  return {
    success:true,
    provider:'zarinpal',
    authority,
    amountToman:order.amountToman,
    amountRial:order.amountRial,
    paymentUrl:`${config.startPayUrl}${encodeURIComponent(authority)}`,
    callbackUrl:callbackUrl.href
  };
}

function verifyState(token, config, now = Date.now()) {
  const state = readSignedPayload(token, config.stateSecret);
  if (state.v !== 1 || !ORDER_ID_PATTERN.test(String(state.orderId || '')) || !Number.isSafeInteger(Number(state.amountToman)) || Number(state.amountToman) <= 0) {
    throw Object.assign(new Error('اطلاعات سفارش در بازگشت زرین‌پال معتبر نیست.'), { status:400 });
  }
  assertFresh(state.issuedAt, now);
  return { ...state, amountToman:Number(state.amountToman), amountRial:Number(state.amountToman) * 10 };
}

function makeReceipt(state, authority, outcome, { referenceId = '', providerCode = '', env = process.env, now = Date.now } = {}) {
  const config = getConfig(env);
  return signPayload({
    v:1,
    provider:'zarinpal',
    orderId:state.orderId,
    amountToman:state.amountToman,
    authority:String(authority || ''),
    outcome,
    referenceId:String(referenceId || '').slice(0,80),
    providerCode:String(providerCode || '').slice(0,32),
    issuedAt:now()
  }, config.stateSecret);
}

function resultLocation(orderId, receipt) {
  return `/payment/result/${encodeURIComponent(orderId)}?receipt=${encodeURIComponent(receipt)}`;
}

function getCallbackQuery(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  let url;
  try { url = new URL(req?.url || CALLBACK_PATH, 'https://callback.invalid'); }
  catch { throw Object.assign(new Error('نشانی بازگشت زرین‌پال معتبر نیست.'), { status:400 }); }
  return Object.fromEntries(url.searchParams.entries());
}

async function verifyWithZarinpal({ authority, amountToman, env = process.env, fetchImpl = globalThis.fetch }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const cleanAuthority = String(authority || '');
  if (!AUTHORITY_PATTERN.test(cleanAuthority)) throw Object.assign(new Error('شناسهٔ مرجع زرین‌پال معتبر نیست.'), { status:400 });
  const amount = Number(amountToman) * 10;
  if (!Number.isSafeInteger(amount) || amount < MINIMUM_AMOUNT_RIAL) throw Object.assign(new Error('مبلغ تراکنش برای تأیید معتبر نیست.'), { status:400 });
  const result = await postZarinpal(config.verifyUrl, {
    merchant_id:config.merchantId,
    amount,
    authority:cleanAuthority
  }, fetchImpl);
  const data = result?.data;
  const code = Number(data?.code);
  if (code === 100 || code === 101) {
    return { outcome:'paid', referenceId:data?.ref_id === undefined || data?.ref_id === null ? '' : String(data.ref_id), providerCode:String(code) };
  }
  return { outcome:'failed', referenceId:'', providerCode:Number.isFinite(code) ? String(code) : 'UNKNOWN' };
}

async function processCallback({ query, env = process.env, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const params = query || {};
  const state = verifyState(params.state, config, now());
  const status = String(params.Status || params.status || '').toUpperCase();
  const rawAuthority = String(params.Authority || params.authority || '');
  const authority = AUTHORITY_PATTERN.test(rawAuthority) ? rawAuthority : '';
  if (status !== 'OK') {
    const receipt = makeReceipt(state, authority, 'cancelled', { providerCode:'NOK', env, now });
    return { statusCode:303, location:resultLocation(state.orderId, receipt), outcome:'cancelled', orderId:state.orderId, amountToman:state.amountToman, authority, referenceId:'', providerCode:'NOK' };
  }
  if (!AUTHORITY_PATTERN.test(authority)) throw Object.assign(new Error('زرین‌پال شناسهٔ مرجع معتبری برنگرداند.'), { status:400 });
  let verification;
  try { verification = await verifyWithZarinpal({ authority, amountToman:state.amountToman, env, fetchImpl }); }
  catch {
    verification = { outcome:'pending', referenceId:'', providerCode:'VERIFY_UNAVAILABLE' };
  }
  const receipt = makeReceipt(state, authority, verification.outcome, { referenceId:verification.referenceId, providerCode:verification.providerCode, env, now });
  return { statusCode:303, location:resultLocation(state.orderId, receipt), outcome:verification.outcome, orderId:state.orderId, amountToman:state.amountToman, authority, referenceId:verification.referenceId, providerCode:verification.providerCode };
}

async function verifyReceipt({ token, orderId, env = process.env, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const receipt = readSignedPayload(token, config.stateSecret);
  if (receipt.v !== 1 || receipt.provider !== 'zarinpal' || !ORDER_ID_PATTERN.test(String(receipt.orderId || '')) || !Number.isSafeInteger(Number(receipt.amountToman)) || !['paid','failed','cancelled','pending'].includes(receipt.outcome)) {
    throw Object.assign(new Error('رسید زرین‌پال معتبر نیست.'), { status:400 });
  }
  assertFresh(receipt.issuedAt, now());
  if (orderId && String(orderId) !== String(receipt.orderId)) throw Object.assign(new Error('رسید پرداخت با سفارش هم‌خوانی ندارد.'), { status:403 });
  if (!Number.isSafeInteger(Number(receipt.amountToman)) || Number(receipt.amountToman) <= 0 || !Number.isSafeInteger(Number(receipt.amountToman) * 10)) throw Object.assign(new Error('مبلغ درج‌شده در رسید پرداخت معتبر نیست.'), { status:400 });
  if (['paid','pending'].includes(receipt.outcome) && !AUTHORITY_PATTERN.test(String(receipt.authority || ''))) throw Object.assign(new Error('شناسهٔ مرجع در رسید پرداخت معتبر نیست.'), { status:400 });
  let verified = { ...receipt };
  if (receipt.outcome === 'pending') {
    try {
      const result = await verifyWithZarinpal({ authority:receipt.authority, amountToman:Number(receipt.amountToman), env, fetchImpl });
      verified = { ...receipt, ...result, issuedAt:now() };
    } catch {
      verified = { ...receipt, outcome:'pending', providerCode:'VERIFY_UNAVAILABLE', issuedAt:now() };
    }
  }
  const newToken = signPayload(verified, config.stateSecret);
  return {
    success:true,
    provider:'zarinpal',
    orderId:verified.orderId,
    amountToman:Number(verified.amountToman),
    authority:verified.authority,
    outcome:verified.outcome,
    referenceId:verified.referenceId || '',
    providerCode:verified.providerCode || '',
    receipt:newToken
  };
}

function readRequestBody(req) {
  try { return requestBody(req); }
  catch (error) { throw Object.assign(error, { status:Number(error.status) || 400 }); }
}

async function request(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  const orderId=String(body?.orderId||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)){
    return sendJson(res,400,{error:'شناسهٔ سفارش معتبر نیست.'});
  }
  try {
    const customer=await authenticateCustomer(req);
    const {order,payment}=await selectOwnedPendingOrder({config:customer,orderId,userId:customer.userId});
    const config=getConfig();
    const configFailure=configurationError(config);
    if(configFailure)throw configFailure;
    if(!config.sandbox)throw Object.assign(new Error('پرداخت واقعی تا پایان بازبینی آمادگی Production غیرفعال است.'),{status:503});
    let authority=payment.authority;
    if(!authority){
      const gateway=await createPaymentRequest({body:{orderId,amountToman:Number(order.total_toman)},req,origin:req.headers?.origin});
      try{
        await callServiceRpc('attach_zarinpal_authority',{p_order_id:orderId,p_authority:gateway.authority},customer);
        authority=gateway.authority;
      }catch(error){
        const latest=await selectOwnedPendingOrder({config:customer,orderId,userId:customer.userId});
        if(latest.payment.authority)authority=latest.payment.authority;
        else throw error;
      }
    }
    return sendJson(res,200,{
      success:true,provider:'zarinpal',authority,
      amountToman:Number(order.total_toman),amountRial:Number(order.total_toman)*10,
      paymentUrl:`${config.startPayUrl}${encodeURIComponent(authority)}`
    });
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error:error.message || 'ساخت درخواست پرداخت زرین‌پال انجام نشد.' });
  }
}

function queryFromRequest(req) {
  try { return getCallbackQuery(req); }
  catch { return {}; }
}

async function persistServerSettlement(result, fetchImpl = globalThis.fetch) {
  if(!result||result.outcome==='pending')return null;
  const config=serverConfiguration();
  const {order,payment}=await selectOrderPayment({config,orderId:result.orderId,fetchImpl});
  const amount=Number(result.amountToman);
  if(!Number.isSafeInteger(amount)||amount!==Number(order.total_toman)||amount!==Number(payment.amount_toman)){
    throw Object.assign(new Error('مبلغ رسید با سفارش ذخیره‌شده مطابقت ندارد.'),{status:409});
  }
  let authority=String(result.authority||'');
  if(payment.authority&&authority&&payment.authority!==authority)throw Object.assign(new Error('Authority رسید با تراکنش پایگاه داده مطابقت ندارد.'),{status:403});
  if(!authority)authority=String(payment.authority||'');
  if(result.outcome==='paid'&&!authority)throw Object.assign(new Error('Authority پرداخت در پایگاه داده ثبت نشده است.'),{status:409});
  if(payment.status==='verified'){
    if(result.outcome!=='paid')throw Object.assign(new Error('وضعیت نهایی پرداخت قبلاً ثبت شده است.'),{status:409});
    return{success:true,idempotent:true,orderId:order.id,outcome:'paid'};
  }
  if(payment.status==='failed'){
    if(result.outcome==='paid')throw Object.assign(new Error('این پرداخت قبلاً ناموفق یا لغوشده ثبت شده و قابل‌تغییر نیست.'),{status:409});
    return{success:true,idempotent:true,orderId:order.id,outcome:result.outcome};
  }
  return callServiceRpc('settle_zarinpal_payment',{
    p_order_id:order.id,
    p_authority:authority||null,
    p_outcome:result.outcome,
    p_amount_toman:amount,
    p_reference_id:result.referenceId||null,
    p_provider_code:result.providerCode||null,
    p_callback_payload:{provider:'zarinpal',outcome:result.outcome,providerCode:result.providerCode||'',verifiedAt:new Date().toISOString()}
  },config,fetchImpl);
}

async function callback(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  try {
    const result = await processCallback({ query:queryFromRequest(req) });
    if(result.outcome!=='pending'){
      try{await persistServerSettlement(result)}
      catch(error){console.error('ZarinPal settlement deferred to authenticated receipt verification:',error.message||'database unavailable')}
    }
    res.statusCode = result.statusCode;
    res.setHeader('Location', result.location);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end('');
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error:error.message || 'تأیید بازگشت زرین‌پال انجام نشد.' });
  }
}

async function receipt(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  try {
    const customer=await authenticateCustomer(req);
    const result=await verifyReceipt({token:body.receipt,orderId:body.orderId});
    const {order,payment}=await selectOrderPayment({config:customer,orderId:result.orderId,userId:customer.userId});
    if(Number(result.amountToman)!==Number(order.total_toman)||Number(result.amountToman)!==Number(payment.amount_toman)){
      throw Object.assign(new Error('مبلغ رسید با سفارش ثبت‌شده مطابقت ندارد.'),{status:409});
    }
    if(payment.authority&&result.authority&&payment.authority!==result.authority){
      throw Object.assign(new Error('شناسهٔ مرجع رسید با پرداخت سفارش مطابقت ندارد.'),{status:403});
    }
    let settlement=null;
    if(result.outcome!=='pending')settlement=await persistServerSettlement(result);
    const finalRows=await selectOrderPayment({config:customer,orderId:result.orderId,userId:customer.userId});
    let outcome=result.outcome;
    if(finalRows.payment.status==='verified')outcome='paid';
    else if(finalRows.payment.status==='failed'){
      const savedOutcome=finalRows.payment.callback_payload?.outcome;
      outcome=['failed','cancelled','expired'].includes(savedOutcome)?savedOutcome:(outcome==='paid'?'failed':outcome);
    }else outcome='pending';
    return sendJson(res,200,{...result,outcome,settlement: settlement?.outcome||null});
  } catch (error) {
    return sendJson(res, Number(error.status) || 400, { error:error.message || 'رسید پرداخت زرین‌پال معتبر نیست.' });
  }
}

module.exports = {
  CALLBACK_PATH,
  RECEIPT_PATH,
  MINIMUM_AMOUNT_RIAL,
  getConfig,
  configurationError,
  normalizeDigits,
  normalizeOrder,
  signPayload,
  readSignedPayload,
  createPaymentRequest,
  verifyWithZarinpal,
  processCallback,
  verifyReceipt,
  status:safeStatus,
  request,
  callback,
  receipt
};

'use strict';

/* BluePal (بلو پال) — درگاه پرداخت دو‌مرحله‌ای: ثبت درخواست ← صفحه بانک ← تأیید سمت سرور.
 * مستندات: https://www.bluepal.ir/developers  (پایگاه: https://www.bluepal.ir/api)
 *
 * فراخوانی‌های استفاده‌شده:
 *   POST /v1/payments/request            { merchant_id, amount(تومان صحیح), callback_url, description }
 *                                        ← { result:100, track_id, payment_url }
 *   GET  /v1/payments/verify/:track_id   ← { result:100, status:'success', ... }  (تأیید قطعی پرداخت)
 *
 * کدهای پاسخ مستندات: 100 موفق · 102 پارامتر الزامی · 105 پذیرنده فعال نیست ·
 * 201 قبلاً تأیید شده · 202 ناموفق · 404 تراکنش پیدا نشد · 429 نرخ درخواست.
 *
 * قوانینی که در این فایل رعایت شده است:
 *   • کلید API فقط هدر Authorization سمت سرور می‌رود؛ هرگز به مرورگر برنمی‌گردد.
 *   • بازگشت کاربر به callback_url به‌خودی‌خود دلیل پرداخت نیست؛ تنها GET verify نهایی می‌کند.
 *   • مبلغ هرگز از پاسخ درگاه خوانده و اعمال نمی‌شود؛ مبلغ سفارش از پایگاه داده گرفته می‌شود
 *     و مبلغ درگاه فقط برای هم‌خوانی مقایسه می‌شود.
 *   • 201 (تأیید تکراری) با همان موفقیت رفتار می‌کند ولی settlement یک‌مصرف است.
 *   • 202 (ناموفق) پرداخت را در وضعیت pending می‌گذارد تا مشتری بتواند تلاش دوباره کند؛
 *     رکورد فقط با جاروب انقضا (expire_stale_bluepal_checkouts) یا لغو مشتری failed می‌شود.
 */

const crypto = require('node:crypto');
const { sendJson, requestBody, sameOrigin } = require('./vercel-api.js');
const {
  supabaseServerConfig,
  serverConfiguration,
  authenticateCustomer,
  selectOwnedPendingOrder,
  selectOrderPayment,
  selectPaymentByAuthority,
  callServiceRpc
} = require('./supabase-server.js');

const PROVIDER = 'bluepal';
const PROVIDER_LABEL = 'BluePal · درگاه بلو پال';
const REQUEST_PATH = '/api/payment/bluepal/request';
const RECEIPT_PATH = '/api/payment/bluepal/receipt';
const STATUS_PATH = '/api/payment/bluepal/status';
const CALLBACK_PATH = '/api/payment/bluepal/callback';
const NOTIFY_PATH = '/api/payment/bluepal/notify';
const DEFAULT_API_BASE = 'https://www.bluepal.ir/api';
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SETTLE_GRACE_MINUTES = 180;
const TRACK_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const ORDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{3,48}$/;
const BLUEPAL_CODES = {
  100: { label: 'تراکنش با موفقیت انجام شد', outcome: 'paid' },
  102: { label: 'پارامتر الزامی ارسال نشده (merchant_id یا amount)', outcome: 'error' },
  105: { label: 'پذیرنده فعال نیست؛ حساب در بلو پال تأیید یا مسدود نشده است', outcome: 'error' },
  201: { label: 'این تراکنش پیش‌تر تأیید شده است', outcome: 'paid' },
  202: { label: 'تراکنش ناموفق بود؛ مبلغی کسر نشده است', outcome: 'failed' },
  404: { label: 'تراکنش در بلو پال پیدا نشد', outcome: 'unknown' },
  429: { label: 'تعداد درخواست‌ها بیش از حد مجاز است', outcome: 'throttled' }
};

function fail(message, status = 502, extra = {}) {
  return Object.assign(new Error(message), extra, { status });
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function numberFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 43200 ? parsed : fallback;
}

function normalizeApiBase(value) {
  const raw = String(value || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.host);
    if (!(url.protocol === 'https:' || (local && url.protocol === 'http:'))) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!/^\/(api)?$/i.test(url.pathname)) return null;
    return `${url.origin}${/^\/api$/i.test(url.pathname) ? '/api' : ''}`;
  } catch {
    return null;
  }
}

function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase(); }
  catch { return ''; }
}

function getConfig(env = process.env) {
  const apiKey = String(env.BLUEPAL_API_KEY || '').trim();
  const merchantId = String(env.BLUEPAL_MERCHANT_ID || '').trim();
  const stateSecret = String(env.BLUEPAL_STATE_SECRET || '');
  const rawMode = String(env.BLUEPAL_MODE || 'sandbox').trim().toLowerCase();
  const validMode = rawMode === 'sandbox' || rawMode === 'production';
  const mode = validMode ? rawMode : 'sandbox';
  const sandbox = mode === 'sandbox';
  const validApiKey = /^sk_(test|live)_[A-Za-z0-9_-]{8,128}$/.test(apiKey);
  const keyMode = apiKey ? (apiKey.startsWith('sk_test_') ? 'sandbox' : 'live') : '';
  const validMerchantId = merchantId === '' || /^[A-Za-z0-9_-]{4,64}$/.test(merchantId);
  const requiredMerchantId = isTruthy(env.BLUEPAL_REQUIRE_MERCHANT_ID) || !sandbox;
  const validStateSecret = Buffer.byteLength(stateSecret, 'utf8') >= 32;
  const apiBase = normalizeApiBase(env.BLUEPAL_API_BASE);
  const apiHost = apiBase ? hostOf(`${apiBase}`) : '';
  const allowedPayHosts = String(env.BLUEPAL_ALLOWED_PAY_HOSTS || '')
    .split(',').map(entry => hostOf(`https://${entry.trim()}`)).filter(Boolean);
  const payHosts = allowedPayHosts.length ? allowedPayHosts : (apiHost ? [apiHost] : []);
  const webhookSecret = String(env.BLUEPAL_WEBHOOK_SECRET || '').trim();
  const validWebhookSecret = webhookSecret === '' || Buffer.byteLength(webhookSecret, 'utf8') >= 16;
  const livePaymentsRequested = isTruthy(env.BLUEPAL_ENABLE_LIVE_PAYMENTS);
  const keyMatchesMode = !apiKey || keyMode === (sandbox ? 'sandbox' : 'live');
  const configured = validMode && validApiKey && validMerchantId && validStateSecret && validWebhookSecret
    && apiBase !== null && keyMatchesMode && payHosts.length > 0 && (!requiredMerchantId || merchantId !== '');
  const livePaymentsAllowed = configured && (sandbox || (mode === 'production' && livePaymentsRequested && keyMode === 'live'));
  return {
    mode,
    sandbox,
    apiKey,
    keyMode,
    merchantId,
    stateSecret,
    apiBase: apiBase || DEFAULT_API_BASE,
    apiBaseValid: apiBase !== null,
    payHosts,
    webhookSecret,
    webhookSecretHeader: String(env.BLUEPAL_WEBHOOK_SIGNATURE_HEADER || 'x-bluepal-signature').trim().toLowerCase(),
    requireWebhookSignature: isTruthy(env.BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE),
    validMode,
    validApiKey,
    validMerchantId,
    validStateSecret,
    validWebhookSecret,
    keyMatchesMode,
    livePaymentsRequested,
    configured,
    livePaymentsAllowed,
    keyKind: apiKey ? (keyMode === 'sandbox' ? 'test' : 'live') : 'missing',
    requestPath: REQUEST_PATH,
    receiptPath: RECEIPT_PATH,
    statusPath: STATUS_PATH,
    callbackPath: CALLBACK_PATH,
    notifyPath: NOTIFY_PATH,
    // همان کف ۶۰ دقیقه‌ای که در تابع SQL اعمال می‌شود؛ اینجا هم زیر یک دقیقه مجاز نیست.
    settleGraceMinutes: Math.max(60, numberFrom(env.BLUEPAL_SETTLE_GRACE_MINUTES, DEFAULT_SETTLE_GRACE_MINUTES))
  };
}

function configurationError(config) {
  if (!config.validMode) return fail('BLUEPAL_MODE فقط می‌تواند sandbox یا production باشد.', 503);
  if (!config.apiBaseValid) return fail('BLUEPAL_API_BASE باید نشانی HTTPS معتبر و بدون مسیر اضافه باشد (پیش‌فرض https://www.bluepal.ir/api).', 503);
  if (!config.validApiKey) return fail('کلید API بلو پال تنظیم نشده یا قالبش معتبر نیست؛ باید با sk_test_ (آزمایشی) یا sk_live_ (واقعی) آغاز شود.', 503);
  if (!config.keyMatchesMode) return fail(`پیشوند کلید BLUEPAL_API_KEY (${config.keyMode}) با BLUEPAL_MODE=${config.mode} هم‌خوانی ندارد.`, 503);
  if (!config.validMerchantId || !config.merchantId) return fail('BLUEPAL_MERCHANT_ID از پنل بلو پال لازم است (شناسه پذیرنده).', 503);
  if (!config.validStateSecret) return fail('BLUEPAL_STATE_SECRET باید یک مقدار تصادفی حداقل ۳۲ کاراکتری باشد.', 503);
  if (!config.validWebhookSecret) return fail('BLUEPAL_WEBHOOK_SECRET در صورت تنظیم باید حداقل ۱۶ کاراکتر باشد.', 503);
  if (!config.payHosts.length) return fail('میزبان مجاز صفحه پرداخت بلو پال مشخص نیست؛ BLUEPAL_ALLOWED_PAY_HOSTS را تنظیم کنید.', 503);
  return null;
}

function productionGateError(config) {
  if (config.sandbox) return null;
  if (!config.livePaymentsRequested) return fail('دریافت وجه واقعی عمداً قفل است؛ پس از تأیید جریان آزمایشی متغیر BLUEPAL_ENABLE_LIVE_PAYMENTS=true را تنظیم کنید.', 503);
  if (config.keyMode !== 'live') return fail('در حالت production نمی‌توان از کلید آزمایشی استفاده کرد؛ BLUEPAL_API_KEY باید کلید sk_live_ پنل باشد.', 503);
  return null;
}

/* ------------------------------------------------------------------ tokens */

function signPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readSignedPayload(token, secret) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra !== undefined || encoded.length > 8192 || signature.length > 128) {
    throw fail('رسید پرداخت معتبر نیست.', 400);
  }
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw fail('امضای وضعیت پرداخت معتبر نیست.', 403);
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw fail('ساختار رسید پرداخت معتبر نیست.', 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('ساختار رسید پرداخت معتبر نیست.', 400);
  return payload;
}

function assertFresh(timestamp, now) {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at > now + 5 * 60 * 1000 || now - at > MAX_TOKEN_AGE_MS) {
    throw fail('مهلت اعتبار این درخواست پرداخت به پایان رسیده است.', 410);
  }
}

function makeReceipt(state, config, { transactionId = '', outcome = 'pending', referenceId = '', providerCode = '', now = Date.now } = {}) {
  return signPayload({
    v: 1,
    provider: PROVIDER,
    orderId: state.orderId,
    amountToman: state.amountToman,
    trackId: String(state.trackId || ''),
    transactionId: String(transactionId || '').slice(0, 64),
    outcome,
    referenceId: String(referenceId || '').slice(0, 48),
    providerCode: String(providerCode || '').slice(0, 32),
    issuedAt: now()
  }, config.stateSecret);
}

function readReceipt(token, config, now = Date.now()) {
  const receipt = readSignedPayload(token, config.stateSecret);
  if (receipt.v !== 1 || receipt.provider !== PROVIDER || !Number.isSafeInteger(Number(receipt.amountToman))) {
    throw fail('رسید بلو پال معتبر نیست.', 400);
  }
  if (receipt.trackId !== '' && !TRACK_ID_PATTERN.test(String(receipt.trackId))) throw fail('رسید بلو پال معتبر نیست.', 400);
  assertFresh(receipt.issuedAt, now);
  return receipt;
}

// امضای کوتاه کوئری callback_url: به‌جای اتکاء به پارامترهای ارسالی مرورگر،
// خودِ آدرس بازگشت قابل‌احراز می‌شود (سفارش + کد پیگیری به سرور قفل می‌شوند).
function makeCallbackToken({ orderId, trackId }, config, now = Date.now()) {
  const issued = Math.floor(Number(now()) / 1000);
  const body = `cb|${orderId}|${trackId}|${issued}`;
  const signature = crypto.createHmac('sha256', config.stateSecret).update(body).digest('base64url').slice(0, 22);
  return `${issued}.${signature}`;
}

function readCallbackToken({ orderId, trackId, token }, config, now = Date.now()) {
  const [issued, signature] = String(token || '').split('.');
  if (!issued || !/^[A-Za-z0-9_-]{22}$/.test(String(signature))) throw fail('امضای آدرس بازگشت معتبر نیست.', 403);
  const expected = crypto.createHmac('sha256', config.stateSecret).update(`cb|${orderId}|${trackId}|${issued}`).digest('base64url').slice(0, 22);
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw fail('امضای آدرس بازگشت با این سفارش هم‌خوانی ندارد.', 403);
  assertFresh(Number(issued) * 1000, now);
  return { orderId, trackId, issuedAt: Number(issued) * 1000 };
}

/* ------------------------------------------------------------ BluePal API */

function apiUrl(config, path) {
  return `${config.apiBase}${path}`;
}

function readNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/* برخی پاسخ‌های بلو پال داده را داخل کلید data می‌گذارند؛ هر دو قالب پذیرفته می‌شود. */
function payloadRoot(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const data = source.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return source;
  const merged = { ...data };
  for (const [key, value] of Object.entries(source)) if (key !== 'data' && value !== undefined && value !== null) merged[key] = value;
  return merged;
}

function readTrackId(payload) {
  const source = payloadRoot(payload);
  const value = String(source?.track_id ?? source?.trackId ?? source?.token ?? source?.authority ?? '').trim();
  return TRACK_ID_PATTERN.test(value) ? value : '';
}

function readReference(payload, fallback = '') {
  const value = String(payload?.reference_id ?? payload?.ref_id ?? payload?.rr_code ?? payload?.trace_id
    ?? payload?.transaction_id ?? payload?.card_reference ?? payload?.transactionId ?? '').trim();
  return REFERENCE_PATTERN.test(value) ? value.slice(0, 48) : String(fallback || '').slice(0, 48);
}

function safeCompareText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function callBluePalApi({ config, path, method = 'POST', body, fetchImpl = globalThis.fetch, timeoutMs = 12000 }) {
  if (typeof fetchImpl !== 'function') throw fail('ارتباط شبکهٔ سرور برای سرویس پرداخت بلو پال در دسترس نیست.', 503);
  let response;
  try {
    response = await fetchImpl(apiUrl(config, path), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw fail('اتصال امن به سرویس پرداخت بلو پال برقرار نشد.', 502);
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { error: 'invalid_json', message: text.slice(0, 200) }; }
  }
  const root = payloadRoot(payload);
  const result = readNumber(root?.result, root?.code, root?.status_code);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw fail('کلید API بلو پال پذیرفته نشد؛ BLUEPAL_API_KEY و وضعیت حساب پنل را بررسی کنید.', 502, { httpStatus: response.status });
    if (response.status === 429) return { payload: payload || {}, result: 429, httpStatus: response.status };
    throw fail(String(payload?.message || payload?.error || `خطای بلو پال (HTTP ${response.status})`).slice(0, 240), 502, { httpStatus: response.status });
  }
  if (result && result !== 100 && !BLUEPAL_CODES[result]) {
    throw fail(`کد پاسخ ناشناخته از بلو پال (${result}).`, 502, { bluepalCode: result });
  }
  return { payload: payload || {}, result: result || 100, httpStatus: response.status };
}

function normalizePaymentUrl(value, config) {
  const raw = String(value || '').trim();
  let url;
  try { url = new URL(raw); }
  catch { throw fail('بلو پال نشانی صفحه پرداخت معتبر برنگرداند.', 502); }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('نشانی صفحه پرداخت بلو پال امن نیست.', 502);
  if (!config.payHosts.includes(url.hostname.toLowerCase())) throw fail('نشانی صفحه پرداخت به میزبان معتبر بلو پال تعلق ندارد.', 502);
  return url.toString();
}

async function requestPayment({ config, amountToman, callbackUrl, description = '', orderId = '', fetchImpl = globalThis.fetch }) {
  const amount = Number(amountToman);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw fail('مبلغ سفارش باید عدد صحیح مثبت به تومان باشد.', 400);
  const body = {
    merchant_id: config.merchantId,
    amount,
    callback_url: callbackUrl,
    description: String(description || `سفارش ${orderId}`.trim()).slice(0, 255)
  };
  const { payload, result } = await callBluePalApi({ config, path: '/v1/payments/request', method: 'POST', body, fetchImpl });
  if (result !== 100) {
    const known = BLUEPAL_CODES[result];
    throw fail(String(payload?.message || (known ? known.label : `کد پاسخ بلو پال: ${result}`)), result === 429 ? 503 : 502, { bluepalCode: result });
  }
  const root = payloadRoot(payload);
  const trackId = readTrackId(root);
  if (!trackId) throw fail('بلو پال کد پیگیری (track_id) معتبر برنگرداند.', 502);
  return {
    trackId,
    paymentUrl: normalizePaymentUrl(root?.payment_url ?? root?.paymentUrl, config),
    amountToman: amount,
    gatewayAmount: readNumber(root?.amount),
    raw: payload
  };
}

// تنها منبع حقیقت برای نهایی‌شدن پرداخت. 201 یعنی قبلاً تأیید شده؛ تمدید همان موفقیت است
// ولی settlement در پایگاه داده یک‌مصرف است، پس تحویل دوباره سفارش رخ نمی‌دهد.
async function verifyPayment({ config, trackId, expectedAmountToman = null, fetchImpl = globalThis.fetch } = {}) {
  const id = String(trackId || '').trim();
  if (!TRACK_ID_PATTERN.test(id)) throw fail('کد پیگیری بلو پال معتبر نیست.', 400);
  const { payload, result } = await callBluePalApi({ config, path: `/v1/payments/verify/${encodeURIComponent(id)}`, method: 'GET', fetchImpl });
  const root = payloadRoot(payload);
  const statusText = String(root?.status ?? root?.state ?? '').trim().toLowerCase();
  const code = Number(result) || 0;
  const declared = readNumber(root?.amount, root?.card_amount, root?.final_amount);
  const known = BLUEPAL_CODES[code];
  let outcome = 'pending';
  if (code === 100 || code === 201) outcome = statusText && statusText !== 'success' && statusText !== 'paid' && statusText !== 'ok' ? 'failed' : 'paid';
  else if (code === 202) outcome = 'failed';
  else if (code === 404) outcome = 'unknown';
  else if (code === 429) outcome = 'throttled';
  else if (code === 102 || code === 105) outcome = 'error';
  if (outcome === 'paid' && expectedAmountToman !== null && declared && Number(declared) !== Number(expectedAmountToman)) {
    throw fail('مبلغ تأییدشدهٔ بلو پال با مبلغ سفارش هم‌خوانی ندارد.', 409);
  }
  return {
    trackId: id,
    code,
    outcome,
    status: statusText || (known ? String(code) : 'unknown'),
    alreadyVerified: code === 201,
    referenceId: readReference(root, id),
    amountToman: declared || Number(expectedAmountToman || 0) || 0,
    cardPan: String(root?.card_pan ?? root?.pan ?? '').replace(/\D/g, '').slice(-4),
    message: String(payload?.message || (known ? known.label : '') || '').slice(0, 240),
    raw: payload
  };
}

function normalizeOrder(body) {
  const orderId = String(body?.orderId || '').trim();
  const amountToman = Number(body?.amountToman);
  if (!ORDER_UUID_PATTERN.test(orderId) && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(orderId)) throw fail('شناسهٔ سفارش معتبر نیست.', 400);
  if (!Number.isSafeInteger(amountToman) || amountToman <= 0 || amountToman > Number.MAX_SAFE_INTEGER) {
    throw fail('مبلغ سفارش باید یک عدد صحیح و معتبر به تومان باشد.', 400);
  }
  return { orderId, amountToman };
}

/* ----------------------------------------------------- settlement helpers */

function readProviderMeta(payment) {
  const payload = payment?.callback_payload;
  const meta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    paymentUrl: typeof meta.paymentUrl === 'string' ? meta.paymentUrl : '',
    callbackToken: typeof meta.callbackToken === 'string' ? meta.callbackToken : '',
    referenceId: typeof meta.referenceId === 'string' ? meta.referenceId : '',
    gatewayAmount: Number(meta.gatewayAmountToman ?? meta.gatewayAmount ?? 0) || 0,
    lastAttemptCode: Number(meta.lastAttemptCode ?? payment?.provider_code ?? 0) || 0,
    attempts: Array.isArray(meta.attempts) ? meta.attempts.length : (Number(meta.attempts || 0) || 0)
  };
}

function settlementArguments({ orderId, authority, outcome, amountToman, referenceId, providerCode, extra = {} }) {
  return {
    p_order_id: orderId,
    p_authority: authority || null,
    p_outcome: outcome,
    p_amount_toman: amountToman,
    p_reference_id: referenceId || null,
    p_provider_code: providerCode || null,
    p_callback_payload: { provider: PROVIDER, outcome, providerCode: providerCode || '', ...extra, settledAt: new Date().toISOString() }
  };
}

async function persistSettlement(result, { dbConfig, fetchImpl = globalThis.fetch } = {}) {
  if (!result || result.outcome === 'pending' || result.outcome === 'failed' || result.outcome === 'throttled' || result.outcome === 'unknown') return null;
  const config = dbConfig || serverConfiguration();
  const { order, payment } = await selectOrderPayment({ config, orderId: result.orderId, fetchImpl });
  const amount = Number(result.amountToman);
  if (!Number.isSafeInteger(amount) || amount !== Number(order.total_toman) || amount !== Number(payment.amount_toman)) {
    throw fail('مبلغ رسید با سفارش ذخیره‌شده مطابقت ندارد.', 409);
  }
  let authority = String(result.authority || '');
  if (payment.authority && authority && payment.authority !== authority) throw fail('کد پیگیری با رکورد پرداخت پایگاه داده هم‌خوانی ندارد.', 403);
  if (!authority) authority = String(payment.authority || '');
  if (result.outcome === 'paid' && !authority) throw fail('کد پیگیری بلو پال برای این سفارش ثبت نشده است.', 409);
  if (result.outcome === 'paid') {
    const reference = String(result.referenceId || payment.provider_reference || authority);
    if (!REFERENCE_PATTERN.test(reference)) throw fail('بلو پال شماره مرجعی برای تأیید واریز برنگرداند.', 502);
  }
  if (payment.status === 'verified') {
    if (result.outcome !== 'paid') throw fail('وضعیت نهایی پرداخت قبلاً ثبت شده است.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: 'paid' };
  }
  if (payment.status === 'failed') {
    if (result.outcome === 'paid') throw fail('این پرداخت منقضی یا لغو شده ثبت شده و قابل‌تغییر نیست؛ با پشتیبانی تماس بگیرید.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: result.outcome };
  }
  return callServiceRpc('settle_bluepal_payment', settlementArguments({
    orderId: order.id,
    authority,
    outcome: result.outcome === 'cancelled' || result.outcome === 'expired' ? 'cancelled' : result.outcome,
    amountToman: amount,
    referenceId: result.referenceId,
    providerCode: String(result.code || result.providerCode || 'paid').slice(0, 32),
    extra: {
      trackId: result.trackId || '',
      bluepalCode: result.code || 0,
      alreadyVerified: Boolean(result.alreadyVerified),
      referenceId: result.referenceId || '',
      cardPan: result.cardPan || '',
      verifiedAt: result.verifiedAt || new Date().toISOString(),
      source: result.source || 'server'
    }
  }), config, fetchImpl);
}

/* -------------------------------------------------------------- handlers */

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === target) return firstHeader(value);
  return '';
}

function queryFromRequest(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req?.url || '/', 'https://store.invalid').searchParams.entries()); }
  catch { return {}; }
}

function getOrigin(req, explicitOrigin) {
  const originHeader = String(explicitOrigin || req?.headers?.origin || '').trim();
  let origin;
  try { origin = new URL(originHeader); }
  catch { throw fail('مبدأ معتبر برای ساخت آدرس بازگشت پیدا نشد.', 400); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw fail('مبدأ درخواست پرداخت معتبر نیست.', 400);
  }
  const requestHost = firstHeader(req?.headers?.['x-forwarded-host'] || req?.headers?.host).toLowerCase();
  if (requestHost && origin.host.toLowerCase() !== requestHost) throw fail('مبدأ درخواست با دامنهٔ فروشگاه یکسان نیست.', 403);
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.host);
  if (origin.protocol !== 'https:' && !localHost) throw fail('درخواست پرداخت فقط روی HTTPS مجاز است.', 400);
  return origin.origin;
}

function publicOrigin(env = process.env) {
  const configured = String(env.BLUEPAL_PUBLIC_ORIGIN || '').trim();
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
}

function assertOrderId(orderId) {
  const value = String(orderId || '').trim();
  if (!ORDER_UUID_PATTERN.test(value)) throw fail('شناسهٔ سفارش معتبر نیست.', 400);
  return value;
}

function readRequestBody(req) {
  try { return requestBody(req); }
  catch (error) { throw Object.assign(error, { status: Number(error.status) || 400 }); }
}

function safeStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const config = getConfig();
  const database = supabaseServerConfig();
  const ready = config.configured && database.serviceConfigured;
  return sendJson(res, 200, {
    success: true,
    provider: PROVIDER,
    providerLabel: PROVIDER_LABEL,
    configured: ready,
    paymentEnabled: ready && config.livePaymentsAllowed,
    mode: config.mode,
    sandbox: config.sandbox,
    apiKeyKind: config.keyKind,
    livePaymentsAllowed: config.livePaymentsAllowed,
    merchantIdConfigured: Boolean(config.merchantId),
    apiBase: config.apiBase,
    payHosts: config.payHosts,
    requestPath: REQUEST_PATH,
    receiptPath: RECEIPT_PATH,
    callbackPath: CALLBACK_PATH,
    notifyPath: NOTIFY_PATH,
    webhookPath: NOTIFY_PATH,
    requiresWebhook: false,
    webhookSignatureRequired: config.requireWebhookSignature,
    checkoutStorage: 'supabase-postgres',
    amountUnit: 'ITR',
    amountIsTomanInteger: true,
    settleGraceMinutes: config.settleGraceMinutes,
    invoiceMethods: ['POST /v1/payments/request', 'GET /v1/payments/verify/{track_id}'],
    resultCodes: Object.keys(BLUEPAL_CODES).map(Number),
    testCards: ['5022291000000008', '5022291000000016', '5022291000000024'],
    liveCheckoutSafe: false,
    note: ready
      ? 'فاکتور در بلو پال ثبت می‌شود و پرداخت در صفحهٔ بانک انجام می‌گیرد؛ نهایی‌سازی سفارش فقط با GET /v1/payments/verify/{track_id} انجام می‌شود.'
      : 'پیکربندی سروری Supabase یا کلید API بلو پال کامل نیست؛ پرداخت غیرفعال است.'
  });
}

async function createPaymentIntent({ body, req, origin, env = process.env, dbConfig, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const gate = productionGateError(config);
  if (gate) throw gate;
  const order = normalizeOrder(body);
  const safeOrigin = getOrigin(req, origin);
  const callbackToken = makeCallbackToken({ orderId: order.orderId, trackId: '' }, config, now);
  const callbackUrl = `${safeOrigin}${CALLBACK_PATH}?order=${encodeURIComponent(order.orderId)}`;
  const created = await requestPayment({
    config,
    amountToman: order.amountToman,
    callbackUrl,
    description: body?.description || `سفارش ${body?.orderNumber || order.orderId}`,
    orderId: order.orderId,
    fetchImpl
  });
  const signedCallback = makeCallbackToken({ orderId: order.orderId, trackId: created.trackId }, config, now);
  return {
    success: true,
    provider: PROVIDER,
    mode: config.mode,
    sandbox: config.sandbox,
    orderId: order.orderId,
    amountToman: order.amountToman,
    trackId: created.trackId,
    authority: created.trackId,
    paymentUrl: created.paymentUrl,
    gatewayAmount: created.gatewayAmount,
    callbackUrl: `${callbackUrl}&sig=${encodeURIComponent(signedCallback)}`,
    callbackToken: signedCallback,
    issuedAt: now()
  };
}

async function request(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error: error.message }); }
  try {
    const orderId = assertOrderId(body?.orderId);
    const customer = await authenticateCustomer(req);
    const { order, payment } = await selectOwnedPendingOrder({ config: customer, orderId, userId: customer.userId });
    const config = getConfig();
    const configFailure = configurationError(config);
    if (configFailure) throw configFailure;
    const gate = productionGateError(config);
    if (gate) throw gate;
    const created = await createPaymentIntent({
      body: { orderId, amountToman: Number(order.total_toman), orderNumber: order.number || orderId },
      req,
      origin: req.headers?.origin,
      dbConfig: customer
    });
    const meta = readProviderMeta(payment);
    // تلاش دوباره پس از پرداخت ناموفق مجاز است؛ کد پیگیری تازه جای قبلی را می‌گیرد
    // و تا پرداخت موفق، هیچ وجهی تأیید نشده است.
    try {
      await callServiceRpc('attach_bluepal_payment', {
        p_order_id: orderId,
        p_track_id: created.trackId,
        p_payment_url: created.paymentUrl,
        p_callback_token: created.callbackToken,
        p_gateway_amount: created.gatewayAmount || Number(order.total_toman),
        p_last_code: '100'
      }, customer);
    } catch (error) {
      const latest = await selectOwnedPendingOrder({ config: customer, orderId, userId: customer.userId });
      if (latest.payment.authority !== created.trackId) throw error;
    }
    return sendJson(res, 200, {
      success: true,
      provider: PROVIDER,
      mode: config.mode,
      sandbox: config.sandbox,
      orderId,
      orderNumber: order.number || '',
      trackId: created.trackId,
      authority: created.trackId,
      paymentUrl: created.paymentUrl,
      callbackUrl: created.callbackUrl,
      amountToman: created.amountToman,
      amountRial: created.amountToman * 10,
      openMode: 'redirect',
      expiresInSeconds: config.settleGraceMinutes * 60,
      receipt: makeReceipt({ orderId, amountToman: created.amountToman, trackId: created.trackId }, config, {
        outcome: 'pending', providerCode: 'REQUEST_CREATED'
      }),
      attemptsBefore: meta.attempts || 0,
      webhookPath: NOTIFY_PATH,
      pollAfterMs: 6000
    });
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error: error.message || 'ثبت درخواست پرداخت در بلو پال انجام نشد.' });
  }
}

async function settleStatus({ orderId, expectedAmountToman = null, config = getConfig(), dbConfig, fetchImpl = globalThis.fetch, now = Date.now, source = 'poll' } = {}) {
  const database = dbConfig || serverConfiguration();
  const { order, payment } = await selectOrderPayment({ config: database, orderId, userId: dbConfig?.userId, fetchImpl });
  const amountToman = Number(order.total_toman);
  if (expectedAmountToman !== null && Number(expectedAmountToman) !== amountToman) throw fail('مبلغ درخواست با سفارش هم‌خوانی ندارد.', 403);
  const configFailure = configurationError(config);
  const authority = String(payment.authority || '');
  const meta = readProviderMeta(payment);
  let outcome = payment.status === 'verified' ? 'paid' : payment.status === 'failed' ? 'expired' : 'pending';
  let code = payment.status === 'verified' ? 100 : meta.lastAttemptCode || 0;
  let referenceId = String(payment.provider_reference || '');
  let providerCode = String(payment.provider_code || '');
  if (!configFailure && authority && outcome === 'pending') {
    try {
      const verified = await verifyPayment({ config, trackId: authority, expectedAmountToman: amountToman, fetchImpl });
      code = verified.code;
      providerCode = String(verified.code);
      if (verified.outcome === 'paid') {
        referenceId = verified.referenceId || authority;
        outcome = 'paid';
        await persistSettlement({
          orderId: order.id,
          authority,
          trackId: verified.trackId,
          amountToman,
          code: verified.code,
          outcome: 'paid',
          referenceId,
          alreadyVerified: verified.alreadyVerified,
          cardPan: verified.cardPan,
          source,
          verifiedAt: new Date(now()).toISOString()
        }, { dbConfig: database, fetchImpl });
      } else if (verified.outcome === 'failed') {
        outcome = 'failed_attempt';
        providerCode = 'FAILED_202';
      } else {
        providerCode = verified.outcome === 'unknown' ? 'NOT_FOUND_404' : `GATEWAY_${verified.code}`;
      }
    } catch (error) {
      outcome = 'pending';
      providerCode = Number(error.status) === 409 ? 'AMOUNT_MISMATCH' : 'VERIFY_UNAVAILABLE';
      code = Number(error.bluepalCode) || code;
    }
  }
  const receipt = makeReceipt({ orderId: order.id, amountToman, trackId: authority }, config, {
    transactionId: referenceId,
    outcome,
    referenceId: outcome === 'paid' ? referenceId : '',
    providerCode,
    now
  });
  return {
    success: true,
    provider: PROVIDER,
    orderId: order.id,
    orderNumber: order.number || '',
    amountToman,
    amountRial: amountToman * 10,
    authority,
    trackId: authority,
    outcome,
    code,
    paymentUrl: meta.paymentUrl || '',
    referenceId: outcome === 'paid' ? referenceId : '',
    providerCode,
    waitingForVerify: outcome === 'pending' && Boolean(authority),
    receipt: config.validStateSecret ? receipt : '',
    note: configFailure ? 'پیکربندی سروری بلو پال کامل نیست؛ فقط وضعیت پایگاه داده نمایش داده می‌شود.' : ''
  };
}

async function receipt(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error: error.message }); }
  try {
    const customer = await authenticateCustomer(req);
    const orderId = assertOrderId(body?.orderId);
    const config = getConfig();
    const configFailure = configurationError(config);
    if (configFailure) throw configFailure;
    let expectedAmountToman = null;
    if (body?.receipt) {
      const token = readReceipt(body.receipt, config);
      if (String(token.orderId) !== orderId) throw fail('رسید پرداخت با سفارش هم‌خوانی ندارد.', 403);
      expectedAmountToman = Number(token.amountToman);
      if (!Number.isSafeInteger(expectedAmountToman) || expectedAmountToman <= 0) throw fail('مبلغ درج‌شده در رسید پرداخت معتبر نیست.', 400);
    }
    const result = await settleStatus({ orderId, expectedAmountToman, config, dbConfig: customer, source: 'client-poll' });
    return sendJson(res, 200, result);
  } catch (error) {
    if (Number(error.status) === 404) return sendJson(res, 404, { error: 'سفارش قابل‌دسترسی پیدا نشد.' });
    return sendJson(res, Number(error.status) || 400, { error: error.message || 'رسید بلو پال معتبر نیست.' });
  }
}

// بازگشت مرورگر مشتری از صفحه بانک. پارامترها فقط سرنخ‌اند؛ پرداخت فقط با verify
// روی کد پیگیریِ ثبت‌شده در پایگاه داده نهایی می‌شود.
async function callback(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const query = queryFromRequest(req);
  const config = getConfig();
  const orderId = String(query.order || query.orderId || '').trim();
  let redirectTo = `/checkout`;
  try {
    if (!ORDER_UUID_PATTERN.test(orderId)) throw fail('شناسهٔ سفارش در آدرس بازگشت معتبر نیست.', 400);
    const providedTrack = readTrackId(query);
    const sig = String(query.sig || '').trim();
    // امضای آدرس بازگشت فقط سرنخ تشخیص است؛ نبود یا خرابی آن هرگز مشتری را تنبیه نمی‌کند،
    // چون بازگشت به‌تنهایی هیچ حقی ایجاد نمی‌کند و پرداخت فقط با verify پایگاه داده نهایی می‌شود.
    let signatureState = 'missing';   // برای منبع تسویه؛ بر تصمیم پرداخت اثر ندارد.
    if (config.validStateSecret && sig) {
      try {
        const database = supabaseServerConfig();
        const { payment } = await selectOrderPayment({ config: database, orderId, fetchImpl: globalThis.fetch });
        readCallbackToken({ orderId, trackId: providedTrack || String(payment.authority || ''), token: sig }, config);
        signatureState = 'valid';
      } catch (error) {
        signatureState = Number(error.status) === 410 ? 'expired' : 'invalid';
        console.warn('BluePal callback signature ignored:', signatureState, error?.message || '');
      }
    }
    redirectTo = `/payment/result/${encodeURIComponent(orderId)}`;
    const database = supabaseServerConfig();
    if (config.configured && database.serviceConfigured) {
      try {
        await settleStatus({ orderId, config, dbConfig: serverConfiguration(), source: `browser-callback:${signatureState}` });
      } catch (error) {
        // خطای استعلام نباید بازگشت مشتری را بشکند؛ صفحه نتیجه وضعیت را نشان می‌دهد.
        console.error('BluePal callback verify failed:', error?.message || error);
      }
    }
  } catch (error) {
    if (Number(error.status) >= 500) console.error('BluePal callback error:', error?.message || error);
  }
  res.statusCode = 302;
  res.setHeader('Location', redirectTo);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

// اعلان نتیجه پرداخت از سمت بلو پال (اعلان قابل‌اعتماد با امضای دیجیتال و تلاش دوباره).
// هیچ مقداری از بدنه پذیرفته نمی‌شود؛ فقط کد پیگیری به‌عنوان سرنخ خوانده می‌شود و
// وضعیت از خود درگاه استعلام می‌گردد.
async function notify(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { received: false });
  const config = getConfig();
  let payload;
  try { payload = readRequestBody(req); }
  catch { return sendJson(res, 400, { received: false, error: 'بدنهٔ اعلان معتبر نیست.' }); }
  if (config.requireWebhookSignature) {
    const provided = headerValue(req, config.webhookSecretHeader);
    if (!config.validWebhookSecret || !safeCompareText(provided, config.webhookSecret)) {
      return sendJson(res, 401, { received: false, error: 'امضای اعلان معتبر نیست.' });
    }
  }
  if (!supabaseServerConfig().serviceConfigured) return sendJson(res, 503, { received: false, retry: true });
  const trackId = readTrackId(payload);
  if (!trackId) return sendJson(res, 200, { received: true, handled: false, reason: 'no_track_id' });
  try {
    const database = serverConfiguration();
    const rows = await selectPaymentByAuthority({ config: database, authority: trackId, fetchImpl: globalThis.fetch });
    const result = await settleStatus({
      orderId: rows.order.id,
      config,
      dbConfig: database,
      source: 'provider-notify'
    });
    return sendJson(res, 200, { received: true, handled: true, orderId: rows.order.id, outcome: result.outcome, code: result.code });
  } catch (error) {
    const status = Number(error.status) || 0;
    if (status === 403 || status === 404 || status === 409) return sendJson(res, status, { received: false, error: error.message });
    return sendJson(res, 500, { received: false, retry: true, error: 'پردازش اعلان بلو پال انجام نشد.' });
  }
}

async function status(req, res) {
  return safeStatus(req, res);
}

module.exports = {
  PROVIDER,
  PROVIDER_LABEL,
  REQUEST_PATH,
  RECEIPT_PATH,
  STATUS_PATH,
  CALLBACK_PATH,
  NOTIFY_PATH,
  DEFAULT_API_BASE,
  TRACK_ID_PATTERN,
  REFERENCE_PATTERN,
  BLUEPAL_CODES,
  getConfig,
  configurationError,
  productionGateError,
  publicOrigin,
  apiUrl,
  callBluePalApi,
  requestPayment,
  verifyPayment,
  normalizePaymentUrl,
  readTrackId,
  readReference,
  normalizeOrder,
  signPayload,
  readSignedPayload,
  makeReceipt,
  readReceipt,
  makeCallbackToken,
  readCallbackToken,
  readProviderMeta,
  settlementArguments,
  createPaymentIntent,
  settleStatus,
  persistSettlement,
  status,
  request,
  receipt,
  callback,
  notify
};

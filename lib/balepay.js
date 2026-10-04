'use strict';

/* Bale Pay (بله‌پی) — پرداخت کیف‌پول بله از طریق API بازو.
 * مستند رسمی: https://docs.bale.ai/#%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA
 *
 * متدهای مورد استفاده (BASE = https://tapi.bale.ai):
 *   createInvoiceLink      -> ساخت شناسهٔ صورتحساب کیف‌پولی؛ خروجی مستقیماً به
 *                             WebApp.openInvoice() مینی‌اپ بله داده می‌شود.
 *   sendInvoice            -> ارسال پیام «درخواست پول» داخل گفتگوی بازو.
 *   answerPreCheckoutQuery -> تأیید/رد پرداخت پیش از نهایی‌شدن (سقف ۱۰ ثانیه).
 *   inquireTransaction     -> استعلام وضعیت معتبر تراکنش از سمت سرور.
 *   setWebhook/getWebhookInfo/deleteWebhook -> دریافت آپدیت‌های پرداخت.
 *
 * شماره کارت، رمز پویا و CVV هرگز از فروشگاه عبور نمی‌کند؛ پول فقط در کیف‌پول
 * بله جابه‌جا می‌شود و تسویه به کیف‌پول توسعه‌دهندهٔ بازو واریز می‌گردد.
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

const PROVIDER = 'balepay';
const PROVIDER_LABEL = 'Bale Pay · کیف‌پول بله';
const WEBHOOK_PATH = '/api/payment/balepay/webhook';
const RECEIPT_PATH = '/api/payment/balepay/receipt';
const REQUEST_PATH = '/api/payment/balepay/request';
const STATUS_PATH = '/api/payment/balepay/status';
const DEFAULT_API_BASE = 'https://tapi.bale.ai';
const MINI_APP_SDK = 'https://tapi.bale.ai/miniapp.js';
const TEST_PROVIDER_TOKEN = 'WALLET-TEST-1111111111111111';
const MINIMUM_AMOUNT_RIAL = 10000; // حداقل ۱۰۰۰ تومان
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
const INVOICE_PAYLOAD_LIMIT = 128; // محدودیت رسمی payload در مستندات بله
const AUTHORITY_PREFIX = 'blp_';
const AUTHORITY_PATTERN = /^blp_[0-9a-f]{32}$/;
const INTENT_PATTERN = /^[0-9a-f]{32}$/;
const TRANSACTION_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const ORDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BALE_TRANSACTION_STATUSES = ['pending', 'paid', 'failed', 'rejected'];

function fail(message, status = 502, extra = {}) {
  return Object.assign(new Error(message), extra, { status });
}

function normalizeApiBase(value) {
  const raw = String(value || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.host);
    if (!(url.protocol === 'https:' || (local && url.protocol === 'http:'))) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function getConfig(env = process.env) {
  const rawMode = String(env.BALEPAY_MODE || 'sandbox').trim().toLowerCase();
  const validMode = rawMode === 'sandbox' || rawMode === 'production';
  const mode = validMode ? rawMode : 'sandbox';
  const sandbox = mode === 'sandbox';
  const botToken = String(env.BALEPAY_BOT_TOKEN || '').trim();
  const providerToken = String(env.BALEPAY_PROVIDER_TOKEN || '').trim();
  const stateSecret = String(env.BALEPAY_STATE_SECRET || '');
  const botUsername = String(env.BALEPAY_BOT_USERNAME || '').trim().replace(/^@/, '');
  const webhookSecret = String(env.BALEPAY_WEBHOOK_SECRET || '').trim();
  const requireWebhookSecret = isTruthy(env.BALEPAY_REQUIRE_WEBHOOK_SECRET);
  const livePaymentsRequested = isTruthy(env.BALEPAY_ENABLE_LIVE_PAYMENTS);
  const validBotToken = /^\d{4,20}:[A-Za-z0-9_-]{20,128}$/.test(botToken);
  const validProviderToken = /^[A-Za-z0-9_-]{16,128}$/.test(providerToken);
  const usesTestProviderToken = providerToken === TEST_PROVIDER_TOKEN;
  const validStateSecret = Buffer.byteLength(stateSecret, 'utf8') >= 32;
  const validBotUsername = botUsername === '' || /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername);
  const validWebhookSecret = webhookSecret === '' || Buffer.byteLength(webhookSecret, 'utf8') >= 16;
  const apiBase = normalizeApiBase(env.BALEPAY_API_BASE);
  const configured = validMode && validBotToken && validProviderToken && validStateSecret && validBotUsername && validWebhookSecret && apiBase !== null;
  // دریافت وجه واقعی عمداً پشت یک کلید صریح قفل است؛ حالت sandbox با توکن آزمایشی همیشه مجاز است.
  const livePaymentsAllowed = configured && (sandbox || (mode === 'production' && livePaymentsRequested && !usesTestProviderToken));
  return {
    mode,
    sandbox,
    apiBase: apiBase || DEFAULT_API_BASE,
    apiBaseValid: apiBase !== null,
    botToken,
    providerToken,
    stateSecret,
    botUsername,
    webhookSecret,
    requireWebhookSecret,
    validMode,
    validBotToken,
    validProviderToken,
    validStateSecret,
    validBotUsername,
    validWebhookSecret,
    usesTestProviderToken,
    livePaymentsRequested,
    configured,
    livePaymentsAllowed,
    providerTokenKind: validProviderToken ? (usesTestProviderToken ? 'test' : 'live') : 'missing',
    sdkUrl: MINI_APP_SDK,
    webhookPath: WEBHOOK_PATH,
    receiptPath: RECEIPT_PATH,
    requestPath: REQUEST_PATH,
    statusPath: STATUS_PATH,
    miniAppUrl: validBotUsername && botUsername ? `https://ble.ir/${botUsername}?startapp` : '',
    testProviderToken: TEST_PROVIDER_TOKEN
  };
}

function configurationError(config) {
  if (!config.validMode) return fail('BALEPAY_MODE فقط می‌تواند sandbox یا production باشد.', 503);
  if (!config.apiBaseValid) return fail('BALEPAY_API_BASE باید یک نشانی HTTPS معتبر بدون مسیر باشد (پیش‌فرض https://tapi.bale.ai).', 503);
  if (!config.validBotToken) return fail('توکن بازوی بله تنظیم نشده یا معتبر نیست؛ BALEPAY_BOT_TOKEN باید از @botfather گرفته شود (فرمت 123456:abcd...).', 503);
  if (!config.validProviderToken) return fail('توکن پرداخت کیف‌پول معتبر نیست؛ برای آزمون از WALLET-TEST-1111111111111111 و برای عملیات از توکن واقعی @botfather در BALEPAY_PROVIDER_TOKEN استفاده کنید.', 503);
  if (!config.validStateSecret) return fail('BALEPAY_STATE_SECRET باید یک مقدار تصادفی حداقل ۳۲ کاراکتری باشد.', 503);
  if (!config.validBotUsername) return fail('BALEPAY_BOT_USERNAME باید ۵ تا ۳۲ کاراکتر (حرف، رقم یا زیرخط) باشد.', 503);
  if (!config.validWebhookSecret) return fail('BALEPAY_WEBHOOK_SECRET در صورت تنظیم باید حداقل ۱۶ کاراکتر باشد.', 503);
  return null;
}

function productionGateError(config) {
  if (config.sandbox) return null;
  if (!config.livePaymentsRequested) return fail('دریافت وجه واقعی با توکن عملیاتی بله عمداً قفل است؛ پس از تأیید جریان sandbox متغیر BALEPAY_ENABLE_LIVE_PAYMENTS=true را تنظیم کنید.', 503);
  if (config.usesTestProviderToken) return fail('در حالت production نمی‌توان از توکن آزمایشی کیف‌پول استفاده کرد؛ BALEPAY_PROVIDER_TOKEN توکن پرداخت واقعی بازو را وارد کنید.', 503);
  return null;
}

function safeStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const config = getConfig();
  const database = supabaseServerConfig();
  const serverCommerceReady = config.configured && database.serviceConfigured;
  return sendJson(res, 200, {
    success: true,
    provider: PROVIDER,
    providerLabel: PROVIDER_LABEL,
    configured: serverCommerceReady,
    paymentEnabled: serverCommerceReady && config.livePaymentsAllowed,
    mode: config.mode,
    sandbox: config.sandbox,
    providerTokenKind: config.providerTokenKind,
    livePaymentsAllowed: config.livePaymentsAllowed,
    botUsername: config.botUsername || null,
    miniAppUrl: config.miniAppUrl || null,
    webhookPath: config.webhookPath,
    receiptPath: config.receiptPath,
    requiresWebhook: true,
    webhookSecretRequired: config.requireWebhookSecret,
    checkoutStorage: 'supabase-postgres',
    amountUnit: 'IRR',
    minimumAmountToman: MINIMUM_AMOUNT_RIAL / 10,
    invoiceMethods: ['createInvoiceLink', 'sendInvoice', 'answerPreCheckoutQuery', 'inquireTransaction'],
    liveCheckoutSafe: false,
    note: serverCommerceReady
      ? 'صورتحساب در کیف‌پول بله پرداخت می‌شود؛ نهایی‌سازی سفارش فقط پس از استعلام inquireTransaction و رویداد موفقیت بازو انجام می‌شود.'
      : 'پیکربندی سروری Supabase یا توکن‌های بازوی بله کامل نیست؛ پرداخت غیرفعال است.'
  });
}

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
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
  if (requestHost && origin.host.toLowerCase() !== requestHost) {
    throw fail('مبدأ درخواست با دامنهٔ فروشگاه یکسان نیست.', 403);
  }
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.host);
  if (origin.protocol !== 'https:' && !localHost) {
    throw fail('درخواست پرداخت فقط روی HTTPS مجاز است.', 400);
  }
  return origin.origin;
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[\s()-]/g, '');
}

function assertOrderId(orderId) {
  const value = String(orderId || '').trim();
  if (!ORDER_UUID_PATTERN.test(value)) throw fail('شناسهٔ سفارش معتبر نیست.', 400);
  return value;
}

function normalizeOrder(body) {
  const orderId = String(body?.orderId || '').trim();
  const amountToman = Number(body?.amountToman);
  if (!ORDER_UUID_PATTERN.test(orderId) && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(orderId)) throw fail('شناسهٔ سفارش معتبر نیست.', 400);
  if (!Number.isSafeInteger(amountToman) || amountToman <= 0 || amountToman > Math.floor(Number.MAX_SAFE_INTEGER / 10)) {
    throw fail('مبلغ سفارش باید یک عدد صحیح و معتبر به تومان باشد.', 400);
  }
  const amountRial = amountToman * 10;
  if (!Number.isSafeInteger(amountRial) || amountRial < MINIMUM_AMOUNT_RIAL) throw fail('حداقل مبلغ قابل پرداخت در بله‌پی ۱۰۰۰ تومان است.', 400);
  const mobile = normalizeDigits(body?.phone);
  if (mobile && !/^09\d{9}$/.test(mobile)) throw fail('شمارهٔ موبایل پرداخت معتبر نیست.', 400);
  return { orderId, amountToman, amountRial, mobile };
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
  const actualBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
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

// payload صورتحساب بله حداکثر ۱۲۸ بایت است، بنابراین یک توکن فشرده امضاشده
// می‌سازیم: <intent32>.<issuedAt base36>.<nonce>.<hmac22>. مبلغ هرگز از این
// توکن خوانده نمی‌شود و فقط از رکورد پرداخت در پایگاه داده گرفته می‌شود.
function paymentIntent(orderId, secret) {
  return crypto.createHmac('sha256', `balepay-intent|${secret}`).update(String(orderId).toLowerCase()).digest('hex').slice(0, 32);
}

function buildInvoicePayload({ orderId, secret, now = Date.now() }) {
  const intent = paymentIntent(orderId, secret);
  const body = `${intent}.${Number(now()).toString(36)}.${crypto.randomBytes(4).toString('base64url')}`;
  const signature = crypto.createHmac('sha256', secret).update(`pl|${body}`).digest('base64url').slice(0, 22);
  const payload = `${body}.${signature}`;
  if (Buffer.byteLength(payload, 'utf8') > INVOICE_PAYLOAD_LIMIT) throw fail('پیام‌رسان صورتحساب بله از سقف ۱۲۸ بایت فراتر رفته است.', 500);
  return { payload, intent, authority: `${AUTHORITY_PREFIX}${intent}` };
}

function readInvoicePayload(payload, secret, now = Date.now()) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 4) throw fail('پیام‌رسان صورتحساب بله معتبر نیست.', 400);
  const [intent, issued, nonce, signature] = parts;
  if (!INTENT_PATTERN.test(intent) || !/^[0-9a-z]{4,10}$/.test(issued) || !/^[A-Za-z0-9_-]{4,16}$/.test(nonce) || !/^[A-Za-z0-9_-]{22}$/.test(signature)) {
    throw fail('پیام‌رسان صورتحساب بله معتبر نیست.', 400);
  }
  const expected = crypto.createHmac('sha256', secret).update(`pl|${intent}.${issued}.${nonce}`).digest('base64url').slice(0, 22);
  const actualBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    throw fail('امضای صورتحساب بله معتبر نیست.', 403);
  }
  const issuedAt = Number.parseInt(issued, 36);
  assertFresh(issuedAt, now);
  return { intent, authority: `${AUTHORITY_PREFIX}${intent}`, issuedAt };
}

function makeReceipt(state, config, { transactionId = '', outcome = 'pending', referenceId = '', providerCode = '', now = Date.now } = {}) {
  return signPayload({
    v: 1,
    provider: PROVIDER,
    orderId: state.orderId,
    amountToman: state.amountToman,
    intent: state.intent,
    transactionId: String(transactionId || '').slice(0, 128),
    outcome,
    referenceId: String(referenceId || '').slice(0, 80),
    providerCode: String(providerCode || '').slice(0, 32),
    issuedAt: now()
  }, config.stateSecret);
}

function readReceipt(token, config, now = Date.now()) {
  const receipt = readSignedPayload(token, config.stateSecret);
  if (receipt.v !== 1 || receipt.provider !== PROVIDER || !AUTHORITY_PATTERN.test(String(`${AUTHORITY_PREFIX}${receipt.intent || ''}`)) || !Number.isSafeInteger(Number(receipt.amountToman))) {
    throw fail('رسید بله‌پی معتبر نیست.', 400);
  }
  assertFresh(receipt.issuedAt, now);
  return receipt;
}

/* --------------------------------------------------------------- Bale API */

function apiUrl(config, method) {
  return `${config.apiBase}/bot${config.botToken}/${method}`;
}

async function callBaleApi({ config, method, params = {}, fetchImpl = globalThis.fetch, timeoutMs = 12000 }) {
  if (typeof fetchImpl !== 'function') throw fail('ارتباط شبکهٔ سرور برای سرویس پرداخت بله در دسترس نیست.', 503);
  let response;
  try {
    // هشدار: نشانی درخواست شامل توکن بازو است؛ هرگز آن را لاگ یا به کلاینت برنگردانید.
    response = await fetchImpl(apiUrl(config, method), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw fail('اتصال امن به سرویس پرداخت بله برقرار نشد؛ کمی بعد دوباره تلاش کنید.', 502);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw fail('پاسخ بله قابل‌خواندن نبود.', 502); }
  if (!payload || typeof payload !== 'object' || payload.ok !== true) {
    const code = Number(payload?.error_code) || Number(response.status) || 0;
    const description = String(payload?.description || '').slice(0, 140);
    throw fail(`سرویس پرداخت بله پاسخ موفق نداد${code ? ` (کد ${code})` : ''}${description ? ` — ${description}` : ''}.`, 502, { baleErrorCode: code || undefined });
  }
  return payload.result;
}

function clampCharacters(value, max) {
  return Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
}

// createInvoiceLink خروجی را گاهی به‌صورت رشتهٔ خالص و گاهی داخل یک شیء برمی‌گرداند.
function extractInvoiceParams(result) {
  if (typeof result === 'string') return result.trim();
  if (result && typeof result === 'object') {
    const candidate = result.result ?? result.url ?? result.invoice_id ?? result.invoiceId ?? result.invoice_link ?? result.link;
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}

function invoiceCopy({ orderNumber, amountRial }) {
  const title = clampCharacters(`سفارش طوبی ${orderNumber || ''}`, 32) || 'سفارش کفش طوبی';
  const description = clampCharacters(`پرداخت سفارش ${orderNumber || '—'} به مبلغ ${Number(amountRial).toLocaleString('fa-IR')} ریال از طریق کیف‌پول بله`, 255);
  return { title, description };
}

async function createInvoiceLink({ config, amountRial, orderId, orderNumber, now = Date.now, fetchImpl = globalThis.fetch }) {
  const { payload, intent, authority } = buildInvoicePayload({ orderId, secret: config.stateSecret, now });
  const { title, description } = invoiceCopy({ orderNumber, amountRial });
  const result = await callBaleApi({
    config,
    method: 'createInvoiceLink',
    fetchImpl,
    params: {
      title,
      description,
      payload,
      provider_token: config.providerToken,
      prices: [{ label: clampCharacters('مجموع سفارش', 32) || 'مجموع سفارش', amount: amountRial }]
    }
  });
  const invoice = extractInvoiceParams(result);
  if (!invoice || invoice.length > 2048 || /[\s]/.test(invoice)) {
    throw fail('بله شناسهٔ صورتحساب معتبری برنگرداند؛ از فعال‌بودن پرداخت کیف‌پول در @botfather اطمینان حاصل کنید.', 502, { baleRawResult: typeof result === 'string' });
  }
  return { invoice, payload, intent, authority, title, description };
}

async function sendInvoiceMessage({ config, chatId, amountRial, orderId, orderNumber, now = Date.now, fetchImpl = globalThis.fetch }) {
  const chat = String(chatId || '').trim();
  if (!/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d{4,20})$/.test(chat)) throw fail('شناسهٔ گفتگوی بله برای ارسال صورتحساب معتبر نیست.', 400);
  const { payload, intent, authority } = buildInvoicePayload({ orderId, secret: config.stateSecret, now });
  const { title, description } = invoiceCopy({ orderNumber, amountRial });
  const message = await callBaleApi({
    config,
    method: 'sendInvoice',
    fetchImpl,
    params: {
      chat_id: /^@/.test(chat) ? chat : Number(chat),
      title,
      description,
      payload,
      provider_token: config.providerToken,
      prices: [{ label: 'مجموع سفارش', amount: amountRial }]
    }
  });
  return { message, payload, intent, authority, chatId: chat };
}

async function answerPreCheckoutQuery({ config, preCheckoutQueryId, ok, errorMessage = '', fetchImpl = globalThis.fetch }) {
  const params = { pre_checkout_query_id: String(preCheckoutQueryId || ''), ok: Boolean(ok) };
  if (!ok) params.error_message = clampCharacters(errorMessage || 'امکان تکمیل پرداخت وجود ندارد؛ دوباره تلاش کنید.', 200);
  return callBaleApi({ config, method: 'answerPreCheckoutQuery', params, fetchImpl, timeoutMs: 8000 });
}

function normalizeTransaction(result, expectedTransactionId, expectedAmountRial) {
  const transaction = result && typeof result === 'object' ? result : {};
  const id = String(transaction.id ?? transaction.transaction_id ?? expectedTransactionId ?? '');
  const status = String(transaction.status || '').trim().toLowerCase();
  const amount = Number(transaction.amount);
  if (!TRANSACTION_PATTERN.test(id)) throw fail('شناسهٔ تراکنش بازگشتی از بله معتبر نیست.', 502);
  if (!BALE_TRANSACTION_STATUSES.includes(status)) throw fail(`وضعیت تراکنش بله نامشخص است (${status ? status.slice(0, 24) : 'بدون وضعیت'}).`, 502);
  if (!Number.isSafeInteger(amount) || amount !== Number(expectedAmountRial)) {
    throw fail('مبلغ تراکنش بله با مبلغ سفارش هم‌خوانی ندارد.', 409);
  }
  return {
    transactionId: id,
    status,
    amountRial: amount,
    outcome: status === 'paid' ? 'paid' : status === 'pending' ? 'pending' : 'failed',
    userId: transaction.userID ?? transaction.user_id ?? null,
    createdAt: transaction.createdAt ?? transaction.created_at ?? null
  };
}

async function inquireTransaction({ config, transactionId, expectedAmountRial, fetchImpl = globalThis.fetch }) {
  const id = String(transactionId || '').trim();
  if (!TRANSACTION_PATTERN.test(id)) throw fail('شناسهٔ تراکنش برای استعلام معتبر نیست.', 400);
  const result = await callBaleApi({ config, method: 'inquireTransaction', params: { transaction_id: id }, fetchImpl });
  return normalizeTransaction(result, id, expectedAmountRial);
}

async function setWebhook({ config, url, fetchImpl = globalThis.fetch }) {
  const parsed = new URL(String(url || ''));
  if (parsed.protocol !== 'https:') throw fail('وب‌هوک بازوی بله فقط روی HTTPS و پورت ۴۴۳ یا ۸۸ پذیرفته می‌شود.', 400);
  if (![443, 88].includes(Number(parsed.port || 443))) throw fail('پورت وب‌هوک باید 443 یا 88 باشد.', 400);
  const params = { url: parsed.origin + parsed.pathname + (parsed.search || '') };
  // بله متغیر secret_token تلگرام را در مستندات بازو ندارد؛ در صورت تنظیم شدن،
  // مقدار آن در هدر x-balepay-secret بررسی می‌شود.
  if (config.webhookSecret) params.secret_token = config.webhookSecret;
  return callBaleApi({ config, method: 'setWebhook', params, fetchImpl });
}

async function deleteWebhook({ config, fetchImpl = globalThis.fetch }) {
  return callBaleApi({ config, method: 'deleteWebhook', params: { url: '' }, fetchImpl });
}

async function getWebhookInfo({ config, fetchImpl = globalThis.fetch }) {
  return callBaleApi({ config, method: 'getWebhookInfo', params: {}, fetchImpl });
}

/* ------------------------------------------------------- settlement logic */

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
  if (!result || result.outcome === 'pending') return null;
  const config = dbConfig || serverConfiguration();
  const { order, payment } = await selectOrderPayment({ config, orderId: result.orderId, fetchImpl });
  const amount = Number(result.amountToman);
  if (!Number.isSafeInteger(amount) || amount !== Number(order.total_toman) || amount !== Number(payment.amount_toman)) {
    throw fail('مبلغ رسید با سفارش ذخیره‌شده مطابقت ندارد.', 409);
  }
  let authority = String(result.authority || '');
  if (payment.authority && authority && payment.authority !== authority) throw fail('شناسهٔ مرجع پرداخت با تراکنش پایگاه داده مطابقت ندارد.', 403);
  if (!authority) authority = String(payment.authority || '');
  if (result.outcome === 'paid' && !authority) throw fail('شناسهٔ مرجع پرداخت در پایگاه داده ثبت نشده است.', 409);
  if (payment.status === 'verified') {
    if (result.outcome !== 'paid') throw fail('وضعیت نهایی پرداخت قبلاً ثبت شده است.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: 'paid' };
  }
  if (payment.status === 'failed') {
    if (result.outcome === 'paid') throw fail('این پرداخت قبلاً ناموفق یا لغوشده ثبت شده و قابل‌تغییر نیست.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: result.outcome };
  }
  return callServiceRpc('settle_balepay_payment', settlementArguments({
    orderId: order.id,
    authority,
    outcome: result.outcome === 'cancelled' ? 'cancelled' : result.outcome,
    amountToman: amount,
    referenceId: result.referenceId,
    providerCode: result.providerCode,
    extra: { transactionId: result.transactionId || '', baleStatus: result.baleStatus || '' }
  }), config, fetchImpl);
}

/* -------------------------------------------------------------- handlers */

function readRequestBody(req) {
  try { return requestBody(req); }
  catch (error) { throw Object.assign(error, { status: Number(error.status) || 400 }); }
}

function queryFromRequest(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req?.url || '/', 'https://store.invalid').searchParams.entries()); }
  catch { return {}; }
}

async function createPaymentIntent({ body, req, origin, env = process.env, dbConfig, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const gate = productionGateError(config);
  if (gate) throw gate;
  const order = normalizeOrder(body);
  const safeOrigin = getOrigin(req, origin);
  const invoice = await createInvoiceLink({
    config,
    amountRial: order.amountRial,
    orderId: order.orderId,
    orderNumber: body?.orderNumber || order.orderId,
    now,
    fetchImpl
  });
  return {
    success: true,
    provider: PROVIDER,
    mode: config.mode,
    sandbox: config.sandbox,
    orderId: order.orderId,
    intent: invoice.intent,
    authority: invoice.authority,
    amountToman: order.amountToman,
    amountRial: order.amountRial,
    invoice: invoice.invoice,
    openMode: /^https?:\/\//i.test(invoice.invoice) ? 'url' : 'miniapp',
    paymentUrl: /^https?:\/\//i.test(invoice.invoice) ? invoice.invoice : '',
    miniAppUrl: config.botUsername ? `https://ble.ir/${config.botUsername}?startapp=pay:${order.orderId}` : '',
    sdkUrl: config.sdkUrl,
    origin: safeOrigin,
    receipt: makeReceipt({ orderId: order.orderId, amountToman: order.amountToman, intent: invoice.intent }, config, { transactionId: '', outcome: 'pending', providerCode: 'INVOICE_CREATED', now })
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
    if (payment.authority && payment.authority !== created.authority) throw fail('این سفارش با صورتحساب بله دیگری شروع شده است؛ برای تلاش دوباره با پشتیبانی تماس بگیرید.', 409);
    if (!payment.authority) {
      try { await callServiceRpc('attach_balepay_invoice', { p_order_id: orderId, p_authority: created.authority }, customer); }
      catch (error) {
        const latest = await selectOwnedPendingOrder({ config: customer, orderId, userId: customer.userId });
        if (latest.payment.authority !== created.authority) throw error;
      }
    }
    return sendJson(res, 200, {
      success: true,
      provider: PROVIDER,
      mode: config.mode,
      sandbox: config.sandbox,
      orderId,
      orderNumber: order.number || '',
      intent: created.intent,
      invoice: created.invoice,
      openMode: created.openMode,
      paymentUrl: created.paymentUrl,
      miniAppUrl: created.miniAppUrl,
      sdkUrl: created.sdkUrl,
      amountToman: created.amountToman,
      amountRial: created.amountRial,
      receipt: created.receipt,
      webhookPath: config.webhookPath,
      pollAfterMs: 4000
    });
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error: error.message || 'ساخت صورتحساب بله‌پی انجام نشد.' });
  }
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === target) return firstHeader(value);
  return '';
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || !right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function handleUpdate({ update, env = process.env, config: providedConfig = null, dbConfig, fetchImpl = globalThis.fetch, now = Date.now }) {
  const config = providedConfig || getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  if (!update || typeof update !== 'object') return { handled: false, reason: 'invalid_update' };

  if (update.pre_checkout_query && typeof update.pre_checkout_query === 'object') {
    const preCheckout = update.pre_checkout_query;
    const queryId = String(preCheckout.id || '');
    let intent = null;
    let order = null;
    let payment = null;
    try {
      intent = readInvoicePayload(preCheckout.invoice_payload, config.stateSecret, now());
      const rows = await selectPaymentByAuthority({ config: dbConfig || serverConfiguration(), authority: intent.authority, fetchImpl });
      order = rows.order;
      payment = rows.payment;
      const expectedRial = Number(order.total_toman) * 10;
      const amountOk = Number(preCheckout.total_amount) === expectedRial && String(preCheckout.currency || 'IRR').toUpperCase() === 'IRR';
      if (!amountOk || !TRANSACTION_PATTERN.test(queryId)) throw fail('مبلغ یا شناسه تراکنش با سفارش هم‌خوانی ندارد.', 409);
      await answerPreCheckoutQuery({ config, preCheckoutQueryId: queryId, ok: true, fetchImpl });
      try {
        await callServiceRpc('attach_balepay_invoice', { p_order_id: order.id, p_authority: intent.authority, p_transaction_id: queryId }, dbConfig || serverConfiguration(), fetchImpl);
      } catch (error) {
        console.error('BalePay pre-checkout transaction id could not be stored:', error?.message || error);
      }
      return { handled: true, reason: 'pre_checkout_accepted', orderId: order.id, transactionId: queryId };
    } catch (error) {
      if (queryId) {
        try { await answerPreCheckoutQuery({ config, preCheckoutQueryId: queryId, ok: false, errorMessage: error.status === 409 ? 'مبلغ سفارش تغییر کرده است.' : 'سفارش در دسترس نیست.', fetchImpl }); }
        catch (answerError) { console.error('BalePay could not reject the pre-checkout query:', answerError?.message || answerError); }
      }
      return { handled: true, reason: 'pre_checkout_rejected', error: error.message };
    }
  }

  const message = update.message || update.edited_message;
  const successful = message && typeof message === 'object' ? message.successful_payment : null;
  if (!successful || typeof successful !== 'object') return { handled: false, reason: 'ignored' };

  const intent = readInvoicePayload(successful.invoice_payload, config.stateSecret, now());
  const rows = await selectPaymentByAuthority({ config: dbConfig || serverConfiguration(), authority: intent.authority, fetchImpl });
  const { order, payment } = rows;
  const expectedRial = Number(order.total_toman) * 10;
  if (Number(successful.total_amount) !== expectedRial) throw fail('مبلغ پرداخت اعلامی با سفارش هم‌خوانی ندارد.', 409);
  const transactionId = String(successful.telegram_payment_charge_id || successful.provider_payment_charge_id || payment.provider_reference || '');
  if (!TRANSACTION_PATTERN.test(transactionId)) throw fail('بله شناسهٔ تراکنشی برای استعلام برنگرداند.', 502);
  // هیچ پرداختی بدون تأیید سمت سرور نهایی نمی‌شود.
  const transaction = await inquireTransaction({ config, transactionId, expectedAmountRial: expectedRial, fetchImpl });
  const result = {
    orderId: order.id,
    authority: intent.authority,
    amountToman: Number(order.total_toman),
    transactionId,
    baleStatus: transaction.status,
    referenceId: String(successful.provider_payment_charge_id || transactionId).slice(0, 80),
    providerCode: transaction.status,
    outcome: transaction.outcome
  };
  const settlement = await persistSettlement(result, { dbConfig: dbConfig || serverConfiguration(), fetchImpl });
  return { handled: true, reason: transaction.outcome === 'paid' ? 'payment_settled' : transaction.outcome, orderId: order.id, transactionId, settlement };
}

async function webhook(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false });
  const config = getConfig();
  if (config.requireWebhookSecret && !safeCompare(config.webhookSecret, headerValue(req, 'x-balepay-secret'))) {
    return sendJson(res, 401, { ok: false });
  }
  let update;
  try { update = readRequestBody(req); }
  catch { return sendJson(res, 400, { ok: false }); }
  if (!supabaseServerConfig().serviceConfigured) return sendJson(res, 503, { ok: false, retry: true });
  try {
    const result = await handleUpdate({ update, dbConfig: serverConfiguration() });
    return sendJson(res, 200, { ok: true, handled: Boolean(result.handled), reason: result.reason || 'ignored' });
  } catch (error) {
    const status = Number(error.status) || 0;
    // خطاهای موقت پایگاه داده/شبکه با پاسخ ۵xx تا بله آپدیت را دوباره تلاش کند.
    if (status === 502 || status === 503) return sendJson(res, 503, { ok: false, retry: true });
    console.error('BalePay webhook update could not be processed:', error?.message || error);
    return sendJson(res, 200, { ok: true, handled: false, reason: 'ignored' });
  }
}

function outcomeFromPayment(payment) {
  const savedOutcome = payment?.callback_payload?.outcome;
  if (payment?.status === 'verified') return 'paid';
  if (payment?.status === 'failed') return ['failed', 'cancelled', 'expired'].includes(savedOutcome) ? savedOutcome : 'failed';
  return 'pending';
}

async function settleStatus({ orderId, expectedAmountToman = null, config = getConfig(), dbConfig, fetchImpl = globalThis.fetch, now = Date.now }) {
  const database = dbConfig || serverConfiguration();
  const rows = await selectOrderPayment({ config: database, orderId, fetchImpl });
  const { order, payment } = rows;
  if (expectedAmountToman !== null && Number(expectedAmountToman) !== Number(order.total_toman)) {
    throw fail('مبلغ رسید با سفارش ثبت‌شده مطابقت ندارد.', 409);
  }
  if (!AUTHORITY_PATTERN.test(String(payment.authority || ''))) throw fail('سفارش هنوز صورتحساب بله‌پی ندارد.', 409);
  const configFailure = configurationError(config);
  const expectedRial = Number(order.total_toman) * 10;
  let outcome = outcomeFromPayment(payment);
  let referenceId = String(payment.provider_reference || '');
  let providerCode = String(payment.provider_code || '');
  let transactionId = '';
  if (payment.status === 'pending') {
    transactionId = String(payment.provider_reference || '');
    if (TRANSACTION_PATTERN.test(transactionId) && !configFailure && config.livePaymentsAllowed) {
      try {
        const transaction = await inquireTransaction({ config, transactionId, expectedAmountRial: expectedRial, fetchImpl });
        providerCode = transaction.status;
        outcome = transaction.outcome;
        if (transaction.outcome !== 'pending') {
          await persistSettlement({
            orderId: order.id,
            authority: payment.authority,
            amountToman: Number(order.total_toman),
            transactionId,
            baleStatus: transaction.status,
            referenceId: transactionId,
            providerCode: transaction.status,
            outcome: transaction.outcome
          }, { dbConfig: database, fetchImpl });
        }
      } catch (error) {
        outcome = 'pending';
        providerCode = Number(error.status) === 409 ? 'AMOUNT_MISMATCH' : 'INQUIRY_UNAVAILABLE';
      }
    }
  }
  const receipt = makeReceipt({ orderId: order.id, amountToman: Number(order.total_toman), intent: String(payment.authority).slice(AUTHORITY_PREFIX.length) }, config, {
    transactionId,
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
    amountToman: Number(order.total_toman),
    amountRial: expectedRial,
    authority: payment.authority,
    intent: String(payment.authority).slice(AUTHORITY_PREFIX.length),
    outcome,
    referenceId: outcome === 'paid' ? referenceId : '',
    providerCode,
    waitingForWebhook: payment.status === 'pending' && !TRANSACTION_PATTERN.test(String(payment.provider_reference || '')),
    receipt: config.validStateSecret ? receipt : '',
    note: configFailure ? 'پیکربندی سروری بله‌پی کامل نیست؛ فقط وضعیت پایگاه داده نمایش داده می‌شود.' : ''
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
    const result = await settleStatus({ orderId, expectedAmountToman, config, dbConfig: customer });
    return sendJson(res, 200, result);
  } catch (error) {
    if (Number(error.status) === 404) return sendJson(res, 404, { error: 'سفارش قابل‌دسترسی پیدا نشد.' });
    return sendJson(res, Number(error.status) || 400, { error: error.message || 'رسید بله‌پی معتبر نیست.' });
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
  WEBHOOK_PATH,
  STATUS_PATH,
  MINIMUM_AMOUNT_RIAL,
  TEST_PROVIDER_TOKEN,
  INVOICE_PAYLOAD_LIMIT,
  AUTHORITY_PATTERN,
  TRANSACTION_PATTERN,
  getConfig,
  configurationError,
  productionGateError,
  apiUrl,
  callBaleApi,
  normalizeDigits,
  normalizeOrder,
  signPayload,
  readSignedPayload,
  buildInvoicePayload,
  readInvoicePayload,
  makeReceipt,
  readReceipt,
  createInvoiceLink,
  sendInvoiceMessage,
  answerPreCheckoutQuery,
  inquireTransaction,
  normalizeTransaction,
  extractInvoiceParams,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  createPaymentIntent,
  handleUpdate,
  settleStatus,
  persistSettlement,
  status,
  request,
  webhook,
  receipt
};

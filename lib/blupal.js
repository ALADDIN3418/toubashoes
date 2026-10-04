'use strict';

/* BluPal (بلوپال · blupal.top) — درگاه کارت‌به‌کارت با فاکتور، مبلغ اصلاحی و وب‌هوک.
 * مستندات: پنل بلوپال ← بخش «داکیومنت» (پایگاه: https://blupal.top/api)
 *
 * فراخوانی‌های استفاده‌شده:
 *   POST /v1/invoices/create                 { amount(ریال، صحیح و الزامی), card_number(اختیاری) }
 *        ← { success, invoice_id, amount, final_amount, status, payment_link, card_number, mode, expires_at }
 *   GET  /v1/invoices/{invoice_id}            ← وضعیت + payer_name/payer_card/payer_bank_name (فقط پس از پرداخت موفق)
 *   POST /v1/sandbox/invoices/{id}/simulate   { scenario }  (فقط با کلید آزمایشی و فاکتور PENDING)
 *   وب‌هوک: { success, event:'payment.completed', invoice_id, status:'PAID', amount, final_amount,
 *             mode, payer_name, payer_card, payer_bank_name }
 *
 * قوانینی که در این فایل رعایت شده است:
 *   • کلید API فقط در هدر X-API-Key و فقط سمت سرور استفاده می‌شود؛ هرگز به مرورگر نمی‌رسد.
 *   • بدنهٔ وب‌هوک و بازگشت مرورگر هیچ‌گاه دلیل پرداخت نیست؛ تنها GET /v1/invoices/{invoice_id}
 *     با status=PAID سفارش را نهایی می‌کند (وب‌هوک فقط سرنخ است، چون امضای آن مستند نشده).
 *   • مبلغ از پایگاه داده (تومان) خوانده و به ریال ×۱۰ تبدیل می‌شود؛ مبلغ پاسخ درگاه فقط
 *     مقایسه می‌شود و هرگز به‌عنوان مبلغ نهایی اعمال نمی‌شود.
 *   • final_amount = amount + عدد تصادفی ۳ رقمی است تا واریز مشتری قابل تشخیص باشد؛
 *     این عدد فقط به مشتری نمایش داده می‌شود و مبنای تأیید، همان amount است.
 *   • callback_url در درخواست ارسال نمی‌شود (بلوپال آن را در پنل می‌گیرد)؛ صفحهٔ نتیجه
 *     وضعیت را از سرور خودمان می‌پرسد و همین، مسیر مطمئن بازگشت است.
 *   • settlement یک‌مصرف است (RPC settle_blupal_payment)؛ EXPIRED/CANCELED رزرو موجودی را آزاد می‌کند.
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

const PROVIDER = 'blupal';
const PROVIDER_LABEL = 'BluPal · درگاه بلوپال';
const REQUEST_PATH = '/api/payment/blupal/request';
const RECEIPT_PATH = '/api/payment/blupal/receipt';
const STATUS_PATH = '/api/payment/blupal/status';
const CALLBACK_PATH = '/api/payment/blupal/callback';
const NOTIFY_PATH = '/api/payment/blupal/notify';
const DEFAULT_API_BASE = 'https://blupal.top/api';
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SETTLE_GRACE_MINUTES = 60;
/* شناسهٔ فاکتور در بلوپال عددی و کوتاه است (مثلاً 123)؛ الگوی بلند قبلی آن را رد می‌کرد. */
const INVOICE_ID_PATTERN = /^[0-9]{1,20}$/;
const ORDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{3,48}$/;
const CARD_NUMBER_PATTERN = /^[0-9]{16}$/;
const TOMAN_TO_RIAL = 10;
const MIN_AMOUNT_RIAL = 100000;      // مستندات: amount_too_low زیر ۱۰۰٬۰۰۰ ریال
const MAX_AMOUNT_RIAL = 500000000;   // مستندات: amount_too_high بالای ۵۰۰٬۰۰۰٬۰۰۰ ریال
const SANDBOX_SCENARIOS = ['success', 'wrong_amount', 'expire', 'cancel'];

const INVOICE_STATUSES = {
  PENDING: { outcome: 'pending', label: 'فاکتور هنوز پرداخت نشده است.' },
  PAID: { outcome: 'paid', label: 'واریز مشتری شناسایی و تأیید شده است.' },
  EXPIRED: { outcome: 'expired', label: 'مهلت پرداخت فاکتور به پایان رسیده است.' },
  CANCELED: { outcome: 'cancelled', label: 'فاکتور لغو شده است.' }
};

/* کدهای خطای مستند بلوپال → پیام فارسی و وضعیت HTTP که به مرورگر برگردانده می‌شود. */
const BLUPAL_ERRORS = {
  unauthorized: { http: 502, label: 'کلید API بلوپال پذیرفته نشد؛ BLUPAL_API_KEY و فعال بودن درگاه را در پنل بررسی کنید.' },
  amount_required: { http: 400, label: 'مبلغ فاکتور ارسال نشده است.' },
  amount_too_low: { http: 400, label: `حداقل مبلغ قابل پرداخت در بلوپال ${faNumber(MIN_AMOUNT_RIAL)} ریال است.` },
  amount_too_high: { http: 400, label: `حداکثر مبلغ هر فاکتور بلوپال ${faNumber(MAX_AMOUNT_RIAL)} ریال است.` },
  no_active_card: { http: 502, label: 'هیچ کارت فعالی برای پذیرنده در پنل بلوپال تعریف نشده است.' },
  invalid_invoice_id: { http: 400, label: 'شناسهٔ فاکتور معتبر نیست.' },
  invalid_scenario: { http: 400, label: 'سناریوی شبیه‌سازی معتبر نیست.' },
  invalid_state: { http: 409, label: 'وضعیت فاکتور اجازهٔ این عملیات را نمی‌دهد (فقط فاکتور در انتظار پرداخت).' },
  mode_mismatch: { http: 409, label: 'حالت کلید با حالت فاکتور هم‌خوانی ندارد (کلید تست برای فاکتور واقعی یا برعکس).' },
  not_found: { http: 404, label: 'فاکتور در بلوپال پیدا نشد.' }
};

/* خطاهایی که کاربر باید پیام روشن بگیرد ⇒ 400؛ بقیه خطاهای سرویس 502 می‌مانند. */
const CLIENT_FAULT_ERRORS = ['amount_required', 'amount_too_low', 'amount_too_high', 'invalid_invoice_id', 'invalid_scenario'];

function fail(message, status = 502, extra = {}) {
  return Object.assign(new Error(message), extra, { status });
}

function faNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
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
  const apiKey = String(env.BLUPAL_API_KEY || '').trim();
  const stateSecret = String(env.BLUPAL_STATE_SECRET || '');
  const rawMode = String(env.BLUPAL_MODE || 'sandbox').trim().toLowerCase();
  const validMode = rawMode === 'sandbox' || rawMode === 'production';
  const mode = validMode ? rawMode : 'sandbox';
  const sandbox = mode === 'sandbox';
  const validApiKey = /^blu_(test|live)_[A-Za-z0-9_-]{8,128}$/.test(apiKey);
  const keyMode = apiKey ? (apiKey.startsWith('blu_test_') ? 'sandbox' : 'live') : '';
  const cardNumber = String(env.BLUPAL_CARD_NUMBER || '').replace(/\D/g, '');
  const validCardNumber = cardNumber === '' || CARD_NUMBER_PATTERN.test(cardNumber);
  const validStateSecret = Buffer.byteLength(stateSecret, 'utf8') >= 32;
  const apiBase = normalizeApiBase(env.BLUPAL_API_BASE);
  const apiHost = apiBase ? hostOf(`${apiBase}`) : '';
  const allowedPayHosts = String(env.BLUPAL_ALLOWED_PAY_HOSTS || '')
    .split(',').map(entry => hostOf(`https://${entry.trim()}`)).filter(Boolean);
  const payHosts = allowedPayHosts.length ? allowedPayHosts : (apiHost ? [apiHost] : []);
  // کلید فعال‌ساز وجه واقعی: عمداً جدا از BLUPAL_MODE است تا تغییر حالت، خودش پرداخت را باز نکند.
  const livePaymentsRequested = isTruthy(env.BLUPAL_ENABLE_LIVE_PAYMENTS);
  const keyMatchesMode = !apiKey || keyMode === (sandbox ? 'sandbox' : 'live');
  const configured = validMode && validApiKey && validCardNumber && validStateSecret
    && apiBase !== null && keyMatchesMode && payHosts.length > 0;
  const livePaymentsAllowed = configured && (sandbox || (mode === 'production' && livePaymentsRequested && keyMode === 'live'));
  return {
    mode,
    sandbox,
    apiKey,
    keyMode,
    cardNumber: validCardNumber ? cardNumber : '',
    stateSecret,
    apiBase: apiBase || DEFAULT_API_BASE,
    apiBaseValid: apiBase !== null,
    payHosts,
    validMode,
    validApiKey,
    validCardNumber,
    validStateSecret,
    keyMatchesMode,
    livePaymentsRequested,
    configured,
    livePaymentsAllowed,
    keyKind: apiKey ? (keyMode === 'sandbox' ? 'test' : 'live') : 'missing',
    minAmountRial: MIN_AMOUNT_RIAL,
    maxAmountRial: MAX_AMOUNT_RIAL,
    minAmountToman: MIN_AMOUNT_RIAL / TOMAN_TO_RIAL,
    maxAmountToman: MAX_AMOUNT_RIAL / TOMAN_TO_RIAL,
    requestPath: REQUEST_PATH,
    receiptPath: RECEIPT_PATH,
    statusPath: STATUS_PATH,
    callbackPath: CALLBACK_PATH,
    notifyPath: NOTIFY_PATH,
    // رزرو سفارش‌های بی‌پرداخت نباید بیشتر از عمر مفید فاکتور بلوپال بماند.
    settleGraceMinutes: Math.max(15, numberFrom(env.BLUPAL_SETTLE_GRACE_MINUTES, DEFAULT_SETTLE_GRACE_MINUTES))
  };
}

function configurationError(config) {
  if (!config.validMode) return fail('BLUPAL_MODE فقط می‌تواند sandbox یا production باشد.', 503);
  if (!config.apiBaseValid) return fail('BLUPAL_API_BASE باید نشانی HTTPS معتبر و بدون مسیر اضافه باشد (پیش‌فرض https://blupal.top/api).', 503);
  if (!config.validApiKey) return fail('کلید API بلوپال تنظیم نشده یا قالبش معتبر نیست؛ باید با blu_test_ (آزمایشی) یا blu_live_ (واقعی) آغاز شود.', 503);
  if (!config.keyMatchesMode) return fail(`پیشوند کلید BLUPAL_API_KEY (${config.keyMode}) با BLUPAL_MODE=${config.mode} هم‌خوانی ندارد.`);
  if (!config.validCardNumber) return fail('BLUPAL_CARD_NUMBER باید یک شمارهٔ کارت ۱۶ رقمی باشد (یا خالی بماند تا کارت پیش‌فرض پنل استفاده شود).', 503);
  if (!config.validStateSecret) return fail('BLUPAL_STATE_SECRET باید یک مقدار تصادفی حداقل ۳۲ کاراکتری باشد.', 503);
  if (!config.payHosts.length) return fail('میزبان مجاز صفحه پرداخت بلوپال مشخص نیست؛ BLUPAL_ALLOWED_PAY_HOSTS را تنظیم کنید.', 503);
  return null;
}

function productionGateError(config) {
  if (config.sandbox) return null;
  if (!config.livePaymentsRequested) return fail('دریافت وجه واقعی عمداً قفل است؛ پس از تأیید جریان آزمایشی متغیر BLUPAL_ENABLE_LIVE_PAYMENTS=true را تنظیم کنید.', 503);
  if (config.keyMode !== 'live') return fail('در حالت production نمی‌توان از کلید آزمایشی استفاده کرد؛ BLUPAL_API_KEY باید کلید blu_live_ پنل باشد.', 503);
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
    invoiceId: String(state.invoiceId || ''),
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
    throw fail('رسید بلوپال معتبر نیست.', 400);
  }
  if (receipt.invoiceId !== '' && !INVOICE_ID_PATTERN.test(String(receipt.invoiceId))) throw fail('رسید بلوپال معتبر نیست.', 400);
  assertFresh(receipt.issuedAt, now);
  return receipt;
}

/* ------------------------------------------------------------ BluPal API */

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

/* پاسخ‌های بلوپال صاف‌اند، ولی برای سازگاری با نمونه‌های { data: {...} } هر دو قالب پذیرفته می‌شود. */
function payloadRoot(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const data = source.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return source;
  const merged = { ...data };
  for (const [key, value] of Object.entries(source)) if (key !== 'data' && value !== undefined && value !== null) merged[key] = value;
  return merged;
}

function readInvoiceId(payload) {
  const source = payloadRoot(payload);
  const value = String(source?.invoice_id ?? source?.invoiceId ?? '').trim();
  return INVOICE_ID_PATTERN.test(value) ? value : '';
}

function readTransactionId(payload) {
  const value = String(payload?.transaction_id ?? payload?.transactionId ?? '').trim();
  return REFERENCE_PATTERN.test(value) ? value.slice(0, 48) : '';
}

function readCardTail(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

function readPayer(payload) {
  return {
    name: String(payload?.payer_name ?? '').trim().slice(0, 120),
    cardTail: readCardTail(payload?.payer_card),
    bank: String(payload?.payer_bank_name ?? '').trim().slice(0, 60)
  };
}

/* پیام‌های خود بلوپال فارسی ولی عمومی‌اند؛ برای کدهای مستند، پیامِ اقدام‌محورِ ما اولویت دارد
   و متن درگاه فقط در پرانتز اضافه می‌شود تا ردپای اصلی از بین نرود. */
function describeGatewayError(root, httpStatus) {
  const code = String(root?.error ?? '').trim().toLowerCase();
  const known = BLUPAL_ERRORS[code];
  const vendor = String(root?.message || '').trim().slice(0, 160);
  if (known) {
    return { code, message: `${known.label}${vendor && vendor !== known.label ? ` (${vendor})` : ''}`.slice(0, 240), http: known.http };
  }
  return { code: code.slice(0, 32), message: (vendor || `خطای بلوپال (HTTP ${httpStatus})`).slice(0, 240), http: 0 };
}

async function callBluPalApi({ config, path, method = 'POST', body, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (typeof fetchImpl !== 'function') throw fail('ارتباط شبکهٔ سرور برای سرویس پرداخت بلوپال در دسترس نیست.', 503);
  if (!config || !config.apiKey) throw fail('کلید API بلوپال تنظیم نشده است.', 503);
  let response;
  try {
    response = await fetchImpl(apiUrl(config, path), {
      method,
      headers: {
        Accept: 'application/json',
        // مستندات: کلید در هدر X-API-Key (نسخهٔ query‌ای فقط برای تست دستی است؛ اینجا هرگز).
        'X-API-Key': config.apiKey,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw fail('اتصال امن به سرویس پرداخت بلوپال برقرار نشد.', 502);
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = null; }
  }
  // بدنه‌ای که JSON نباشد هرگز به‌عنوان پاسخ موفق تفسیر نمی‌شود (حتی با HTTP 200).
  if (payload === null && text) throw fail(`پاسخ بلوپال قابل خواندن نبود (HTTP ${response.status}).`, 502, { blupalError: 'invalid_json' });
  const root = payloadRoot(payload);
  const failed = !response.ok || root?.success === false;
  if (failed) {
    const described = describeGatewayError(root, response.status);
    const status = CLIENT_FAULT_ERRORS.includes(described.code) ? 400
      : (Number(described.http) === 409 || Number(described.http) === 404) ? Number(described.http)
      : 502;
    throw fail(described.message, status, { blupalError: described.code, httpStatus: response.status });
  }
  return { payload: payload || {}, root, httpStatus: response.status };
}

function toRial(amountToman) {
  const toman = Number(amountToman);
  if (!Number.isSafeInteger(toman) || toman <= 0) throw fail('مبلغ سفارش باید عدد صحیح مثبت به تومان باشد.', 400);
  const rial = toman * TOMAN_TO_RIAL;
  if (!Number.isSafeInteger(rial)) throw fail('مبلغ سفارش برای تبدیل به ریال بیش از حد بزرگ است.', 400);
  return rial;
}

function assertRialBounds(amountRial) {
  if (amountRial < MIN_AMOUNT_RIAL) {
    throw fail(`حداقل مبلغ قابل پرداخت در بلوپال ${faNumber(MIN_AMOUNT_RIAL)} ریال (${faNumber(MIN_AMOUNT_RIAL / TOMAN_TO_RIAL)} تومان) است؛ مبلغ سبد خرید کمتر از این است.`, 400, { blupalError: 'amount_too_low' });
  }
  if (amountRial > MAX_AMOUNT_RIAL) {
    throw fail(`حداکثر مبلغ هر فاکتور بلوپال ${faNumber(MAX_AMOUNT_RIAL)} ریال است؛ سفارش را به دو بخش تقسیم کنید.`, 400, { blupalError: 'amount_too_high' });
  }
}

function normalizePaymentUrl(value, config) {
  const raw = String(value || '').trim();
  let url;
  try { url = new URL(raw); }
  catch { throw fail('بلوپال نشانی صفحهٔ پرداخت معتبر برنگرداند.', 502); }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('نشانی صفحهٔ پرداخت بلوپال امن نیست.', 502);
  if (!config.payHosts.includes(url.hostname.toLowerCase())) throw fail('نشانی صفحهٔ پرداخت به میزبان معتبر بلوپال تعلق ندارد.', 502);
  return url.toString();
}

/* گام ۱ مستندات: ساخت فاکتور. مبلغ به ریال و عدد صحیح می‌رود؛ card_number اختیاری است. */
async function createInvoice({ config, amountToman, cardNumber, fetchImpl = globalThis.fetch } = {}) {
  const amountRial = toRial(amountToman);
  assertRialBounds(amountRial);
  const body = { amount: amountRial };
  const card = String(cardNumber === undefined ? config.cardNumber : cardNumber || '').replace(/\D/g, '');
  if (CARD_NUMBER_PATTERN.test(card)) body.card_number = card;
  const { root } = await callBluPalApi({ config, path: '/v1/invoices/create', method: 'POST', body, fetchImpl });
  const invoiceId = readInvoiceId(root);
  if (!invoiceId) throw fail('بلوپال شناسهٔ فاکتور (invoice_id) معتبر برنگرداند.', 502, { blupalError: 'invalid_invoice_id' });
  const declaredAmount = readNumber(root?.amount) || amountRial;
  if (Number(declaredAmount) !== amountRial) {
    throw fail('مبلغ ثبت‌شدهٔ فاکتور بلوپال با مبلغ سفارش هم‌خوانی ندارد.', 502, { blupalError: 'amount_mismatch' });
  }
  const finalAmountRial = readNumber(root?.final_amount, root?.finalAmount);
  if (!finalAmountRial || finalAmountRial < amountRial || finalAmountRial > amountRial + 999) {
    throw fail('مبلغ اصلاحی (final_amount) فاکتور بلوپال معتبر نیست.', 502, { blupalError: 'invalid_final_amount' });
  }
  const mode = String(root?.mode ?? '').trim().toLowerCase();
  if (mode && mode !== (config.sandbox ? 'sandbox' : 'live')) {
    throw fail('حالت فاکتور بلوپال با پیکربندی سرور هم‌خوانی ندارد.', 502, { blupalError: 'mode_mismatch' });
  }
  return {
    invoiceId,
    paymentUrl: normalizePaymentUrl(root?.payment_link ?? root?.paymentUrl, config),
    amountRial,
    finalAmountRial,
    status: String(root?.status ?? 'PENDING').trim().toUpperCase() || 'PENDING',
    cardNumber: String(root?.card_number ?? '').replace(/\D/g, '').slice(0, 16),
    mode: mode || (config.sandbox ? 'sandbox' : 'live'),
    expiresAt: root?.expires_at === undefined ? null : root?.expires_at,
    raw: root
  };
}

/* تنها منبع حقیقت برای نهایی‌شدن پرداخت: وضعیت فاکتور از خودِ درگاه. */
async function checkInvoiceStatus({ config, invoiceId, expectedAmountRial = null, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const id = String(invoiceId ?? '').trim();
  if (!INVOICE_ID_PATTERN.test(id)) throw fail('شناسهٔ فاکتور بلوپال معتبر نیست.', 400, { blupalError: 'invalid_invoice_id' });
  const { root } = await callBluPalApi({ config, path: `/v1/invoices/${encodeURIComponent(id)}`, method: 'GET', fetchImpl, timeoutMs });
  const statusText = String(root?.status ?? '').trim().toUpperCase();
  const mapped = INVOICE_STATUSES[statusText];
  const amountRial = readNumber(root?.amount);
  const finalAmountRial = readNumber(root?.final_amount, root?.finalAmount);
  const mode = String(root?.mode ?? '').trim().toLowerCase();
  const modeMatches = !mode || mode === (config.sandbox ? 'sandbox' : 'live');
  let outcome = mapped ? mapped.outcome : 'unknown';
  if (outcome === 'paid' && !modeMatches) outcome = 'error';
  if (outcome === 'paid' && expectedAmountRial !== null && amountRial && Number(amountRial) !== Number(expectedAmountRial)) {
    throw fail('مبلغ تأییدشدهٔ بلوپال با مبلغ سفارش هم‌خوانی ندارد.', 409, { blupalError: 'amount_mismatch' });
  }
  return {
    invoiceId: id,
    status: statusText || 'UNKNOWN',
    outcome,
    amountRial,
    finalAmountRial,
    transactionId: readTransactionId(root),
    payer: readPayer(root),
    mode: mode || (config.sandbox ? 'sandbox' : 'live'),
    modeMatches,
    expiresAt: root?.expires_at === undefined ? null : root?.expires_at,
    message: String(root?.message || (mapped ? mapped.label : '') || '').slice(0, 240),
    raw: root
  };
}

/* گام آزمایشی مستندات: فقط با کلید تستی و فقط در CLI/تست‌ها؛ هیچ route ای آن را صدا نمی‌زند. */
async function simulatePayment({ config, invoiceId, scenario = 'success', fetchImpl = globalThis.fetch } = {}) {
  if (!config.sandbox) throw fail('شبیه‌سازی پرداخت فقط در BLUPAL_MODE=sandbox مجاز است.', 403, { blupalError: 'mode_mismatch' });
  const chosen = String(scenario || 'success').trim().toLowerCase();
  if (!SANDBOX_SCENARIOS.includes(chosen)) throw fail('سناریوی شبیه‌سازی باید یکی از success، wrong_amount، expire یا cancel باشد.', 400, { blupalError: 'invalid_scenario' });
  const id = String(invoiceId ?? '').trim();
  if (!INVOICE_ID_PATTERN.test(id)) throw fail('شناسهٔ فاکتور برای شبیه‌سازی معتبر نیست.', 400, { blupalError: 'invalid_invoice_id' });
  const { root } = await callBluPalApi({ config, path: `/v1/sandbox/invoices/${encodeURIComponent(id)}/simulate`, method: 'POST', body: { scenario: chosen }, fetchImpl });
  return {
    invoiceId: id,
    scenario: chosen,
    status: String(root?.status ?? '').trim().toUpperCase(),
    transactionId: readTransactionId(root),
    raw: root
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
    cardNumber: typeof meta.cardNumber === 'string' ? meta.cardNumber : '',
    referenceId: typeof meta.referenceId === 'string' ? meta.referenceId : '',
    amountRial: Number(meta.amountRial ?? 0) || 0,
    finalAmountRial: Number(meta.finalAmountRial ?? 0) || 0,
    status: String(meta.status ?? payment?.provider_code ?? '').toUpperCase(),
    lastAttemptCode: String(meta.lastAttemptCode ?? payment?.provider_code ?? ''),
    expiresAt: meta.expiresAt === undefined ? null : meta.expiresAt,
    attempts: Array.isArray(meta.attempts) ? meta.attempts.length : (Number(meta.attempts || 0) || 0)
  };
}

function settlementArguments({ orderId, invoiceId, outcome, amountToman, referenceId, providerCode, extra = {} }) {
  return {
    p_order_id: orderId,
    p_invoice_id: invoiceId || null,
    p_outcome: outcome,
    p_amount_toman: amountToman,
    p_reference_id: referenceId || null,
    p_provider_code: providerCode || null,
    p_callback_payload: { provider: PROVIDER, outcome, providerCode: providerCode || '', ...extra, settledAt: new Date().toISOString() }
  };
}

async function persistSettlement(result, { dbConfig, fetchImpl = globalThis.fetch } = {}) {
  if (!result || result.outcome === 'pending' || result.outcome === 'error' || result.outcome === 'unknown') return null;
  const config = dbConfig || serverConfiguration();
  const { order, payment } = await selectOrderPayment({ config, orderId: result.orderId, fetchImpl });
  const amount = Number(result.amountToman);
  if (!Number.isSafeInteger(amount) || amount !== Number(order.total_toman) || amount !== Number(payment.amount_toman)) {
    throw fail('مبلغ رسید با سفارش ذخیره‌شده مطابقت ندارد.', 409);
  }
  let invoiceId = String(result.invoiceId || '');
  if (payment.authority && invoiceId && payment.authority !== invoiceId) throw fail('شناسهٔ فاکتور با رکورد پرداخت پایگاه داده هم‌خوانی ندارد.', 403);
  if (!invoiceId) invoiceId = String(payment.authority || '');
  if (result.outcome === 'paid' && !invoiceId) throw fail('شناسهٔ فاکتور بلوپال برای این سفارش ثبت نشده است.', 409);
  if (result.outcome === 'paid') {
    const expectedRial = amount * TOMAN_TO_RIAL;
    const declared = Number(result.amountRial || 0);
    if (declared && declared !== expectedRial) throw fail('مبلغ تأییدشدهٔ بلوپال با مبلغ سفارش هم‌خوانی ندارد.', 409);
  }
  if (payment.status === 'verified') {
    if (result.outcome !== 'paid') throw fail('این سفارش پیش‌تر پرداخت شده است و وضعیت آن تغییر نمی‌کند.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: 'paid' };
  }
  if (payment.status === 'failed') {
    if (result.outcome === 'paid') throw fail('این فاکتور منقضی یا لغو شده ثبت شده و قابل‌تغییر نیست؛ با پشتیبانی تماس بگیرید.', 409);
    return { success: true, idempotent: true, orderId: order.id, outcome: result.outcome };
  }
  return callServiceRpc('settle_blupal_payment', settlementArguments({
    orderId: order.id,
    invoiceId,
    outcome: result.outcome === 'paid' ? 'paid' : 'cancelled',
    amountToman: amount,
    referenceId: result.referenceId,
    providerCode: String(result.status || result.providerCode || 'PAID').slice(0, 32),
    extra: {
      invoiceId: invoiceId || '',
      blupalStatus: result.status || '',
      amountRial: Number(result.amountRial || 0) || 0,
      finalAmountRial: Number(result.finalAmountRial || 0) || 0,
      transactionId: result.referenceId || '',
      payerName: result.payer?.name || '',
      payerCardTail: result.payer?.cardTail || '',
      payerBank: result.payer?.bank || '',
      mode: result.mode || '',
      verifiedAt: result.verifiedAt || new Date().toISOString(),
      source: result.source || 'server'
    }
  }), config, fetchImpl);
}

/* -------------------------------------------------------------- handlers */

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
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
  catch { throw fail('مبدأ معتبر برای ساخت آدرس فروشگاه پیدا نشد.', 400); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw fail('مبدأ درخواست پرداخت معتبر نیست.', 400);
  }
  const requestHost = firstHeader(req?.headers?.['x-forwarded-host'] || req?.headers?.host).toLowerCase();
  if (requestHost && origin.host.toLowerCase() !== requestHost) throw fail('مبدأ درخواست با دامنهٔ فروشگاه یکسان نیست.', 403);
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.host);
  if (origin.protocol !== 'https:' && !localHost) throw fail('درخواست پرداخت فقط روی HTTPS مجاز است.', 400);
  return origin.origin;
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
    keyMode: config.keyMode,
    cardNumberConfigured: Boolean(config.cardNumber),
    livePaymentsAllowed: config.livePaymentsAllowed,
    apiBase: config.apiBase,
    payHosts: config.payHosts,
    requestPath: REQUEST_PATH,
    receiptPath: RECEIPT_PATH,
    statusPath: STATUS_PATH,
    callbackPath: CALLBACK_PATH,
    notifyPath: NOTIFY_PATH,
    webhookPath: NOTIFY_PATH,
    requiresWebhook: false,
    webhookSignatureAvailable: false,
    checkoutStorage: 'supabase-postgres',
    amountUnit: 'IRR',
    amountIsRialInteger: true,
    minAmountRial: config.minAmountRial,
    maxAmountRial: config.maxAmountRial,
    minAmountToman: config.minAmountToman,
    maxAmountToman: config.maxAmountToman,
    settleGraceMinutes: config.settleGraceMinutes,
    invoiceMethods: ['POST /v1/invoices/create', 'GET /v1/invoices/{invoice_id}'],
    sandboxMethods: ['POST /v1/sandbox/invoices/{invoice_id}/simulate'],
    invoiceStatuses: Object.keys(INVOICE_STATUSES),
    errorCodes: Object.keys(BLUPAL_ERRORS),
    liveCheckoutSafe: false,
    note: ready
      ? 'فاکتور در بلوپال ساخته می‌شود و مشتری باید دقیقاً مبلغ اصلاحی (final_amount) را به کارت نشان‌داده‌شده واریز کند؛ نهایی‌سازی سفارش فقط با GET /v1/invoices/{invoice_id} انجام می‌شود.'
      : 'پیکربندی سروری Supabase یا کلید API بلوپال کامل نیست؛ پرداخت غیرفعال است.'
  });
}

async function createPaymentIntent({ body, req, origin, env = process.env, dbConfig, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const config = getConfig(env);
  const configFailure = configurationError(config);
  if (configFailure) throw configFailure;
  const gate = productionGateError(config);
  if (gate) throw gate;
  const order = normalizeOrder(body);
  getOrigin(req, origin);
  const created = await createInvoice({ config, amountToman: order.amountToman, fetchImpl });
  return {
    success: true,
    provider: PROVIDER,
    mode: config.mode,
    sandbox: config.sandbox,
    orderId: order.orderId,
    amountToman: order.amountToman,
    invoiceId: created.invoiceId,
    paymentUrl: created.paymentUrl,
    amountRial: created.amountRial,
    finalAmountRial: created.finalAmountRial,
    status: created.status,
    cardNumber: created.cardNumber,
    expiresAt: created.expiresAt,
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
    const amountToman = Number(order.total_toman);
    assertRialBounds(amountToman * TOMAN_TO_RIAL);
    const created = await createPaymentIntent({
      body: { orderId, amountToman, orderNumber: order.number || orderId },
      req,
      origin: req.headers?.origin,
      dbConfig: customer
    });
    const meta = readProviderMeta(payment);
    // تلاش دوباره پس از انقضا مجاز است؛ شناسهٔ فاکتور تازه جای قبلی را می‌گیرد
    // و تا واریز تأییدشده، هیچ وجهی نهایی نشده است.
    try {
      await callServiceRpc('attach_blupal_payment', {
        p_order_id: orderId,
        p_invoice_id: created.invoiceId,
        p_payment_url: created.paymentUrl,
        p_card_number: created.cardNumber || null,
        p_amount_rial: created.amountRial,
        p_final_amount_rial: created.finalAmountRial,
        p_status: created.status
      }, customer);
    } catch (error) {
      const latest = await selectOwnedPendingOrder({ config: customer, orderId, userId: customer.userId });
      if (String(latest.payment.authority) !== String(created.invoiceId)) throw error;
    }
    return sendJson(res, 200, {
      success: true,
      provider: PROVIDER,
      mode: config.mode,
      sandbox: config.sandbox,
      orderId,
      orderNumber: order.number || '',
      invoiceId: created.invoiceId,
      authority: created.invoiceId,
      paymentUrl: created.paymentUrl,
      amountToman,
      amountRial: created.amountRial,
      finalAmountRial: created.finalAmountRial,
      finalAmountToman: Math.round(created.finalAmountRial / TOMAN_TO_RIAL),
      destinationCard: created.cardNumber,
      invoiceStatus: created.status,
      expiresAt: created.expiresAt,
      openMode: 'redirect',
      checkoutMinutes: config.settleGraceMinutes,
      receipt: makeReceipt({ orderId, amountToman, invoiceId: created.invoiceId }, config, {
        outcome: 'pending', providerCode: 'INVOICE_CREATED'
      }),
      attemptsBefore: meta.attempts || 0,
      webhookPath: NOTIFY_PATH,
      pollAfterMs: 15000,
      note: 'مبلغ اصلاحی را دقیقاً و بدون کم‌وزیاد به کارت نشان‌داده‌شده واریز کنید؛ همان عدد، کلید شناسایی واریز شماست.'
    });
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error: error.message || 'ساخت فاکتور در بلوپال انجام نشد.' });
  }
}

async function settleStatus({ orderId, expectedAmountToman = null, config = getConfig(), dbConfig, fetchImpl = globalThis.fetch, now = Date.now, source = 'poll', timeoutMs = 12000 } = {}) {
  const database = dbConfig || serverConfiguration();
  const { order, payment } = await selectOrderPayment({ config: database, orderId, userId: dbConfig?.userId, fetchImpl });
  const amountToman = Number(order.total_toman);
  if (expectedAmountToman !== null && Number(expectedAmountToman) !== amountToman) throw fail('مبلغ درخواست با سفارش هم‌خوانی ندارد.', 403);
  const configFailure = configurationError(config);
  const invoiceId = String(payment.authority || '');
  const meta = readProviderMeta(payment);
  let outcome = payment.status === 'verified' ? 'paid' : payment.status === 'failed' ? 'cancelled' : 'pending';
  let status = outcome === 'paid' ? 'PAID' : meta.status || '';
  let referenceId = String(payment.provider_reference || '');
  let providerCode = String(payment.provider_code || '');
  let verified = null;
  if (!configFailure && invoiceId && outcome === 'pending') {
    try {
      verified = await checkInvoiceStatus({
        config,
        invoiceId,
        expectedAmountRial: amountToman * TOMAN_TO_RIAL,
        fetchImpl,
        timeoutMs
      });
      status = verified.status;
      providerCode = verified.status;
      if (verified.outcome === 'paid') {
        referenceId = verified.transactionId || invoiceId;
        outcome = 'paid';
        await persistSettlement({
          orderId: order.id,
          invoiceId,
          amountToman,
          outcome: 'paid',
          status: verified.status,
          amountRial: verified.amountRial,
          finalAmountRial: verified.finalAmountRial,
          referenceId,
          payer: verified.payer,
          mode: verified.mode,
          source,
          verifiedAt: new Date(now()).toISOString()
        }, { dbConfig: database, fetchImpl });
      } else if (verified.outcome === 'expired' || verified.outcome === 'cancelled') {
        outcome = verified.outcome;
        await persistSettlement({
          orderId: order.id,
          invoiceId,
          amountToman,
          outcome,
          status: verified.status,
          referenceId: verified.transactionId || '',
          providerCode: verified.status,
          source,
          verifiedAt: new Date(now()).toISOString()
        }, { dbConfig: database, fetchImpl });
      }
    } catch (error) {
      // وضعیت نامشخص هرگز به سود مشتری یا علیه او تفسیر نمی‌شود: سفارش pending می‌ماند،
      // فقط علت در provider_code و لاگ سرور ثبت می‌شود تا مدیر بتواند پیگیری کند.
      outcome = 'pending';
      providerCode = Number(error.status) === 409 ? 'AMOUNT_MISMATCH'
        : String(error.blupalError || '').toUpperCase() || 'STATUS_UNAVAILABLE';
      console.error('BluPal status check failed:', error?.message || error);
    }
  } else if (configFailure) {
    providerCode = providerCode || 'CONFIG_UNAVAILABLE';
  }
  const receipt = makeReceipt({ orderId: order.id, amountToman, invoiceId }, config, {
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
    amountRial: amountToman * TOMAN_TO_RIAL,
    invoiceId,
    authority: invoiceId,
    outcome,
    status,
    finalAmountRial: Number(verified?.finalAmountRial ?? meta.finalAmountRial ?? 0) || 0,
    destinationCard: meta.cardNumber || '',
    expiresAt: verified?.expiresAt ?? meta.expiresAt ?? null,
    paymentUrl: meta.paymentUrl || '',
    referenceId: outcome === 'paid' ? referenceId : '',
    payer: outcome === 'paid' && verified ? verified.payer : { name: '', cardTail: '', bank: '' },
    providerCode,
    waitingForPayment: outcome === 'pending' && Boolean(invoiceId),
    receipt: config.validStateSecret ? receipt : '',
    note: configFailure ? 'پیکربندی سروری بلوپال کامل نیست؛ فقط وضعیت پایگاه داده نمایش داده می‌شود.' : ''
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
    return sendJson(res, Number(error.status) || 400, { error: error.message || 'رسید بلوپال معتبر نیست.' });
  }
}

// بازگشت مرورگر مشتری از صفحهٔ پرداخت بلوپال. بلوپال callback_url را از پنل می‌گیرد،
// پس پارامترهای این آدرس فقط سرنخ‌اند (اگر پذیرنده آن‌ها را در «صفحهٔ بازگشت» گذاشته باشد)؛
// پرداخت فقط با استعلام وضعیت فاکتور از درگاه نهایی می‌شود.
async function callback(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const query = queryFromRequest(req);
  const config = getConfig();
  const orderId = String(query.order || query.orderId || '').trim();
  const invoiceId = readInvoiceId(query);
  let redirectTo = `/account`;
  try {
    let targetOrderId = ORDER_UUID_PATTERN.test(orderId) ? orderId : '';
    const database = supabaseServerConfig();
    if (!targetOrderId && invoiceId && config.configured && database.serviceConfigured) {
      try {
        const rows = await selectPaymentByAuthority({ config: database, authority: invoiceId, fetchImpl: globalThis.fetch });
        targetOrderId = String(rows?.order?.id || '');
      } catch (error) {
        if (Number(error.status) !== 404) throw error;
      }
    }
    if (targetOrderId) {
      redirectTo = `/payment/result/${encodeURIComponent(targetOrderId)}`;
      if (config.configured && database.serviceConfigured) {
        try {
          // صفحهٔ نتیجه خودش وضعیت را می‌پرسد؛ این فراخوانی فقط تاخیر نمایش را کم می‌کند.
          await settleStatus({ orderId: targetOrderId, config, dbConfig: serverConfiguration(), source: 'browser-callback', timeoutMs: 4000 });
        } catch (error) {
          console.error('BluPal callback verify failed:', error?.message || error);
        }
      }
    }
  } catch (error) {
    if (Number(error.status) >= 500) console.error('BluPal callback error:', error?.message || error);
  }
  res.statusCode = 302;
  res.setHeader('Location', redirectTo);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

// وب‌هوک بلوپال: فقط سرنخ. هیچ مبلغی از بدنه خوانده و اعمال نمی‌شود؛
// وضعیت از خودِ درگاه استعلام و سپس تسویهٔ یک‌مصرف انجام می‌گیرد.
// مستندات: پاسخ HTTP 200 سریع لازم است، وگرنه سه تلاش دوباره (۱۰/۳۰/۶۰ ثانیه) می‌آید.
async function notify(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { received: false });
  const config = getConfig();
  let payload;
  try { payload = readRequestBody(req); }
  catch { return sendJson(res, 200, { received: true, handled: false, reason: 'invalid_body' }); }
  const event = String(payload?.event ?? '').trim().toLowerCase();
  const statusText = String(payload?.status ?? '').trim().toUpperCase();
  // رویدادهایی که به ما ربطی ندارند بی‌آزار تأیید می‌شوند (حتی اگر دیتابیس قطع باشد) تا
  // بلوپال بی‌دلیل چهار بار تلاش دوباره نکند.
  if (event && event !== 'payment.completed') return sendJson(res, 200, { received: true, handled: false, reason: 'ignored_event' });
  if (statusText && statusText !== 'PAID') return sendJson(res, 200, { received: true, handled: false, reason: 'ignored_status' });
  const invoiceId = readInvoiceId(payload);
  if (!invoiceId) return sendJson(res, 200, { received: true, handled: false, reason: 'no_invoice_id' });
  // اما برای یک پرداخت واقعی که به سفارش ما وصل است، نبودِ دیتابیس یعنی «بعداً دوباره بفرست».
  if (!supabaseServerConfig().serviceConfigured) return sendJson(res, 500, { received: false, retry: true, error: 'پایگاه داده سرور در دسترس نیست.' });
  try {
    const database = serverConfiguration();
    const rows = await selectPaymentByAuthority({ config: database, authority: invoiceId, fetchImpl: globalThis.fetch });
    const result = await settleStatus({
      orderId: rows.order.id,
      config,
      dbConfig: database,
      source: 'provider-webhook',
      timeoutMs: 4000
    });
    return sendJson(res, 200, { received: true, handled: true, orderId: rows.order.id, outcome: result.outcome, status: result.status });
  } catch (error) {
    const status = Number(error.status) || 0;
    // فاکتوری که به ما مربوط نیست یا سفارشِ تسویه‌شده: تلاش دوباره فایده‌ای ندارد.
    if (status === 400 || status === 403 || status === 404 || status === 409) {
      return sendJson(res, 200, { received: true, handled: false, reason: status === 404 ? 'unknown_invoice' : 'not_applicable' });
    }
    return sendJson(res, 500, { received: false, retry: true, error: 'پردازش وب‌هوک بلوپال انجام نشد.' });
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
  INVOICE_ID_PATTERN,
  REFERENCE_PATTERN,
  CARD_NUMBER_PATTERN,
  TOMAN_TO_RIAL,
  MIN_AMOUNT_RIAL,
  MAX_AMOUNT_RIAL,
  SANDBOX_SCENARIOS,
  INVOICE_STATUSES,
  BLUPAL_ERRORS,
  faNumber,
  getConfig,
  configurationError,
  productionGateError,
  apiUrl,
  callBluPalApi,
  toRial,
  assertRialBounds,
  createInvoice,
  checkInvoiceStatus,
  simulatePayment,
  normalizePaymentUrl,
  readInvoiceId,
  readTransactionId,
  readPayer,
  normalizeOrder,
  signPayload,
  readSignedPayload,
  makeReceipt,
  readReceipt,
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

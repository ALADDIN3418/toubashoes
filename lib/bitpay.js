'use strict';

/* BitPay (بیت‌پی · bitpay.ir) — درگاه مستقیم پرداخت بانکی، طبق مستندات BP_PGW_DOC نسخهٔ 2.2
 * (۱۴۰/۰۷/۱). از نسخهٔ 1.3.0 این تنها درگاه پرداخت فروشگاه است (درگاه قبلی کنار گذاشته شده).
 *
 * جریان سه‌مرحله‌ای مستندات:
 *   ۱) POST /payment/gateway-send   form: api, amount(ریال، صحیح، ≥۵۰۰), redirect(urlencode),
 *      factorId(اختیاری، عدد لاتین، برگشت‌دادنی)      ← در موفقیت یک عدد صحیح >۰ (همان id_get)
 *   ۲) هدایت مرورگر خریدار به:  GET /payment/gateway-<id_get>-get
 *   ۳) بیت‌پی خریدار را به redirect با ?trans_id=&id_get= برمی‌گرداند (فقط سرنخ؛ هیچ‌وقت
 *      دلیل پرداخت نیست) و همان‌جا یا در پرس‌وجوی بعدی، سرور استعلام سربه‌سرور می‌زند:
 *      POST /payment/gateway-result-second  form: api, trans_id, id_get, json=1
 *      ← {"status":1} تأیید | {"status":11} قبلاً وریفای شده | بقیه = ناموفق/یافت‌نشد
 *        + amount(ریال)، cardNum، factorId
 *
 * قوانین امنیتی رعایت‌شده (قرارداد کلی پرداخت فروشگاه):
 *   • کلید API فقط در بدنهٔ درخواست‌های سمت سرور؛ هرگز به مرورگر नहीं می‌رسد.
 *   • بازگشت مرورگر تسویه نمی‌کند؛ تنها status=1|11 در gateway-result-second سفارش را paid می‌کند.
 *   • مبلغ از پایگاه‌داده (تومان ×۱۰) تعیین می‌شود؛ amount پاسخ درگاه فقط مقایسه می‌شود.
 *   • trans_id و id_get در پایگاه‌داده یک‌بار ثبت می‌شوند (جلوگیری از سوء‌استفاده/تکرار)؛
 *     تسویه از طریق RPCهای یک‌مصرفِ service_role انجام می‌شود.
 *   • paymentUrl فقط از apiBase تأییدشدهٔ سرور ساخته می‌شود؛ ورودیِ نشانیِ پرداخت از کلاینت
 *     هرگز پذیرفته نمی‌شود.
 */

const { sendJson, requestBody, sameOrigin } = require('./vercel-api.js');
const {
  supabaseServerConfig,
  serverConfiguration,
  missingServerKeys,
  authenticateCustomer,
  selectOrderPayment,
  selectPaymentByAuthority,
  callServiceRpc
} = require('./supabase-server.js');

const PROVIDER = 'bitpay';
const PROVIDER_LABEL = 'BitPay · درگاه مستقیم پرداخت بانکی';
const REQUEST_PATH = '/api/payment/bitpay/request';
const VERIFY_PATH = '/api/payment/bitpay/verify';
const STATUS_PATH = '/api/payment/bitpay/status';
const CALLBACK_PATH = '/api/payment/bitpay/callback';
const DEFAULT_API_BASE = 'https://bitpay.ir';
/* نشانی قطعی فروشگاه برای redirect به درگاه: باید با «آدرس سایت» ثبت‌شده در پنل
 * بیت‌پی یکی باشد (ناهمخوانی = خطای -۴ در gateway-send). با BITPAY_SITE_ORIGIN
 * قابل بازنویسی است؛ پیش‌فرض، دامنهٔ اصلی فروشگاه است تا تست روی پیش‌نمایش/زیردامنه
 * هم نشانی درست بفرستد. */
const DEFAULT_SITE_ORIGIN = 'https://toubashose.ir';
const SEND_ENDPOINT = '/payment/gateway-send';
const RESULT_ENDPOINT = '/payment/gateway-result-second';
/* مستندات: مبلغ الزاماً عدد صحیح ریالی و حداقل ۵۰۰ ریال (۵۰۰ تومان). */
const TOMAN_TO_RIAL = 10;
const MIN_AMOUNT_RIAL = 5000;
/* مستندات: API یک رشتهٔ ۵۲ کاراکتری است. کلید پنل بعضی حساب‌ها شامل خط تیره است
 * (خط تیره‌ها خودشان بخشی از همان ۵۲ نویسه‌اند) و باید عیناً همان‌طور که پنل صادر
 * کرده ارسال شود؛ فقط حروف لاتین، ارقام، خط تیره و زیرخط مجاز است. */
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{52}$/;
const GATEWAY_ID_PATTERN = /^[0-9]{1,20}$/;
const ORDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message, status = 502, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

function numberFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) return null;
  return url.origin;
}

function getConfig(env = process.env) {
  const apiKey = String(env.BITPAY_API_KEY || '').trim();
  const validApiKey = API_KEY_PATTERN.test(apiKey);
  const apiBase = normalizeOrigin(env.BITPAY_API_BASE, DEFAULT_API_BASE);
  const siteOrigin = normalizeOrigin(env.BITPAY_SITE_ORIGIN, DEFAULT_SITE_ORIGIN);
  return {
    apiKey,
    validApiKey,
    apiBase: apiBase || DEFAULT_API_BASE,
    apiBaseValid: apiBase !== null,
    siteOrigin: siteOrigin || DEFAULT_SITE_ORIGIN,
    siteOriginValid: siteOrigin !== null,
    configured: validApiKey && apiBase !== null && siteOrigin !== null,
    minAmountRial: MIN_AMOUNT_RIAL,
    minAmountToman: MIN_AMOUNT_RIAL / TOMAN_TO_RIAL,
    requestPath: REQUEST_PATH,
    verifyPath: VERIFY_PATH,
    statusPath: STATUS_PATH,
    callbackPath: CALLBACK_PATH
  };
}

function configurationError(config) {
  if (!config.apiBaseValid) return fail('BITPAY_API_BASE باید نشانی HTTPS معتبر بدون مسیر اضافه باشد (پیش‌فرض https://bitpay.ir).', 503);
  if (!config.siteOriginValid) return fail('BITPAY_SITE_ORIGIN باید نشانی HTTPS معتبر فروشگاه بدون مسیر باشد (پیش‌فرض https://toubashose.ir).', 503);
  if (!config.apiKey) return fail('متغیر محیطی BITPAY_API_KEY تنظیم نشده است؛ کلید ۵۲ کاراکتری (مرچنت‌کد) را از پنل بیت‌پی ← بخش توسعه بگیرید و در Environment Variables ورسل قرار دهید.', 503);
  if (!config.validApiKey) return fail(`کلید بیت‌پی معتبر نیست؛ طول فعلی ${config.apiKey.length} نویسه است — باید دقیقاً ۵۲ کاراکتر باشد (خط تیره‌ها بخشی از همان ۵۲ هستند). کلید پنل را عیناً بدون هیچ تغییری کپی کنید.`, 503);
  return null;
}

/* ------------------------------------------------------------ gateway http */

async function callBitPay({ config, path, form, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  let response;
  try {
    response = await fetchImpl(`${config.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw fail('ارتباط با درگاه بیت‌پی برقرار نشد؛ چند لحظه دیگر دوباره تلاش کنید.', 502, { bitpayTransportError: true });
  }
  const text = await response.text().catch(() => '');
  return { http: response.status, text: String(text || '').trim() };
}

/* پاسخ موفق gateway-send طبق مستندات یک عدد صحیح >۰ است (id_get). خطاها به شکل صفر،
   عدد منفی یا متن فارسیِ خطا برگردانده می‌شوند؛ هیچ‌کدام شناسهٔ پرداخت نیست. */
function parseSendResponse(text, siteOrigin = DEFAULT_SITE_ORIGIN) {
  if (/^-?[0-9]+$/.test(text)) {
    const value = Number(text);
    if (/^[0-9]+$/.test(text) && value > 0) {
      if (!GATEWAY_ID_PATTERN.test(text)) throw fail('شناسهٔ تراکنش بیت‌پی معتبر نیست.', 502);
      return text;
    }
    if (value === -4) throw fail(`درگاه بیت‌پی: -4 — نشانی بازگشت با «آدرس سایت» ثبت‌شده در پنل بیت‌پی مطابقت ندارد؛ در پنل باید آدرس وبسایت دقیقاً ${siteOrigin} باشد.`, 502);
    if (value === 0) throw fail('بیت‌پی تراکنش را نپذیرفت (API نادرست، مبلغ نامعتبر یا ناهمخوانی آدرس سایت ثبت‌شده در پنل بیت‌پی).', 502);
    throw fail(`درگاه بیت‌پی: ${text}`, 502);
  }
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json — treat as gateway message */ }
  const id = json && String(json.id ?? json.id_get ?? json.result ?? '').trim();
  if (id && /^[0-9]+$/.test(id) && Number(id) > 0) return id;
  const reason = (text || 'پاسخ ناشناخته').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
  throw fail(`درگاه بیت‌پی: ${reason}`, 502);
}

/* مرحلهٔ دوم مستندات: استعلام سروربه‌سرور. با json=1 خروجی JSON است؛ درگاه‌های قدیمی‌تر
   گاه فقط «1» متنی برمی‌گردانند. status: 1=تأیید، 11=قبلاً وریفای‌شده، غیر = ناموفق. */
function parseVerifyResponse(text) {
  if (/^-?[0-9]+$/.test(text)) {
    const status = Number(text);
    return { status, ok: status === 1, alreadyVerified: status === 11, amountRial: 0, cardNum: '', factorId: '' };
  }
  let json = null;
  try { json = JSON.parse(text); } catch { throw fail('پاسخ استعلام بیت‌پی قابل خواندن نیست.', 502, { bitpayVerifyUnreadable: true }); }
  const status = Number(json.status ?? json.result ?? NaN);
  return {
    status: Number.isFinite(status) ? status : NaN,
    ok: Number(json.status) === 1 || Number(json.result) === 1,
    alreadyVerified: Number(json.status) === 11,
    amountRial: Number(json.amount ?? 0) || 0,
    cardNum: /^[0-9]{6}(?:[*]*[0-9]{4})?$/.test(String(json.cardNum ?? '')) ? String(json.cardNum) : '',
    factorId: GATEWAY_ID_PATTERN.test(String(json.factorId ?? '').trim()) ? String(json.factorId).trim() : ''
  };
}

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function queryFromRequest(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req?.url || '/', 'https://store.invalid').searchParams.entries()); }
  catch { return {}; }
}

/* مبدأ درخواست — قاعدهٔ سخت‌گیرانه: https، تطبیق host و بدون path/query در origin. */
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

/* شناسهٔ فاکتور لاتینِ پایدار برای تطبیق در پنل بیت‌پی: از uuid سفارش ساخته می‌شود
   (مستندات: عدد صحیح ولاتین؛ وگرنه موقع بازگشت صفر می‌شود — اینجا فقط ثبت و برگشت داده می‌شود). */
function factorIdFor(orderId) {
  const hex = String(orderId).replace(/[^0-9a-f]/gi, '').slice(0, 14);
  if (!hex) return null;
  try { return BigInt(`0x${hex}`).toString(); } catch { return null; }
}

/* ------------------------------------------------------------- flows */

async function createBitPayPayment({ config, amountToman, orderId, fetchImpl = globalThis.fetch }) {
  const amountRial = Math.round(Number(amountToman) * TOMAN_TO_RIAL);
  if (!Number.isSafeInteger(amountRial) || amountRial < MIN_AMOUNT_RIAL) {
    throw fail(`حداقل مبلغ پرداخت در بیت‌پی ${MIN_AMOUNT_RIAL.toLocaleString('en-US')} ریال است.`, 400);
  }
  /* نشانی بازگشت همیشه از دامنهٔ قطعی پیکربندی‌شده می‌آید (نه host درخواست) تا آن با
     «آدرس سایت» پنل بیت‌پی یکی بماند — حتی وقتی مشتری روی پیش‌نمایش/زیردامنه است. */
  const redirectUrl = `${config.siteOrigin}${CALLBACK_PATH}`;
  const sent = await callBitPay({
    config,
    path: SEND_ENDPOINT,
    form: {
      api: config.apiKey,
      amount: String(amountRial),
      redirect: redirectUrl,
      ...(factorIdFor(orderId) ? { factorId: factorIdFor(orderId) } : {})
    },
    fetchImpl
  });
  const idGet = parseSendResponse(sent.text, config.siteOrigin);
  return {
    idGet,
    amountRial,
    factorId: factorIdFor(orderId),
    /* مستندات v2.2: هدایت به gateway-<id_get>-get؛ نشانی فقط از apiBase تأییدشدهٔ سرور. */
    paymentUrl: `${config.apiBase}/payment/gateway-${idGet}-get`
  };
}

async function verifyBitPayResult({ config, transId, idGet, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (!GATEWAY_ID_PATTERN.test(String(transId || '')) || !GATEWAY_ID_PATTERN.test(String(idGet || ''))) {
    throw fail('شناسهٔ تراکنش بیت‌پی معتبر نیست.', 400);
  }
  const result = await callBitPay({
    config,
    path: RESULT_ENDPOINT,
    form: { api: config.apiKey, trans_id: String(transId), id_get: String(idGet), json: '1' },
    fetchImpl,
    timeoutMs
  });
  return parseVerifyResponse(result.text);
}

async function settleViaRpc({ database, orderId, idGet, outcome, amountToman, referenceId, providerCode, extra = {} }) {
  return callServiceRpc('settle_bitpay_payment', {
    p_order_id: orderId,
    p_id_get: idGet || null,
    p_outcome: outcome,
    p_amount_toman: amountToman,
    p_reference_id: referenceId || null,
    p_provider_code: providerCode || null,
    p_callback_payload: { provider: PROVIDER, outcome, providerCode: providerCode || '', ...extra, settledAt: new Date().toISOString() }
  }, database);
}

/* POST {orderId} — ساخت id_get و اتصال به سفارش. ردیف پرداخت تازه (bitpay) از همان ساخت
   سفارش در اختیار همین درگاه است؛ به‌محض ثبت id_get، شناسهٔ تراکنش روی همان ردیف قفل می‌شود. */
async function request(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error: error.message }); }
  try {
    const orderId = assertOrderId(body?.orderId);
    const customer = await authenticateCustomer(req);
    const { order } = await selectOrderPayment({ config: customer, orderId, userId: customer.userId, provider: null, pendingOnly: true });
    const config = getConfig();
    const configFailure = configurationError(config);
    if (configFailure) throw configFailure;
    getOrigin(req); /* فقط سازگاری مبدأ درخواست؛ نشانی بازگشت از siteOrigin پیکربندی سرور می‌آید */
    const amountToman = Number(order.total_toman);
    const created = await createBitPayPayment({ config, amountToman, orderId });
    try {
      await callServiceRpc('attach_bitpay_payment', {
        p_order_id: orderId,
        p_id_get: created.idGet,
        p_amount_rial: created.amountRial,
        p_factor_id: created.factorId
      }, customer);
    } catch (error) {
      const latest = await selectOrderPayment({ config: customer, orderId, userId: customer.userId, provider: null, pendingOnly: true });
      if (String(latest.payment.authority) !== String(created.idGet)) throw error;
    }
    return sendJson(res, 200, {
      success: true,
      provider: PROVIDER,
      providerLabel: PROVIDER_LABEL,
      orderId,
      orderNumber: order.number || '',
      idGet: created.idGet,
      authority: created.idGet,
      paymentUrl: created.paymentUrl,
      amountToman,
      amountRial: created.amountRial,
      factorId: created.factorId || '',
      openMode: 'redirect',
      pollAfterMs: 10000,
      note: 'پس از پرداخت در صفحهٔ بانک، به فروشگاه بازمی‌گردید و تأیید نهایی با استعلام سروربه‌سرور از بیت‌پی ثبت می‌شود.'
    });
  } catch (error) {
    return sendJson(res, Number(error.status) || 502, { error: error.message || 'ساخت تراکنش در بیت‌پی انجام نشد.' });
  }
}

/* بازگشت مرورگر از بانک: ?trans_id=&id_get= فقط سرنخ‌اند. تطبیق با رکورد پرداختِ خودِ
   پایگاه‌داده + استعلام result-second انجام می‌شود و سپس مشتری به صفحهٔ نتیجه هدایت می‌شود. */
async function callback(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const query = queryFromRequest(req);
  const config = getConfig();
  const transId = String(query.trans_id ?? '').trim();
  const idGet = String(query.id_get ?? '').trim();
  let redirectTo = '/account';
  try {
    const database = supabaseServerConfig();
    if (GATEWAY_ID_PATTERN.test(idGet) && database.serviceConfigured && config.configured) {
      try {
        const rows = await selectPaymentByAuthority({ config: database, authority: idGet, provider: PROVIDER, fetchImpl: globalThis.fetch });
        redirectTo = `/payment/result/${encodeURIComponent(String(rows.order.id))}?gw=bitpay`;
        const hasTrans = GATEWAY_ID_PATTERN.test(transId);
        /* trans_id یک‌بار در همان بازگشت اول ذخیره می‌شود تا اگر شبکه قطع شد،
           صفحهٔ نتیجه بتواند استعلام را تکرار کند (مستندات: برای جلوگیری از سوء‌استفاده ذخیره کنید). */
        if (hasTrans && rows.payment.status === 'pending') {
          try {
            await callServiceRpc('record_bitpay_trans_id', {
              p_order_id: String(rows.order.id),
              p_id_get: idGet,
              p_trans_id: transId
            }, database);
          } catch (error) { console.error('BitPay trans_id store failed:', error?.message || error); }
          try {
            const verified = await verifyBitPayResult({ config, transId, idGet, timeoutMs: 5000 });
            if (verified.ok || verified.alreadyVerified) {
              if (verified.amountRial > 0 && verified.amountRial !== Number(rows.payment.amount_toman) * TOMAN_TO_RIAL) {
                console.error('BitPay amount mismatch on callback settle; order left pending for manual review');
              } else {
                await settleViaRpc({
                  database,
                  orderId: String(rows.order.id),
                  idGet,
                  outcome: 'paid',
                  amountToman: Number(rows.payment.amount_toman),
                  referenceId: transId,
                  providerCode: verified.ok ? 'PAID' : 'ALREADY_VERIFIED',
                  extra: { gatewayAmountRial: verified.amountRial || null, cardNum: verified.cardNum || null, factorId: verified.factorId || null, source: 'browser-callback' }
                });
              }
            } else if (Number.isFinite(verified.status)) {
              console.error(`BitPay callback verification rejected with status=${verified.status}`);
            }
          } catch (error) {
            console.error('BitPay callback verify failed (result page will retry):', error?.message || error);
          }
        }
      } catch (error) {
        if (Number(error.status) !== 404) console.error('BitPay callback error:', error?.message || error);
      }
    }
  } catch (error) {
    if (Number(error.status) >= 500) console.error('BitPay callback server error:', error?.message || error);
  }
  res.statusCode = 302;
  res.setHeader('Location', redirectTo);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

/* POST {orderId} — صفحهٔ نتیجه/دکمهٔ «بررسی دوباره»: سرور با trans_id ذخیره‌شده خودش
   result-second را صدا می‌زند؛ هیچ ادعای کلاینتی مبنای پرداخت نیست. */
async function verify(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try { body = readRequestBody(req); }
  catch (error) { return sendJson(res, Number(error.status) || 400, { error: error.message }); }
  try {
    const orderId = assertOrderId(body?.orderId);
    const customer = await authenticateCustomer(req);
    const database = serverConfiguration();
    const { order, payment } = await selectOrderPayment({ config: database, orderId, userId: customer.userId, provider: PROVIDER });
    const amountToman = Number(order.total_toman);
    const config = getConfig();
    const configFailure = configurationError(config);
    if (payment.status === 'verified' || order.status === 'paid') {
      return sendJson(res, 200, { success: true, provider: PROVIDER, orderId, amountToman, outcome: 'paid', status: 'PAID', referenceId: String(payment.provider_reference || '') });
    }
    if (payment.status === 'failed') {
      return sendJson(res, 200, { success: true, provider: PROVIDER, orderId, amountToman, outcome: 'cancelled', status: String(payment.provider_code || 'CLOSED'), providerCode: String(payment.provider_code || '') });
    }
    const storedTransId = String(payment.callback_payload?.transId || '').trim();
    const idGet = String(payment.authority || '');
    let outcome = 'pending';
    let status = 'PENDING';
    let referenceId = '';
    let providerCode = String(payment.provider_code || '');
    if (configFailure) {
      providerCode = 'CONFIG_UNAVAILABLE';
    } else if (!GATEWAY_ID_PATTERN.test(storedTransId) || !GATEWAY_ID_PATTERN.test(idGet)) {
      providerCode = providerCode || 'WAITING_FOR_BANK_RETURN';
    } else {
      try {
        const verified = await verifyBitPayResult({ config, transId: storedTransId, idGet });
        status = verified.ok ? 'PAID' : verified.alreadyVerified ? 'ALREADY_VERIFIED' : `REJECTED_${verified.status}`;
        providerCode = status;
        if (verified.ok || verified.alreadyVerified) {
          if (verified.amountRial > 0 && verified.amountRial !== amountToman * TOMAN_TO_RIAL) {
            providerCode = 'AMOUNT_MISMATCH';
            console.error('BitPay verification amount mismatch ignored; left pending');
          } else {
            referenceId = storedTransId;
            outcome = 'paid';
            await settleViaRpc({
              database, orderId, idGet, outcome: 'paid', amountToman,
              referenceId, providerCode: status,
              extra: { gatewayAmountRial: verified.amountRial || null, cardNum: verified.cardNum || null, source: 'client-verify' }
            });
          }
        }
      } catch (error) {
        providerCode = 'VERIFY_UNAVAILABLE';
        console.error('BitPay verify poll failed:', error?.message || error);
      }
    }
    return sendJson(res, 200, {
      success: true,
      provider: PROVIDER,
      orderId,
      orderNumber: order.number || '',
      amountToman,
      amountRial: amountToman * TOMAN_TO_RIAL,
      idGet,
      authority: idGet,
      outcome,
      status,
      referenceId: outcome === 'paid' ? referenceId : '',
      providerCode,
      waitingForPayment: outcome === 'pending',
      note: configFailure
        ? 'پیکربندی سروری بیت‌پی کامل نیست؛ فقط وضعیت پایگاه داده نمایش داده می‌شود.'
        : outcome === 'pending'
          ? 'اگر پرداخت در بانک انجام شده ولی این صفحه تأیید نمی‌کند، چند لحظه دیگر «بررسی دوباره» را بزنید؛ در صورت کسر مبلغ و تأییدنشدن، فیش را برای پشتیبانی بفرستید.'
          : ''
    });
  } catch (error) {
    if (Number(error.status) === 404) return sendJson(res, 404, { error: 'سفارش قابل‌دسترسی پیدا نشد.' });
    return sendJson(res, Number(error.status) || 400, { error: error.message || 'استعلام وضعیت بیت‌پی انجام نشد.' });
  }
}

/* وضعیت سالم/پیکربندی برای پنل ادمین — بدون هیچ مقدار رازی. */
async function status(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const config = getConfig();
  const database = supabaseServerConfig();
  const ready = config.configured && database.serviceConfigured;
  return sendJson(res, 200, {
    success: true,
    provider: PROVIDER,
    providerLabel: PROVIDER_LABEL,
    configured: ready,
    paymentEnabled: ready,
    missingServerKeys: missingServerKeys(),
    apiKeyKind: config.apiKey ? (config.validApiKey ? 'set' : 'malformed') : 'missing',
    apiKeyLength: config.apiKey.length,
    siteOrigin: config.siteOrigin,
    callbackUrl: `${config.siteOrigin}${CALLBACK_PATH}`,
    apiBase: config.apiBase,
    requestPath: REQUEST_PATH,
    verifyPath: VERIFY_PATH,
    statusPath: STATUS_PATH,
    callbackPath: CALLBACK_PATH,
    docVersion: 'BP_PGW_DOC 2.2',
    amountUnit: 'IRR',
    amountIsRialInteger: true,
    minAmountRial: config.minAmountRial,
    minAmountToman: config.minAmountToman,
    gatewayMethods: ['POST /payment/gateway-send', 'GET /payment/gateway-<id_get>-get', 'POST /payment/gateway-result-second'],
    note: ready
      ? 'پرداخت در صفحهٔ بانک انجام می‌شود و تأیید نهایی فقط با استعلام سمت سرور (gateway-result-second) ثبت می‌شود.'
      : 'برای فعال‌شدن بیت‌پی، BITPAY_API_KEY (کلید ۵۲ کاراکتری پنل) را در متغیرهای محیطی سرور تنظیم کنید.'
  });
}

module.exports = {
  PROVIDER,
  PROVIDER_LABEL,
  REQUEST_PATH,
  VERIFY_PATH,
  STATUS_PATH,
  CALLBACK_PATH,
  DEFAULT_API_BASE,
  SEND_ENDPOINT,
  RESULT_ENDPOINT,
  TOMAN_TO_RIAL,
  MIN_AMOUNT_RIAL,
  API_KEY_PATTERN,
  GATEWAY_ID_PATTERN,
  getConfig,
  configurationError,
  parseSendResponse,
  parseVerifyResponse,
  factorIdFor,
  callBitPay,
  createBitPayPayment,
  verifyBitPayResult,
  request,
  callback,
  verify,
  status
};

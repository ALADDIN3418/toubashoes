'use strict';

const { generateProductPhoto, MODEL } = require('../services/cloudflare-image.js');

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); }
    catch { throw Object.assign(new Error('بدنه درخواست JSON معتبر نیست.'), { status:400 }); }
  }
  return {};
}

function sameOrigin(req) {
  if (!req.headers?.origin) return false;
  try {
    const originHost = new URL(req.headers.origin).host;
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return originHost === requestHost;
  } catch { return false; }
}

function parseJpegDataUrl(value, maxBytes = 3 * 1024 * 1024) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('ورودی باید JPEG باشد.'), { status:400 });
  const data = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (data.length < 4 || data.length > maxBytes || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    throw Object.assign(new Error(`عکس JPEG معتبر و کمتر از ${Math.round(maxBytes / 1024 / 1024)} مگابایت انتخاب کنید.`), { status:413 });
  }
  return data;
}

function takeWindowQuota(key, max, intervalMs) {
  const store = globalThis.__toubaVercelQuota || (globalThis.__toubaVercelQuota = Object.create(null));
  const queue = store[key] || (store[key] = []);
  const now = Date.now();
  while (queue.length && now - queue[0] >= intervalMs) queue.shift();
  if (queue.length >= max) return false;
  queue.push(now);
  return true;
}

function reserveWindowQuota(key, max, intervalMs) {
  const store = globalThis.__toubaReservationQuota || (globalThis.__toubaReservationQuota = Object.create(null));
  const queue = store[key] || (store[key] = []);
  const now = Date.now();
  while (queue.length && now - queue[0].createdAt >= intervalMs) queue.shift();
  if (queue.length >= max) return null;
  const id = require('node:crypto').randomUUID();
  queue.push({ id, createdAt:now, pending:true });
  return id;
}

function finishWindowQuota(key, reservationId, succeeded) {
  const queue = globalThis.__toubaReservationQuota?.[key] || [];
  const index = queue.findIndex(item => item.id === reservationId);
  if (index < 0) return false;
  if (succeeded) queue[index].pending = false;
  else queue.splice(index, 1);
  return true;
}

function persistentAiQuotaConfig() {
  const projectUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  try {
    const parsed = new URL(projectUrl);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && serviceKey) {
      return { baseUrl:parsed.origin, serviceKey };
    }
  } catch { /* quota remains unavailable until server-only Supabase credentials are configured */ }
  return null;
}

async function callPersistentAiQuotaRpc(functionName, body) {
  const config = persistentAiQuotaConfig();
  if (!config) throw Object.assign(new Error('سهمیهٔ پایدار هوش مصنوعی تنظیم نشده است.'), { status:503 });
  const response = await fetch(`${config.baseUrl}/rest/v1/rpc/${functionName}`, {
    method:'POST',
    headers:{ apikey:config.serviceKey, Authorization:`Bearer ${config.serviceKey}`, 'Content-Type':'application/json' },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(5000)
  });
  if (!response.ok) throw Object.assign(new Error(`سرویس ثبت سهمیه پاسخ نداد (${response.status}).`), { status:503 });
  return response.json();
}

async function reservePersistentAiQuota(limit = 50) {
  const reservationId = await callPersistentAiQuotaRpc('reserve_ai_image_quota', { p_limit:limit });
  return typeof reservationId === 'string' && /^[0-9a-f-]{36}$/i.test(reservationId) ? reservationId : null;
}

async function finalizePersistentAiQuota(reservationId, succeeded) {
  const result = await callPersistentAiQuotaRpc('finish_ai_image_quota', { p_reservation_id:reservationId, p_succeeded:Boolean(succeeded) });
  return result === true;
}

function parseProductReferenceImages(body) {
  if (!Array.isArray(body?.images) || body.images.length !== 3) {
    throw Object.assign(new Error('سه عکس مرجع لازم است: نمای روبه‌رو، جانبی و پشت/پاشنه.'), { status:400 });
  }
  return body.images.map(image => parseJpegDataUrl(image, 768 * 1024));
}

async function productPhoto(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    return sendJson(res, 503, { error:'سرویس تصویر هنوز تنظیم نشده است. متغیرهای Cloudflare را در تنظیمات Environment پروژهٔ Vercel وارد کنید؛ کلید را در کد یا گفتگو قرار ندهید.' });
  }
  let body, imageBytes;
  try {
    body = requestBody(req);
    imageBytes = parseProductReferenceImages(body);
  } catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  const durableQuota = persistentAiQuotaConfig();
  let reservationId = null, persistentReservation = false;
  try {
    if (process.env.VERCEL && !durableQuota) return sendJson(res, 503, { error:'سهمیهٔ روزانهٔ پایدار تنظیم نشده است؛ مهاجرت Supabase و کلید سرویس را پیش از تولید تصویر پیکربندی کنید.' });
    if (durableQuota) {
      reservationId = await reservePersistentAiQuota(50);
      persistentReservation = true;
    } else reservationId = reserveWindowQuota('ai', 50, 24 * 60 * 60 * 1000);
    if (!reservationId) return sendJson(res, 429, { error:'سقف ۵۰ خروجی موفق تصویر در روز UTC پر شده است؛ سهمیه و هزینهٔ Cloudflare نیز جداگانه اعمال می‌شود.' });
  } catch (error) { return sendJson(res, 503, { error:error.message || 'سرویس سهمیهٔ تصویر در دسترس نیست.' }); }
  try {
    const result = await generateProductPhoto({ imageBytes, style:body.style, productHint:body.productHint });
    const finalized = persistentReservation
      ? await finalizePersistentAiQuota(reservationId, true)
      : finishWindowQuota('ai', reservationId, true);
    if (!finalized) return sendJson(res, 503, { error:'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی برای جلوگیری از عبور از سقف تحویل داده نشد.' });
    return sendJson(res, 200, result);
  } catch (error) {
    if (reservationId) {
      try {
        if (persistentReservation) await finalizePersistentAiQuota(reservationId, false);
        else finishWindowQuota('ai', reservationId, false);
      } catch { /* abandoned reservations expire automatically in the database */ }
    }
    const status = Number(error.status) || 502;
    return sendJson(res, status, { error:error.message || 'ساخت تصویر با Cloudflare انجام نشد.' });
  }
}

function productImageUpload(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body, data;
  try {
    body = requestBody(req);
    data = parseJpegDataUrl(body.image, 2 * 1024 * 1024);
  } catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message || 'عکس معتبر نیست.' }); }
  if (!takeWindowQuota('product-upload', 40, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error:'سقف موقت ذخیرهٔ تصویر پر شده است.' });
  }
  // Vercel Function filesystems are ephemeral; return a data URL so the demo
  // stores the approved image in the current browser's localStorage instead.
  const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
  return sendJson(res, 201, { url:dataUrl, bytes:data.length, storage:'browser-local' });
}

async function productDescription(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body;
  try {
    body = requestBody(req);
  } catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  try {
    const { describeShoeWithGemini } = require('../services/ai-product-desc.js');
    const result = await describeShoeWithGemini(body || {});
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { error:error.message || 'خطا در تولید هوشمند توضیحات محصول' });
  }
}

module.exports = { sendJson, requestBody, sameOrigin, parseJpegDataUrl, parseProductReferenceImages, takeWindowQuota, persistentAiQuotaConfig, reserveWindowQuota, finishWindowQuota, reservePersistentAiQuota, finalizePersistentAiQuota, productPhoto, productImageUpload, productDescription, MODEL };

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

async function productPhoto(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    return sendJson(res, 503, { error:'سرویس تصویر هنوز تنظیم نشده است. متغیرهای Cloudflare را در تنظیمات Environment پروژهٔ Vercel وارد کنید؛ کلید را در کد یا گفتگو قرار ندهید.' });
  }
  let body, imageBytes;
  try {
    body = requestBody(req);
    imageBytes = parseJpegDataUrl(body.image);
  } catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  if (!takeWindowQuota('ai', 20, 24 * 60 * 60 * 1000)) {
    return sendJson(res, 429, { error:'سقف موقت این نمونه برای ساخت تصویر پر شده است؛ سهمیهٔ روزانهٔ Cloudflare نیز جداگانه اعمال می‌شود.' });
  }
  try {
    const result = await generateProductPhoto({ imageBytes, style:body.style, angle:body.angle, productHint:body.productHint });
    return sendJson(res, 200, result);
  } catch (error) {
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

module.exports = { sendJson, requestBody, sameOrigin, parseJpegDataUrl, takeWindowQuota, productPhoto, productImageUpload, productDescription, MODEL };

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateProductPhoto, MODEL } = require('./services/cloudflare-image.js');
const { persistentAiQuotaConfig, requireAdminRequest, parseProductReferenceRoles, reserveWindowQuota, finishWindowQuota, reservePersistentAiQuota, finalizePersistentAiQuota } = require('./lib/vercel-api.js');
const serverDb = require('./services/server-db.js');
serverDb.initStore();

function loadLocalEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
loadLocalEnv();

const root = __dirname;
const aiGenerationTimes = [];
const productImageSaveTimes = [];
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8' };

function json(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()', ...extraHeaders });
  res.end(JSON.stringify(value));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, tooLarge = false;
    req.on('data', chunk => { size += chunk.length; if (size > limit) tooLarge = true; else chunks.push(chunk); });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('حجم درخواست بیش از حد مجاز است.'), { status:413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('بدنه درخواست JSON معتبر نیست.'), { status:400 })); }
    });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  if (!req.headers.origin) return false;
  try {
    const originHost = new URL(req.headers.origin).host;
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return originHost === requestHost;
  } catch { return false; }
}
function requireSameOrigin(req, res) {
  if (!sameOrigin(req)) { json(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' }); return false; }
  return true;
}
function useQuota(queue, max, intervalMs) {
  const now = Date.now();
  while (queue.length && now - queue[0] >= intervalMs) queue.shift();
  if (queue.length >= max) return false;
  queue.push(now);
  return true;
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


const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return json(res, 400, { error:'آدرس درخواست معتبر نیست.' }); }

  if (pathname === '/api/supabase-config') {
    if (req.method !== 'GET') return json(res, 405, { error:'روش درخواست مجاز نیست.' }, { Allow:'GET' });
    const rawUrl = String(process.env.SUPABASE_URL || '').trim();
    let url = '';
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) url = parsed.origin; } catch { /* keep config disabled */ }
    const anonKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    const safeKey = anonKey && anonKey.length < 4096 ? anonKey : '';
    const publicConfig = { configured:Boolean(url || safeKey), enabled:Boolean(url && safeKey), url, anonKey:safeKey };
    res.writeHead(200, { 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
    return res.end(`window.TOUBA_PUBLIC_CONFIG=Object.freeze(${JSON.stringify(publicConfig)});`);
  }

  if (pathname === '/vendor/supabase.js' && req.method === 'GET') {
    const sdk = path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
    if (!fs.existsSync(sdk)) return json(res, 503, { error:'Supabase browser SDK is not installed; run npm install.' });
    res.writeHead(200, { 'Content-Type':types['.js'], 'Cache-Control':'public, max-age=3600', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
    return fs.createReadStream(sdk).pipe(res);
  }

  if (pathname === '/api/db') {
    if (req.method === 'GET') {
      return json(res, 200, { success:true, data: serverDb.getStore() });
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req, 10 * 1024 * 1024);
        if (body && body.data) {
          serverDb.saveStore(body.data);
          return json(res, 200, { success:true });
        }
        return json(res, 400, { error:'اطلاعات نامعتبر است' });
      } catch (err) {
        return json(res, 500, { error: err.message });
      }
    }
    return json(res, 405, { error:'روش درخواست مجاز نیست' });
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 1024);
      const user = serverDb.authenticateAdmin(body.email, body.password);
      if (user) {
        return json(res, 200, { success:true, user });
      }
      return json(res, 401, { error:'ایمیل یا رمز عبور مدیر نادرست است' });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await readBody(req, 2 * 1024 * 1024);
      const order = serverDb.createOrder(body);
      return json(res, 201, { success:true, order });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/payment/bluepal/status' && req.method === 'GET') {
    const configured = Boolean(process.env.BLUEPAL_API_KEY && process.env.BLUEPAL_MERCHANT_ID);
    return json(res, 200, {
      success: true,
      provider: 'BluePal',
      blupaySupport: true,
      sandbox: process.env.BLUEPAL_SANDBOX !== 'false',
      configured,
      terminal: process.env.BLUEPAL_MERCHANT_ID || 'BLUE-94021',
      version: '2.4.0',
      callbackUrl: process.env.BLUEPAL_CALLBACK_URL || '/payment/bluepal/callback'
    });
  }

  if (pathname === '/api/payment/bluepal/request' && req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 1024);
      const authority = 'BLP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      return json(res, 200, {
        success: true,
        authority,
        amount: body.amount,
        paymentUrl: `/payment/bluepal/${body.intentId || authority}`
      });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/payment/bluepal/verify' && req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 1024);
      const refId = 'BLP-REF-' + Date.now().toString(36).toUpperCase();
      return json(res, 200, {
        success: true,
        status: 'PAID',
        refId,
        authority: body.authority,
        verifiedAt: new Date().toISOString()
      });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    const cloudflareConfigured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
    const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
    return json(res, 200, { configured:cloudflareConfigured, cloudflareConfigured, persistentQuotaConfigured, quotaMode:persistentQuotaConfigured ? 'persistent-utc' : 'process-memory', provider:'Cloudflare Workers AI', model:process.env.CLOUDFLARE_IMAGE_MODEL || MODEL, freeDailyNeurons:10000, localDailyLimit:50, referenceMaxSide:511, note:persistentQuotaConfigured ? 'Supabase public configuration is present; RPC migration readiness is checked during the reservation request.' : 'Local development uses process-memory quota; production requires the durable Supabase migration.' });
  }
  if (pathname === '/api/ai/describe') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    try { await requireAdminRequest(req); } catch (error) { return json(res, Number(error.status) || 503, { error:error.message }); }
    let body;
    try {
      body = await readBody(req, 1024 * 1024);
    } catch (error) { return json(res, 400, { error:error.message }); }
    try {
      const { describeShoeWithGemini } = require('./services/ai-product-desc.js');
      const result = await describeShoeWithGemini(body || {});
      return json(res, 200, result);
    } catch (error) {
      return json(res, 500, { error:error.message || 'خطا در تولید هوشمند توضیحات محصول' });
    }
  }
  if (pathname === '/api/ai/product-photo') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    let authContext;
    try { authContext = await requireAdminRequest(req); } catch (error) { return json(res, Number(error.status) || 503, { error:error.message }); }
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return json(res, 503, { error:'سرویس هنوز تنظیم نشده است. Account ID و API Token را فقط در فایل محلی .env وارد کنید؛ این اطلاعات را در گفتگو نفرستید.' });
    }
    let body, sourceBytes, imageRoles;
    try {
      body = await readBody(req, 4 * 1024 * 1024);
      if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 3) {
        throw Object.assign(new Error('دست‌کم یک و حداکثر سه عکس مرجع لازم است.'), { status:400 });
      }
      sourceBytes = body.images.map(image => parseJpegDataUrl(image, 768 * 1024));
      imageRoles = parseProductReferenceRoles(body, sourceBytes.length);
    } catch (error) { return json(res, Number(error.status) || 400, { error:error.message }); }
    const persistentQuota = persistentAiQuotaConfig();
    let reservationId = null, persistentReservation = false;
    try {
      if (persistentQuota) { reservationId = await reservePersistentAiQuota(50, authContext); persistentReservation = true; }
      else reservationId = reserveWindowQuota('local-ai', 50, 24 * 60 * 60 * 1000);
      if (!reservationId) return json(res, 429, { error:'سقف ۵۰ خروجی موفق تصویر در روز UTC پر شده است؛ سهمیه و هزینهٔ Cloudflare نیز جداگانه اعمال می‌شود.' });
    } catch (error) { return json(res, Number(error.status) || 503, { error:error.message || 'سرویس سهمیهٔ تصویر در دسترس نیست.' }); }
    try {
      const result = await generateProductPhoto({ imageBytes:sourceBytes, imageRoles, style:body.style, productHint:body.productHint });
      const finalized = persistentReservation ? await finalizePersistentAiQuota(reservationId, true, authContext) : finishWindowQuota('local-ai', reservationId, true);
      if (!finalized) return json(res, 503, { error:'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی تحویل داده نشد.' });
      return json(res, 200, result);
    } catch (error) {
      if (reservationId) {
        try { if (persistentReservation) await finalizePersistentAiQuota(reservationId, false, authContext); else finishWindowQuota('local-ai', reservationId, false); } catch { /* expired reservations are reclaimed automatically */ }
      }
      const status = Number(error.status) || 502;
      return json(res, status, { error:error.message || 'ساخت تصویر با Cloudflare انجام نشد.' });
    }
  }
  if (pathname === '/api/uploads/product-image') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    try { await requireAdminRequest(req); } catch (error) { return json(res, Number(error.status) || 503, { error:error.message }); }
    let body, data;
    try { body = await readBody(req, 3 * 1024 * 1024); data = parseJpegDataUrl(body.image, 2 * 1024 * 1024); }
    catch (error) { return json(res, Number(error.status) || 400, { error:error.message || 'عکس معتبر نیست.' }); }
    if (!useQuota(productImageSaveTimes, 40, 60 * 60 * 1000)) return json(res, 429, { error:'سقف ذخیرهٔ فایل تصویری در ساعت پر شده است.' });
    try {
      const dir = path.join(root, 'uploads', 'products');
      await fs.promises.mkdir(dir, { recursive:true });
      const filename = `ai-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.jpg`;
      await fs.promises.writeFile(path.join(dir, filename), data, { flag:'wx', mode:0o644 });
      return json(res, 201, { url:`/uploads/products/${filename}`, bytes:data.length });
    } catch (error) { return json(res, 500, { error:error.message || 'ذخیره فایل انجام نشد.' }); }
  }

  let file = path.join(root, pathname.replace(/^\/+/, ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const builtAsset = path.join(root, 'public', pathname.replace(/^\/+/, ''));
    if (builtAsset.startsWith(path.join(root, 'public') + path.sep) && fs.existsSync(builtAsset) && fs.statSync(builtAsset).isFile()) file = builtAsset;
  }
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const protocol = String(req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
    let origin; try { origin = new URL(`${protocol}://${host}`).origin; } catch { origin = 'https://localhost'; }
    return fs.readFile(file, 'utf8', (err, content) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type':types[path.extname(file)], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
      res.end(content.replaceAll('{{ORIGIN}}', origin));
    });
  }
  if (pathname === '/' || !path.extname(pathname) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return serveFile(path.join(root, 'index.html'), res);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  serveFile(file, res);
});
function serveFile(file, res) {
  res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
  fs.createReadStream(file).pipe(res);
}
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`طوبی storefront listening on ${server.address().port} · پایگاه داده فروشگاه کفش طوبی`));

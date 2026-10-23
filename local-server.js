'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  generateStudioPhoto,
  DEFAULT_PROVIDER,
  DEFAULT_PIPELINE,
  SUPPORTED_PROVIDERS,
  SUPPORTED_PIPELINES,
  DEFAULT_BACKEND_URL,
  DEFAULT_COMFY_API_URL,
  checkBackendHealth,
  checkComfyHealth
} = require('./services/ai-studio-engine.js');
const { PRESETS } = require('./services/prompt-templates.js');
const MODEL = DEFAULT_PIPELINE;
const DEFAULT_MODEL = DEFAULT_PIPELINE;
const SUPPORTED_MODELS = SUPPORTED_PIPELINES;
const { persistentAiQuotaConfig, requireAdminRequest, parseProductReferenceRoles, reserveWindowQuota, finishWindowQuota, reservePersistentAiQuota, finalizePersistentAiQuota } = require('./lib/vercel-api.js');
const bitpay = require('./lib/bitpay.js');
const seo = require('./api/seo.js');
const { looksLikeSecretKey } = require('./lib/supabase-server.js');

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

function forwardSeoRequest(req, res, type, extra = {}) {
  const source = new URL(req.url || '/', 'http://localhost');
  const params = new URLSearchParams();
  params.set('type', type);
  if (type === 'shop') {
    for (const [key, value] of source.searchParams) {
      if (key !== 'type') params.append(key, value);
    }
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return seo({ url:`/api/seo?${params.toString()}`, method:req.method, headers:req.headers }, res);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return json(res, 400, { error:'آدرس درخواست معتبر نیست.' }); }

  if (
    pathname.toLowerCase() === '/20838126.txt' || pathname.toLowerCase() === '/20838126.txt/' ||
    pathname.toLowerCase() === '/18887070.txt' || pathname.toLowerCase() === '/18887070.txt/'
  ) {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': 0,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    return res.end('');
  }

  if (pathname === '/sitemap-products.xml') return forwardSeoRequest(req, res, 'sitemap');
  if (pathname === '/shop') return forwardSeoRequest(req, res, 'shop');
  const productRoute = /^\/product\/([^/]+)$/.exec(pathname);
  if (productRoute) return forwardSeoRequest(req, res, 'product', { slug:productRoute[1] });
  const categoryRoute = /^\/category\/([^/]+)$/.exec(pathname);
  if (categoryRoute) return forwardSeoRequest(req, res, 'category', { slug:categoryRoute[1] });
  if (
    ['/cart','/checkout','/login','/account','/account/orders','/wishlist','/tracking','/search','/admin'].includes(pathname) ||
    pathname.startsWith('/account/') || pathname.startsWith('/payment/result/') || pathname.startsWith('/admin/')
  ) return forwardSeoRequest(req, res, 'private', { path:pathname.replace(/^\/+/, '') });

  if (pathname === '/api/seo') return seo(req, res);
  if (pathname === '/api/supabase-config') {
    if (req.method !== 'GET') return json(res, 405, { error:'روش درخواست مجاز نیست.' }, { Allow:'GET' });
    const rawUrl = String(process.env.SUPABASE_URL || '').trim();
    let url = '';
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) url = parsed.origin; } catch { /* keep config disabled */ }
    const anonKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    // یک کلید secret هرگز نباید به مرورگر برسد، حتی اگر در متغیر عمومی اشتباهی گذاشته شده باشد
    const safeKey = anonKey && anonKey.length < 4096 && !looksLikeSecretKey(anonKey) ? anonKey : '';
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

  if (['/api/db', '/api/admin/login', '/api/orders'].includes(pathname)) {
    return json(res, 410, { error:'مسیرهای ذخیره‌سازی JSON و ورود/سفارش نمایشی غیرفعال شده‌اند؛ از Supabase Auth و RPCهای امن فروشگاه استفاده کنید.' });
  }

  if (pathname === '/api/payment/bitpay/status') return bitpay.status(req, res);
  if (pathname === '/api/payment/bitpay/callback') return bitpay.callback(req, res);
  if (pathname === '/api/payment/bitpay/request' || pathname === '/api/payment/bitpay/verify') {
    const handler = pathname.endsWith('/request') ? bitpay.request : bitpay.verify;
    if (req.method !== 'POST') return handler(req, res);
    try { req.body = await readBody(req, 32 * 1024); }
    catch (err) { return json(res, Number(err.status) || 400, { error:err.message }); }
    return handler(req, res);
  }

  if ((pathname === '/api/ai/status' || pathname === '/api/ai/studio/status') && req.method === 'GET') {
    const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
    const comfyHealth = await checkComfyHealth();
    return json(res, 200, {
      success: true,
      configured: true,
      keyless: true,
      unlimited: true,
      free: true,
      persistentQuotaConfigured,
      quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
      provider: 'ComfyUI Automation API (Qwen-Image-Edit / FLUX.2 / SDXL)',
      model: DEFAULT_MODEL || MODEL,
      defaultProvider: DEFAULT_PROVIDER,
      supportedModels: SUPPORTED_MODELS,
      supportedPipelines: SUPPORTED_PIPELINES,
      supportedProviders: SUPPORTED_PROVIDERS,
      presets: PRESETS,
      comfyApiUrl: DEFAULT_COMFY_API_URL,
      backendUrl: DEFAULT_BACKEND_URL,
      comfyStatus: comfyHealth,
      backendHealth: comfyHealth,
      localDailyLimit: 'unlimited',
      referenceMaxSide: 1280,
      note: 'استودیو هوش مصنوعی محصول طوبی: ویرایش بر پایه عکس مرجع با Qwen-Image-Edit، FLUX و SDXL بدون وابستگی به کلیدهای شخص ثالث.'
    });
  }
  if (pathname === '/api/ai/comfy-health' && req.method === 'GET') {
    const apiUrl = req.url ? new URL(req.url, 'http://localhost').searchParams.get('url') : null;
    const result = await checkComfyHealth(apiUrl || DEFAULT_COMFY_API_URL);
    return json(res, 200, result);
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
  if (pathname === '/api/ai/studio/generate') {
    if (req.method !== 'POST') return json(res, 405, { error: 'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    let authContext;
    try { authContext = await requireAdminRequest(req); } catch (error) { return json(res, Number(error.status) || 503, { error: error.message }); }
    let body;
    try {
      body = await readBody(req, 15 * 1024 * 1024);
      if (!body?.image && (!Array.isArray(body?.images) || body.images.length === 0)) {
        throw Object.assign(new Error('برای تولید تصویر، آپلود یک عکس واضح از محصول الزامی است.'), { status: 400 });
      }
    } catch (error) { return json(res, Number(error.status) || 400, { error: error.message }); }
    const persistentQuota = persistentAiQuotaConfig();
    let reservationId = null, persistentReservation = false, preferFallbackModel = false;
    try {
      if (persistentQuota) { reservationId = await reservePersistentAiQuota(50, authContext); persistentReservation = Boolean(reservationId); }
      else reservationId = reserveWindowQuota('local-ai-studio', 50, 24 * 60 * 60 * 1000);
      if (!reservationId) preferFallbackModel = true;
    } catch { preferFallbackModel = true; }
    try {
      const result = await generateStudioPhoto({
        image: body.image || body.images[0],
        referenceImage: body.referenceImage,
        style: body.style,
        customPrompt: body.customPrompt,
        aspectRatio: body.aspectRatio,
        preservation: body.preservation,
        quality: body.quality,
        provider: body.provider || body.pipeline,
        geminiApiKey: body.geminiApiKey,
        geminiAccessToken: body.geminiAccessToken,
        geminiProjectId: body.geminiProjectId,
        fast: body.fast !== false,
        seed: body.seed,
        preferFallbackModel: Boolean(preferFallbackModel || body.preferFallbackModel)
      });
      if (reservationId) {
        const finalized = persistentReservation ? await finalizePersistentAiQuota(reservationId, true, authContext) : finishWindowQuota('local-ai-studio', reservationId, true);
        if (!finalized && !preferFallbackModel) return json(res, 503, { error: 'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی تحویل داده نشد.' });
      }
      return json(res, 200, result);
    } catch (error) {
      if (reservationId) {
        try { if (persistentReservation) await finalizePersistentAiQuota(reservationId, false, authContext); else finishWindowQuota('local-ai-studio', reservationId, false); } catch { /* ignore */ }
      }
      const status = Number(error.status) || 502;
      return json(res, status, {
        error: error.message || 'ساخت تصویر با مدل هوش مصنوعی انجام نشد.',
        code: error.code || undefined
      });
    }
  }
  if (pathname === '/api/ai/studio/attach' || pathname === '/api/uploads/product-image') {
    return json(res, 410, { error:'ذخیرهٔ تصاویر فقط از مسیر Supabase Storage و repositoryهای متصل به پایگاه داده انجام می‌شود.' });
  }
  if (pathname === '/api/ai/product-photo') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    let authContext;
    try { authContext = await requireAdminRequest(req); } catch (error) { return json(res, Number(error.status) || 503, { error:error.message }); }
    let body, sourceBytes, imageRoles;
    try {
      body = await readBody(req, 4 * 1024 * 1024);
      const list = body?.image ? [body.image] : (Array.isArray(body?.images) ? body.images : []);
      if (list.length < 1 || list.length > 3) {
        throw Object.assign(new Error('برای ساخت تصویر، یک تصویر واضح از محصول لازم است.'), { status:400 });
      }
      sourceBytes = list.map(image => parseJpegDataUrl(image, 768 * 1024));
      imageRoles = parseProductReferenceRoles(body, sourceBytes.length);
    } catch (error) { return json(res, Number(error.status) || 400, { error:error.message }); }
    const persistentQuota = persistentAiQuotaConfig();
    let reservationId = null, persistentReservation = false, preferFallbackModel = false;
    try {
      if (persistentQuota) { reservationId = await reservePersistentAiQuota(50, authContext); persistentReservation = Boolean(reservationId); }
      else reservationId = reserveWindowQuota('local-ai', 50, 24 * 60 * 60 * 1000);
      if (!reservationId) preferFallbackModel = true;
    } catch { preferFallbackModel = true; }
    try {
      const studioResult = await generateStudioPhoto({
        imageBytes: sourceBytes[0],
        image: body.image,
        customPrompt: body.prompt,
        provider: body.pipeline || body.model || 'qwen-edit',
        style: body.style || 'catalog-white',
        apiUrl: body.apiUrl,
        fast: body.fast !== false,
        seed: body.seed,
        preferFallbackModel
      });
      if (reservationId) {
        const finalized = persistentReservation ? await finalizePersistentAiQuota(reservationId, true, authContext) : finishWindowQuota('local-ai', reservationId, true);
        if (!finalized && !preferFallbackModel) return json(res, 503, { error:'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی تحویل داده نشد.' });
      }
      const result = {
        success: true,
        images: studioResult.images || [studioResult.generatedUrl],
        image: studioResult.generatedUrl,
        pipeline: body.pipeline || studioResult.provider,
        style: body.style || studioResult.style,
        provider: 'ComfyUI Automation API (Qwen / FLUX / SDXL)',
        ...studioResult
      };
      return json(res, 200, result);
    } catch (error) {
      if (reservationId) {
        try { if (persistentReservation) await finalizePersistentAiQuota(reservationId, false, authContext); else finishWindowQuota('local-ai', reservationId, false); } catch { /* expired reservations are reclaimed automatically */ }
      }
      const status = Number(error.status) || 502;
      return json(res, status, {
        error: error.message || 'ساخت تصویر با مدل هوش مصنوعی انجام نشد.',
        code: error.code || undefined,
        quotaConsumed: false
      });
    }
  }
  let file = path.join(root, pathname.replace(/^\/+/, ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const builtAsset = path.join(root, 'public', pathname.replace(/^\/+/, ''));
    if (builtAsset.startsWith(path.join(root, 'public') + path.sep) && fs.existsSync(builtAsset) && fs.statSync(builtAsset).isFile()) file = builtAsset;
  }
  if (pathname === '/' || !path.extname(pathname) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return serveFile(path.join(root, 'index.html'), res);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  serveFile(file, res);
});
function serveFile(file, res) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { /* ignore */ }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  if (size === 0) return res.end('');
  fs.createReadStream(file).pipe(res);
}
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`طوبی storefront listening on ${server.address().port} · پایگاه داده فروشگاه کفش طوبی`));

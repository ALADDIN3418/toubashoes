'use strict';

const {
  generateStudioPhoto,
  checkBackendHealth,
  DEFAULT_PROVIDER,
  DEFAULT_PIPELINE,
  SUPPORTED_PROVIDERS,
  SUPPORTED_PIPELINES,
  PUTER_IMAGE_MODELS,
  PUTER_STUDIO_PROVIDER_NAME,
  DEFAULT_BACKEND_URL
} = require('../services/ai-studio-engine.js');
const { PRESETS } = require('../services/prompt-templates.js');

const MODEL = DEFAULT_PIPELINE;
const DEFAULT_MODEL = DEFAULT_PIPELINE;
const SUPPORTED_MODELS = SUPPORTED_PIPELINES;

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
  const apiKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  try {
    const parsed = new URL(projectUrl);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && apiKey) {
      return { baseUrl:parsed.origin, apiKey };
    }
  } catch { /* quota remains unavailable until the public Supabase configuration is valid */ }
  return null;
}

async function requireAdminRequest(req) {
  const config = persistentAiQuotaConfig();
  if (!config) return { localDemo:true };
  const authorization = String(req.headers?.authorization || '');
  const tokenMatch = /^Bearer\s+([A-Za-z0-9._~-]{20,4096})$/i.exec(authorization);
  if (!tokenMatch) throw Object.assign(new Error('برای استفاده از ابزار تصویر، دوباره با حساب مدیر وارد شوید.'), { status:401 });
  const accessToken = tokenMatch[1];
  const headers = { apikey:config.apiKey, Authorization:`Bearer ${accessToken}` };
  let userResponse, profileResponse;
  try {
    userResponse = await fetch(`${config.baseUrl}/auth/v1/user`, { headers, signal:AbortSignal.timeout(5000) });
    if (!userResponse.ok) throw Object.assign(new Error(userResponse.status === 401 ? 'نشست مدیر منقضی شده است؛ دوباره وارد شوید.' : 'اعتبارسنجی حساب مدیر انجام نشد.'), { status:userResponse.status === 401 ? 401 : 503 });
    const user = await userResponse.json();
    if (!user?.id) throw Object.assign(new Error('حساب کاربری معتبر نیست.'), { status:401 });
    const profileUrl = new URL('/rest/v1/profiles', config.baseUrl);
    profileUrl.searchParams.set('select','id,role,is_active');
    profileUrl.searchParams.set('id',`eq.${user.id}`);
    profileUrl.searchParams.set('limit','1');
    profileResponse = await fetch(profileUrl, { headers, signal:AbortSignal.timeout(5000) });
    if (!profileResponse.ok) throw Object.assign(new Error('خواندن نقش مدیر از Supabase انجام نشد.'), { status:503 });
    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.is_active || !['admin','super_admin'].includes(profile.role)) {
      throw Object.assign(new Error('این ابزار فقط برای حساب مدیر فعال و تأییدشده در دسترس است.'), { status:403 });
    }
    return { ...config, accessToken, userId:user.id, role:profile.role };
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('ارتباط امن با Supabase برقرار نشد؛ اتصال شبکه را بررسی و دوباره تلاش کنید.'), { status:503 });
  }
}

async function callPersistentAiQuotaRpc(functionName, body, authContext) {
  const config = persistentAiQuotaConfig();
  if (!config || !authContext?.accessToken) throw Object.assign(new Error('نشست مدیر یا سهمیهٔ روزانهٔ Supabase در دسترس نیست.'), { status:503 });
  const response = await fetch(`${config.baseUrl}/rest/v1/rpc/${functionName}`, {
    method:'POST',
    headers:{ apikey:config.apiKey, Authorization:`Bearer ${authContext.accessToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (/PGRST202/.test(detail)) {
      throw Object.assign(new Error("Supabase سهمیهٔ تصویر را در schema cache پیدا نکرد (PGRST202). Migrationهای سهمیه را اجرا کنید و cache را با NOTIFY pgrst, 'reload schema' تازه‌سازی کنید؛ سپس دوباره تلاش کنید."), { status:503 });
    }
    if (response.status === 401) throw Object.assign(new Error('نشست مدیر منقضی شده است؛ دوباره وارد شوید.'), { status:401 });
    if (response.status === 403) throw Object.assign(new Error('حساب مدیر مجاز به ثبت سهمیه نیست.'), { status:403 });
    throw Object.assign(new Error(`ثبت سهمیه در Supabase انجام نشد (${response.status})${detail ? `: ${detail.slice(0,180)}` : ''}.`), { status:503 });
  }
  return response.json();
}

async function reservePersistentAiQuota(_limit = 50, authContext) {
  const reservationId = await callPersistentAiQuotaRpc('reserve_ai_image_quota', {}, authContext);
  return typeof reservationId === 'string' && /^[0-9a-f-]{36}$/i.test(reservationId) ? reservationId : null;
}

async function finalizePersistentAiQuota(reservationId, succeeded, authContext) {
  const result = await callPersistentAiQuotaRpc('finish_ai_image_quota', { p_reservation_id:reservationId, p_succeeded:Boolean(succeeded) }, authContext);
  return result === true;
}

const PRODUCT_REFERENCE_ROLES = Object.freeze(['front','side','heel']);

function parseProductReferenceImages(body) {
  const list = body?.image ? [body.image] : (Array.isArray(body?.images) ? body.images : []);
  if (list.length < 1 || list.length > 3) {
    throw Object.assign(new Error('برای ساخت تصویر، یک تصویر واضح از محصول لازم است.'), { status:400 });
  }
  return list.map(image => parseJpegDataUrl(image, 768 * 1024));
}

function parseProductReferenceRoles(body, count) {
  if (count === 1) return ['front'];
  const roles = body?.imageRoles === undefined ? PRODUCT_REFERENCE_ROLES.slice(0,count) : body.imageRoles;
  if (!Array.isArray(roles) || roles.length !== count || roles.some(role => !PRODUCT_REFERENCE_ROLES.includes(role)) || new Set(roles).size !== roles.length) {
    throw Object.assign(new Error('برای هر عکس مرجع یک زاویهٔ یکتا (front، side یا heel) لازم است.'), { status:400 });
  }
  return roles;
}

/**
 * Backward-compatible product-photo endpoint
 */
async function productPhoto(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  let body, imageBytes, imageRoles;
  try {
    body = requestBody(req);
    imageBytes = parseProductReferenceImages(body);
    imageRoles = parseProductReferenceRoles(body, imageBytes.length);
  } catch (error) { return sendJson(res, Number(error.status) || 400, { error:error.message }); }
  const durableQuota = persistentAiQuotaConfig();
  let reservationId = null, persistentReservation = false, preferFallbackModel = false, authContext;
  try {
    authContext = await requireAdminRequest(req);
    if (process.env.VERCEL && !durableQuota) return sendJson(res, 503, { error:'سهمیهٔ روزانهٔ پایدار Supabase تنظیم نشده است؛ پیکربندی Supabase و migration سهمیه را بررسی کنید.' });
  } catch (error) { return sendJson(res, Number(error.status) || 503, { error:error.message || 'سرویس سهمیهٔ تصویر در دسترس نیست.' }); }
  try {
    if (durableQuota) {
      reservationId = await reservePersistentAiQuota(50, authContext);
      persistentReservation = Boolean(reservationId);
    } else reservationId = reserveWindowQuota('ai', 50, 24 * 60 * 60 * 1000);
    if (!reservationId) preferFallbackModel = true;
  } catch {
    preferFallbackModel = true;
  }
  try {
    const studioResult = await generateStudioPhoto({
      imageBytes: imageBytes[0],
      image: body.image,
      customPrompt: body.prompt,
      pipeline: DEFAULT_PROVIDER,
      provider: DEFAULT_PROVIDER,
      style: body.style || 'catalog-white',
      apiUrl: body.apiUrl,
      fast: body.fast !== false,
      seed: body.seed,
      preferFallbackModel
    });

    if (reservationId) {
      const finalized = persistentReservation
        ? await finalizePersistentAiQuota(reservationId, true, authContext)
        : finishWindowQuota('ai', reservationId, true);
      if (!finalized && !preferFallbackModel) return sendJson(res, 503, { error:'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی برای جلوگیری از عبور از سقف تحویل داده نشد.' });
    }

    const result = {
      ...studioResult,
      success: true,
      images: studioResult.images || [studioResult.generatedUrl],
      image: studioResult.generatedUrl,
      pipeline: studioResult.pipeline || DEFAULT_PROVIDER,
      model: studioResult.model || DEFAULT_PROVIDER,
      style: body.style || studioResult.style,
      provider: studioResult.provider || 'Puter.js Multi-Model Auto-Rotation'
    };
    return sendJson(res, 200, result);
  } catch (error) {
    if (reservationId) {
      try {
        if (persistentReservation) await finalizePersistentAiQuota(reservationId, false, authContext);
        else finishWindowQuota('ai', reservationId, false);
      } catch { /* abandoned reservations expire automatically in the database */ }
    }
    const status = Number(error.status) || 502;
    return sendJson(res, status, {
      error: error.message || 'ساخت تصویر با مدل هوش مصنوعی انجام نشد.',
      code: error.code || undefined,
      quotaConsumed: false
    });
  }
}

/**
 * Dedicated Product AI Studio Generation Endpoint: /api/ai/studio/generate
 */
async function studioGenerate(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });

  let authContext;
  try {
    authContext = await requireAdminRequest(req);
  } catch (error) {
    return sendJson(res, Number(error.status) || 503, { error: error.message });
  }

  let body;
  try {
    body = requestBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const rawImage = body.image || (Array.isArray(body.images) && body.images[0]);
  if (!rawImage) {
    return sendJson(res, 400, { error: 'برای تولید تصویر، آپلود یک عکس واضح از محصول الزامی است.' });
  }

  const durableQuota = persistentAiQuotaConfig();
  let reservationId = null, persistentReservation = false, preferFallbackModel = false;
  try {
    if (durableQuota) {
      reservationId = await reservePersistentAiQuota(50, authContext);
      persistentReservation = Boolean(reservationId);
    } else {
      reservationId = reserveWindowQuota('ai-studio', 50, 24 * 60 * 60 * 1000);
    }
    if (!reservationId) {
      preferFallbackModel = true;
    }
  } catch {
    preferFallbackModel = true;
  }

  try {
    const result = await generateStudioPhoto({
      image: rawImage,
      referenceImage: body.referenceImage,
      style: body.style,
      customPrompt: body.customPrompt,
      aspectRatio: body.aspectRatio,
      preservation: body.preservation,
      quality: body.quality,
      provider: body.provider || body.pipeline,
      puterAuthToken: body.puterAuthToken,
      fast: body.fast !== false,
      seed: body.seed,
      preferFallbackModel: Boolean(preferFallbackModel || body.preferFallbackModel),
      allowMock: true
    });

    if (reservationId) {
      const finalized = persistentReservation
        ? await finalizePersistentAiQuota(reservationId, true, authContext)
        : finishWindowQuota('ai-studio', reservationId, true);

      if (!finalized && !preferFallbackModel) {
        return sendJson(res, 503, { error: 'تصویر ساخته شد اما ثبت سهمیه تأیید نشد؛ خروجی تحویل داده نشد.' });
      }
    }

    return sendJson(res, 200, result);
  } catch (error) {
    if (reservationId) {
      try {
        if (persistentReservation) await finalizePersistentAiQuota(reservationId, false, authContext);
        else finishWindowQuota('ai-studio', reservationId, false);
      } catch { /* ignore */ }
    }
    const status = Number(error.status) || 502;
    return sendJson(res, status, {
      error: error.message || 'ساخت تصویر با مدل هوش مصنوعی انجام نشد.',
      code: error.code || undefined
    });
  }
}

/**
 * Dedicated Product AI Studio Status Endpoint: /api/ai/studio/status
 */
async function studioStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const backendHealth = await checkBackendHealth();
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  return sendJson(res, 200, {
    success: true,
    configured: true,
    keyless: true,
    unlimited: false,
    free: false,
    persistentQuotaConfigured,
    quotaMode: 'puter-user-pays',
    provider: PUTER_STUDIO_PROVIDER_NAME,
    model: DEFAULT_PROVIDER,
    defaultProvider: DEFAULT_PROVIDER,
    supportedProviders: SUPPORTED_PROVIDERS,
    supportedModels: SUPPORTED_PIPELINES,
    supportedPipelines: SUPPORTED_PIPELINES,
    puterImageModels: PUTER_IMAGE_MODELS,
    totalModels: PUTER_IMAGE_MODELS.length,
    editableModels: PUTER_IMAGE_MODELS.filter(model => model.supportsImg2Img).length,
    presets: PRESETS,
    backendUrl: DEFAULT_BACKEND_URL,
    backendHealth,
    billingModel: 'Puter user-pays; usage depends on the signed-in Puter account',
    note: 'استودیو طوبی از مدل‌های تصویر Puter.js استفاده می‌کند؛ مدل‌های سازگار با ویرایش عکس به‌صورت چرخشی و با جایگزینی خودکار امتحان می‌شوند.'
  });
}

async function productDescription(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });
  try { await requireAdminRequest(req); } catch (error) { return sendJson(res, Number(error.status) || 503, { error:error.message }); }
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

module.exports = {
  sendJson,
  requestBody,
  sameOrigin,
  parseJpegDataUrl,
  parseProductReferenceImages,
  parseProductReferenceRoles,
  takeWindowQuota,
  persistentAiQuotaConfig,
  requireAdminRequest,
  reserveWindowQuota,
  finishWindowQuota,
  reservePersistentAiQuota,
  finalizePersistentAiQuota,
  productPhoto,
  studioGenerate,
  studioStatus,
  productDescription,
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS
};

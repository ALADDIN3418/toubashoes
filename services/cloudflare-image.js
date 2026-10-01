'use strict';

const MODEL = '@cf/black-forest-labs/flux-2-klein-9b';
const DEFAULT_MODEL = MODEL;
// Keep base64 JSON responses below Vercel Functions' response-body ceiling.
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;

const REFERENCE_ROLES = Object.freeze(['front three-quarter view', 'outer side profile', 'rear and heel view']);
const REFERENCE_VIEW_IDS = Object.freeze(['front', 'side', 'heel']);
const VIEW_LABELS = Object.freeze({ front:REFERENCE_ROLES[0], side:REFERENCE_ROLES[1], heel:REFERENCE_ROLES[2] });
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function promptFor(style, imageRoles = REFERENCE_VIEW_IDS) {
  // Support both (style, imageRoles) and legacy (style, productHint, imageRoles) signatures,
  // but exclude freeform text from the model prompt (shoe-only ecommerce prompt).
  const roles = Array.isArray(imageRoles) ? imageRoles : (Array.isArray(arguments[2]) ? arguments[2] : (Array.isArray(arguments[1]) ? arguments[1] : []));
  const scenes = {
    'catalog-white':'a clean, pure white seamless commercial catalog background, professional soft studio lighting, crisp natural contact shadow on white floor',
    'warm-studio':'a premium warm ivory studio with a soft beige plaster backdrop and subtle natural contact shadow',
    'dark-luxury':'a refined dark forest-green and charcoal studio, matte stone surface and restrained warm highlights',
    'minimal':'a minimal bright white concrete pedestal studio with soft diffuse daylight',
    'lifestyle':'a warm interior setting on an elegant light oak surface with soft ambient lighting',
    'on-model':'a professional studio floor setting showcasing the shoe with dynamic perspective lighting',
    'advertising':'a high-contrast commercial advertising campaign backdrop with vibrant studio spotlight',
    'natural-stone':'a minimal natural limestone and warm sand setting with soft daylight',
    'custom':'a professional commercial product studio with pristine lighting tailored to the product'
  };
  const activeRoles = roles.length ? roles : ['front'];
  if (activeRoles.length === 1) {
    return `Create ONE single, polished, high-detail ecommerce product photograph of the exact shoe shown in input image 0. Preserve the shoe's true identity, silhouette, proportions, color, material, construction, sole, straps, buckles, laces, logos, stitching, and fine visible details; do not invent or redesign features. Show the complete shoe at a flattering front three-quarter camera angle, centered with clean negative space, sharp fine texture and stitching, realistic materials, soft natural contact shadow, professional product lighting. Change only the background, lighting, surface, and camera viewpoint. Scene: ${scenes[style] || scenes['warm-studio']}. No text, props covering the product, duplicate shoes, or extra objects.`;
  }
  const viewMap = activeRoles.map((role, index) => `image ${index} is the ${VIEW_LABELS[role] || 'shoe reference view'}`).join('; ');
  return `The ${activeRoles.length} complementary reference photos show the SAME exact shoe. Reference mapping: ${viewMap}. Carefully combine every supplied reference to preserve the shoe's true identity, silhouette, proportions, color, material, construction, sole, straps, buckles, laces, logos, stitching, and small visible details. Resolve details using the clearest available view; do not invent or redesign features. Create ONE single, polished, high-detail ecommerce product photograph of that shoe, not a collage or multi-panel layout and not multiple shoes. Show the complete shoe at a flattering front three-quarter camera angle, centered with clean negative space, sharp fine texture and stitching, realistic materials, soft natural contact shadow, professional product lighting. Change only the background, lighting, surface, and camera viewpoint. Scene: ${scenes[style] || scenes['warm-studio']}. No text, props covering the product, duplicate shoes, or extra objects.`;
}

function extractCloudflareId(text, payload, headers) {
  const textMatch = String(text || '').match(UUID_REGEX);
  if (textMatch) return textMatch[0];
  const payloadStr = JSON.stringify(payload || '');
  const payloadMatch = payloadStr.match(UUID_REGEX);
  if (payloadMatch) return payloadMatch[0];
  const cfRay = headers?.get ? headers.get('cf-ray') : (headers?.['cf-ray'] || headers?.['cf-request-id'] || null);
  if (cfRay) return String(cfRay).trim();
  return null;
}

function isContentFlagged(text, payload) {
  const code = payload?.errors?.[0]?.code ?? payload?.internalCode ?? payload?.code;
  if (Number(code) === 3030 || String(code) === '3030') return true;
  const combined = `${text || ''} ${JSON.stringify(payload || '')}`;
  return /flagged/i.test(combined);
}

function formatSafetyFlaggedError(rawMessage, payload, headers) {
  const cloudflareId = extractCloudflareId(rawMessage, payload, headers);
  const idText = cloudflareId ? ` (شناسهٔ Cloudflare: ${cloudflareId})` : '';
  const message = `خروجی توسط فیلتر ایمنی Cloudflare رد شد${idText}. این ردشدن فیلتر ایمنی است، نه خطای Supabase، و نباید راهی برای دورزدن فیلتر اضافه شود؛ سهمیهٔ روزانه محفوظ ماند.`;
  const error = new Error(message);
  error.status = 400;
  error.code = 'CLOUDFLARE_SAFETY_FLAGGED';
  error.cloudflareId = cloudflareId || null;
  error.safetyFlagged = true;
  return error;
}

function sanitizeEnv(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function getCloudflareConfig() {
  const accountId = sanitizeEnv(process.env.CLOUDFLARE_ACCOUNT_ID);
  const rawToken = sanitizeEnv(process.env.CLOUDFLARE_API_TOKEN);
  const apiToken = rawToken.replace(/^Bearer\s+/i, '').trim();
  const model = sanitizeEnv(process.env.CLOUDFLARE_IMAGE_MODEL) || DEFAULT_MODEL;
  return {
    accountId,
    apiToken,
    model,
    configured: Boolean(accountId && apiToken)
  };
}

function buildEndpoint(accountId, model = MODEL) {
  const cleanAccountId = sanitizeEnv(accountId);
  const cleanModel = sanitizeEnv(model) || MODEL;
  if (!/^[a-f0-9]{32}$/i.test(cleanAccountId)) throw Object.assign(new Error('CLOUDFLARE_ACCOUNT_ID باید شناسهٔ ۳۲ کاراکتری حساب Cloudflare باشد.'), { status:503 });
  if (!/^@cf\/[a-z0-9./-]+$/i.test(cleanModel)) throw Object.assign(new Error('مدل Cloudflare معتبر نیست.'), { status:500 });
  return `https://api.cloudflare.com/client/v4/accounts/${cleanAccountId}/ai/run/${cleanModel}`;
}

async function generateProductPhoto({ imageBytes, imageRoles, style = 'warm-studio', prompt }) {
  const { accountId, apiToken, model } = getCloudflareConfig();
  if (!accountId || !apiToken) throw Object.assign(new Error('برای فعال‌سازی رایگان روزانه، CLOUDFLARE_ACCOUNT_ID و CLOUDFLARE_API_TOKEN را در فایل محلی .env تنظیم کنید.'), { status:503 });

  const references = Array.isArray(imageBytes) ? imageBytes : [imageBytes];
  if (references.length < 1 || references.length > 3 || references.some(image => !image?.length)) {
    throw Object.assign(new Error('برای ساخت تصویر، یک تصویر واضح از محصول لازم است.'), { status:400 });
  }
  const roles = Array.isArray(imageRoles) ? imageRoles : (references.length === 1 ? ['front'] : REFERENCE_VIEW_IDS.slice(0, references.length));

  const form = new FormData();
  form.append('prompt', prompt || promptFor(style, roles));
  references.forEach((image, index) => {
    form.append(`input_image_${index}`, new Blob([image], { type:'image/jpeg' }), `shoe-view-${index + 1}.jpg`);
  });
  form.append('width', '1024');
  form.append('height', '1024');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(buildEndpoint(accountId, model), {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${apiToken}` },
      body:form,
      signal:controller.signal
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    let bytes;
    if (contentType === 'application/json' || contentType.endsWith('+json')) {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false || payload.errors?.length) {
        const rawMessage = payload.errors?.[0]?.message || payload.errors?.[0]?.code || payload.messages?.[0]?.message || '';
        if (isContentFlagged(rawMessage, payload)) {
          throw formatSafetyFlaggedError(rawMessage, payload, response.headers);
        }
        const message = rawMessage || `Cloudflare Workers AI پاسخ نداد (${response.status}).`;
        throw Object.assign(new Error(message), { status:response.status === 429 ? 429 : response.status === 403 ? 403 : 502 });
      }
      const encoded = payload.result?.image || payload.image;
      if (typeof encoded !== 'string') throw Object.assign(new Error('مدل Cloudflare خروجی تصویر برنگرداند.'), { status:502 });
      bytes = Buffer.from(encoded.replace(/^data:image\/[a-z]+;base64,/i, ''), 'base64');
    } else if (response.ok && contentType.startsWith('image/')) {
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      const detail = (await response.text().catch(() => '')).slice(0, 500);
      if (isContentFlagged(detail, null)) {
        throw formatSafetyFlaggedError(detail, null, response.headers);
      }
      throw Object.assign(new Error(detail || `Cloudflare Workers AI پاسخ نداد (${response.status}).`), { status:response.status === 429 ? 429 : 502 });
    }
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) throw Object.assign(new Error('حجم خروجی مدل از سقف امن پاسخ سرور (۳ مگابایت) بیشتر است؛ تولید را دوباره با خروجی استاندارد امتحان کنید.'), { status:502 });
    return { dataUrl:`data:image/png;base64,${bytes.toString('base64')}`, model, provider:'Cloudflare Workers AI' };
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('زمان پاسخ مدل Cloudflare تمام شد؛ دوباره تلاش کنید.'), { status:504 });
    if (error.safetyFlagged) throw error;
    if (isContentFlagged(error.message, null)) {
      throw formatSafetyFlaggedError(error.message, null, null);
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

module.exports = {
  generateProductPhoto,
  getCloudflareConfig,
  promptFor,
  buildEndpoint,
  extractCloudflareId,
  isContentFlagged,
  formatSafetyFlaggedError,
  MODEL,
  DEFAULT_MODEL,
  REFERENCE_ROLES,
  REFERENCE_VIEW_IDS
};

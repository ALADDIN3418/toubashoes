'use strict';

const MODEL = '@cf/black-forest-labs/flux-2-klein-9b';
const DEFAULT_MODEL = MODEL;
// Keep base64 JSON responses below Vercel Functions' response-body ceiling.
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;

const REFERENCE_ROLES = Object.freeze(['front three-quarter view', 'outer side profile', 'rear and heel view']);

function promptFor(style, productHint = '') {
  const safeHint = String(productHint || '').replace(/[\r\n<>]/g, ' ').slice(0, 180).trim();
  const itemGuide = safeHint ? `Product listing context: “${safeHint}”. Use it only to identify the product category.` : '';
  const scenes = {
    'warm-studio':'a premium warm ivory studio with a soft beige plaster backdrop and subtle natural contact shadow',
    'dark-luxury':'a refined dark forest-green and charcoal studio, matte stone surface and restrained warm highlights',
    'natural-stone':'a minimal natural limestone and warm sand setting with soft daylight'
  };
  return `The three input images show the SAME exact shoe from complementary views: image 0 is the front three-quarter view, image 1 is the outer side profile, and image 2 shows the rear and heel. ${itemGuide} Carefully combine all three references to preserve the shoe's true identity, silhouette, proportions, color, material, construction, sole, straps, buckles, laces, logos, stitching, and small visible details. Resolve details using the clearest reference view; do not invent or redesign features. Create ONE single, polished, high-detail ecommerce product photograph of that shoe, not a collage or multi-panel layout and not multiple shoes. Show the complete shoe at a flattering front three-quarter camera angle, centered with clean negative space, sharp fine texture and stitching, realistic materials, soft natural contact shadow, professional product lighting. Change only the background, lighting, surface, and camera viewpoint. Scene: ${scenes[style] || scenes['warm-studio']}. No text, props covering the product, duplicate shoes, or extra objects.`;
}

function buildEndpoint(accountId, model = MODEL) {
  if (!/^[a-f0-9]{32}$/i.test(String(accountId || ''))) throw Object.assign(new Error('CLOUDFLARE_ACCOUNT_ID باید شناسهٔ ۳۲ کاراکتری حساب Cloudflare باشد.'), { status:503 });
  if (!/^@cf\/[a-z0-9./-]+$/i.test(model)) throw Object.assign(new Error('مدل Cloudflare معتبر نیست.'), { status:500 });
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function generateProductPhoto({ imageBytes, style = 'warm-studio', productHint = '' }) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_MODEL;
  if (!accountId || !apiToken) throw Object.assign(new Error('برای فعال‌سازی رایگان روزانه، CLOUDFLARE_ACCOUNT_ID و CLOUDFLARE_API_TOKEN را در فایل محلی .env تنظیم کنید.'), { status:503 });

  const references = Array.isArray(imageBytes) ? imageBytes : [imageBytes];
  if (references.length !== 3 || references.some(image => !image?.length)) {
    throw Object.assign(new Error('برای ساخت تصویر نهایی، دقیقاً سه عکس مرجع از جلو، کنار و پشت کفش لازم است.'), { status:400 });
  }

  const form = new FormData();
  form.append('prompt', promptFor(style, productHint));
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
        const message = payload.errors?.[0]?.message || payload.errors?.[0]?.code || payload.messages?.[0]?.message || `Cloudflare Workers AI پاسخ نداد (${response.status}).`;
        throw Object.assign(new Error(message), { status:response.status === 429 ? 429 : response.status === 403 ? 403 : 502 });
      }
      const encoded = payload.result?.image || payload.image;
      if (typeof encoded !== 'string') throw Object.assign(new Error('مدل Cloudflare خروجی تصویر برنگرداند.'), { status:502 });
      bytes = Buffer.from(encoded.replace(/^data:image\/[a-z]+;base64,/i, ''), 'base64');
    } else if (response.ok && contentType.startsWith('image/')) {
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      const detail = (await response.text().catch(() => '')).slice(0, 500);
      throw Object.assign(new Error(detail || `Cloudflare Workers AI پاسخ نداد (${response.status}).`), { status:response.status === 429 ? 429 : 502 });
    }
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) throw Object.assign(new Error('حجم خروجی مدل از سقف امن پاسخ سرور (۳ مگابایت) بیشتر است؛ تولید را دوباره با خروجی استاندارد امتحان کنید.'), { status:502 });
    return { dataUrl:`data:image/png;base64,${bytes.toString('base64')}`, model, provider:'Cloudflare Workers AI' };
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('زمان پاسخ مدل Cloudflare تمام شد؛ دوباره تلاش کنید.'), { status:504 });
    throw error;
  } finally { clearTimeout(timeout); }
}

module.exports = { generateProductPhoto, promptFor, buildEndpoint, MODEL, DEFAULT_MODEL, REFERENCE_ROLES };

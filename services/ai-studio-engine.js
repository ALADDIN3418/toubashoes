/**
 * Product AI Studio Engine
 * «موتور استودیوی هوش مصنوعی محصول طوبی — چرخش مدل‌های Puter.js»
 *
 * Image generation is performed with the signed-in browser user's Puter.js session.
 * The server exposes the supported model catalog and never substitutes the original
 * upload when generation fails.
 */
'use strict';

const {
  PRESETS,
  DEFAULT_PRESET,
  PRESERVATION_RULES,
  ASPECT_RATIO_DIMENSIONS,
  buildPrompt,
  getNegativePrompt
} = require('./prompt-templates.js');

const DEFAULT_PROVIDER = 'puter-auto';
const PUTER_STUDIO_PROVIDER_NAME = 'Puter.js · چرخش خودکار مدل‌ها';
const DEFAULT_BACKEND_URL = 'https://js.puter.com/v2/';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const MODEL_TIMEOUT_MS = 90 * 1000;

/**
 * Current Puter.js image catalog baseline. The browser augments this list with
 * Puter's live `puter-image-generation` catalog so newly published models appear
 * without a deployment. `supportsImg2Img: false` entries are shown in the UI but
 * are not used for product-photo editing because they cannot take a reference.
 */
const PUTER_IMAGE_MODELS = Object.freeze([
  { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', provider: 'OpenAI', supportsImg2Img: true },
  { id: 'openai/gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', provider: 'OpenAI', supportsImg2Img: true },
  { id: 'openai/gpt-image-2', name: 'GPT Image 2', provider: 'OpenAI', supportsImg2Img: true },
  { id: 'openai/gpt-image-1.5', name: 'GPT Image 1.5', provider: 'OpenAI', supportsImg2Img: true },
  { id: 'x-ai/grok-imagine-image-2.0', name: 'Grok Imagine Image 2.0', provider: 'xAI', supportsImg2Img: true },
  { id: 'x-ai/grok-imagine-image-quality', name: 'Grok Imagine Image Quality', provider: 'xAI', supportsImg2Img: true },
  { id: 'x-ai/grok-imagine-image', name: 'Grok Imagine Image', provider: 'xAI', supportsImg2Img: true },
  { id: 'black-forest-labs/flux-2-pro', name: 'FLUX.2 Pro', provider: 'Black Forest Labs', supportsImg2Img: true },
  { id: 'black-forest-labs/flux-2-dev', name: 'FLUX.2 Dev', provider: 'Black Forest Labs', supportsImg2Img: true },
  { id: 'black-forest-labs/flux-2-klein-9b-base', name: 'FLUX.2 Klein 9B', provider: 'Black Forest Labs', supportsImg2Img: true },
  { id: 'black-forest-labs/flux-2-klein-4b', name: 'FLUX.2 Klein 4B', provider: 'Black Forest Labs', supportsImg2Img: true },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', provider: 'Black Forest Labs', supportsImg2Img: false },
  { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', provider: 'Black Forest Labs', supportsImg2Img: false },
  { id: 'dola-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', provider: 'BytePlus', supportsImg2Img: true },
  { id: 'seedream-5-0-lite-260128', name: 'Seedream 5.0 Lite', provider: 'BytePlus', supportsImg2Img: true },
  { id: 'seedream-4-5-251128', name: 'Seedream 4.5', provider: 'BytePlus', supportsImg2Img: true },
  { id: 'seedream-4-0-250828', name: 'Seedream 4.0', provider: 'BytePlus', supportsImg2Img: true },
  { id: 'qwen/qwen-image', name: 'Qwen Image', provider: 'Qwen', supportsImg2Img: false },
  { id: 'ideogram/ideogram-4.0', name: 'Ideogram 4.0', provider: 'Ideogram', supportsImg2Img: true },
  { id: 'leonardoai/lucid-origin', name: 'Leonardo Lucid Origin', provider: 'Leonardo', supportsImg2Img: false },
  { id: 'leonardoai/phoenix-1.0', name: 'Leonardo Phoenix 1.0', provider: 'Leonardo', supportsImg2Img: false },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', provider: 'Stability AI', supportsImg2Img: false },
  { id: '@cf/black-forest-labs/flux-2-dev', name: 'Cloudflare FLUX.2 Dev', provider: 'Cloudflare', supportsImg2Img: true },
  { id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'Cloudflare FLUX.2 Klein 9B', provider: 'Cloudflare', supportsImg2Img: true },
  { id: '@cf/black-forest-labs/flux-2-klein-4b', name: 'Cloudflare FLUX.2 Klein 4B', provider: 'Cloudflare', supportsImg2Img: true },
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'Cloudflare FLUX.1 Schnell', provider: 'Cloudflare', supportsImg2Img: false },
  { id: '@cf/leonardo/lucid-origin', name: 'Cloudflare Lucid Origin', provider: 'Cloudflare', supportsImg2Img: false },
  { id: '@cf/leonardo/phoenix-1.0', name: 'Cloudflare Phoenix 1.0', provider: 'Cloudflare', supportsImg2Img: false },
  { id: '@cf/stabilityai/stable-diffusion-xl-lightning', name: 'Cloudflare SDXL Lightning', provider: 'Cloudflare', supportsImg2Img: false },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'Cloudflare SDXL Base', provider: 'Cloudflare', supportsImg2Img: false },
  { id: '@cf/runwayml/stable-diffusion-v1-5-inpainting', name: 'Cloudflare SD 1.5 Inpainting', provider: 'Cloudflare', supportsImg2Img: false }
].map(model => Object.freeze(model)));

const SUPPORTED_PIPELINES = Object.freeze([
  DEFAULT_PROVIDER,
  ...PUTER_IMAGE_MODELS.map(model => model.id)
]);

const SUPPORTED_PROVIDERS = Object.freeze([
  {
    id: DEFAULT_PROVIDER,
    name: 'Puter.js — چرخش خودکار مدل‌های سازگار با عکس مرجع',
    title: 'چرخش خودکار Puter.js',
    badge: 'Round-robin',
    description: 'چرخش بین مدل‌های ویرایش تصویر Puter.js و رفتن خودکار سراغ مدل بعدی هنگام محدودیت یا خطا'
  },
  ...Array.from(new Set(PUTER_IMAGE_MODELS.map(model => model.provider))).map(provider => ({
    id: provider.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: provider,
    title: provider,
    badge: 'Puter.js',
    description: `مدل‌های ${provider} از طریق Puter.js`
  }))
]);

// In-memory fallback state for server-side adapters and deterministic tests.
let rotationCursor = 0;
const rateLimitedUntil = new Map();

function resetRotationState() {
  rotationCursor = 0;
  rateLimitedUntil.clear();
}

function getRotationCursor() {
  return rotationCursor;
}

function markModelRateLimited(modelId, cooldownMs = MODEL_COOLDOWN_MS) {
  if (modelId) rateLimitedUntil.set(String(modelId), Date.now() + Math.max(1000, Number(cooldownMs) || MODEL_COOLDOWN_MS));
}

function isModelRateLimited(modelId) {
  const until = rateLimitedUntil.get(String(modelId));
  if (!until) return false;
  if (Date.now() >= until) {
    rateLimitedUntil.delete(String(modelId));
    return false;
  }
  return true;
}

function isGeminiModel(model) {
  return /gemini/i.test(`${model?.id || ''} ${model?.name || ''}`);
}

function buildRotationQueue(preferredModel = DEFAULT_PROVIDER, catalog = PUTER_IMAGE_MODELS) {
  const editable = (Array.isArray(catalog) ? catalog : PUTER_IMAGE_MODELS)
    .filter(model => model && model.id && model.supportsImg2Img !== false && !isGeminiModel(model));
  if (!editable.length) return [];

  const start = ((rotationCursor % editable.length) + editable.length) % editable.length;
  rotationCursor = (start + 1) % editable.length;
  const ordered = Array.from({ length: editable.length }, (_, index) => editable[(start + index) % editable.length]);

  if (preferredModel && preferredModel !== DEFAULT_PROVIDER) {
    const selectedIndex = ordered.findIndex(model => model.id === preferredModel);
    if (selectedIndex > 0) ordered.unshift(...ordered.splice(selectedIndex, 1));
  }

  const ready = ordered.filter(model => !isModelRateLimited(model.id));
  const cooling = ordered.filter(model => isModelRateLimited(model.id));
  return ready.length ? [...ready, ...cooling] : ordered;
}

function isValidImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  const png = buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG';
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return png || jpeg || webp;
}

function validateImageBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw Object.assign(new Error('تصویر ورودی معتبر نیست یا خالی است.'), { status: 400 });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('حجم تصویر بیش از حد مجاز ۱۵ مگابایت است.'), { status: 413 });
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG';
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    throw Object.assign(new Error('فقط فرمت‌های تصویر JPG، PNG و WEBP پشتیبانی می‌شوند.'), { status: 400 });
  }
  return {
    isJpeg,
    isPng,
    isWebp,
    mimeType: isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg'
  };
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  validateImageBytes(buffer);
  return { mimeType, buffer, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` };
}

function validateAndDecodeImage(imageInput) {
  if (!imageInput) throw Object.assign(new Error('تصویر ورودی محصول ارسال نشده است.'), { status: 400 });
  if (Buffer.isBuffer(imageInput)) {
    const info = validateImageBytes(imageInput);
    return { buffer: imageInput, mimeType: info.mimeType, dataUrl: `data:${info.mimeType};base64,${imageInput.toString('base64')}` };
  }
  if (typeof imageInput !== 'string') throw Object.assign(new Error('نوع ورودی تصویر پشتیبانی نمی‌شود.'), { status: 400 });
  const decoded = parseDataUrl(imageInput.trim());
  if (decoded) return decoded;
  if (/^(https?:\/\/|\/)/i.test(imageInput.trim())) {
    return { buffer: null, mimeType: 'image/jpeg', dataUrl: imageInput.trim(), isUrl: true };
  }
  throw Object.assign(new Error('فرمت تصویر نامعتبر است. فقط JPG، PNG و WebP پشتیبانی می‌شوند.'), { status: 400 });
}

function makeAspectRatio(aspectRatio) {
  const [w, h] = String(aspectRatio || '1:1').split(':').map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : { w: 1, h: 1 };
}

function shouldRetryWithNextModel(error) {
  const code = String(error?.errorCode || error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  if (/moderation|content.?policy|safety.?filter|prompt_required/.test(`${code} ${message}`)) return false;
  if (/popup_blocked|auth_window_closed|user_cancel|cancelled/.test(`${code} ${message}`)) return false;
  return true;
}

function isRateLimitOrModelOutage(error) {
  const status = Number(error?.status || error?.statusCode);
  const text = `${error?.errorCode || ''} ${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  return status === 429 || status === 503 || status === 504 || /rate.?limit|too many|quota|temporarily unavailable|model.*unavailable|upstream_(failed|timeout)|timed? ?out/.test(text);
}

async function imageResultToDataUrl(result) {
  const source = typeof result === 'string' ? result : (result?.src || result?.url || result?.dataUrl);
  if (typeof source !== 'string' || !source) return null;
  if (source.startsWith('data:image/')) return source;
  if (typeof fetch !== 'function') return null;
  const response = await fetch(source, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
  if (!response.ok) throw Object.assign(new Error(`خواندن خروجی Puter با خطای ${response.status} مواجه شد.`), { status: response.status });
  const blob = await response.blob();
  if (!blob.type || !blob.type.startsWith('image/')) throw new Error('مدل Puter خروجی تصویری معتبر برنگرداند.');
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!isValidImageBuffer(bytes)) throw new Error('خروجی مدل Puter فرمت تصویر معتبر ندارد.');
  return `data:${blob.type};base64,${bytes.toString('base64')}`;
}

function providerOption(model) {
  const source = String(model?.provider || '').toLowerCase();
  if (/openai/.test(source)) return 'openai';
  if (/xai|x-ai/.test(source)) return 'xai';
  if (/cloudflare/.test(source) || String(model?.id || '').startsWith('@cf/')) return 'cloudflare';
  if (/byteplus|bytedance/.test(source) || /seedream|dola-seedream/.test(model?.id || '')) return 'byteplus';
  if (/replicate|black forest|qwen|ideogram|leonardo|stability/.test(source)) return 'replicate';
  return '';
}

function modelOptions(model, { imageDataUrl, aspectRatio, quality = 'high' }) {
  const options = {
    model: model.id,
    input_images: [imageDataUrl],
    ratio: makeAspectRatio(aspectRatio)
  };
  const provider = providerOption(model);
  if (provider) options.provider = provider;

  if (provider === 'openai') {
    options.quality = quality === 'ultra' ? (model.id.includes('2.5') ? 'max' : 'high') : quality === 'standard' ? 'medium' : 'high';
  } else if (provider === 'xai') {
    options.quality = quality === 'standard' ? 'low' : 'auto';
    options.resolution = quality === 'ultra' ? '2k' : '1k';
  } else if (provider === 'byteplus') {
    options.quality = quality === 'ultra' ? '4K' : quality === 'standard' ? '1K' : '2K';
  } else if (model.id.includes('flux-2-pro') || model.id.includes('flux-2-klein') || model.id.includes('flux-schnell')) {
    options.output_megapixels = quality === 'ultra' ? '2' : quality === 'standard' ? '0.5' : '1';
  }
  return options;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('مهلت پاسخ این مدل تمام شد.'), { code: 'upstream_timeout', status: 504 })), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function generateWithPuterRotation({
  imageDataUrl,
  prompt,
  aspectRatio = '1:1',
  quality = 'high',
  preferredModel = DEFAULT_PROVIDER,
  puterClient = globalThis.puter,
  catalog = PUTER_IMAGE_MODELS
}) {
  if (!puterClient?.ai?.txt2img) {
    throw Object.assign(new Error('برای تولید تصویر، استودیوی Puter.js باید در مرورگر باز باشد و به حساب Puter وارد شوید.'), { status: 503, code: 'puter_client_unavailable' });
  }
  if (!imageDataUrl || typeof imageDataUrl !== 'string') throw Object.assign(new Error('تصویر مرجع محصول ارسال نشده است.'), { status: 400 });

  const queue = buildRotationQueue(preferredModel, catalog);
  if (!queue.length) throw Object.assign(new Error('در کاتالوگ Puter مدلی برای ویرایش عکس محصول در دسترس نیست.'), { status: 503 });
  const triedModels = [];
  let lastError = null;

  for (const model of queue) {
    triedModels.push(model.id);
    try {
      const rawResult = await withTimeout(
        puterClient.ai.txt2img(prompt, modelOptions(model, { imageDataUrl, aspectRatio, quality })),
        MODEL_TIMEOUT_MS
      );
      const dataUrl = await imageResultToDataUrl(rawResult);
      if (!dataUrl) throw new Error('مدل تصویر قابل استفاده‌ای برنگرداند.');
      if (dataUrl === imageDataUrl) throw Object.assign(new Error('مدل تصویر مرجع را بدون تغییر برگرداند.'), { code: 'unchanged_image' });
      const index = queue.findIndex(item => item.id === model.id);
      return {
        dataUrl,
        model: model.id,
        provider: `${model.name || model.id} · Puter.js`,
        fallbackUsed: index > 0,
        rotatedModels: triedModels,
        nextModelInRotation: queue[(index + 1) % queue.length]?.id || queue[0].id
      };
    } catch (error) {
      lastError = error;
      if (isRateLimitOrModelOutage(error)) markModelRateLimited(model.id);
      if (!shouldRetryWithNextModel(error)) throw error;
    }
  }

  throw Object.assign(
    new Error(`تمام مدل‌های سازگار Puter نتوانستند تصویر را بسازند. آخرین خطا: ${lastError?.message || 'بدون جزئیات'}`),
    { status: Number(lastError?.status) || 503, code: lastError?.code || 'puter_models_exhausted', cause: lastError, triedModels }
  );
}

async function checkBackendHealth() {
  const editableCount = PUTER_IMAGE_MODELS.filter(model => model.supportsImg2Img).length;
  return {
    connected: false,
    status: 'browser-session-required',
    url: DEFAULT_BACKEND_URL,
    engine: DEFAULT_PROVIDER,
    model: DEFAULT_PROVIDER,
    totalModels: PUTER_IMAGE_MODELS.length,
    editableModels: editableCount,
    name: PUTER_STUDIO_PROVIDER_NAME
  };
}

const checkComfyHealth = checkBackendHealth;

async function generateStudioPhoto({
  image,
  imageBytes,
  referenceImage,
  style = DEFAULT_PRESET,
  customPrompt = '',
  aspectRatio = '1:1',
  preservation = 'maximum',
  quality = 'high',
  provider = DEFAULT_PROVIDER,
  productType = 'shoe_or_bag',
  puterClient = globalThis.puter,
  allowMock = false
}) {
  // `allowMock` is accepted for compatibility, but the original upload is never a fake output.
  void allowMock;
  const decoded = validateAndDecodeImage(image || imageBytes);
  const ref = referenceImage && referenceImage !== image ? validateAndDecodeImage(referenceImage) : decoded;
  const imageDataUrl = ref.dataUrl || decoded.dataUrl;
  const prompt = [
    'Edit the supplied reference image; this is image-to-image product photography, not text-only generation.',
    buildPrompt({ style, customPrompt, preservation, aspectRatio, productType })
  ].join(' ');
  const result = await generateWithPuterRotation({
    imageDataUrl,
    prompt,
    aspectRatio,
    quality,
    preferredModel: provider || DEFAULT_PROVIDER,
    puterClient
  });
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['1:1'];
  return {
    success: true,
    generatedUrl: result.dataUrl,
    image: result.dataUrl,
    images: [result.dataUrl],
    originalUrl: decoded.dataUrl,
    style,
    styleTitle: PRESETS[style]?.title || style,
    aspectRatio,
    dimensions,
    preservation,
    quality,
    provider: result.provider,
    model: result.model,
    activeModel: result.model,
    rotatedModels: result.rotatedModels,
    nextModelInRotation: result.nextModelInRotation,
    fallbackUsed: result.fallbackUsed,
    pipeline: provider || DEFAULT_PROVIDER,
    promptUsed: prompt,
    negativePromptUsed: getNegativePrompt(),
    preservationGuarantee: 'پرامپت مدل برای حفظ شکل، رنگ، لوگو و دوخت کالای اصلی تنظیم شده است؛ نتیجه را پیش از انتشار بررسی کنید.',
    mode: 'puter-image-edit',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  PRESETS,
  DEFAULT_PRESET,
  PRESERVATION_RULES,
  ASPECT_RATIO_DIMENSIONS,
  PUTER_IMAGE_MODELS,
  PUTER_STUDIO_PROVIDER_NAME,
  SUPPORTED_PROVIDERS,
  SUPPORTED_PIPELINES,
  DEFAULT_PROVIDER,
  DEFAULT_PIPELINE: DEFAULT_PROVIDER,
  DEFAULT_BACKEND_URL,
  DEFAULT_COMFY_API_URL: DEFAULT_BACKEND_URL,
  MAX_IMAGE_BYTES,
  validateAndDecodeImage,
  validateImageBytes,
  parseDataUrl,
  checkBackendHealth,
  checkComfyHealth,
  buildRotationQueue,
  markModelRateLimited,
  isModelRateLimited,
  resetRotationState,
  getRotationCursor,
  generateStudioPhoto,
  generateWithPuterRotation
};

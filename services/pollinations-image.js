'use strict';

const DEFAULT_MODEL = 'flux';
const MODEL = DEFAULT_MODEL;

const SUPPORTED_MODELS = Object.freeze([
  'flux',
  'turbo'
]);

const DEFAULT_STYLE = 'warm-studio';
const SUPPORTED_STYLES = Object.freeze([
  'warm-studio',
  'dark-luxury',
  'natural-stone'
]);

const STYLE_PROMPTS = Object.freeze({
  'warm-studio': 'in an elegant warm neutral ecommerce studio setting, soft cream and beige background, gentle diffused studio lighting, centered clean pedestal, sharp focus on shoe materials, textures, and craftsmanship',
  'dark-luxury': 'in a luxury dark ecommerce studio setting, moody deep charcoal background, subtle edge reflections and rim lighting accentuating footwear contours, premium catalog presentation, sharp focus',
  'natural-stone': 'on a smooth natural limestone pedestal, crisp architectural daylight, minimalist organic textures, clean commercial shoe photography, sharp focus'
});

function promptFor(style = DEFAULT_STYLE, _unusedProductHint = '') {
  const chosenStyle = SUPPORTED_STYLES.includes(style) ? style : DEFAULT_STYLE;
  const styleDescription = STYLE_PROMPTS[chosenStyle];
  return `Professional ecommerce product photograph of the exact footwear shown in the reference image, ${styleDescription}. Single shoe in full clear view, centered composition, commercial advertising catalog standard, sharp details, photorealistic, 8k resolution.`;
}

function parseModel(model) {
  const m = String(model || '').trim().toLowerCase();
  return SUPPORTED_MODELS.includes(m) ? m : DEFAULT_MODEL;
}

function parseStyle(style) {
  const s = String(style || '').trim().toLowerCase();
  return SUPPORTED_STYLES.includes(s) ? s : DEFAULT_STYLE;
}

function buildPollinationsUrl({
  prompt,
  model = DEFAULT_MODEL,
  width = 1024,
  height = 1024,
  seed = null,
  nologo = true
} = {}) {
  const selectedModel = parseModel(model);
  const selectedSeed = seed !== null && seed !== undefined ? seed : Math.floor(Math.random() * 10000000);
  const base = process.env.POLLINATIONS_API_ORIGIN || 'https://image.pollinations.ai';
  const encodedPrompt = encodeURIComponent(String(prompt || '').trim());
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: selectedModel,
    nologo: nologo ? 'true' : 'false',
    seed: String(selectedSeed)
  });
  return `${base}/prompt/${encodedPrompt}?${params.toString()}`;
}

async function generateProductPhoto({
  imageBytes,
  dataUrl,
  style = DEFAULT_STYLE,
  model = DEFAULT_MODEL,
  seed = null,
  client = null
} = {}) {
  const selectedModel = parseModel(model);
  const selectedStyle = parseStyle(style);

  let inputImage = dataUrl;
  if (!inputImage && imageBytes) {
    const buf = Array.isArray(imageBytes) ? imageBytes[0] : imageBytes;
    if (Buffer.isBuffer(buf)) {
      inputImage = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  }

  if (!inputImage || typeof inputImage !== 'string') {
    throw Object.assign(new Error('برای ساخت تصویر با هوش مصنوعی، یک تصویر واضح از محصول لازم است.'), { status: 400 });
  }

  const prompt = promptFor(selectedStyle);
  const targetUrl = buildPollinationsUrl({
    prompt,
    model: selectedModel,
    seed
  });

  let outputDataUrl = '';

  // 1. If custom client or mock handler provided, use it
  if (client && typeof client.generate === 'function') {
    const res = await client.generate({ prompt, model: selectedModel, style: selectedStyle, url: targetUrl });
    outputDataUrl = typeof res === 'string' ? res : res?.dataUrl || '';
  } else {
    // 2. Fetch directly from Pollinations.ai endpoint
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/jpeg,image/png,image/*;q=0.9',
        'User-Agent': 'ToubaShoes-AI/1.0'
      }
    });

    if (!response.ok) {
      const err = new Error(`خطای سرویس تصویر (${response.status})`);
      err.status = response.status >= 400 ? response.status : 502;
      throw err;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new Error('پاسخ تصویر دریافت شده از هوش مصنوعی خالی بود.');
    }
    const mime = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';
    outputDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  }

  if (!outputDataUrl || typeof outputDataUrl !== 'string') {
    throw new Error('خروجی معتبری از هوش مصنوعی دریافت نشد.');
  }

  return {
    success: true,
    dataUrl: outputDataUrl,
    imageUrl: targetUrl,
    model: selectedModel,
    style: selectedStyle,
    provider: 'Pollinations.ai (FLUX / SDXL Turbo)',
    unlimited: true,
    keyless: true
  };
}

module.exports = {
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  DEFAULT_STYLE,
  SUPPORTED_STYLES,
  STYLE_PROMPTS,
  promptFor,
  parseModel,
  parseStyle,
  buildPollinationsUrl,
  generateProductPhoto
};

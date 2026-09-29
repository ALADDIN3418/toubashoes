'use strict';

let puterClient = null;
function getPuterClient() {
  if (!puterClient) {
    try {
      const { puter } = require('@heyputer/puter.js');
      puterClient = puter;
    } catch {
      puterClient = globalThis.puter || null;
    }
  }
  return puterClient;
}

const DEFAULT_MODEL = 'gpt-image-2.5-flare';
const MODEL = DEFAULT_MODEL;

const SUPPORTED_MODELS = Object.freeze([
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  'gpt-image-1.5'
]);

const DEFAULT_QUALITY = 'high';
const SUPPORTED_QUALITIES = Object.freeze([
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
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
  // Strictly product-focused ecommerce prompt matching the reference footwear image;
  // freeform user strings are excluded to prevent content moderation false positives.
  return `Professional ecommerce product photograph of the exact footwear shown in the reference image, ${styleDescription}. Single shoe in full clear view, centered composition, commercial advertising catalog standard, sharp details, photorealistic, 8k resolution.`;
}

function parseModel(model) {
  const m = String(model || '').trim().toLowerCase();
  return SUPPORTED_MODELS.includes(m) ? m : DEFAULT_MODEL;
}

function parseQuality(quality) {
  const q = String(quality || '').trim().toLowerCase();
  return SUPPORTED_QUALITIES.includes(q) ? q : DEFAULT_QUALITY;
}

function parseStyle(style) {
  const s = String(style || '').trim().toLowerCase();
  return SUPPORTED_STYLES.includes(s) ? s : DEFAULT_STYLE;
}

async function generateProductPhoto({
  imageBytes,
  dataUrl,
  style = DEFAULT_STYLE,
  model = DEFAULT_MODEL,
  quality = DEFAULT_QUALITY,
  testMode = false,
  client = null
} = {}) {
  const selectedModel = parseModel(model);
  const selectedQuality = parseQuality(quality);
  const selectedStyle = parseStyle(style);

  let inputImage = dataUrl;
  if (!inputImage && imageBytes) {
    const buf = Array.isArray(imageBytes) ? imageBytes[0] : imageBytes;
    if (Buffer.isBuffer(buf)) {
      inputImage = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  }

  if (!inputImage || typeof inputImage !== 'string') {
    throw Object.assign(new Error('برای ساخت تصویر با Puter GPT Image، یک تصویر واضح از محصول لازم است.'), { status: 400 });
  }

  const prompt = promptFor(selectedStyle);
  const puter = client || getPuterClient();

  if (!puter || !puter.ai || typeof puter.ai.txt2img !== 'function') {
    throw Object.assign(new Error('کتابخانهٔ Puter.js برای تولید تصویر در دسترس نیست.'), { status: 503 });
  }

  const options = {
    model: selectedModel,
    quality: selectedQuality,
    input_image: inputImage,
    test_mode: Boolean(testMode)
  };

  try {
    const result = await puter.ai.txt2img(prompt, options);
    let outputSrc = '';

    if (typeof result === 'string') {
      outputSrc = result;
    } else if (result && typeof result.src === 'string') {
      outputSrc = result.src;
    } else if (result && typeof result.toString === 'function') {
      outputSrc = result.toString();
    }

    if (!outputSrc || typeof outputSrc !== 'string') {
      throw new Error('خروجی معتبری از Puter GPT Image دریافت نشد.');
    }

    return {
      success: true,
      dataUrl: outputSrc,
      model: selectedModel,
      quality: selectedQuality,
      style: selectedStyle,
      provider: 'Puter.js (OpenAI GPT Image)',
      keyless: true
    };
  } catch (error) {
    const message = error?.message || error?.error?.message || 'خطا در ساخت تصویر با Puter GPT Image.';
    const status = Number(error?.status || error?.error?.status) || 502;
    const err = new Error(message);
    err.status = status;
    err.code = error?.code || error?.error?.code || 'PUTER_IMAGE_ERROR';
    throw err;
  }
}

module.exports = {
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  DEFAULT_QUALITY,
  SUPPORTED_QUALITIES,
  DEFAULT_STYLE,
  SUPPORTED_STYLES,
  STYLE_PROMPTS,
  promptFor,
  parseModel,
  parseQuality,
  parseStyle,
  generateProductPhoto,
  getPuterClient
};

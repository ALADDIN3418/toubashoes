'use strict';

let puterClient = null;
function getPuterClient() {
  if (!puterClient) {
    if (globalThis.puter && globalThis.puter.ai) {
      puterClient = globalThis.puter;
    } else {
      try {
        // CommonJS bundle works across all Node versions without ERR_REQUIRE_ESM
        const cjs = require('@heyputer/puter.js/dist/puter.cjs');
        puterClient = globalThis.puter || cjs?.puter || cjs?.default || cjs;
      } catch {
        try {
          const m = require('@heyputer/puter.js');
          puterClient = m?.puter || m?.default || m;
        } catch {
          puterClient = null;
        }
      }
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

async function callPuterDriverDirect({ prompt, model, quality, inputImage, testMode = false }) {
  const origin = process.env.PUTER_API_ORIGIN || 'https://api.puter.com';
  const response = await fetch(`${origin}/drivers/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'puter-js/1.0'
    },
    body: JSON.stringify({
      interface: 'puter-image-generation',
      driver: 'ai-image',
      test_mode: Boolean(testMode),
      method: 'generate',
      args: {
        model,
        quality,
        input_image: inputImage,
        prompt
      },
      auth_token: null
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const errorMsg = data?.error?.message || data?.message || `خطای سرویس Puter (${response.status})`;
    const err = new Error(errorMsg);
    err.status = response.status >= 400 ? response.status : 502;
    err.code = data?.error?.code || data?.code || 'PUTER_DRIVER_ERROR';
    throw err;
  }

  const result = data.result;
  let outputUrl = '';
  if (typeof result === 'string') {
    outputUrl = result;
  } else if (result && typeof result === 'object') {
    outputUrl = result.url || result.src || result.asset_url || result.href || '';
  }

  if (!outputUrl) {
    throw new Error('پاسخ دریافت شده از Puter شامل تصویر معتبر نبود.');
  }
  return outputUrl;
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
  const options = {
    model: selectedModel,
    quality: selectedQuality,
    input_image: inputImage,
    test_mode: Boolean(testMode)
  };

  let outputSrc = '';
  const puter = client || getPuterClient();

  // 1. If an explicit client or puter SDK with txt2img is available, try it
  if (puter && puter.ai && typeof puter.ai.txt2img === 'function') {
    try {
      const result = await puter.ai.txt2img(prompt, options);
      if (typeof result === 'string') {
        outputSrc = result;
      } else if (result && typeof result.src === 'string') {
        outputSrc = result.src;
      } else if (result && typeof result.toString === 'function') {
        outputSrc = result.toString();
      }
    } catch (sdkError) {
      if (client) throw sdkError;
      outputSrc = '';
    }
  }

  // 2. If SDK was not available or didn't produce output, use direct HTTP driver call
  if (!outputSrc) {
    try {
      outputSrc = await callPuterDriverDirect({
        prompt,
        model: selectedModel,
        quality: selectedQuality,
        inputImage,
        testMode
      });
    } catch (driverError) {
      const message = driverError?.message || 'خطا در ارتباط با سرویس Puter GPT Image.';
      const status = Number(driverError?.status) || 502;
      const err = new Error(message);
      err.status = status;
      err.code = driverError?.code || 'PUTER_IMAGE_ERROR';
      throw err;
    }
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
  callPuterDriverDirect,
  generateProductPhoto,
  getPuterClient
};

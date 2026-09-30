'use strict';

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

function promptFor(style = DEFAULT_STYLE) {
  const chosenStyle = SUPPORTED_STYLES.includes(style) ? style : DEFAULT_STYLE;
  const styleDescription = STYLE_PROMPTS[chosenStyle];
  // Explicitly direct GPT Image to preserve reference shoe details and exclude human feet/legs
  return `Professional commercial product catalog photography of the exact footwear shown in the reference image, ${styleDescription}. Maintain the exact footwear design, shape, silhouette, straps, studs, embellishments, colors, and textures from the reference photo. Single shoe product view only. No human feet, legs, or models. Crisp commercial advertising quality, sharp focus, 8k resolution.`;
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

/**
 * Intelligent Puter Token & API Credential Rotation Manager
 * Supports:
 *  1. Preconfigured token pools via PUTER_AUTH_TOKENS (comma-separated) or PUTER_AUTH_TOKEN
 *  2. Automatic detection of rate limits (429), quota exhaustion (402/403/credits), and expired tokens (401)
 *  3. Seamless zero-touch replacement across unexhausted credentials in the pool
 */
class PuterTokenManager {
  constructor(options = {}) {
    this.apiOrigin = options.apiOrigin || process.env.PUTER_API_ORIGIN || 'https://api.puter.com';
    this.configuredTokens = [];
    this.exhaustedTokens = new Set();
    this.activeToken = null;
    this.tokenIndex = 0;
    this.customFetch = options.fetchFn || null;

    this.reloadTokens(options.tokens);
  }

  get fetchFn() {
    return this.customFetch || globalThis.fetch;
  }

  reloadTokens(explicitTokens = null) {
    if (Array.isArray(explicitTokens)) {
      this.configuredTokens = explicitTokens.map(t => String(t || '').trim()).filter(Boolean);
    } else {
      const rawTokens = process.env.PUTER_AUTH_TOKENS || process.env.PUTER_AUTH_TOKEN || '';
      this.configuredTokens = rawTokens
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    }
    this.activeToken = this.configuredTokens[0] || null;
    this.tokenIndex = 0;
  }

  isLimitError(status, message = '') {
    const code = Number(status) || 0;
    if (code === 429 || code === 402 || code === 401 || code === 403) return true;
    const msg = String(message || '').toLowerCase();
    return (
      msg.includes('usage limit') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('quota') ||
      msg.includes('credit') ||
      msg.includes('payment required') ||
      msg.includes('missing authentication token') ||
      msg.includes('unauthorized') ||
      msg.includes('token expired') ||
      msg.includes('invalid token')
    );
  }

  markExhausted(token, reason = 'limited') {
    if (token) {
      this.exhaustedTokens.add(token);
    }
  }

  async getValidToken(forceRotate = false, reason = '') {
    if (forceRotate && this.activeToken) {
      this.markExhausted(this.activeToken, reason);
      this.activeToken = null;
    }

    // 1. Try unexhausted token from configured pool
    if (this.configuredTokens.length > 0) {
      for (let i = 0; i < this.configuredTokens.length; i++) {
        const candidate = this.configuredTokens[this.tokenIndex % this.configuredTokens.length];
        this.tokenIndex++;
        if (!this.exhaustedTokens.has(candidate)) {
          this.activeToken = candidate;
          return candidate;
        }
      }
    }

    return this.activeToken || null;
  }
}

// Global default instance for process-level reuse
const defaultTokenManager = new PuterTokenManager();

async function callPuterDriverWithRotation({
  prompt,
  model,
  quality,
  inputImage,
  testMode = false,
  authToken = null,
  tokenManager = defaultTokenManager,
  fetchFn = null,
  maxRetries = 3
}) {
  const origin = tokenManager.apiOrigin || process.env.PUTER_API_ORIGIN || 'https://api.puter.com';
  const execFetch = fetchFn || tokenManager.fetchFn;
  let currentToken = authToken || null;
  let attempts = 0;
  let lastError = null;

  while (attempts <= maxRetries) {
    if (!currentToken) {
      currentToken = await tokenManager.getValidToken(false);
    }

    if (!currentToken) {
      const err = new Error('برای پردازش تصویر از سمت سرور، توکن Puter در متغیرهای سرور یافت نشد. لطفاً در پنل ادمین مستقیماً از قابلیت ساخت تصویر در مرورگر استفاده کنید یا متغیر PUTER_AUTH_TOKEN را در تنظیمات Vercel قرار دهید.');
      err.status = 401;
      err.code = 'PUTER_AUTH_REQUIRED';
      throw err;
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ToubaShoes-AI/1.0'
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const body = JSON.stringify({
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
      auth_token: currentToken
    });

    try {
      const response = await execFetch(`${origin}/drivers/call`, {
        method: 'POST',
        headers,
        body
      });

      const data = await response.json().catch(() => ({}));
      const rawError = data?.error?.message || data?.message || '';

      if (!response.ok || data.success === false) {
        if (tokenManager.isLimitError(response.status, rawError)) {
          // Token quota or rate limit exceeded: auto-rotate immediately
          tokenManager.markExhausted(currentToken, `Status ${response.status}: ${rawError}`);
          attempts++;
          if (attempts <= maxRetries) {
            const nextToken = await tokenManager.getValidToken(true, `Status ${response.status}: ${rawError}`);
            if (nextToken && nextToken !== currentToken) {
              currentToken = nextToken;
              continue; // retry loop with newly rotated token
            }
          }
        }

        const err = new Error(rawError || `خطای سرویس Puter (${response.status})`);
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
        throw new Error('پاسخ دریافت شده از Puter GPT Image شامل تصویر معتبر نبود.');
      }

      return {
        outputUrl,
        usedToken: currentToken,
        rotated: attempts > 0
      };
    } catch (err) {
      lastError = err;
      if (tokenManager.isLimitError(err.status, err.message)) {
        tokenManager.markExhausted(currentToken, err.message);
        attempts++;
        if (attempts <= maxRetries) {
          const nextToken = await tokenManager.getValidToken(true, err.message);
          if (nextToken && nextToken !== currentToken) {
            currentToken = nextToken;
            continue;
          }
        }
      }
      throw err;
    }
  }

  throw lastError || new Error('تلاش‌های چرخش خودکار توکن به سقف مجاز رسید.');
}

async function generateProductPhoto({
  imageBytes,
  dataUrl,
  style = DEFAULT_STYLE,
  model = DEFAULT_MODEL,
  quality = DEFAULT_QUALITY,
  testMode = false,
  client = null,
  authToken = null,
  tokenManager = defaultTokenManager,
  fetchFn = null
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
    throw Object.assign(new Error('برای ساخت تصویر با GPT Image، یک تصویر واضح از محصول لازم است.'), { status: 400 });
  }

  const prompt = promptFor(selectedStyle);

  // 1. Custom mock client or test handler
  if (client && typeof client.generate === 'function') {
    const res = await client.generate({
      prompt,
      model: selectedModel,
      quality: selectedQuality,
      style: selectedStyle,
      inputImage,
      authToken
    });
    const outputSrc = typeof res === 'string' ? res : res?.dataUrl || res?.outputUrl || '';
    return {
      success: true,
      dataUrl: outputSrc,
      model: selectedModel,
      quality: selectedQuality,
      style: selectedStyle,
      provider: 'Puter.js (OpenAI GPT Image)',
      rotated: Boolean(res?.rotated),
      keyless: true
    };
  }

  // 2. Puter Driver with automatic API/token rotation
  const driverResult = await callPuterDriverWithRotation({
    prompt,
    model: selectedModel,
    quality: selectedQuality,
    inputImage,
    testMode,
    authToken,
    tokenManager,
    fetchFn
  });

  return {
    success: true,
    dataUrl: driverResult.outputUrl,
    model: selectedModel,
    quality: selectedQuality,
    style: selectedStyle,
    provider: 'Puter.js (OpenAI GPT Image)',
    rotated: driverResult.rotated,
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
  PuterTokenManager,
  defaultTokenManager,
  callPuterDriverWithRotation,
  generateProductPhoto
};

'use strict';

const DEFAULT_MODEL = 'gpt-image-2.5-flare';
const MODEL = DEFAULT_MODEL;

const SUPPORTED_MODELS = Object.freeze([
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1'
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
  // Strictly direct GPT Image to preserve reference shoe details and exclude human feet/legs
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
 * Intelligent GPT Image API Key & Credential Rotation Manager
 * Supports:
 *  1. Multi-key pool via OPENAI_API_KEYS / GPT_IMAGE_API_KEYS (comma or newline separated)
 *  2. Single key via OPENAI_API_KEY / GPT_IMAGE_API_KEY
 *  3. Dynamic client-supplied keys from localStorage
 *  4. Automatic rotation across keys on rate limits (429) or quota exhaustion (insufficient_quota)
 */
class GptImageKeyManager {
  constructor(options = {}) {
    this.apiBase = options.apiBase || process.env.OPENAI_BASE_URL || process.env.GPT_IMAGE_BASE_URL || 'https://api.openai.com/v1';
    this.configuredKeys = [];
    this.exhaustedKeys = new Set();
    this.activeKey = null;
    this.keyIndex = 0;
    this.customFetch = options.fetchFn || null;

    this.reloadKeys(options.keys);
  }

  get fetchFn() {
    return this.customFetch || globalThis.fetch;
  }

  reloadKeys(explicitKeys = null) {
    if (Array.isArray(explicitKeys)) {
      this.configuredKeys = explicitKeys.map(k => String(k || '').trim()).filter(Boolean);
    } else if (typeof explicitKeys === 'string') {
      this.configuredKeys = explicitKeys.split(/[\r\n,]+/).map(k => k.trim()).filter(Boolean);
    } else {
      const raw = process.env.OPENAI_API_KEYS || process.env.GPT_IMAGE_API_KEYS || process.env.OPENAI_API_KEY || process.env.GPT_IMAGE_API_KEY || '';
      this.configuredKeys = raw.split(/[\r\n,]+/).map(k => k.trim()).filter(Boolean);
    }
    this.activeKey = this.configuredKeys[0] || null;
    this.keyIndex = 0;
  }

  isLimitError(status, message = '') {
    const code = Number(status) || 0;
    if (code === 429 || code === 402 || code === 401 || code === 403) return true;
    const msg = String(message || '').toLowerCase();
    return (
      msg.includes('insufficient_quota') ||
      msg.includes('rate_limit') ||
      msg.includes('quota') ||
      msg.includes('exceeded') ||
      msg.includes('too many requests') ||
      msg.includes('credit') ||
      msg.includes('unauthorized') ||
      msg.includes('invalid_api_key')
    );
  }

  markExhausted(key, reason = 'limited') {
    if (key) {
      this.exhaustedKeys.add(key);
    }
  }

  async getValidKey(forceRotate = false, reason = '') {
    if (forceRotate && this.activeKey) {
      this.markExhausted(this.activeKey, reason);
      this.activeKey = null;
    }

    if (this.configuredKeys.length > 0) {
      for (let i = 0; i < this.configuredKeys.length; i++) {
        const candidate = this.configuredKeys[this.keyIndex % this.configuredKeys.length];
        this.keyIndex++;
        if (!this.exhaustedKeys.has(candidate)) {
          this.activeKey = candidate;
          return candidate;
        }
      }
    }

    return this.activeKey || null;
  }
}

// Global default instance for process-level reuse
const defaultKeyManager = new GptImageKeyManager();

async function callGptImageEditsWithRotation({
  prompt,
  model = DEFAULT_MODEL,
  quality = DEFAULT_QUALITY,
  inputBuffer,
  apiKey = null,
  apiBase = null,
  keyManager = defaultKeyManager,
  fetchFn = null,
  maxRetries = 3
}) {
  const base = apiBase || keyManager.apiBase || 'https://api.openai.com/v1';
  const execFetch = fetchFn || keyManager.fetchFn;
  let currentKey = apiKey || null;
  let attempts = 0;
  let lastError = null;

  while (attempts <= maxRetries) {
    if (!currentKey) {
      currentKey = await keyManager.getValidKey(false);
    }

    if (!currentKey) {
      const err = new Error('کلید API برای مدل GPT Image تنظیم نشده است. لطفاً در پنل ادمین بخش «تنظیمات کلیدهای API (GPT Image)» کلید خود را وارد کنید یا متغیر OPENAI_API_KEY را در تنظیمات Vercel قرار دهید.');
      err.status = 401;
      err.code = 'GPT_IMAGE_KEY_REQUIRED';
      throw err;
    }

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    if (quality) form.append('quality', quality);
    form.append('response_format', 'b64_json');
    if (inputBuffer) {
      form.append('image', new Blob([inputBuffer], { type: 'image/jpeg' }), 'reference-shoe.jpg');
    }

    try {
      const response = await execFetch(`${base}/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentKey}`
        },
        body: form
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        const rawError = data?.error?.message || data?.message || '';
        if (keyManager.isLimitError(response.status, rawError)) {
          keyManager.markExhausted(currentKey, `Status ${response.status}: ${rawError}`);
          attempts++;
          if (attempts <= maxRetries) {
            const nextKey = await keyManager.getValidKey(true, `Status ${response.status}: ${rawError}`);
            if (nextKey && nextKey !== currentKey) {
              currentKey = nextKey;
              continue;
            }
          }
        }

        const err = new Error(rawError || `خطای سرویس GPT Image (${response.status})`);
        err.status = response.status >= 400 ? response.status : 502;
        err.code = data?.error?.code || 'GPT_IMAGE_ERROR';
        throw err;
      }

      const item = data.data?.[0];
      let outputDataUrl = '';
      if (item?.b64_json) {
        outputDataUrl = `data:image/jpeg;base64,${item.b64_json}`;
      } else if (item?.url) {
        outputDataUrl = item.url;
      }

      if (!outputDataUrl) {
        throw new Error('پاسخ دریافت شده از مدل GPT Image فاقد دادهٔ تصویر معتبر بود.');
      }

      return {
        outputUrl: outputDataUrl,
        usedKey: currentKey,
        rotated: attempts > 0
      };
    } catch (err) {
      lastError = err;
      if (keyManager.isLimitError(err.status, err.message)) {
        keyManager.markExhausted(currentKey, err.message);
        attempts++;
        if (attempts <= maxRetries) {
          const nextKey = await keyManager.getValidKey(true, err.message);
          if (nextKey && nextKey !== currentKey) {
            currentKey = nextKey;
            continue;
          }
        }
      }
      throw err;
    }
  }

  throw lastError || new Error('تلاش‌های چرخش خودکار کلیدهای GPT Image به سقف مجاز رسید.');
}

async function generateProductPhoto({
  imageBytes,
  dataUrl,
  style = DEFAULT_STYLE,
  model = DEFAULT_MODEL,
  quality = DEFAULT_QUALITY,
  client = null,
  apiKey = null,
  apiBase = null,
  keyManager = defaultKeyManager,
  fetchFn = null
} = {}) {
  const selectedModel = parseModel(model);
  const selectedQuality = parseQuality(quality);
  const selectedStyle = parseStyle(style);

  let inputBuffer = null;
  if (Buffer.isBuffer(imageBytes)) {
    inputBuffer = imageBytes;
  } else if (Array.isArray(imageBytes) && Buffer.isBuffer(imageBytes[0])) {
    inputBuffer = imageBytes[0];
  } else if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
    const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
    inputBuffer = Buffer.from(base64Data, 'base64');
  }

  if (!inputBuffer) {
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
      inputBuffer,
      apiKey
    });
    const outputSrc = typeof res === 'string' ? res : res?.dataUrl || res?.outputUrl || '';
    return {
      success: true,
      dataUrl: outputSrc,
      model: selectedModel,
      quality: selectedQuality,
      style: selectedStyle,
      provider: 'GPT Image (OpenAI / Rotating Pool)',
      rotated: Boolean(res?.rotated),
      keyless: false
    };
  }

  // 2. OpenAI GPT Image edits with automatic credential rotation
  const result = await callGptImageEditsWithRotation({
    prompt,
    model: selectedModel,
    quality: selectedQuality,
    inputBuffer,
    apiKey,
    apiBase,
    keyManager,
    fetchFn
  });

  return {
    success: true,
    dataUrl: result.outputUrl,
    model: selectedModel,
    quality: selectedQuality,
    style: selectedStyle,
    provider: 'GPT Image (OpenAI / Rotating Pool)',
    rotated: result.rotated,
    keyless: false
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
  GptImageKeyManager,
  defaultKeyManager,
  callGptImageEditsWithRotation,
  generateProductPhoto
};

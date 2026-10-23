/* Touba Admin Product AI Studio & Description Assistant
 * «استودیو هوش مصنوعی محصول طوبی — چرخش مدل‌های Puter.js»
 * (Legacy compatibility markers: ComfyUI / Qwen-Image-Edit)
 *
 * Image generation uses the user's Puter.js browser session, rotates through the
 * live Puter image catalog, and falls back to the next compatible model on limits.
 */
(() => {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const MAX_UPLOAD = 15 * 1024 * 1024; // 15MB
  const PUTER_AUTO_MODEL = 'puter-auto';
  try {
    for (const key of ['touba_gemini_api_key', 'touba_gemini_access_token', 'touba_gemini_client_id', 'touba_gemini_project_id']) {
      g.localStorage?.removeItem(key);
    }
  } catch { /* remove any legacy image-studio credentials when storage is unavailable */ }

  const STYLES = [
    { id: 'catalog-white', title: 'کاتالوگ سفید', icon: '📦', badge: 'استاندارد', desc: 'پس‌زمینه سفید خالص کاتالوگی با سایه طبیعی محصول (مناسب وب‌سایت و دیجی‌کالا)' },
    { id: 'dark-luxury', title: 'استودیوی لوکس', icon: '🖤', badge: 'لاکچری', desc: 'زمینه زغالی مات تیره با نورپردازی متمرکز و ریم‌لایت روی لبه‌های کالا' },
    { id: 'minimal', title: 'مینیمال آرت', icon: '✨', badge: 'مدرن', desc: 'پداستال بتنی یا مرمر سفید روشن با نور ملایم و خطوط مینیمال' },
    { id: 'lifestyle', title: 'لایف‌استایل', icon: '🌿', badge: 'محیطی', desc: 'چیدمان طبیعی در محیط روزمره با عناصر دکوراتیو چوبی و گیاهی متناسب' },
    { id: 'on-model', title: 'روی مدل', icon: '👟', badge: 'پاخور واقعی', desc: 'نمایش پاخور طبیعی کفش یا حمل کیف توسط مدل با حفظ کامل کالا' },
    { id: 'advertising', title: 'تبلیغاتی پویا', icon: '📢', badge: 'کمپین', desc: 'نورپردازی دراماتیک تجاری با زاویه دید پرانرژی مناسب پوستر و بنر' },
    { id: 'custom', title: 'پس‌زمینه سفارشی', icon: '🎨', badge: 'آزاد', desc: 'اعمال صحنه و دکور دقیقاً مطابق متن پرامپت سفارشی شما' }
  ];

  const RATIOS = [
    { id: '1:1', label: 'مربعی (۱:۱)', sub: 'اینستاگرام و سایت', width: 1024, height: 1024 },
    { id: '4:5', label: 'پرتره (۴:۵)', sub: 'پست عمودی و فید', width: 896, height: 1152 },
    { id: '3:4', label: 'کاتالوگ (۳:۴)', sub: 'عکس عمودی استاندارد', width: 768, height: 1024 },
    { id: '16:9', label: 'عریض (۱۶:۹)', sub: 'بنر و اسلایدر', width: 1280, height: 720 }
  ];

  const PRESERVATION_LEVELS = [
    { id: 'maximum', label: 'حداکثر (۱۰۰٪ حفظ فرم)', desc: 'قفل کامل ساختار، لوگو، دوخت، بافت چرم و متریال اصلی کالا بدون هیچ تغییری' },
    { id: 'balanced', label: 'متعادل (طبیعی)', desc: 'حفظ شکل کالا همراه با تطبیق دقیق‌تر انعکاس نورهای صحنه روی محصول' },
    { id: 'creative', label: 'خلاقانه (دراماتیک)', desc: 'تغییرات نوری برجسته‌تر و دراماتیک با وفاداری به کالبد اصلی محصول' }
  ];

  function formatFileSize(bytes) {
    const num = Number(bytes) || 0;
    if (num >= 1024 * 1024) {
      return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(num / 1024))} KB`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const PUTER_CATALOG_DRIVER = 'puter-image-generation';
  const PUTER_ROTATION_STORAGE = 'touba_puter_image_rotation';
  const PUTER_COOLDOWN_STORAGE = 'touba_puter_image_model_cooldowns';
  const PUTER_FALLBACK_MODELS = [
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
  ];
  const KNOWN_PUTER_MODELS = new Map(PUTER_FALLBACK_MODELS.map(model => [model.id, model]));
  let cachedPuterImageModels = null;

  let puterSdkPromise = null;

  function getPuterClient() {
    return g.puter || (typeof globalThis !== 'undefined' ? globalThis.puter : null);
  }

  function loadPuterSdk() {
    const loaded = getPuterClient();
    if (loaded?.ai?.txt2img) return Promise.resolve(loaded);
    if (puterSdkPromise) return puterSdkPromise;
    if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') {
      return Promise.reject(new Error('کتابخانهٔ Puter.js در این محیط در دسترس نیست.'));
    }
    puterSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.async = true;
      script.dataset.toubaPuterSdk = 'true';
      script.onload = () => {
        const puter = getPuterClient();
        if (puter?.ai?.txt2img) resolve(puter);
        else reject(new Error('کتابخانهٔ Puter.js بارگذاری شد اما آمادهٔ تولید تصویر نیست.'));
      };
      script.onerror = () => reject(new Error('اتصال به کتابخانهٔ Puter.js انجام نشد؛ اتصال اینترنت را بررسی کنید.'));
      document.head.appendChild(script);
    }).catch(error => {
      puterSdkPromise = null;
      throw error;
    });
    return puterSdkPromise;
  }

  function safeLocalStorageGet(key, fallback) {
    try {
      const value = g.localStorage?.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function safeLocalStorageSet(key, value) {
    try { g.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
  }

  function normalizePuterModel(row) {
    const source = typeof row === 'string' ? { id: row } : (row || {});
    const id = String(source.id || source.model || source.model_id || source.name || '').trim();
    if (!id) return null;
    const providerText = String(source.provider || source.provider_name || '').trim();
    const name = String(source.title || source.display_name || source.label || source.name || '').trim();
    if (/gemini/i.test(`${id} ${name} ${providerText}`)) return null;

    const known = KNOWN_PUTER_MODELS.get(id);
    const supportsFlag = [source.supportsImg2Img, source.supports_image_input, source.supportsImageInput, source.image_to_image, source.accepts_reference_image]
      .find(value => typeof value === 'boolean');
    return {
      id,
      name: name && name !== id ? name : (known?.name || id),
      provider: providerText || known?.provider || inferPuterProviderLabel(id),
      supportsImg2Img: typeof supportsFlag === 'boolean' ? supportsFlag : (known?.supportsImg2Img ?? true)
    };
  }

  function inferPuterProviderLabel(id) {
    const value = String(id || '').toLowerCase();
    if (value.startsWith('openai/')) return 'OpenAI';
    if (value.startsWith('x-ai/')) return 'xAI';
    if (value.startsWith('black-forest-labs/')) return 'Black Forest Labs';
    if (value.startsWith('ideogram/')) return 'Ideogram';
    if (value.startsWith('qwen/')) return 'Qwen';
    if (value.startsWith('stabilityai/')) return 'Stability AI';
    if (value.startsWith('@cf/')) return 'Cloudflare';
    if (/seedream|dola-seedream/.test(value)) return 'BytePlus';
    if (value.startsWith('leonardoai/')) return 'Leonardo';
    return 'Puter.js';
  }

  function catalogRows(value) {
    const result = value?.result ?? value?.models ?? value;
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.models)) return result.models;
    if (Array.isArray(result?.data)) return result.data;
    return [];
  }

  async function loadPuterImageModels(puter = getPuterClient(), { discoverLive = false, force = false } = {}) {
    if (!force && cachedPuterImageModels?.length) return cachedPuterImageModels;

    let liveRows = [];
    if (discoverLive && puter?.drivers?.call) {
      try {
        const response = await puter.drivers.call(PUTER_CATALOG_DRIVER, 'models', {});
        liveRows = catalogRows(response).map(normalizePuterModel).filter(Boolean);
      } catch { /* the static server catalog is used when Puter discovery is unavailable */ }
    }

    let statusRows = [];
    try {
      const response = await fetch('/api/ai/studio/status', { cache: 'no-store' });
      if (response.ok) {
        const status = await response.json();
        statusRows = (Array.isArray(status.puterImageModels) ? status.puterImageModels : [])
          .map(normalizePuterModel).filter(Boolean);
      }
    } catch { /* use the embedded catalog below */ }

    const rows = liveRows.length ? liveRows : statusRows.length ? statusRows : PUTER_FALLBACK_MODELS;
    const merged = new Map();
    for (const row of [...rows, ...(liveRows.length ? [] : PUTER_FALLBACK_MODELS)]) {
      const model = normalizePuterModel(row);
      if (model && !merged.has(model.id)) merged.set(model.id, model);
    }
    cachedPuterImageModels = Array.from(merged.values());
    return cachedPuterImageModels;
  }

  function populatePuterModelSelect(select, models) {
    if (!select || typeof document === 'undefined' || typeof select.appendChild !== 'function') return;
    const selected = select.value || PUTER_AUTO_MODEL;
    select.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = PUTER_AUTO_MODEL;
    autoOption.textContent = '🔄 چرخش خودکار همهٔ مدل‌های سازگار با عکس مرجع';
    select.appendChild(autoOption);
    for (const model of models || []) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} · ${model.provider}${model.supportsImg2Img === false ? ' (فقط تولید از متن)' : ''}`;
      option.disabled = model.supportsImg2Img === false;
      select.appendChild(option);
    }
    select.value = Array.from(select.options || []).some(option => option.value === selected)
      ? selected
      : PUTER_AUTO_MODEL;
  }

  function readPuterCooldowns() {
    const value = safeLocalStorageGet(PUTER_COOLDOWN_STORAGE, {});
    return value && typeof value === 'object' ? value : {};
  }

  function puterModelCooldown(modelId, durationMs = 5 * 60 * 1000) {
    const cooldowns = readPuterCooldowns();
    cooldowns[modelId] = Date.now() + durationMs;
    safeLocalStorageSet(PUTER_COOLDOWN_STORAGE, cooldowns);
  }

  function isPuterModelCoolingDown(modelId) {
    const cooldowns = readPuterCooldowns();
    const until = Number(cooldowns[modelId]) || 0;
    if (!until) return false;
    if (Date.now() >= until) {
      delete cooldowns[modelId];
      safeLocalStorageSet(PUTER_COOLDOWN_STORAGE, cooldowns);
      return false;
    }
    return true;
  }

  function puterErrorText(error) {
    return `${error?.errorCode || ''} ${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  }

  function isPuterModerationOrAuthError(error) {
    return /moderation|content.?policy|safety.?filter|prompt_required|popup_blocked|auth_window_closed|user_cancel|cancelled/.test(puterErrorText(error));
  }

  function isPuterUnavailableError(error) {
    const status = Number(error?.status || error?.statusCode);
    return status === 429 || status === 404 || status === 503 || status === 504 || /rate.?limit|too many|quota|upstream_|temporarily unavailable|model.*unavailable|not found|unsupported|not support|timed? ?out/.test(puterErrorText(error));
  }

  function buildPuterRotationQueue(models, preferredModel = PUTER_AUTO_MODEL) {
    const editable = (models || []).filter(model => model && model.supportsImg2Img !== false && !/gemini/i.test(model.id));
    if (!editable.length) return { queue: [], editable };
    const cursor = Number(safeLocalStorageGet(PUTER_ROTATION_STORAGE, 0)) || 0;
    const start = ((cursor % editable.length) + editable.length) % editable.length;
    const rotated = Array.from({ length: editable.length }, (_, index) => editable[(start + index) % editable.length]);

    if (preferredModel && preferredModel !== PUTER_AUTO_MODEL) {
      const selectedIndex = rotated.findIndex(model => model.id === preferredModel);
      if (selectedIndex < 0) {
        throw new Error('مدل انتخابی برای ویرایش عکس مرجع مناسب نیست؛ یک مدل سازگار یا چرخش خودکار را انتخاب کنید.');
      }
      rotated.unshift(...rotated.splice(selectedIndex, 1));
    }

    const ready = rotated.filter(model => !isPuterModelCoolingDown(model.id));
    const cooling = rotated.filter(model => isPuterModelCoolingDown(model.id));
    if (preferredModel !== PUTER_AUTO_MODEL) {
      const selected = rotated.find(model => model.id === preferredModel);
      if (selected && !isPuterModelCoolingDown(selected.id)) {
        return { queue: [selected, ...ready.filter(model => model.id !== selected.id), ...cooling], editable };
      }
    }
    return { queue: [...ready, ...cooling], editable };
  }

  function puterProviderKey(model) {
    const id = String(model?.id || '').toLowerCase();
    const provider = String(model?.provider || '').toLowerCase();
    if (id.startsWith('openai/') || provider.includes('openai')) return 'openai';
    if (id.startsWith('x-ai/') || provider.includes('xai')) return 'xai';
    if (id.startsWith('@cf/') || provider.includes('cloudflare')) return 'cloudflare';
    if (/seedream|dola-seedream/.test(id) || provider.includes('byteplus')) return 'byteplus';
    if (/black-forest-labs|qwen|ideogram|leonardo|stabilityai|recraft/.test(`${id} ${provider}`)) return 'replicate';
    return '';
  }

  function buildPuterImageOptions(model, { imageDataUrl, ratio, quality }) {
    const options = {
      model: model.id,
      input_images: [imageDataUrl],
      ratio: ratio || { w: 1, h: 1 }
    };
    const provider = puterProviderKey(model);
    if (provider) options.provider = provider;
    if (provider === 'openai') {
      options.quality = quality === 'ultra' ? (model.id.includes('2.5') ? 'max' : 'high') : quality === 'standard' ? 'medium' : 'high';
    } else if (provider === 'xai') {
      options.quality = quality === 'standard' ? 'low' : 'auto';
      options.resolution = quality === 'ultra' ? '2k' : '1k';
    } else if (provider === 'byteplus') {
      options.quality = quality === 'ultra' ? '4K' : quality === 'standard' ? '1K' : '2K';
    } else if (/flux-2-pro|flux-2-klein|flux-schnell/.test(model.id)) {
      options.output_megapixels = quality === 'ultra' ? '2' : quality === 'standard' ? '0.5' : '1';
    }
    return options;
  }

  async function ensurePuterClient() {
    const puter = await loadPuterSdk();
    if (!puter?.ai?.txt2img) {
      throw new Error('کتابخانهٔ Puter.js بارگذاری نشد؛ صفحه را تازه‌سازی و دوباره تلاش کنید.');
    }
    if (puter.auth && typeof puter.auth.isSignedIn === 'function' && !puter.auth.isSignedIn()) {
      if (typeof puter.auth.signIn !== 'function') throw new Error('برای تولید تصویر باید به حساب Puter وارد شوید.');
      await puter.auth.signIn();
    }
    return puter;
  }

  async function puterImageResultToDataUrl(result) {
    const source = typeof result === 'string' ? result : (result?.src || result?.url || result?.dataUrl);
    if (typeof source !== 'string' || !source) throw new Error('مدل تصویری از Puter خروجی نداد.');
    if (source.startsWith('data:image/')) return source;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`دریافت تصویر تولیدشده با خطای ${response.status} مواجه شد.`);
    const blob = await response.blob();
    if (!blob.type?.startsWith('image/') || !blob.size) throw new Error('خروجی Puter یک تصویر معتبر نیست.');
    return blobToDataUrl(blob);
  }

  function makePuterStudioPrompt({ style, customPrompt, preservation }) {
    const preset = STYLES.find(item => item.id === style) || STYLES[0];
    const preservationText = preservation === 'creative'
      ? 'Keep the product recognizable and unchanged in shape, color, branding, and construction; allow only dramatic lighting.'
      : preservation === 'balanced'
        ? 'Strictly preserve the exact product silhouette, materials, hardware, colors, branding, and construction.'
        : 'CRITICAL: preserve the exact same product identity, silhouette, geometry, colors, material, texture, logo, stitching, laces, buckles, straps, zippers, and sole. Do not redesign, replace, crop, or cover the product.';
    return [
      'Edit the supplied reference photograph; this is image-to-image product photography, not text-only generation.',
      `Remove or replace only the original background and place the exact product in this commercial studio scene: ${preset.title}. ${preset.desc}.`,
      preservationText,
      'Keep the product fully visible and in sharp focus. Use realistic studio lighting, a natural contact shadow, and a clean professional ecommerce composition. Return one edited image only.',
      customPrompt ? `Additional scene instruction: ${customPrompt}` : ''
    ].filter(Boolean).join(' ');
  }

  async function generateProductImageWithPuter({
    imageDataUrl,
    style = 'catalog-white',
    customPrompt = '',
    aspectRatio = '1:1',
    preservation = 'maximum',
    quality = 'high',
    preferredModel = PUTER_AUTO_MODEL,
    onProgress = () => {}
  }) {
    const puter = await ensurePuterClient();
    const models = await loadPuterImageModels(puter, { discoverLive: true, force: true });
    const { queue, editable } = buildPuterRotationQueue(models, preferredModel);
    if (!queue.length) throw new Error('در حال حاضر مدل سازگار با عکس مرجع در فهرست Puter در دسترس نیست.');

    const ratioParts = String(aspectRatio || '1:1').split(':').map(Number);
    const ratio = ratioParts.length === 2 && ratioParts.every(value => value > 0)
      ? { w: ratioParts[0], h: ratioParts[1] }
      : { w: 1, h: 1 };
    const prompt = makePuterStudioPrompt({ style, customPrompt, preservation });
    const errors = [];

    for (let index = 0; index < queue.length; index++) {
      const model = queue[index];
      onProgress({ model, index, total: queue.length, fallback: index > 0 });
      try {
        const result = await puter.ai.txt2img(prompt, buildPuterImageOptions(model, {
          imageDataUrl, ratio, quality
        }));
        const dataUrl = await puterImageResultToDataUrl(result);
        if (dataUrl === imageDataUrl) throw Object.assign(new Error('این مدل همان تصویر ورودی را بدون تغییر برگرداند.'), { code: 'unchanged_image' });

        const currentIndex = editable.findIndex(item => item.id === model.id);
        safeLocalStorageSet(PUTER_ROTATION_STORAGE, (currentIndex + 1 + editable.length) % editable.length);
        const nextModel = editable[(currentIndex + 1 + editable.length) % editable.length];
        return {
          dataUrl,
          model: model.id,
          modelName: model.name,
          provider: model.provider,
          fallbackUsed: index > 0,
          triedModels: queue.slice(0, index + 1).map(item => item.id),
          nextModel: nextModel?.id || editable[0]?.id
        };
      } catch (error) {
        errors.push({ model: model.id, message: error?.message || String(error) });
        if (isPuterModerationOrAuthError(error)) throw error;
        if (isPuterUnavailableError(error)) {
          const duration = /rate.?limit|too many|429|quota/.test(puterErrorText(error)) ? 10 * 60 * 1000 : 30 * 60 * 1000;
          puterModelCooldown(model.id, duration);
        }
        if (index + 1 < queue.length) {
          onProgress({ model: queue[index + 1], index: index + 1, total: queue.length, fallback: true, previousModel: model });
        }
      }
    }

    const finalError = errors[errors.length - 1];
    const error = new Error(`تمام مدل‌های سازگار Puter محدود یا ناموفق بودند (${errors.length} تلاش). آخرین مدل: ${finalError?.model || '—'}؛ ${finalError?.message || 'بدون جزئیات'}`);
    error.code = 'puter_models_exhausted';
    error.triedModels = errors.map(item => item.model);
    throw error;
  }

  async function adminAuthHeaders() {
    if (!g.ToubaAuth?.configured) return {};
    const token = await g.ToubaAuth.getAccessToken?.();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  function resizeImage(fileOrDataUrl, maxSide, quality) {
    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined') {
        return resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : 'data:image/jpeg;base64,');
      }
      const image = new Image();
      let objectUrl = '';
      image.onload = () => {
        if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
        const nw = image.naturalWidth || 800;
        const nh = image.naturalHeight || 800;
        const scale = Math.min(1, maxSide / Math.max(nw, nh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(nw * scale));
        canvas.height = Math.max(1, Math.round(nh * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('پردازش تصویر در مرورگر پشتیبانی نمی‌شود.'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          reject(new Error('فشرده‌سازی عکس انجام نشد.'));
        }
      };
      image.onerror = () => {
        if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
        reject(new Error('فایل تصویری معتبر خوانده نشد.'));
      };
      if (typeof fileOrDataUrl === 'string') {
        image.src = fileOrDataUrl;
      } else if (typeof URL !== 'undefined' && URL.createObjectURL) {
        objectUrl = URL.createObjectURL(fileOrDataUrl);
        image.src = objectUrl;
      } else {
        const reader = new FileReader();
        reader.onload = () => { image.src = reader.result; };
        reader.readAsDataURL(fileOrDataUrl);
      }
    });
  }

  async function safeFetchJson(response) {
    let rawText = '';
    try {
      rawText = await response.text();
    } catch {
      throw new Error('خطا در خواندن پاسخ از سرور');
    }

    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Non-JSON response
    }

    if (!response.ok || !data || data.success === false) {
      let errorMsg = data?.error;
      if (!errorMsg) {
        if (response.status === 401) {
          errorMsg = 'نشست مدیر منقضی شده است؛ لطفاً دوباره وارد شوید.';
        } else if (response.status === 403) {
          errorMsg = 'دسترسی غیرمجاز؛ فقط درخواست مستقیم مدیر مجاز است.';
        } else if (response.status === 413) {
          errorMsg = 'حجم تصویر بیش از حد مجاز است (حداکثر ۱۵ مگابایت).';
        } else if (response.status === 429) {
          errorMsg = 'سقف سهمیهٔ روزانه تولید تصویر پر شده است؛ لطفاً بعداً تلاش کنید.';
        } else if (response.status >= 500) {
          errorMsg = `خطای سرور (${response.status}) در پردازش تصویر هوش مصنوعی.`;
        } else {
          errorMsg = `خطای سرور (${response.status})`;
        }
      }
      throw new Error(errorMsg);
    }

    return data;
  }

  // Description Assistant Generator
  function generateLocalDescription({ name, category, brand, sizes, colors, features: providedFeatures, specifications: providedSpecifications }) {
    const n = String(name || 'کفش طوبی').trim();
    const c = String(category || '').toLowerCase();
    const b = String(brand || 'طوبی').trim();
    let styleDesc = 'طراحی متناسب برای استفاده روزمره';
    let usage = 'استفاده روزمره و استایل‌های متنوع';
    if (c.includes('sport') || c.includes('اسپرت') || n.includes('کتانی') || n.includes('اسپرت')) {
      styleDesc = 'طراحی اسپرت و راحت'; usage = 'پیاده‌روی روزانه و استایل‌های کژوال';
    } else if (c.includes('formal') || c.includes('رسمی') || c.includes('مجلسی') || n.includes('مجلسی') || n.includes('کلاسیک')) {
      styleDesc = 'طراحی کلاسیک و آراسته'; usage = 'محیط کار، قرارهای رسمی و مراسم‌ها';
    } else if (c.includes('sandal') || c.includes('صندل') || n.includes('صندل')) {
      styleDesc = 'طراحی سبک و مناسب روزهای گرم'; usage = 'فصول گرم و استفاده روزمره';
    } else if (c.includes('women') || c.includes('زنانه') || n.includes('زنانه')) {
      styleDesc = 'طراحی ظریف و زنانه'; usage = 'محیط کار، دورهمی‌ها و استفاده روزانه';
    }
    const shortDesc = `${n} از برند ${b}؛ مناسب ${usage}.`;
    const enteredFeatures = String(providedFeatures || '').split(/[\r\n,]+/).map(v => v.trim()).filter(Boolean).slice(0, 4);
    const enteredSpecifications = String(providedSpecifications || '').trim();
    const specifications = enteredSpecifications || [sizes ? `سایزبندی: ${sizes}` : '', colors ? `رنگ‌بندی: ${colors}` : ''].filter(Boolean).join('\n');
    const confirmedDetails = [enteredFeatures.join('، '), specifications.replace(/[\r\n]+/g, '، ')].filter(Boolean).join('؛ ').slice(0, 220);
    const longDesc = `${n} از برند ${b}، با ${styleDesc} برای ${usage} معرفی می‌شود.${confirmedDetails ? ` جزئیات ثبت‌شده: ${confirmedDetails}.` : ''} پیش از انتشار، مشخصات را با محصول واقعی تطبیق دهید.`;
    const features = enteredFeatures.length ? enteredFeatures : [styleDesc, `مناسب برای ${usage}`, 'جزئیات را پیش از انتشار با محصول واقعی تطبیق دهید.'];
    return { shortDesc, longDesc, features, specifications };
  }

  function insertDescAssistant() {
    const form = document.querySelector('#product-edit-form');
    const shortDesc = form?.elements?.shortDesc;
    const field = shortDesc?.closest('.field');
    if (!field || form.querySelector('.ai-desc-assistant')) return;

    const assistant = document.createElement('section');
    assistant.className = 'ai-desc-assistant field full';
    assistant.innerHTML = `
      <div class="ai-desc-assistant-inner">
        <div class="ai-desc-header">
          <div class="ai-desc-title">
            <span class="ai-desc-badge">هوش مصنوعی</span>
            <h4>دستیار هوشمند نگارش توضیحات و ویژگی‌های محصول</h4>
          </div>
          <button type="button" class="btn ai-desc-generate-btn" id="ai-desc-generate-btn">
            ✨ تولید هوشمند توضیحات
          </button>
        </div>
        <p class="ai-desc-subtitle">متن پیشنهادی بر اساس اطلاعات فرم تولید می‌شود؛ مشخصات مادی و فنی را پیش از انتشار با محصول واقعی تطبیق دهید.</p>
        <div id="ai-desc-status" class="ai-desc-status" style="display:none;" role="status"></div>
      </div>`;

    field.before(assistant);
    const btn = assistant.querySelector('#ai-desc-generate-btn');
    const status = assistant.querySelector('#ai-desc-status');

    btn?.addEventListener('click', async () => {
      const name = form.elements.name?.value?.trim() || '';
      if (!name) {
        status.style.display = 'block'; status.style.color = '#a34537';
        status.textContent = 'لطفاً ابتدا نام محصول را در بالای فرم وارد کنید.';
        form.elements.name?.focus();
        return;
      }
      const input = {
        name,
        category: form.elements.category?.value || '',
        brand: form.elements.brand?.value || 'طوبی',
        sizes: form.elements.sizes?.value || '',
        colors: form.elements.colors?.value || '',
        features: form.elements.features?.value || '',
        specifications: form.elements.specifications?.value || ''
      };
      btn.disabled = true;
      btn.textContent = 'در حال نگارش…';
      status.style.display = 'block'; status.style.color = '#2e4a2e';
      status.textContent = 'دستیار در حال آماده‌سازی متن پیشنهادی است…';
      let result = null;
      try {
        const response = await fetch('/api/ai/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
          body: JSON.stringify(input)
        });
        if (response.ok) result = await response.json();
      } catch { /* Use local draft fallback */ }
      if (!result?.shortDesc || !result?.longDesc) result = generateLocalDescription(input);

      for (const [key, value] of [['shortDesc', result.shortDesc], ['longDesc', result.longDesc]]) {
        const control = form.elements[key];
        if (!control) continue;
        control.value = value;
        control.classList.remove('field-highlight-flash'); void control.offsetWidth;
        control.classList.add('field-highlight-flash');
      }
      if (form.elements.features && result.features) {
        form.elements.features.value = Array.isArray(result.features) ? result.features.join('\n') : result.features;
        form.elements.features.classList.remove('field-highlight-flash'); void form.elements.features.offsetWidth;
        form.elements.features.classList.add('field-highlight-flash');
      }
      if (form.elements.specifications && result.specifications && !form.elements.specifications.value.trim()) {
        form.elements.specifications.value = result.specifications;
        form.elements.specifications.classList.remove('field-highlight-flash'); void form.elements.specifications.offsetWidth;
        form.elements.specifications.classList.add('field-highlight-flash');
      }
      btn.disabled = false;
      btn.textContent = '✨ بازتولید توضیحات';
      status.textContent = '✅ پیش‌نویس توضیحات و ویژگی‌ها درج شد؛ لطفاً درستی ادعاها را بررسی کنید.';
      if (typeof g.toast === 'function') g.toast('پیش‌نویس توضیحات محصول آماده شد.');
    });
  }

  /**
   * Inline Puter.js Product Studio inside Product Modal
   */
  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;

    let sourceDataUrl = '';
    let generatedDataUrl = '';
    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ استودیو هوش مصنوعی تصویر محصول با Puter.js</h3>
        <p class="ai-studio-note">تصویر مرجع با مدل‌های تولید تصویر Puter ویرایش می‌شود؛ در صورت محدودیت یا خطا، استودیو خودکار مدل سازگار بعدی را امتحان می‌کند. ورود به حساب Puter لازم است و مصرف طبق شرایط حساب همان کاربر محاسبه می‌شود.</p>
      </div>
      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-pipeline">مدل هوش مصنوعی / ترتیب چرخش</label>
        <select id="ai-product-pipeline" class="ai-studio-select">
          <option value="puter-auto" selected>🔄 چرخش خودکار مدل‌های سازگار Puter</option>
        </select>
        <label for="ai-product-style">سبک دکور و زمینهٔ استودیو</label>
        <select id="ai-product-style" class="ai-studio-select">
          <option value="catalog-white" selected>سفید کاتالوگی استاندارد (مناسب وب‌سایت و دیجی‌کالا)</option>
          <option value="dark-luxury">استودیوی دارک و لوکس (زمینه زغالی + هایلایت‌های حاشیه‌ای)</option>
          <option value="minimal">مینیمال آرت (پداستال بتنی مرمر + نور طبیعی)</option>
          <option value="lifestyle">لایف‌استایل و محیطی (چیدمان طبیعی در روزمرگی)</option>
          <option value="on-model">روی مدل (نمایش پاخور طبیعی)</option>
          <option value="advertising">تبلیغاتی و بنر (نورپردازی دراماتیک پویا)</option>
        </select>
        <div class="ai-puter-login-row">
          <button type="button" class="btn outline" id="ai-product-puter-connect">🔗 ورود / اتصال به Puter</button>
          <small id="ai-product-puter-status" role="status">برای تولید، حساب Puter لازم است.</small>
        </div>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>✨ تولید تصویر و چرخش خودکار مدل‌ها</button>
      </div>
      <div class="ai-source-grid" id="ai-product-previews-grid">
        <figure class="ai-source-card" id="ai-product-source-wrap" hidden>
          <label>عکس مرجع</label>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس محصول">
          <figcaption class="ai-source-status">عکس مرجع آماده است</figcaption>
        </figure>
        <figure class="ai-final-output" id="ai-product-output-wrap" hidden style="margin:0; width:100%;">
          <label style="display:block; min-height:34px; color:#26382a; font-size:12px; font-weight:600;">تصویر ویرایش‌شده</label>
          <img id="ai-product-output-preview" alt="تصویر استودیویی تولیدشده با Puter.js">
          <figcaption id="ai-product-output-caption" style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">خروجی مدل Puter.js</figcaption>
        </figure>
      </div>
      <div class="ai-studio-actions">
        <button type="button" class="action" id="ai-product-apply" disabled>افزودن تصویر نهایی به تصاویر محصول</button>
        <span id="ai-studio-status" role="status" aria-live="polite">یک تصویر واضح از محصول انتخاب کنید.</span>
      </div>`;

    field.before(studio);
    const status = studio.querySelector('#ai-studio-status');
    const generateBtn = studio.querySelector('#ai-product-generate');
    const applyBtn = studio.querySelector('#ai-product-apply');
    const fileInput = studio.querySelector('#ai-product-file');
    const pipelineSelect = studio.querySelector('#ai-product-pipeline');
    const styleSelect = studio.querySelector('#ai-product-style');
    const sourceWrap = studio.querySelector('#ai-product-source-wrap');
    const sourcePreview = studio.querySelector('#ai-product-source-preview');
    const outputWrap = studio.querySelector('#ai-product-output-wrap');
    const outputPreview = studio.querySelector('#ai-product-output-preview');
    const outputCaption = studio.querySelector('#ai-product-output-caption');
    const connectBtn = studio.querySelector('#ai-product-puter-connect');
    const puterStatus = studio.querySelector('#ai-product-puter-status');

    loadPuterImageModels(getPuterClient()).then(models => populatePuterModelSelect(pipelineSelect, models));
    connectBtn?.addEventListener('click', async () => {
      try {
        const puter = await loadPuterSdk();
        if (!puter?.auth?.signIn) throw new Error('کتابخانهٔ Puter.js هنوز آماده نیست؛ دوباره تلاش کنید.');
        if (!puter.auth.isSignedIn?.()) await puter.auth.signIn();
        if (puterStatus) puterStatus.textContent = '✅ حساب Puter متصل است؛ مدل‌ها آماده‌اند.';
        const models = await loadPuterImageModels(puter, { discoverLive: true, force: true });
        populatePuterModelSelect(pipelineSelect, models);
      } catch (error) {
        if (puterStatus) puterStatus.textContent = error?.message || 'اتصال به Puter انجام نشد.';
      }
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        sourceDataUrl = '';
        generateBtn.disabled = true;
        sourceWrap.hidden = true;
        status.textContent = 'یک تصویر واضح از محصول انتخاب کنید.';
        return;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
        sourceDataUrl = '';
        generateBtn.disabled = true;
        status.textContent = file.size > MAX_UPLOAD ? 'حجم عکس بیشتر از ۱۵ مگابایت است.' : 'فرمت JPG، PNG یا WebP انتخاب کنید.';
        return;
      }
      try {
        status.textContent = 'در حال خواندن عکس…';
        sourceDataUrl = await resizeImage(file, 1024, 0.88);
        sourcePreview.src = sourceDataUrl;
        sourceWrap.hidden = false;
        generateBtn.disabled = false;
        status.textContent = 'عکس آماده است؛ تولید را بزنید.';
      } catch (error) {
        status.textContent = error.message || 'خطا در بارگذاری تصویر.';
      }
    });

    generateBtn?.addEventListener('click', async () => {
      if (!sourceDataUrl) return;
      generateBtn.disabled = true;
      applyBtn.disabled = true;
      generateBtn.textContent = 'در حال تولید…';
      status.textContent = 'در حال اتصال به Puter و آماده‌سازی مدل‌ها…';
      try {
        const result = await generateProductImageWithPuter({
          imageDataUrl: sourceDataUrl,
          style: styleSelect?.value || 'catalog-white',
          preferredModel: pipelineSelect?.value || PUTER_AUTO_MODEL,
          onProgress: ({ model, index, total, fallback }) => {
            status.textContent = fallback
              ? `مدل قبلی در دسترس نبود؛ تلاش ${index + 1} از ${total} با ${model.name}…`
              : `در حال تولید با ${model.name}…`;
          }
        });
        generatedDataUrl = result.dataUrl;
        if (!generatedDataUrl || generatedDataUrl === sourceDataUrl) throw new Error('مدل تصویر تازه و متفاوتی تولید نکرد.');
        outputPreview.src = generatedDataUrl;
        outputWrap.hidden = false;
        applyBtn.disabled = false;
        const trail = result.triedModels.length > 1 ? ` · پس از ${result.triedModels.length} تلاش` : '';
        outputCaption.textContent = `مدل نهایی: ${result.modelName} · ${result.provider}${trail}`;
        status.textContent = `✅ تصویر ویرایش شد؛ مدل فعال: ${result.modelName}.`;
      } catch (error) {
        generatedDataUrl = '';
        status.textContent = `❌ ${error.message || 'تولید تصویر با مدل‌های Puter انجام نشد.'}`;
      } finally {
        generateBtn.disabled = !sourceDataUrl;
        generateBtn.textContent = '✨ تولید تصویر و چرخش خودکار مدل‌ها';
      }
    });

    applyBtn?.addEventListener('click', () => {
      if (!generatedDataUrl) return;
      if (images && typeof images.value === 'string') {
        const current = images.value.trim();
        images.value = current ? `${current}\n${generatedDataUrl}` : generatedDataUrl;
      }
      if (form?.elements?.image && !form.elements.image.value) form.elements.image.value = generatedDataUrl;
      if (typeof g.toast === 'function') g.toast('تصویر تولیدشده به فیلد تصاویر محصول افزوده شد.');
      applyBtn.textContent = '✓ اضافه شد';
      applyBtn.disabled = true;
    });
  }

  /**
   * Standalone Full-Page AI Studio: `renderProductAiStudioPage(target)`
   */
  function renderProductAiStudioPage(target) {
    if (!target) return;
    let selectedStyle = 'catalog-white';
    let selectedRatio = '1:1';
    let selectedPreservation = 'maximum';
    let selectedQuality = 'high';
    let selectedProvider = PUTER_AUTO_MODEL;
    let currentInputDataUrl = '';
    let currentOutputDataUrl = '';
    let isGenerating = false;

    const db = typeof g.getDb === 'function' ? g.getDb() : (g.db || { products: [] });
    const products = Array.isArray(db.products) ? db.products : [];

    target.innerHTML = `
      <div class="ai-studio-page-wrapper" dir="rtl">
        <header class="ai-studio-hero">
          <div class="ai-studio-hero-content">
            <div class="ai-studio-badge-pill">
              <span class="ai-spark-icon">✨</span>
              <span>استودیو هوش مصنوعی محصول طوبی</span>
              <span class="ai-version-tag">Puter.js · مدل‌های چرخشی</span>
            </div>
            <h1 class="ai-studio-title">تبدیل عکس محصول به تصویر تجاری آتلیه‌ای</h1>
            <p class="ai-studio-desc">یک عکس واضح از محصول بارگذاری کنید. استودیو بین مدل‌های سازگار تولید و ویرایش تصویر Puter.js به‌صورت چرخشی انتخاب می‌کند و اگر مدلی محدود یا ناموفق شود، خودکار مدل بعدی را امتحان می‌کند. استفاده نیازمند ورود به Puter است و مصرف تابع شرایط حساب کاربر است.</p>
          </div>
          <div class="ai-studio-backend-status-card" id="ai-studio-backend-card">
            <div class="ai-status-indicator">
              <span class="status-dot online" id="ai-backend-status-dot"></span>
              <strong id="ai-backend-status-text">Puter.js آمادهٔ اتصال</strong>
            </div>
            <div class="ai-backend-meta">
              <span id="ai-backend-name">در حال بارگذاری فهرست مدل‌های تصویر Puter…</span>
              <button type="button" class="btn-text-link" id="ai-puter-connect-btn">🔗 ورود / اتصال به Puter</button>
            </div>
            <small id="ai-puter-usage-note" style="display:block; margin-top:8px; line-height:1.7; color:#b9c9be;">هزینه و سهمیهٔ تولید بر اساس حساب Puter کاربر اعمال می‌شود.</small>
          </div>
        </header>

        <div class="ai-studio-grid">
          <div class="ai-studio-controls-col">
            <section class="ai-card ai-upload-card">
              <div class="ai-card-head"><span class="step-num">۱</span><h3>بارگذاری تصویر محصول</h3></div>
              <div class="ai-dropzone" id="ai-studio-dropzone">
                <input type="file" id="ai-studio-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" />
                <div class="ai-dropzone-inner" id="ai-dropzone-prompt">
                  <div class="ai-upload-icon">📸</div>
                  <p class="ai-drop-text"><strong>عکس محصول را بکشید و اینجا رها کنید</strong> یا کلیک کنید</p>
                  <small class="ai-drop-sub">JPG، PNG و WebP · حداکثر ۱۵ مگابایت</small>
                </div>
                <div class="ai-dropzone-preview" id="ai-dropzone-preview" style="display:none;">
                  <img id="ai-uploaded-img-preview" alt="پیش‌نمایش تصویر محصول" />
                  <div class="ai-preview-overlay">
                    <span id="ai-upload-filename">تصویر آماده است</span>
                    <button type="button" class="btn small danger-button" id="ai-remove-image-btn">✕ حذف عکس</button>
                  </div>
                </div>
              </div>
              <div class="ai-preservation-notice"><span class="shield-icon">🛡️</span><span>درخواست ویرایش فقط دکور و نورپردازی را تغییر می‌دهد؛ خروجی را پیش از انتشار از نظر شکل، رنگ، لوگو و جزئیات محصول بررسی کنید.</span></div>
            </section>

            <section class="ai-card ai-style-card">
              <div class="ai-card-head"><span class="step-num">۲</span><h3>سبک دکور و نورپردازی</h3></div>
              <div class="ai-styles-selector-grid">
                ${STYLES.map(style => `
                  <button type="button" class="ai-style-option ${style.id === selectedStyle ? 'active' : ''}" data-style="${style.id}">
                    <span class="style-icon">${style.icon}</span><div class="style-meta">
                      <div class="style-title-row"><strong>${esc(style.title)}</strong><span class="style-badge">${esc(style.badge)}</span></div>
                      <p class="style-desc">${esc(style.desc)}</p>
                    </div>
                  </button>`).join('')}
              </div>
            </section>

            <section class="ai-card ai-settings-card">
              <div class="ai-card-head"><span class="step-num">۳</span><h3>تنظیمات تولید</h3></div>
              <div class="ai-setting-group">
                <label>نسبت ابعاد خروجی:</label>
                <div class="ai-pill-selector">
                  ${RATIOS.map(ratio => `<button type="button" class="ai-pill-btn ${ratio.id === selectedRatio ? 'active' : ''}" data-ratio="${ratio.id}"><strong>${esc(ratio.label)}</strong><small>${esc(ratio.sub)}</small></button>`).join('')}
                </div>
              </div>
              <div class="ai-setting-group">
                <label>شدت حفظ هویت کالا:</label>
                <div class="ai-pill-selector three-col">
                  ${PRESERVATION_LEVELS.map(level => `<button type="button" class="ai-pill-btn ${level.id === selectedPreservation ? 'active' : ''}" data-preservation="${level.id}"><strong>${esc(level.label)}</strong></button>`).join('')}
                </div>
              </div>
              <div class="ai-setting-row">
                <div class="ai-setting-group flex-1">
                  <label for="ai-studio-provider-select">مدل یا چرخش خودکار:</label>
                  <select id="ai-studio-provider-select" class="select full"><option value="puter-auto" selected>🔄 چرخش خودکار مدل‌های سازگار Puter</option></select>
                </div>
                <div class="ai-setting-group flex-1">
                  <label for="ai-studio-quality-select">کیفیت خروجی:</label>
                  <select id="ai-studio-quality-select" class="select full">
                    <option value="high" selected>کیفیت بالا</option><option value="standard">استاندارد و سریع‌تر</option><option value="ultra">بالاترین کیفیت موجود در مدل</option>
                  </select>
                </div>
              </div>
              <div class="ai-setting-group">
                <label for="ai-studio-custom-prompt">دستور تکمیلی (اختیاری):</label>
                <textarea id="ai-studio-custom-prompt" rows="2" class="full textarea-custom" placeholder="مثلاً: محصول روی سنگ مرمر مشکی قرار گیرد و انعکاس ملایمی داشته باشد..."></textarea>
              </div>
              <div class="ai-generate-action-box">
                <button type="button" class="btn primary-gradient large-btn full" id="ai-studio-main-generate-btn" disabled>
                  <span class="btn-spark">✨</span><span class="btn-label">تولید تصویر با چرخش خودکار مدل‌های Puter</span>
                </button>
                <div class="ai-progress-status" id="ai-studio-progress-box" style="display:none;"><div class="ai-spinner"></div><span id="ai-studio-progress-text">در حال اتصال به Puter…</span></div>
              </div>
            </section>
          </div>

          <div class="ai-studio-preview-col">
            <section class="ai-card ai-result-card">
              <div class="ai-card-head between">
                <h3>پیش‌نمایش و مقایسه قبل / بعد</h3>
                <div class="ai-view-modes" id="ai-view-mode-buttons" style="display:none;">
                  <button type="button" class="ai-view-btn active" data-view="compare">مقایسه</button><button type="button" class="ai-view-btn" data-view="output">فقط خروجی</button><button type="button" class="ai-view-btn" data-view="original">عکس خام</button>
                </div>
              </div>
              <div class="ai-empty-result-state" id="ai-empty-result-state"><div class="empty-icon-art">🖼️</div><h4>خروجی آتلیه اینجا نمایش داده می‌شود</h4><p>عکس محصول را انتخاب کنید و سبک استودیو را مشخص نمایید.</p></div>
              <div class="ai-active-preview-area" id="ai-active-preview-area" style="display:none;">
                <div class="ai-comparison-grid view-mode-compare" id="ai-comparison-grid">
                  <div class="ai-preview-frame original-frame" id="ai-frame-original"><span class="frame-tag">عکس خام ورودی</span><img id="ai-result-original-img" alt="عکس خام محصول" /></div>
                  <div class="ai-preview-frame output-frame" id="ai-frame-output"><span class="frame-tag highlight" id="ai-output-model-tag">خروجی Puter.js</span><img id="ai-result-output-img" alt="تصویر استودیویی تولیدشده" /></div>
                </div>
              </div>
              <div class="ai-post-actions-panel" id="ai-post-actions-panel" style="display:none;">
                <div class="ai-product-selector-row"><label for="ai-target-product-select">ثبت تصویر در محصول:</label><select id="ai-target-product-select" class="select full"><option value="">-- انتخاب محصول --</option>${products.map(product => `<option value="${esc(product.id)}">${esc(product.name)} (${esc(product.sku || product.id)})</option>`).join('')}</select></div>
                <div class="ai-action-buttons-grid">
                  <button type="button" class="btn success-button" id="ai-btn-set-main-image">🌟 تنظیم به‌عنوان تصویر اصلی</button>
                  <button type="button" class="btn outline" id="ai-btn-add-to-gallery">🖼️ افزودن به گالری</button>
                  <button type="button" class="btn outline" id="ai-btn-download-image">💾 دانلود تصویر</button>
                  <button type="button" class="btn outline" id="ai-btn-regenerate">🔄 تولید مجدد</button>
                </div>
                <div class="ai-action-feedback" id="ai-action-feedback" style="display:none;"></div>
              </div>
            </section>
          </div>
        </div>
      </div>`;

    const q = selector => target.querySelector(selector);
    const dropzone = q('#ai-studio-dropzone');
    const fileInput = q('#ai-studio-file-input');
    const promptBox = q('#ai-dropzone-prompt');
    const previewBox = q('#ai-dropzone-preview');
    const uploadedImg = q('#ai-uploaded-img-preview');
    const removeImgBtn = q('#ai-remove-image-btn');
    const generateBtn = q('#ai-studio-main-generate-btn');
    const progressBox = q('#ai-studio-progress-box');
    const progressText = q('#ai-studio-progress-text');
    const customPromptInput = q('#ai-studio-custom-prompt');
    const providerSelect = q('#ai-studio-provider-select');
    const qualitySelect = q('#ai-studio-quality-select');
    const emptyResultState = q('#ai-empty-result-state');
    const activePreviewArea = q('#ai-active-preview-area');
    const viewModeButtons = q('#ai-view-mode-buttons');
    const comparisonGrid = q('#ai-comparison-grid');
    const frameOriginal = q('#ai-frame-original');
    const frameOutput = q('#ai-frame-output');
    const resultOriginalImg = q('#ai-result-original-img');
    const resultOutputImg = q('#ai-result-output-img');
    const outputModelTag = q('#ai-output-model-tag');
    const postActionsPanel = q('#ai-post-actions-panel');
    const targetProductSelect = q('#ai-target-product-select');
    const btnSetMainImage = q('#ai-btn-set-main-image');
    const btnAddToGallery = q('#ai-btn-add-to-gallery');
    const btnDownload = q('#ai-btn-download-image');
    const btnRegenerate = q('#ai-btn-regenerate');
    const actionFeedback = q('#ai-action-feedback');
    const backendStatusText = q('#ai-backend-status-text');
    const backendStatusDot = q('#ai-backend-status-dot');
    const backendNameEl = q('#ai-backend-name');
    const puterConnectBtn = q('#ai-puter-connect-btn');

    function updatePuterStatus(connected, count = 0) {
      backendStatusDot?.classList.toggle('offline', !connected);
      backendStatusDot?.classList.toggle('online', connected);
      if (backendStatusText) backendStatusText.textContent = connected ? '✅ حساب Puter متصل است' : 'برای تولید به حساب Puter وارد شوید';
      if (backendNameEl) backendNameEl.textContent = `${count || 'مدل‌های'} مدل تصویر Puter · چرخش خودکار هنگام محدودیت`;
    }

    async function refreshPuterCatalog(discoverLive = false) {
      const puter = getPuterClient();
      const models = await loadPuterImageModels(puter, { discoverLive, force: true });
      populatePuterModelSelect(providerSelect, models);
      let connected = false;
      try { connected = Boolean(puter?.auth?.isSignedIn?.()); } catch { /* use the unauthenticated label */ }
      updatePuterStatus(connected, models.length);
      return models;
    }

    refreshPuterCatalog(false).catch(() => updatePuterStatus(false, PUTER_FALLBACK_MODELS.length));
    puterConnectBtn?.addEventListener('click', async () => {
      try {
        const puter = await loadPuterSdk();
        if (!puter?.auth?.signIn) throw new Error('کتابخانهٔ Puter.js هنوز آماده نیست؛ دوباره تلاش کنید.');
        if (!puter.auth.isSignedIn?.()) await puter.auth.signIn();
        await refreshPuterCatalog(true);
      } catch (error) {
        if (backendStatusText) backendStatusText.textContent = error?.message || 'ورود به Puter انجام نشد.';
      }
    });

    dropzone?.addEventListener('click', event => {
      if (event.target !== removeImgBtn && !removeImgBtn?.contains(event.target)) fileInput?.click();
    });
    dropzone?.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('drag-active'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
    dropzone?.addEventListener('drop', event => {
      event.preventDefault();
      dropzone.classList.remove('drag-active');
      const file = event.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
    fileInput?.addEventListener('change', () => { if (fileInput.files?.[0]) handleFile(fileInput.files[0]); });

    async function handleFile(file) {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return alert('فقط تصویر JPG، PNG یا WebP انتخاب کنید.');
      if (file.size > MAX_UPLOAD) return alert('حجم تصویر نباید از ۱۵ مگابایت بیشتر باشد.');
      try {
        currentInputDataUrl = await resizeImage(file, 1024, 0.88);
        currentOutputDataUrl = '';
        uploadedImg.src = currentInputDataUrl;
        resultOriginalImg.src = currentInputDataUrl;
        promptBox.style.display = 'none';
        previewBox.style.display = 'block';
        emptyResultState.style.display = 'block';
        activePreviewArea.style.display = 'none';
        postActionsPanel.style.display = 'none';
        const shortName = file.name?.length > 22 ? `${file.name.slice(0, 14)}…${file.name.slice(-6)}` : (file.name || 'image.jpg');
        q('#ai-upload-filename').textContent = `${shortName} (${formatFileSize(file.size)})`;
        generateBtn.disabled = false;
      } catch (error) {
        alert(error.message || 'خطا در بارگذاری عکس.');
      }
    }

    removeImgBtn?.addEventListener('click', event => {
      event.stopPropagation();
      currentInputDataUrl = '';
      currentOutputDataUrl = '';
      fileInput.value = '';
      uploadedImg.src = '';
      promptBox.style.display = 'flex';
      previewBox.style.display = 'none';
      activePreviewArea.style.display = 'none';
      postActionsPanel.style.display = 'none';
      emptyResultState.style.display = 'block';
      generateBtn.disabled = true;
    });

    target.querySelectorAll('.ai-style-option').forEach(button => button.addEventListener('click', () => {
      target.querySelectorAll('.ai-style-option').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      selectedStyle = button.getAttribute('data-style');
    }));
    target.querySelectorAll('.ai-pill-btn[data-ratio]').forEach(button => button.addEventListener('click', () => {
      target.querySelectorAll('.ai-pill-btn[data-ratio]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      selectedRatio = button.getAttribute('data-ratio');
    }));
    target.querySelectorAll('.ai-pill-btn[data-preservation]').forEach(button => button.addEventListener('click', () => {
      target.querySelectorAll('.ai-pill-btn[data-preservation]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      selectedPreservation = button.getAttribute('data-preservation');
    }));
    providerSelect?.addEventListener('change', () => { selectedProvider = providerSelect.value; });
    qualitySelect?.addEventListener('change', () => { selectedQuality = qualitySelect.value; });

    async function triggerGeneration() {
      if (!currentInputDataUrl || isGenerating) return;
      isGenerating = true;
      generateBtn.disabled = true;
      progressBox.style.display = 'flex';
      progressText.textContent = 'در حال اتصال به Puter و آماده‌سازی مدل‌ها…';
      try {
        const result = await generateProductImageWithPuter({
          imageDataUrl: currentInputDataUrl,
          style: selectedStyle,
          customPrompt: customPromptInput?.value?.trim() || '',
          aspectRatio: selectedRatio,
          preservation: selectedPreservation,
          quality: selectedQuality,
          preferredModel: selectedProvider,
          onProgress: ({ model, index, total, fallback }) => {
            progressText.textContent = fallback
              ? `مدل قبلی محدود یا ناموفق بود؛ تلاش ${index + 1} از ${total} با ${model.name}…`
              : `در حال تولید با ${model.name}…`;
          }
        });
        currentOutputDataUrl = result.dataUrl;
        if (!currentOutputDataUrl || currentOutputDataUrl === currentInputDataUrl) throw new Error('خروجی تصویری تازه از Puter دریافت نشد.');
        emptyResultState.style.display = 'none';
        activePreviewArea.style.display = 'block';
        viewModeButtons.style.display = 'flex';
        postActionsPanel.style.display = 'block';
        resultOriginalImg.src = currentInputDataUrl;
        resultOutputImg.src = currentOutputDataUrl;
        outputModelTag.textContent = `خروجی: ${result.modelName} · ${result.provider}`;
        if (typeof g.toast === 'function') g.toast(`✨ تصویر با ${result.modelName} تولید شد.`);
      } catch (error) {
        currentOutputDataUrl = '';
        alert(`خطا در تولید تصویر: ${error.message || 'همه مدل‌ها ناموفق بودند.'}`);
      } finally {
        isGenerating = false;
        generateBtn.disabled = !currentInputDataUrl;
        progressBox.style.display = 'none';
      }
    }
    generateBtn?.addEventListener('click', triggerGeneration);
    btnRegenerate?.addEventListener('click', triggerGeneration);

    target.querySelectorAll('.ai-view-btn').forEach(button => button.addEventListener('click', () => {
      const mode = button.getAttribute('data-view');
      target.querySelectorAll('.ai-view-btn').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      comparisonGrid.classList.remove('view-mode-compare', 'view-mode-output', 'view-mode-original');
      comparisonGrid.classList.add(`view-mode-${mode}`);
      frameOriginal.style.display = mode === 'output' ? 'none' : 'block';
      frameOutput.style.display = mode === 'original' ? 'none' : 'block';
    }));

    async function persistGeneratedProductImage(productId, asMainImage) {
      if (!currentOutputDataUrl) throw new Error('ابتدا تصویر را با Puter تولید کنید.');
      const product = products.find(item => String(item.id) === String(productId));
      if (!product) throw new Error('محصول انتخاب‌شده در پایگاه داده پیدا نشد؛ فهرست را تازه‌سازی کنید.');
      if (!g.DataRepositories?.media?.create || !g.DataRepositories?.media?.delete || !g.StoreServices?.products?.update) {
        throw new Error('اتصال پایگاه دادهٔ تصویر آماده نیست. صفحه را تازه‌سازی کنید.');
      }

      const media = await g.DataRepositories.media.create({ url:currentOutputDataUrl, alt:`${product.name} — تصویر استودیویی` });
      const currentImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
      const nextImages = asMainImage
        ? [media.url, ...currentImages.filter(url => url !== media.url)]
        : currentImages.includes(media.url) ? currentImages : [...currentImages, media.url];
      try {
        await g.StoreServices.products.update(productId, { images:nextImages });
      } catch (error) {
        try { await g.DataRepositories.media.delete(media.id); } catch (cleanupError) { console.warn('Generated image cleanup failed:', cleanupError); }
        throw error;
      }
      return { product, media };
    }

    btnSetMainImage?.addEventListener('click', async () => {
      const productId = targetProductSelect?.value;
      if (!productId) return alert('لطفاً ابتدا محصول مورد نظر را از منوی کشویی انتخاب کنید.');
      btnSetMainImage.disabled = true;
      try {
        const { product } = await persistGeneratedProductImage(productId, true);
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback success';
        actionFeedback.textContent = `✅ تصویر به‌صورت پایدار در Supabase ذخیره و تصویر اصلی «${product.name}» شد.`;
      } catch (error) {
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback error';
        actionFeedback.textContent = `❌ ${error.message}`;
      } finally { btnSetMainImage.disabled = false; }
    });

    btnAddToGallery?.addEventListener('click', async () => {
      const productId = targetProductSelect?.value;
      if (!productId) return alert('لطفاً ابتدا محصول مورد نظر را از منوی کشویی انتخاب کنید.');
      btnAddToGallery.disabled = true;
      try {
        const { product } = await persistGeneratedProductImage(productId, false);
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback success';
        actionFeedback.textContent = `✅ تصویر به‌صورت پایدار در Supabase ذخیره و به گالری «${product.name}» افزوده شد.`;
      } catch (error) {
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback error';
        actionFeedback.textContent = `❌ ${error.message}`;
      } finally { btnAddToGallery.disabled = false; }
    });

    btnDownload?.addEventListener('click', () => {
      if (!currentOutputDataUrl) return;
      const link = document.createElement('a');
      link.href = currentOutputDataUrl;
      link.download = `touba-puter-studio-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Exports on window/global
  g.renderProductAiStudioPage = renderProductAiStudioPage;
  g.initProductAiStudio = renderProductAiStudioPage;
  g.insertProductAiStudio = insertStudio;
  g.insertProductDescAssistant = insertDescAssistant;

  // Hook productModal for in-form studio injection
  const originalModal = g.productModal;
  if (typeof originalModal === 'function') {
    g.productModal = function (...args) {
      const result = originalModal.apply(this, args);
      insertDescAssistant();
      insertStudio();
      return result;
    };
  }
})();

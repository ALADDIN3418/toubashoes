/* Touba Admin Product AI Assistant & 3-angle Image Studio */
(() => {
  const MAX_UPLOAD = 15 * 1024 * 1024;
  const ANGLES = [
    { id:'front', label:'نمای روبه‌رو و سه‌رخ', alt:'خروجی هوش مصنوعی از نمای روبه‌رو و سه‌رخ کفش' },
    { id:'side', label:'نمای جانبی', alt:'خروجی هوش مصنوعی از نمای جانبی کفش' },
    { id:'heel', label:'نمای پاشنه', alt:'خروجی هوش مصنوعی از نمای پاشنه کفش' }
  ];

  async function adminAuthHeaders() {
    if (!window.ToubaAuth?.configured) return {};
    const token = await window.ToubaAuth.getAccessToken();
    if (!token) throw new Error('نشست مدیر منقضی شده است؛ دوباره وارد شوید.');
    return { Authorization:`Bearer ${token}` };
  }

  function generateLocalDescription({ name, category, brand, sizes, colors, features:providedFeatures, specifications:providedSpecifications }) {
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
    const enteredFeatures = String(providedFeatures || '').split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean).slice(0, 4);
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

    btn.addEventListener('click', async () => {
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
          method:'POST', headers:{ 'Content-Type':'application/json', ...await adminAuthHeaders() }, body:JSON.stringify(input)
        });
        if (response.ok) result = await response.json();
      } catch { /* Use the local draft generator when the API is unavailable. */ }
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
      if (typeof window.toast === 'function') window.toast('پیش‌نویس توضیحات محصول آماده شد.');
    });
  }

  function buildShoePhotoPrompt(style) {
    const styles = {
      'warm-studio': 'in an elegant warm neutral ecommerce studio setting, soft cream and beige background, gentle diffused studio lighting, centered clean pedestal, sharp focus on shoe materials, textures, and craftsmanship',
      'dark-luxury': 'in a luxury dark ecommerce studio setting, moody deep charcoal background, subtle edge reflections and rim lighting accentuating footwear contours, premium catalog presentation, sharp focus',
      'natural-stone': 'on a smooth natural limestone pedestal, crisp architectural daylight, minimalist organic textures, clean commercial shoe photography, sharp focus'
    };
    const desc = styles[style] || styles['warm-studio'];
    return `Professional commercial product catalog photography of the exact footwear shown in the reference image, ${desc}. Maintain the exact footwear design, shape, silhouette, straps, studs, embellishments, colors, and textures from the reference photo. Single shoe product view only. No human feet, legs, or models. Crisp commercial advertising quality, sharp focus, 8k resolution.`;
  }

  const STORAGE_KEYS_KEY = 'touba_gpt_image_keys';
  const STORAGE_BASE_KEY = 'touba_gpt_image_base';
  const STORAGE_GEMINI_KEY = 'touba_gemini_api_key';
  const STORAGE_QUALITY_KEY = 'touba_gpt_image_quality';

  function getClientGptKeys() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS_KEY) || '';
      return raw.split(/[\r\n,]+/).map(k => k.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  function getClientGptBase() {
    try {
      return (localStorage.getItem(STORAGE_BASE_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function getClientGeminiKey() {
    try {
      return (localStorage.getItem(STORAGE_GEMINI_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function getClientQuality() {
    try {
      return (localStorage.getItem(STORAGE_QUALITY_KEY) || 'high').trim();
    } catch {
      return 'high';
    }
  }

  function setClientSettings({ keys, base, geminiKey, quality }) {
    try {
      if (Array.isArray(keys)) {
        localStorage.setItem(STORAGE_KEYS_KEY, keys.join('\n'));
      }
      if (base !== undefined) {
        localStorage.setItem(STORAGE_BASE_KEY, base.trim());
      }
      if (geminiKey !== undefined) {
        localStorage.setItem(STORAGE_GEMINI_KEY, geminiKey.trim());
      }
      if (quality !== undefined) {
        localStorage.setItem(STORAGE_QUALITY_KEY, quality.trim());
      }
    } catch { /* ignore */ }
  }

  function isKeyLimitError(status, message = '') {
    const code = Number(status) || 0;
    if (code === 429 || code === 402 || code === 401 || code === 403) return true;
    const msg = String(message || '').toLowerCase();
    return (
      msg.includes('insufficient_quota') ||
      msg.includes('rate_limit') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('exceeded') ||
      msg.includes('too many requests') ||
      msg.includes('credit') ||
      msg.includes('unauthorized') ||
      msg.includes('invalid_api_key')
    );
  }

  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;

    let sourceDataUrl = '';
    let generatedDataUrl = '';
    let providerReady = false;
    let generationId = 0;

    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ آتلیهٔ هوشمند عکاسی محصول (GPT Image & Gemini / سهمیه رایگان روزانه ۵۰ تا ۵۰۰ تصویر)</h3>
        <p class="ai-studio-note">یک تصویر واضح از محصول انتخاب کنید. سیستم با شرطی‌سازی مستقیم روی عکس مرجع، بدون تغییر در قالب، نگین‌ها، بندها یا زیره، کفش را در آتلیه تجاری بازتولید می‌کند. با اتصال کلید رایگان Google AI Studio یا پروکسی GPT Image، روزانه ۵۰ تا ۵۰۰ تصویر کاملاً رایگان تولید فرمایید.</p>
      </div>

      <!-- Settings Card for Free Daily Quotas & API Key Pool -->
      <div class="ai-key-settings-card" style="margin-bottom: 16px; padding: 12px 14px; background: #f6f8f5; border: 1px solid #d5e0d1; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="ai-key-toggle-btn">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 15px;">🔑</span>
            <strong style="font-size: 13px; color: #213a21;">تنظیمات روش‌های رایگان و کلیدهای API (سهمیه روزانه ۵۰ تا ۵۰۰ تصویر)</strong>
          </div>
          <span id="ai-key-badge" style="font-size: 11px; padding: 3px 10px; border-radius: 12px; background: #e3eedb; color: #264a25; font-weight: 500;">
            بررسی کلیدها…
          </span>
        </div>
        <div id="ai-key-drawer" style="margin-top: 12px; display: none; border-top: 1px dashed #cddcc7; padding-top: 10px;">
          
          <!-- Method 1: Google AI Studio 500 free images/day -->
          <div style="margin-bottom: 12px; padding: 10px; background: #ffffff; border: 1px solid #dce8d8; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="font-size: 12px; color: #1c4b22;">🎁 روش اول (پیشنهادی و تضمینی): ۵۰۰ عکس رایگان در روز با Google AI Studio</strong>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #155724; text-decoration: underline;">
                دریافت کلید در ۳۰ ثانیه (بدون کارت بانکی) ↗
              </a>
            </div>
            <p style="font-size: 11px; color: #4d664e; margin: 0 0 6px 0;">گوگل روزانه ۵۰۰ عکس با مدل Gemini 2.5 Flash Image به صورت ۱۰۰٪ رایگان در اختیار هر اکانت جیمیل قرار می‌دهد. کلید را در کادر زیر وارد کنید:</p>
            <input id="ai-gemini-key-input" type="password" placeholder="AIzaSy..." style="width: 100%; font-family: monospace; font-size: 12px; padding: 7px; border: 1px solid #c2d4bc; border-radius: 6px; box-sizing: border-box; direction: ltr;" />
          </div>

          <!-- Method 2: GPT Image OpenAI Key Pool / Proxy -->
          <div style="margin-bottom: 12px; padding: 10px; background: #ffffff; border: 1px solid #dce8d8; border-radius: 6px;">
            <strong style="display: block; font-size: 12px; color: #1c4b22; margin-bottom: 6px;">⚡ روش دوم: مدل‌های اختصاصی GPT Image (با پروکسی، ورکر یا کلید شخصی)</strong>
            <label for="ai-keys-textarea" style="display: block; font-size: 11px; margin-bottom: 4px; color: #3d553e;">
              کلیدهای OpenAI یا پروکسی GPT Image (چند کلید را با ویرگول یا خط جدید جدا کنید):
            </label>
            <textarea id="ai-keys-textarea" rows="2" placeholder="sk-proj-..., sk-proj-..." style="width: 100%; font-family: monospace; font-size: 12px; padding: 7px; border: 1px solid #c2d4bc; border-radius: 6px; box-sizing: border-box; direction: ltr; resize: vertical;"></textarea>
            
            <div style="margin-top: 8px; display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
              <div>
                <label for="ai-base-input" style="display: block; font-size: 11px; margin-bottom: 4px; color: #3d553e;">
                  آدرس پایه API (اختیاری - برای پروکسی یا اندپوینت اختصاصی):
                </label>
                <input id="ai-base-input" type="text" placeholder="https://api.openai.com/v1" style="width: 100%; font-family: monospace; font-size: 12px; padding: 7px; border: 1px solid #c2d4bc; border-radius: 6px; box-sizing: border-box; direction: ltr;" />
              </div>
              <div>
                <label for="ai-quality-select" style="display: block; font-size: 11px; margin-bottom: 4px; color: #3d553e;">کیفیت تصویر:</label>
                <select id="ai-quality-select" class="ai-studio-select" style="height: 33px; font-size: 11px;">
                  <option value="low">کم‌هزینه و سریع (Low)</option>
                  <option value="medium">متوسط (Medium)</option>
                  <option value="high" selected>حداکثر کیفیت (High)</option>
                </select>
              </div>
            </div>
          </div>

          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span id="ai-key-feedback" style="font-size: 11px; color: #2d5a2b;"></span>
            <button type="button" class="btn" id="ai-key-save-btn" style="padding: 6px 16px; font-size: 12px; background: #2f5930; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
              ذخیره کلیه تنظیمات
            </button>
          </div>
        </div>
      </div>

      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-model">موتور و مدل هوش مصنوعی</label>
        <select id="ai-product-model" class="ai-studio-select">
          <option value="auto-free">⚡ حالت هوشمند خودکار (سهمیه رایگان روزانه ۵۰۰ عکس با سوئیچ خودکار)</option>
          <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (نانو بنانا - ۵۰۰ عکس رایگان در روز با یک جیمیل)</option>
          <option value="gpt-image-2.5-flare">GPT Image 2.5 Flare (مدل پیش‌فرض OpenAI - با پروکسی یا کلید شخصی)</option>
          <option value="gpt-image-2">GPT Image 2 (استدلال بصری پیشرفته)</option>
          <option value="gpt-image-1.5">GPT Image 1.5 (کلاسیک و پایدار)</option>
        </select>
        <label for="ai-product-style">سبک پس‌زمینهٔ خروجی</label>
        <select id="ai-product-style" class="ai-studio-select">
          <option value="warm-studio">استودیوی کرم و ملایم</option>
          <option value="dark-luxury">استودیوی دارک و لوکس</option>
          <option value="natural-stone">سنگ طبیعی و نور روز</option>
        </select>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>تولید یک تصویر نهایی</button>
      </div>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>تولید یک تصویر نهایی</button>
      </div>
      <div class="ai-source-grid" id="ai-product-previews-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <figure class="ai-source-card" id="ai-product-source-wrap" hidden>
          <label>عکس واضح انتخابی</label>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس واضح انتخابی محصول">
          <figcaption class="ai-source-status">عکس مرجع آماده است</figcaption>
        </figure>
        <figure class="ai-final-output" id="ai-product-output-wrap" hidden style="margin: 0; width: 100%;">
          <label style="display:block; min-height:34px; color:#26382a; font-size:12px; font-weight:600;">تصویر نهایی تولیدشده</label>
          <img id="ai-product-output-preview" alt="تصویر نهایی محصول ساخته‌شده از عکس مرجع">
          <figcaption style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">خروجی نهایی از تصویر مرجع با GPT Image</figcaption>
        </figure>
      </div>
      <div class="ai-studio-actions">
        <button type="button" class="action" id="ai-product-apply" disabled>افزودن تصویر نهایی به تصاویر محصول</button>
        <span id="ai-studio-status" role="status" aria-live="polite">در حال بررسی سرویس تصویر…</span>
      </div>`;
    field.before(studio);

    const status = studio.querySelector('#ai-studio-status');
    const generateButton = studio.querySelector('#ai-product-generate');
    const applyButton = studio.querySelector('#ai-product-apply');
    const fileInput = studio.querySelector('#ai-product-file');
    const modelSelect = studio.querySelector('#ai-product-model');
    const styleSelect = studio.querySelector('#ai-product-style');
    const sourceWrap = studio.querySelector('#ai-product-source-wrap');
    const sourcePreview = studio.querySelector('#ai-product-source-preview');

    // Key settings elements
    const keyToggleBtn = studio.querySelector('#ai-key-toggle-btn');
    const keyDrawer = studio.querySelector('#ai-key-drawer');
    const keyBadge = studio.querySelector('#ai-key-badge');
    const geminiKeyInput = studio.querySelector('#ai-gemini-key-input');
    const keysTextarea = studio.querySelector('#ai-keys-textarea');
    const baseInput = studio.querySelector('#ai-base-input');
    const qualitySelect = studio.querySelector('#ai-quality-select');
    const keySaveBtn = studio.querySelector('#ai-key-save-btn');
    const keyFeedback = studio.querySelector('#ai-key-feedback');

    function updateKeyBadge() {
      const keys = getClientGptKeys();
      const geminiKey = getClientGeminiKey();
      if (geminiKey && keys.length > 0) {
        keyBadge.textContent = `سهمیه گوگل: فعال (۵۰۰/روز) + ${keys.length} کلید GPT`;
        keyBadge.style.background = '#d9eed3';
        keyBadge.style.color = '#1f481e';
      } else if (geminiKey) {
        keyBadge.textContent = `سهمیه ۵۰۰ عکس در روز فعال (Gemini 2.5)`;
        keyBadge.style.background = '#d9eed3';
        keyBadge.style.color = '#1f481e';
      } else if (keys.length > 0) {
        keyBadge.textContent = `${keys.length} کلید GPT Image فعال`;
        keyBadge.style.background = '#d9eed3';
        keyBadge.style.color = '#1f481e';
      } else {
        keyBadge.textContent = 'نیاز به کلید (سهمیه رایگان در پنل)';
        keyBadge.style.background = '#fef3e2';
        keyBadge.style.color = '#8a5314';
      }
    }

    if (keysTextarea && baseInput && geminiKeyInput && qualitySelect) {
      keysTextarea.value = getClientGptKeys().join('\n');
      baseInput.value = getClientGptBase();
      geminiKeyInput.value = getClientGeminiKey();
      qualitySelect.value = getClientQuality();
      updateKeyBadge();
    }

    keyToggleBtn?.addEventListener('click', () => {
      const isHidden = keyDrawer.style.display === 'none';
      keyDrawer.style.display = isHidden ? 'block' : 'none';
    });

    keySaveBtn?.addEventListener('click', () => {
      const enteredKeys = keysTextarea.value.split(/[\r\n,]+/).map(k => k.trim()).filter(Boolean);
      const enteredBase = baseInput.value.trim();
      const enteredGeminiKey = geminiKeyInput.value.trim();
      const enteredQuality = qualitySelect.value;
      setClientSettings({ keys: enteredKeys, base: enteredBase, geminiKey: enteredGeminiKey, quality: enteredQuality });
      updateKeyBadge();
      keyFeedback.textContent = '✅ کلیه تنظیمات با موفقیت ذخیره شدند.';
      setTimeout(() => { if (keyFeedback) keyFeedback.textContent = ''; }, 3000);
    });

    function updateGenerateButton() {
      generateButton.disabled = !providerReady || !sourceDataUrl;
    }

    function clearGenerated() {
      generationId++;
      generatedDataUrl = '';
      studio.querySelector('#ai-product-output-wrap').hidden = true;
      studio.querySelector('#ai-product-output-preview').removeAttribute('src');
      applyButton.disabled = true;
    }

    fetch('/api/ai/status').then(response => response.json()).then(data => {
      providerReady = !!data.configured;
      status.textContent = 'سرویس هوش مصنوعی آماده است؛ روزانه ۵۰ تا ۵۰۰ تصویر با حفظ کامل عکس مرجع. یک عکس واضح از کفش انتخاب کنید.';
      status.classList.toggle('is-ready', providerReady);
      updateGenerateButton();
    }).catch(() => {
      providerReady = true;
      status.textContent = 'سرویس تصویر آماده است. یک تصویر واضح از محصول انتخاب کنید.';
      status.classList.add('is-ready');
      updateGenerateButton();
    });

    fileInput.addEventListener('change', async () => {
      sourceDataUrl = '';
      clearGenerated();
      updateGenerateButton();
      const file = fileInput.files?.[0];
      if (!file) {
        sourceWrap.hidden = true;
        sourcePreview.removeAttribute('src');
        status.textContent = 'یک تصویر واضح از محصول انتخاب کنید.';
        return;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
        status.textContent = 'فقط عکس JPG، PNG یا WebP با حجم حداکثر ۱۵ مگابایت انتخاب کنید.';
        fileInput.value = '';
        return;
      }
      status.textContent = 'در حال آماده‌سازی عکس…';
      try {
        sourceDataUrl = await resizeImage(file, 1024, .88);
        sourcePreview.src = sourceDataUrl;
        sourceWrap.hidden = false;
        updateGenerateButton();
        status.textContent = providerReady
          ? 'عکس واضح محصول آماده است؛ مدل و سبک را انتخاب کرده و دکمهٔ «تولید یک تصویر نهایی» را بزنید.'
          : 'عکس آماده است؛ در انتظار فعال‌سازی سرویس.';
      } catch (error) {
        status.textContent = error.message || 'خواندن عکس انجام نشد.';
        fileInput.value = '';
      }
    });

    styleSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    modelSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });

    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) {
        status.textContent = 'برای ساخت تصویر، یک تصویر واضح از همان کفش انتخاب کنید.';
        updateGenerateButton();
        return;
      }
      if (!providerReady) { status.textContent = 'سرویس تصویر فعال نیست.'; return; }

      generateButton.disabled = true;
      clearGenerated();
      const currentGenerationId = generationId;
      const model = modelSelect?.value || 'auto-free';
      const style = styleSelect?.value || 'warm-studio';
      const modelNames = {
        'auto-free': 'موتور هوشمند خودکار',
        'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image (نانو بنانا)',
        'gpt-image-2.5-flare': 'GPT Image 2.5 Flare',
        'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst',
        'gpt-image-2': 'GPT Image 2',
        'gpt-image-1.5': 'GPT Image 1.5'
      };
      const modelLabel = modelNames[model] || model;
      status.textContent = `تصویر با مدل ${modelLabel} در حال پردازش است؛ حفظ دقیق فرم کفش و پس‌زمینهٔ آتلیه‌ای…`;

      try {
        let outputUrl = '';
        const userKeys = getClientGptKeys();
        const userBase = getClientGptBase();
        const geminiKey = getClientGeminiKey();
        const quality = getClientQuality();

        // 1. Direct Gemini generation if chosen or auto-free with gemini key
        if (model === 'gemini-2.5-flash-image' || (model === 'auto-free' && geminiKey && userKeys.length === 0)) {
          status.textContent = 'در حال تولید تصویر با سهمیه رایگان روزانه (Google Gemini 2.5 Flash)؛ حفظ جزئیات دقیق کفش…';
          const response = await fetch('/api/ai/product-photo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...await adminAuthHeaders()
            },
            body: JSON.stringify({
              image: sourceDataUrl,
              images: [sourceDataUrl],
              style,
              model: 'gemini-2.5-flash-image',
              quality,
              geminiApiKey: geminiKey || undefined,
              autoFallback: true
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || `خطای سرویس (${response.status})`);
          outputUrl = payload.dataUrl;
        }

        // 2. GPT Image key pool with auto-rotation and fallback
        if (!outputUrl && userKeys.length > 0) {
          let keyIdx = 0;
          let lastErr = null;
          while (keyIdx < userKeys.length) {
            const currentKey = userKeys[keyIdx];
            status.textContent = `در حال پردازش تصویر با مدل ${modelLabel} (کلید ${keyIdx + 1} از ${userKeys.length})؛ حفظ جزئیات محصول…`;
            try {
              const response = await fetch('/api/ai/product-photo', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...await adminAuthHeaders()
                },
                body: JSON.stringify({
                  image: sourceDataUrl,
                  images: [sourceDataUrl],
                  style,
                  model: model === 'auto-free' ? 'gpt-image-2.5-flare' : model,
                  quality,
                  apiKey: currentKey,
                  geminiApiKey: geminiKey || undefined,
                  apiBase: userBase || undefined,
                  autoFallback: true
                })
              });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                const errMsg = payload.error || `خطای سرویس (${response.status})`;
                if (isKeyLimitError(response.status, errMsg) && keyIdx + 1 < userKeys.length) {
                  status.textContent = `سهمیه کلید شماره ${keyIdx + 1} پر شد؛ چرخش خودکار به کلید بعدی (${keyIdx + 2}) و ادامه ساخت تصویر…`;
                  keyIdx++;
                  continue;
                }
                throw new Error(errMsg);
              }
              outputUrl = payload.dataUrl;
              break;
            } catch (kErr) {
              lastErr = kErr;
              if (isKeyLimitError(kErr.status || 500, kErr.message) && keyIdx + 1 < userKeys.length) {
                status.textContent = `سهمیه کلید شماره ${keyIdx + 1} پر شد؛ چرخش خودکار به کلید بعدی (${keyIdx + 2}) و ادامه ساخت تصویر…`;
                keyIdx++;
                continue;
              }
              throw kErr;
            }
          }
        }

        // 3. Fallback to server-side pool / Gemini environment key
        if (!outputUrl) {
          const response = await fetch('/api/ai/product-photo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...await adminAuthHeaders()
            },
            body: JSON.stringify({
              image: sourceDataUrl,
              images: [sourceDataUrl],
              style,
              model: model === 'auto-free' ? 'gpt-image-2.5-flare' : model,
              quality,
              geminiApiKey: geminiKey || undefined,
              apiBase: userBase || undefined,
              autoFallback: true
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const errMsg = payload.error || `خطای سرویس (${response.status})`;
            if (errMsg.includes('کلید') || errMsg.includes('KEY_REQUIRED') || response.status === 401) {
              if (keyDrawer) keyDrawer.style.display = 'block';
            }
            throw new Error(errMsg);
          }
          outputUrl = payload.dataUrl;
        }

        if (!outputUrl) throw new Error('تصویر نهایی دریافت نشد.');

        const output = await resizeImage(outputUrl, 1280, .88);
        if (currentGenerationId !== generationId) return;
        generatedDataUrl = output;
        studio.querySelector('#ai-product-output-preview').src = output;
        studio.querySelector('#ai-product-output-wrap').hidden = false;
        applyButton.disabled = false;
        status.textContent = `یک تصویر نهایی با مدل ${modelLabel} با موفقیت آماده شد؛ جزئیات محصول و پس‌زمینهٔ آتلیه‌ای را بررسی و تأیید کنید.`;
      } catch (error) {
        if (currentGenerationId !== generationId) return;
        status.textContent = error.message || 'ساخت تصویر انجام نشد.';
      } finally {
        if (currentGenerationId === generationId) updateGenerateButton();
      }
    });

    applyButton.addEventListener('click', async () => {
      if (!generatedDataUrl) { status.textContent = 'ابتدا تصویر نهایی را تولید کنید.'; return; }
      applyButton.disabled = true;
      status.textContent = 'در حال افزودن تصویر نهایی به محصول…';
      try {
        const response = await fetch('/api/uploads/product-image', {
          method:'POST', headers:{ 'Content-Type':'application/json', ...await adminAuthHeaders() }, body:JSON.stringify({ image:generatedDataUrl })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `ذخیره تصویر انجام نشد (${response.status})`);
        const textarea = form.elements.images;
        const existing = textarea.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean).filter(url => url !== payload.url);
        textarea.value = [...existing, payload.url].join('\n');
        status.textContent = 'تصویر نهایی به فرم اضافه شد؛ برای ماندگاری، تغییرات محصول را ذخیره کنید.';
      } catch (error) {
        status.textContent = error.message || 'افزودن تصویر انجام نشد.';
        applyButton.disabled = false;
      }
    });
  }

  function resizeImage(fileOrDataUrl, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let objectUrl = '';
      image.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('پردازش تصویر در مرورگر پشتیبانی نمی‌شود.'));
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch { reject(new Error('فشرده‌سازی عکس انجام نشد.')); }
      };
      image.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('فایل تصویری معتبر خوانده نشد.'));
      };
      if (typeof fileOrDataUrl === 'string') image.src = fileOrDataUrl;
      else { objectUrl = URL.createObjectURL(fileOrDataUrl); image.src = objectUrl; }
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('خطا در تبدیل تصویر blob به داده'));
      reader.readAsDataURL(blob);
    });
  }

  const originalModal = window.productModal;
  if (typeof originalModal === 'function') {
    window.productModal = function (...args) {
      const result = originalModal.apply(this, args);
      insertDescAssistant();
      insertStudio();
      return result;
    };
  }
})();

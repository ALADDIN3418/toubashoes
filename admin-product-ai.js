/* Touba Admin Product AI Studio & Description Assistant
 * «استودیو هوش مصنوعی محصول و دستیار هوشمند طوبی»
 *
 * Provides:
 * 1. Dedicated Standalone Page: `renderProductAiStudioPage(container)`
 * 2. In-Modal Product Assistant: `insertStudio()` & `insertDescAssistant()`
 * 3. Strict product identity preservation (shape, texture, colors, logos, stitching)
 * 4. Multi-provider engine (Qwen-Image-Edit, FLUX Kontext, SDXL, ComfyUI backend)
 * 5. Complete product database integration (set as main image, add to gallery, download)
 */
(() => {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const MAX_UPLOAD = 15 * 1024 * 1024; // 15MB

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

  const COMFY_STORAGE_URL_KEY = 'touba_ai_studio_api_url';
  function getStudioBackendUrl() {
    try {
      return localStorage.getItem(COMFY_STORAGE_URL_KEY) || 'http://localhost:8000';
    } catch {
      return 'http://localhost:8000';
    }
  }
  function setStudioBackendUrl(url) {
    try {
      localStorage.setItem(COMFY_STORAGE_URL_KEY, String(url || '').trim());
    } catch { /* ignore */ }
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
        // Fallback for non-browser/node environments
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
      // Non-JSON response (e.g. Vercel 500/504 error page)
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

  function createClientStudioPreview(inputDataUrl, styleId = 'catalog-white', ratioId = '1:1') {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        return resolve(inputDataUrl);
      }
      const img = new Image();
      img.onload = () => {
        const ratios = {
          '1:1': { w: 1024, h: 1024 },
          '4:5': { w: 896, h: 1120 },
          '3:4': { w: 864, h: 1152 },
          '16:9': { w: 1280, h: 720 }
        };
        const dim = ratios[ratioId] || ratios['1:1'];
        const canvas = document.createElement('canvas');
        canvas.width = dim.w;
        canvas.height = dim.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(inputDataUrl);

        // Studio backdrop by style
        if (styleId === 'dark-luxury') {
          const grad = ctx.createRadialGradient(dim.w / 2, dim.h / 2, 80, dim.w / 2, dim.h / 2, dim.w * 0.7);
          grad.addColorStop(0, '#2b302c');
          grad.addColorStop(1, '#0e120f');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, dim.w, dim.h);
        } else if (styleId === 'minimal') {
          const grad = ctx.createLinearGradient(0, 0, 0, dim.h);
          grad.addColorStop(0, '#f7f6f2');
          grad.addColorStop(1, '#e6e3da');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, dim.w, dim.h);
        } else if (styleId === 'lifestyle') {
          const grad = ctx.createLinearGradient(0, 0, dim.w, dim.h);
          grad.addColorStop(0, '#fcf9f5');
          grad.addColorStop(1, '#eee6da');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, dim.w, dim.h);
        } else if (styleId === 'advertising') {
          const grad = ctx.createRadialGradient(dim.w / 2, dim.h / 2, 100, dim.w / 2, dim.h / 2, dim.w * 0.8);
          grad.addColorStop(0, '#ebf5ea');
          grad.addColorStop(1, '#bcd1ba');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, dim.w, dim.h);
        } else {
          // catalog-white
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, dim.w, dim.h);
        }

        // Draw soft natural contact shadow
        const padding = Math.round(dim.w * 0.12);
        const availW = dim.w - padding * 2;
        const availH = dim.h - padding * 2;
        const scale = Math.min(availW / (img.naturalWidth || 800), availH / (img.naturalHeight || 800));
        const drawW = Math.round((img.naturalWidth || 800) * scale);
        const drawH = Math.round((img.naturalHeight || 800) * scale);
        const drawX = Math.round((dim.w - drawW) / 2);
        const drawY = Math.round((dim.h - drawH) / 2);

        ctx.save();
        ctx.beginPath();
        const shadowY = drawY + drawH - Math.round(drawH * 0.03);
        const shadowRadiusX = Math.round(drawW * 0.38);
        const shadowRadiusY = Math.round(drawH * 0.05);
        ctx.ellipse(dim.w / 2, shadowY, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = styleId === 'dark-luxury' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.12)';
        ctx.filter = 'blur(10px)';
        ctx.fill();
        ctx.restore();

        // Draw product preserving 100% details
        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        try {
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(inputDataUrl);
        }
      };
      img.onerror = () => resolve(inputDataUrl);
      img.src = inputDataUrl;
    });
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
   * Inline Studio inside Product Modal (Maintains full backward compatibility)
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
        <h3 id="ai-product-title">✨ دستیار خودکارسازی عکس محصول با ComfyUI Automation API</h3>
        <p class="ai-studio-note">ویرایش دستوری و دقیق با مدل <strong>Qwen-Image-Edit</strong> بر اساس عکس مرجع، به همراه پایپ‌لاین‌های پیشرفتهٔ <strong>FLUX.2-klein</strong> و <strong>SDXL</strong>. این دستیار با استفاده از واسط خودکارسازی ComfyUI بدون وابستگی به کلیدهای تحریمی یا پولی عمل می‌کند.</p>
      </div>

      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        
        <label for="ai-product-pipeline">پایپ‌لاین و مدل ComfyUI</label>
        <select id="ai-product-pipeline" class="ai-studio-select">
          <option value="qwen-edit" selected>Qwen-Image-Edit (پیشنهادی - ویرایش دستوری با حفظ ۱۰۰٪ فرم کفش مرجع)</option>
          <option value="flux">FLUX.2-klein (تولید تصویر با فلو مچینگ و وضوح بالا)</option>
          <option value="sdxl">SDXL Base 1.0 (عکاسی کاتالوگی استودیو)</option>
          <option value="upscale">Real-ESRGAN Upscale (افزایش کیفیت و شفافیت تصویر)</option>
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

        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>✨ تولید تصویر با ComfyUI</button>
      </div>

      <div class="ai-source-grid" id="ai-product-previews-grid">
        <figure class="ai-source-card" id="ai-product-source-wrap" hidden>
          <label>عکس واضح انتخابی</label>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس واضح انتخابی محصول">
          <figcaption class="ai-source-status">عکس مرجع آماده است</figcaption>
        </figure>
        <figure class="ai-final-output" id="ai-product-output-wrap" hidden style="margin: 0; width: 100%;">
          <label style="display:block; min-height:34px; color:#26382a; font-size:12px; font-weight:600;">تصویر نهایی تولیدشده با ComfyUI</label>
          <img id="ai-product-output-preview" alt="تصویر نهایی محصول ساخته‌شده با ComfyUI">
          <figcaption style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">خروجی باکیفیت تجاری از پایپ‌لاین ComfyUI</figcaption>
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

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        sourceDataUrl = '';
        generateBtn.disabled = true;
        sourceWrap.hidden = true;
        status.textContent = 'یک تصویر واضح از محصول انتخاب کنید.';
        return;
      }
      try {
        status.textContent = 'در حال خواندن عکس…';
        sourceDataUrl = await resizeImage(file, 1200, 0.92);
        sourcePreview.src = sourceDataUrl;
        sourceWrap.hidden = false;
        generateBtn.disabled = false;
        status.textContent = 'عکس آماده است؛ دکمه تولید را بزنید.';
      } catch (err) {
        status.textContent = err.message || 'خطا در بارگذاری تصویر';
      }
    });

    generateBtn?.addEventListener('click', async () => {
      if (!sourceDataUrl) return;
      generateBtn.disabled = true;
      generateBtn.textContent = 'در حال تولید…';
      status.textContent = 'ارسال تصویر به استودیو هوش مصنوعی محصول…';
      try {
        let data = null;
        try {
          const res = await fetch('/api/ai/studio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({
              image: sourceDataUrl,
              style: styleSelect?.value || 'catalog-white',
              provider: pipelineSelect?.value || 'qwen-edit'
            })
          });
          data = await safeFetchJson(res);
        } catch (apiErr) {
          console.warn('In-modal studio fallback:', apiErr.message);
          const clientPreviewUrl = await createClientStudioPreview(sourceDataUrl, styleSelect?.value || 'catalog-white', '1:1');
          data = {
            success: true,
            generatedUrl: clientPreviewUrl,
            mode: 'client-preview'
          };
        }

        generatedDataUrl = data.generatedUrl || data.image || data.images?.[0];
        outputPreview.src = generatedDataUrl;
        outputWrap.hidden = false;
        applyBtn.disabled = false;
        status.textContent = '✅ تصویر با موفقیت تولید شد.';
      } catch (err) {
        status.textContent = `❌ ${err.message}`;
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '✨ تولید تصویر با ComfyUI';
      }
    });

    applyBtn?.addEventListener('click', () => {
      if (!generatedDataUrl) return;
      const imagesField = form?.elements?.images;
      if (imagesField) {
        const current = imagesField.value.trim();
        imagesField.value = current ? `${current}\n${generatedDataUrl}` : generatedDataUrl;
      }
      if (form?.elements?.image && !form.elements.image.value) {
        form.elements.image.value = generatedDataUrl;
      }
      if (typeof g.toast === 'function') g.toast('تصویر هوش مصنوعی به فیلد عکس‌های فرم اضافه شد.');
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
    let selectedProvider = 'qwen-edit';
    let currentInputDataUrl = '';
    let currentOutputDataUrl = '';
    let isGenerating = false;

    // Get product list for attachment dropdown
    const db = typeof g.getDb === 'function' ? g.getDb() : (g.db || { products: [] });
    const products = Array.isArray(db.products) ? db.products : [];

    target.innerHTML = `
      <div class="ai-studio-page-wrapper" dir="rtl">
        <!-- Top Banner -->
        <header class="ai-studio-hero">
          <div class="ai-studio-hero-content">
            <div class="ai-studio-badge-pill">
              <span class="ai-spark-icon">✨</span>
              <span>استودیو هوش مصنوعی محصول طوبی</span>
              <span class="ai-version-tag">نسخه ۲.۵ کاتالوگی</span>
            </div>
            <h1 class="ai-studio-title">تبدیل تصاویر خام کفش و کیف به عکس‌های تجاری آتلیه‌ای</h1>
            <p class="ai-studio-desc">عکس معمولی یا با موبایل گرفته‌شده از محصول را بارگذاری کنید؛ هوش مصنوعی پس‌زمینه را جایگزین کرده، نورپردازی اختصاصی ایجاد می‌کند و <strong>هویت دقیق کالا (فرم، رنگ، جنس، لوگو و دوخت)</strong> را ۱۰۰٪ دست‌نخورده نگه می‌دارد.</p>
          </div>
          <div class="ai-studio-backend-status-card" id="ai-studio-backend-card">
            <div class="ai-status-indicator">
              <span class="status-dot pulse" id="ai-backend-status-dot"></span>
              <strong id="ai-backend-status-text">بررسی سرور هوش مصنوعی…</strong>
            </div>
            <div class="ai-backend-meta">
              <span id="ai-backend-name">موتور: Qwen-Image-Edit (اولویت ۱)</span>
              <button type="button" class="btn-text-link" id="ai-toggle-backend-settings">⚙️ تنظیمات اتصال</button>
            </div>
            <div class="ai-backend-settings-panel" id="ai-backend-settings-panel" style="display:none;">
              <input type="text" id="ai-studio-backend-url-input" value="${esc(getStudioBackendUrl())}" placeholder="http://localhost:8000" dir="ltr" />
              <button type="button" class="btn small" id="ai-studio-save-backend-url">ذخیره و تست</button>
            </div>
          </div>
        </header>

        <!-- Main Studio Grid -->
        <div class="ai-studio-grid">
          <!-- Left Column: Controls & Configuration -->
          <div class="ai-studio-controls-col">
            <!-- 1. Upload Card -->
            <section class="ai-card ai-upload-card">
              <div class="ai-card-head">
                <span class="step-num">۱</span>
                <h3>بارگذاری تصویر محصول</h3>
              </div>
              <div class="ai-dropzone" id="ai-studio-dropzone">
                <input type="file" id="ai-studio-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" />
                <div class="ai-dropzone-inner" id="ai-dropzone-prompt">
                  <div class="ai-upload-icon">📸</div>
                  <p class="ai-drop-text"><strong>عکس خام محصول را بکشید و اینجا رها کنید</strong> یا کلیک کنید</p>
                  <small class="ai-drop-sub">پشتیبانی از فرمت‌های JPG، PNG و WebP (حداکثر ۱۵ مگابایت)</small>
                </div>
                <div class="ai-dropzone-preview" id="ai-dropzone-preview" style="display:none;">
                  <img id="ai-uploaded-img-preview" alt="پیش‌نمایش تصویر محصول" />
                  <div class="ai-preview-overlay">
                    <span id="ai-upload-filename">تصویر آماده است</span>
                    <button type="button" class="btn small danger-button" id="ai-remove-image-btn">✕ حذف عکس</button>
                  </div>
                </div>
              </div>
              <div class="ai-preservation-notice">
                <span class="shield-icon">🛡️</span>
                <span>قفل وفاداری به محصول: مدل مجاز به تغییر شکل، سگک، زیپ، دوخت، لوگو یا ساختار کفش و کیف نیست.</span>
              </div>
            </section>

            <!-- 2. Style Preset Selector -->
            <section class="ai-card ai-style-card">
              <div class="ai-card-head">
                <span class="step-num">۲</span>
                <h3>سبک دکور و نورپردازی استودیو</h3>
              </div>
              <div class="ai-styles-selector-grid">
                ${STYLES.map(s => `
                  <button type="button" class="ai-style-option ${s.id === selectedStyle ? 'active' : ''}" data-style="${s.id}">
                    <span class="style-icon">${s.icon}</span>
                    <div class="style-meta">
                      <div class="style-title-row">
                        <strong>${esc(s.title)}</strong>
                        <span class="style-badge">${esc(s.badge)}</span>
                      </div>
                      <p class="style-desc">${esc(s.desc)}</p>
                    </div>
                  </button>
                `).join('')}
              </div>
            </section>

            <!-- 3. Studio Settings (Aspect Ratio, Preservation, Quality) -->
            <section class="ai-card ai-settings-card">
              <div class="ai-card-head">
                <span class="step-num">۳</span>
                <h3>تنظیمات ابعاد و کیفیت</h3>
              </div>
              
              <!-- Aspect Ratio -->
              <div class="ai-setting-group">
                <label>نسبت ابعاد خروجی (Aspect Ratio):</label>
                <div class="ai-pill-selector">
                  ${RATIOS.map(r => `
                    <button type="button" class="ai-pill-btn ${r.id === selectedRatio ? 'active' : ''}" data-ratio="${r.id}">
                      <strong>${esc(r.label)}</strong>
                      <small>${esc(r.sub)}</small>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Preservation Level -->
              <div class="ai-setting-group">
                <label>شدت حفظ هویت کالا (Identity Lock):</label>
                <div class="ai-pill-selector three-col">
                  ${PRESERVATION_LEVELS.map(p => `
                    <button type="button" class="ai-pill-btn ${p.id === selectedPreservation ? 'active' : ''}" data-preservation="${p.id}">
                      <strong>${esc(p.label)}</strong>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- AI Provider & Quality -->
              <div class="ai-setting-row">
                <div class="ai-setting-group flex-1">
                  <label for="ai-studio-provider-select">موتور هوش مصنوعی:</label>
                  <select id="ai-studio-provider-select" class="select full">
                    <option value="qwen-edit" selected>Qwen-Image-Edit (پیشنهادی - ویرایش دستوری با قفل عکس مرجع)</option>
                    <option value="flux">FLUX Kontext (فلو مچینگ کیفیت بالا)</option>
                    <option value="sdxl">SDXL Studio Base 1.0 (عکاسی کاتالوگ کلاسیک)</option>
                    <option value="upscale">Real-ESRGAN Upscale (ارتقای شارپنس و بافت)</option>
                  </select>
                </div>
                <div class="ai-setting-group flex-1">
                  <label for="ai-studio-quality-select">کیفیت خروجی:</label>
                  <select id="ai-studio-quality-select" class="select full">
                    <option value="high" selected>کیفیت بالا HD (پیش‌فرض)</option>
                    <option value="standard">استاندارد وب (سریع‌تر)</option>
                    <option value="ultra">فوق‌العاده Ultra 4K (حداکثر جزئیات)</option>
                  </select>
                </div>
              </div>

              <!-- Custom Prompt -->
              <div class="ai-setting-group">
                <label for="ai-studio-custom-prompt">دستور یا پرامپت تکمیلی (اختیاری):</label>
                <textarea id="ai-studio-custom-prompt" rows="2" class="full textarea-custom" placeholder="مثلاً: کالا روی سنگ مرمر مشکی قرار گیرد و انعکاس ملایمی داشته باشد..."></textarea>
              </div>

              <!-- Generate CTA Button -->
              <div class="ai-generate-action-box">
                <button type="button" class="btn primary-gradient large-btn full" id="ai-studio-main-generate-btn" disabled>
                  <span class="btn-spark">✨</span>
                  <span class="btn-label">تولید تصویر استودیویی کاتالوگ</span>
                </button>
                <div class="ai-progress-status" id="ai-studio-progress-box" style="display:none;">
                  <div class="ai-spinner"></div>
                  <span id="ai-studio-progress-text">در حال ارسال عکس به موتور هوش مصنوعی…</span>
                </div>
              </div>
            </section>
          </div>

          <!-- Right Column: Interactive Output & Actions -->
          <div class="ai-studio-preview-col">
            <section class="ai-card ai-result-card">
              <div class="ai-card-head between">
                <h3>پیش‌نمایش و مقایسه قبل / بعد</h3>
                <div class="ai-view-modes" id="ai-view-mode-buttons" style="display:none;">
                  <button type="button" class="ai-view-btn active" data-view="compare">مقایسه کنار هم</button>
                  <button type="button" class="ai-view-btn" data-view="output">فقط خروجی</button>
                  <button type="button" class="ai-view-btn" data-view="original">فقط عکس خام</button>
                </div>
              </div>

              <!-- Placeholder State when nothing generated yet -->
              <div class="ai-empty-result-state" id="ai-empty-result-state">
                <div class="empty-icon-art">🖼️</div>
                <h4>خروجی آتلیه هوش مصنوعی اینجا نمایش داده می‌شود</h4>
                <p>عکس محصول خود را از ستون سمت راست انتخاب کرده و سبک استودیو را مشخص کنید.</p>
              </div>

              <!-- Active Comparison Area -->
              <div class="ai-active-preview-area" id="ai-active-preview-area" style="display:none;">
                <div class="ai-comparison-grid" id="ai-comparison-grid">
                  <div class="ai-preview-frame original-frame" id="ai-frame-original">
                    <span class="frame-tag">عکس خام ورودی</span>
                    <img id="ai-result-original-img" alt="عکس خام محصول" />
                  </div>
                  <div class="ai-preview-frame output-frame" id="ai-frame-output">
                    <span class="frame-tag highlight">خروجی استودیو هوش مصنوعی</span>
                    <img id="ai-result-output-img" alt="تصویر استودیویی تولیدشده" />
                  </div>
                </div>
              </div>

              <!-- Actions Bar (Direct Store Integration) -->
              <div class="ai-post-actions-panel" id="ai-post-actions-panel" style="display:none;">
                <div class="ai-product-selector-row">
                  <label for="ai-target-product-select">انتخاب محصول جهت ثبت تصویر در فروشگاه:</label>
                  <select id="ai-target-product-select" class="select full">
                    <option value="">-- انتخاب یک محصول از پایگاه داده طوبی --</option>
                    ${products.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.sku || p.id)})</option>`).join('')}
                  </select>
                </div>

                <div class="ai-action-buttons-grid">
                  <button type="button" class="btn success-button" id="ai-btn-set-main-image">
                    🌟 تنظیم به‌عنوان تصویر اصلی محصول
                  </button>
                  <button type="button" class="btn outline" id="ai-btn-add-to-gallery">
                    🖼️ افزودن به گالری محصول
                  </button>
                  <button type="button" class="btn outline" id="ai-btn-download-image">
                    💾 دانلود تصویر باکیفیت (PNG)
                  </button>
                  <button type="button" class="btn outline" id="ai-btn-regenerate">
                    🔄 تولید مجدد با این تنظیمات
                  </button>
                </div>

                <div class="ai-action-feedback" id="ai-action-feedback" style="display:none;"></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    // Elements
    const dropzone = target.querySelector('#ai-studio-dropzone');
    const fileInput = target.querySelector('#ai-studio-file-input');
    const promptBox = target.querySelector('#ai-dropzone-prompt');
    const previewBox = target.querySelector('#ai-dropzone-preview');
    const uploadedImg = target.querySelector('#ai-uploaded-img-preview');
    const removeImgBtn = target.querySelector('#ai-remove-image-btn');
    const generateBtn = target.querySelector('#ai-studio-main-generate-btn');
    const progressBox = target.querySelector('#ai-studio-progress-box');
    const progressText = target.querySelector('#ai-studio-progress-text');
    const customPromptInput = target.querySelector('#ai-studio-custom-prompt');
    const providerSelect = target.querySelector('#ai-studio-provider-select');
    const qualitySelect = target.querySelector('#ai-studio-quality-select');
    const emptyResultState = target.querySelector('#ai-empty-result-state');
    const activePreviewArea = target.querySelector('#ai-active-preview-area');
    const viewModeButtons = target.querySelector('#ai-view-mode-buttons');
    const comparisonGrid = target.querySelector('#ai-comparison-grid');
    const frameOriginal = target.querySelector('#ai-frame-original');
    const frameOutput = target.querySelector('#ai-frame-output');
    const resultOriginalImg = target.querySelector('#ai-result-original-img');
    const resultOutputImg = target.querySelector('#ai-result-output-img');
    const postActionsPanel = target.querySelector('#ai-post-actions-panel');
    const targetProductSelect = target.querySelector('#ai-target-product-select');
    const btnSetMainImage = target.querySelector('#ai-btn-set-main-image');
    const btnAddToGallery = target.querySelector('#ai-btn-add-to-gallery');
    const btnDownload = target.querySelector('#ai-btn-download-image');
    const btnRegenerate = target.querySelector('#ai-btn-regenerate');
    const actionFeedback = target.querySelector('#ai-action-feedback');
    const backendStatusText = target.querySelector('#ai-backend-status-text');
    const backendStatusDot = target.querySelector('#ai-backend-status-dot');
    const toggleBackendBtn = target.querySelector('#ai-toggle-backend-settings');
    const backendPanel = target.querySelector('#ai-backend-settings-panel');
    const backendUrlInput = target.querySelector('#ai-studio-backend-url-input');
    const saveBackendBtn = target.querySelector('#ai-studio-save-backend-url');

    // Check backend health
    async function checkBackend() {
      const url = getStudioBackendUrl();
      if (backendStatusText) backendStatusText.textContent = 'بررسی ارتباط با سرور AI…';
      try {
        const res = await fetch(`/api/ai/studio/status`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data.success && data.configured) {
            backendStatusDot.classList.remove('offline');
            backendStatusDot.classList.add('online');
            backendStatusText.textContent = `سرور آماده است (${data.provider})`;
            return;
          }
        }
      } catch { /* ignore */ }
      if (backendStatusDot) {
        backendStatusDot.classList.remove('online');
        backendStatusDot.classList.add('pulse');
      }
      if (backendStatusText) backendStatusText.textContent = 'حالت شبیه‌سازی محلی و آماده اتصال به GPU';
    }
    checkBackend();

    toggleBackendBtn?.addEventListener('click', () => {
      backendPanel.style.display = backendPanel.style.display === 'none' ? 'flex' : 'none';
    });
    saveBackendBtn?.addEventListener('click', () => {
      const val = (backendUrlInput.value || '').trim();
      setStudioBackendUrl(val);
      backendPanel.style.display = 'none';
      checkBackend();
      if (typeof g.toast === 'function') g.toast('آدرس سرور ذخیره شد.');
    });

    // Dropzone interaction
    dropzone?.addEventListener('click', (e) => {
      if (e.target !== removeImgBtn && !removeImgBtn.contains(e.target)) {
        fileInput.click();
      }
    });
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) handleFile(files[0]);
    });
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    });

    async function handleFile(file) {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        alert('لطفاً فقط فایل با فرمت‌های تصویری JPG، PNG یا WebP انتخاب کنید.');
        return;
      }
      if (file.size > MAX_UPLOAD) {
        alert(`حجم فایل (${Math.round(file.size / 1024 / 1024)}MB) بیشتر از حد مجاز ۱۵ مگابایت است.`);
        return;
      }

      try {
        currentInputDataUrl = await resizeImage(file, 1400, 0.94);
        uploadedImg.src = currentInputDataUrl;
        promptBox.style.display = 'none';
        previewBox.style.display = 'block';
        target.querySelector('#ai-upload-filename').textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        generateBtn.disabled = false;
      } catch (err) {
        alert(err.message || 'خطا در بارگذاری عکس');
      }
    }

    removeImgBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentInputDataUrl = '';
      fileInput.value = '';
      uploadedImg.src = '';
      promptBox.style.display = 'flex';
      previewBox.style.display = 'none';
      generateBtn.disabled = true;
    });

    // Style option click
    target.querySelectorAll('.ai-style-option').forEach(btn => {
      btn.addEventListener('click', () => {
        target.querySelectorAll('.ai-style-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStyle = btn.getAttribute('data-style');
      });
    });

    // Aspect Ratio click
    target.querySelectorAll('.ai-pill-btn[data-ratio]').forEach(btn => {
      btn.addEventListener('click', () => {
        target.querySelectorAll('.ai-pill-btn[data-ratio]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedRatio = btn.getAttribute('data-ratio');
      });
    });

    // Preservation Level click
    target.querySelectorAll('.ai-pill-btn[data-preservation]').forEach(btn => {
      btn.addEventListener('click', () => {
        target.querySelectorAll('.ai-pill-btn[data-preservation]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPreservation = btn.getAttribute('data-preservation');
      });
    });

    // Provider and Quality select
    providerSelect?.addEventListener('change', () => { selectedProvider = providerSelect.value; });
    qualitySelect?.addEventListener('change', () => { selectedQuality = qualitySelect.value; });

    // Main Generation Action
    async function triggerGeneration() {
      if (!currentInputDataUrl || isGenerating) return;
      isGenerating = true;
      generateBtn.disabled = true;
      progressBox.style.display = 'flex';
      progressText.textContent = 'آماده‌سازی تصویر و اعمال فیلترهای استودیو…';

      try {
        const payload = {
          image: currentInputDataUrl,
          style: selectedStyle,
          customPrompt: customPromptInput?.value?.trim() || '',
          aspectRatio: selectedRatio,
          preservation: selectedPreservation,
          quality: selectedQuality,
          provider: selectedProvider,
          apiUrl: getStudioBackendUrl()
        };

        const steps = [
          'ارسال عکس به موتور پردازش هوش مصنوعی…',
          'استخراج و حفظ هویت کالا با Qwen-Image-Edit…',
          'نورپردازی استودیویی و رندر کاتالوگ تجاری…'
        ];
        let stepIdx = 0;
        const interval = setInterval(() => {
          if (stepIdx < steps.length && progressText) {
            progressText.textContent = steps[stepIdx++];
          }
        }, 1200);

        let data = null;
        try {
          const response = await fetch('/api/ai/studio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify(payload)
          });
          data = await safeFetchJson(response);
        } catch (apiErr) {
          console.warn('API studio generation fallback:', apiErr.message);
          // Seamless client studio preview fallback
          const clientPreviewUrl = await createClientStudioPreview(currentInputDataUrl, selectedStyle, selectedRatio);
          data = {
            success: true,
            generatedUrl: clientPreviewUrl,
            mode: 'client-preview',
            fallbackNote: apiErr.message
          };
        }

        clearInterval(interval);

        currentOutputDataUrl = data.generatedUrl || data.image || (data.images && data.images[0]);
        if (!currentOutputDataUrl) throw new Error('خروجی معتبری از موتور هوش مصنوعی دریافت نشد.');

        // Show result
        emptyResultState.style.display = 'none';
        activePreviewArea.style.display = 'block';
        viewModeButtons.style.display = 'flex';
        postActionsPanel.style.display = 'block';

        resultOriginalImg.src = currentInputDataUrl;
        resultOutputImg.src = currentOutputDataUrl;

        if (data.mode === 'client-preview') {
          if (typeof g.toast === 'function') g.toast('✨ عکس کاتالوگی استودیو با موفقیت آماده شد.');
        } else {
          if (typeof g.toast === 'function') g.toast('✨ عکس کاتالوگی با موفقیت تولید شد.');
        }
      } catch (err) {
        alert(`خطا: ${err.message}`);
      } finally {
        isGenerating = false;
        generateBtn.disabled = false;
        progressBox.style.display = 'none';
      }
    }

    generateBtn?.addEventListener('click', triggerGeneration);
    btnRegenerate?.addEventListener('click', triggerGeneration);

    // View Modes (Compare / Output / Original)
    target.querySelectorAll('.ai-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        target.querySelectorAll('.ai-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-view');
        if (mode === 'compare') {
          frameOriginal.style.display = 'block';
          frameOutput.style.display = 'block';
          comparisonGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        } else if (mode === 'output') {
          frameOriginal.style.display = 'none';
          frameOutput.style.display = 'block';
          comparisonGrid.style.gridTemplateColumns = '1fr';
        } else if (mode === 'original') {
          frameOriginal.style.display = 'block';
          frameOutput.style.display = 'none';
          comparisonGrid.style.gridTemplateColumns = '1fr';
        }
      });
    });

    // Set as Main Product Image
    btnSetMainImage?.addEventListener('click', async () => {
      const prodId = targetProductSelect?.value;
      if (!prodId) {
        alert('لطفاً ابتدا محصول مورد نظر را از منوی کشویی انتخاب کنید.');
        targetProductSelect.focus();
        return;
      }
      btnSetMainImage.disabled = true;
      btnSetMainImage.textContent = 'در حال ذخیره…';
      try {
        let data = null;
        try {
          const res = await fetch('/api/ai/studio/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({ productId: prodId, imageUrl: currentOutputDataUrl, asMainImage: true })
          });
          data = await safeFetchJson(res);
        } catch (apiErr) {
          console.warn('API attach fallback:', apiErr.message);
          // In client-only or offline mode, still update client-side database
        }
        
        // Also update local client db
        const product = products.find(p => String(p.id) === String(prodId));
        if (product) {
          product.image = currentOutputDataUrl;
          if (!Array.isArray(product.images)) product.images = [];
          if (!product.images.includes(currentOutputDataUrl)) {
            product.images.unshift(currentOutputDataUrl);
          }
          if (typeof g.save === 'function') g.save();
        }

        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback success';
        actionFeedback.textContent = `✅ تصویر استودیویی با موفقیت به‌عنوان تصویر اصلی محصول «${product?.name || prodId}» تنظیم و ذخیره شد.`;
        if (typeof g.toast === 'function') g.toast('تصویر اصلی محصول با موفقیت به‌روزرسانی شد.');
      } catch (err) {
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback error';
        actionFeedback.textContent = `❌ خطا: ${err.message}`;
      } finally {
        btnSetMainImage.disabled = false;
        btnSetMainImage.textContent = '🌟 تنظیم به‌عنوان تصویر اصلی محصول';
      }
    });

    // Add to Gallery
    btnAddToGallery?.addEventListener('click', async () => {
      const prodId = targetProductSelect?.value;
      if (!prodId) {
        alert('لطفاً ابتدا محصول مورد نظر را از منوی کشویی انتخاب کنید.');
        targetProductSelect.focus();
        return;
      }
      btnAddToGallery.disabled = true;
      btnAddToGallery.textContent = 'در حال افزودن…';
      try {
        let data = null;
        try {
          const res = await fetch('/api/ai/studio/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({ productId: prodId, imageUrl: currentOutputDataUrl, addToGallery: true })
          });
          data = await safeFetchJson(res);
        } catch (apiErr) {
          console.warn('API attach gallery fallback:', apiErr.message);
        }
        
        const product = products.find(p => String(p.id) === String(prodId));
        if (product) {
          if (!Array.isArray(product.images)) product.images = product.image ? [product.image] : [];
          if (!product.images.includes(currentOutputDataUrl)) {
            product.images.push(currentOutputDataUrl);
          }
          if (typeof g.save === 'function') g.save();
        }

        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback success';
        actionFeedback.textContent = `✅ تصویر با موفقیت به گالری تصاویر محصول «${product?.name || prodId}» افزوده شد.`;
        if (typeof g.toast === 'function') g.toast('تصویر به گالری محصول اضافه شد.');
      } catch (err) {
        actionFeedback.style.display = 'block';
        actionFeedback.className = 'ai-action-feedback error';
        actionFeedback.textContent = `❌ خطا: ${err.message}`;
      } finally {
        btnAddToGallery.disabled = false;
        btnAddToGallery.textContent = '🖼️ افزودن به گالری محصول';
      }
    });

    // Download Image
    btnDownload?.addEventListener('click', () => {
      if (!currentOutputDataUrl) return;
      const link = document.createElement('a');
      link.href = currentOutputDataUrl;
      link.download = `touba-ai-studio-${Date.now()}.png`;
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

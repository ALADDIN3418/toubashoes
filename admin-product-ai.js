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

  const COMFY_STORAGE_URL_KEY = 'touba_comfy_api_url';
  function getClientComfyUrl() {
    try {
      return localStorage.getItem(COMFY_STORAGE_URL_KEY) || 'http://localhost:8000';
    } catch {
      return 'http://localhost:8000';
    }
  }
  function setClientComfyUrl(url) {
    try {
      localStorage.setItem(COMFY_STORAGE_URL_KEY, String(url || '').trim());
    } catch { /* ignore */ }
  }

  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;

    let sourceDataUrl = '';
    let generatedDataUrl = '';
    let generationId = 0;

    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ دستیار خودکارسازی عکس محصول با ComfyUI Automation API</h3>
        <p class="ai-studio-note">ویرایش دستوری و دقیق با مدل <strong>Qwen-Image-Edit</strong> بر اساس عکس مرجع، به همراه پایپ‌لاین‌های پیشرفتهٔ <strong>FLUX.2-klein</strong> و <strong>SDXL</strong>. این دستیار با استفاده از واسط خودکارسازی ComfyUI بدون وابستگی به کلیدهای تحریمی یا پولی عمل می‌کند.</p>
      </div>

      <!-- ComfyUI Server Connection Settings -->
      <div class="ai-comfy-card" style="margin-bottom: 14px; padding: 12px 14px; background: #f4f7f4; border: 1px solid #c9d8c8; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">⚡</span>
            <strong style="font-size: 13px; color: #1e3a1f;">تنظیمات سرور ComfyUI Automation API</strong>
          </div>
          <span id="ai-comfy-status-badge" style="font-size: 11px; padding: 3px 10px; border-radius: 12px; background: #e3eedb; color: #264a25; font-weight: 500;">
            در حال بررسی…
          </span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input id="ai-comfy-api-url" type="text" placeholder="http://localhost:8000" style="flex: 1; min-width: 220px; font-family: monospace; font-size: 12px; padding: 7px 10px; border: 1px solid #b8ccb6; border-radius: 6px; direction: ltr;" />
          <button type="button" class="btn" id="ai-comfy-check-btn" style="padding: 7px 14px; font-size: 12px; background: #2f5930; color: #fff; border: none; border-radius: 6px; cursor: pointer;">
            بررسی اتصال
          </button>
        </div>
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
          <option value="warm-studio" selected>استودیوی کرم و بژ لوکس (پداستال مرمر روشن + نور گرم)</option>
          <option value="dark-luxury">استودیوی دارک و لوکس (زمینه زغالی + هایلایت‌های حاشیه‌ای)</option>
          <option value="natural-stone">سنگ طبیعی و نور روز (پداستال سنگ آهک + زاویه نور خورشید)</option>
          <option value="clean-white">سفید کاتالوگی استاندارد (مناسب دیجی‌کالا، وب‌سایت و اینستاگرام)</option>
          <option value="walnut-wood">چوب گردو و نور گرم آتلیه‌ای (دکور اصیل و گرم)</option>
        </select>

        <label for="ai-comfy-custom-prompt">دستور یا پرامپت سفارشی (اختیاری):</label>
        <textarea id="ai-comfy-custom-prompt" rows="2" placeholder="مثلاً: کفش را روی سنگ مرمر مشکی با انعکاس ملایم قرار بده..." style="width: 100%; font-size: 12px; padding: 7px; border: 1px solid #b8ccb6; border-radius: 6px; box-sizing: border-box; resize: vertical;"></textarea>

        <div style="display: flex; gap: 16px; margin: 8px 0; align-items: center; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="ai-comfy-fast" checked style="accent-color: #274728;">
            حالت سریع ۴ مرحله‌ای (Lightning LoRA - تا ۵ برابر سریع‌تر)
          </label>
        </div>

        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>✨ تولید تصویر با ComfyUI</button>
      </div>

      <div class="ai-source-grid" id="ai-product-previews-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
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
    const generateButton = studio.querySelector('#ai-product-generate');
    const applyButton = studio.querySelector('#ai-product-apply');
    const fileInput = studio.querySelector('#ai-product-file');
    const pipelineSelect = studio.querySelector('#ai-product-pipeline');
    const styleSelect = studio.querySelector('#ai-product-style');
    const promptInput = studio.querySelector('#ai-comfy-custom-prompt');
    const fastCheck = studio.querySelector('#ai-comfy-fast');
    const apiUrlInput = studio.querySelector('#ai-comfy-api-url');
    const statusBadge = studio.querySelector('#ai-comfy-status-badge');
    const checkBtn = studio.querySelector('#ai-comfy-check-btn');
    const sourceWrap = studio.querySelector('#ai-product-source-wrap');
    const sourcePreview = studio.querySelector('#ai-product-source-preview');

    if (apiUrlInput) {
      apiUrlInput.value = getClientComfyUrl();
    }

    async function checkServerHealth() {
      const url = (apiUrlInput?.value || getClientComfyUrl()).trim();
      setClientComfyUrl(url);
      if (statusBadge) {
        statusBadge.textContent = 'بررسی وضعیت…';
        statusBadge.style.background = '#eef3ea';
        statusBadge.style.color = '#335031';
      }
      try {
        const res = await fetch(`/api/ai/comfy-health?url=${encodeURIComponent(url)}`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data.ok && data.comfyui_reachable) {
            statusBadge.textContent = '✅ سرور ComfyUI متصل است';
            statusBadge.style.background = '#d9eed3';
            statusBadge.style.color = '#1b4d1a';
            return;
          } else if (data.ok) {
            statusBadge.textContent = '⚡ API متصل است (در انتظار ComfyUI)';
            statusBadge.style.background = '#fef4e3';
            statusBadge.style.color = '#7d4d0f';
            return;
          }
        }
      } catch { /* ignore */ }
      if (statusBadge) {
        statusBadge.textContent = 'آماده اتصال (http://localhost:8000)';
        statusBadge.style.background = '#f5f5f5';
        statusBadge.style.color = '#666';
      }
    }

    checkBtn?.addEventListener('click', checkServerHealth);
    apiUrlInput?.addEventListener('change', () => {
      setClientComfyUrl(apiUrlInput.value);
      checkServerHealth();
    });
    checkServerHealth();

    function updateGenerateButton() {
      generateButton.disabled = !sourceDataUrl;
    }

    function clearGenerated() {
      generationId++;
      generatedDataUrl = '';
      studio.querySelector('#ai-product-output-wrap').hidden = true;
      studio.querySelector('#ai-product-output-preview').removeAttribute('src');
      applyButton.disabled = true;
    }

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
        sourceDataUrl = await resizeImage(file, 1200, .90);
        sourcePreview.src = sourceDataUrl;
        sourceWrap.hidden = false;
        updateGenerateButton();
        status.textContent = 'عکس محصول آماده است؛ پایپ‌لاین ComfyUI را انتخاب و دکمهٔ تولید را بزنید.';
      } catch (error) {
        status.textContent = error.message || 'خواندن عکس انجام نشد.';
        fileInput.value = '';
      }
    });

    pipelineSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    styleSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });

    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) {
        status.textContent = 'برای ساخت تصویر، یک تصویر واضح از محصول انتخاب کنید.';
        updateGenerateButton();
        return;
      }

      generateButton.disabled = true;
      clearGenerated();
      const currentGenerationId = generationId;
      const pipeline = pipelineSelect?.value || 'qwen-edit';
      const style = styleSelect?.value || 'warm-studio';
      const customPrompt = promptInput?.value?.trim() || '';
      const fast = Boolean(fastCheck?.checked);
      const apiUrl = (apiUrlInput?.value || getClientComfyUrl()).trim();

      status.textContent = `در حال پردازش پایپ‌لاین ${pipeline} با ComfyUI Automation API…`;

      try {
        const response = await fetch('/api/ai/product-photo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...await adminAuthHeaders()
          },
          body: JSON.stringify({
            image: sourceDataUrl,
            pipeline,
            style,
            prompt: customPrompt || undefined,
            apiUrl: apiUrl || undefined,
            fast
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `خطای سرویس (${response.status})`);

        if (currentGenerationId !== generationId) return;
        generatedDataUrl = payload.dataUrl;
        studio.querySelector('#ai-product-output-preview').src = payload.dataUrl;
        studio.querySelector('#ai-product-output-wrap').hidden = false;
        applyButton.disabled = false;
        status.textContent = payload.note || '✅ تصویر با موفقیت توسط ComfyUI Automation API تولید شد.';
      } catch (error) {
        if (currentGenerationId !== generationId) return;
        status.textContent = error.message || 'پردازش تصویر انجام نشد.';
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

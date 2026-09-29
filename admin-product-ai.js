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
    return `Professional ecommerce product photograph of the exact footwear shown in the reference image, ${desc}. Single shoe in full clear view, centered composition, commercial advertising catalog standard, sharp details, photorealistic, 8k resolution.`;
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
        <h3 id="ai-product-title">✨ ساخت عکس محصول با هوش مصنوعی (Puter GPT Image)</h3>
        <p class="ai-studio-note">یک تصویر واضح از محصول انتخاب کنید. هوش مصنوعی با استفاده از مدل‌های پیشرفتهٔ GPT Image و کتابخانهٔ Puter.js بدون نیاز به کلید خصوصی OpenAI، یک تصویر نهاییِ باکیفیت و اختصاصی برای کاتالوگ تولید می‌کند.</p>
      </div>
      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-model">مدل هوش مصنوعی (Puter GPT Image)</label>
        <select id="ai-product-model" class="ai-studio-select">
          <option value="gpt-image-2.5-flare">GPT Image 2.5 Flare (پیش‌فرض / سریع و دقیق)</option>
          <option value="gpt-image-2.5-sunburst">GPT Image 2.5 Sunburst (کنتراست و روشنایی پویا)</option>
          <option value="gpt-image-2">GPT Image 2 (کلاسیک)</option>
        </select>
        <label for="ai-product-quality">کیفیت خروجی تصویر</label>
        <select id="ai-product-quality" class="ai-studio-select">
          <option value="high">کیفیت بالا (High - پیش‌فرض)</option>
          <option value="medium">کیفیت متوسط (Medium - سریع‌تر)</option>
          <option value="xhigh">کیفیت فوق‌العاده (X-High)</option>
          <option value="low">کیفیت پایه (Low)</option>
        </select>
        <label for="ai-product-style">سبک پس‌زمینهٔ خروجی</label>
        <select id="ai-product-style" class="ai-studio-select">
          <option value="warm-studio">استودیوی کرم و ملایم</option>
          <option value="dark-luxury">استودیوی دارک و لوکس</option>
          <option value="natural-stone">سنگ طبیعی و نور روز</option>
        </select>
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
          <figcaption style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">یک خروجی نهایی از تصویر مرجع با Puter GPT Image</figcaption>
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
    const qualitySelect = studio.querySelector('#ai-product-quality');
    const styleSelect = studio.querySelector('#ai-product-style');
    const sourceWrap = studio.querySelector('#ai-product-source-wrap');
    const sourcePreview = studio.querySelector('#ai-product-source-preview');

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
      status.textContent = 'سرویس Puter.js (GPT Image) آماده است؛ دسترسی عمومی و بدون نیاز به کلید OpenAI. یک تصویر واضح از محصول انتخاب کنید.';
      status.classList.toggle('is-ready', providerReady);
      updateGenerateButton();
    }).catch(() => {
      if (typeof window !== 'undefined' && window.puter?.ai?.txt2img) {
        providerReady = true;
        status.textContent = 'کتابخانهٔ Puter.js در مرورگر آماده است. یک تصویر واضح از محصول انتخاب کنید.';
        status.classList.add('is-ready');
        updateGenerateButton();
      } else {
        status.textContent = 'سرویس تصویر در دسترس نیست.';
      }
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
          ? 'عکس واضح محصول آماده است؛ مدل، کیفیت و سبک را انتخاب کرده و دکمهٔ «تولید یک تصویر نهایی» را بزنید.'
          : 'عکس آماده است؛ سرویس تصویر هنوز تنظیم نشده است.';
      } catch (error) {
        status.textContent = error.message || 'خواندن عکس انجام نشد.';
        fileInput.value = '';
      }
    });

    styleSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    modelSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    qualitySelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });

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
      const model = modelSelect?.value || 'gpt-image-2.5-flare';
      const quality = qualitySelect?.value || 'high';
      const style = styleSelect?.value || 'warm-studio';
      status.textContent = `تصویر مرجع با مدل ${model} از طریق Puter.js در حال پردازش است؛ در حال ساخت تصویر نهایی محصول…`;

      try {
        let outputUrl = '';
        if (typeof window !== 'undefined' && window.puter?.ai?.txt2img) {
          try {
            const prompt = buildShoePhotoPrompt(style);
            const imageElement = await window.puter.ai.txt2img(prompt, {
              model,
              quality,
              input_image: sourceDataUrl
            });
            outputUrl = imageElement?.src || (typeof imageElement === 'string' ? imageElement : '');
          } catch {
            outputUrl = '';
          }
        }

        if (!outputUrl) {
          const response = await fetch('/api/ai/product-photo', {
            method:'POST',
            headers:{ 'Content-Type':'application/json', ...await adminAuthHeaders() },
            body:JSON.stringify({ image:sourceDataUrl, images:[sourceDataUrl], style, model, quality })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || `خطای سرویس (${response.status})`);
          }
          outputUrl = payload.dataUrl;
        }

        if (!outputUrl) throw new Error('تصویر نهایی از هوش مصنوعی دریافت نشد.');

        const output = await resizeImage(outputUrl, 1280, .88);
        if (currentGenerationId !== generationId) return;
        generatedDataUrl = output;
        studio.querySelector('#ai-product-output-preview').src = output;
        studio.querySelector('#ai-product-output-wrap').hidden = false;
        applyButton.disabled = false;
        status.textContent = `یک تصویر نهایی با مدل ${model} با موفقیت آماده شد؛ جزئیات را بررسی و در صورت تأیید اضافه کنید.`;
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

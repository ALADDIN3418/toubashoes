/* Touba Admin Product AI Assistant & 3-angle Image Studio */
(() => {
  const MAX_UPLOAD = 15 * 1024 * 1024;
  const ANGLES = [
    { id:'front', label:'نمای روبه‌رو و سه‌رخ', alt:'خروجی هوش مصنوعی از نمای روبه‌رو و سه‌رخ کفش' },
    { id:'side', label:'نمای جانبی', alt:'خروجی هوش مصنوعی از نمای جانبی کفش' },
    { id:'heel', label:'نمای پاشنه', alt:'خروجی هوش مصنوعی از نمای پاشنه کفش' }
  ];

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
    const shortDesc = `${n} از برند ${b} با ${styleDesc.toLowerCase()}؛ انتخابی خوش‌استایل برای ${usage}.`;
    const enteredFeatures = String(providedFeatures || '').split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
    const enteredSpecifications = String(providedSpecifications || '').trim();
    const specifications = enteredSpecifications || [sizes ? `سایزبندی موجود: ${sizes}` : '', colors ? `رنگ‌بندی: ${colors}` : ''].filter(Boolean).join('\n');
    const confirmedDetails = [enteredFeatures.length ? `ویژگی‌های ثبت‌شده: ${enteredFeatures.join('، ')}` : '', specifications ? `مشخصات ثبت‌شده: ${specifications}` : ''].filter(Boolean).join('\n');
    const longDesc = `${n} از کالکشن کفش ${b}، با ${styleDesc} طراحی شده است. این مدل می‌تواند همراهی مناسب برای ${usage} باشد.\n\n${confirmedDetails || 'مشخصات اختصاصی این محصول هنوز وارد نشده است.'}\n\nپیش از انتشار، متن و جزئیات را با محصول واقعی تطبیق دهید.`;
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
          method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(input)
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

  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;

    const sourceDataUrls = Object.create(null);
    let generatedDataUrl = '';
    let providerReady = false;
    let generationId = 0;
    const sourceLoadIds = Object.create(null);

    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ استودیوی ساخت عکس محصول از سه زاویه</h3>
        <p class="ai-studio-note">سه عکس از روبه‌رو، کنار و پشت/پاشنهٔ همان کفش بارگذاری کنید. هوش مصنوعی هر سه مرجع را با هم بررسی می‌کند و فقط یک تصویر نهاییِ یکپارچه می‌سازد.</p>
      </div>
      <div class="ai-source-grid" id="ai-source-grid">${ANGLES.map(angle => `
        <figure class="ai-source-card" data-source-card="${angle.id}">
          <label for="ai-product-file-${angle.id}">${angle.label} · عکس مرجع</label>
          <input id="ai-product-file-${angle.id}" type="file" accept="image/jpeg,image/png,image/webp" data-source-input="${angle.id}" aria-describedby="ai-studio-status">
          <img data-source-preview="${angle.id}" alt="پیش‌نمایش عکس مرجع ${angle.label}" hidden>
          <div class="ai-source-placeholder" data-source-placeholder="${angle.id}">برای این زاویه عکس انتخاب کنید</div>
          <div class="ai-source-status" data-source-status="${angle.id}" role="status">عکسی انتخاب نشده</div>
        </figure>`).join('')}</div>
      <div class="ai-studio-controls">
        <label for="ai-product-style">سبک پس‌زمینهٔ خروجی</label>
        <select id="ai-product-style">
          <option value="warm-studio">استودیوی گرم و روشن</option>
          <option value="dark-luxury">لوکس تیره و سبز</option>
          <option value="natural-stone">سنگ طبیعی و نور روز</option>
        </select>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>تولید یک تصویر نهایی</button>
      </div>
      <figure class="ai-final-output" id="ai-product-output-wrap" hidden>
        <img id="ai-product-output-preview" alt="تصویر نهایی محصول ساخته‌شده از سه عکس مرجع">
        <figcaption>یک خروجی نهایی از سه زاویهٔ مرجع — پیش از استفاده، جزئیات کفش را بررسی کنید.</figcaption>
      </figure>
      <div class="ai-studio-actions">
        <button type="button" class="action" id="ai-product-apply" disabled>افزودن تصویر نهایی به تصاویر محصول</button>
        <span id="ai-studio-status" role="status" aria-live="polite">در حال بررسی سرویس تصویر…</span>
      </div>`;
    field.before(studio);

    const status = studio.querySelector('#ai-studio-status');
    const generateButton = studio.querySelector('#ai-product-generate');
    const applyButton = studio.querySelector('#ai-product-apply');
    const styleSelect = studio.querySelector('#ai-product-style');

    function updateGenerateButton() {
      generateButton.disabled = !providerReady || ANGLES.some(angle => !sourceDataUrls[angle.id]);
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
      status.textContent = providerReady
        ? 'سرویس آماده است؛ هر بار تولید، یک تصویر نهایی از سه عکس مرجع می‌سازد.'
        : 'برای ساخت تصویر، کلیدهای Cloudflare را در Environment Variables وریسل تنظیم کنید.';
      status.classList.toggle('is-ready', providerReady);
      updateGenerateButton();
    }).catch(() => { status.textContent = 'سرویس تصویر در دسترس نیست.'; });

    studio.querySelectorAll('[data-source-input]').forEach(input => {
      input.addEventListener('change', async () => {
        const angleId = input.dataset.sourceInput;
        const sourceId = (sourceLoadIds[angleId] || 0) + 1;
        sourceLoadIds[angleId] = sourceId;
        delete sourceDataUrls[angleId];
        clearGenerated();
        updateGenerateButton();
        const preview = studio.querySelector(`[data-source-preview="${angleId}"]`);
        const placeholder = studio.querySelector(`[data-source-placeholder="${angleId}"]`);
        const sourceStatus = studio.querySelector(`[data-source-status="${angleId}"]`);
        const file = input.files?.[0];
        preview.hidden = true; placeholder.hidden = false;
        if (!file) {
          preview.hidden = true; placeholder.hidden = false;
          sourceStatus.textContent = 'عکسی انتخاب نشده';
          return;
        }
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
          sourceStatus.textContent = 'فقط عکس JPG، PNG یا WebP با حجم حداکثر ۱۵ مگابایت انتخاب کنید.';
          input.value = '';
          return;
        }
        sourceStatus.textContent = 'در حال آماده‌سازی عکس…';
        try {
          const dataUrl = await resizeImage(file, 511, .84);
          if (sourceId !== sourceLoadIds[angleId]) return;
          sourceDataUrls[angleId] = dataUrl;
          preview.src = dataUrl; preview.hidden = false; placeholder.hidden = true;
          sourceStatus.textContent = 'عکس مرجع آماده است.';
          updateGenerateButton();
          status.textContent = ANGLES.every(angle => sourceDataUrls[angle.id])
            ? (providerReady ? 'هر سه عکس آماده‌اند؛ یک تصویر نهایی بسازید.' : 'هر سه عکس آماده‌اند؛ سرویس تصویر هنوز تنظیم نشده است.')
            : 'لطفاً برای هر سه زاویه یک عکس انتخاب کنید.';
        } catch (error) {
          if (sourceId !== sourceLoadIds[angleId]) return;
          sourceStatus.textContent = error.message || 'خواندن عکس انجام نشد.';
          input.value = '';
        }
      });
    });

    styleSelect.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    generateButton.addEventListener('click', async () => {
      if (ANGLES.some(angle => !sourceDataUrls[angle.id])) {
        status.textContent = 'برای هر سه زاویه یک عکس از همان کفش انتخاب کنید.';
        updateGenerateButton();
        return;
      }
      if (!providerReady) { status.textContent = 'سرویس تصویر فعال نیست.'; return; }
      generateButton.disabled = true;
      clearGenerated();
      const currentGenerationId = generationId;
      status.textContent = 'هر سه عکس در حال ارسال و تحلیل‌اند؛ یک تصویر نهایی ساخته می‌شود…';
      try {
        const productHint = [form.elements.name?.value, form.elements.category?.selectedOptions?.[0]?.textContent, form.elements.shortDesc?.value]
          .filter(Boolean).join('؛ ').slice(0, 180);
        const response = await fetch('/api/ai/product-photo', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ images:ANGLES.map(angle => sourceDataUrls[angle.id]), style:styleSelect.value, productHint })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `خطای سرویس (${response.status})`);
        const output = await resizeImage(payload.dataUrl, 1280, .84);
        if (currentGenerationId !== generationId) return;
        generatedDataUrl = output;
        studio.querySelector('#ai-product-output-preview').src = output;
        studio.querySelector('#ai-product-output-wrap').hidden = false;
        applyButton.disabled = false;
        status.textContent = 'یک تصویر نهایی از هر سه زاویه آماده شد؛ جزئیات را بررسی و در صورت تأیید اضافه کنید.';
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
          method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ image:generatedDataUrl })
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

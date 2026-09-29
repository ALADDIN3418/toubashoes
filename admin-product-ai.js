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
    let sourceDataUrl = '';
    let generatedDataUrls = Object.create(null);
    let providerReady = false;
    let generationId = 0;

    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ استودیوی ساخت تصاویر سه‌زاویه‌ای کفش</h3>
        <p class="ai-studio-note">سه درخواست جداگانه برای نمای روبه‌رو، جانبی و پاشنه ارسال می‌شود. تصویر تولیدی ممکن است جزئیات واقعی کفش را دقیق حفظ نکند؛ خروجی‌ها را بررسی کنید.</p>
      </div>
      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب عکس مرجع محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-style">سبک پس‌زمینه</label>
        <select id="ai-product-style">
          <option value="warm-studio">استودیوی گرم و روشن</option>
          <option value="dark-luxury">لوکس تیره و سبز</option>
          <option value="natural-stone">سنگ طبیعی و نور روز</option>
        </select>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>ساخت هر سه زاویه</button>
      </div>
      <div class="ai-angle-grid" id="ai-angle-grid">${ANGLES.map(angle => `
        <figure class="ai-angle-card" data-angle-card="${angle.id}">
          <img data-angle-preview="${angle.id}" alt="${angle.alt}" hidden>
          <div class="ai-angle-placeholder" data-angle-placeholder="${angle.id}">پیش‌نمایش ${angle.label}</div>
          <figcaption>${angle.label}</figcaption>
          <div class="ai-angle-status" data-angle-status="${angle.id}" role="status">هنوز تولید نشده</div>
          <button type="button" class="action ai-angle-apply" data-angle-apply="${angle.id}" disabled>افزودن این زاویه به تصاویر محصول</button>
        </figure>`).join('')}</div>
      <div class="ai-studio-actions">
        <span id="ai-studio-status" role="status" aria-live="polite">در حال بررسی سرویس تصویر…</span>
      </div>`;
    field.before(studio);

    const status = studio.querySelector('#ai-studio-status');
    const generateButton = studio.querySelector('#ai-product-generate');
    const fileInput = studio.querySelector('#ai-product-file');
    const styleSelect = studio.querySelector('#ai-product-style');

    function clearGenerated() {
      generationId++;
      generatedDataUrls = Object.create(null);
      for (const angle of ANGLES) {
        const preview = studio.querySelector(`[data-angle-preview="${angle.id}"]`);
        preview.hidden = true; preview.removeAttribute('src');
        studio.querySelector(`[data-angle-placeholder="${angle.id}"]`).hidden = false;
        studio.querySelector(`[data-angle-status="${angle.id}"]`).textContent = 'هنوز تولید نشده';
        studio.querySelector(`[data-angle-apply="${angle.id}"]`).disabled = true;
      }
    }

    fetch('/api/ai/status').then(response => response.json()).then(data => {
      providerReady = !!data.configured;
      status.textContent = providerReady
        ? 'سرویس تصویر آماده است؛ هر نوبت ساخت هر سه زاویه، سه تصویر از سهمیه مصرف می‌کند.'
        : 'برای ساخت تصویر، کلیدهای Cloudflare را در Environment Variables وریسل تنظیم کنید.';
      status.classList.toggle('is-ready', providerReady);
      generateButton.disabled = !providerReady || !sourceDataUrl;
    }).catch(() => { status.textContent = 'سرویس تصویر در دسترس نیست.'; });

    fileInput.addEventListener('change', async () => {
      sourceDataUrl = ''; clearGenerated(); generateButton.disabled = true;
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
        status.textContent = 'فقط عکس JPG، PNG یا WebP با حجم حداکثر ۱۵ مگابایت انتخاب کنید.';
        fileInput.value = ''; return;
      }
      status.textContent = 'در حال آماده‌سازی عکس…';
      try {
        sourceDataUrl = await resizeImage(file, 1280, .90);
        generateButton.disabled = !providerReady;
        status.textContent = providerReady ? 'عکس مرجع آماده است؛ ساخت هر سه نما را آغاز کنید.' : 'عکس آماده است؛ سرویس تصویر هنوز تنظیم نشده است.';
      } catch (error) { status.textContent = error.message || 'خواندن عکس انجام نشد.'; }
    });

    styleSelect.addEventListener('change', clearGenerated);
    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) { status.textContent = 'ابتدا عکس محصول را انتخاب کنید.'; return; }
      if (!providerReady) { status.textContent = 'سرویس تصویر فعال نیست.'; return; }
      generateButton.disabled = true;
      clearGenerated();
      const currentGenerationId = generationId;
      status.textContent = 'در حال ساخت سه زاویه؛ ممکن است کمی زمان ببرد…';
      let referenceDataUrl;
      try { referenceDataUrl = await resizeImage(sourceDataUrl, 511, .90); }
      catch (error) { status.textContent = error.message || 'آماده‌سازی عکس مرجع انجام نشد.'; generateButton.disabled = false; return; }

      const productHint = [form.elements.name?.value, form.elements.category?.selectedOptions?.[0]?.textContent, form.elements.shortDesc?.value]
        .filter(Boolean).join('؛ ').slice(0, 180);
      const results = await Promise.all(ANGLES.map(async angle => {
        const angleStatus = studio.querySelector(`[data-angle-status="${angle.id}"]`);
        angleStatus.textContent = 'در حال تولید…';
        try {
          const response = await fetch('/api/ai/product-photo', {
            method:'POST', headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ image:referenceDataUrl, style:styleSelect.value, angle:angle.id, productHint })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || `خطای سرویس (${response.status})`);
          const dataUrl = await resizeImage(payload.dataUrl, 1280, .80);
          if (currentGenerationId !== generationId) return { ok:false, cancelled:true };
          generatedDataUrls[angle.id] = dataUrl;
          const preview = studio.querySelector(`[data-angle-preview="${angle.id}"]`);
          preview.src = dataUrl; preview.hidden = false;
          studio.querySelector(`[data-angle-placeholder="${angle.id}"]`).hidden = true;
          studio.querySelector(`[data-angle-apply="${angle.id}"]`).disabled = false;
          angleStatus.textContent = 'آمادهٔ بازبینی';
          return { ok:true };
        } catch (error) {
          if (currentGenerationId !== generationId) return { ok:false, cancelled:true };
          angleStatus.textContent = error.message || 'ساخت این نما انجام نشد.';
          return { ok:false };
        }
      }));
      if (currentGenerationId !== generationId) return;
      const complete = results.filter(result => result.ok).length;
      status.textContent = complete === ANGLES.length
        ? 'هر سه تصویر آماده‌اند؛ هر زاویهٔ تأییدشده را جداگانه به تصاویر محصول اضافه کنید.'
        : `${complete} از ۳ تصویر آماده شد؛ می‌توانید زاویه‌های ناموفق را دوباره بسازید.`;
      generateButton.disabled = !providerReady || !sourceDataUrl;
    });

    studio.querySelectorAll('.ai-angle-apply').forEach(button => {
      button.addEventListener('click', async () => {
        const angleId = button.dataset.angleApply;
        const dataUrl = generatedDataUrls[angleId];
        if (!dataUrl) { status.textContent = 'ابتدا این زاویه را تولید و بررسی کنید.'; return; }
        button.disabled = true;
        studio.querySelector(`[data-angle-status="${angleId}"]`).textContent = 'در حال افزودن…';
        try {
          const response = await fetch('/api/uploads/product-image', {
            method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ image:dataUrl })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || `ذخیره تصویر انجام نشد (${response.status})`);
          const textarea = form.elements.images;
          const existing = textarea.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean).filter(url => url !== payload.url);
          textarea.value = [...existing, payload.url].join('\n');
          studio.querySelector(`[data-angle-status="${angleId}"]`).textContent = 'به فهرست تصاویر محصول افزوده شد.';
          status.textContent = 'تصویر به فرم محصول افزوده شد؛ برای ماندگاری، تغییرات محصول را ذخیره کنید.';
        } catch (error) {
          studio.querySelector(`[data-angle-status="${angleId}"]`).textContent = error.message || 'افزودن تصویر انجام نشد.';
          button.disabled = false;
        }
      });
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

/* Touba Admin Product AI Assistant & Image Studio */
(() => {
  const MAX_UPLOAD = 15 * 1024 * 1024;
  let sourceDataUrl = '', generatedDataUrl = '', providerReady = false;

  function generateLocalDescription({ name, category, brand, sizes, colors }) {
    const n = String(name || 'کفش چرم طبیعی طوبی').trim();
    const c = String(category || '').toLowerCase();
    const b = String(brand || 'طوبی').trim();

    let styleDesc = '';
    let usage = '';
    let sole = 'پلی‌یورتان (PU) تزریق مستقیم سبک و منعطف با اصطکاک بالا';
    let insole = 'کفی طبی ارگونومیک با فوم ضدخستگی و روکش چرم طبیعی';

    if (c.includes('sport') || c.includes('اسپرت') || n.includes('کتانی') || n.includes('اسپرت')) {
      styleDesc = 'طراحی مدرن و ارگونومیک با قابلیت تنفس‌پذیری فوق‌العاده';
      usage = 'پیاده‌روی روزانه، محیط‌های کاری پرتحرک، ورزش سبک و استایل‌های کژوال شیک';
    } else if (c.includes('formal') || c.includes('رسمی') || c.includes('مجلسی') || n.includes('مجلسی') || n.includes('کلاسیک')) {
      styleDesc = 'برش‌های دست‌دوز اصیل، پولیش چشم‌نواز چرم و قالب کلاسیک مجلسی';
      usage = 'جلسات اداری و مدیریتی، قرارهای رسمی، مراسم‌ها و مهمانی‌های فاخر';
    } else if (c.includes('sandal') || c.includes('صندل')) {
      styleDesc = 'طراحی خنک و سبک با گردش هوای آزاد و بندهای بادوام چرمی';
      usage = 'فصول گرم، سفرهای تفریحی و راحتی روزمره';
    } else if (c.includes('women') || c.includes('زنانه') || n.includes('زنانه')) {
      styleDesc = 'ظرافت مثال‌زدنی در طراحی، پاشنه ارگونومیک استاندارد و ایستایی بسیار زیبا';
      usage = 'محیط کار، مجالس، دورهمی‌ها و استفاده روزمره بدون ایجاد فشار بر کمر و پاشنه';
    } else {
      styleDesc = 'طراحی ارگونومیک مهندسی‌شده همراه با دوخت محکم چرم طبیعی';
      usage = 'استفاده روزمره، محیط‌های کاری و اداری و پیاده‌روی طولانی‌مدت';
    }

    const shortDesc = `${n} از برند ${b}؛ ساخته‌شده از چرم طبیعی باکیفیت و زیره طبی سبک، انتخابی ایده‌آل برای راحتی پا و استایل شیک در طول روز.`;

    const longDesc = `${n} یکی از تولیدات برجسته و محبوب در کالکشن تخصصی کفش ${b} است که با تکیه بر استانداردهای ارگونومی پا و هنر دست‌دوز چرم طراحی شده است. ${styleDesc} باعث شده تا این مدل علاوه بر جلوه بصری شیک و برازنده، فشارهای وارده به ستون فقرات و پاشنه پا را در طول ساعت‌های طولانی به حداقل برساند.

رویه این محصول از چرم طبیعی درجه یک فرآوری شده که علاوه بر انعطاف‌پذیری و مقاومت بالا در برابر سایش، با حفظ جریان تنفس طبیعی، از تعریق پا و بوی نامطبوع جلوگیری می‌کند. زیره این کفش از جنس ${sole} بوده که خاصیت جذب ضربه (Shock Absorption) بسیار بالایی دارد و کفی داخلی طبی آن متناسب با قوس کف پای استاندارد طراحی شده است.

این کفش گزینه‌ای بی‌نقص برای ${usage} است و با دوام ماندگار خود، همراهی مطمئن در هر قدم شما خواهد بود. جهت حفظ زیبایی و ماندگاری چرم، توصیه می‌شود از واکس‌های روغنی استاندارد مخصوص چرم طبیعی و دور از تابش مستقیم آفتاب و رطوبت مداوم نگهداری شود.`;

    const featureList = [
      'رویه تمام‌چرم طبیعی باکیفیت و بافت انعطاف‌پذیر',
      `${insole} با قابلیت پخش یکنواخت وزن بدن`,
      `زیره سبک و منعطف از جنس ${sole}`,
      'آستر داخلی نرم با دوخت دست‌دوز بدون ایجاد تاول و فشار بر انگشتان',
      `مناسب برای ${usage}`
    ];

    const specLines = [
      'جنس رویه: چرم طبیعی درجه یک',
      `جنس زیره: ${sole}`,
      'کفی داخلی: طبی ضدخستگی با روکش چرمی',
      'آستر داخلی: چرم طبیعی ضدتعریق و ضدباکتری',
      'نوع قالب: استاندارد پای ایرانی',
      'کشور سازنده: ایران - کارگاه تخصصی کفش طوبی',
      sizes ? `سایزبندی موجود: ${sizes}` : '',
      colors ? `رنگ‌بندی: ${colors}` : ''
    ].filter(Boolean).join('\n');

    return {
      shortDesc,
      longDesc,
      features: featureList,
      specifications: specLines
    };
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
        <p class="ai-desc-subtitle">با کلیک روی دکمه بالا، بر اساس نام، برند و مشخصات انتخابی کفش، متن معرفی جذاب، مشخصات ارگونومیک و ویژگی‌های کامل با مدل رایگان هوش مصنوعی تولید و درج می‌شود.</p>
        <div id="ai-desc-status" class="ai-desc-status" style="display:none;" role="status"></div>
      </div>
    `;

    field.before(assistant);

    const btn = assistant.querySelector('#ai-desc-generate-btn');
    const status = assistant.querySelector('#ai-desc-status');

    btn.addEventListener('click', async () => {
      const name = form.elements.name?.value?.trim() || '';
      if (!name) {
        status.style.display = 'block';
        status.style.color = '#a34537';
        status.textContent = 'لطفاً ابتدا نام محصول را در بالای فرم وارد کنید تا توضیحات بر اساس آن نگارش شود.';
        form.elements.name?.focus();
        return;
      }

      const category = form.elements.category?.value || '';
      const brand = form.elements.brand?.value || 'طوبی';
      const sizes = form.elements.sizes?.value || '';
      const colors = form.elements.colors?.value || '';
      const specifications = form.elements.specifications?.value || '';

      btn.disabled = true;
      btn.textContent = 'در حال نگارش هوشمند...';
      status.style.display = 'block';
      status.style.color = '#2e4a2e';
      status.textContent = 'دستیار هوشمند در حال تحلیل ویژگی‌های کفش و تولید محتوای تخصصی...';

      let result = null;
      try {
        const response = await fetch('/api/ai/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, category, brand, sizes, colors, specifications })
        });
        if (response.ok) {
          result = await response.json();
        }
      } catch (err) {
        // Fallback to client-side model generator below
      }

      if (!result || !result.shortDesc || !result.longDesc) {
        result = generateLocalDescription({ name, category, brand, sizes, colors });
      }

      if (form.elements.shortDesc) {
        form.elements.shortDesc.value = result.shortDesc;
        form.elements.shortDesc.classList.remove('field-highlight-flash');
        void form.elements.shortDesc.offsetWidth;
        form.elements.shortDesc.classList.add('field-highlight-flash');
      }
      if (form.elements.longDesc) {
        form.elements.longDesc.value = result.longDesc;
        form.elements.longDesc.classList.remove('field-highlight-flash');
        void form.elements.longDesc.offsetWidth;
        form.elements.longDesc.classList.add('field-highlight-flash');
      }
      if (form.elements.features && result.features) {
        form.elements.features.value = Array.isArray(result.features) ? result.features.join('\n') : result.features;
        form.elements.features.classList.remove('field-highlight-flash');
        void form.elements.features.offsetWidth;
        form.elements.features.classList.add('field-highlight-flash');
      }
      if (form.elements.specifications && result.specifications && !form.elements.specifications.value.trim()) {
        form.elements.specifications.value = result.specifications;
        form.elements.specifications.classList.remove('field-highlight-flash');
        void form.elements.specifications.offsetWidth;
        form.elements.specifications.classList.add('field-highlight-flash');
      }

      btn.disabled = false;
      btn.textContent = '✨ بازتولید مجدد توضیحات';
      status.textContent = '✅ توضیحات کوتاه، معرفی کامل و ویژگی‌های محصول با موفقیت ایجاد و جای‌گذاری شدند.';
      if (typeof window.toast === 'function') {
        window.toast('توضیحات هوشمند محصول با موفقیت درج شد.');
      }
    });
  }

  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;

    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading">
        <h3 id="ai-product-title">✨ ساخت عکس محصول با هوش مصنوعی</h3>
      </div>
      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب عکس اولیه محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-style">سبک پس‌زمینه</label>
        <select id="ai-product-style">
          <option value="warm-studio">استودیوی گرم و روشن</option>
          <option value="dark-luxury">لوکس تیره و سبز</option>
          <option value="natural-stone">سنگ طبیعی و نور روز</option>
        </select>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>ساخت تصویر با هوش مصنوعی</button>
      </div>
      <div class="ai-product-previews">
        <figure id="ai-product-source-wrap" hidden>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس اصلی محصول">
          <figcaption>عکس اصلی</figcaption>
        </figure>
        <figure id="ai-product-output-wrap" hidden>
          <img id="ai-product-output-preview" alt="پیش‌نمایش خروجی هوش مصنوعی">
          <figcaption>خروجی پیشنهادی</figcaption>
        </figure>
      </div>
      <div class="ai-studio-actions">
        <button type="button" class="action" id="ai-product-apply" disabled>استفاده از خروجی در تصاویر محصول</button>
        <span id="ai-studio-status" role="status" aria-live="polite">در حال بررسی سرویس تصویر…</span>
      </div>`;
    field.before(studio);

    const status = studio.querySelector('#ai-studio-status');
    const generateButton = studio.querySelector('#ai-product-generate');

    fetch('/api/ai/status').then(r => r.json()).then(data => {
      providerReady = !!data.configured;
      status.textContent = providerReady
        ? 'سرویس تصویر آماده است.'
        : 'برای فعال‌سازی ساخت تصویر، کلید سرویس را در فایل .env تنظیم کنید.';
      status.classList.toggle('is-ready', providerReady);
      generateButton.disabled = !providerReady || !sourceDataUrl;
    }).catch(() => {
      status.textContent = 'سرویس تصویر در دسترس نیست.';
    });

    const fileInput = studio.querySelector('#ai-product-file');
    const applyButton = studio.querySelector('#ai-product-apply');

    fileInput.addEventListener('change', async () => {
      sourceDataUrl = ''; generatedDataUrl = ''; generateButton.disabled = true; applyButton.disabled = true;
      studio.querySelector('#ai-product-source-wrap').hidden = true;
      studio.querySelector('#ai-product-output-wrap').hidden = true;
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
        status.textContent = 'فقط عکس JPG، PNG یا WebP با حجم حداکثر ۱۵ مگابایت انتخاب کنید.';
        fileInput.value = '';
        return;
      }
      status.textContent = 'در حال آماده‌سازی عکس…';
      try {
        sourceDataUrl = await resizeImage(file, 1280, .90);
        const preview = studio.querySelector('#ai-product-source-preview');
        preview.src = sourceDataUrl;
        studio.querySelector('#ai-product-source-wrap').hidden = false;
        generateButton.disabled = !providerReady;
        status.textContent = providerReady
          ? 'عکس آماده است؛ دکمه «ساخت تصویر با هوش مصنوعی» را بزنید.'
          : 'عکس آماده است. سرویس تصویر هنوز تنظیم نشده است.';
      } catch (error) {
        status.textContent = error.message || 'خواندن عکس انجام نشد.';
      }
    });

    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) return status.textContent = 'ابتدا عکس محصول را انتخاب کنید.';
      if (!providerReady) return status.textContent = 'سرویس تصویر فعال نیست.';
      generateButton.disabled = true; applyButton.disabled = true;
      status.textContent = 'هوش مصنوعی در حال بازسازی و پردازش تصویر است؛ لطفاً شکیبا باشید…';
      try {
        const referenceDataUrl = await resizeImage(sourceDataUrl, 511, .90);
        const response = await fetch('/api/ai/product-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: referenceDataUrl,
            style: studio.querySelector('#ai-product-style').value,
            productHint: [form.elements.name?.value, form.elements.category?.selectedOptions?.[0]?.textContent, form.elements.shortDesc?.value].filter(Boolean).join('؛ ').slice(0, 180)
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `خطا در درخواست سرویس تصویر (${response.status})`);
        generatedDataUrl = await resizeImage(payload.dataUrl, 1280, .84);
        const resultWrap = studio.querySelector('#ai-product-output-wrap');
        studio.querySelector('#ai-product-output-preview').src = generatedDataUrl;
        resultWrap.hidden = false;
        applyButton.disabled = false;
        status.textContent = 'عکس پیشنهادی آماده است؛ برای افزودن به تصاویر محصول، دکمهٔ زیر را بزنید.';
      } catch (error) {
        status.textContent = error.message || 'ساخت تصویر انجام نشد.';
      } finally {
        generateButton.disabled = !providerReady || !sourceDataUrl;
      }
    });

    applyButton.addEventListener('click', async () => {
      if (!generatedDataUrl) return status.textContent = 'ابتدا تصویر را تولید کنید.';
      applyButton.disabled = true;
      status.textContent = 'در حال ذخیره عکس…';
      try {
        const response = await fetch('/api/uploads/product-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: generatedDataUrl })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `ذخیره عکس انجام نشد (${response.status})`);
        const textarea = form.elements.images;
        const existing = textarea.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).filter(url => url !== payload.url);
        textarea.value = [payload.url, ...existing].join('\n');
        status.textContent = 'عکس با موفقیت به فهرست تصاویر محصول اضافه شد.';
      } catch (error) {
        status.textContent = error.message || 'ذخیره فایل انجام نشد.';
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
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('فایل تصویری معتبر خوانده نشد.'));
      };
      if (typeof fileOrDataUrl === 'string') image.src = fileOrDataUrl;
      else {
        objectUrl = URL.createObjectURL(fileOrDataUrl);
        image.src = objectUrl;
      }
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

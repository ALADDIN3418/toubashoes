/* Optional admin product-photo workflow using Cloudflare Workers AI FLUX.2 Klein 4B. */
(() => {
  const MAX_UPLOAD = 15 * 1024 * 1024;
  let sourceDataUrl = '', generatedDataUrl = '', providerReady = false;
  

  function insertStudio() {
    const form = document.querySelector('#product-edit-form');
    const images = form?.elements?.images;
    const field = images?.closest('.field');
    if (!field || form.querySelector('.ai-product-studio')) return;
    const studio = document.createElement('section');
    studio.className = 'ai-product-studio field full';
    studio.setAttribute('aria-labelledby', 'ai-product-title');
    studio.innerHTML = `
      <div class="ai-studio-heading"><div><span class="ai-studio-kicker">TOUBA IMAGE STUDIO · DAILY FREE ALLOCATION</span><h3 id="ai-product-title">ساخت عکس حرفه‌ای محصول</h3></div><span class="ai-studio-badge">FLUX.2 Klein 4B</span></div>
      <p class="ai-studio-note">مدل FLUX.2 Klein 4B با پشتیبانی واقعی از تصویر مرجع تلاش می‌کند همان کفش را در صحنه‌ای تازه بازسازی کند. عکس اصلی تا زمان انتخاب خروجی دست‌نخورده می‌ماند. <b>هیچ مدل مولدی حفظ دقیق جزئیات را تضمین نمی‌کند؛ خروجی را با عکس اصلی مقایسه کنید و اگر مدل رنگ، بند، سگک، لوگو یا شکل کفش را تغییر داد، آن را اعمال نکنید.</b></p>
      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">۱. انتخاب عکس محصول</label><input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        <label for="ai-product-style">سبک پس‌زمینه</label><select id="ai-product-style"><option value="warm-studio">استودیوی گرم و روشن</option><option value="dark-luxury">لوکس تیره و سبز</option><option value="natural-stone">سنگ طبیعی و نور روز</option></select>
        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>۲. ساخت تصویر با سهمیهٔ روزانه</button>
      </div>
      <div class="ai-product-previews"><figure id="ai-product-source-wrap" hidden><img id="ai-product-source-preview" alt="پیش‌نمایش عکس اصلی محصول"><figcaption>عکس اصلی</figcaption></figure><figure id="ai-product-output-wrap" hidden><img id="ai-product-output-preview" alt="پیش‌نمایش خروجی تولیدشده با هوش مصنوعی"><figcaption>خروجی پیشنهادی · فشرده‌سازی JPEG</figcaption></figure></div>
      <div class="ai-studio-actions"><button type="button" class="action" id="ai-product-apply" disabled>استفاده از خروجی در تصاویر محصول</button><span id="ai-studio-status" role="status" aria-live="polite">در حال بررسی سرویس رایگان تصویر…</span></div>
      <small class="ai-privacy-note">برای ساخت تصویر، عکس مرجع مستقیماً از سرور به Cloudflare Workers AI فرستاده می‌شود؛ میزبان عمومی موقت استفاده نمی‌شود. پلن رایگان Cloudflare سهمیهٔ ۱۰٬۰۰۰ Neurons در روز دارد و این ابزار برای احتیاط حداکثر ۲۰ تولید در هر ۲۴ ساعت می‌پذیرد؛ مصرف سایر مدل‌های حساب Cloudflare نیز از همان سهمیه کم می‌کند. برای استفادهٔ صرفاً رایگان، وضعیت پلن حساب را بررسی کنید. ورودی برای سازگاری با مدل به ضلع حداکثر ۵۱۱ پیکسل کاهش می‌یابد. برای افزودن خروجی به محصول، ابتدا آن را بررسی و دکمهٔ پایین را بزنید، سپس محصول را ذخیره کنید.</small>`;
    field.before(studio);
    const status = studio.querySelector('#ai-studio-status');
    const generateButton = studio.querySelector('#ai-product-generate');
    fetch('/api/ai/status').then(r => r.json()).then(data => {
      providerReady = !!data.configured;
      status.textContent = providerReady
        ? `آماده · ${data.model} · سقف محلی ${data.localDailyLimit} تصویر در ۲۴ ساعت`
        : 'برای فعال‌سازی، Account ID و API Token را در فایل محلی .env تنظیم و سرور را دوباره اجرا کنید؛ اطلاعات محرمانه را در گفتگو نفرستید.';
      status.classList.toggle('is-ready', providerReady);
      generateButton.disabled = !providerReady || !sourceDataUrl;
    }).catch(() => { status.textContent = 'سرور تصویر در دسترس نیست.'; });

    const fileInput = studio.querySelector('#ai-product-file');
    const applyButton = studio.querySelector('#ai-product-apply');
    fileInput.addEventListener('change', async () => {
      sourceDataUrl = ''; generatedDataUrl = ''; generateButton.disabled = true; applyButton.disabled = true;
      studio.querySelector('#ai-product-source-wrap').hidden = true;
      studio.querySelector('#ai-product-output-wrap').hidden = true;
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_UPLOAD) {
        status.textContent = 'فقط عکس JPG، PNG یا WebP با حجم حداکثر ۱۵ مگابایت انتخاب کنید.'; fileInput.value = ''; return;
      }
      status.textContent = 'در حال آماده‌سازی عکس با حفظ نسبت ابعاد…';
      try {
        sourceDataUrl = await resizeImage(file, 1280, .90);
        const preview = studio.querySelector('#ai-product-source-preview');
        preview.src = sourceDataUrl; studio.querySelector('#ai-product-source-wrap').hidden = false;
        generateButton.disabled = !providerReady;
        status.textContent = providerReady
          ? 'عکس آماده است؛ پس از تأیید، تصویر مرجع کوچک‌شده برای FLUX.2 Klein 4B ارسال می‌شود.'
          : 'عکس آماده است، اما سرویس فعال نیست؛ متغیرهای Cloudflare را در فایل محلی .env تنظیم کنید.';
      } catch (error) { status.textContent = error.message || 'خواندن عکس انجام نشد.'; }
    });

    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) return status.textContent = 'ابتدا عکس محصول را انتخاب کنید.';
      if (!providerReady) return status.textContent = 'ابتدا Account ID و API Token را در فایل محلی .env تنظیم کنید.';
      generateButton.disabled = true; applyButton.disabled = true;
      status.textContent = 'FLUX.2 Klein 4B در حال ویرایش عکس مرجع است؛ ممکن است تا یک دقیقه طول بکشد…';
      try {
        const referenceDataUrl = await resizeImage(sourceDataUrl, 511, .90);
        const response = await fetch('/api/ai/product-photo', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({image:referenceDataUrl,style:studio.querySelector('#ai-product-style').value,productHint:[form.elements.name?.value,form.elements.category?.selectedOptions?.[0]?.textContent,form.elements.shortDesc?.value].filter(Boolean).join('؛ ').slice(0,180)})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `خطا در درخواست مدل رایگان (${response.status})`);
        generatedDataUrl = await resizeImage(payload.dataUrl, 1280, .84);
        const resultWrap = studio.querySelector('#ai-product-output-wrap');
        studio.querySelector('#ai-product-output-preview').src = generatedDataUrl;
        resultWrap.hidden = false; applyButton.disabled = false;
        status.textContent = `خروجی ${payload.model || 'FLUX.2 Klein 4B'} آمادهٔ پیش‌نمایش است؛ قبل از استفاده، جزئیات واقعی کفش را دقیق بررسی کنید.`;
      } catch (error) { status.textContent = error.message || 'ساخت عکس انجام نشد؛ تنظیمات و اینترنت سرور را بررسی کنید.'; }
      finally { generateButton.disabled = !providerReady || !sourceDataUrl; }
    });

    applyButton.addEventListener('click', async () => {
      if (!generatedDataUrl) return status.textContent = 'ابتدا خروجی تصویر را تولید کنید.';
      applyButton.disabled = true; status.textContent = 'در حال ذخیره نسخه کم‌حجم روی سرور محلی…';
      try {
        const response = await fetch('/api/uploads/product-image', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({image:generatedDataUrl})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `ذخیره عکس انجام نشد (${response.status})`);
        const textarea = form.elements.images;
        const existing = textarea.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).filter(url => url !== payload.url);
        textarea.value = [payload.url, ...existing].join('\n');
        status.textContent = `به فهرست تصاویر اضافه شد (${Math.round(payload.bytes / 1024)} کیلوبایت). اکنون «ذخیره محصول» را بزنید.`;
      } catch (error) { status.textContent = error.message || 'ذخیره فایل انجام نشد.'; applyButton.disabled = false; }
    });
  }

  function resizeImage(fileOrDataUrl, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const image = new Image(); let objectUrl = '';
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
      image.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); reject(new Error('فایل تصویری معتبر خوانده نشد.')); };
      if (typeof fileOrDataUrl === 'string') image.src = fileOrDataUrl;
      else { objectUrl = URL.createObjectURL(fileOrDataUrl); image.src = objectUrl; }
    });
  }

  const originalModal = window.productModal;
  if (typeof originalModal === 'function') {
    window.productModal = function (...args) { const result = originalModal.apply(this, args); insertStudio(); return result; };
  }
})();

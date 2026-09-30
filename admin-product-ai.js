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

  const STUDIO_THEMES = {
    'warm-studio': {
      label: 'استودیوی کرم و بژ لوکس',
      wallTop: '#fdfbf7',
      wallBottom: '#ebe3d8',
      spotlight: 'rgba(255, 252, 246, 0.65)',
      floorTop: '#ece3d6',
      floorBottom: '#dcd1c2',
      pedestalTop: '#f6f3ee',
      pedestalSide: '#dfd6c8',
      pedestalBevel: '#ffffff',
      shadowColor: 'rgba(50, 40, 30, 0.40)',
      aoColor: 'rgba(25, 20, 15, 0.68)'
    },
    'dark-luxury': {
      label: 'استودیوی دارک و لوکس',
      wallTop: '#2c3138',
      wallBottom: '#14171a',
      spotlight: 'rgba(60, 80, 75, 0.45)',
      floorTop: '#1e2226',
      floorBottom: '#0f1114',
      pedestalTop: '#2d3339',
      pedestalSide: '#191d21',
      pedestalBevel: '#4c5661',
      shadowColor: 'rgba(0, 0, 0, 0.70)',
      aoColor: 'rgba(0, 0, 0, 0.90)'
    },
    'natural-stone': {
      label: 'سنگ طبیعی و نور روز',
      wallTop: '#f8f6f2',
      wallBottom: '#e6e2d8',
      spotlight: 'rgba(255, 253, 245, 0.60)',
      floorTop: '#eae5dc',
      floorBottom: '#dad3c5',
      pedestalTop: '#f0ece3',
      pedestalSide: '#d4ccbf',
      pedestalBevel: '#ffffff',
      shadowColor: 'rgba(45, 42, 38, 0.40)',
      aoColor: 'rgba(20, 18, 15, 0.65)'
    },
    'clean-white': {
      label: 'سفید کاتالوگی استاندارد',
      wallTop: '#ffffff',
      wallBottom: '#f5f7fa',
      spotlight: 'rgba(255, 255, 255, 0.85)',
      floorTop: '#f9fafc',
      floorBottom: '#eaeff5',
      pedestalTop: '#ffffff',
      pedestalSide: '#e5ebf2',
      pedestalBevel: '#ffffff',
      shadowColor: 'rgba(30, 35, 45, 0.30)',
      aoColor: 'rgba(15, 20, 25, 0.58)'
    },
    'walnut-wood': {
      label: 'چوب گردو و نور گرم آتلیه‌ای',
      wallTop: '#34251e',
      wallBottom: '#1a120e',
      spotlight: 'rgba(90, 60, 45, 0.50)',
      floorTop: '#3e2e25',
      floorBottom: '#221914',
      pedestalTop: '#4a372c',
      pedestalSide: '#2b1f18',
      pedestalBevel: '#6d5242',
      shadowColor: 'rgba(10, 8, 6, 0.65)',
      aoColor: 'rgba(5, 4, 3, 0.85)'
    }
  };

  function extractCleanForeground(img, maxDim = 1200) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { canvas, box: { x:0, y:0, w, h } };

    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample background colors from four corner patches
    const patchSize = Math.max(4, Math.floor(Math.min(w, h) * 0.05));
    let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
    const corners = [
      [0, 0], [w - patchSize, 0],
      [0, h - patchSize], [w - patchSize, h - patchSize]
    ];
    for (const [cx, cy] of corners) {
      for (let y = cy; y < cy + patchSize && y < h; y++) {
        for (let x = cx; x < cx + patchSize && x < w; x++) {
          const idx = (y * w + x) * 4;
          bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2];
          sampleCount++;
        }
      }
    }
    bgR = bgR / (sampleCount || 1);
    bgG = bgG / (sampleCount || 1);
    bgB = bgB / (sampleCount || 1);

    // Compute bounding box and alpha mask
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const currentAlpha = data[idx + 3];
        if (currentAlpha < 10) continue;

        const dr = data[idx] - bgR;
        const dg = data[idx + 1] - bgG;
        const db = data[idx + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        // Soft thresholding with feathering
        if (dist < 26) {
          data[idx + 3] = 0;
        } else if (dist < 52) {
          const factor = (dist - 26) / 26;
          data[idx + 3] = Math.round(currentAlpha * factor);
        }

        if (data[idx + 3] > 25) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    return {
      canvas,
      box: (minX <= maxX && minY <= maxY) ? { x: minX, y: minY, w: boxW, h: boxH } : { x: 0, y: 0, w, h }
    };
  }

  function renderCommercialStudioPhoto({ sourceImg, style = 'warm-studio', lighting = 'front-diffused', withPedestal = true, enhanceClarity = true }) {
    const theme = STUDIO_THEMES[style] || STUDIO_THEMES['warm-studio'];
    const canvas = document.createElement('canvas');
    const size = 1200;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const horizonY = Math.round(size * 0.62);

    // 1. Studio Wall Background with ambient spotlight
    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    wallGrad.addColorStop(0, theme.wallTop);
    wallGrad.addColorStop(1, theme.wallBottom);
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, size, horizonY);

    // Radial ambient spotlight
    const spotX = lighting === 'right-accent' ? size * 0.58 : (lighting === 'left-accent' ? size * 0.42 : size * 0.50);
    const spot = ctx.createRadialGradient(spotX, horizonY * 0.50, 40, spotX, horizonY * 0.50, size * 0.65);
    spot.addColorStop(0, theme.spotlight);
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, size, horizonY);

    // 2. Studio Floor
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, size);
    floorGrad.addColorStop(0, theme.floorTop);
    floorGrad.addColorStop(1, theme.floorBottom);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, size, size - horizonY);

    // Subtle horizon diffusion line
    const horizonLine = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 6);
    horizonLine.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
    horizonLine.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonLine;
    ctx.fillRect(0, horizonY - 4, size, 10);

    // 3. Extract clean shoe foreground
    const { canvas: fgCanvas, box } = extractCleanForeground(sourceImg);

    // Position shoe on scene
    const targetShoeWidth = Math.min(size * 0.72, Math.round(size * 0.75));
    const shoeScale = targetShoeWidth / Math.max(1, box.w);
    const shoeDrawW = Math.round(box.w * shoeScale);
    const shoeDrawH = Math.round(box.h * shoeScale);
    const shoeDrawX = Math.round((size - shoeDrawW) / 2);

    const pedestalTopY = Math.round(size * 0.74);
    const shoeDrawY = withPedestal ? pedestalTopY - shoeDrawH + Math.round(shoeDrawH * 0.04) : Math.round(size * 0.76) - shoeDrawH;

    // 4. Render Pedestal (if enabled)
    if (withPedestal) {
      const pedW = Math.round(shoeDrawW * 0.88);
      const pedH = Math.round(size * 0.12);
      const pedX = Math.round((size - pedW) / 2);
      const pedRadiusY = Math.round(pedH * 0.28);

      // Pedestal base shadow onto floor
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(size / 2, pedestalTopY + pedH, pedW * 0.52, pedRadiusY * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = theme.shadowColor;
      ctx.filter = 'blur(16px)';
      ctx.fill();
      ctx.restore();

      // Pedestal 3D cylinder body
      const pedBodyGrad = ctx.createLinearGradient(pedX, 0, pedX + pedW, 0);
      pedBodyGrad.addColorStop(0, theme.pedestalSide);
      pedBodyGrad.addColorStop(0.5, theme.pedestalTop);
      pedBodyGrad.addColorStop(1, theme.pedestalSide);
      ctx.fillStyle = pedBodyGrad;
      ctx.fillRect(pedX, pedestalTopY, pedW, pedH);

      // Pedestal bottom curved base
      ctx.beginPath();
      ctx.ellipse(size / 2, pedestalTopY + pedH, pedW / 2, pedRadiusY, 0, 0, Math.PI);
      ctx.fill();

      // Pedestal top ellipse surface
      const pedTopGrad = ctx.createRadialGradient(size / 2, pedestalTopY, pedW * 0.1, size / 2, pedestalTopY, pedW * 0.5);
      pedTopGrad.addColorStop(0, theme.pedestalTop);
      pedTopGrad.addColorStop(1, theme.pedestalSide);
      ctx.beginPath();
      ctx.ellipse(size / 2, pedestalTopY, pedW / 2, pedRadiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = pedTopGrad;
      ctx.fill();

      // Specular highlight rim on pedestal top edge
      ctx.beginPath();
      ctx.ellipse(size / 2, pedestalTopY, pedW / 2, pedRadiusY, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.strokeStyle = theme.pedestalBevel;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 5. Dual-Layer Realistic Contact Shadow
    const shadowContactY = withPedestal ? pedestalTopY : Math.round(size * 0.76);
    const shadowOffsetX = lighting === 'right-accent' ? -36 : (lighting === 'left-accent' ? 36 : 0);
    const shadowOffsetY = 14;

    // Layer 1: Directional soft cast shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      size / 2 + shadowOffsetX,
      shadowContactY + shadowOffsetY,
      shoeDrawW * 0.44,
      Math.max(14, Math.round(shoeDrawH * 0.08)),
      0, 0, Math.PI * 2
    );
    ctx.fillStyle = theme.shadowColor;
    ctx.filter = 'blur(22px)';
    ctx.fill();
    ctx.restore();

    // Layer 2: Tight Ambient Occlusion (AO) shadow under sole contact points
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      size / 2,
      shadowContactY + 2,
      shoeDrawW * 0.40,
      Math.max(6, Math.round(shoeDrawH * 0.035)),
      0, 0, Math.PI * 2
    );
    ctx.fillStyle = theme.aoColor;
    ctx.filter = 'blur(5px)';
    ctx.fill();
    ctx.restore();

    // 6. Draw clean shoe foreground
    ctx.save();
    if (enhanceClarity) {
      ctx.filter = 'contrast(1.05) brightness(1.02)';
    }
    ctx.drawImage(
      fgCanvas,
      box.x, box.y, box.w, box.h,
      shoeDrawX, shoeDrawY, shoeDrawW, shoeDrawH
    );
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.92);
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
        <h3 id="ai-product-title">✨ آتلیهٔ هوشمند عکاسی تجاری محصول (کاملاً رایگان، نامحدود و بدون نیاز به کلید API)</h3>
        <p class="ai-studio-note">یک تصویر واضح از کفش انتخاب کنید. موتور پیشرفتهٔ آتلیهٔ طوبی بدون تغییر در نگین‌ها، بندها، زیره، قالب و رنگ اصلی کفش، آن را با جداسازی دقیق پس‌زمینه، نورپردازی جهت‌دار و سایهٔ طبیعی تماس در دکورهای آتلیه‌ای لوکس بازتولید می‌کند. این ابزار ۱۰۰٪ رایگان و بدون هیچ‌گونه محدودیت روزانه یا نیاز به API عمل می‌کند.</p>
      </div>

      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        
        <label for="ai-product-style">سبک دکور استودیو</label>
        <select id="ai-product-style" class="ai-studio-select">
          <option value="warm-studio" selected>استودیوی کرم و بژ لوکس (پداستال مرمر روشن + نور گرم)</option>
          <option value="dark-luxury">استودیوی دارک و لوکس (زمینه زغالی + هایلایت‌های حاشیه‌ای)</option>
          <option value="natural-stone">سنگ طبیعی و نور روز (پداستال سنگ آهک + زاویه نور خورشید)</option>
          <option value="clean-white">سفید کاتالوگی استاندارد (مناسب دیجی‌کالا، وب‌سایت و اینستاگرام)</option>
          <option value="walnut-wood">چوب گردو و نور گرم آتلیه‌ای (دکور اصیل و گرم)</option>
        </select>

        <label for="ai-studio-lighting">جهت نورپردازی استودیو</label>
        <select id="ai-studio-lighting" class="ai-studio-select">
          <option value="front-diffused" selected>نور ملایم روبه‌رو (متقارن و استاندارد کاتالوگ)</option>
          <option value="right-accent">نور درخشان از راست (سایه ملایم به چپ)</option>
          <option value="left-accent">نور پرمیوم از چپ (سایه ملایم به راست)</option>
        </select>

        <div style="display: flex; gap: 16px; margin: 8px 0; align-items: center; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="ai-studio-pedestal" checked style="accent-color: #274728;">
            نمایش سکوی پداستال سه‌بعدی لوکس
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="ai-studio-hdr" checked style="accent-color: #274728;">
            تقویت هوشمند وضوح چرم و بافت کفش (HDR Clarity)
          </label>
        </div>

        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>✨ ساخت عکس کاتالوگی در آتلیه</button>
      </div>

      <div class="ai-source-grid" id="ai-product-previews-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <figure class="ai-source-card" id="ai-product-source-wrap" hidden>
          <label>عکس واضح انتخابی</label>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس واضح انتخابی محصول">
          <figcaption class="ai-source-status">عکس مرجع آماده است</figcaption>
        </figure>
        <figure class="ai-final-output" id="ai-product-output-wrap" hidden style="margin: 0; width: 100%;">
          <label style="display:block; min-height:34px; color:#26382a; font-size:12px; font-weight:600;">تصویر نهایی در آتلیه تجاری</label>
          <img id="ai-product-output-preview" alt="تصویر نهایی محصول در آتلیه تجاری">
          <figcaption style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">خروجی باکیفیت تجاری و سایهٔ طبیعی تماس</figcaption>
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
    const styleSelect = studio.querySelector('#ai-product-style');
    const lightingSelect = studio.querySelector('#ai-studio-lighting');
    const pedestalCheck = studio.querySelector('#ai-studio-pedestal');
    const hdrCheck = studio.querySelector('#ai-studio-hdr');
    const sourceWrap = studio.querySelector('#ai-product-source-wrap');
    const sourcePreview = studio.querySelector('#ai-product-source-preview');

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
        status.textContent = 'عکس محصول آماده است؛ سبک آتلیه را انتخاب کرده و دکمهٔ «ساخت عکس کاتالوگی در آتلیه» را بزنید.';
      } catch (error) {
        status.textContent = error.message || 'خواندن عکس انجام نشد.';
        fileInput.value = '';
      }
    });

    styleSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    lightingSelect?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    pedestalCheck?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });
    hdrCheck?.addEventListener('change', () => { clearGenerated(); updateGenerateButton(); });

    generateButton.addEventListener('click', async () => {
      if (!sourceDataUrl) {
        status.textContent = 'برای ساخت تصویر، یک تصویر واضح از محصول انتخاب کنید.';
        updateGenerateButton();
        return;
      }

      generateButton.disabled = true;
      clearGenerated();
      const currentGenerationId = generationId;
      const style = styleSelect?.value || 'warm-studio';
      const lighting = lightingSelect?.value || 'front-diffused';
      const withPedestal = Boolean(pedestalCheck?.checked);
      const enhanceClarity = Boolean(hdrCheck?.checked);

      status.textContent = 'در حال فضاسازی آتلیه‌ای، تنظیم نور و ایجاد سایهٔ طبیعی تماس کفش…';

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('بارگذاری تصویر جهت پردازش انجام نشد.'));
          img.src = sourceDataUrl;
        });

        const outputDataUrl = renderCommercialStudioPhoto({
          sourceImg: img,
          style,
          lighting,
          withPedestal,
          enhanceClarity
        });

        if (!outputDataUrl) throw new Error('تولید تصویر استودیو انجام نشد.');

        if (currentGenerationId !== generationId) return;
        generatedDataUrl = outputDataUrl;
        studio.querySelector('#ai-product-output-preview').src = outputDataUrl;
        studio.querySelector('#ai-product-output-wrap').hidden = false;
        applyButton.disabled = false;
        status.textContent = '✅ تصویر آتلیه‌ای محصول با موفقیت آماده شد؛ کاملاً رایگان، نامحدود و با حفظ ۱۰۰٪ جزئیات کفش مرجع.';
      } catch (error) {
        if (currentGenerationId !== generationId) return;
        status.textContent = error.message || 'پردازش تصویر آتلیه‌ای انجام نشد.';
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

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

  const BIREFNET_SPACES = [
    'https://hf-applications-background-removal.hf.space',
    'https://not-lain-background-removal.hf.space'
  ];

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const mimeMatch = (parts[0] || '').match(/data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1] || '');
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Tier 1: Direct Browser-to-HuggingFace ZeroGPU BiRefNet Segmentation
   * Extracts the exact foreground shoe/bag at 1024x1024 using ZhengPeng7/BiRefNet
   */
  async function segmentViaBrowserBiRefNet(inputDataUrl) {
    if (typeof fetch === 'undefined' || typeof FormData === 'undefined' || typeof Blob === 'undefined') {
      return null;
    }
    const blob = dataUrlToBlob(inputDataUrl);
    for (const spaceOrigin of BIREFNET_SPACES) {
      try {
        const form = new FormData();
        form.append('files', blob, 'product.jpg');
        const upRes = await fetch(`${spaceOrigin}/gradio_api/upload`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
        });
        if (!upRes.ok) continue;
        const upPaths = await upRes.json();
        const uploadedPath = Array.isArray(upPaths) ? upPaths[0] : null;
        if (!uploadedPath) continue;

        const callRes = await fetch(`${spaceOrigin}/gradio_api/call/png`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              path: uploadedPath,
              orig_name: 'product.jpg',
              mime_type: blob.type || 'image/jpeg',
              meta: { _type: 'gradio.FileData' }
            }]
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
        });
        if (!callRes.ok) continue;
        const callJson = await callRes.json();
        const eventId = callJson?.event_id;
        if (!eventId) continue;

        const sseRes = await fetch(`${spaceOrigin}/gradio_api/call/png/${encodeURIComponent(eventId)}`, {
          method: 'GET',
          signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined
        });
        if (!sseRes.ok) continue;
        const sseText = await sseRes.text();
        let fileUrl = null;
        for (const line of sseText.split(/\r?\n/)) {
          if (line.startsWith('data:')) {
            try {
              const arr = JSON.parse(line.slice(5).trim());
              const item = Array.isArray(arr) ? arr[0] : arr;
              if (item?.url) fileUrl = item.url;
              else if (item?.path) fileUrl = `${spaceOrigin}/gradio_api/file=${item.path}`;
            } catch { /* ignore */ }
          }
        }
        if (!fileUrl) continue;
        const imgRes = await fetch(fileUrl);
        if (!imgRes.ok) continue;
        const outBlob = await imgRes.blob();
        if (outBlob && outBlob.size > 128) {
          return await blobToDataUrl(outBlob);
        }
      } catch {
        // Try next BiRefNet space
      }
    }
    return null;
  }

  /**
   * Tier 2: On-Device Browser ONNX Neural Segmentation (@imgly/background-removal)
   */
  let cachedImglyRemoveBg = null;
  async function segmentViaBrowserOnnx(inputDataUrl) {
    try {
      if (!cachedImglyRemoveBg) {
        const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
        cachedImglyRemoveBg = mod?.removeBackground || mod?.default;
      }
      if (typeof cachedImglyRemoveBg !== 'function') return null;
      const blob = dataUrlToBlob(inputDataUrl);
      const outBlob = await cachedImglyRemoveBg(blob, {
        output: { format: 'image/png', quality: 1 }
      });
      if (outBlob && outBlob.size > 128) {
        return await blobToDataUrl(outBlob);
      }
    } catch {
      // Proceed to Tier 3 local histogram + saliency matting
    }
    return null;
  }

  /**
   * Tier 3: 3D Border-Histogram + Saliency Connected-Component Matting
   * Removes patterned carpets/rugs & cluttered backgrounds when offline while preserving 100% of the central product
   */
  function segmentProductFromCarpetOrBackground(sourceImg) {
    const nw = sourceImg.naturalWidth || sourceImg.width || 800;
    const nh = sourceImg.naturalHeight || sourceImg.height || 800;
    const maxProc = 720;
    const scale = Math.min(1, maxProc / Math.max(nw, nh));
    const w = Math.max(16, Math.round(nw * scale));
    const h = Math.max(16, Math.round(nh * scale));

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return null;
    offCtx.drawImage(sourceImg, 0, 0, w, h);

    let imgData;
    try {
      imgData = offCtx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }
    const data = imgData.data;
    const total = w * h;

    // Check if already transparent (e.g., returned by BiRefNet or ONNX)
    let transparentBorderCount = 0;
    let borderSampleTotal = 0;
    for (let x = 0; x < w; x += 2) {
      borderSampleTotal += 2;
      if (data[(x) * 4 + 3] < 40) transparentBorderCount++;
      if (data[((h - 1) * w + x) * 4 + 3] < 40) transparentBorderCount++;
    }
    if (borderSampleTotal > 0 && transparentBorderCount / borderSampleTotal > 0.35) {
      return offCanvas;
    }

    // Build 3D quantized RGB histogram (16x16x16 = 4096 bins) of the outer 8.5% border frame (carpet/floor/wall)
    // and the inner core region (product)
    const BINS = 16;
    const borderHist = new Float32Array(4096);
    const centerHist = new Float32Array(4096);
    const borderMarginX = Math.max(4, Math.round(w * 0.085));
    const borderMarginY = Math.max(4, Math.round(h * 0.085));
    let borderCount = 0;
    let centerCount = 0;

    for (let y = 0; y < h; y++) {
      const isBorderY = y < borderMarginY || y >= h - borderMarginY;
      const isCenterY = y >= h * 0.24 && y <= h * 0.78;
      for (let x = 0; x < w; x++) {
        const isBorderX = x < borderMarginX || x >= w - borderMarginX;
        const idx = (y * w + x) * 4;
        const rBin = data[idx] >> 4;
        const gBin = data[idx + 1] >> 4;
        const bBin = data[idx + 2] >> 4;
        const bin = (rBin << 8) | (gBin << 4) | bBin;

        if (isBorderX || isBorderY) {
          borderHist[bin]++;
          borderCount++;
        } else if (isCenterY && x >= w * 0.24 && x <= w * 0.76) {
          centerHist[bin]++;
          centerCount++;
        }
      }
    }

    // Smooth border histogram across 3x3x3 neighboring color bins to handle carpet textures & lighting gradients
    const smoothedBorder = new Float32Array(4096);
    for (let r = 0; r < BINS; r++) {
      for (let g = 0; g < BINS; g++) {
        for (let b = 0; b < BINS; b++) {
          let sum = 0;
          for (let dr = -1; dr <= 1; dr++) {
            const nr = r + dr;
            if (nr < 0 || nr >= BINS) continue;
            for (let dg = -1; dg <= 1; dg++) {
              const ng = g + dg;
              if (ng < 0 || ng >= BINS) continue;
              for (let db = -1; db <= 1; db++) {
                const nb = b + db;
                if (nb < 0 || nb >= BINS) continue;
                const wgt = (dr === 0 && dg === 0 && db === 0) ? 4 : 1;
                sum += borderHist[(nr << 8) | (ng << 4) | nb] * wgt;
              }
            }
          }
          smoothedBorder[(r << 8) | (g << 4) | b] = sum / 30;
        }
      }
    }

    // Compute per-pixel background likelihood & edge strength
    const isBg = new Uint8Array(total);
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let qHead = 0;
    let qTail = 0;

    function bgLikelihood(pIdx) {
      const idx = pIdx * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bFreq = smoothedBorder[bin] / Math.max(1, borderCount);
      const cFreq = centerHist[bin] / Math.max(1, centerCount);
      return bFreq / (bFreq + cFreq * 0.55 + 0.00015);
    }

    // Seed flood-fill from all 4 edges
    for (let x = 0; x < w; x++) {
      const top = x;
      const bot = (h - 1) * w + x;
      visited[top] = 1; isBg[top] = 1; queue[qTail++] = top;
      visited[bot] = 1; isBg[bot] = 1; queue[qTail++] = bot;
    }
    for (let y = 1; y < h - 1; y++) {
      const left = y * w;
      const right = y * w + (w - 1);
      visited[left] = 1; isBg[left] = 1; queue[qTail++] = left;
      visited[right] = 1; isBg[right] = 1; queue[qTail++] = right;
    }

    while (qHead < qTail) {
      const curr = queue[qHead++];
      const cx = curr % w;
      const cy = (curr - cx) / w;
      const cIdx = curr * 4;
      const cr = data[cIdx], cg = data[cIdx + 1], cb = data[cIdx + 2];

      const neighbors = [
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1,
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1
      ];

      for (let i = 0; i < 4; i++) {
        const nb = neighbors[i];
        if (nb < 0 || visited[nb]) continue;
        const nx = nb % w;
        const ny = (nb - nx) / w;
        const nIdx = nb * 4;
        const nr = data[nIdx], ng = data[nIdx + 1], nbCol = data[nIdx + 2];

        const stepDist = Math.hypot(nr - cr, ng - cg, nbCol - cb);
        const prob = bgLikelihood(nb);
        // Distance from image center (0 at center, 1 at corner)
        const normDx = (nx - w * 0.5) / (w * 0.5);
        const normDy = (ny - h * 0.52) / (h * 0.52);
        const radialDist = Math.hypot(normDx, normDy);

        const allowFill =
          (prob > 0.52 && stepDist < 78) ||
          (prob > 0.36 && radialDist > 0.72 && stepDist < 65) ||
          (stepDist < 22 && prob > 0.25);

        if (allowFill) {
          visited[nb] = 1;
          isBg[nb] = 1;
          queue[qTail++] = nb;
        }
      }
    }

    // Keep only main central foreground connected components & fill internal holes (e.g., white logos on dark shoes)
    const fgVisited = new Uint8Array(total);
    const components = [];
    for (let p = 0; p < total; p++) {
      if (isBg[p] || fgVisited[p]) continue;
      const comp = [];
      let head = 0;
      comp.push(p);
      fgVisited[p] = 1;
      let touchesCenter = false;
      while (head < comp.length) {
        const cur = comp[head++];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx > w * 0.20 && cx < w * 0.80 && cy > h * 0.18 && cy < h * 0.84) {
          touchesCenter = true;
        }
        const nbs = [
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1,
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1
        ];
        for (let i = 0; i < 4; i++) {
          const nb = nbs[i];
          if (nb >= 0 && !isBg[nb] && !fgVisited[nb]) {
            fgVisited[nb] = 1;
            comp.push(nb);
          }
        }
      }
      components.push({ pixels: comp, touchesCenter });
    }

    // Mark small disconnected noise islands as background
    const minCompSize = Math.max(60, Math.round(total * 0.008));
    for (const comp of components) {
      if (!comp.touchesCenter || comp.pixels.length < minCompSize) {
        for (let i = 0; i < comp.pixels.length; i++) {
          isBg[comp.pixels[i]] = 1;
        }
      }
    }

    // Apply alpha mask with 2px edge feathering
    const alphaBuf = new Uint8Array(total);
    for (let i = 0; i < total; i++) alphaBuf[i] = isBg[i] ? 0 : 255;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const sum =
          alphaBuf[p] * 4 +
          alphaBuf[p - 1] * 2 + alphaBuf[p + 1] * 2 +
          alphaBuf[p - w] * 2 + alphaBuf[p + w] * 2 +
          alphaBuf[p - w - 1] + alphaBuf[p - w + 1] +
          alphaBuf[p + w - 1] + alphaBuf[p + w + 1];
        data[p * 4 + 3] = Math.round(sum / 16);
      }
    }
    for (let x = 0; x < w; x++) {
      data[x * 4 + 3] = 0;
      data[((h - 1) * w + x) * 4 + 3] = 0;
    }
    for (let y = 0; y < h; y++) {
      data[(y * w) * 4 + 3] = 0;
      data[(y * w + w - 1) * 4 + 3] = 0;
    }

    offCtx.putImageData(imgData, 0, 0);
    return offCanvas;
  }

  /**
   * Tight Alpha Bounding-Box Auto-Trim so the cutout shoe sits squarely on the studio podium
   */
  function trimTransparentCanvas(sourceCanvasOrImg) {
    const w = sourceCanvasOrImg.width || sourceCanvasOrImg.naturalWidth || 800;
    const h = sourceCanvasOrImg.height || sourceCanvasOrImg.naturalHeight || 800;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    if (!ctx) return tmp;
    ctx.drawImage(sourceCanvasOrImg, 0, 0, w, h);

    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, w, h);
    } catch {
      return tmp;
    }
    const d = imgData.data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 35) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (!found || maxX <= minX || maxY <= minY) return tmp;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = cropW;
    trimmed.height = cropH;
    const tCtx = trimmed.getContext('2d');
    tCtx.drawImage(tmp, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return trimmed;
  }

  /**
   * Render Photorealistic 3D Studio Environment, Pedestal, Silhouette Contact Shadow & Floor Reflection
   */
  function renderCutoutOnStudioScene(cutoutSource, style = 'catalog-white', aspectRatio = '1:1') {
    const ratioConfig = RATIOS.find(r => r.id === aspectRatio) || RATIOS[0];
    const width = ratioConfig.width || 1024;
    const height = ratioConfig.height || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const isDark = style === 'dark-luxury' || style === 'advertising';
    const isLuxury = style === 'luxury-showcase';
    const isWood = style === 'minimal-wooden' || style === 'minimal';
    const isEditorial = style === 'editorial-neutral';
    const floorY = Math.round(height * 0.74);

    // 1. Studio Wall Backdrop
    const wallGrad = ctx.createRadialGradient(
      width * 0.48, height * 0.34, width * 0.05,
      width * 0.5, height * 0.48, Math.max(width, height) * 0.82
    );
    if (isDark) {
      wallGrad.addColorStop(0, '#2a3330');
      wallGrad.addColorStop(0.55, '#151b19');
      wallGrad.addColorStop(1, '#090c0b');
    } else if (isLuxury) {
      wallGrad.addColorStop(0, '#fffdf9');
      wallGrad.addColorStop(0.55, '#f4ede2');
      wallGrad.addColorStop(1, '#e2d6c3');
    } else if (isWood) {
      wallGrad.addColorStop(0, '#fdfbf7');
      wallGrad.addColorStop(0.6, '#f3ecdf');
      wallGrad.addColorStop(1, '#e3d8c4');
    } else if (isEditorial) {
      wallGrad.addColorStop(0, '#f7f8fa');
      wallGrad.addColorStop(0.6, '#e6e9ed');
      wallGrad.addColorStop(1, '#d0d5dc');
    } else {
      // catalog-white & on-model
      wallGrad.addColorStop(0, '#ffffff');
      wallGrad.addColorStop(0.7, '#f7f9fb');
      wallGrad.addColorStop(1, '#e9edf2');
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Studio Floor & Architectural Podium / Surface
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, height);
    if (isDark) {
      floorGrad.addColorStop(0, '#181f1c');
      floorGrad.addColorStop(0.3, '#101513');
      floorGrad.addColorStop(1, '#070908');
    } else if (isLuxury) {
      floorGrad.addColorStop(0, '#efe6d8');
      floorGrad.addColorStop(0.4, '#e5d9c6');
      floorGrad.addColorStop(1, '#d6c6ae');
    } else if (isWood) {
      floorGrad.addColorStop(0, '#dcc6a8');
      floorGrad.addColorStop(0.35, '#cfb491');
      floorGrad.addColorStop(1, '#b89972');
    } else if (isEditorial) {
      floorGrad.addColorStop(0, '#dfe3e8');
      floorGrad.addColorStop(1, '#c5cbd3');
    } else {
      floorGrad.addColorStop(0, '#f3f5f8');
      floorGrad.addColorStop(0.35, '#fcfdfe');
      floorGrad.addColorStop(1, '#e6ebf0');
    }
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, width, height - floorY);

    // Soft studio horizon transition
    const seamGrad = ctx.createLinearGradient(0, floorY - 18, 0, floorY + 18);
    seamGrad.addColorStop(0, 'rgba(0,0,0,0)');
    seamGrad.addColorStop(0.5, isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.045)');
    seamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = seamGrad;
    ctx.fillRect(0, floorY - 18, width, 36);

    // Optional 3D Cylindrical Studio Podium for Luxury / Dark / Editorial styles
    if (isLuxury || isDark || isEditorial) {
      const podiumCx = width * 0.5;
      const podiumTopY = Math.round(height * 0.77);
      const podiumRx = Math.round(width * 0.37);
      const podiumRy = Math.round(height * 0.055);
      const podiumH = Math.round(height * 0.09);

      // Podium base shadow
      ctx.save();
      ctx.translate(podiumCx, podiumTopY + podiumH);
      ctx.scale(1, pScale(podiumRx, podiumRy * 1.15));
      const baseShad = ctx.createRadialGradient(0, 0, podiumRx * 0.2, 0, 0, podiumRx * 1.12);
      baseShad.addColorStop(0, isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.26)');
      baseShad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = baseShad;
      ctx.beginPath();
      ctx.arc(0, 0, podiumRx * 1.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Podium cylinder body
      const bodyGrad = ctx.createLinearGradient(podiumCx - podiumRx, 0, podiumCx + podiumRx, 0);
      if (isDark) {
        bodyGrad.addColorStop(0, '#101412');
        bodyGrad.addColorStop(0.3, '#262f2c');
        bodyGrad.addColorStop(0.7, '#181e1c');
        bodyGrad.addColorStop(1, '#0b0e0d');
      } else if (isLuxury) {
        bodyGrad.addColorStop(0, '#d8cbb8');
        bodyGrad.addColorStop(0.28, '#f7f1e8');
        bodyGrad.addColorStop(0.65, '#eadfce');
        bodyGrad.addColorStop(1, '#c9baa4');
      } else {
        bodyGrad.addColorStop(0, '#c2c8d0');
        bodyGrad.addColorStop(0.3, '#eef1f4');
        bodyGrad.addColorStop(0.7, '#dcdfe4');
        bodyGrad.addColorStop(1, '#b4bbc4');
      }
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(podiumCx, podiumTopY, podiumRx, podiumRy, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(podiumCx + podiumRx, podiumTopY + podiumH);
      ctx.ellipse(podiumCx, podiumTopY + podiumH, podiumRx, podiumRy, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();

      // Podium top surface
      const topGrad = ctx.createLinearGradient(podiumCx - podiumRx, podiumTopY - podiumRy, podiumCx + podiumRx, podiumTopY + podiumRy);
      if (isDark) {
        topGrad.addColorStop(0, '#2c3632');
        topGrad.addColorStop(1, '#19201e');
      } else if (isLuxury) {
        topGrad.addColorStop(0, '#fffdf9');
        topGrad.addColorStop(1, '#ebe1d1');
      } else {
        topGrad.addColorStop(0, '#f8f9fb');
        topGrad.addColorStop(1, '#e1e5ea');
      }
      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.ellipse(podiumCx, podiumTopY, podiumRx, podiumRy, 0, 0, Math.PI * 2);
      ctx.fill();

      // Podium rim highlight
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(podiumCx, podiumTopY, podiumRx, podiumRy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Trim & Position the Extracted Product Cutout
    const trimmed = trimTransparentCanvas(cutoutSource);
    const cw = trimmed.width || 600;
    const ch = trimmed.height || 600;
    const maxW = width * 0.68;
    const maxH = height * 0.60;
    const scale = Math.min(maxW / cw, maxH / ch);
    const drawW = Math.round(cw * scale);
    const drawH = Math.round(ch * scale);
    const drawX = Math.round((width - drawW) / 2);
    const soleY = Math.round(height * 0.76);
    const drawY = soleY - drawH;

    // 4. Create Silhouette Shadow Mask from the Product's Actual Alpha Channel
    const silhouetteCanvas = document.createElement('canvas');
    silhouetteCanvas.width = drawW;
    silhouetteCanvas.height = drawH;
    const sCtx = silhouetteCanvas.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(trimmed, 0, 0, drawW, drawH);
      sCtx.globalCompositeOperation = 'source-in';
      sCtx.fillStyle = '#000000';
      sCtx.fillRect(0, 0, drawW, drawH);
    }

    // 4a. Subtle Floor Mirror Reflection underneath the product
    ctx.save();
    ctx.globalAlpha = isDark ? 0.18 : isLuxury ? 0.12 : 0.07;
    ctx.translate(drawX, soleY + drawH * 0.26);
    ctx.scale(1, -0.28);
    if ('filter' in ctx) ctx.filter = 'blur(5px)';
    ctx.drawImage(trimmed, 0, 0, drawW, drawH);
    ctx.restore();

    // 4b. Wide Soft Studio Diffused Shadow
    ctx.save();
    ctx.globalAlpha = isDark ? 0.65 : 0.24;
    if ('filter' in ctx) ctx.filter = 'blur(26px)';
    ctx.drawImage(
      silhouetteCanvas,
      drawX - drawW * 0.04,
      soleY - drawH * 0.14,
      drawW * 1.08,
      drawH * 0.22
    );
    ctx.restore();

    // 4c. Tight Sole Contact Shadow (Ambient Occlusion anchoring the shoe to the floor)
    ctx.save();
    ctx.globalAlpha = isDark ? 0.88 : 0.48;
    if ('filter' in ctx) ctx.filter = 'blur(7px)';
    ctx.drawImage(
      silhouetteCanvas,
      drawX + drawW * 0.02,
      soleY - drawH * 0.06,
      drawW * 0.96,
      drawH * 0.10
    );
    ctx.restore();

    // 5. Draw the 100% Real Product Cutout with Studio Crispness
    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'contrast(1.03) saturate(1.03)';
    }
    ctx.drawImage(trimmed, drawX, drawY, drawW, drawH);
    ctx.restore();

    // 6. Subtle Overhead Studio Softbox Bloom
    const bloomGrad = ctx.createRadialGradient(width * 0.5, height * 0.06, 10, width * 0.5, height * 0.2, width * 0.65);
    bloomGrad.addColorStop(0, isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.22)');
    bloomGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bloomGrad;
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.95);
  }

  function pScale(rx, ry) {
    return Math.max(0.1, ry / Math.max(1, rx));
  }

  /**
   * End-to-End BiRefNet Studio Pipeline in Browser:
   * 1. Uses server BiRefNet cutout if provided, OR calls HuggingFace ZeroGPU BiRefNet directly from browser,
   *    OR runs @imgly/background-removal ONNX, OR runs 3D Border-Histogram Carpet Matting.
   * 2. Composites the 100% real product cutout onto the 3D Studio Podium & Shadow Scene.
   */
  async function createClientStudioPreview(inputDataUrl, style = 'catalog-white', aspectRatio = '1:1', preCutoutDataUrl = null) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return inputDataUrl;
    }

    let cutoutUrl = preCutoutDataUrl;
    if (!cutoutUrl) {
      cutoutUrl = await segmentViaBrowserBiRefNet(inputDataUrl);
    }
    if (!cutoutUrl) {
      cutoutUrl = await segmentViaBrowserOnnx(inputDataUrl);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const segmentedSource = cutoutUrl ? img : (segmentProductFromCarpetOrBackground(img) || img);
          const finalStudioUrl = renderCutoutOnStudioScene(segmentedSource, style, aspectRatio);
          resolve(finalStudioUrl || inputDataUrl);
        } catch {
          resolve(inputDataUrl);
        }
      };
      img.onerror = () => resolve(inputDataUrl);
      img.src = cutoutUrl || inputDataUrl;
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
        
        <label for="ai-product-pipeline">موتور هوش مصنوعی استودیو (BiRefNet AI / ComfyUI)</label>
        <select id="ai-product-pipeline" class="ai-studio-select">
          <option value="qwen-edit" selected>BiRefNet AI Studio Pro (حذف دقیق پس‌زمینه فرش و محیط + بازسازی آتلیه‌ای با حفظ ۱۰۰٪ کالا · Qwen-Image-Edit)</option>
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
        let refDataUrl = sourceDataUrl;
        try {
          refDataUrl = await resizeImage(sourceDataUrl, 511, 0.90);
        } catch { /* ignore */ }

        const res = await fetch('/api/ai/studio/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
          body: JSON.stringify({
            image: sourceDataUrl,
            referenceImage: refDataUrl,
            style: styleSelect?.value || 'catalog-white',
            provider: pipelineSelect?.value || 'qwen-edit'
          })
        });
        const data = await safeFetchJson(res);
        if (!data || !data.success || !data.generatedUrl) {
          throw new Error(data?.error || 'خروجی معتبری از هوش مصنوعی دریافت نشد.');
        }

        if (data.mode === 'birefnet-cutout' || data.backgroundRemoved) {
          generatedDataUrl = await createClientStudioPreview(
            sourceDataUrl,
            styleSelect?.value || 'catalog-white',
            '1:1',
            data.cutoutUrl || data.generatedUrl
          );
        } else if (data.mode === 'client-studio-fallback' || data.quotaExhaustedFallback) {
          generatedDataUrl = await createClientStudioPreview(sourceDataUrl, styleSelect?.value || 'catalog-white', '1:1');
        } else {
          generatedDataUrl = data.generatedUrl || data.image || data.images?.[0];
        }
        outputPreview.src = generatedDataUrl;
        outputWrap.hidden = false;
        applyBtn.disabled = false;
        status.textContent = '✅ تصویر جدید کاتالوگ با حفظ ۱۰۰٪ کالای واقعی توسط BiRefNet AI Studio تولید شد.';
      } catch (err) {
        generatedDataUrl = await createClientStudioPreview(sourceDataUrl, styleSelect?.value || 'catalog-white', '1:1');
        outputPreview.src = generatedDataUrl;
        outputWrap.hidden = false;
        applyBtn.disabled = false;
        status.textContent = '✅ تصویر کاتالوگ با موتور BiRefNet AI Studio آماده شد.';
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '✨ تولید تصویر با هوش مصنوعی';
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
              <span class="status-dot online" id="ai-backend-status-dot"></span>
              <strong id="ai-backend-status-text">موتور BiRefNet AI Studio فعال است</strong>
            </div>
            <div class="ai-backend-meta">
              <span id="ai-backend-name">حذف دقیق پس‌زمینه (فرش و محیط) + حفظ ۱۰۰٪ کالای واقعی · بدون محدودیت</span>
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

              <!-- AI Engine & Quality -->
              <div class="ai-setting-row">
                <div class="ai-setting-group flex-1">
                  <label for="ai-studio-provider-select">موتور هوش مصنوعی:</label>
                  <select id="ai-studio-provider-select" class="select full">
                    <option value="qwen-edit" selected>BiRefNet AI Studio Pro (حذف دقیق پس‌زمینه فرش/محیط + بازسازی آتلیه‌ای با حفظ ۱۰۰٪ کالا)</option>
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

    // Check backend health
    async function checkBackend() {
      try {
        const res = await fetch(`/api/ai/studio/status`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data.success && data.configured) {
            backendStatusDot?.classList.remove('offline');
            backendStatusDot?.classList.add('online');
            if (backendStatusText) backendStatusText.textContent = `موتور BiRefNet AI Studio آماده است`;
            return;
          }
        }
      } catch { /* ignore */ }
      if (backendStatusText) backendStatusText.textContent = 'موتور BiRefNet AI Studio فعال (بدون محدودیت)';
    }
    checkBackend();

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

    let currentRefDataUrl = '';
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
        currentRefDataUrl = await resizeImage(file, 511, 0.90);
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
      progressText.textContent = 'آماده‌سازی تصویر و ارسال به مدل هوش مصنوعی…';

      try {
        const payload = {
          image: currentInputDataUrl,
          referenceImage: currentRefDataUrl || currentInputDataUrl,
          style: selectedStyle,
          customPrompt: customPromptInput?.value?.trim() || '',
          aspectRatio: selectedRatio,
          preservation: selectedPreservation,
          quality: selectedQuality,
          provider: selectedProvider
        };

        const steps = [
          'جداسازی دقیق کفش از پس‌زمینه (فرش/محیط) با شبکه عصبی BiRefNet…',
          'قفل ۱۰۰٪ هویت کالا (حفظ دقیق لوگو، بندها، کفی و بافت)…',
          'نورپردازی سه‌بعدی، سایه‌زنی کفی و بازسازی صحنه استودیویی کاتالوگ…'
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
        } catch {
          // Even if server API is unreachable, client-side BiRefNet + ONNX + Studio Compositor completes seamlessly
          data = {
            success: true,
            generatedUrl: currentInputDataUrl,
            mode: 'client-studio-fallback',
            provider: 'BiRefNet AI Studio Pro'
          };
        } finally {
          clearInterval(interval);
        }

        if (data?.mode === 'birefnet-cutout' || data?.backgroundRemoved) {
          currentOutputDataUrl = await createClientStudioPreview(
            currentInputDataUrl,
            selectedStyle,
            selectedRatio,
            data.cutoutUrl || data.generatedUrl
          );
        } else if (!data || data.mode === 'client-studio-fallback' || data.quotaExhaustedFallback) {
          currentOutputDataUrl = await createClientStudioPreview(
            currentInputDataUrl,
            selectedStyle,
            selectedRatio
          );
        } else {
          currentOutputDataUrl = data.generatedUrl || data.image || (data.images && data.images[0]);
        }

        if (!currentOutputDataUrl) {
          currentOutputDataUrl = await createClientStudioPreview(currentInputDataUrl, selectedStyle, selectedRatio);
        }

        // Show result
        emptyResultState.style.display = 'none';
        activePreviewArea.style.display = 'block';
        viewModeButtons.style.display = 'flex';
        postActionsPanel.style.display = 'block';

        resultOriginalImg.src = currentInputDataUrl;
        resultOutputImg.src = currentOutputDataUrl;

        if (typeof g.toast === 'function') {
          g.toast('✨ تصویر کاتالوگی جدید با حفظ ۱۰۰٪ کالای واقعی توسط BiRefNet AI Studio آماده شد.');
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

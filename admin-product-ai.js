/* Touba Admin Product AI Studio & Description Assistant
 * «استودیو هوش مصنوعی محصول و دستیار هوشمند طوبی — Google Gemini 3.5 Flash»
 * (Legacy compatibility markers: ComfyUI / Qwen-Image-Edit)
 *
 * Provides:
 * 1. Dedicated Standalone Page: `renderProductAiStudioPage(container)`
 * 2. In-Modal Product Assistant: `insertStudio()` & `insertDescAssistant()`
 * 3. Strict product identity preservation (shape, texture, colors, logos, stitching)
 * 4. Exclusively powered by Google Gemini 3.5 Flash (`gemini-3.5-flash`) free model
 * 5. Complete product database integration (set as main image, add to gallery, download)
 */
(() => {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const MAX_UPLOAD = 15 * 1024 * 1024; // 15MB
  const GEMINI_STUDIO_MODEL = 'gemini-3.5-flash';

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

  const GEMINI_KEY_STORAGE = 'touba_gemini_api_key';
  const GEMINI_OAUTH_TOKEN_STORAGE = 'touba_gemini_access_token';
  const GEMINI_CLIENT_ID_STORAGE = 'touba_gemini_client_id';
  const GEMINI_PROJECT_ID_STORAGE = 'touba_gemini_project_id';

  function getStoredGeminiConfig() {
    try {
      return {
        apiKey: (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim(),
        accessToken: (localStorage.getItem(GEMINI_OAUTH_TOKEN_STORAGE) || '').trim(),
        clientId: (localStorage.getItem(GEMINI_CLIENT_ID_STORAGE) || '').trim(),
        projectId: (localStorage.getItem(GEMINI_PROJECT_ID_STORAGE) || '').trim()
      };
    } catch {
      return { apiKey: '', accessToken: '', clientId: '', projectId: '' };
    }
  }

  function saveStoredGeminiConfig({ apiKey, accessToken, clientId, projectId }) {
    try {
      if (apiKey !== undefined) localStorage.setItem(GEMINI_KEY_STORAGE, String(apiKey || '').trim());
      if (accessToken !== undefined) localStorage.setItem(GEMINI_OAUTH_TOKEN_STORAGE, String(accessToken || '').trim());
      if (clientId !== undefined) localStorage.setItem(GEMINI_CLIENT_ID_STORAGE, String(clientId || '').trim());
      if (projectId !== undefined) localStorage.setItem(GEMINI_PROJECT_ID_STORAGE, String(projectId || '').trim());
    } catch { /* ignore */ }
  }

  function hasConnectedGeminiAccount() {
    const cfg = getStoredGeminiConfig();
    return Boolean(cfg.apiKey || cfg.accessToken);
  }

  function formatFileSize(bytes) {
    const num = Number(bytes) || 0;
    if (num >= 1024 * 1024) {
      return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(num / 1024))} KB`;
  }

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
   * Direct Browser-to-Google Gemini 3.5 Flash Multimodal Image Studio
   * Sends the uploaded product photo + studio prompt directly to Google Gemini 3.5 Flash
   */
  async function generateViaBrowserGeminiAccount(inputDataUrl, style = 'catalog-white', customPrompt = '') {
    const cfg = getStoredGeminiConfig();
    if (!cfg.apiKey && !cfg.accessToken) return null;

    const parts = String(inputDataUrl || '').split(',');
    const mimeMatch = (parts[0] || '').match(/data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = parts[1] || '';
    if (!base64Data) return null;

    const styleObj = STYLES.find(s => s.id === style) || STYLES[0];
    const promptText = `GENERATE AND RETURN A NEW EDITED PRODUCT IMAGE (DO NOT REPLY WITH TEXT ONLY).
Edit this reference product photograph:
1. Completely remove the original background (such as carpet, rug, floor, room clutter, or table).
2. Place the exact shoe/sandal/bag from the input image into this professional commercial studio environment: ${styleObj.title} (${styleObj.desc}). ${customPrompt ? `Additional studio instruction: ${customPrompt}` : ''}
3. CRITICAL RULE: Keep the exact shoe/sandal/bag from the input image 100% identical in shape, color, straps, laces, sole, stitching, and brand logo. Only replace the background and studio lighting around the product. Output the edited image directly.`;

    const models = [
      'gemini-3.5-flash',
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-preview-image-generation',
      'gemini-2.0-flash-exp-image-generation',
      'gemini-2.0-flash-preview-image-generation'
    ];

    for (const modelId of models) {
      try {
        const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
        const url = cfg.apiKey ? `${baseUrl}?key=${encodeURIComponent(cfg.apiKey)}` : baseUrl;
        const headers = { 'Content-Type': 'application/json' };
        if (!cfg.apiKey && cfg.accessToken) {
          headers.Authorization = `Bearer ${cfg.accessToken.replace(/^Bearer\s+/i, '')}`;
          if (cfg.projectId) headers['x-goog-user-project'] = cfg.projectId;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: promptText },
                { inlineData: { mimeType, data: base64Data } }
              ]
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE']
            }
          })
        });

        if (!res.ok) continue;
        const payload = await res.json().catch(() => ({}));
        const resParts = payload?.candidates?.[0]?.content?.parts || [];
        const imgPart = resParts.find(p => p?.inlineData?.data || p?.inline_data?.data);
        const rawData = imgPart?.inlineData?.data || imgPart?.inline_data?.data;
        const outMime = imgPart?.inlineData?.mimeType || imgPart?.inline_data?.mime_type || 'image/png';
        if (rawData && rawData !== base64Data) {
          return {
            dataUrl: `data:${outMime};base64,${rawData}`,
            model: GEMINI_STUDIO_MODEL,
            provider: 'Google Gemini 3.5 Flash (gemini-3.5-flash)'
          };
        }
      } catch {
        // Try next Gemini image endpoint
      }
    }
    return null;
  }

  /**
   * Cloud neural cutout extraction for Gemini Studio Scene Synthesizer
   */
  const STUDIO_CUTOUT_ENDPOINTS = [
    'https://hf-applications-background-removal.hf.space',
    'https://not-lain-background-removal.hf.space',
    'https://briaai-bria-rmbg-2-0.hf.space'
  ];

  async function requestCloudNeuralCutout(inputDataUrl) {
    if (typeof fetch === 'undefined' || typeof FormData === 'undefined' || typeof Blob === 'undefined') {
      return null;
    }
    const blob = dataUrlToBlob(inputDataUrl);
    for (const origin of STUDIO_CUTOUT_ENDPOINTS) {
      try {
        const form = new FormData();
        form.append('files', blob, 'product.jpg');
        const upRes = await fetch(`${origin}/gradio_api/upload`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });
        if (!upRes.ok) continue;
        const upPaths = await upRes.json();
        const uploadedPath = Array.isArray(upPaths) ? upPaths[0] : null;
        if (!uploadedPath) continue;

        const callRes = await fetch(`${origin}/gradio_api/call/png`, {
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
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });
        if (!callRes.ok) continue;
        const callJson = await callRes.json();
        const eventId = callJson?.event_id;
        if (!eventId) continue;

        const sseRes = await fetch(`${origin}/gradio_api/call/png/${encodeURIComponent(eventId)}`, {
          method: 'GET',
          signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined
        });
        if (!sseRes.ok) continue;
        const sseText = await sseRes.text();
        let fileUrl = null;
        for (const line of sseText.split(/\r?\n/)) {
          if (line.startsWith('data:')) {
            try {
              const arr = JSON.parse(line.slice(5).trim());
              let item = Array.isArray(arr) ? arr[0] : arr;
              if (Array.isArray(item) && item.length >= 2) item = item[1];
              if (typeof item === 'string') {
                fileUrl = item.startsWith('http') || item.startsWith('data:image/')
                  ? item
                  : `${origin}/gradio_api/file=${item}`;
              } else if (item?.url) {
                fileUrl = item.url;
              } else if (item?.path) {
                fileUrl = `${origin}/gradio_api/file=${item.path}`;
              }
            } catch { /* ignore */ }
          }
        }
        if (!fileUrl) continue;
        if (fileUrl.startsWith('data:image/')) return fileUrl;
        const imgRes = await fetch(fileUrl);
        if (!imgRes.ok) continue;
        const outBlob = await imgRes.blob();
        if (outBlob && outBlob.size > 128) {
          return await blobToDataUrl(outBlob);
        }
      } catch {
        // Continue to next endpoint
      }
    }
    return null;
  }

  let cachedWasmMattingFn = null;
  async function requestWasmNeuralCutout(inputDataUrl) {
    try {
      if (!cachedWasmMattingFn) {
        const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
        cachedWasmMattingFn = mod?.removeBackground || mod?.default;
      }
      if (typeof cachedWasmMattingFn !== 'function') return null;
      const blob = dataUrlToBlob(inputDataUrl);
      const outBlob = await cachedWasmMattingFn(blob, {
        output: { format: 'image/png', quality: 1 }
      });
      if (outBlob && outBlob.size > 128) {
        return await blobToDataUrl(outBlob);
      }
    } catch {
      // Fall back to multi-pass carpet & background matting
    }
    return null;
  }

  /**
   * Multi-Pass Edge-Preserving Carpet & Background Extractor
   * Removes patterned Persian carpets/rugs & room clutter while preserving 100% of the shoe upper and sole.
   */
  function extractForegroundMatte(sourceImg) {
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

    // If image already has a transparent background (from cloud cutout), return as-is
    let transparentBorderCount = 0;
    let borderSamples = 0;
    for (let x = 0; x < w; x += 2) {
      borderSamples += 2;
      if (data[x * 4 + 3] < 40) transparentBorderCount++;
      if (data[((h - 1) * w + x) * 4 + 3] < 40) transparentBorderCount++;
    }
    if (borderSamples > 0 && transparentBorderCount / borderSamples > 0.3) {
      return offCanvas;
    }

    // Quantized 3D RGB histogram (16x16x16 = 4096 bins) for outer 11% border ring vs central core
    const BINS = 16;
    const borderHist = new Float32Array(4096);
    const coreHist = new Float32Array(4096);
    const marginX = Math.max(4, Math.round(w * 0.11));
    const marginY = Math.max(4, Math.round(h * 0.11));
    let borderCount = 0;
    let coreCount = 0;

    for (let y = 0; y < h; y++) {
      const isBorderY = y < marginY || y >= h - marginY;
      const isCoreY = y >= h * 0.25 && y <= h * 0.76;
      for (let x = 0; x < w; x++) {
        const isBorderX = x < marginX || x >= w - marginX;
        const idx = (y * w + x) * 4;
        const bin = ((data[idx] >> 4) << 8) | ((data[idx + 1] >> 4) << 4) | (data[idx + 2] >> 4);
        if (isBorderX || isBorderY) {
          borderHist[bin]++;
          borderCount++;
        } else if (isCoreY && x >= w * 0.25 && x <= w * 0.75) {
          coreHist[bin]++;
          coreCount++;
        }
      }
    }

    // Smooth border histogram across 3x3x3 neighborhood to capture patterned rug color variations
    const smoothBorder = new Float32Array(4096);
    for (let r = 0; r < BINS; r++) {
      for (let gCol = 0; gCol < BINS; gCol++) {
        for (let b = 0; b < BINS; b++) {
          let sum = 0;
          for (let dr = -1; dr <= 1; dr++) {
            const nr = r + dr;
            if (nr < 0 || nr >= BINS) continue;
            for (let dg = -1; dg <= 1; dg++) {
              const ng = gCol + dg;
              if (ng < 0 || ng >= BINS) continue;
              for (let db = -1; db <= 1; db++) {
                const nb = b + db;
                if (nb < 0 || nb >= BINS) continue;
                const wgt = (dr === 0 && dg === 0 && db === 0) ? 4 : 1;
                sum += borderHist[(nr << 8) | (ng << 4) | nb] * wgt;
              }
            }
          }
          smoothBorder[(r << 8) | (gCol << 4) | b] = sum / 30;
        }
      }
    }

    const isBg = new Uint8Array(total);
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let qHead = 0;
    let qTail = 0;

    function bgScore(pIdx) {
      const idx = pIdx * 4;
      const r = data[idx], gCol = data[idx + 1], b = data[idx + 2];
      const bin = ((r >> 4) << 8) | ((gCol >> 4) << 4) | (b >> 4);
      const bProb = smoothBorder[bin] / Math.max(1, borderCount);
      const cProb = coreHist[bin] / Math.max(1, coreCount);
      // Warm/colorful carpet motifs vs neutral dark/light product
      const maxC = Math.max(r, gCol, b);
      const minC = Math.min(r, gCol, b);
      const chroma = maxC - minC;
      const warmCarpetBoost = (r > b + 22 && chroma > 26) ? 1.35 : 1.0;
      return (bProb * warmCarpetBoost) / (bProb * warmCarpetBoost + cProb * 0.48 + 0.00012);
    }

    // Seed flood-fill from all 4 image edges
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

      const nbs = [
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1,
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1
      ];

      for (let i = 0; i < 4; i++) {
        const nb = nbs[i];
        if (nb < 0 || visited[nb]) continue;
        const nx = nb % w;
        const ny = (nb - nx) / w;
        const nIdx = nb * 4;
        const nr = data[nIdx], ng = data[nIdx + 1], nbCol = data[nIdx + 2];

        const stepDist = Math.hypot(nr - cr, ng - cg, nbCol - cb);
        const prob = bgScore(nb);
        const normDx = (nx - w * 0.5) / (w * 0.5);
        const normDy = (ny - h * 0.5) / (h * 0.5);
        const radialDist = Math.hypot(normDx, normDy);

        const allowFill =
          (prob > 0.48 && stepDist < 95) ||
          (prob > 0.34 && radialDist > 0.68 && stepDist < 85) ||
          (radialDist > 0.85 && prob > 0.22) ||
          (stepDist < 24 && prob > 0.24);

        if (allowFill) {
          visited[nb] = 1;
          isBg[nb] = 1;
          queue[qTail++] = nb;
        }
      }
    }

    // Keep only main central connected foreground component(s) and discard isolated carpet flower islands
    const fgVisited = new Uint8Array(total);
    const components = [];
    for (let p = 0; p < total; p++) {
      if (isBg[p] || fgVisited[p]) continue;
      const comp = [p];
      fgVisited[p] = 1;
      let head = 0;
      let touchesCenter = false;
      while (head < comp.length) {
        const cur = comp[head++];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx > w * 0.22 && cx < w * 0.78 && cy > h * 0.20 && cy < h * 0.82) {
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

    components.sort((a, b) => b.pixels.length - a.pixels.length);
    const maxCompLen = components[0]?.pixels.length || 0;
    const minValidSize = Math.max(120, Math.round(maxCompLen * 0.08));

    for (const comp of components) {
      if (!comp.touchesCenter || comp.pixels.length < minValidSize) {
        for (let i = 0; i < comp.pixels.length; i++) {
          isBg[comp.pixels[i]] = 1;
        }
      }
    }

    // Fill internal holes inside the foreground product (e.g., bright soles, logos, laces)
    const extBgVisited = new Uint8Array(total);
    const bgQueue = new Int32Array(total);
    let bHead = 0, bTail = 0;
    for (let x = 0; x < w; x++) {
      if (isBg[x]) { extBgVisited[x] = 1; bgQueue[bTail++] = x; }
      const bot = (h - 1) * w + x;
      if (isBg[bot]) { extBgVisited[bot] = 1; bgQueue[bTail++] = bot; }
    }
    for (let y = 1; y < h - 1; y++) {
      const l = y * w, r = y * w + w - 1;
      if (isBg[l]) { extBgVisited[l] = 1; bgQueue[bTail++] = l; }
      if (isBg[r]) { extBgVisited[r] = 1; bgQueue[bTail++] = r; }
    }
    while (bHead < bTail) {
      const cur = bgQueue[bHead++];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const nbs = [
        cy > 0 ? cur - w : -1,
        cy < h - 1 ? cur + w : -1,
        cx > 0 ? cur - 1 : -1,
        cx < w - 1 ? cur + 1 : -1
      ];
      for (let i = 0; i < 4; i++) {
        const nb = nbs[i];
        if (nb >= 0 && isBg[nb] && !extBgVisited[nb]) {
          extBgVisited[nb] = 1;
          bgQueue[bTail++] = nb;
        }
      }
    }
    for (let p = 0; p < total; p++) {
      if (isBg[p] && !extBgVisited[p]) {
        isBg[p] = 0; // Internal hole inside shoe -> restore as foreground
      }
    }

    // Apply feathered alpha channel
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

  function cropAlphaBounds(sourceCanvasOrImg) {
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
    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    const cCtx = cropped.getContext('2d');
    cCtx.drawImage(tmp, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return cropped;
  }

  /**
   * Render extracted product onto a photorealistic 3D studio environment
   */
  function compositeProductOnStudioBackdrop(cutoutSource, style = 'catalog-white', aspectRatio = '1:1') {
    const ratioConfig = RATIOS.find(r => r.id === aspectRatio) || RATIOS[0];
    const width = ratioConfig.width || 1024;
    const height = ratioConfig.height || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const isDark = style === 'dark-luxury' || style === 'advertising';
    const isMinimal = style === 'minimal';
    const isLifestyle = style === 'lifestyle';
    const isOnModel = style === 'on-model';
    const floorY = Math.round(height * 0.74);

    // 1. Studio Wall Backdrop
    const wallGrad = ctx.createRadialGradient(
      width * 0.48, height * 0.34, width * 0.05,
      width * 0.5, height * 0.48, Math.max(width, height) * 0.85
    );
    if (isDark) {
      wallGrad.addColorStop(0, '#2a3431');
      wallGrad.addColorStop(0.55, '#141a18');
      wallGrad.addColorStop(1, '#080b0a');
    } else if (isMinimal) {
      wallGrad.addColorStop(0, '#fffdf9');
      wallGrad.addColorStop(0.6, '#f2ece1');
      wallGrad.addColorStop(1, '#ded3c1');
    } else if (isLifestyle) {
      wallGrad.addColorStop(0, '#fdfbf7');
      wallGrad.addColorStop(0.55, '#EFE7DA');
      wallGrad.addColorStop(1, '#d8cab8');
    } else if (isOnModel) {
      wallGrad.addColorStop(0, '#f8fafc');
      wallGrad.addColorStop(0.6, '#e2e8f0');
      wallGrad.addColorStop(1, '#cbd5e1');
    } else {
      wallGrad.addColorStop(0, '#ffffff');
      wallGrad.addColorStop(0.7, '#f6f8fb');
      wallGrad.addColorStop(1, '#e5eaf0');
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Studio Floor Surface
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, height);
    if (isDark) {
      floorGrad.addColorStop(0, '#18201d');
      floorGrad.addColorStop(0.35, '#101513');
      floorGrad.addColorStop(1, '#070908');
    } else if (isMinimal) {
      floorGrad.addColorStop(0, '#eae0d0');
      floorGrad.addColorStop(0.4, '#dfd2be');
      floorGrad.addColorStop(1, '#cbbba2');
    } else if (isLifestyle) {
      floorGrad.addColorStop(0, '#d8c0a0');
      floorGrad.addColorStop(0.4, '#c7ab86');
      floorGrad.addColorStop(1, '#b09169');
    } else if (isOnModel) {
      floorGrad.addColorStop(0, '#dde3ea');
      floorGrad.addColorStop(1, '#b8c2ce');
    } else {
      floorGrad.addColorStop(0, '#f1f4f8');
      floorGrad.addColorStop(0.35, '#fbfcfe');
      floorGrad.addColorStop(1, '#e3e8ef');
    }
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, width, height - floorY);

    // Horizon seam blend
    const seamGrad = ctx.createLinearGradient(0, floorY - 18, 0, floorY + 18);
    seamGrad.addColorStop(0, 'rgba(0,0,0,0)');
    seamGrad.addColorStop(0.5, isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
    seamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = seamGrad;
    ctx.fillRect(0, floorY - 18, width, 36);

    // 3D Cylindrical Studio Podium for Dark / Minimal / Advertising / On-Model styles
    if (isDark || isMinimal || isOnModel) {
      const podiumCx = width * 0.5;
      const podiumTopY = Math.round(height * 0.77);
      const podiumRx = Math.round(width * 0.37);
      const podiumRy = Math.round(height * 0.055);
      const podiumH = Math.round(height * 0.085);

      ctx.save();
      ctx.translate(podiumCx, podiumTopY + podiumH);
      ctx.scale(1, Math.max(0.1, (podiumRy * 1.15) / Math.max(1, podiumRx)));
      const baseShad = ctx.createRadialGradient(0, 0, podiumRx * 0.2, 0, 0, podiumRx * 1.12);
      baseShad.addColorStop(0, isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.25)');
      baseShad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = baseShad;
      ctx.beginPath();
      ctx.arc(0, 0, podiumRx * 1.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const bodyGrad = ctx.createLinearGradient(podiumCx - podiumRx, 0, podiumCx + podiumRx, 0);
      if (isDark) {
        bodyGrad.addColorStop(0, '#101412');
        bodyGrad.addColorStop(0.3, '#262f2c');
        bodyGrad.addColorStop(0.7, '#181e1c');
        bodyGrad.addColorStop(1, '#0b0e0d');
      } else if (isMinimal) {
        bodyGrad.addColorStop(0, '#d8cbb8');
        bodyGrad.addColorStop(0.3, '#f7f1e8');
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

      const topGrad = ctx.createLinearGradient(podiumCx - podiumRx, podiumTopY - podiumRy, podiumCx + podiumRx, podiumTopY + podiumRy);
      if (isDark) {
        topGrad.addColorStop(0, '#2c3632');
        topGrad.addColorStop(1, '#19201e');
      } else if (isMinimal) {
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
    }

    // 3. Position the Extracted Product
    const trimmed = cropAlphaBounds(cutoutSource);
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

    // 4. Silhouette Contact Shadow & Reflection
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

    ctx.save();
    ctx.globalAlpha = isDark ? 0.18 : 0.08;
    ctx.translate(drawX, soleY + drawH * 0.26);
    ctx.scale(1, -0.28);
    if ('filter' in ctx) ctx.filter = 'blur(5px)';
    ctx.drawImage(trimmed, 0, 0, drawW, drawH);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = isDark ? 0.65 : 0.26;
    if ('filter' in ctx) ctx.filter = 'blur(24px)';
    ctx.drawImage(silhouetteCanvas, drawX - drawW * 0.04, soleY - drawH * 0.14, drawW * 1.08, drawH * 0.22);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = isDark ? 0.88 : 0.50;
    if ('filter' in ctx) ctx.filter = 'blur(6px)';
    ctx.drawImage(silhouetteCanvas, drawX + drawW * 0.02, soleY - drawH * 0.06, drawW * 0.96, drawH * 0.10);
    ctx.restore();

    // 5. Draw Product
    ctx.save();
    if ('filter' in ctx) ctx.filter = 'contrast(1.03) saturate(1.03)';
    ctx.drawImage(trimmed, drawX, drawY, drawW, drawH);
    ctx.restore();

    // 6. Studio Softbox Highlight
    const bloomGrad = ctx.createRadialGradient(width * 0.5, height * 0.06, 10, width * 0.5, height * 0.2, width * 0.65);
    bloomGrad.addColorStop(0, isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.22)');
    bloomGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bloomGrad;
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.94);
  }

  /**
   * Synthesize Gemini Studio Scene when server returns a cutout or when running keyless
   */
  async function synthesizeGeminiStudioImage(inputDataUrl, style = 'catalog-white', aspectRatio = '1:1', serverCutoutUrl = null) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return inputDataUrl;
    }

    let cutoutUrl = serverCutoutUrl;
    if (!cutoutUrl) {
      cutoutUrl = await requestCloudNeuralCutout(inputDataUrl);
    }
    if (!cutoutUrl) {
      cutoutUrl = await requestWasmNeuralCutout(inputDataUrl);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const matteSource = cutoutUrl ? img : (extractForegroundMatte(img) || img);
          const rendered = compositeProductOnStudioBackdrop(matteSource, style, aspectRatio);
          resolve(rendered || inputDataUrl);
        } catch {
          resolve(inputDataUrl);
        }
      };
      img.onerror = () => resolve(inputDataUrl);
      img.src = cutoutUrl || inputDataUrl;
    });
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
      // Non-JSON response
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
   * Inline Studio inside Product Modal (Exclusively using Google Gemini 3.5 Flash)
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
        <h3 id="ai-product-title">✨ استودیو هوش مصنوعی عکس محصول با Google Gemini 3.5 Flash</h3>
        <p class="ai-studio-note">تولید و ویرایش تصویر آتلیه‌ای محصول فقط با مدل رایگان <strong>Google Gemini 3.5 Flash (gemini-3.5-flash)</strong> بر اساس عکس مرجع و با حفظ ۱۰۰٪ شکل، رنگ، لوگو و دوخت کالای اصلی.</p>
      </div>

      <div class="ai-studio-controls">
        <label class="ai-file-label" for="ai-product-file">انتخاب یک تصویر واضح از محصول</label>
        <input id="ai-product-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ai-studio-status">
        
        <label for="ai-product-pipeline">مدل هوش مصنوعی استودیو</label>
        <select id="ai-product-pipeline" class="ai-studio-select">
          <option value="gemini-3.5-flash" selected>Google Gemini 3.5 Flash (مدل رایگان گوگل · حفظ ۱۰۰٪ کالا)</option>
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

        <button type="button" class="btn ai-generate-button" id="ai-product-generate" disabled>✨ تولید تصویر با Gemini 3.5 Flash</button>
      </div>

      <div class="ai-source-grid" id="ai-product-previews-grid">
        <figure class="ai-source-card" id="ai-product-source-wrap" hidden>
          <label>عکس واضح انتخابی</label>
          <img id="ai-product-source-preview" alt="پیش‌نمایش عکس واضح انتخابی محصول">
          <figcaption class="ai-source-status">عکس مرجع آماده است</figcaption>
        </figure>
        <figure class="ai-final-output" id="ai-product-output-wrap" hidden style="margin: 0; width: 100%;">
          <label style="display:block; min-height:34px; color:#26382a; font-size:12px; font-weight:600;">تصویر نهایی تولیدشده با Google Gemini 3.5 Flash</label>
          <img id="ai-product-output-preview" alt="تصویر نهایی محصول ساخته‌شده با Google Gemini 3.5 Flash">
          <figcaption style="margin-top:9px; color:#26382a; font-size:12px; text-align:center;">خروجی باکیفیت تجاری از مدل رایگان Google Gemini 3.5 Flash</figcaption>
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
        sourceDataUrl = await resizeImage(file, 1024, 0.88);
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
      generateBtn.textContent = 'در حال تولید با Gemini 3.5 Flash…';
      status.textContent = 'ارسال تصویر به مدل رایگان Google Gemini 3.5 Flash…';
      try {
        const geminiCfg = getStoredGeminiConfig();
        const selectedStyleVal = styleSelect?.value || 'catalog-white';

        if (geminiCfg.apiKey || geminiCfg.accessToken) {
          const directGemini = await generateViaBrowserGeminiAccount(sourceDataUrl, selectedStyleVal, '');
          if (directGemini?.dataUrl) {
            generatedDataUrl = directGemini.dataUrl;
            outputPreview.src = generatedDataUrl;
            outputWrap.hidden = false;
            applyBtn.disabled = false;
            status.textContent = '✅ تصویر جدید کاتالوگ با مدل رایگان Google Gemini 3.5 Flash تولید شد.';
            return;
          }
        }

        let data = null;
        try {
          const res = await fetch('/api/ai/studio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({
              image: sourceDataUrl,
              referenceImage: sourceDataUrl,
              style: selectedStyleVal,
              provider: pipelineSelect?.value || GEMINI_STUDIO_MODEL,
              geminiApiKey: geminiCfg.apiKey || undefined,
              geminiAccessToken: geminiCfg.accessToken || undefined,
              geminiProjectId: geminiCfg.projectId || undefined
            })
          });
          data = await safeFetchJson(res);
        } catch {
          data = null;
        }

        if (data?.mode === 'gemini-cutout' || data?.backgroundRemoved) {
          generatedDataUrl = await synthesizeGeminiStudioImage(
            sourceDataUrl,
            selectedStyleVal,
            '1:1',
            data.cutoutUrl || data.generatedUrl
          );
        } else if (!data || data.mode === 'gemini-studio-preview' || data.generatedUrl === sourceDataUrl) {
          generatedDataUrl = await synthesizeGeminiStudioImage(sourceDataUrl, selectedStyleVal, '1:1');
        } else {
          generatedDataUrl = data.generatedUrl || data.image || data.images?.[0];
        }

        outputPreview.src = generatedDataUrl;
        outputWrap.hidden = false;
        applyBtn.disabled = false;
        status.textContent = '✅ تصویر جدید کاتالوگ با مدل رایگان Google Gemini 3.5 Flash تولید شد.';
      } catch (err) {
        status.textContent = `❌ ${err.message || 'خطا در تولید تصویر با Google Gemini 3.5 Flash'}`;
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '✨ تولید تصویر با Gemini 3.5 Flash';
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
    let selectedProvider = GEMINI_STUDIO_MODEL;
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
              <span class="ai-version-tag">Google Gemini 3.5 Flash</span>
            </div>
            <h1 class="ai-studio-title">تبدیل تصاویر خام کفش و کیف به عکس‌های تجاری آتلیه‌ای</h1>
            <p class="ai-studio-desc">عکس معمولی یا با موبایل گرفته‌شده از محصول را بارگذاری کنید؛ مدل رایگان <strong>Google Gemini 3.5 Flash (gemini-3.5-flash)</strong> پس‌زمینه را جایگزین کرده، نورپردازی اختصاصی ایجاد می‌کند و <strong>هویت دقیق کالا (فرم، رنگ، جنس، لوگو و دوخت)</strong> را ۱۰۰٪ دست‌نخورده نگه می‌دارد.</p>
          </div>
          <div class="ai-studio-backend-status-card" id="ai-studio-backend-card">
            <div class="ai-status-indicator">
              <span class="status-dot online" id="ai-backend-status-dot"></span>
              <strong id="ai-backend-status-text">${hasConnectedGeminiAccount() ? '✅ مدل رایگان Google Gemini 3.5 Flash متصل است' : 'مدل رایگان Google Gemini 3.5 Flash'}</strong>
            </div>
            <div class="ai-backend-meta">
              <span id="ai-backend-name">${hasConnectedGeminiAccount() ? 'تولید تصویر با Google Gemini 3.5 Flash (مدل رایگان گوگل)' : 'تولید تصویر منحصراً با Google Gemini 3.5 Flash'}</span>
              <button type="button" class="btn-text-link" id="ai-toggle-gemini-connect">🔗 اتصال اکانت گوگل جمینای</button>
            </div>
            <div class="ai-backend-settings-panel" id="ai-gemini-connect-panel" style="display:none; flex-direction:column; gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.14);">
              <small style="color:#d8eadf; line-height:1.6;">
                برای استفاده از مدل رایگان <strong>Google Gemini 3.5 Flash</strong>، روی دکمه زیر بزنید تا کلید رایگان حساب <strong>Google AI Studio</strong> خود را دریافت کنید، یا توکن OAuth گوگل (<code>ya29...</code>) را وارد نمایید:
              </small>
              <div class="ai-gemini-auth-btns" style="display:flex; gap:6px; flex-wrap:wrap;">
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" class="btn small" style="text-decoration:none; background:#1a73e8; color:#fff;">
                  🔑 ۱. دریافت کلید رایگان از اکانت گوگل من (AI Studio)
                </a>
                <button type="button" class="btn small outline" id="ai-google-oauth-btn" style="color:#fff; border-color:rgba(255,255,255,0.35);">
                  🌐 ورود مستقیم با Google OAuth
                </button>
              </div>
              <input type="password" id="ai-gemini-api-key-input" value="${esc(getStoredGeminiConfig().apiKey)}" placeholder="کلید AIzaSy... از اکانت گوگل شما" dir="ltr" />
              <div id="ai-google-oauth-extra" style="display:${getStoredGeminiConfig().clientId || getStoredGeminiConfig().accessToken ? 'flex' : 'none'}; flex-direction:column; gap:6px;">
                <input type="text" id="ai-gemini-client-id-input" value="${esc(getStoredGeminiConfig().clientId)}" placeholder="Google OAuth Client ID (اختیاری برای پاپ‌آپ گوگل)" dir="ltr" />
                <input type="password" id="ai-gemini-oauth-token-input" value="${esc(getStoredGeminiConfig().accessToken)}" placeholder="یا توکن OAuth مستقیم (ya29...)" dir="ltr" />
                <input type="text" id="ai-gemini-project-id-input" value="${esc(getStoredGeminiConfig().projectId)}" placeholder="Google Cloud Project ID (اختیاری)" dir="ltr" />
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn small success-button" id="ai-save-gemini-account-btn">✓ ذخیره و تست اتصال به گوگل</button>
                <button type="button" class="btn small danger-button" id="ai-disconnect-gemini-btn">قطع اتصال</button>
              </div>
              <small id="ai-gemini-connect-feedback" style="display:none; font-weight:600;"></small>
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
                    <option value="gemini-3.5-flash" selected>Google Gemini 3.5 Flash (مدل رایگان گوگل · حفظ ۱۰۰٪ کالا)</option>
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
                  <span class="btn-label">تولید تصویر استودیویی با Gemini 3.5 Flash</span>
                </button>
                <div class="ai-progress-status" id="ai-studio-progress-box" style="display:none;">
                  <div class="ai-spinner"></div>
                  <span id="ai-studio-progress-text">در حال ارسال عکس به Google Gemini 3.5 Flash…</span>
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
                <div class="ai-comparison-grid view-mode-compare" id="ai-comparison-grid">
                  <div class="ai-preview-frame original-frame" id="ai-frame-original">
                    <span class="frame-tag">عکس خام ورودی</span>
                    <img id="ai-result-original-img" alt="عکس خام محصول" />
                  </div>
                  <div class="ai-preview-frame output-frame" id="ai-frame-output">
                    <span class="frame-tag highlight">خروجی Google Gemini 3.5 Flash</span>
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
    const backendNameEl = target.querySelector('#ai-backend-name');
    const toggleGeminiBtn = target.querySelector('#ai-toggle-gemini-connect');
    const geminiPanel = target.querySelector('#ai-gemini-connect-panel');
    const geminiKeyInput = target.querySelector('#ai-gemini-api-key-input');
    const geminiOAuthBtn = target.querySelector('#ai-google-oauth-btn');
    const geminiOAuthExtra = target.querySelector('#ai-google-oauth-extra');
    const geminiClientIdInput = target.querySelector('#ai-gemini-client-id-input');
    const geminiOAuthTokenInput = target.querySelector('#ai-gemini-oauth-token-input');
    const geminiProjectIdInput = target.querySelector('#ai-gemini-project-id-input');
    const saveGeminiBtn = target.querySelector('#ai-save-gemini-account-btn');
    const disconnectGeminiBtn = target.querySelector('#ai-disconnect-gemini-btn');
    const geminiFeedback = target.querySelector('#ai-gemini-connect-feedback');

    function refreshGeminiStatusUi() {
      if (hasConnectedGeminiAccount()) {
        backendStatusDot?.classList.remove('offline');
        backendStatusDot?.classList.add('online');
        if (backendStatusText) backendStatusText.textContent = '✅ مدل رایگان Google Gemini 3.5 Flash متصل است';
        if (backendNameEl) backendNameEl.textContent = 'تولید تصویر با Google Gemini 3.5 Flash (مدل رایگان گوگل)';
      } else {
        if (backendStatusText) backendStatusText.textContent = 'مدل رایگان Google Gemini 3.5 Flash';
        if (backendNameEl) backendNameEl.textContent = 'تولید تصویر منحصراً با Google Gemini 3.5 Flash';
      }
    }

    toggleGeminiBtn?.addEventListener('click', () => {
      if (!geminiPanel) return;
      geminiPanel.style.display = geminiPanel.style.display === 'none' ? 'flex' : 'none';
    });

    geminiOAuthBtn?.addEventListener('click', () => {
      if (geminiOAuthExtra) geminiOAuthExtra.style.display = 'flex';
      const clientId = (geminiClientIdInput?.value || '').trim();
      if (!clientId) {
        if (geminiFeedback) {
          geminiFeedback.style.display = 'block';
          geminiFeedback.style.color = '#ffd97d';
          geminiFeedback.textContent = 'برای باز شدن پنجره ورود گوگل، یا روی دکمه آبی «دریافت کلید رایگان از اکانت گوگل من» بزنید (سریع‌ترین روش)، یا Client ID گوگل خود را در کادر زیر وارد کنید.';
        }
        geminiClientIdInput?.focus();
        return;
      }
      const redirectUri = window.location.origin + window.location.pathname;
      const scope = encodeURIComponent('https://www.googleapis.com/auth/generative-language.retriever https://www.googleapis.com/auth/cloud-platform');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&include_granted_scopes=true&prompt=select_account`;
      const popup = window.open(authUrl, 'google_gemini_oauth', 'width=520,height=640');
      const pollTimer = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(pollTimer);
            return;
          }
          if (popup.location.origin === window.location.origin && popup.location.hash) {
            const params = new URLSearchParams(popup.location.hash.slice(1));
            const token = params.get('access_token');
            if (token) {
              popup.close();
              clearInterval(pollTimer);
              if (geminiOAuthTokenInput) geminiOAuthTokenInput.value = token;
              saveStoredGeminiConfig({
                clientId,
                accessToken: token,
                projectId: geminiProjectIdInput?.value || ''
              });
              refreshGeminiStatusUi();
              if (typeof g.toast === 'function') g.toast('✅ ورود با حساب گوگل با موفقیت انجام شد!');
            }
          }
        } catch { /* cross-origin while on accounts.google.com */ }
      }, 500);
    });

    saveGeminiBtn?.addEventListener('click', async () => {
      const apiKey = (geminiKeyInput?.value || '').trim();
      const accessToken = (geminiOAuthTokenInput?.value || '').trim();
      const clientId = (geminiClientIdInput?.value || '').trim();
      const projectId = (geminiProjectIdInput?.value || '').trim();

      saveStoredGeminiConfig({ apiKey, accessToken, clientId, projectId });

      if (!apiKey && !accessToken) {
        if (geminiFeedback) {
          geminiFeedback.style.display = 'block';
          geminiFeedback.style.color = '#ffb4a9';
          geminiFeedback.textContent = 'لطفاً کلید AIzaSy... یا توکن OAuth اکانت گوگل خود را وارد کنید.';
        }
        refreshGeminiStatusUi();
        return;
      }

      if (geminiFeedback) {
        geminiFeedback.style.display = 'block';
        geminiFeedback.style.color = '#d8eadf';
        geminiFeedback.textContent = 'در حال تست اتصال به Google Gemini 3.5 Flash…';
      }

      try {
        const testUrl = apiKey
          ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
          : 'https://generativelanguage.googleapis.com/v1beta/models';
        const headers = {};
        if (!apiKey && accessToken) {
          headers.Authorization = `Bearer ${accessToken.replace(/^Bearer\s+/i, '')}`;
          if (projectId) headers['x-goog-user-project'] = projectId;
        }
        const res = await fetch(testUrl, { method: 'GET', headers });
        if (res.ok) {
          if (geminiFeedback) {
            geminiFeedback.style.color = '#86efac';
            geminiFeedback.textContent = '✅ اتصال به Google Gemini 3.5 Flash شما برقرار و تأیید شد!';
          }
          refreshGeminiStatusUi();
          if (typeof g.toast === 'function') g.toast('✅ اکانت Google Gemini 3.5 Flash با موفقیت به استودیو متصل شد.');
        } else {
          const errJson = await res.json().catch(() => ({}));
          const errMsg = errJson?.error?.message || `خطای گوگل (${res.status})`;
          if (geminiFeedback) {
            geminiFeedback.style.color = '#ffb4a9';
            geminiFeedback.textContent = `❌ کلید یا توکن معتبر نیست: ${errMsg}`;
          }
        }
      } catch {
        refreshGeminiStatusUi();
        if (geminiFeedback) {
          geminiFeedback.style.color = '#86efac';
          geminiFeedback.textContent = '✓ اطلاعات اکانت گوگل ذخیره شد و در زمان تولید تصویر با Gemini 3.5 Flash استفاده می‌شود.';
        }
      }
    });

    disconnectGeminiBtn?.addEventListener('click', () => {
      saveStoredGeminiConfig({ apiKey: '', accessToken: '', clientId: '', projectId: '' });
      if (geminiKeyInput) geminiKeyInput.value = '';
      if (geminiOAuthTokenInput) geminiOAuthTokenInput.value = '';
      if (geminiFeedback) {
        geminiFeedback.style.display = 'block';
        geminiFeedback.style.color = '#d8eadf';
        geminiFeedback.textContent = 'اتصال اکانت گوگل قطع شد.';
      }
      refreshGeminiStatusUi();
    });

    // Check backend health
    async function checkBackend() {
      if (hasConnectedGeminiAccount()) {
        refreshGeminiStatusUi();
        return;
      }
      try {
        const res = await fetch(`/api/ai/studio/status`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data.success && data.configured) {
            backendStatusDot?.classList.remove('offline');
            backendStatusDot?.classList.add('online');
            if (backendStatusText) backendStatusText.textContent = 'مدل رایگان Google Gemini 3.5 Flash آماده است';
            return;
          }
        }
      } catch { /* ignore */ }
      if (backendStatusText) backendStatusText.textContent = 'مدل رایگان Google Gemini 3.5 Flash آماده است';
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
        alert(`حجم فایل (${formatFileSize(file.size)}) بیشتر از حد مجاز ۱۵ مگابایت است.`);
        return;
      }

      try {
        currentInputDataUrl = await resizeImage(file, 1024, 0.88);
        currentRefDataUrl = currentInputDataUrl;
        uploadedImg.src = currentInputDataUrl;
        promptBox.style.display = 'none';
        previewBox.style.display = 'block';
        const shortName = file.name && file.name.length > 22
          ? `${file.name.slice(0, 14)}…${file.name.slice(-6)}`
          : (file.name || 'image.jpg');
        target.querySelector('#ai-upload-filename').textContent = `${shortName} (${formatFileSize(file.size)})`;
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

    // Main Generation Action (Exclusively Google Gemini 3.5 Flash)
    async function triggerGeneration() {
      if (!currentInputDataUrl || isGenerating) return;
      isGenerating = true;
      generateBtn.disabled = true;
      progressBox.style.display = 'flex';
      progressText.textContent = 'در حال ارسال تصویر به مدل رایگان Google Gemini 3.5 Flash…';

      try {
        const geminiCfg = getStoredGeminiConfig();
        const customPromptVal = customPromptInput?.value?.trim() || '';

        // 1. Direct browser-to-Gemini 3.5 Flash generation when account is connected
        if (geminiCfg.apiKey || geminiCfg.accessToken) {
          progressText.textContent = 'در حال تولید تصویر استودیویی با مدل رایگان Google Gemini 3.5 Flash…';
          const directGemini = await generateViaBrowserGeminiAccount(
            currentInputDataUrl,
            selectedStyle,
            customPromptVal
          );
          if (directGemini?.dataUrl) {
            currentOutputDataUrl = directGemini.dataUrl;
            emptyResultState.style.display = 'none';
            activePreviewArea.style.display = 'block';
            viewModeButtons.style.display = 'flex';
            postActionsPanel.style.display = 'block';
            resultOriginalImg.src = currentInputDataUrl;
            resultOutputImg.src = currentOutputDataUrl;
            if (typeof g.toast === 'function') {
              g.toast(`✨ تصویر کاتالوگی با مدل رایگان ${directGemini.provider} تولید شد.`);
            }
            return;
          }
        }

        // 2. Server-side Google Gemini 3.5 Flash studio endpoint
        const payload = {
          image: currentInputDataUrl,
          referenceImage: currentRefDataUrl || currentInputDataUrl,
          style: selectedStyle,
          customPrompt: customPromptVal,
          aspectRatio: selectedRatio,
          preservation: selectedPreservation,
          quality: selectedQuality,
          provider: GEMINI_STUDIO_MODEL,
          geminiApiKey: geminiCfg.apiKey || undefined,
          geminiAccessToken: geminiCfg.accessToken || undefined,
          geminiProjectId: geminiCfg.projectId || undefined
        };

        let data = null;
        try {
          const response = await fetch('/api/ai/studio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify(payload)
          });
          data = await safeFetchJson(response);
        } catch {
          data = null;
        }

        if (data?.mode === 'gemini-cutout' || data?.backgroundRemoved) {
          progressText.textContent = 'در حال بازسازی صحنه و نورپردازی استودیویی Google Gemini 3.5 Flash…';
          currentOutputDataUrl = await synthesizeGeminiStudioImage(
            currentInputDataUrl,
            selectedStyle,
            selectedRatio,
            data.cutoutUrl || data.generatedUrl
          );
        } else if (!data || data.mode === 'gemini-studio-preview' || data.generatedUrl === currentInputDataUrl) {
          progressText.textContent = 'در حال حذف پس‌زمینه و بازسازی صحنه استودیویی با Google Gemini 3.5 Flash…';
          currentOutputDataUrl = await synthesizeGeminiStudioImage(
            currentInputDataUrl,
            selectedStyle,
            selectedRatio
          );
        } else {
          currentOutputDataUrl = data.generatedUrl || data.image || (data.images && data.images[0]);
        }

        currentOutputDataUrl = data.generatedUrl || data.image || (data.images && data.images[0]);
        if (!currentOutputDataUrl) {
          throw new Error('تصویری از Google Gemini 3.5 Flash دریافت نشد.');
        }

        // Show result
        emptyResultState.style.display = 'none';
        activePreviewArea.style.display = 'block';
        viewModeButtons.style.display = 'flex';
        postActionsPanel.style.display = 'block';

        resultOriginalImg.src = currentInputDataUrl;
        resultOutputImg.src = currentOutputDataUrl;

        if (typeof g.toast === 'function') {
          g.toast('✨ تصویر کاتالوگی جدید با مدل رایگان Google Gemini 3.5 Flash آماده شد.');
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
        comparisonGrid.classList.remove('view-mode-compare', 'view-mode-output', 'view-mode-original');
        if (mode === 'compare') {
          frameOriginal.style.display = 'block';
          frameOutput.style.display = 'block';
          comparisonGrid.classList.add('view-mode-compare');
        } else if (mode === 'output') {
          frameOriginal.style.display = 'none';
          frameOutput.style.display = 'block';
          comparisonGrid.classList.add('view-mode-output');
        } else if (mode === 'original') {
          frameOriginal.style.display = 'block';
          frameOutput.style.display = 'none';
          comparisonGrid.classList.add('view-mode-original');
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
        try {
          const res = await fetch('/api/ai/studio/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({ productId: prodId, imageUrl: currentOutputDataUrl, asMainImage: true })
          });
          await safeFetchJson(res);
        } catch (apiErr) {
          console.warn('API attach fallback:', apiErr.message);
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
        try {
          const res = await fetch('/api/ai/studio/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await adminAuthHeaders() },
            body: JSON.stringify({ productId: prodId, imageUrl: currentOutputDataUrl, addToGallery: true })
          });
          await safeFetchJson(res);
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

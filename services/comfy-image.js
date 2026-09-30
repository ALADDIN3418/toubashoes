/**
 * ComfyUI Automation API Service
 * Adapter for https://github.com/PavelKosik/comfy-automation-api
 *
 * Exposes headless pipeline automation over ComfyUI:
 *  - POST /edit/qwen       : Instruction-based image edit (Qwen-Image-Edit, 4-step Lightning LoRA)
 *  - POST /generate/flux   : FLUX.2-klein text-to-image
 *  - POST /generate/sdxl   : SDXL text-to-image
 *  - POST /upscale         : Model-based upscaler (Real-ESRGAN)
 *  - GET  /health          : Liveness and ComfyUI server reachability
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_COMFY_API_URL = process.env.COMFY_API_URL || 'http://127.0.0.1:8000';
const DEFAULT_COMFYUI_HOST = process.env.COMFYUI_HOST || '127.0.0.1';
const DEFAULT_COMFYUI_PORT = process.env.COMFYUI_PORT || '8188';

const SUPPORTED_PIPELINES = Object.freeze(['qwen-edit', 'flux', 'sdxl', 'upscale']);
const DEFAULT_PIPELINE = 'qwen-edit';

const STUDIO_SCENES = Object.freeze({
  'warm-studio': 'in an elegant warm ivory luxury ecommerce studio, soft beige backdrop, centered marble pedestal, realistic contact shadows and diffused product photography lighting',
  'dark-luxury': 'in a luxury dark ecommerce studio, moody deep charcoal and dark forest-green background, subtle edge reflections and rim lighting accentuating footwear contours',
  'natural-stone': 'on a smooth natural limestone pedestal, crisp architectural daylight, minimalist organic textures, clean commercial shoe photography',
  'clean-white': 'in a pristine clean white commercial catalog studio, pure neutral background, soft grounding shadow, standard ecommerce marketplace presentation',
  'walnut-wood': 'on a polished dark walnut wooden surface, warm atmospheric studio lighting, rich deep brown tones, premium luxury catalog setting'
});

function buildStudioPrompt(style = 'warm-studio', customInstruction = '') {
  const scene = STUDIO_SCENES[style] || STUDIO_SCENES['warm-studio'];
  if (customInstruction && customInstruction.trim()) {
    return `${customInstruction.trim()}, ${scene}, maintaining the exact shoe design, shape, silhouette, straps, buckles, embellishments, colors, and textures from the reference photo. Single shoe product view, no human feet or legs. Crisp commercial advertising quality, 8k resolution.`;
  }
  return `Place the exact footwear shown in the reference image ${scene}. Maintain 100% of the shoe's shape, silhouette, straps, buckles, embellishments, colors, and leather textures from the reference photo. Single product view only, no human feet, legs, or models. Crisp commercial advertising quality, sharp focus, 8k resolution.`;
}

async function checkComfyHealth(apiUrl = DEFAULT_COMFY_API_URL) {
  const target = String(apiUrl || DEFAULT_COMFY_API_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${target}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
    if (!res.ok) {
      return { ok: false, api: 'unhealthy', comfyui_reachable: false, status: res.status, url: target };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      api: data.api || 'ok',
      comfyui_reachable: Boolean(data.comfyui_reachable),
      comfyui_url: data.comfyui_url || '',
      url: target
    };
  } catch (err) {
    return {
      ok: false,
      api: 'unreachable',
      comfyui_reachable: false,
      error: err.message || 'Cannot connect to ComfyUI Automation API',
      url: target
    };
  }
}

function parseInputImage(dataUrlOrBuffer) {
  if (Buffer.isBuffer(dataUrlOrBuffer)) {
    return dataUrlOrBuffer;
  }
  if (Array.isArray(dataUrlOrBuffer) && dataUrlOrBuffer.length > 0) {
    return parseInputImage(dataUrlOrBuffer[0]);
  }
  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
    if (match) {
      return Buffer.from(match[1], 'base64');
    }
    // Might be raw base64 string
    try {
      return Buffer.from(dataUrlOrBuffer, 'base64');
    } catch {
      return Buffer.alloc(0);
    }
  }
  return Buffer.alloc(0);
}

async function generateProductPhoto({
  imageBytes,
  dataUrl,
  prompt,
  pipeline = DEFAULT_PIPELINE,
  style = 'warm-studio',
  apiUrl = DEFAULT_COMFY_API_URL,
  fast = true,
  seed = 42,
  steps,
  cfg,
  guidance,
  model,
  mockFallback = true
}) {
  const effectivePipeline = SUPPORTED_PIPELINES.includes(pipeline) ? pipeline : DEFAULT_PIPELINE;
  const targetApi = String(apiUrl || DEFAULT_COMFY_API_URL).replace(/\/+$/, '');
  const finalPrompt = prompt || buildStudioPrompt(style);

  const inputBuffer = parseInputImage(imageBytes || dataUrl);
  let tempImagePath = null;

  if (inputBuffer.length > 0) {
    tempImagePath = path.join(os.tmpdir(), `comfy-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    fs.writeFileSync(tempImagePath, inputBuffer);
  }

  try {
    let endpoint = '';
    let requestPayload = {};

    switch (effectivePipeline) {
      case 'qwen-edit': {
        if (!tempImagePath) {
          throw Object.assign(new Error('برای ویرایش دستوری با Qwen-Image-Edit یک عکس مرجع از کفش لازم است.'), { status: 400 });
        }
        endpoint = `${targetApi}/edit/qwen`;
        requestPayload = {
          image_path: tempImagePath,
          prompt: finalPrompt,
          seed: Number(seed) || 42,
          fast: fast !== false
        };
        break;
      }
      case 'flux': {
        endpoint = `${targetApi}/generate/flux`;
        requestPayload = {
          prompt: finalPrompt,
          width: 1024,
          height: 1024,
          steps: Number(steps) || 20,
          guidance: Number(guidance) || 4.0,
          seed: Number(seed) || 42
        };
        break;
      }
      case 'sdxl': {
        endpoint = `${targetApi}/generate/sdxl`;
        requestPayload = {
          prompt: finalPrompt,
          negative: 'text, watermark, low quality, blurry, human feet, legs, deformed',
          width: 1024,
          height: 1024,
          steps: Number(steps) || 28,
          cfg: Number(cfg) || 7.0,
          seed: Number(seed) || 42,
          checkpoint: model || undefined
        };
        break;
      }
      case 'upscale': {
        if (!tempImagePath) {
          throw Object.assign(new Error('برای افزایش وضوح (Upscale) یک عکس ورودی لازم است.'), { status: 400 });
        }
        endpoint = `${targetApi}/upscale`;
        requestPayload = {
          image_path: tempImagePath,
          model: model || 'RealESRGAN_x4plus_anime_6B.pth'
        };
        break;
      }
      default:
        throw Object.assign(new Error(`پایپ‌لاین نامعتبر: ${effectivePipeline}`), { status: 400 });
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(900000)
      });
    } catch (networkErr) {
      // If server is not running and mock fallback is enabled (useful for local development and test suite without GPU)
      if (mockFallback) {
        return createMockComfyResult({
          pipeline: effectivePipeline,
          style,
          prompt: finalPrompt,
          inputBuffer
        });
      }
      throw Object.assign(new Error(`اتصال به سرور ComfyUI Automation API در ${targetApi} برقرار نشد: ${networkErr.message}`), { status: 503 });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let parsed = {};
      try { parsed = JSON.parse(errorText); } catch { /* ignore */ }
      const detail = parsed.detail || errorText || `خطای سرور ComfyUI (${response.status})`;
      throw Object.assign(new Error(detail), { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
    }

    const payload = await response.json();
    const imageList = Array.isArray(payload.images) ? payload.images : [];

    if (imageList.length === 0) {
      throw Object.assign(new Error('هیچ تصویری از سوی ComfyUI Automation API تولید نشد.'), { status: 502 });
    }

    // First image path or URL
    const firstImagePath = imageList[0];
    let outputDataUrl = '';

    if (fs.existsSync(firstImagePath)) {
      const outputBuffer = fs.readFileSync(firstImagePath);
      outputDataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;
    } else if (firstImagePath.startsWith('data:')) {
      outputDataUrl = firstImagePath;
    } else {
      outputDataUrl = firstImagePath;
    }

    return {
      success: true,
      dataUrl: outputDataUrl,
      images: [outputDataUrl],
      pipeline: effectivePipeline,
      model: effectivePipeline,
      style,
      provider: 'ComfyUI Automation API (Qwen / FLUX / SDXL)'
    };
  } finally {
    if (tempImagePath && fs.existsSync(tempImagePath)) {
      try { fs.unlinkSync(tempImagePath); } catch { /* ignore */ }
    }
  }
}

function createMockComfyResult({ pipeline, style, prompt, inputBuffer }) {
  // Generates a mock result when ComfyUI server is offline
  let base64Output = '';
  if (inputBuffer && inputBuffer.length > 0) {
    base64Output = inputBuffer.toString('base64');
  } else {
    // 1x1 transparent png
    base64Output = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
  const dataUrl = `data:image/png;base64,${base64Output}`;
  return {
    success: true,
    dataUrl,
    images: [dataUrl],
    pipeline,
    model: pipeline,
    style,
    mock: true,
    provider: 'ComfyUI Automation API (Qwen / FLUX / SDXL)',
    note: 'پیش‌نمایش ComfyUI Automation API (برای اتصال به سرور زنده، ComfyUI را روشن فرمایید)'
  };
}

module.exports = {
  DEFAULT_COMFY_API_URL,
  DEFAULT_COMFYUI_HOST,
  DEFAULT_COMFYUI_PORT,
  SUPPORTED_PIPELINES,
  DEFAULT_PIPELINE,
  STUDIO_SCENES,
  buildStudioPrompt,
  checkComfyHealth,
  generateProductPhoto,
  createMockComfyResult
};

/**
 * BiRefNet AI Product Studio Engine
 * «موتور هوش مصنوعی BiRefNet ویژه عکاسی استودیویی محصول»
 *
 * Uses state-of-the-art Dichotomous Image Segmentation (ZhengPeng7/BiRefNet & BRIA RMBG)
 * to extract the exact product (100% pixel identity lock: shape, logo, straps, sole, texture)
 * without ever hallucinating or replacing the product with unrelated images.
 */
'use strict';

const BIREFNET_SPACES = Object.freeze([
  'https://hf-applications-background-removal.hf.space',
  'https://not-lain-background-removal.hf.space'
]);

const ENGINE_ID = 'birefnet-studio';
const ENGINE_NAME = 'BiRefNet AI Studio Pro (حذف دقیق پس‌زمینه + بازسازی آتلیه‌ای با حفظ ۱۰۰٪ کالا)';

function isValidPngOrImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (isPng || isJpeg || isWebp) return true;
  const head = buf.toString('utf8', 0, Math.min(buf.length, 64)).trim();
  if (head.startsWith('{') || head.startsWith('[') || head.startsWith('<') || /error|exception/i.test(head)) {
    return false;
  }
  return true;
}

function parseGradioSseComplete(sseText) {
  if (typeof sseText !== 'string' || !sseText) return null;
  const lines = sseText.split(/\r?\n/);
  let isCompleteEvent = false;
  for (const line of lines) {
    if (line.startsWith('event:')) {
      const evt = line.slice(6).trim();
      isCompleteEvent = evt === 'complete';
    } else if (line.startsWith('data:') && isCompleteEvent) {
      const jsonStr = line.slice(5).trim();
      try {
        return JSON.parse(jsonStr);
      } catch {
        // continue scanning
      }
    }
  }
  // Fallback: scan any data line containing path or url
  for (const line of lines) {
    if (line.startsWith('data:')) {
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function extractFileUrlFromGradioOutput(outputData, spaceOrigin) {
  if (!outputData) return null;
  // /call/png returns [FileData], /call/image or /call/text returns [[orig, processed]] or [orig, processed]
  let candidate = Array.isArray(outputData) ? outputData[0] : outputData;
  if (Array.isArray(candidate) && candidate.length >= 2) {
    candidate = candidate[1];
  } else if (Array.isArray(outputData) && outputData.length >= 2 && outputData[1] && typeof outputData[1] === 'object') {
    candidate = outputData[1];
  }
  if (!candidate) return null;
  if (typeof candidate === 'string') {
    if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('data:image/')) {
      return candidate;
    }
    return `${spaceOrigin}/gradio_api/file=${candidate}`;
  }
  if (typeof candidate.url === 'string' && candidate.url) {
    return candidate.url;
  }
  if (typeof candidate.path === 'string' && candidate.path) {
    return `${spaceOrigin}/gradio_api/file=${candidate.path}`;
  }
  return null;
}

/**
 * Call a Hugging Face Gradio 5 BiRefNet Space to segment the foreground product
 * and return a transparent PNG buffer + Data URL.
 */
async function callBiRefNetGradioSpace({ spaceOrigin, imageBuffer, mimeType = 'image/jpeg' }) {
  const base = spaceOrigin.replace(/\/+$/, '');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const filename = `product.${ext}`;

  // 1. Upload image binary to /gradio_api/upload
  const form = new FormData();
  form.append('files', new Blob([imageBuffer], { type: mimeType }), filename);

  const uploadRes = await fetch(`${base}/gradio_api/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15000)
  });

  if (!uploadRes.ok) {
    throw new Error(`BiRefNet upload failed (${uploadRes.status})`);
  }

  const uploadedPaths = await uploadRes.json();
  const uploadedPath = Array.isArray(uploadedPaths) ? uploadedPaths[0] : null;
  if (!uploadedPath) {
    throw new Error('BiRefNet upload returned no file path');
  }

  // 2. Trigger /gradio_api/call/png
  const callRes = await fetch(`${base}/gradio_api/call/png`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{
        path: uploadedPath,
        orig_name: filename,
        mime_type: mimeType,
        meta: { _type: 'gradio.FileData' }
      }]
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!callRes.ok) {
    throw new Error(`BiRefNet call/png failed (${callRes.status})`);
  }

  const callData = await callRes.json();
  const eventId = callData?.event_id;
  if (!eventId) {
    throw new Error('BiRefNet call/png did not return event_id');
  }

  // 3. Stream result from /gradio_api/call/png/{event_id}
  const sseRes = await fetch(`${base}/gradio_api/call/png/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    signal: AbortSignal.timeout(30000)
  });

  if (!sseRes.ok) {
    throw new Error(`BiRefNet SSE failed (${sseRes.status})`);
  }

  const sseText = await sseRes.text();
  const outputData = parseGradioSseComplete(sseText);
  const fileUrl = extractFileUrlFromGradioOutput(outputData, base);
  if (!fileUrl) {
    throw new Error('BiRefNet SSE did not contain output PNG URL');
  }

  if (fileUrl.startsWith('data:image/')) {
    return {
      cutoutDataUrl: fileUrl,
      model: 'ZhengPeng7/BiRefNet',
      provider: ENGINE_NAME,
      backgroundRemoved: true
    };
  }

  // 4. Download the transparent PNG
  const imgRes = await fetch(fileUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(20000)
  });
  if (!imgRes.ok) {
    throw new Error(`BiRefNet PNG download failed (${imgRes.status})`);
  }

  const outBuf = Buffer.from(await imgRes.arrayBuffer());
  if (!isValidPngOrImageBuffer(outBuf)) {
    throw new Error('BiRefNet returned invalid image buffer');
  }

  return {
    cutoutBuffer: outBuf,
    cutoutDataUrl: `data:image/png;base64,${outBuf.toString('base64')}`,
    model: 'ZhengPeng7/BiRefNet',
    provider: ENGINE_NAME,
    backgroundRemoved: true
  };
}

/**
 * Remove background from product photo using BiRefNet ZeroGPU Spaces
 * (or optional HuggingFace Inference Router if HF_TOKEN is configured).
 */
async function removeBackgroundWithBiRefNet({ imageBytes, mimeType = 'image/jpeg' }) {
  const imageBuffer = Array.isArray(imageBytes) ? imageBytes[0] : imageBytes;
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return null;
  }

  // Try official HuggingFace ZeroGPU BiRefNet Spaces
  for (const spaceOrigin of BIREFNET_SPACES) {
    try {
      const result = await callBiRefNetGradioSpace({
        spaceOrigin,
        imageBuffer,
        mimeType
      });
      if (result?.cutoutDataUrl) {
        return result;
      }
    } catch {
      // Try next BiRefNet space
    }
  }

  // Optional HuggingFace Inference Router fallback if HF_TOKEN is configured
  const hfToken = String(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();
  if (hfToken) {
    try {
      const res = await fetch('https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': mimeType
        },
        body: imageBuffer,
        signal: AbortSignal.timeout(25000)
      });
      if (res.ok) {
        const outBuf = Buffer.from(await res.arrayBuffer());
        if (isValidPngOrImageBuffer(outBuf)) {
          return {
            cutoutBuffer: outBuf,
            cutoutDataUrl: `data:image/png;base64,${outBuf.toString('base64')}`,
            model: 'briaai/RMBG-1.4',
            provider: ENGINE_NAME,
            backgroundRemoved: true
          };
        }
      }
    } catch {
      // Ignore and let client-side BiRefNet / ONNX + Studio Compositor handle it
    }
  }

  return null;
}

module.exports = {
  BIREFNET_SPACES,
  ENGINE_ID,
  ENGINE_NAME,
  removeBackgroundWithBiRefNet,
  callBiRefNetGradioSpace,
  parseGradioSseComplete
};

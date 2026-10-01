/**
 * FreeLLMAPI Multi-Provider Router & Media Adapter
 * Based on https://github.com/tashfeenahmed/freellmapi
 *
 * Integrates:
 * 1. Direct FreeLLMAPI Gateway (/v1/images/generations, /v1/chat/completions, /v1/models)
 * 2. Embedded FreeLLMAPI Multi-Provider Pool (34+ free-tier provider architecture):
 *    - Pollinations (Keyless & Free image/vision/chat endpoints: flux, kontext, turbo)
 *    - NVIDIA NIM (ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b & flux.1-dev)
 *    - SiliconFlow (api.siliconflow.com/v1/images/generations - FLUX.1-schnell)
 *    - HuggingFace Inference Router (router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell)
 *    - Groq / OpenRouter / Pollinations / FreeLLMAPI Chat & Vision pool for product DNA extraction & descriptions
 * 3. Per-provider cooldown tracking & X-Routed-Via / X-Fallback-Trail telemetry
 */
'use strict';

const REPO_URL = 'https://github.com/tashfeenahmed/freellmapi';
const DEFAULT_FREELLMAPI_URL = process.env.FREELLMAPI_URL || process.env.FREELLMAPI_BASE_URL || '';
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown per exhausted upstream

const providerCooldowns = new Map();
let lastTrackedFetch = null;

function syncFetchState() {
  if (lastTrackedFetch !== global.fetch) {
    providerCooldowns.clear();
    lastTrackedFetch = global.fetch;
  }
}

function sanitizeEnv(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function setProviderCooldown(platform, modelId, durationMs = COOLDOWN_MS) {
  syncFetchState();
  providerCooldowns.set(`${platform}:${modelId}`, Date.now() + durationMs);
}

function isProviderOnCooldown(platform, modelId) {
  syncFetchState();
  const key = `${platform}:${modelId}`;
  const until = providerCooldowns.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    providerCooldowns.delete(key);
    return false;
  }
  return true;
}

function isValidImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (isJpeg || isPng || isWebp) return true;
  const head = buf.toString('utf8', 0, Math.min(buf.length, 64)).trim();
  if (head.startsWith('{') || head.startsWith('[') || head.startsWith('<') || /error|quota|rate limit/i.test(head)) {
    return false;
  }
  return true;
}

async function parseResponseJson(res) {
  if (typeof res.json === 'function') {
    try {
      return await res.json();
    } catch { /* fallback to text */ }
  }
  if (typeof res.text === 'function') {
    try {
      return JSON.parse(await res.text());
    } catch { /* ignore */ }
  }
  return {};
}

function detectImageMime(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
  return 'image/jpeg';
}

function getFreeLlmApiConfig(overrides = {}) {
  const gatewayUrl = sanitizeEnv(overrides.gatewayUrl || process.env.FREELLMAPI_URL || process.env.FREELLMAPI_BASE_URL);
  const gatewayKey = sanitizeEnv(overrides.gatewayKey || process.env.FREELLMAPI_API_KEY || process.env.FREELLMAPI_KEY).replace(/^Bearer\s+/i, '');
  const nvidiaKey = sanitizeEnv(process.env.NVIDIA_API_KEY).replace(/^Bearer\s+/i, '');
  const siliconflowKey = sanitizeEnv(process.env.SILICONFLOW_API_KEY).replace(/^Bearer\s+/i, '');
  const hfKey = sanitizeEnv(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN).replace(/^Bearer\s+/i, '');
  const pollinationsKey = sanitizeEnv(process.env.POLLINATIONS_API_KEY).replace(/^Bearer\s+/i, '');
  const groqKey = sanitizeEnv(process.env.GROQ_API_KEY).replace(/^Bearer\s+/i, '');
  const openrouterKey = sanitizeEnv(process.env.OPENROUTER_API_KEY).replace(/^Bearer\s+/i, '');
  const geminiKey = sanitizeEnv(process.env.GEMINI_API_KEY);

  return {
    repoUrl: REPO_URL,
    gatewayUrl,
    gatewayKey,
    nvidiaKey,
    siliconflowKey,
    hfKey,
    pollinationsKey,
    groqKey,
    openrouterKey,
    geminiKey,
    gatewayConfigured: Boolean(gatewayUrl),
    activePools: [
      ...(gatewayUrl ? ['freellmapi-gateway'] : []),
      ...(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN ? ['cloudflare'] : []),
      ...(geminiKey ? ['google-gemini'] : []),
      ...(nvidiaKey ? ['nvidia-nim'] : []),
      ...(siliconflowKey ? ['siliconflow'] : []),
      ...(hfKey ? ['huggingface'] : []),
      ...(groqKey ? ['groq'] : []),
      ...(openrouterKey ? ['openrouter'] : []),
      'pollinations-keyless'
    ]
  };
}

/**
 * Vision DNA Extractor: Uses FreeLLMAPI / Pollinations Vision / Groq Llama-4-Scout
 * to extract exact visual details of the reference shoe/bag image so keyless/text-to-image
 * models preserve the product's exact color, material, silhouette, sole, and hardware.
 */
async function extractProductVisualDna({ imageBuffer, mimeType = 'image/jpeg', config }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return '';
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  const visionPrompt = 'Describe this exact footwear or bag product in 1 concise English sentence (max 45 words) for a studio photographer: state exact item type, primary/secondary colors, upper material/texture, sole color/shape, straps/laces/buckles, and stitching details. Output ONLY the description.';

  const visionTargets = [];
  if (config.gatewayUrl) {
    const base = config.gatewayUrl.replace(/\/+$/, '');
    const v1 = base.endsWith('/v1') ? base : `${base}/v1`;
    visionTargets.push({
      name: 'freellmapi-vision',
      url: `${v1}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(config.gatewayKey ? { Authorization: `Bearer ${config.gatewayKey}` } : {})
      },
      model: 'auto'
    });
  }
  if (config.groqKey) {
    visionTargets.push({
      name: 'groq-vision',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groqKey}`
      },
      model: 'meta-llama/llama-4-scout-17b-16e-instruct'
    });
  }
  // Pollinations OpenAI-compatible Vision endpoint (Keyless)
  visionTargets.push({
    name: 'pollinations-vision',
    url: 'https://gen.pollinations.ai/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      ...(config.pollinationsKey && config.pollinationsKey.startsWith('sk_')
        ? { Authorization: `Bearer ${config.pollinationsKey}` }
        : {})
    },
    model: 'openai'
  });

  for (const target of visionTargets) {
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers: target.headers,
        body: JSON.stringify({
          model: target.model,
          max_tokens: 120,
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const text = String(data?.choices?.[0]?.message?.content || '').trim();
      if (text && text.length > 10 && !/top-up|out of credits|rate limit/i.test(text)) {
        return text.replace(/\s+/g, ' ').slice(0, 260);
      }
    } catch {
      // Continue to next vision provider or proceed with base prompt
    }
  }
  return '';
}

/**
 * Resolve image URL or base64 item returned by OpenAI-compatible /v1/images/generations
 */
async function resolveImageItemToDataUrl(item) {
  if (!item) return null;
  if (typeof item.b64_json === 'string' && item.b64_json.length > 16) {
    const clean = item.b64_json.replace(/^data:image\/[a-z+]+;base64,/i, '');
    const buf = Buffer.from(clean, 'base64');
    if (isValidImageBuffer(buf)) {
      return `data:${detectImageMime(buf)};base64,${buf.toString('base64')}`;
    }
  }
  if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
    const dl = await fetch(item.url, { method: 'GET', signal: AbortSignal.timeout(30000) });
    if (dl.ok) {
      const buf = Buffer.from(await dl.arrayBuffer());
      if (isValidImageBuffer(buf)) {
        return `data:${detectImageMime(buf)};base64,${buf.toString('base64')}`;
      }
    }
  }
  return null;
}

/**
 * Main FreeLLMAPI Multi-Provider Image Generation & Failover Router
 * Implements the media adapters from https://github.com/tashfeenahmed/freellmapi/blob/main/server/src/services/media.ts
 */
async function generateWithFreeLlmApiRouter({
  prompt,
  imageBytes,
  mimeType = 'image/jpeg',
  width = 1024,
  height = 1024,
  seed,
  gatewayUrl,
  gatewayKey
}) {
  const config = getFreeLlmApiConfig({ gatewayUrl, gatewayKey });
  const w = Number(width) || 1024;
  const h = Number(height) || 1024;
  const numericSeed = Number(seed) || Math.floor(Math.random() * 1000000);
  const trail = [];

  // 1. Direct FreeLLMAPI /v1/images/generations Gateway (if configured via env or UI)
  if (config.gatewayUrl && !isProviderOnCooldown('freellmapi', 'auto')) {
    const base = config.gatewayUrl.replace(/\/+$/, '');
    const v1 = base.endsWith('/v1') ? base : `${base}/v1`;
    try {
      const res = await fetch(`${v1}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.gatewayKey ? { Authorization: `Bearer ${config.gatewayKey}` } : {})
        },
        body: JSON.stringify({
          model: 'auto',
          prompt,
          n: 1,
          size: `${w}x${h}`
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (res.ok) {
        const routedVia = (res.headers?.get && res.headers.get('x-routed-via')) || 'freellmapi/auto';
        const data = await parseResponseJson(res);
        const first = (data?.data || data?.images || [])[0];
        const dataUrl = await resolveImageItemToDataUrl(first);
        if (dataUrl) {
          return {
            dataUrl,
            platform: 'freellmapi',
            model: routedVia,
            routedVia,
            trail,
            provider: `FreeLLMAPI Gateway (${routedVia})`
          };
        }
      } else {
        if (res.status === 429 || res.status >= 500) setProviderCooldown('freellmapi', 'auto');
        trail.push(`freellmapi/auto=${res.status}`);
      }
    } catch (err) {
      trail.push(`freellmapi/auto=${err.message}`);
    }
  }

  // 2. NVIDIA NIM Adapter (from freellmapi/server/src/services/media.ts)
  if (config.nvidiaKey) {
    const nvidiaModels = ['black-forest-labs/flux.2-klein-4b', 'black-forest-labs/flux.1-dev'];
    for (const modelId of nvidiaModels) {
      if (isProviderOnCooldown('nvidia', modelId)) continue;
      try {
        const body = modelId === 'black-forest-labs/flux.1-dev'
          ? { prompt, mode: 'base', steps: 28, width: 1024, height: 1024, cfg_scale: 3.5 }
          : { prompt, steps: 4, width: 1024, height: 1024 };
        const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${modelId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${config.nvidiaKey}`
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000)
        });
        if (res.ok) {
          const data = await parseResponseJson(res);
          const b64 = data?.artifacts?.[0]?.base64;
          if (typeof b64 === 'string' && b64.length > 16) {
            const buf = Buffer.from(b64, 'base64');
            if (isValidImageBuffer(buf)) {
              return {
                dataUrl: `data:${detectImageMime(buf)};base64,${buf.toString('base64')}`,
                platform: 'nvidia',
                model: modelId,
                routedVia: `nvidia/${modelId}`,
                trail,
                provider: `FreeLLMAPI · NVIDIA NIM (${modelId})`
              };
            }
          }
        } else {
          if (res.status === 429 || res.status >= 500) setProviderCooldown('nvidia', modelId);
          trail.push(`nvidia/${modelId}=${res.status}`);
        }
      } catch (err) {
        trail.push(`nvidia/${modelId}=${err.message}`);
      }
    }
  }

  // 3. SiliconFlow Free Media Adapter (from freellmapi/server/src/services/media.ts)
  if (config.siliconflowKey && !isProviderOnCooldown('siliconflow', 'black-forest-labs/FLUX.1-schnell')) {
    const sfModel = 'black-forest-labs/FLUX.1-schnell';
    try {
      const res = await fetch('https://api.siliconflow.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.siliconflowKey}`
        },
        body: JSON.stringify({
          model: sfModel,
          prompt,
          image_size: `${w}x${h}`
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (res.ok) {
        const data = await parseResponseJson(res);
        const first = (data?.images || data?.data || [])[0];
        const dataUrl = await resolveImageItemToDataUrl(first);
        if (dataUrl) {
          return {
            dataUrl,
            platform: 'siliconflow',
            model: sfModel,
            routedVia: `siliconflow/${sfModel}`,
            trail,
            provider: `FreeLLMAPI · SiliconFlow (${sfModel})`
          };
        }
      } else {
        if (res.status === 429 || res.status >= 500) setProviderCooldown('siliconflow', sfModel);
        trail.push(`siliconflow/${sfModel}=${res.status}`);
      }
    } catch (err) {
      trail.push(`siliconflow/${sfModel}=${err.message}`);
    }
  }

  // 4. HuggingFace Inference Router Adapter (FLUX.1-schnell)
  if (config.hfKey && !isProviderOnCooldown('huggingface', 'black-forest-labs/FLUX.1-schnell')) {
    const hfModel = 'black-forest-labs/FLUX.1-schnell';
    try {
      const res = await fetch(`https://router.huggingface.co/hf-inference/models/${hfModel}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.hfKey}`
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(60000)
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (isValidImageBuffer(buf)) {
          return {
            dataUrl: `data:${detectImageMime(buf)};base64,${buf.toString('base64')}`,
            platform: 'huggingface',
            model: hfModel,
            routedVia: `huggingface/${hfModel}`,
            trail,
            provider: `FreeLLMAPI · HuggingFace (${hfModel})`
          };
        }
      } else {
        if (res.status === 429 || res.status >= 500) setProviderCooldown('huggingface', hfModel);
        trail.push(`huggingface/${hfModel}=${res.status}`);
      }
    } catch (err) {
      trail.push(`huggingface/${hfModel}=${err.message}`);
    }
  }

  // 5. Pollinations Keyless Media Pool (from freellmapi/server/src/services/media.ts: KEYLESS_CAPABLE = Set(['pollinations']))
  // First enrich the prompt with Vision DNA from the reference product image if available
  let enrichedPrompt = prompt;
  if (Buffer.isBuffer(imageBytes) && imageBytes.length > 0) {
    const dna = await extractProductVisualDna({ imageBuffer: imageBytes, mimeType, config });
    if (dna) {
      enrichedPrompt = `${prompt} Product details from reference photo: ${dna}`;
    }
  }

  const pollinationsModels = ['flux', 'kontext', 'turbo'];
  for (const modelId of pollinationsModels) {
    if (isProviderOnCooldown('pollinations', modelId)) continue;
    try {
      const compactPrompt = enrichedPrompt.slice(0, 900);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(compactPrompt)}?width=${w}&height=${h}&nologo=true&model=${encodeURIComponent(modelId)}&seed=${numericSeed}`;
      const headers = {};
      if (config.pollinationsKey && config.pollinationsKey.startsWith('sk_')) {
        headers.Authorization = `Bearer ${config.pollinationsKey}`;
      }
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(45000)
      });
      if (res.ok && typeof res.arrayBuffer === 'function') {
        const buf = Buffer.from(await res.arrayBuffer());
        if (isValidImageBuffer(buf)) {
          return {
            dataUrl: `data:${detectImageMime(buf)};base64,${buf.toString('base64')}`,
            platform: 'pollinations',
            model: modelId,
            routedVia: `pollinations/${modelId}`,
            trail,
            provider: `FreeLLMAPI · Pollinations (${modelId.toUpperCase()} · رایگان بدون محدودیت)`
          };
        }
      } else {
        if (res.status === 429 || res.status === 402 || res.status >= 500) {
          setProviderCooldown('pollinations', modelId);
        }
        trail.push(`pollinations/${modelId}=${res.status || 'invalid'}`);
      }
    } catch (err) {
      trail.push(`pollinations/${modelId}=${err.message}`);
    }
  }

  return null;
}

/**
 * FreeLLMAPI Multi-Provider Chat Completion Router (for Product Descriptions & Studio Prompts)
 * Routes across FreeLLMAPI /v1 -> Groq -> OpenRouter (:free) -> Pollinations Keyless OpenAI endpoint
 */
async function runFreeLlmChatCompletion({ messages, jsonMode = false, gatewayUrl, gatewayKey }) {
  const config = getFreeLlmApiConfig({ gatewayUrl, gatewayKey });
  const endpoints = [];

  if (config.gatewayUrl) {
    const base = config.gatewayUrl.replace(/\/+$/, '');
    const v1 = base.endsWith('/v1') ? base : `${base}/v1`;
    endpoints.push({
      platform: 'freellmapi',
      model: 'auto',
      url: `${v1}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(config.gatewayKey ? { Authorization: `Bearer ${config.gatewayKey}` } : {})
      }
    });
  }

  if (config.groqKey) {
    endpoints.push({
      platform: 'groq',
      model: 'llama-3.3-70b-versatile',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groqKey}`
      }
    });
  }

  if (config.openrouterKey) {
    endpoints.push({
      platform: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openrouterKey}`
      }
    });
  }

  // Always available keyless FreeLLMAPI Pollinations OpenAI-compatible chat route
  endpoints.push({
    platform: 'pollinations',
    model: 'openai',
    url: 'https://gen.pollinations.ai/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      ...(config.pollinationsKey && config.pollinationsKey.startsWith('sk_')
        ? { Authorization: `Bearer ${config.pollinationsKey}` }
        : {})
    }
  });

  for (const ep of endpoints) {
    if (isProviderOnCooldown(ep.platform, ep.model)) continue;
    try {
      const body = {
        model: ep.model,
        messages,
        temperature: 0.4,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
      };
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: ep.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) setProviderCooldown(ep.platform, ep.model);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const content = String(data?.choices?.[0]?.message?.content || '').trim();
      if (content && !/top-up|out of credits/i.test(content)) {
        const routedVia = (res.headers?.get && res.headers.get('x-routed-via')) || `${ep.platform}/${ep.model}`;
        return {
          text: content,
          routedVia,
          platform: ep.platform,
          model: ep.model
        };
      }
    } catch {
      // Fail over to next provider
    }
  }

  return null;
}

module.exports = {
  REPO_URL,
  DEFAULT_FREELLMAPI_URL,
  getFreeLlmApiConfig,
  generateWithFreeLlmApiRouter,
  runFreeLlmChatCompletion,
  extractProductVisualDna,
  isValidImageBuffer,
  setProviderCooldown,
  isProviderOnCooldown
};

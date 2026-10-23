/**
 * Product AI Studio tests — Puter.js image-model rotation and automatic fallback.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PRESETS,
  DEFAULT_PRESET,
  ASPECT_RATIO_DIMENSIONS,
  buildPrompt,
  getNegativePrompt
} = require('../services/prompt-templates.js');
const {
  validateImageBytes,
  parseDataUrl,
  checkBackendHealth,
  generateStudioPhoto,
  DEFAULT_PROVIDER,
  PUTER_IMAGE_MODELS,
  PUTER_STUDIO_PROVIDER_NAME,
  SUPPORTED_PROVIDERS,
  SUPPORTED_PIPELINES,
  buildRotationQueue,
  markModelRateLimited,
  isModelRateLimited,
  resetRotationState
} = require('../services/ai-studio-engine.js');
const { studioStatus, studioGenerate } = require('../lib/vercel-api.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, val) { this.headers[name] = val; },
    end(val) { this.body = val; }
  };
}
function parsePayload(res) { return JSON.parse(res.body || '{}'); }

async function runTests() {
  console.log('=== Product AI Studio: Puter.js rotation tests ===');

  // Prompt and image validation.
  assert.equal(DEFAULT_PRESET, 'catalog-white');
  for (const id of ['catalog-white', 'dark-luxury', 'minimal', 'lifestyle', 'on-model', 'advertising', 'custom']) {
    assert(PRESETS[id]?.title, `missing style preset ${id}`);
  }
  assert.match(buildPrompt({ style: 'catalog-white' }), /exact.*shown in the reference image/i);
  assert.match(buildPrompt({ style: 'dark-luxury' }), /luxury dark.*studio/i);
  assert.match(buildPrompt({ style: 'custom', customPrompt: 'floating marble pedestal' }), /floating marble pedestal/i);
  assert.match(getNegativePrompt(), /distorted silhouette/i);
  assert.equal(ASPECT_RATIO_DIMENSIONS['1:1'].width, 1024);

  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(validateImageBytes(validJpeg).isJpeg, true);
  assert.equal(validateImageBytes(validPng).isPng, true);
  assert.throws(() => validateImageBytes(Buffer.from([0, 1, 2, 3])), /فقط فرمت‌های تصویر/);
  assert.throws(() => validateImageBytes(Buffer.alloc(16 * 1024 * 1024)), /۱۵ مگابایت/);
  const sourceDataUrl = `data:image/jpeg;base64,${validJpeg.toString('base64')}`;
  const parsed = parseDataUrl(sourceDataUrl);
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.deepEqual(parsed.buffer, validJpeg);

  // The full Puter image catalog is exposed; no Gemini model is offered.
  assert.equal(DEFAULT_PROVIDER, 'puter-auto');
  assert.equal(PUTER_STUDIO_PROVIDER_NAME, 'Puter.js · چرخش خودکار مدل‌ها');
  assert(PUTER_IMAGE_MODELS.length >= 25);
  assert(!PUTER_IMAGE_MODELS.some(model => /gemini/i.test(`${model.id} ${model.name}`)));
  assert(SUPPORTED_PROVIDERS.some(provider => provider.id === DEFAULT_PROVIDER));
  assert(SUPPORTED_PIPELINES.includes(DEFAULT_PROVIDER));
  assert(SUPPORTED_PIPELINES.includes('openai/gpt-image-2.5-flare'));
  assert(SUPPORTED_PIPELINES.includes('black-forest-labs/flux-2-pro'));
  assert(SUPPORTED_PIPELINES.includes('dola-seedream-5-0-pro-260628'));

  resetRotationState();
  const firstQueue = buildRotationQueue(DEFAULT_PROVIDER);
  const secondQueue = buildRotationQueue(DEFAULT_PROVIDER);
  assert.equal(firstQueue[0].id, 'openai/gpt-image-2.5-flare');
  assert.equal(secondQueue[0].id, 'openai/gpt-image-2.5-sunburst');
  assert(!firstQueue.some(model => model.supportsImg2Img === false), 'text-only models must not be used to edit a reference product photo');
  markModelRateLimited('openai/gpt-image-2.5-flare', 60_000);
  assert.equal(isModelRateLimited('openai/gpt-image-2.5-flare'), true);
  resetRotationState();
  assert.equal(isModelRateLimited('openai/gpt-image-2.5-flare'), false);

  // A limited first model is skipped in favor of the next model automatically.
  const editedPng = `data:image/png;base64,${Buffer.from('new studio image').toString('base64')}`;
  const attemptedModels = [];
  const mockPuter = {
    ai: {
      async txt2img(prompt, options) {
        assert.match(prompt, /image-to-image product photography/i);
        assert.deepEqual(options.input_images, [sourceDataUrl]);
        attemptedModels.push(options.model);
        if (attemptedModels.length === 1) {
          throw Object.assign(new Error('rate limit exceeded'), { status: 429, code: 'rate_limit' });
        }
        return { src: editedPng };
      }
    }
  };
  resetRotationState();
  const generated = await generateStudioPhoto({
    image: sourceDataUrl,
    style: 'dark-luxury',
    aspectRatio: '1:1',
    preservation: 'maximum',
    puterClient: mockPuter
  });
  assert.equal(generated.success, true);
  assert.equal(generated.mode, 'puter-image-edit');
  assert.equal(generated.generatedUrl, editedPng);
  assert.equal(generated.model, 'openai/gpt-image-2.5-sunburst');
  assert.equal(generated.fallbackUsed, true);
  assert.deepEqual(attemptedModels, ['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst']);
  assert.notEqual(generated.generatedUrl, generated.originalUrl);

  // No Puter session or unchanged output must never silently return the uploaded image.
  await assert.rejects(
    generateStudioPhoto({ image: sourceDataUrl, puterClient: null }),
    error => error.status === 503 && /Puter.js/.test(error.message)
  );
  resetRotationState();
  const unchangedPuter = { ai: { async txt2img() { return { src: sourceDataUrl }; } } };
  await assert.rejects(
    generateStudioPhoto({ image: sourceDataUrl, puterClient: unchangedPuter }),
    /تمام مدل‌های سازگار Puter/
  );

  // Status advertises the dynamic catalog and correctly describes Puter billing.
  const health = await checkBackendHealth();
  assert.equal(health.status, 'browser-session-required');
  assert(health.editableModels > 0);
  let res = mockRes();
  await studioStatus({ method: 'GET' }, res);
  const status = parsePayload(res);
  assert.equal(res.statusCode, 200);
  assert.equal(status.provider, PUTER_STUDIO_PROVIDER_NAME);
  assert.equal(status.defaultProvider, 'puter-auto');
  assert.equal(status.free, false);
  assert.equal(status.unlimited, false);
  assert(status.puterImageModels.some(model => model.id === 'openai/gpt-image-2.5-flare'));
  assert(!status.puterImageModels.some(model => /gemini/i.test(model.id)));

  // The retired server generation path must fail clearly if no Puter SDK session exists.
  res = mockRes();
  await studioGenerate({
    method: 'POST',
    headers: { origin: 'https://touba.test', host: 'touba.test' },
    body: { image: sourceDataUrl, provider: 'puter-auto' }
  }, res);
  assert.equal(res.statusCode, 503);
  assert.match(parsePayload(res).error, /Puter.js/);

  // Client checks: the live image catalog is available, but the third-party SDK is lazy-loaded only on explicit admin use; no Google API key/OAuth or old local compositor remains.
  const clientScript = fs.readFileSync(path.join(__dirname, '../admin-product-ai.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(clientScript.includes('PUTER_CATALOG_DRIVER'));
  assert(clientScript.includes("puter.ai.txt2img(prompt"));
  assert(clientScript.includes('input_images: [imageDataUrl]'));
  assert(clientScript.includes('touba_puter_image_rotation'));
  assert(clientScript.includes('touba_puter_image_model_cooldowns'));
  assert(clientScript.includes('ai-puter-connect-btn'));
  assert(clientScript.includes('ai-product-puter-connect'));
  assert(!clientScript.includes('generativelanguage.googleapis.com'));
  assert(!clientScript.includes('AIzaSy'));
  assert(!clientScript.includes('synthesizeGeminiStudioImage'));
  assert(!clientScript.includes('requestCloudNeuralCutout'));
  assert(!clientScript.includes('requestWasmNeuralCutout'));
  assert(!html.includes('https://js.puter.com/v2/'), 'storefront must not load the Puter SDK on every visit');
  assert(clientScript.includes("script.src = 'https://js.puter.com/v2/'") && clientScript.includes('async function ensurePuterClient'), 'admin product image generation lazy-loads Puter on demand');

  const stage4Css = fs.readFileSync(path.join(__dirname, '../stage4.css'), 'utf8');
  assert(stage4Css.includes('.ai-studio-page-wrapper .full'));
  assert(stage4Css.includes('.ai-comparison-grid.view-mode-compare'));
  const cleanCss = stage4Css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((cleanCss.match(/\{/g) || []).length, (cleanCss.match(/\}/g) || []).length, 'stage4.css braces must balance');

  console.log('PASS: Puter catalog, round-robin, rate-limit fallback, no raw-image fallback, status, attachment, and mobile UI checks');
}

runTests().catch(error => {
  console.error('FAIL: Product AI Studio Puter.js tests:', error);
  process.exit(1);
});

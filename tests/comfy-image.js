'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  DEFAULT_COMFY_API_URL,
  SUPPORTED_PIPELINES,
  DEFAULT_PIPELINE,
  STUDIO_SCENES,
  buildStudioPrompt,
  checkComfyHealth,
  generateProductPhoto,
  createMockComfyResult
} = require('../services/comfy-image.js');

async function main() {
  assert.equal(DEFAULT_PIPELINE, 'qwen-edit');
  assert(SUPPORTED_PIPELINES.includes('qwen-edit'));
  assert(SUPPORTED_PIPELINES.includes('flux'));
  assert(SUPPORTED_PIPELINES.includes('sdxl'));
  assert(SUPPORTED_PIPELINES.includes('upscale'));

  // Prompt generation
  const promptWarm = buildStudioPrompt('warm-studio');
  assert.match(promptWarm, /warm ivory/);
  assert.match(promptWarm, /maintain.*100% of the shoe's shape/i);

  const customPrompt = buildStudioPrompt('dark-luxury', 'Change background to dark emerald stone');
  assert.match(customPrompt, /Change background to dark emerald stone/);
  assert.match(customPrompt, /dark forest-green/);

  // Health check offline
  const offlineHealth = await checkComfyHealth('http://127.0.0.1:59999');
  assert.equal(offlineHealth.ok, false);
  assert.equal(offlineHealth.comfyui_reachable, false);

  // Mock result generation
  const mockResult = createMockComfyResult({
    pipeline: 'qwen-edit',
    style: 'warm-studio',
    prompt: 'test prompt',
    inputBuffer: Buffer.from('test-image')
  });
  assert.equal(mockResult.success, true);
  assert.equal(mockResult.pipeline, 'qwen-edit');
  assert.equal(mockResult.mock, true);
  assert(mockResult.dataUrl.startsWith('data:image/png;base64,'));

  // Generate with offline mock fallback
  const testBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const genResult = await generateProductPhoto({
    imageBytes: testBuffer,
    pipeline: 'qwen-edit',
    style: 'warm-studio',
    apiUrl: 'http://127.0.0.1:59999',
    mockFallback: true
  });
  assert.equal(genResult.success, true);
  assert.equal(genResult.provider, 'ComfyUI Automation API (Qwen / FLUX / SDXL)');
  assert.equal(genResult.pipeline, 'qwen-edit');

  // Test with mock fetch simulating ComfyUI Automation API
  const oldFetch = global.fetch;
  try {
    let calledEndpoint = '';
    let calledBody = null;

    global.fetch = async (url, options = {}) => {
      calledEndpoint = String(url);
      if (options.body) {
        calledBody = JSON.parse(options.body);
      }
      if (calledEndpoint.endsWith('/health')) {
        return new Response(JSON.stringify({
          api: 'ok',
          comfyui_reachable: true,
          comfyui_url: 'http://127.0.0.1:8188'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (calledEndpoint.endsWith('/edit/qwen')) {
        // Create a temporary mock output image file
        const tmpOutput = path.join(os.tmpdir(), `comfy-out-${Date.now()}.png`);
        fs.writeFileSync(tmpOutput, Buffer.from('mock-generated-image'));
        return new Response(JSON.stringify({
          images: [tmpOutput],
          count: 1
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (calledEndpoint.endsWith('/generate/flux')) {
        const tmpOutput = path.join(os.tmpdir(), `comfy-flux-${Date.now()}.png`);
        fs.writeFileSync(tmpOutput, Buffer.from('mock-flux-image'));
        return new Response(JSON.stringify({
          images: [tmpOutput],
          count: 1
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    };

    // Test health with live mock
    const liveHealth = await checkComfyHealth('http://127.0.0.1:8000');
    assert.equal(liveHealth.ok, true);
    assert.equal(liveHealth.comfyui_reachable, true);

    // Test Qwen Edit
    const qwenResult = await generateProductPhoto({
      imageBytes: testBuffer,
      pipeline: 'qwen-edit',
      style: 'warm-studio',
      apiUrl: 'http://127.0.0.1:8000'
    });
    assert.equal(qwenResult.success, true);
    assert.equal(calledEndpoint, 'http://127.0.0.1:8000/edit/qwen');
    assert.equal(calledBody.fast, true);
    assert(calledBody.prompt.includes('warm ivory'));

    // Test FLUX
    const fluxResult = await generateProductPhoto({
      pipeline: 'flux',
      prompt: 'a stylish leather boot in studio',
      apiUrl: 'http://127.0.0.1:8000'
    });
    assert.equal(fluxResult.success, true);
    assert.equal(calledEndpoint, 'http://127.0.0.1:8000/generate/flux');
    assert.equal(calledBody.prompt, 'a stylish leather boot in studio');

  } finally {
    global.fetch = oldFetch;
  }

  console.log('PASS: ComfyUI Automation API service (Qwen-Image-Edit, FLUX, SDXL, health check & mock fallback)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';
const assert = require('node:assert/strict');
const {
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  DEFAULT_STYLE,
  SUPPORTED_STYLES,
  promptFor,
  parseModel,
  parseStyle,
  buildPollinationsUrl,
  generateProductPhoto
} = require('../services/pollinations-image.js');

async function main() {
  // Model and parameter defaults
  assert.equal(MODEL, 'flux');
  assert.equal(DEFAULT_MODEL, 'flux');
  assert(SUPPORTED_MODELS.includes('flux'), 'must include flux');
  assert(SUPPORTED_MODELS.includes('turbo'), 'must include turbo');

  assert.equal(DEFAULT_STYLE, 'warm-studio');
  assert.deepEqual(SUPPORTED_STYLES, ['warm-studio', 'dark-luxury', 'natural-stone']);

  // Parameter parsing
  assert.equal(parseModel('turbo'), 'turbo');
  assert.equal(parseModel('TURBO'), 'turbo');
  assert.equal(parseModel('FLUX'), 'flux');
  assert.equal(parseModel('invalid-model'), 'flux');

  assert.equal(parseStyle('dark-luxury'), 'dark-luxury');
  assert.equal(parseStyle('natural-stone'), 'natural-stone');
  assert.equal(parseStyle('invalid-style'), 'warm-studio');

  // Prompt generation
  const warmPrompt = promptFor('warm-studio');
  assert.match(warmPrompt, /warm neutral ecommerce studio/);
  assert.match(warmPrompt, /soft cream and beige/);
  assert.match(warmPrompt, /Professional ecommerce product photograph/);

  const darkPrompt = promptFor('dark-luxury');
  assert.match(darkPrompt, /luxury dark ecommerce studio/);
  assert.match(darkPrompt, /moody deep charcoal/);

  const stonePrompt = promptFor('natural-stone');
  assert.match(stonePrompt, /natural limestone pedestal/);
  assert.match(stonePrompt, /crisp architectural daylight/);

  // Freeform user text should NOT be injected into the prompt
  const sanitizedPrompt = promptFor('warm-studio', 'کفش چرمی اسپرت مردانه تخفیف ویژه');
  assert.doesNotMatch(sanitizedPrompt, /کفش چرمی اسپرت/, 'freeform catalog text must not be injected into prompt');

  // URL builder
  const url1 = buildPollinationsUrl({ prompt: 'leather shoes on marble', model: 'flux', seed: 42 });
  assert.match(url1, /^https:\/\/image\.pollinations\.ai\/prompt\/leather%20shoes%20on%20marble\?/);
  assert.match(url1, /model=flux/);
  assert.match(url1, /nologo=true/);
  assert.match(url1, /seed=42/);

  const url2 = buildPollinationsUrl({ prompt: 'sneakers', model: 'turbo', width: 800, height: 800, seed: 999 });
  assert.match(url2, /model=turbo/);
  assert.match(url2, /width=800/);
  assert.match(url2, /height=800/);

  // Input validation
  await assert.rejects(
    () => generateProductPhoto({}),
    /یک تصویر واضح/
  );
  await assert.rejects(
    () => generateProductPhoto({ dataUrl: '' }),
    /یک تصویر واضح/
  );

  // Generation with mock client
  const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
  const mockClient = {
    generate: async ({ prompt, model, style, url }) => {
      assert.match(prompt, /Professional ecommerce product photograph/);
      assert.equal(model, 'turbo');
      assert.equal(style, 'dark-luxury');
      assert.match(url, /model=turbo/);
      return 'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  };

  const result1 = await generateProductPhoto({
    dataUrl: sampleDataUrl,
    style: 'dark-luxury',
    model: 'turbo',
    seed: 1234,
    client: mockClient
  });

  assert.equal(result1.success, true);
  assert.equal(result1.model, 'turbo');
  assert.equal(result1.style, 'dark-luxury');
  assert.equal(result1.provider, 'Pollinations.ai (FLUX / SDXL Turbo)');
  assert.equal(result1.unlimited, true);
  assert.equal(result1.keyless, true);
  assert.equal(result1.dataUrl, 'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

  // Generation with mock global.fetch
  const oldFetch = global.fetch;
  let fetchCalled = false;
  let requestedUrl = '';
  global.fetch = async (url, options) => {
    fetchCalled = true;
    requestedUrl = String(url);
    const mockImageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    return new Response(mockImageBytes, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' }
    });
  };

  try {
    const e2eResult = await generateProductPhoto({
      dataUrl: sampleDataUrl,
      model: 'flux',
      style: 'warm-studio',
      seed: 555
    });
    assert.equal(fetchCalled, true);
    assert.match(requestedUrl, /https:\/\/image\.pollinations\.ai\/prompt\//);
    assert.match(requestedUrl, /model=flux/);
    assert.match(requestedUrl, /seed=555/);
    assert.equal(e2eResult.success, true);
    assert.match(e2eResult.dataUrl, /^data:image\/jpeg;base64,/);
    assert.equal(e2eResult.model, 'flux');
    assert.equal(e2eResult.unlimited, true);
    assert.equal(e2eResult.keyless, true);
    assert.equal(e2eResult.provider, 'Pollinations.ai (FLUX / SDXL Turbo)');
  } finally {
    global.fetch = oldFetch;
  }

  // Error handling
  const failingFetch = global.fetch;
  global.fetch = async () => {
    return new Response('Upstream server error', { status: 503 });
  };
  try {
    await assert.rejects(
      () => generateProductPhoto({ dataUrl: sampleDataUrl }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /خطای سرویس تصویر/);
        return true;
      }
    );
  } finally {
    global.fetch = failingFetch;
  }

  console.log('PASS: Pollinations.ai FLUX / SDXL Turbo unlimited image assistant, keyless model options, and prompt sanitization');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';

const assert = require('node:assert/strict');
const {
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  DEFAULT_QUALITY,
  SUPPORTED_QUALITIES,
  DEFAULT_STYLE,
  SUPPORTED_STYLES,
  promptFor,
  parseModel,
  parseQuality,
  parseStyle,
  GptImageKeyManager,
  callGptImageEditsWithRotation,
  generateProductPhoto
} = require('../services/gpt-image.js');

async function run() {
  // 1. Defaults and configuration
  assert.equal(MODEL, 'gpt-image-2.5-flare');
  assert.equal(DEFAULT_MODEL, 'gpt-image-2.5-flare');
  assert.ok(SUPPORTED_MODELS.includes('gpt-image-2.5-flare'));
  assert.ok(SUPPORTED_MODELS.includes('gpt-image-2.5-sunburst'));
  assert.ok(SUPPORTED_MODELS.includes('gpt-image-2'));
  assert.ok(SUPPORTED_MODELS.includes('gpt-image-1.5'));

  assert.equal(parseModel('gpt-image-2'), 'gpt-image-2');
  assert.equal(parseModel('UNKNOWN-MODEL'), 'gpt-image-2.5-flare');

  assert.equal(DEFAULT_QUALITY, 'high');
  assert.ok(SUPPORTED_QUALITIES.includes('high'));
  assert.equal(parseQuality('max'), 'max');
  assert.equal(parseQuality('invalid'), 'high');

  assert.equal(DEFAULT_STYLE, 'warm-studio');
  assert.ok(SUPPORTED_STYLES.includes('warm-studio'));
  assert.ok(SUPPORTED_STYLES.includes('dark-luxury'));
  assert.ok(SUPPORTED_STYLES.includes('natural-stone'));
  assert.equal(parseStyle('dark-luxury'), 'dark-luxury');
  assert.equal(parseStyle('unknown'), 'warm-studio');

  // 2. Prompt engineering for reference image preservation and shoe exclusivity
  const warmPrompt = promptFor('warm-studio');
  assert.match(warmPrompt, /reference image/i, 'Prompt must reference input image');
  assert.match(warmPrompt, /maintain the exact footwear design/i, 'Prompt must instruct model to preserve shoe details');
  assert.match(warmPrompt, /no human feet, legs, or models/i, 'Prompt must exclude human feet and legs');
  assert.match(warmPrompt, /single shoe product view only/i, 'Prompt must specify single shoe view');

  const darkPrompt = promptFor('dark-luxury');
  assert.match(darkPrompt, /luxury dark ecommerce studio setting/i);
  assert.match(darkPrompt, /no human feet/i);

  // 3. GptImageKeyManager unit tests
  const keyManager = new GptImageKeyManager({
    keys: ['sk-alpha', 'sk-beta', 'sk-gamma']
  });

  assert.equal(keyManager.configuredKeys.length, 3);
  assert.equal(await keyManager.getValidKey(false), 'sk-alpha');

  // Limit error detection
  assert.ok(keyManager.isLimitError(429, 'Too many requests'));
  assert.ok(keyManager.isLimitError(429, 'Rate limit reached'));
  assert.ok(keyManager.isLimitError(402, 'Usage limit exceeded'));
  assert.ok(keyManager.isLimitError(401, 'Invalid API key'));
  assert.ok(keyManager.isLimitError(200, 'insufficient_quota: You exceeded your current quota'));
  assert.equal(keyManager.isLimitError(500, 'Internal Server Error'), false);

  // Rotate key on limit
  const secondKey = await keyManager.getValidKey(true, 'quota exceeded on alpha');
  assert.equal(secondKey, 'sk-beta');
  assert.ok(keyManager.exhaustedKeys.has('sk-alpha'));

  const thirdKey = await keyManager.getValidKey(true, 'rate limit on beta');
  assert.equal(thirdKey, 'sk-gamma');
  assert.ok(keyManager.exhaustedKeys.has('sk-beta'));

  // Key exhaustion when pool has no more keys
  const emptyKeyManager = new GptImageKeyManager({
    keys: []
  });
  assert.equal(await emptyKeyManager.getValidKey(false), null);

  // 4. Automatic rotation during callGptImageEditsWithRotation
  let callCount = 0;
  const callKeys = [];
  const mockRotateFetch = async (url, options) => {
    if (url.endsWith('/images/edits')) {
      callCount++;
      const authHeader = options.headers['Authorization'] || '';
      const keyUsed = authHeader.replace('Bearer ', '');
      callKeys.push(keyUsed);

      if (keyUsed === 'key_limited_1') {
        // First key hits quota limit
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'insufficient_quota', code: 'insufficient_quota' } })
        };
      }
      if (keyUsed === 'key_limited_2') {
        // Second key hits rate limit
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit reached for requests', code: 'rate_limit_exceeded' } })
        };
      }
      // Third key succeeds!
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: 'bW9ja0dlbmVyYXRlZFNob2VJbWFnZUJhc2U2NA==' }]
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const rotatingManager = new GptImageKeyManager({
    keys: ['key_limited_1', 'key_limited_2', 'key_working_3'],
    fetchFn: mockRotateFetch
  });

  const editsResult = await callGptImageEditsWithRotation({
    prompt: 'Sample shoe prompt',
    model: 'gpt-image-2.5-flare',
    quality: 'high',
    inputBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    keyManager: rotatingManager,
    fetchFn: mockRotateFetch
  });

  assert.equal(editsResult.outputUrl, 'data:image/jpeg;base64,bW9ja0dlbmVyYXRlZFNob2VJbWFnZUJhc2U2NA==');
  assert.equal(editsResult.rotated, true, 'Result must indicate auto-rotation occurred');
  assert.equal(editsResult.usedKey, 'key_working_3');
  assert.equal(callCount, 3, 'Must attempt 3 times and seamlessly succeed on the 3rd key');
  assert.deepEqual(callKeys, ['key_limited_1', 'key_limited_2', 'key_working_3']);

  // 5. Input validation on generateProductPhoto
  await assert.rejects(
    async () => generateProductPhoto({}),
    /تصویر واضح از محصول لازم است/
  );

  // 6. Custom mock client integration
  let clientCalled = false;
  const mockClient = {
    generate: async ({ prompt, model, style, inputBuffer }) => {
      clientCalled = true;
      assert.ok(prompt.includes('reference image'));
      assert.equal(model, 'gpt-image-2.5-flare');
      assert.equal(style, 'warm-studio');
      assert.ok(Buffer.isBuffer(inputBuffer));
      return { dataUrl: 'data:image/jpeg;base64,mockShoePhotoDataUrl' };
    }
  };

  const photoResult = await generateProductPhoto({
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    client: mockClient
  });

  assert.ok(clientCalled);
  assert.equal(photoResult.success, true);
  assert.equal(photoResult.provider, 'GPT Image (OpenAI / Rotating Pool)');
  assert.equal(photoResult.model, 'gpt-image-2.5-flare');
  assert.equal(photoResult.dataUrl, 'data:image/jpeg;base64,mockShoePhotoDataUrl');

  console.log('PASS: GPT Image assistant, auto-rotating key manager, reference shoe conditioning, and rate-limit/quota auto-healing');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

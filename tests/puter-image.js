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
  PuterTokenManager,
  callPuterDriverWithRotation,
  generateProductPhoto
} = require('../services/puter-image.js');

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

  // 3. PuterTokenManager unit tests
  const tokenManager = new PuterTokenManager({
    tokens: ['token_alpha', 'token_beta', 'token_gamma']
  });

  assert.equal(tokenManager.configuredTokens.length, 3);
  assert.equal(await tokenManager.getValidToken(false), 'token_alpha');

  // Limit error detection
  assert.ok(tokenManager.isLimitError(429, 'Too many requests'));
  assert.ok(tokenManager.isLimitError(402, 'Usage limit exceeded'));
  assert.ok(tokenManager.isLimitError(401, 'Missing authentication token'));
  assert.ok(tokenManager.isLimitError(200, 'Monthly quota reached for this key'));
  assert.equal(tokenManager.isLimitError(500, 'Internal Server Error'), false);

  // Rotate token on limit
  const secondToken = await tokenManager.getValidToken(true, 'quota exceeded on alpha');
  assert.equal(secondToken, 'token_beta');
  assert.ok(tokenManager.exhaustedTokens.has('token_alpha'));

  const thirdToken = await tokenManager.getValidToken(true, 'rate limit on beta');
  assert.equal(thirdToken, 'token_gamma');
  assert.ok(tokenManager.exhaustedTokens.has('token_beta'));

  // Token exhaustion when pool has no more tokens
  const emptyTokenManager = new PuterTokenManager({
    tokens: []
  });
  assert.equal(await emptyTokenManager.getValidToken(false), null);

  // 4. Automatic rotation during callPuterDriverWithRotation
  let callCount = 0;
  const callTokens = [];
  const mockRotateFetch = async (url, options) => {
    if (url.endsWith('/drivers/call')) {
      callCount++;
      const authHeader = options.headers['Authorization'] || '';
      const tokenUsed = authHeader.replace('Bearer ', '');
      callTokens.push(tokenUsed);

      if (tokenUsed === 'token_limited_1') {
        // First token hits rate limit
        return {
          ok: false,
          status: 429,
          json: async () => ({ success: false, error: { message: 'Usage limit exceeded' } })
        };
      }
      if (tokenUsed === 'token_limited_2') {
        // Second token hits auth error
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: { message: 'Missing authentication token' } })
        };
      }
      // Third token succeeds!
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: { url: 'data:image/jpeg;base64,mockGeneratedShoeImageBase64' }
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const rotatingManager = new PuterTokenManager({
    tokens: ['token_limited_1', 'token_limited_2', 'token_working_3'],
    fetchFn: mockRotateFetch
  });

  const driverResult = await callPuterDriverWithRotation({
    prompt: 'Sample shoe prompt',
    model: 'gpt-image-2.5-flare',
    quality: 'high',
    inputImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    tokenManager: rotatingManager,
    fetchFn: mockRotateFetch
  });

  assert.equal(driverResult.outputUrl, 'data:image/jpeg;base64,mockGeneratedShoeImageBase64');
  assert.equal(driverResult.rotated, true, 'Result must indicate auto-rotation occurred');
  assert.equal(driverResult.usedToken, 'token_working_3');
  assert.equal(callCount, 3, 'Must attempt 3 times and seamlessly succeed on the 3rd token');
  assert.deepEqual(callTokens, ['token_limited_1', 'token_limited_2', 'token_working_3']);

  // 5. Input validation on generateProductPhoto
  await assert.rejects(
    async () => generateProductPhoto({}),
    /تصویر واضح از محصول لازم است/
  );

  // 6. Custom mock client integration
  let clientCalled = false;
  const mockClient = {
    generate: async ({ prompt, model, style, inputImage }) => {
      clientCalled = true;
      assert.ok(prompt.includes('reference image'));
      assert.equal(model, 'gpt-image-2.5-flare');
      assert.equal(style, 'warm-studio');
      assert.ok(inputImage.startsWith('data:image/jpeg;base64,'));
      return { dataUrl: 'data:image/jpeg;base64,mockShoePhotoDataUrl' };
    }
  };

  const photoResult = await generateProductPhoto({
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    client: mockClient
  });

  assert.ok(clientCalled);
  assert.equal(photoResult.success, true);
  assert.equal(photoResult.provider, 'Puter.js (OpenAI GPT Image)');
  assert.equal(photoResult.model, 'gpt-image-2.5-flare');
  assert.equal(photoResult.dataUrl, 'data:image/jpeg;base64,mockShoePhotoDataUrl');

  console.log('PASS: Puter.js GPT Image assistant, auto-rotating token manager, reference shoe conditioning, and rate-limit auto-healing');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

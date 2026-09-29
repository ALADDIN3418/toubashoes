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
  generateProductPhoto
} = require('../services/puter-image.js');

async function main() {
  // Model and parameter defaults
  assert.equal(MODEL, 'gpt-image-2.5-flare');
  assert.equal(DEFAULT_MODEL, 'gpt-image-2.5-flare');
  assert(SUPPORTED_MODELS.includes('gpt-image-2.5-flare'), 'must include gpt-image-2.5-flare');
  assert(SUPPORTED_MODELS.includes('gpt-image-2.5-sunburst'), 'must include gpt-image-2.5-sunburst');
  assert(SUPPORTED_MODELS.includes('gpt-image-2'), 'must include gpt-image-2');

  assert.equal(DEFAULT_QUALITY, 'high');
  assert.deepEqual(SUPPORTED_QUALITIES, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(DEFAULT_STYLE, 'warm-studio');
  assert.deepEqual(SUPPORTED_STYLES, ['warm-studio', 'dark-luxury', 'natural-stone']);

  // Parameter parsing
  assert.equal(parseModel('gpt-image-2.5-sunburst'), 'gpt-image-2.5-sunburst');
  assert.equal(parseModel('GPT-IMAGE-2'), 'gpt-image-2');
  assert.equal(parseModel('invalid-model'), 'gpt-image-2.5-flare');

  assert.equal(parseQuality('medium'), 'medium');
  assert.equal(parseQuality('xhigh'), 'xhigh');
  assert.equal(parseQuality('invalid-quality'), 'high');

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

  // Input validation
  await assert.rejects(
    () => generateProductPhoto({}),
    /یک تصویر واضح/
  );
  await assert.rejects(
    () => generateProductPhoto({ dataUrl: '' }),
    /یک تصویر واضح/
  );

  // Generation with mock Puter client (image element object)
  const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
  let capturedPrompt = '';
  let capturedOptions = null;

  const mockClient = {
    ai: {
      txt2img: async (prompt, options) => {
        capturedPrompt = prompt;
        capturedOptions = options;
        return {
          src: 'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          tagName: 'IMG'
        };
      }
    }
  };

  const result1 = await generateProductPhoto({
    dataUrl: sampleDataUrl,
    style: 'dark-luxury',
    model: 'gpt-image-2.5-sunburst',
    quality: 'xhigh',
    client: mockClient
  });

  assert.equal(result1.success, true);
  assert.equal(result1.model, 'gpt-image-2.5-sunburst');
  assert.equal(result1.quality, 'xhigh');
  assert.equal(result1.style, 'dark-luxury');
  assert.equal(result1.provider, 'Puter.js (OpenAI GPT Image)');
  assert.equal(result1.keyless, true);
  assert.equal(result1.dataUrl, 'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  assert.match(capturedPrompt, /luxury dark ecommerce studio/);
  assert.equal(capturedOptions.model, 'gpt-image-2.5-sunburst');
  assert.equal(capturedOptions.quality, 'xhigh');
  assert.equal(capturedOptions.input_image, sampleDataUrl);

  // Generation with string output
  const mockStringClient = {
    ai: {
      txt2img: async () => 'https://assets.puter.site/generated-shoe.jpg'
    }
  };
  const result2 = await generateProductPhoto({
    imageBytes: [Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    client: mockStringClient
  });
  assert.equal(result2.success, true);
  assert.equal(result2.dataUrl, 'https://assets.puter.site/generated-shoe.jpg');
  assert.equal(result2.model, 'gpt-image-2.5-flare');
  assert.equal(result2.quality, 'high');

  // Error handling
  const failingClient = {
    ai: {
      txt2img: async () => {
        const err = new Error('Rate limit exceeded on Puter API');
        err.status = 429;
        err.code = 'rate_limited';
        throw err;
      }
    }
  };
  await assert.rejects(
    () => generateProductPhoto({ dataUrl: sampleDataUrl, client: failingClient }),
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, 'rate_limited');
      assert.match(err.message, /Rate limit exceeded/);
      return true;
    }
  );

  // End-to-end test with mocked global.fetch via Puter.js driver
  const oldFetch = global.fetch;
  let driverCalled = false;
  global.fetch = async (url, options) => {
    driverCalled = true;
    assert.equal(url, 'https://api.puter.com/drivers/call');
    const body = JSON.parse(options.body);
    assert.equal(body.interface, 'puter-image-generation');
    assert.equal(body.driver, 'ai-image');
    assert.equal(body.method, 'generate');
    assert.equal(body.args.model, 'gpt-image-2.5-flare');
    assert.equal(body.args.quality, 'high');
    assert.equal(body.args.input_image, sampleDataUrl);
    return new Response(JSON.stringify({
      success: true,
      result: 'data:image/jpeg;base64,UFBURVI='
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const e2eResult = await generateProductPhoto({
      dataUrl: sampleDataUrl,
      model: 'gpt-image-2.5-flare',
      quality: 'high',
      style: 'warm-studio'
    });
    assert.equal(driverCalled, true);
    assert.equal(e2eResult.success, true);
    assert.equal(e2eResult.dataUrl, 'data:image/jpeg;base64,UFBURVI=');
    assert.equal(e2eResult.provider, 'Puter.js (OpenAI GPT Image)');
  } finally {
    global.fetch = oldFetch;
  }

  console.log('PASS: Puter.js GPT Image assistant, keyless model options, prompt sanitization, and driver integration');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

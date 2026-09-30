'use strict';

const assert = require('node:assert/strict');
const {
  MODEL,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  DEFAULT_STYLE,
  SUPPORTED_STYLES,
  DEFAULT_LIGHTING,
  SUPPORTED_LIGHTINGS,
  STYLE_PRESETS,
  parseModel,
  parseStyle,
  parseLighting,
  generateProductPhoto
} = require('../services/studio-image.js');

async function run() {
  // 1. Defaults and configuration
  assert.equal(MODEL, 'touba-studio-v1');
  assert.equal(DEFAULT_MODEL, 'touba-studio-v1');
  assert.ok(SUPPORTED_MODELS.includes('touba-studio-v1'));
  assert.equal(parseModel('touba-studio-v1'), 'touba-studio-v1');
  assert.equal(parseModel('UNKNOWN-MODEL'), 'touba-studio-v1');

  assert.equal(DEFAULT_STYLE, 'warm-studio');
  assert.ok(SUPPORTED_STYLES.includes('warm-studio'));
  assert.ok(SUPPORTED_STYLES.includes('dark-luxury'));
  assert.ok(SUPPORTED_STYLES.includes('natural-stone'));
  assert.ok(SUPPORTED_STYLES.includes('clean-white'));
  assert.ok(SUPPORTED_STYLES.includes('walnut-wood'));
  assert.equal(parseStyle('dark-luxury'), 'dark-luxury');
  assert.equal(parseStyle('unknown'), 'warm-studio');

  assert.equal(DEFAULT_LIGHTING, 'front-diffused');
  assert.ok(SUPPORTED_LIGHTINGS.includes('front-diffused'));
  assert.ok(SUPPORTED_LIGHTINGS.includes('right-accent'));
  assert.ok(SUPPORTED_LIGHTINGS.includes('left-accent'));
  assert.equal(parseLighting('right-accent'), 'right-accent');
  assert.equal(parseLighting('invalid'), 'front-diffused');

  // 2. Style presets definitions
  for (const style of SUPPORTED_STYLES) {
    const preset = STYLE_PRESETS[style];
    assert.ok(preset, `Preset must exist for ${style}`);
    assert.ok(preset.label, `Preset label required for ${style}`);
    assert.ok(preset.wallTop && preset.wallBottom);
    assert.ok(preset.floorTop && preset.floorBottom);
  }

  // 3. Input validation
  await assert.rejects(
    async () => generateProductPhoto({}),
    /تصویر واضح از محصول لازم است/
  );

  // 4. Custom mock client integration
  let clientCalled = false;
  const mockClient = {
    generate: async ({ model, style, lighting, pedestal, contrast, inputBuffer }) => {
      clientCalled = true;
      assert.equal(model, 'touba-studio-v1');
      assert.equal(style, 'warm-studio');
      assert.equal(lighting, 'front-diffused');
      assert.equal(pedestal, true);
      assert.equal(contrast, true);
      assert.ok(Buffer.isBuffer(inputBuffer));
      return { dataUrl: 'data:image/jpeg;base64,mockRenderedStudioShoeDataUrl' };
    }
  };

  const photoResult = await generateProductPhoto({
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    client: mockClient
  });

  assert.ok(clientCalled);
  assert.equal(photoResult.success, true);
  assert.equal(photoResult.provider, 'Touba AI Commercial Studio (100% Free & Unlimited)');
  assert.equal(photoResult.dataUrl, 'data:image/jpeg;base64,mockRenderedStudioShoeDataUrl');
  assert.equal(photoResult.keyless, true);
  assert.equal(photoResult.unlimited, true);
  assert.equal(photoResult.free, true);

  // 5. Default studio generation with direct imageBytes
  const directResult = await generateProductPhoto({
    imageBytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    style: 'dark-luxury',
    lighting: 'right-accent',
    pedestal: false
  });

  assert.equal(directResult.success, true);
  assert.equal(directResult.style, 'dark-luxury');
  assert.equal(directResult.lighting, 'right-accent');
  assert.equal(directResult.pedestal, false);
  assert.equal(directResult.keyless, true);
  assert.equal(directResult.unlimited, true);

  console.log('PASS: Touba AI Commercial Studio engine, preset definitions, keyless unlimited generation and mock client');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * Test Suite for Product AI Studio
 * «تست‌های یکپارچه استودیو هوش مصنوعی محصول — Google Gemini 3.5 Flash»
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PRESETS,
  DEFAULT_PRESET,
  PRESERVATION_RULES,
  ASPECT_RATIO_DIMENSIONS,
  buildPrompt,
  getNegativePrompt
} = require('../services/prompt-templates.js');
const {
  validateImageBytes,
  parseDataUrl,
  checkBackendHealth,
  generateStudioPhoto,
  attachImageToProduct,
  DEFAULT_PROVIDER,
  GEMINI_STUDIO_MODEL,
  SUPPORTED_PROVIDERS,
  SUPPORTED_PIPELINES
} = require('../services/ai-studio-engine.js');
const {
  studioStatus,
  studioGenerate,
  studioAttach
} = require('../lib/vercel-api.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, val) { this.headers[name] = val; },
    end(val) { this.body = val; }
  };
}

function parsePayload(res) {
  return JSON.parse(res.body || '{}');
}

async function runTests() {
  console.log('=== شروع تست‌های استودیو هوش مصنوعی محصول (Google Gemini 3.5 Flash) ===');

  // 1. Template Engine Tests
  console.log('1. بررسی موتور پرامپت و قالب‌ها…');
  assert.equal(typeof PRESETS, 'object');
  const expectedPresets = ['catalog-white', 'dark-luxury', 'minimal', 'lifestyle', 'on-model', 'advertising', 'custom'];
  for (const presetId of expectedPresets) {
    assert(PRESETS[presetId], `Preset «${presetId}» باید تعریف شده باشد`);
    assert(PRESETS[presetId].title, `Preset «${presetId}» باید عنوان داشته باشد`);
  }
  assert.equal(DEFAULT_PRESET, 'catalog-white');

  // Check prompt construction
  const catalogPrompt = buildPrompt({ style: 'catalog-white', preservation: 'maximum' });
  assert.match(catalogPrompt, /exact.*shown in the reference image/i);
  assert.match(catalogPrompt, /pure.*white.*catalog/i);
  assert.match(catalogPrompt, /Do NOT alter.*color/i);

  const darkPrompt = buildPrompt({ style: 'dark-luxury', preservation: 'maximum' });
  assert.match(darkPrompt, /luxury dark.*studio/i);

  const customPrompt = buildPrompt({ style: 'custom', customPrompt: 'on a floating marble pedestal' });
  assert.match(customPrompt, /on a floating marble pedestal/i);

  const negPrompt = getNegativePrompt();
  assert.match(negPrompt, /distorted silhouette/i);
  assert.match(negPrompt, /altered logos/i);
  assert.match(negPrompt, /missing buckles/i);

  // Aspect ratio dimensions
  assert.equal(ASPECT_RATIO_DIMENSIONS['1:1'].width, 1024);
  assert.equal(ASPECT_RATIO_DIMENSIONS['1:1'].height, 1024);
  assert.equal(ASPECT_RATIO_DIMENSIONS['4:5'].width, 896);
  assert.equal(ASPECT_RATIO_DIMENSIONS['4:5'].height, 1120);
  assert.equal(ASPECT_RATIO_DIMENSIONS['3:4'].width, 864);
  assert.equal(ASPECT_RATIO_DIMENSIONS['3:4'].height, 1152);
  assert.equal(ASPECT_RATIO_DIMENSIONS['16:9'].width, 1280);
  assert.equal(ASPECT_RATIO_DIMENSIONS['16:9'].height, 720);
  console.log('✓ موتور پرامپت و قوانین سخت‌گیرانه حفظ هویت کالا تأیید شد.');

  // 2. Engine & Image Validation Tests
  console.log('2. بررسی اعتبارسنجی تصویر و موتور Google Gemini 3.5 Flash…');
  assert.equal(fs.existsSync(path.join(__dirname, '../services/birefnet-studio.js')), false, 'services/birefnet-studio.js must be deleted');

  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const invalidData = Buffer.from([0x00, 0x01, 0x02, 0x03]);

  assert.equal(validateImageBytes(validJpeg).isJpeg, true);
  assert.equal(validateImageBytes(validPng).isPng, true);
  assert.throws(() => validateImageBytes(invalidData), /فقط فرمت‌های تصویر JPG، PNG و WEBP/);
  assert.throws(() => validateImageBytes(Buffer.alloc(16 * 1024 * 1024)), /بیش از سقف مجاز ۱۵ مگابایت/);

  // Parse Data URL
  const sampleDataUrl = `data:image/jpeg;base64,${validJpeg.toString('base64')}`;
  const parsed = parseDataUrl(sampleDataUrl);
  assert(parsed);
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.deepEqual(parsed.buffer, validJpeg);

  // Providers list (Exclusively Google Gemini 3.5 Flash)
  assert.equal(DEFAULT_PROVIDER, 'gemini-3.5-flash');
  assert.equal(GEMINI_STUDIO_MODEL, 'gemini-3.5-flash');
  assert.equal(SUPPORTED_PROVIDERS.length, 1);
  assert.equal(SUPPORTED_PROVIDERS[0].id, 'gemini-3.5-flash');
  assert.equal(SUPPORTED_PROVIDERS[0].name, 'Google Gemini 3.5 Flash (مدل رایگان گوگل)');
  assert.deepEqual(SUPPORTED_PIPELINES, ['gemini-3.5-flash']);

  const health = await checkBackendHealth();
  assert.equal(health.connected, true);
  assert.equal(health.model, 'gemini-3.5-flash');

  // Generation (Development / Mock preview when no API key is configured)
  const genResult = await generateStudioPhoto({
    image: sampleDataUrl,
    style: 'dark-luxury',
    aspectRatio: '1:1',
    preservation: 'maximum',
    allowMock: true
  });

  assert.equal(genResult.success, true);
  assert.equal(genResult.style, 'dark-luxury');
  assert.equal(genResult.aspectRatio, '1:1');
  assert.equal(genResult.model, 'gemini-3.5-flash');
  assert.equal(genResult.provider, 'Google Gemini 3.5 Flash (gemini-3.5-flash)');
  assert(genResult.generatedUrl);
  assert(genResult.originalUrl);

  // Test Google Gemini 3.5 Flash direct API call & internal image endpoint fallback
  const originalFetch = global.fetch;
  const pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d450000000049454e44ae426082';
  try {
    // Direct gemini-3.5-flash endpoint
    global.fetch = async (url, options) => {
      const target = String(url);
      if (target.includes('generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent')) {
        const body = JSON.parse(options.body);
        assert(body.contents[0].parts.some(p => p.inlineData && p.inlineData.data));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from(pngHex, 'hex').toString('base64')
                  }
                }]
              }
            }]
          })
        };
      }
      throw new Error('Unexpected fetch');
    };

    const directGeminiRes = await generateStudioPhoto({
      image: sampleDataUrl,
      style: 'catalog-white',
      geminiApiKey: 'AIzaSyTestConnectedUserKey',
      allowMock: false
    });
    assert.equal(directGeminiRes.success, true);
    assert.equal(directGeminiRes.model, 'gemini-3.5-flash');
    assert.equal(directGeminiRes.provider, 'Google Gemini 3.5 Flash (gemini-3.5-flash)');
    assert(directGeminiRes.generatedUrl.startsWith('data:image/png;base64,'));

    // Internal fallback across Gemini image endpoints if gemini-3.5-flash delegates to gemini-2.5-flash-image
    global.fetch = async (url) => {
      const target = String(url);
      if (target.includes('gemini-2.5-flash-image:generateContent')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from(pngHex, 'hex').toString('base64')
                  }
                }]
              }
            }]
          })
        };
      }
      return { ok: false, status: 404, text: async () => 'Model not found' };
    };

    const fallbackGeminiRes = await generateStudioPhoto({
      image: sampleDataUrl,
      style: 'dark-luxury',
      geminiApiKey: 'AIzaSyTestConnectedUserKey',
      allowMock: false
    });
    assert.equal(fallbackGeminiRes.success, true);
    assert.equal(fallbackGeminiRes.model, 'gemini-3.5-flash');
    assert.equal(fallbackGeminiRes.provider, 'Google Gemini 3.5 Flash (gemini-3.5-flash)');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('✓ تولید تصویر منحصراً با Google Gemini 3.5 Flash با موفقیت تست شد.');

  // 3. Product Attachment to Database
  console.log('3. بررسی افزودن تصویر به محصول و گالری…');
  const mockDb = {
    products: [
      { id: 'shoe-101', name: 'کفش چرم مردانه تبریز', image: '/img/old.jpg', images: ['/img/old.jpg'] }
    ]
  };

  const newImageUrl = 'https://toubashoes.ir/uploads/studio-1.jpg';
  const attachMainRes = await attachImageToProduct({
    productId: 'shoe-101',
    imageUrl: newImageUrl,
    asMainImage: true,
    db: mockDb
  });

  assert.equal(attachMainRes.success, true);
  assert.equal(mockDb.products[0].image, newImageUrl);
  assert.equal(mockDb.products[0].images[0], newImageUrl);

  const galleryImageUrl = 'https://toubashoes.ir/uploads/studio-gallery-2.jpg';
  const attachGalleryRes = await attachImageToProduct({
    productId: 'shoe-101',
    imageUrl: galleryImageUrl,
    asMainImage: false,
    addToGallery: true,
    db: mockDb
  });

  assert.equal(attachGalleryRes.success, true);
  assert(mockDb.products[0].images.includes(galleryImageUrl));
  console.log('✓ الحاق مستقیم به محصول و گالری تأیید شد.');

  // 4. API Endpoints Tests
  console.log('4. بررسی Endpointهای سرور Vercel و Local…');
  let res = mockRes();
  await studioStatus({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  const statusData = parsePayload(res);
  assert.equal(statusData.success, true);
  assert.equal(statusData.defaultProvider, 'gemini-3.5-flash');
  assert.equal(statusData.model, 'gemini-3.5-flash');
  assert(Array.isArray(statusData.supportedProviders));
  assert.equal(statusData.supportedProviders.length, 1);
  assert.equal(statusData.supportedProviders[0].id, 'gemini-3.5-flash');

  // Method not allowed on GET generate
  res = mockRes();
  await studioGenerate({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);

  // Forbidden without origin
  res = mockRes();
  await studioGenerate({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 403);

  // Successful studio generation via API
  res = mockRes();
  await studioGenerate({
    method: 'POST',
    headers: { origin: 'https://touba.test', host: 'touba.test' },
    body: { image: sampleDataUrl, style: 'catalog-white', provider: 'gemini-3.5-flash' }
  }, res);
  assert.equal(res.statusCode, 200);
  const genApiData = parsePayload(res);
  assert.equal(genApiData.success, true);
  assert.equal(genApiData.style, 'catalog-white');
  assert.equal(genApiData.model, 'gemini-3.5-flash');
  assert.equal(genApiData.provider, 'Google Gemini 3.5 Flash (gemini-3.5-flash)');
  assert(genApiData.generatedUrl);

  console.log('✓ Endpointهای اختصاصی /api/ai/studio/* به‌درستی پاسخ دادند.');

  // 5. Client UI Source Validation
  console.log('5. بررسی صحت کدهای رابط کاربری ادمین…');
  const clientScript = fs.readFileSync(path.join(__dirname, '../admin-product-ai.js'), 'utf8');
  assert(clientScript.includes('renderProductAiStudioPage'), 'UI script must export renderProductAiStudioPage');
  assert(clientScript.includes('catalog-white'), 'UI must support catalog-white style');
  assert(clientScript.includes('dark-luxury'), 'UI must support dark-luxury style');
  assert(clientScript.includes('on-model'), 'UI must support on-model style');
  assert(clientScript.includes('ai-studio-dropzone'), 'UI must support drag and drop zone');
  assert(clientScript.includes('ai-btn-set-main-image'), 'UI must have button to set as main image');
  assert(clientScript.includes('ai-btn-add-to-gallery'), 'UI must have button to add to gallery');
  assert(clientScript.includes('ai-btn-download-image'), 'UI must have button to download image');
  assert(clientScript.includes('ai-btn-regenerate'), 'UI must have button to regenerate');
  assert(clientScript.includes('value="gemini-3.5-flash"'), 'UI must select gemini-3.5-flash');
  assert(clientScript.includes('Google Gemini 3.5 Flash (مدل رایگان گوگل · حفظ ۱۰۰٪ کالا)'), 'UI must show Google Gemini 3.5 Flash label');
  assert(!clientScript.includes('segmentViaBrowserBiRefNet'), 'Legacy BiRefNet segmentation must be removed');
  assert(!clientScript.includes('segmentViaBrowserOnnx'), 'Legacy ONNX segmentation must be removed');
  assert(!clientScript.includes('createClientStudioPreview'), 'Legacy client studio preview must be removed');
  assert(clientScript.includes('synthesizeGeminiStudioImage'), 'UI must synthesize studio scene so raw input image is never returned unchanged');
  assert(clientScript.includes('gemini-2.0-flash-exp-image-generation'), 'UI must include free-tier Gemini image generation fallback model');

  const stage4Css = fs.readFileSync(path.join(__dirname, '../stage4.css'), 'utf8');
  assert(stage4Css.includes('.ai-studio-page-wrapper .full'), 'CSS must enforce full width on studio controls');
  assert(stage4Css.includes('.ai-comparison-grid.view-mode-compare'), 'CSS must support responsive view-mode-compare class');

  console.log('✓ رابط کاربری «استودیو هوش مصنوعی محصول» کامل و آماده است.');
  console.log('\n=============================================');
  console.log('✅ تمامی تست‌های Product AI Studio با موفقیت پاس شدند.');
  console.log('=============================================');
}

runTests().catch(err => {
  console.error('❌ خطا در تست‌های استودیو هوش مصنوعی:', err);
  process.exit(1);
});

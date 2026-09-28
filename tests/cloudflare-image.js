'use strict';
const assert = require('node:assert/strict');
const { MODEL, DEFAULT_MODEL, promptFor, buildEndpoint, generateProductPhoto } = require('../services/cloudflare-image.js');

async function main() {
  assert.equal(MODEL, '@cf/black-forest-labs/flux-2-klein-4b');
  assert.equal(DEFAULT_MODEL, MODEL);
  assert.equal(buildEndpoint('0123456789abcdef0123456789abcdef'), 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
  assert.throws(() => buildEndpoint('not-an-account-id'), /۳۲ کاراکتری/);
  assert.throws(() => buildEndpoint('0123456789abcdef0123456789abcdef', 'not-a-model'), /مدل Cloudflare/);
  assert.match(promptFor('dark-luxury'), /dark forest-green/);
  assert.match(promptFor('natural-stone'), /natural limestone/);
  assert.match(promptFor('warm-studio', 'کفش چرمی مردانه دو سگک'), /کفش چرمی مردانه دو سگک/);
  assert.match(promptFor('warm-studio', 'کفش چرمی مردانه دو سگک'), /input image 0 is authoritative/);
  assert.match(promptFor('warm-studio'), /Do not substitute a different type of shoe/);

  const oldFetch = global.fetch;
  const oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const oldToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
  process.env.CLOUDFLARE_API_TOKEN = 'test-token-only';
  let requested = false;
  global.fetch = async (url, options) => {
    requested = true;
    assert.equal(url, buildEndpoint(process.env.CLOUDFLARE_ACCOUNT_ID));
    assert.equal(options.headers.Authorization, 'Bearer test-token-only');
    assert.equal(options.body.get('prompt').includes('input image 0'), true);
    assert.equal(options.body.get('width'), '1024');
    assert.equal(options.body.get('height'), '1024');
    assert.equal(options.body.get('input_image_0').type, 'image/jpeg');
    return new Response(JSON.stringify({ success:true, result:{ image:Buffer.from('image-test').toString('base64') } }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  try {
    const result = await generateProductPhoto({ imageBytes:Buffer.from('reference'), style:'warm-studio' });
    assert.equal(requested, true);
    assert.equal(result.model, MODEL);
    assert.equal(result.provider, 'Cloudflare Workers AI');
    assert.equal(result.dataUrl, `data:image/png;base64,${Buffer.from('image-test').toString('base64')}`);
  } finally {
    global.fetch = oldFetch;
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = oldToken;
  }
  console.log('PASS: Cloudflare Workers AI FLUX.2 Klein 4B endpoint, multipart reference editing, prompt and validation');
}
main().catch(error => { console.error(error); process.exit(1); });

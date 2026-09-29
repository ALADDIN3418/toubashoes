'use strict';
const assert = require('node:assert/strict');
const {
  MODEL,
  DEFAULT_MODEL,
  REFERENCE_ROLES,
  REFERENCE_VIEW_IDS,
  promptFor,
  buildEndpoint,
  extractCloudflareId,
  isContentFlagged,
  formatSafetyFlaggedError,
  generateProductPhoto
} = require('../services/cloudflare-image.js');

async function main() {
  assert.equal(MODEL, '@cf/black-forest-labs/flux-2-klein-9b');
  assert.equal(DEFAULT_MODEL, MODEL);
  assert.equal(buildEndpoint('0123456789abcdef0123456789abcdef'), 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-2-klein-9b');
  assert.throws(() => buildEndpoint('not-an-account-id'), /۳۲ کاراکتری/);
  assert.throws(() => buildEndpoint('0123456789abcdef0123456789abcdef', 'not-a-model'), /مدل Cloudflare/);
  assert.match(promptFor('dark-luxury'), /dark forest-green/);
  assert.match(promptFor('natural-stone'), /natural limestone/);

  // The prompt must be strictly shoe/product-only and exclude freeform user/product text
  const safeShoePrompt = promptFor('warm-studio', 'کفش چرمی مردانه دو سگک');
  assert.doesNotMatch(safeShoePrompt, /کفش چرمی مردانه دو سگک/, 'freeform product text must not enter model prompt');
  assert.doesNotMatch(safeShoePrompt, /Product listing context/, 'legacy context wrapper must be absent');
  assert.match(safeShoePrompt, /do not invent or redesign features/);
  assert.match(safeShoePrompt, /The 3 complementary reference photos show the SAME exact shoe/);
  assert.match(safeShoePrompt, /ONE single, polished, high-detail ecommerce product photograph/);
  assert.match(safeShoePrompt, /not a collage or multi-panel layout/);

  assert.deepEqual(REFERENCE_ROLES, ['front three-quarter view', 'outer side profile', 'rear and heel view']);
  assert.deepEqual(REFERENCE_VIEW_IDS, ['front','side','heel']);
  const singleViewPrompt = promptFor('warm-studio', ['heel']);
  assert.match(singleViewPrompt, /one reference photo/);
  assert.match(singleViewPrompt, /image 0 is the rear and heel view/);
  assert.doesNotMatch(singleViewPrompt, /image 1 is the outer side profile/);

  // Safety filter detection & Cloudflare ID extraction
  const flaggedMessageWithId = 'Your output has been flagged (52766dd9-b65a-4b5f-a9f9-a24871006a01)';
  assert.equal(extractCloudflareId(flaggedMessageWithId), '52766dd9-b65a-4b5f-a9f9-a24871006a01');
  assert.equal(extractCloudflareId('Your output has been flagged با شناسهٔ 52766dd9-b65a-4b5f-a9f9-a24871006a01'), '52766dd9-b65a-4b5f-a9f9-a24871006a01');
  assert.equal(extractCloudflareId('', { errors:[{ id:'52766dd9-b65a-4b5f-a9f9-a24871006a01' }] }), '52766dd9-b65a-4b5f-a9f9-a24871006a01');
  assert(isContentFlagged(flaggedMessageWithId));
  assert(isContentFlagged('', { errors:[{ code:3030, message:'output flagged' }] }));
  assert(!isContentFlagged('Rate limit exceeded', { errors:[{ code:1000 }] }));

  const safetyErr = formatSafetyFlaggedError(flaggedMessageWithId, { errors:[{ code:3030 }] });
  assert.equal(safetyErr.status, 400);
  assert.equal(safetyErr.code, 'CLOUDFLARE_SAFETY_FLAGGED');
  assert.equal(safetyErr.cloudflareId, '52766dd9-b65a-4b5f-a9f9-a24871006a01');
  assert.equal(safetyErr.safetyFlagged, true);
  assert.match(safetyErr.message, /فیلتر ایمنی Cloudflare/);
  assert.match(safetyErr.message, /52766dd9-b65a-4b5f-a9f9-a24871006a01/);
  assert.match(safetyErr.message, /ردشدن فیلتر ایمنی است، نه خطای Supabase/);
  assert.match(safetyErr.message, /نباید راهی برای دورزدن فیلتر اضافه شود/);
  assert.match(safetyErr.message, /سهمیهٔ روزانه محفوظ ماند/);

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
    assert.match(options.body.get('prompt'), /The 3 complementary reference photos show the SAME exact shoe/);
    assert.match(options.body.get('prompt'), /ONE single, polished/);
    assert.equal(options.body.get('width'), '1024');
    assert.equal(options.body.get('height'), '1024');
    for (let index = 0; index < 3; index++) assert.equal(options.body.get(`input_image_${index}`).type, 'image/jpeg');
    return new Response(JSON.stringify({ success:true, result:{ image:Buffer.from('image-test').toString('base64') } }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  try {
    const result = await generateProductPhoto({ imageBytes:[Buffer.from('front'),Buffer.from('side'),Buffer.from('heel')], style:'warm-studio' });
    assert.equal(requested, true);
    assert.equal(result.model, MODEL);
    assert.equal(result.provider, 'Cloudflare Workers AI');
    assert.equal(result.dataUrl, `data:image/png;base64,${Buffer.from('image-test').toString('base64')}`);

    global.fetch = async () => new Response(JSON.stringify({ success:true, result:{ image:Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64') } }), { status:200, headers:{ 'Content-Type':'application/json' } });
    await assert.rejects(() => generateProductPhoto({ imageBytes:[Buffer.from('front'),Buffer.from('side'),Buffer.from('heel')] }), /سقف امن پاسخ سرور/);

    let singlePrompt = '';
    global.fetch = async (_url, options) => {
      singlePrompt = options.body.get('prompt');
      assert(options.body.get('input_image_0'));
      assert.equal(options.body.get('input_image_1'), null);
      return new Response(JSON.stringify({ success:true, result:{ image:Buffer.from('single-image').toString('base64') } }), { status:200, headers:{ 'Content-Type':'application/json' } });
    };
    const oneView = await generateProductPhoto({ imageBytes:[Buffer.from('side')], imageRoles:['side'] });
    assert.equal(oneView.model, MODEL);
    assert.match(singlePrompt, /one reference photo/);
    assert.match(singlePrompt, /image 0 is the outer side profile/);
    await assert.rejects(() => generateProductPhoto({ imageBytes:[] }), /دست‌کم یک/);
    await assert.rejects(() => generateProductPhoto({ imageBytes:[Buffer.from('1'),Buffer.from('2'),Buffer.from('3'),Buffer.from('4')] }), /دست‌کم یک/);

    // Verify Cloudflare flagged safety filter rejection translates into Persian message with Cloudflare ID
    global.fetch = async () => new Response(JSON.stringify({
      success: false,
      errors: [{
        code: 3030,
        message: 'Your output has been flagged (52766dd9-b65a-4b5f-a9f9-a24871006a01)'
      }]
    }), { status: 400, headers:{ 'Content-Type':'application/json' } });

    await assert.rejects(
      () => generateProductPhoto({ imageBytes:[Buffer.from('front')] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.safetyFlagged, true);
        assert.equal(err.cloudflareId, '52766dd9-b65a-4b5f-a9f9-a24871006a01');
        assert.match(err.message, /فیلتر ایمنی Cloudflare/);
        assert.match(err.message, /52766dd9-b65a-4b5f-a9f9-a24871006a01/);
        assert.match(err.message, /ردشدن فیلتر ایمنی است، نه خطای Supabase/);
        assert.match(err.message, /نباید راهی برای دورزدن فیلتر اضافه شود/);
        assert.match(err.message, /سهمیهٔ روزانه محفوظ ماند/);
        return true;
      }
    );

    // Verify raw text flagged response also works
    global.fetch = async () => new Response('Your output has been flagged با شناسهٔ 52766dd9-b65a-4b5f-a9f9-a24871006a01', {
      status: 400,
      headers: { 'Content-Type':'text/plain' }
    });

    await assert.rejects(
      () => generateProductPhoto({ imageBytes:[Buffer.from('front')] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.cloudflareId, '52766dd9-b65a-4b5f-a9f9-a24871006a01');
        return true;
      }
    );
  } finally {
    global.fetch = oldFetch;
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = oldToken;
  }
  console.log('PASS: Cloudflare Workers AI FLUX.2 Klein 9B endpoint, multipart reference editing, product-only prompt and safety filter rejection handling');
}
main().catch(error => { console.error(error); process.exit(1); });

'use strict';
const assert = require('node:assert/strict');
const { MODEL, DEFAULT_MODEL, REFERENCE_ROLES, REFERENCE_VIEW_IDS, promptFor, buildEndpoint, generateProductPhoto } = require('../services/cloudflare-image.js');

async function main() {
  assert.equal(MODEL, '@cf/black-forest-labs/flux-2-klein-9b');
  assert.equal(DEFAULT_MODEL, MODEL);
  assert.equal(buildEndpoint('0123456789abcdef0123456789abcdef'), 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-2-klein-9b');
  assert.throws(() => buildEndpoint('not-an-account-id'), /۳۲ کاراکتری/);
  assert.throws(() => buildEndpoint('0123456789abcdef0123456789abcdef', 'not-a-model'), /مدل Cloudflare/);
  assert.match(promptFor('dark-luxury'), /dark forest-green/);
  assert.match(promptFor('natural-stone'), /natural limestone/);
  assert.match(promptFor('warm-studio', 'کفش چرمی مردانه دو سگک'), /کفش چرمی مردانه دو سگک/);
  assert.match(promptFor('warm-studio', 'کفش چرمی مردانه دو سگک'), /Product listing context/);
  assert.match(promptFor('warm-studio'), /do not invent or redesign features/);
  assert.deepEqual(REFERENCE_ROLES, ['front three-quarter view', 'outer side profile', 'rear and heel view']);
  assert.deepEqual(REFERENCE_VIEW_IDS, ['front','side','heel']);
  const singleViewPrompt=promptFor('warm-studio','',['heel']);
  assert.match(singleViewPrompt,/one reference photo/);
  assert.match(singleViewPrompt,/image 0 is the rear and heel view/);
  assert.doesNotMatch(singleViewPrompt,/image 1 is the outer side profile/);
  const multiReferencePrompt = promptFor('warm-studio', 'کفش طوبی');
  assert.match(multiReferencePrompt, /image 0 is the front three-quarter view/);
  assert.match(multiReferencePrompt, /image 1 is the outer side profile/);
  assert.match(multiReferencePrompt, /image 2 is the rear and heel view/);
  assert.match(multiReferencePrompt, /ONE single, polished, high-detail ecommerce product photograph/);
  assert.match(multiReferencePrompt, /not a collage or multi-panel layout/);

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
    let singlePrompt='';
    global.fetch=async(_url,options)=>{singlePrompt=options.body.get('prompt');assert(options.body.get('input_image_0'));assert.equal(options.body.get('input_image_1'),null);return new Response(JSON.stringify({success:true,result:{image:Buffer.from('single-image').toString('base64')}}),{status:200,headers:{'Content-Type':'application/json'}})};
    const oneView=await generateProductPhoto({imageBytes:[Buffer.from('side')],imageRoles:['side']});
    assert.equal(oneView.model,MODEL);
    assert.match(singlePrompt,/one reference photo/);
    assert.match(singlePrompt,/image 0 is the outer side profile/);
    await assert.rejects(()=>generateProductPhoto({imageBytes:[]}),/دست‌کم یک/);
    await assert.rejects(()=>generateProductPhoto({imageBytes:[Buffer.from('1'),Buffer.from('2'),Buffer.from('3'),Buffer.from('4')]}),/دست‌کم یک/);
  } finally {
    global.fetch = oldFetch;
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = oldToken;
  }
  console.log('PASS: Cloudflare Workers AI FLUX.2 Klein 9B endpoint, multipart reference editing, prompt and validation');
}
main().catch(error => { console.error(error); process.exit(1); });

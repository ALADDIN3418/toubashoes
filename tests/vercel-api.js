'use strict';
const assert = require('node:assert/strict');
const aiStatus = require('../api/ai/status.js');
const productPhoto = require('../api/ai/product-photo.js');
const productImageUpload = require('../api/uploads/product-image.js');
const productDescription = require('../api/ai/describe.js');
const { generateLocalShoeDescription } = require('../app/applet/lib/gemini-describer.js');
const { parseProductReferenceImages, takeWindowQuota, reserveWindowQuota, finishWindowQuota, persistentAiQuotaConfig, reservePersistentAiQuota, finalizePersistentAiQuota } = require('../lib/vercel-api.js');

function response() {
  return {
    statusCode:200, headers:{}, body:'',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; }
  };
}
function payload(res) { return JSON.parse(res.body); }

async function main() {
  const referenceDataUrl=`data:image/jpeg;base64,${Buffer.from([0xff,0xd8,0xff,0x00]).toString('base64')}`;
  assert.equal(parseProductReferenceImages({images:[referenceDataUrl,referenceDataUrl,referenceDataUrl]}).length,3);
  assert.throws(()=>parseProductReferenceImages({images:[referenceDataUrl]}),/سه عکس مرجع/);
  const draft = generateLocalShoeDescription({ name:'کفش نمونه', category:'formal' });
  assert.equal(draft.model,'local-draft');
  assert(draft.shortDesc.length <= 120);
  assert(draft.longDesc.length <= 480);
  assert.doesNotMatch(`${draft.shortDesc} ${draft.longDesc} ${draft.features.join(' ')}`, /چرم طبیعی|طبی ارگونومیک|ضدباکتری|درجه یک|PU/i);
  const informedDraft = generateLocalShoeDescription({ name:'کفش ثبت‌شده', features:['رویه چرم مصنوعی'], specifications:'جنس رویه: چرم مصنوعی' });
  assert(informedDraft.longDesc.length <= 480);
  assert.match(informedDraft.longDesc,/چرم مصنوعی/);
  for (let i=0;i<50;i++) {
    const reservation=reserveWindowQuota('test-ai-cap-50',50,24*60*60*1000);
    assert(reservation);
    assert.equal(finishWindowQuota('test-ai-cap-50',reservation,true),true);
  }
  assert.equal(reserveWindowQuota('test-ai-cap-50',50,24*60*60*1000),null,'blocks successful output 51');
  const failedReservation=reserveWindowQuota('test-ai-failure-release',1,24*60*60*1000);
  assert(finishWindowQuota('test-ai-failure-release',failedReservation,false));
  assert(reserveWindowQuota('test-ai-failure-release',1,24*60*60*1000),'failed generation releases its reservation');
  const oldSupabaseUrl=process.env.SUPABASE_URL,oldServiceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,oldFetch=global.fetch;
  process.env.SUPABASE_URL='https://quota-project.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='server-only-test-key';
  assert(persistentAiQuotaConfig());
  const quotaCalls=[];global.fetch=async(url,options)=>{quotaCalls.push({url,options});return {ok:true,json:async()=>url.endsWith('/reserve_ai_image_quota')?'123e4567-e89b-42d3-a456-426614174000':true}};
  try {
    const reservation=await reservePersistentAiQuota(50);assert.equal(reservation,'123e4567-e89b-42d3-a456-426614174000');
    assert.equal(await finalizePersistentAiQuota(reservation,true),true);
    assert.match(quotaCalls[0].url,/rpc\/reserve_ai_image_quota$/);
    assert.equal(quotaCalls[0].options.headers.apikey,'server-only-test-key');
  } finally {global.fetch=oldFetch;if(oldSupabaseUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldSupabaseUrl;if(oldServiceKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldServiceKey;}
  const oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const oldToken = process.env.CLOUDFLARE_API_TOKEN;
  const oldVercel = process.env.VERCEL;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.VERCEL;
  try {
    let res = response();
    aiStatus({ method:'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).configured, false);
    assert.equal(payload(res).provider, 'Cloudflare Workers AI');
    assert.equal(payload(res).model, '@cf/black-forest-labs/flux-2-klein-9b');
    assert.equal(payload(res).localDailyLimit, 50);
    assert.equal(payload(res).quotaMode, 'process-memory');

    process.env.CLOUDFLARE_ACCOUNT_ID='0123456789abcdef0123456789abcdef';
    process.env.CLOUDFLARE_API_TOKEN='test-only-token';
    process.env.VERCEL='1';
    res = response();
    await productPhoto({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{ images:[referenceDataUrl,referenceDataUrl,referenceDataUrl] } }, res);
    assert.equal(res.statusCode, 503);
    assert.match(payload(res).error, /سهمیه/);
    delete process.env.VERCEL;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    res = response();
    await productPhoto({ method:'GET', headers:{} }, res);
    assert.equal(res.statusCode, 405);

    res = response();
    await productPhoto({ method:'POST', headers:{}, body:{} }, res);
    assert.equal(res.statusCode, 403);

    res = response();
    await productPhoto({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{} }, res);
    assert.equal(res.statusCode, 503);

    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${tinyJpeg}`;
    res = response();
    productImageUpload({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{ image:dataUrl } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(payload(res).url, dataUrl);
    assert.equal(payload(res).storage, 'browser-local');

    res = response();
    await productDescription({ method:'GET', headers:{} }, res);
    assert.equal(res.statusCode, 405);

    res = response();
    await productDescription({ method:'POST', headers:{}, body:{} }, res);
    assert.equal(res.statusCode, 403);

    res = response();
    await productDescription({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{ name:'کفش تبریز چرم', category:'formal' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(typeof payload(res).shortDesc, 'string');
    assert.equal(typeof payload(res).longDesc, 'string');
  } finally {
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = oldToken;
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
  }
  console.log('PASS: Vercel function endpoints, same-origin checks and ephemeral upload behavior');
}
main().catch(error => { console.error(error); process.exit(1); });

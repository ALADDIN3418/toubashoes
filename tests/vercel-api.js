'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const aiStatus = require('../api/ai/status.js');
const productPhoto = require('../api/ai/product-photo.js');
const productDescription = require('../api/ai/describe.js');
const { generateLocalShoeDescription } = require('../app/applet/lib/gemini-describer.js');
const { parseProductReferenceImages, parseProductReferenceRoles, takeWindowQuota, reserveWindowQuota, finishWindowQuota, persistentAiQuotaConfig, requireAdminRequest, reservePersistentAiQuota, finalizePersistentAiQuota } = require('../lib/vercel-api.js');

function response() {
  return {
    statusCode:200, headers:{}, body:'',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; }
  };
}
function payload(res) { return JSON.parse(res.body); }

async function main() {
  const quotaCompatibilityMigration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609300001_daily_ai_image_quota_rpc_compat.sql'),'utf8');
  assert.match(quotaCompatibilityMigration,/function public\.reserve_ai_image_quota\(\)/);
  assert.match(quotaCompatibilityMigration,/successful_count \+ reserved_count < 50/);
  assert.match(quotaCompatibilityMigration,/notify pgrst, 'reload schema'/i);
  const referenceDataUrl=`data:image/jpeg;base64,${Buffer.from([0xff,0xd8,0xff,0x00]).toString('base64')}`;
  assert.equal(parseProductReferenceImages({image:referenceDataUrl}).length,1,'one clear image is supported');
  assert.equal(parseProductReferenceImages({images:[referenceDataUrl]}).length,1,'array format with one image is supported');
  assert.deepEqual(parseProductReferenceRoles({imageRoles:['front']},1),['front']);
  assert.throws(()=>parseProductReferenceImages({images:[]}),/یک تصویر واضح/);
  assert.throws(()=>parseProductReferenceImages({images:[referenceDataUrl,referenceDataUrl,referenceDataUrl,referenceDataUrl]}),/یک تصویر واضح/);
  assert.throws(()=>parseProductReferenceRoles({imageRoles:['side','side']},2),/زاویهٔ یکتا/);
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
  const oldSupabaseUrl=process.env.SUPABASE_URL,oldPublicKey=process.env.SUPABASE_PUBLISHABLE_KEY,oldAnonKey=process.env.SUPABASE_ANON_KEY,oldServiceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,oldFetch=global.fetch;
  process.env.SUPABASE_URL='https://quota-project.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='publishable-test-key';
  assert(persistentAiQuotaConfig());
  const quotaCalls=[];global.fetch=async(url,options)=>{quotaCalls.push({url:String(url),options});if(String(url).endsWith('/auth/v1/user'))return{ok:true,json:async()=>({id:'00000000-0000-0000-0000-000000000001'})};if(String(url).includes('/rest/v1/profiles?'))return{ok:true,json:async()=>[{id:'00000000-0000-0000-0000-000000000001',role:'super_admin',is_active:true}]};return {ok:true,json:async()=>String(url).endsWith('/reserve_ai_image_quota')?'123e4567-e89b-42d3-a456-426614174000':true}};
  try {
    const authContext=await requireAdminRequest({headers:{authorization:'Bearer 0123456789abcdefghijklmnopqrstuv'}});
    const reservation=await reservePersistentAiQuota(50,authContext);assert.equal(reservation,'123e4567-e89b-42d3-a456-426614174000');
    assert.equal(await finalizePersistentAiQuota(reservation,true,authContext),true);
    assert.match(quotaCalls[2].url,/rpc\/reserve_ai_image_quota$/);
    assert.deepEqual(JSON.parse(quotaCalls[2].options.body),{},'reserve RPC relies on its fixed SQL default and avoids a stale p_limit argument signature');
    assert.equal(quotaCalls[2].options.headers.apikey,'publishable-test-key');
    global.fetch=async(url)=>String(url).includes('/rpc/reserve_ai_image_quota')?{ok:false,status:404,text:async()=>JSON.stringify({code:'PGRST202',message:'function not found'})}:{ok:true,json:async()=>true};
    await assert.rejects(()=>reservePersistentAiQuota(50,authContext),/PGRST202.*Migrationهای سهمیه/);
    assert.match(quotaCalls[2].options.headers.Authorization,/Bearer 0123456789/);
  } finally {global.fetch=oldFetch;if(oldSupabaseUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldSupabaseUrl;if(oldPublicKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldPublicKey;if(oldAnonKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=oldAnonKey;if(oldServiceKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldServiceKey;}
  const oldVercel = process.env.VERCEL;
  const oldPuter = globalThis.puter;
  delete process.env.VERCEL;
  try {
    let res = response();
    await aiStatus({ method:'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).configured, true);
    assert.equal(payload(res).keyless, true);
    assert.equal(payload(res).unlimited, false);
    assert.equal(payload(res).free, false);
    assert.equal(payload(res).provider, 'Puter.js · چرخش خودکار مدل‌ها');
    assert.equal(payload(res).model, 'puter-auto');
    assert(Array.isArray(payload(res).supportedModels));
    assert(payload(res).supportedModels.includes('puter-auto'));
    assert(payload(res).puterImageModels.some(model => model.id === 'openai/gpt-image-2.5-flare'));
    assert(!payload(res).puterImageModels.some(model => /gemini/i.test(model.id)));

    process.env.SUPABASE_URL='https://quota-project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='publishable-test-key';
    process.env.VERCEL='1';
    res = response();
    await productPhoto({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{ images:[referenceDataUrl] } }, res);
    assert.equal(res.statusCode, 401);
    assert.match(payload(res).error, /وارد شوید/);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.VERCEL;

    res = response();
    await productPhoto({ method:'GET', headers:{} }, res);
    assert.equal(res.statusCode, 405);

    res = response();
    await productPhoto({ method:'POST', headers:{}, body:{} }, res);
    assert.equal(res.statusCode, 403);

    // The legacy server adapter is tested with a Puter SDK stub; the studio UI calls Puter.js directly.
    globalThis.puter = { ai: { async txt2img(_prompt, options) {
      assert.equal(options.model, 'openai/gpt-image-2.5-flare');
      assert.equal(options.input_images.length, 1);
      return { src: 'data:image/png;base64,bmV3IGltYWdl' };
    } } };
    res = response();
    await productPhoto({
      method: 'POST',
      headers: { origin: 'https://touba.test', host: 'touba.test' },
      body: { image: referenceDataUrl, style: 'warm-studio', pipeline: 'puter-auto' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).success, true);
    assert.equal(payload(res).pipeline, 'puter-auto');
    assert.equal(payload(res).model, 'openai/gpt-image-2.5-flare');
    assert.equal(payload(res).style, 'warm-studio');
    assert.match(payload(res).provider, /Puter\.js/);

    // Verify productPhoto handles invalid input gracefully
    res = response();
    await productPhoto({
      method: 'POST',
      headers: { origin: 'https://touba.test', host: 'touba.test' },
      body: { image: '' }
    }, res);
    assert.equal(res.statusCode, 400);
    assert(payload(res).error);

    assert.equal(fs.existsSync(path.join(__dirname,'../api/uploads/product-image.js')),false,'ephemeral/browser-local image upload endpoint is removed');
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../local-server.js'),'utf8'),/productImageSaveTimes|storage:'browser-local'/,'local server cannot return ephemeral product-image storage');

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
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
    if (oldSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupabaseUrl;
    if (oldPublicKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldPublicKey;
    if (oldPuter === undefined) delete globalThis.puter; else globalThis.puter = oldPuter;
  }
  console.log('PASS: Vercel function endpoints, same-origin checks, Supabase-backed image-storage policy, and no ephemeral upload route');
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });

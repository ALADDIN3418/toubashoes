/* ZarinPal API v4 integration tests: request, server callback/verify, signed receipt, and safe handlers. */
const assert=require('node:assert/strict');
const ZarinPal=require('../lib/zarinpal.js');
const crypto=require('node:crypto');

// Ephemeral test-only values: the stubbed fetch below never contacts ZarinPal.
const merchantId=crypto.randomUUID();
const stateSecret=crypto.randomBytes(32).toString('hex');
const env={ZARINPAL_MODE:'sandbox',ZARINPAL_MERCHANT_ID:merchantId,ZARINPAL_STATE_SECRET:stateSecret};
const fixedNow=Date.UTC(2026,9,2,10,0,0);
const requestAuthority='A12345678901234567890123456789012';
const req={method:'POST',headers:{origin:'https://shop.example.test',host:'shop.example.test'}};

function response(payload,status=200){return{ok:status>=200&&status<300,status,json:async()=>payload}}
function makeRes(){return{statusCode:200,headers:{},body:'',setHeader(key,value){this.headers[key]=value},end(body=''){this.body=body}}}
function parseBody(res){return JSON.parse(res.body||'{}')}

(async()=>{
  let calls=[];
  const requested=await ZarinPal.createPaymentRequest({
    body:{orderId:'TB-ORDER-001',amountToman:250000,phone:'۰۹۱۲۳۴۵۶۷۸۹'},
    req,env,origin:'https://shop.example.test',now:()=>fixedNow,
    fetchImpl:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return response({data:{code:100,authority:requestAuthority}});
    }
  });
  assert.equal(requested.success,true);
  assert.equal(requested.provider,'zarinpal');
  assert.equal(requested.amountToman,250000);
  assert.equal(requested.amountRial,2500000);
  assert.equal(requested.paymentUrl,`https://sandbox.zarinpal.com/pg/StartPay/${requestAuthority}`);
  assert.equal(calls[0].url,'https://sandbox.zarinpal.com/pg/v4/payment/request.json');
  assert.equal(calls[0].body.amount,2500000);
  assert.equal(calls[0].body.merchant_id,merchantId);
  assert.equal(calls[0].body.metadata.order_id,'TB-ORDER-001');
  assert.equal(calls[0].body.metadata.mobile,'09123456789');
  const callbackUrl=new URL(calls[0].body.callback_url);
  assert.equal(callbackUrl.pathname,ZarinPal.CALLBACK_PATH);
  const state=callbackUrl.searchParams.get('state');
  assert(state);

  let verifyCalls=0;
  const callback=await ZarinPal.processCallback({
    query:{Status:'OK',Authority:requestAuthority,state},env,now:()=>fixedNow+1000,
    fetchImpl:async(url,options)=>{
      verifyCalls+=1;
      assert.equal(url,'https://sandbox.zarinpal.com/pg/v4/payment/verify.json');
      assert.deepEqual(JSON.parse(options.body),{merchant_id:merchantId,amount:2500000,authority:requestAuthority});
      return response({data:{code:100,ref_id:99887766}});
    }
  });
  assert.equal(callback.statusCode,303);
  assert.equal(callback.outcome,'paid');
  const successUrl=new URL(callback.location,'https://shop.example.test');
  assert.equal(successUrl.pathname,'/payment/result/TB-ORDER-001');
  const receiptToken=successUrl.searchParams.get('receipt');
  const receipt=await ZarinPal.verifyReceipt({token:receiptToken,orderId:'TB-ORDER-001',env,now:()=>fixedNow+2000});
  assert.equal(receipt.success,true);
  assert.equal(receipt.outcome,'paid');
  assert.equal(receipt.referenceId,'99887766');
  assert.equal(receipt.amountToman,250000);
  assert.equal(receipt.authority,requestAuthority);
  assert.equal(verifyCalls,1);

  const tampered=receiptToken.slice(0,-1)+(receiptToken.endsWith('a')?'b':'a');
  await assert.rejects(()=>ZarinPal.verifyReceipt({token:tampered,orderId:'TB-ORDER-001',env,now:()=>fixedNow+2000}),/امضای وضعیت پرداخت معتبر نیست/);
  await assert.rejects(()=>ZarinPal.verifyReceipt({token:receiptToken,orderId:'TB-OTHER-001',env,now:()=>fixedNow+2000}),/رسید پرداخت با سفارش هم‌خوانی ندارد/);

  const cancelled=await ZarinPal.processCallback({query:{Status:'NOK',state},env,now:()=>fixedNow+1000,fetchImpl:async()=>{throw new Error('should not verify cancellation')}});
  assert.equal(cancelled.outcome,'cancelled');
  const cancelledToken=new URL(cancelled.location,'https://shop.example.test').searchParams.get('receipt');
  const cancelledReceipt=await ZarinPal.verifyReceipt({token:cancelledToken,orderId:'TB-ORDER-001',env,now:()=>fixedNow+2000});
  assert.equal(cancelledReceipt.outcome,'cancelled');
  assert.equal(cancelledReceipt.authority,'');

  const pending=await ZarinPal.processCallback({
    query:{Status:'OK',Authority:requestAuthority,state},env,now:()=>fixedNow+1000,
    fetchImpl:async()=>{throw new Error('temporary network outage')}
  });
  assert.equal(pending.outcome,'pending');
  const pendingToken=new URL(pending.location,'https://shop.example.test').searchParams.get('receipt');
  const retried=await ZarinPal.verifyReceipt({
    token:pendingToken,orderId:'TB-ORDER-001',env,now:()=>fixedNow+2000,
    fetchImpl:async()=>response({data:{code:101,ref_id:99887766}})
  });
  assert.equal(retried.outcome,'paid');
  assert.equal(retried.providerCode,'101');

  const idempotent=await ZarinPal.verifyWithZarinpal({authority:requestAuthority,amountToman:250000,env,fetchImpl:async()=>response({data:{code:101,ref_id:99887766}})});
  assert.equal(idempotent.outcome,'paid');
  assert.equal(idempotent.providerCode,'101');
  await assert.rejects(()=>ZarinPal.createPaymentRequest({body:{orderId:'TB-ORDER-002',amountToman:999,phone:''},req,env,now:()=>fixedNow,fetchImpl:async()=>{throw new Error('must not fetch')}}),/حداقل مبلغ/);
  await assert.rejects(()=>ZarinPal.createPaymentRequest({body:{orderId:'TB-ORDER-003',amountToman:250000},req,origin:'https://attacker.example.test',env,now:()=>fixedNow,fetchImpl:async()=>{throw new Error('must not fetch')}}),/مبدأ درخواست با دامنه/);
  await assert.rejects(()=>ZarinPal.createPaymentRequest({body:{orderId:'TB-ORDER-004',amountToman:250000},req,env:{...env,ZARINPAL_MODE:'production'},now:()=>fixedNow,fetchImpl:async()=>{throw new Error('production must stay blocked')}}),error=>error.status===503&&/منبع پایدار سمت سرور/.test(error.message));

  assert.equal(ZarinPal.getConfig({...env,ZARINPAL_MODE:'not-a-mode'}).configured,false);
  assert.equal(ZarinPal.getConfig({...env,ZARINPAL_MODE:'not-a-mode'}).mode,'sandbox');

  const envKeys=['ZARINPAL_MODE','ZARINPAL_MERCHANT_ID','ZARINPAL_STATE_SECRET'];
  const savedEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const savedFetch=global.fetch;
  try{
    Object.assign(process.env,env);
    global.fetch=async(url,options)=>{
      assert.equal(url,'https://sandbox.zarinpal.com/pg/v4/payment/request.json');
      assert.equal(JSON.parse(options.body).amount,100000);
      return response({data:{code:100,authority:requestAuthority}});
    };
    const statusRes=makeRes();
    ZarinPal.status({method:'GET'},statusRes);
    const status=parseBody(statusRes);
    assert.equal(status.configured,true);
    assert.equal(status.paymentEnabled,true);
    assert.equal(status.liveCheckoutSafe,false);
    assert(!JSON.stringify(status).includes(merchantId));
    const apiRes=makeRes();
    await ZarinPal.request({method:'POST',headers:req.headers,body:{orderId:'TB-API-001',amountToman:10000}},apiRes);
    assert.equal(apiRes.statusCode,200);
    assert.equal(parseBody(apiRes).amountRial,100000);
    const rejectedRes=makeRes();
    await ZarinPal.request({method:'POST',headers:{origin:'https://evil.test',host:'shop.example.test'},body:{orderId:'TB-API-002',amountToman:10000}},rejectedRes);
    assert.equal(rejectedRes.statusCode,403);
  }finally{
    for(const key of envKeys){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key]}
    if(savedFetch===undefined)delete global.fetch;else global.fetch=savedFetch;
  }
  console.log('PASS: ZarinPal v4 sandbox request, IRR conversion, same-origin API, signed callback/receipt, cancellation, retry, code 101, and production-payment guard');
})().catch(error=>{console.error(error);process.exit(1)});

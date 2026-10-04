/* Bale Pay (بله‌پی) integration tests: invoice payload, createInvoiceLink, pre-checkout,
 * successful payment settlement, inquireTransaction verification and the server handlers.
 * Everything is stubbed — no request leaves this machine. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const BalePay=require('../lib/balepay.js');

const botToken='123456789:abcdIuZmK5qNEm2A1BhUaAg7MPJv1O9KCcBQB2ro';
const stateSecret=crypto.randomBytes(32).toString('hex');
const env={
  BALEPAY_MODE:'sandbox',
  BALEPAY_BOT_TOKEN:botToken,
  BALEPAY_PROVIDER_TOKEN:'WALLET-TEST-1111111111111111',
  BALEPAY_STATE_SECRET:stateSecret,
  BALEPAY_BOT_USERNAME:'touba_shoes_bot'
};
const fixedNow=Date.UTC(2026,9,4,10,0,0);
const orderId='20000000-0000-4000-8000-000000000002';
const paymentId='30000000-0000-4000-8000-000000000003';
const userId='10000000-0000-4000-8000-000000000001';
const amountToman=125000;
const amountRial=amountToman*10;
const transactionId='tx_9f8e7d6c5b4a';
const req={method:'POST',headers:{origin:'https://shop.example.test',host:'shop.example.test'}};
const dbConfig={baseUrl:'https://commerce-test.supabase.co',publicKey:'publishable-test-key',serviceRoleKey:'service-role-test-key',configured:true,serviceConfigured:true};

function response(payload,status=200){return{ok:status>=200&&status<300,status,json:async()=>payload,text:async()=>typeof payload==='string'?payload:JSON.stringify(payload)}}
function baleOk(result){return response({ok:true,result})}
function baleError(error_code,description){return response({ok:false,error_code,description},400)}
function makeRes(){return{statusCode:200,headers:{},body:'',setHeader(key,value){this.headers[key]=value},end(body=''){this.body=body}}}
function parseBody(res){return JSON.parse(res.body||'{}')}

function paymentRow(overrides={}){
  return {id:paymentId,order_id:orderId,status:'pending',amount_toman:amountToman,authority:null,provider:'balepay',provider_reference:null,provider_code:null,callback_payload:null,...overrides};
}
function orderRow(overrides={}){
  return {id:orderId,user_id:userId,status:'pending_payment',total_toman:amountToman,number:'TB-TEST-0001',...overrides};
}

// یک fetch مشترک که هم tapi.bale.ai و هم Supabase REST را تقلید می‌کند.
function makeFetch(state,baleHandlers){
  return async(url,options={})=>{
    const target=String(url);
    state.urls.push(target);
    if(target.includes('/bot'+botToken+'/')){
      const method=target.split('/').pop();
      const body=JSON.parse(options.body||'{}');
      state.bale.push({method,body});
      const handler=baleHandlers[method];
      if(!handler)throw new Error(`Unexpected Bale method: ${method}`);
      return handler(body,state);
    }
    if(target.includes('/rest/v1/rpc/')){state.rpc.push({name:target.split('/rpc/')[1].split('?')[0],body:JSON.parse(options.body||'{}')});return response({success:true})}
    if(target.includes('/rest/v1/payments?')){
      const query=new URL(target).searchParams;
      assert.equal(query.get('provider'),'eq.balepay','payments must be scoped to the Bale Pay provider row');
      if(state.payments&&state.payments.length&&String(query.get('authority')||'').startsWith('eq.')){
        const wanted=query.get('authority').slice(3);
        const payment=state.payments.find(row=>row.authority===wanted);
        return response(payment?[{...payment,orders:[state.order||orderRow()]}]:[]);
      }
      return response(state.payments||[]);
    }
    if(target.includes('/rest/v1/orders?'))return response([state.order||orderRow()]);
    if(target.includes('/auth/v1/user'))return response({id:userId});
    if(target.includes('/rest/v1/profiles?'))return response([{id:userId,role:'customer',is_active:true}]);
    throw new Error(`Unexpected mocked fetch: ${target}`);
  };
}

(async()=>{
  const state={urls:[],bale:[],rpc:[]};
  const invoiceParams=`https://ble.ir/pay/${crypto.randomBytes(12).toString('hex')}`;
  const fetchImpl=makeFetch(state,{
    createInvoiceLink:body=>{
      assert.equal(body.provider_token,env.BALEPAY_PROVIDER_TOKEN);
      assert.equal(body.prices.length,1);
      assert.equal(body.prices[0].amount,amountRial,'Bale prices must be an integer in IRR');
      assert(Buffer.byteLength(body.payload,'utf8')<=BalePay.INVOICE_PAYLOAD_LIMIT,'invoice payload must stay within 128 bytes');
      assert(body.title.length<=32&&body.description.length<=255,'invoice copy must respect Bale length limits');
      return response({ok:true,result:invoiceParams});
    },
    answerPreCheckoutQuery:()=>baleOk(true),
    inquireTransaction:body=>{
      assert.equal(body.transaction_id,transactionId);
      return baleOk({id:transactionId,status:'paid',amount:amountRial,userID:4242,createdAt:Math.floor(fixedNow/1000)});
    },
    getWebhookInfo:()=>baleOk({url:''})
  });

  /* 1) invoice creation through createInvoiceLink + deterministic authority */
  const config=BalePay.getConfig(env);
  assert.equal(config.configured,true);
  assert.equal(config.providerTokenKind,'test');
  const intent=BalePay.createPaymentIntent;
  const created=await intent({body:{orderId,amountToman},req,origin:'https://shop.example.test',env,now:()=>fixedNow,fetchImpl});
  assert.equal(created.success,true);
  assert.equal(created.provider,'balepay');
  assert.equal(created.invoice,invoiceParams);
  assert.equal(created.openMode,'url');
  assert.equal(created.paymentUrl,invoiceParams);
  assert.equal(created.amountRial,amountRial);
  assert.match(created.authority,/^blp_[0-9a-f]{32}$/);
  assert.equal(created.miniAppUrl,`https://ble.ir/touba_shoes_bot?startapp=pay:${orderId}`);
  const baleCall=state.bale.find(x=>x.method==='createInvoiceLink');
  assert.equal(baleCall.body.payload.split('.')[0],created.intent,'payload intent must be the authority suffix');
  assert.equal(state.urls[0],`https://tapi.bale.ai/bot${botToken}/createInvoiceLink`);
  assert(!state.urls.some(url=>url.includes('Authorization')));

  /* 2) signed payload round-trip and tamper protection */
  const parsed=BalePay.readInvoicePayload(baleCall.body.payload,env.BALEPAY_STATE_SECRET,fixedNow+1000);
  assert.equal(parsed.authority,created.authority);
  const tampered=baleCall.body.payload.slice(0,-1)+(baleCall.body.payload.endsWith('a')?'b':'a');
  assert.throws(()=>BalePay.readInvoicePayload(tampered,env.BALEPAY_STATE_SECRET,fixedNow+1000),/امضای صورتحساب بله معتبر نیست/);
  assert.throws(()=>BalePay.readInvoicePayload('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.1.2.3',env.BALEPAY_STATE_SECRET,fixedNow),/پیام‌رسان صورتحساب بله معتبر نیست/);
  assert.throws(()=>BalePay.readInvoicePayload(baleCall.body.payload,env.BALEPAY_STATE_SECRET,fixedNow+7*24*60*60*1000),/مهلت اعتبار/);

  /* 3) pre_checkout_query: verified against the database, then answered and recorded */
  const payments=[paymentRow({authority:created.authority})];
  const preCheckoutState={urls:[],bale:[],rpc:[],payments,order:orderRow()};
  const preCheckoutFetch=makeFetch(preCheckoutState,{answerPreCheckoutQuery:()=>baleOk(true)});
  const accepted=await BalePay.handleUpdate({
    update:{update_id:1,pre_checkout_query:{id:transactionId,from:{id:4242},currency:'IRR',total_amount:amountRial,invoice_payload:baleCall.body.payload}},
    env,dbConfig,fetchImpl:preCheckoutFetch,now:()=>fixedNow+1000
  });
  assert.deepEqual(accepted,{handled:true,reason:'pre_checkout_accepted',orderId,transactionId});
  assert.deepEqual(preCheckoutState.bale[0],{method:'answerPreCheckoutQuery',body:{pre_checkout_query_id:transactionId,ok:true}});
  assert.deepEqual(preCheckoutState.rpc[0],{name:'attach_balepay_invoice',body:{p_order_id:orderId,p_authority:created.authority,p_transaction_id:transactionId}});

  /* 4) a wrong amount must be rejected to the shopper instead of accepting the charge */
  const badState={urls:[],bale:[],rpc:[],payments,order:orderRow()};
  const badFetch=makeFetch(badState,{answerPreCheckoutQuery:()=>baleOk(true)});
  const rejected=await BalePay.handleUpdate({
    update:{update_id:2,pre_checkout_query:{id:'tx_wrongamount',currency:'IRR',total_amount:amountRial+10,invoice_payload:baleCall.body.payload}},
    env,dbConfig,fetchImpl:badFetch,now:()=>fixedNow+1000
  });
  assert.equal(rejected.reason,'pre_checkout_rejected');
  assert.equal(badState.bale[0].body.ok,false);
  assert(badState.bale[0].body.error_message.length>0);
  assert.equal(badState.rpc.length,0,'a rejected pre-checkout must not write anything');

  /* 5) successful_payment: only inquireTransaction can settle the order */
  const paidState={urls:[],bale:[],rpc:[],payments,order:orderRow()};
  const paidFetch=makeFetch(paidState,{
    answerPreCheckoutQuery:()=>baleOk(true),
    inquireTransaction:()=>baleOk({id:transactionId,status:'paid',amount:amountRial,userID:4242,createdAt:Math.floor(fixedNow/1000)})
  });
  const settled=await BalePay.handleUpdate({
    update:{update_id:3,message:{message_id:77,from:{id:4242},successful_payment:{currency:'IRR',total_amount:amountRial,invoice_payload:baleCall.body.payload,telegram_payment_charge_id:transactionId,provider_payment_charge_id:'700123456789'}}},
    env,dbConfig,fetchImpl:paidFetch,now:()=>fixedNow+2000
  });
  assert.equal(settled.reason,'payment_settled');
  const settleRpc=paidState.rpc.find(x=>x.name==='settle_balepay_payment');
  assert.ok(settleRpc,'settlement must go through settle_balepay_payment');
  assert.equal(settleRpc.body.p_order_id,orderId);
  assert.equal(settleRpc.body.p_authority,created.authority);
  assert.equal(settleRpc.body.p_outcome,'paid');
  assert.equal(settleRpc.body.p_amount_toman,amountToman);
  assert.equal(settleRpc.body.p_reference_id,'700123456789');
  assert.equal(settleRpc.body.p_callback_payload.baleStatus,'paid');

  /* 6) an update claiming "paid" while Bale says pending must not settle anything */
  const lyingState={urls:[],bale:[],rpc:[],payments,order:orderRow()};
  const lyingFetch=makeFetch(lyingState,{inquireTransaction:()=>baleOk({id:transactionId,status:'pending',amount:amountRial})});
  const pendingUpdate=await BalePay.handleUpdate({
    update:{update_id:4,message:{successful_payment:{currency:'IRR',total_amount:amountRial,invoice_payload:baleCall.body.payload,telegram_payment_charge_id:transactionId}}},
    env,dbConfig,fetchImpl:lyingFetch,now:()=>fixedNow+3000
  });
  assert.equal(pendingUpdate.reason,'pending');
  assert.equal(lyingState.rpc.length,0);

  /* 7) amount mismatch on inquiry is refused even if the client reports success */
  await assert.rejects(()=>BalePay.inquireTransaction({config,transactionId,expectedAmountRial:amountRial+500,fetchImpl:makeFetch({urls:[],bale:[],rpc:[]},{inquireTransaction:()=>baleOk({id:transactionId,status:'paid',amount:amountRial})})}),/هم‌خوانی ندارد/);

  /* 8) receipt polling settles from a transaction id captured during pre-checkout */
  const receiptState={urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow({authority:created.authority,provider_reference:transactionId})]};
  const receiptFetch=makeFetch(receiptState,{inquireTransaction:()=>baleOk({id:transactionId,status:'paid',amount:amountRial,userID:4242})});
  const status=await BalePay.settleStatus({orderId,config,dbConfig:{...dbConfig},fetchImpl:receiptFetch,now:()=>fixedNow+4000});
  assert.equal(status.outcome,'paid');
  assert.equal(status.provider,'balepay');
  assert.equal(status.referenceId,transactionId);
  assert.equal(status.waitingForWebhook,false);
  assert(status.receipt&&status.receipt.length>40,'a signed receipt token must be returned');
  assert.ok(receiptState.rpc.some(x=>x.name==='settle_balepay_payment'));
  const verified=await BalePay.settleStatus({orderId,config,dbConfig,fetchImpl:makeFetch({urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow({authority:created.authority,provider_reference:transactionId,status:'verified',provider_code:'paid',callback_payload:{outcome:'paid'}})]},{}),now:()=>fixedNow+5000});
  assert.equal(verified.outcome,'paid');
  const waiting=await BalePay.settleStatus({orderId,config,dbConfig,fetchImpl:makeFetch({urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow({authority:created.authority})]},{}),now:()=>fixedNow+5000});
  assert.equal(waiting.outcome,'pending');
  assert.equal(waiting.waitingForWebhook,true,'without a Bale transaction id the storefront must keep waiting for the webhook');
  await assert.rejects(()=>BalePay.settleStatus({orderId,config,dbConfig,fetchImpl:makeFetch({urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow()]},{}),now:()=>fixedNow+5000}),/صورتحساب بله‌پی ندارد/);

  /* 9) signed receipt token: amount and order must match the persisted order */
  const receiptToken=status.receipt;
  const decoded=BalePay.readReceipt(receiptToken,config,fixedNow+6000);
  assert.equal(decoded.orderId,orderId);
  assert.equal(decoded.amountToman,amountToman);
  assert.equal(decoded.intent,created.intent);
  await assert.rejects(()=>BalePay.settleStatus({orderId,expectedAmountToman:amountToman-1,config,dbConfig,fetchImpl:makeFetch({urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow({authority:created.authority})]},{}),now:()=>fixedNow+6000}),/مبلغ رسید با سفارش/);

  /* 10) gateway configuration guard rails */
  assert.equal(BalePay.getConfig({...env,BALEPAY_MODE:'not-a-mode'}).mode,'sandbox');
  assert.equal(BalePay.getConfig({...env,BALEPAY_MODE:'not-a-mode'}).configured,false,'an unknown mode must fail closed');
  assert.equal(BalePay.getConfig({...env,BALEPAY_BOT_TOKEN:'garbage'}).configured,false);
  assert.match(BalePay.configurationError(BalePay.getConfig({...env,BALEPAY_BOT_TOKEN:'garbage'})).message,/BALEPAY_BOT_TOKEN/);
  assert.equal(BalePay.getConfig({...env,BALEPAY_MODE:'production'}).livePaymentsAllowed,false);
  assert.match(BalePay.productionGateError(BalePay.getConfig({...env,BALEPAY_MODE:'production'})).message,/BALEPAY_ENABLE_LIVE_PAYMENTS/);
  const productionTest=BalePay.getConfig({...env,BALEPAY_MODE:'production',BALEPAY_ENABLE_LIVE_PAYMENTS:'true'});
  assert.match(BalePay.productionGateError(productionTest).message,/توکن پرداخت واقعی/);
  const productionLive=BalePay.getConfig({...env,BALEPAY_MODE:'production',BALEPAY_ENABLE_LIVE_PAYMENTS:'true',BALEPAY_PROVIDER_TOKEN:'WALLET-1q2w3e4r5t6y7u8i'});
  assert.equal(productionLive.sandbox,false);
  assert.equal(productionLive.livePaymentsAllowed,true);
  assert.equal(productionMiniApp(),true);
  await assert.rejects(()=>intent({body:{orderId,amountToman:999},req,env,origin:'https://shop.example.test',now:()=>fixedNow,fetchImpl}),/حداقل مبلغ/);
  await assert.rejects(()=>intent({body:{orderId,amountToman},req,origin:'https://attacker.example.test',env,now:()=>fixedNow,fetchImpl:()=>{throw new Error('must not fetch')}}),/مبدأ درخواست با دامنه/);
  await assert.rejects(()=>intent({body:{orderId,amountToman},req,env:{...env,BALEPAY_MODE:'production'},origin:'https://shop.example.test',now:()=>fixedNow,fetchImpl:()=>{throw new Error('production must stay blocked')}}),error=>error.status===503&&/BALEPAY_ENABLE_LIVE_PAYMENTS/.test(error.message));

  /* 11) extractInvoiceParams accepts both documented shapes; sendInvoice validates chat ids */
  assert.equal(BalePay.extractInvoiceParams('https://x.test/i'),'https://x.test/i');
  assert.equal(BalePay.extractInvoiceParams({result:'abc-_123'}),'abc-_123');
  assert.equal(BalePay.extractInvoiceParams({url:'https://y.test/pay'}),'https://y.test/pay');
  assert.equal(BalePay.extractInvoiceParams({}),'');
  await assert.rejects(()=>BalePay.sendInvoiceMessage({config,chatId:'not a chat',orderId,amountRial,fetchImpl}),/گفتگوی بله/);
  const chatSend=await BalePay.sendInvoiceMessage({config,chatId:'@touba_shoes_bot',orderId,orderNumber:'TB-7',amountRial,now:()=>fixedNow,fetchImpl:makeFetch({urls:[],bale:[],rpc:[]},{sendInvoice:body=>{assert.equal(body.chat_id,'@touba_shoes_bot');assert.equal(body.amount,undefined,'total comes from prices');return baleOk({message_id:5})}})});
  assert.equal(chatSend.message.message_id,5);

  /* 12) HTTP handlers: status never leaks secrets, webhook is not a browser endpoint */
  const envKeys=['BALEPAY_MODE','BALEPAY_BOT_TOKEN','BALEPAY_PROVIDER_TOKEN','BALEPAY_STATE_SECRET','BALEPAY_BOT_USERNAME','BALEPAY_REQUIRE_WEBHOOK_SECRET','BALEPAY_WEBHOOK_SECRET','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const savedEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const savedFetch=global.fetch;
  try{
    Object.assign(process.env,{...env,SUPABASE_URL:'https://commerce-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test-key',SUPABASE_SERVICE_ROLE_KEY:'service-role-test-key'});
    // رکورد پرداخت با شناسهٔ تراکنش ثبت‌شده توسط وب‌هوک: مسیر receipt باید استعلام و نهایی‌سازی کند.
    const liveFetch=makeFetch({urls:[],bale:[],rpc:[],order:orderRow(),payments:[paymentRow({authority:created.authority,provider_reference:transactionId})]},{
      createInvoiceLink:()=>baleOk(invoiceParams),
      answerPreCheckoutQuery:()=>baleOk(true),
      inquireTransaction:()=>baleOk({id:transactionId,status:'paid',amount:amountRial})
    });
    global.fetch=liveFetch;
    const statusRes=makeRes();
    BalePay.status({method:'GET'},statusRes);
    const statusBody=parseBody(statusRes);
    assert.equal(statusBody.configured,true);
    assert.equal(statusBody.paymentEnabled,true);
    assert.equal(statusBody.webhookPath,'/api/payment/balepay/webhook');
    assert.equal(statusBody.checkoutStorage,'supabase-postgres');
    assert.equal(statusBody.liveCheckoutSafe,false);
    assert(!JSON.stringify(statusBody).includes(botToken));
    assert(!JSON.stringify(statusBody).includes(stateSecret));
    assert(!JSON.stringify(statusBody).includes('WALLET-TEST'));

    const wrongMethod=makeRes();
    BalePay.status({method:'POST'},wrongMethod);
    assert.equal(wrongMethod.statusCode,405);

    // وب‌هوک باید بدون هدر Origin از سمت بله کار کند و پاسخ ۲۰۰ بدهد.
    const webhookRes=makeRes();
    await BalePay.webhook({method:'POST',headers:{},body:{update_id:9,message:{successful_payment:{currency:'IRR',total_amount:amountRial,invoice_payload:baleCall.body.payload,telegram_payment_charge_id:transactionId}}}},webhookRes);
    assert.equal(webhookRes.statusCode,200);
    assert.equal(parseBody(webhookRes).handled,true);
    const ignoredRes=makeRes();
    await BalePay.webhook({method:'POST',headers:{},body:{update_id:10,message:{text:'سلام'}}},ignoredRes);
    assert.equal(parseBody(ignoredRes).reason,'ignored');
    const methodRes=makeRes();
    await BalePay.webhook({method:'GET',headers:{},body:{}},methodRes);
    assert.equal(methodRes.statusCode,405);

    // یک راز وب‌هوک تنظیم‌شده باید هدر بله را الزامی کند.
    process.env.BALEPAY_REQUIRE_WEBHOOK_SECRET='true';
    process.env.BALEPAY_WEBHOOK_SECRET='a-reasonably-long-webhook-secret';
    const secretRes=makeRes();
    await BalePay.webhook({method:'POST',headers:{},body:{update_id:11}},secretRes);
    assert.equal(secretRes.statusCode,401);
    delete process.env.BALEPAY_REQUIRE_WEBHOOK_SECRET;
    delete process.env.BALEPAY_WEBHOOK_SECRET;

    // request handler: فقط مشتری فعال، مبلغ از پایگاه داده و همان مبدأ.
    const apiRes=makeRes();
    await BalePay.request({method:'POST',headers:{...req.headers,authorization:'Bearer test-access-token-1234567890'},body:{orderId,amountToman:1}},apiRes);
    assert.equal(apiRes.statusCode,200);
    const apiBody=parseBody(apiRes);
    assert.equal(apiBody.amountRial,amountRial,'server must use the persisted order total, not a client amount');
    assert.equal(apiBody.invoice,invoiceParams);
    assert.equal(apiBody.provider,'balepay');
    assert(apiBody.receipt.length>40);
    const evilRes=makeRes();
    await BalePay.request({method:'POST',headers:{origin:'https://evil.test',host:'shop.example.test',authorization:'Bearer test-access-token-1234567890'},body:{orderId}},evilRes);
    assert.equal(evilRes.statusCode,403);
    const anonRes=makeRes();
    await BalePay.request({method:'POST',headers:{...req.headers},body:{orderId}},anonRes);
    assert.equal(anonRes.statusCode,401);
    const badIdRes=makeRes();
    await BalePay.request({method:'POST',headers:{...req.headers,authorization:'Bearer test-access-token-1234567890'},body:{orderId:'TB-1'}},badIdRes);
    assert.equal(badIdRes.statusCode,400);

  const foreign=BalePay.signPayload({v:1,provider:'balepay',orderId:'90000000-0000-4000-8000-000000000009',amountToman:amountToman,intent:created.intent,outcome:'paid',issuedAt:fixedNow},stateSecret);
  const foreignRes=makeRes();
  await BalePay.receipt({method:'POST',headers:{...req.headers,authorization:'Bearer test-access-token-1234567890'},body:{orderId,receipt:foreign}},foreignRes);
  assert.equal(foreignRes.statusCode,403);
    const receiptRes=makeRes();
    await BalePay.receipt({method:'POST',headers:{...req.headers,authorization:'Bearer test-access-token-1234567890'},body:{orderId,receipt:status.receipt}},receiptRes);
    assert.equal(receiptRes.statusCode,200);
    assert.equal(parseBody(receiptRes).outcome,'paid');
    const tamperedRes=makeRes();
    await BalePay.receipt({method:'POST',headers:{...req.headers,authorization:'Bearer test-access-token-1234567890'},body:{orderId,receipt:`${status.receipt}x`}},tamperedRes);
    assert.equal(tamperedRes.statusCode,403);

    // setWebhook فقط روی HTTPS و پورت‌های مجاز بله.
    await assert.rejects(()=>BalePay.setWebhook({config:BalePay.getConfig({...env,BALEPAY_WEBHOOK_SECRET:'a-reasonably-long-webhook-secret'}),url:'http://shop.example.test/api/payment/balepay/webhook',fetchImpl}),/HTTPS/);
    await assert.rejects(()=>BalePay.setWebhook({config,url:'https://shop.example.test:8443/api/payment/balepay/webhook',fetchImpl}),/443 یا 88/);
    const webhookSetFetch=makeFetch({urls:[],bale:[],rpc:[]},{setWebhook:body=>{assert.equal(body.url,'https://shop.example.test/api/payment/balepay/webhook');assert.equal(body.secret_token,'a-reasonably-long-webhook-secret');return baleOk(true)}});
    assert.equal(await BalePay.setWebhook({config:BalePay.getConfig({...env,BALEPAY_WEBHOOK_SECRET:'a-reasonably-long-webhook-secret'}),url:'https://shop.example.test/api/payment/balepay/webhook',fetchImpl:webhookSetFetch}),true);
  }finally{
    for(const key of envKeys){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key]}
    if(savedFetch===undefined)delete global.fetch;else global.fetch=savedFetch;
  }
  console.log('PASS: Bale Pay createInvoiceLink payload, pre-checkout answer, inquireTransaction-only settlement, webhook/receipt handlers, sandbox guards and production gate');
})().catch(error=>{console.error(error);process.exit(1)});

function productionMiniApp(){
  const live=BalePay.getConfig({...env,BALEPAY_MODE:'production',BALEPAY_ENABLE_LIVE_PAYMENTS:'true',BALEPAY_PROVIDER_TOKEN:'WALLET-1q2w3e4r5t6y7u8i'});
  return live.miniAppUrl==='https://ble.ir/touba_shoes_bot?startapp';
}

/* Offline integration smoke test for catalog → cart → ZarinPal sandbox intent → signed-receipt settlement. */
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');

(async()=>{
  const mem={},app={innerHTML:''},modal={innerHTML:''},toast={textContent:'',classList:{add(){},remove(){}}};
  let variantRows=[],authorityCounter=0;
  const checkoutForm={reportValidity:()=>true,values:{}},trackingResult={innerHTML:''};
  const query={'#app':app,'#modal-root':modal,'#toast':toast,'#variant-editor':{querySelectorAll:()=>variantRows},'#checkout-form':checkoutForm,'#tracking-result':trackingResult};
  class FD{constructor(form){this.form=form}get(key){return this.form.elements?.[key]?.value??this.form.values?.[key]??''}}
  const ctx={
    console,Intl,Date,Math,URLSearchParams,FormData:FD,structuredClone,clearTimeout,setTimeout:()=>0,
    fetch:async(url,options={})=>{
      assert.equal(url,'/api/payment/zarinpal/request');
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      assert(body.orderId&&Number.isInteger(body.amountToman));
      authorityCounter+=1;
      const authority=`A${String(authorityCounter).padStart(7,'0')}12345678901234567890`;
      return{ok:true,status:200,json:async()=>({success:true,provider:'zarinpal',authority,amountToman:body.amountToman,amountRial:body.amountToman*10,paymentUrl:`https://sandbox.zarinpal.com/pg/StartPay/${authority}`})};
    },
    localStorage:{getItem:key=>mem[key]||null,setItem:(key,value)=>mem[key]=value,removeItem:key=>delete mem[key]},
    document:{querySelector:selector=>query[selector]||null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}},
    location:{pathname:'/admin',search:'?section=products',origin:'https://demo.local',href:'https://demo.local'},window:null
  };
  ctx.window=ctx;ctx.scrollTo=()=>{};vm.createContext(ctx);
  for(const file of ['services/data-provider.js','repositories/mock-repository.js','services/application-services.js','mock/seed-data.js','app.js','repositories/bootstrap.js','enhancements.js','customer-orders.js','stage3.js','services/cart-functions.js']){
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),ctx,{filename:file});
  }

  await ctx.demoLogin('admin');
  assert.equal(vm.runInContext('db.currentUser.role',ctx),'admin');
  const sizeSpecForm={elements:{sizes:{value:'۳۸, ۳۹, ۴۰'},specifications:{value:'جنس: چرم\nسایزبندی موجود: ۳۷'}}};
  ctx.syncSizeSpecification(sizeSpecForm);
  assert.equal(sizeSpecForm.elements.specifications.value,'جنس: چرم\nسایزبندی: ۳۸، ۳۹، ۴۰');
  sizeSpecForm.elements.sizes.value='۴۱, ۴۲';ctx.syncSizeSpecification(sizeSpecForm);
  assert.equal(sizeSpecForm.elements.specifications.value,'جنس: چرم\nسایزبندی: ۴۱، ۴۲');

  const form={
    values:{name:'کفش آزمایشی یکپارچه',slug:'integration-shoe',sku:'TB-INTEG-1',category:'sport',brand:'طوبی',price:'750000',oldPrice:'900000',sizes:'۴۰',colors:'مشکی',images:'/hero-shoe.jpg',shortDesc:'توضیح کوتاه',longDesc:'توضیح کامل',features:'راحت\nبادوام',specifications:'جنس: چرم'},
    elements:{sizes:{value:'۴۰'},specifications:{value:'جنس: چرم'},featured:{checked:true},bestSeller:{checked:true},active:{checked:true}}
  };
  variantRows=[{querySelector:selector=>({'.v-size':{value:'۴۰'},'.v-color':{value:'مشکی'},'.v-sku':{value:'TB-INTEG-1-11'},'.v-stock':{value:'7'}}[selector])}];
  await ctx.saveProduct(form,'');
  const productId=vm.runInContext("db.products.find(x=>x.sku==='TB-INTEG-1').id",ctx);
  let product=vm.runInContext(`product(${JSON.stringify(productId)})`,ctx);
  assert(product&&product.variants[0].stock===7&&product.active);
  assert.equal(product.specifications['سایزبندی'],'۴۰');
  vm.runInContext("shopState.q='TB-INTEG-1'",ctx);
  assert(vm.runInContext(`getFilteredProducts().some(x=>x.id===${JSON.stringify(productId)})`,ctx));

  await ctx.demoLogin('customer');
  const review=await ctx.DemoServices.reviews.submit({name:'مشتری نمونه',userId:'demo-customer',productId,product:product.name,rating:5,text:'کیفیت عالی و راحت'});
  assert.equal(review.status,'در انتظار تأیید');
  const invalidCoupon=await ctx.DemoServices.coupons.validate('TOUBA10',100);
  assert.equal(invalidCoupon.valid,false);
  ctx.location.pathname='/admin';ctx.render();
  assert(app.innerHTML.includes('دسترسی مدیریت'));
  ctx.location.pathname='/checkout';

  await ctx.addCart(productId,2,{size:'۴۰',color:'مشکی'});
  assert.equal(vm.runInContext('db.cart.length',ctx),1);
  const couponCheck=await ctx.DemoServices.coupons.validate('TOUBA10',1500000);
  assert(couponCheck.valid);
  vm.runInContext(`db.coupon={code:"TOUBA10",discount:${couponCheck.discount}};save()`,ctx);
  ctx.location.pathname='/checkout';ctx.location.search='';
  checkoutForm.values={name:'مشتری تست',phone:'09123456789',province:'تهران',city:'تهران',address:'نشانی آزمایشی معتبر، پلاک ۱',postal:'1234567890',note:'',shippingMethod:'normal',paymentMethod:'zarinpal'};
  ctx.render();
  assert(app.innerHTML.includes('درگاه رسمی زرین‌پال'));
  assert(!app.innerHTML.includes('پرداخت ساختگی'));
  assert.equal(typeof checkoutForm.onsubmit,'function');
  await checkoutForm.onsubmit({preventDefault(){}});

  let order=vm.runInContext('db.orders[0]',ctx);
  assert(order.itemsList[0].productId===productId&&order.total>0);
  assert.equal(order.discount,150000);
  assert.equal(order.paymentStatus,'PENDING');
  assert.equal(ctx.location.href.startsWith('https://sandbox.zarinpal.com/pg/StartPay/'),true);
  let intent=vm.runInContext(`db.payments.find(x=>x.orderId===${JSON.stringify(order.id)})`,ctx);
  assert.equal(intent.provider,'zarinpal');
  assert(intent.authority);

  const receipt={provider:'zarinpal',orderId:order.id,amountToman:order.total,authority:intent.authority,outcome:'paid',referenceId:'9001001',providerCode:'100'};
  let settlement=await ctx.DemoServices.payments.applyReceipt(intent.id,receipt);
  assert.equal(settlement.success,true);
  assert.equal(vm.runInContext(`db.orders.find(x=>x.id===${JSON.stringify(order.id)}).paymentStatus`,ctx),'PAID');
  assert.equal(vm.runInContext(`product(${JSON.stringify(productId)}).variants[0].stock`,ctx),5);
  assert.equal(vm.runInContext('db.cart.length',ctx),0);
  const repeatedSettlement=await ctx.DemoServices.payments.applyReceipt(intent.id,receipt);
  assert.equal(repeatedSettlement.idempotent,true);
  vm.runInContext('db.coupon=null;save()',ctx);
  assert.equal(vm.runInContext(`product(${JSON.stringify(productId)}).variants[0].stock`,ctx),5);
  ctx.trackOrder({values:{number:order.number,phone:order.phone}});
  assert(trackingResult.innerHTML.includes(order.trackingCode));
  assert(trackingResult.innerHTML.includes('جدید'));

  await ctx.demoLogin('admin');
  await ctx.reviewStatus(review.id,'تأیید شده');
  assert.equal(vm.runInContext(`db.reviews.find(x=>x.id===${JSON.stringify(review.id)}).status`,ctx),'تأیید شده');
  await ctx.orderStatus(order.id,'PROCESSING');
  assert.equal(vm.runInContext(`db.orders.find(x=>x.id===${JSON.stringify(order.id)}).status`,ctx),'PROCESSING');
  await ctx.addCart(productId,1,{size:'۴۰',color:'مشکی'});
  ctx.location.pathname='/checkout';ctx.render();
  await checkoutForm.onsubmit({preventDefault(){}});
  const failedOrder=vm.runInContext('db.orders[0]',ctx);
  const failedIntent=vm.runInContext(`db.payments.find(x=>x.orderId===${JSON.stringify(failedOrder.id)})`,ctx);
  const stockBeforeFailure=vm.runInContext(`product(${JSON.stringify(productId)}).variants[0].stock`,ctx);
  assert.equal(failedIntent.provider,'zarinpal');
  assert.equal(failedIntent.status,'PENDING');
  const failure=await ctx.DemoServices.payments.applyReceipt(failedIntent.id,{provider:'zarinpal',orderId:failedOrder.id,amountToman:failedOrder.total,authority:failedIntent.authority,outcome:'failed',providerCode:'NOK'});
  assert.equal(failure.success,false);
  assert.equal(vm.runInContext(`db.orders.find(x=>x.id===${JSON.stringify(failedOrder.id)}).paymentStatus`,ctx),'FAILED');
  assert.equal(vm.runInContext(`product(${JSON.stringify(productId)}).variants[0].stock`,ctx),stockBeforeFailure);
  assert.equal(vm.runInContext('db.cart.length',ctx),1);

  assert(mem['toubashop-v1']);
  const restored=JSON.parse(mem['toubashop-v1']);
  assert.equal(restored.products.find(x=>x.id===productId).variants[0].stock,5);
  assert.equal(restored.orders.find(x=>x.id===order.id).status,'PROCESSING');
  const reloaded=ctx.DataProvider.hydrate('toubashop-v1',ctx.seed);
  assert.equal(reloaded.products.find(x=>x.id===productId).variants[0].stock,5);
  assert(reloaded.payments.some(x=>x.provider==='zarinpal'&&x.status==='FAILED'));
  assert(reloaded.users.some(x=>x.role==='customer'));
  console.log('PASS: Admin CRUD → Demo customer → search/filter → cart/coupon → ZarinPal sandbox request → paid/failed signed-receipt settlement → idempotent inventory → persistence');
})().catch(error=>{console.error(error);process.exit(1)});

/* Application/business services depend on repository contracts, never on a hosted provider SDK. */
(function(g){
 const makeId=prefix=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
 class ProductService{constructor(repo,imageRepo){this.repo=repo;this.imageRepo=imageRepo}list(){return this.repo.list()}get(id){return this.repo.getById(id)}async syncImages(product){if(!this.imageRepo)return;let all=await this.imageRepo.filter({productId:product.id});for(let image of all)await this.imageRepo.delete(image.id);for(let [i,url] of (product.images||[]).entries())await this.imageRepo.create({id:`${product.id}-img-${i+1}`,productId:product.id,url,sortOrder:i,alt:product.name})}async create(input){let now=new Date().toISOString(),product=await this.repo.create({...input,id:input.id||makeId('prd'),createdAt:now,updatedAt:now});await this.syncImages(product);return product}async update(id,input){let previous=await this.repo.getById(id),product=await this.repo.update(id,{...input,updatedAt:new Date().toISOString()});if(JSON.stringify(previous?.images||[])!==JSON.stringify(product.images||[]))await this.syncImages(product);return product}async remove(id){if(this.imageRepo){for(let image of await this.imageRepo.filter({productId:id}))await this.imageRepo.delete(image.id)}return this.repo.delete(id)}search(query){return this.repo.search(query,['name','sku','slug','shortDesc'])}filter(filters){return this.repo.filter(filters)}}
 class AuthService{constructor(users){this.users=users}async demoAccounts(){return this.users.list()}async loginDemo(role){let users=await this.users.list(),user=users.find(x=>x.role===role&&x.demoAccount);if(!user)throw new Error('حساب نمایشی برای این نقش پیدا نشد');return user}logout(){return null}canAccessAdmin(user){return ['admin','super_admin'].includes(user?.role)}canAccessSuperAdmin(user){return user?.role==='super_admin'}}
 class CouponService{constructor(repo){this.repo=repo}async validate(code,subtotal,now=new Date()){let rows=await this.repo.list(),coupon=rows.find(x=>String(x.code).toUpperCase()===String(code||'').trim().toUpperCase());if(!coupon||!coupon.active)return{valid:false,reason:'کد تخفیف فعال نیست'};let current=Number(subtotal)||0;if(current<(Number(coupon.min)||0))return{valid:false,reason:'حداقل مبلغ خرید رعایت نشده'};if(coupon.limit&&Number(coupon.used||0)>=Number(coupon.limit))return{valid:false,reason:'ظرفیت استفاده از کد به پایان رسیده'};let parse=x=>String(x||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replaceAll('/','-');let date=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),today=`${date.find(x=>x.type==='year')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}-${date.find(x=>x.type==='month')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}-${date.find(x=>x.type==='day')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}`;let start=parse(coupon.start),end=parse(coupon.end);if(start&&today<start)return{valid:false,reason:'هنوز زمان شروع کد فرا نرسیده'};if(end&&today>end)return{valid:false,reason:'مهلت کد تخفیف پایان یافته'};let discount=coupon.type==='درصدی'?Math.round(current*Number(coupon.amount)/100):Math.min(current,Number(coupon.amount));return{valid:true,coupon,discount}}
 async incrementUsage(code){let rows=await this.repo.list(),c=rows.find(x=>x.code===code);if(c)return this.repo.update(c.id||c.code,{used:(c.used||0)+1})}}
 class ShippingService{constructor(settings){this.settings=settings}options(subtotal){let s=this.settings.shippingOptions||{normal:Number(this.settings.shipping)||80000,express:160000,freeFrom:Number(this.settings.freeShipping)||2000000};return[{id:'normal',name:'ارسال عادی',cost:Number(s.normal)||0,available:true},{id:'express',name:'ارسال سریع',cost:Number(s.express)||0,available:true},{id:'free',name:'ارسال رایگان',cost:0,available:Number(subtotal)>=Number(s.freeFrom||Infinity)}]}quote(method,subtotal){let option=this.options(subtotal).find(x=>x.id===method)||this.options(subtotal)[0];if(option.id==='free'&&!option.available)throw new Error('سفارش هنوز مشمول ارسال رایگان نیست');return option.cost}}
 class OrderService{constructor(repo){this.repo=repo}list(){return this.repo.list()}get(id){return this.repo.getById(id)}create(input){return this.repo.create(input)}update(id,patch){return this.repo.update(id,patch)}search(query){return this.repo.search(query,['id','number','customer','phone','trackingCode'])}}
  class PaymentService {
    constructor({payments,orders,products,cart,coupons,customers}) { Object.assign(this,{payments,orders,products,cart,coupons,customers}); }
    async createIntent(order,provider='zarinpal') {
      if (provider !== 'zarinpal') throw new Error('تنها درگاه زرین‌پال برای پرداخت آنلاین فعال است.');
      const id=makeId('pi');
      const payment={id,intentId:id,orderId:order.id,provider:'zarinpal',status:'PENDING',amount:Number(order.total),amountToman:Number(order.total),createdAt:new Date().toISOString()};
      await this.payments.create(payment);
      await this.orders.update(order.id,{paymentId:id,paymentStatus:'PENDING',paymentMethod:'zarinpal'});
      return payment;
    }
    async attachAuthority(intentId,gateway) {
      const payment=await this.payments.getById(intentId);
      if(!payment||payment.provider!=='zarinpal')throw new Error('پرداخت زرین‌پال پیدا نشد.');
      if(!gateway||!/^A[A-Za-z0-9_-]{7,127}$/.test(String(gateway.authority||''))||Number(gateway.amountToman)!==Number(payment.amountToman))throw new Error('پاسخ ساخت پرداخت زرین‌پال با سفارش هم‌خوانی ندارد.');
      const updated=await this.payments.update(payment.id,{authority:String(gateway.authority),paymentUrl:String(gateway.paymentUrl||''),updatedAt:new Date().toISOString()});
      await this.orders.update(payment.orderId,{authority:String(gateway.authority),updatedAt:new Date().toISOString()});
      return updated;
    }
    async failRequest(intentId,reason='') {
      const payment=await this.payments.getById(intentId);
      if(!payment||payment.status==='SUCCEEDED')return payment;
      const failed=await this.payments.update(payment.id,{status:'FAILED',failureReason:String(reason||'').slice(0,240),failedAt:new Date().toISOString()});
      const order=await this.orders.getById(payment.orderId);
      if(order)await this.orders.update(order.id,{paymentStatus:'FAILED',updatedAt:new Date().toISOString()});
      return failed;
    }
    async applyReceipt(intentId,receipt) {
      const payment=await this.payments.getById(intentId);
      if(!payment||payment.provider!=='zarinpal')throw new Error('تراکنش زرین‌پال پیدا نشد.');
      const order=await this.orders.getById(payment.orderId);
      if(!order)throw new Error('سفارش پرداخت پیدا نشد.');
      if(String(receipt?.provider)!=='zarinpal'||String(receipt?.orderId)!==String(order.id)||Number(receipt?.amountToman)!==Number(order.total)||Number(receipt?.amountToman)!==Number(payment.amountToman))throw new Error('رسید زرین‌پال با سفارش یا مبلغ هم‌خوانی ندارد.');
      if(receipt.authority&&payment.authority&&String(receipt.authority)!==String(payment.authority))throw new Error('شناسهٔ مرجع رسید با پرداخت این سفارش مطابقت ندارد.');
      if(payment.status==='SUCCEEDED')return{success:true,order,payment,idempotent:true};
      if(receipt.outcome==='pending')return{success:false,pending:true,order,payment};
      if(receipt.outcome!=='paid'){
        const failed=await this.payments.update(payment.id,{status:'FAILED',providerCode:String(receipt.providerCode||'').slice(0,32),failedAt:new Date().toISOString()});
        const updatedOrder=await this.orders.update(order.id,{paymentStatus:'FAILED',paymentOutcome:receipt.outcome==='cancelled'?'CANCELLED':'FAILED',updatedAt:new Date().toISOString()});
        return{success:false,order:updatedOrder,payment:failed};
      }
      if(!payment.authority||String(payment.authority)!==String(receipt.authority))throw new Error('شناسهٔ پرداخت ذخیره‌شده با رسید زرین‌پال مطابقت ندارد.');
      if(payment.status==='FAILED')throw new Error('این پرداخت قبلاً ناموفق شده است؛ برای تلاش دوباره سفارش جدید ثبت کنید.');
      const products=await this.products.list();
      const resolved=[];
      let stockIssue=false;
      for(const line of order.itemsList||[]){
        const p=products.find(x=>x.id===line.productId),v=p?.variants?.find(x=>x.id===line.variantId)||p?.variants?.find(x=>x.size===line.size&&x.color===line.color);
        if(!p||!v||Number(v.stock)<Number(line.quantity))stockIssue=true;
        resolved.push({line,p,v});
      }
      if(!stockIssue){
        for(const {line,p,v} of resolved){
          v.stock-=Number(line.quantity);p.stock=p.variants.reduce((n,x)=>n+Number(x.stock||0),0);p.updatedAt=new Date().toISOString();await this.products.update(p.id,p);
        }
      }
      const cartRows=await this.cart.list();
      for(const item of cartRows){if((order.itemsList||[]).some(x=>x.productId===item.id&&x.size===item.size&&x.color===item.color))await this.cart.delete(`${item.id}::${item.size}::${item.color}`);}
      const paidAt=new Date().toISOString(),referenceId=String(receipt.referenceId||'').slice(0,80);
      const paid=await this.payments.update(payment.id,{status:'SUCCEEDED',referenceId,paidAt,verifiedAt:paidAt,providerCode:String(receipt.providerCode||'100').slice(0,32)});
      const updatedOrder=await this.orders.update(order.id,{paymentStatus:'PAID',paymentMethod:'zarinpal',paymentRef:referenceId,status:stockIssue?'MANUAL_REVIEW':'NEW',inventoryDeducted:!stockIssue,inventoryReviewRequired:stockIssue,paidAt,updatedAt:paidAt});
      const customerRows=await this.customers.list(),customer=customerRows.find(x=>String(x.phone).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))===String(order.phone));
      if(customer)await this.customers.update(customer.id||customer.phone,{orders:(customer.orders||0)+1,total:(customer.total||0)+Number(order.total)});
      if(order.couponCode){const couponRows=await this.coupons.list(),coupon=couponRows.find(x=>x.code===order.couponCode);if(coupon)await this.coupons.update(coupon.id||coupon.code,{used:(coupon.used||0)+1});}
      return{success:true,order:updatedOrder,payment:paid,inventoryReviewRequired:stockIssue};
    }
  }
 class CartService{constructor(repo){this.repo=repo}list(){return this.repo.list()}add(item){return this.repo.create(item)}update(key,patch){return this.repo.update(key,patch)}remove(key){return this.repo.delete(key)}clear(){return this.repo.list().then(rows=>Promise.all(rows.map(x=>this.repo.delete(`${x.id}::${x.size}::${x.color}`))))}}
 class ReviewService{constructor(repo){this.repo=repo}list(){return this.repo.list()}published(){return this.repo.filter({status:'تأیید شده'})}submit(input){return this.repo.create({...input,id:makeId('rev'),status:'در انتظار تأیید',createdAt:new Date().toISOString()})}moderate(id,status){if(!['تأیید شده','رد شده','در انتظار تأیید'].includes(status))throw new Error('وضعیت نظر نامعتبر است');return this.repo.update(id,{status})}remove(id){return this.repo.delete(id)}}
 class DemoToolsService{constructor(key,seed){this.key=key;this.seed=seed}reset(){DataProvider.reset(this.key,this.seed);return true}clear(){DataProvider.clear(this.key);return true}seedIfEmpty(){if(DataProvider.has(this.key))return false;DataProvider.hydrate(this.key,this.seed);return true}}
 function createServices(repos,context){return Object.freeze({products:new ProductService(repos.products,repos.productImages),categories:repos.categories,orders:new OrderService(repos.orders),users:repos.users,customers:repos.customers,cart:new CartService(repos.cart),coupons:new CouponService(repos.coupons),reviews:new ReviewService(repos.reviews),banners:repos.banners,settings:repos.siteSettings,media:repos.media,auth:new AuthService(repos.users),shipping:new ShippingService(context.db.settings),payments:new PaymentService({payments:repos.payments,orders:repos.orders,products:repos.products,cart:repos.cart,coupons:repos.coupons,customers:repos.customers}),demo:new DemoToolsService(context.key,context.seed)})}
 g.AppServices={create:createServices,ProductService,AuthService,CouponService,ShippingService,OrderService,PaymentService,ReviewService,CartService,DemoToolsService};
})(window);

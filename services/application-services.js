/* Application/business services depend on repository contracts, never on a hosted provider SDK. */
(function(g){
 const makeId=prefix=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
 class ProductService{constructor(repo,imageRepo){this.repo=repo;this.imageRepo=imageRepo}list(){return this.repo.list()}get(id){return this.repo.getById(id)}async syncImages(product){if(!this.imageRepo)return;let all=await this.imageRepo.filter({productId:product.id});for(let image of all)await this.imageRepo.delete(image.id);for(let [i,url] of (product.images||[]).entries())await this.imageRepo.create({id:`${product.id}-img-${i+1}`,productId:product.id,url,sortOrder:i,alt:product.name})}async create(input){let now=new Date().toISOString(),product=await this.repo.create({...input,id:input.id||makeId('prd'),createdAt:now,updatedAt:now});await this.syncImages(product);return product}async update(id,input){let previous=await this.repo.getById(id),product=await this.repo.update(id,{...input,updatedAt:new Date().toISOString()});if(JSON.stringify(previous?.images||[])!==JSON.stringify(product.images||[]))await this.syncImages(product);return product}async remove(id){if(this.imageRepo){for(let image of await this.imageRepo.filter({productId:id}))await this.imageRepo.delete(image.id)}return this.repo.delete(id)}search(query){return this.repo.search(query,['name','sku','slug','shortDesc'])}filter(filters){return this.repo.filter(filters)}}
 class AuthService{constructor(users){this.users=users}async loginDemo(){throw new Error('ورود نمایشی غیرفعال است؛ با Supabase Auth وارد شوید.')}logout(){return null}canAccessAdmin(user){return ['admin','super_admin'].includes(user?.role)}canAccessSuperAdmin(user){return user?.role==='super_admin'}}
 class CouponService{constructor(repo){this.repo=repo}async validate(code,subtotal,now=new Date()){let rows=await this.repo.list(),coupon=rows.find(x=>String(x.code).toUpperCase()===String(code||'').trim().toUpperCase());if(!coupon||!coupon.active)return{valid:false,reason:'کد تخفیف فعال نیست'};let current=Number(subtotal)||0;if(current<(Number(coupon.min)||0))return{valid:false,reason:'حداقل مبلغ خرید رعایت نشده'};if(coupon.limit&&Number(coupon.used||0)>=Number(coupon.limit))return{valid:false,reason:'ظرفیت استفاده از کد به پایان رسیده'};let parse=x=>String(x||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replaceAll('/','-');let date=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),today=`${date.find(x=>x.type==='year')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}-${date.find(x=>x.type==='month')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}-${date.find(x=>x.type==='day')?.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}`;let start=parse(coupon.start),end=parse(coupon.end);if(start&&today<start)return{valid:false,reason:'هنوز زمان شروع کد فرا نرسیده'};if(end&&today>end)return{valid:false,reason:'مهلت کد تخفیف پایان یافته'};let discount=coupon.type==='درصدی'?Math.round(current*Number(coupon.amount)/100):Math.min(current,Number(coupon.amount));return{valid:true,coupon,discount}}
 async incrementUsage(code){let rows=await this.repo.list(),c=rows.find(x=>x.code===code);if(c)return this.repo.update(c.id||c.code,{used:(c.used||0)+1})}}
 class ShippingService {
  constructor(settings={}) {
   this.settingsProvider=typeof settings==='function'?settings:null;
   this.settings=this.settingsProvider?{}:(settings||{});
  }
  currentSettings() { return this.settingsProvider?.()||this.settings||{}; }
  options(subtotal) {
   const settings=this.currentSettings();
   const configured=settings.shippingOptions||{};
   const amount=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)&&number>=0?Math.floor(number):fallback;};
   const normal=amount(configured.normal??settings.shipping,0);
   const express=amount(configured.express,normal);
   const freeFrom=amount(configured.freeFrom??settings.freeShipping,0);
   const cartTotal=amount(subtotal,0);
   return [
    {id:'normal',name:'ارسال عادی',cost:normal,available:true},
    {id:'express',name:'ارسال سریع',cost:express,available:true},
    {id:'free',name:'ارسال رایگان',cost:0,available:cartTotal>=freeFrom}
   ];
  }
  quote(method,subtotal) {
   const option=this.options(subtotal).find(item=>item.id===method);
   if(!option)throw new Error('روش ارسال معتبر نیست.');
   if(option.id==='free'&&!option.available)throw new Error('سفارش هنوز مشمول ارسال رایگان نیست');
   return option.cost;
  }
 }
 class OrderService{constructor(repo){this.repo=repo}list(){return this.repo.list()}get(id){return this.repo.getById(id)}create(input){return this.repo.create(input)}update(id,patch){return this.repo.update(id,patch)}search(query){return this.repo.search(query,['id','number','customer','phone','trackingCode'])}}
  class PaymentService {
    async createIntent(){throw new Error('پرداخت فقط با RPC پایگاه داده و API امن سمت سرور ایجاد می‌شود.');}
    async attachAuthority(){throw new Error('شناسهٔ تراکنش درگاه فقط روی سرور و با نقش service ذخیره می‌شود.');}
    async failRequest(){throw new Error('نتیجهٔ پرداخت فقط توسط callback امن سمت سرور ثبت می‌شود.');}
    async applyReceipt(){throw new Error('رسید پرداخت از منبع پایدار Supabase خوانده می‌شود؛ مرورگر مجاز به تسویه نیست.');}
  }
 class CartService{constructor(repo){this.repo=repo}list(){return this.repo.list()}add(item){return this.repo.create(item)}update(key,patch){return this.repo.update(key,patch)}remove(key){return this.repo.delete(key)}clear(){return this.repo.list().then(rows=>Promise.all(rows.map(x=>this.repo.delete(`${x.id}::${x.size}::${x.color}`))))}}
 class ReviewService{constructor(repo){this.repo=repo}list(){return this.repo.list()}published(){return this.repo.filter({status:'تأیید شده'})}submit(input){return this.repo.create({...input,id:makeId('rev'),status:'در انتظار تأیید',createdAt:new Date().toISOString()})}moderate(id,status){if(!['تأیید شده','رد شده','در انتظار تأیید'].includes(status))throw new Error('وضعیت نظر نامعتبر است');return this.repo.update(id,{status})}remove(id){return this.repo.delete(id)}}
 function createServices(repos,context={}){return Object.freeze({products:new ProductService(repos.products,repos.productImages),categories:repos.categories,orders:new OrderService(repos.orders),users:repos.users,customers:repos.customers,cart:new CartService(repos.cart),coupons:new CouponService(repos.coupons),reviews:new ReviewService(repos.reviews),banners:repos.banners,settings:repos.siteSettings,media:repos.media,auth:new AuthService(repos.users),shipping:new ShippingService(()=>context.db?.settings||{}),payments:repos.payments,favorites:repos.favorites,newsletter:repos.newsletterSubscribers,contactMessages:repos.contactMessages})}
 g.AppServices={create:createServices,ProductService,AuthService,CouponService,ShippingService,OrderService,PaymentService,ReviewService,CartService};
})(window);

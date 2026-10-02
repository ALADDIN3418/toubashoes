/* Compose the current MockRepository implementation. Swap this composition root to Supabase later. */
(function(g){
  if (typeof g !== 'undefined') g.db = db;
  db.users||=[];db.profiles||=[];db.payments||=[];db.pageContents||=[];db.addresses||=[];db.productImages||=[];
  if(!db.users || !db.users.length) {
    db.users.push(
      {id:'admin-main',name:'مدیر فروشگاه طوبی',phone:'09121234567',email:'admin@toubashoes.ir',role:'super_admin',isActive:true},
      {id:'demo-customer',name:'مشتری نمونه',phone:'09120000001',email:'customer@touba.demo',role:'customer',demoAccount:true,isActive:true},
      {id:'demo-admin',name:'مدیر فروشگاه',phone:'09120000002',email:'admin@touba.demo',role:'admin',demoAccount:true,isActive:true},
      {id:'demo-super-admin',name:'مدیر ارشد',phone:'09120000003',email:'superadmin@touba.demo',role:'super_admin',demoAccount:true,isActive:true}
    );
  }
  db.users.forEach(u=>{if(!db.profiles.some(p=>p.userId===u.id))db.profiles.push({id:`profile-${u.id}`,userId:u.id,displayName:u.name,phone:u.phone})});
  if(typeof localStorage!=='undefined'){
    try{
      const savedAdmin=localStorage.getItem('touba_admin_session');
      if(savedAdmin){
        const p=JSON.parse(savedAdmin);
        if(p&&(p.role==='admin'||p.role==='super_admin')){
          db.currentUser=p;
          try {
            if(g.ToubaAuth) {
              const d = Object.getOwnPropertyDescriptor(g.ToubaAuth, 'currentUser');
              if(!d || d.set || d.writable) g.ToubaAuth.currentUser = p;
            }
          } catch(e){}
        }
      }
    }catch(e){}
  }
  if(db.currentUser?.role)db.currentUser.role=String(db.currentUser.role).toLowerCase().replace('super-admin','super_admin');
  db.settings.homepage||={heroTitle:'قدم‌هایی مطمئن با کفش طوبی',heroText:'کفش‌های شیک، راحت و بادوام',heroButtonText:'مشاهده محصولات',heroButtonUrl:'/shop',heroImage:'/touba-hero-editorial.jpg',categoryIds:db.categories.filter(x=>x.id!=='sale').slice(0,6).map(x=>x.id),featuredProductIds:db.products.filter(x=>x.featured).slice(0,5).map(x=>x.id),bestSellerProductIds:db.products.filter(x=>x.bestSeller).slice(0,5).map(x=>x.id),advantages:[{title:'ضمانت کیفیت',text:'۷ روز ضمانت بازگشت'},{title:'ارسال سریع',text:'به سراسر کشور'},{title:'پرداخت امن',text:'پرداخت امن با زرین‌پال'}],aboutText:db.settings.about,footerText:'تمامی حقوق برای فروشگاه کفش طوبی محفوظ است.'};
  if(['/hero-shoe.jpg','hero-shoe.jpg','/touba-hero.jpg'].includes(db.settings.homepage.heroImage))db.settings.homepage.heroImage='/touba-hero-editorial.jpg';
  let seededBag=db.products.find(p=>p.category==='accessories'&&String(p.name||'').includes('کیف'));
  if(seededBag&&(!Array.isArray(seededBag.images)||!seededBag.images.length))seededBag.images=['/touba-bag-editorial.jpg'];
  const legacyHomeCategories=['men','women','sport','formal','sandal','slipper'];
  if(Array.isArray(db.settings.homepage.categoryIds)&&db.settings.homepage.categoryIds.length===legacyHomeCategories.length&&legacyHomeCategories.every(id=>db.settings.homepage.categoryIds.includes(id)))db.settings.homepage.categoryIds=['women','men','accessories','sport','formal','sandal'];
  db.settings.shippingOptions||={normal:Number(db.settings.shipping)||80000,express:160000,freeFrom:Number(db.settings.freeShipping)||2000000};db.customers.forEach(x=>x.id||=x.phone);db.coupons.forEach(x=>x.id||=x.code);db.reviews.forEach((x,i)=>x.id||=`review-seed-${i+1}`);db.orders.forEach(x=>x.number||=x.id);db.media=db.media.map((x,i)=>typeof x==='string'?{id:`media-seed-${i+1}`,url:x,alt:'تصویر نمونه'}:x);db.banners.forEach((b,i)=>{b.id||=`banner-${i+1}`;b.imageUrl||='/touba-hero-editorial.jpg';if(['/hero-shoe.jpg','/touba-hero.jpg'].includes(b.imageUrl))b.imageUrl='/touba-hero-editorial.jpg';b.position||='home-promo';b.active=b.active!==false});save();
  g.DataRepositories=createMockRepositories(db,save);g.DemoServices=AppServices.create(g.DataRepositories,{db,key:STORE,seed});
})(window);

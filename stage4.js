/* Touba Luxury Storefront Presentation Layer 2026 */
function leafMark(){return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39C8 34 9 15 34 8c3 13-1 25-10 31Z"/><path d="M14 34 31 16M22 27c-1-6 0-10 4-14"/></svg>`}
function uiIcon(name){
  let p={
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4.2 3.4-6.5 8-6.5s7.3 2.3 8 6.5"/>',
    cart:'<path d="M3 4h2l2.2 12.2a2 2 0 0 0 2 1.6h9.9a2 2 0 0 0 2-1.6L23 9H7"/><circle cx="10" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>',
    truck:'<path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="20" r="2"/><circle cx="19" cy="20" r="2"/>',
    shield:'<path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>',
    support:'<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2ZM17 20c-1 2-3 2-5 2"/>',
    heart:'<path d="M20.5 8.6c0 5-8.5 10.3-8.5 10.3S3.5 13.6 3.5 8.6A4.5 4.5 0 0 1 12 6.7a4.5 4.5 0 0 1 8.5 1.9Z"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    sparkle:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${p[name]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
}
function navActive(href){let p=path();return href==='/'?p==='/':p===href||p.startsWith(href+'/')}

/* Minimal, borderless header with clean touch targets */
function header(){
  let storeName=db.settings.storeName||'کفش طوبی';
  let userText=db.currentUser?(db.currentUser.name||'حساب کاربری'):'ورود / ثبت‌نام';
  let userLink=(db.currentUser?.role==='admin'||db.currentUser?.role==='super_admin')?'/admin':(db.currentUser?'/account':'/login');
  let cCount=cartCount();
  return `<div class="store-header-wrap"><header class="store-header"><div class="store-header-inner container">
    <button class="mobile-menu-toggle minimal-toggle" aria-label="منو" aria-expanded="false" onclick="toggleMobileNav(this)">
      <span class="bar bar-1"></span>
      <span class="bar bar-2"></span>
      <span class="bar bar-3"></span>
    </button>
    <a href="/" class="store-brand" aria-label="صفحه اصلی کفش طوبی">
      <span class="brand-emblem">${leafMark()}</span>
      <span>${esc(storeName)}</span>
    </a>
    <nav class="store-nav" id="store-nav" aria-label="منوی اصلی">
      <a class="${navActive('/')?'active':''}" href="/" onclick="closeMobileNav()">خانه</a>
      <a class="${navActive('/shop')?'active':''}" href="/shop" onclick="closeMobileNav()">فروشگاه</a>
      <div class="nav-categories">
        <a class="${path().startsWith('/category/')?'active':''}" href="/shop" onclick="toggleMobileCategories(event,this)">دسته‌بندی‌ها <span class="cat-chevron">⌄</span></a>
        <div class="nav-dropdown">${db.categories.filter(c=>c.active).map(c=>`<a href="/category/${encodeURIComponent(c.slug||c.id)}" onclick="closeMobileNav()">${esc(c.name)}</a>`).join('')}</div>
      </div>
      <a href="/shop?category=sale" onclick="closeMobileNav()">تخفیف‌ها</a>
      <a class="${navActive('/about')?'active':''}" href="/about" onclick="closeMobileNav()">درباره ما</a>
      <a class="${navActive('/contact')?'active':''}" href="/contact" onclick="closeMobileNav()">تماس با ما</a>
      <a class="${navActive('/tracking')?'active':''}" href="/tracking" onclick="closeMobileNav()">پیگیری سفارش</a>
      <div class="nav-divider-mobile"></div>
      <a class="mobile-drawer-user ${navActive(userLink)?'active':''}" href="${userLink}" onclick="closeMobileNav()">
        <span class="user-icon-slot">${uiIcon('user')}</span> <span>${esc(userText)}</span>
      </a>
    </nav>
    <div class="store-actions minimal-actions">
      <form class="store-search minimal-search" role="search" onsubmit="submitHeaderSearch(event,this)">
        <input name="q" aria-label="جستجوی محصولات" placeholder="جستجو در محصولات...">
        <button type="submit" class="search-submit-btn minimal-btn" aria-label="جستجو">${uiIcon('search')}</button>
        <button type="button" class="search-close-btn" aria-label="بستن جستجو" onclick="closeHeaderSearch(this)">×</button>
      </form>
      <a class="header-action minimal-btn account-action" href="${userLink}" aria-label="${esc(userText)}" title="${esc(userText)}">
        ${uiIcon('user')}
      </a>
      <a class="header-action minimal-btn cart-action" href="/cart" aria-label="سبد خرید (${cCount} کالا)">
        <span class="cart-icon-wrap">
          ${uiIcon('cart')}
          ${cCount>0?`<span class="count">${cCount}</span>`:''}
        </span>
      </a>
    </div>
  </div></header><div id="mobile-nav-backdrop" class="mobile-nav-backdrop" onclick="closeMobileNav()"></div></div>`;
}

function submitHeaderSearch(e,form){
  e.preventDefault();
  let q=form.elements.q.value.trim();
  if(!q){
    if(matchMedia('(max-width: 860px)').matches){
      let open=form.classList.toggle('search-open');
      if(open)form.elements.q.focus();
    }else form.elements.q.focus();
    return;
  }
  go('/search?q='+encodeURIComponent(q));
}
function closeHeaderSearch(btn){
  let form=btn.closest('.store-search');
  if(form){
    form.classList.remove('search-open');
    form.elements.q.value='';
  }
}
function toggleMobileNav(button){
  let nav=$('#store-nav');
  let backdrop=$('#mobile-nav-backdrop');
  if(!nav)return;
  let open=nav.classList.toggle('nav-open');
  if(button){
    button.setAttribute('aria-expanded',String(open));
    button.classList.toggle('is-open',open);
  }
  if(backdrop){
    backdrop.classList.toggle('show',open);
  }
}
function closeMobileNav(){
  let nav=$('#store-nav');
  let btn=$('.mobile-menu-toggle');
  let backdrop=$('#mobile-nav-backdrop');
  if(nav)nav.classList.remove('nav-open');
  if(btn){
    btn.setAttribute('aria-expanded','false');
    btn.classList.remove('is-open');
  }
  if(backdrop)backdrop.classList.remove('show');
}
function toggleMobileCategories(e,link){
  if(window.innerWidth <= 860){
    e.preventDefault();
    e.stopPropagation();
    let parent=link.closest('.nav-categories');
    if(parent)parent.classList.toggle('open');
  }
}
if(typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window.__navDismissListener){
  window.__navDismissListener = true;
  document.addEventListener('click', function(e){
    let nav=document.getElementById('store-nav');
    let toggle=document.querySelector('.mobile-menu-toggle');
    if(nav && nav.classList.contains('nav-open')){
      if(!nav.contains(e.target) && !toggle?.contains(e.target)){
        closeMobileNav();
      }
    }
  });
}

function footer(){
  let cms=db.settings.homepage||{},categories=db.categories.filter(c=>c.active&&c.id!=='sale').slice(0,5);
  return `<footer class="store-footer"><div class="container"><div class="footer-main"><div class="footer-brand-col"><a class="store-brand footer-brand" href="/"><span class="brand-emblem">${leafMark()}</span><span>${esc(db.settings.storeName||'کفش طوبی')}</span></a><p>قدم‌هایی مطمئن، با انتخابی که هر روز همراه شماست. کیفیت، راحتی و طراحی ماندگار؛ امضای طوبی.</p><div class="social-links"><a href="/contact" aria-label="اینستاگرام">◎</a><a href="/contact" aria-label="تلگرام">➤</a><a href="/contact" aria-label="واتساپ">◉</a></div></div><div><h3>دسترسی سریع</h3><a href="/shop">فروشگاه</a><a href="/about">درباره ما</a><a href="/contact">تماس با ما</a><a href="/tracking">پیگیری سفارش</a></div><div><h3>دسته‌بندی‌ها</h3>${categories.map(c=>`<a href="/category/${encodeURIComponent(c.slug||c.id)}">${esc(c.name)}</a>`).join('')}</div><div><h3>راهنمای مشتریان</h3><a href="/terms">قوانین و شرایط</a><a href="/privacy">حریم خصوصی</a><a href="/account/orders">سفارش‌های من</a><a href="/login">ورود به حساب</a></div><div><h3>با ما در ارتباط باشید</h3><p>${esc(db.settings.phone||'')}</p><p>info@toubashoes.ir</p><p>${esc(db.settings.address||'')}</p><span class="footer-trust">${uiIcon('shield')} خرید مطمئن از طوبی</span></div></div><div class="footer-bottom"><span>${esc(cms.footerText||'تمامی حقوق برای فروشگاه کفش طوبی محفوظ است.')}</span><span>© ۱۴۰۵　·　ساخته‌شده با توجه به هر قدم</span></div></div></footer>`;
}

/* Category cards styled with the same beauty and structure as luxury Product Cards */
const CATEGORY_STYLES = {
  men: { bg: '/product-shoes.jpg', pos: '100% 0', kicker: 'کالکشن رسمی و اداری', tag: 'چرم طبیعی', desc: 'کفش‌های کلاسیک و روزمره با چرم طبیعی و قالب طبی' },
  women: { bg: '/product-shoes.jpg', pos: '0 100%', kicker: 'مجلسی و روزمره', tag: 'طراحی شیک', desc: 'کفش‌های پاشنه‌دار و راحت زنانه با ظرافت و استحکام' },
  sport: { bg: '/product-shoes.jpg', pos: '0 0', kicker: 'کتانی و پیاده‌روی', tag: 'سبک و تنفس‌پذیر', desc: 'کفش‌های سبک ارگونومیک با زیره نرم برای فعالیت روزمره' },
  formal: { bg: '/hero-shoe.jpg', pos: 'center', kicker: 'کلاسیک پرطرفدار', tag: 'مجلسی لوکس', desc: 'مدل‌های دست‌دوز رسمی برای جلسات، مجالس و مهمانی‌ها' },
  sandal: { bg: '/product-shoes.jpg', pos: '100% 100%', kicker: 'بهاره و تابستانه', tag: 'کفی طبی نرم', desc: 'صندل‌های سبک و خنک با کفی منعطف برای آسایش پا' },
  accessories: { bg: '/product-shoes.jpg', pos: '100% 0', kicker: 'ملزومات چرمی', tag: 'اکسسوری', desc: 'کیف‌های دوشی مینیمال و محصولات مراقبت از چرم طوبی' },
  slipper: { bg: '/product-shoes.jpg', pos: '100% 100%', kicker: 'راحتی در خانه', tag: 'طبی و سبک', desc: 'دمپایی‌های روفرشی ارگونومیک با راحتی ماندگار' },
  sale: { bg: '/hero-shoe.jpg', pos: 'center', kicker: 'پیشنهاد ویژه', tag: 'تا ۳۰٪ تخفیف', desc: 'کالکشن مدل‌های منتخب طوبی با تخفیف‌های استثنایی' }
};

function categoryCards(){
  let cms=db.settings.homepage||{},chosen=(cms.categoryIds||db.categories.slice(0,6).map(c=>c.id)).map(id=>db.categories.find(c=>c.id===id)).filter(c=>c?.active);
  if(!chosen.length)chosen=db.categories.filter(c=>c.active&&c.id!=='sale').slice(0,6);
  return chosen.map(c=>{
    let style=CATEGORY_STYLES[c.id]||CATEGORY_STYLES.men;
    let count=db.products.filter(p=>p.active&&p.category===c.id).length;
    let url=`/category/${encodeURIComponent(c.slug||c.id)}`;
    return `<article class="lux-category-card">
      <a href="${url}" class="lux-category-image" aria-label="${esc(c.name)}">
        <div class="category-image-visual" style="background-image:url('${style.bg}');background-position:${style.pos}"></div>
        <span class="category-tag-badge">${style.tag}</span>
        <span class="category-overlay-hint">مشاهده کالکشن ${esc(c.name)} ←</span>
      </a>
      <div class="lux-category-info">
        <div class="category-meta-line">
          <span class="category-kicker">${style.kicker}</span>
          <span class="category-count">${count?`${count.toLocaleString('fa-IR')} مدل`:'کالکشن تازه'}</span>
        </div>
        <h3 class="lux-category-title"><a href="${url}">${esc(c.name)}</a></h3>
        <p class="lux-category-desc">${style.desc}</p>
        <div class="lux-category-bottom">
          <span class="category-guarantee"><i>✓</i> ضمانت اصالت</span>
          <a class="category-view-btn" href="${url}" aria-label="مشاهده محصولات ${esc(c.name)}">
            <span>مشاهده</span>
            ${uiIcon('arrow')}
          </a>
        </div>
      </div>
    </article>`;
  }).join('');
}

function card(p){
  let off=discountPercent(p),stock=totalStock(p),reviews=db.reviews.filter(r=>r.productId===p.id&&r.status==='تأیید شده'),rating=reviews.length?reviews.reduce((n,r)=>n+Number(r.rating||5),0)/reviews.length:5,category=db.categories.find(c=>c.id===p.category),url=p.slug||p.id,pos=p.image===0?'0 0':p.image===1?'100% 0':p.image===2?'0 100%':'100% 100%',visual=p.images?.[0]?`<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" width="480" height="380" onerror="this.src='/product-shoes.jpg'">`:`<div class="lux-product-placeholder" role="img" aria-label="${esc(p.name)}" style="background-position:${pos}"></div>`,colorDots=(p.colors||[]).slice(0,4).map(c=>{let colorMap={'مشکی':'#1e293b','قهوه‌ای':'#78350f','عسلی':'#d97706','سفید':'#f8fafc','کرم':'#fef3c7','زرشکی':'#991b1b','طوسی':'#64748b'};return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colorMap[c]||'#64748b'};border:1px solid rgba(0,0,0,0.15)" title="${esc(c)}"></span>`}).join('');
  return `<article class="lux-product-card"><button class="favorite-button ${db.settings.favorites?.includes(p.id)?'is-favorite':''}" aria-label="افزودن ${esc(p.name)} به علاقه‌مندی‌ها" aria-pressed="${db.settings.favorites?.includes(p.id)||false}" onclick="toggleFav(this,'${p.id}')">${uiIcon('heart')}</button>${off?`<span class="product-discount">${off}٪ تخفیف</span>`:''}<a class="lux-product-image" href="/product/${encodeURIComponent(url)}">${visual}<span class="image-overlay">مشاهده جزئیات　←</span></a><div class="lux-product-info"><div style="display:flex;justify-content:space-between;align-items:center"><span class="product-category">${esc(category?.name||'کفش طوبی')}</span><div style="display:flex;gap:4px">${colorDots}</div></div><a href="/product/${encodeURIComponent(url)}" class="lux-product-name">${esc(p.name)}</a><div class="product-rating" aria-label="امتیاز ${rating.toFixed(1)} از ۵"><span>★★★★★</span><small>${rating.toFixed(1)}</small></div><div class="lux-price-row">${p.oldPrice>p.price?`<del>${toman(p.oldPrice)}</del>`:''}<strong>${toman(p.price)}</strong></div><div class="product-card-bottom"><span class="stock-indicator ${stock>0?'in-stock':'out-stock'}"><i></i>${stock>0?`${stock} عدد موجود`:'ناموجود'}</span><a class="product-view-link" href="/product/${encodeURIComponent(url)}">مشاهده محصول</a><button class="quick-add-button" ${stock>0?'':'disabled'} onclick="quickAdd('${p.id}')" aria-label="افزودن سریع ${esc(p.name)} به سبد">+</button></div></div></article>`;
}

/* Shopping Cart designed specifically for mobile: compact items, scroll container, sticky action bar */
function cartPage(){
  let items=db.cart.map((i,idx)=>({...i,p:product(i.id),idx})).filter(x=>x.p);
  let sub=items.reduce((a,x)=>a+(x.p.price||0)*x.qty,0);
  let freeLimit=Number(db.settings.freeShipping||2000000);
  let remainingForFree=Math.max(0,freeLimit-sub);
  let freePercent=Math.min(100,Math.round((sub/freeLimit)*100));
  let shipping=sub>=freeLimit?0:Number(db.settings.shipping||80000);
  let discount=db.coupon?Math.min(db.coupon.amount||db.coupon.discount||0,sub):0;
  let finalTotal=Math.max(0,sub+shipping-discount);
  let totalCount=items.reduce((a,b)=>a+b.qty,0);

  if(!items.length){
    return `${header()}<main class="page container"><div class="panel empty-cart-box">
      <div class="empty-cart-icon">${uiIcon('cart')}</div>
      <h2>سبد خرید شما خالی است</h2>
      <p>محصولات باکیفیت و راحت طوبی را بررسی کنید و با چند کلیک سفارش دهید.</p>
      <a class="btn" href="/shop">مشاهده فروشگاه و محصولات</a>
    </div></main>${footer()}`;
  }

  let rowsHtml=items.map((x,index)=>{
    let pos=x.p.image===0?'0 0':x.p.image===1?'100% 0':x.p.image===2?'0 100%':'100% 100%';
    let thumb=x.p.images?.[0]?`<img src="${esc(x.p.images[0])}" alt="${esc(x.p.name)}" onerror="this.parentElement.innerHTML='👞'">`:`<div class="shoe-sprite-thumb" style="background-position:${pos}"></div>`;
    let variantLabel=`سایز ${esc(x.size||x.p.sizes?.[0]||'')} · ${esc(x.color||x.p.colors?.[0]||'')}`;
    return `<div class="compact-cart-row">
      <a href="/product/${encodeURIComponent(x.p.slug||x.p.id)}" class="compact-cart-thumb" aria-label="${esc(x.p.name)}">
        ${thumb}
      </a>
      <div class="compact-cart-details">
        <a href="/product/${encodeURIComponent(x.p.slug||x.p.id)}" class="compact-cart-name"><b>${esc(x.p.name)}</b></a>
        <div class="compact-cart-variant">${variantLabel}</div>
        <div class="compact-cart-unit-price">${toman(x.p.price)}</div>
      </div>
      <div class="compact-cart-ctrls">
        <div class="compact-qty-stepper">
          <button type="button" aria-label="کاهش تعداد" onclick="changeCart(${index},-1)">−</button>
          <span>${x.qty.toLocaleString('fa-IR')}</span>
          <button type="button" aria-label="افزایش تعداد" onclick="changeCart(${index},1)">+</button>
        </div>
        <div class="compact-row-total">${toman(x.p.price*x.qty)}</div>
        <button type="button" class="compact-delete-btn" aria-label="حذف ${esc(x.p.name)} از سبد" onclick="removeCart(${index})" title="حذف کالا">
          ${uiIcon('trash')}
        </button>
      </div>
    </div>`;
  }).join('');

  return `${header()}<main class="page container cart-mobile-page">
    <div class="breadcrumb"><a href="/">خانه</a>　/　<span>سبد خرید</span></div>
    
    <div class="cart-page-header">
      <h1 class="page-title">سبد خرید شما</h1>
      <span class="cart-items-counter">${totalCount.toLocaleString('fa-IR')} کالا در سبد</span>
    </div>

    <!-- Free shipping progress bar -->
    <div class="free-shipping-card">
      <div class="free-shipping-info">
        <span class="free-shipping-icon">${uiIcon('truck')}</span>
        <span>
          ${remainingForFree>0?`تنها <b>${toman(remainingForFree)}</b> تا <strong>ارسال کاملاً رایگان</strong> سفارش`:`🎉 تبریک! سفارش شما مشمول <strong>ارسال رایگان</strong> شد.`}
        </span>
      </div>
      <div class="free-shipping-track">
        <div class="free-shipping-fill" style="width:${freePercent}%"></div>
      </div>
    </div>

    <div class="checkout-layout cart-layout-compact">
      <!-- Items Column -->
      <section class="panel cart-items-panel">
        <div class="cart-items-header">
          <span>اقلام انتخابی</span>
          <a class="text-link" href="/shop">← ادامه خرید از فروشگاه</a>
        </div>
        
        <!-- Scrollable items box for mobile to prevent infinite page explosion -->
        <div class="cart-items-scrollable">
          ${rowsHtml}
        </div>

        <!-- Coupon Row -->
        <div class="compact-coupon-bar">
          <input id="coupon-code" placeholder="کد تخفیف (مثال: TOUBA10)" class="select compact-coupon-input" value="${esc(db.coupon?.code||'')}">
          <button class="btn small" type="button" onclick="applyCoupon()">اعمال کد</button>
        </div>
        ${db.coupon?`<div class="notice compact-notice">✓ کد تخفیف با موفقیت کسر شد (${toman(discount)}).</div>`:''}
      </section>

      <!-- Summary Column -->
      <aside class="cart-summary compact-summary-panel">
        <h3 class="summary-heading">خلاصه سفارش</h3>
        <div class="summary-line"><span>جمع اقلام (${totalCount.toLocaleString('fa-IR')} عدد)</span><b>${toman(sub)}</b></div>
        <div class="summary-line"><span>هزینه ارسال</span><b>${shipping?toman(shipping):'<span style="color:#10b981;font-weight:700">رایگان</span>'}</b></div>
        ${discount?`<div class="summary-line discount-line"><span>تخفیف</span><b style="color:#ef4444">− ${toman(discount)}</b></div>`:''}
        <div class="summary-line total"><span>مبلغ قابل پرداخت</span><b class="final-price">${toman(finalTotal)}</b></div>
        
        <a class="btn checkout-submit-btn desktop-only-btn" style="width:100%;margin-top:16px" href="/checkout">
          ادامه و تسویه حساب ${uiIcon('arrow')}
        </a>
        
        <div class="cart-security-badge">
          ${uiIcon('shield')} پرداخت امن با کارت‌های شتاب و درگاه بلوپال
        </div>
      </aside>
    </div>

    <!-- Mobile Sticky Checkout Bottom Bar: ALWAYS visible on mobile for effortless 1-tap checkout -->
    <div class="mobile-cart-sticky-bar">
      <div class="mobile-sticky-info">
        <span class="mobile-sticky-label">مبلغ نهایی (${totalCount.toLocaleString('fa-IR')} کالا):</span>
        <b class="mobile-sticky-price">${toman(finalTotal)}</b>
      </div>
      <a href="/checkout" class="btn mobile-sticky-checkout-btn">
        تسویه حساب ${uiIcon('arrow')}
      </a>
    </div>
  </main>${footer()}`;
}

function home(){
  let cms=db.settings.homepage||{},products=db.products.filter(p=>p.active),featured=(cms.featuredProductIds||[]).map(product).filter(p=>p?.active),best=(cms.bestSellerProductIds||[]).map(product).filter(p=>p?.active),promo=db.banners.filter(b=>b.active),approved=db.reviews.filter(r=>r.status==='تأیید شده');
  if(!featured.length)featured=products.filter(p=>p.featured).slice(0,5);
  if(!best.length)best=products.filter(p=>p.bestSeller).slice(0,5);
  let heroTitle=cms.heroTitle||'قدم‌هایی مطمئن با کفش طوبی',titleHtml=esc(heroTitle).replace(' با کفش ','<br>با کفش '),banner=promo[0];

  return `${header()}<main><section class="lux-hero"><img class="lux-hero-image" src="${esc(cms.heroImage||'/hero-shoe.jpg')}" alt="کفش چرمی کالکشن طوبی" width="1800" height="950" fetchpriority="high"><div class="lux-hero-shade"></div><div class="container lux-hero-content"><div class="lux-hero-copy"><span class="hero-kicker"><i></i> کفش‌هایی که احساس می‌شوند</span><h1>${titleHtml}</h1><p>${esc(cms.heroText||'ترکیبی از چرم باکیفیت، راحتی ماندگار و طراحی ظریف؛ برای قدم‌هایی که به آن‌ها اعتماد دارید.')}</p><div class="hero-actions"><a class="btn hero-primary" href="${esc(cms.heroButtonUrl||'/shop')}">${esc(cms.heroButtonText||'مشاهده محصولات')} ${uiIcon('arrow')}</a><a class="hero-secondary auth-home-cta" href="/login" aria-label="ورود یا ثبت‌نام در حساب طوبی">ورود / ثبت‌نام <span>←</span></a></div><div class="hero-note"><span class="hero-note-dot"></span> کیفیتی که با هر قدم همراه شماست</div></div></div><div class="hero-side-label">TOUBA　·　MADE FOR EVERY STEP</div></section><section class="trust-section"><div class="container trust-grid"><div class="trust-item">${uiIcon('shield')}<div><b>خرید مطمئن</b><span>ضمانت اصالت و کیفیت</span></div></div><div class="trust-item">${uiIcon('truck')}<div><b>ارسال سریع</b><span>به سراسر کشور</span></div></div><div class="trust-item">${uiIcon('heart')}<div><b>راحتی در هر قدم</b><span>انتخاب باکیفیت طوبی</span></div></div><div class="trust-item">${uiIcon('support')}<div><b>پشتیبانی واقعی</b><span>همراه شما در خرید</span></div></div></div></section>
  
  <!-- Enhanced Category Cards Showcase: Styled like product cards -->
  <section class="category-section container" id="categories">
    <div class="section-heading">
      <div>
        <span class="section-eyebrow">کالکشن‌های برگزیده طوبی</span>
        <h2>دسته‌بندی‌های کفش طوبی</h2>
        <p>تنوع کامل کفش‌های چرم، اسپرت و راحتی مردانه و زنانه</p>
      </div>
      <a href="/shop">مشاهده تمام دسته‌ها <span>←</span></a>
    </div>
    <div class="lux-category-grid">
      ${categoryCards()}
      <!-- Featured Sale Category Card -->
      <article class="lux-category-card sale-cat-card">
        <a href="/shop?category=sale" class="lux-category-image" aria-label="تخفیف‌های ویژه طوبی">
          <div class="category-image-visual" style="background-image:url('/hero-shoe.jpg');background-position:center"></div>
          <span class="category-tag-badge special-sale">تا ۳۰٪ تخفیف</span>
          <span class="category-overlay-hint">مشاهده حراجی طوبی ←</span>
        </a>
        <div class="lux-category-info">
          <div class="category-meta-line">
            <span class="category-kicker">پیشنهاد شگفت‌انگیز</span>
            <span class="category-count">فرصت محدود</span>
          </div>
          <h3 class="lux-category-title"><a href="/shop?category=sale">تخفیف‌ها و حراج ویژه</a></h3>
          <p class="lux-category-desc">تخفیف‌های ویژه بر روی مدل‌های پرفروش و منتخب طوبی</p>
          <div class="lux-category-bottom">
            <span class="category-guarantee" style="color:#d97706"><i>★</i> فرصت خرید اقتصادی</span>
            <a class="category-view-btn" href="/shop?category=sale" aria-label="مشاهده تخفیف‌های طوبی">
              <span>مشاهده</span>
              ${uiIcon('arrow')}
            </a>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="products-section container"><div class="section-heading"><div><span class="section-eyebrow">منتخب برای شما</span><h2>انتخاب‌های ویژه طوبی</h2><p>مدل‌هایی که راحتی، کیفیت و سادگی را کنار هم می‌آورند.</p></div><a href="/shop">مشاهده همه محصولات <span>←</span></a></div><div class="lux-product-grid">${featured.slice(0,5).map(card).join('')||'<div class="empty-state">به‌زودی انتخاب‌های ویژه در اینجا قرار می‌گیرند.</div>'}</div></section><section class="collection-banner container"><div class="collection-visual"><img src="${esc(banner?.imageUrl||'/hero-shoe.jpg')}" alt="کالکشن کفش‌های طوبی" loading="lazy" width="800" height="520"></div><div class="collection-content"><span class="section-eyebrow">از کالکشن تازه دیدن کنید</span><h2>قدم بعدی را<br><em>متفاوت بردار</em></h2><p>${esc(banner?.subtitle||'کفش مناسب استایل و روزهای شما؛ با کیفیتی که ارزش انتخاب دارد.')}</p><a class="btn collection-button" href="${esc(banner?.linkUrl||'/shop')}">${esc(banner?.buttonText||'مشاهده کالکشن')} ${uiIcon('arrow')}</a><span class="collection-watermark">TOUBA</span></div></section><section class="products-section container bestseller-section"><div class="section-heading"><div><span class="section-eyebrow">محبوب همراهان طوبی</span><h2>پرفروش‌های این روزها</h2></div><a href="/shop">رفتن به فروشگاه <span>←</span></a></div><div class="lux-product-grid">${best.slice(0,5).map(card).join('')}</div></section><section class="why-section"><div class="container"><div class="section-heading light-heading"><div><span class="section-eyebrow">چرا طوبی؟</span><h2>کیفیت را در هر قدم حس کنید</h2></div><p>از انتخاب مواد اولیه تا لحظه‌ای که سفارش به دست شما می‌رسد، به جزئیات اهمیت می‌دهیم.</p></div><div class="why-grid">${(cms.advantages||[]).slice(0,4).map((x,i)=>`<article class="why-card"><span class="why-number">۰${i+1}</span><span class="why-icon">${[uiIcon('shield'),uiIcon('heart'),uiIcon('support'),uiIcon('truck')][i]}</span><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join('')}</div></div></section><section class="about-section container"><div class="about-photo-wrap"><img src="${esc(cms.heroImage||'/hero-shoe.jpg')}" alt="جزئیات کیفیت کفش طوبی" loading="lazy" width="760" height="650"><span class="about-photo-caption">کیفیت؛ از اولین قدم</span></div><div class="about-copy"><span class="section-eyebrow">آشنایی با ما</span><h2>درباره کفش طوبی</h2><p>${esc(cms.aboutText||db.settings.about)} ما باور داریم کفش خوب باید هم زیبا باشد و هم در تمام روز، همراهی راحت و قابل اعتماد.</p><a class="btn about-button" href="/about">بیشتر درباره ما ${uiIcon('arrow')}</a><div class="about-signature">طوبی <span>· قدم‌هایی مطمئن</span></div></div></section>${approved.length?`<section class="reviews-section"><div class="container"><div class="section-heading"><div><span class="section-eyebrow">از زبان همراهان ما</span><h2>تجربه خرید مشتریان</h2></div><span class="review-summary">★★★★★ <small>${approved.length.toLocaleString('fa-IR')} دیدگاه تأییدشده</small></span></div><div class="review-grid">${approved.slice(0,3).map(r=>`<article class="customer-review"><div class="review-top"><span class="review-avatar">${esc((r.name||'م').trim().slice(0,1))}</span><div><b>${esc(r.name)}</b><span>${esc(r.product||'خریدار طوبی')}</span></div><div class="review-stars" aria-label="${r.rating||5} از ۵ ستاره">${'★'.repeat(Number(r.rating)||5)}</div></div><p>«${esc(r.text)}»</p><time>${r.createdAt?new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric'}).format(new Date(r.createdAt)):'خریدار کفش طوبی'}</time></article>`).join('')}</div></div></section>`:''}<section class="newsletter-section"><div class="container newsletter-card"><div class="newsletter-leaf">${leafMark()}</div><div class="newsletter-copy"><span class="section-eyebrow">همراه طوبی باشید</span><h2>از تخفیف‌های ویژه باخبر شوید</h2><p>خبر کالکشن‌های تازه و پیشنهادهای ویژه را زودتر دریافت کنید.</p></div><form class="newsletter-form" onsubmit="event.preventDefault();subscribeNewsletter(this)"><label class="sr-only" for="newsletter-contact">موبایل یا ایمیل</label><input id="newsletter-contact" name="contact" required placeholder="شماره موبایل یا ایمیل شما"><button type="submit">عضویت <span>←</span></button></form></div></section></main>${footer()}`;
}

function subscribeNewsletter(form){
  let value=form.elements.contact.value.trim();
  if(!/^09\d{9}$/.test(st3Num(value))&&!/^\S+@\S+\.\S+$/.test(value)){toast('شماره موبایل یا ایمیل معتبر وارد کنید');return}
  db.newsletterSubscribers||=[];
  if(!db.newsletterSubscribers.includes(value))db.newsletterSubscribers.push(value);
  save();
  form.reset();
  toast('عضویت شما ثبت شد؛ ممنون که همراه طوبی هستید');
}

function toggleFav(el,id){
  db.settings.favorites=db.settings.favorites||[];
  let i=db.settings.favorites.indexOf(id),on=i<0;
  if(on)db.settings.favorites.push(id);else db.settings.favorites.splice(i,1);
  save();
  el.classList.toggle('is-favorite',on);
  el.classList.toggle('liked',on);
  el.textContent=on?'♥':'♡';
  el.setAttribute('aria-pressed',String(on));
  
  el.classList.remove('heart-pop');
  void el.offsetWidth;
  el.classList.add('heart-pop');
  
  toast(on?'به علاقه‌مندی‌ها اضافه شد':'از علاقه‌مندی‌ها حذف شد');
}

function showModal(content){
  let root=$('#modal-root');
  root.innerHTML=`<div class="modal-back" role="presentation" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="modal-head"><h2 id="dialog-title">کفش طوبی</h2><button class="close" aria-label="بستن پنجره" onclick="closeModal()">×</button></div>${content}</div></div>`;
  root.querySelector('[role="dialog"]')?.focus();
}

function productDetailWithSticky(id){
  let html=__stage3Detail(id);
  return html.replace('</main>',`<div class="mobile-product-bar"><div><small>قیمت</small><b>${toman(product(id)?.price)}</b></div><button class="btn" onclick="addCart('${id}',productQtyValue(),true)">افزودن به سبد</button></div></main>`);
}

/* ==========================================================================
   Fluid Animations & Transitions Engine
   ========================================================================== */

function triggerNavProgress(){
  let bar=document.getElementById('nav-progress-bar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='nav-progress-bar';
    bar.className='nav-progress-bar';
    document.body.appendChild(bar);
  }
  bar.classList.remove('done');
  void bar.offsetWidth;
  bar.classList.add('active');
  setTimeout(()=>{
    bar.classList.add('done');
    setTimeout(()=>{
      bar.classList.remove('active','done');
    },280);
  },180);
}

function animateCartBadge(){
  document.querySelectorAll('.cart-icon-wrap .count, .cart-action .count, .cart-icon-wrap').forEach(el=>{
    el.classList.remove('cart-badge-bounce');
    void el.offsetWidth;
    el.classList.add('cart-badge-bounce');
  });
}

// Hook into cart badge refresh
const __prevRefreshBadge=window.refreshCartBadge;
window.refreshCartBadge=function(){
  if(__prevRefreshBadge)__prevRefreshBadge();
  animateCartBadge();
};

let lastRenderedUrl='';

function animatedRender(isPageTransition=false){
  let appEl=document.getElementById('app');
  let currentUrl=location.pathname+location.search;
  let isNewPage=isPageTransition||(currentUrl!==lastRenderedUrl);
  lastRenderedUrl=currentUrl;

  if(isNewPage){
    triggerNavProgress();
  }

  const doRender=()=>{
    __stage3BaseRender();
    if(isNewPage&&appEl){
      appEl.classList.remove('page-transitioning');
      void appEl.offsetWidth;
      appEl.classList.add('page-transitioning');
      window.scrollTo({top:0,behavior:'smooth'});
    }
  };

  if(isNewPage&&document.startViewTransition){
    document.startViewTransition(()=>{
      doRender();
    });
  }else{
    doRender();
  }
}

function smoothGo(url,replace=false){
  if(!url)return;
  if(url.startsWith('http://')||url.startsWith('https://')||url.startsWith('//')||url.startsWith('tel:')||url.startsWith('mailto:')){
    location.href=url;
    return;
  }
  if(url===location.pathname+location.search){
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  if(replace){
    history.replaceState({},'',url);
  }else{
    history.pushState({},'',url);
  }
  animatedRender(true);
}

// Popstate for browser back/forward buttons
window.addEventListener('popstate',()=>{
  animatedRender(true);
});

// Intercept clicks on links for smooth client navigation
if(typeof document!=='undefined'&&typeof document.addEventListener==='function'&&!window.__linkInterceptAttached){
  window.__linkInterceptAttached=true;
  document.addEventListener('click',function(e){
    let a=e.target.closest('a');
    if(!a)return;
    let href=a.getAttribute('href');
    if(!href||href.startsWith('#')||href.startsWith('http://')||href.startsWith('https://')||href.startsWith('//')||href.startsWith('tel:')||href.startsWith('mailto:')||a.target==='_blank')return;
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.hasAttribute('download')||e.defaultPrevented)return;
    
    e.preventDefault();
    closeMobileNav();
    smoothGo(href);
  });
}

// Enhanced quickAdd with animated feedback
const __prevQuickAdd=window.quickAdd;
window.quickAdd=function(id){
  if(__prevQuickAdd)__prevQuickAdd(id);
  animateCartBadge();
};

// Enhanced productQty with animated feedback
const __prevProductQty=window.productQty;
window.productQty=function(d,id){
  if(__prevProductQty)__prevProductQty(d,id);
  let q=document.getElementById('qty');
  if(q){
    q.classList.remove('num-pop');
    void q.offsetWidth;
    q.classList.add('num-pop');
  }
};

const __stage3BaseRender=window.render||window.__stage3Render;
const __stage3Detail=window.detail;
window.detail=productDetailWithSticky;
window.cartPage=cartPage;
window.categoryCards=categoryCards;
window.header=header;
window.home=home;
window.toggleFav=toggleFav;
window.go=smoothGo;
window.render=animatedRender;
window.animateCartBadge=animateCartBadge;

animatedRender(true);

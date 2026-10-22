/* Touba Luxury Storefront Presentation Layer 2026 */
function leafMark(){return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39C8 34 9 15 34 8c3 13-1 25-10 31Z"/><path d="M14 34 31 16M22 27c-1-6 0-10 4-14"/></svg>`}
function brandLogoImg(){return `<img src="/touba-logo.png" alt="" width="285" height="426" onerror="this.outerHTML=leafMark()">`}
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
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sliders:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    moon:'<path d="M20.8 14.2A8.5 8.5 0 0 1 9.8 3.2 8.5 8.5 0 1 0 20.8 14.2Z"/>',
    trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    sparkle:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z"/>',
    'chev-r':'<path d="m9 6 6 6-6 6"/>',
    'chev-l':'<path d="m15 6-6 6 6 6"/>'
  };
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
}
function navActive(href){let p=path();return href==='/'?p==='/':p===href||p.startsWith(href+'/')}
function categoryNavActive(id){let p=path();if(p==='/shop')return new URLSearchParams(location.search).get('category')===id;if(p.startsWith('/category/')){let slug=decodeURIComponent(p.split('/')[2]||'');let c=db.categories.find(x=>x.id===slug||x.slug===slug||x.name===slug);return c?.id===id}return false}
function favoritesCount(){return Array.isArray(db.settings.favorites)?db.settings.favorites.length:0}
let activeStoreTheme='dark';
function themeToggleMarkup(){let dark=activeStoreTheme==='dark';return `<button class="theme-toggle" type="button" onclick="toggleStoreTheme()" aria-label="تغییر پوسته به حالت ${dark?'روشن':'تیره'}" aria-pressed="${dark}" title="تغییر پوسته">${uiIcon(dark?'sun':'moon')}<span class="theme-toggle-text">${dark?'حالت روشن':'حالت تیره'}</span></button>`}
function applyStoreTheme(theme,persist=true){
  activeStoreTheme=theme==='light'?'light':'dark';
  if(typeof document!=='undefined'){
    if(document.documentElement?.dataset)document.documentElement.dataset.theme=activeStoreTheme;
    if(document.body?.dataset)document.body.dataset.theme=activeStoreTheme;
    let meta=document.querySelector?.('meta[name="theme-color"]');if(meta)meta.content=activeStoreTheme==='dark'?'#0d120e':'#f6f6f0';
    let controls=document.querySelectorAll?.('.theme-toggle')||[];
    Array.from(controls).forEach(button=>{let dark=activeStoreTheme==='dark';button.setAttribute('aria-label',`تغییر پوسته به حالت ${dark?'روشن':'تیره'}`);button.setAttribute('aria-pressed',String(dark));button.title=`تغییر به حالت ${dark?'روشن':'تیره'}`;button.innerHTML=`${uiIcon(dark?'sun':'moon')}<span class="theme-toggle-text">${dark?'حالت روشن':'حالت تیره'}</span>`});
  }
  if(persist){try{localStorage.setItem('touba-store-theme',activeStoreTheme)}catch(error){}}
  return activeStoreTheme;
}
function toggleStoreTheme(){return applyStoreTheme(activeStoreTheme==='dark'?'light':'dark',true)}
try{let savedStoreTheme=localStorage.getItem('touba-store-theme');applyStoreTheme(savedStoreTheme==='light'?'light':'dark',false)}catch(error){applyStoreTheme('dark',false)}

/* Minimal, borderless header with clean touch targets */
function header(){
  let storeName=db.settings.storeName||'کفش طوبی';
  let userText=db.currentUser?(db.currentUser.name||'حساب کاربری'):'ورود / ثبت‌نام';
  let userLink=(db.currentUser?.role==='admin'||db.currentUser?.role==='super_admin')?'/admin':(db.currentUser?'/account':'/login');
  let cCount=cartCount();
  return `<a class="skip-link" href="#main-content">پرش به محتوای اصلی</a><div class="store-header-wrap"><header class="store-header"><div class="store-header-inner container">
    <button class="mobile-menu-toggle minimal-toggle" aria-label="باز کردن منو" aria-expanded="false" onclick="toggleMobileNav(this)">
      <span class="bar bar-1"></span>
      <span class="bar bar-2"></span>
      <span class="bar bar-3"></span>
    </button>
    <a href="/" class="store-brand" aria-label="صفحه اصلی کفش طوبی">
      <span class="brand-emblem">${brandLogoImg()}</span>
      <span>${esc(storeName)}</span>
    </a>
    <nav class="store-nav" id="store-nav" aria-label="منوی اصلی">
      <a class="${navActive('/')?'active':''}" href="/" onclick="closeMobileNav()">خانه</a>
      <a class="${categoryNavActive('women')?'active':''}" href="/shop?category=women" onclick="closeMobileNav()">زنانه</a>
      <a class="${categoryNavActive('men')?'active':''}" href="/shop?category=men" onclick="closeMobileNav()">مردانه</a>
      <a class="${categoryNavActive('accessories')?'active':''}" href="/shop?category=accessories" onclick="closeMobileNav()">کیف و اکسسوری</a>
      <a class="${location.search.includes('sort=newest')?'active':''}" href="/shop?sort=newest" onclick="closeMobileNav()">جدیدترین‌ها</a>
      <div class="nav-categories">
        <a class="${path().startsWith('/category/')?'active':''}" href="/shop" onclick="toggleMobileCategories(event,this)">دسته‌ها <span class="cat-chevron">⌄</span></a>
        <div class="nav-dropdown">${db.categories.filter(c=>c.active).map(c=>`<a href="/category/${encodeURIComponent(c.slug||c.id)}" onclick="closeMobileNav()">${esc(c.name)}</a>`).join('')}</div>
      </div>
      <a href="/shop?category=sale" onclick="closeMobileNav()">تخفیف‌ها</a>
      <a class="${navActive('/contact')?'active':''}" href="/contact" onclick="closeMobileNav()">تماس با ما</a>
      <a class="nav-mobile-secondary ${navActive('/shop')?'active':''}" href="/shop" onclick="closeMobileNav()">همه محصولات</a>
      <a class="nav-mobile-secondary ${navActive('/about')?'active':''}" href="/about" onclick="closeMobileNav()">درباره ما</a>
      <a class="nav-mobile-secondary ${navActive('/tracking')?'active':''}" href="/tracking" onclick="closeMobileNav()">پیگیری سفارش</a>
      <a class="nav-mobile-secondary" href="/account/orders" onclick="closeMobileNav()">سفارش‌های من</a>
      <a class="nav-mobile-secondary" href="/wishlist" onclick="closeMobileNav()">علاقه‌مندی‌ها</a>
      <div class="nav-divider-mobile"></div>
      <div class="mobile-theme-row"><span>پوسته فروشگاه</span>${themeToggleMarkup()}</div>
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
      ${themeToggleMarkup()}
      <a class="header-action minimal-btn wishlist-action" href="/wishlist" aria-label="علاقه‌مندی‌ها (${favoritesCount()} محصول)" title="علاقه‌مندی‌ها">
        ${uiIcon('heart')}${favoritesCount()?`<span class="count">${favoritesCount()}</span>`:''}
      </a>
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
    if(matchMedia('(max-width: 1280px)').matches){
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
  if(window.innerWidth <= 1280){
    e.preventDefault();
    e.stopPropagation();
    let parent=link.closest('.nav-categories');
    if(parent)parent.classList.toggle('open');
  }
}
if(typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window.__navDismissListener){
  window.__navDismissListener = true;
  document.addEventListener('click', function(e){
    let nav=document.querySelector('#store-nav');
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
  return `<footer class="store-footer"><div class="container"><div class="footer-main"><div class="footer-brand-col"><a class="store-brand footer-brand" href="/"><span class="brand-emblem">${brandLogoImg()}</span><span>${esc(db.settings.storeName||'کفش طوبی')}</span></a><p>قدم‌هایی مطمئن، با انتخابی که هر روز همراه شماست. کیفیت، راحتی و طراحی ماندگار؛ امضای طوبی.</p></div><div><h3>دسترسی سریع</h3><a href="/shop">فروشگاه</a><a href="/about">درباره ما</a><a href="/contact">تماس با ما</a><a href="/tracking">پیگیری سفارش</a></div><div><h3>دسته‌بندی‌ها</h3>${categories.map(c=>`<a href="/category/${encodeURIComponent(c.slug||c.id)}">${esc(c.name)}</a>`).join('')}</div><div><h3>راهنمای مشتریان</h3><a href="/terms">قوانین و شرایط</a><a href="/privacy">حریم خصوصی</a><a href="/account/orders">سفارش‌های من</a><a href="/login">ورود به حساب</a></div><div><h3>با ما در ارتباط باشید</h3>${db.settings.phone?`<p dir="ltr">${esc(db.settings.phone)}</p>`:''}${db.settings.email?`<p dir="ltr">${esc(db.settings.email)}</p>`:''}${db.settings.address?`<p>${esc(db.settings.address)}</p>`:''}${db.settings.phone||db.settings.email||db.settings.address?'':'<p>اطلاعات تماس پس از ثبت در تنظیمات فروشگاه نمایش داده می‌شود.</p>'}<span class="footer-trust">${uiIcon('shield')} خرید از طوبی</span></div></div>${(()=>{let em=db.settings.enamad||{},eId=String(em.id||'').trim()||'8043803',eCode=String(em.code||'').trim()||'KwnE0Oqncs7Kf5559g7IyC9IHDlTnDEE';return `<div class="footer-enamad" role="group" aria-label="نمادهای اعتماد فروشگاه"><div class="footer-trust-pair"><div class="footer-trust-item footer-enamad-item"><a class="enamad-seal" referrerpolicy="origin" target="_blank" href="https://trustseal.enamad.ir/?id=${esc(eId)}&amp;Code=${esc(eCode)}" title="نماد اعتماد الکترونیکی — طوبی در اینماد" aria-label="استعلام نماد اعتماد الکترونیکی فروشگاه طوبی"><img referrerpolicy="origin" src="https://trustseal.enamad.ir/logo.aspx?id=${esc(eId)}&amp;Code=${esc(eCode)}" alt="" code="${esc(eCode)}" loading="lazy" style="cursor:pointer" onerror="this.onerror=null;this.src='/enamad-logo.png'"></a><span class="footer-trust-caption">نماد اعتماد الکترونیکی (اینماد)</span></div><div class="footer-trust-item footer-bitpay-item"><a class="bitpay-seal" href="https://bitpay.ir/certificate-119478-toubashose.ir" target="_blank" aria-label="مشاهده گواهی اعتماد بیت‌پی فروشگاه طوبی" title="گواهی اعتماد بیت‌پی"><img src="https://bitpay.ir/theme/public/images/trusted-logo.svg" alt="لوگوی اعتماد بیت‌پی" loading="lazy"></a><span class="footer-trust-caption">گواهی اعتماد بیت‌پی</span></div></div></div>`})()}<div class="footer-bottom"><span>${esc(cms.footerText||'تمامی حقوق برای فروشگاه کفش طوبی محفوظ است.')}</span><span>© ۱۴۰۵　·　ساخته‌شده با توجه به هر قدم</span></div></div></footer><nav class="mobile-bottom-nav" aria-label="میانبرهای فروشگاه"><a class="${navActive('/')?'active':''}" ${navActive('/')?'aria-current="page"':''} href="/">${uiIcon('home')}<span>خانه</span></a><a class="${navActive('/shop')||path().startsWith('/category/')?'active':''}" ${navActive('/shop')||path().startsWith('/category/')?'aria-current="page"':''} href="/shop">${uiIcon('grid')}<span>دسته‌ها</span></a><a class="${navActive('/wishlist')?'active':''}" ${navActive('/wishlist')?'aria-current="page"':''} href="/wishlist">${uiIcon('heart')}<span>علاقه‌مندی</span></a><a class="${navActive('/account')||navActive('/login')?'active':''}" ${navActive('/account')||navActive('/login')?'aria-current="page"':''} href="${db.currentUser?'/account':'/login'}">${uiIcon('user')}<span>حساب من</span></a></nav>`;
}

/* Category cards styled with the same beauty and structure as luxury Product Cards */
/* Homepage category tiles v1.0.4: ONE horizontal swipe row; the tile shows the admin artwork as-is
   (transparent stays transparent — no white matte) with the category name under it.
   Until an image is set, a quiet name-matched emoji fills in so the row never breaks. */
const CATEGORY_ICON_RULES=[
  [/تخفیف|حراج|sale|discount/i,'🏷️'],
  [/بچگانه|بچه|کودک|مدرسه|نوجوان|kid|child|school|student/i,'🎒'],
  [/کوله|پشتی|backpack/i,'🎒'],
  [/کیف|bag|handbag|messenger/i,'👜'],
  [/جوراب|sock/i,'🧦'],
  [/شال|روسری|scarf/i,'🧣'],
  [/عینک|sunglass/i,'🕶️'],
  [/زیور|جواهر|اکسسوری|accessor|کمربند|belt/i,'👒'],
  [/بوت|چکمه|boot/i,'👢'],
  [/صندل|سندل|sandal/i,'👡'],
  [/دمپایی|راحتی|slipper/i,'🩴'],
  [/کتانی|اسپرت|ورزش|sport|sneaker|runner|daily|فوتبال|والیبال|دویدن/i,'👟'],
  [/رسمی|مجلسی|چرم|اداری|formal|classi/i,'👞'],
  [/زنانه|بانوان|خانم|women|ladies/i,'👠'],
  [/مردانه|آقایان|men|gentleman/i,'👞'],
  [/کفش|shoe/i,'👟']
];
const CATEGORY_TINTS=['#b9cf8e','#e5c9a2','#9ec4c9','#e3aeb1','#c2b4e8','#a7d3b5'];
function categoryIconFor(c){let hay=`${c.id||''} ${c.slug||''} ${c.name||''}`;for(let[re,em]of CATEGORY_ICON_RULES)if(re.test(hay))return em;return '👟'}
function categoryCards(){
  let cms=db.settings.homepage||{};
  let configured=Array.isArray(cms.categoryIds)&&cms.categoryIds.length?cms.categoryIds.slice():null;
  let chosen=configured?configured.map(id=>db.categories.find(c=>c.id===id)).filter(c=>c?.active&&c.id!=='sale'):db.categories.filter(c=>c.active&&c.id!=='sale');
  if(!configured)chosen=chosen.slice().sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)); // v1.0.6: the admin's table order IS the display order
  return chosen.map((c,idx)=>{
    let url=`/category/${encodeURIComponent(c.slug||c.id)}`;
    if(c.imageUrl)return `<a href="${url}" class="cat-tile" aria-label="دسته‌بندی ${esc(c.name)}"><span class="cat-tile-media"><img src="${esc(c.imageUrl)}" alt="${esc(c.name)}" loading="lazy" width="160" height="160"></span><b class="cat-tile-name">${esc(c.name)}</b></a>`;
    let adminIcon=String(c.icon||'').trim();
    let emoji=adminIcon&&adminIcon!=='◈'?adminIcon:categoryIconFor(c);
    return `<a href="${url}" class="cat-tile" style="--cat-tint:${CATEGORY_TINTS[idx%CATEGORY_TINTS.length]}" aria-label="دسته‌بندی ${esc(c.name)}"><span class="cat-tile-media cat-tile-emoji" aria-hidden="true"><i>${emoji}</i></span><b class="cat-tile-name">${esc(c.name)}</b></a>`;
  }).join('');
}
/* Category row edge arrows v1.0.8: hint that more categories exist. They appear
   only when the row actually overflows; one tap = one tile, RTL-safe via
   scrollIntoView (no scrollLeft sign math). */
function scrollCatRow(dir){
  let row=document.getElementById('cat-tile-row');
  if(!row)return;
  let tiles=Array.prototype.slice.call(row.children);
  if(tiles.length<2)return;
  let rc=row.getBoundingClientRect(),mid=rc.left+rc.width/2,idx=0,best=Number.POSITIVE_INFINITY;
  for(let i=0;i<tiles.length;i++){let r=tiles[i].getBoundingClientRect();let d=Math.abs(r.left+r.width/2-mid);if(d<best){best=d;idx=i}}
  let next=Math.max(0,Math.min(tiles.length-1,idx+(Number(dir)>0?1:-1)));
  try{tiles[next].scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})}catch(error){row.scrollBy({left:(Number(dir)||1)*180,behavior:'smooth'})}
}
function updateCatArrows(){
  for(let wrap of document.querySelectorAll('.cat-row-wrap')){
    let row=wrap.querySelector('.cat-tile-row');
    if(row)wrap.classList.toggle('has-overflow',row.scrollWidth>row.clientWidth+8);
  }
}


function card(p){
  let off=discountPercent(p),stock=totalStock(p),reviews=db.reviews.filter(r=>r.productId===p.id&&r.status==='تأیید شده'),rating=reviews.length?reviews.reduce((n,r)=>n+Number(r.rating||0),0)/reviews.length:0,category=db.categories.find(c=>c.id===p.category),url=p.slug||p.id,pos=p.image===0?'0 0':p.image===1?'100% 0':p.image===2?'0 100%':'100% 100%',visual=p.images?.[0]?`<img class="image-skeleton" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" width="480" height="380" onload="this.classList.add('image-loaded')" onerror="this.classList.add('image-loaded');this.src='/product-shoes.jpg'">`:`<div class="lux-product-placeholder" role="img" aria-label="${esc(p.name)}" style="background-position:${pos}"></div>`,isFavorite=db.settings.favorites?.includes(p.id)||false,colorDots=(p.colors||[]).slice(0,4).map(c=>{let colorMap={'مشکی':'#1e293b','قهوه‌ای':'#78350f','عسلی':'#d97706','سفید':'#f8fafc','کرم':'#fef3c7','زرشکی':'#991b1b','طوسی':'#64748b'};return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${(()=>{let m=p.specifications&&p.specifications.__colorHexes;let h=m&&m[c];return /^#[0-9a-fA-F]{6}$/.test(String(h||''))?h:(colorMap[c]||'#64748b')})()};border:1px solid rgba(125,135,125,.6)" title="${esc(c)}"></span>`}).join('');
  let stockMarkup = stock === 1
    ? `<span class="stock-indicator last-one" title="تنها ۱ عدد باقی مانده است"><i></i>تنها ۱ عدد باقی مانده</span>`
    : stock > 1
    ? `<span class="stock-indicator in-stock"><i></i>موجود</span>`
    : `<span class="stock-indicator out-stock"><i></i>ناموجود</span>`;
  return `<article class="lux-product-card"><button class="favorite-button ${isFavorite?'is-favorite':''}" aria-label="${isFavorite?'حذف':'افزودن'} ${esc(p.name)} ${isFavorite?'از':'به'} علاقه‌مندی‌ها" aria-pressed="${isFavorite}" onclick="toggleFav(this,'${p.id}')">${uiIcon('heart')}</button>${off?`<span class="product-discount">${off}٪ تخفیف</span>`:''}<a class="lux-product-image" href="/product/${encodeURIComponent(url)}">${visual}<span class="image-overlay">مشاهده جزئیات　←</span></a><div class="lux-product-info"><div style="display:flex;justify-content:space-between;align-items:center"><span class="product-category">${esc(category?.name||'کفش طوبی')}</span><div style="display:flex;gap:4px">${colorDots}</div></div><a href="/product/${encodeURIComponent(url)}" class="lux-product-name">${esc(p.name)}</a><div class="product-rating" aria-label="${reviews.length?`امتیاز ${rating.toLocaleString('fa-IR',{minimumFractionDigits:1,maximumFractionDigits:1})} از ۵`:'هنوز امتیازی ثبت نشده است'}"><span>${reviews.length?'★'.repeat(Math.round(rating))+'☆'.repeat(Math.max(0,5-Math.round(rating))):'☆☆☆☆☆'}</span><small>${reviews.length?rating.toLocaleString('fa-IR',{minimumFractionDigits:1,maximumFractionDigits:1}):'بدون امتیاز'}</small></div><div class="lux-price-row">${p.oldPrice>p.price?`<del>${toman(p.oldPrice)}</del>`:''}<strong>${toman(p.price)}</strong></div><div class="product-card-bottom">${stockMarkup}<a class="product-view-link" href="/product/${encodeURIComponent(url)}">مشاهده محصول</a><button class="quick-add-button" ${stock>0?'':'disabled'} onclick="quickAdd('${p.id}')" aria-label="افزودن سریع ${esc(p.name)} به سبد">+</button></div></div></article>`;
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
    let thumb=x.p.images?.[0]?`<img src="${esc(x.p.images[0])}" alt="${esc(x.p.name)}" class="image-skeleton" onload="this.classList.add('image-loaded')" onerror="this.parentElement.innerHTML='👞'">`:`<div class="shoe-sprite-thumb" style="background-position:${pos}"></div>`;
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
        <div class="summary-line"><span>هزینه ارسال</span><b>${shipping?toman(shipping):'<span style="color:var(--touba-brand,#10b981);font-weight:700">رایگان</span>'}</b></div>
        ${discount?`<div class="summary-line discount-line"><span>تخفیف</span><b style="color:#ef4444">− ${toman(discount)}</b></div>`:''}
        <div class="summary-line total"><span>مبلغ قابل پرداخت</span><b class="final-price">${toman(finalTotal)}</b></div>

        <a class="btn checkout-submit-btn desktop-only-btn" style="width:100%;margin-top:16px" href="/checkout">
          ادامه و تسویه حساب ${uiIcon('arrow')}
        </a>

        <div class="cart-security-badge">
          ${uiIcon('shield')} پرداخت امن مستقیم بانکی با درگاه بیت‌پی
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

function wishlistPage(){
  let ids=Array.isArray(db.settings.favorites)?db.settings.favorites:[],items=ids.map(product).filter(p=>p?.active);
  return `${header()}<main class="page container wishlist-page"><div class="breadcrumb"><a href="/">خانه</a>　/　<span>علاقه‌مندی‌های من</span></div><div class="wishlist-heading"><div><span class="section-eyebrow">انتخاب‌های شما</span><h1 class="page-title">علاقه‌مندی‌های من</h1><p>مدل‌هایی که دوست دارید را یک‌جا نگه دارید و هر زمان برای خرید برگردید.</p></div><a class="btn outline small" href="/shop">ادامه خرید</a></div>${items.length?`<div class="lux-product-grid wishlist-grid">${items.map(card).join('')}</div>`:`<section class="panel empty wishlist-empty"><span class="wishlist-empty-icon">${uiIcon('heart')}</span><h2>هنوز محصولی ذخیره نکرده‌اید</h2><p>با زدن آیکن قلب کنار هر محصول، انتخاب‌هایتان را اینجا نگه دارید.</p><a class="btn" href="/shop">دیدن کالکشن‌ها</a></section>`}</main>${footer()}`;
}

function home(){
  let cms=db.settings.homepage||{},products=db.products.filter(p=>p.active),newest=products.slice().sort((a,b)=>(Date.parse(b.createdAt||b.updatedAt||'')||0)-(Date.parse(a.createdAt||a.updatedAt||'')||0)||Number(String(b.id).match(/\d+$/)?.[0]||0)-Number(String(a.id).match(/\d+$/)?.[0]||0)).slice(0,5),featured=(cms.featuredProductIds||[]).map(product).filter(p=>p?.active),best=(cms.bestSellerProductIds||[]).map(product).filter(p=>p?.active),promo=db.banners.filter(b=>b.active&&(b.position==='home-promo'||b.position==='home')),approved=db.reviews.filter(r=>r.status==='تأیید شده'),averageReviewRating=approved.length?approved.reduce((sum,r)=>sum+Number(r.rating||0),0)/approved.length:0,saleProducts=products.filter(p=>p.oldPrice>p.price),saleDiscount=Math.max(0,...saleProducts.map(discountPercent));
  if(!featured.length)featured=products.filter(p=>p.featured).slice(0,5);
  if(!best.length)best=products.filter(p=>p.bestSeller).slice(0,5);
  const defaultHeroTitle='خرید اینترنتی کفش زنانه و مردانه';
  let heroTitle=(!cms.heroTitle||cms.heroTitle==='قدم‌هایی مطمئن با کفش طوبی'||cms.heroTitle==='راحتی، استایل و کیفیت در هر قدم')?defaultHeroTitle:cms.heroTitle;
  let heroTitleMarkup=heroTitle===defaultHeroTitle?'خرید اینترنتی کفش<br><em>زنانه و مردانه</em>':esc(heroTitle);
  const defaultHeroText='مدل‌های متنوع کفش را بر اساس سایز، رنگ و موجودی بررسی کنید و آگاهانه انتخاب کنید.';
  let heroText=(!cms.heroText||cms.heroText==='کفش‌های شیک، راحت و بادوام')?defaultHeroText:cms.heroText;
  let heroImage=(!cms.heroImage||cms.heroImage==='/hero-shoe.jpg'||cms.heroImage==='hero-shoe.jpg'||cms.heroImage==='/touba-hero.jpg')?'/touba-hero-editorial.jpg':cms.heroImage,banner=promo[0],bannerImage=(!banner?.imageUrl||banner.imageUrl==='/hero-shoe.jpg'||banner.imageUrl==='/touba-hero.jpg')?heroImage:banner.imageUrl;
  let freeShippingThreshold=Number(db.settings.shippingOptions?.freeFrom??db.settings.freeShipping??0),freeShippingActive=Number.isFinite(freeShippingThreshold)&&freeShippingThreshold>0;
  const categoryRows=db.categories.filter(category=>category.active&&category.id!=='sale');
  const categorySection=categoryRows.length?`<section class="category-section container" id="categories"><div class="section-heading"><div><span class="section-eyebrow">کالکشن‌های فروشگاه</span><h2>دسته‌بندی‌های طوبی</h2><p>برای دیدن محصولات و جزئیات هر دسته‌بندی، انتخاب کنید.</p></div><a href="/shop">مشاهده همه محصولات <span>←</span></a></div><div class="cat-row-wrap"><button class="cat-arrow cat-arrow-start" type="button" aria-label="دسته‌بندی‌های قبلی" title="دسته‌بندی‌های قبلی" onclick="scrollCatRow(-1)">${uiIcon('chev-r')}</button><div class="cat-tile-row" id="cat-tile-row">${categoryCards()}</div><button class="cat-arrow cat-arrow-end" type="button" aria-label="دیدن دسته‌بندی‌های بیشتر" title="دیدن دسته‌بندی‌های بیشتر" onclick="scrollCatRow(1)">${uiIcon('chev-l')}</button></div></section>`:'';

  return `${header()}<main>
  <section class="lux-hero" aria-label="${esc(heroTitle)}">
    <img class="lux-hero-image" src="${esc(heroImage)}" alt="کفش اسپرت زیتونی کالکشن طوبی روی سکوی سنگی در فضای سبز" width="1536" height="1024" fetchpriority="high">
    <div class="lux-hero-shade"></div>
    <div class="lux-hero-glow" aria-hidden="true"></div>

    <div class="container lux-hero-content">
      <div class="lux-hero-copy lux-editorial-box">
        <div class="lux-editorial-kicker">
          <span class="lux-kicker-line"></span>
          <span>استایل شما، امضای شماست</span>
        </div>

        <h1 class="lux-editorial-title" aria-label="${esc(heroTitle)}">${heroTitleMarkup}</h1>
        <p class="lux-editorial-subtitle">${esc(heroText)}</p>

        <div class="lux-editorial-features">
          <div class="lux-feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12a8 8 0 0 1 14.93-4M20 12a8 8 0 0 1-14.93 4"/><polyline points="19 4 19 8 15 8"/><polyline points="5 20 5 16 9 16"/></svg>
            <span>راهنمای انتخاب کالا</span>
          </div>
          <div class="lux-feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="4" width="15" height="12" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <span>ارسال سریع</span>
          </div>
          <div class="lux-feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.8 1.2-.3 3L22.9 13l-1.8 2.4.3 3-2.8 1.2-1.2 2.8-3-.3L12 23.9l-2.4-1.8-3 .3-1.2-2.8-2.8-1.2.3-3L1.1 13l1.8-2.4-.3-3 2.8-1.2 1.2-2.8 3 .3L12 2z"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>اطلاعات محصول</span>
          </div>
        </div>

        <div class="hero-actions lux-editorial-actions">
          <a class="lux-pill-btn lux-pill-outline" href="/shop?sort=newest">جدیدترین‌ها</a>
          <a class="btn hero-primary lux-pill-btn lux-pill-gold" href="${esc(cms.heroButtonUrl||'/shop')}">
            <span>${esc(cms.heroButtonText||'مشاهده محصولات')}</span>
            <span class="lux-pill-chevron">‹</span>
          </a>
          <a class="hero-secondary auth-home-cta lux-auth-mini" href="/login" aria-label="ورود یا ثبت‌نام در حساب طوبی">ورود / ثبت‌نام <span>←</span></a>
        </div>
      </div>
    </div>
  </section>

  <section class="trust-section lux-cream-trust" aria-label="مزایای خرید از طوبی">
    <div class="container trust-grid lux-cream-trust-grid">
      <div class="trust-item lux-cream-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1"/></svg>
        <div><b>پرداخت امن</b><span>با تأیید خودکار تراکنش از درگاه بیت‌پی</span></div>
      </div>
      <div class="trust-item lux-cream-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z"/></svg>
        <div><b>پشتیبانی سریع</b><span>همراه شما در انتخاب و خرید</span></div>
      </div>
      <div class="trust-item lux-cream-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m8.5 12 2.3 2.3 4.7-5"/></svg>
        <div><b>جزئیات کالا</b><span>مشخصات هر محصول را پیش از سفارش ببینید</span></div>
      </div>
      <div class="trust-item lux-cream-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 17v-5h5"/><path d="M12 7v5l3 2"/></svg>
        <div><b>راهنمای خرید</b><span>شرایط سفارش را پیش از پرداخت بررسی کنید</span></div>
      </div>
      <div class="trust-item lux-cream-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="20" r="2"/><circle cx="19" cy="20" r="2"/></svg>
        <div><b>${freeShippingActive?'ارسال رایگان':'ارسال مطمئن'}</b><span>${freeShippingActive?`برای خریدهای ${freeShippingThreshold.toLocaleString('fa-IR')} تومان به بالا`:'هزینهٔ ارسال پیش از پرداخت مشخص می‌شود'}</span></div>
      </div>
    </div>
  </section>

  ${categorySection}

  <section class="products-section container latest-products-section"><div class="section-heading"><div><span class="section-eyebrow">تازه‌های طوبی</span><h2>جدیدترین محصولات</h2><p>مدل‌های تازه‌رسیده برای قدم بعدی شما.</p></div><a href="/shop?sort=newest">همهٔ تازه‌رسیده‌ها <span>←</span></a></div><div class="lux-product-grid">${newest.map(card).join('')||'<div class="empty-state">به‌زودی مدل‌های تازه در اینجا قرار می‌گیرند.</div>'}</div></section>
  <section class="products-section container"><div class="section-heading"><div><span class="section-eyebrow">منتخب برای شما</span><h2>انتخاب‌های ویژه طوبی</h2><p>مدل‌هایی که راحتی، کیفیت و سادگی را کنار هم می‌آورند.</p></div><a href="/shop">مشاهده همه محصولات <span>←</span></a></div><div class="lux-product-grid">${featured.slice(0,5).map(card).join('')||'<div class="empty-state">به‌زودی انتخاب‌های ویژه در اینجا قرار می‌گیرند.</div>'}</div></section><section class="collection-banner container"><div class="collection-visual"><img src="${esc(bannerImage)}" alt="کالکشن کفش‌های طوبی" loading="lazy" width="800" height="520"></div><div class="collection-content"><span class="section-eyebrow">از کالکشن تازه دیدن کنید</span><h2>قدم بعدی را<br><em>متفاوت بردار</em></h2><p>${esc(banner?.subtitle||'کفش مناسب استایل و روزهای شما؛ با کیفیتی که ارزش انتخاب دارد.')}</p><a class="btn collection-button" href="${esc(banner?.linkUrl||'/shop')}">${esc(banner?.buttonText||'مشاهده کالکشن')} ${uiIcon('arrow')}</a><span class="collection-watermark">TOUBA</span></div></section><section class="products-section container bestseller-section"><div class="section-heading"><div><span class="section-eyebrow">محبوب همراهان طوبی</span><h2>پرفروش‌های این روزها</h2></div><a href="/shop">رفتن به فروشگاه <span>←</span></a></div><div class="lux-product-grid">${best.slice(0,5).map(card).join('')}</div></section><section class="why-section"><div class="container"><div class="section-heading light-heading"><div><span class="section-eyebrow">چرا طوبی؟</span><h2>کیفیت را در هر قدم حس کنید</h2></div><p>از انتخاب مواد اولیه تا لحظه‌ای که سفارش به دست شما می‌رسد، به جزئیات اهمیت می‌دهیم.</p></div><div class="why-grid">${(cms.advantages||[]).slice(0,4).map((x,i)=>`<article class="why-card"><span class="why-number">۰${i+1}</span><span class="why-icon">${[uiIcon('shield'),uiIcon('heart'),uiIcon('support'),uiIcon('truck')][i]}</span><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join('')}</div></div></section><section class="about-section container"><div class="about-photo-wrap"><img src="${esc(heroImage)}" alt="جزئیات کیفیت کفش طوبی" loading="lazy" width="760" height="650"><span class="about-photo-caption">کیفیت؛ از اولین قدم</span></div><div class="about-copy"><span class="section-eyebrow">آشنایی با ما</span><h2>درباره کفش طوبی</h2><p>${esc(cms.aboutText||db.settings.about||'اطلاعات معرفی فروشگاه هنوز ثبت نشده است.')}</p><a class="btn about-button" href="/about">بیشتر درباره ما ${uiIcon('arrow')}</a><div class="about-signature">طوبی <span>· قدم‌هایی مطمئن</span></div></div></section>${approved.length?`<section class="reviews-section"><div class="container"><div class="section-heading"><div><span class="section-eyebrow">از زبان همراهان ما</span><h2>تجربه خرید مشتریان</h2></div><span class="review-summary">${'★'.repeat(Math.round(averageReviewRating))+'☆'.repeat(Math.max(0,5-Math.round(averageReviewRating)))} <small>${averageReviewRating.toLocaleString('fa-IR',{minimumFractionDigits:1,maximumFractionDigits:1})} از ۵ · ${approved.length.toLocaleString('fa-IR')} دیدگاه تأییدشده</small></span></div><div class="review-grid">${approved.slice(0,3).map(r=>`<article class="customer-review"><div class="review-top"><span class="review-avatar">${esc((r.name||'م').trim().slice(0,1))}</span><div><b>${esc(r.name)}</b><span>${esc(r.product||'خریدار طوبی')}</span></div><div class="review-stars" aria-label="${Number(r.rating)||0} از ۵ ستاره">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(Math.max(0,5-(Number(r.rating)||0)))}</div></div><p>«${esc(r.text)}»</p><time>${r.createdAt?new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric'}).format(new Date(r.createdAt)):'خریدار کفش طوبی'}</time></article>`).join('')}</div></div></section>`:''}<section class="newsletter-section"><div class="container newsletter-card"><div class="newsletter-leaf">${brandLogoImg()}</div><div class="newsletter-copy"><span class="section-eyebrow">همراه طوبی باشید</span><h2>از تخفیف‌های ویژه باخبر شوید</h2><p>خبر کالکشن‌های تازه و پیشنهادهای ویژه را زودتر دریافت کنید.</p></div><form class="newsletter-form" onsubmit="event.preventDefault();subscribeNewsletter(this)"><label class="sr-only" for="newsletter-contact">موبایل یا ایمیل</label><input id="newsletter-contact" name="contact" required placeholder="شماره موبایل یا ایمیل شما"><button type="submit">عضویت <span>←</span></button></form></div></section></main>${footer()}`;
}

async function subscribeNewsletter(form){
  let value=form.elements.contact.value.trim(),normalized=st3Num(value);
  if(!/^09\d{9}$/.test(normalized)&&!/^\S+@\S+\.\S+$/.test(value)){toast('شماره موبایل یا ایمیل معتبر وارد کنید');return}
  try{
    await DataRepositories.newsletterSubscribers.create({contact:/^09\d{9}$/.test(normalized)?normalized:value});
    form.reset();toast('عضویت شما در پایگاه داده ثبت شد؛ ممنون که همراه طوبی هستید');
  }catch(error){toast(error.message||'ثبت عضویت خبرنامه انجام نشد.')}
}

async function toggleFav(el,id){
  const p=product(id),isFavorite=Array.isArray(db.settings.favorites)&&db.settings.favorites.includes(id),on=!isFavorite;
  if(!ToubaAuth.currentUser?.id){toast('برای همگام‌سازی علاقه‌مندی‌ها با پایگاه داده ابتدا وارد شوید.');return}
  try{
    if(on)await DataRepositories.favorites.create({productId:id});else await DataRepositories.favorites.delete(id);
  }catch(error){toast(error.message||'ذخیرهٔ علاقه‌مندی انجام نشد.');return}
  if(el){
    el.classList.toggle('is-favorite',on);el.classList.toggle('liked',on);el.innerHTML=uiIcon('heart');
    el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',`${on?'حذف':'افزودن'} ${p?.name||'محصول'} ${on?'از':'به'} علاقه‌مندی‌ها`);
    el.classList.remove('heart-pop');void el.offsetWidth;el.classList.add('heart-pop');
  }
  document.querySelectorAll('.wishlist-action').forEach(link=>{link.setAttribute('aria-label',`علاقه‌مندی‌ها (${favoritesCount()} محصول)`);let badge=link.querySelector('.count');if(favoritesCount()&&!badge){badge=document.createElement('span');badge.className='count';link.appendChild(badge)}if(badge){badge.textContent=String(favoritesCount());badge.hidden=!favoritesCount()}});
  toast(on?'به علاقه‌مندی‌های همگام‌شده اضافه شد':'از علاقه‌مندی‌های همگام‌شده حذف شد');
  if(path()==='/wishlist')render();
}

function showModal(content,title='کفش طوبی'){
  let root=$('#modal-root');
  root.innerHTML=`<div class="modal-back" role="presentation" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2><button class="close" aria-label="بستن پنجره" onclick="closeModal()">×</button></div>${content}</div></div>`;
  root.querySelector('[role="dialog"]')?.focus();
}

function showSizeGuide(){
  showModal(`<div class="size-guide-content"><p>برای انتخاب دقیق، پاشنه را به دیوار تکیه دهید و بلندترین فاصله انگشت تا دیوار را اندازه بگیرید. اگر بین دو سایز هستید، سایز بزرگ‌تر را انتخاب کنید.</p><div class="size-guide-table-wrap"><table class="size-guide-table"><thead><tr><th>سایز</th><th>طول تقریبی پا</th><th>پیشنهاد</th></tr></thead><tbody><tr><td>۳۷–۳۸</td><td>۲۳ تا ۲۴ سانتی‌متر</td><td>زنانه</td></tr><tr><td>۳۹–۴۰</td><td>۲۴٫۵ تا ۲۵٫۵ سانتی‌متر</td><td>زنانه / مردانه</td></tr><tr><td>۴۱–۴۲</td><td>۲۶ تا ۲۷ سانتی‌متر</td><td>مردانه</td></tr><tr><td>۴۳–۴۴</td><td>۲۷٫۵ تا ۲۸٫۵ سانتی‌متر</td><td>مردانه</td></tr></tbody></table></div><small>این اندازه‌ها راهنمای تقریبی هستند؛ قالب مدل‌ها ممکن است کمی متفاوت باشد.</small></div>`,`راهنمای انتخاب سایز`);
}
function bindProductGallerySwipe(){
  let gallery=document.querySelector('#product-gallery');
  if(!gallery||gallery.dataset.swipeBound)return;
  gallery.dataset.swipeBound='true';
  let startX=null,suppressClickUntil=0;
  gallery.addEventListener('touchstart',event=>{startX=event.changedTouches?.[0]?.clientX??null},{passive:true});
  gallery.addEventListener('touchend',event=>{
    if(startX===null)return;
    let delta=(event.changedTouches?.[0]?.clientX??startX)-startX;startX=null;
    if(Math.abs(delta)<42)return;
    suppressClickUntil=Date.now()+450;
    let thumbs=[...document.querySelectorAll('.gallery-thumb')];
    if(thumbs.length<2)return;
    let current=Math.max(0,thumbs.findIndex(button=>button.classList.contains('selected')));
    thumbs[(current+(delta<0?1:-1)+thumbs.length)%thumbs.length].click();
  },{passive:true});
  gallery.addEventListener('click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopPropagation()}},true);
}
function productDetailWithSticky(id){
  let html=__stage3Detail(id);
  html=html.replace('<div class="detail-row"><b>انتخاب سایز','<div class="size-guide-row"><span>برای اندازه دقیق پا نیاز به راهنمایی دارید؟</span><button class="size-guide-link" type="button" onclick="showSizeGuide()">راهنمای سایز</button></div><div class="detail-row"><b>انتخاب سایز');
  return html.replace('</main>',`<div class="mobile-product-bar"><div><small>قیمت</small><b>${toman(product(id)?.price)}</b></div><button class="btn" onclick="addCart('${id}',productQtyValue(),true)">افزودن به سبد</button></div></main>`);
}

/* ==========================================================================
   Fluid Animations & Transitions Engine
   ========================================================================== */

function triggerNavProgress(){
  let bar=document.querySelector('#nav-progress-bar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='nav-progress-bar';
    bar.className='nav-progress-bar';
    if(document.body&&typeof document.body.appendChild==='function'){document.body.appendChild(bar);}
  }
  if(!bar.classList) return;
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

let __isStage4Rendering=false;
function animatedRender(isPageTransition=false){
  if(__isStage4Rendering)return;
  __isStage4Rendering=true;
  try{
  let appEl=document.querySelector('#app');
  let currentUrl=location.pathname+location.search;
  let isNewPage=isPageTransition||(currentUrl!==lastRenderedUrl);
  lastRenderedUrl=currentUrl;

  if(isNewPage){
    triggerNavProgress();
  }

  const doRender=()=>{
    const adminRoute=location.pathname==='/admin'||location.pathname.startsWith('/admin/');
    const body=document.body;
    if(body?.classList){if(adminRoute)body.classList.remove('storefront-mode');else body.classList.add('storefront-mode');body.classList.remove('has-commerce-sticky')}
    if(body?.dataset)body.dataset.route=location.pathname;
    if(adminRoute&&window.ToubaAuthUI?.adminPage){
      document.body.classList.remove('admin-body');
      appEl.innerHTML=window.ToubaAuthUI.adminPage();
      const s=new URLSearchParams(location.search).get('section')||'dashboard';
      if(window.ToubaAuthUI?.loadAdminSection){
        window.ToubaAuthUI.loadAdminSection(s);
      }
    }else if(location.pathname==='/wishlist'){
      appEl.innerHTML=wishlistPage();
    }else if(typeof __stage3BaseRender==='function'){
      __stage3BaseRender();
    }
    if(location.pathname==='/checkout'&&appEl?.querySelector?.('#checkout-form')){
      setCheckoutStep(window.__checkoutStep||1,{focus:false,scroll:false});
    }
    let mainContent=appEl?.querySelector?.('main');
    if(mainContent&&!mainContent.id)mainContent.id='main-content';
    if(appEl?.querySelector?.('.mobile-product-bar, .mobile-cart-sticky-bar'))body?.classList?.add('has-commerce-sticky');
    if(!adminRoute)bindProductGallerySwipe();
    if(typeof updateSEO==='function'){
      updateSEO();
    }
    if(isNewPage&&appEl&&appEl.classList){
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
  }finally{
    __isStage4Rendering=false;
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
if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
  window.addEventListener('popstate',()=>{
    animatedRender(true);
  });
}

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
  let q=document.querySelector('#qty');
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
window.scrollCatRow=scrollCatRow;
(function hookCategoryArrows(){
  window.updateCatArrows=updateCatArrows;
  window.addEventListener('resize',updateCatArrows,{passive:true});
  let base=window.render;
  if(typeof base==='function'&&!base.__catArrows){
    let wrapped=function(){base.apply(this,arguments);requestAnimationFrame(updateCatArrows)};
    wrapped.__catArrows=1;window.render=wrapped;
  }
})();
window.header=header;
window.home=home;
window.toggleFav=toggleFav;
window.toggleStoreTheme=toggleStoreTheme;
window.showSizeGuide=showSizeGuide;
window.openShopFilters=openShopFilters;
window.closeShopFilters=closeShopFilters;
window.openShopSortSheet=openShopSortSheet;
window.wishlistPage=wishlistPage;
window.go=smoothGo;
window.shop=modernShop;
window.checkout=modernCheckout;
window.tracking=modernTracking;
window.contentPage=modernContentPage;
window.render=animatedRender;
window.animateCartBadge=animateCartBadge;

animatedRender(true);



/* ==========================================================================
   Modern Luxury Views: Shop, Checkout, Tracking, Content
   ========================================================================== */
function openShopFilters(){
  let panel=document.querySelector('#shop-filters'),backdrop=document.querySelector('#shop-filter-backdrop'),button=document.querySelector('.filter-open');
  if(panel)panel.classList.add('drawer-open');
  if(backdrop){backdrop.classList.add('show');backdrop.setAttribute('aria-hidden','false')}
  if(button)button.setAttribute('aria-expanded','true');
  document.body.classList.add('filter-sheet-open');
}
function closeShopFilters(){
  document.querySelector('#shop-filters')?.classList.remove('drawer-open');
  let backdrop=document.querySelector('#shop-filter-backdrop');if(backdrop){backdrop.classList.remove('show');backdrop.setAttribute('aria-hidden','true')}
  let button=document.querySelector('.filter-open');if(button)button.setAttribute('aria-expanded','false');
  document.body.classList.remove('filter-sheet-open');
}
function openShopSortSheet(){
  const options=[['popular','محبوب‌ترین'],['newest','جدیدترین'],['cheap','ارزان‌ترین'],['expensive','گران‌ترین']];
  showModal(`<div class="shop-sort-sheet"><p>نمایش محصولات بر اساس</p><div class="shop-sort-options">${options.map(([value,label])=>`<label><input type="radio" name="mobile-sort" value="${value}" ${shopState.sort===value?'checked':''} onchange="setShopSort(this.value);closeModal()"><span>${label}</span></label>`).join('')}</div></div>`,`مرتب‌سازی محصولات`);
}

function modernShop(forceCategory = "") {
  let params = new URLSearchParams(location.search);
  shopState = {
    ...shopState,
    q: params.get("q") || "",
    categories: params.get("category") ? [params.get("category")] : forceCategory ? [forceCategory] : [],
    min: "",
    max: "",
    sizes: [],
    colors: [],
    sort: params.get("sort") || "popular",
    page: 1,
    pageSize: 8
  };
  let visibleCats = db.categories.filter(c => c.active);
  let activeCatName = shopState.categories.length ? (db.categories.find(c => c.id === shopState.categories[0])?.name || "دسته‌بندی منتخب") : "";

  return `${header()}<main class="page container">
    <div class="breadcrumb"><a href="/">خانه</a>　/　<span>فروشگاه محصولات</span>${activeCatName ? "　/　<span>" + esc(activeCatName) + "</span>" : ""}</div>

    <div class="shop-hero-bar">
      <div>
        <h1 class="page-title">${shopState.q ? `نتایج جستجو برای: «${esc(shopState.q)}»` : activeCatName ? `خرید ${esc(activeCatName)}` : "خرید اینترنتی کفش از طوبی"}</h1>
        <p class="shop-hero-sub">قیمت، سایزبندی، رنگ و موجودی ثبت‌شدهٔ هر مدل را پیش از سفارش بررسی کنید.</p>
      </div>
      <div class="shop-hero-badges">
        <span class="shop-badge">${uiIcon("shield")} انتخاب سایز و رنگ</span>
        <span class="shop-badge">${uiIcon("truck")} شرایط ارسال پیش از پرداخت</span>
      </div>
    </div>

    <div class="shop-toolbar">
      <button type="button" class="btn outline small filter-open" onclick="openShopFilters()" aria-controls="shop-filters" aria-expanded="false">
        ${uiIcon("sliders")} فیلترها
      </button>
      <span id="shop-result-count" class="shop-result-count" aria-live="polite"></span>
      <button type="button" class="btn outline small mobile-sort-trigger" onclick="openShopSortSheet()">مرتب‌سازی</button>
      <div class="shop-sort-wrap">
        <label for="shop-sort">مرتب‌سازی:</label>
        <select id="shop-sort" onchange="setShopSort(this.value)">
          <option value="popular" ${shopState.sort==='popular'?'selected':''}>محبوب‌ترین و پرفروش</option>
          <option value="newest" ${shopState.sort==='newest'?'selected':''}>جدیدترین مدل‌ها</option>
          <option value="cheap" ${shopState.sort==='cheap'?'selected':''}>ارزان‌ترین قیمت</option>
          <option value="expensive" ${shopState.sort==='expensive'?'selected':''}>گران‌ترین و لوکس‌ترین</option>
        </select>
      </div>
    </div>

    <div class="shop-layout">
      <div id="shop-filter-backdrop" class="shop-filter-backdrop" aria-hidden="true" onclick="closeShopFilters()"></div>
      <aside class="filter-panel" id="shop-filters" aria-label="فیلتر محصولات">
        <div class="filter-header">
          <h3>فیلتر محصولات</h3>
          <button type="button" class="filter-close" onclick="closeShopFilters()">✕ بستن</button>
        </div>

        <div class="filter-group">
          <b>جستجوی سریع</b>
          <input class="filter-search" value="${esc(shopState.q)}" oninput="shopState.q=this.value;shopState.page=1;renderShopResults()" placeholder="نام مدل یا کد SKU...">
        </div>

        <div class="filter-group">
          <b>دسته‌بندی‌ها</b>
          ${visibleCats.map(c => `
            <label class="filter-checkbox-label">
              <input type="checkbox" value="${c.id}" ${shopState.categories.includes(c.id) ? "checked" : ""} onchange="toggleShopFilter('categories',this.value,this.checked)">
              <span>${esc(c.name)}</span>
              <small>${db.products.filter(p => p.active && p.category === c.id).length.toLocaleString("fa-IR")}</small>
            </label>
          `).join("")}
        </div>

        <div class="filter-group">
          <b>محدوده قیمت (تومان)</b>
          <div class="range">
            <input id="minprice" type="number" placeholder="از" oninput="shopState.min=this.value;shopState.page=1;renderShopResults()">
            <input id="maxprice" type="number" placeholder="تا" oninput="shopState.max=this.value;shopState.page=1;renderShopResults()">
          </div>
        </div>

        <div class="filter-group">
          <b>سایز</b>
          <div class="filter-pills">
            ${[...new Set(db.products.flatMap(p => p.variants.map(v => v.size)))].map(x => `
              <label class="size-pill-label">
                <input type="checkbox" value="${esc(x)}" onchange="toggleShopFilter('sizes',this.value,this.checked)">
                <span>${esc(x)}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="filter-group">
          <b>رنگ</b>
          <div class="filter-pills">
            ${[...new Set(db.products.flatMap(p => p.variants.map(v => v.color)))].map(x => `
              <label class="color-pill-label">
                <input type="checkbox" value="${esc(x)}" onchange="toggleShopFilter('colors',this.value,this.checked)">
                <span>${esc(x)}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <button type="button" class="action filter-clear-btn" onclick="clearShopFilters()">پاک کردن فیلترها</button>
      </aside>

      <section class="shop-main-section">
        <div class="products shop-grid" id="shop-grid"></div>
        <div id="shop-pagination" class="pagination"></div>
      </section>
    </div>
  </main>${footer()}`;
}

function saveCheckoutDraft(form) {
  if (!form || typeof FormData === "undefined") return;
  const draft = {};
  for (const [key, value] of new FormData(form).entries()) draft[key] = String(value);
  window.__checkoutDraft = draft;
}

function checkoutStepIsValid(step) {
  const page = document.querySelector(`[data-checkout-page="${Number(step)}"]`);
  if (!page) return false;
  const requiredFields = Array.from(page.querySelectorAll("input[required], select[required], textarea[required]"));
  for (const field of requiredFields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      field.focus();
      return false;
    }
  }
  return true;
}

function updateCheckoutReview() {
  const form = document.querySelector("#checkout-form");
  if (!form) return;
  const value = name => String(form.elements.namedItem(name)?.value || "").trim();
  const put = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text || "—";
  };
  put("checkout-review-name", value("name"));
  put("checkout-review-phone", value("phone"));
  put("checkout-review-region", [value("province"), value("city")].filter(Boolean).join("، "));
  put("checkout-review-address", value("address"));
  put("checkout-review-postal", value("postal"));
  const selectedShipping = form.querySelector('[name="shippingMethod"]:checked');
  const shippingLabel = selectedShipping?.closest(".shipping-option");
  const shippingName = shippingLabel?.querySelector(".shipping-meta b")?.textContent?.trim() || "روش ارسال انتخاب‌شده";
  const shippingCost = shippingLabel?.querySelector(".shipping-cost")?.textContent?.trim() || "";
  put("checkout-review-shipping", shippingCost ? `${shippingName} — ${shippingCost}` : shippingName);
  const noteRow = document.getElementById("checkout-review-note-row");
  if (noteRow) {
    const note = value("note");
    noteRow.hidden = !note;
    put("checkout-review-note", note);
  }
}

function setCheckoutStep(step, options = {}) {
  const form = document.querySelector("#checkout-form");
  if (!form) return;
  const activeStep = Math.min(3, Math.max(1, Number(step) || 1));
  window.__checkoutStep = activeStep;
  form.dataset.checkoutStep = String(activeStep);
  saveCheckoutDraft(form);

  form.querySelectorAll("[data-checkout-page]").forEach(page => {
    page.hidden = Number(page.dataset.checkoutPage) !== activeStep;
  });
  form.querySelectorAll("[data-checkout-timeline-step]").forEach(item => {
    const itemStep = Number(item.dataset.checkoutTimelineStep);
    item.classList.toggle("is-active", itemStep === activeStep);
    item.classList.toggle("is-complete", itemStep < activeStep);
    if (itemStep === activeStep) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    const number = item.querySelector(".checkout-timeline-number");
    if (number) number.textContent = itemStep < activeStep ? "✓" : ["۱", "۲", "۳"][itemStep - 1];
  });
  const progress = document.getElementById("checkout-timeline-progress");
  if (progress) progress.style.width = `${((activeStep - 1) / 2) * 100}%`;
  const status = document.getElementById("checkout-step-status");
  if (status) status.textContent = [
    "مرحلهٔ ۱ از ۳ — اطلاعات تماس",
    "مرحلهٔ ۲ از ۳ — نشانی و ارسال",
    "مرحلهٔ ۳ از ۳ — بازبینی و پرداخت"
  ][activeStep - 1];
  const submit = form.querySelector(".checkout-submit-btn");
  if (submit) submit.disabled = activeStep !== 3;
  if (activeStep === 3) updateCheckoutReview();

  if (options.focus !== false) {
    document.getElementById(`checkout-step-title-${activeStep}`)?.focus({ preventScroll: true });
    if (options.scroll !== false) document.querySelector(".checkout-flow-header")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function nextCheckoutStep() {
  const form = document.querySelector("#checkout-form");
  if (!form) return;
  const current = Number(form.dataset.checkoutStep || window.__checkoutStep || 1);
  if (current >= 3) return;
  saveCheckoutDraft(form);
  if (!checkoutStepIsValid(current)) return;
  setCheckoutStep(current + 1);
}

function modernCheckout() {
  if (!db.cart.length) {
    smoothGo("/cart");
    return "";
  }
  const draft = window.__checkoutDraft || {};
  const draftValue = (name, fallback = "") => String(draft[name] ?? fallback);
  const provinceValue = draftValue("province");
  const shippingOptions = StoreServices.shipping.options(getCartTotals().subtotal);
  const selectedShipping = shippingOptions.some(x => x.id === draftValue("shippingMethod") && x.available)
    ? draftValue("shippingMethod")
    : "normal";
  const tot = checkoutTotals(selectedShipping);
  const provinces = ["آذربایجان شرقی", "آذربایجان غربی", "اردبیل", "اصفهان", "البرز", "ایلام", "بوشهر", "تهران", "چهارمحال و بختیاری", "خراسان جنوبی", "خراسان رضوی", "خراسان شمالی", "خوزستان", "زنجان", "سمنان", "سیستان و بلوچستان", "فارس", "قزوین", "قم", "کردستان", "کرمان", "کرمانشاه", "کهگیلویه و بویراحمد", "گلستان", "گیلان", "لرستان", "مازندران", "مرکزی", "هرمزگان", "همدان", "یزد"];

  return `${header()}<main class="page container">
    <div class="breadcrumb"><a href="/">خانه</a>　/　<a href="/cart">سبد خرید</a>　/　<span>تسویه حساب امن</span></div>
    <h1 class="page-title">تکمیل سفارش</h1>

    <form id="checkout-form" class="checkout-layout" novalidate oninput="saveCheckoutDraft(this)" onchange="saveCheckoutDraft(this)">
      <div class="checkout-flow-header" role="group" aria-label="پیشرفت مراحل تسویه حساب">
        <div class="checkout-flow-intro">
          <h2>سفارش را در ۳ مرحله ساده تکمیل کنید</h2>
          <p>هر مرحله را جداگانه انجام دهید؛ اطلاعات و مبلغ سفارش در کنار صفحه در دسترس است.</p>
        </div>
        <div class="checkout-timeline-wrap">
          <div class="checkout-timeline-track" aria-hidden="true"><span id="checkout-timeline-progress"></span></div>
          <ol class="checkout-timeline" aria-label="مراحل تکمیل سفارش">
            <li class="is-active" data-checkout-timeline-step="1" aria-current="step"><span class="checkout-timeline-number">۱</span><span class="checkout-timeline-label">اطلاعات تماس</span></li>
            <li data-checkout-timeline-step="2"><span class="checkout-timeline-number">۲</span><span class="checkout-timeline-label">نشانی و ارسال</span></li>
            <li data-checkout-timeline-step="3"><span class="checkout-timeline-number">۳</span><span class="checkout-timeline-label">بازبینی و پرداخت</span></li>
          </ol>
        </div>
        <p id="checkout-step-status" class="checkout-step-status" aria-live="polite">مرحلهٔ ۱ از ۳ — اطلاعات تماس</p>
      </div>

      <section class="checkout-info-col">
        <section class="checkout-step-page" data-checkout-page="1" aria-labelledby="checkout-step-title-1">
          <div class="panel checkout-panel">
            <div class="panel-head-row">
              <h2 id="checkout-step-title-1" class="checkout-step-title" tabindex="-1">۱. اطلاعات تماس</h2>
              <span class="panel-step-badge">مرحله ۱ از ۳</span>
            </div>
            <p class="checkout-step-description">نام تحویل‌گیرنده و شماره‌ای را وارد کنید که برای هماهنگی ارسال در دسترس باشد.</p>
            <div class="form-grid">
              <div class="field">
                <label for="co-name">نام و نام خانوادگی تحویل‌گیرنده *</label>
                <input id="co-name" required minlength="3" name="name" autocomplete="name" value="${esc(draftValue("name", db.currentUser?.name || ""))}" placeholder="نام و نام خانوادگی">
              </div>
              <div class="field">
                <label for="co-phone">شماره موبایل برای هماهنگی تحویل *</label>
                <input id="co-phone" required inputmode="numeric" pattern="[0-9۰-۹٠-٩]{11}" maxlength="11" name="phone" autocomplete="tel" value="${esc(draftValue("phone", db.currentUser?.phone || ""))}" placeholder="۰۹۱۲۳۴۵۶۷۸۹">
              </div>
            </div>
            <div class="checkout-step-actions">
              <a class="btn outline" href="/cart">بازگشت به سبد خرید</a>
              <button type="button" class="btn" onclick="nextCheckoutStep()">ادامه به نشانی و ارسال ←</button>
            </div>
          </div>
        </section>

        <section class="checkout-step-page" data-checkout-page="2" aria-labelledby="checkout-step-title-2" hidden>
          <div class="panel checkout-panel">
            <div class="panel-head-row">
              <h2 id="checkout-step-title-2" class="checkout-step-title" tabindex="-1">۲. نشانی و روش ارسال</h2>
              <span class="panel-step-badge">مرحله ۲ از ۳</span>
            </div>
            <p class="checkout-step-description">نشانی دقیق و کد پستی را وارد کنید تا سفارش به‌درستی به دستتان برسد.</p>
            <div class="form-grid">
              <div class="field">
                <label for="co-prov">استان *</label>
                <select id="co-prov" required name="province" autocomplete="address-level1">
                  <option value="">انتخاب استان</option>
                  ${provinces.map(x => `<option value="${esc(x)}" ${provinceValue === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="co-city">شهر *</label>
                <input id="co-city" required minlength="2" name="city" autocomplete="address-level2" value="${esc(draftValue("city"))}" placeholder="نام شهر">
              </div>
              <div class="field full">
                <label for="co-addr">نشانی کامل پستی *</label>
                <textarea id="co-addr" required minlength="10" name="address" autocomplete="street-address" placeholder="خیابان، کوچه، پلاک، طبقه و واحد">${esc(draftValue("address"))}</textarea>
              </div>
              <div class="field">
                <label for="co-postal">کد پستی ۱۰ رقمی *</label>
                <input id="co-postal" required inputmode="numeric" pattern="[0-9۰-۹٠-٩]{10}" maxlength="10" name="postal" autocomplete="postal-code" value="${esc(draftValue("postal"))}" placeholder="کد پستی بدون خط تیره">
              </div>
              <div class="field">
                <label for="co-note">یادداشت برای تحویل (اختیاری)</label>
                <input id="co-note" name="note" value="${esc(draftValue("note"))}" placeholder="مثلاً: بعدازظهر ارسال شود">
              </div>
            </div>
            <div class="detail-row checkout-shipping-detail">
              <b>روش ارسال</b>
              <div class="shipping-options-list">
                ${shippingOptions.map(x => `
                  <label class="shipping-option ${x.id === selectedShipping ? "selected" : ""}">
                    <div class="shipping-meta">
                      <input type="radio" name="shippingMethod" value="${esc(x.id)}" ${x.id === selectedShipping ? "checked" : ""} ${x.available ? "" : "disabled"} required onchange="refreshCheckoutTotals()">
                      <div>
                        <b>${esc(x.name)}</b>
                        <small>${x.id === "free" ? "با رسیدن مبلغ خرید به حد تعیین‌شده، ارسال رایگان می‌شود." : x.id === "express" ? "ارسال سریع‌تر با بسته‌بندی ایمن." : "ارسال استاندارد با بسته‌بندی ایمن جعبه کفش."}</small>
                      </div>
                    </div>
                    <span class="shipping-cost">${x.cost ? toman(x.cost) : "رایگان"}</span>
                  </label>
                `).join("")}
              </div>
            </div>
            <div class="checkout-step-actions">
              <button type="button" class="btn outline" onclick="setCheckoutStep(1)">بازگشت به اطلاعات تماس</button>
              <button type="button" class="btn" onclick="nextCheckoutStep()">ادامه به بازبینی سفارش ←</button>
            </div>
          </div>
        </section>

        <section class="checkout-step-page" data-checkout-page="3" aria-labelledby="checkout-step-title-3" hidden>
          <div class="panel checkout-panel">
            <div class="panel-head-row">
              <h2 id="checkout-step-title-3" class="checkout-step-title" tabindex="-1">۳. بازبینی و پرداخت</h2>
              <span class="panel-step-badge">مرحله ۳ از ۳</span>
            </div>
            <p class="checkout-step-description">اطلاعات گیرنده و نشانی را بررسی کنید؛ در صورت نیاز با «ویرایش» به همان بخش برگردید.</p>
            <div class="checkout-review-card" aria-label="بازبینی اطلاعات سفارش">
              <div class="checkout-review-row">
                <div class="checkout-review-value"><span>تحویل‌گیرنده</span><b id="checkout-review-name">—</b><b id="checkout-review-phone" dir="ltr">—</b></div>
                <button type="button" class="checkout-review-edit" onclick="setCheckoutStep(1)">ویرایش</button>
              </div>
              <div class="checkout-review-row">
                <div class="checkout-review-value"><span>نشانی ارسال</span><b id="checkout-review-region">—</b><b id="checkout-review-address">—</b><small>کد پستی: <b id="checkout-review-postal">—</b></small></div>
                <button type="button" class="checkout-review-edit" onclick="setCheckoutStep(2)">ویرایش</button>
              </div>
              <div class="checkout-review-row">
                <div class="checkout-review-value"><span>روش ارسال</span><b id="checkout-review-shipping">—</b></div>
                <button type="button" class="checkout-review-edit" onclick="setCheckoutStep(2)">ویرایش</button>
              </div>
              <div class="checkout-review-row" id="checkout-review-note-row" hidden>
                <div class="checkout-review-value"><span>یادداشت تحویل</span><b id="checkout-review-note">—</b></div>
                <button type="button" class="checkout-review-edit" onclick="setCheckoutStep(2)">ویرایش</button>
              </div>
            </div>

            <div class="checkout-final-payment">
              <h3>روش پرداخت</h3>
              <label class="payment-method-card active-method">
                <div class="pm-head">
                  <input type="radio" name="paymentMethod" value="bitpay" checked required>
                  <div>
                    <b>پرداخت مستقیم بانکی از طریق بیت‌پی</b>
                    <small>با ادامه، به صفحهٔ امن درگاه منتقل می‌شوید. اطلاعات کارت را فقط در صفحهٔ بانک وارد کنید.</small>
                  </div>
                </div>
                <span class="pm-logo">بیت‌پی</span>
              </label>
            </div>
            <div class="checkout-step-actions checkout-final-actions">
              <button type="button" class="btn outline" onclick="setCheckoutStep(2)">بازگشت به نشانی</button>
              <button type="submit" class="btn checkout-submit-btn" disabled>ثبت سفارش و پرداخت امن ←</button>
            </div>
            <p class="checkout-payment-safety">شماره کارت، CVV2 یا رمز بانکی را در این سایت وارد نکنید؛ پرداخت در صفحهٔ رسمی بانک انجام می‌شود.</p>
          </div>
        </section>
      </section>

      <aside class="cart-summary checkout-summary" id="checkout-summary">
        <h3>خلاصه فاکتور خرید (${db.cart.reduce((n, x) => n + x.qty, 0).toLocaleString("fa-IR")} کالا)</h3>
        <div class="checkout-items-preview">
          ${db.cart.map(i => {
            let p = product(i.id);
            return `<div class="checkout-item-line">
              <div class="item-desc">
                <b>${esc(p?.name || "")}</b>
                <small>سایز ${esc(i.size)} · رنگ ${esc(i.color)} × ${i.qty}</small>
              </div>
              <span class="item-cost">${toman((p?.price || 0) * i.qty)}</span>
            </div>`;
          }).join("")}
        </div>
        <div class="coupon-box-modern">
          <label for="checkout-coupon">کد تخفیف</label>
          <div class="coupon-row">
            <input id="checkout-coupon" name="checkoutCoupon" class="select" placeholder="کد تخفیف" value="${esc(db.coupon?.code || draftValue("checkoutCoupon"))}">
            <button type="button" class="btn small" onclick="applyCheckoutCoupon()">ثبت کد</button>
          </div>
        </div>
        <div id="checkout-totals" class="checkout-totals-modern">
          <div class="summary-line"><span>مبلغ کالاها</span><b>${toman(tot.subtotal)}</b></div>
          ${tot.discount ? `<div class="summary-line discount-line"><span>تخفیف</span><b>− ${toman(tot.discount)}</b></div>` : ""}
          <div class="summary-line"><span>هزینه ارسال</span><b id="ship-total">${tot.shipping ? toman(tot.shipping) : "رایگان"}</b></div>
          <div class="summary-line total"><span>مبلغ قابل پرداخت</span><b>${toman(tot.total)}</b></div>
        </div>
        <div class="checkout-trust-features">
          <span>${uiIcon("shield")} مبلغ و روش پرداخت پیش از ثبت نهایی نمایش داده می‌شود.</span>
          <span>${uiIcon("truck")} بسته‌بندی ایمن و امکان پیگیری سفارش.</span>
        </div>
      </aside>
    </form>
  </main>${footer()}`;
}
function modernTracking() {
  return `${header()}<main class="page container">
    <div class="breadcrumb"><a href="/">خانه</a>　/　<span>پیگیری سفارش</span></div>

    <div class="tracking-wrap-modern">
      <form class="auth-card tracking-card-modern" onsubmit="event.preventDefault();track(this.code.value)">
        <div class="tracking-icon-emblem">📦</div>
        <h1>پیگیری وضعیت سفارش</h1>
        <p class="tracking-desc">شماره سفارش (مانند TB-2408) یا کد رهگیری را وارد نمایید تا آخرین وضعیت ارسال و پردازش انبار نمایش داده شود.</p>

        <div class="field">
          <label for="track-code">شماره سفارش یا کد رهگیری پستی</label>
          <input id="track-code" name="code" required placeholder="مثلاً TB-2408" autocomplete="off">
        </div>

        <button class="btn" style="width:100%">استعلام آخرین وضعیت</button>

        <div id="tracking-result" class="tracking-result-box"></div>
      </form>
    </div>
  </main>${footer()}`;
}

async function submitContactMessage(form){
  const data=new FormData(form),message={name:String(data.get('name')||'').trim(),phone:st3Num(data.get('phone')),message:String(data.get('message')||'').trim()};
  try{await DataRepositories.contactMessages.create(message);form.reset();toast('پیام شما مستقیماً در پایگاه داده ثبت شد؛ پشتیبانی با شما تماس می‌گیرد.');}
  catch(error){toast(error.message||'ثبت پیام پشتیبانی انجام نشد.')}
}

function modernContentPage(type) {
  const defaults={
    about:['درباره کفش طوبی',db.settings.homepage?.aboutText||db.settings.about||'اطلاعات معرفی فروشگاه هنوز ثبت نشده است.'],
    contact:['تماس با ما',''],
    terms:['شرایط و قوانین','شرایط خرید و ارسال را پیش از ثبت سفارش بررسی کنید. در صورت نیاز به راهنمایی، از فرم تماس با پشتیبانی استفاده کنید.'],
    privacy:['حریم خصوصی کاربران','اطلاعاتی که هنگام ثبت‌نام، سفارش یا ارسال پیام وارد می‌کنید برای ارائه خدمات فروشگاه در پایگاه داده نگهداری می‌شود. اطلاعات پرداخت کارت در صفحهٔ رسمی درگاه وارد می‌شود و در این فروشگاه دریافت یا ذخیره نمی‌شود.']
  };
  const [defaultTitle,defaultBody]=defaults[type]||['صفحه اطلاعات','اطلاعاتی برای نمایش ثبت نشده است.'];
  const publishedPage=(db.pageContents||[]).find(page=>page.key===type&&page.published);
  const title=publishedPage?.title||defaultTitle;
  let body=publishedPage?.body||defaultBody;
  if(type==='contact'&&!publishedPage){
    const details=[db.settings.phone&&`شماره تماس پشتیبانی: ${db.settings.phone}`,db.settings.address&&`نشانی فروشگاه: ${db.settings.address}`].filter(Boolean);
    body=details.length?`راه‌های تماس ثبت‌شده:\n${details.join('\n')}`:'اطلاعات تماس فروشگاه هنوز توسط مدیریت ثبت نشده است.';
  }
  const bodyHtml=esc(body).replace(/\r?\n/g,'<br>');
  return `${header()}<main class="page container">
    <div class="breadcrumb"><a href="/">خانه</a>　/　<span>${esc(title)}</span></div>
    <div class="panel content-panel-modern">
      <h1 class="page-title">${esc(title)}</h1>
      <div class="content-body-modern"><p>${bodyHtml}</p></div>
      ${type==='contact'?`<div class="contact-form-modern">
        <h3>ارسال پیام به پشتیبانی</h3>
        <form class="form-grid" onsubmit="event.preventDefault();submitContactMessage(this)">
          <div class="field"><label>نام و نام خانوادگی</label><input name="name" required minlength="3" maxlength="100" placeholder="نام شما"></div>
          <div class="field"><label>شماره تماس</label><input name="phone" required inputmode="numeric" placeholder="۰۹۱۲۳۴۵۶۷۸۹"></div>
          <div class="field full"><label>پیام شما</label><textarea name="message" required minlength="10" maxlength="5000" placeholder="متن پیام خود را بنویسید..."></textarea></div>
          <button class="btn">ارسال پیام</button>
        </form>
      </div>`:''}
    </div>
  </main>${footer()}`;
}

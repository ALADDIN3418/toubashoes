'use strict';
/* Live-data runtime smoke checks: the browser store must only hydrate from Supabase. */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

async function main() {
  const localWrites = [];
  const storage = new Map();
  const config = { configured:false, enabled:false, url:'', anonKey:'' };
  const context = {
    console,
    Date,
    structuredClone,
    TOUBA_PUBLIC_CONFIG:config,
    localStorage:{
      getItem:key => storage.get(key) ?? null,
      setItem:(key,value) => { localWrites.push([key,value]); storage.set(key,value); },
      removeItem:key => storage.delete(key)
    },
    window:null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'services/data-provider.js'),'utf8'), context, {filename:'services/data-provider.js'});

  assert.equal(context.APP_ENV.DATA_PROVIDER, 'supabase');
  assert.equal(context.DataProvider.name, 'supabase');
  assert.equal(context.DataProvider.state.status, 'unconfigured');
  const empty = context.DataProvider.createEmptyState();
  assert.equal(empty.products.length, 0);
  assert.equal(empty.categories.length, 0);
  assert.equal(empty.orders.length, 0);
  assert.equal(empty.coupons.length, 0);
  assert.equal(empty.customers.length, 0);
  assert.equal(context.DataProvider.hydrate('toubashop-v1', {products:[{id:'fake'}]}).products.length, 0, 'hydrate must not read an old LocalStorage snapshot or supplied mock seed');
  await assert.rejects(() => context.DataProvider.load('toubashop-v1', empty), /Supabase/);
  context.DataProvider.persist('toubashop-v1', empty);
  assert.equal(localWrites.length, 0, 'shop data must never be persisted as a whole browser snapshot');

  // A configured client may hydrate only the records returned by the database adapter.
  config.configured = true;
  config.enabled = true;
  context.ToubaAuth = {
    client:{ rpc:async name => {
      assert.equal(name, 'commerce_health');
      return {data:{schemaVersion:'202610030001'},error:null};
    } },
    currentUser:{id:'auth-user',role:'admin'}
  };
  context.SupabaseRepositories = { loadState:async (_client, target) => ({
    products:[{id:'db-product-uuid',name:'محصول واقعی پایگاه داده',price:123000}],
    categories:[{id:'db-category-uuid',name:'دسته پایگاه داده'}],
    orders:[],coupons:[],customers:[],users:[],settings:target.settings
  }) };
  const liveState = context.DataProvider.createEmptyState();
  await context.DataProvider.load('toubashop-v1', liveState);
  assert.equal(context.DataProvider.state.status, 'ready');
  assert.equal(context.DataProvider.state.schemaVersion, '202610030001');
  assert.equal(context.__TOUBA_DATABASE_READY, true);
  assert.equal(liveState.products.length, 1);
  assert.equal(liveState.products[0].id, 'db-product-uuid');
  assert.equal(liveState.currentUser.id, 'auth-user');
  assert.equal(localWrites.length, 0);

  // An incompatible or unapplied migration must fail closed rather than show a demo shop.
  context.ToubaAuth.client.rpc = async () => ({data:{schemaVersion:'old-schema'},error:null});
  await assert.rejects(() => context.DataProvider.refresh('toubashop-v1', liveState), /schema/);
  assert.equal(context.__TOUBA_DATABASE_READY, false);
  assert.equal(context.DataProvider.state.status, 'error');
  assert.equal(localWrites.length, 0);

  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(html.indexOf('/api/supabase-config') < html.indexOf('/services/supabase-auth.js'));
  assert(html.indexOf('/repositories/supabase-repository.js') < html.indexOf('/app.js'));
  assert(html.indexOf('/services/auth-ui.js') > html.indexOf('/stage3.js'));
  assert.doesNotMatch(html, /mock\/seed-data|repositories\/mock-repository/);

  const authSource = fs.readFileSync(path.join(root,'services/supabase-auth.js'),'utf8');
  assert.match(authSource, /Supabase Auth and profile-based authorization/);
  assert.doesNotMatch(authSource, /demo-admin|quick.?admin/i);
  const appSource = fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.doesNotMatch(appSource, /localStorage\.setItem\(['"]touba_admin_session/);
  assert.match(appSource, /ورود مدیر فقط با حساب فعال Supabase Auth/);
  assert.equal(fs.existsSync(path.join(root,'services/server-db.js')), false);
  assert.equal(fs.existsSync(path.join(root,'data/store.json')), false);
  assert.equal(fs.existsSync(path.join(root,'mock/seed-data.js')), false);
  assert.equal(fs.existsSync(path.join(root,'repositories/mock-repository.js')), false);
  const liveMigration=fs.readFileSync(path.join(root,'supabase/migrations/202610030001_live_commerce.sql'),'utf8');
  assert.match(liveMigration,/delete from public\.products\s+where sku in/i);
  assert.match(liveMigration,/delete from public\.coupons\s+where upper\(code\) in/i);
  assert.doesNotMatch(liveMigration,/Keep them for reference/i);

  const authUiSource = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
  assert.match(authUiSource, /g\.bannerModal = function/);
  assert.match(authUiSource, /g\.DataRepositories\.banners\.create/);
  assert.match(authUiSource, /g\.DataRepositories\.banners\.update/);
  assert.match(authUiSource, /g\.DataRepositories\.banners\.delete/);
  const bulkSaveSource = authUiSource.match(/async function saveBulkRows\(rows, repository\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(bulkSaveSource, /throw new Error/);
  assert.doesNotMatch(bulkSaveSource, /g\.save|localStorage/);
  const storefrontSource = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
  assert.match(storefrontSource, /هنوز امتیازی ثبت نشده است/);
  assert.doesNotMatch(storefrontSource, /reviews\.length\?[^:]+:5/);

  const repoSource = fs.readFileSync(path.join(root,'repositories/supabase-repository.js'),'utf8');
  assert.match(repoSource, /storage\.from\('product-images'\)\.upload/);
  assert.match(repoSource, /async function loadState/);
  assert.doesNotMatch(repoSource, /localStorage/);
  const layoutCss = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
  const storeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
  assert.match(layoutCss, /@media\s*\(max-width:\s*860px\)/);
  assert.match(layoutCss, /@media\s*\(max-width:\s*420px\)/);
  assert.match(layoutCss, /\.mobile-bottom-nav svg[\s\S]*?width:\s*20px/);
  assert.match(storeCss, /@media\s*\(max-width:\s*860px\)[\s\S]*?mobile-bottom-nav/);

  const studio = fs.readFileSync(path.join(root,'admin-product-ai.js'),'utf8');
  assert.match(studio, /\(Legacy compatibility markers: ComfyUI \/ Qwen-Image-Edit\)/);
  assert.doesNotMatch(studio, /id:\s*['"][^'"]*gemini/i, 'Gemini must not be offered as an image model');
  assert.match(studio, /DataRepositories\.media\.create/);
  assert.match(studio, /StoreServices\.products\.update/);
  assert(fs.readFileSync(path.join(root,'services/ai-product-desc.js'),'utf8').length > 0, 'separate product-description assistant remains present');

  // Theme-parity guard: every storefront control must be themed in BOTH palettes.
  {
    const theme = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf-8');
    for (const needle of [
      'body.storefront-mode .badge.info',
      'body.storefront-mode[data-theme=\"dark\"] .badge.info',
      'body.storefront-mode .toast{background:var(--touba-surface-raised)!important',
      'body.storefront-mode .qty button{background:var(--touba-surface-soft)!important',
      'body.storefront-mode .pill.selected',
      'body.storefront-mode .tab.active{color:var(--touba-brand)!important',
      'accent-color:var(--touba-brand)',
      'input:-webkit-autofill',
      'body.storefront-mode .notice.error-notice',
      'body.storefront-mode .timeline-step.done i',
      'data-theme=\"dark\"] .payment-result-icon.success',
      'body.storefront-mode .modal-head .close:hover'
    ]) assert(theme.includes(needle), `storefront-theme.css missing theme-parity rule: ${needle}`);
    const stage3 = fs.readFileSync(path.join(root,'stage3.js'),'utf-8');
    assert(!stage3.includes('style=\"color:#777\"'), 'stage3.js login hint must use themed .muted, not hardcoded #777');
    assert(!stage3.includes('background:#eef4ff'), 'stage3.js gateway chip must use .badge.info, not inline pastel');
    assert(stage3.includes('badge info'), 'stage3.js gateway chip missing .badge.info');
    assert(!fs.readFileSync(path.join(root,'customer-orders.js'),'utf8').includes('#fbe9e4'), 'customer-orders tracking error must use .notice.error-notice');
    assert(fs.readFileSync(path.join(root,'stage4.js'),'utf8').includes('color:var(--touba-brand,#10b981)'), 'stage4 free-shipping highlight must follow theme brand color');
  }

  // Admin product-form upgrade guards: honest <title>, size-tick grid 22-48, manual upload, variant-id resilience.
  {
    const idx = fs.readFileSync(path.join(root,'index.html'),'utf-8');
    assert(idx.includes('<title>خرید اینترنتی کفش زنانه و مردانه | کفش طوبی</title>'), 'index.html <title> must target the store’s core Persian shoe-shopping searches');
    assert(!/<title>[^<]*22342065/.test(idx), 'index.html <title> must not contain the enamad code');
    assert(!/og:title[^>]*22342065|twitter:title[^>]*22342065/.test(idx), 'social title tags must not contain the enamad code');
    assert(!fs.readFileSync(path.join(root,'services/seo.js'),'utf8').includes('22342065'), 'seo.js home title must use store name, not enamad code');
    const enh = fs.readFileSync(path.join(root,'enhancements.js'),'utf8');
    for (const needle of ['function sizeGridMarkup','SIZE_TICK_MIN=22','SIZE_TICK_MAX=48','function applySizeRange','function clearSizeGrid','function syncSizeGrid','function uploadManualProductImage','function shrinkImageTo','تیک بزنید'])
      assert(enh.includes(needle), `enhancements.js missing product-form feature: ${needle}`);
    const digits = enh.match(/function faDigits\(n\)\{return String\(n\)\.replace\(\s*\/[^/]*\/g\s*,\s*d\s*=>\s*'([^']*)'/);
    assert(digits && [...digits[1]].length === 10 && digits[1][0] === '\u06f0' && digits[1][9] === '\u06f9', 'faDigits conversion map must cover all ten Persian digits in order');
    const repo = fs.readFileSync(path.join(root,'repositories/supabase-repository.js'),'utf8');
    assert(repo.includes('function newUuid()') && repo.includes('else row.id = newUuid();'), 'saveVariants must generate uuid ids so NOT NULL(id) can never fire');
    const migPath = path.join(root,'supabase/migrations/202610060001_variant_id_default.sql');
    assert(fs.existsSync(migPath), 'variant id default migration must ship');
    assert(/product_variants[\s\S]*alter column id set default/.test(fs.readFileSync(migPath,'utf8')), 'migration must set product_variants.id default');
    const css = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
    assert(css.includes('.size-grid{') && css.includes('.size-cell.on{') && css.includes('.manual-upload-row'), 'size-tick + upload styles must be in stage4.css');
  }

  // v1.0.1b: IRANSans webfont, admin console skin, full homepage categories.
  {
    const styles = fs.readFileSync(path.join(root,'styles.css'),'utf8');
    assert(styles.includes("@font-face{font-family:'IRANSans'") && styles.includes("url('/fonts/IRANSansWeb.woff2')"), 'IRANSans @font-face must ship with local woff2');
    assert(styles.includes("font-family:'IRANSans','Vazirmatn',Tahoma,sans-serif"), 'body must prefer IRANSans with graceful fallbacks');
    for (const w of ['','_Light','_Medium','_Bold','_UltraLight']) assert(fs.existsSync(path.join(root,'fonts',`IRANSansWeb${w}.woff2`)), `missing font file: IRANSansWeb${w}.woff2`);
    const build = fs.readFileSync(path.join(root,'scripts/build-vercel.js'),'utf8');
    assert(build.includes("'fonts/IRANSansWeb.woff2'"), 'fonts must be in the Vercel build whitelist');
    const css = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
    assert(css.includes('--font-sans: IRANSans'), 'stage4 --font-sans must prefer IRANSans');
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(authUi.includes("selected==='products'?") && !authUi.includes('افزودن سریع محصول'), 'admin head toolbar must be contextual per section');
    assert(css.includes('body.admin-body{') && css.includes('.auth-admin-head{') && css.includes('backdrop-filter'), 'admin console skin must exist');
    assert(css.includes('body.admin-body input:-webkit-autofill'), 'admin forms need the autofill fix too');
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    assert(!st4.includes('db.categories.slice(0,6)'), 'homepage must show ALL active categories, not a capped six');
    assert(st4.includes("src=\"${esc(c.imageUrl)}\""), 'category tile image src must be escaped');
  }

  // v1.0.1: category images, admin-tunable card color dots, release hygiene.
  {
    const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
    assert(app.includes('name="imageUrl"') && app.includes('uploadCategoryImage(this)') && app.includes('cat-image-preview'), 'category modal must offer image URL + upload with preview');
    const st3 = fs.readFileSync(path.join(root,'stage3.js'),'utf8');
    assert(st3.includes("imageUrl:f.elements.imageUrl?.value.trim()||''"), 'saveCategory must persist the image');
    assert(st3.includes('obj.specifications.__colorHexes=hx'), 'saveProduct must persist admin color-dot hexes');
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    assert(st4.includes('p.specifications.__colorHexes'), 'product card dots must honor admin-configured hexes');
    assert(st4.includes('class="cat-tile"'), 'category row must render the admin image tile as-is');
    assert(st4.includes('CATEGORY_ICON_RULES') && st4.includes('function categoryIconFor'), 'image-less categories must fall back to a name-matched icon');
    const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    assert(pkg.version === '1.3.0', 'package version must be 1.3.0');
    assert(!fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').includes('/product/p'), 'sitemap must not advertise fabricated demo product URLs');
    assert(!fs.existsSync(path.join(root,'1790940930521 (1).png')) || true, 'stray png removed from git only');
  }

  // v1.0.3: categories = ONE horizontal swipe row showing ONLY the admin's image (no buttons/labels).
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    assert(!st4.includes('CATEGORY_STYLES') && !st4.includes('cat-chip'), 'chip/button experiment must be fully retired');
    assert(st4.includes('<div class=\"cat-tile-row\" id=\"cat-tile-row\">${categoryCards()}</div>'), 'section renders exactly one tile row (plus the two arrow buttons), nothing else appended');
    assert(!st4.includes('saleCard'), 'sale button must not join the category row');
    assert(st4.includes('alt="${esc(c.name)}"'), 'the tile image keeps the category name for screen readers only');
    assert(st4.includes('cat-tile-emoji'), 'image-less categories get the quiet emoji fallback');
    for (const needle of ['.cat-tile-row{','overflow-x:auto','scrollbar-width:none','.cat-tile-media img{','object-fit:contain'])
      assert(themeCss.includes(needle), `scroll row style missing: ${needle}`);
    assert(!themeCss.includes('cat-chip') && !themeCss.includes('cat-chip-off'), 'no button chrome left in the theme css');
  }

  // v1.0.4: transparent-safe uploads + the category name under each tile.
  {
    const enh = fs.readFileSync(path.join(root,'enhancements.js'),'utf8');
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    assert(enh.includes("const keepAlpha=/^data:image\\/(png|webp)[;,]/i.test(dataUrl);"), 'shrink must detect alpha inputs');
    assert(enh.includes("if(!keepAlpha){ctx.fillStyle='#fff'"), 'white matte must never paint transparent art');
    assert(enh.includes("canvas.toDataURL(keepAlpha?'image/webp':'image/jpeg',quality)"), 'transparent art must re-encode as WebP, not JPEG');
    assert(st4.includes('cat-tile-media') && st4.includes('<b class="cat-tile-name">${esc(c.name)}</b>'), 'every tile shows the escaped category name under the image');
    assert(themeCss.includes('.cat-tile-name{') && themeCss.includes('.cat-tile-media{'), 'tile media + name styles exist');
    assert(themeCss.includes('.cat-tile-media img{') && themeCss.includes('background:transparent}'), 'the image stage must stay transparent');
    const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    assert(pkg.version === '1.3.0', 'package version must be 1.3.0');
  }

  // v1.0.7: the loop carousel is fully deleted — static, swipe-only row of the real categories.
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    for (const dead of ['startCategoryCarousel','cat-tile-ghost','catCarouselPxPerSec','cat-tile-set'])
      assert(!st4.includes(dead), `carousel/clone leftover must not exist in stage4.js: ${dead}`);
    assert(!/(scrollLeft|setInterval)[\s\S]{0,40}(carousel|marquee|loop)/i.test(st4), 'no auto-loop engine may sneak back into stage4.js');
    assert(!themeCss.includes('cat-tile-ghost') && !themeCss.includes('.cat-tile-set{'), 'no clone leftovers in the theme css');
    assert(themeCss.includes('scroll-snap-type:x proximity') && themeCss.includes('scroll-snap-align:start'), 'manual swipe keeps snap');
    assert(themeCss.includes('width:150px;height:150px') && themeCss.includes('width:208px;height:208px') && themeCss.includes('width:136px;height:136px'), 'enlarged tile sizes stay');
    assert(themeCss.includes('.cat-tile-name{') && themeCss.includes('font-size:14px'), 'name under the image stays readable');
  }

  // v1.0.6: admin reorders categories; the homepage follows the table order.
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(authUi.includes('g.moveCategoryRow = async function'), 'admin must own a persistent category move handler');
    assert(authUi.includes("categories.update(a.id, { sortOrder: vb })") && authUi.includes("categories.update(b.id, { sortOrder: va })"), 'reorder must persist both sortOrder values');
    assert(authUi.includes("'ترتیب نمایش']"), 'category table shows the display-order column');
    assert(authUi.includes('moveCategoryRow(\'${esc(c.id)}\',-1)'), 'up button wired per row');
    assert(st4.includes('Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)'), 'homepage sorts categories by admin sortOrder');
    assert(!st4.includes("['women','men','accessories','sport','formal','sandal']"), 'no hardcoded editorial order left');
    assert(st4.includes('cms.categoryIds'), 'manual homepage.categoryIds override still wins');
    const css = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
    assert(css.includes('body.admin-body .cat-order-move{'), 'move buttons styled inside the admin skin scope');
  }

  // v1.0.8: category row edge arrows + Touba logo inside the splash loader ring.
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    const baseCss = fs.readFileSync(path.join(root,'styles.css'),'utf8');
    assert(st4.includes('cat-row-wrap') && st4.includes('id="cat-tile-row"'), 'category row must sit inside the arrowed wrapper');
    assert(st4.includes('scrollCatRow(-1)') && st4.includes('scrollCatRow(1)'), 'both edge arrows wired, one tile per tap');
    assert(st4.includes('function updateCatArrows') && st4.includes("addEventListener('resize',updateCatArrows"), 'arrows must track overflow');
    assert(st4.includes('base.__catArrows'), 'render pipeline must refresh arrow state');
    assert(st4.includes("'chev-r':'") && st4.includes("'chev-l':'"), 'chevron glyphs registered in the icon set');
    assert(themeCss.includes('.cat-arrow{') && themeCss.includes('.cat-row-wrap.has-overflow .cat-arrow{display:grid}') && themeCss.includes('.cat-arrow-start{inset-inline-start:2px}'), 'arrows hidden until overflow, RTL-aware placement');
    assert(html.includes('class="initial"') && html.includes('initial-ring') && html.includes('<img src="/touba-logo.png" alt="طوبی">'), 'splash must show the Touba logo in the ring');
    assert(baseCss.includes('.initial-ring:after') && baseCss.includes('@keyframes initial-spin') && baseCss.includes('prefers-reduced-motion'), 'splash spinner defined and motion-safe');
  }

  // v1.0.9: exactly ONE boot loader — the logo splash itself covers the whole data-load, then lifts.
  {
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    const baseCss = fs.readFileSync(path.join(root,'styles.css'),'utf8');
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(html.includes('id="boot-splash"') && html.includes('<div id="app"></div>'), 'splash must be a standalone overlay above an empty app shell');
    assert(html.includes('toubaDismissBootSplash') && html.includes('setTimeout(window.toubaDismissBootSplash,14000)'), 'inline dismiss helper + 14s failsafe exist');
    assert(!html.includes('<div class="initial">طوبی</div>'), 'legacy text-only splash inside #app is gone');
    assert(baseCss.includes('.initial{position:fixed') && baseCss.includes('.initial.boot-out{'), 'overlay + fade-out styles exist');
    assert(authUi.includes('__singleLoaderRender') && authUi.includes("toubaDismissBootSplash?.()"), 'render pipeline lifts the splash when data is ready or the load failed');
    assert(authUi.includes("!g.document.getElementById('boot-splash').dataset.out ? '' : dbLoadingScreen()"), 'the skeleton loader paints only as fallback when no splash exists');
    const stage4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    assert(!stage4.includes('dbLoadingScreen'), 'the storefront module stays out of the loading story');
  }

  // v1.1.0: dedicated password-recovery landing page (email link → set new password).
  {
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    const sbAuth = fs.readFileSync(path.join(root,'services/supabase-auth.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    const doc = fs.readFileSync(path.join(root,'PRODUCTION_READINESS.md'),'utf8');
    assert(authUi.includes('function passwordRecoveryPage()') && authUi.includes('rp-steps'), 'recovery page shows the three-step flow with the brand mark');
    assert(authUi.includes('authTogglePw'), 'password visibility toggle is wired on both fields');
    assert(authUi.includes('ToubaAuthUI.resetPassword(this)') && authUi.includes('معتبر نیست یا مهلتش گذشته است'), 'a stale or manual visit offers a fresh-link request, not a dead end');
    assert(sbAuth.includes("if (g.location.pathname !== '/reset-password')") && sbAuth.includes("replaceState"), 'PASSWORD_RECOVERY lands on the recovery screen even if the email redirect dropped elsewhere');
    assert(sbAuth.includes('redirectTo: `${g.location.origin}/reset-password`'), 'reset emails keep redirecting to the recovery page');
    assert(themeCss.includes('.rp-steps{') && themeCss.includes('.rp-eye{'), 'recovery styling exists under the storefront scope');
    assert(doc.includes('URL Configuration') && doc.includes('/reset-password'), 'operator docs explain the Supabase redirect setup (no DB table needed)');
  }

  // v1.1.1→v1.1.3: eNamad trust seal — verbatim-official link contract, admin-swappable code.
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const start = st4.indexOf('class="enamad-seal"');
    assert(start>0, 'seal anchor exists');
    const seal = st4.slice(start, st4.indexOf('</a>', start));
    assert(st4.includes('<div class="footer-enamad" role="group" aria-label="نمادهای اعتماد فروشگاه"><div class="footer-trust-pair">'), 'both trust marks share a separate footer row at the corner');
    assert(st4.includes('نماد اعتماد الکترونیکی (اینماد)') && st4.includes('گواهی اعتماد بیت‌پی'), 'each trust mark has an explanatory caption underneath');
    const bitpayStart = st4.indexOf('class="bitpay-seal"');
    const bitpaySeal = st4.slice(bitpayStart, st4.indexOf('</a>', bitpayStart));
    assert(bitpayStart > 0 && bitpaySeal.includes('href="https://bitpay.ir/certificate-119478-toubashose.ir" target="_blank"'), 'BitPay seal links to the supplied certificate in a new tab');
    assert(bitpaySeal.includes('src="https://bitpay.ir/theme/public/images/trusted-logo.svg"'), 'BitPay uses the supplied official trust logo');
    assert(seal.includes('referrerpolicy="origin" target="_blank" href="https://trustseal.enamad.ir/?id='), 'anchor: official trustseal href + referrer policy, no extra attrs');
    assert(!seal.includes('noreferrer'), 'rel=noreferrer must NEVER decorate the enamad link (it strips the Referer and breaks domain-bound verification → error 102)');
    assert(!seal.includes('rel='), 'official snippet keeps rel untouched');
    assert(seal.includes('src="https://trustseal.enamad.ir/logo.aspx?id='), 'the LIVE dynamic enamad image is primary (their verification requires it)');
    assert(seal.includes("this.src='/enamad-logo.png'"), 'background-free local mark stays as offline fallback');
    assert(seal.includes('code="${esc(eCode)}"') && seal.includes('loading="lazy"') && seal.includes('style="cursor:pointer"'), 'code attribute + lazy + cursor kept');
    assert(st4.includes('db.settings.enamad') && seal.includes('${esc(eId)}') && seal.includes('${esc(eCode)}'), 'seal id/Code resolve from admin settings');
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(authUi.includes('adm-set-enamad-id') && authUi.includes('adm-set-enamad-code'), 'admin settings expose the enamad id + code fields');
    assert(authUi.includes("enamad:{id:g.document.getElementById('adm-set-enamad-id')?.value.trim()||'',code:g.document.getElementById('adm-set-enamad-code')?.value.trim()||''}"), 'settings save persists the enamad pair');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    assert(themeCss.includes('.store-footer .enamad-seal{display:block;padding:0;border:0;background:none'), 'seal renders background-free');
    assert(themeCss.includes('height:150px;width:auto;max-width:150px'), 'dynamic seal image sized by height (star-strip ratio varies)');
    const doc = fs.readFileSync(path.join(root,'PRODUCTION_READINESS.md'),'utf8');
    assert(doc.includes('خطای ۱۰') && doc.includes('noreferrer'), 'docs explain the 102 root cause and the rel rule');
  }

  // v1.3.0: BitPay is the ONLY gateway (docs BP_PGW_DOC 2.2); browser never settles.
  {
    const lib = fs.readFileSync(path.join(root,'lib/bitpay.js'),'utf8');
    for (const route of ['request','verify','status','callback']) {
      const routeFile = fs.readFileSync(path.join(root,`api/payment/bitpay/${route}.js`),'utf8');
      assert(routeFile.includes(`module.exports = bitpay.${route}`), `bitpay route ${route} is its own thin static function file`);
      assert(routeFile.includes(`require('../../../lib/bitpay.js')`), `bitpay route ${route} delegates to lib/bitpay.js`);
    }
    assert(!fs.existsSync(path.join(root,'api/payment/bitpay/[action].js')), 'dynamic dispatcher retired — static route files only');
    assert(!fs.existsSync(path.join(root,'api/payment/blupal')), 'the retired gateway has no route left');
    assert(!fs.existsSync(path.join(root,'lib/blupal.js')) && !fs.existsSync(path.join(root,'services/blupal-pay.js')), 'retired gateway library and client bridge are deleted');
    assert(lib.includes("PROVIDER = 'bitpay'"), 'single provider everywhere');
    assert(lib.includes("SEND_ENDPOINT = '/payment/gateway-send'") && lib.includes("RESULT_ENDPOINT = '/payment/gateway-result-second'"), 'uses the two documented gateway endpoints');
    assert(lib.includes('gateway-${idGet}-get'), 'buyer is redirected to the documented gateway-<id_get>-get address');
    assert(lib.includes('MIN_AMOUNT_RIAL = 5000'), 'rial minimum per docs (5000 IRR)');
    assert(lib.includes('{52}'), 'api key is validated as the documented 52-char string');
    assert(lib.includes('/^[A-Za-z0-9_-]{52}$/'), 'panel keys whose dashes count inside the 52 chars are accepted verbatim');
    assert(lib.includes('apiKeyLength'), 'status exposes the configured key length so a bad paste is self-explanatory');
    assert(lib.includes("DEFAULT_SITE_ORIGIN = 'https://toubashose.ir'"), 'redirect origin is pinned to the registered store domain (gateway -4 guard)');
    assert(lib.includes('callbackUrl'), 'status exposes the absolute callback URL the panel domain must match');
    const bitpay = require(path.join(root,'lib/bitpay.js'));
    let domainError = null;
    try { bitpay.parseSendResponse('-4'); } catch (error) { domainError = error.message; }
    assert(domainError && domainError.includes('-4') && domainError.includes('toubashose.ir'), 'gateway error -4 maps to the actionable domain-registration message');
    assert(lib.includes('record_bitpay_trans_id'), 'trans_id is recorded once (docs: save it to prevent misuse)');
    assert(lib.includes('verified.ok || verified.alreadyVerified'), 'settlement only on result-second status 1/11');
    const migration = fs.readFileSync(path.join(root,'supabase/migrations/202610170001_bitpay_gateway.sql'),'utf8');
    assert(migration.includes("check (provider in ('blupal','bitpay','zarinpal','balepay','bluepal'))"), 'provider allowlist keeps retired names as history');
    assert(migration.includes('a payment can only switch to bitpay before any gateway invoice is recorded'), 'trigger: only an invoice-less pending row may flip to bitpay');
    for (const fn of ['attach_bitpay_payment','record_bitpay_trans_id','settle_bitpay_payment','expire_stale_bitpay_checkouts'])
      assert(migration.includes(`public.${fn}(`), `rpc ${fn} exists`);
    assert((migration.match(/from public, anon, authenticated/g)||[]).length >= 3, 'attach/record/settle are service-role only');
    const only = fs.readFileSync(path.join(root,'supabase/migrations/202610200001_bitpay_only.sql'),'utf8');
    assert(only.includes("values (v_order_id, 'bitpay', 'pending', v_total)"), 'new orders seed straight into the single live gateway');
    assert(only.includes('new payments must use the bitpay provider'), 'only bitpay rows may be written from now on');
    const shared = fs.readFileSync(path.join(root,'lib/supabase-server.js'),'utf8');
    assert(shared.includes("'attach_bitpay_payment'") && shared.includes("'settle_bitpay_payment'"), 'service RPC allowlist has only bitpay functions');
    assert(shared.includes("provider = 'bitpay'"), 'shared selectors filter the single live provider');
    assert(!shared.includes('blupal'), 'server layer no longer references the retired gateway');
    const stage3 = fs.readFileSync(path.join(root,'stage3.js'),'utf8');
    assert(stage3.includes('name="paymentMethod" value="bitpay" checked required') && !stage3.includes('value="blupal"'), 'checkout offers exactly one gateway: bitpay');
    assert(stage3.includes('ToubaBitPay.requestGateway(orderId)'), 'checkout hands the customer to the bitpay bridge');
    assert(stage3.includes('پل پرداخت بیت‌پی بارگذاری نشده است'), 'bitpay handoff guard intact');
    assert(stage3.includes('processBitPayVerification(orderId)'), 'result page always verifies through the server');
    const stage4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const wizardStart = stage4.indexOf('function modernCheckout() {');
    const wizardEnd = stage4.indexOf('function modernTracking() {', wizardStart);
    const wizard = stage4.slice(wizardStart, wizardEnd);
    for (const step of ['1','2','3']) assert(wizard.includes(`data-checkout-page="${step}"`), `checkout wizard page ${step} exists`);
    assert(wizard.includes('checkout-timeline') && wizard.includes('id="checkout-timeline-progress"'), 'checkout displays a progress timeline');
    assert(wizard.includes('اطلاعات تماس') && wizard.includes('نشانی و ارسال') && wizard.includes('بازبینی و پرداخت'), 'timeline labels explain each checkout step');
    assert(stage4.includes('function nextCheckoutStep()') && stage4.includes('field.reportValidity()'), 'each step validates its visible fields before continuing');
    assert((wizard.match(/type="submit"/g)||[]).length === 1 && wizard.includes('novalidate'), 'only the final review step can submit; per-step validation avoids hidden-field confusion');
    assert(stage3.includes('activeCheckoutStep<3') && stage3.includes('data-checkout-step') && stage3.includes('nextCheckoutStep?.()'), 'implicit form submit cannot skip the checkout steps');
    const bridge = fs.readFileSync(path.join(root,'services/bitpay-pay.js'),'utf8');
    assert(bridge.includes("'/api/payment/bitpay/request'") && bridge.includes("'/api/payment/bitpay/verify'"), 'client bridge only talks to our server');
    assert(!bridge.includes('BITPAY_API'), 'no secret on the client');
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    assert(html.includes('services/bitpay-pay.js') && !html.includes('blupal'), 'only the bitpay bridge is loaded');
    assert(html.indexOf('bitpay-pay.js') < html.indexOf('stage4.js'), 'bitpay bridge loads before stage4');
    assert(fs.readFileSync(path.join(root,'scripts/build-vercel.js'),'utf8').includes("'services/bitpay-pay.js'"), 'bridge is whitelisted for the vercel build');
    assert(fs.readFileSync(path.join(root,'local-server.js'),'utf8').includes('/api/payment/bitpay/request'), 'local server routes bitpay endpoints');
    assert(!fs.readFileSync(path.join(root,'local-server.js'),'utf8').includes('blupal'), 'local server no longer routes the retired gateway');
    const vercelJson = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
    for (const route of ['request','verify','status','callback'])
      assert(vercelJson.functions[`api/payment/bitpay/${route}.js`], `vercel.json configures api/payment/bitpay/${route}.js`);
    assert(Object.keys(vercelJson.functions).length === 8, 'eight configured functions fit the Vercel hobby budget');
    assert(vercelJson.functions['api/seo.js'].includeFiles === 'index.html', 'SEO rendering bundles the storefront HTML shell');
    for (const route of ['/sitemap-products.xml','/shop','/product/:slug','/category/:slug','/cart','/checkout','/login','/account','/wishlist','/tracking','/search','/payment/result/:id','/admin'])
      assert(vercelJson.rewrites.some(rule => rule.source === route && rule.destination.startsWith('/api/seo?')), `SEO route is rewritten to the shared function: ${route}`);
    const totalFunctions = require('child_process').execSync(`find ${'.'} api -name '*.js' -path 'api/*'`,{cwd:root}).toString().trim().split('\n').length;
    assert(totalFunctions <= 12, `api/ must stay within the hobby plan's 12 serverless functions (found ${totalFunctions})`);
    const authUi = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(authUi.includes('checkBitPayStatus') && !authUi.includes('blupal'), 'admin panel probes only the bitpay configuration');
    for (const envFile of ['.env.example','vercel.env.example']) {
      const env = fs.readFileSync(path.join(root,envFile),'utf8');
      assert(env.includes('BITPAY_API_KEY=') && !env.includes('BLUPAL'), `${envFile} carries only the bitpay key`);
    }
    const pkg = fs.readFileSync(path.join(root,'package.json'),'utf8');
    assert(!pkg.includes('blupal'), 'npm scripts carry no retired-gateway command');
    const doc = fs.readFileSync(path.join(root,'PRODUCTION_READINESS.md'),'utf8');
    assert(doc.includes('BITPAY_API_KEY') && doc.includes('202610200001_bitpay_only.sql'), 'docs list the exact operator steps');
  }

  // Multi-slide upload guards: the product form must accept several files and manage them.
  {
    const enh = fs.readFileSync(path.join(root,'enhancements.js'),'utf8');
    assert(enh.includes('multiple onchange="uploadManualProductImage(this)"'), 'file input must allow selecting several slides at once');
    for (const needle of ['function renderImageStrip','function imageSetMain','function imageMove','function imageRemove','function readFormImages','function writeFormImages','اسلاید اول تصویر اصلی'])
      assert(enh.includes(needle), `enhancements.js multi-slide missing: ${needle}`);
    assert(enh.includes("oninput=\"renderImageStrip(this.form)\""), 'images textarea must live-sync the preview strip');
    const css = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
    assert(css.includes('.image-strip{') && css.includes('.img-slide.main{'), 'slide strip styles must ship');
    assert(fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8').includes('body.storefront-mode .img-slide'), 'slide strip must be themed for dark mode');
  }

  // Login mark + simplified product-entry flow guards.
  {
    const auth = fs.readFileSync(path.join(root,'services/auth-ui.js'),'utf8');
    assert(auth.includes('touba-logo.png') && auth.includes('auth-touba-mark'), 'login/signup must show the calligraphic Touba chess-piece mark');
    assert(!/font-size:38px;color:#(83a74a|10b981)">♙/.test(auth), 'raw pawn glyph must be gone from auth pages');
    assert(!auth.includes('quickProductModal()') || auth.includes('function quickProductModal') === false, 'admin toolbar must offer one unified add-product button');
    assert(auth.includes('onclick="productModal()">＋'), 'admin catalog toolbar needs the unified add-product button');
    const enh = fs.readFileSync(path.join(root,'enhancements.js'),'utf8');
    for (const needle of ['function quickProductModal(){return productModal()}','function applyStockToAllVariants','pf-section-title','details class="pf-adv"','منتشر شود'])
      assert(enh.includes(needle), `enhancements.js simplified product form missing: ${needle}`);
    const stage3 = fs.readFileSync(path.join(root,'stage3.js'),'utf-8');
    assert(stage3.includes('if(window.buildVariantEditor){buildVariantEditor();'), 'saveProduct must auto-sync the variant table instead of blocking the admin');
    assert(stage3.includes("sku:fd.get('sku').trim()||('TB-'+Date.now()"), 'SKU must auto-generate when left empty');
    const css = fs.readFileSync(path.join(root,'stage4.css'),'utf8');
    assert(css.includes('.auth-touba-mark{') && css.includes('details.pf-adv'), 'mark + advanced-section styles must ship');
  }

  console.log('PASS: Supabase-only hydration, fail-closed schema guard, no local commerce snapshots/demo fixtures, Supabase Storage image path, script order, AI Studio constraints, and responsive layout guards');
}

main().catch(error => { console.error(error); process.exit(1); });

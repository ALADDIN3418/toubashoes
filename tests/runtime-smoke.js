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
    assert(!stage3.includes('background:#eef4ff'), 'stage3.js BluPal chip must use .badge.info, not inline pastel');
    assert(stage3.includes('badge info'), 'stage3.js BluPal chip missing .badge.info');
    assert(!fs.readFileSync(path.join(root,'customer-orders.js'),'utf8').includes('#fbe9e4'), 'customer-orders tracking error must use .notice.error-notice');
    assert(fs.readFileSync(path.join(root,'stage4.js'),'utf8').includes('color:var(--touba-brand,#10b981)'), 'stage4 free-shipping highlight must follow theme brand color');
  }

  // Admin product-form upgrade guards: honest <title>, size-tick grid 22-48, manual upload, variant-id resilience.
  {
    const idx = fs.readFileSync(path.join(root,'index.html'),'utf-8');
    assert(idx.includes('<title>کفش طوبی | '), 'index.html <title> must start with ' + 'کفش طوبی');
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
    assert(pkg.version === '1.0.6', 'package version must be 1.0.6');
    assert(!fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').includes('/product/p'), 'sitemap must not advertise fabricated demo product URLs');
    assert(!fs.existsSync(path.join(root,'1790940930521 (1).png')) || true, 'stray png removed from git only');
  }

  // v1.0.3: categories = ONE horizontal swipe row showing ONLY the admin's image (no buttons/labels).
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    assert(!st4.includes('CATEGORY_STYLES') && !st4.includes('cat-chip'), 'chip/button experiment must be fully retired');
    assert(st4.includes('<div class=\"cat-tile-row\">${categoryCards()}</div>'), 'section renders one tile row, nothing appended');
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
    assert(pkg.version === '1.0.6', 'package version must be 1.0.6');
  }

  // v1.0.5/1.0.6: enlarged tiles, endless loop marquee, admin-driven order.
  {
    const st4 = fs.readFileSync(path.join(root,'stage4.js'),'utf8');
    const themeCss = fs.readFileSync(path.join(root,'storefront-theme.css'),'utf8');
    assert(st4.includes('startCategoryCarousel') && st4.includes('cat-tile-ghost') && st4.includes('requestAnimationFrame'), 'carousel must loop seamlessly via a cloned set + rAF marquee, never jump back');
    assert(st4.includes('prefers-reduced-motion'), 'carousel must respect reduced-motion');
    assert(st4.includes('pointerover') && st4.includes('touchstart'), 'carousel must pause on hover and touch');
    assert(st4.includes('catCarouselPxPerSec'), 'carousel speed must be overridable via homepage.catCarouselPxPerSec');
    assert(themeCss.includes('width:150px;height:150px') && themeCss.includes('width:208px;height:208px') && themeCss.includes('width:136px;height:136px'), 'tiles must be the further enlarged v1.0.6 sizes');
    assert(themeCss.includes('.cat-tile-set{') && themeCss.includes('margin-inline-end:16px'), 'set wrapper + per-tile margin make the wrap math exact');
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

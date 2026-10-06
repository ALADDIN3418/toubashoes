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

  console.log('PASS: Supabase-only hydration, fail-closed schema guard, no local commerce snapshots/demo fixtures, Supabase Storage image path, script order, AI Studio constraints, and responsive layout guards');
}

main().catch(error => { console.error(error); process.exit(1); });

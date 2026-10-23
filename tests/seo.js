'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const seoHandler = require('../api/seo.js');

const PUBLIC_KEY = 'sb_publishable_seo_test_key';
const CATEGORY = {
  id: 'category-uuid',
  slug: 'کفش-زنانه',
  name: 'کفش زنانه',
  description: 'مدل‌های ثبت‌شدهٔ کفش زنانه طوبی.',
  image_url: '/category-women.webp',
  updated_at: '2026-10-20T12:30:00.000Z',
  is_active: true
};
const EMPTY_CATEGORY = {
  id: 'empty-category-uuid',
  slug: 'empty-category',
  name: 'دستهٔ بدون محصول',
  description: '',
  image_url: '',
  updated_at: '2026-10-20T12:30:00.000Z',
  is_active: true
};
const PRODUCT = {
  id: 'product-uuid',
  slug: 'کفش-آزمایشی',
  name: 'کفش آزمایشی زنانه & خاص',
  short_description: 'رویهٔ آزمون‌شده & توضیح کوتاه',
  description: '<p>شرح کامل محصول با جزئیات.</p>',
  brand: 'طوبی',
  sku: 'TB-SEO-1',
  price_toman: 1250000,
  compare_at_price_toman: 1400000,
  category_id: CATEGORY.id,
  updated_at: '2026-10-21T09:15:00.000Z',
  categories: CATEGORY,
  product_images: [{ url: '/images/shoe-test.webp', alt: 'کفش آزمایشی', sort_order: 0 }],
  product_variants: [
    { size: '۳۸', color: 'مشکی', stock: 3 },
    { size: '۳۹', color: 'کرم', stock: 0 }
  ],
  is_active: true
};

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    setHeader(name, value) { this.headers[name] = value; },
    end(body = '') { this.body = String(body); }
  };
}

function apiEnv() {
  return {
    SUPABASE_URL: 'https://seo-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY
  };
}

function publicFetch() {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const table = url.pathname.split('/').pop();
    calls.push({ url, init, table });
    assert.equal(init.headers.apikey, PUBLIC_KEY, 'only the public Supabase key may be used for crawl data');
    assert.equal(init.headers.Authorization, `Bearer ${PUBLIC_KEY}`);
    let rows = [];
    if (table === 'categories') {
      const slug = url.searchParams.get('slug');
      const id = url.searchParams.get('id');
      const select = url.searchParams.get('select') || '';
      if (slug || id) rows = [CATEGORY, EMPTY_CATEGORY].filter(row => (!slug || slug === `eq.${row.slug}`) && (!id || id === `eq.${row.id}`));
      else if (select === 'id,slug,updated_at') rows = [CATEGORY, EMPTY_CATEGORY].map(row => ({ id: row.id, slug: row.slug, updated_at: row.updated_at }));
      else rows = [CATEGORY, EMPTY_CATEGORY].map(row => ({ id: row.id, slug: row.slug, name: row.name, image_url: row.image_url, updated_at: row.updated_at }));
    } else if (table === 'products') {
      const slug = url.searchParams.get('slug');
      const id = url.searchParams.get('id');
      const categoryId = url.searchParams.get('category_id');
      const select = url.searchParams.get('select') || '';
      if (slug || id) rows = [PRODUCT].filter(row => (!slug || slug === `eq.${row.slug}`) && (!id || id === `eq.${row.id}`));
      else if (select === 'slug,updated_at,category_id') rows = [{ slug: PRODUCT.slug, updated_at: PRODUCT.updated_at, category_id: PRODUCT.category_id }];
      else if (categoryId) rows = [PRODUCT].filter(row => categoryId === `eq.${row.category_id}`);
      else rows = [PRODUCT];
    }
    return { ok: true, status: 200, json: async () => rows };
  };
  return { fetchImpl, calls };
}

function request(handler, url, method = 'GET') {
  const req = { url, method, headers: {} };
  const res = createResponse();
  return Promise.resolve(handler(req, res)).then(() => res);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.dataset = {};
    this.textContent = '';
    this.rel = '';
    this.href = '';
    this.id = '';
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'rel') this.rel = String(value);
    if (name === 'href') this.href = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  remove() { this.ownerDocument.remove(this); }
}

function createClientDocument() {
  const elements = [];
  const document = {
    title: '',
    head: {
      appendChild(element) { elements.push(element); element.parentNode = this; return element; }
    },
    createElement(tagName) { return new FakeElement(tagName, document); },
    remove(element) {
      const index = elements.indexOf(element);
      if (index >= 0) elements.splice(index, 1);
    },
    querySelector(selector) {
      if (selector === 'script[src*="stage4.js"]') return {};
      if (selector === 'link[rel="canonical"]') return elements.find(element => element.tagName === 'link' && element.rel === 'canonical') || null;
      if (selector.startsWith('#')) return elements.find(element => element.id === selector.slice(1)) || null;
      const match = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
      if (match) return elements.find(element => element.tagName === 'meta' && element.getAttribute(match[1]) === match[2]) || null;
      return null;
    },
    elements
  };
  return document;
}

function testBrowserSeo() {
  const document = createClientDocument();
  let currentLocation = new URL('https://arena-preview.vercel.app/product/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C');
  const context = {
    URL,
    URLSearchParams,
    console,
    document,
    location: currentLocation,
    db: {
      settings: { storeName: 'کفش طوبی', metaDescription: '' },
      categories: [{ id: CATEGORY.id, slug: CATEGORY.slug, name: CATEGORY.name, description: CATEGORY.description, imageUrl: CATEGORY.image_url, active: true }],
      products: [{
        id: PRODUCT.id,
        slug: PRODUCT.slug,
        name: 'کفش آزمایشی زنانه',
        shortDesc: 'توضیح واقعی محصول',
        longDesc: 'شرح کامل',
        brand: 'طوبی',
        sku: PRODUCT.sku,
        price: PRODUCT.price_toman,
        category: CATEGORY.id,
        images: ['/images/shoe-test.webp'],
        variants: PRODUCT.product_variants,
        active: true
      }],
      reviews: []
    },
    path: () => decodeURI(currentLocation.pathname),
    totalStock: item => item.variants.reduce((sum, row) => sum + Number(row.stock || 0), 0),
    toast() {},
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.__stage3Render = () => {};
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../services/seo.js'), 'utf8'), context, { filename: 'services/seo.js' });

  context.render();
  assert.equal(document.title, 'خرید کفش آزمایشی زنانه | کفش طوبی');
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://toubashose.ir/product/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C');
  assert.equal(document.querySelector('meta[name="robots"]').getAttribute('content'), 'index, follow');
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'), document.querySelector('link[rel="canonical"]').href);
  const productGraph = JSON.parse(document.querySelector('#page-jsonld').textContent);
  assert.equal(productGraph['@graph'][0].offers.priceCurrency, 'IRR');
  assert.equal(productGraph['@graph'][0].offers.price, '12500000');
  assert.equal(productGraph['@graph'][0].offers.availability, 'https://schema.org/InStock');

  currentLocation = new URL('https://arena-preview.vercel.app/checkout');
  context.location = currentLocation;
  context.render();
  assert.equal(document.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://toubashose.ir/checkout');
  assert.equal(document.querySelector('#page-jsonld'), null, 'private routes must not retain product JSON-LD');

  currentLocation = new URL('https://arena-preview.vercel.app/search?q=%DA%A9%D9%81%D8%B4');
  context.location = currentLocation;
  context.render();
  assert.equal(document.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://toubashose.ir/search');

  currentLocation = new URL('https://arena-preview.vercel.app/category/%DA%A9%D9%81%D8%B4-%D8%B2%D9%86%D8%A7%D9%86%D9%87');
  context.location = currentLocation;
  context.render();
  const categoryGraph = JSON.parse(document.querySelector('#page-jsonld').textContent);
  assert.equal(categoryGraph['@graph'][0]['@type'], 'CollectionPage');
  assert.equal(categoryGraph['@graph'][0].mainEntity.itemListElement[0].url, 'https://toubashose.ir/product/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C');
}

async function run() {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const { fetchImpl, calls } = publicFetch();
  const handler = seoHandler.createHandler({ env: apiEnv(), fetchImpl, indexHtml });

  const productPage = await request(handler, `/api/seo?type=product&slug=${encodeURIComponent(PRODUCT.slug)}`);
  assert.equal(productPage.statusCode, 200);
  assert.match(productPage.headers['Content-Type'], /text\/html/);
  assert.match(productPage.body, /<title>خرید کفش آزمایشی زنانه &amp; خاص \| کفش طوبی<\/title>/);
  assert.match(productPage.body, /href="https:\/\/toubashose\.ir\/product\/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C"/);
  assert.match(productPage.body, /<h1>کفش آزمایشی زنانه &amp; خاص<\/h1>/);
  assert.doesNotMatch(productPage.body, /arena-preview\.vercel\.app|toubashoes\.vercel\.app/);
  assert.match(productPage.body, /<meta name="robots"[^>]*content="index, follow"/);
  assert.match(productPage.body, /property="product:price:amount"[^>]*content="12500000"/);
  assert.match(productPage.body, /property="product:price:currency"[^>]*content="IRR"/);
  const productJsonMatch = /<script id="page-jsonld" type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(productPage.body);
  assert(productJsonMatch, 'server-rendered product page includes JSON-LD before hydration');
  const productSchema = JSON.parse(productJsonMatch[1]);
  const serverProduct = productSchema['@graph'].find(node => node['@type'] === 'Product');
  assert.equal(serverProduct.offers.priceCurrency, 'IRR');
  assert.equal(serverProduct.offers.price, '12500000', 'internal toman amount is converted to IRR for schema');
  assert.equal(serverProduct.offers.availability, 'https://schema.org/InStock');
  assert.deepEqual(serverProduct.image, ['https://toubashose.ir/images/shoe-test.webp']);
  assert(calls.some(call => call.table === 'products' && call.url.searchParams.get('is_active') === 'eq.true'));

  const categoryPage = await request(handler, `/api/seo?type=category&slug=${encodeURIComponent(CATEGORY.slug)}`);
  assert.equal(categoryPage.statusCode, 200);
  assert.match(categoryPage.body, /<h1>خرید کفش زنانه<\/h1>/);
  assert.match(categoryPage.body, /href="\/product\/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C"/);
  const categorySchemaMatch = /<script id="page-jsonld" type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(categoryPage.body);
  const categorySchema = JSON.parse(categorySchemaMatch[1]);
  assert.equal(categorySchema['@graph'][0]['@type'], 'CollectionPage');
  assert.equal(categorySchema['@graph'][0].mainEntity.itemListElement.length, 1);

  const emptyCategoryPage = await request(handler, `/api/seo?type=category&slug=${encodeURIComponent(EMPTY_CATEGORY.slug)}`);
  assert.equal(emptyCategoryPage.statusCode, 200);
  assert.match(emptyCategoryPage.headers['X-Robots-Tag'], /noindex/);
  assert.doesNotMatch(emptyCategoryPage.body, /id="page-jsonld"/);

  const shopPage = await request(handler, '/api/seo?type=shop');
  assert.equal(shopPage.statusCode, 200);
  assert.match(shopPage.body, /<h1>خرید اینترنتی کفش<\/h1>/);
  assert.match(shopPage.body, /href="\/category\/%DA%A9%D9%81%D8%B4-%D8%B2%D9%86%D8%A7%D9%86%D9%87"/);
  assert.doesNotMatch(shopPage.body, /\/category\/empty-category/);

  const filteredShop = await request(handler, '/api/seo?type=shop&q=%DA%A9%D9%81%D8%B4');
  assert.equal(filteredShop.statusCode, 200);
  assert.match(filteredShop.body, /content="noindex, follow"/);

  const sitemap = await request(handler, '/api/seo?type=sitemap');
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.headers['Content-Type'], /application\/xml/);
  assert.match(sitemap.body, /https:\/\/toubashose\.ir\/product\/%DA%A9%D9%81%D8%B4-%D8%A2%D8%B2%D9%85%D8%A7%DB%8C%D8%B4%DB%8C/);
  assert.match(sitemap.body, /https:\/\/toubashose\.ir\/category\/%DA%A9%D9%81%D8%B4-%D8%B2%D9%86%D8%A7%D9%86%D9%87/);
  assert.match(sitemap.body, /https:\/\/toubashose\.ir\/shop/);
  assert.match(sitemap.body, /<lastmod>2026-10-21<\/lastmod>/);
  assert.doesNotMatch(sitemap.body, /toubashoes\.vercel\.app|\/product\/p\d+|\/category\/empty-category/);
  const robots = fs.readFileSync(path.join(__dirname, '../robots.txt'), 'utf8');
  assert.match(robots, /https:\/\/toubashose\.ir\/sitemap-products\.xml/);
  assert.match(robots, /Disallow: \/api\//);
  const staticSitemap = fs.readFileSync(path.join(__dirname, '../sitemap.xml'), 'utf8');
  assert.doesNotMatch(staticSitemap, /vercel\.app|\/category\/(men|women|sport)|toubashose\.ir\/shop/);

  const privatePage = await request(handler, '/api/seo?type=private&path=checkout');
  assert.equal(privatePage.statusCode, 200);
  assert.match(privatePage.headers['X-Robots-Tag'], /noindex/);
  assert.match(privatePage.body, /content="noindex, nofollow"/);
  assert.match(privatePage.body, /href="https:\/\/toubashose\.ir\/checkout"/);

  const missingProductHandler = seoHandler.createHandler({
    env: apiEnv(),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }),
    indexHtml
  });
  const missingProduct = await request(missingProductHandler, '/api/seo?type=product&slug=missing-shoe');
  assert.equal(missingProduct.statusCode, 404);
  assert.match(missingProduct.headers['X-Robots-Tag'], /noindex/);

  const outageHandler = seoHandler.createHandler({
    env: apiEnv(),
    fetchImpl: async () => { throw new Error('temporary outage'); },
    indexHtml
  });
  const outage = await request(outageHandler, '/api/seo?type=product&slug=shoe');
  assert.equal(outage.statusCode, 200, 'temporary catalog outages must not become false product 404s');
  assert.match(outage.body, /https:\/\/toubashose\.ir\/product\/shoe/);

  const fallbackHandler = seoHandler.createHandler({ env: {}, fetchImpl, indexHtml });
  const fallbackSitemap = await request(fallbackHandler, '/api/seo?type=sitemap');
  assert.equal(fallbackSitemap.statusCode, 200);
  assert.match(fallbackSitemap.body, /https:\/\/toubashose\.ir\//);
  assert.doesNotMatch(fallbackSitemap.body, /vercel\.app/);

  const wrongMethod = await request(handler, '/api/seo?type=sitemap', 'POST');
  assert.equal(wrongMethod.statusCode, 405);
  testBrowserSeo();

  console.log('PASS: canonical domain, server-rendered product/category/shop SEO, dynamic catalog sitemap, noindex controls, and client metadata');
}

run().catch(error => {
  console.error('FAIL: SEO tests:', error);
  process.exitCode = 1;
});

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { serverConfiguration } = require('../lib/supabase-server');

const CANONICAL_ORIGIN = 'https://toubashose.ir';
const STORE_NAME = 'کفش طوبی';
const DEFAULT_DESCRIPTION = 'خرید اینترنتی کفش از طوبی؛ مشخصات، قیمت، سایزبندی، رنگ و موجودی هر محصول را پیش از سفارش بررسی کنید.';
const SITEMAP_STATIC_PATHS = ['/', '/about', '/contact', '/terms', '/privacy'];
const SITEMAP_MAX_URLS = 50000;
const PAGE_SIZE = 1000;
const CACHE_PAGE = 'public, s-maxage=900, stale-while-revalidate=86400';
const CACHE_SITEMAP = 'public, s-maxage=300, stale-while-revalidate=3600';
const PRIVATE_ROBOTS = 'noindex, nofollow';
const INDEX_ROBOTS = 'index, follow';
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimText(value, max = 160) {
  const text = plainText(value);
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`;
}

function safeAssetUrl(value, fallback = '/touba-hero-editorial.jpg') {
  const candidate = String(value || fallback).trim();
  if (!candidate || candidate.startsWith('data:') || candidate.startsWith('//')) return new URL(fallback, CANONICAL_ORIGIN).href;
  try {
    const url = new URL(candidate, CANONICAL_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password) return new URL(fallback, CANONICAL_ORIGIN).href;
    return url.href;
  } catch {
    return new URL(fallback, CANONICAL_ORIGIN).href;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function relationOne(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

function publicConfig(env) {
  try {
    return serverConfiguration(env, { service: false });
  } catch {
    // SEO must keep serving the storefront if the public catalog API is temporarily unavailable.
    return null;
  }
}

function restUrl(config, table, query = {}) {
  const url = new URL(`/rest/v1/${table}`, config.baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchRows(config, table, query, fetchImpl) {
  const response = await fetchImpl(restUrl(config, table, query), {
    method: 'GET',
    headers: {
      apikey: config.publicKey,
      Authorization: `Bearer ${config.publicKey}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(7000)
  });
  if (!response?.ok) throw new Error(`Public catalog query failed (${Number(response?.status) || 0}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Public catalog query returned an invalid response.');
  return rows;
}

async function fetchAllRows(config, table, select, filters, fetchImpl, limit) {
  const all = [];
  while (all.length < limit) {
    const count = Math.min(PAGE_SIZE, limit - all.length);
    const rows = await fetchRows(config, table, {
      select,
      ...filters,
      limit: count,
      offset: all.length
    }, fetchImpl);
    all.push(...rows.slice(0, count));
    if (rows.length < count) break;
  }
  return all;
}

function getPathSlug(value) {
  const slug = String(value || '').trim();
  if (!slug || slug.length > 256 || /[\u0000-\u001f\u007f/\\]/.test(slug)) return '';
  return slug;
}

async function findBySlugOrId(config, table, slug, select, fetchImpl) {
  const cleanSlug = getPathSlug(slug);
  if (!cleanSlug) return null;
  const slugRows = await fetchRows(config, table, {
    select,
    slug: `eq.${cleanSlug}`,
    is_active: 'eq.true',
    limit: 1
  }, fetchImpl);
  if (slugRows[0]) return slugRows[0];
  if (!isUuid(cleanSlug)) return null;
  const idRows = await fetchRows(config, table, {
    select,
    id: `eq.${cleanSlug}`,
    is_active: 'eq.true',
    limit: 1
  }, fetchImpl);
  return idRows[0] || null;
}

function canonicalPath(kind, slug) {
  return `/${kind}/${encodeURIComponent(String(slug || '').trim())}`;
}

function canonicalUrl(pathname = '/') {
  const value = String(pathname || '/').trim();
  const route = value.startsWith('/') && !value.startsWith('//')
    ? value
    : `/${value.replace(/^\/+/, '')}`;
  return new URL(route.replace(/\\/g, '/'), CANONICAL_ORIGIN).href;
}

function setTagAttributeById(html, id, attribute, value) {
  const safeId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagPattern = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*\\bid=["']${safeId}["'][^>]*)>`, 'i');
  return html.replace(tagPattern, (full, tagName, attributes) => {
    const attrPattern = new RegExp(`\\b${attribute}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
    const escaped = `${attribute}="${escapeHtml(value)}"`;
    const nextAttributes = attrPattern.test(attributes)
      ? attributes.replace(attrPattern, escaped)
      : `${attributes} ${escaped}`;
    return `<${tagName}${nextAttributes}>`;
  });
}

function applyMetadata(html, meta) {
  let output = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  const contentTags = [
    ['seo-description', 'content', meta.description],
    ['seo-robots', 'content', meta.robots],
    ['seo-canonical', 'href', meta.canonical],
    ['seo-og-title', 'content', meta.title],
    ['seo-og-description', 'content', meta.description],
    ['seo-og-url', 'content', meta.canonical],
    ['seo-og-image', 'content', meta.image],
    ['seo-og-image-alt', 'content', meta.imageAlt || meta.title],
    ['seo-og-type', 'content', meta.ogType || 'website'],
    ['seo-product-price-amount', 'content', meta.productPrice || ''],
    ['seo-product-price-currency', 'content', meta.productPriceCurrency || ''],
    ['seo-twitter-title', 'content', meta.title],
    ['seo-twitter-description', 'content', meta.description],
    ['seo-twitter-image', 'content', meta.image],
    ['seo-twitter-image-alt', 'content', meta.imageAlt || meta.title]
  ];
  for (const [id, attribute, value] of contentTags) output = setTagAttributeById(output, id, attribute, value);
  if (meta.appHtml !== undefined) output = output.replace('<div id="app"></div>', `<div id="app">${meta.appHtml}</div>`);
  if (meta.jsonLd) {
    const json = JSON.stringify(meta.jsonLd)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    output = output.replace('</head>', `<script id="page-jsonld" type="application/ld+json">${json}</script></head>`);
  }
  return output;
}

function readIndexHtml(provided) {
  if (typeof provided === 'string' && provided.includes('<div id="app"></div>')) return provided;
  try {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    if (html.includes('<div id="app"></div>')) return html;
  } catch { /* Vercel includeFiles and the local checkout both provide index.html. */ }
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>کفش طوبی</title></head><body><div id="app"></div></body></html>';
}

function send(res, status, body, contentType, headers = {}, headOnly = false) {
  const responseHeaders = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  };
  if (typeof res.writeHead === 'function') res.writeHead(status, responseHeaders);
  else {
    res.statusCode = status;
    for (const [name, value] of Object.entries(responseHeaders)) res.setHeader?.(name, value);
  }
  res.end(headOnly ? '' : body);
}

function makeMeta({ title, description = DEFAULT_DESCRIPTION, canonical = '/', robots = INDEX_ROBOTS, image, imageAlt, ogType = 'website', productPrice = '', productPriceCurrency = '', appHtml = '', jsonLd }) {
  return {
    title,
    description: trimText(description, 160),
    canonical: canonicalUrl(canonical),
    robots,
    image: safeAssetUrl(image),
    imageAlt: imageAlt || title,
    ogType,
    productPrice,
    productPriceCurrency,
    appHtml,
    jsonLd
  };
}

function siteBreadcrumbSchema(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path)
    }))
  };
}

function siteJsonLd(pageEntity, breadcrumbs) {
  const graph = [pageEntity];
  if (breadcrumbs?.length) graph.push(siteBreadcrumbSchema(breadcrumbs));
  return { '@context': 'https://schema.org', '@graph': graph };
}

function productImages(row) {
  const rows = Array.isArray(row.product_images) ? row.product_images.slice() : [];
  rows.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const seen = new Set();
  return rows.map(image => ({
    url: safeAssetUrl(image.url, '/product-shoes.jpg'),
    alt: trimText(image.alt || row.name || 'تصویر محصول کفش طوبی', 120)
  })).filter(image => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  }).slice(0, 12);
}

function productStock(row) {
  return (Array.isArray(row.product_variants) ? row.product_variants : [])
    .reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
}

function productDescription(row) {
  const short = plainText(row.short_description);
  const full = plainText(row.description);
  const candidate = short && short !== plainText(row.name) ? short : full;
  if (candidate) return trimText(candidate, 160);
  return trimText(`قیمت، مشخصات، سایزبندی، رنگ و موجودی ${plainText(row.name)} را در فروشگاه کفش طوبی بررسی کنید.`, 160);
}

function productTitle(row) {
  return trimText(`خرید ${plainText(row.name)} | ${STORE_NAME}`, 70);
}

function productEntity(row, canonical, categoryName, images) {
  const entity = {
    '@type': 'Product',
    name: plainText(row.name),
    description: productDescription(row),
    url: canonical,
    brand: { '@type': 'Brand', name: plainText(row.brand) || STORE_NAME }
  };
  const sku = plainText(row.sku);
  if (sku) entity.sku = sku;
  if (categoryName) entity.category = categoryName;
  if (images.length) entity.image = images.map(image => image.url);
  const priceToman = Number(row.price_toman);
  if (Number.isFinite(priceToman) && priceToman > 0) {
    entity.offers = {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'IRR',
      price: String(Math.round(priceToman * 10)),
      availability: productStock(row) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    };
  }
  return entity;
}

function formatToman(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '';
  return `${new Intl.NumberFormat('fa-IR').format(Math.round(amount))} تومان`;
}

function renderProductHtml(row, category, images) {
  const name = escapeHtml(plainText(row.name));
  const description = escapeHtml(plainText(row.short_description) || plainText(row.description) || productDescription(row));
  const image = images[0];
  const categoryName = plainText(category?.name);
  const categoryMarkup = categoryName
    ? `<div class="detail-row"><b>دسته‌بندی</b><span>${escapeHtml(categoryName)}</span></div>`
    : '';
  const variants = Array.isArray(row.product_variants) ? row.product_variants : [];
  const sizes = [...new Set(variants.map(variant => plainText(variant.size)).filter(Boolean))];
  const colors = [...new Set(variants.map(variant => plainText(variant.color)).filter(Boolean))];
  const stock = productStock(row);
  const price = formatToman(row.price_toman);
  const imageMarkup = image
    ? `<div class="gallery-main"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || plainText(row.name))}" width="720" height="720" fetchpriority="high" loading="eager" style="width:100%;height:100%;object-fit:contain"></div>`
    : `<div class="gallery-main" role="img" aria-label="${name}"><div class="shoe-placeholder" style="width:100%;height:100%;background-image:url('/product-shoes.jpg');background-size:cover"></div></div>`;
  return `<main class="page container seo-prerender"><nav class="breadcrumb" aria-label="مسیر صفحه"><a href="/">خانه</a>　/　<a href="/shop">فروشگاه کفش</a>　/　<span>${name}</span></nav><article class="product-layout seo-product"><div>${imageMarkup}</div><div class="product-detail"><div class="eyebrow">${escapeHtml(categoryName || STORE_NAME)}</div><h1>${name}</h1>${price ? `<div class="detail-price">${escapeHtml(price)}</div>` : ''}<p>${description}</p>${categoryMarkup}${sizes.length ? `<div class="detail-row"><b>سایزهای ثبت‌شده</b><span>${escapeHtml(sizes.join('، '))}</span></div>` : ''}${colors.length ? `<div class="detail-row"><b>رنگ‌های ثبت‌شده</b><span>${escapeHtml(colors.join('، '))}</span></div>` : ''}<div class="detail-row"><b>وضعیت موجودی</b><span>${stock > 0 ? 'موجود' : 'ناموجود'}</span></div><a class="btn" href="/shop">بازگشت به فروشگاه</a></div></article><section class="section seo-description"><h2>مشخصات محصول</h2><p>${description}</p></section></main>`;
}

async function loadProduct(config, slug, fetchImpl) {
  const select = 'id,slug,name,short_description,description,brand,sku,price_toman,compare_at_price_toman,category_id,updated_at,categories(id,slug,name),product_images(url,alt,sort_order),product_variants(size,color,stock)';
  const row = await findBySlugOrId(config, 'products', slug, select, fetchImpl);
  if (!row) return null;
  const category = relationOne(row.categories);
  const images = productImages(row);
  const canonicalRoute = canonicalPath('product', row.slug || row.id);
  const canonical = canonicalUrl(canonicalRoute);
  const priceToman = Number(row.price_toman);
  const productPrice = Number.isFinite(priceToman) && priceToman > 0 ? String(Math.round(priceToman * 10)) : '';
  const crumbs = [{ name: 'خانه', path: '/' }, { name: 'فروشگاه کفش', path: '/shop' }];
  if (category?.slug) crumbs.push({ name: plainText(category.name), path: canonicalPath('category', category.slug) });
  crumbs.push({ name: plainText(row.name), path: canonicalRoute });
  const meta = makeMeta({
    title: productTitle(row),
    description: productDescription(row),
    canonical: canonicalRoute,
    robots: INDEX_ROBOTS,
    image: images[0]?.url,
    imageAlt: images[0]?.alt || plainText(row.name),
    ogType: 'product',
    productPrice,
    productPriceCurrency: productPrice ? 'IRR' : '',
    appHtml: renderProductHtml(row, category, images),
    jsonLd: siteJsonLd(productEntity(row, canonical, plainText(category?.name), images), crumbs)
  });
  return { row, meta, canonicalRoute };
}

function renderCategoryProducts(products) {
  return products.map(row => {
    const productSlug = plainText(row.slug || row.id);
    const href = canonicalPath('product', productSlug);
    const images = productImages(row);
    const image = images[0];
    const name = escapeHtml(plainText(row.name));
    const description = escapeHtml(plainText(row.short_description) || productDescription(row));
    const price = formatToman(row.price_toman);
    return `<article class="lux-product-card seo-prerender-card"><a class="lux-product-image" href="${escapeHtml(href)}">${image ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || plainText(row.name))}" width="480" height="380" loading="lazy">` : `<span class="lux-product-placeholder" role="img" aria-label="${name}">کفش طوبی</span>`}</a><div class="lux-product-info"><h2><a href="${escapeHtml(href)}">${name}</a></h2><p>${description}</p>${price ? `<strong>${escapeHtml(price)}</strong>` : ''}<a class="product-view-link" href="${escapeHtml(href)}">مشاهده محصول</a></div></article>`;
  }).join('');
}

function categoryDescription(category) {
  const description = plainText(category.description);
  if (description) return trimText(description, 160);
  return trimText(`مدل‌های ${plainText(category.name)} را در فروشگاه کفش طوبی ببینید؛ قیمت، سایزبندی، رنگ و موجودی هر محصول ثبت شده است.`, 160);
}

function categoryEntity(category, products, canonical) {
  const entity = {
    '@type': 'CollectionPage',
    name: `خرید ${plainText(category.name)} | ${STORE_NAME}`,
    description: categoryDescription(category),
    url: canonical,
    inLanguage: 'fa-IR'
  };
  if (products.length) {
    entity.mainEntity = {
      '@type': 'ItemList',
      itemListElement: products.slice(0, 100).map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: plainText(product.name),
        url: canonicalUrl(canonicalPath('product', product.slug || product.id))
      }))
    };
  }
  return entity;
}

function renderCategoryHtml(category, products) {
  const name = escapeHtml(plainText(category.name));
  const description = escapeHtml(plainText(category.description) || categoryDescription(category));
  const items = products.length
    ? `<div class="lux-product-grid seo-category-products">${renderCategoryProducts(products)}</div>`
    : '<p class="empty-state">در حال حاضر محصول فعالی در این دسته‌بندی ثبت نشده است.</p>';
  return `<main class="page container seo-prerender"><nav class="breadcrumb" aria-label="مسیر صفحه"><a href="/">خانه</a>　/　<a href="/shop">فروشگاه کفش</a>　/　<span>${name}</span></nav><section class="shop-hero-bar"><div><h1>خرید ${name}</h1><p class="shop-hero-sub">${description}</p></div></section><section class="products-section"><h2>محصولات ${name}</h2>${items}</section></main>`;
}

async function loadCategory(config, slug, fetchImpl) {
  const category = await findBySlugOrId(config, 'categories', slug, 'id,slug,name,description,image_url,updated_at', fetchImpl);
  if (!category) return null;
  const products = await fetchRows(config, 'products', {
    select: 'id,slug,name,short_description,description,brand,sku,price_toman,updated_at,product_images(url,alt,sort_order)',
    category_id: `eq.${category.id}`,
    is_active: 'eq.true',
    order: 'updated_at.desc',
    limit: 100
  }, fetchImpl);
  const canonicalRoute = canonicalPath('category', category.slug || category.id);
  const canonical = canonicalUrl(canonicalRoute);
  const meta = makeMeta({
    title: trimText(`خرید ${plainText(category.name)} | ${STORE_NAME}`, 70),
    description: categoryDescription(category),
    canonical: canonicalRoute,
    robots: products.length ? INDEX_ROBOTS : 'noindex, follow',
    image: safeAssetUrl(category.image_url || productImages(products[0] || {})[0]?.url),
    imageAlt: plainText(category.name),
    appHtml: renderCategoryHtml(category, products),
    jsonLd: products.length ? siteJsonLd(categoryEntity(category, products, canonical), [
      { name: 'خانه', path: '/' },
      { name: 'فروشگاه کفش', path: '/shop' },
      { name: plainText(category.name), path: canonicalRoute }
    ]) : undefined
  });
  return { category, products, meta, canonicalRoute };
}

function collectionEntity(name, products, canonical, description) {
  const entity = {
    '@type': 'CollectionPage',
    name,
    description,
    url: canonical,
    inLanguage: 'fa-IR'
  };
  if (products.length) {
    entity.mainEntity = {
      '@type': 'ItemList',
      itemListElement: products.slice(0, 100).map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: plainText(product.name),
        url: canonicalUrl(canonicalPath('product', product.slug || product.id))
      }))
    };
  }
  return entity;
}

async function loadShop(config, fetchImpl) {
  const [categories, products, activeProductCategories] = await Promise.all([
    fetchRows(config, 'categories', {
      select: 'id,slug,name,image_url',
      is_active: 'eq.true',
      order: 'sort_order.asc',
      limit: 100
    }, fetchImpl),
    fetchRows(config, 'products', {
      select: 'id,slug,name,short_description,description,brand,sku,price_toman,updated_at,category_id,product_images(url,alt,sort_order)',
      is_active: 'eq.true',
      order: 'updated_at.desc',
      limit: 60
    }, fetchImpl),
    fetchRows(config, 'products', {
      select: 'category_id',
      is_active: 'eq.true',
      limit: 1000
    }, fetchImpl)
  ]);
  const description = 'مدل‌های فعال کفش طوبی را ببینید و قیمت، سایزبندی، رنگ و موجودی ثبت‌شدهٔ هر محصول را بررسی کنید.';
  const populatedCategoryIds = new Set(activeProductCategories.map(product => product.category_id).filter(Boolean));
  const visibleCategories = categories.filter(category => populatedCategoryIds.has(category.id));
  const categoriesHtml = visibleCategories.length
    ? `<nav class="seo-category-links" aria-label="دسته‌بندی محصولات"><h2>دسته‌بندی‌های فروشگاه</h2><ul>${visibleCategories.map(category => `<li><a href="${escapeHtml(canonicalPath('category', category.slug || category.id))}">${escapeHtml(plainText(category.name))}</a></li>`).join('')}</ul></nav>`
    : '';
  const productsHtml = products.length
    ? `<div class="lux-product-grid seo-shop-products">${renderCategoryProducts(products)}</div>`
    : '<p class="empty-state">محصول فعالی برای نمایش ثبت نشده است.</p>';
  const appHtml = `<main class="page container seo-prerender"><nav class="breadcrumb" aria-label="مسیر صفحه"><a href="/">خانه</a>　/　<span>فروشگاه کفش</span></nav><h1>خرید اینترنتی کفش</h1><p>${escapeHtml(description)}</p>${categoriesHtml}<section class="products-section"><h2>محصولات فروشگاه کفش طوبی</h2>${productsHtml}</section></main>`;
  const canonical = canonicalUrl('/shop');
  const entity = collectionEntity(`خرید اینترنتی کفش | ${STORE_NAME}`, products, canonical, description);
  const image = productImages(products[0] || {})[0]?.url;
  return makeMeta({
    title: `خرید اینترنتی کفش | ${STORE_NAME}`,
    description,
    canonical: '/shop',
    robots: products.length ? INDEX_ROBOTS : 'noindex, follow',
    image,
    imageAlt: 'محصولات فروشگاه کفش طوبی',
    appHtml,
    jsonLd: products.length ? siteJsonLd(entity, [
      { name: 'خانه', path: '/' },
      { name: 'فروشگاه کفش', path: '/shop' }
    ]) : undefined
  });
}

function xmlLastmod(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `<lastmod>${date.toISOString().slice(0, 10)}</lastmod>`;
}

function buildSitemap(categories = [], products = []) {
  const records = SITEMAP_STATIC_PATHS.map(pathname => ({ loc: canonicalUrl(pathname) }));
  if (products.length) records.push({ loc: canonicalUrl('/shop') });
  for (const category of categories) {
    const slug = getPathSlug(category.slug);
    if (slug) records.push({ loc: canonicalUrl(canonicalPath('category', slug)), lastmod: category.updated_at });
  }
  for (const product of products) {
    const slug = getPathSlug(product.slug);
    if (slug) records.push({ loc: canonicalUrl(canonicalPath('product', slug)), lastmod: product.updated_at });
  }
  const unique = new Map();
  for (const record of records) {
    if (!unique.has(record.loc)) unique.set(record.loc, record);
  }
  const urls = [...unique.values()].slice(0, SITEMAP_MAX_URLS).map(record =>
    `<url><loc>${escapeXml(record.loc)}</loc>${xmlLastmod(record.lastmod)}</url>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

async function loadSitemap(config, fetchImpl) {
  if (!config) return buildSitemap();
  // Reserve one slot for /shop whenever at least one active product exists.
  const dynamicLimit = SITEMAP_MAX_URLS - SITEMAP_STATIC_PATHS.length - 1;
  const categoryLimit = Math.min(1000, dynamicLimit);
  const categories = await fetchAllRows(config, 'categories', 'id,slug,updated_at', { is_active: 'eq.true', order: 'slug.asc' }, fetchImpl, categoryLimit);
  const products = await fetchAllRows(config, 'products', 'slug,updated_at,category_id', { is_active: 'eq.true', order: 'slug.asc' }, fetchImpl, dynamicLimit - categories.length);
  const populatedCategoryIds = new Set(products.map(product => product.category_id).filter(Boolean));
  return buildSitemap(categories.filter(category => populatedCategoryIds.has(category.id)), products);
}

function notFoundHtml(kind, slug) {
  const label = kind === 'product' ? 'محصول' : 'دسته‌بندی';
  return `<main class="page container seo-prerender"><section class="panel empty"><h1>${label} پیدا نشد</h1><p>این صفحه در فروشگاه کفش طوبی در دسترس نیست.</p><a class="btn" href="/shop">بازگشت به فروشگاه</a></section></main>`;
}

function privatePage(pathname) {
  const labels = {
    '/cart': 'سبد خرید',
    '/checkout': 'تکمیل سفارش',
    '/login': 'ورود به حساب کاربری',
    '/account': 'حساب کاربری',
    '/account/orders': 'سفارش‌های من',
    '/wishlist': 'علاقه‌مندی‌ها',
    '/tracking': 'پیگیری سفارش',
    '/search': 'جستجوی محصولات'
  };
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPaymentResult = pathname.startsWith('/payment/result/');
  const title = `${labels[pathname] || (isAdmin ? 'مدیریت فروشگاه' : isPaymentResult ? 'نتیجه پرداخت' : 'صفحه خصوصی')} | ${STORE_NAME}`;
  const description = 'این صفحه برای خرید یا مدیریت حساب کاربری است و در نتایج جست‌وجو نمایش داده نمی‌شود.';
  const body = '<main class="page container seo-prerender"><h1>در حال بارگذاری فروشگاه طوبی</h1></main>';
  return makeMeta({ title, description, canonical: pathname, robots: PRIVATE_ROBOTS, appHtml: body });
}

function getRequestUrl(req) {
  let url;
  try { url = new URL(req.url || '/', CANONICAL_ORIGIN); }
  catch { url = new URL('/', CANONICAL_ORIGIN); }
  const query = req.query && typeof req.query === 'object' ? req.query : null;
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (url.searchParams.has(key) || value === undefined || value === null) continue;
      for (const item of (Array.isArray(value) ? value : [value])) url.searchParams.append(key, String(item));
    }
  }
  return url;
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const indexHtml = readIndexHtml(options.indexHtml);
  return async function seoHandler(req, res) {
    const requestUrl = getRequestUrl(req);
    const params = requestUrl.searchParams;
    const type = params.get('type') || '';
    const headOnly = String(req.method || 'GET').toUpperCase() === 'HEAD';
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
      return send(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    }

    if (type === 'sitemap') {
      let xml = buildSitemap();
      const config = publicConfig(env);
      if (config && typeof fetchImpl === 'function') {
        try { xml = await loadSitemap(config, fetchImpl); }
        catch { /* Static canonical URLs remain available during database outages. */ }
      }
      return send(res, 200, xml, 'application/xml; charset=utf-8', {
        'Cache-Control': CACHE_SITEMAP,
        'X-Robots-Tag': 'noindex'
      }, headOnly);
    }

    if (type === 'private') {
      const rawPath = String(params.get('path') || '').trim();
      const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      const meta = privatePage(pathname);
      return send(res, 200, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': PRIVATE_ROBOTS
      }, headOnly);
    }

    const config = publicConfig(env);
    if (type === 'product' || type === 'category') {
      const slug = params.get('slug') || '';
      const kind = type;
      let result = null;
      let lookupFailed = false;
      if (config && typeof fetchImpl === 'function') {
        try {
          result = type === 'product'
            ? await loadProduct(config, slug, fetchImpl)
            : await loadCategory(config, slug, fetchImpl);
        } catch { lookupFailed = true; /* Render a safe SPA shell; the browser can still load its public data. */ }
      }
      if (result) {
        const requestedSlug = getPathSlug(slug);
        if (isUuid(requestedSlug) && requestedSlug !== String(result.row?.slug || result.category?.slug || '')) {
          const target = result.meta.canonical;
          return send(res, 301, '', 'text/plain; charset=utf-8', {
            Location: target,
            'Cache-Control': 'public, max-age=86400'
          }, true);
        }
        return send(res, 200, applyMetadata(indexHtml, result.meta), 'text/html; charset=utf-8', {
          'Cache-Control': CACHE_PAGE,
          'X-Robots-Tag': result.meta.robots
        }, headOnly);
      }
      if (config && typeof fetchImpl === 'function' && !lookupFailed) {
        const missingPath = canonicalPath(type, getPathSlug(slug) || '');
        const meta = makeMeta({
          title: `${type === 'product' ? 'محصول' : 'دسته‌بندی'} پیدا نشد | ${STORE_NAME}`,
          description: 'این صفحه در فروشگاه کفش طوبی در دسترس نیست.',
          canonical: missingPath,
          robots: PRIVATE_ROBOTS,
          appHtml: notFoundHtml(type, slug)
        });
        return send(res, 404, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': PRIVATE_ROBOTS
        }, headOnly);
      }
      const fallbackPath = canonicalPath(type, getPathSlug(slug) || '');
      const meta = makeMeta({
        title: type === 'product' ? `خرید اینترنتی کفش | ${STORE_NAME}` : `دسته‌بندی کفش | ${STORE_NAME}`,
        description: DEFAULT_DESCRIPTION,
        canonical: fallbackPath,
        robots: 'noindex, follow'
      });
      return send(res, 200, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, follow'
      }, headOnly);
    }

    if (type === 'shop') {
      const search = params.get('q');
      const categoryFilter = params.get('category');
      const hasOtherFilters = ['sort', 'min', 'max', 'size', 'color'].some(key => params.has(key));
      if (search || hasOtherFilters) {
        const meta = makeMeta({
          title: search ? `جستجوی ${trimText(search, 45)} | ${STORE_NAME}` : `فروشگاه کفش | ${STORE_NAME}`,
          description: DEFAULT_DESCRIPTION,
          canonical: '/shop',
          robots: 'noindex, follow'
        });
        return send(res, 200, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, follow'
        }, headOnly);
      }
      if (categoryFilter && config && typeof fetchImpl === 'function') {
        let categoryResult = null;
        let lookupFailed = false;
        try { categoryResult = await loadCategory(config, categoryFilter, fetchImpl); }
        catch { lookupFailed = true; /* The store shell remains available if category lookup is unavailable. */ }
        if (categoryResult) {
          return send(res, 200, applyMetadata(indexHtml, categoryResult.meta), 'text/html; charset=utf-8', {
            'Cache-Control': CACHE_PAGE,
            'X-Robots-Tag': categoryResult.meta.robots
          }, headOnly);
        }
        if (!lookupFailed) {
          const meta = makeMeta({
            title: `دسته‌بندی پیدا نشد | ${STORE_NAME}`,
            description: 'این دسته‌بندی در فروشگاه کفش طوبی در دسترس نیست.',
            canonical: '/shop',
            robots: PRIVATE_ROBOTS
          });
          return send(res, 404, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
            'Cache-Control': 'no-store',
            'X-Robots-Tag': PRIVATE_ROBOTS
          }, headOnly);
        }
      }
      if (config && typeof fetchImpl === 'function') {
        try {
          const meta = await loadShop(config, fetchImpl);
          return send(res, 200, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
            'Cache-Control': CACHE_PAGE,
            'X-Robots-Tag': meta.robots
          }, headOnly);
        } catch { /* No database availability should make the public storefront disappear. */ }
      }
      const meta = makeMeta({
        title: `خرید اینترنتی کفش | ${STORE_NAME}`,
        description: DEFAULT_DESCRIPTION,
        canonical: '/shop',
        robots: 'noindex, follow'
      });
      return send(res, 200, applyMetadata(indexHtml, meta), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, follow'
      }, headOnly);
    }

    return send(res, 404, 'Not Found', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' }, headOnly);
  };
}

const handler = createHandler();
handler.createHandler = createHandler;
handler.helpers = {
  CANONICAL_ORIGIN,
  SITEMAP_STATIC_PATHS,
  buildSitemap,
  applyMetadata,
  productDescription,
  productEntity,
  canonicalUrl,
  makeMeta,
  loadProduct,
  loadCategory,
  loadShop,
  loadSitemap,
  fetchRows
};
module.exports = handler;

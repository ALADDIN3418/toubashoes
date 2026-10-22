/* Canonical, Persian storefront metadata and JSON-LD. Search engines must never inherit a Vercel preview host. */
const SEO_ORIGIN = 'https://toubashose.ir';
const SEO_STORE_NAME = 'کفش طوبی';
const SEO_HOME_TITLE = `خرید اینترنتی کفش زنانه و مردانه | ${SEO_STORE_NAME}`;
const SEO_HOME_DESCRIPTION = 'خرید اینترنتی کفش از طوبی؛ مشخصات، قیمت، سایزبندی، رنگ و موجودی هر محصول را پیش از سفارش بررسی کنید.';

const __beforeSeoRender = window.__stage3Render;

function setMeta(name, content, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let element = document.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(property ? 'property' : 'name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content || '');
}

function seoText(value, max = 160) {
  const text = String(value ?? '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

function seoAbsoluteUrl(value, fallback = '/touba-hero-editorial.jpg') {
  const candidate = String(value || fallback).trim();
  if (!candidate || candidate.startsWith('data:') || candidate.startsWith('//')) return new URL(fallback, SEO_ORIGIN).href;
  try {
    const url = new URL(candidate, SEO_ORIGIN);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : new URL(fallback, SEO_ORIGIN).href;
  } catch {
    return new URL(fallback, SEO_ORIGIN).href;
  }
}

function seoCanonicalPath(currentPath, currentUrl, item, category) {
  if (currentPath.startsWith('/product/') && item) {
    return `/product/${encodeURIComponent(item.slug || item.id)}`;
  }
  if (currentPath.startsWith('/category/') && category) {
    return `/category/${encodeURIComponent(category.slug || category.id)}`;
  }
  if (currentPath === '/shop') {
    const categoryValue = currentUrl.searchParams.get('category');
    const matched = (db.categories || []).find(entry => entry.id === categoryValue || entry.slug === categoryValue);
    if (matched?.active && matched.slug) return `/category/${encodeURIComponent(matched.slug)}`;
    return '/shop';
  }
  return currentPath || '/';
}

function seoBreadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, SEO_ORIGIN).href
    }))
  };
}

function seoProductSchema(item, category, canonical) {
  const entity = {
    '@type': 'Product',
    name: seoText(item.name, 180),
    description: seoText(item.shortDesc || item.longDesc || item.desc || SEO_HOME_DESCRIPTION, 500),
    url: canonical,
    brand: { '@type': 'Brand', name: seoText(item.brand || SEO_STORE_NAME, 100) }
  };
  if (item.sku) entity.sku = seoText(item.sku, 80);
  if (category?.name) entity.category = seoText(category.name, 120);
  const images = (Array.isArray(item.images) ? item.images : [])
    .map(image => seoAbsoluteUrl(image, '/product-shoes.jpg'))
    .filter((image, index, list) => list.indexOf(image) === index)
    .slice(0, 12);
  if (images.length) entity.image = images;
  const toman = Number(item.price);
  if (Number.isFinite(toman) && toman > 0) {
    const stock = typeof totalStock === 'function'
      ? totalStock(item)
      : (item.variants || []).reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
    entity.offers = {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'IRR',
      price: String(Math.round(toman * 10)),
      availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    };
  }
  return entity;
}

function seoCollectionSchema(name, description, canonical, products) {
  const activeProducts = (products || []).filter(item => item?.active && (item.slug || item.id)).slice(0, 100);
  const entity = {
    '@type': 'CollectionPage',
    name,
    description,
    url: canonical,
    inLanguage: 'fa-IR'
  };
  if (activeProducts.length) {
    entity.mainEntity = {
      '@type': 'ItemList',
      itemListElement: activeProducts.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: seoText(item.name, 180),
        url: new URL(`/product/${encodeURIComponent(item.slug || item.id)}`, SEO_ORIGIN).href
      }))
    };
  }
  return entity;
}

function setPageJsonLd(value) {
  document.querySelector('#page-jsonld')?.remove();
  if (!value) return;
  const script = document.createElement('script');
  script.id = 'page-jsonld';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(value);
  document.head.appendChild(script);
}

function updateSEO() {
  const currentPath = typeof path === 'function' ? path() : decodeURI(location.pathname);
  const currentUrl = new URL(location.href);
  const storeName = seoText(db?.settings?.storeName || SEO_STORE_NAME, 80) || SEO_STORE_NAME;
  const products = Array.isArray(db?.products) ? db.products : [];
  const categories = Array.isArray(db?.categories) ? db.categories : [];
  let item = null;
  let category = null;
  let title = SEO_HOME_TITLE;
  let description = seoText(db?.settings?.metaDescription || SEO_HOME_DESCRIPTION, 160);
  let image = seoAbsoluteUrl('/touba-hero-editorial.jpg');
  let imageAlt = 'فروشگاه آنلاین کفش طوبی';
  let structured = null;
  let robots = 'index, follow';

  if (currentPath.startsWith('/product/')) {
    const slug = currentPath.split('/')[2] || '';
    item = products.find(entry => entry.id === slug || entry.slug === slug) || null;
    if (item?.active !== false && item) {
      category = categories.find(entry => entry.id === item.category) || null;
      title = seoText(`خرید ${item.name} | ${storeName}`, 70);
      description = seoText(item.shortDesc || item.longDesc || item.desc || `قیمت، سایزبندی، رنگ و موجودی ${item.name} را در فروشگاه کفش طوبی بررسی کنید.`, 160);
      image = seoAbsoluteUrl(item.images?.[0] || '/product-shoes.jpg');
      imageAlt = seoText(item.name, 120);
      const canonical = new URL(seoCanonicalPath(currentPath, currentUrl, item, category), SEO_ORIGIN).href;
      const graph = [seoProductSchema(item, category, canonical)];
      const crumbs = [{ name: 'خانه', path: '/' }, { name: 'فروشگاه کفش', path: '/shop' }];
      if (category?.slug) crumbs.push({ name: category.name, path: `/category/${encodeURIComponent(category.slug)}` });
      crumbs.push({ name: item.name, path: seoCanonicalPath(currentPath, currentUrl, item, category) });
      graph.push(seoBreadcrumb(crumbs));
      structured = { '@context': 'https://schema.org', '@graph': graph };
    } else {
      title = `محصول پیدا نشد | ${storeName}`;
      description = 'این محصول در فروشگاه کفش طوبی در دسترس نیست.';
      robots = 'noindex, nofollow';
    }
  } else if (currentPath.startsWith('/category/')) {
    const slug = currentPath.split('/')[2] || '';
    category = categories.find(entry => entry.slug === slug || entry.id === slug) || null;
    if (category?.active) {
      title = seoText(`خرید ${category.name} | ${storeName}`, 70);
      description = seoText(category.description || `مدل‌های ${category.name} را در فروشگاه کفش طوبی ببینید؛ قیمت، سایزبندی، رنگ و موجودی هر محصول را بررسی کنید.`, 160);
      image = seoAbsoluteUrl(category.imageUrl || '/touba-hero-editorial.jpg');
      imageAlt = seoText(category.name, 120);
      const canonical = new URL(seoCanonicalPath(currentPath, currentUrl, null, category), SEO_ORIGIN).href;
      const categoryProducts = products.filter(entry => entry.active && entry.category === category.id);
      if (categoryProducts.length) {
        const collection = seoCollectionSchema(title, description, canonical, categoryProducts);
        structured = {
          '@context': 'https://schema.org',
          '@graph': [collection, seoBreadcrumb([
            { name: 'خانه', path: '/' },
            { name: 'فروشگاه کفش', path: '/shop' },
            { name: category.name, path: seoCanonicalPath(currentPath, currentUrl, null, category) }
          ])]
        };
      } else {
        robots = 'noindex, follow';
      }
    } else {
      title = `دسته‌بندی پیدا نشد | ${storeName}`;
      description = 'این دسته‌بندی در فروشگاه کفش طوبی در دسترس نیست.';
      robots = 'noindex, nofollow';
    }
  } else if (currentPath === '/shop' || currentPath === '/search') {
    const query = currentUrl.searchParams.get('q')?.trim() || '';
    const categoryValue = currentUrl.searchParams.get('category');
    category = categories.find(entry => entry.id === categoryValue || entry.slug === categoryValue) || null;
    if (query) {
      title = `جستجوی ${seoText(query, 40)} | ${storeName}`;
      description = `نتایج جستجوی محصولات برای «${seoText(query, 80)}» در فروشگاه کفش طوبی.`;
      robots = 'noindex, follow';
    } else if (category?.active) {
      title = seoText(`خرید ${category.name} | ${storeName}`, 70);
      description = seoText(category.description || `مدل‌های ${category.name} را در فروشگاه کفش طوبی ببینید؛ قیمت، سایزبندی، رنگ و موجودی هر محصول را بررسی کنید.`, 160);
      const canonical = new URL(seoCanonicalPath(currentPath, currentUrl, null, category), SEO_ORIGIN).href;
      structured = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonical,
        inLanguage: 'fa-IR'
      };
    } else {
      title = `خرید اینترنتی کفش | ${storeName}`;
      description = SEO_HOME_DESCRIPTION;
      const canonical = new URL('/shop', SEO_ORIGIN).href;
      const activeProducts = products.filter(entry => entry.active);
      if (activeProducts.length) {
        structured = {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: canonical,
          inLanguage: 'fa-IR'
        };
      } else {
        robots = 'noindex, follow';
      }
    }
    if (currentPath === '/search') robots = 'noindex, follow';
    if ([...currentUrl.searchParams.keys()].some(key => !['category'].includes(key))) robots = 'noindex, follow';
  } else if (currentPath === '/about') {
    title = `درباره ما | ${storeName}`;
    description = seoText(db?.settings?.homepage?.aboutText || db?.settings?.about || 'با فروشگاه آنلاین کفش طوبی و راه‌های ارتباط با ما آشنا شوید.', 160);
  } else if (currentPath === '/contact') {
    title = `تماس با ما | ${storeName}`;
    description = 'راه‌های ارتباط با فروشگاه کفش طوبی را ببینید و برای پرسش درباره محصول یا سفارش با ما تماس بگیرید.';
  } else if (currentPath === '/terms') {
    title = `قوانین و شرایط خرید | ${storeName}`;
    description = 'پیش از خرید، شرایط سفارش، پرداخت، ارسال و بازگشت کالا در فروشگاه کفش طوبی را بخوانید.';
  } else if (currentPath === '/privacy') {
    title = `حریم خصوصی | ${storeName}`;
    description = 'اطلاعات مربوط به حریم خصوصی و نحوه استفاده از داده‌های مشتریان فروشگاه کفش طوبی.';
  } else if (currentPath === '/') {
    title = SEO_HOME_TITLE;
    description = SEO_HOME_DESCRIPTION;
    const activeProducts = products.filter(entry => entry.active);
    structured = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: new URL('/', SEO_ORIGIN).href,
      inLanguage: 'fa-IR',
      mainEntity: seoCollectionSchema(title, description, new URL('/', SEO_ORIGIN).href, activeProducts)
    };
  } else {
    const privatePage = [
      '/cart', '/checkout', '/login', '/account', '/account/orders', '/wishlist', '/tracking'
    ].includes(currentPath) || currentPath.startsWith('/account/') || currentPath.startsWith('/payment/result/') || currentPath === '/admin' || currentPath.startsWith('/admin/');
    robots = privatePage ? 'noindex, nofollow' : 'noindex, follow';
    title = `${privatePage ? 'صفحهٔ کاربری' : 'صفحه پیدا نشد'} | ${storeName}`;
    description = privatePage
      ? 'این صفحه برای خرید یا مدیریت حساب کاربری است و در نتایج جست‌وجو نمایش داده نمی‌شود.'
      : 'صفحه موردنظر در فروشگاه کفش طوبی پیدا نشد.';
  }

  const canonicalPath = seoCanonicalPath(currentPath, currentUrl, item, category);
  const canonical = new URL(canonicalPath, SEO_ORIGIN).href;
  document.title = title;
  setMeta('description', description);
  setMeta('robots', robots);
  setMeta('og:site_name', storeName, true);
  setMeta('og:title', title, true);
  setMeta('og:description', description, true);
  setMeta('og:type', item && robots.startsWith('index') ? 'product' : 'website', true);
  setMeta('og:url', canonical, true);
  setMeta('og:image', image, true);
  setMeta('og:image:alt', imageAlt, true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', image);
  setMeta('twitter:image:alt', imageAlt);
  setMeta('product:price:amount', item && Number(item.price) > 0 ? String(Math.round(Number(item.price) * 10)) : '', true);
  setMeta('product:price:currency', item && Number(item.price) > 0 ? 'IRR' : '', true);

  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonical;
  setPageJsonLd(structured);
}

function render() {
  if (typeof __beforeSeoRender === 'function') __beforeSeoRender();
  updateSEO();
}

window.render = render;
window.addEventListener('error', event => {
  console.error(event.error || event.message);
  if (typeof toast === 'function') toast('مشکلی پیش آمد. لطفاً دوباره تلاش کنید.');
});
window.addEventListener('unhandledrejection', event => {
  console.error(event.reason);
  if (typeof toast === 'function') toast('عملیات انجام نشد؛ دوباره تلاش کنید.');
});

if (typeof window !== 'undefined' && !document.querySelector?.('script[src*="stage4.js"]')) render();

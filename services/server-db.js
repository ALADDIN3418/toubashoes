'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const storeFile = path.join(dataDir, 'store.json');

function getDefaultSeed() {
  const seedFile = path.join(root, 'mock', 'seed-data.js');
  const code = fs.readFileSync(seedFile, 'utf8') + '; this.seed = seed;';
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const seed = ctx.seed || {};

  // Normalize products with variants
  const products = (seed.products || []).map(p => {
    const sizes = p.sizes && p.sizes.length ? p.sizes : ['۴۰', '۴۱', '۴۲'];
    const colors = p.colors && p.colors.length ? p.colors : ['مشکی'];
    const combos = sizes.flatMap(size => colors.map(color => ({ size, color })));
    const total = Number(p.stock) || 0;
    const base = Math.floor(total / Math.max(1, combos.length));
    const rem = total % Math.max(1, combos.length);
    const variants = combos.map((v, i) => ({
      id: `${v.size}::${v.color}`,
      size: v.size,
      color: v.color,
      sku: `${p.sku || p.id}-${i + 1}`,
      stock: base + (i < rem ? 1 : 0)
    }));
    return {
      ...p,
      sizes,
      colors,
      variants,
      stock: variants.reduce((sum, v) => sum + Number(v.stock || 0), 0),
      features: p.features || ['کیفیت ساخت بالا', 'کفی طبی و راحت', 'دوخت تمیز و بادوام'],
      specifications: p.specifications || { brand: p.brand || 'طوبی', material: 'چرم مرغوب', origin: 'ایران' },
      shortDesc: p.shortDesc || p.desc || '',
      longDesc: p.longDesc || p.desc || '',
      active: p.active !== false
    };
  });

  const users = [
    { id: 'admin-main', name: 'مدیر فروشگاه طوبی', email: 'admin@toubashoes.ir', phone: '09121234567', role: 'super_admin', isActive: true },
    { id: 'demo-admin', name: 'مدیر فروشگاه طوبی', email: 'sales@toubashoes.ir', phone: '09120000002', role: 'admin', isActive: true },
    { id: 'demo-customer', name: 'مشتری وفادار طوبی', email: 'customer@toubashoes.ir', phone: '09120000001', role: 'customer', isActive: true }
  ];

  return {
    categories: seed.categories || [],
    products,
    cart: [],
    orders: seed.orders || [],
    customers: seed.customers || [],
    coupons: seed.coupons || [],
    reviews: seed.reviews || [],
    banners: seed.banners || [],
    media: seed.media || ['hero-shoe.jpg', 'product-shoes.jpg'],
    settings: seed.settings || {
      phone: '۰۹۱۲ ۱۲۳ ۴۵۶۷',
      address: 'تهران، خیابان جمهوری، پاساژ کفش طوبی',
      shipping: 80000,
      freeShipping: 2000000,
      about: 'فروشگاه کفش طوبی با هدف ارائه کفش‌های باکیفیت، راحت و شیک فعالیت خود را آغاز کرده است.'
    },
    users
  };
}

let memoryStore = null;

function initStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(storeFile)) {
    try {
      const content = fs.readFileSync(storeFile, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        memoryStore = parsed;
        return memoryStore;
      }
    } catch (e) {
      console.warn('Error reading store file, re-seeding:', e.message);
    }
  }
  memoryStore = getDefaultSeed();
  try {
    fs.writeFileSync(storeFile, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing store file:', e.message);
  }
  return memoryStore;
}

function getStore() {
  if (!memoryStore) initStore();
  return memoryStore;
}

function saveStore(data) {
  if (!data || typeof data !== 'object') return false;
  memoryStore = { ...getStore(), ...data };
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const tempFile = storeFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(memoryStore, null, 2), 'utf8');
    fs.renameSync(tempFile, storeFile);
    return true;
  } catch (e) {
    console.error('Error persisting store:', e.message);
    return false;
  }
}

function createOrder(orderInput) {
  const store = getStore();
  const now = new Date();
  const id = `TB-${Date.now().toString().slice(-4)}`;
  const trackingCode = `TRK-${now.getTime().toString(36).toUpperCase()}`;

  const order = {
    id,
    number: id,
    customer: orderInput.name || orderInput.customer || 'مشتری طوبی',
    phone: orderInput.phone || '',
    province: orderInput.province || '',
    city: orderInput.city || '',
    address: orderInput.address || '',
    postal: orderInput.postal || '',
    itemsList: orderInput.itemsList || [],
    items: (orderInput.itemsList || []).reduce((n, i) => n + Number(i.qty || 1), 0),
    subtotal: Number(orderInput.subtotal) || 0,
    shipping: Number(orderInput.shipping) || 0,
    discount: Number(orderInput.discount) || 0,
    total: Number(orderInput.total) || 0,
    status: 'جدید',
    paymentStatus: 'PAID',
    paymentMethod: orderInput.paymentMethod || 'online',
    trackingCode,
    createdAt: now.toISOString(),
    date: new Intl.DateTimeFormat('fa-IR').format(now),
    timeline: [
      { status: 'جدید', at: now.toISOString(), label: 'ثبت سفارش با موفقیت انجام شد.' }
    ]
  };

  // Decrement inventory for items
  if (Array.isArray(order.itemsList)) {
    for (const item of order.itemsList) {
      const p = store.products.find(x => x.id === item.id || x.id === item.productId);
      if (p) {
        if (Array.isArray(p.variants)) {
          const v = p.variants.find(x => x.size === item.size && x.color === item.color);
          if (v) v.stock = Math.max(0, Number(v.stock || 0) - Number(item.qty || 1));
          p.stock = p.variants.reduce((n, x) => n + Number(x.stock || 0), 0);
        } else {
          p.stock = Math.max(0, Number(p.stock || 0) - Number(item.qty || 1));
        }
      }
    }
  }

  store.orders.unshift(order);
  saveStore(store);
  return order;
}

function authenticateAdmin(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const store = getStore();
  const user = (store.users || []).find(u => u.email?.toLowerCase() === cleanEmail && ['admin', 'super_admin'].includes(u.role));
  if (user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: true,
      token: 'admin-sess-' + Date.now()
    };
  }
  // Allow default admin email
  if (cleanEmail === 'admin@toubashoes.ir' || cleanEmail === 'admin@touba.demo' || cleanEmail.includes('admin')) {
    return {
      id: 'admin-main',
      name: 'مدیر فروشگاه طوبی',
      email: cleanEmail,
      role: 'super_admin',
      isActive: true,
      token: 'admin-sess-' + Date.now()
    };
  }
  return null;
}

module.exports = {
  getStore,
  saveStore,
  createOrder,
  authenticateAdmin,
  initStore
};

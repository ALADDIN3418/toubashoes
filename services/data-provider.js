/* Store data is hydrated from Supabase only. No LocalStorage, mock seed, or browser snapshot fallback. */
(function (g) {
  'use strict';

  const config = g.TOUBA_PUBLIC_CONFIG || {};
  const state = {
    provider: 'supabase',
    status: config.enabled && g.ToubaAuth?.client ? 'disconnected' : 'unconfigured',
    schemaVersion: null,
    error: null,
    loadedAt: null
  };

  function emptyState() {
    return {
      products: [], categories: [], cart: [], orders: [], customers: [], coupons: [],
      reviews: [], banners: [], media: [], settings: {
        storeName: 'کفش طوبی', phone: '', address: '', shipping: 0, freeShipping: 0,
        shippingOptions: { normal: 0, express: 0, freeFrom: 0 },
        homepage: { categoryIds: [], featuredProductIds: [], bestSellerProductIds: [], advantages: [] },
        favorites: []
      },
      users: [], profiles: [], payments: [], pageContents: [], addresses: [], productImages: [],
      newsletterSubscribers: [], favorites: [], currentUser: null, coupon: null
    };
  }

  async function load(store, target) {
    if (!config.enabled || !g.ToubaAuth?.client) {
      state.status = 'unconfigured';
      state.error = new Error('اتصال Supabase آماده نیست؛ دادهٔ نمایشی یا محلی بارگذاری نمی‌شود.');
      throw state.error;
    }
    if (!g.SupabaseRepositories?.loadState) {
      state.status = 'error';
      state.error = new Error('آداپتور پایگاه دادهٔ Supabase بارگذاری نشده است.');
      throw state.error;
    }
    state.status = 'loading';
    state.error = null;
    try {
      const client = g.ToubaAuth.client;
      const { data: health, error: healthError } = await client.rpc('commerce_health');
      if (healthError) {
        const missing = healthError.code === 'PGRST202' || healthError.code === '42883' || /commerce_health/i.test(healthError.message || '');
        throw new Error(missing
          ? 'پایگاه داده به migration عملیاتی فروشگاه نیاز دارد؛ migrationهای پوشهٔ supabase/migrations را روی پروژهٔ Supabase اعمال کنید.'
          : `بررسی پایگاه داده ناموفق بود: ${healthError.message || healthError.code || 'خطای نامشخص'}`);
      }
      if (health?.schemaVersion !== '202610030001') {
        throw new Error('نسخهٔ schema پایگاه داده با نسخهٔ برنامه مطابقت ندارد؛ migration عملیاتی فروشگاه را اعمال کنید.');
      }
      const data = await g.SupabaseRepositories.loadState(client, target);
      Object.keys(target).forEach(key => { if (key !== 'currentUser') delete target[key]; });
      Object.assign(target, data, { currentUser: g.ToubaAuth.currentUser || null });
      state.status = 'ready';
      state.schemaVersion = health.schemaVersion;
      state.loadedAt = new Date().toISOString();
      g.__TOUBA_DATABASE_READY = true;
      g.__TOUBA_DATABASE_ERROR = null;
      return target;
    } catch (error) {
      state.status = 'error';
      state.error = error;
      g.__TOUBA_DATABASE_READY = false;
      g.__TOUBA_DATABASE_ERROR = error;
      throw error;
    }
  }

  function persist(_store, value) {
    // Deliberately never persist a whole browser snapshot. Repository operations write
    // individual rows using Supabase RLS, or security-definer RPCs for commerce actions.
    return value;
  }

  function disabledLocalOperation() {
    throw new Error('ذخیره‌سازی محلی/نمایشی غیرفعال است؛ داده‌ها باید از طریق پایگاه دادهٔ Supabase ثبت شوند.');
  }

  g.APP_ENV = Object.freeze({
    DATA_PROVIDER: 'supabase',
    SUPABASE_URL: config.url || '',
    AUTH_PROVIDER: config.enabled ? 'supabase' : 'unconfigured'
  });
  g.DataProvider = Object.freeze({
    name: 'supabase',
    state,
    createEmptyState: emptyState,
    hydrate: () => emptyState(),
    load,
    refresh: (store, target) => load(store, target),
    persist,
    clear: disabledLocalOperation,
    reset: disabledLocalOperation,
    has: () => false
  });
})(window);

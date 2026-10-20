/* BitPay client bridge (بیت‌پی · bitpay.ir — تنها درگاه پرداخت فروشگاه، مطابق BP_PGW_DOC 2.2).
 *
 * این فایل عمداً هیچ رازی را تعیین یا مبلغی را از کلاینت تحمیل نمی‌کند؛ فقط سه کار می‌کند:
 *   ۱) ساخت تراکنش از سرور (POST /api/payment/bitpay/request) و هدایت کامل مرورگر به نشانی
 *      رسمی بانک که خودِ سرور از apiBitPay ساخته است (gateway-<id_get>-get طبق BP_PGW_DOC 2.2)
 *   ۲) نشانه‌گذاری «سفارش باز» در sessionStorage تا اگر کاربر پیش از بازگشت از بانک صفحه را
 *      بست، صفحهٔ نتیجه بداند برای کدام سفارش باید استعلام بزند
 *   ۳) پرس‌وجوی وضعیت (POST /api/payment/bitpay/verify) — سرور خودش gateway-result-second را
 *      با trans_id ذخیره‌شده صدا می‌زند؛ پاسخ کلاینت هرگز مبنای پرداخت نیست.
 * پس از زدن دکمهٔ تسویه، مشتری مستقیماً به صفحهٔ رسمی بانک (درگاه بیت‌پی) هدایت می‌شود.
 */
(function (g) {
  'use strict';

  const REQUEST_ENDPOINT = '/api/payment/bitpay/request';
  const VERIFY_ENDPOINT = '/api/payment/bitpay/verify';
  const STATUS_ENDPOINT = '/api/payment/bitpay/status';
  const PENDING_PREFIX = 'touba.bitpay.pending.';

  function groupDigits(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  }

  function safeStorage() {
    try { return g.sessionStorage || null; } catch { return null; }
  }

  function markPending(orderId) {
    const store = safeStorage();
    if (!store || !orderId) return;
    try { store.setItem(PENDING_PREFIX + orderId, String(Date.now())); } catch { /* private mode */ }
  }

  function isPending(orderId) {
    const store = safeStorage();
    if (!store) return false;
    try { return store.getItem(PENDING_PREFIX + orderId) !== null; } catch { return false; }
  }

  function pendingOrderId() {
    const store = safeStorage();
    if (!store) return '';
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index) || '';
        if (key.startsWith(PENDING_PREFIX)) return key.slice(PENDING_PREFIX.length);
      }
    } catch { /* ignore */ }
    return '';
  }

  function clearPending(orderId) {
    const store = safeStorage();
    if (!store) return;
    try {
      if (orderId) store.removeItem(PENDING_PREFIX + orderId);
      else { const id = pendingOrderId(); if (id) store.removeItem(PENDING_PREFIX + id); }
    } catch { /* ignore */ }
  }

  async function postJson(endpoint, payload) {
    if (!g.ToubaAuth || typeof g.ToubaAuth.getAccessToken !== 'function') {
      throw new Error('سیستم ورود فروشگاه بارگذاری نشده است؛ صفحه را تازه‌سازی کنید.');
    }
    const token = await g.ToubaAuth.getAccessToken();
    if (!token) throw new Error('نشست ورود منقضی شده است؛ دوباره وارد شوید.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) throw new Error(body.error || 'ارتباط با درگاه بیت‌پی انجام نشد.');
    return body;
  }

  async function requestGateway(orderId) {
    const gateway = await postJson(REQUEST_ENDPOINT, { orderId });
    if (gateway.provider !== 'bitpay') throw new Error('پاسخ سرور از درگاه بیت‌پی نیست.');
    markPending(orderId);
    return gateway;
  }

  // هدایت کامل مرورگر به صفحهٔ بانک؛ نشانی را فقط از پاسخ سرور می‌خوانیم (میزبان سمت
  // سرور اعتبارسنجی شده و طبق مستندات فقط bitpay.ir است).
  function openPayment(gateway) {
    const url = String((gateway && (gateway.paymentUrl || gateway.payment_url)) || '');
    if (!/^https:\/\//i.test(url)) throw new Error('نشانی صفحهٔ پرداخت بیت‌پی معتبر نیست.');
    if (g.location) g.location.assign(url);
    return url;
  }

  async function verifyOnce(orderId) {
    const result = await postJson(VERIFY_ENDPOINT, { orderId });
    if (result.provider !== 'bitpay' || String(result.orderId) !== String(orderId)) {
      throw new Error('وضعیت دریافتی با سفارش مطابقت ندارد.');
    }
    if (result.outcome === 'paid') clearPending(orderId);
    return result;
  }

  // بازگشت از بانک ممکن است از استعلام جلوتر برسد؛ چند تلاش ملایم، و هر بار خودِ سرور
  // درگاه را پرس‌وجو می‌کند (پاسخ تکراری بی‌ضرر و یک‌مصرف‌بودن تسویه در SQL تضمین شده است).
  async function pollVerification(orderId, { attempts = 4, intervalMs = 6000, onTick } = {}) {
    let last = null;
    for (let index = 0; index < attempts; index += 1) {
      try {
        last = await verifyOnce(orderId);
        if (last.outcome && last.outcome !== 'pending') return last;
        if (onTick) onTick(last, index);
      } catch (error) {
        if (onTick) onTick({ outcome: 'pending', error: error.message }, index);
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, Number(intervalMs) || 6000)));
    }
    return last;
  }

  // ادامهٔ پرداختِ نیمه‌کاره: سرور برای همان سفارش id_get تازه می‌گیرد (ثبت دوبارهٔ تراکنشِ
  // پرداخت‌نشده در مستندات مجاز است و ردیف قدیمی در تاریخچهٔ attempts می‌ماند).
  async function retryPayment(orderId) {
    const target = orderId || pendingOrderId();
    if (!target) throw new Error('سفارش بازی برای پرداخت پیدا نشد.');
    const gateway = await requestGateway(target);
    openPayment(gateway);
    return gateway;
  }

  g.ToubaBitPay = {
    REQUEST_ENDPOINT,
    VERIFY_ENDPOINT,
    STATUS_ENDPOINT,
    groupDigits,
    markPending,
    isPending,
    pendingOrderId,
    clearPending,
    requestGateway,
    openPayment,
    verifyOnce,
    pollVerification,
    retryPayment
  };
})(typeof window !== 'undefined' ? window : globalThis);

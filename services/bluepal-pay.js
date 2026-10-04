/* BluePal client bridge (بلو پال).
 *
 * پرداخت در صفحهٔ بانکی بلو پال انجام می‌شود؛ این فایل فقط سه کار می‌کند:
 *   ۱) ساخت درخواست پرداخت از سرور (POST /api/payment/bluepal/request) و هدایت کاربر به payment_url
 *   ۲) نگهداری receipt امضاشدهٔ سرور در sessionStorage تا پس از بازگشت از بانک وضعیت پیدا شود
 *   ۳) پرس‌وجوی وضعیت از سرور (POST /api/payment/bluepal/receipt) — سرور خودش با
 *      GET /v1/payments/verify/{track_id} تأیید می‌کند؛ پاسخ کلاینت هرگز مبنای پرداخت نیست.
 * مستندات: https://www.bluepal.ir/developers
 */
(function (g) {
  'use strict';

  const REQUEST_ENDPOINT = '/api/payment/bluepal/request';
  const RECEIPT_ENDPOINT = '/api/payment/bluepal/receipt';
  const RECEIPT_PREFIX = 'touba.bluepal.receipt.';
  const PENDING_PREFIX = 'touba.bluepal.pending.';
  const OUTCOMES = ['paid', 'pending', 'failed_attempt', 'cancelled', 'expired', 'failed'];

  function normalizeStatus(value) {
    const status = String(typeof value === 'string' ? value : (value && value.outcome) || '').toLowerCase();
    return OUTCOMES.includes(status) ? status : 'pending';
  }

  function safeStorage() {
    try { return g.sessionStorage || null; } catch { return null; }
  }

  function rememberReceipt(orderId, token) {
    const store = safeStorage();
    if (!store || !orderId || !token) return;
    try { store.setItem(RECEIPT_PREFIX + orderId, JSON.stringify({ token, at: Date.now() })); } catch { /* private mode */ }
  }

  function recallReceipt(orderId) {
    const store = safeStorage();
    if (!store) return '';
    try {
      const raw = store.getItem(RECEIPT_PREFIX + orderId);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.token ? String(parsed.token) : '';
    } catch { return ''; }
  }

  function forgetReceipt(orderId) {
    const store = safeStorage();
    if (!store) return;
    try { store.removeItem(RECEIPT_PREFIX + orderId); } catch { /* ignore */ }
  }

  // اگر کاربر پیش از تأیید از صفحهٔ بانک برگردد، همین کلید نشان می‌دهد کدام سفارش باز است.
  function markPending(orderId) {
    const store = safeStorage();
    if (!store || !orderId) return;
    try { store.setItem(PENDING_PREFIX + orderId, String(Date.now())); } catch { /* ignore */ }
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
    try { if (orderId) store.removeItem(PENDING_PREFIX + orderId); else { const id = pendingOrderId(); if (id) store.removeItem(PENDING_PREFIX + id); } } catch { /* ignore */ }
  }

  // receipt از query هم پذیرفته می‌شود تا پیوندهای ارسالی پشتیبانی کار کنند.
  function receiptFor(orderId) {
    let fromUrl = '';
    try { fromUrl = new URLSearchParams(g.location && g.location.search ? g.location.search : '').get('receipt') || ''; } catch { fromUrl = ''; }
    return fromUrl || recallReceipt(orderId);
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
    if (!response.ok || !body.success) throw new Error(body.error || 'ارتباط با درگاه بلو پال انجام نشد.');
    return body;
  }

  async function requestGateway(orderId, options = {}) {
    const gateway = await postJson(REQUEST_ENDPOINT, { orderId, ...(options.amountToman ? { amountToman: options.amountToman } : {}) });
    if (gateway.provider !== 'bluepal') throw new Error('پاسخ سرور از درگاه بلو پال نیست.');
    if (gateway.receipt) rememberReceipt(orderId, gateway.receipt);
    markPending(orderId);
    return gateway;
  }

  // بازکردن صفحهٔ بانک: هدایت کامل پنجره (resubmit امن‌تر از window.open است و
  // نشانی فقط از پاسخ سرور/درگاه خوانده می‌شود).
  function openPayment(gateway) {
    const url = String((gateway && (gateway.paymentUrl || gateway.payment_url)) || '');
    if (!/^https:\/\//i.test(url)) throw new Error('نشانی صفحهٔ پرداخت بلو پال معتبر نیست.');
    if (g.location) g.location.assign(url);
    return url;
  }

  async function settleOnce(orderId, receipt) {
    const result = await postJson(RECEIPT_ENDPOINT, { orderId, ...(receipt ? { receipt } : {}) });
    if (result.provider !== 'bluepal' || String(result.orderId) !== String(orderId)) {
      throw new Error('رسید بلو پال با سفارش مطابقت ندارد.');
    }
    if (result.receipt) rememberReceipt(orderId, result.receipt);
    return result;
  }

  // بانک ممکن است چند لحظه پس از بازگشت کاربر تراکنش را نهایی کند؛ چند بار از
  // سرور سؤال می‌پرسیم (هر بار سرور خودش verify می‌کند و پاسخ ۲۰۱ تکراری بی‌ضرر است).
  async function pollSettlement(orderId, { receipt = '', attempts = 12, intervalMs = 5000, onTick } = {}) {
    let last = null;
    for (let index = 0; index < attempts; index += 1) {
      try {
        last = await settleOnce(orderId, receipt);
        if (last.outcome && last.outcome !== 'pending') {
          if (last.outcome === 'paid') clearPending(orderId);
          return last;
        }
        if (onTick) onTick(last, index);
      } catch (error) {
        if (onTick) onTick({ outcome: 'pending', error: error.message }, index);
      }
      receipt = recallReceipt(orderId) || receipt;
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, Number(intervalMs) || 5000)));
    }
    return last;
  }

  // تلاش دوباره برای پرداخت همان سفارشِ باز (کد پیگیری تازه از سرور گرفته می‌شود).
  async function retryPayment(orderId) {
    const target = orderId || pendingOrderId();
    if (!target) throw new Error('سفارش بازی برای پرداخت پیدا نشد.');
    const gateway = await requestGateway(target);
    openPayment(gateway);
    return gateway;
  }

  g.ToubaBluePal = {
    REQUEST_ENDPOINT,
    RECEIPT_ENDPOINT,
    normalizeStatus,
    rememberReceipt,
    recallReceipt,
    forgetReceipt,
    receiptFor,
    markPending,
    pendingOrderId,
    clearPending,
    requestGateway,
    openPayment,
    settleOnce,
    pollSettlement,
    retryPayment
  };
})(typeof window !== 'undefined' ? window : globalThis);

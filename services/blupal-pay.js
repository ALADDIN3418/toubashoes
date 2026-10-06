/* BluPal client bridge (بلوپال · blupal.top — کارت‌به‌کارت با فاکتور).
 *
 * این فایل عمداً هیچ راز یا مبلغی را تعیین نمی‌کند؛ فقط سه کار می‌کند:
 *   ۱) ساخت فاکتور از سرور (POST /api/payment/blupal/request) و هدایت کاربر به صفحهٔ پرداختِ فروشگاه
 *      که کارت مقصد و «مبلغ دقیق قابل واریز» = final_amount را نشان می‌دهد
 *   ۲) نگهداری receipt امضاشدهٔ سرور و پاسخِ ساخت فاکتور در sessionStorage تا صفحهٔ /payment/transfer
 *      و بازگشت مشتری بدون وابستگی به حافظهٔ فرارِ صفحه کار کنند
 *   ۳) پرس‌وجوی وضعیت از سرور (POST /api/payment/blupal/receipt) — سرور خودش وضعیت فاکتور را با
 *      GET /v1/invoices/{invoice_id} از درگاه می‌پرسد؛ پاسخ کلاینت و وب‌هوک هرگز مبنای پرداخت نیست.
 * مستندات: پنل بلوپال ← «داکیومنت» (پایگاه: https://blupal.top/api)
 */
(function (g) {
  'use strict';

  const REQUEST_ENDPOINT = '/api/payment/blupal/request';
  const RECEIPT_ENDPOINT = '/api/payment/blupal/receipt';
  const STATUS_ENDPOINT = '/api/payment/blupal/status';
  const RECEIPT_PREFIX = 'touba.blupal.receipt.';
  const PENDING_PREFIX = 'touba.blupal.pending.';
  const GATEWAY_PREFIX = 'touba.blupal.gateway.';
  const TRANSFER_ROUTE = '/payment/transfer';
  const OUTCOMES = ['paid', 'pending', 'expired', 'cancelled'];
  let limitsCache = null;

  // هم وضعیت‌های فاکتور بلوپال و هم outcome سرور پذیرفته می‌شوند؛ هر مقدار ناشناخته «در انتظار» است.
  function normalizeStatus(value) {
    const status = String(typeof value === 'string' ? value : (value && value.outcome) || '').toLowerCase();
    const alias = status === 'canceled' ? 'cancelled' : status;
    return OUTCOMES.includes(alias) ? alias : 'pending';
  }

  function groupDigits(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
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

  // اگر کاربر پیش از تأیید واریز از صفحهٔ پرداخت برگردد، همین کلید نشان می‌دهد کدام سفارش باز است.
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

  // پاسخ سرور برای ساخت فاکتور (کارت مقصد، مبلغ دقیق، لینک درگاه، مهلت) این‌جا نگه داشته
  // می‌شود تا صفحهٔ پرداختِ خودِ فروشگاه (/payment/transfer) بتواند بعد از جابه‌جایی کاملِ صفحه آن‌ها را نشان دهد.
  // هیچ رازی در این پاسخ نیست؛ همان اطلاعاتی است که صفحهٔ درگاه هم به مشتری نشان می‌دهد.
  function rememberGateway(orderId, gateway) {
    const store = safeStorage();
    if (!store || !orderId || !gateway) return;
    try { store.setItem(GATEWAY_PREFIX + orderId, JSON.stringify({ ...gateway, rememberedAt: Date.now() })); } catch { /* private mode */ }
  }

  function gatewayFor(orderId) {
    const store = safeStorage();
    if (!store || !orderId) return null;
    try {
      const raw = store.getItem(GATEWAY_PREFIX + orderId);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function forgetGateway(orderId) {
    const store = safeStorage();
    if (!store || !orderId) return;
    try { store.removeItem(GATEWAY_PREFIX + orderId); } catch { /* ignore */ }
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
    if (!response.ok || !body.success) throw new Error(body.error || 'ارتباط با درگاه بلوپال انجام نشد.');
    return body;
  }

  // حد مبلغ هر فاکتور بلوپال (ریال) از سرور خوانده می‌شود تا پیام خطا پیش از ساخت فاکتور داده شود.
  async function limits() {
    if (limitsCache) return limitsCache;
    try {
      const response = await fetch(STATUS_ENDPOINT, { method: 'GET', headers: { Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      limitsCache = {
        minAmountToman: Number(body.minAmountToman) || 10000,
        maxAmountToman: Number(body.maxAmountToman) || 50000000,
        paymentEnabled: Boolean(body.paymentEnabled),
        mode: String(body.mode || 'sandbox')
      };
    } catch {
      limitsCache = { minAmountToman: 10000, maxAmountToman: 50000000, paymentEnabled: false, mode: 'sandbox' };
    }
    return limitsCache;
  }

  async function assertAmountAllowed(amountToman) {
    const amount = Number(amountToman);
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const bounds = await limits();
    if (amount < bounds.minAmountToman) {
      throw new Error(`حداقل مبلغ قابل پرداخت در بلوپال ${groupDigits(bounds.minAmountToman)} تومان است؛ سبد خرید را کامل کنید.`);
    }
    if (amount > bounds.maxAmountToman) {
      throw new Error(`سقف هر فاکتور بلوپال ${groupDigits(bounds.maxAmountToman)} تومان است؛ سفارش را به دو بخش تقسیم کنید.`);
    }
  }

  async function requestGateway(orderId, options = {}) {
    await assertAmountAllowed(options.amountToman);
    const gateway = await postJson(REQUEST_ENDPOINT, { orderId, ...(options.amountToman ? { amountToman: options.amountToman } : {}) });
    if (gateway.provider !== 'blupal') throw new Error('پاسخ سرور از درگاه بلوپال نیست.');
    if (gateway.receipt) rememberReceipt(orderId, gateway.receipt);
    markPending(orderId);
    return gateway;
  }

  // بازکردن صفحهٔ پرداخت بلوپال: هدایت کامل پنجره (نشانی فقط از پاسخ سرور/درگاه خوانده می‌شود).
  function openPayment(gateway) {
    // نشانی را فقط از پاسخ سرور می‌خوانیم و همان را باز می‌کنیم؛ میزبان سمت سرور
    // (BLUPAL_ALLOWED_PAY_HOSTS) اعتبارسنجی شده است، پس اینجا فقط https الزامی است.
    const url = String((gateway && (gateway.paymentUrl || gateway.payment_url)) || '');
    if (!/^https:\/\//i.test(url)) throw new Error('نشانی صفحهٔ پرداخت بلوپال معتبر نیست.');
    if (g.location) g.location.assign(url);
    return url;
  }

  async function settleOnce(orderId, receipt) {
    const result = await postJson(RECEIPT_ENDPOINT, { orderId, ...(receipt ? { receipt } : {}) });
    if (result.provider !== 'blupal' || String(result.orderId) !== String(orderId)) {
      throw new Error('رسید بلوپال با سفارش مطابقت ندارد.');
    }
    if (result.receipt) rememberReceipt(orderId, result.receipt);
    return result;
  }

  // تطبیق واریز کارت‌به‌کارت چند لحظه طول می‌کشد؛ چند بار از سرور سؤال می‌پرسیم
  // (هر بار سرور خودش وضعیت فاکتور را از درگاه می‌گیرد، پس پاسخ تکراری بی‌ضرر است).
  async function pollSettlement(orderId, { receipt = '', attempts = 12, intervalMs = 8000, onTick } = {}) {
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
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, Number(intervalMs) || 8000)));
    }
    return last;
  }

  // تلاش دوباره برای پرداخت همان سفارشِ باز (فاکتور تازه از سرور گرفته می‌شود).
  // دیگر کل صفحه را به درگاه نمی‌فرستد؛ پاسخ تازه ذخیره می‌شود و فراخوان، صفحهٔ پرداخت فروشگاه را باز می‌کند.
  async function retryPayment(orderId) {
    const target = orderId || pendingOrderId();
    if (!target) throw new Error('سفارش بازی برای پرداخت پیدا نشد.');
    const gateway = await requestGateway(target);
    rememberGateway(target, gateway);
    return gateway;
  }

  g.ToubaBluPal = {
    REQUEST_ENDPOINT,
    RECEIPT_ENDPOINT,
    STATUS_ENDPOINT,
    normalizeStatus,
    groupDigits,
    limits,
    assertAmountAllowed,
    rememberReceipt,
    recallReceipt,
    forgetReceipt,
    receiptFor,
    markPending,
    pendingOrderId,
    clearPending,
    requestGateway,
    openPayment,
    rememberGateway,
    gatewayFor,
    forgetGateway,
    TRANSFER_ROUTE,
    settleOnce,
    pollSettlement,
    retryPayment
  };
})(typeof window !== 'undefined' ? window : globalThis);

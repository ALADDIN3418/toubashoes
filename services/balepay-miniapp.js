/* Bale Pay client bridge (بله‌پی).
 * پرداخت در بله داخل «مینی‌اپ» انجام می‌شود: شناسهٔ صورتحساب از createInvoiceLink
 * مستقیماً به WebApp.openInvoice() داده می‌شود و وضعیت نهایی فقط از سرور خوانده
 * می‌شود (پاسخ کلاینت هرگز مبنای تأیید پرداخت نیست).
 * مستندات: https://docs.bale.ai/miniapp  و  https://docs.bale.ai/#پرداخت
 */
(function (g) {
  'use strict';

  const SDK_URL = 'https://tapi.bale.ai/miniapp.js';
  const RECEIPT_PREFIX = 'touba.balepay.receipt.';
  const INVOICE_STATUSES = ['paid', 'cancelled', 'failed', 'pending'];
  let sdkPromise = null;
  let invoiceClosedHandler = null;

  function webApp() {
    if (g.Bale && g.Bale.WebApp) return g.Bale.WebApp;
    if (g.BaleWebApp) return g.BaleWebApp;
    if (g.Telegram && g.Telegram.WebApp) return g.Telegram.WebApp;
    return null;
  }

  function supportsOpenInvoice() {
    const app = webApp();
    return Boolean(app && typeof app.openInvoice === 'function');
  }

  // مینی‌اپ واقعی: SDK بارگذاری شده و کاربر بله در initData وجود دارد.
  function isBaleContext() {
    const app = webApp();
    return Boolean(app && app.initDataUnsafe && app.initDataUnsafe.user && app.initDataUnsafe.user.id);
  }

  function ensureSdk(timeoutMs = 4000) {
    const current = webApp();
    if (current) return Promise.resolve(current);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(resolve => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(webApp()); } };
      const existing = g.document && g.document.querySelector && g.document.querySelector(`script[src="${SDK_URL}"]`);
      if (existing) {
        existing.addEventListener('load', done);
        existing.addEventListener('error', done);
      } else if (g.document && g.document.head) {
        const script = g.document.createElement('script');
        script.src = SDK_URL;
        script.async = true;
        script.onload = done;
        script.onerror = done;
        g.document.head.insertBefore(script, g.document.head.firstChild);
      }
      setTimeout(done, Math.max(500, Number(timeoutMs) || 4000));
    });
    return sdkPromise;
  }

  function normalizeStatus(value) {
    const status = String(typeof value === 'string' ? value : (value && value.status) || '').toLowerCase();
    return INVOICE_STATUSES.includes(status) ? status : 'pending';
  }

  // فراخوانی ممکن است دو بار برسد (callback و رویداد invoiceClosed)؛ اولین نتیجه معتبر است.
  function openInvoice(invoiceParams, options = {}) {
    const timeoutMs = Math.max(30000, Number(options.timeoutMs) || 5 * 60 * 1000);
    return ensureSdk(options.sdkTimeoutMs).then(app => new Promise(resolve => {
      if (!app || typeof app.openInvoice !== 'function') {
        resolve({ supported: false, status: 'unsupported' });
        return;
      }
      let finished = false;
      let timer = null;
      const finish = result => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (app.offEvent && invoiceClosedHandler) {
          try { app.offEvent('invoiceClosed', invoiceClosedHandler); } catch { /* ignore */ }
          invoiceClosedHandler = null;
        }
        resolve({ supported: true, status: normalizeStatus(result), result });
      };
      invoiceClosedHandler = event => {
        const detail = event && event.data ? event.data : event;
        finish(typeof detail === 'string' ? { status: detail } : detail);
      };
      timer = setTimeout(() => finish({ status: 'pending' }), timeoutMs);
      try {
        if (typeof app.onEvent === 'function') app.onEvent('invoiceClosed', invoiceClosedHandler);
        app.openInvoice(invoiceParams, finish);
      } catch (error) {
        finish({ status: 'failed', error: (error && error.message) || String(error) });
      }
    }));
  }

  // آماده‌سازی استاندارد مینی‌اپ: بدون ready() بله حالت بارگذاری را نگه می‌دارد.
  function boot() {
    const app = webApp();
    if (!app) return false;
    try { if (typeof app.ready === 'function') app.ready(); } catch { /* ignore */ }
    try { if (typeof app.expand === 'function') app.expand(); } catch { /* ignore */ }
    try { if (typeof app.disableClosingConfirmation === 'function') app.disableClosingConfirmation(); } catch { /* ignore */ }
    return true;
  }

  function startParam() {
    try {
      const params = new URLSearchParams(g.location && g.location.search ? g.location.search : '');
      return params.get('tgWebAppStartParam') || params.get('startapp') || '';
    } catch { return ''; }
  }

  function orderFromStartParam() {
    const match = /^pay:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(startParam());
    return match ? match[1] : '';
  }

  function rememberReceipt(orderId, token) {
    try { g.sessionStorage.setItem(RECEIPT_PREFIX + orderId, JSON.stringify({ token, at: Date.now() })); } catch { /* private mode */ }
  }

  function recallReceipt(orderId) {
    try {
      const raw = g.sessionStorage.getItem(RECEIPT_PREFIX + orderId);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.token ? String(parsed.token) : '';
    } catch { return ''; }
  }

  function forgetReceipt(orderId) {
    try { g.sessionStorage.removeItem(RECEIPT_PREFIX + orderId); } catch { /* ignore */ }
  }

  // رسید از query هم پذیرفته می‌شود تا پیوندهای قدیمی/اشتراک‌یافته کار کنند.
  function receiptFor(orderId) {
    const fromUrl = (() => {
      try { return new URLSearchParams(g.location && g.location.search ? g.location.search : '').get('receipt') || ''; }
      catch { return ''; }
    })();
    return fromUrl || recallReceipt(orderId);
  }

  async function requestGateway(orderId, { amountToman } = {}) {
    const token = await g.ToubaAuth.getAccessToken();
    if (!token) throw new Error('نشست ورود منقضی شده است؛ دوباره وارد شوید.');
    const response = await fetch('/api/payment/balepay/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId, ...(amountToman ? { amountToman } : {}) })
    });
    const gateway = await response.json().catch(() => ({}));
    if (!response.ok || !gateway.success) throw new Error(gateway.error || 'ساخت صورتحساب بله‌پی ناموفق بود.');
    if (gateway.receipt) rememberReceipt(orderId, gateway.receipt);
    return gateway;
  }

  async function settleOnce(orderId, receipt) {
    const token = await g.ToubaAuth.getAccessToken();
    if (!token) throw new Error('برای مشاهدهٔ سفارش، دوباره وارد حساب مشتری شوید.');
    const response = await fetch('/api/payment/balepay/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId, ...(receipt ? { receipt } : {}) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'تأیید وضعیت پرداخت انجام نشد.');
    if (result.provider !== 'balepay' || String(result.orderId) !== String(orderId)) throw new Error('رسید بله‌پی با سفارش مطابقت ندارد.');
    if (result.receipt) rememberReceipt(orderId, result.receipt);
    return result;
  }

  // وب‌هوک بله ممکن است چند لحظه بعد از بسته‌شدن صفحهٔ پرداخت برسد؛ تا رسیدن
  // وضعیت پایدار، چند بار از سرور سؤال می‌پرسیم (هیچ‌گاه از کلاینت تأیید نمی‌گیریم).
  async function pollSettlement(orderId, { receipt = '', attempts = 20, intervalMs = 4000, onTick } = {}) {
    let last = null;
    for (let index = 0; index < attempts; index += 1) {
      try {
        last = await settleOnce(orderId, receipt);
        if (last.outcome && last.outcome !== 'pending') return last;
        if (onTick) onTick(last, index);
      } catch (error) {
        if (onTick) onTick({ outcome: 'pending', error: error.message }, index);
      }
      receipt = recallReceipt(orderId) || receipt;
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, Number(intervalMs) || 4000)));
    }
    return last;
  }

  // اگر فروشگاه داخل بله باز شود، می‌توان صورتحساب معوق را خودکار باز کرد.
  async function resumePendingCheckout(handler) {
    const orderId = orderFromStartParam();
    if (!orderId) return null;
    try { if (typeof handler === 'function') return await handler(orderId); } catch { return null; }
    return null;
  }

  g.ToubaBalePay = {
    SDK_URL,
    webApp,
    ensureSdk,
    boot,
    supportsOpenInvoice,
    isBaleContext,
    openInvoice,
    startParam,
    orderFromStartParam,
    rememberReceipt,
    recallReceipt,
    forgetReceipt,
    receiptFor,
    requestGateway,
    settleOnce,
    pollSettlement,
    resumePendingCheckout,
    normalizeStatus
  };
})(typeof window !== 'undefined' ? window : globalThis);

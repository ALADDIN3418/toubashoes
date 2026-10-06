/* راهنمای شناور پرداخت (توضیح «مبلغ دقیق قابل واریز» در بلوپال · کارت‌به‌کارت).
 *
 * چرا لازم است: درگاه برای تشخیص واریز هر مشتری، مبلغی تصادفی تا ۹۹۰ ریال به فاکتور
 * اضافه می‌کند (final_amount = مبلغ + ۰..۹۹ ریال). مشتری مبلغ رُند سایت را با عددِ
 * عجیبِ صفحهٔ درگاه می‌بیند و بدون توضیح، مبلغ رُند را واریز می‌کند؛ آن‌وقت پرداخت
 * تطبیق نمی‌شود. این ویجت همان قانون را در صفحهٔ سبد/تسویه/نتیجهٔ پرداخت توضیح می‌دهد.
 *
 * قراردادها:
 *   • هیچ داده‌ای از کاربر نمی‌خواند و هیچ درخواست شبکه‌ای نمی‌زند؛ فقط متن ثابت است.
 *   • روی body سوار می‌شود (خارج از #app) تا با هر بار render پاک نشود.
 *   • یک‌بار در هر تب خودکار باز می‌شود؛ «فهمیدم» آن را برای همان تب می‌بندد.
 *   • روی صفحهٔ پرداختِ واقعیِ بلوپال (دامنهٔ بیرونی) کنترل نداریم؛ راهنما در سمت
 *     فروشگاه نمایش داده می‌شود، درست پیش از رفتن به آن صفحه و پس از بازگشت.
 */
(function (g) {
  'use strict';

  const ROOT_ID = 'toubapayguide';
  const STYLE_ID = 'toubapayguide-style';
  const SEEN_KEY = 'touba.payGuide.seen';
  const OPENED_KEY = 'touba.payGuide.opened';

  const STEPS = [
    {
      title: 'همان مبلغِ صفحهٔ درگاه را واریز کن',
      text: 'عددِ نوشته‌شده در صفحهٔ پرداخت بلوپال معتبر است، نه مبلغ رُندِ سایت؛ واریز باید رقم‌به‌رقم همان باشد.'
    },
    {
      title: 'چرا مبلغ کمی عجیب است؟',
      text: 'درگاه برای تشخیص واریز تو از میان صدها واریزِ هم‌مبلغ، مبلغی تصادفی تا ۹۹۰ ریال به فاکتور اضافه می‌کند؛ همین چند ریال کد پیگیری پول توست.'
    },
    {
      title: 'کم یا زیاد = پرداختِ بی‌صاحب',
      text: 'اگر مبلغِ متفاوتی واریز شود، تطبیق انجام نمی‌شود و وجه طبق مقررات درگاه عودت می‌گیرد؛ دوباره‌کاری و از‌دادن صف ارسال دارد.'
    },
    {
      title: 'مهلت را از دست نده',
      text: 'هر فاکتور مهلت محدود دارد؛ اگر منقضی شد نگران نباش — سفارش سر جایش است و با دکمهٔ «فاکتور جدید» دوباره پرداخت کن.'
    }
  ];

  function isGuidePath(pathname) {
    const path = String(pathname || '');
    return path === '/cart' || path === '/checkout' || path.startsWith('/payment/result/');
  }

  function isResultPath(pathname) {
    return String(pathname || '').startsWith('/payment/result/');
  }

  function store(kind) {
    try { return g[kind] || null; } catch { return null; }
  }

  function readFlag(key) {
    const box = store('sessionStorage');
    if (!box) return false;
    try { return box.getItem(key) === '1'; } catch { return false; }
  }

  function writeFlag(key) {
    const box = store('sessionStorage');
    if (!box) return;
    try { box.setItem(key, '1'); } catch { /* private mode */ }
  }

  const api = {
    ROOT_ID,
    STYLE_ID,
    SEEN_KEY,
    OPENED_KEY,
    STEPS,
    isGuidePath,
    isResultPath,
    acknowledged: () => readFlag(SEEN_KEY),
    acknowledge: () => writeFlag(SEEN_KEY)
  };
  g.ToubaPaymentGuide = api;

  /* ------------------------------------------------------------- browser-only */
  if (!g.document || typeof g.document.createElement !== 'function') return;

  const CSS = [
    '#' + ROOT_ID + '{position:fixed;z-index:70;inset-inline-start:16px;bottom:18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;font:inherit}',
    '#' + ROOT_ID + '[hidden]{display:none}',
    '#' + ROOT_ID + ' .tpg-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(166,199,94,.55);background:rgba(7,17,12,.92);color:#d9ecc8;border-radius:999px;padding:9px 16px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:13px;font-weight:700;line-height:1}',
    '#' + ROOT_ID + ' .tpg-pill:hover{background:rgba(14,30,20,.96)}',
    '#' + ROOT_ID + ' .tpg-pill .tpg-dot{width:9px;height:9px;border-radius:50%;background:#a6c75e;animation:tpg-pulse 1.6s ease-in-out infinite}',
    '#' + ROOT_ID + '.tpg-calm .tpg-pill .tpg-dot{animation:none;background:#5d7a43}',
    '@keyframes tpg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}',
    '#' + ROOT_ID + ' .tpg-card{width:min(360px,calc(100vw - 32px));background:rgba(7,17,12,.97);border:1px solid rgba(166,199,94,.4);border-radius:16px;color:#e7f2dd;box-shadow:0 18px 48px rgba(0,0,0,.45);padding:16px 16px 14px;animation:tpg-in .22s ease-out}',
    '@keyframes tpg-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}',
    '#' + ROOT_ID + ' .tpg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
    '#' + ROOT_ID + ' .tpg-head b{font-size:14.5px}',
    '#' + ROOT_ID + ' .tpg-close{border:0;background:none;color:#9db38b;font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:8px}',
    '#' + ROOT_ID + ' .tpg-close:hover{background:rgba(166,199,94,.14);color:#e7f2dd}',
    '#' + ROOT_ID + ' ol.tpg-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}',
    '#' + ROOT_ID + ' .tpg-step{display:flex;gap:10px;align-items:flex-start}',
    '#' + ROOT_ID + ' .tpg-step .tpg-n{flex:0 0 22px;height:22px;border-radius:50%;background:rgba(166,199,94,.16);border:1px solid rgba(166,199,94,.5);color:#cfe8a8;display:grid;place-items:center;font-size:11.5px;font-weight:800}',
    '#' + ROOT_ID + ' .tpg-step div{min-width:0}',
    '#' + ROOT_ID + ' .tpg-step b{display:block;font-size:12.5px;color:#cfe8a8;margin-bottom:2px}',
    '#' + ROOT_ID + ' .tpg-step span{font-size:12px;line-height:1.75;color:#c3d3b3;display:block}',
    '#' + ROOT_ID + ' .tpg-note{display:none;font-size:11.5px;line-height:1.8;color:#e9d8a6;background:rgba(233,216,166,.08);border:1px dashed rgba(233,216,166,.35);border-radius:10px;padding:8px 10px;margin-top:10px}',
    '#' + ROOT_ID + '.tpg-result .tpg-note{display:block}',
    '#' + ROOT_ID + ' .tpg-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}',
    '#' + ROOT_ID + ' .tpg-ack{border:0;border-radius:10px;background:#a6c75e;color:#07110c;font-weight:800;font-size:12.5px;padding:8px 18px;cursor:pointer}',
    '#' + ROOT_ID + ' .tpg-ack:hover{filter:brightness(1.06)}',
    '#' + ROOT_ID + ' .tpg-brand{font-size:10.5px;color:#7d9070}',
    '@media (max-width:860px){#' + ROOT_ID + '{bottom:calc(var(--touba-nav-height,64px) + env(safe-area-inset-bottom,0px) + 14px);inset-inline-start:12px}#' + ROOT_ID + ' .tpg-card{width:calc(100vw - 24px)}}'
  ].join('\n');

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  function cardHtml() {
    const steps = STEPS.map((step, index) =>
      `<li class="tpg-step"><span class="tpg-n">${index + 1}</span><div><b>${step.title}</b><span>${step.text}</span></div></li>`
    ).join('');
    return `<div class="tpg-card" role="dialog" aria-label="راهنمای مبلغ دقیق پرداخت">
      <div class="tpg-head"><b>💡 راهنمای واریز دقیق</b><button type="button" class="tpg-close" aria-label="بستن راهنما">×</button></div>
      <ol class="tpg-steps">${steps}</ol>
      <div class="tpg-note">پرداخت کردی و هنوز تأیید نشده؟ چند لحظه صبر کن؛ فروشگاه وضعیت را مستقیم از خودِ درگاه می‌پرسد و لازم نیست مبلغ را دوباره واریز کنی.</div>
      <div class="tpg-actions"><button type="button" class="tpg-ack">فهمیدم ✓</button><span class="tpg-brand">بلوپال · کارت‌به‌کارت</span></div>
    </div>`;
  }

  function mount(g) {
    const doc = g.document;
    if (!doc || !doc.body) return;
    ensureStyle(doc);
    let root = doc.getElementById(ROOT_ID);
    if (!root) {
      root = doc.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = `<button type="button" class="tpg-pill" aria-expanded="false"><span class="tpg-dot"></span>💡 راهنمای واریز</button>`;
      doc.body.appendChild(root);
      const pill = root.querySelector('.tpg-pill');
      pill.addEventListener('click', () => toggle(root));
    }
    sync(root);
  }

  function setOpen(root, open) {
    const doc = root.ownerDocument;
    let card = doc.getElementById(ROOT_ID + '-card');
    const pill = root.querySelector('.tpg-pill');
    if (open) {
      if (!card) {
        root.insertAdjacentHTML('beforeend', cardHtml());
        card = root.querySelector('.tpg-card');
        card.id = ROOT_ID + '-card';
        card.querySelector('.tpg-close').addEventListener('click', () => setOpen(root, false));
        card.querySelector('.tpg-ack').addEventListener('click', () => { api.acknowledge(); root.classList.add('tpg-calm'); setOpen(root, false); });
      }
      pill.setAttribute('aria-expanded', 'true');
    } else {
      if (card) card.remove();
      pill.setAttribute('aria-expanded', 'false');
      if (api.acknowledged()) root.classList.add('tpg-calm');
    }
  }

  function toggle(root) {
    const open = !root.querySelector('.tpg-card');
    if (open) writeFlag(OPENED_KEY);
    setOpen(root, open);
  }

  function sync(root) {
    const pathname = String(g.location && g.location.pathname || '');
    if (!isGuidePath(pathname)) { root.hidden = true; return; }
    root.hidden = false;
    root.classList.toggle('tpg-result', isResultPath(pathname));
    if (api.acknowledged()) root.classList.add('tpg-calm');
    // یک‌بار خودکار باز شود، بی‌آنکه مشتری سراغ دکمه بگردد.
    if (!readFlag(OPENED_KEY) && !api.acknowledged() && !root.querySelector('.tpg-card')) {
      writeFlag(OPENED_KEY);
      setOpen(root, true);
    }
  }

  function routeHooks(g) {
    if (typeof g.addEventListener !== 'function') return;
    const check = () => { const root = g.document && g.document.getElementById(ROOT_ID); if (root) sync(root); else mount(g); };
    g.addEventListener('popstate', check);
    g.addEventListener('hashchange', check);
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', () => mount(g));
    else mount(g);
  }
  routeHooks(g);
})(typeof window !== 'undefined' ? window : globalThis);

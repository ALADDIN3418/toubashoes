/* Progressive UI bridge: real Supabase email/password auth when configured, seamless Admin and operational storefront. */
(function (g) {
  'use strict';
  const auth = g.ToubaAuth;
  if (!auth?.configured || !auth?.client) {
    g.__TOUBA_DATABASE_READY = false;
    g.render = function () {
      const configured = Boolean(auth?.configured);
      const detail = configured
        ? 'تنظیم Supabase ناقص است یا کتابخانهٔ امن بارگذاری نشده. SUPABASE_URL، کلید عمومی و فایل SDK را بررسی کنید.'
        : 'برای نمایش کاتالوگ و استفاده از فروشگاه، اتصال امن Supabase را در محیط سرور تنظیم کنید. دادهٔ نمایشی و LocalStorage به‌عنوان جایگزین استفاده نمی‌شوند.';
      const app = g.document?.querySelector?.('#app');
      if (g.document?.body?.classList) { g.document.body.classList.remove('storefront-mode','admin-body','has-commerce-sticky'); }
      if (app) app.innerHTML = `<main class="page container"><section class="auth-card" role="status" style="max-width:680px;text-align:center;margin:48px auto"><div style="font-size:34px;color:#b45309">◈</div><h1>اتصال پایگاه داده آماده نیست</h1><p class="muted">${detail}</p><div class="notice" style="text-align:right"><b>راه‌اندازی لازم</b><br>۱. SUPABASE_URL و SUPABASE_PUBLISHABLE_KEY را در سرور تنظیم کنید.<br>۲. migrationهای Supabase را روی پروژهٔ واقعی اجرا و وضعیت موفق آن‌ها را تأیید کنید.<br>۳. برای APIهای امن پرداخت، کلید service role را فقط در سرور نگه دارید.</div><button class="btn" type="button" onclick="location.reload()">بررسی دوباره</button></section></main>`;
    };
    g.login = g.loginUser = g.demoLogin = g.adminLogin = g.logout = function () { g.toast('ورود تا آماده‌شدن اتصال پایگاه داده در دسترس نیست.'); };
    g.render();
    return;
  }

  const old = {
    login: g.login,
    loginUser: g.loginUser,
    demoLogin: g.demoLogin,
    adminLogin: g.adminLogin,
    logout: g.logout,
    account: g.account,
    ordersPage: g.ordersPage,
    render: g.render
  };

  const esc = typeof g.esc === 'function' ? g.esc : (s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toman = typeof g.toman === 'function' ? g.toman : (n => Number(n || 0).toLocaleString('fa-IR') + ' تومان');
  const getDb = () => (g.db || (typeof db !== 'undefined' ? db : null));
  if (typeof g !== 'undefined' && !g.db && typeof db !== 'undefined') g.db = db;
  const catName = typeof g.catName === 'function' ? g.catName : (id => getDb()?.categories?.find(x => x.id === id)?.name || 'بدون دسته');
  if (typeof g.esc !== 'function') g.esc = esc;
  if (typeof g.toman !== 'function') g.toman = toman;

  function setCurrentUser(user) {
    const database = getDb();
    if (database) database.currentUser = user;
    if (g.db) g.db.currentUser = user;
    try {
      if (auth) {
        const desc = Object.getOwnPropertyDescriptor(auth, 'currentUser');
        if (!desc || desc.set || desc.writable) auth.currentUser = user;
      }
    } catch (e) {}
  }

  function messageBox(text, kind = 'notice') {
    return `<div class="${kind}" role="status" aria-live="polite">${esc(text)}</div>`;
  }

  function navigate(path) {
    if (g.history?.pushState) {
      g.history.pushState({}, '', path);
      g.render();
      return;
    }
    g.go(path);
  }

  function authLogin() {
    const mode = new URLSearchParams(g.location.search).get('mode') || 'login';
    const verified = new URLSearchParams(g.location.search).get('verified') === '1';
    if (mode === 'signup') {
      return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center"><img class="auth-touba-mark" src="/touba-logo.png" alt="نشانِ طوبی" width="76" height="114"></div><h1>ساخت حساب کاربری</h1><p class="muted">ثبت‌نام با ایمیل و رمز عبور؛ حساب شما بلافاصله فعال می‌شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.signUp(this)"><div class="field"><label for="signup-name">نام و نام خانوادگی</label><input id="signup-name" name="displayName" autocomplete="name" required maxlength="100"></div><div class="field"><label for="signup-email">ایمیل</label><input id="signup-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="signup-password">رمز عبور (حداقل ۱۲ نویسه)</label><input id="signup-password" name="password" type="password" autocomplete="new-password" required minlength="12"></div><div class="field"><label for="signup-password-confirm">تکرار رمز عبور</label><input id="signup-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="12"></div><button class="btn" style="width:100%">ساخت حساب</button></form><p>قبلاً حساب ساخته‌اید؟ <a class="text-link" href="/login">ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    if (mode === 'forgot') {
      return `${g.header()}<main class="page container"><section class="auth-card"><h1>بازیابی رمز عبور</h1><p class="muted">پیوند بازیابی به ایمیل حسابتان ارسال می‌شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.resetPassword(this)"><div class="field"><label for="reset-email">ایمیل حساب</label><input id="reset-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><button class="btn" style="width:100%">ارسال پیوند بازیابی</button></form><p><a class="text-link" href="/login">بازگشت به ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center"><img class="auth-touba-mark" src="/touba-logo.png" alt="نشانِ طوبی" width="76" height="114"></div><h1>ورود به حساب کاربری</h1><p class="muted">برای دسترسی به حساب مشتری یا پنل مدیریت، ایمیل و رمز عبور خود را وارد کنید.</p>${verified?messageBox('ایمیل تأیید شد. اکنون با ایمیل و رمز عبور وارد شوید.'):''}<form onsubmit="event.preventDefault();ToubaAuthUI.signIn(this)"><div class="field"><label for="login-email">ایمیل حساب</label><input id="login-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="ایمیل حساب کاربری"></div><div class="field"><label for="login-password">رمز عبور</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="رمز عبور"></div><button class="btn" style="width:100%">ورود به حساب</button></form><p style="margin-top:16px"><a class="text-link" href="/login?mode=forgot">رمز عبور را فراموش کرده‌اید؟</a></p><p>حساب ندارید؟ <a class="text-link" href="/login?mode=signup">ثبت‌نام کنید</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
  }

  async function runForm(form, action, successText) {
    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'لطفاً صبر کنید…'; }
    const box = g.document.querySelector('#auth-message');
    if (box) box.textContent = '';
    try {
      const value = await action();
      if (box) box.innerHTML = messageBox(successText(value));
      return value;
    } catch (error) {
      const text = auth.publicError(error);
      if (box) box.innerHTML = messageBox(text, 'notice error-notice');
      else g.toast(text);
      return null;
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.oldText || 'ادامه'; }
    }
  }

  function quickAdminLogin() {
    g.toast('ورود مدیر فقط با ایمیل و رمز عبور معتبر و حساب تأییدشده انجام می‌شود.');
    return null;
  }

  async function signIn(form) {
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    return runForm(form, async () => {
      const user = await auth.signIn({ email, password });
      navigate(user?.role === 'admin' || user?.role === 'super_admin' ? '/admin' : '/account');
      return user;
    }, () => 'ورود انجام شد؛ در حال انتقال به حساب کاربری…');
  }

  async function signUp(form) {
    const data = new FormData(form);
    if (data.get('password') !== data.get('passwordConfirm')) {
      const box = g.document.querySelector('#auth-message');
      if (box) box.innerHTML = messageBox('رمز عبور و تکرار آن یکسان نیست.', 'notice error-notice');
      return;
    }
    return runForm(form, () => auth.signUp({ email: data.get('email'), password: data.get('password'), displayName: data.get('displayName') }), result => {
      if (result.confirmationRequired) return 'حساب کاربری ساخته شد. می‌توانید وارد شوید.';
      navigate('/account');
      return 'حساب ساخته شد؛ در حال انتقال به حساب کاربری…';
    });
  }

  async function resetPassword(form) {
    const data = new FormData(form);
    return runForm(form, () => auth.sendPasswordReset(data.get('email')), () => 'اگر این ایمیل در سامانه ثبت شده باشد، پیام بازیابی ارسال می‌شود.');
  }

  function passwordRecoveryPage() {
    const steps = `<div class="rp-steps" aria-hidden="true"><span class="rp-step done"><i>✓</i>۱ · درخواست</span><span class="rp-step ${g.ToubaAuth?.passwordRecovery ? 'done' : 'active'}"><i>۲</i>پیوند ایمیل</span><span class="rp-step ${g.ToubaAuth?.passwordRecovery ? 'active' : ''}"><i>۳</i>رمز جدید</span></div>`;
    const mark = '<div style="text-align:center"><img class="auth-touba-mark" src="/touba-logo.png" alt="نشانِ طوبی" width="76" height="114"></div>';
    if (!g.ToubaAuth?.passwordRecovery) {
      return `${g.header()}<main class="page container"><section class="auth-card">${mark}<h1>بازیابی رمز عبور</h1>${steps}<p class="muted">نشانی پیوند ایمیل شما در این صفحه معتبر نیست یا مهلتش گذشته است. ایمیل حسابتان را بزنید تا پیوند تازه برایتان ارسال شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.resetPassword(this)"><div class="field"><label for="reset-email">ایمیل حساب</label><input id="reset-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="مثلاً you@example.com"></div><button class="btn" style="width:100%">ارسال پیوند بازیابی</button></form><p style="text-align:center"><a class="text-link" href="/login">بازگشت به ورود ←</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    return `${g.header()}<main class="page container"><section class="auth-card">${mark}<h1>تعیین رمز عبور جدید</h1>${steps}<p class="muted">پیوند ایمیل باز شد و در حالت بازیابی هستید — برای حساب <b>${esc(g.ToubaAuth?.currentUser?.email || 'کاربر طوبی')}</b> رمز تازه‌ای با دست‌کم ۱۲ نویسه بگذارید.</p><form onsubmit="event.preventDefault();ToubaAuthUI.updatePassword(this)"><div class="field"><label for="new-password">رمز عبور جدید</label><div class="rp-pw-row"><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" required><button class="rp-eye" type="button" onclick="authTogglePw('new-password',this)" aria-label="نمایش رمز">نمایش</button></div></div><div class="field"><label for="new-password-confirm">تکرار رمز عبور</label><div class="rp-pw-row"><input id="new-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" required><button class="rp-eye" type="button" onclick="authTogglePw('new-password-confirm',this)" aria-label="نمایش تکرار رمز">نمایش</button></div></div><button class="btn" style="width:100%">ذخیره رمز جدید و ورود به حساب</button></form><p class="muted" style="font-size:12px;text-align:center">پس از ذخیره، خودکار به حساب کاربری می‌روید.</p><div id="auth-message"></div></section></main>${g.footer()}`;
  }

  g.authTogglePw = function (id, btn) {
    const el = g.document.getElementById(id);
    if (!el) return;
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    if (btn) { btn.textContent = show ? 'پنهان' : 'نمایش'; btn.setAttribute('aria-pressed', String(show)); }
    el.focus();
  };

  async function updatePassword(form) {
    const data = new FormData(form);
    if (data.get('password') !== data.get('passwordConfirm')) {
      const box = g.document.querySelector('#auth-message');
      if (box) box.innerHTML = messageBox('رمز عبور و تکرار آن یکسان نیست.', 'notice error-notice');
      return;
    }
    return runForm(form, async () => {
      await auth.updatePassword(data.get('password'));
      navigate('/account');
      return true;
    }, () => 'رمز عبور تغییر کرد؛ در حال انتقال…');
  }

  function accountPage() {
    const user = auth.currentUser || (g.db && g.db.currentUser);
    if (!user) return `${g.header()}<main class="page container"><div class="panel empty"><div class="big"><img class="auth-touba-mark big" src="/touba-logo.png" alt="نشانِ طوبی"></div><h2>برای مشاهده حساب وارد شوید</h2><a class="btn" href="/login">ورود به حساب</a>　<a class="btn outline" href="/login?mode=signup">ثبت‌نام</a></div></main>${g.footer()}`;
    return `${g.header()}<main class="page container"><h1 class="page-title">حساب کاربری</h1><div class="checkout-layout"><section class="panel"><h3>اطلاعات حساب</h3><p>نام: ${esc(user.name || 'کاربر طوبی')}</p><p>ایمیل: ${esc(user.email || '—')}</p><p>شماره تماس: ${esc(user.phone || '—')}</p><p>نوع حساب: ${user.role==='super_admin'?'مدیر ارشد':user.role==='admin'?'مدیر فروشگاه':'مشتری'}</p><div style="display:flex;gap:8px;margin-top:16px">${user.role==='admin'||user.role==='super_admin'?`<a class="btn small" href="/admin">ورود به پنل مدیریت</a>`:''}<button class="btn outline small" onclick="ToubaAuthUI.signOut()">خروج امن</button></div></section><section class="panel"><h3>سفارش‌های اخیر</h3><p>برای پیگیری وضعیت خرید و بسته‌های ارسالی به بخش سفارش‌ها بروید.</p><a class="text-link" href="/account/orders">مشاهده همه سفارش‌ها ←</a></section></div></main>${g.footer()}`;
  }

  function ordersPage() {
    const user = auth.currentUser || (g.db && g.db.currentUser);
    if (!user) return `${g.header()}<main class="page container"><div class="panel empty"><h2>برای مشاهده سفارش‌ها وارد شوید</h2><a class="btn" href="/login">ورود</a></div></main>${g.footer()}`;
    const allOrds = (g.db && g.db.orders) || [];
    const ords = (user.role === 'admin' || user.role === 'super_admin')
      ? allOrds
      : allOrds.filter(o => !user.phone || o.phone === user.phone || (o.customer && o.customer === user.name) || o.userId === user.id);
    return `${g.header()}<main class="page container"><div class="breadcrumb"><a href="/account">حساب کاربری</a>　/　سفارش‌ها</div><h1 class="page-title">سفارش‌های من</h1>${ords.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>شماره سفارش</th><th>مبلغ</th><th>تاریخ</th><th>کد پیگیری</th><th>وضعیت</th></tr></thead><tbody>${ords.map(o=>`<tr><td><b>${esc(o.number||o.id)}</b></td><td>${toman(o.total)}</td><td>${esc(o.date||'—')}</td><td><code>${esc(o.trackingCode||o.id)}</code></td><td><span class="badge ${o.status==='لغو شده'||o.status==='CANCELLED'?'red':'green'}">${esc(o.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="panel empty"><p>هنوز سفارشی ثبت نشده است.</p><a class="btn" href="/shop">مشاهده فروشگاه</a></div>'}</main>${g.footer()}`;
  }

  const adminSections = {
    dashboard: 'نمای کلی و آمار تحلیلی',
    products: 'مدیریت محصولات و انبار',
    'ai-studio': 'استودیو هوش مصنوعی محصول',
    orders: 'سفارش‌ها و وضعیت پرداخت',
    categories: 'دسته‌بندی‌های کالا',
    coupons: 'کدهای تخفیف و پروموشن',
    customers: 'لیست مشتریان و کاربران',
    'contact-messages': 'پیام‌های پشتیبانی',
    reviews: 'نظرات و دیدگاه‌های خریداران',
    homepage: 'چیدمان صفحه اصلی',
    banners: 'بنرها و اسلایدرها',
    media: 'کتابخانه رسانه',
    payments: 'پرداخت بیت‌پی (درگاه بانکی)',
    settings: 'تنظیمات کلی فروشگاه',
    demo: 'پایگاه داده و همگام‌سازی'
  };

  const adminCategories = [
    {
      title: 'آمار و تحلیل فروش',
      icon: '📊',
      items: [
        { key: 'dashboard', label: 'نمای کلی و آمار تحلیلی', icon: '▦' }
      ]
    },
    {
      title: 'کاتالوگ و هوش مصنوعی',
      icon: '👟',
      items: [
        { key: 'products', label: 'مدیریت محصولات و موجودی', icon: '◈' },
        { key: 'ai-studio', label: 'استودیو هوش مصنوعی محصول', icon: '✨' },
        { key: 'categories', label: 'دسته‌بندی‌های کالا', icon: '▤' }
      ]
    },
    {
      title: 'فروش و سفارش‌ها',
      icon: '📦',
      items: [
        { key: 'orders', label: 'سفارش‌ها و وضعیت پرداخت', icon: '▣' }
      ]
    },
    {
      title: 'مشتریان و بازاریابی',
      icon: '👥',
      items: [
        { key: 'customers', label: 'لیست مشتریان و کاربران', icon: '♙' },
        { key: 'contact-messages', label: 'پیام‌های پشتیبانی', icon: '✉' },
        { key: 'coupons', label: 'کدهای تخفیف و پروموشن', icon: '٪' },
        { key: 'reviews', label: 'نظرات و دیدگاه‌های خریداران', icon: '☆' }
      ]
    },
    {
      title: 'ویترین و محتوا',
      icon: '🎨',
      items: [
        { key: 'homepage', label: 'چیدمان صفحه اصلی', icon: '⌂' },
        { key: 'banners', label: 'بنرها و اسلایدرها', icon: '▧' },
        { key: 'media', label: 'کتابخانه رسانه', icon: '🖼' }
      ]
    },
    {
      title: 'تنظیمات و زیرساخت',
      icon: '⚙️',
      items: [
        { key: 'payments', label: 'درگاه پرداخت بیت‌پی', icon: '💳' },
        { key: 'settings', label: 'تنظیمات کلی فروشگاه', icon: '⚙' },
        { key: 'demo', label: 'پایگاه داده و همگام‌سازی', icon: '🗄' }
      ]
    }
  ];

  function adminPage() {
    const user = auth?.currentUser;
    const isAuthenticatedAdmin = user?.authProvider === 'supabase' && ['admin', 'super_admin', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
    if (!isAuthenticatedAdmin) {
      return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center;font-size:38px;color:#10b981">🔒</div><h1>دسترسی مدیریت</h1>${messageBox('برای دسترسی به پنل مدیریت، با حساب معتبر خود وارد شوید.')}<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap"><a class="btn" style="flex:1;text-align:center" href="/login">ورود به حساب کاربری</a><a class="btn outline" style="flex:1;text-align:center" href="/">بازگشت به فروشگاه</a></div></section></main>${g.footer()}`;
    }
    const section = new URLSearchParams(g.location.search).get('section') || 'dashboard';
    const selected = Object.hasOwn(adminSections, section) ? section : 'dashboard';

    setTimeout(() => {
      loadAdminSection(selected);
    }, 15);

    return `${g.header()}<main class="page container admin-page-container"><div class="auth-admin-head"><div class="auth-admin-title-box"><span class="section-eyebrow">پنل امن Supabase</span><h1 class="page-title">مدیریت طوبی</h1><small>${esc(user.email || '')} · ${user.role==='super_admin'||user.role==='SUPER_ADMIN'?'مدیر ارشد':'مدیر فروشگاه'}</small></div><div class="auth-admin-actions">${selected==='products'?`<button class="btn small" onclick="productModal()">＋ افزودن محصول جدید</button>`:selected==='categories'?`<button class="btn outline small" onclick="categoryModal()">＋ دسته‌بندی جدید</button>`:selected==='coupons'?`<button class="btn outline small" onclick="couponModal()">＋ کوپن جدید</button>`:``}${selected!=='ai-studio'?`<button class="btn outline small" onclick="ToubaAuthUI.switchAdminSection('ai-studio')">✨ استودیو هوش مصنوعی</button>`:``}<button class="btn outline small" onclick="ToubaAuthUI.loadAdminSection('${selected}')">↻ به‌روزرسانی</button><button class="btn small danger-button" onclick="ToubaAuthUI.signOut()">خروج</button></div></div><div class="admin-nav-bar"><button type="button" class="admin-hamburger-btn" onclick="ToubaAuthUI.toggleAdminDrawer()" aria-label="منوی بخش‌های مدیریت" aria-expanded="false"><span class="hamburger-icon">☰</span><span class="hamburger-title">بخش‌های مدیریت</span><span class="admin-current-chip" id="current-admin-section-name">${adminSections[selected]||'نمای کلی'}</span><span class="hamburger-arrow">⌄</span></button></div><div id="admin-drawer-overlay" class="admin-drawer-overlay" onclick="ToubaAuthUI.closeAdminDrawer()"></div><aside id="admin-drawer" class="admin-categorized-drawer" aria-label="منوی دسته‌بندی‌شده مدیریت"><div class="drawer-header"><div class="drawer-title"><span class="drawer-emblem"><img src="/touba-logo.png" alt="" width="285" height="426" onerror="this.outerHTML='❧'"></span><h3>دسته‌بندی‌های پنل مدیریت</h3></div><button type="button" class="drawer-close-btn" onclick="ToubaAuthUI.closeAdminDrawer()" aria-label="بستن منو">×</button></div><nav class="auth-admin-nav admin-drawer-nav" aria-label="بخش‌های مدیریت">${adminCategories.map(cat=>`<div class="admin-nav-group"><div class="admin-group-title"><span class="group-icon">${cat.icon}</span><span>${cat.title}</span></div><div class="admin-group-items">${cat.items.map(item=>`<button type="button" class="auth-admin-tab-btn admin-group-item ${selected===item.key?'active':''}" data-section="${item.key}" onclick="ToubaAuthUI.switchAdminSection('${item.key}')"><span class="item-icon">${item.icon}</span><span class="item-label">${item.label}</span><span class="item-active-dot"></span></button>`).join('')}</div></div>`).join('')}</nav><div class="drawer-footer"><a href="/" class="drawer-back-link">↩ بازگشت به فروشگاه</a><button type="button" class="drawer-logout-btn" onclick="ToubaAuthUI.signOut()">خروج از حساب مدیریت</button></div></aside><section id="admin-live-content" class="auth-admin-content" aria-live="polite">در حال دریافت اطلاعات…</section></main>${g.footer()}`;
  }

  function adminTable(headers, rows) {
    return `<div class="table-wrap"><table id="admin-table" class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function orderStatusControl(order) {
    if(order.paymentStatus!=='PAID')return `<span class="muted">${order.paymentStatus==='PENDING'?'در انتظار پرداخت':'پرداخت نهایی نشده'}</span>`;
    const steps=['تأیید شده','در حال آماده‌سازی','ارسال شده','تحویل داده شده'];
    const currentIndex=order.status==='CONFIRMED'?0:Math.max(0,steps.indexOf(order.status));
    const available=steps.slice(currentIndex);
    return `<select class="select" aria-label="وضعیت سفارش ${esc(order.number||order.id)}" onchange="orderStatus('${esc(order.id)}',this.value)">${available.map(status=>`<option value="${status}" ${status===order.status?'selected':''}>${status}</option>`).join('')}</select>`;
  }

  /* ---------- برچسب ارسال: اطلاعات گیرنده برای بسته‌بندی و پست ---------- */
  const SHIPPING_LABEL_NAMES = { normal: 'پست عادی', express: 'پست سریع', free: 'ارسال رایگان' };

  function findHydratedOrder(orderId) {
    const database = getDb();
    return ((database && database.orders) || []).find(o => String(o.id) === String(orderId) || String(o.number || '') === String(orderId)) || null;
  }

  function shippingMethodLabel(order) {
    return SHIPPING_LABEL_NAMES[order.shippingMethod] || order.shippingMethod || 'پست عادی';
  }

  function shippingLabelLines(order) {
    const lines = ['— برچسب ارسال · کفش طوبی —'];
    lines.push(`سفارش: ${order.number || order.id}`);
    if (order.date) lines.push(`تاریخ: ${order.date}`);
    lines.push(`گیرنده: ${order.customer || '—'}`);
    lines.push(`موبایل: ${order.phone || '—'}`);
    const region = [order.province, order.city].filter(Boolean).join(' — ');
    if (region) lines.push(`استان و شهر: ${region}`);
    lines.push(`آدرس: ${order.address || '—'}`);
    if (order.postal) lines.push(`کد پستی: ${order.postal}`);
    if (order.note) lines.push(`یادداشت مشتری: ${order.note}`);
    lines.push(`روش ارسال: ${shippingMethodLabel(order)}`);
    const items = (order.itemsList || []).map((item, index) => {
      const variant = [item.size ? `سایز ${item.size}` : '', item.color || ''].filter(Boolean).join(' / ');
      return `${index + 1}) ${item.name || 'کالا'}${variant ? ` (${variant})` : ''} × ${Number(item.quantity || 0)}`;
    });
    if (items.length) lines.push(`اقلام:\n${items.join('\n')}`);
    lines.push(`مبلغ کل: ${Number(order.total || 0).toLocaleString('fa-IR')} تومان`);
    lines.push(`پرداخت: ${order.paymentStatus === 'PAID' ? 'تأییدشده ✓' : 'در انتظار تأیید درگاه'}`);
    if (order.trackingCode) lines.push(`کد رهگیری: ${order.trackingCode}`);
    return lines;
  }

  function copyPlainText(text) {
    const fallback = () => {
      if (!g.document || !g.document.createElement) return false;
      const area = g.document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      g.document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = Boolean(g.document.execCommand && g.document.execCommand('copy')); } catch { ok = false; }
      area.remove();
      return ok;
    };
    if (g.navigator && g.navigator.clipboard && g.navigator.clipboard.writeText) {
      return g.navigator.clipboard.writeText(text).then(() => true).catch(() => fallback());
    }
    return Promise.resolve(fallback());
  }

  function shippingLabelModal(orderId) {
    const order = findHydratedOrder(orderId);
    if (!order) { g.toast('سفارش در حافظهٔ پنل پیدا نشد؛ ابتدا «به‌روزرسانی» را بزنید.'); return; }
    const row = (label, value) => `<div class="summary-line"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
    const items = (order.itemsList || []).map(item => `<div class="summary-line"><span>${esc(item.name || 'کالا')}${item.size ? ` · سایز ${esc(String(item.size))}` : ''}${item.color ? ` / ${esc(item.color)}` : ''} × ${Number(item.quantity || 0)}</span><b>${toman(Number(item.unitPrice || 0) * Number(item.quantity || 0))}</b></div>`).join('') || '<p class="muted">کالایی ثبت نشده است.</p>';
    const paid = order.paymentStatus === 'PAID';
    g.showModal(`
      <div style="max-width:560px">
        <h3 style="margin:0 0 4px">📦 برچسب ارسال · سفارش ${esc(order.number || order.id)}</h3>
        ${paid ? '<div class="notice" style="margin:10px 0;background:#e8f4d9;color:#2e5a1c">پرداخت نزد درگاه تأیید شده است — بسته را ارسال کنید و وضعیت را «ارسال شده» بزنید.</div>' : `<div class="notice error-notice" style="margin:10px 0">پرداخت این سفارش هنوز نزد درگاه تأیید نشده (${esc(order.paymentStatus || 'PENDING')}); تا تأییدِ قطعی بسته ارسال نشود.</div>`}
        <div style="margin-top:6px">${row('گیرنده', order.customer)}${row('موبایل', order.phone)}${row('استان و شهر', [order.province, order.city].filter(Boolean).join(' — '))}${row('آدرس کامل', order.address)}${row('کد پستی', order.postal)}${order.note ? row('یادداشت مشتری', order.note) : ''}${row('روش ارسال', shippingMethodLabel(order))}${row('هزینه ارسال', order.shipping ? toman(order.shipping) : 'رایگان')}${row('مبلغ کل', toman(order.total))}${order.trackingCode ? row('کد رهگیری', order.trackingCode) : ''}</div>
        <div style="margin-top:10px"><b style="font-size:12.5px">اقلام سفارش</b>${items}</div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn small" type="button" onclick="ToubaAuthUI.copyShippingLabel('${esc(order.id)}')">کپی برچسب</button><button class="btn outline small" type="button" onclick="closeModal()">بستن</button></div>
      </div>`);
  }

  async function copyShippingLabel(orderId) {
    const order = findHydratedOrder(orderId);
    if (!order) { g.toast('سفارش پیدا نشد.'); return; }
    const ok = await copyPlainText(shippingLabelLines(order).join('\n'));
    g.toast(ok ? 'متن برچسب کپی شد؛ در اپ پستی بچسبانید.' : 'کپی نشد؛ متن را از پنجرهٔ برچسب دستی بردارید.');
  }

  async function refreshAdminData(section) {
    await g.DataProvider.refresh('toubashop-v1', getDb());
    await loadAdminSection(section);
  }
  async function refreshDatabase() {
    try {
      await g.DataProvider.refresh('toubashop-v1', getDb());
      g.toast('داده‌ها با موفقیت از پایگاه داده دوباره دریافت شدند.');
      await loadAdminSection('demo');
    } catch (error) { showActionError(error, 'به‌روزرسانی پایگاه داده انجام نشد.'); }
  }
  function showActionError(error, fallback) {
    g.toast(error?.message || fallback || 'ذخیرهٔ تغییر در پایگاه داده انجام نشد.');
  }

  g.deleteProduct = async function (id) {
    if (!confirm('آیا از حذف این محصول اطمینان دارید؟')) return;
    try { await g.StoreServices.products.remove(id); await refreshAdminData('products'); g.toast('محصول از پایگاه داده حذف شد.'); }
    catch (error) { showActionError(error, 'حذف محصول انجام نشد.'); }
  };

  g.deleteCategory = async function (id) {
    if (!confirm('آیا از حذف این دسته‌بندی اطمینان دارید؟')) return;
    try { await g.DataRepositories.categories.delete(id); await refreshAdminData('categories'); g.toast('دسته‌بندی از پایگاه داده حذف شد.'); }
    catch (error) { showActionError(error, 'حذف دسته‌بندی انجام نشد. اگر محصولی به آن متصل است، ابتدا آن را جابه‌جا کنید.'); }
  };

  g.moveCategoryRow = async function (id, dir) {
    const database = getDb();
    const list = (database && database.categories) || [];
    const i = list.findIndex(c => String(c.id) === String(id));
    const j = i + Number(dir);
    if (i < 0 || j < 0 || j >= list.length) return;
    const so = c => Number(c.sortOrder || 0);
    const a = list[i], b = list[j];
    try {
      if (so(a) === so(b)) {
        const fixes = [];
        list.forEach((c, k) => { const want = (k + 1) * 10; if (so(c) !== want) { c.sortOrder = want; fixes.push(g.DataRepositories.categories.update(c.id, { sortOrder: want })); } });
        await Promise.all(fixes);
      }
      const va = so(a), vb = so(b);
      a.sortOrder = vb; b.sortOrder = va;
      await g.DataRepositories.categories.update(a.id, { sortOrder: vb });
      await g.DataRepositories.categories.update(b.id, { sortOrder: va });
      list.splice(j, 0, list.splice(i, 1)[0]);
      await refreshAdminData('categories');
      g.toast('ترتیب نمایش دسته‌بندی ذخیره شد؛ صفحه اصلی هم همین ترتیب را دارد.');
    } catch (error) {
      showActionError(error, 'تغییر ترتیب دسته‌بندی ذخیره نشد.');
      await refreshAdminData('categories').catch(() => {});
    }
  };

  g.deleteCoupon = async function (code) {
    if (!confirm('آیا از حذف این کوپن تخفیف اطمینان دارید؟')) return;
    try {
      const coupon=getDb()?.coupons?.find(row=>row.code===code||row.id===code);
      if(!coupon)throw new Error('کوپن پیدا نشد.');
      await g.DataRepositories.coupons.delete(coupon.id);
      await refreshAdminData('coupons');
      g.toast('کوپن از پایگاه داده حذف شد.');
    } catch (error) { showActionError(error, 'حذف کوپن انجام نشد.'); }
  };

  g.couponModal = function (code = '') {
    const coupon=getDb()?.coupons?.find(row=>row.code===code||row.id===code)||{code:'',type:'درصدی',amount:'',min:0,start:'',end:'',limit:50,active:true};
    const isoDate=value=>{const date=new Date(value||'');return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10)};
    g.showModal(`
      <form onsubmit="event.preventDefault();saveNewCoupon(this,'${esc(coupon.code)}')">
        <h3>${coupon.id?'ویرایش':'افزودن'} کوپن تخفیف</h3>
        <div class="form-grid">
          <div class="field"><label>کد تخفیف *</label><input name="code" required maxlength="64" style="text-transform:uppercase" value="${esc(coupon.code)}" ${coupon.id?'readonly':''}></div>
          <div class="field"><label>نوع تخفیف</label><select name="type"><option value="درصدی" ${coupon.type==='درصدی'?'selected':''}>درصدی (٪)</option><option value="مبلغ ثابت" ${coupon.type==='مبلغ ثابت'?'selected':''}>مبلغ ثابت (تومان)</option></select></div>
          <div class="field"><label>مقدار تخفیف *</label><input type="number" name="amount" min="1" required value="${esc(coupon.amount)}"></div>
          <div class="field"><label>حداقل سفارش (تومان)</label><input type="number" name="min" min="0" value="${Number(coupon.min)||0}"></div>
          <div class="field"><label>شروع اعتبار</label><input type="date" name="start" value="${isoDate(coupon.start)}"></div>
          <div class="field"><label>پایان اعتبار</label><input type="date" name="end" value="${isoDate(coupon.end)}"></div>
          <div class="field"><label>حداکثر استفاده (خالی = بدون محدودیت)</label><input type="number" name="limit" min="0" value="${Number(coupon.limit)||0}"></div>
          <div class="field"><label><input type="checkbox" name="active" ${coupon.active?'checked':''}> فعال</label></div>
          <div class="field full"><button class="btn">ذخیره کوپن</button></div>
        </div>
      </form>
    `);
  };

  g.saveNewCoupon = async function (form, code = '') {
    const data=new FormData(form),database=getDb();
    const normalizedCode=String(data.get('code')||'').trim().toUpperCase();
    if(!/^[A-Z0-9_-]{3,64}$/.test(normalizedCode)){g.toast('کد تخفیف باید ۳ تا ۶۴ نویسهٔ لاتین، عدد، خط تیره یا زیرخط باشد.');return;}
    const existing=database?.coupons?.find(row=>row.code===code||row.id===code||row.code===normalizedCode);
    const record={id:existing?.id,code:normalizedCode,type:String(data.get('type')||'درصدی'),amount:Number(data.get('amount')),min:Number(data.get('min'))||0,start:String(data.get('start')||''),end:String(data.get('end')||''),limit:Number(data.get('limit'))||0,used:Number(existing?.used)||0,active:form.elements.active.checked};
    try {
      if(existing)await g.DataRepositories.coupons.update(existing.id,record);
      else await g.DataRepositories.coupons.create(record);
      g.closeModal();await refreshAdminData('coupons');g.toast('کوپن در پایگاه داده ذخیره شد.');
    } catch(error) { showActionError(error,'ذخیرهٔ کوپن انجام نشد.'); }
  };

  async function updateContactMessageStatus(id, status, control) {
    const allowed = new Set(['new', 'read', 'resolved']);
    const previous = String(control?.dataset?.previousStatus || control?.value || 'new');
    if (!id || !allowed.has(status)) {
      if (control && allowed.has(previous)) control.value = previous;
      g.toast('وضعیت انتخاب‌شده برای پیام پشتیبانی معتبر نیست.');
      return false;
    }
    if (control) control.disabled = true;
    try {
      await g.DataRepositories.contactMessages.update(id, { status });
      if (control) control.dataset.previousStatus = status;
      await loadAdminSection('contact-messages');
      g.toast(status === 'resolved' ? 'پیام به‌عنوان رسیدگی‌شده ثبت شد.' : status === 'read' ? 'وضعیت پیام به «در حال پیگیری» تغییر کرد.' : 'وضعیت پیام به «جدید» تغییر کرد.');
      return true;
    } catch (error) {
      if (control && allowed.has(previous)) control.value = previous;
      showActionError(error, 'به‌روزرسانی وضعیت پیام پشتیبانی انجام نشد.');
      return false;
    } finally {
      if (control) control.disabled = false;
    }
  }

  g.updateReviewStatus = async function (id, status) {
    try { await g.StoreServices.reviews.moderate(id,status); await refreshAdminData('reviews'); g.toast(`وضعیت دیدگاه به «${status}» تغییر کرد.`); }
    catch(error) { showActionError(error,'تغییر وضعیت دیدگاه انجام نشد.'); }
  };

  g.deleteReview = async function (id) {
    if (!confirm('آیا از حذف این نظر اطمینان دارید؟')) return;
    try { await g.StoreServices.reviews.remove(id); await refreshAdminData('reviews'); g.toast('دیدگاه از پایگاه داده حذف شد.'); }
    catch(error) { showActionError(error,'حذف دیدگاه انجام نشد.'); }
  };

  g.toggleBanner = async function (id) {
    const banner=getDb()?.banners?.find(row=>row.id===id);
    if(!banner)return;
    try { await g.DataRepositories.banners.update(id,{active:!banner.active}); await refreshAdminData('banners'); g.toast(banner.active?'بنر غیرفعال شد.':'بنر فعال شد.'); }
    catch(error) { showActionError(error,'تغییر وضعیت بنر انجام نشد.'); }
  };

  g.bannerModal = function (id = '') {
    const database=getDb(),banner=database?.banners?.find(row=>String(row.id)===String(id))||{
      title:'',subtitle:'',imageUrl:'',linkUrl:'/shop',buttonText:'مشاهده کالکشن',position:'home-promo',
      sortOrder:(database?.banners?.length||0),active:true
    };
    const editing=Boolean(id);
    g.showModal(`
      <form onsubmit="event.preventDefault();saveBanner(this,'${esc(id)}')">
        <h3>${editing?'ویرایش بنر':'افزودن بنر'}</h3>
        <div class="form-grid">
          <div class="field full"><label>عنوان *</label><input name="title" required maxlength="200" value="${esc(banner.title)}"></div>
          <div class="field full"><label>توضیحات</label><textarea name="subtitle" maxlength="2000">${esc(banner.subtitle||'')}</textarea></div>
          <div class="field full"><label>آدرس تصویر *</label><input name="imageUrl" required maxlength="2048" dir="ltr" value="${esc(banner.imageUrl||'')}" placeholder="/touba-hero-editorial.jpg یا https://…"><small class="muted">مسیر محلی سایت یا URL امن HTTPS؛ آپلود فایل در فیلد بعدی، تصویر را در Supabase Storage نگه می‌دارد.</small></div>
          <div class="field full"><label>آپلود تصویر (JPEG، PNG یا WebP؛ حداکثر ۵ مگابایت)</label><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"></div>
          <div class="field"><label>متن دکمه</label><input name="buttonText" maxlength="100" value="${esc(banner.buttonText||'')}"></div>
          <div class="field"><label>لینک مقصد</label><input name="linkUrl" maxlength="2048" dir="ltr" value="${esc(banner.linkUrl||'/shop')}" placeholder="/shop"></div>
          <div class="field"><label>جایگاه نمایش</label><select name="position"><option value="home-promo" ${banner.position==='home-promo'?'selected':''}>بنر کالکشن صفحهٔ اصلی</option></select></div>
          <div class="field"><label>ترتیب نمایش</label><input name="sortOrder" type="number" min="0" step="1" value="${Number(banner.sortOrder)||0}"></div>
          <div class="field"><label><input type="checkbox" name="active" ${banner.active?'checked':''}> فعال</label></div>
          <div class="field full"><button class="btn">ذخیره بنر در پایگاه داده</button></div>
        </div>
      </form>
    `);
  };

  g.saveBanner = async function (form, id = '') {
    const data=new FormData(form),title=String(data.get('title')||'').trim(),subtitle=String(data.get('subtitle')||'').trim();
    if(!title||title.length>200){g.toast('عنوان بنر را وارد کنید (حداکثر ۲۰۰ نویسه).');return;}
    let imageUrl=String(data.get('imageUrl')||'').trim(),file=form.elements.imageFile?.files?.[0];
    try {
      if(file){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.');
        if(file.size<1||file.size>5*1024*1024)throw new Error('حجم تصویر باید کمتر از ۵ مگابایت باشد.');
        imageUrl=await new Promise((resolve,reject)=>{const reader=new g.FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('خواندن فایل تصویر انجام نشد.'));reader.readAsDataURL(file);});
      }
      if(imageUrl.startsWith('data:image/'))imageUrl=(await g.DataRepositories.media.create({url:imageUrl,alt:title})).url;
      else imageUrl=g.SupabaseRepositories.safePublicUrl(imageUrl,{optional:false});
      const rawLink=String(data.get('linkUrl')||'').trim(),linkUrl=g.SupabaseRepositories.safePublicUrl(rawLink)||'';
      const sortOrder=Number(data.get('sortOrder')||0);
      if(!Number.isInteger(sortOrder)||sortOrder<0)throw new Error('ترتیب نمایش باید یک عدد صحیح مثبت یا صفر باشد.');
      const banner={title,subtitle,imageUrl,linkUrl,buttonText:String(data.get('buttonText')||'').trim(),position:'home-promo',sortOrder,active:form.elements.active.checked};
      if(id)await g.DataRepositories.banners.update(id,banner);else await g.DataRepositories.banners.create(banner);
      g.closeModal();await refreshAdminData('banners');g.toast(id?'بنر در پایگاه داده به‌روزرسانی شد.':'بنر در پایگاه داده ایجاد شد.');
    } catch(error) { showActionError(error,'ذخیرهٔ بنر انجام نشد.'); }
  };

  g.deleteBanner = async function (id) {
    if(!confirm('آیا از حذف این بنر مطمئن هستید؟'))return;
    try { await g.DataRepositories.banners.delete(id);await refreshAdminData('banners');g.toast('بنر از پایگاه داده حذف شد.'); }
    catch(error) { showActionError(error,'حذف بنر انجام نشد.'); }
  };

  g.saveHomepageCMS = async function () {
    const database=getDb(),homepage={...(database?.settings?.homepage||{})};
    homepage.heroTitle=g.document.getElementById('cms-h-title')?.value.trim()||'';
    homepage.heroText=g.document.getElementById('cms-h-text')?.value.trim()||'';
    homepage.heroButtonText=g.document.getElementById('cms-h-btn')?.value.trim()||'';
    homepage.heroButtonUrl=g.document.getElementById('cms-h-url')?.value.trim()||'/shop';
    const rawHeroImage=g.document.getElementById('cms-h-img')?.value.trim()||'';
    homepage.footerText=g.document.getElementById('cms-h-foot')?.value.trim()||'';
    try {
      homepage.heroImage=rawHeroImage.startsWith('data:image/')
        ? (await g.DataRepositories.media.create({url:rawHeroImage,alt:'تصویر اصلی صفحهٔ فروشگاه'})).url
        : (g.SupabaseRepositories.safePublicUrl(rawHeroImage)||'');
      await g.DataRepositories.siteSettings.update('homepage',{value:homepage});
      await refreshAdminData('homepage');
      g.toast('محتوای صفحهٔ اصلی در پایگاه داده ذخیره شد.');
    } catch(error) { showActionError(error,'ذخیرهٔ محتوای صفحهٔ اصلی انجام نشد.'); }
  };

  g.saveStoreSettings = async function () {
    const database=getDb(),settings={
      storeName:g.document.getElementById('adm-set-name')?.value.trim()||'',
      phone:g.document.getElementById('adm-set-phone')?.value.trim()||'',
      address:g.document.getElementById('adm-set-address')?.value.trim()||'',
      shipping:Math.max(0,Number(g.document.getElementById('adm-set-shipping')?.value)||0),
      freeShipping:Math.max(0,Number(g.document.getElementById('adm-set-free')?.value)||0),
      metaDescription:g.document.getElementById('adm-set-meta')?.value.trim()||'',
      about:g.document.getElementById('adm-set-about')?.value.trim()||'',
      enamad:{id:g.document.getElementById('adm-set-enamad-id')?.value.trim()||'',code:g.document.getElementById('adm-set-enamad-code')?.value.trim()||''}
    };
    settings.shippingOptions={...(database?.settings?.shippingOptions||{}),normal:settings.shipping,express:Math.max(0,Number(g.document.getElementById('adm-set-express')?.value)||0),freeFrom:settings.freeShipping};
    try {
      for(const [key,value] of Object.entries(settings))await g.DataRepositories.siteSettings.update(key,{value});
      await refreshAdminData('settings');g.toast('تنظیمات فروشگاه در پایگاه داده ذخیره شد.');
    } catch(error) { showActionError(error,'ذخیرهٔ تنظیمات فروشگاه کامل نشد.'); }
  };

  g.checkBitPayStatus = async function () {
    g.toast('در حال بررسی پیکربندی درگاه بیت‌پی…');
    try {
      const response=await fetch('/api/payment/bitpay/status',{cache:'no-store'}),data=await response.json();
      if(data?.paymentEnabled)g.toast('بیت‌پی آماده است؛ مشتریان می‌توانند در تسویه «پرداخت مستقیم بانکی» را انتخاب کنند.');
      else if(data && data.missingServerKeys && data.missingServerKeys.length)g.toast('متغیرهای سرور کامل نیست: '+data.missingServerKeys.join('، '));
      else g.toast('پیکربندی بیت‌پی کامل نیست؛ کلید ۵۲ کاراکتری پنل را در متغیرهای محیطی Vercel (BITPAY_API_KEY) تنظیم کنید.');
      return data;
    } catch { g.toast('وضعیت بیت‌پی دریافت نشد؛ API سایت را بررسی کنید.');return null; }
  };

  g.mediaAddModal = function () {
    g.showModal(`<form onsubmit="event.preventDefault();saveNewMedia(this)"><h3>افزودن تصویر به کتابخانهٔ پایگاه داده</h3><div class="field"><label>URL تصویر *</label><input name="url" type="url" required placeholder="https://..." dir="ltr"></div><div class="field"><label>متن جایگزین تصویر</label><input name="alt" maxlength="500"></div><button class="btn" style="margin-top:14px">ذخیره در کتابخانه</button></form>`);
  };

  g.saveNewMedia = async function (form) {
    const data=new FormData(form),url=String(data.get('url')||'').trim(),alt=String(data.get('alt')||'').trim()||'تصویر محصول طوبی';
    try { await g.DataRepositories.media.create({url,alt});g.closeModal();await refreshAdminData('media');g.toast('رسانه در پایگاه داده ذخیره شد.'); }
    catch(error) { showActionError(error,'ذخیرهٔ رسانه انجام نشد.'); }
  };

  g.deleteMediaItem = async function (id) {
    if(!confirm('آیا از حذف این تصویر از کتابخانه مطمئن هستید؟'))return;
    try { await g.DataRepositories.media.delete(id);await refreshAdminData('media');g.toast('رسانه از پایگاه داده حذف شد.'); }
    catch(error) { showActionError(error,'حذف رسانه انجام نشد.'); }
  };

  function selectAllCatalogRows(kind, checked) {
    g.document.querySelectorAll(`[data-bulk-${kind}]`).forEach(input => { input.checked = Boolean(checked); });
    updateCatalogSelectionCount(kind);
  }

  function updateCatalogSelectionCount(kind) {
    const count = g.document.querySelectorAll(`[data-bulk-${kind}]:checked`).length;
    const output = g.document.querySelector(`#bulk-${kind}-selected-count`);
    if (output) output.textContent = `${count.toLocaleString('fa-IR')} مورد انتخاب‌شده`;
  }

  async function saveBulkRows(rows, repository) {
    if (!repository?.update) throw new Error('مخزن پایگاه داده برای عملیات گروهی در دسترس نیست.');
    for (const row of rows) await repository.update(row.id, row);
  }

  async function bulkApplyProducts() {
    const database = getDb();
    const ids = new Set([...g.document.querySelectorAll('[data-bulk-product]:checked')].map(input => input.value));
    if (!ids.size) { g.toast('ابتدا یک یا چند محصول را انتخاب کنید.'); return; }
    const category = g.document.querySelector('#bulk-product-category')?.value || '';
    const active = g.document.querySelector('#bulk-product-active')?.value || '';
    const featured = g.document.querySelector('#bulk-product-featured')?.value || '';
    const bestSeller = g.document.querySelector('#bulk-product-bestseller')?.value || '';
    const rawPercent = String(g.document.querySelector('#bulk-product-price-percent')?.value || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, '');
    const percent = rawPercent.trim() === '' ? null : Number(rawPercent);
    if (percent !== null && (!Number.isFinite(percent) || percent < -90 || percent > 500)) { g.toast('درصد تغییر قیمت باید بین ۹۰- تا ۵۰۰ باشد.'); return; }
    if (!category && !active && !featured && !bestSeller && percent === null) { g.toast('حداقل یک تغییر گروهی انتخاب کنید.'); return; }
    const changed = (database?.products || []).filter(product => ids.has(String(product.id))).map(product => ({...product}));
    for (const product of changed) {
      if (category) product.category = category;
      if (active) product.active = active === 'true';
      if (featured) product.featured = featured === 'true';
      if (bestSeller) product.bestSeller = bestSeller === 'true';
      if (percent !== null) product.price = Math.max(0, Math.round(Number(product.price || 0) * (1 + percent / 100)));
      product.updatedAt = new Date().toISOString();
    }
    try {
      await saveBulkRows(changed, g.DataRepositories?.products);
      await g.DataProvider.refresh('toubashop-v1',getDb());
      g.toast(`تغییرات ${changed.length.toLocaleString('fa-IR')} محصول ذخیره شد.`);
      await loadAdminSection('products');
    } catch (error) { try{await g.DataProvider.refresh('toubashop-v1',getDb())}catch{};showActionError(error,'ذخیرهٔ گروهی محصولات انجام نشد.'); }
  }

  async function bulkApplyCategories() {
    const database = getDb();
    const ids = new Set([...g.document.querySelectorAll('[data-bulk-category]:checked')].map(input => input.value));
    if (!ids.size) { g.toast('ابتدا یک یا چند دسته‌بندی را انتخاب کنید.'); return; }
    const active = g.document.querySelector('#bulk-category-active')?.value || '';
    const icon = String(g.document.querySelector('#bulk-category-icon')?.value || '').trim().slice(0, 12);
    if (!active && !icon) { g.toast('برای اعمال گروهی، وضعیت یا آیکون را انتخاب کنید.'); return; }
    const changed = (database?.categories || []).filter(category => ids.has(String(category.id))).map(category=>({...category}));
    for (const category of changed) {
      if (active) category.active = active === 'true';
      if (icon) category.icon = icon;
      category.updatedAt = new Date().toISOString();
    }
    try {
      await saveBulkRows(changed, g.DataRepositories?.categories);
      await g.DataProvider.refresh('toubashop-v1',getDb());
      g.toast(`تغییرات ${changed.length.toLocaleString('fa-IR')} دسته‌بندی ذخیره شد.`);
      await loadAdminSection('categories');
    } catch (error) { try{await g.DataProvider.refresh('toubashop-v1',getDb())}catch{};showActionError(error,'ذخیرهٔ گروهی دسته‌بندی‌ها انجام نشد.'); }
  }

  async function loadAdminSection(section) {
    const target = g.document?.querySelector ? g.document.querySelector('#admin-live-content') : null;
    if (!target) return;

    try {
      const database = getDb();
      if (section === 'dashboard') {
        const prods = (database && database.products) || [];
        const ords = (database && database.orders) || [];
        const paidOrders = ords.filter(order => order.paymentStatus === 'PAID');
        const totalSales = paidOrders.reduce((n, order) => n + Number(order.total || 0), 0);
        const custs = (database && (database.customers || database.users)) || [];
        const activeCustomers = custs.filter(customer => String(customer.role || 'customer').toLowerCase() === 'customer' && (customer.active === true || customer.isActive === true)).length;
        const now = new Date();
        const months = Array.from({length:6}, (_, index) => {
          const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
          return { year:date.getFullYear(), month:date.getMonth(), label:new Intl.DateTimeFormat('fa-IR',{month:'short'}).format(date), total:0 };
        });
        const monthByKey = new Map(months.map(month => [`${month.year}-${month.month}`, month]));
        for (const order of paidOrders) {
          const date = new Date(order.createdAt || '');
          if (Number.isNaN(date.getTime())) continue;
          const month = monthByKey.get(`${date.getFullYear()}-${date.getMonth()}`);
          if (month) month.total += Number(order.total || 0);
        }
        const maxMonthSales = Math.max(0, ...months.map(month => month.total));
        const monthBars = months.map(month => {
          const height = maxMonthSales ? Math.max(4, Math.round(month.total * 100 / maxMonthSales)) : 0;
          return `<div class="bar" style="height:${height}%" data-label="${esc(month.label)}" title="${esc(month.label)}: ${toman(month.total)}"></div>`;
        }).join('');
        const orderLabels = { pending_payment:'در انتظار پرداخت', NEW:'در انتظار پرداخت', paid:'پرداخت‌شده', CONFIRMED:'پرداخت‌شده', processing:'در حال آماده‌سازی', PROCESSING:'در حال آماده‌سازی', shipped:'ارسال‌شده', SHIPPED:'ارسال‌شده', delivered:'تحویل‌شده', DELIVERED:'تحویل‌شده', cancelled:'لغوشده', CANCELLED:'لغوشده', refunded:'بازپرداخت‌شده', REFUNDED:'بازپرداخت‌شده' };
        target.innerHTML = `
        <div class="stats" style="margin-bottom:20px">
          <div class="stat-card"><span>محصولات پایگاه داده</span><b>${prods.length.toLocaleString('fa-IR')}</b><i>👟</i></div>
          <div class="stat-card"><span>سفارش‌های پایگاه داده</span><b>${ords.length.toLocaleString('fa-IR')}</b><i>📦</i></div>
          <div class="stat-card"><span>درآمد پرداخت‌شده (تومان)</span><b>${toman(totalSales)}</b><i>💳</i></div>
          <div class="stat-card"><span>مشتریان فعال</span><b>${activeCustomers.toLocaleString('fa-IR')}</b><i>👥</i></div>
        </div>
        <div class="chart-card">
          <h3 style="margin-top:0">درآمد پرداخت‌شده در شش ماه اخیر</h3>
          ${paidOrders.length ? `<div class="chart" role="img" aria-label="نمودار درآمد سفارش‌های پرداخت‌شده">${monthBars}</div>` : '<p class="muted">هنوز پرداخت تأییدشده‌ای برای نمایش در نمودار ثبت نشده است.</p>'}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 10px;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0">آخرین سفارش‌ها</h3>
          <button type="button" class="btn outline small" onclick="ToubaAuthUI.switchAdminSection('orders')">مشاهده همه سفارش‌ها ←</button>
        </div>
        ` + adminTable(['شماره سفارش', 'مشتری', 'مبلغ', 'وضعیت', 'تاریخ', 'برچسب ارسال'], ords.slice(0, 6).map(order => {
          const status = orderLabels[order.status] || order.status || '—';
          return `<tr><td><b>${esc(order.number || order.id)}</b></td><td>${esc(order.customer)}<br><small style="color:#666">${esc([order.province, order.city].filter(Boolean).join(' — ') || order.phone || '')}</small></td><td>${toman(order.total)}</td><td><span class="badge ${order.status === 'لغو شده' || order.status === 'CANCELLED' ? 'red' : 'green'}">${esc(status)}</span></td><td>${esc(order.date || '—')}</td><td><button class="action" onclick="ToubaAuthUI.shippingLabelModal('${esc(order.id)}')">📦 برچسب</button></td></tr>`;
        }).join('') || `<tr><td colspan="6">هنوز سفارشی ثبت نشده است.</td></tr>`);
        return;
      }

      if (section === 'ai-studio') {
        if (typeof g.renderProductAiStudioPage === 'function') {
          g.renderProductAiStudioPage(target);
        } else if (typeof window.renderProductAiStudioPage === 'function') {
          window.renderProductAiStudioPage(target);
        } else {
          target.innerHTML = `<div class="ai-studio-root" id="ai-studio-standalone-root"></div>`;
          if (typeof window.initProductAiStudio === 'function') {
            window.initProductAiStudio(target.querySelector('#ai-studio-standalone-root'));
          }
        }
        return;
      }

      if (section === 'products') {
        const prods = (database && database.products) || [];
        const cats = (database && database.categories) || [];
        const toolbar = `<section class="admin-bulk-card" aria-label="ویرایش گروهی محصولات">
          <div class="admin-bulk-heading"><div><b>ویرایش گروهی</b><span id="bulk-product-selected-count">۰ مورد انتخاب‌شده</span></div><label><input type="checkbox" onchange="ToubaAuthUI.selectAllCatalogRows('product',this.checked)"> انتخاب همه</label></div>
          <div class="admin-bulk-controls">
            <label>انتقال به دسته<select id="bulk-product-category"><option value="">بدون تغییر</option>${cats.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
            <label>انتشار<select id="bulk-product-active"><option value="">بدون تغییر</option><option value="true">فعال‌سازی</option><option value="false">پیش‌نویس</option></select></label>
            <label>محصول ویژه<select id="bulk-product-featured"><option value="">بدون تغییر</option><option value="true">بله</option><option value="false">خیر</option></select></label>
            <label>پرفروش<select id="bulk-product-bestseller"><option value="">بدون تغییر</option><option value="true">بله</option><option value="false">خیر</option></select></label>
            <label>تغییر قیمت ٪<input id="bulk-product-price-percent" type="number" min="-90" max="500" step="1" placeholder="مثلاً ۱۰ یا -۵"></label>
            <button class="btn small" type="button" onclick="ToubaAuthUI.bulkApplyProducts()">اعمال به انتخاب‌شده‌ها</button>
          </div>
        </section>`;
        target.innerHTML = `<div class="admin-catalog-toolbar">
          <div><h2 style="font-size:18px;margin:0">کاتالوگ محصولات (${prods.length})</h2><p class="muted" style="margin:4px 0 0">برای تغییر چند محصول، موارد را انتخاب کنید؛ عملیات گروهی محصولی را حذف نمی‌کند.</p><p class="notice" style="margin:6px 0 0">کاتالوگ از Supabase خوانده می‌شود و ذخیره‌سازی هر تغییر پس از تأیید پایگاه داده انجام می‌شود.</p></div>
          <div class="admin-catalog-actions"><button class="btn small" onclick="productModal()">＋ افزودن محصول جدید</button></div>
        </div>${toolbar}<div class="shop-toolbar"><input class="select" style="max-width:300px" placeholder="جستجوی نام، SKU یا برند" oninput="filterAdminTable(this.value)"><span>${prods.length.toLocaleString('fa-IR')} محصول · ${(database?.products||[]).filter(p=>p.active).length.toLocaleString('fa-IR')} فعال</span></div>`
        + adminTable(['انتخاب','نام محصول','SKU','دسته‌بندی','قیمت (تومان)','موجودی','وضعیت','عملیات'], prods.map(p => `<tr data-search="${esc(`${p.name||''} ${p.sku||''} ${p.brand||''}`.toLocaleLowerCase())}"><td><input type="checkbox" data-bulk-product value="${esc(p.id)}" aria-label="انتخاب ${esc(p.name)}" onchange="ToubaAuthUI.updateCatalogSelectionCount('product')"></td><td><b>${esc(p.name)}</b></td><td><code>${esc(p.sku || '—')}</code></td><td>${esc(catName(p.category))}</td><td>${toman(p.price)}</td><td>${(p.variants || []).reduce((n, v) => n + Number(v.stock || 0), Number(p.stock || 0)).toLocaleString('fa-IR')}</td><td><span class="badge ${p.active ? 'green' : 'red'}">${p.active ? 'فعال' : 'پیش‌نویس'}</span></td><td><button class="action" onclick="productModal('${esc(p.id)}')">ویرایش کامل</button> <button class="action danger" onclick="deleteProduct('${esc(p.id)}')">حذف</button></td></tr>`).join(''));
        return;
      }
      if (section === 'orders') {
        const ords = (database && database.orders) || [];
        const SHIPPING_NAMES = { normal: 'پست عادی', express: 'پست سریع', free: 'ارسال رایگان' };
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:8px">
          <h2 style="font-size:18px;margin:0">سفارش‌ها (${ords.length})</h2>
          <button class="btn outline small" onclick="ToubaAuthUI.refreshDatabase()">به‌روزرسانی از پایگاه داده</button>
        </div>
        <p class="muted" style="margin:0 0 12px;font-size:12px">برچسبِ هر سفارش نام، آدرس، کد پستی و اقلام گیرنده را برای بسته‌بندی و ارسال نشان می‌دهد؛ با «کپی برچسب» متنش را در اپ پستی بچسبانید.</p>
        <div class="shop-toolbar" style="margin-bottom:10px"><input class="select" style="max-width:320px" placeholder="جستجو: شماره سفارش، مشتری، موبایل، شهر یا کد پستی" oninput="filterAdminTable(this.value)"></div>` +
        adminTable(['شماره سفارش', 'مشتری', 'مبلغ (تومان)', 'ارسال', 'تاریخ', 'پرداخت', 'وضعیت', 'تغییر وضعیت', 'برچسب ارسال'], ords.map(o => `<tr data-search="${esc(`${o.number || o.id} ${o.customer || ''} ${o.phone || ''} ${o.city || ''} ${o.province || ''} ${o.postal || ''}`.toLocaleLowerCase())}"><td><b>${esc(o.number || o.id)}</b><br><small style="color:#666"><code>${esc(o.trackingCode || o.id)}</code></small></td><td>${esc(o.customer)}<br><small style="color:#666">${esc(o.phone || '')} · ${esc([o.province, o.city].filter(Boolean).join(' — ') || 'بدون شهر')}</small></td><td>${toman(o.total)}</td><td>${esc(SHIPPING_NAMES[o.shippingMethod] || o.shippingMethod || 'عادی')}<br><small style="color:#666">${o.shipping ? toman(o.shipping) : 'رایگان'}</small></td><td>${esc(o.date || '—')}</td><td><span class="badge ${o.paymentStatus === 'PAID' ? 'green' : 'red'}">${o.paymentStatus === 'PAID' ? 'تأییدشده' : o.paymentStatus === 'FAILED' ? 'ناموفق' : 'در انتظار'}</span></td><td><span class="badge ${o.status === 'لغو شده' ? 'red' : 'green'}">${esc(o.status)}</span></td><td>${orderStatusControl(o)}</td><td><button class="action" onclick="ToubaAuthUI.shippingLabelModal('${esc(o.id)}')">📦 برچسب ارسال</button></td></tr>`).join('') || '<tr><td colspan="9">هنوز سفارشی ثبت نشده است.</td></tr>');
        return;
      }

      if (section === 'categories') {
        const cats = (database && database.categories) || [];
        const bulk = `<section class="admin-bulk-card" aria-label="ویرایش گروهی دسته‌بندی‌ها">
          <div class="admin-bulk-heading"><div><b>ویرایش گروهی دسته‌بندی‌ها</b><span id="bulk-category-selected-count">۰ مورد انتخاب‌شده</span></div><label><input type="checkbox" onchange="ToubaAuthUI.selectAllCatalogRows('category',this.checked)"> انتخاب همه</label></div>
          <div class="admin-bulk-controls"><label>وضعیت<select id="bulk-category-active"><option value="">بدون تغییر</option><option value="true">فعال‌سازی</option><option value="false">غیرفعال‌سازی</option></select></label><label>آیکون مشترک (اختیاری)<input id="bulk-category-icon" maxlength="12" placeholder="مثلاً 👟"></label><button class="btn small" type="button" onclick="ToubaAuthUI.bulkApplyCategories()">اعمال به دسته‌های انتخاب‌شده</button></div>
        </section>`;
        target.innerHTML = `<div class="admin-catalog-toolbar"><div><h2 style="font-size:18px;margin:0">دسته‌بندی‌های فروشگاه (${cats.length})</h2><p class="muted" style="margin:4px 0 0">دسته‌های موجود حفظ می‌شوند؛ می‌توانید چند مورد را هم‌زمان فعال/غیرفعال یا آیکون‌گذاری کنید.</p><p class="notice" style="margin:6px 0 0">دسته‌بندی‌ها از جدول Supabase خوانده می‌شوند؛ تغییر وضعیت، افزودن و حذف فقط پس از موفقیت پایگاه داده اعمال می‌شود.</p></div><button class="btn small" onclick="categoryModal()">＋ دسته‌بندی جدید</button></div>${bulk}`
        + adminTable(['انتخاب','آیکون','نام دسته‌بندی','شناسه لاتین','محصولات','وضعیت','ترتیب نمایش'], cats.map((c, idx) => `<tr><td><input type="checkbox" data-bulk-category value="${esc(c.id)}" aria-label="انتخاب دسته ${esc(c.name)}" onchange="ToubaAuthUI.updateCatalogSelectionCount('category')"></td><td style="font-size:20px">${esc(c.icon || '◈')}</td><td><b>${esc(c.name)}</b></td><td><code>${esc(c.id)}</code></td><td>${(database?.products||[]).filter(p=>p.category===c.id).length.toLocaleString('fa-IR')}</td><td><span class="badge ${c.active ? 'green' : 'red'}">${c.active ? 'فعال' : 'غیرفعال'}</span></td><td><div class="cat-order-move"><button class="action" onclick="moveCategoryRow('${esc(c.id)}',-1)" ${idx===0?'disabled':''} title="انتقال به بالا" aria-label="بالا بردن ${esc(c.name)}">▲</button><span class="cat-order-pos">${(idx+1).toLocaleString('fa-IR')}</span><button class="action" onclick="moveCategoryRow('${esc(c.id)}',1)" ${idx===cats.length-1?'disabled':''} title="انتقال به پایین" aria-label="پایین بردن ${esc(c.name)}">▼</button></div></td></tr>`).join(''));
        return;
      }
      if (section === 'coupons') {
        const coups = (database && database.coupons) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">کوپن‌های تخفیف (${coups.length})</h2>
          <button class="btn small" onclick="couponModal()">＋ افزودن کوپن جدید</button>
        </div>` + adminTable(['کد تخفیف', 'نوع', 'مقدار', 'حداقل سفارش', 'وضعیت', 'عملیات'], coups.map(c => `<tr><td><code>${esc(c.code)}</code></td><td>${esc(c.type || 'درصدی')}</td><td>${c.amount}${c.type === 'درصدی' ? '٪' : ' تومان'}</td><td>${toman(c.min || 0)}</td><td><span class="badge ${c.active ? 'green' : 'red'}">${c.active ? 'فعال' : 'غیرفعال'}</span></td><td><button class="action danger" onclick="deleteCoupon('${c.code}')">حذف</button></td></tr>`).join(''));
        return;
      }

      if (section === 'customers') {
        const users = (database && (database.users || database.customers)) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">کاربران و مشتریان (${users.length})</h2>
        </div>` + adminTable(['نام', 'ایمیل / شماره تماس', 'نقش', 'وضعیت'], users.map(u => { const active=u.active===true||u.isActive===true;return `<tr><td><b>${esc(u.name || u.displayName || '—')}</b></td><td>${esc(u.email || u.phone || '—')}</td><td>${u.role === 'super_admin' ? 'مدیر ارشد' : u.role === 'admin' ? 'مدیر فروشگاه' : 'مشتری'}</td><td><span class="badge ${active?'green':'red'}">${active?'فعال':'غیرفعال'}</span></td></tr>`; }).join(''));
        return;
      }

      if (section === 'contact-messages') {
        const messages=await g.DataRepositories.contactMessages.list();
        const labels={new:'جدید',read:'در حال پیگیری',resolved:'رسیدگی‌شده'};
        target.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap"><div><h2 style="font-size:18px;margin:0">پیام‌های پشتیبانی (${messages.length})</h2><p class="muted">پیام‌ها مستقیماً در پایگاه داده ثبت می‌شوند و فقط مدیر فعال به آن‌ها دسترسی دارد.</p></div><button class="btn outline small" onclick="ToubaAuthUI.loadAdminSection('contact-messages')">به‌روزرسانی</button></div>`+
          adminTable(['فرستنده','شماره تماس','پیام','زمان ثبت','وضعیت'],messages.map(message=>`<tr><td><b>${esc(message.name)}</b></td><td><a href="tel:${esc(message.phone)}" dir="ltr">${esc(message.phone)}</a></td><td style="white-space:pre-wrap;min-width:220px;max-width:420px">${esc(message.message)}</td><td>${esc(new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(message.createdAt)))}</td><td><select class="select" data-previous-status="${esc(message.status)}" aria-label="وضعیت پیام ${esc(message.name)}" onchange="ToubaAuthUI.updateContactMessageStatus('${esc(message.id)}',this.value,this)">${['new','read','resolved'].map(status=>`<option value="${status}" ${message.status===status?'selected':''}>${labels[status]}</option>`).join('')}</select></td></tr>`).join(''));
        return;
      }

      if (section === 'reviews') {
        const revs = (database && database.reviews) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">دیدگاه‌های مشتریان (${revs.length})</h2>
        </div>` + adminTable(['مشتری', 'محصول', 'امتیاز', 'متن دیدگاه', 'وضعیت', 'عملیات'], revs.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.product || '—')}</td><td aria-label="${Number(r.rating)||0} از ۵">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(Math.max(0,5-(Number(r.rating)||0)))}</td><td style="max-width:240px">${esc(r.text)}</td><td><span class="badge ${r.status==='تأیید شده'?'green':r.status==='رد شده'?'red':''}">${esc(r.status)}</span></td><td><button class="action" onclick="updateReviewStatus('${r.id}','تأیید شده')">تأیید</button> <button class="action" onclick="updateReviewStatus('${r.id}','رد شده')">رد</button> <button class="action danger" onclick="deleteReview('${r.id}')">حذف</button></td></tr>`).join(''));
        return;
      }

      if (section === 'banners') {
        const bans = (database && database.banners) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px;flex-wrap:wrap">
          <div><h2 style="font-size:18px;margin:0">بنرهای تبلیغاتی (${bans.length.toLocaleString('fa-IR')})</h2><p class="muted" style="margin:5px 0 0">بنرها از پایگاه داده خوانده می‌شوند؛ تصویر را می‌توانید از Storage یا یک URL معتبر انتخاب کنید.</p></div>
          <button class="btn small" type="button" onclick="ToubaAuthUI.bannerModal()">＋ بنر جدید</button>
        </div>` + adminTable(['تصویر', 'عنوان', 'توضیحات', 'جایگاه', 'وضعیت', 'عملیات'], bans.map(b => `<tr><td><img src="${esc(b.imageUrl || '')}" alt="${esc(b.title)}" width="56" height="36" style="object-fit:cover;border-radius:4px" onerror="this.style.visibility='hidden'"></td><td><b>${esc(b.title)}</b></td><td>${esc(b.subtitle || '—')}</td><td><code>${esc(b.position || 'home-promo')}</code></td><td><span class="badge ${b.active ? 'green' : 'red'}">${b.active ? 'فعال' : 'غیرفعال'}</span></td><td><button class="action" onclick="ToubaAuthUI.bannerModal('${esc(b.id)}')">ویرایش</button> <button class="action" onclick="toggleBanner('${esc(b.id)}')">${b.active ? 'غیرفعال کردن' : 'فعال کردن'}</button> <button class="action danger" onclick="deleteBanner('${esc(b.id)}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="6">بنری در پایگاه داده ثبت نشده است.</td></tr>');
        return;
      }

      if (section === 'homepage') {
        const h = (database && database.settings && database.settings.homepage) || {};
        target.innerHTML = `
        <div class="panel" style="max-width:700px">
          <h2 style="font-size:18px;margin-top:0">مدیریت محتوای صفحه اصلی (Hero & CMS)</h2>
          <div class="form-grid">
            <div class="field full"><label>عنوان بنر اصلی (Hero Title)</label><input id="cms-h-title" value="${esc(h.heroTitle || 'قدم‌هایی مطمئن با کفش طوبی')}"></div>
            <div class="field full"><label>متن زیرعنوان</label><textarea id="cms-h-text">${esc(h.heroText || 'کفش‌های شیک، راحت و بادوام')}</textarea></div>
            <div class="field"><label>متن دکمه اصلی</label><input id="cms-h-btn" value="${esc(h.heroButtonText || 'مشاهده محصولات')}"></div>
            <div class="field"><label>لینک دکمه</label><input id="cms-h-url" value="${esc(h.heroButtonUrl || '/shop')}"></div>
            <div class="field full"><label>آدرس تصویر بنر اصلی</label><input id="cms-h-img" value="${esc(h.heroImage || '/hero-shoe.jpg')}"></div>
            <div class="field full"><label>متن پاورقی (Footer)</label><input id="cms-h-foot" value="${esc(h.footerText || 'تمامی حقوق برای فروشگاه کفش طوبی محفوظ است.')}"></div>
          </div>
          <button class="btn" style="margin-top:16px" onclick="saveHomepageCMS()">ذخیره محتوا</button>
        </div>`;
        return;
      }

      if (section === 'payments') {
        const paymentsList = ((database && database.payments) || []).filter(payment => payment.provider === 'bitpay');
        let paymentStatus = { configured:false, paymentEnabled:false, apiKeyKind:'missing', apiKeyLength:0, minAmountToman:500, missingServerKeys:[] };
        try {
          const response = await fetch('/api/payment/bitpay/status', { cache:'no-store' });
          if (response.ok) paymentStatus = await response.json();
        } catch { /* status API may be unavailable when server payment settings are absent */ }
        const callbackUrl = paymentStatus.callbackUrl || `${g.location?.origin || ''}${paymentStatus.callbackPath || '/api/payment/bitpay/callback'}`;
        const paymentEnabled = Boolean(paymentStatus.paymentEnabled);
        target.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr;gap:24px;max-width:960px">
          <div class="panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
              <div><h2 style="font-size:18px;margin:0;color:#0f172a">BitPay · درگاه مستقیم بانکی بیت‌پی</h2><small style="color:#64748b">با <code>POST /payment/gateway-send</code> شناسهٔ درگاه ساخته می‌شود، مشتری با <code>GET /payment/gateway-&lt;id_get&gt;-get</code> به صفحهٔ بانک می‌رود و پرداخت فقط با <code>POST /payment/gateway-result-second</code> (وضعیت ۱) روی سرور نهایی می‌شود.</small></div>
              <span class="badge ${paymentEnabled ? 'green' : paymentStatus.configured ? 'orange' : 'red'}">${paymentEnabled ? '● فعال' : paymentStatus.configured ? '● پیکربندی شده' : '○ نیازمند تنظیم متغیرهای سرور'}</span>
            </div>
            <div class="form-grid">
              <div class="field"><label>درگاه</label><input readonly value="بیت‌پی (BitPay · bitpay.ir)"></div>
              <div class="field"><label>کلید API (مرچنت‌کد درگاه)</label><input readonly value="${esc(paymentStatus.apiKeyKind === 'malformed' ? 'قالب نادرست — طول فعلی ' + Number(paymentStatus.apiKeyLength || 0) + ' نویسه (باید ۵۲)؛ کلید پنل را عیناً با خط تیره کپی کنید' : paymentStatus.apiKeyKind === 'set' ? 'کلید ۵۲ کاراکتری پنل ثبت شده' : 'تنظیم نشده')}"></div>
              <div class="field"><label>وضعیت پرداخت</label><input readonly value="${paymentEnabled ? 'دریافت وجه فعال' : paymentStatus.configured ? 'پیکربندی شده' : 'پیکربندی نشده'}"></div>
              <div class="field"><label>حداقل مبلغ سفارش</label><input readonly dir="ltr" value="${Number(paymentStatus.minAmountToman || 500).toLocaleString('fa-IR')} تومان"></div>
              <div class="field full"><label>نشانی بازگشت از درگاه (دامنه‌اش باید در پنل بیت‌پی به‌عنوان «آدرس سایت» ثبت شده باشد)</label><input readonly dir="ltr" value="${esc(callbackUrl)}"></div>
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" type="button" onclick="ToubaAuthUI.checkBitPayStatus()">بررسی پیکربندی</button></div>
          </div>
          <div class="panel" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:16px;padding:22px">
            <h3 style="margin:0 0 10px">تنظیم امن در Vercel → Settings → Environment Variables</h3>
            <ul style="margin:0;padding-right:22px;line-height:1.9;color:#334155">
              <li><code>BITPAY_API_KEY</code> — کلید ۵۲ کاراکتری «بخش توسعه ← فعال‌سازی API» پنل بیت‌پی (مرچنت‌کد درگاه). این تنها روش احراز است و فقط سمت سرور استفاده می‌شود؛ با scope «Production» تنظیم و سپس Redeploy کنید.</li>
              <li>دامنهٔ دقیق سایت (همان <code>https://…</code> نهایی) باید در پنل بیت‌پی ثبت شده باشد؛ ناهماهنگی باعث خطای درگاه (کد ۴) می‌شود.</li>
              <li><code>SUPABASE_URL</code> و <code>SUPABASE_SERVICE_ROLE_KEY</code> — بدون آن‌ها پرداخت به سفارش متصل نمی‌شود؛ <code>SUPABASE_PUBLISHABLE_KEY</code> برای مرورگر است.</li>
              <li>فهرست کامل در <code>vercel.env.example</code> است؛ با <code>npm run vercel:env -- --project &lt;name&gt;</code> یک‌جا روی Vercel اعمال می‌شود (بدون چاپ مقدارها).</li>
            </ul>
            <p class="notice" style="margin:14px 0 0">مقادیر محرمانه را در پنل یا مرورگر وارد نکنید. پس از زدن دکمهٔ تسویه، مشتری مستقیماً به صفحهٔ رسمی بانک منتقل می‌شود؛ بازگشت او از صفحهٔ پرداخت هیچ‌گاه دلیل پرداخت نیست — تسویه فقط با استعلام سمت سرور (gateway-result-second) و با تطبیق مبلغ انجام می‌شود و مبلغ هرگز از مرورگر خوانده نمی‌شود.</p>
          </div>
          <div class="panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:24px">
            <h3 style="margin:0 0 14px;color:#0f172a">تراکنش‌های بیت‌پی (${paymentsList.length})</h3>
            ${paymentsList.length ? adminTable(['شناسه پرداخت','شماره سفارش','مبلغ (تومان)','درگاه','وضعیت','شناسهٔ تراکنش / شماره مرجع'], paymentsList.slice().reverse().map(p => `<tr><td><code>${esc(p.id)}</code></td><td><b>${esc(p.orderId || '—')}</b></td><td>${toman(p.amount || 0)}</td><td><span class="badge green">${p.provider === 'bitpay' ? 'بیت‌پی' : esc(p.provider || '—')}</span></td><td><span class="badge ${p.status === 'SUCCEEDED' ? 'green' : p.status === 'FAILED' ? 'red' : 'orange'}">${p.status === 'SUCCEEDED' ? 'پرداخت موفق' : p.status === 'FAILED' ? 'ناموفق' : 'در انتظار'}</span></td><td><code style="font-size:11px">${esc(p.referenceId || p.authority || '—')}</code></td></tr>`)) : '<div class="notice" style="margin:10px 0">هنوز تراکنشی در پایگاه داده ثبت نشده است.</div>'}
          </div>
        </div>`;;
        return;
      }

      if (section === 'settings') {
        const st = (database && database.settings) || {};
        target.innerHTML = `
        <div class="panel" style="max-width:700px">
          <h2 style="font-size:18px;margin-top:0">تنظیمات فروشگاه</h2>
          <div class="form-grid">
            <div class="field"><label>نام فروشگاه</label><input id="adm-set-name" value="${esc(st.storeName || 'کفش طوبی')}"></div>
            <div class="field"><label>شماره تماس پشتیبانی</label><input id="adm-set-phone" value="${esc(st.phone || '')}" placeholder="شمارهٔ واقعی پشتیبانی"></div>
            <div class="field full"><label>نشانی فروشگاه</label><input id="adm-set-address" value="${esc(st.address || '')}" placeholder="نشانی واقعی فروشگاه"></div>
            <div class="field"><label>هزینه ارسال عادی (تومان)</label><input id="adm-set-shipping" type="number" min="0" value="${Number(st.shipping ?? 0)}"></div>
            <div class="field"><label>هزینه ارسال سریع (تومان)</label><input id="adm-set-express" type="number" min="0" value="${Number(st.shippingOptions?.express ?? 0)}"></div>
            <div class="field"><label>حداقل خرید برای ارسال رایگان (تومان)</label><input id="adm-set-free" type="number" min="0" value="${Number(st.freeShipping ?? 0)}"></div>
            <div class="field full"><label>معرفی فروشگاه</label><textarea id="adm-set-about">${esc(st.about || '')}</textarea></div>
            <div class="field full"><label>توضیحات SEO</label><textarea id="adm-set-meta">${esc(st.metaDescription || '')}</textarea></div>
            <div class="field full" style="margin-top:6px"><b style="font-size:13px">نماد اعتماد الکترونیکی (اینماد)</b></div>
            <div class="field"><label>شناسهٔ نماد (id)</label><input id="adm-set-enamad-id" value="${esc(st.enamad?.id || '')}" placeholder="8043803" dir="ltr"></div>
            <div class="field"><label>کد لوگو (Code)</label><input id="adm-set-enamad-code" value="${esc(st.enamad?.code || '')}" placeholder="کد ۳۲ رقمی پنل اینماد" dir="ltr"></div>
            <div class="field full"><p class="muted" style="font-size:11.5px;margin:2px 0 0">این کد باید از پنل اینماد (بخش «دریافت لوگو») برای همین دامنهٔ سایت گرفته شود؛ با تغییر دامنه یا تمدید نماد، کد تازه را همین‌جا جایگزین کنید — بدون نیاز به تغییر کد سایت. خالی = مقدار پیش‌فرض فعلی.</p></div>
          </div>
          <button class="btn" style="margin-top:16px" onclick="saveStoreSettings()">ذخیره تنظیمات</button>
        </div>`;
        return;
      }

      if (section === 'media') {
        const medias = (database && database.media) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div>
            <h2 style="font-size:18px;margin:0">کتابخانه رسانه‌ها (${medias.length})</h2>
            <small style="color:#94a3b8">مدیریت تصاویر محصولات، بنرها و پس‌زمینه‌ها</small>
          </div>
          <button class="btn small" onclick="mediaAddModal()">＋ افزودن تصویر جدید</button>
        </div>
        <div class="media-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px">
          ${medias.map((m, i) => {
            const url = typeof m === 'string' ? m : (m.url || '/hero-shoe.jpg');
            const alt = typeof m === 'string' ? m : (m.alt || 'تصویر طوبی');
            const id = typeof m === 'string' ? i : (m.id || i);
            return `<div class="panel" style="background:rgba(8,22,14,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px">
              <img src="${esc(url)}" alt="${esc(alt)}" style="width:100%;height:130px;object-fit:cover;border-radius:8px" onerror="this.src='/product-shoes.jpg'">
              <p style="font-size:11px;color:#94a3b8;margin:0;word-break:break-all;line-height:1.4">${esc(alt)}</p>
              <code style="font-size:10px;color:#34d399;word-break:break-all;direction:ltr;background:rgba(0,0,0,0.3);padding:3px 6px;border-radius:4px">${esc(url)}</code>
              <div style="display:flex;gap:6px;margin-top:auto">
                <button class="action" style="flex:1" onclick="navigator.clipboard?.writeText('${esc(url)}');toast('آدرس کپی شد')">کپی URL</button>
                <button class="action danger" onclick="deleteMediaItem('${id}')">حذف</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
        return;
      }

      if (section === 'demo') {
        const prods = (database && database.products) || [];
        const ords = (database && database.orders) || [];
        const custs = (database && (database.users || database.customers)) || [];
        const state = g.DataProvider?.state || {};
        const ready = state.status === 'ready' && g.__TOUBA_DATABASE_READY === true;
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div>
            <h2 style="font-size:18px;margin:0">وضعیت پایگاه داده</h2>
            <small style="color:#94a3b8">کاتالوگ، مشتریان و عملیات فروشگاه از Supabase بارگذاری می‌شوند.</small>
          </div>
          <span class="badge ${ready?'green':'red'}" style="padding:6px 12px;font-size:12px">${ready?'● متصل و schema تأییدشده':'● نیازمند بررسی'}</span>
        </div>
        <div class="stats" style="margin-bottom:20px">
          <div class="stat-card"><span>محصولات پایگاه داده</span><b>${prods.length.toLocaleString('fa-IR')}</b><i>👟</i></div>
          <div class="stat-card"><span>سفارش‌های پایگاه داده</span><b>${ords.length.toLocaleString('fa-IR')}</b><i>📦</i></div>
          <div class="stat-card"><span>مشتریان و مدیران قابل‌دسترسی</span><b>${custs.length.toLocaleString('fa-IR')}</b><i>👥</i></div>
          <div class="stat-card"><span>نسخهٔ schema</span><b style="font-size:14px">${esc(state.schemaVersion||'—')}</b><i>🗄</i></div>
        </div>
        <div class="panel" style="padding:22px;margin-bottom:16px">
          <h3 style="margin-top:0;font-size:15px">همگام‌سازی و سلامت اتصال</h3>
          <p class="muted">آخرین دریافت: ${esc(state.loadedAt||'—')}</p>
          ${state.error?`<p class="notice error-notice">${esc(state.error.message||'خطای پایگاه داده')}</p>`:''}
          <p class="muted">ذخیره‌سازی snapshot مرورگر و داده‌های نمونه غیرفعال است. تغییرها پس از تأیید Supabase نمایش داده می‌شوند.</p>
          <button class="btn outline small" onclick="ToubaAuthUI.refreshDatabase()">به‌روزرسانی از پایگاه داده</button>
        </div>`;
        return;
      }
    } catch (err) {
      console.error('Error loading admin section:', err);
      target.innerHTML = `<div class="notice error-notice" style="margin:20px 0">خطا در بارگذاری بخش: ${esc(err?.message || 'مشکلی رخ داد')}</div>`;
    }
  }

  function switchAdminSection(section) {
    const validSection = Object.hasOwn(adminSections, section) ? section : 'dashboard';
    const targetUrl = '/admin?section=' + validSection;
    if (g.history?.pushState && (g.location.pathname + g.location.search) !== targetUrl) {
      g.history.pushState({ section: validSection }, '', targetUrl);
    }
    const navItems = g.document?.querySelectorAll ? g.document.querySelectorAll('.auth-admin-nav button, .auth-admin-nav a') : [];
    if (navItems && navItems.forEach) {
      navItems.forEach(link => {
        const isCurrent = link.getAttribute('data-section') === validSection;
        link.classList.toggle('active', isCurrent);
      });
    }
    const currentChip = g.document?.querySelector ? g.document.querySelector('#current-admin-section-name') : null;
    if (currentChip) {
      currentChip.textContent = adminSections[validSection] || 'نمای کلی';
    }
    closeAdminDrawer();
    const target = g.document?.querySelector ? g.document.querySelector('#admin-live-content') : null;
    if (target) {
      loadAdminSection(validSection);
    } else if (typeof g.render === 'function') {
      g.render();
    }
  }

  function toggleAdminDrawer() {
    const drawer = g.document?.querySelector ? g.document.querySelector('#admin-drawer') : null;
    const overlay = g.document?.querySelector ? g.document.querySelector('#admin-drawer-overlay') : null;
    const btn = g.document?.querySelector ? g.document.querySelector('.admin-hamburger-btn') : null;
    if (drawer) {
      const open = drawer.classList.toggle('drawer-open');
      if (overlay) overlay.classList.toggle('overlay-open', open);
      if (btn) btn.setAttribute('aria-expanded', String(open));
    }
  }

  function closeAdminDrawer() {
    const drawer = g.document?.querySelector ? g.document.querySelector('#admin-drawer') : null;
    const overlay = g.document?.querySelector ? g.document.querySelector('#admin-drawer-overlay') : null;
    const btn = g.document?.querySelector ? g.document.querySelector('.admin-hamburger-btn') : null;
    if (drawer) drawer.classList.remove('drawer-open');
    if (overlay) overlay.classList.remove('overlay-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  if (typeof g.addEventListener === 'function') {
    g.addEventListener('popstate', () => {
      if (g.location.pathname === '/admin' || g.location.pathname.startsWith('/admin/')) {
        const section = new URLSearchParams(g.location.search).get('section') || 'dashboard';
        const validSection = Object.hasOwn(adminSections, section) ? section : 'dashboard';
        const target = g.document?.querySelector ? g.document.querySelector('#admin-live-content') : null;
        if (target) {
          switchAdminSection(validSection);
        } else if (typeof g.render === 'function') {
          g.render();
        }
      } else if (typeof g.render === 'function') {
        g.render();
      }
    });
  }

  g.ToubaAuthUI = Object.freeze({
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    loadAdminSection,
    refreshDatabase,
    shippingLabelModal,
    copyShippingLabel,
    updateContactMessageStatus,
    bulkApplyProducts,
    bulkApplyCategories,
    checkBitPayStatus:g.checkBitPayStatus,
    selectAllCatalogRows,
    updateCatalogSelectionCount,
    switchAdminSection,
    toggleAdminDrawer,
    closeAdminDrawer,
    adminPage,
    quickAdminLogin,
    async signOut() {
      try { await auth.signOut(); } catch (e) {}
      setCurrentUser(null);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem('touba_admin_session'); } catch (e) {}
      }
      g.toast('از حساب خارج شدید.');
      g.go('/');
    }
  });

  g.switchAdminSection = switchAdminSection;
  g.toggleAdminDrawer = toggleAdminDrawer;
  g.closeAdminDrawer = closeAdminDrawer;
  g.admin = adminPage;
  g.adminPage = adminPage;
  g.loadAdminSection = loadAdminSection;

  g.login = authLogin;
  g.loginUser = function (form) { return signIn(form); };
  g.demoLogin = function () { g.toast('ورود نمایشی هنگام فعال‌بودن Supabase غیرفعال است؛ با حساب تأییدشده وارد شوید.'); };
  g.adminLogin = function () { return quickAdminLogin(); };
  g.logout = function () { return g.ToubaAuthUI.signOut(); };
  g.account = accountPage;
  g.ordersPage = ordersPage;

  // صفحهٔ انتظار پیش از رسیدن داده‌ها: انیمیشن برند (نه متن اخطار)، تا مشتری هنگام
  // بارگذاریِ اولِ سرورِ سردِ Vercel سایت را ترک نکند. خطای واقعی همچون گذشته fail-closed است.
  function dbLoadingScreen() {
    return `<main class="tb-load" role="status" aria-live="polite">
      <style>
        .tb-load{min-height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;background:#07110c;color:#e7f2dd;padding:24px}
        .tb-load .tb-orbit{position:relative;width:88px;height:88px;display:grid;place-items:center}
        .tb-load .tb-ring{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(140,173,75,.18);border-top-color:#a6c75e;animation:tb-spin .9s linear infinite}
        .tb-load .tb-leaf{font-size:32px;color:#a6c75e;animation:tb-bob 1.7s ease-in-out infinite}
        .tb-load h1{font-size:19px;margin:0;font-weight:700;color:#f2f8e9}
        .tb-load .tb-sub{margin:8px 0 0;font-size:12.5px;color:#9db38b;display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap}
        .tb-load .tb-dots i{display:inline-block;width:5px;height:5px;margin:0 2px;border-radius:50%;background:#a6c75e;animation:tb-jump 1s infinite}
        .tb-load .tb-dots i:nth-child(2){animation-delay:.15s}
        .tb-load .tb-dots i:nth-child(3){animation-delay:.3s}
        .tb-load .tb-cards{display:flex;gap:10px;width:min(680px,92vw)}
        .tb-load .tb-card{flex:1;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);overflow:hidden}
        .tb-load .tb-photo{height:62px;background:linear-gradient(90deg,rgba(166,199,94,.06) 25%,rgba(166,199,94,.17) 40%,rgba(166,199,94,.06) 65%);background-size:300%;animation:tb-shine 1.4s infinite}
        .tb-load .tb-line{height:8px;margin:9px 10px;border-radius:6px;background:rgba(255,255,255,.09);animation:tb-fade 1.2s ease-in-out infinite}
        .tb-load .tb-card .tb-line:last-child{width:58%;margin-bottom:12px}
        .tb-load .tb-retry{border:1px solid rgba(166,199,94,.3);background:none;color:#7d9070;font-size:11px;border-radius:999px;padding:6px 16px;transition:.2s}
        .tb-load .tb-retry:hover{color:#cfe8a8;border-color:#a6c75e}
        @keyframes tb-spin{to{transform:rotate(360deg)}}
        @keyframes tb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes tb-jump{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-5px);opacity:1}}
        @keyframes tb-fade{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes tb-shine{to{background-position:-150% 0}}
        @media (prefers-reduced-motion:reduce){.tb-load *{animation:none !important}}
      </style>
      <div class="tb-orbit"><span class="tb-ring" aria-hidden="true"></span><span class="tb-leaf" aria-hidden="true">❧</span></div>
      <div style="text-align:center">
        <h1>در حال آماده‌سازی ویترین…</h1>
        <p class="tb-sub">اطلاعات فروشگاه مستقیم و امن از Supabase خوانده می‌شود؛ صفحه با دریافت کامل تازه می‌شود <span class="tb-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
      </div>
      <div class="tb-cards" aria-hidden="true">${'<div class="tb-card"><div class="tb-photo"></div><div class="tb-line"></div><div class="tb-line"></div></div>'.repeat(4)}</div>
      <button type="button" class="tb-retry" onclick="location.reload()">اگر دیر شد، این را بزن</button>
    </main>`;
  }

  let __isAuthRendering = false;
  g.render = function () {
    if (__isAuthRendering) return;
    if (!g.__TOUBA_DATABASE_READY) {
      const app = g.document.querySelector?.('#app');
      const loading = g.DataProvider?.state?.status === 'loading' || g.DataProvider?.state?.status === 'disconnected' || (!g.DataProvider?.state?.status && !g.__TOUBA_DATABASE_ERROR && !g.DataProvider?.state?.error);
      const error = g.__TOUBA_DATABASE_ERROR || g.DataProvider?.state?.error;
      if (g.document.body?.classList) g.document.body.classList.remove('storefront-mode','admin-body','has-commerce-sticky');
      if (app) app.innerHTML = loading
        ? (g.document.getElementById?.('boot-splash') && !g.document.getElementById('boot-splash').dataset.out ? '' : dbLoadingScreen())
        : `<main class="page container"><section class="auth-card" role="alert" style="max-width:720px;text-align:center;margin:48px auto"><h1>فروشگاه موقتاً در دسترس نیست</h1><p class="muted">${esc(error?.message || 'اتصال یا آماده‌سازی پایگاه داده انجام نشد.')}</p><div class="notice" style="text-align:right">برای ادامه، تنظیمات Supabase و اجرای migrationهای عملیاتی پروژه را بررسی کنید. برنامه عمداً به دادهٔ Demo یا ذخیره‌سازی محلی برنمی‌گردد.</div><button class="btn" type="button" onclick="location.reload()">تلاش دوباره</button></section></main>`;
      return;
    }
    __isAuthRendering = true;
    try {
      const pathname = g.location.pathname;
      if (g.document.body?.classList) { if (pathname === '/admin' || pathname.startsWith('/admin/')) { g.document.body.classList.remove?.('storefront-mode'); g.document.body.classList.add?.('admin-body'); } else { g.document.body.classList.add?.('storefront-mode'); g.document.body.classList.remove?.('admin-body'); } g.document.body.classList.remove?.('has-commerce-sticky'); }
      if (g.document.body?.dataset) g.document.body.dataset.route = pathname;
      if (pathname === '/reset-password') {
        g.document.body.classList.remove('admin-body');
        g.document.querySelector('#app').innerHTML = passwordRecoveryPage();
        return;
      }
      if (pathname === '/login') {
        g.document.body.classList.remove('admin-body');
        g.document.querySelector('#app').innerHTML = authLogin();
        return;
      }
      if (pathname === '/account') {
        g.document.body.classList.remove('admin-body');
        g.document.querySelector('#app').innerHTML = accountPage();
        return;
      }
      if (pathname === '/account/orders') {
        g.document.body.classList.remove('admin-body');
        g.document.querySelector('#app').innerHTML = ordersPage();
        return;
      }
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        g.document.body.classList.remove('admin-body');
        g.document.querySelector('#app').innerHTML = adminPage();
        const section = new URLSearchParams(g.location.search).get('section') || 'dashboard';
        loadAdminSection(Object.hasOwn(adminSections, section) ? section : 'dashboard');
        return;
      }
      // Fully operational storefront and checkout flow
      if (typeof old.render === 'function') {
        return old.render();
      }
    } finally {
      const mainContent = g.document.querySelector?.('#app main');
      if (mainContent && !mainContent.id) mainContent.id = 'main-content';
      __isAuthRendering = false;
    }
  };

  const __singleLoaderRender = g.render;
  g.render = function () {
    __singleLoaderRender();
    const st = g.DataProvider?.state || {};
    const stillLoading = !g.__TOUBA_DATABASE_READY && (st.status === 'loading' || st.status === 'disconnected' || (!st.status && !g.__TOUBA_DATABASE_ERROR && !st.error));
    if (!stillLoading) g.toubaDismissBootSplash?.(); // one loader only: lift the splash once data is in (or failed)
  };

  (async function initializeApplication() {
    try {
      await auth.start();
      await g.DataProvider.load('toubashop-v1', getDb());
      if (auth.currentUser && new URLSearchParams(g.location.search).get('verified') === '1') {
        navigate(auth.currentUser.role === 'admin' || auth.currentUser.role === 'super_admin' ? '/admin' : '/account');
      } else {
        g.render();
      }
    } catch (error) {
      console.error('Supabase application initialization:', error);
      g.__TOUBA_DATABASE_ERROR = error;
      g.__TOUBA_DATABASE_READY = false;
      g.render();
    }
  })();

  if (g.location.pathname === '/reset-password' && g.supabase) {
    setTimeout(async () => {
      if (!auth.currentUser) return;
      try {
        const { data } = await auth.client.auth.getSession();
        if (data.session) { /* recovery session active */ }
      } catch (e) {}
    }, 0);
  }

  g.render();
})(window);

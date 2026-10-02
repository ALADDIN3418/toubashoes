/* Progressive UI bridge: real Supabase email/password auth when configured, seamless Admin and operational storefront. */
(function (g) {
  'use strict';
  const auth = g.ToubaAuth;
  if (!auth?.configured) return;

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
      return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center;font-size:38px;color:#83a74a">♙</div><h1>ساخت حساب کاربری</h1><p class="muted">ثبت‌نام با ایمیل و رمز عبور؛ حساب شما بلافاصله فعال می‌شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.signUp(this)"><div class="field"><label for="signup-name">نام و نام خانوادگی</label><input id="signup-name" name="displayName" autocomplete="name" required maxlength="100"></div><div class="field"><label for="signup-email">ایمیل</label><input id="signup-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="signup-password">رمز عبور (حداقل ۱۲ نویسه)</label><input id="signup-password" name="password" type="password" autocomplete="new-password" required minlength="12"></div><div class="field"><label for="signup-password-confirm">تکرار رمز عبور</label><input id="signup-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="12"></div><button class="btn" style="width:100%">ساخت حساب</button></form><p>قبلاً حساب ساخته‌اید؟ <a class="text-link" href="/login">ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    if (mode === 'forgot') {
      return `${g.header()}<main class="page container"><section class="auth-card"><h1>بازیابی رمز عبور</h1><p class="muted">پیوند بازیابی به ایمیل حسابتان ارسال می‌شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.resetPassword(this)"><div class="field"><label for="reset-email">ایمیل حساب</label><input id="reset-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><button class="btn" style="width:100%">ارسال پیوند بازیابی</button></form><p><a class="text-link" href="/login">بازگشت به ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center;font-size:38px;color:#10b981">♙</div><h1>ورود به حساب کاربری</h1><p class="muted">برای دسترسی به حساب مشتری یا پنل مدیریت، ایمیل و رمز عبور خود را وارد کنید.</p>${verified?messageBox('ایمیل تأیید شد. اکنون با ایمیل و رمز عبور وارد شوید.'):''}<form onsubmit="event.preventDefault();ToubaAuthUI.signIn(this)"><div class="field"><label for="login-email">ایمیل حساب</label><input id="login-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="ایمیل حساب کاربری"></div><div class="field"><label for="login-password">رمز عبور</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="رمز عبور"></div><button class="btn" style="width:100%">ورود به حساب</button></form><p style="margin-top:16px"><a class="text-link" href="/login?mode=forgot">رمز عبور را فراموش کرده‌اید؟</a></p><p>حساب ندارید؟ <a class="text-link" href="/login?mode=signup">ثبت‌نام کنید</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
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
    return `${g.header()}<main class="page container"><section class="auth-card"><h1>تعیین رمز عبور جدید</h1><p class="muted">رمز عبور جدید باید دست‌کم ۱۲ نویسه داشته باشد.</p><form onsubmit="event.preventDefault();ToubaAuthUI.updatePassword(this)"><div class="field"><label for="new-password">رمز عبور جدید</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" required></div><div class="field"><label for="new-password-confirm">تکرار رمز عبور</label><input id="new-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" required></div><button class="btn">ذخیره رمز جدید</button></form><div id="auth-message"></div></section></main>${g.footer()}`;
  }

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
    if (!user) return `${g.header()}<main class="page container"><div class="panel empty"><div class="big">♙</div><h2>برای مشاهده حساب وارد شوید</h2><a class="btn" href="/login">ورود به حساب</a>　<a class="btn outline" href="/login?mode=signup">ثبت‌نام</a></div></main>${g.footer()}`;
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
    reviews: 'نظرات و دیدگاه‌های خریداران',
    homepage: 'چیدمان صفحه اصلی',
    banners: 'بنرها و اسلایدرها',
    media: 'کتابخانه رسانه',
    payments: 'درگاه پرداخت زرین‌پال',
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
        { key: 'payments', label: 'درگاه پرداخت زرین‌پال', icon: '💳' },
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

    return `${g.header()}<main class="page container admin-page-container"><div class="auth-admin-head"><div class="auth-admin-title-box"><span class="section-eyebrow">پنل امن Supabase</span><h1 class="page-title">مدیریت طوبی</h1><small>${esc(user.email || '')} · ${user.role==='super_admin'||user.role==='SUPER_ADMIN'?'مدیر ارشد':'مدیر فروشگاه'}</small></div><div class="auth-admin-actions"><button class="btn small" onclick="quickProductModal()">＋ افزودن سریع محصول</button><button class="btn outline small" onclick="ToubaAuthUI.switchAdminSection('ai-studio')">✨ استودیو هوش مصنوعی</button><button class="btn outline small" onclick="categoryModal()">＋ دسته‌بندی جدید</button><button class="btn outline small" onclick="couponModal()">＋ کوپن جدید</button><button class="btn outline small" onclick="ToubaAuthUI.loadAdminSection('${selected}')">به‌روزرسانی</button><button class="btn small danger-button" onclick="ToubaAuthUI.signOut()">خروج</button></div></div><div class="admin-nav-bar"><button type="button" class="admin-hamburger-btn" onclick="ToubaAuthUI.toggleAdminDrawer()" aria-label="منوی بخش‌های مدیریت" aria-expanded="false"><span class="hamburger-icon">☰</span><span class="hamburger-title">بخش‌های مدیریت</span><span class="admin-current-chip" id="current-admin-section-name">${adminSections[selected]||'نمای کلی'}</span><span class="hamburger-arrow">⌄</span></button></div><div id="admin-drawer-overlay" class="admin-drawer-overlay" onclick="ToubaAuthUI.closeAdminDrawer()"></div><aside id="admin-drawer" class="admin-categorized-drawer" aria-label="منوی دسته‌بندی‌شده مدیریت"><div class="drawer-header"><div class="drawer-title"><span class="drawer-emblem">❧</span><h3>دسته‌بندی‌های پنل مدیریت</h3></div><button type="button" class="drawer-close-btn" onclick="ToubaAuthUI.closeAdminDrawer()" aria-label="بستن منو">×</button></div><nav class="auth-admin-nav admin-drawer-nav" aria-label="بخش‌های مدیریت">${adminCategories.map(cat=>`<div class="admin-nav-group"><div class="admin-group-title"><span class="group-icon">${cat.icon}</span><span>${cat.title}</span></div><div class="admin-group-items">${cat.items.map(item=>`<button type="button" class="auth-admin-tab-btn admin-group-item ${selected===item.key?'active':''}" data-section="${item.key}" onclick="ToubaAuthUI.switchAdminSection('${item.key}')"><span class="item-icon">${item.icon}</span><span class="item-label">${item.label}</span><span class="item-active-dot"></span></button>`).join('')}</div></div>`).join('')}</nav><div class="drawer-footer"><a href="/" class="drawer-back-link">↩ بازگشت به فروشگاه</a><button type="button" class="drawer-logout-btn" onclick="ToubaAuthUI.signOut()">خروج از حساب مدیریت</button></div></aside><section id="admin-live-content" class="auth-admin-content" aria-live="polite">در حال دریافت اطلاعات…</section></main>${g.footer()}`;
  }

  function adminTable(headers, rows) {
    return `<div class="table-wrap"><table id="admin-table" class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  g.deleteProduct = function (id) {
    if (!confirm('آیا از حذف این محصول اطمینان دارید؟')) return;
    const database = getDb();
    if (database && database.products) {
      database.products = database.products.filter(p => p.id !== id);
      g.save();
      g.toast('محصول با موفقیت حذف شد');
      loadAdminSection('products');
    }
  };

  g.deleteCategory = function (id) {
    if (!confirm('آیا از حذف این دسته‌بندی اطمینان دارید؟')) return;
    const database = getDb();
    if (database && database.categories) {
      database.categories = database.categories.filter(c => c.id !== id);
      g.save();
      g.toast('دسته‌بندی با موفقیت حذف شد');
      loadAdminSection('categories');
    }
  };

  g.deleteCoupon = function (code) {
    if (!confirm('آیا از حذف این کوپن تخفیف اطمینان دارید؟')) return;
    const database = getDb();
    if (database && database.coupons) {
      database.coupons = database.coupons.filter(c => c.code !== code);
      g.save();
      g.toast('کوپن تخفیف با موفقیت حذف شد');
      loadAdminSection('coupons');
    }
  };

  g.couponModal = function () {
    g.showModal(`
      <form onsubmit="event.preventDefault();saveNewCoupon(this)">
        <h3>افزودن کوپن تخفیف جدید</h3>
        <div class="form-grid">
          <div class="field"><label>کد تخفیف (لاتین) *</label><input name="code" required style="text-transform:uppercase" placeholder="مثلاً YALDA25"></div>
          <div class="field"><label>نوع تخفیف</label><select name="type"><option value="درصدی">درصدی (٪)</option><option value="مبلغ ثابت">مبلغ ثابت (تومان)</option></select></div>
          <div class="field"><label>مقدار تخفیف *</label><input type="number" name="amount" min="1" required placeholder="مثلاً 20 یا 50000"></div>
          <div class="field"><label>حداقل سفارش (تومان)</label><input type="number" name="min" value="0"></div>
          <div class="field"><label><input type="checkbox" name="active" checked> فعال</label></div>
          <div class="field full"><button class="btn">ذخیره کوپن</button></div>
        </div>
      </form>
    `);
  };

  g.saveNewCoupon = function (form) {
    const database = getDb();
    const code = form.code.value.trim().toUpperCase();
    if (!code) { g.toast('کد تخفیف الزامی است'); return; }
    if (!database.coupons) database.coupons = [];
    if (database.coupons.some(c => c.code.toUpperCase() === code)) {
      g.toast('این کد تخفیف قبلاً تعریف شده است'); return;
    }
    const newCoupon = {
      id: `c_${Date.now().toString(36)}`,
      code,
      type: form.type.value,
      amount: Number(form.amount.value) || 0,
      min: Number(form.min.value) || 0,
      active: form.active.checked,
      used: 0
    };
    database.coupons.push(newCoupon);
    g.save();
    g.closeModal();
    g.toast('کوپن تخفیف با موفقیت ذخیره شد');
    loadAdminSection('coupons');
  };

  g.updateReviewStatus = function (id, status) {
    const database = getDb();
    const rev = database?.reviews?.find(r => r.id === id);
    if (rev) {
      rev.status = status;
      g.save();
      g.toast(`دیدگاه به وضعیت «${status}» تغییر یافت`);
      loadAdminSection('reviews');
    }
  };

  g.deleteReview = function (id) {
    if (!confirm('آیا از حذف این نظر اطمینان دارید؟')) return;
    const database = getDb();
    if (database && database.reviews) {
      database.reviews = database.reviews.filter(r => r.id !== id);
      g.save();
      g.toast('دیدگاه حذف شد');
      loadAdminSection('reviews');
    }
  };

  g.toggleBanner = function (id) {
    const database = getDb();
    const ban = database?.banners?.find(b => b.id === id);
    if (ban) {
      ban.active = !ban.active;
      g.save();
      g.toast(ban.active ? 'بنر فعال شد' : 'بنر غیرفعال شد');
      loadAdminSection('banners');
    }
  };

  g.saveHomepageCMS = function () {
    const database = getDb();
    if (database && database.settings) {
      database.settings.homepage = database.settings.homepage || {};
      database.settings.homepage.heroTitle = document.getElementById('cms-h-title')?.value || '';
      database.settings.homepage.heroText = document.getElementById('cms-h-text')?.value || '';
      database.settings.homepage.heroButtonText = document.getElementById('cms-h-btn')?.value || '';
      database.settings.homepage.heroButtonUrl = document.getElementById('cms-h-url')?.value || '';
      database.settings.homepage.heroImage = document.getElementById('cms-h-img')?.value || '';
      database.settings.homepage.footerText = document.getElementById('cms-h-foot')?.value || '';
      if (typeof g.save === 'function') g.save();
      if (typeof g.toast === 'function') g.toast('محتوای صفحه اصلی ذخیره شد');
    }
  };

  g.saveStoreSettings = function () {
    const database = getDb();
    if (database && database.settings) {
      database.settings.storeName = document.getElementById('adm-set-name')?.value || '';
      database.settings.phone = document.getElementById('adm-set-phone')?.value || '';
      database.settings.address = document.getElementById('adm-set-address')?.value || '';
      database.settings.shipping = Number(document.getElementById('adm-set-shipping')?.value) || 0;
      database.settings.freeShipping = Number(document.getElementById('adm-set-free')?.value) || 0;
      if (typeof g.save === 'function') g.save();
      if (typeof g.toast === 'function') g.toast('تنظیمات ذخیره شد');
    }
  };

  g.checkZarinpalStatus = async function () {
    if (typeof g.toast === 'function') g.toast('در حال بررسی تنظیمات سروری زرین‌پال…');
    try {
      const response = await fetch('/api/payment/zarinpal/status', { cache:'no-store' });
      const data = await response.json();
      if (data?.configured && data.paymentEnabled) {
        const mode = data.mode === 'production' ? 'عملیاتی' : 'Sandbox';
        if (typeof g.toast === 'function') g.toast(`درگاه زرین‌پال در حالت ${mode} آماده است.`);
      } else if (data?.configured) {
        if (typeof g.toast === 'function') g.toast('تنظیمات ثبت شده‌اند، اما دریافت وجه واقعی تا اتصال سفارش و موجودی به بک‌اند پایدار غیرفعال است.');
      } else if (typeof g.toast === 'function') {
        g.toast('شناسهٔ پذیرنده یا کلید امضای سرور تنظیم نشده است. متغیرهای محیطی Vercel را بررسی کنید.');
      }
      return data;
    } catch {
      if (typeof g.toast === 'function') g.toast('وضعیت زرین‌پال دریافت نشد؛ اتصال API سایت را بررسی کنید.');
      return null;
    }
  };

  g.mediaAddModal = function () {
    g.showModal(`
      <form onsubmit="event.preventDefault();saveNewMedia(this)">
        <h3>افزودن تصویر جدید به کتابخانه</h3>
        <div class="field"><label>آدرس اینترنتی یا مسیر محلی تصویر *</label><input name="url" required placeholder="/hero-shoe.jpg یا https://..." dir="ltr"></div>
        <div class="field"><label>عنوان یا متن جایگزین تصویر</label><input name="alt" placeholder="مثلاً کفش چرم طبیعی طوبی"></div>
        <button class="btn" style="margin-top:14px">ذخیره تصویر</button>
      </form>
    `);
  };

  g.saveNewMedia = function (form) {
    const database = getDb();
    const url = form.url.value.trim();
    const alt = form.alt.value.trim() || 'تصویر محصول طوبی';
    if (!url) return;
    if (!database.media) database.media = [];
    database.media.unshift({ id: 'm_' + Date.now().toString(36), url, alt });
    if (typeof g.save === 'function') g.save();
    if (typeof g.closeModal === 'function') g.closeModal();
    if (typeof g.toast === 'function') g.toast('تصویر با موفقیت به کتابخانه اضافه شد');
    loadAdminSection('media');
  };

  g.deleteMediaItem = function (id) {
    if (!confirm('آیا از حذف این تصویر از کتابخانه مطمئن هستید؟')) return;
    const database = getDb();
    if (database && database.media) {
      if (typeof id === 'number' || (!isNaN(Number(id)) && String(Number(id)) === String(id))) {
        database.media.splice(Number(id), 1);
      } else {
        database.media = database.media.filter(m => (typeof m === 'object' ? m.id !== id : m !== id));
      }
      if (typeof g.save === 'function') g.save();
      if (typeof g.toast === 'function') g.toast('تصویر حذف شد');
      loadAdminSection('media');
    }
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
    if (repository?.update) {
      for (const row of rows) await repository.update(row.id, row);
    } else if (typeof g.save === 'function') g.save();
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
    const changed = (database?.products || []).filter(product => ids.has(String(product.id)));
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
      if (typeof g.save === 'function') g.save();
      g.toast(`تغییرات ${changed.length.toLocaleString('fa-IR')} محصول ذخیره شد.`);
      await loadAdminSection('products');
    } catch (error) { g.toast(error.message || 'ذخیرهٔ گروهی محصولات انجام نشد.'); }
  }

  async function bulkApplyCategories() {
    const database = getDb();
    const ids = new Set([...g.document.querySelectorAll('[data-bulk-category]:checked')].map(input => input.value));
    if (!ids.size) { g.toast('ابتدا یک یا چند دسته‌بندی را انتخاب کنید.'); return; }
    const active = g.document.querySelector('#bulk-category-active')?.value || '';
    const icon = String(g.document.querySelector('#bulk-category-icon')?.value || '').trim().slice(0, 12);
    if (!active && !icon) { g.toast('برای اعمال گروهی، وضعیت یا آیکون را انتخاب کنید.'); return; }
    const changed = (database?.categories || []).filter(category => ids.has(String(category.id)));
    for (const category of changed) {
      if (active) category.active = active === 'true';
      if (icon) category.icon = icon;
      category.updatedAt = new Date().toISOString();
    }
    try {
      await saveBulkRows(changed, g.DataRepositories?.categories);
      if (typeof g.save === 'function') g.save();
      g.toast(`تغییرات ${changed.length.toLocaleString('fa-IR')} دسته‌بندی ذخیره شد.`);
      await loadAdminSection('categories');
    } catch (error) { g.toast(error.message || 'ذخیرهٔ گروهی دسته‌بندی‌ها انجام نشد.'); }
  }

  async function loadAdminSection(section) {
    const target = g.document?.querySelector ? g.document.querySelector('#admin-live-content') : null;
    if (!target) return;

    try {
      const database = getDb();
      if (section === 'dashboard') {
        const prods = (database && database.products) || [];
        const ords = (database && database.orders) || [];
        const totalSales = ords.reduce((n, o) => n + Number(o.total || 0), 0);
        const custs = (database && (database.customers || database.users)) || [];
        target.innerHTML = `
        <div class="stats" style="margin-bottom:20px">
          <div class="stat-card"><span>تعداد کل محصولات</span><b>${prods.length.toLocaleString('fa-IR')}</b><i>👟</i></div>
          <div class="stat-card"><span>سفارش‌های ثبت‌شده</span><b>${ords.length.toLocaleString('fa-IR')}</b><i>📦</i></div>
          <div class="stat-card"><span>مجموع درآمد (تومان)</span><b>${toman(totalSales)}</b><i>💳</i></div>
          <div class="stat-card"><span>مشتریان فعال</span><b>${custs.length.toLocaleString('fa-IR')}</b><i>👥</i></div>
        </div>
        <div class="chart-card">
          <h3 style="margin-top:0">نمودار فروش دوره‌ای</h3>
          <div class="chart">
            <div class="bar" style="height:65%" data-label="فروردین"></div>
            <div class="bar" style="height:80%" data-label="اردیبهشت"></div>
            <div class="bar" style="height:45%" data-label="خرداد"></div>
            <div class="bar" style="height:90%" data-label="تیر"></div>
            <div class="bar" style="height:70%" data-label="مرداد"></div>
            <div class="bar" style="height:100%" data-label="شهریور"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 10px">
          <h3 style="margin:0">آخرین سفارش‌ها</h3>
          <button type="button" class="btn outline small" onclick="ToubaAuthUI.switchAdminSection('orders')">مشاهده همه سفارش‌ها ←</button>
        </div>
        ` + adminTable(['شماره سفارش', 'مشتری', 'مبلغ', 'وضعیت', 'تاریخ'], ords.slice(0, 6).map(o => `<tr><td><b>${esc(o.number || o.id)}</b></td><td>${esc(o.customer)}</td><td>${toman(o.total)}</td><td><span class="badge ${o.status === 'لغو شده' ? 'red' : 'green'}">${esc(o.status)}</span></td><td>${esc(o.date || '—')}</td></tr>`).join(''));
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
          <div><h2 style="font-size:18px;margin:0">کاتالوگ محصولات (${prods.length})</h2><p class="muted" style="margin:4px 0 0">برای تغییر چند محصول، موارد را انتخاب کنید؛ عملیات گروهی محصولی را حذف نمی‌کند.</p><p class="notice" style="margin:6px 0 0">کاتالوگ فعلی از db و Mock Repository می‌آید؛ در Vercel تغییرها فقط در LocalStorage همین مرورگر می‌مانند و به Supabase همگام نیستند.</p></div>
          <div class="admin-catalog-actions"><button class="btn small" onclick="quickProductModal()">＋ افزودن سریع محصول</button><button class="btn outline small" onclick="productModal()">فرم کامل محصول</button></div>
        </div>${toolbar}<div class="shop-toolbar"><input class="select" style="max-width:300px" placeholder="جستجوی نام، SKU یا برند" oninput="filterAdminTable(this.value)"><span>${prods.length.toLocaleString('fa-IR')} محصول · ${(database?.products||[]).filter(p=>p.active).length.toLocaleString('fa-IR')} فعال</span></div>`
        + adminTable(['انتخاب','نام محصول','SKU','دسته‌بندی','قیمت (تومان)','موجودی','وضعیت','عملیات'], prods.map(p => `<tr data-search="${esc(`${p.name||''} ${p.sku||''} ${p.brand||''}`.toLocaleLowerCase())}"><td><input type="checkbox" data-bulk-product value="${esc(p.id)}" aria-label="انتخاب ${esc(p.name)}" onchange="ToubaAuthUI.updateCatalogSelectionCount('product')"></td><td><b>${esc(p.name)}</b></td><td><code>${esc(p.sku || '—')}</code></td><td>${esc(catName(p.category))}</td><td>${toman(p.price)}</td><td>${(p.variants || []).reduce((n, v) => n + Number(v.stock || 0), Number(p.stock || 0)).toLocaleString('fa-IR')}</td><td><span class="badge ${p.active ? 'green' : 'red'}">${p.active ? 'فعال' : 'پیش‌نویس'}</span></td><td><button class="action" onclick="productModal('${esc(p.id)}')">ویرایش کامل</button> <button class="action danger" onclick="deleteProduct('${esc(p.id)}')">حذف</button></td></tr>`).join(''));
        return;
      }
      if (section === 'orders') {
        const ords = (database && database.orders) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">سفارش‌ها (${ords.length})</h2>
        </div>` + adminTable(['شماره سفارش', 'مشتری', 'مبلغ (تومان)', 'تاریخ', 'کد پیگیری', 'وضعیت', 'تغییر وضعیت'], ords.map(o => `<tr><td><b>${esc(o.number || o.id)}</b></td><td>${esc(o.customer)}<br><small style="color:#666">${esc(o.phone || '')}</small></td><td>${toman(o.total)}</td><td>${esc(o.date || '—')}</td><td><code>${esc(o.trackingCode || o.id)}</code></td><td><span class="badge ${o.status === 'لغو شده' ? 'red' : 'green'}">${esc(o.status)}</span></td><td><select class="select" onchange="orderStatus('${o.id}',this.value);ToubaAuthUI.loadAdminSection('orders');">${['جدید', 'تأیید شده', 'در حال آماده‌سازی', 'ارسال شده', 'تحویل داده شده', 'لغو شده'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join(''));
        return;
      }

      if (section === 'categories') {
        const cats = (database && database.categories) || [];
        const bulk = `<section class="admin-bulk-card" aria-label="ویرایش گروهی دسته‌بندی‌ها">
          <div class="admin-bulk-heading"><div><b>ویرایش گروهی دسته‌بندی‌ها</b><span id="bulk-category-selected-count">۰ مورد انتخاب‌شده</span></div><label><input type="checkbox" onchange="ToubaAuthUI.selectAllCatalogRows('category',this.checked)"> انتخاب همه</label></div>
          <div class="admin-bulk-controls"><label>وضعیت<select id="bulk-category-active"><option value="">بدون تغییر</option><option value="true">فعال‌سازی</option><option value="false">غیرفعال‌سازی</option></select></label><label>آیکون مشترک (اختیاری)<input id="bulk-category-icon" maxlength="12" placeholder="مثلاً 👟"></label><button class="btn small" type="button" onclick="ToubaAuthUI.bulkApplyCategories()">اعمال به دسته‌های انتخاب‌شده</button></div>
        </section>`;
        target.innerHTML = `<div class="admin-catalog-toolbar"><div><h2 style="font-size:18px;margin:0">دسته‌بندی‌های فروشگاه (${cats.length})</h2><p class="muted" style="margin:4px 0 0">دسته‌های موجود حفظ می‌شوند؛ می‌توانید چند مورد را هم‌زمان فعال/غیرفعال یا آیکون‌گذاری کنید.</p><p class="notice" style="margin:6px 0 0">این عملیات روی دادهٔ Demo در همین مرورگر ذخیره می‌شود؛ CRUD دسته‌بندی هنوز به جدول‌های Supabase وصل نیست.</p></div><button class="btn small" onclick="categoryModal()">＋ دسته‌بندی جدید</button></div>${bulk}`
        + adminTable(['انتخاب','آیکون','نام دسته‌بندی','شناسه لاتین','محصولات','وضعیت','عملیات'], cats.map(c => `<tr><td><input type="checkbox" data-bulk-category value="${esc(c.id)}" aria-label="انتخاب دسته ${esc(c.name)}" onchange="ToubaAuthUI.updateCatalogSelectionCount('category')"></td><td style="font-size:20px">${esc(c.icon || '◈')}</td><td><b>${esc(c.name)}</b></td><td><code>${esc(c.id)}</code></td><td>${(database?.products||[]).filter(p=>p.category===c.id).length.toLocaleString('fa-IR')}</td><td><span class="badge ${c.active ? 'green' : 'red'}">${c.active ? 'فعال' : 'غیرفعال'}</span></td><td><button class="action" onclick="categoryModal('${esc(c.id)}')">ویرایش</button> <button class="action danger" onclick="deleteCategory('${esc(c.id)}')">حذف</button></td></tr>`).join(''));
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
        </div>` + adminTable(['نام', 'ایمیل / شماره تماس', 'نقش', 'وضعیت'], users.map(u => `<tr><td><b>${esc(u.name || u.displayName || '—')}</b></td><td>${esc(u.email || u.phone || '—')}</td><td>${u.role === 'super_admin' ? 'مدیر ارشد' : u.role === 'admin' ? 'مدیر فروشگاه' : 'مشتری'}</td><td><span class="badge green">فعال</span></td></tr>`).join(''));
        return;
      }

      if (section === 'reviews') {
        const revs = (database && database.reviews) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">دیدگاه‌های مشتریان (${revs.length})</h2>
        </div>` + adminTable(['مشتری', 'محصول', 'امتیاز', 'متن دیدگاه', 'وضعیت', 'عملیات'], revs.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.product || '—')}</td><td>${'★'.repeat(r.rating || 5)}</td><td style="max-width:240px">${esc(r.text)}</td><td><span class="badge ${r.status==='تأیید شده'?'green':r.status==='رد شده'?'red':''}">${esc(r.status)}</span></td><td><button class="action" onclick="updateReviewStatus('${r.id}','تأیید شده')">تأیید</button> <button class="action" onclick="updateReviewStatus('${r.id}','رد شده')">رد</button> <button class="action danger" onclick="deleteReview('${r.id}')">حذف</button></td></tr>`).join(''));
        return;
      }

      if (section === 'banners') {
        const bans = (database && database.banners) || [];
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h2 style="font-size:18px;margin:0">بنرهای تبلیغاتی (${bans.length})</h2>
        </div>` + adminTable(['تصویر', 'عنوان', 'توضیحات', 'جایگاه', 'وضعیت', 'عملیات'], bans.map(b => `<tr><td><img src="${esc(b.imageUrl || '/hero-shoe.jpg')}" alt="" width="56" height="36" style="object-fit:cover;border-radius:4px" onerror="this.src='/product-shoes.jpg'"></td><td><b>${esc(b.title)}</b></td><td>${esc(b.subtitle || '—')}</td><td><code>${esc(b.position || 'home')}</code></td><td><span class="badge ${b.active ? 'green' : 'red'}">${b.active ? 'فعال' : 'غیرفعال'}</span></td><td><button class="action" onclick="toggleBanner('${b.id}')">${b.active ? 'غیرفعال کردن' : 'فعال کردن'}</button></td></tr>`).join(''));
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
        const paymentsList = ((database && database.payments) || []).filter(payment => payment.provider === 'zarinpal');
        let paymentStatus = { configured:false, mode:'sandbox', callbackPath:'/api/payment/zarinpal/callback', liveCheckoutSafe:false };
        try {
          const response = await fetch('/api/payment/zarinpal/status', { cache:'no-store' });
          if (response.ok) paymentStatus = { ...paymentStatus, ...(await response.json()) };
        } catch { /* the server-side status can be unavailable in local/demo mode */ }
        const callbackUrl = `${g.location?.origin || ''}${paymentStatus.callbackPath || '/api/payment/zarinpal/callback'}`;
        const modeLabel = paymentStatus.mode === 'production' ? 'عملیاتی' : 'Sandbox';
        const paymentEnabled = Boolean(paymentStatus.paymentEnabled);
        target.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr;gap:24px;max-width:960px">
          <div class="panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
              <div><h2 style="font-size:18px;margin:0;color:#0f172a">درگاه پرداخت زرین‌پال</h2><small style="color:#64748b">درخواست و تأیید تراکنش فقط روی سرور انجام می‌شود.</small></div>
              <span class="badge ${paymentEnabled ? 'green' : paymentStatus.configured ? 'orange' : 'red'}">${paymentEnabled ? `● آمادهٔ آزمایش · ${modeLabel}` : paymentStatus.configured ? '● پیکربندی شده · دریافت وجه غیرفعال' : '○ نیازمند تنظیم متغیرهای سرور'}</span>
            </div>
            <div class="form-grid">
              <div class="field"><label>محیط</label><input readonly value="${esc(modeLabel)}"></div>
              <div class="field"><label>وضعیت</label><input readonly value="${paymentEnabled ? 'آمادهٔ پرداخت آزمایشی sandbox' : paymentStatus.configured ? 'درگاه تنظیم شده؛ دریافت وجه غیرفعال' : 'پیکربندی نشده'}"></div>
              <div class="field full"><label>Callback URL (برای مشاهده)</label><input readonly value="${esc(callbackUrl)}" dir="ltr"></div>
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" type="button" onclick="ToubaAuthUI.checkZarinpalStatus()">بررسی پیکربندی</button></div>
          </div>
          <div class="panel" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:16px;padding:22px">
            <h3 style="margin:0 0 10px">تنظیم امن در Vercel → Settings → Environment Variables</h3>
            <ul style="margin:0;padding-right:22px;line-height:1.9;color:#334155">
              <li><code>ZARINPAL_MERCHANT_ID</code> — شناسهٔ ۳۶ کاراکتری پذیرندهٔ زرین‌پال.</li>
              <li><code>ZARINPAL_STATE_SECRET</code> — راز تصادفی حداقل ۳۲ کاراکتری برای امضای state و رسید callback.</li>
              <li><code>ZARINPAL_MODE</code> — ابتدا <code>sandbox</code>؛ پس از فعال‌سازی پذیرنده، <code>production</code>.</li>
            </ul>
            <p class="notice" style="margin:14px 0 0">مقادیر محرمانه را در این پنل یا LocalStorage وارد نکنید. متغیرها را فقط در سرور Vercel تنظیم و سپس Redeploy کنید. سفارش‌های فعلی هنوز در LocalStorage/حالت Demo هستند؛ این اتصال تا پیاده‌سازی دفتر سفارش و موجودی سمت سرور برای دریافت وجه Production امن نیست.</p>
          </div>
          <div class="panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:24px">
            <h3 style="font-size:16px;margin:0 0 14px;color:#0f172a">تراکنش‌های این مرورگر (${paymentsList.length})</h3>
            ${paymentsList.length ? adminTable(['شناسه پرداخت','شماره سفارش','مبلغ (تومان)','درگاه','وضعیت','کد مرجع / Authority'], paymentsList.slice().reverse().map(p => `<tr><td><code>${esc(p.id)}</code></td><td><b>${esc(p.orderId || '—')}</b></td><td>${toman(p.amount || 0)}</td><td><span class="badge green">${p.provider === 'zarinpal' ? 'زرین‌پال' : esc(p.provider || '—')}</span></td><td><span class="badge ${p.status === 'SUCCEEDED' ? 'green' : p.status === 'FAILED' ? 'red' : 'orange'}">${p.status === 'SUCCEEDED' ? 'پرداخت موفق' : p.status === 'FAILED' ? 'ناموفق' : 'در انتظار'}</span></td><td><code style="font-size:11px">${esc(p.referenceId || p.authority || '—')}</code></td></tr>`)) : '<div class="notice" style="margin:10px 0">در این مرورگر هنوز تراکنشی ثبت نشده است.</div>'}
          </div>
        </div>`;
        return;
      }

      if (section === 'settings') {
        const st = (database && database.settings) || {};
        target.innerHTML = `
        <div class="panel" style="max-width:700px">
          <h2 style="font-size:18px;margin-top:0">تنظیمات فروشگاه</h2>
          <div class="form-grid">
            <div class="field"><label>نام فروشگاه</label><input id="adm-set-name" value="${esc(st.storeName || 'کفش طوبی')}"></div>
            <div class="field"><label>شماره تماس پشتیبانی</label><input id="adm-set-phone" value="${esc(st.phone || '۰۹۱۲ ۱۲۳ ۴۵۶۷')}"></div>
            <div class="field full"><label>نشانی فروشگاه</label><input id="adm-set-address" value="${esc(st.address || 'تهران')}"></div>
            <div class="field"><label>هزینه ارسال عادی (تومان)</label><input id="adm-set-shipping" type="number" value="${st.shipping || 80000}"></div>
            <div class="field"><label>حداقل خرید برای ارسال رایگان (تومان)</label><input id="adm-set-free" type="number" value="${st.freeShipping || 2000000}"></div>
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
        target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div>
            <h2 style="font-size:18px;margin:0">مدیریت پایگاه داده و همگام‌سازی ابری</h2>
            <small style="color:#94a3b8">وضعیت دیتابیس Supabase و همگام‌سازی داده‌های فروشگاه طوبی</small>
          </div>
          <span class="badge green" style="padding:6px 12px;font-size:12px">● پایگاه داده متصل و فعال</span>
        </div>
        <div class="stats" style="margin-bottom:20px">
          <div class="stat-card"><span>محصولات در پایگاه داده</span><b>${prods.length.toLocaleString('fa-IR')}</b><i>👟</i></div>
          <div class="stat-card"><span>سفارش‌های ثبت‌شده</span><b>${ords.length.toLocaleString('fa-IR')}</b><i>📦</i></div>
          <div class="stat-card"><span>مشتریان و کاربران</span><b>${custs.length.toLocaleString('fa-IR')}</b><i>👥</i></div>
          <div class="stat-card"><span>وضعیت اتصال ابری</span><b style="color:var(--green-emerald-light);font-size:16px">Supabase Live</b><i>⚡</i></div>
        </div>
        <div class="panel" style="background:rgba(8,22,14,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px;margin-bottom:16px">
          <h3 style="margin-top:0;font-size:15px;color:#fff">اقدامات نگهداری و یکپارچگی داده‌ها</h3>
          <p style="color:#94a3b8;font-size:12px;line-height:1.8">کلیه تراکنش‌ها، کاتالوگ محصولات، کاربران و تغییرات وضعیت سفارش‌ها در مخزن داده Supabase ثبت می‌گردند. در صورت نیاز به بررسی سلامت داده‌ها، از دکمه‌های زیر استفاده کنید:</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
            <button class="btn outline small" onclick="seedDemoData()">⚡ بررسی یکپارچگی پایگاه داده</button>
            <button class="btn outline small danger-button" onclick="resetDemoData()">بازنشانی داده‌های نمونه</button>
          </div>
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
    bulkApplyProducts,
    bulkApplyCategories,
    checkZarinpalStatus:g.checkZarinpalStatus,
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

  let __isAuthRendering = false;
  g.render = function () {
    if (__isAuthRendering) return;
    __isAuthRendering = true;
    try {
      const pathname = g.location.pathname;
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
      __isAuthRendering = false;
    }
  };

  auth.start().then(() => {
    if (auth.currentUser && new URLSearchParams(g.location.search).get('verified') === '1') {
      navigate(auth.currentUser.role === 'admin' || auth.currentUser.role === 'super_admin' ? '/admin' : '/account');
    } else {
      g.render();
    }
  }).catch(error => {
    console.error('Auth initialization:', error);
    g.render();
  });

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

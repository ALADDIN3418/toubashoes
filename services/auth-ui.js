/* Progressive UI bridge: real Supabase email/password auth when configured, existing Demo otherwise. */
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

  function messageBox(text, kind = 'notice') {
    return `<div class="${kind}" role="status" aria-live="polite">${g.esc(text)}</div>`;
  }

  function authLogin() {
    const mode = new URLSearchParams(g.location.search).get('mode') || 'login';
    const verified = new URLSearchParams(g.location.search).get('verified') === '1';
    if (mode === 'signup') {
      return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center;font-size:38px;color:#83a74a">♙</div><h1>ساخت حساب کاربری</h1><p class="muted">ثبت‌نام با ایمیل و رمز عبور؛ نقش حساب جدید همیشه مشتری است.</p><form onsubmit="event.preventDefault();ToubaAuthUI.signUp(this)"><div class="field"><label for="signup-name">نام و نام خانوادگی</label><input id="signup-name" name="displayName" autocomplete="name" required maxlength="100"></div><div class="field"><label for="signup-email">ایمیل</label><input id="signup-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="signup-password">رمز عبور (حداقل ۱۲ نویسه)</label><input id="signup-password" name="password" type="password" autocomplete="new-password" required minlength="12"></div><div class="field"><label for="signup-password-confirm">تکرار رمز عبور</label><input id="signup-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="12"></div><button class="btn" style="width:100%">ساخت حساب</button></form><p>قبلاً حساب ساخته‌اید؟ <a class="text-link" href="/login">ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    if (mode === 'forgot') {
      return `${g.header()}<main class="page container"><section class="auth-card"><h1>بازیابی رمز عبور</h1><p class="muted">پیوند بازیابی به ایمیل حسابتان ارسال می‌شود.</p><form onsubmit="event.preventDefault();ToubaAuthUI.resetPassword(this)"><div class="field"><label for="reset-email">ایمیل حساب</label><input id="reset-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><button class="btn" style="width:100%">ارسال پیوند بازیابی</button></form><p><a class="text-link" href="/login">بازگشت به ورود</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
    }
    return `${g.header()}<main class="page container"><section class="auth-card"><div style="text-align:center;font-size:38px;color:#83a74a">♙</div><h1>ورود به حساب کاربری</h1><p class="muted">با ایمیل و رمز عبورتان وارد شوید.</p>${verified?messageBox('ایمیل تأیید شد. اکنون با ایمیل و رمز عبور وارد شوید.'):''}<form onsubmit="event.preventDefault();ToubaAuthUI.signIn(this)"><div class="field"><label for="login-email">ایمیل</label><input id="login-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="login-password">رمز عبور</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div><button class="btn" style="width:100%">ورود</button></form><p><a class="text-link" href="/login?mode=forgot">رمز عبور را فراموش کرده‌اید؟</a></p><p>حساب ندارید؟ <a class="text-link" href="/login?mode=signup">ثبت‌نام کنید</a></p><div id="auth-message"></div></section></main>${g.footer()}`;
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

  async function signIn(form) {
    const data = new FormData(form);
    return runForm(form, async () => {
      await auth.signIn({ email: data.get('email'), password: data.get('password') });
      g.go('/account');
      return true;
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
      if (result.confirmationRequired) return 'حساب ساخته شد. برای فعال‌کردن آن، پیوند تأیید ارسال‌شده به ایمیل را باز کنید؛ پوشهٔ Spam را هم بررسی کنید.';
      g.go('/account');
      return 'حساب ساخته شد؛ در حال انتقال به حساب کاربری…';
    });
  }

  async function resetPassword(form) {
    const data = new FormData(form);
    return runForm(form, () => auth.sendPasswordReset(data.get('email')), () => 'اگر این ایمیل در سامانه ثبت شده باشد، پیام بازیابی ارسال می‌شود. پوشهٔ Spam را هم بررسی کنید.');
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
      g.go('/account');
      return true;
    }, () => 'رمز عبور تغییر کرد؛ در حال انتقال…');
  }

  function accountPage() {
    const user = auth.currentUser;
    if (!user) return `${g.header()}<main class="page container"><div class="panel empty"><div class="big">♙</div><h2>برای مشاهده حساب وارد شوید</h2><a class="btn" href="/login">ورود به حساب</a>　<a class="btn outline" href="/login?mode=signup">ثبت‌نام</a></div></main>${g.footer()}`;
    return `${g.header()}<main class="page container"><h1 class="page-title">حساب کاربری</h1><div class="checkout-layout"><section class="panel"><h3>اطلاعات حساب</h3><p>نام: ${g.esc(user.name || '—')}</p><p>ایمیل: ${g.esc(user.email)}</p><p>شماره تماس: ${g.esc(user.phone || '—')}</p><p>نوع حساب: مشتری</p><button class="btn outline small" onclick="ToubaAuthUI.signOut()">خروج امن</button></section><section class="panel"><h3>سفارش‌ها</h3><p>ورود و پروفایل به Supabase Auth متصل است؛ ثبت سفارش و نمایش سفارش‌های واقعی هنوز فعال نشده است.</p><a class="text-link" href="/account/orders">وضعیت سفارش‌ها ←</a></section></div></main>${g.footer()}`;
  }

  function ordersPage() {
    if (!auth.currentUser) return `${g.header()}<main class="page container"><div class="panel empty"><h2>برای مشاهده سفارش‌ها وارد شوید</h2><a class="btn" href="/login">ورود</a></div></main>${g.footer()}`;
    return `${g.header()}<main class="page container"><div class="breadcrumb"><a href="/account">حساب کاربری</a>　/　سفارش‌ها</div><h1 class="page-title">سفارش‌های من</h1><div class="notice">سفارش‌های فروشگاه هنوز به Supabase متصل نشده‌اند؛ هیچ سفارش Mockای به‌عنوان سفارش واقعی نمایش داده نمی‌شود.</div></main>${g.footer()}`;
  }

  function unavailable(title, explanation) {
    return `${g.header()}<main class="page container"><section class="auth-card"><h1>${g.esc(title)}</h1>${messageBox(explanation)}<p>تا تکمیل کاتالوگ، ثبت تراکنشی سفارش و تأیید درگاه، ثبت سفارش واقعی غیرفعال نگه داشته شده است.</p><a class="btn" href="/shop">بازگشت به فروشگاه</a></section></main>${g.footer()}`;
  }

  g.ToubaAuthUI = Object.freeze({ signIn, signUp, resetPassword, updatePassword, async signOut() {
    try { await auth.signOut(); g.toast('از حساب خارج شدید.'); g.go('/'); }
    catch (error) { g.toast(auth.publicError(error)); }
  } });

  g.login = authLogin;
  g.loginUser = function (form) { return signIn(form); };
  g.demoLogin = function () { g.toast('ورود نمایشی در حالت Supabase غیرفعال است.'); };
  g.adminLogin = function () { g.toast('ورود مدیر نمایشی غیرفعال است؛ حساب مدیر باید از Supabase Auth تأیید شود.'); };
  g.logout = function () { return g.ToubaAuthUI.signOut(); };
  g.account = accountPage;
  g.ordersPage = ordersPage;
  g.render = function () {
    const pathname = g.location.pathname;
    if (pathname === '/reset-password') {
      g.document.body.classList.remove('admin-body');
      g.document.querySelector('#app').innerHTML = passwordRecoveryPage();
      return;
    }
    if (pathname === '/admin') {
      g.document.body.classList.remove('admin-body');
      g.document.querySelector('#app').innerHTML = unavailable('پنل مدیریت آماده نیست', 'احراز هویت مشتری به Supabase متصل است؛ CRUD محصولات، موجودی و سفارش‌های پنل هنوز به API امن متصل نشده‌اند.');
      return;
    }
    if (pathname === '/checkout' || pathname.startsWith('/payment/')) {
      g.document.body.classList.remove('admin-body');
      g.document.querySelector('#app').innerHTML = unavailable('ثبت سفارش موقتاً غیرفعال است', 'پرداخت Mock غیرفعال شده تا قیمت‌گذاری و رزرو موجودی سمت سرور و درگاه واقعی با callback تأییدشده پیاده شوند.');
      return;
    }
    const result = old.render();
    if (pathname === '/' || pathname === '/shop' || pathname.startsWith('/category/') || pathname.startsWith('/product/')) {
      const root = g.document.querySelector('#app');
      root?.insertAdjacentHTML?.('afterbegin', messageBox('کاتالوگ و قیمت‌های فعلی نمایشی‌اند؛ فقط ورود/ثبت‌نام به Supabase وصل است و خرید واقعی هنوز فعال نیست.'));
    }
    return result;
  };

  auth.start().then(() => {
    if (auth.currentUser && new URLSearchParams(g.location.search).get('verified') === '1') g.go('/account');
    else g.render();
  }).catch(error => {
    console.error('Supabase Auth initialization failed:', error);
    g.toast(auth.publicError(error));
    g.render();
  });
  if (g.location.pathname === '/reset-password' && g.supabase) {
    // The reset redirect can finish SDK PKCE recovery before the UI subscribes.
    setTimeout(async () => {
      if (!auth.currentUser) return;
      try {
        const { data } = await auth.client.auth.getSession();
        if (data.session) { /* authenticated user may securely rotate their own password */ }
      } catch { /* the page will show a fresh-link error on submit */ }
    }, 0);
  }
  g.render();
})(window);

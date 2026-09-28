/* Supabase Auth only. Commerce remains in mock mode until its server-side repository/RPCs are shipped. */
(function (g) {
  'use strict';
  const config = g.TOUBA_PUBLIC_CONFIG || {};
  const configured = Boolean(config.configured || config.enabled || config.url || config.anonKey);
  const enabled = Boolean(config.enabled && config.url && config.anonKey && g.supabase?.createClient);
  let client = null;
  let started = false;
  let subscription = null;
  let passwordRecovery = false;
  let applying = Promise.resolve(null);

  if (enabled) {
    client = g.supabase.createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'touba-supabase-auth-v1'
      }
    });
  }

  function requireClient() {
    if (!client) throw new Error(configured ? 'کتابخانهٔ Supabase بارگذاری نشد؛ اتصال امن را دوباره بارگذاری کنید.' : 'ورود واقعی هنوز در تنظیمات سایت فعال نشده است.');
    return client;
  }

  function appUser(profile, authUser) {
    const role = ['customer', 'admin', 'super_admin'].includes(profile.role) ? profile.role : 'customer';
    return {
      id: profile.id,
      email: authUser.email || profile.email || '',
      name: profile.display_name || authUser.user_metadata?.display_name || '',
      phone: profile.phone || '',
      role,
      isActive: profile.is_active === true,
      authProvider: 'supabase'
    };
  }

  async function readProfile(authUser) {
    const { data, error } = await requireClient()
      .from('profiles')
      .select('id,email,display_name,phone,role,is_active')
      .eq('id', authUser.id)
      .single();
    if (error || !data) throw new Error('پروفایل حساب در Supabase پیدا نشد؛ وضعیت trigger ساخت پروفایل را بررسی کنید.');
    if (!data.is_active) throw new Error('این حساب غیرفعال شده است. با پشتیبانی فروشگاه تماس بگیرید.');
    return appUser(data, authUser);
  }

  async function setSession(session, { render = true } = {}) {
    applying = applying.catch(() => null).then(async () => {
      if (!session?.user) {
        if (g.db) g.db.currentUser = null;
        return null;
      }
      try {
        const user = await readProfile(session.user);
        if (g.db) g.db.currentUser = user;
        return user;
      } catch (error) {
        if (g.db) g.db.currentUser = null;
        try { await requireClient().auth.signOut({ scope: 'local' }); } catch { /* preserve the profile error */ }
        throw error;
      }
    });
    const user = await applying;
    if (g.save) g.save();
    if (render && g.render) g.render();
    return user;
  }

  async function start() {
    if (!configured) return null;
    if (!enabled) throw new Error('کتابخانهٔ Supabase بارگذاری نشد؛ اتصال امن را دوباره بارگذاری کنید.');
    if (started) return null;
    started = true;
    if (g.db) g.db.currentUser = null;
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw error;
    if (data.session) {
      if (g.location.pathname === '/reset-password') passwordRecovery = true;
      await setSession(data.session, { render: false });
    }
    const result = requireClient().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') passwordRecovery = true;
      // Defer Supabase calls until after its auth event lock is released.
      setTimeout(() => setSession(session).catch(error => {
        console.error('Supabase profile/session restore failed:', error);
        if (g.toast) g.toast(error.message || 'بازیابی وضعیت ورود انجام نشد.');
      }), 0);
    });
    subscription = result.data?.subscription || null;
    return g.db?.currentUser || null;
  }

  async function signUp({ email, password, displayName }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const name = String(displayName || '').trim();
    if (!name || name.length > 100) throw new Error('نام را وارد کنید (حداکثر ۱۰۰ نویسه).');
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('ایمیل معتبر وارد کنید.');
    if (String(password || '').length < 12) throw new Error('رمز عبور باید دست‌کم ۱۲ نویسه داشته باشد.');
    const { data, error } = await requireClient().auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${g.location.origin}/login?verified=1`
      }
    });
    if (error) throw error;
    if (data.session) await setSession(data.session);
    return { confirmationRequired: !data.session, user: data.user || null };
  }

  async function signIn({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('ایمیل معتبر وارد کنید.');
    const { data, error } = await requireClient().auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) throw error;
    const user = await setSession(data.session);
    return user;
  }

  async function sendPasswordReset(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('ایمیل معتبر وارد کنید.');
    const { error } = await requireClient().auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${g.location.origin}/reset-password`
    });
    if (error) throw error;
  }

  async function updatePassword(password) {
    if (String(password || '').length < 12) throw new Error('رمز عبور جدید باید دست‌کم ۱۲ نویسه داشته باشد.');
    if (!passwordRecovery) throw new Error('پیوند بازیابی رمز معتبر نیست یا منقضی شده است. دوباره درخواست بازیابی بدهید.');
    const { error } = await requireClient().auth.updateUser({ password });
    if (error) throw error;
    passwordRecovery = false;
    return true;
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
    if (g.db) g.db.currentUser = null;
    if (g.save) g.save();
    if (g.render) g.render();
  }

  function publicError(error) {
    const message = String(error?.message || 'درخواست انجام نشد.');
    if (/invalid login credentials/i.test(message)) return 'ایمیل یا رمز عبور درست نیست.';
    if (/email not confirmed/i.test(message)) return 'ابتدا ایمیل خود را تأیید کنید؛ پوشهٔ Spam را هم بررسی کنید.';
    if (/user already registered/i.test(message)) return 'این ایمیل قبلاً ثبت‌نام کرده است؛ وارد شوید یا رمز را بازیابی کنید.';
    if (/password should be at least/i.test(message)) return 'رمز عبور کوتاه است؛ حداقل ۱۲ نویسه انتخاب کنید.';
    if (/rate limit|too many requests/i.test(message)) return 'درخواست‌های زیادی ارسال شده؛ کمی بعد دوباره تلاش کنید.';
    return 'درخواست به Supabase انجام نشد. تنظیمات Auth/SMTP و گزارش اجرای درخواست را بررسی کنید.';
  }

  g.ToubaAuth = Object.freeze({
    configured,
    get client() { return client; },
    get passwordRecovery() { return passwordRecovery; },
    get currentUser() { return g.db?.currentUser || null; },
    start,
    signUp,
    signIn,
    sendPasswordReset,
    updatePassword,
    signOut,
    publicError,
    dispose() { subscription?.unsubscribe?.(); }
  });
})(window);

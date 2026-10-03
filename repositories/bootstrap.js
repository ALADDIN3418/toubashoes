/* Production composition root: Supabase/RLS only. No mock repositories, seed rows, or local admin sessions. */
(function (g) {
  'use strict';
  if (!g.db || !g.ToubaAuth?.client || !g.SupabaseRepositories?.create || !g.AppServices?.create) return;

  const repositories = g.SupabaseRepositories.create(g.ToubaAuth.client, g.db);
  const services = g.AppServices.create(repositories, { db:g.db });
  const couponErrorText = {
    authentication_required: 'برای استفاده از کد تخفیف ابتدا وارد حساب شوید.',
    invalid_subtotal: 'جمع سبد خرید معتبر نیست.',
    coupon_unavailable: 'کد تخفیف فعال نیست یا وجود ندارد.',
    minimum_not_met: 'حداقل مبلغ خرید برای این کد رعایت نشده است.',
    usage_limit_reached: 'ظرفیت استفاده از کد تخفیف به پایان رسیده است.',
    not_started: 'زمان شروع کد تخفیف فرا نرسیده است.',
    expired: 'مهلت کد تخفیف پایان یافته است.'
  };
  services.coupons.validate = async function (code, subtotal) {
    const { data, error } = await g.ToubaAuth.client.rpc('validate_coupon', {
      p_code:String(code || '').trim().toUpperCase(),
      p_subtotal_toman:Math.max(0, Math.round(Number(subtotal) || 0))
    });
    if (error) throw new Error(`اعتبارسنجی کوپن از پایگاه داده انجام نشد: ${error.message || error.code || 'خطای نامشخص'}`);
    if (!data?.valid) return { valid:false, reason:couponErrorText[data?.reason] || 'کد تخفیف معتبر نیست.' };
    const coupon = g.db.coupons.find(x => x.code === data.code) || { code:data.code, active:true };
    return { valid:true, coupon, discount:Number(data.discount || 0) };
  };

  g.DataRepositories = repositories;
  g.StoreServices = services;
})(window);

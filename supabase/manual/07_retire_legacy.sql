-- بلوپال (BluPal · blupal.top) — قطعهٔ 7 از 7: حذف تابع‌های بازنشسته و بارگذاری دوبارهٔ schema
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- Retired gateway entry points: the old messenger bridge, the ZarinPal helpers and the
-- never-adopted redirect-gateway build must not survive as callable, unmaintained code paths.
drop function if exists public.attach_balepay_invoice(uuid,text,text);
drop function if exists public.settle_balepay_payment(uuid,text,text,bigint,text,text,jsonb);
drop function if exists public.expire_stale_balepay_checkouts(integer);
drop function if exists public.attach_zarinpal_authority(uuid,text);
drop function if exists public.settle_zarinpal_payment(uuid,text,text,bigint,text,text,jsonb);
drop function if exists public.attach_bluepal_payment(uuid,text,text,text,bigint,text);
drop function if exists public.settle_bluepal_payment(uuid,text,text,bigint,text,text,jsonb);
drop function if exists public.expire_stale_bluepal_checkouts(integer);

notify pgrst, 'reload schema';

commit;

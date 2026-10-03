# Supabase: Auth، پایگاه داده و مهاجرت‌ها

## وضعیت فعلی

کد فروشگاه دیگر provider محلی یا snapshot مرورگر برای داده‌های فروشگاهی ندارد. `services/data-provider.js` فقط پس از اتصال Auth و پاسخ موفق `commerce_health` با نسخهٔ `202610030001` دادهٔ Supabase را hydrate می‌کند؛ در نبود تنظیمات، خطای اتصال یا schema قدیمی، برنامه fail-closed است و به Demo/LocalStorage برنمی‌گردد.

Migration عملیاتی `202610030001_live_commerce.sql` در مخزن موجود است، اما اجرای آن روی پروژهٔ Supabase واقعی از این workspace انجام یا تأیید نشده است. پیش از آنکه این نسخه را روی دامنه استفاده کنید، migration history، dry-run و نتیجهٔ واقعی Workflow را بررسی کنید. هیچ مقدار credential ساختگی یا کلید پذیرنده در کد/این مستندات قرار نمی‌گیرد.

## تنظیم Auth ایمیل/رمز

در Vercel → Project → Settings → Environment Variables برای محیط‌های موردنیاز تنظیم کنید:

- `SUPABASE_URL` — Project URL.
- `SUPABASE_PUBLISHABLE_KEY` — public/publishable key؛ اگر پروژه فقط کلید legacy را دارد از `SUPABASE_ANON_KEY` استفاده کنید.

این‌ها تنها مقدارهای Supabase هستند که به کلاینت مرورگر می‌رسند. `SUPABASE_SERVICE_ROLE_KEY`، رمز دیتابیس، GitHub token و secretهای زرین‌پال را هرگز در Browser یا Git قرار ندهید. پس از تغییر Environment Variables، deployment را دوباره بسازید.

در Supabase → Authentication:

1. Email provider را فعال و email confirmation را برای Production روشن کنید.
2. حداقل طول و سیاست password را مطابق الزامات حساب تنظیم کنید (فرم سایت حداقل ۱۲ نویسه می‌خواهد).
3. Site URL و redirectهای `https://<دامنه>/login?verified=1` و `https://<دامنه>/reset-password` را پیکربندی کنید.
4. برای ایمیل تأیید و بازیابی، SMTP دامنهٔ تأییدشده راه‌اندازی و از چند mailbox واقعی آزمایش شود.

Trigger اولیه، `profiles` را با role پیش‌فرض `customer` می‌سازد. ثبت‌نام مرورگر نقشی بالاتر نمی‌پذیرد؛ role و active بودن از profile و policy/RPCهای DB خوانده می‌شود. برای ساخت اولین مدیر، پس از ثبت‌نام و تأیید حساب مالک، ایمیل دقیق Auth user را بررسی کنید و فقط از SQL Editor مورداعتماد اجرا کنید:

```sql
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('OWNER_EMAIL_HERE');
```

جایگزین را در همان SQL Editor با ایمیل دقیق عوض کنید؛ آن را در کد یا endpoint عمومی قرار ندهید. تعداد ردیف‌های متأثر و `profiles.role` را بعد از اجرا بررسی کنید. هیچ مسیر promote-role در UI عمومی وجود ندارد.

## Migrationها

فایل‌های SQL در `supabase/migrations/` ترتیب زمانی دارند. Migrationهای قبلاً اجراشده را ویرایش نکنید؛ تغییر تازه را با نام timestamp جدید اضافه کنید.

`202610030001_live_commerce.sql` پس از migrationهای پایه:

- داده‌های شناخته‌شدهٔ seed کاتالوگ/کوپن/بنر را پاک می‌کند؛ حساب واقعی، سفارش نامرتبط یا ردیف ناشناخته را حذف نمی‌کند.
- `commerce_health()` و نسخهٔ schema را اعلام می‌کند.
- write مستقیم مرورگر برای cart/order/payment را می‌بندد و RPCهای کنترل‌شده برای cart، کوپن، ساخت سفارش/رزرو موجودی و وضعیت سفارش فراهم می‌کند.
- Storage bucket عمومی `product-images` و policyهای ابتدایی آن در migration پایه ساخته شده‌اند؛ upload و delete برای مدیر فعال نیازمند RLS/storage policy است.

Workflow فایل `.github/workflows/supabase-db-push.yml` روی push به `main` که migrationها را تغییر دهد اجرا می‌شود. برای اجرای دستی به Actions Secrets زیر نیاز است:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Workflow قبل از apply، `supabase db push --dry-run` اجرا می‌کند و فقط برای دستی بودن به ورودی `confirm=true` نیاز دارد. نتیجهٔ هر دو گام را در GitHub Actions بررسی کنید؛ اگر schema در پروژه قبلاً خارج از migration history ساخته شده، ابتدا history/drift را به‌طور مستقل حل کنید و migration را کورکورانه اجرا نکنید. push این شاخه به‌تنهایی Workflowای که فقط روی `main` تعریف شده را فعال نمی‌کند.

## بررسی پس از migration

پس از apply موفق در پروژهٔ درست، بررسی کنید:

- `commerce_health()` مقدار `schemaVersion = 202610030001` برگرداند.
- رکوردهای demo مشخص‌شده در migration دیگر به‌عنوان محصولات/کوپن/بنر در پنل یا فروشگاه نمایش داده نشوند.
- یک Auth user فعال با role مشتری بتواند از RLS، کاتالوگ عمومی، profile خودش، cart RPC و favorites استفاده کند.
- یک مدیر فعال بتواند CRUD کاتالوگ/تنظیمات، رسانه، پیام‌های تماس و آمار را از DB انجام دهد.
- ایجاد و لغو سفارش تستی موجودی را اتمیک و idempotent نگه دارد؛ دو checkout هم‌زمان موجودی منفی نسازد.
- آپلود، دریافت public URL و حذف رسانه در bucket واقعی `product-images` کار کند.

تست‌های repository در این پروژه Supabase را با stub شبیه‌سازی می‌کنند و مدرک اجرای واقعی migration نیستند.

## زرین‌پال

تنظیم Sandbox فقط در Environment Variables سرور یا `.env` محلیِ خارج از Git:

- `ZARINPAL_MODE=sandbox`
- `ZARINPAL_MERCHANT_ID` — Merchant ID مجاز و واقعیِ sandbox/پذیرنده.
- `ZARINPAL_STATE_SECRET` — راز تصادفی حداقل ۳۲ بایتی.

تست‌های `npm test` پاسخ‌های ZarinPal را stub می‌کنند؛ برای go-live باید callback و verify رسمی روی Sandbox واقعی، مبلغ ریالی، تکرار callback، لغو سفارش و تطبیق رسید end-to-end آزمایش شوند. Production mode عمداً fail-closed است و تا ارزیابی نهایی DB، امنیت، موجودی و پرداخت باز نمی‌شود.

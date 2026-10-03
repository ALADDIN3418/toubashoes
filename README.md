# کفش طوبی — فروشگاه فارسی RTL با Supabase

فروشگاه فارسی RTL و پنل مدیریت با احراز هویت Supabase، کاتالوگ و تنظیمات پایدار در PostgreSQL، سبد خرید و عملیات سفارش متکی به RPCهای امن، و ذخیرهٔ تصویر محصول در Supabase Storage. هیچ کاتالوگ، سفارش، کاربر، آمار یا تنظیم فروشگاهی از Demo/LocalStorage بارگذاری نمی‌شود؛ در نبود اتصال معتبر یا migration هماهنگ، برنامه عمداً fail-closed است و صفحهٔ خطای اتصال نشان می‌دهد.

## اجرا و بررسی محلی

- نیازمندی: Node.js 22+.
- نصب وابستگی‌ها: `npm install`.
- اجرای سرور: `npm start` (روی `0.0.0.0` و پورت `PORT` یا 3000؛ پیش‌فرض این شاخه 3000 است).
- آزمون: `npm test`.
- Build: `npm run build`؛ خروجی وب و Supabase browser SDK در `public/` ساخته می‌شود.
- سرور محلی بدون کلید عمومی Supabase، دیتای ساختگی نمایش نمی‌دهد. برای تجربهٔ فروشگاه باید `SUPABASE_URL` و `SUPABASE_PUBLISHABLE_KEY` یا `SUPABASE_ANON_KEY` را در `.env` محلی یا Environment Variables سرور تنظیم کنید.

## اتصال Supabase

در Environment Variables محیط Vercel:

- `SUPABASE_URL`: URL پروژه.
- `SUPABASE_PUBLISHABLE_KEY`: کلید عمومی/publishable؛ در پروژه‌های قدیمی `SUPABASE_ANON_KEY` قابل استفاده است.

این مقادیر عمومی‌اند و برای Auth مرورگر استفاده می‌شوند. هرگز `SUPABASE_SERVICE_ROLE_KEY`، رمز دیتابیس، GitHub Actions token یا credential پرداخت را به مرورگر ندهید.

در Supabase، Email provider را فعال کنید، تأیید ایمیل و سیاست رمز قوی را تنظیم کنید، Site URL و Redirect URLهای `/login?verified=1` و `/reset-password` را برای دامنهٔ واقعی ثبت کنید و SMTP قابل‌اعتماد را برای Production پیکربندی کنید. ثبت‌نام عمومی فقط حساب `customer` می‌سازد؛ نقش مدیر باید از مسیر مورداعتماد مالک در Supabase به‌روزرسانی شود.

### Migrationهای پایگاه داده

Migrationهای نسخه‌بندی‌شده در `supabase/migrations/` هستند. Migration عملیاتی `202610030001_live_commerce.sql`، پس از نسخه‌های قبلی، RPCهای سلامت schema، سبد خرید و ثبت اتمیک سفارش/رزرو موجودی را فراهم می‌کند و نمونه‌های کاتالوگ/کوپن/بنر شناخته‌شده را پاک می‌کند. **وجود migration در این مخزن به‌معنی اجرای آن روی پروژهٔ واقعی نیست.** تا اجرای آن و تأیید نسخهٔ `202610030001` توسط برنامه، storefront، پنل و checkout fail-closed می‌مانند.

GitHub Actions برای migrationهای pushشده به `main` اجرا می‌شود؛ اجرای دستی نیازمند تأیید ورودی `confirm` است. برای آن workflow باید GitHub Actions Secrets زیر تنظیم باشند: `SUPABASE_ACCESS_TOKEN`، `SUPABASE_PROJECT_REF` و `SUPABASE_DB_PASSWORD`. گام dry-run را بررسی و نتیجهٔ اجرای migration را در Actions تأیید کنید. در صورت ایجاد schema قبلی، پیش از هرگونه اجرای مجدد از وضعیت و migration history پروژه پشتیبان بگیرید.

جزئیات و مسیر راه‌اندازی در [`supabase/README.md`](supabase/README.md) آمده است.

## داده، کاتالوگ و پنل

- `services/data-provider.js` فقط state اولیهٔ خالی می‌سازد و داده را از `repositories/supabase-repository.js` می‌گیرد؛ persistence کل state در مرورگر عمداً خاموش است.
- محصول، دسته، کوپن، تنظیمات، بنر، محتوا، نظر، پیام تماس، مشتری و آمار از ردیف‌های پایگاه داده و RLS خوانده می‌شوند. آمار فروش فقط از سفارش‌هایی محاسبه می‌شود که پرداخت آن‌ها تأیید شده است.
- سبد مشتری از RPC امن ثبت می‌شود؛ سفارش، مبلغ authoritative، تخفیف، shipping و رزرو موجودی در `create_order_with_payment` اعتبارسنجی می‌شوند. مرورگر اجازهٔ درج مستقیم سفارش یا تغییر وضعیت پرداخت ندارد.
- فایل‌های تصویر انتخابی/تولیدشده به bucket عمومی `product-images` در Supabase Storage می‌روند و اطلاعات رسانه در جدول DB نگهداری می‌شود. آدرس بیرونی فقط HTTPS پذیرفته می‌شود.
- پنل مدیریت در موبایل ناوبری کشویی و جدول‌های افقیِ محدودشده دارد؛ storefront نوار پایین و نوار خرید موبایل را جداگانه ارائه می‌کند.

## Checkout و زرین‌پال

Checkout فقط برای حساب فعال مشتری است. سفارش ابتدا به‌صورت تراکنشی در Supabase ساخته می‌شود؛ سپس `/api/payment/zarinpal/request` با JWT مشتری، سفارش را سمت سرور به زرین‌پال می‌فرستد. callback و verify سمت سرور انجام می‌شوند و رسید امضاشده فقط پس از verify معتبر است. callback تکراری باید idempotent بماند. هیچ اطلاعات کارت بانکی روی سایت دریافت یا ذخیره نمی‌شود.

تنظیم‌ها فقط سمت سرور (Vercel Environment Variables یا `.env` خارج از Git):

- `ZARINPAL_MODE=sandbox` برای آزمایش.
- `ZARINPAL_MERCHANT_ID`: Merchant ID واقعی/مجاز ارائه‌دهنده؛ مقدار جعلی نسازید.
- `ZARINPAL_STATE_SECRET`: راز تصادفی حداقل ۳۲ بایتی برای امضای state و receipt؛ در محیط امن تولید کنید.

درخواست Production عمداً مسدود است تا DB واقعی، migration، checkout و Sandbox end-to-end تأیید شوند. فعال‌کردن متغیر Production به‌تنهایی دریافت وجه را مجاز نمی‌کند. مستند رسمی: [API v4](https://www.zarinpal.com/docs/paymentGateway/connectToGateway.html) و [Sandbox](https://next.zarinpal.com/paymentGateway/sandbox.html).

## ابزارهای هوش مصنوعی

- **Product AI Studio** تصویر مرجع را در مرورگر با Puter.js و مدل‌های مجاز در دسترس حساب کاربر ویرایش می‌کند؛ هزینه/سهمیه به Puter و مدل انتخابی وابسته است و رایگان/نامحدود تضمین نمی‌شود. مدل Gemini برای استودیوی تصویر ارائه نمی‌شود؛ مدل‌های Cloudflare (در صورت نمایش) فقط از طریق Puter فراخوانی می‌شوند. تصویر خروجی از Supabase Storage و repository محصول ثبت می‌شود.
- **دستیار جداگانهٔ نگارش توضیحات محصول** قابلیت مستقلی است. کلید اختیاری `GEMINI_API_KEY` فقط سمت سرور استفاده می‌شود؛ هر ادعای فنی متن تولیدشده باید با مشخصات واقعی محصول بررسی شود.
- نشانگر سازگاری قدیمی `ComfyUI / Qwen-Image-Edit` در کد استودیو حفظ شده است و به‌معنی مسیر تولید مستقل از Puter نیست.

## تست و وضعیت انتشار

`npm test` شامل تست‌های آفلاین repository Supabase، Puter AI Studio، API، Auth، زرین‌پال و fail-closed storefront است. این تست‌ها از stub استفاده می‌کنند و **جایگزین اجرای migration، مرورگر واقعی یا تراکنش Sandbox پذیرنده نیستند**.

وضعیت فعلی: migration عملیاتی روی Supabase واقعی از این محیط اجرا/تأیید نشده؛ ورود و ثبت‌نام روی mailbox واقعی، Storage واقعی، مرورگر موبایل و پرداخت Sandbox واقعی نیز بررسی نشده‌اند. تا اتمام این مراحل و بازبینی اطلاعات فروشنده/قیمت/ارسال/موجودی، پروژه را Production-ready یا مجاز برای سفارش/پرداخت واقعی تلقی نکنید. جزئیات در [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).

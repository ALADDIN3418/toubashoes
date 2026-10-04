# گزارش آمادگی انتشار — کفش طوبی

**آخرین بازبینی workspace:** 2026-10-04
**دامنه:** کد شاخهٔ Arena، Supabase data provider/repositories، Auth، checkout/بله‌پی (کیف‌پول بله)، Storage تصاویر، Admin و layout واکنش‌گرا. این گزارش وضعیت اجرای واقعی سرویس‌های بیرونی را تأیید نمی‌کند.

## جمع‌بندی

> **وضعیت: آمادهٔ Production نیست.** در این workspace مسیرهای Demo/LocalStorage برای دادهٔ فروشگاه غیرفعال/حذف شده و کد برای Supabase طراحی شده است؛ با این حال migration عملیاتی `202610030001_live_commerce.sql` روی Supabase واقعی اجرا و تأیید نشده، و هیچ مرورگر واقعی، Storage واقعی یا تراکنش Sandbox واقعی در این بررسی اجرا نشده است. تا آن زمان، برنامه عمداً در نبود schema معتبر به صفحهٔ خطای اتصال می‌رود و از دیتای ساختگی fallback نمی‌کند.

| حوزه | وضعیت فعلی | آنچه هنوز لازم است |
|---|---|---|
| داده‌های فروشگاه | `DataProvider` فقط Supabase را می‌خواند؛ persistence کل snapshot و mock seed حذف شده‌اند. | اتصال به پروژهٔ واقعی، اجرای migration و تأیید RLS/داده‌ها. |
| کاتالوگ و پنل | repositoryهای محصولات، واریانت، دسته، تنظیمات، کوپن، بنر، رسانه و پیام‌ها Supabase/RPC را هدف می‌گیرند. | CRUD end-to-end با حساب مدیر واقعی؛ خطاهای policy و Storage بررسی شوند. |
| آمار | از سفارش‌های DB و پرداخت‌های verified محاسبه می‌شود. | تأیید مقدارها روی دادهٔ واقعی؛ migration و seed cleanup هنوز remote تأیید نشده‌اند. |
| سفارش و پرداخت | ساخت سفارش در RPC با اعتبارسنجی قیمت/کوپن/موجودی؛ صورتحساب `createInvoiceLink`، پاسخ `answerPreCheckoutQuery` و نهایی‌سازی فقط با `inquireTransaction` روی سرور. migration `202610040001_balepay_provider.sql` محدودیت `provider = 'balepay'` و RPCهای `attach_balepay_invoice`/`settle_balepay_payment`/`expire_stale_balepay_checkouts` را می‌سازد. | اجرای migration روی پروژهٔ واقعی، آزمون توکن کیف‌پول آزمایشی، ثبت Webhook، تکرار آپدیت (idempotency)، لغو/انقضا و مغایره‌گیری دستی تراکنش‌ها. |
| تصاویر محصول | مسیر repository از Supabase Storage و جدول `media`/`product_images` استفاده می‌کند. | Bucket و policyهای واقعی را با حساب مدیر آزمایش کنید. |
| موبایل | قواعد اختصاصی Admin در breakpointهای 860 و 420 پیکسل و storefront mobile navigation موجود است. | مرورگر واقعی iOS/Android، اندازه‌های مختلف، RTL و accessibility هنوز تأیید نشده‌اند. |
| AI Studio | Puter.js در مرورگر؛ اتصال خروجی به repository و Storage؛ دستیار متن محصول جداست. | اجرای واقعی با حساب Puter، policy دسترسی و هزینه/سهمیه بررسی شود. |
| آزمون خودکار | تست‌های Node برای repository، Auth، API، AI و بله‌پی با stub (payload، pre-checkout، settle). | این‌ها جایگزین DB واقعی، مرورگر و Sandbox E2E نیستند. |

## کارهای ضروری پیش از Production

1. **اجرای و تأیید migration عملیاتی:** در پروژهٔ درست، migrationهای pending را ابتدا dry-run و سپس apply کنید. تأیید کنید `commerce_health()` نسخهٔ `202610030001` می‌دهد، seedهای شناخته‌شده پاک شده‌اند، و هیچ ردیف واقعی ناخواسته حذف نشده است. کد به schema قدیمی اجازهٔ ادامه نمی‌دهد.
2. **Auth و RBAC واقعی:** تنظیم URL و کلید عمومی Supabase در Vercel، URLهای redirect، SMTP، تأیید ایمیل، reset-password، فعال‌بودن profile، ساخت owner admin از مسیر مورداعتماد و بررسی RLS با نقش customer/admin.
3. **CRUD پایدار:** با حساب مدیر واقعی، ایجاد/ویرایش/حذف محصول و variant، تنظیمات، کوپن، بنر و صفحه، پیام تماس و رسانه را تأیید کنید. پس از refresh و ورود از دستگاه دیگر مقدار DB باید یکسان باشد؛ LocalStorage shop snapshot استفاده نمی‌شود.
4. **تصاویر:** upload/download/delete در bucket `product-images` را در محیط واقعی و با policyها، مجوزها، سقف حجم، MIME و URLهای عمومی بررسی کنید. فایل تصاویر API serverless یا فایل محلی منبع پایدار نیست.
5. **Commerce E2E:** با حساب مشتری test، سبد، کوپن، subtotal، هزینه ارسال، رزرو و آزادسازی موجودی، ثبت سفارش، بازکردن `openInvoice` با توکن آزمایشی `WALLET-TEST-1111111111111111`، پاسخ pre-checkout در کمتر از ۱۰ ثانیه، دریافت دوبارهٔ همان `update_id`، و رسید نهایی را از ابتدا تا انتها بررسی کنید. برای دو checkout هم‌زمان موجودی، race test انجام دهید و پس از لغو/بستن صفحهٔ پرداخت، آزادسازی رزرو را تأیید کنید.
6. **گیت‌وی Production:** توکن بازو، توکن پرداخت کیف‌پول و `BALEPAY_STATE_SECRET` را فقط در Environment Variables امن نگه دارید. تا `BALEPAY_ENABLE_LIVE_PAYMENTS=true` نشود دریافت وجه واقعی قفل است؛ این کلید را پیش از تکمیل آزمون‌های DB، reconciliation، لغو/بازپرداخت و بررسی رویدادهای Webhook فعال نکنید.
7. **محتوا و سیاست‌ها:** مالک فروشگاه باید محصولات، قیمت و موجودی واقعی، هزینه‌های حمل، تلفن/نشانی، دامنه، قوانین بازگشت، حریم خصوصی، مالیات/ارز و مجوز عکس‌ها را تأیید کند. تنظیمات و تماس خالی به‌صورت خالی می‌مانند؛ آن‌ها را با مقدار ساختگی پر نکنید.
8. **مرورگر و عملیاتی:** Playwright/manual test روی دسکتاپ و موبایل، RTL، accessibility، نمودار/جدول Admin، refresh/navigation، backup/restore، مانیتورینگ و alert را انجام دهید.

## یادداشت‌های اجرای فعلی

- `services/data-provider.js`: state اولیه خالی؛ بررسی `commerce_health`; بدون snapshot/local fallback.
- `repositories/supabase-repository.js`: خواندن و نوشتن از Supabase؛ سبد/سفارش/پرداخت از مسیرهای کنترل‌شده؛ فایل‌های تصویر از Supabase Storage.
- `supabase/migrations/202610030001_live_commerce.sql`: شامل تغییرهای schema، RPCهای commerce و پاک‌سازی رکوردهای seed شناخته‌شده است. **فقط فایل محلی بازبینی شده؛ روی DB واقعی اجرا نشده است.**
- `lib/balepay.js`: مسیر ساخت صورتحساب، وب‌هوک، استعلام تراکنش و settle سمت سرور؛ تست‌های موجود با پاسخ جعلی `tapi.bale.ai` اجرا می‌شوند، نه سرویس واقعی. راهنمای راه‌اندازی: `BALEPAY_OPERATIONS.md`.
- `admin-product-ai.js`: استودیو تصویر Puter و اتصال خروجی به repository؛ نشانگر سازگاری `(Legacy compatibility markers: ComfyUI / Qwen-Image-Edit)` حفظ شده. Gemini برای استودیوی تصویر مدل‌فهرست نمی‌شود؛ دستیار نگارش توضیحات محصول جدا باقی مانده است.
- Legacy JSON endpoints و `services/server-db.js`/`data/store.json`، مسیر upload موقت و mock seed repository از runtime حذف شده‌اند. تنظیم پوسته/تم کاربر می‌تواند در storage مرورگر بماند؛ این دادهٔ فروشگاه نیست.
- API تولید تصویر قدیمی محدودیت‌های جداگانهٔ دسترسی و rate limit دارد؛ تا احراز دسترسی مدیر و سقف هزینهٔ سراسری اثبات نشده، آن را به‌عنوان کنترل تولیدی یا بودجهٔ تضمین‌شده فرض نکنید.
- Workflow مهاجرت Supabase فقط روی `main` به‌طور خودکار فعال می‌شود؛ workflow دستی `confirm=true` می‌خواهد. تغییر این شاخه به‌تنهایی به‌معنی اجرای migration روی پروژه نیست.

## معیار Go-Live

انتشار فقط پس از تکمیل موارد بالا، تأیید migration و migration history، موفقیت E2E با سرویس‌های واقعی، آزمون rollback/backup و امضای مالک روی داده و قوانین کسب‌وکار قابل بررسی است. تا آن زمان این شاخه را Production-ready اعلام نکنید و پرداخت واقعی نپذیرید.

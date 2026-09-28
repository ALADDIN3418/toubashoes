# کفش طوبی — Demo آفلاین و Supabase-ready

فروشگاه فارسی RTL، پنل CMS، mock checkout/payment، داده‌های ماندگار محلی و Repository/Service layer. هسته فروشگاه و خرید آفلاین/محلی است؛ ابزار اختیاری عکس محصول از Cloudflare Workers AI و مدل FLUX.2 [klein] 4B با تصویر مرجع استفاده می‌کند. هیچ Supabase یا درگاه پرداختی متصل نیست.

## اجرا
- نیازمندی: Node.js 18+
- `npm start` یا `node local-server.js`؛ سرور توسعه روی پورت 4173 باز می‌شود. روی Vercel، فایل `local-server.js` اجرا نمی‌شود؛ سایت به‌صورت static به‌همراه API Functions جداگانه منتشر می‌شود.
- تمام routeهای SPA با fallback سرور محلی و rewrite وریسل به `index.html` کار می‌کنند.
- `npm run build` اجرای syntax/build-check بدون transpiler؛ `npm test` اجرای repository, runtime و E2E mock tests. برای هسته هیچ package خارجی لازم نیست.

## انتشار روی Vercel
- مخزن را در Vercel دوباره Deploy کنید (یا پس از push منتظر deploy خودکار GitHub بمانید). `vercel.json`، preset را روی Other/static قرار می‌دهد، فایل‌های وب را از ریشه سرو می‌کند، مسیرهای SPA را به `index.html` می‌فرستد و endpointها را به Vercel Functions وصل می‌کند.
- صفحه فروشگاه بدون کلید Cloudflare هم بالا می‌آید؛ فقط ساخت تصویر تا زمان تنظیم Environment Variables غیرفعال می‌ماند. برای فعال‌سازی تصویر، در Vercel → Project → Settings → Environment Variables، `CLOUDFLARE_ACCOUNT_ID` و یک `CLOUDFLARE_API_TOKEN` تازه با دسترسی محدود `Workers AI: Read` اضافه و سپس Redeploy کنید. توکن افشاشده در گفتگو را استفاده نکنید.
- این Vercel deployment همچنان Demo است: داده‌های فروشگاه در LocalStorage هر مرورگر می‌ماند؛ ورود و پرداخت واقعی نیستند. same-origin و سقف حافظه‌ای API جای احراز هویت یا rate limit پایدار را نمی‌گیرند.

### ابزار اختیاری عکس محصول با Cloudflare Workers AI
در Products عکس را انتخاب کنید و سبک پس‌زمینه را برگزینید. مدل پیش‌فرض `@cf/black-forest-labs/flux-2-klein-4b` از ویرایش با تصویر مرجع پشتیبانی می‌کند؛ وزن‌های 4B در مجوز Apache-2.0 معرفی شده‌اند. Cloudflare Workers AI پلن رایگان با ۱۰٬۰۰۰ Neurons در روز دارد (سهمیه در ۰۰:۰۰ UTC بازنشانی می‌شود). این سهمیه بین استفاده‌های همان حساب مشترک است؛ ابزار به‌عنوان محافظ داخلی حداکثر ۲۰ تصویر در هر ۲۴ ساعت می‌سازد. استفادهٔ بالاتر از سهمیهٔ رایگان در حساب‌های دارای billing ممکن است هزینه‌دار شود؛ قبل از اجرا وضعیت پلن و مصرف حساب را بررسی کنید. این endpoint کنترل دسترسی production نیست و فقط same-origin، سقف محلی و ورود نمایشی فعلی را دارد.

#### راه‌اندازی Cloudflare
1. یک حساب Cloudflare بسازید و Account ID آن را از داشبورد بردارید.
2. یک API Token با دسترسی `Workers AI: Read` بسازید.
3. `.env.example` را به `.env` محلی کپی کنید و `CLOUDFLARE_ACCOUNT_ID` و `CLOUDFLARE_API_TOKEN` را فقط در فایل `.env` وارد کنید؛ کلید را در چت یا فایل‌های commit‌شده قرار ندهید.
4. سرور را دوباره اجرا کنید. تا وقتی مشخصات تنظیم نشده باشند، ابزار ساخت تصویر غیرفعال می‌ماند.

تصویر ورودی مستقیم از سرور به Cloudflare فرستاده می‌شود و دیگر روی میزبان موقت عمومی آپلود نمی‌شود. ورودی برای API به ضلع حداکثر ۵۱۱ پیکسل کاهش می‌یابد. عکس اصلی عوض نمی‌شود مگر مدیر خروجی را پیش‌نمایش و اعمال کند؛ خروجی در مرورگر به JPEG با ضلع حداکثر ۱۲۸۰ پیکسل فشرده می‌شود. در اجرای محلی فایل در `uploads/products/` ذخیره می‌شود؛ روی Vercel فایل‌سیستم پایدار نیست، بنابراین نسخهٔ تأییدشده به‌صورت data URL در LocalStorage همان مرورگر ذخیره می‌شود. این رفتار فقط برای Demo است و جایگزین object storage واقعی نیست. هیچ مدل مولدی حفظ دقیق کفش، رنگ، بند، لوگو یا جزئیات را تضمین نمی‌کند؛ خروجی‌ها را با عکس واقعی بررسی کنید.

**مجوز مدل:** 4B برای این کاربرد تجاری انتخاب شده چون مستندات Black Forest Labs آن را Apache-2.0 معرفی می‌کنند. از 9B با مجوز FLUX NCL/غیرتجاری برای فروشگاه استفاده نکنید مگر مجوزش را مستقلاً بررسی کرده باشید.

## نقش‌های Demo
در `/login` روی حساب نمونه کلیک کنید:
- Customer: `09120000001`
- Admin: `09120000002`
- Super Admin: `09120000003`

ورود فقط state محلی را تغییر می‌دهد؛ رمز، OTP، session یا احراز هویت واقعی وجود ندارد. Demo Admin به بخش‌های CMS/فروشگاه دسترسی دارد؛ ابزارهای Reset/Clear فقط برای Super Admin نمایش داده می‌شوند.

## Architecture / Data Layer
- `mock/seed-data.js`: داده‌های پایه و یک‌جای Demo؛ فقط اگر Storage خالی باشد Seed می‌شود.
- `services/data-provider.js`: انتخاب Provider و LocalPersistence adapter. در این build مقدار `DATA_PROVIDER=mock` قفل است.
- `repositories/mock-repository.js`: قرارداد generic و عملیات CRUD/list/get/search/filter برای entityها.
- `repositories/bootstrap.js`: ساخت کاربران Demo، Home CMS defaults، Repository container و Application services.
- `services/application-services.js`: Product/Auth/Order/Coupon/Shipping/Payment/Review/Cart services؛ بدون وابستگی به SDK خارجی.
- `services/cart-functions.js`: عملیات Cart از طریق Cart repository.
- `stage3.js`: UI/route composition و flowهای demo.
- `types/domain.js`: JSDoc contracts؛ `prisma/schema.prisma` مدل relational معادل PostgreSQL/Supabase.
- `repositories/supabase-repository.stub.js`: صرفاً interface آینده؛ import یا اجرا نمی‌شود.
- `.env.example`: placeholderهای Cloudflare Workers AI برای مدل تصویر، به‌علاوه حالت mock رزروشده برای Supabase؛ فایل واقعی `.env` از git خارج است.

UI از state snapshot محلی استفاده می‌کند و persistence فقط از `DataProvider` عبور می‌کند؛ operations حساس فروش از `DemoServices` و Repositoryها انجام می‌شوند. در مرحله اتصال، composition root و adapter جایگزین می‌شوند؛ در صورت نیاز APIهای کاملاً async می‌توانند همان قرارداد repository را حفظ کنند.

## Demo flowها
### خرید
`/shop` → search/filter/sort/pagination → صفحه محصول → انتخاب رنگ و سایز → quick add → Cart → اعمال کوپن `TOUBA10` یا `WELCOME150` → Checkout → Mock Payment success/failure → Tracking. پرداخت موفق موجودی واریانت را فقط یک بار کم می‌کند؛ ناموفق، سفارش/payment failure را نگه می‌دارد، سبد را حفظ می‌کند و موجودی را کم نمی‌کند.

### پنل
`/admin` → Dashboard → Products (مدیریت سایز×رنگ و موجودی مستقل) → Orders (جستجو، فیلتر، جزئیات و status) → Coupons/Reviews → Banners/Homepage/Media/Settings. CMS homepage پس از ذخیره در storefront قابل مشاهده است. Shipping عادی/سریع/رایگان از Settings تنظیم می‌شود.

### ماندگاری / Reset
تمام state با کلید `toubashop-v1` در LocalStorage مرورگر فعلی ذخیره می‌شود. Super Admin در Admin → ابزار دمو می‌تواند Reset به Seed، Seed در Storage خالی، یا Clear Local Data انجام دهد. برای reset دستی همین کلید را از LocalStorage حذف کنید.

## تست‌های آفلاین
```bash
node tests/repository-crud.js
node tests/demo-e2e.js
```
تست E2E بدون مرورگر یا شبکه مسیر ساخت محصول و Variant، انتشار و جستجو، Login Demo، افزودن Cart، کوپن، Checkout، پرداخت موفق و ناموفق، کاهش موجودی، تغییر وضعیت سفارش و بارگذاری مجدد از local persistence را بررسی می‌کند.

## اتصال آینده (فعلاً غیرفعال)
`prisma/schema.prisma` مدل‌های users/profiles/products/product_variants/categories/product_images/orders/order_items/addresses/payments/coupons/reviews/banners/page_contents/site_settings/media را نگه می‌دارد. Supabase URL/anon key عمداً خالی‌اند. در مرحله نهایی لازم است adapter واقعی، server-side auth/RBAC، تراکنش اتمیک موجودی، upload storage و verify پرداخت ساخته شود؛ هیچ‌کدام در Demo حاضر فعال نیست.

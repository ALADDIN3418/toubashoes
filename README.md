# کفش طوبی — فروشگاه فارسی RTL با Supabase Auth و حالت Demo

فروشگاه فارسی RTL، پنل CMS، داده‌های Demo در LocalStorage و Repository/Service layer. ورود ایمیلی Supabase اختیاری است؛ کاتالوگ، سفارش و موجودی هنوز به دیتابیس تجاری وصل نیستند. Checkout به API سمت سرور زرین‌پال متصل شده و فقط در Sandbox قابل استفاده است؛ دریافت وجه واقعی تا ماندگارشدن امن سفارش‌ها مسدود است. پنل محصول شامل دستیار نگارش توضیحات (با پیش‌نویس محلی در نبود کلید) و Product AI Studio است. استودیو با Puter.js در مرورگر کاربر، تصویر مرجع را به‌صورت چرخشی با مدل‌های سازگار ویرایش می‌کند و در صورت محدودیت خودکار به مدل بعدی می‌رود.

## اجرا
- نیازمندی: Node.js 22+ (Supabase JS SDK در build بسته‌بندی می‌شود).
- `npm start` یا `node local-server.js`؛ سرور توسعه روی پورت 4173 باز می‌شود. روی Vercel، فایل `local-server.js` اجرا نمی‌شود؛ سایت به‌صورت static به‌همراه API Functions جداگانه منتشر می‌شود.
- تمام routeهای SPA با fallback سرور محلی و rewrite وریسل به `index.html` کار می‌کنند.
- `npm run build` اجرای syntax/build-check و بسته‌بندی SDK مرورگر Supabase؛ `npm test` تست Repository، API، Auth و Demo E2E را اجرا می‌کند.

## انتشار روی Vercel
- مخزن را در Vercel دوباره Deploy کنید (یا پس از push منتظر deploy خودکار GitHub بمانید). `vercel.json`، preset را روی Other/static قرار می‌دهد؛ `npm run build` فقط فایل‌های لازم وب را در `public/` آماده می‌کند، مسیرهای SPA به `index.html` می‌روند و endpointها به Vercel Functions متصل می‌شوند.
- Product AI Studio از Puter.js در مرورگر استفاده می‌کند؛ برای تولید تصویر، مدیر باید با حساب Puter وارد شود. Puter هزینه/سهمیه را طبق حساب و مدل انتخاب‌شدهٔ کاربر اعمال می‌کند؛ این قابلیت رایگان یا نامحدود تضمین‌شده نیست و به `GEMINI_API_KEY` یا کلید Cloudflare وابسته نیست. کلید اختیاری Gemini فقط برای دستیار جداگانهٔ نگارش توضیحات محصول است و باید در Vercel Environment Variables بماند. کلیدهای AI را در کد، LocalStorage یا گفتگو ذخیره نکنید.
- احراز هویت ایمیلی Supabase اختیاری است. Checkout از API سمت سرور زرین‌پال استفاده می‌کند؛ Sandbox برای آزمایش جریان فعال است. Production به‌صورت server-side مسدود شده، چون کاتالوگ/سفارش/موجودی هنوز از Repository محلی و LocalStorage می‌آیند و به Supabase متصل نیستند.

### اتصال Auth ایمیل/رمز Supabase

برای فعال‌کردن صفحهٔ واقعی ورود/ثبت‌نام در Vercel، در **Project → Settings → Environment Variables** فقط این موارد را برای Production (و در صورت نیاز Preview) اضافه کنید:

- `SUPABASE_URL`: URL پروژه از Supabase → Project Settings → API.
- `SUPABASE_PUBLISHABLE_KEY`: کلید publishable/public از همان بخش. اگر پروژه فقط کلید قدیمی دارد، می‌توانید به‌جای آن `SUPABASE_ANON_KEY` بگذارید.

این endpoint عمداً فقط URL و کلید عمومی را به مرورگر می‌دهد؛ `service_role`, database password و GitHub migration token را اضافه نکنید. بعد از افزودن متغیرها Redeploy کنید. در Supabase → **Authentication → URL Configuration**، Site URL را روی `https://toubashoes.vercel.app` بگذارید و Redirect URLهای `/login?verified=1` و `/reset-password` را مجاز کنید (پس از اتصال دامنهٔ نهایی، دامنهٔ همان‌جا هم اضافه شود). در Authentication → Providers، Email را فعال و تأیید ایمیل را روشن کنید؛ برای ارسال قابل‌اعتماد Production باید SMTP دامنهٔ تأییدشده را تنظیم کنید.

در حالت Supabase، حساب Demo و ورود مدیر نمایشی غیرفعال‌اند؛ signup فقط نقش `customer` می‌سازد. حساب مدیر را پس از ثبت‌نام/تأیید، فقط مالک از SQL Editor و با بررسی ایمیل به `super_admin` ارتقا دهد. ورود به پنل به پروفایل فعال Supabase وابسته است، اما مدیریت کاتالوگ/سفارش در حال حاضر از `g.db` و Mock Repository می‌خواند: فرم کامل، افزودن سریع و عملیات دسته‌جمعی می‌توانند همان Demo را ویرایش کنند، نه جداول Supabase. در Vercel این تغییرها فقط در LocalStorage همان مرورگر می‌مانند و نباید برای سفارش یا کاتالوگ واقعی استفاده شوند؛ در اجرای local server یک فایل Demo جدا نیز نگهداری می‌شود. پرداخت زرین‌پال فقط در Sandbox است؛ دریافت وجه Production تا پایدارشدن دادهٔ سفارش غیرفعال می‌ماند.

### درگاه زرین‌پال (API v4)

درخواست پرداخت فقط از `/api/payment/zarinpal/request` روی سرور به API رسمی v4 ارسال می‌شود؛ مبلغ checkout بر حسب تومان به ریال تبدیل می‌شود. مرورگر سپس به `StartPay/{Authority}` هدایت می‌شود. مسیر `/api/payment/zarinpal/callback` فقط پس از `Status=OK`، با Merchant ID و مبلغ همان state امضاشده، verify سروری می‌کند (`code=100` و پاسخ idempotent `101` پذیرفته می‌شوند). رسید HMAC امضاشده به صفحه نتیجه برمی‌گردد و `/api/payment/zarinpal/receipt` آن را دوباره روی سرور اعتبارسنجی می‌کند. هیچ اطلاعات کارت بانکی به سایت ارسال یا ذخیره نمی‌شود.

تنظیمات فقط در environment سمت سرور قرار بگیرند:
- `ZARINPAL_MODE=sandbox` برای آزمایش؛ محیط رسمی پس از فراهم‌شدن زیرساخت سفارش.
- `ZARINPAL_MERCHANT_ID` — Merchant ID معتبر ۳۶ کاراکتری ارائه‌دهنده؛ مقدار واقعی را در کد/مخزن قرار ندهید.
- `ZARINPAL_STATE_SECRET` — راز تصادفی حداقل ۳۲ بایتی برای HMAC؛ می‌توانید آن را با `openssl rand -hex 32` بسازید و فقط در Vercel Environment Variables یا `.env` محلی نگه دارید.

پنل Admin → Payments فقط وضعیت امن سرور و تراکنش‌های همین مرورگر را نشان می‌دهد و برای واردکردن credential نیست. گرچه URLهای رسمی production نیز در پیاده‌سازی تعریف شده‌اند، درخواست production تا اتصال سفارش، قیمت و موجودی به دیتابیس/سرویس پایدار سمت سرور عمداً با 503 بسته است؛ تغییر mode به‌تنهایی دریافت وجه را فعال نمی‌کند. مستند رسمی: [Payment Gateway API v4](https://www.zarinpal.com/docs/paymentGateway/connectToGateway.html) و [Sandbox](https://next.zarinpal.com/paymentGateway/sandbox.html).

### دستیار توضیحات محصول
در پنل Products فرم محصول را باز کنید و «تولید هوشمند توضیحات» را بزنید. با `GEMINI_API_KEY`، API از Gemini 3.8 Flash متن پیشنهادی کوتاه/کامل، ویژگی‌ها و مشخصات را می‌گیرد؛ در نبود کلید یا اختلال API، یک پیش‌نویس محلیِ محافظه‌کارانه ارائه می‌شود. متن و ادعاهای فنی را پیش از ذخیره با مشخصات واقعی کالا بررسی کنید. کلید Gemini فقط در Vercel Environment Variables یا `.env` محلی قرار گیرد.

### استودیو هوش مصنوعی محصول (Product AI Studio)
بخش اختصاصی «استودیو هوش مصنوعی محصول» در پنل مدیریت طوبی (با دسترسی مستقیم از منوی مدیریت و دکمهٔ اختصاصی) جهت تبدیل عکس‌های خام و موبایلی کالاها به تصاویر تجاری و آتلیه‌ای کاتالوگ:
- **حفظ هویت محصول:** پرامپت ویرایش بر حفظ فرم، بندها، سگک، دوخت، لوگو، جنس و رنگ کالا تأکید می‌کند؛ خروجی AI را پیش از انتشار بررسی کنید.
- **سبک‌های متنوع استودیو:** ۷ تم حرفه‌ای شامل: 📦 کاتالوگ سفید، 🖤 استودیوی لوکس، ✨ مینیمال آرت، 🌿 لایف‌استایل، 👟 روی مدل، 📢 تبلیغاتی پویا و 🎨 پس‌زمینه سفارشی.
- **ابعاد و خروجی:** نسبت‌های ۱:۱ (مربعی اینستاگرام و سایت)، ۴:۵ (عمودی پرتره)، ۳:۴ (کاتالوگ) و ۱۶:۹ (بنر).
- **فهرست و چرخش مدل‌ها:** فهرست زندهٔ مدل‌های تصویر Puter از `puter.drivers.call('puter-image-generation', 'models', {})` دریافت می‌شود و با فهرست پشتیبان مستندشده ترکیب می‌گردد. مدل‌های دارای پشتیبانی تصویر مرجع به‌ترتیب چرخشی امتحان می‌شوند؛ خطاهای محدودیت/دسترس‌پذیری برای مدتی در مرورگر سرد می‌شوند و درخواست به مدل بعدی می‌رود. مدل‌های صرفاً متن‌به‌تصویر در فهرست قابل مشاهده اما برای ویرایش عکس مرجع غیرفعال‌اند.
- **اتصال مستقیم به محصولات:** امکان پیش‌نمایش تعاملی قبل و بعد، تنظیم خروجی به‌عنوان «تصویر اصلی محصول»، «افزودن به گالری تصاویر»، «دانلود تصویر باکیفیت» و «تولید مجدد».
- **اتصال و ذخیره:** تولید تصویر در مرورگر از طریق SDK و نشست Puter انجام می‌شود؛ `/api/ai/studio/status` فهرست پشتیبان مدل‌ها را می‌دهد و `/api/ai/studio/attach` برای افزودن تصویر به محصول است. فراخوانی قدیمی `/api/ai/studio/generate` به نشست مرورگر Puter دسترسی ندارد و در UI جدید استفاده نمی‌شود.

### بنر هیرو صفحهٔ اصلی (Deep Glass)
هیروی صفحهٔ اصلی با ترکیب‌بندی «کالای شارپ + پنل شیشه‌ای» پیاده شده است؛ همهٔ استایل‌ها در `stage4.css` و مارک‌آپ آن در `stage4.js` (تابع `home()`) قرار دارد:
- **اصل طراحی — کل بنر تار نمی‌شود:** فقط پنل متن سمت راست و حلقهٔ نازک پشت آن `backdrop-filter: blur(28px) saturate(165%)` دارند؛ تصویر کالا هیچ فیلتر تاری ندارد و کاملاً واضح و شارپ می‌ماند (`object-position: center`).
- **پنل گلس‌مورفیسم منحنی (شفافیت حداکثری):** کارت با `border-radius: 46px 46px 46px 150px` و `backdrop-filter: blur(34px) saturate(130%) brightness(1.05)`؛ تینت سفید فقط `0.065 → 0.01` است (تقریباً بی‌رنگ) و عمق صرفاً از لبهٔ درخشان، سایهٔ ملایم و سه بازتاب (هایلایت گوشه، نوار مورب، بازتاب سبز کم‌رنگ) می‌آید. هالهٔ سبز صحنه به پشت کارت منتقل نشده تا رنگ داخل شیشه تقویت نشود.
- **رینگ شیشه‌ای و هاله:** حلقهٔ بزرگ شیشه‌ای (`lux-hero-ring`) که فقط دور پنل می‌پیچد و کالا را نمی‌پوشاند، به‌همراه یک هالهٔ سبز محو (`lux-hero-glow`).
- **واترمارک تایپوگرافیک:** متن بزرگ `TOUBA SHOES` با `-webkit-text-stroke`، `direction: ltr` و اندازهٔ `clamp` که همیشه کامل داخل ناحیهٔ شارپ و دور از پنل می‌ماند.
- **دکمهٔ کپسولی و CTA شیشه‌ای:** دکمهٔ اصلی گرادیانی سبز با سایهٔ نئونی و دکمهٔ ثانویهٔ شیشه‌ای؛ همه با `border-radius: var(--radius-full)`.
- **ریسپانسیو:** در دسکتاپ کالا سمت چپ و پنل سمت راست؛ زیر ۸۶۰ پیکسل تصویر کالا به‌صورت نوار شارپ بالای بنر می‌آید و پنل شیشه‌ای با هم‌پوشانی (negative margin) پایین آن می‌نشیند تا هیچ‌وقت روی کالا نیفتد. تنظیمات اختصاصی برای ۱۲۸۰ / ۱۱۰۰ / ۸۶۰ / ۶۴۰ پیکسل.
- **دسترس‌پذیری:** عناصر تزئینی `aria-hidden`، انیمیشن ورود فقط با `prefers-reduced-motion: no-preference` و غیرفعال‌سازی آن با `reduce`.
- **رفع سرریز افقی هدر:** قواعد هدر فشرده (منوی همبرگری، جست‌وجوی آیکونی، کشوی موبایل) از بریک‌پوینت ۸۶۰ به ۱۱۰۰ منتقل شد تا در عرض‌های تبلت (۹۰۰–۱۰۲۴) هدر از کادر بیرون نزند و کل صفحه افقی اسکرول نشود.

## نقش‌های Demo (فقط وقتی Supabase Auth پیکربندی نشده)
در حالت آفلاین `/login` روی حساب نمونه کلیک کنید:
- Customer: `09120000001`
- Admin: `09120000002`
- Super Admin: `09120000003`

ورود فقط state محلی را تغییر می‌دهد؛ رمز، OTP، session یا احراز هویت واقعی وجود ندارد. Demo Admin به بخش‌های CMS/فروشگاه دسترسی دارد؛ ابزارهای Reset/Clear فقط برای Super Admin نمایش داده می‌شوند.

## Architecture / Data Layer
- `mock/seed-data.js`: داده‌های پایه و یک‌جای Demo؛ فقط اگر Storage خالی باشد Seed می‌شود.
- `services/data-provider.js`: Provider فروشگاه فعلاً Mock/LocalPersistence است؛ `services/supabase-auth.js` فقط Supabase Auth (email/password + PKCE) را اختیاری متصل می‌کند.
- `repositories/mock-repository.js`: قرارداد generic و عملیات CRUD/list/get/search/filter برای entityها.
- `repositories/bootstrap.js`: ساخت کاربران Demo، Home CMS defaults، Repository container و Application services.
- `services/application-services.js`: Product/Auth/Order/Coupon/Shipping/Payment/Review/Cart services؛ commerce همچنان روی Mock Repository است و فقط زرین‌پال به‌عنوان provider پرداخت پذیرفته می‌شود.
- `services/cart-functions.js`: عملیات Cart از طریق Cart repository.
- `stage3.js`: UI/route composition، checkout زرین‌پال و پردازش رسید؛ سفارش محلی Demo است.
- `types/domain.js`: JSDoc contracts؛ `prisma/schema.prisma` مدل relational معادل PostgreSQL/Supabase.
- `repositories/supabase-repository.stub.js`: فعلاً interface آینده؛ import یا اجرا نمی‌شود.
- `supabase/migrations/202609280001_initial_schema.sql` و migrationهای بعدی: schema/RLS نسخه‌بندی‌شده؛ مالک تأیید کرده اجرای اولیه در Actions سبز شده است. migration جدید `202609280002_active_profile_rls.sql` و migration جدید `202610020001_zarinpal_payment_provider.sql` با push به `main` خودکار اجرا می‌شوند؛ migration جدید default mock را برمی‌دارد و فقط provider زرین‌پال را می‌پذیرد.
- `.env.example`: placeholderهای عمومی Supabase، Cloudflare، Gemini و تنظیمات زرین‌پال؛ فایل واقعی `.env` از git خارج است. فقط URL/کلید public برای Auth به مرورگر می‌رسند؛ Merchant ID/State Secret زرین‌پال، کلیدهای AI و هر `service_role` باید سروری بمانند.

UI از state snapshot محلی استفاده می‌کند و persistence فقط از `DataProvider` عبور می‌کند؛ operations حساس فروش از `DemoServices` و Repositoryها انجام می‌شوند. در مرحله اتصال، composition root و adapter جایگزین می‌شوند؛ در صورت نیاز APIهای کاملاً async می‌توانند همان قرارداد repository را حفظ کنند.

## Demo flowها
### خرید
`/shop` → search/filter/sort/pagination → صفحه محصول → انتخاب رنگ و سایز → Cart → اعمال کوپن → Checkout → درخواست زرین‌پال در سرور → انتقال به StartPay → callback و verify سمت سرور → رسید امضاشده → نتیجهٔ سفارش. تست‌های E2E پاسخ‌های درگاه را stub می‌کنند؛ UI عمومی هیچ پرداخت mock یا روش پرداخت دیگری ندارد.

### پنل
`/admin` → Dashboard → Products (مدیریت سایز×رنگ و موجودی مستقل) → Orders (جستجو، فیلتر، جزئیات و status) → Coupons/Reviews → Banners/Homepage/Media/Settings. CMS homepage پس از ذخیره در storefront قابل مشاهده است. Shipping عادی/سریع/رایگان از Settings تنظیم می‌شود.

### ماندگاری / Reset
تمام state با کلید `toubashop-v1` در LocalStorage مرورگر فعلی ذخیره می‌شود. Super Admin در Admin → ابزار دمو می‌تواند Reset به Seed، Seed در Storage خالی، یا Clear Local Data انجام دهد. برای reset دستی همین کلید را از LocalStorage حذف کنید.

## انتشار خودکار تغییرات دیتابیس Supabase

هر تغییر ساختاری را به‌صورت یک فایل SQL جدید و شماره‌دار در `supabase/migrations/` ثبت کنید؛ migrationی را که قبلاً اجرا شده ویرایش نکنید. پس از commit و push به شاخهٔ `main`، GitHub Actions ابتدا `dry-run` می‌گیرد و سپس migrationهای pending را به‌ترتیب روی Supabase اعمال می‌کند. تغییر مستقیم در Supabase Dashboard، ویرایش فایل‌های اپ یا تغییر محلیِ push‌نشده به‌طور خودکار sync نمی‌شود.

پیش از اولین اجرا، در GitHub مخزن → **Settings → Secrets and variables → Actions** این سه Actions Secret را بسازید: `SUPABASE_ACCESS_TOKEN`، `SUPABASE_PROJECT_REF` و `SUPABASE_DB_PASSWORD`. مقادیر را فقط در GitHub Secrets نگه دارید؛ در چت، مخزن، Vercel یا کد مرورگر قرار ندهید. سپس در **Actions → Apply Supabase database migrations → Run workflow**، ورودی `confirm` را فعال کنید تا migration اولیه اجرا شود. اجرای دستی نیازمند تأیید صریح است؛ پس از آن push هر migration تازه به `main` خودکار اجرا می‌شود. جزئیات اولین اجرا و احتیاط برای schemaای که قبلاً دستی ساخته شده در `supabase/README.md` است.

این pipeline فقط schema را مدیریت می‌کند و به‌تنهایی storefront را به Supabase وصل نمی‌کند یا احراز هویت، سفارش، پرداخت و موجودی را Production-ready نمی‌سازد.

## تست‌های آفلاین
```bash
node tests/repository-crud.js
node tests/demo-e2e.js
node tests/zarinpal.js
```
تست E2E مسیر ساخت محصول و Variant، انتشار و جستجو، Login Demo، Cart/کوپن، Checkout زرین‌پال با API stub، رسید موفق/ناموفق، کاهش موجودی و ماندگاری محلی را بررسی می‌کند. تست gateway endpointهای رسمی، تبدیل تومان/ریال، اعتبار callback و امضای رسید را بدون تماس واقعی با شبکه می‌سنجد.

## وضعیت اتصال Production
Auth ایمیلی Supabase با runtime config فعال می‌شود، اما داده‌های محصول، سبد، سفارش و موجودی هنوز محلی هستند. درگاه رسمی زرین‌پال v4 پیاده‌سازی شده و Checkout فقط با `ZARINPAL_MODE=sandbox` فعال است؛ در حالت production API ایجاد پرداخت عمداً 503 می‌دهد تا سفارش محلی باعث دریافت وجه واقعی نشود. Production واقعی پس از پیاده‌سازی سفارش/قیمت/کوپن/موجودی سمت سرور و اتصال آن به زرین‌پال، تست callback/verify و اجرای E2E sandbox ممکن می‌شود.

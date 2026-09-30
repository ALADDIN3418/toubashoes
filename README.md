# کفش طوبی — فروشگاه فارسی RTL با Supabase Auth و حالت Demo

فروشگاه فارسی RTL، پنل CMS، mock checkout/payment، داده‌های Demo در LocalStorage و Repository/Service layer. اتصال ورود/ثبت‌نام ایمیلی Supabase به‌صورت اختیاری از تنظیمات عمومی پروژه فعال می‌شود؛ کاتالوگ، مدیریت فروشگاه، سفارش و موجودی هنوز به دیتابیس وصل نیستند و پرداخت همچنان mock است. پنل محصول، دستیار نگارش توضیحات با Gemini (به‌همراه پیش‌نویس محلی در نبود کلید) و استودیوی تولید تصویر سه‌زاویه‌ای دارد. تصویرها از Cloudflare Workers AI و مدل FLUX.2 [klein] 9B با سه تصویر مرجع ساخته می‌شوند.

## اجرا
- نیازمندی: Node.js 22+ (Supabase JS SDK در build بسته‌بندی می‌شود).
- `npm start` یا `node local-server.js`؛ سرور توسعه روی پورت 4173 باز می‌شود. روی Vercel، فایل `local-server.js` اجرا نمی‌شود؛ سایت به‌صورت static به‌همراه API Functions جداگانه منتشر می‌شود.
- تمام routeهای SPA با fallback سرور محلی و rewrite وریسل به `index.html` کار می‌کنند.
- `npm run build` اجرای syntax/build-check و بسته‌بندی SDK مرورگر Supabase؛ `npm test` تست Repository، API، Auth و Demo E2E را اجرا می‌کند.

## انتشار روی Vercel
- مخزن را در Vercel دوباره Deploy کنید (یا پس از push منتظر deploy خودکار GitHub بمانید). `vercel.json`، preset را روی Other/static قرار می‌دهد؛ `npm run build` فقط فایل‌های لازم وب را در `public/` آماده می‌کند، مسیرهای SPA به `index.html` می‌روند و endpointها به Vercel Functions متصل می‌شوند.
- صفحهٔ فروشگاه بدون کلیدهای AI هم بالا می‌آید. برای Gemini، `GEMINI_API_KEY` را فقط به‌صورت Environment Variable سمت‌سرور در Vercel تنظیم کنید. برای تصویر، Vercel به `CLOUDFLARE_ACCOUNT_ID` و `CLOUDFLARE_API_TOKEN` نیاز دارد. سهمیهٔ پایدار تصویر، Supabase URL و کلید عمومی (`SUPABASE_PUBLISHABLE_KEY` یا `SUPABASE_ANON_KEY`) را به‌همراه migration سهمیه می‌خواهد؛ service-role key لازم نیست. تا زمان merge و اجرای migration، endpoint در Vercel عمداً fail-closed است. هیچ کلیدی را در کد/مرورگر یا گفتگو قرار ندهید.
- احراز هویت ایمیلی Supabase اختیاری است. پرداخت و checkout واقعی خاموش‌اند؛ کاتالوگ/سفارش/موجودی فعلاً از Repository محلی و LocalStorage خوانده می‌شوند و CRUD آن‌ها هنوز به Supabase متصل نیست، بنابراین تغییرات مدیریت کاتالوگ سراسری یا همگام‌شده بین مرورگرها نیستند.

### اتصال Auth ایمیل/رمز Supabase

برای فعال‌کردن صفحهٔ واقعی ورود/ثبت‌نام در Vercel، در **Project → Settings → Environment Variables** فقط این موارد را برای Production (و در صورت نیاز Preview) اضافه کنید:

- `SUPABASE_URL`: URL پروژه از Supabase → Project Settings → API.
- `SUPABASE_PUBLISHABLE_KEY`: کلید publishable/public از همان بخش. اگر پروژه فقط کلید قدیمی دارد، می‌توانید به‌جای آن `SUPABASE_ANON_KEY` بگذارید.

این endpoint عمداً فقط URL و کلید عمومی را به مرورگر می‌دهد؛ `service_role`, database password و GitHub migration token را اضافه نکنید. بعد از افزودن متغیرها Redeploy کنید. در Supabase → **Authentication → URL Configuration**، Site URL را روی `https://toubashoes.vercel.app` بگذارید و Redirect URLهای `/login?verified=1` و `/reset-password` را مجاز کنید (پس از اتصال دامنهٔ نهایی، دامنهٔ همان‌جا هم اضافه شود). در Authentication → Providers، Email را فعال و تأیید ایمیل را روشن کنید؛ برای ارسال قابل‌اعتماد Production باید SMTP دامنهٔ تأییدشده را تنظیم کنید.

در حالت Supabase، حساب Demo و ورود مدیر نمایشی غیرفعال‌اند؛ signup فقط نقش `customer` می‌سازد. حساب مدیر را پس از ثبت‌نام/تأیید، فقط مالک از SQL Editor و با بررسی ایمیل به `super_admin` ارتقا دهد. ورود به پنل به پروفایل فعال Supabase وابسته است، اما مدیریت کاتالوگ/سفارش در حال حاضر از `g.db` و Mock Repository می‌خواند: فرم کامل، افزودن سریع و عملیات دسته‌جمعی می‌توانند همان Demo را ویرایش کنند، نه جداول Supabase. در Vercel این تغییرها فقط در LocalStorage همان مرورگر می‌مانند و نباید برای سفارش یا کاتالوگ واقعی استفاده شوند؛ در اجرای local server یک فایل Demo جدا نیز نگهداری می‌شود. Checkout و پرداخت مشتری Supabase واقعی/فعال نیستند.

### دستیار توضیحات محصول
در پنل Products فرم محصول را باز کنید و «تولید هوشمند توضیحات» را بزنید. با `GEMINI_API_KEY`، API از Gemini 3.8 Flash متن پیشنهادی کوتاه/کامل، ویژگی‌ها و مشخصات را می‌گیرد؛ در نبود کلید یا اختلال API، یک پیش‌نویس محلیِ محافظه‌کارانه ارائه می‌شود. متن و ادعاهای فنی را پیش از ذخیره با مشخصات واقعی کالا بررسی کنید. کلید Gemini فقط در Vercel Environment Variables یا `.env` محلی قرار گیرد.

### دستیار عکس محصول با Puter.js و GPT Image
استودیوی تصویر محصول در پنل مدیریت اکنون از طریق [Puter.js](https://developer.puter.com/tutorials/free-unlimited-openai-api/) به مدل‌های خانوادهٔ **GPT Image** متصل است و بدون نیاز به کلید خصوصی OpenAI کار می‌کند.
- **دسترسی عمومی و مدل User-Pays (رایگان):** در استودیوی محصول، دکمهٔ «ورود / اتصال به Puter (رایگان)» تعبیه شده است. مدیر با یک کلیک و بدون نیاز به ثبت کارت یا کلید، حساب رایگان Puter خود را متصل می‌کند و تولید تصویر مستقیماً از مرورگر اجرا می‌شود.
- **پشتیبانی از توکن سرور (`PUTER_AUTH_TOKEN`):** در صورت تمایل مالک فروشگاه، می‌توان متغیر `PUTER_AUTH_TOKEN` را در تنظیمات Vercel قرار داد تا درخواست‌های سروری و فال‌بک نیز بدون نیاز به اتصال تک‌تک مدیران انجام شوند.
- **مدل‌های پشتیبانی‌شده:**
  - `gpt-image-2.5-flare` (مدل پیش‌فرض؛ سریع، دقیق و باکیفیت بالا)
  - `gpt-image-2.5-sunburst` (روشنایی، وضوح و کنتراست پویا)
  - `gpt-image-2` (مدل استاندارد و کلاسیک)
- **تنظیمات کیفیت:** سطوح کیفی `low`، `medium`، `high` (پیش‌فرض)، `xhigh` و `max`.
- **ورودی تک‌عکس واضح:** مدیر یک تصویر واضح از محصول را انتخاب می‌کند؛ تصویر به اندازهٔ مناسب پیش‌پردازش شده و همراه سبک پس‌زمینه (استودیوی کرم، دارک لوکس، یا سنگ طبیعی) به مدل ارسال می‌شود.
- **پاک‌سازی و بهینه‌سازی Prompt:** متن‌های آزاد کاتالوگ از ورودی مدل حذف شده‌اند و دستورها منحصراً بر پایهٔ عکاسی تجاری محصولِ کفش (تک‌کفش با نورپردازی آتلیه‌ای، پایه‌ای تمیز و زاویهٔ دقیق) تنظیم شده‌اند تا از خطاهای کاذب فیلتر محتوا جلوگیری شود.
- **سقف و مدیریت سهمیه:** سقف اپلیکیشن ۵۰ خروجی موفق در روز UTC است و در صورت بروز هرگونه خطا سهمیه آزاد می‌شود.
- **خروجی نهایی:** تصویر نهایی در پنل پیش‌نمایش داده می‌شود و با تأیید مدیر، به فرم محصول اضافه می‌گردد.

برای Vercel، پس از merge و deploy، هیچ کلید OpenAI لازم نیست. برای سهمیهٔ پایدار، متغیرهای عمومی `SUPABASE_URL` و `SUPABASE_PUBLISHABLE_KEY` یا `SUPABASE_ANON_KEY` در Environment Variables تنظیم می‌شوند؛ Service-role key لازم نیست. سرور محلی نیز بدون نیاز به تنظیمات خاص کار می‌کند. خروجی در مرورگر به JPEG فشرده شده و پس از تأیید مدیر به فرم کاتالوگ اضافه می‌گردد.

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
- `services/application-services.js`: Product/Auth/Order/Coupon/Shipping/Payment/Review/Cart services؛ commerce همچنان روی Mock Repository است.
- `services/cart-functions.js`: عملیات Cart از طریق Cart repository.
- `stage3.js`: UI/route composition و flowهای demo.
- `types/domain.js`: JSDoc contracts؛ `prisma/schema.prisma` مدل relational معادل PostgreSQL/Supabase.
- `repositories/supabase-repository.stub.js`: فعلاً interface آینده؛ import یا اجرا نمی‌شود.
- `supabase/migrations/202609280001_initial_schema.sql` و migrationهای بعدی: schema/RLS نسخه‌بندی‌شده؛ مالک تأیید کرده اجرای اولیه در Actions سبز شده است. migration جدید `202609280002_active_profile_rls.sql` با push به `main` خودکار اجرا می‌شود.
- `.env.example`: placeholderهای تنظیم عمومی Supabase، Cloudflare و Gemini؛ فایل واقعی `.env` از git خارج است. فقط URL/کلید public برای Auth به مرورگر می‌رسند؛ کلیدهای AI و هر `service_role` باید سروری بمانند.

UI از state snapshot محلی استفاده می‌کند و persistence فقط از `DataProvider` عبور می‌کند؛ operations حساس فروش از `DemoServices` و Repositoryها انجام می‌شوند. در مرحله اتصال، composition root و adapter جایگزین می‌شوند؛ در صورت نیاز APIهای کاملاً async می‌توانند همان قرارداد repository را حفظ کنند.

## Demo flowها
### خرید
`/shop` → search/filter/sort/pagination → صفحه محصول → انتخاب رنگ و سایز → quick add → Cart → اعمال کوپن `TOUBA10` یا `WELCOME150` → Checkout → Mock Payment success/failure → Tracking. پرداخت موفق موجودی واریانت را فقط یک بار کم می‌کند؛ ناموفق، سفارش/payment failure را نگه می‌دارد، سبد را حفظ می‌کند و موجودی را کم نمی‌کند.

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
```
تست E2E بدون مرورگر یا شبکه مسیر ساخت محصول و Variant، انتشار و جستجو، Login Demo، افزودن Cart، کوپن، Checkout، پرداخت موفق و ناموفق، کاهش موجودی، تغییر وضعیت سفارش و بارگذاری مجدد از local persistence را بررسی می‌کند.

## وضعیت اتصال Production
Auth ایمیلی Supabase در کد آماده و با runtime config فعال می‌شود؛ پس از افزودن URL و public key در Vercel، signup/login، تأیید ایمیل، logout، بازیابی رمز و پروفایل role-checked به Auth/`profiles` وصل می‌شوند. مابقی provider همچنان Mock است: دادهٔ محصولات، سبد، سفارش‌ها، CMS و موجودی مرکزی نشده‌اند. Checkout و پرداخت mock برای کاربر Supabase عمداً بسته است. درگاه «بلوپال» تا ارائهٔ نام دقیق و مستندات رسمی، mock می‌ماند. Production واقعی پس از پیاده‌سازی و تست CRUD مدیر با RLS، RPC تراکنشی سفارش/stock، storage پایدار، SMTP، دامنه/محتوای واقعی، درگاه و end-to-end ممکن می‌شود.

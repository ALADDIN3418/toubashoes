# راهنمای عملیاتی‌کردن بله‌پی (Bale Pay) در فروشگاه کفش طوبی

این سند دقیقاً همان مراحلی را توضیح می‌دهد که باید انجام دهید تا درگاه کیف‌پول بله جایگزین‌شده در این مخزن، واقعاً وجه دریافت کند. کد جایگزین شده است، **اما بدون انجام مراحل زیر پرداخت فعال نمی‌شود** (طراحی عمداً fail-closed است).

مرجع رسمی: [بخش پرداخت مستندات بازوی بله](https://docs.bale.ai/#%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA) و [مستندات مینی‌اپ](https://docs.bale.ai/miniapp).

---

## ۰) نقشهٔ جریان پس از تغییر

```
مشتری (سبد → تأیید اطلاعات)
   │  POST /api/payment/balepay/request  (JWT مشتری، مبلغ از رکورد سفارش در Supabase)
   ▼
سرور ── createInvoiceLink ───────────► tapi.bale.ai/bot<token>/createInvoiceLink
   │        (title, description, payload ≤ 128B, provider_token, prices[IRR])
   │  ◄── invoiceParams (رشته)
   ├─ attach_balepay_invoice → payments.authority = blp_<32hex>
   ▼
مرورگر ── Bale.WebApp.openInvoice(invoiceParams) ──► صفحهٔ کیف‌پول بله
   │
   │  (بله) pre_checkout_query  ──► POST /api/payment/balepay/webhook
   │        سرور مبلغ را با سفارش می‌سنجد → answerPreCheckoutQuery(ok)  (سقف ۱۰ ثانیه)
   │        و transaction id را در payments.provider_reference ثبت می‌کند
   │  (بله) successful_payment   ──► همان webhook
   │        inquireTransaction ── status = paid و مبلغ برابر ──► settle_balepay_payment
   ▼
صفحهٔ /payment/result/<orderId> با /api/payment/balepay/receipt وضعیت پایدار را می‌خواند
```

نکتهٔ امنیتی مهم: **هیچ پرداختی بر اساس حرف مرورگر یا بدنهٔ وب‌هوک تأیید نمی‌شود**؛ تنها `inquireTransaction` (استعلام سمت سرور) + تطبیق مبلغ با `orders.total_toman` سفارش را `paid` می‌کند.

---

## ۱) پیش‌نیازهای حساب بله (۱۰ تا ۳۰ دقیقه، فقط یک بار)

1. اپلیکیشن یا نسخهٔ وب بله را با شمارهٔ کسب‌وکار باز کنید و **کیف‌پول بله را به سطح ۲ ارتقا** دهید: ثبت اطلاعات هویتی، **شماره کارت بانک ملی** و **شماره حساب بانک ملی**. بدون این مرحله توکن پرداخت صادر نمی‌شود.
2. در گفتگو با **`@botfather`**:
   - `/newbot` (یا بازوی موجود خود را انتخاب کنید) → **`BALEPAY_BOT_TOKEN`** را می‌گیرید (فرمت `123456789:abcd...`).
   - `/mybots` → بازو → **Payments** → توکن پرداخت کیف‌پول بسازید → **`BALEPAY_PROVIDER_TOKEN`**.
     برای آزمون می‌توانید به‌جای آن از توکن رسمی تست `WALLET-TEST-1111111111111111` استفاده کنید (پول جابه‌جا نمی‌شود).
   - `/mybots` → بازو → **Settings → Menu Button / Main Mini App** → آدرس مینی‌اپ را روی `https://<دامنهٔ فروشگاه>` تنظیم کنید (آدرس را با `?startapp` هم می‌توانید بدهید). مینی‌اپ فقط روی **HTTPS** کار می‌کند.
   - برای «مینی‌اپ اصلی» که کاربران بدون شروع گفتگو وارد شوند، گزینهٔ مربوط را در همان منو فعال کنید.
3. نام کاربری بازو (مثلاً `touba_shoes_bot`) را برای **`BALEPAY_BOT_USERNAME`** یادداشت کنید؛ پیوند `https://ble.ir/<username>?startapp=pay:<orderId>` با همین ساخته می‌شود.

> اگر می‌خواهید پرداخت در **گفتگوی بازو** هم ممکن باشد (بدون مینی‌اپ)، همان توکن‌ها کافی است: مسیر `sendInvoice` در کد پیاده شده و از CLI قابل تست است (بخش ۶).

---

## ۲) migration پایگاه داده (بدون آن هیچ وجهی ثبت نمی‌شود)

مخزن شامل `supabase/migrations/202610040001_balepay_provider.sql` است که:

- `check (provider = 'balepay')` را جایگزین محدودیت قدیمی می‌کند (اگر حتی یک ردیف پرداخت از درگاه قبلی باشد، migration عمداً خطا می‌دهد؛ اول آن ردیف‌ها را تعیین تکلیف کنید).
- `payments.authority` = شناسهٔ صورتحساب بله (`blp_<32hex>`) و `payments.provider_reference` = شناسهٔ تراکنش کیف‌پول.
- RPCهای `attach_balepay_invoice`، `settle_balepay_payment`، `expire_stale_balepay_checkouts` را می‌سازد، `create_order_with_payment` را برای درج `provider='balepay'` به‌روز می‌کند و `attach_zarinpal_authority`/`settle_zarinpal_payment` را حذف می‌کند.

اجرا (از CLI یا SQL Editor):

```bash
supabase link --project-ref <REF>
supabase db push --dry-run     # ابتدا diff را ببینید
supabase db push
```

یا در **SQL Editor** کل فایل را یک‌بار اجرا کنید. سپس تأیید کنید:

```sql
select public.commerce_health();                       -- schemaVersion باید 202610030001 یا بالاتر باشد
select provname from pg_constraint where conname='payments_provider_balepay_check';
select proname from pg_proc where proname in ('attach_balepay_invoice','settle_balepay_payment','expire_stale_balepay_checkouts');
```

اگر workflow «Supabase migrate» را در `.github/workflows` دارید، با پوش‌کردن migration روی `main` (یا اجرای دستی با `confirm=true`) همان مسیر اجرا می‌شود.

---

## ۳) متغیرهای محیطی (همه‌چیز در یک جا)

فهرست کامل، آمادهٔ کپی/چسباندن: **`vercel.env.example`** (الگوی Git) و
**`vercel.env.local`** (همان فایل با مقدارهای شما؛ به‌دلیل `*.env.local` در `.gitignore` هرگز commit نمی‌شود).
آزمون `node tests/balepay.js` نگهبانی می‌کند که هر کلیدی که کد می‌خواند در این دو الگو باشد؛ پس اگر کلید تازه‌ای اضافه کردید و آن را مستند نکردید، CI قرمز می‌شود.

| متغیر | نوع در Vercel | مقدار | توضیح |
|---|---|---|---|
| `BALEPAY_MODE` | Config | `sandbox` → سپس `production` | حالت جاری |
| `BALEPAY_BOT_TOKEN` | **Secret** | توکن بازو از @botfather | فقط سمت سرور؛ هرگز به مرورگر داده نشود |
| `BALEPAY_PROVIDER_TOKEN` | **Secret** | `WALLET-TEST-1111111111111111` → توکن واقعی | توکن پرداخت کیف‌پول همان بازو |
| `BALEPAY_STATE_SECRET` | **Secret** | تصادفی ≥۳۲ کاراکتر | امضای payload صورتحساب و رسید |
| `BALEPAY_BOT_USERNAME` | Config | `touba_shoes_bot` | ساخت پیوند مینی‌اپ `https://ble.ir/<username>` |
| `BALEPAY_PUBLIC_ORIGIN` | Config | `https://<دامنهٔ فروشگاه>` | فقط برای ساخت خودکار آدرس وب‌هوک در CLI |
| `BALEPAY_WEBHOOK_SECRET` | **Secret** | تصادفی ≥۱۶ کاراکتر | بررسی هدر `x-balepay-secret` در وب‌هوک |
| `BALEPAY_REQUIRE_WEBHOOK_SECRET` | Config | `false` تا `true` | اگر `true` باشد، وب‌هوکِ بدون هدر درست ۴۰۱ می‌گیرد |
| `BALEPAY_ENABLE_LIVE_PAYMENTS` | Config | تا تأیید آزمون‌ها `false` | کلید بازکردن دریافت وجه واقعی |
| `BALEPAY_API_BASE` | Config | خالی (پیش‌فرض `https://tapi.bale.ai`) | فقط برای عیب‌یابی |
| `SUPABASE_URL` | Config | `https://<ref>.supabase.co` | REST و احراز هویت |
| `SUPABASE_PUBLISHABLE_KEY` | Config | public/publishable key | در `api/supabase-config.js` به مرورگر داده می‌شود |
| `SUPABASE_ANON_KEY` | Config | در پروژه‌های قدیمی | نام دیگر کلید عمومی |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | service_role | نوشتن سفارش/پرداخت؛ فقط سمت سرور |
| `GEMINI_API_KEY` | **Secret** | در صورت استفاده از دستیار توضیحات | اختیاری |

`BALEPAY_STATE_SECRET` را این‌طور بسازید و در هر محیط (Vercel و `.env` محلی) یکسان بگذارید تا رسیدهای صادرشده بازنشانی نشوند:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### ۳.۱) اعمال روی Vercel با یک دستور

```bash
cp vercel.env.example vercel.env.local      # مقدارهای خالی را پر کنید
npm run vercel:env -- --project <نام-پروژه> --dry-run   # پیش‌نمایش؛ چیزی نوشته نمی‌شود
VERCEL_TOKEN=vcp_xxx npm run vercel:env -- --project <نام-پروژه>
npm run vercel:env:list -- --project <نام-پروژه>        # تأیید: فقط نام کلیدها و نوعشان
```

`scripts/vercel-env.js` از REST API ورسل (`POST /v10/projects/<id>/env?upsert=true`) استفاده می‌کند،
بنابراین اگر کلیدی از قبل موجود باشد **به‌روزرسانی** می‌شود؛ فقط `production/preview/development` را هدف
می‌گیرد (با `--targets` عوض می‌شود)؛ و مقدارها را هرگز چاپ یا لاگ نمی‌کند. با `--secret-type=sensitive`
کلیدهای راز به‌صورت write-only ساخته می‌شوند (بعد از ذخیره قابل خواندن نخواهند بود). برای تیم:
`--team <team-slug>`. توکن را از Vercel → Account Settings → Tokens بگیرید و آن را در فایل نینویزید.

### ۳.۲) راه دستی (اگر ترجیح می‌دهید)

Vercel → پروژه → Settings → Environment Variables → *Add New*: برای هر ردیف بالا **Key** را کپی کنید،
مقدار را Paste کنید، نوع را روی **Secret** (برای ردیف‌های bold) یا **Config** بگذارید و هر سه Environment
(Production/Preview/Development) را تیک بزنید. سپس **Deployments → ⋯ → Redeploy**.

پس از هر تغییر، حتماً **Redeploy** کنید. هیچ‌کدام از این مقادیر در API عمومی یا پنل ادمین نمایش داده
نمی‌شوند (فقط `providerTokenKind` و وضعیت پیکربندی). با
`node scripts/vercel-env.js --check --project <name>` می‌توانید مطمئن شوید هیچ کلیدی جا نمانده است.

---

## ۴) ثبت Webhook (این مرحله تعیین‌کنندهٔ تأیید پرداخت است)

تا وقتی بله آپدیت‌های پرداخت را برای شما نفرستد، پرداخت موفق کاربر **در حالت `pending_payment` می‌ماند** (چون فقط رویداد بازو، شناسهٔ تراکنش را به فروشگاه می‌رساند).

```bash
# روی دامنهٔ عمومیِ HTTPS (پورت فقط 443 یا 88):
node scripts/balepay-cli.js webhook:set https://shop.example.com/api/payment/balepay/webhook
node scripts/balepay-cli.js webhook:status     # باید url همان نشانی باشد
```

- مسیر وب‌هوک در Vercel یک Serverless Function است (`api/payment/balepay/webhook.js`)؛ اگر در حال توسعه روی `localhost` هستید، بله به آن دسترسی ندارد → به‌جای webhook از **poll** استفاده کنید:

```bash
node scripts/balepay-cli.js webhook:delete     # getUpdates و webhook با هم کار نمی‌کنند
node scripts/balepay-cli.js poll               # long-polling getUpdates و settle خودکار
```

- `BALEPAY_WEBHOOK_SECRET` را اگر ست کرده‌اید با `BALEPAY_REQUIRE_WEBHOOK_SECRET=true` الزامی کنید؛ در غیر این صورت اعتبار آپدیت از همان ابتدا با تطبیق `payload` امضاشده + مبلغ سفارش + `inquireTransaction` انجام می‌شود.
- هندلر idempotent است: ارسال دوبارهٔ همان `successful_payment` خطا نمی‌دهد و پرداخت `verified` تغییر نمی‌کند.

---

## ۵) آزمون end-to-end پیش از دریافت وجه واقعی

1. `node scripts/balepay-cli.js config` → `configured: true`، `mode: sandbox`، `livePaymentsAllowed: true`.
2. فروشگاه را با `BALEPAY_PROVIDER_TOKEN=WALLET-TEST-1111111111111111` و یک حساب مشتری واقعی (یا test) باز کنید.
3. مسیر خرید: سبد → `/checkout` → «پرداخت با کیف‌پول بله».
   - اگر سایت **داخل بله** (مینی‌اپ) باز شده باشد، `openInvoice` مستقیماً صفحهٔ کیف‌پول را باز می‌کند.
   - اگر در مرورگر عادی باز شود و بله به‌جای شناسه، پیوند HTTPS برگرداند، کاربر به همان نشانی منتقل می‌شود؛ در غیر این صورت مودال «باز کردن پرداخت در بله» با پیوند `https://ble.ir/<bot>?startapp=pay:<orderId>` نمایش داده می‌شود.
4. پرداخت را (با توکن تستی) تأیید کنید و بررسی کنید:
   - `payments.status` → `verified`، `provider_reference` = شناسهٔ تراکنش، `orders.status` → `paid`.
   - صفحهٔ نتیجه پس از حداکثر چند ثانیه «پرداخت با موفقیت انجام شد» را نشان می‌دهد (اگر `pending` ماند: `node scripts/balepay-cli.js poll` را اجرا کنید؛ یعنی وب‌هوک نمی‌رسد).
5. سناریوهای منفی را هم تست کنید: بستن صفحهٔ پرداخت (باید سفارش `pending_payment` بماند و پس از مهلت لغو شود)، دو checkout هم‌زمان روی یک واریانت، و `inquire <transaction_id>`.

```bash
node scripts/balepay-cli.js inquire <transaction_id> --irr 1250000
```

---

## ۶) دستورهای CLI که به‌کار می‌آیند

```bash
node scripts/balepay-cli.js config                                  # وضعیت پیکربندی بدون افشای کلیدها
node scripts/balepay-cli.js webhook:set <https-url>                 # ثبت وب‌هوک
node scripts/balepay-cli.js webhook:status | webhook:delete
node scripts/balepay-cli.js poll                                    # دریافت آپدیت با long-polling (محلی)
node scripts/balepay-cli.js invoice --order <uuid> --toman 250000   # ساخت صورتحساب آزمایشی (createInvoiceLink)
node scripts/balepay-cli.js send --chat <chat_id> --toman 250000    # sendInvoice داخل گفتگو (مسیر جایگزین)
node scripts/balepay-cli.js inquire <transaction_id>                # inquireTransaction
node scripts/balepay-cli.js expire --minutes 360                    # آزادسازی صورتحساب‌های رهاشده
```

`expire_stale_balepay_checkouts` فقط پرداخت‌هایی را لغو و موجودی را برمی‌گرداند که **هرگز شناسهٔ تراکنش بله نگرفته‌اند** (یعنی پولی جابه‌جا نشده). برای cron مثلاً `node scripts/balepay-cli.js expire --minutes 360` را ساعتی اجرا کنید.

---

## ۷) فعال‌سازی دریافت وجه واقعی

پس از موفقیت مرحلهٔ ۵:

1. در `@botfather` توکن پرداخت **واقعی** کیف‌پول را بگیرید.
2. `BALEPAY_MODE=production`، `BALEPAY_PROVIDER_TOKEN=<توکن واقعی>`، و فقط سپس `BALEPAY_ENABLE_LIVE_PAYMENTS=true`. اگر توکن تستی در production بماند، سرور عمداً ۵۰۳ می‌دهد.
3. Redeploy و یک تراکنش واقعی کوچک (حداقل ۱۰۰۰ تومان) انجام دهید؛ مبلغ باید بلافاصله به کیف‌پول توسعه‌دهندهٔ بازو واریز شود (تسویه/برداشت از کیف‌پول بله و بانک ملی انجام می‌شود).
4. مانیتورینگ ساده: وضعیت‌های `payments` با `status='pending'` و `provider='balepay'` که بیش از ۱۵ دقیقه عمر دارند = وب‌هوک نمی‌رسد.

```sql
select p.id, o.number, p.amount_toman, p.created_at
from public.payments p join public.orders o on o.id = p.order_id
where p.provider='balepay' and p.status='pending' and p.created_at < now() - interval '15 minutes';
```

### ۷.۱) همان تغییرها بدون باز کردن داشبورد

```bash
sed -i 's/^BALEPAY_MODE=.*/BALEPAY_MODE=production/; s/^BALEPAY_ENABLE_LIVE_PAYMENTS=.*/BALEPAY_ENABLE_LIVE_PAYMENTS=true/' vercel.env.local
printf 'BALEPAY_PROVIDER_TOKEN=<توکن واقعی کیف‌پول>
' >> vercel.env.local   # خط تازه بر تکراری اولویت دارد
VERCEL_TOKEN=vcp_xxx npm run vercel:env -- --project <name>
node scripts/vercel-env.js --list --project <name>
```

پیش از `BALEPAY_ENABLE_LIVE_PAYMENTS=true` این سه مورد باید در حالت sandbox تأیید شده باشد (مرحله ۵):
تراکنش موفق در کیف‌پول بله، `payments.status='verified'` همراه `provider_payment_charge_id`، و
آزادشدن موجودی در مسیر لغو.

---

## ۷.۲) نکات دامنه، iframe و هدرهای امنیتی

- `vercel.json` هدر `X-Frame-Options: DENY` را روی همهٔ مسیرها اعمال می‌کند. در اپ موبایل بله، مینی‌اپ در Webview باز می‌شود و این هدر مشکلی ایجاد نمی‌کند؛ اما اگر کاربران نسخهٔ **وب بله** مینی‌اپ را داخل `<iframe>` ببینند و صفحه سفید شود، باید همان مسیر را با `frame-ancestors 'self' https://ble.ir` (و حذف/تغییر `X-Frame-Options` برای مسیر `/checkout`) آزاد کنید. این کار سطح محافظت clickjacking را تغییر می‌دهد؛ فقط پس از تأیید نیاز انجامش دهید و `scripts/check.js` را هم به‌روز کنید (تست، وجود هر چهار هدر امنیتی را الزامی می‌کند).
- صفحهٔ پرداخت داخل خود اپ بله باز می‌شود، پس لازم نیست `tapi.bale.ai` یا `ble.ir` را در CSP اجازه بدهید؛ مینی‌اپ تنها `https://tapi.bale.ai/miniapp.js` را از SDK بارگذاری می‌کند. اگر بعداً Content-Security-Policy اضافه کردید، `script-src 'self' https://tapi.bale.ai` لازم است.

## ۸) عیب‌یابی سریع

| نشانه | علت رایج | کار |
|---|---|---|
| `503` هنگام شروع پرداخت و پیام «توکن بازو… نیست» | `BALEPAY_BOT_TOKEN` تنظیم/اعمال نشده | مقدار را در Vercel ست و Redeploy کنید |
| «… از @botfather اطمینان حاصل کنید» هنگام ساخت صورتحساب | پرداخت کیف‌پول برای بازو فعال نشده یا provider token غلط است | `/mybots → Payments` و توکن را بازبینی کنید |
| پرداخت انجام شد ولی سفارش `pending_payment` ماند | وب‌هوک ثبت نشده / در دسترس نیست | `webhook:status`، سپس `poll` برای تست؛ لاگ Vercel را ببینید |
| `pre_checkout` رد شد و کاربر «سفارش در دسترس نیست» دید | payload امضاشده منقضی شده (۲۴ ساعت) یا ردیف پرداخت پیدا نشد | migration/`attach` را بررسی کنید؛ از checkout تازه استفاده کنید |
| «مبلغ تراکنش بله با مبلغ سفارش هم‌خوانی ندارد» | تغییر قیمت/تخفیف بین ساخت صورتحساب و پرداخت | تراکنش دستی را بازپرداخت و سفارش را اصلاح کنید |
| سفارش‌های رهاشده موجودی را نگه داشته‌اند | کاربر صورتحساب را باز و نبسته | `expire --minutes 360` یا cron |

---

## ۹) چه چیزی هنوز تأیید نشده است

- این تغییرات روی **Supabase واقعی** و **tapi.bale.ai واقعی** اجرا نشده‌اند (تست‌های `npm test` همه را با stub می‌سنجند).
- مستندات بله شکل خروجی `createInvoiceLink` را «یک رشته» توضیح می‌دهد و آن را برای `openInvoice` مینی‌اپ تعریف می‌کند؛ اگر در عمل این مقدار یک URL کامل باشد، کد به‌طور خودکار مسیر redirect را انتخاب می‌کند. رفتار دقیق در محیط واقعی را در همان آزمون مرحلهٔ ۵ تأیید کنید.
- بله در مستندات بازو، مکانیزم امضای هدر وب‌هوک را اعلام نکرده است؛ `BALEPAY_WEBHOOK_SECRET` اختیاری و بر پایهٔ هدر `x-balepay-secret` است. چون تأیید مالی همیشه با `inquireTransaction` انجام می‌شود، وب‌هوک به‌تنهایی منبع اعتماد نیست.
- بازپرداخت (refund) در کد پیاده نشده؛ اگر لازم است باید از طریق پشتیبانی/زیرساخت بله انجام و در `payments.callback_payload` ثبت شود.

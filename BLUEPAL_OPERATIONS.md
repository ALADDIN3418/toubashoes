# عملیات بلو پال (BluePal) — راهنمای راه‌اندازی، آزمون و عیب‌یابی

این فایل تنها راهنمای عملی پرداخت فروشگاه «کفش طوبی» است. درگاه قبلی (**بله‌پی / کیف‌پول بله**)
به‌طور کامل حذف شده است: هیچ فایل، متغیر محیطی، مسیر API، تابع Supabase یا دکمه‌ای از آن باقی
نمانده و درگاه بازنشسته در دیتابیس هم `drop` می‌شود.

مستندات مرجع درگاه: <https://www.bluepal.ir/developers> (پایگاه `https://www.bluepal.ir/api`).

---

## ۱) درگاه چگونه کار می‌کند (سه فراخوانی، نه بیشتر)

| # | فراخوانی | چه‌کسی | نتیجه |
|---|----------|-------|-------|
| ۱ | `POST /v1/payments/request` | سرور فروشگاه (کلید API در هدر `Authorization: Bearer`) | `result:100` + `track_id` + `payment_url` |
| ۲ | پرش مرورگر به `payment_url` | مشتری، در صفحهٔ بانک | کارت و رمز هرگز به این سایت برنمی‌گردد |
| ۳ | `GET /v1/payments/verify/{track_id}` | سرور فروشگاه | تنها مسیر نهایی‌سازی سفارش |

* `amount` در درخواست **عدد صحیح به تومان** است. کل فروشگاه هم به تومان کار می‌کند
  (`payments.amount_toman`) و هیچ‌جا ضربدر ۱۰ انجام نمی‌شود؛ `amountRial` فقط برای نمایش است.
* بازگشت مشتری به `callback_url` **به‌خودی‌خود دلیل پرداخت نیست**. حتی اگر کسی آن آدرس را
  دستی باز کند، سفارش فقط وقتی `paid` می‌شود که `GET verify` کد `100` (یا `201`) بدهد.
* مبلغ پرداختی از پاسخ درگاه خوانده و اعمال **نمی‌شود**؛ مبلغ از ردیف سفارش در Supabase
  گرفته می‌شود و مبلغ اعلامی درگاه فقط مقایسه می‌گردد (در صورت اختلاف، تسویه متوقف می‌شود).
* اعلان نتیجه پرداخت (اعلان پنل بلو پال) **اختیاری** است: `notify` هم همان `track_id` را از
  خود درگاه استعلام می‌کند و همان مسیر تک‌مصرف تسویه را صدا می‌زند.

مسیرهای سمت سرور (همه در `api/payment/bluepal/` و `lib/bluepal.js`):

| مسیر | روش | کار |
|------|-----|-----|
| `/api/payment/bluepal/request` | `POST` | ساخت درخواست پرداخت، ذخیره `track_id` با RPC `attach_bluepal_payment`، دادن `payment_url` به مرورگر |
| `/api/payment/bluepal/receipt` | `POST` | استعلام وضعیت + تسویه (از صفحهٔ نتیجه و polling) |
| `/api/payment/bluepal/callback` | `GET` | بازگشت مرورگر از بانک → پس از verify، ریدایرکت به `/payment/result/<orderId>` |
| `/api/payment/bluepal/notify` | `POST` | اعلان پنل بلو پال (سرنخ؛ body هرگز منبع تأیید نیست) |
| `/api/payment/bluepal/status` | `GET` | وضعیت پیکربندی برای پنل ادمین (بدون هیچ رازی) |

---

## ۲) کاری که شما باید در پنل بلو پال انجام دهید

1. در `bluepal.ir` ثبت‌نام کنید → بلافاصله **کلید آزمایشی** (`sk_test_…`) و **شناسه پذیرنده**
   (`merchant_id`) را در پنل می‌گیرید (قبل از احراز هویت هم کار می‌کند).
2. احراز هویت/تأیید حساب: حداکثر یک روز کاری؛ شماره **شبا باید به نام خودِ پذیرنده** باشد.
   بدون تأیید، کد `105` (پذیرنده فعال نیست) می‌گیرید و وجه واقعی قابل دریافت نیست.
3. پس از آزمون موفق، **کلید عملیاتی** (`sk_live_…`) را از همان پنل بردارید.
4. اختیاری: در پنل، آدرس اعلان نتیجه را روی
   `https://<دامنه‌ی‌فروشگاه>/api/payment/bluepal/notify` بگذارید. اگر پنل هدر امضا داد،
   `BLUEPAL_WEBHOOK_SIGNATURE_HEADER` و `BLUEPAL_WEBHOOK_SECRET` را ست کنید و
   `BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE=true` را بزنید.
5. تسویه: پیش‌فرض روزانه است (تسویه آنی با کارمزد اضافه انتخابی است). بازگشت وجه فقط از پنل
   و تا ۷۲ ساعت اگر تراکنش تأییدنشده بماند، امکان‌پذیر است.

---

## ۳) متغیرهای محیطی

فقط سه مقدار از خودِ درگاه لازم است؛ بقیه کلیدهای ایمنی/عملیاتی خودمان است.

| کلید | الزامی | نوع | توضیح |
|------|--------|-----|-------|
| `BLUEPAL_API_KEY` | بله | راز | `sk_test_…` برای آزمون، `sk_live_…` برای وجه واقعی. پیشوند باید با `BLUEPAL_MODE` هم‌خوان باشد. |
| `BLUEPAL_MERCHANT_ID` | بله | — | `merchant_id` پنل (بدون آن `102` می‌گیرید). |
| `BLUEPAL_STATE_SECRET` | بله | راز | رشتهٔ تصادفی ≥ ۳۲ بایت؛ امضای رسید و `sig` آدرس بازگشت. تولید: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `BLUEPAL_MODE` | بله | — | `sandbox` یا `production`. مقدار نامعتبر = پرداخت خاموش. |
| `BLUEPAL_ENABLE_LIVE_PAYMENTS` | برای وجه واقعی | — | تا `true` نشود، در `production` درخواست پرداخت ساخته نمی‌شود (قفل عمدی). |
| `BLUEPAL_API_BASE` | اختیاری | — | پیش‌فرض `https://www.bluepal.ir/api`؛ فقط برای عیب‌یابی تغییر دهید. |
| `BLUEPAL_PUBLIC_ORIGIN` | اختیاری | — | نشانی HTTPS فروشگاه؛ وقتی مبدأ درخواست قابل‌اطمینان نیست برای `callback_url`. |
| `BLUEPAL_ALLOWED_PAY_HOSTS` | اختیاری | — | میزبان‌های مجاز `payment_url` (پیش‌فرض: میزبان API). |
| `BLUEPAL_WEBHOOK_SECRET` | اختیاری | راز | راز ≥۱۶ کاراکتری هدر امضای اعلان. |
| `BLUEPAL_WEBHOOK_SIGNATURE_HEADER` | اختیاری | — | نام هدر امضا (پیش‌فرض `x-bluepal-signature`). |
| `BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE` | اختیاری | — | `true` ⇒ اعلان بدون هدر درست `401` می‌گیرد. |
| `BLUEPAL_REQUIRE_MERCHANT_ID` | اختیاری | — | `true` ⇒ نبودِ `merchant_id` حتی در sandbox هم پیکربندی را نامعتبر می‌کند. |
| `BLUEPAL_SETTLE_GRACE_MINUTES` | اختیاری | — | مهلت تأیید نشدن پرداخت (کف ۶۰، پیش‌فرض ۱۸۰). |

### اعمال روی Vercel (یک‌جا، بدون چاپ مقدارها)

```bash
cp vercel.env.example vercel.env.local      # بیرون از Git بماند
# مقدارهای خالی را پر کنید
VERCEL_TOKEN=vcp_xxx npm run vercel:env -- --project <نام-پروژه> --dry-run
VERCEL_TOKEN=vcp_xxx npm run vercel:env -- --project <نام-پروژه>
npm run vercel:env:list -- --project <نام-پروژه>     # فقط نام کلیدها
npm run vercel:env -- --check --project <نام-پروژه> # آیا همه ست شده‌اند؟
```

بعد از هر تغییر متغیرها، در داشبورد Vercel **Redeploy** بزنید (متغیرها به build موجود تزریق نمی‌شوند).
کلیدهای راز به‌صورت `sensitive`/`encrypted` ذخیره می‌شوند و در لاگ چاپ نمی‌شوند.
اگر توکن Vercel را ندارید، همان ۱۳ کلید را دستی در **Settings → Environment Variables** بگذارید.

> یادداشت Vercel: اگر جنریشن دیپلوی به‌خاطر «not allowed to deploy» مسدود شد، مشکل **نویسندهٔ
> commit** است نه کد؛ کامیت‌ها باید با ایمیل صاحب پروژه امضا شوند. راه‌حل: کامیت را با
> `git commit --amend --reset-author` اصلاح و `--force-with-lease` بفرستید یا از منوی ⋯ **Redeploy** استفاده کنید.

---

## ۴) آزمون end-to-end (محیط sandbox)

پرداخت آزمایشی با **کارت‌های آزمایشی** شبیه‌سازی می‌شود؛ هیچ endpoint «simulate» وجود ندارد:

| نتیجه | شماره کارت | CVV2 |
|-------|-------------|------|
| موفق | `5022 2910 0000 0008` | `123` |
| موجودی ناکافی | `5022 2910 0000 0016` | `123` |
| رمز دوم اشتباه | `5022 2910 0000 0024` | `123` |

چک‌لیست آزمون:

1. `node scripts/bluepal-cli.js verify` ⇒ همه `ok:true` (به‌جز `livePaymentsAllowed` که در sandbox بی‌اهمیت است).
2. یک حساب مشتری بسازید، سفارش را تا پایان چک‌اوت ببرید، «پرداخت آنلاین بانکی» را بزنید ⇒ به `payment_url` می‌روید.
3. `5022…0008` ⇒ برمی‌گردید روی `/payment/result/<uuid>`؛ صفحه باید `paid` را نشان دهد و در پنل ادمین سفارش `پرداخت شده` شود.
4. موجودی‌ها کم شده و سبد مشتری پاک شده باشد (توسط `settle_bluepal_payment`).
5. با کارت ناموفق: `202` ⇒ سفارش `pending` می‌ماند، پیام «مبلغی کسر نشده» نمایش داده می‌شود و دکمهٔ تلاش دوباره همان سفارش را به `track_id` تازه وصل می‌کند.
6. پس از موفقیت، تراکنش‌های sandbox در گزارش مالی پنل دیده نمی‌شوند (طبیعی است).
7. `npm test && node scripts/check.js` باید سبز باشد.

برای وجه واقعی: `BLUEPAL_MODE=production` + `BLUEPAL_API_KEY=sk_live_…` + `BLUEPAL_ENABLE_LIVE_PAYMENTS=true`، Redeploy، سپس یک خرید واقعی کوچک و بررسی واریز در پنل.

---

## ۵) کدهای پاسخ و اقدام لازم

| کد | معنی | اقدام فروشگاه |
|----|------|----------------|
| `100` | تراکنش با موفقیت | تسویه (RPC `settle_bluepal_payment`) — سپس تحویل کالا |
| `102` | پارامتر الزامی نیامده | `BLUEPAL_MERCHANT_ID`/مبلغ صحیح را اصلاح کنید (پیکربندی، نه مشتری) |
| `105` | پذیرنده فعال نیست | دریافت وجه متوقف؛ وضعیت حساب را در پنل ببینید |
| `201` | قبلاً تأیید شده | موفق و بی‌ضرر؛ تسویه یک‌مصرف است و دوباره تحویل داده نمی‌شود |
| `202` | ناموفق، کسر نشده | سفارش `pending` می‌ماند؛ به مشتری «تلاش دوباره» بگویید |
| `404` | تراکنش پیدا نشد | `track_id` را با پنل مقابله کنید؛ هرگز تسویه نمی‌شود |
| `429` | نرخ درخواست بالا | polling فروشگاه خودکار با تایمر است؛ `503` موقت |

`node scripts/bluepal-cli.js codes` همین جدول را در ترمینال می‌دهد.

---

## ۶) ابزارهای خط فرمان

```bash
npm run bluepal:status                 # پیکربندی (بدون رازها)
npm run bluepal:check                  # بررسی کامل پیش‌از‌انتشار (env parity + migration + routes)
npm run bluepal:expire -- --minutes 180  # آزادسازی رزرو سفارش‌های رهاشده

node scripts/bluepal-cli.js request --toman 250000 --order <uuid>   # فقط ثبت درخواست (آزمون سروری)
node scripts/bluepal-cli.js status  --track TRK-8841203991          # خواندن وضعیت واقعی یک تراکنش
node scripts/bluepal-cli.js settle  --order <uuid>                  # سفارش معطل: verify و تسویه
node scripts/bluepal-cli.js help
```

`settle` و `expire` به `SUPABASE_SERVICE_ROLE_KEY` نیاز دارند و از فایل `.env` کنار پروژه می‌خوانند.
`settle` هرگز چیزی را نمی‌سازد؛ فقط همان `track_id` ذخیره‌شده را از درگاه می‌پرسد.

---

## ۷) دیتابیس و مهاجرت‌ها

* `supabase/migrations/202610050001_bluepal_provider.sql` ستون `provider` را روی `bluepal`
  قفل می‌کند (`check (provider = 'bluepal')` + حذف default)، RPCهای
  `attach_bluepal_payment` / `settle_bluepal_payment` / `expire_stale_bluepal_checkouts` را
  می‌سازد و RPCهای درگاه‌های قبلی را `drop` می‌کند.
* اگر ردیف `pending` از درگاه قبلی مانده باشد، همان جاروب بسته و رزروها آزاد می‌شود؛
  اما اگر ردیفی با وجه تأییدشده (`verified`/`refunded`) وجود داشته باشد، مهاجرت **متوقف**
  می‌شود و باید اول دستی تکلیفش را روشن کنید (مهاجرت عمداً fail-closed است).
  در یک دیتابیس تازه که هرگز درگاه قبلی اجرا نشده، این اتفاق نمی‌افتد.
* اجرای مهاجرت: `supabase db push` (کلیدهای `SUPABASE_*` به‌صورت repository secret در
  `.github/workflows/supabase-db-push.yml`) یا کپی کل فایل در **SQL Editor** کنسول Supabase.
  پس از اجرا، `notify pgrst, 'reload schema'` در انتهای فایل کش PostgREST را تازه می‌کند.
* لغو سفارش: تا ۱۰ دقیقه پس از ساخت `track_id`، لغو توسط مشتری مسدود است
  (`gateway_verification_pending`) تا سفارشی که همین حالا در بانک پرداخت شده بی‌صدا لغو نشود؛
  بعد از آن مهلت، جاروب انقضا آزادش می‌کند.

---

## ۸) عیب‌یابی

| نشانه | علت محتمل | کار |
|-------|-----------|-----|
| `403` روی `request` | از دامنهٔ دیگری درخواست آمده (Origin) یا مشتری لاگین نکرده | از همان دامنهٔ فروشگاه استفاده کنید |
| «کلید API … معتبر نیست» | کلید، محیط، یا `BLUEPAL_MODE` ناهمخوان | `sk_test_` با sandbox، `sk_live_` با production |
| مشتری به `/checkout` برمی‌گردد نه صفحهٔ نتیجه | `order` در `callback_url` معتبر نبوده | `BLUEPAL_PUBLIC_ORIGIN` را ست و لاگ سرور را ببینید |
| پرداخت موفق ولی سفارش `pending` | `verify` اجرا نشده (شبکه/۴۲۹) یا مشتری زودتر بسته | `node scripts/bluepal-cli.js settle --order <uuid>` |
| `404` روی notify | `track_id` به این پذیرنده نیست | هدر/آدرس را در پنل بررسی کنید؛ امن است که رد شود |
| `401` روی notify | `BLUEPAL_REQUIRE_WEBHOOK_SIGNATURE=true` بدون هدر امضا | راز و نام هدر را در پنل و Vercel یکسان کنید |
| «مبلغ تأییدشده … هم‌خوانی ندارد» (۴۰۹) | اختلاف مبلغ سفارش و درگاه | قیمت/تخفیف را ببینید؛ تسویه عمداً متوقف شده |
| تغییر متغیرها اثر نکرد | Redeploy نشده | در داشبورد Redeploy بزنید |
| `payments contains an unknown provider` | ردیف test/dummy در `payments` | `select * from payments where provider <> 'bluepal';` را پاک/تکلیف کنید |
| `Payment provider is not configured` در سایت زنده | کلیدها روی پروژهٔ اشتباه/محیط اشتباه است | `npm run vercel:env -- --check --project …` |

`GET /api/payment/bluepal/status` هیچ رازی برنمی‌گرداند و جای سالمی برای بررسی وضعیت است
(دکمهٔ «بررسی پیکربندی» در پنل ادمین همین را صدا می‌زند).

---

## ۹) محدودیت‌ها و نکات ایمنی

* الگوریتم و بدنهٔ **اعلان نتیجه** در مستندات عمومی بلو پال نیامده؛ به همین دلیل کد ما body را
  هرگز باور نمی‌کند و همیشه `verify` می‌کند. اگر پشتیبانی بلو پال قالب امضا را اعلام کرد،
  فقط `BLUEPAL_WEBHOOK_*` را پر کنید (و در صورت نیاز تأیید امضا را در `lib/bluepal.js#notify` اضافه کنید).
* پرداخت از داخل مینی‌اپ/کیف‌پول پیام‌رسان دیگر وجود ندارد؛ هیچ `tapi.bale.ai` یا SDK بیرونی
  در صفحه بارگذاری نمی‌شود (CSP فروشگاه هم فقط `self` است).
* نشانی‌های `callback_url`/notify باید روی **دامنهٔ HTTPS واقعی** ثبت شوند؛ دامنه‌های موقت
  `*.e2b.app` یا preview فقط برای تست محلی‌اند.
* مبلغ minimum فروشگاه ۱۰۰۰ تومان است (`if v_total < 1000` در RPC)؛ مستندات بلو پال کف مبلغی
  اعلام نکرده است. اگر پنل کفی گذاشت، همان را در RPC اعمال کنید.
* بازگشت وجه از API فروشگاه انجام نمی‌شود؛ از پنل بلو پال (تا ۷۲ ساعت برای تراکنش تأییدنشده).

---

## ۱۰) چک‌لیست انتشار

- [ ] مهاجرت `202610050001_bluepal_provider.sql` روی پروژهٔ Supabase اجرا شده.
- [ ] ۱۳ کلید محیطی روی Vercel ست شده (`npm run vercel:env -- --check`) و Redeploy شده.
- [ ] `node scripts/bluepal-cli.js verify` بدون خطا.
- [ ] `npm test` و `node scripts/check.js` سبز.
- [ ] آزمون sandbox با هر سه کارت انجام شده و سفارش‌ها درست تسویه/لغو شده‌اند.
- [ ] `BLUEPAL_MODE=production`، کلید `sk_live_`، `BLUEPAL_ENABLE_LIVE_PAYMENTS=true`.
- [ ] (اختیاری) آدرس notify در پنل ثبت و امضا اختیاری فعال شده.
- [ ] یک خرید واقعی کوچک + بررسی واریز در پنل و در `orders`/`payments`.

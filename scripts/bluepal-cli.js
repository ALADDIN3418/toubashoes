'use strict';

/* BluePal عملیاتی CLI — راه‌اندازی، پیش‌از‌انتشار و عیب‌یابی درگاه بلو پال.

   node scripts/bluepal-cli.js config
   node scripts/bluepal-cli.js verify                     # بررسی کامل پیش‌از‌انتشار (بدون شبکه)
   node scripts/bluepal-cli.js request --toman 250000 [--order <uuid>]
   node scripts/bluepal-cli.js status --track <track_id> [--toman 250000]
   node scripts/bluepal-cli.js settle --order <uuid>     # پرس‌وجوی درگاه و نهایی‌سازی سفارش
   node scripts/bluepal-cli.js expire --minutes 180      # آزادسازی رزروهای رهاشده
   node scripts/bluepal-cli.js codes                     # جدول کدهای پاسخ و اقدام لازم

   فقط از متغیرهای محیطی (یا فایل .env کنار پروژه) خوانده می‌شود؛ هیچ کلیدی چاپ یا ذخیره نمی‌شود.
*/

const fs = require('node:fs');
const path = require('node:path');
const bluepal = require('../lib/bluepal.js');
const { serverConfiguration, callServiceRpc, supabaseServerConfig } = require('../lib/supabase-server.js');

const ROOT = path.join(__dirname, '..');
const TEMPLATES = ['vercel.env.example', '.env.example'];

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function flag(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return String(process.argv[index + 1] || fallback);
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function redact(config) {
  return {
    provider: bluepal.PROVIDER,
    providerLabel: bluepal.PROVIDER_LABEL,
    mode: config.mode,
    sandbox: config.sandbox,
    apiBase: config.apiBase,
    payHosts: config.payHosts,
    configured: config.configured,
    livePaymentsAllowed: config.livePaymentsAllowed,
    apiKeyKind: config.keyKind,
    keyMatchesMode: config.keyMatchesMode,
    validApiKey: config.validApiKey,
    validStateSecret: config.validStateSecret,
    validWebhookSecret: config.validWebhookSecret,
    merchantIdConfigured: Boolean(config.merchantId),
    settleGraceMinutes: config.settleGraceMinutes,
    webhookSignatureRequired: config.requireWebhookSignature,
    webhookSignatureHeader: config.webhookSecretHeader || config.webhookSignatureHeader || null,
    endpoints: {
      request: config.requestPath,
      receipt: config.receiptPath,
      status: config.statusPath,
      callback: config.callbackPath,
      notify: config.notifyPath
    },
    gatewayMethods: ['POST /v1/payments/request', 'GET /v1/payments/verify/{track_id}'],
    amountUnit: 'toman (integer)',
    publicOrigin: process.env.BLUEPAL_PUBLIC_ORIGIN || null
  };
}

const CODE_ACTIONS = {
  100: 'سفارش را نهایی کن (settle_bluepal_payment) — این تنها مسیر تأیید پرداخت است.',
  102: 'پیکربندی را اصلاح کن: BLUEPAL_MERCHANT_ID و مبلغ صحیح عددی به تومان.',
  105: 'دریافت وجه متوقف است؛ وضعیت حساب پذیرنده را در پنل بلو پال بررسی کن.',
  201: 'پرداخت پیش‌تر تأیید شده؛ فقط تحویل را دوباره بررسی کن و دوباره تأیید نگیر.',
  202: 'مبلغی کسر نشده؛ سفارش pending می‌ماند و مشتری می‌تواند دوباره تلاش کند.',
  404: 'کد پیگیری متعلق به این پذیرنده نیست؛ track_id ذخیره‌شده را با پنل مقابله کن.',
  429: 'درخواست‌ها را کم کن؛ polling فروشگاه خودکار پشت تایمر است.'
};

/* نام‌های محیطی که الگوها و کد باید یکسان باشند. */
function templateKeys(file) {
  const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return new Set([...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(match => match[1]));
}

function envParity() {
  if (!TEMPLATES.every(file => fs.existsSync(path.join(ROOT, file)))) {
    return { ok: false, detail: 'فایل‌های الگوی متغیر محیطی کامل نیستند.' };
  }
  const sets = TEMPLATES.map(templateKeys);
  const same = sets.length === 2 && sets[0].size === sets[1].size && [...sets[0]].every(key => sets[1].has(key));
  const missing = [...sets[0]].filter(key => key.startsWith('BLUEPAL_') && !(key in process.env) && !['BLUEPAL_PUBLIC_ORIGIN', 'BLUEPAL_ALLOWED_PAY_HOSTS'].includes(key));
  return { ok: same, same, unFilledInProcessEnv: same ? missing : [], detail: same ? `${sets[0].size} کلید در هر دو الگو یکسان است.` : 'فهرست کلیدهای vercel.env.example و .env.example با هم فرق دارد.' };
}

function migrationChecks() {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const file = path.join(dir, '202610050001_bluepal_provider.sql');
  if (!fs.existsSync(file)) return { ok: false, detail: 'فایل مهاجرت بلو پال پیدا نشد.' };
  const sql = fs.readFileSync(file, 'utf8');
  const markers = [
    "check (provider = 'bluepal')",
    'function public.attach_bluepal_payment(',
    'function public.settle_bluepal_payment(',
    'function public.expire_stale_bluepal_checkouts(',
    'grant execute on function public.settle_bluepal_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;'
  ];
  const missing = markers.filter(marker => !sql.includes(marker));
  return { ok: missing.length === 0, missing, detail: missing.length ? `مهاجرت بلو پال کامل نیست: ${missing.join(' | ')}` : 'مهاجرت 202610050001 markers حاضرند.' };
}

function apiFunctionChecks() {
  const routes = ['request', 'receipt', 'status', 'callback', 'notify'];
  const missing = routes.filter(route => !fs.existsSync(path.join(ROOT, 'api', 'payment', 'bluepal', `${route}.js`)));
  const wired = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
  // status فقط می‌خواند و به بدنه یا timeout نیاز ندارد، لذا در functions ثبت نمی‌شود.
  const needsOverride = ['request', 'receipt', 'callback', 'notify'];
  const unwired = missing.length ? missing : needsOverride.filter(route => !wired.includes(`api/payment/bluepal/${route}`));
  return {
    ok: missing.length === 0 && unwired.length === 0,
    detail: missing.length ? ` تابع گم‌شده: ${missing.join(', ')}`
      : unwired.length ? `در vercel.json ثبت نشده: ${unwired.join(', ')}` : 'هر پنج تابع و ثبت در vercel.json سالم است.'
  };
}

async function main() {
  loadEnv();
  const command = process.argv[2] || 'config';
  const config = bluepal.getConfig();
  const failure = bluepal.configurationError(config);

  if (command === 'help' || command === '--help') {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace("'use strict';", '').trim());
    return;
  }

  if (command === 'config') {
    const database = supabaseServerConfig();
    console.log(JSON.stringify({
      ...redact(config),
      database: { host: database.baseUrl ? new URL(database.baseUrl).host : null, serviceConfigured: database.serviceConfigured },
      error: failure ? failure.message : null
    }, null, 2));
    return;
  }

  if (command === 'codes') {
    for (const [code, info] of Object.entries(bluepal.BLUEPAL_CODES)) {
      console.log(`${String(code).padEnd(4)} ${String(info.outcome).padEnd(10)} ${info.label}\n     ↳ ${CODE_ACTIONS[code] || 'با پشتیبانی بلو پال هماهنگ کنید.'}`);
    }
    console.log('\nکارت‌های آزمون sandbox:\n  5022291000000008  پرداخت موفق\n  5022291000000016  موجودی ناکافی\n  5022291000000024  رمز دوم اشتباه\n  CVV2 برای همه: 123');
    return;
  }

  if (command === 'verify') {
    const parity = envParity();
    const migration = migrationChecks();
    const functions = apiFunctionChecks();
    const gate = bluepal.productionGateError(config);
    const problems = [];
    if (!config.mode) problems.push('BLUEPAL_MODE تنظیم نشده است.');
    if (failure) problems.push(`پیکربندی بلو پال: ${failure.message}`);
    if (!parity.ok) problems.push(parity.detail);
    if (!migration.ok) problems.push(migration.detail);
    if (!functions.ok) problems.push(functions.detail);
    const database = supabaseServerConfig();
    if (!database.serviceConfigured) problems.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY کامل نیست؛ پرداخت به سفارش متصل نمی‌شود.');
    if (gate) problems.push(`قفل وجه واقعی: ${gate.message}`);
    console.log(JSON.stringify({
      ok: problems.length === 0,
      provider: bluepal.PROVIDER,
      mode: config.mode,
      livePaymentsAllowed: config.livePaymentsAllowed,
      checks: {
        envParity: { ok: parity.ok, detail: parity.detail, unFilledInProcessEnv: parity.unFilledInProcessEnv },
        migration: { ok: migration.ok, detail: migration.detail },
        apiFunctions: { ok: functions.ok, detail: functions.detail },
        database: { ok: database.serviceConfigured, detail: database.serviceConfigured ? 'پیکربندی سرویس Supabase کامل است.' : 'متغیرهای سرویس Supabase ناقص است.' }
      },
      problems
    }, null, 2));
    if (problems.length) process.exitCode = 1;
    return;
  }

  if (failure) fail(failure.message, failure.status || 409);

  if (command === 'request') {
    const amountToman = Number(flag('toman', '0'));
    if (!Number.isSafeInteger(amountToman) || amountToman <= 0) fail('برای ساخت درخواست پرداخت، --toman را با عدد صحیح (تومان) وارد کنید.');
    const orderId = flag('order', `cli-${Date.now()}`);
    const origin = process.env.BLUEPAL_PUBLIC_ORIGIN || 'https://example.invalid';
    const result = await bluepal.requestPayment({
      config,
      amountToman,
      orderId,
      description: flag('description', `آزمون CLI سفارش ${orderId}`),
      callbackUrl: flag('callback', `${origin}${bluepal.CALLBACK_PATH}?order=${orderId}`)
    });
    console.log(JSON.stringify({
      trackId: result.trackId,
      paymentUrl: result.paymentUrl,
      amountToman: result.amountToman,
      gatewayAmount: result.gatewayAmount,
      note: 'این دستور فقط درخواست را در درگاه ثبت می‌کند؛ تا مشتری در صفحهٔ بانک پرداخت نکند و GET verify تأیید نشود، هیچ سفارشی نهایی نمی‌شود.'
    }, null, 2));
    return;
  }

  if (command === 'status') {
    const trackId = flag('track', process.argv[3] || '');
    const expected = flag('toman', '') ? Number(flag('toman')) : null;
    if (!trackId) fail('شناسهٔ پیگیری لازم است: node scripts/bluepal-cli.js status --track <track_id>');
    console.log(JSON.stringify(await bluepal.verifyPayment({ config, trackId, expectedAmountToman: expected }), null, 2));
    return;
  }

  if (command === 'settle') {
    const orderId = flag('order', process.argv[3] || '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) fail('شناسهٔ سفارش (uuid) لازم است: node scripts/bluepal-cli.js settle --order <uuid>');
    const database = serverConfiguration();
    const result = await bluepal.settleStatus({ orderId, config, dbConfig: database, source: 'cli-reconcile' });
    console.log(JSON.stringify({ outcome: result.outcome, code: result.code, orderId, receipt: result.receipt }, null, 2));
    if (result.outcome !== 'paid') process.exitCode = 2;
    return;
  }

  if (command === 'expire') {
    const minutes = Number(flag('minutes', String(config.settleGraceMinutes || 180)));
    const result = await callServiceRpc('expire_stale_bluepal_checkouts', { p_grace_minutes: Number.isFinite(minutes) ? minutes : 180 }, serverConfiguration());
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  fail(`دستور ناشناخته: ${command} (از node scripts/bluepal-cli.js help استفاده کنید)`, 400);
}

main().catch(error => {
  console.error(`⛔ ${error.message}`);
  process.exit(Number(error.status) === 409 ? 1 : 1);
});

'use strict';

/* BluPal عملیاتی CLI — راه‌اندازی، پیش‌از‌انتشار و عیب‌یابی درگاه بلوپال (blupal.top).

   node scripts/blupal-cli.js config
   node scripts/blupal-cli.js verify                     # بررسی کامل پیش‌از‌انتشار (بدون شبکه)
   node scripts/blupal-cli.js codes                      # جدول خطاهای مستند بلوپال و اقدام لازم
   node scripts/blupal-cli.js request --toman 250000     # ساخت فاکتور آزمایشی (کلید sandbox پولی کم نمی‌کند)
   node scripts/blupal-cli.js status  --invoice 123      # وضعیت فاکتور از GET /v1/invoices/{invoice_id}
   node scripts/blupal-cli.js simulate --invoice 123 [--scenario success]   # فقط sandbox
   node scripts/blupal-cli.js settle  --order <uuid>     # پرس‌وجوی درگاه و نهایی‌سازی سفارش
   node scripts/blupal-cli.js expire  --minutes 60       # آزادسازی رزروهای رهاشده

   فقط از متغیرهای محیطی (یا فایل .env کنار پروژه) خوانده می‌شود؛ هیچ کلیدی چاپ یا ذخیره نمی‌شود.
*/

const fs = require('node:fs');
const path = require('node:path');
const blupal = require('../lib/blupal.js');
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
    provider: blupal.PROVIDER,
    providerLabel: blupal.PROVIDER_LABEL,
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
    cardNumberConfigured: Boolean(config.cardNumber),
    minAmountRial: config.minAmountRial,
    maxAmountRial: config.maxAmountRial,
    settleGraceMinutes: config.settleGraceMinutes,
    endpoints: {
      request: config.requestPath,
      receipt: config.receiptPath,
      status: config.statusPath,
      callback: config.callbackPath,
      notify: config.notifyPath
    },
    gatewayMethods: ['POST /v1/invoices/create', 'GET /v1/invoices/{invoice_id}'],
    sandboxOnlyMethods: ['POST /v1/sandbox/invoices/{invoice_id}/simulate'],
    amountUnit: 'rial (integer) — از تومانِ پایگاه داده ×۱۰ ساخته می‌شود',
    panelSettings: ['API درگاه', 'Webhook درگاه', 'Callback page']
  };
}

/* اقدام لازم برای هر کد خطای مستند بلوپال. */
const ERROR_ACTIONS = {
  unauthorized: 'BLUPAL_API_KEY را با کلید «API درگاه» پنل عوض کن و فعال‌بودن درگاه را بررسی کن.',
  amount_required: 'باگ برنامه است؛ مبلغ ریالی همیشه از total_toman سفارش ساخته می‌شود.',
  amount_too_low: `مبلغ سبد خرید از ${blupal.faNumber(blupal.MIN_AMOUNT_RIAL)} ریال کمتر است؛ کف سفارش را بالا ببر.`,
  amount_too_high: `سقف هر فاکتور ${blupal.faNumber(blupal.MAX_AMOUNT_RIAL)} ریال است؛ سفارش را تقسیم کن.`,
  no_active_card: 'در پنل بلوپال دست‌کم یک کارت فعال برای پذیرنده ثبت کن.',
  invalid_invoice_id: 'شناسهٔ فاکتور ذخیره‌شده را با پنل مقابله کن (payments.authority).',
  invalid_scenario: 'scenario باید یکی از success، wrong_amount، expire یا cancel باشد.',
  invalid_state: 'فقط فاکتور PENDING قابل شبیه‌سازی/لغو است؛ برای پرداخت دوباره فاکتور تازه بساز.',
  mode_mismatch: 'کلید blu_test_ فقط فاکتور sandbox و کلید blu_live_ فقط فاکتور واقعی را می‌بیند؛ BLUPAL_MODE را با کلید هم‌خوان کن.',
  not_found: 'فاکتور در بلوپال نیست؛ اگر تازه ساخته شده، کمی بعد دوباره وضعیت را بپرس.'
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
  const optional = ['BLUPAL_ALLOWED_PAY_HOSTS', 'BLUPAL_CARD_NUMBER'];
  const missing = [...sets[0]].filter(key => key.startsWith('BLUPAL_') && !(key in process.env) && !optional.includes(key));
  return { ok: same, same, unFilledInProcessEnv: same ? missing : [], detail: same ? `${sets[0].size} کلید در هر دو الگو یکسان است.` : 'فهرست کلیدهای vercel.env.example و .env.example با هم فرق دارد.' };
}

function migrationChecks() {
  const file = path.join(ROOT, 'supabase', 'migrations', '202610050001_blupal_provider.sql');
  if (!fs.existsSync(file)) return { ok: false, detail: 'فایل مهاجرت بلوپال پیدا نشد.' };
  const sql = fs.readFileSync(file, 'utf8');
  const markers = [
    "check (provider = 'blupal')",
    'function public.attach_blupal_payment(',
    'function public.settle_blupal_payment(',
    'function public.expire_stale_blupal_checkouts(',
    "p_invoice_id !~ '^[0-9]{1,20}$'",
    'grant execute on function public.attach_blupal_payment(uuid,text,text,text,bigint,bigint,text) to service_role;',
    'grant execute on function public.settle_blupal_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;'
  ];
  const missing = markers.filter(marker => !sql.includes(marker));
  return { ok: missing.length === 0, missing, detail: missing.length ? `مهاجرت بلوپال کامل نیست: ${missing.join(' | ')}` : 'مهاجرت 202610050001 markers حاضرند.' };
}

function manualChunkChecks() {
  const dir = path.join(ROOT, 'supabase', 'manual');
  let built;
  try {
    built = require('./blupal-sql-chunks.js').build(fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '202610050001_blupal_provider.sql'), 'utf8'));
  } catch (error) {
    return { ok: false, detail: `قطعه‌های manual قابل‌ساخت نیستند: ${error.message}` };
  }
  const stale = built.filter(chunk => {
    const file = path.join(dir, chunk.file);
    return !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== chunk.sql;
  }).map(chunk => chunk.file);
  return {
    ok: stale.length === 0,
    detail: stale.length ? `بی‌رمق با مهاجرت (اجرا کن: node scripts/blupal-sql-chunks.js): ${stale.join(', ')}`
      : `${built.length} قطعهٔ اجرای دستی آماده و به‌روز است (برای چسباندن در SQL Editor).`
  };
}

function apiFunctionChecks() {
  const routes = ['request', 'receipt', 'status', 'callback', 'notify'];
  const missing = routes.filter(route => !fs.existsSync(path.join(ROOT, 'api', 'payment', 'blupal', `${route}.js`)));
  const wired = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
  // status فقط می‌خواند و به بدنه یا timeout نیاز ندارد، لذا در functions ثبت نمی‌شود.
  const needsOverride = ['request', 'receipt', 'callback', 'notify'];
  const unwired = missing.length ? missing : needsOverride.filter(route => !wired.includes(`api/payment/blupal/${route}`));
  return {
    ok: missing.length === 0 && unwired.length === 0,
    detail: missing.length ? ` تابع گم‌شده: ${missing.join(', ')}`
      : unwired.length ? `در vercel.json ثبت نشده: ${unwired.join(', ')}` : 'هر پنج تابع و ثبت در vercel.json سالم است.'
  };
}

async function main() {
  loadEnv();
  const command = process.argv[2] || 'config';
  const config = blupal.getConfig();
  const failure = blupal.configurationError(config);

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
    for (const [code, info] of Object.entries(blupal.BLUPAL_ERRORS)) {
      console.log(`${code.padEnd(20)} HTTP ${String(info.http).padEnd(4)} ${info.label}\n     ↳ ${ERROR_ACTIONS[code] || 'با پشتیبانی بلوپال هماهنگ کنید.'}`);
    }
    console.log('\nوضعیت‌های فاکتور:');
    for (const [status, info] of Object.entries(blupal.INVOICE_STATUSES)) {
      console.log(`  ${status.padEnd(9)} → ${info.outcome} — ${info.label}`);
    }
    console.log('\nsandbox: لازم نیست کارت واقعی یا رمز دوم استفاده کنی؛ با «simulate --scenario success» پرداخت را شبیه‌سازی کن (فقط با کلید blu_test_ و از همین CLI).');
    return;
  }

  if (command === 'verify') {
    const parity = envParity();
    const migration = migrationChecks();
    const functions = apiFunctionChecks();
    const chunks = manualChunkChecks();
    const gate = blupal.productionGateError(config);
    const problems = [];
    if (!config.mode) problems.push('BLUPAL_MODE تنظیم نشده است.');
    if (failure) problems.push(`پیکربندی بلوپال: ${failure.message}`);
    if (!parity.ok) problems.push(parity.detail);
    if (!migration.ok) problems.push(migration.detail);
    if (!functions.ok) problems.push(functions.detail);
    if (!chunks.ok) problems.push(chunks.detail);
    const database = supabaseServerConfig();
    if (!database.serviceConfigured) problems.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY کامل نیست؛ پرداخت به سفارش متصل نمی‌شود.');
    if (gate) problems.push(`قفل وجه واقعی: ${gate.message}`);
    console.log(JSON.stringify({
      ok: problems.length === 0,
      provider: blupal.PROVIDER,
      mode: config.mode,
      livePaymentsAllowed: config.livePaymentsAllowed,
      checks: {
        envParity: { ok: parity.ok, detail: parity.detail, unFilledInProcessEnv: parity.unFilledInProcessEnv },
        migration: { ok: migration.ok, detail: migration.detail },
        apiFunctions: { ok: functions.ok, detail: functions.detail },
        manualChunks: { ok: chunks.ok, detail: chunks.detail },
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
    if (!Number.isSafeInteger(amountToman) || amountToman <= 0) fail('برای ساخت فاکتور، --toman را با عدد صحیح (تومان) وارد کنید.');
    const created = await blupal.createInvoice({ config, amountToman });
    console.log(JSON.stringify({
      invoiceId: created.invoiceId,
      paymentUrl: created.paymentUrl,
      destinationCard: created.cardNumber || '(کارت پیش‌فرض پنل)',
      amountRial: created.amountRial,
      finalAmountRial: created.finalAmountRial,
      status: created.status,
      mode: created.mode,
      expiresAt: created.expiresAt,
      note: 'این دستور فقط یک فاکتور می‌سازد؛ تا واریز شناسایی نشود (در sandbox با simulate) هیچ سفارشی نهایی نمی‌شود.'
    }, null, 2));
    return;
  }

  if (command === 'status') {
    const invoiceId = flag('invoice', flag('track', process.argv[3] || ''));
    const expectedRial = flag('rial', '') ? Number(flag('rial')) : null;
    if (!invoiceId) fail('شناسهٔ فاکتور لازم است: node scripts/blupal-cli.js status --invoice <invoice_id>');
    const result = await blupal.checkInvoiceStatus({ config, invoiceId, expectedAmountRial: expectedRial });
    console.log(JSON.stringify({
      invoiceId: result.invoiceId,
      status: result.status,
      outcome: result.outcome,
      amountRial: result.amountRial,
      finalAmountRial: result.finalAmountRial,
      transactionId: result.transactionId,
      payer: result.payer,
      mode: result.mode,
      modeMatches: result.modeMatches,
      expiresAt: result.expiresAt
    }, null, 2));
    if (result.outcome !== 'paid') process.exitCode = 2;
    return;
  }

  if (command === 'simulate') {
    const invoiceId = flag('invoice', process.argv[3] || '');
    if (!invoiceId) fail('شناسهٔ فاکتور لازم است: node scripts/blupal-cli.js simulate --invoice <invoice_id> [--scenario success]');
    const result = await blupal.simulatePayment({ config, invoiceId, scenario: flag('scenario', 'success') });
    console.log(JSON.stringify({ invoiceId: result.invoiceId, scenario: result.scenario, status: result.status, transactionId: result.transactionId }, null, 2));
    console.log('نکته: با سناریوی success یک وب‌هوک هم ارسال می‌شود؛ اگر نشانی Webhook در پنل تنظیم شده، «آخرین Webhook ها» را ببین.');
    return;
  }

  if (command === 'settle') {
    const orderId = flag('order', process.argv[3] || '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) fail('شناسهٔ سفارش (uuid) لازم است: node scripts/blupal-cli.js settle --order <uuid>');
    const database = serverConfiguration();
    const result = await blupal.settleStatus({ orderId, config, dbConfig: database, source: 'cli-reconcile' });
    console.log(JSON.stringify({ outcome: result.outcome, status: result.status, invoiceId: result.invoiceId, orderId, receipt: result.receipt }, null, 2));
    if (result.outcome !== 'paid') process.exitCode = 2;
    return;
  }

  if (command === 'expire') {
    const minutes = Number(flag('minutes', String(config.settleGraceMinutes || 60)));
    const result = await callServiceRpc('expire_stale_blupal_checkouts', { p_grace_minutes: Number.isFinite(minutes) ? minutes : 60 }, serverConfiguration());
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  fail(`دستور ناشناخته: ${command} (از node scripts/blupal-cli.js help استفاده کنید)`, 400);
}

main().catch(error => {
  console.error(`⛔ ${error.message}`);
  process.exit(1);
});

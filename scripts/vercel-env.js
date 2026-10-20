'use strict';

/* اعمال متغیرهای محیطی فروشگاه روی Vercel (ساخت یا به‌روزرسانی).
 *
 *   cp vercel.env.example vercel.env.local     # سپس مقدارها را پر کنید
 *   VERCEL_TOKEN=vcp_xxx node scripts/vercel-env.js --project <نام یا prj_id> --dry-run
 *   VERCEL_TOKEN=vcp_xxx node scripts/vercel-env.js --project <نام یا prj_id>
 *   node scripts/vercel-env.js --list --project <نام>          # فقط نام کلیدها و وضعیت
 *   node scripts/vercel-env.js --check --project <نام>         # آیا همهٔ کلیدها ست شده‌اند؟
 *
 * توکن از محیط خوانده می‌شود (VERCEL_TOKEN یا VERCEL_API_TOKEN) و هرگز چاپ یا ذخیره نمی‌شود.
 * مقادیر راز هم چاپ نمی‌شوند؛ در حالت عادی فقط نام کلید و نوع آن گزارش می‌شود.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API = String(process.env.VERCEL_API_BASE || 'https://api.vercel.com').replace(/\/+$/, '');
const SECRET_NAME = /(TOKEN|SECRET|KEY|PASSWORD|PASSPHRASE|CREDENTIAL|SERVICE_ROLE)/i;
const PUBLIC_NAMES = new Set([
  'PORT',
  'NODE_ENV',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
]);
const REQUIRED_KEYS = [
  'BITPAY_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error([
    'usage: VERCEL_TOKEN=<token> node scripts/vercel-env.js --project <name|prj_id> [options]',
    '',
    '  --file <path>      فایل KEY=VALUE (پیش‌فرض: vercel.env.local و در نبودش vercel.env.example)',
    '  --project <id>     نام یا شناسهٔ پروژهٔ Vercel (لازمی)',
    '  --team <slug|id>   تیم/اسلاگ تیم (teamId در API)',
    '  --targets <list>   پیش‌فرض: production,preview,development',
    '  --secret-type <t>  encrypted (پیش‌فرض) | sensitive | plain',
    '  --allow-empty      کلیدهای با مقدار خالی را هم بفرست (برای ساخت placeholder)',
    '  --dry-run          فقط نمایش آنچه انجام می‌شود، بدون نوشتن',
    '  --list             خواندن فهرست کلیدهای موجود پروژه (بدون مقدار رازها)',
    '  --check            بررسی اینکه همهٔ کلیدهای فایل در پروژه وجود دارند',
    '  --help             این راهنما'
  ].join('\n'));
  process.exit(message ? 1 : 0);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return String(process.argv[index + 1] ?? fallback);
  const withEquals = process.argv.find(x => x.startsWith(`--${name}=`));
  return withEquals ? withEquals.slice(name.length + 3) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function label(file) {
  const relative = path.relative(ROOT, file);
  return relative && !relative.startsWith('..') ? relative : file;
}

function loadEnvFile(file) {
  const target = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(target)) throw new Error(`فایل متغیرها پیدا نشد: ${label(target)}`);
  const entries = [];
  const text = fs.readFileSync(target, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`خط نامعتبر در ${file}:${rawLine}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    entries.push({ key: match[1], value });
  }
  // اگر کلیدی تکرار شد، آخرین مقدار برنده است (تا بشود با افزودن یک خط override کرد)
  const byKey = new Map();
  for (const entry of entries) byKey.set(entry.key, entry.value);
  return { target, entries: [...byKey].map(([key, value]) => ({ key, value })) };
}

function token() {
  const value = String(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || arg('token')).trim();
  if (!value) throw new Error('VERCEL_TOKEN تنظیم نشده است. مثال: VERCEL_TOKEN=vcp_xxx node scripts/vercel-env.js --project <name>');
  return value;
}

function query(extra = {}) {
  const params = new URLSearchParams();
  const team = arg('team');
  if (team) params.set('teamId', team);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, String(value));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function api(pathname, { method = 'GET', body, dryRun = false } = {}) {
  if (dryRun) return { dryRun: true };
  const response = await fetch(`${API}${pathname}${query(method === 'POST' ? { upsert: 'true' } : {})}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = payload?.error || payload;
    const code = error?.code || `http_${response.status}`;
    const message = String(error?.message || 'unknown error').slice(0, 300);
    throw new Error(`Vercel API ${response.status} (${code}) ${pathname}: ${message}`);
  }
  return payload;
}

function typeFor(key, secretType) {
  if (PUBLIC_NAMES.has(key)) return 'plain';
  if (SECRET_NAME.test(key)) return secretType;
  return 'encrypted';
}

async function listEnv(project) {
  const payload = await api(`/v9/projects/${encodeURIComponent(project)}/env`);
  const envs = Array.isArray(payload?.envs) ? payload.envs : [];
  return envs;
}

async function main() {
  if (hasFlag('help')) usage();
  const project = arg('project') || process.env.VERCEL_PROJECT || '';
  if (!project) usage('--project لازم است (نام پروژه یا prj_…)');
  const targets = (arg('targets', 'production,preview,development') || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  for (const target of targets) {
    if (!['production', 'preview', 'development'].includes(target)) throw new Error(`target ناشناخته: ${target}`);
  }
  const secretType = arg('secret-type', 'encrypted');
  if (!['encrypted', 'sensitive', 'plain'].includes(secretType)) throw new Error('--secret-type باید encrypted، sensitive یا plain باشد');
  const dryRun = hasFlag('dry-run');

  if (hasFlag('list')) {
    const envs = await listEnv(project);
    if (!envs.length) { console.log('پروژه هیچ متغیر محیطی‌ای ندارد.'); return; }
    const rows = envs.map(env => `${env.key.padEnd(34)} ${String(env.type || '?').padEnd(11)} ${(Array.isArray(env.target) ? env.target.join(',') : '?')}`);
    console.log(`متغیرهای پروژهٔ ${project} (${envs.length}):\n${rows.sort().join('\n')}`);
    console.log('\nمقادیر رازها هرگز نمایش داده نمی‌شوند.');
    return;
  }

  const file = arg('file', fs.existsSync(path.join(ROOT, 'vercel.env.local')) ? 'vercel.env.local' : 'vercel.env.example');
  const { target, entries } = loadEnvFile(file);
  const filled = entries.filter(entry => entry.value !== '');
  const skipped = entries.filter(entry => entry.value === '');
  if (!hasFlag('allow-empty') && !filled.length) throw new Error(`هیچ مقدار غیرخالی در ${path.relative(ROOT, target)} نیست؛ فایل را پر کنید یا --allow-empty را بکار ببرید.`);

  if (hasFlag('check')) {
    const envs = await listEnv(project);
    const present = new Set(envs.map(env => env.key));
    const wanted = entries.map(entry => entry.key);
    const missing = wanted.filter(key => !present.has(key));
    const optionalMissing = REQUIRED_KEYS.filter(key => !present.has(key));
    console.log(JSON.stringify({ project, present: wanted.filter(key => present.has(key)), missing, requiredMissing: optionalMissing, ok: missing.length === 0 }, null, 2));
    if (missing.length) process.exitCode = 1;
    return;
  }

  const payload = filled.map(entry => ({
    key: entry.key,
    value: entry.value,
    type: typeFor(entry.key, secretType),
    target: targets,
    ...(PUBLIC_NAMES.has(entry.key) ? {} : { visibility: secretType === 'sensitive' ? 'secret' : 'config' }),
    comment: 'touba-shoes · scripts/vercel-env.js'
  }));

  console.log(`پروژه: ${project} · فایل: ${label(target)} · هدف‌ها: ${targets.join(', ')} · نوع رازها: ${secretType}`);
  console.log(payload.map(row => `  ${row.key.padEnd(34)} ${row.type.padEnd(10)} ${'•'.repeat(Math.min(12, row.value.length))}`).join('\n'));
  if (skipped.length) console.log(`  ${skipped.length} کلید با مقدار خالی رد شد: ${skipped.map(x => x.key).join(', ')}`);
  const missingRequired = REQUIRED_KEYS.filter(key => !filled.some(row => row.key === key));
  if (missingRequired.length) console.log(`  هشدار: کلیدهای ضروری مقدار ندارند → ${missingRequired.join(', ')}`);

  if (dryRun) { console.log('\ndry-run: چیزی در Vercel نوشته نشد.'); return; }

  let created;
  try {
    created = await api(`/v10/projects/${encodeURIComponent(project)}/env`, { method: 'POST', body: payload });
  } catch (error) {
    // نسخه‌های قدیمی‌تر API فیلد visibility را نمی‌شناسند؛ یک‌بار بدون آن تلاش می‌کنیم.
    if (!/visibility/i.test(error.message)) throw error;
    created = await api(`/v10/projects/${encodeURIComponent(project)}/env`, {
      method: 'POST',
      body: payload.map(({ visibility, ...rest }) => rest)
    });
  }
  const summary = {
    created: created?.created?.map(x => x.key) || [],
    ignored: created?.ignored?.map(x => x.key) || [],
    failed: (created?.failed || []).map(x => ({ key: x.key || x.envVarKey, error: x.error?.code || 'unknown' }))
  };
  console.log(`\nاعمال شد: ${summary.created.length} کلید` + (summary.ignored.length ? ` · بدون تغییر: ${summary.ignored.length}` : ''));
  if (summary.failed.length) { console.error('ناموفق:', JSON.stringify(summary.failed, null, 2)); process.exitCode = 1; return; }
  console.log('برای تأیید: node scripts/vercel-env.js --list --project ' + project);
  console.log('سپس یک Redeploy از Vercel انجام دهید (متغیرها روی deployment جاری اعمال نمی‌شوند).');
}

main().catch(error => { console.error(`vercel-env: ${error.message}`); process.exit(1); });

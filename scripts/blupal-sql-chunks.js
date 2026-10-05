'use strict';

/* بلوپال — قطعه‌بندی مهاجرت SQL برای اجرای دستی در Supabase SQL Editor.
 *
 * کل فایل مهاجرت ~۶۷۰ خط است و چسباندن آن در ادیتور گاهی نیمه‌بریده می‌شود؛ نتیجه خطای
 * «unterminated dollar-quoted string» است. این اسکریپت همان فایل را — بدون هیچ بازنویسی —
 * به قطعه‌های کوچک و مرتب تقسیم می‌کند تا یکی‌یکی اجرا شوند.
 *
 *   node scripts/blupal-sql-chunks.js          # ساخت/بازسازی supabase/manual/*.sql
 *   node scripts/blupal-sql-chunks.js --check  # بررسی هم‌زمانی قطعه‌ها با فایل مهاجرت
 *
 * منبع حقیقت همیشه supabase/migrations/202610050001_blupal_provider.sql است؛
 * هر خط از آن دقیقاً یک‌جا در قطعه‌ها می‌آید (این ویژگی در --check راستی‌آزمایی می‌شود).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '202610050001_blupal_provider.sql');
const OUT_DIR = path.join(ROOT, 'supabase', 'manual');

/* مرز هر قطعه = جای شروع آن (تابع یا بلوک). ترتیب همین فهرست، ترتیب اجراست. */
const CHUNKS = [
  { file: '01_schema_and_legacy.sql', title: 'قفل provider و تبدیل ردیف‌های درگاه‌های قبلی', start: /^create or replace function public\.create_order_with_payment\(/m },
  { file: '02_order_rpcs.sql', title: 'ثبت اتمیک سفارش/پرداخت و لغو سفارش توسط مشتری', start: /^-- The storefront stores the BluPal invoice/m },
  { file: '03_attach_invoice.sql', title: 'ثبت فاکتور بلوپال روی سفارش (فقط service_role)', start: /^create or replace function public\.settle_blupal_payment\(/m },
  { file: '04_settle_payment.sql', title: 'تسویهٔ یک‌مصرف — تنها راه paid شدن سفارش', start: /^create or replace function public\.expire_stale_blupal_checkouts\(/m },
  { file: '05_expiry_and_admin.sql', title: 'جاروب انقضا و تغییر وضعیت توسط مدیر', start: /^-- Retired gateway entry points/m },
  { file: '06_retire_legacy.sql', title: 'حذف تابع‌های بازنشسته و بارگذاری دوبارهٔ schema', start: null }
];

/* اگر پیش از خط تابع، بلوک کامنت توضیحی باشد، آن را به قطعهٔ جدید منتقل می‌کنیم تا
   هر فایل با توضیح خودش شروع شود. */
function pullCommentHeader(sql, index) {
  const head = sql.slice(0, index);
  const lines = head.split('\n');
  let cut = lines.length;
  while (cut > 0) {
    const previous = lines[cut - 1];
    if (/^--/.test(previous)) { cut -= 1; continue; }
    if (previous.trim() === '' && cut > 1 && /^--/.test(lines[cut - 2] || '')) { cut -= 1; continue; }
    break;
  }
  if (cut === lines.length) return index;
  return index - lines.slice(cut).join('\n').length;
}

/* شمارش جفت dollar-quote با رد کردن کامنت خطی و رشتهٔ نقلی — همان کاری که پستگرس می‌کند. */
function dollarBalance(body) {
  let depth = 0;
  let openedAt = 0;
  let i = 0;
  const n = body.length;
  while (i < n) {
    const char = body[i];
    if (char === '-' && body[i + 1] === '-') {
      const newline = body.indexOf('\n', i);
      i = newline === -1 ? n : newline + 1;
      continue;
    }
    if (char === "'") {
      i += 1;
      while (i < n) {
        if (body[i] === "'") {
          if (body[i + 1] === "'") { i += 2; continue; }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(body.slice(i));
    if (tag) {
      if (depth === 0) { depth = 1; openedAt = body.slice(0, i).split('\n').length; }
      else depth = 0;
      i += tag[0].length;
      continue;
    }
    i += 1;
  }
  return { depth, openedAt };
}

function boundaries(sql) {
  const marks = [0];
  for (const chunk of CHUNKS) {
    if (!chunk.start) continue;
    const match = chunk.start.exec(sql);
    if (!match) throw new Error(`مرز قطعهٔ ${chunk.file} در فایل مهاجرت پیدا نشد (${chunk.start}).`);
    const index = pullCommentHeader(sql, match.index);
    if (index <= marks[marks.length - 1]) throw new Error(`مرز قطعهٔ ${chunk.file} پشت مرز قبلی افتاده است.`);
    marks.push(index);
  }
  marks.push(sql.length);
  return marks;
}

function build(sql) {
  const marks = boundaries(sql);
  return CHUNKS.map((chunk, index) => {
    const raw = sql.slice(marks[index], marks[index + 1]);
    const body = raw
      .split('\n')
      .filter(line => !/^\s*(begin|commit)\s*;\s*$/i.test(line))
      .join('\n')
      .trim();
    if (!/;$/.test(body)) throw new Error(`قطعهٔ ${chunk.file} با ';' تمام نمی‌شود؛ فایل مهاجرت را بررسی کن.`);
    const text = [
      `-- بلوپال (BluPal · blupal.top) — قطعهٔ ${index + 1} از ${CHUNKS.length}: ${chunk.title}`,
      '-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql',
      '-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.',
      '',
      'begin;',
      '',
      body,
      '',
      'commit;',
      ''
    ].join('\n');
    const balance = dollarBalance(text);
    if (balance.depth !== 0) throw new Error(`قطعهٔ ${chunk.file} dollar-quote باز دارد (خط ${balance.openedAt}).`);
    return { file: chunk.file, title: chunk.title, sql: text, body, lines: text.split('\n').length, bytes: Buffer.byteLength(text, 'utf8') };
  });
}

function main() {
  const mode = process.argv[2] || 'write';
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const chunks = build(sql);

  if (mode === '--check') {
    const problems = [];
    for (const chunk of chunks) {
      const target = path.join(OUT_DIR, chunk.file);
      if (!fs.existsSync(target)) { problems.push(`${chunk.file} ساخته نشده است.`); continue; }
      if (fs.readFileSync(target, 'utf8') !== chunk.sql) problems.push(`${chunk.file} با فایل مهاجرت هم‌زمان نیست.`);
    }
    const expected = new Set(chunks.map(chunk => chunk.file));
    for (const entry of fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []) {
      if (entry.endsWith('.sql') && !expected.has(entry)) problems.push(`${entry} بی‌ربط است؛ حذفش کن.`);
    }
    if (problems.length) { console.error(`✖ ${problems.join('\n✖ ')}`); process.exit(1); }
    console.log(`✓ ${chunks.length} قطعه با فایل مهاجرت هم‌زمان است.`);
    return;
  }

  if (mode !== 'write') {
    console.error('usage: node scripts/blupal-sql-chunks.js [--check]');
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const chunk of chunks) {
    fs.writeFileSync(path.join(OUT_DIR, chunk.file), chunk.sql, 'utf8');
    console.log(`  ${chunk.file}  ${chunk.lines} خط · ${chunk.bytes} بایت · ${chunk.title}`);
  }
  console.log('فایل‌ها در supabase/manual/ ساخته شدند.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`✖ ${error.message}`); process.exit(1); }
}

module.exports = { build, dollarBalance, CHUNKS, MIGRATION, OUT_DIR };

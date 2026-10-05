'use strict';

/* بلوپال — پل اجراییِ tests/blupal-sql-itest.py (Postgres واقعی).
 *
 * این تست تنها راهی است که SQL مهاجرت واقعاً پارس و اجرا می‌شود؛ چون خطاهایی مثل عضو نبودن یک
 * مقدار در enum یا قفل dollar-quote باز، در جعلِ REST/RPC هرگز دیده نمی‌شوند.
 * اگر pgserver روی این ماشین نصب نباشد، اجرا بی‌خطر رد (SKIP) می‌شود تا `npm test` به ابزار
 * بیرونی وابسته نشود. با TOUBA_SQL_ITEST=0 هم می‌توان دستی خاموشش کرد.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tests', 'blupal-sql-itest.py');
const timeout = Number(process.env.TOUBA_SQL_ITEST_TIMEOUT || 600000);

function skip(reason) {
  console.log(`SKIP: real-Postgres SQL test — ${reason}`);
  process.exit(0);
}

if (process.env.TOUBA_SQL_ITEST === '0') skip('disabled by TOUBA_SQL_ITEST=0');
if (!fs.existsSync(script)) {
  console.error(`FAIL: ${path.relative(root, script)} is missing`);
  process.exit(1);
}

const candidates = (process.env.PYTHON || 'python3,python').split(',').map(entry => entry.trim()).filter(Boolean);
let lastError = 'no python interpreter found (set PYTHON=/path/to/python3)';

for (const bin of candidates) {
  const probe = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 30000 });
  if (probe.error) continue;
  const result = spawnSync(bin, [script], { cwd: root, encoding: 'utf8', timeout, env: process.env });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.error) { lastError = result.error.message; continue; }
  if (output) console.log(output);
  if (/^SKIP:/m.test(output)) skip('pgserver is not installed for this interpreter');
  if (result.status !== 0) {
    console.error(`FAIL: the migration did not survive a real Postgres run (exit ${result.status})`);
    process.exit(1);
  }
  if (!/ALL ASSERTIONS PASSED/.test(output)) {
    console.error('FAIL: the Postgres run ended without its assertion summary');
    process.exit(1);
  }
  console.log('PASS: the BluPal migration and every paste-safe chunk apply on real Postgres, keep retired-gateway '
    + 'history, close out abandoned checkouts, and settle an invoice to a paid order');
  process.exit(0);
}

skip(lastError);

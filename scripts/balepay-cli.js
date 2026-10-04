'use strict';

/* Bale Pay عملیاتی CLI — ابزار راه‌اندازی و عیب‌یابی درگاه کیف‌پول بله.
 *
 *   node scripts/balepay-cli.js config
 *   node scripts/balepay-cli.js webhook:set https://shop.example.com/api/payment/balepay/webhook
 *   node scripts/balepay-cli.js webhook:status
 *   node scripts/balepay-cli.js webhook:delete
 *   node scripts/balepay-cli.js poll                 # دریافت آپدیت‌ها با long polling (محلی/بدون وب‌هوک)
 *   node scripts/balepay-cli.js inquire <transaction_id>
 *   node scripts/balepay-cli.js invoice --order <uuid> --toman 250000
 *   node scripts/balepay-cli.js send --chat <chat_id> --toman 250000 [--order <uuid>]
 *   node scripts/balepay-cli.js expire --minutes 360
 *
 * فقط از متغیرهای محیطی (یا فایل .env کنار پروژه) خوانده می‌شود؛ هیچ کلیدی چاپ یا ذخیره نمی‌شود.
 */

const fs = require('node:fs');
const path = require('node:path');
const balepay = require('../lib/balepay.js');
const { serverConfiguration, callServiceRpc, supabaseServerConfig } = require('../lib/supabase-server.js');

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
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

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return String(process.argv[index + 1] || fallback);
}

function redact(config) {
  return {
    mode: config.mode,
    sandbox: config.sandbox,
    apiBase: config.apiBase,
    configured: config.configured,
    livePaymentsAllowed: config.livePaymentsAllowed,
    providerTokenKind: config.providerTokenKind,
    botTokenPresent: config.validBotToken,
    stateSecretPresent: config.validStateSecret,
    botUsername: config.botUsername || null,
    miniAppUrl: config.miniAppUrl || null,
    webhookPath: config.webhookPath,
    webhookSecretConfigured: Boolean(config.webhookSecret),
    requireWebhookSecret: config.requireWebhookSecret,
    minimumAmountToman: balepay.MINIMUM_AMOUNT_RIAL / 10
  };
}

async function main() {
  loadEnv();
  const command = process.argv[2] || 'config';
  const config = balepay.getConfig();
  const failure = balepay.configurationError(config);

  if (command === 'config') {
    console.log(JSON.stringify({ ...redact(config), database: { serviceConfigured: supabaseServerConfigSafe().serviceConfigured }, error: failure ? failure.message : null }, null, 2));
    return;
  }
  if (failure) throw failure;

  if (command === 'webhook:set') {
    const target = (process.argv[3] || '').startsWith('http') ? process.argv[3] : `${process.env.BALEPAY_PUBLIC_ORIGIN || ''}${config.webhookPath}`;
    if (!target || !/^https:\/\//.test(target)) throw Object.assign(new Error('نشانی وب‌هوک باید کامل و HTTPS باشد؛ مثال: node scripts/balepay-cli.js webhook:set https://shop.example.com/api/payment/balepay/webhook'), { status: 400 });
    const result = await balepay.setWebhook({ config, url: target });
    console.log(JSON.stringify({ ok: true, result, url: target }, null, 2));
    return;
  }
  if (command === 'webhook:status') {
    console.log(JSON.stringify(await balepay.getWebhookInfo({ config }), null, 2));
    return;
  }
  if (command === 'webhook:delete') {
    console.log(JSON.stringify(await balepay.deleteWebhook({ config }), null, 2));
    return;
  }
  if (command === 'inquire') {
    const transactionId = process.argv[3] || '';
    const result = await balepay.inquireTransaction({ config, transactionId, expectedAmountRial: arg('irr', 0) ? Number(arg('irr')) : NaN });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'invoice') {
    const orderId = arg('order');
    const amountToman = Number(arg('toman', '0'));
    if (!orderId || !Number.isSafeInteger(amountToman) || amountToman <= 0) throw Object.assign(new Error('برای ساخت صورتحساب --order و --toman را وارد کنید.'), { status: 400 });
    const result = await balepay.createInvoiceLink({ config, orderId, orderNumber: arg('number', orderId), amountRial: amountToman * 10 });
    console.log(JSON.stringify({ invoiceParams: result.invoice, payload: result.payload, authority: result.authority, openWith: 'Bale.WebApp.openInvoice(invoiceParams)' }, null, 2));
    return;
  }
  if (command === 'send') {
    const chatId = arg('chat');
    const amountToman = Number(arg('toman', '0'));
    if (!chatId || !Number.isSafeInteger(amountToman) || amountToman <= 0) throw Object.assign(new Error('برای ارسال صورتحساب در گفتگو --chat و --toman را وارد کنید.'), { status: 400 });
    const result = await balepay.sendInvoiceMessage({ config, chatId, orderId: arg('order', `manual-${Date.now()}`), orderNumber: arg('number', 'آزمون دستی'), amountRial: amountToman * 10 });
    console.log(JSON.stringify({ messageId: result.message?.message_id ?? null, chatId: result.chatId, authority: result.authority }, null, 2));
    return;
  }
  if (command === 'expire') {
    const result = await callServiceRpc('expire_stale_balepay_checkouts', { p_grace_minutes: Number(arg('minutes', '360')) }, serverConfiguration());
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'poll') {
    const database = serverConfiguration();
    let offset = Number(arg('offset', '0'));
    console.log('getUpdates long-polling فعال است؛ با Ctrl+C متوقف کنید. (قبل از آن Webhook بازو را با webhook:delete غیرفعال کنید)');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let updates = [];
      try {
        updates = (await balepay.callBaleApi({ config, method: 'getUpdates', params: { offset: offset || undefined, timeout: 20 }, timeoutMs: 30000 })) || [];
      } catch (error) {
        console.error(`خواندن آپدیت‌ها ناموفق بود: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        try {
          const result = await balepay.handleUpdate({ update, config, dbConfig: database });
          console.log(`update ${update.update_id}: ${result.reason}${result.orderId ? ` order=${result.orderId}` : ''}`);
        } catch (error) {
          console.error(`update ${update.update_id} خطا: ${error.message}`);
        }
      }
    }
  }
  throw Object.assign(new Error(`دستور ناشناخته: ${command}`), { status: 400 });
}

function supabaseServerConfigSafe() {
  try { return supabaseServerConfig(); } catch { return { serviceConfigured: false }; }
}

main().catch(error => {
  console.error(`BalePay CLI: ${error.message || 'خطای نامشخص'}`);
  process.exit(1);
});

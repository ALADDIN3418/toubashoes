'use strict';
/* تک‌تابعهٔ مسیرهای بیت‌پی — تنها درگاه پرداخت، در سقف ۱۲ تابعِ طرح Hobby ورسل:
 * داینامیک‌رویت `[action]` همان چهار آدرس را با یک تابع سرو می‌کند:
 * /api/payment/bitpay/{request,verify,status,callback}. مسیر ناشناخته ۴۰ می‌گیرد.
 * سقف بدنه ۳۲KB (درخواست‌ها فقط orderId دارند؛ هیچ راز و هیچ مبلغی از کلاینت خوانده نمی‌شود).
 */
const bitpay = require('../../../lib/bitpay.js');

const HANDLERS = Object.freeze({
  request: bitpay.request,
  verify: bitpay.verify,
  status: bitpay.status,
  callback: bitpay.callback
});

function actionOf(req) {
  let pathname = '';
  try { pathname = new URL(String(req.url || '/'), 'https://store.invalid').pathname; } catch { return ''; }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 4 || segments[0] !== 'api' || segments[1] !== 'payment' || segments[2] !== 'bitpay') return '';
  return segments[3];
}

module.exports = async function bitpayDispatcher(req, res) {
  const handler = HANDLERS[actionOf(req)];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'مسیر درگاه بیت‌پی پیدا نشد.' }));
  }
  return handler(req, res);
};

module.exports.config = { api: { bodyParser: { sizeLimit: '32kb' } } };

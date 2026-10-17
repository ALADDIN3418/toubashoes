'use strict';
// ساخت تراکنش بیت‌پی برای سفارش در انتظار پرداخت (POST /payment/gateway-send → id_get).
// کلید API هرگز از این route عبور نمی‌کند؛ پاسخ فقط نشانی هدایت به بانک و شناسهٔ تراکنش است.

const handler = require('../../../lib/bitpay.js').request;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

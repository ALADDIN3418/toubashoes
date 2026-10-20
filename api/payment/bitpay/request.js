'use strict';
/* بستهٔ نازک مسیر «request» درگاه بیت‌پی — POST {orderId}؛ ساخت تراکنش از gateway-send و اتصال به سفارش.
 * منطق در lib/bitpay.js است. سقف بدنه 32kb (هیچ راز و هیچ مبلغی از کلاینت خوانده نمی‌شود).
 * فایل استاتیک به‌جای داینامیک‌رویت: مسیرهای API با نام ثابت روی ورسل قطعی‌تر route می‌شوند. */
const bitpay = require('../../../lib/bitpay.js');

module.exports = bitpay.request;
module.exports.config = { api: { bodyParser: { sizeLimit: '32kb' } } };

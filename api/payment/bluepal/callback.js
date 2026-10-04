'use strict';
// بازگشت مرورگر مشتری از صفحه بانک. تنها کد پیگیری ثبت‌شده در پایگاه داده استعلام
// و فقط پاسخ GET /v1/payments/verify/{track_id} سفارش را نهایی می‌کند؛ سپس مشتری به صفحهٔ نتیجه هدایت می‌شود.
module.exports = require('../../../lib/bluepal.js').callback;
module.exports.config = { api:{ bodyParser:false } };

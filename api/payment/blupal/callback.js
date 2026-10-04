'use strict';
// بازگشت مرورگر مشتری از صفحهٔ پرداخت بلوپال. هیچ پارامتری از مرورگر پذیرفته نمی‌شود؛
// شناسهٔ فاکتورِ ثبت‌شده در پایگاه داده استعلام می‌شود و تنها GET /v1/invoices/{invoice_id}
// با وضعیت PAID سفارش را نهایی می‌کند؛ سپس مشتری به صفحهٔ نتیجهٔ سفارش هدایت می‌شود.
module.exports = require('../../../lib/blupal.js').callback;
module.exports.config = { api:{ bodyParser:false } };

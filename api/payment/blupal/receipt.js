'use strict';
// وضعیت پرداخت صفحهٔ نتیجه: همان شناسهٔ فاکتورِ ثبت‌شده در پایگاه داده از خودِ بلوپال
// (GET /v1/invoices/{invoice_id}) پرسیده می‌شود و در صورت PAID تسویهٔ یک‌مصرف انجام می‌شود.
const handler = require('../../../lib/blupal.js').receipt;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

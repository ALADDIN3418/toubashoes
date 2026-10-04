'use strict';
// ساخت فاکتور بلوپال برای سفارش در انتظار پرداخت؛ پاسخ فقط نشانی صفحهٔ پرداخت و
// مبلغ اصلاحی (final_amount) را به مرورگر می‌دهد. کلید API هرگز از این route عبور نمی‌کند.

const handler = require('../../../lib/blupal.js').request;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

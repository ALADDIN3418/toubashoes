'use strict';
// صفحهٔ نتیجه/دکمهٔ بررسی دوباره: سرور خودش با trans_id ذخیره‌شده استعلام
// gateway-result-second را تکرار می‌کند و در صورت status=1|11 تسویهٔ یک‌مصرف انجام می‌دهد.
const handler = require('../../../lib/bitpay.js').verify;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'16kb' } } };

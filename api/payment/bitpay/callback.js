'use strict';
// بازگشت مرورگر مشتری از بانک (با ?trans_id و id_get در query). هیچ پارامتری از مرورگر
// مبنای پرداخت نیست؛ تطبیق با رکورد پرداختِ پایگاه‌داده + استعلام gateway-result-second
// سمت سرور انجام می‌شود و سپس مشتری به صفحهٔ نتیجهٔ سفارش هدایت می‌گردد.
module.exports = require('../../../lib/bitpay.js').callback;
module.exports.config = { api:{ bodyParser:false } };

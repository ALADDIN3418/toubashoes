'use strict';
// وب‌هوک پرداخت از سرور بلوپال (رویداد payment.completed). بدنه هرگز منبع تأیید نیست؛
// handler شناسهٔ فاکتور را پیدا می‌کند، وضعیت را از خودِ درگاه می‌پرسد و سپس تسویه می‌کند.
// پاسخ همیشه سریع و ۲۰۰ است تا بلوپال تلاش دوباره نکند؛ فقط خطای زیرساخت ۵۰۰ برمی‌گردد.
const handler = require('../../../lib/blupal.js').notify;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'64kb' } } };

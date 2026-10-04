'use strict';
// اعلان نتیجه پرداخت از سرور بلو پال. بدنه هرگز منبع تأیید نیست؛ handler همان
// track_id را از درگاه استعلام می‌کند و در صورت لزوم ۵۰۰ (تلاش دوباره) برمی‌گرداند.
const handler = require('../../../lib/bluepal.js').notify;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'64kb' } } };

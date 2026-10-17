'use strict';
/* تک‌تابعهٔ مسیرهای بلوپال — طرح رایگان Vercel (Hobby) حداکثر ۱۲ تابعٔ بدون‌سرور در هر دیپلوی
 * اجازه می‌دهد؛ به‌جای پنج فایل جدا، داینامیک‌رویت `[action]` همان پنج آدرس را با یک تابع
 * سرو می‌کند (قرارداد مسیرها ذره‌ای عوض نشده): /api/payment/blupal/{request,receipt,status,callback,notify}.
 * هر اکشن مستقیماً به همان هندلرِ lib/blupal.js می‌رسد؛ مسیرِ ناشناخته ۴۰۴ است و هیچ‌گاه
 * هندلر تصادفی اجرا نمی‌شود. سقف حجم بدنه = ۶۴KB (مقدار وب‌هوک notify، بزرگ‌ترین مصرف‌کننده).
 */
const blupal = require('../../../lib/blupal.js');

const HANDLERS = Object.freeze({
  request: blupal.request,
  receipt: blupal.receipt,
  status: blupal.status,
  callback: blupal.callback,
  notify: blupal.notify
});

function actionOf(req) {
  let pathname = '';
  try { pathname = new URL(String(req.url || '/'), 'https://store.invalid').pathname; } catch { return ''; }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 4 || segments[0] !== 'api' || segments[1] !== 'payment' || segments[2] !== 'blupal') return '';
  return segments[3];
}

module.exports = async function blupalDispatcher(req, res) {
  const handler = HANDLERS[actionOf(req)];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'مسیر درگاه بلوپال پیدا نشد.' }));
  }
  return handler(req, res);
};

module.exports.config = { api: { bodyParser: { sizeLimit: '64kb' } } };

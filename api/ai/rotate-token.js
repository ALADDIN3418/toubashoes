'use strict';

const { sendJson, sameOrigin, requireAdminRequest } = require('../../lib/vercel-api.js');
const { defaultKeyManager } = require('../../services/gpt-image.js');

module.exports = async function rotateToken(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });

  try {
    await requireAdminRequest(req);
  } catch (authError) {
    return sendJson(res, Number(authError.status) || 401, { error: authError.message });
  }

  try {
    if (defaultKeyManager.configuredKeys.length > 0) {
      const nextKey = await defaultKeyManager.getValidKey(true, 'client-requested-rotation');
      return sendJson(res, 200, {
        success: true,
        key: nextKey ? `${nextKey.slice(0, 7)}...` : null,
        rotated: true,
        message: 'کلید با موفقیت در استخر سرور چرخش یافت.'
      });
    }
    return sendJson(res, 200, {
      success: false,
      rotated: false,
      message: 'استخر کلید در سرور تعریف نشده است؛ لطفاً کلیدهای خود را در پنل ادمین وارد فرمایید.'
    });
  } catch (error) {
    return sendJson(res, 502, {
      error: error.message || 'خطا در چرخش کلید GPT Image'
    });
  }
};

'use strict';

const { sendJson, sameOrigin, requireAdminRequest } = require('../../lib/vercel-api.js');
const { defaultTokenManager } = require('../../services/puter-image.js');

module.exports = async function rotateToken(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'فقط درخواست مستقیم از همین فروشگاه مجاز است.' });

  try {
    await requireAdminRequest(req);
  } catch (authError) {
    return sendJson(res, Number(authError.status) || 401, { error: authError.message });
  }

  try {
    const newToken = await defaultTokenManager.getValidToken(true, 'client-requested-rotation');
    return sendJson(res, 200, {
      success: true,
      token: newToken,
      rotated: true,
      message: 'توکن جدید با موفقیت جایگزین شد.'
    });
  } catch (error) {
    return sendJson(res, 502, {
      error: error.message || 'خطا در چرخش خودکار توکن Puter GPT Image'
    });
  }
};

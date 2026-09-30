'use strict';
const { sendJson, MODEL, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const { DEFAULT_MODEL, SUPPORTED_MODELS, SUPPORTED_STYLES, SUPPORTED_LIGHTINGS } = require('../../services/studio-image.js');

module.exports = function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  return sendJson(res, 200, {
    configured: true,
    keyless: true,
    unlimited: true,
    free: true,
    persistentQuotaConfigured,
    quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
    provider: 'Touba AI Commercial Studio (100% Free & Unlimited)',
    model: DEFAULT_MODEL || MODEL,
    supportedModels: SUPPORTED_MODELS,
    supportedStyles: SUPPORTED_STYLES,
    supportedLightings: SUPPORTED_LIGHTINGS,
    localDailyLimit: 'unlimited',
    referenceMaxSide: 1280,
    note: 'استودیوی هوشمند عکس محصول طوبی: کاملاً رایگان، نامحدود، بدون نیاز به کلید API و با حفظ ۱۰۰٪ هویت کفش مرجع.'
  });
};

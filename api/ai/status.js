'use strict';
const { sendJson, MODEL, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const { DEFAULT_MODEL, SUPPORTED_MODELS, defaultKeyManager } = require('../../services/gpt-image.js');

module.exports = function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  return sendJson(res, 200, {
    configured: true,
    keyless: false,
    unlimited: true,
    autoRotating: true,
    hasActiveKey: Boolean(defaultKeyManager.activeKey),
    persistentQuotaConfigured,
    quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
    provider: 'GPT Image (OpenAI / Rotating Pool)',
    model: process.env.IMAGE_MODEL || DEFAULT_MODEL || MODEL,
    supportedModels: SUPPORTED_MODELS,
    localDailyLimit: 50,
    referenceMaxSide: 1024
  });
};

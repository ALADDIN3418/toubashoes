'use strict';
const { sendJson, MODEL, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const { DEFAULT_MODEL, SUPPORTED_MODELS } = require('../../services/puter-image.js');

module.exports = function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  return sendJson(res, 200, {
    configured: true,
    puterConfigured: true,
    keyless: true,
    serverTokenConfigured: Boolean(process.env.PUTER_AUTH_TOKEN),
    authMode: process.env.PUTER_AUTH_TOKEN ? 'server_token' : 'client_user_pays',
    persistentQuotaConfigured,
    quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
    provider: 'Puter.js (OpenAI GPT Image)',
    model: process.env.PUTER_IMAGE_MODEL || DEFAULT_MODEL || MODEL,
    supportedModels: SUPPORTED_MODELS,
    localDailyLimit: 50,
    referenceMaxSide: 1024
  });
};

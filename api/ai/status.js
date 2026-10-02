'use strict';
const { sendJson, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const {
  DEFAULT_BACKEND_URL,
  SUPPORTED_PIPELINES,
  DEFAULT_PIPELINE,
  SUPPORTED_PROVIDERS,
  PUTER_IMAGE_MODELS,
  PUTER_STUDIO_PROVIDER_NAME,
  checkBackendHealth
} = require('../../services/ai-studio-engine.js');
const { PRESETS } = require('../../services/prompt-templates.js');

module.exports = async function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  const health = await checkBackendHealth();

  return sendJson(res, 200, {
    success: true,
    configured: true,
    keyless: true,
    unlimited: false,
    free: false,
    persistentQuotaConfigured,
    quotaMode: 'puter-user-pays',
    provider: PUTER_STUDIO_PROVIDER_NAME,
    model: DEFAULT_PIPELINE,
    supportedModels: SUPPORTED_PIPELINES,
    supportedPipelines: SUPPORTED_PIPELINES,
    supportedProviders: SUPPORTED_PROVIDERS,
    puterImageModels: PUTER_IMAGE_MODELS,
    totalModels: PUTER_IMAGE_MODELS.length,
    editableModels: PUTER_IMAGE_MODELS.filter(model => model.supportsImg2Img).length,
    presets: PRESETS,
    backendUrl: DEFAULT_BACKEND_URL,
    backendHealth: health,
    billingModel: 'Puter user-pays; usage depends on the signed-in Puter account',
    referenceMaxSide: 1280,
    note: 'استودیو طوبی از فهرست مدل‌های تصویر Puter.js استفاده می‌کند؛ مدل‌های دارای پشتیبانی ویرایش عکس به‌صورت چرخشی و با جایگزینی خودکار امتحان می‌شوند.'
  });
};

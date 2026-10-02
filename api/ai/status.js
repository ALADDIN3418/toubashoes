'use strict';
const { sendJson, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const {
  DEFAULT_COMFY_API_URL,
  SUPPORTED_PIPELINES,
  DEFAULT_PIPELINE,
  SUPPORTED_PROVIDERS,
  checkComfyHealth
} = require('../../services/ai-studio-engine.js');
const { PRESETS } = require('../../services/prompt-templates.js');

module.exports = async function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  const health = await checkComfyHealth();

  return sendJson(res, 200, {
    success: true,
    configured: true,
    keyless: true,
    unlimited: true,
    free: true,
    persistentQuotaConfigured,
    quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
    provider: 'Google Gemini 3.5 Flash (gemini-3.5-flash)',
    model: DEFAULT_PIPELINE,
    supportedModels: SUPPORTED_PIPELINES,
    supportedPipelines: SUPPORTED_PIPELINES,
    supportedProviders: SUPPORTED_PROVIDERS,
    presets: PRESETS,
    comfyApiUrl: DEFAULT_COMFY_API_URL,
    comfyStatus: health,
    localDailyLimit: 'unlimited',
    referenceMaxSide: 1280,
    note: 'استودیو هوش مصنوعی محصول طوبی: تولید و ویرایش تصویر با مدل رایگان Google Gemini 3.5 Flash (gemini-3.5-flash).'
  });
};

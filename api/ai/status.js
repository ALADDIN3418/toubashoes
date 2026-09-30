'use strict';
const { sendJson, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');
const {
  DEFAULT_COMFY_API_URL,
  SUPPORTED_PIPELINES,
  DEFAULT_PIPELINE,
  checkComfyHealth
} = require('../../services/comfy-image.js');

module.exports = async function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  const health = await checkComfyHealth();

  return sendJson(res, 200, {
    configured: true,
    keyless: true,
    unlimited: true,
    free: true,
    persistentQuotaConfigured,
    quotaMode: persistentQuotaConfigured ? 'persistent-utc' : 'process-memory',
    provider: 'ComfyUI Automation API (Qwen-Image-Edit / FLUX.2 / SDXL)',
    model: DEFAULT_PIPELINE,
    supportedModels: SUPPORTED_PIPELINES,
    supportedPipelines: SUPPORTED_PIPELINES,
    comfyApiUrl: DEFAULT_COMFY_API_URL,
    comfyStatus: health,
    localDailyLimit: 'unlimited',
    referenceMaxSide: 1280,
    note: 'دستیار خودکارسازی ComfyUI: ویرایش دستوری با Qwen-Image-Edit بر پایه عکس مرجع، FLUX.2 و SDXL بدون وابستگی به کلیدهای شخص ثالث.'
  });
};

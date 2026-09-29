'use strict';
const { sendJson, MODEL, persistentAiQuotaConfig } = require('../../lib/vercel-api.js');

module.exports = function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const cloudflareConfigured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  const persistentQuotaConfigured = Boolean(persistentAiQuotaConfig());
  const quotaConfigured = persistentQuotaConfigured || !process.env.VERCEL;
  return sendJson(res, 200, {
    configured:cloudflareConfigured && quotaConfigured,
    cloudflareConfigured,
    persistentQuotaConfigured,
    quotaMode:persistentQuotaConfigured ? 'persistent-utc' : process.env.VERCEL ? 'unavailable' : 'process-memory',
    provider:'Cloudflare Workers AI',
    model:process.env.CLOUDFLARE_IMAGE_MODEL || MODEL,
    freeDailyNeurons:10000,
    localDailyLimit:50,
    referenceMaxSide:511
  });
};

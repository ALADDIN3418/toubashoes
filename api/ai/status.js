'use strict';
const { sendJson, MODEL } = require('../../lib/vercel-api.js');

module.exports = function aiStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error:'روش درخواست مجاز نیست.' });
  const configured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  return sendJson(res, 200, {
    configured,
    provider:'Cloudflare Workers AI',
    model:process.env.CLOUDFLARE_IMAGE_MODEL || MODEL,
    freeDailyNeurons:10000,
    localDailyLimit:20,
    referenceMaxSide:511
  });
};

'use strict';
const { studioGenerate } = require('../../../lib/vercel-api.js');

module.exports = studioGenerate;
module.exports.config = { api: { bodyParser: { sizeLimit: '15mb' } } };

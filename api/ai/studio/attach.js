'use strict';
const { studioAttach } = require('../../../lib/vercel-api.js');

module.exports = studioAttach;
module.exports.config = { api: { bodyParser: { sizeLimit: '15mb' } } };

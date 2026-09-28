'use strict';
const { productImageUpload } = require('../../lib/vercel-api.js');

module.exports = productImageUpload;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'4mb' } } };

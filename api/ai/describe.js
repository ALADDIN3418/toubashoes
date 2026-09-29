'use strict';
const { productDescription } = require('../../lib/vercel-api.js');

module.exports = productDescription;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'1mb' } } };

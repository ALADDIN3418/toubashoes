'use strict';
const { productPhoto } = require('../../lib/vercel-api.js');

module.exports = productPhoto;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'4mb' } } };

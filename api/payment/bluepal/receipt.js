'use strict';
const handler = require('../../../lib/bluepal.js').receipt;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

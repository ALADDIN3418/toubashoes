'use strict';
const handler = require('../../../lib/balepay.js').receipt;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

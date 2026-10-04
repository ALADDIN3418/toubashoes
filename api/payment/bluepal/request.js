'use strict';
const handler = require('../../../lib/bluepal.js').request;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'32kb' } } };

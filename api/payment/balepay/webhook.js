'use strict';
// Bale posts bot updates (pre_checkout_query / successful_payment) to this route.
// The handler re-verifies every payment with inquireTransaction before settling.
const handler = require('../../../lib/balepay.js').webhook;
module.exports = handler;
module.exports.config = { api:{ bodyParser:{ sizeLimit:'256kb' } } };

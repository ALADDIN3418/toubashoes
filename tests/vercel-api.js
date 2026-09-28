'use strict';
const assert = require('node:assert/strict');
const aiStatus = require('../api/ai/status.js');
const productPhoto = require('../api/ai/product-photo.js');
const productImageUpload = require('../api/uploads/product-image.js');

function response() {
  return {
    statusCode:200, headers:{}, body:'',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; }
  };
}
function payload(res) { return JSON.parse(res.body); }

async function main() {
  const oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const oldToken = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    let res = response();
    aiStatus({ method:'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).configured, false);
    assert.equal(payload(res).provider, 'Cloudflare Workers AI');

    res = response();
    await productPhoto({ method:'GET', headers:{} }, res);
    assert.equal(res.statusCode, 405);

    res = response();
    await productPhoto({ method:'POST', headers:{}, body:{} }, res);
    assert.equal(res.statusCode, 403);

    res = response();
    await productPhoto({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{} }, res);
    assert.equal(res.statusCode, 503);

    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${tinyJpeg}`;
    res = response();
    productImageUpload({ method:'POST', headers:{ origin:'https://touba.test', host:'touba.test' }, body:{ image:dataUrl } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(payload(res).url, dataUrl);
    assert.equal(payload(res).storage, 'browser-local');
  } finally {
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = oldToken;
  }
  console.log('PASS: Vercel function endpoints, same-origin checks and ephemeral upload behavior');
}
main().catch(error => { console.error(error); process.exit(1); });

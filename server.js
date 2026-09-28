'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateProductPhoto, MODEL } = require('./services/cloudflare-image.js');

function loadLocalEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
loadLocalEnv();

const root = __dirname;
const aiGenerationTimes = [];
const productImageSaveTimes = [];
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8' };

function json(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extraHeaders });
  res.end(JSON.stringify(value));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, tooLarge = false;
    req.on('data', chunk => { size += chunk.length; if (size > limit) tooLarge = true; else chunks.push(chunk); });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('حجم درخواست بیش از حد مجاز است.'), { status:413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('بدنه درخواست JSON معتبر نیست.'), { status:400 })); }
    });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  if (!req.headers.origin) return false;
  try {
    const originHost = new URL(req.headers.origin).host;
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return originHost === requestHost;
  } catch { return false; }
}
function requireSameOrigin(req, res) {
  if (!sameOrigin(req)) { json(res, 403, { error:'فقط درخواست مستقیم از همین فروشگاه مجاز است.' }); return false; }
  return true;
}
function useQuota(queue, max, intervalMs) {
  const now = Date.now();
  while (queue.length && now - queue[0] >= intervalMs) queue.shift();
  if (queue.length >= max) return false;
  queue.push(now);
  return true;
}
function parseJpegDataUrl(value, maxBytes = 3 * 1024 * 1024) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('ورودی باید JPEG باشد.'), { status:400 });
  const data = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (data.length < 4 || data.length > maxBytes || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    throw Object.assign(new Error(`عکس JPEG معتبر و کمتر از ${Math.round(maxBytes / 1024 / 1024)} مگابایت انتخاب کنید.`), { status:413 });
  }
  return data;
}


const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return json(res, 400, { error:'آدرس درخواست معتبر نیست.' }); }

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    const configured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
    return json(res, 200, { configured, provider:'Cloudflare Workers AI', model:process.env.CLOUDFLARE_IMAGE_MODEL || MODEL, freeDailyNeurons:10000, localDailyLimit:20, referenceMaxSide:511 });
  }
  if (pathname === '/api/ai/product-photo') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return json(res, 503, { error:'سرویس هنوز تنظیم نشده است. Account ID و API Token را فقط در فایل محلی .env وارد کنید؛ این اطلاعات را در گفتگو نفرستید.' });
    }
    let body, sourceBytes;
    try {
      body = await readBody(req, 4 * 1024 * 1024);
      sourceBytes = parseJpegDataUrl(body.image);
    } catch (error) { return json(res, Number(error.status) || 400, { error:error.message }); }
    if (!useQuota(aiGenerationTimes, 20, 24 * 60 * 60 * 1000)) {
      return json(res, 429, { error:'سقف محافظ داخلی فروشگاه (۲۰ تصویر در ۲۴ ساعت) پر شده است تا مصرف سهمیهٔ رایگان Cloudflare کنترل شود.' }, { 'Retry-After':'86400' });
    }
    try {
      const result = await generateProductPhoto({ imageBytes:sourceBytes, style:body.style, productHint:body.productHint });
      return json(res, 200, result);
    } catch (error) {
      const status = Number(error.status) || 502;
      return json(res, status, { error:error.message || 'ساخت تصویر با مدل رایگان انجام نشد.' });
    }
  }
  if (pathname === '/api/uploads/product-image') {
    if (req.method !== 'POST') return json(res, 405, { error:'روش درخواست مجاز نیست.' });
    if (!requireSameOrigin(req, res)) return;
    let body, data;
    try { body = await readBody(req, 3 * 1024 * 1024); data = parseJpegDataUrl(body.image, 2 * 1024 * 1024); }
    catch (error) { return json(res, Number(error.status) || 400, { error:error.message || 'عکس معتبر نیست.' }); }
    if (!useQuota(productImageSaveTimes, 40, 60 * 60 * 1000)) return json(res, 429, { error:'سقف ذخیرهٔ فایل تصویری در ساعت پر شده است.' });
    try {
      const dir = path.join(root, 'uploads', 'products');
      await fs.promises.mkdir(dir, { recursive:true });
      const filename = `ai-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.jpg`;
      await fs.promises.writeFile(path.join(dir, filename), data, { flag:'wx', mode:0o644 });
      return json(res, 201, { url:`/uploads/products/${filename}`, bytes:data.length });
    } catch (error) { return json(res, 500, { error:error.message || 'ذخیره فایل انجام نشد.' }); }
  }

  const file = path.join(root, pathname.replace(/^\/+/, ''));
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const protocol = String(req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
    let origin; try { origin = new URL(`${protocol}://${host}`).origin; } catch { origin = 'https://localhost'; }
    return fs.readFile(file, 'utf8', (err, content) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type':types[path.extname(file)], 'Cache-Control':'no-store' });
      res.end(content.replaceAll('{{ORIGIN}}', origin));
    });
  }
  if (pathname === '/' || !path.extname(pathname) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return serveFile(path.join(root, 'index.html'), res);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  serveFile(file, res);
});
function serveFile(file, res) {
  res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  fs.createReadStream(file).pipe(res);
}
server.listen(process.env.PORT || 4173, '0.0.0.0', () => console.log(`طوبی storefront listening on ${server.address().port} · mock commerce / Cloudflare Workers AI product-image demo`));

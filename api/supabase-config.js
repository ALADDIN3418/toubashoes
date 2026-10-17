'use strict';

// Only the public project URL and publishable/anon key are exposed to the browser.
// Never return SUPABASE_SERVICE_ROLE_KEY or any database password from this endpoint — and if a
// secret key was pasted into the public variable by mistake, refuse to echo that one too.
module.exports = function supabasePublicConfig(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }
  const rawUrl = String(process.env.SUPABASE_URL || '').trim();
  let safeUrl = '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) safeUrl = parsed.origin;
  } catch { /* keep empty until a valid HTTPS project URL is configured */ }
  const { looksLikeSecretKey } = require('../lib/supabase-server.js');
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const safeKey = key && key.length < 4096 && !looksLikeSecretKey(key) ? key : '';
  const config = { configured: Boolean(safeUrl || safeKey), enabled: Boolean(safeUrl && safeKey), url: safeUrl, anonKey: safeKey };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.statusCode = 200;
  return res.end(`window.TOUBA_PUBLIC_CONFIG=Object.freeze(${JSON.stringify(config)});`);
};

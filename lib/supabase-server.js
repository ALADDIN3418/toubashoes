'use strict';

const ALLOWED_SERVICE_RPCS = new Set([
  'attach_balepay_invoice',
  'settle_balepay_payment'
]);

function supabaseServerConfig(env = process.env) {
  const rawUrl = String(env.SUPABASE_URL || '').trim();
  const publicKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let baseUrl = '';
  try {
    const url = new URL(rawUrl);
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.host);
    if ((url.protocol === 'https:' || (local && url.protocol === 'http:')) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) {
      baseUrl = url.origin;
    }
  } catch { /* Missing or malformed configuration stays unavailable. */ }
  return {
    baseUrl,
    publicKey,
    serviceRoleKey,
    configured: Boolean(baseUrl && publicKey),
    serviceConfigured: Boolean(baseUrl && publicKey && serviceRoleKey)
  };
}

function serverConfiguration(env = process.env, { service = true } = {}) {
  const config = supabaseServerConfig(env);
  if (!config.configured || (service && !config.serviceConfigured)) {
    throw Object.assign(new Error('درگاه سفارش به پیکربندی سروری Supabase متصل نیست.'), { status:503 });
  }
  return config;
}

function bearerToken(req) {
  const match = /^Bearer\s+([A-Za-z0-9._~-]{20,8192})$/i.exec(String(req?.headers?.authorization || '').trim());
  if (!match) throw Object.assign(new Error('برای ادامه با حساب مشتری وارد شوید.'), { status:401 });
  return match[1];
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return text; }
}

async function authenticateCustomer(req, env = process.env, fetchImpl = globalThis.fetch) {
  const config = serverConfiguration(env);
  const accessToken = bearerToken(req);
  let authResponse;
  try {
    authResponse = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method:'GET',
      headers:{ apikey:config.publicKey, Authorization:`Bearer ${accessToken}` },
      signal:AbortSignal.timeout(7000)
    });
  } catch {
    throw Object.assign(new Error('اعتبارسنجی امن نشست کاربر با Supabase انجام نشد.'), { status:503 });
  }
  const authBody = await readResponse(authResponse);
  if (!authResponse.ok || !authBody?.id) {
    throw Object.assign(new Error(authResponse.status === 401 ? 'نشست ورود منقضی شده است؛ دوباره وارد شوید.' : 'اعتبارسنجی حساب کاربری انجام نشد.'), { status:authResponse.status === 401 ? 401 : 503 });
  }
  const profileUrl = new URL('/rest/v1/profiles', config.baseUrl);
  profileUrl.searchParams.set('select','id,role,is_active');
  profileUrl.searchParams.set('id',`eq.${authBody.id}`);
  profileUrl.searchParams.set('limit','1');
  let profileResponse;
  try {
    profileResponse = await fetchImpl(profileUrl, {
      method:'GET',
      headers:{ apikey:config.serviceRoleKey, Authorization:`Bearer ${config.serviceRoleKey}` },
      signal:AbortSignal.timeout(7000)
    });
  } catch {
    throw Object.assign(new Error('خواندن نقش کاربر از Supabase انجام نشد.'), { status:503 });
  }
  const rows = await readResponse(profileResponse);
  if (!profileResponse.ok || !Array.isArray(rows)) {
    throw Object.assign(new Error('اعتبارسنجی نقش کاربر انجام نشد.'), { status:503 });
  }
  const profile = rows[0];
  if (!profile?.is_active || profile.id !== authBody.id || profile.role !== 'customer') {
    throw Object.assign(new Error('این عملیات فقط برای یک حساب مشتریِ فعال مجاز است.'), { status:403 });
  }
  return { ...config, accessToken, userId:authBody.id, profile };
}

async function supabaseRest({ config, path, method = 'GET', body, prefer, fetchImpl = globalThis.fetch }) {
  if (!config?.serviceRoleKey || !config?.baseUrl) throw Object.assign(new Error('اتصال امن پایگاه دادهٔ سرور در دسترس نیست.'), { status:503 });
  const headers = {
    apikey:config.serviceRoleKey,
    Authorization:`Bearer ${config.serviceRoleKey}`,
    Accept:'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body:JSON.stringify(body) } : {}),
      signal:AbortSignal.timeout(10000)
    });
  } catch {
    throw Object.assign(new Error('ارتباط امن با پایگاه داده برقرار نشد.'), { status:503 });
  }
  const result = await readResponse(response);
  if (!response.ok) {
    throw Object.assign(new Error('عملیات پایگاه داده کامل نشد.'), { status:response.status >= 400 && response.status < 500 ? 409 : 503, databaseStatus:response.status });
  }
  return result;
}

async function selectOrderPayment({ config, orderId, userId, pendingOnly = false, fetchImpl = globalThis.fetch }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(orderId || ''))) {
    throw Object.assign(new Error('شناسهٔ سفارش معتبر نیست.'), { status:400 });
  }
  const filters={
    select:'id,user_id,status,total_toman,number',
    id:`eq.${orderId}`,
    limit:'1'
  };
  if(userId)filters.user_id=`eq.${userId}`;
  if(pendingOnly)filters.status='eq.pending_payment';
  const query = new URLSearchParams(filters);
  const orders = await supabaseRest({ config, path:`/rest/v1/orders?${query}`, fetchImpl });
  if (!Array.isArray(orders) || !orders[0]) throw Object.assign(new Error('سفارش قابل‌دسترسی پیدا نشد.'), { status:404 });
  const order = orders[0];
  const paymentQuery = new URLSearchParams({
    select:'id,order_id,status,amount_toman,authority,provider,provider_reference,provider_code,callback_payload',
    order_id:`eq.${orderId}`,
    provider:'eq.balepay',
    limit:'1'
  });
  const payments = await supabaseRest({ config, path:`/rest/v1/payments?${paymentQuery}`, fetchImpl });
  if (!Array.isArray(payments) || !payments[0] || Number(payments[0].amount_toman) !== Number(order.total_toman)) {
    throw Object.assign(new Error('رکورد پرداخت سفارش معتبر نیست.'), { status:409 });
  }
  if(pendingOnly&&(order.status!=='pending_payment'||payments[0].status!=='pending')){
    throw Object.assign(new Error('سفارش قابل پرداخت نیست یا دیگر در انتظار پرداخت نیست.'), { status:409 });
  }
  return { order, payment:payments[0] };
}

async function selectOwnedPendingOrder(options) {
  return selectOrderPayment({ ...options, pendingOnly:true });
}

// Payments are looked up by their Bale invoice payload from the outbound webhook,
// where no customer session exists, so the order must be resolved from the
// signed payload's authority value instead of the authenticated user.
async function selectPaymentByAuthority({ config, authority, fetchImpl = globalThis.fetch }) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(authority || ''))) {
    throw Object.assign(new Error('شناسهٔ مرجع پرداخت معتبر نیست.'), { status:400 });
  }
  const query = new URLSearchParams({
    select:'id,order_id,status,amount_toman,authority,provider,provider_reference,provider_code,callback_payload,orders!inner(id,number,status,total_toman,user_id)',
    authority:`eq.${authority}`,
    provider:'eq.balepay',
    limit:'1'
  });
  const rows = await supabaseRest({ config, path:`/rest/v1/payments?${query}`, fetchImpl });
  if (!Array.isArray(rows) || !rows[0]) throw Object.assign(new Error('رکورد پرداخت بله‌پی برای این صورتحساب پیدا نشد.'), { status:404 });
  const payment = rows[0];
  const order = Array.isArray(payment.orders) ? payment.orders[0] : payment.orders;
  if (!order || Number(order.total_toman) !== Number(payment.amount_toman)) {
    throw Object.assign(new Error('رکورد پرداخت سفارش معتبر نیست.'), { status:409 });
  }
  return { order, payment };
}

async function callServiceRpc(name, body, config, fetchImpl = globalThis.fetch) {
  if (!ALLOWED_SERVICE_RPCS.has(name)) throw new Error('Service RPC is not allowed.');
  const result = await supabaseRest({
    config,
    path:`/rest/v1/rpc/${name}`,
    method:'POST',
    body,
    fetchImpl
  });
  return result;
}

module.exports = {
  ALLOWED_SERVICE_RPCS,
  supabaseServerConfig,
  serverConfiguration,
  bearerToken,
  authenticateCustomer,
  supabaseRest,
  selectOrderPayment,
  selectOwnedPendingOrder,
  selectPaymentByAuthority,
  callServiceRpc
};

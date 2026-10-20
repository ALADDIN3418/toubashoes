/* RLS-backed Supabase repositories. Commerce mutations use reviewed Postgres RPCs, never client snapshots. */
(function (g) {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ORDER_STATUS = {
    pending_payment: 'NEW', paid: 'CONFIRMED', processing: 'PROCESSING',
    shipped: 'SHIPPED', delivered: 'DELIVERED', cancelled: 'CANCELLED', refunded: 'REFUNDED'
  };
  const REVIEW_STATUS = { pending: 'در انتظار تأیید', approved: 'تأیید شده', rejected: 'رد شده' };
  const APP_ORDER_STATUS = {
    NEW: 'pending_payment', CONFIRMED: 'paid', PROCESSING: 'processing',
    SHIPPED: 'shipped', DELIVERED: 'delivered', CANCELLED: 'cancelled', REFUNDED: 'refunded',
    'جدید': 'pending_payment', 'تأیید شده': 'processing', 'در حال آماده‌سازی': 'processing',
    'ارسال شده': 'shipped', 'تحویل داده شده': 'delivered', 'لغو شده': 'cancelled'
  };

  function fail(error, operation) {
    if (!error) return;
    const detail = error.message || error.details || error.code || 'خطای پایگاه داده';
    const permission = error.code === '42501' || /row-level security|permission denied/i.test(detail);
    throw new Error(permission
      ? `مجوز پایگاه داده این عملیات را نپذیرفت. نقش حساب، فعال‌بودن پروفایل و policyهای RLS را بررسی کنید. (${detail})`
      : `${operation || 'عملیات پایگاه داده'} انجام نشد: ${detail}`);
  }

  function clone(value) { return structuredClone(value); }
  function isUuid(value) { return UUID_RE.test(String(value || '')); }
  function newUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
  }
  function upsertLocal(rows, row) {
    const index = rows.findIndex(x => String(x.id) === String(row.id));
    if (index >= 0) rows[index] = row;
    else rows.unshift(row);
    return row;
  }
  function removeLocal(rows, id) {
    const index = rows.findIndex(x => String(x.id) === String(id));
    if (index >= 0) rows.splice(index, 1);
  }
  function dateOnly(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function dateLabel(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('fa-IR', { year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value)); }
    catch { return String(value); }
  }
  function normalizePhone(value) {
    return String(value || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, '');
  }
  function safePublicUrl(value, { optional = true } = {}) {
    const raw = String(value || '').trim();
    if (!raw) { if (optional) return null; throw new Error('آدرس تصویر یا پیوند را وارد کنید.'); }
    if (/[\\\\\u0000-\u001f\u007f\s]/.test(raw)) throw new Error('آدرس وب نامعتبر است.');
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    let parsed;
    try { parsed = new URL(raw); } catch { throw new Error('فقط مسیر محلی سایت یا آدرس HTTPS پذیرفته می‌شود.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('فقط مسیر محلی سایت یا آدرس HTTPS بدون اطلاعات ورود پذیرفته می‌شود.');
    return parsed.href;
  }
  function runFilter(rows, criteria) {
    const predicate = typeof criteria === 'function' ? criteria : row => Object.entries(criteria || {}).every(([key, value]) => {
      if (typeof value === 'function') return value(row[key]);
      if (Array.isArray(value)) return value.includes(row[key]);
      return row[key] === value;
    });
    return rows.filter(predicate).map(clone);
  }

  class StateRepository {
    constructor({ client, state, entity, table, key = 'id', toRow = x => x, fromRow = x => x, createArgs, updateArgs, canCreate = true, canUpdate = true, canDelete = true }) {
      Object.assign(this, { client, state, entity, table, key, toRow, fromRow, createArgs, updateArgs, canCreate, canUpdate, canDelete });
      this.state[entity] ||= [];
    }
    async list() { return clone(this.state[this.entity] || []); }
    async getById(id) { const row = (this.state[this.entity] || []).find(x => String(x[this.key] ?? x.id) === String(id)); return row ? clone(row) : null; }
    async search(query, fields = []) {
      const term = String(query || '').trim().toLocaleLowerCase('fa');
      if (!term) return this.list();
      return clone((this.state[this.entity] || []).filter(row => (fields.length ? fields : Object.keys(row)).some(field => String(row[field] ?? '').toLocaleLowerCase('fa').includes(term))));
    }
    async filter(criteria = {}) { return runFilter(this.state[this.entity] || [], criteria); }
    async create(input) {
      if (!this.canCreate) throw new Error(`ثبت ${this.entity} در این مسیر مجاز نیست.`);
      const payload = this.toRow(clone(input), 'create');
      const { data, error } = await this.client.from(this.table).insert(payload).select('*').single();
      fail(error, `ثبت ${this.entity}`);
      const row = this.fromRow(data);
      upsertLocal(this.state[this.entity], row);
      return clone(row);
    }
    async update(id, patch) {
      if (!this.canUpdate) throw new Error(`ویرایش ${this.entity} در این مسیر مجاز نیست.`);
      const previous = await this.getById(id);
      if (!previous) throw new Error(`${this.entity} پیدا نشد.`);
      const payload = this.toRow({ ...previous, ...clone(patch) }, 'update');
      delete payload.id;
      const { data, error } = await this.client.from(this.table).update(payload).eq(this.key, id).select('*').single();
      fail(error, `ویرایش ${this.entity}`);
      const row = this.fromRow(data);
      upsertLocal(this.state[this.entity], row);
      return clone(row);
    }
    async delete(id) {
      if (!this.canDelete) throw new Error(`حذف ${this.entity} در این مسیر مجاز نیست.`);
      let query = this.client.from(this.table).delete();
      if (this.key === 'code') query = query.eq('code', id);
      else if (this.key === 'key') query = query.eq('key', id);
      else query = query.eq(this.key, id);
      const { error } = await query;
      fail(error, `حذف ${this.entity}`);
      removeLocal(this.state[this.entity], id);
      return true;
    }
  }

  class ProductRepository extends StateRepository {
    constructor(context) { super({ ...context, entity:'products', table:'products', toRow: productToRow, fromRow:productFromRow }); this.context = context; }
    async create(input) { return this.write(null, input); }
    async update(id, patch) { return this.write(id, patch); }
    async write(id, input) {
      const current = id ? (this.state.products || []).find(x => String(x.id) === String(id)) : null;
      const merged = { ...(current || {}), ...clone(input) };
      const payload = productToRow(merged, id ? 'update' : 'create');
      if (id && isUuid(id)) payload.id = id;
      else delete payload.id;
      let result;
      if (id && isUuid(id)) {
        delete payload.id;
        const { data, error } = await this.client.from('products').update(payload).eq('id', id).select('*').single();
        fail(error, 'ذخیره محصول'); result = data;
      } else {
        const { data, error } = await this.client.from('products').insert(payload).select('*').single();
        fail(error, 'ثبت محصول'); result = data;
      }
      const variants = await saveVariants(this.context, result.id, merged.variants || []);
      const images = (this.state.productImages || []).filter(x => String(x.productId) === String(result.id));
      const row = productFromRow(result, variants, images);
      row.images = Array.isArray(merged.images) ? merged.images.slice() : images.map(x => x.url);
      upsertLocal(this.state.products, row);
      return clone(row);
    }
    async delete(id) {
      const { error } = await this.client.from('products').delete().eq('id', id);
      fail(error, 'حذف محصول');
      removeLocal(this.state.products, id);
      this.state.productImages = (this.state.productImages || []).filter(x => String(x.productId) !== String(id));
      return true;
    }
  }

  function productToRow(p) {
    const row = {
      slug: String(p.slug || '').trim(), name: String(p.name || '').trim(),
      short_description: String(p.shortDesc || ''), description: String(p.longDesc ?? p.desc ?? ''),
      brand: String(p.brand || ''), sku: String(p.sku || '').trim(),
      price_toman: Math.max(0, Math.round(Number(p.price) || 0)),
      compare_at_price_toman: Number(p.oldPrice) > 0 ? Math.round(Number(p.oldPrice)) : null,
      is_active: p.active !== false, is_featured: Boolean(p.featured), is_best_seller: Boolean(p.bestSeller),
      features: Array.isArray(p.features) ? p.features : [],
      specifications: p.specifications && typeof p.specifications === 'object' ? p.specifications : {},
      category_id: p.category || p.category_id
    };
    if (isUuid(p.id)) row.id = p.id;
    return row;
  }
  function productFromRow(row, variants = [], images = []) {
    const productVariants = variants.map(v => ({
      id:v.id, size:v.size, color:v.color, sku:v.sku || '', stock:Number(v.stock || 0), price:Number(v.price_toman || row.price_toman)
    }));
    const sizes = [...new Set(productVariants.map(v => v.size))];
    const colors = [...new Set(productVariants.map(v => v.color))];
    const imageRows = images.slice().sort((a,b) => Number(a.sort_order || 0)-Number(b.sort_order || 0));
    return {
      id:row.id, slug:row.slug, name:row.name, shortDesc:row.short_description || '',
      longDesc:row.description || '', desc:row.description || '', brand:row.brand || '', sku:row.sku,
      price:Number(row.price_toman || 0), oldPrice:Number(row.compare_at_price_toman || 0),
      discountPercent:row.compare_at_price_toman > row.price_toman ? Math.round((row.compare_at_price_toman-row.price_toman)*100/row.compare_at_price_toman) : 0,
      category:row.category_id, sizes, colors, variants:productVariants,
      stock:productVariants.reduce((n,v) => n+Number(v.stock || 0),0), images:imageRows.map(x=>x.url),
      features:Array.isArray(row.features)?row.features:[], specifications:row.specifications||{},
      featured:Boolean(row.is_featured), bestSeller:Boolean(row.is_best_seller), active:Boolean(row.is_active), image:0,
      createdAt:row.created_at, updatedAt:row.updated_at
    };
  }
  async function saveVariants(context, productId, input) {
    if (!Array.isArray(input) || !input.length) throw new Error('هر محصول باید دست‌کم یک واریانت ثبت‌شده داشته باشد.');
    const { client, state } = context;
    const { data: oldRows, error: oldError } = await client.from('product_variants').select('id,size,color').eq('product_id', productId);
    fail(oldError, 'خواندن واریانت‌ها');
    const rows = input.map(v => {
      const old = (oldRows || []).find(x => x.size === v.size && x.color === v.color);
      const row = { product_id:productId, size:String(v.size || '').trim(), color:String(v.color || '').trim(), sku:String(v.sku || '').trim() || null, stock:Math.max(0, Math.floor(Number(v.stock)||0)), price_toman:Number(v.price)>0?Math.round(Number(v.price)):null };
      if (old?.id) row.id = old.id;
      else if (isUuid(v.id)) row.id = v.id;
      else row.id = newUuid(); // جداول زندهٔ قدیمی ممکن است default برای id نداشته باشند؛ هرگز id تهی نفرست.
      return row;
    });
    const { data, error } = await client.from('product_variants').upsert(rows,{onConflict:'product_id,size,color'}).select('*');
    fail(error, 'ذخیره موجودی و واریانت‌ها');
    const keep = new Set(rows.map(x=>`${x.size}\u0000${x.color}`));
    for (const old of oldRows || []) if (!keep.has(`${old.size}\u0000${old.color}`)) {
      const { error: deleteError } = await client.from('product_variants').delete().eq('id', old.id);
      fail(deleteError, 'حذف واریانت قدیمی');
    }
    state.productVariants = (state.productVariants || []).filter(x=>String(x.product_id)!==String(productId)).concat(data||[]);
    return data || [];
  }

  function categoryToRow(x) {
    const row = { slug:String(x.slug || x.id || '').trim(), name:String(x.name || '').trim(), description:x.description || null, image_url:safePublicUrl(x.imageUrl), icon:x.icon || null, sort_order:Number(x.sortOrder || 0), is_active:x.active !== false };
    if (isUuid(x.id)) row.id=x.id;
    return row;
  }
  function categoryFromRow(x) { return { id:x.id, slug:x.slug, name:x.name, description:x.description||'', imageUrl:x.image_url||'', icon:x.icon||'', sortOrder:Number(x.sort_order||0), active:Boolean(x.is_active), createdAt:x.created_at, updatedAt:x.updated_at }; }
  function couponToRow(x) {
    const type = x.type === 'درصدی' || x.type === 'percent' ? 'percent' : 'fixed_toman';
    const row = { code:String(x.code||'').trim().toUpperCase(), discount_type:type, amount:Math.max(1,Math.floor(Number(x.amount)||0)), starts_at:dateOnly(x.start), ends_at:dateOnly(x.end), minimum_order_toman:Math.max(0,Math.floor(Number(x.min)||0)), usage_limit:Number(x.limit)>0?Math.floor(Number(x.limit)):null, usage_count:Math.max(0,Math.floor(Number(x.used)||0)), is_active:x.active !== false };
    if (isUuid(x.id)) row.id=x.id;
    return row;
  }
  function couponFromRow(x) { return { id:x.id, code:x.code, type:x.discount_type==='percent'?'درصدی':'مبلغ ثابت', amount:Number(x.amount), start:x.starts_at||'', end:x.ends_at||'', min:Number(x.minimum_order_toman||0), limit:x.usage_limit===null?0:Number(x.usage_limit), used:Number(x.usage_count||0), active:Boolean(x.is_active), createdAt:x.created_at }; }
  function reviewFromRow(x, products) { const p=products.find(v=>v.id===x.product_id); return { id:x.id, userId:x.user_id, productId:x.product_id, product:p?.name||'', name:'مشتری طوبی', rating:Number(x.rating), text:x.body, status:REVIEW_STATUS[x.status]||'در انتظار تأیید', createdAt:x.created_at }; }
  function bannerToRow(x) {
    const row={ title:String(x.title||'').trim(), subtitle:x.subtitle||null, image_url:safePublicUrl(x.imageUrl,{optional:false}), link_url:safePublicUrl(x.linkUrl), button_text:x.buttonText||null, placement:x.position||'home-promo', sort_order:Number(x.sortOrder||0), is_active:x.active!==false };
    if (isUuid(x.id)) row.id=x.id;
    return row;
  }
  function bannerFromRow(x) { return { id:x.id,title:x.title,subtitle:x.subtitle||'',imageUrl:x.image_url,linkUrl:x.link_url||'',buttonText:x.button_text||'',position:x.placement,sortOrder:Number(x.sort_order||0),active:Boolean(x.is_active),createdAt:x.created_at }; }
  function pageFromRow(x) { return { id:x.id,key:x.key,title:x.title||'',body:x.body||'',published:Boolean(x.is_published),updatedAt:x.updated_at }; }
  function profileFromRow(x) { return { id:x.id,userId:x.id,email:x.email||'',name:x.display_name||'',phone:x.phone||'',role:x.role,active:Boolean(x.is_active),isActive:Boolean(x.is_active),authProvider:'supabase',createdAt:x.created_at }; }
  function orderFromRow(row, items, payment) {
    const a=row.address_snapshot||{};
    const status=ORDER_STATUS[row.status]||'NEW';
    const paymentStatus=payment?.status==='verified'?'PAID':payment?.status==='failed'?'FAILED':payment?.status==='refunded'?'REFUNDED':'PENDING';
    const lines=items.map(x=>({ id:x.id,productId:x.product_id||'',variantId:x.variant_id||'',name:x.product_name_snapshot,sku:x.sku_snapshot||'',size:String(x.variant_label_snapshot||'').replace(/^سایز\s*/,'').split(/[،,]/)[0]||'',color:String(x.variant_label_snapshot||'').split(/[،,]/).slice(1).join('،').trim(),variantLabel:x.variant_label_snapshot,unitPrice:Number(x.unit_price_toman),quantity:Number(x.quantity) }));
    return {
      id:row.id,number:row.number,userId:row.user_id,customer:a.recipient||'',phone:a.phone||'',province:a.province||'',city:a.city||'',address:a.address||'',postal:a.postal_code||'',note:a.note||'',
      shippingMethod:row.shipping_method,itemsList:lines,items:lines.reduce((n,x)=>n+x.quantity,0),subtotal:Number(row.subtotal_toman),shipping:Number(row.shipping_toman),discount:Number(row.discount_toman),total:Number(row.total_toman),
      couponCode:row.coupon_code_snapshot||'',status,paymentStatus,paymentOutcome:payment?.callback_payload?.outcome||'',paymentMethod:payment?.provider||'bitpay',paymentProvider:payment?.provider||'bitpay',paymentRef:payment?.status==='verified'?(payment.provider_reference||''):'',authority:payment?.authority||'',paymentId:payment?.id||'',
      trackingCode:row.tracking_code||'',createdAt:row.created_at,date:dateLabel(row.created_at),timeline:Array.isArray(row.status_history)?row.status_history:[],inventoryDeducted:true,inventoryRestocked:payment?.status==='failed'
    };
  }
  function paymentFromRow(x) { return { id:x.id,intentId:x.id,orderId:x.order_id,provider:x.provider,status:x.status==='verified'?'SUCCEEDED':String(x.status||'').toUpperCase(),amount:Number(x.amount_toman),amountToman:Number(x.amount_toman),authority:x.authority||'',referenceId:x.provider_reference||'',providerCode:x.provider_code||'',failureReason:x.failure_reason||'',createdAt:x.created_at,updatedAt:x.updated_at }; }
  function mediaFromRow(client,x) {
    let url=x.external_url||'';
    if (!url && x.storage_path) url=client.storage.from('product-images').getPublicUrl(x.storage_path).data?.publicUrl||'';
    return { id:x.id,url,alt:x.alt||'',mimeType:x.mime_type,byteSize:Number(x.byte_size||0),storagePath:x.storage_path||'',createdAt:x.created_at };
  }

  async function query(client, table, select='*', configure) {
    let q=client.from(table).select(select);
    if (configure) q=configure(q);
    const { data,error }=await q;
    fail(error,`خواندن ${table}`);
    return data||[];
  }

  async function loadState(client, targetState = {}) {
    const authUser=g.ToubaAuth?.currentUser||null;
    const isAdmin=['admin','super_admin'].includes(String(authUser?.role||'').toLowerCase());
    const [categories,products,variants,images,settings,banners,pages,reviews,mediaRows]=await Promise.all([
      query(client,'categories','*',q=>q.order('sort_order',{ascending:true})),
      query(client,'products','*',q=>q.order('created_at',{ascending:false})),
      query(client,'product_variants','*'),
      query(client,'product_images','*',q=>q.order('sort_order',{ascending:true})),
      query(client,'site_settings','*'),
      query(client,'banners','*',q=>q.order('sort_order',{ascending:true})),
      query(client,'page_contents','*'),
      query(client,'reviews','*',q=>q.order('created_at',{ascending:false})),
      isAdmin ? query(client,'media','*',q=>q.order('created_at',{ascending:false})) : Promise.resolve([])
    ]);
    const mappedVariants=variants.map(v=>({ ...v,productId:v.product_id }));
    const mappedImages=images.map(x=>({ id:x.id,productId:x.product_id,url:x.url,alt:x.alt||'',sortOrder:Number(x.sort_order||0),createdAt:x.created_at }));
    const mappedProducts=products.map(row=>productFromRow(row,mappedVariants.filter(v=>v.product_id===row.id),mappedImages.filter(v=>v.productId===row.id)));
    const mappedCategories=categories.map(categoryFromRow);
    const mappedSettings={ storeName:'کفش طوبی',phone:'',address:'',shipping:0,freeShipping:0,shippingOptions:{normal:0,express:0,freeFrom:0},homepage:{categoryIds:[],featuredProductIds:[],bestSellerProductIds:[],advantages:[]},favorites:[] };
    for(const row of settings) mappedSettings[row.key]=row.value;
    if(typeof mappedSettings.shipping==='string') mappedSettings.shipping=Number(mappedSettings.shipping)||0;
    if(typeof mappedSettings.freeShipping==='string') mappedSettings.freeShipping=Number(mappedSettings.freeShipping)||0;
    if(!mappedSettings.shippingOptions||typeof mappedSettings.shippingOptions!=='object') mappedSettings.shippingOptions={normal:Number(mappedSettings.shipping)||0,express:0,freeFrom:Number(mappedSettings.freeShipping)||0};
    if(!mappedSettings.homepage||typeof mappedSettings.homepage!=='object') mappedSettings.homepage={categoryIds:[],featuredProductIds:[],bestSellerProductIds:[],advantages:[]};
    const mappedBanners=banners.map(bannerFromRow);
    const mappedReviews=reviews.map(row=>reviewFromRow(row,mappedProducts));
    const mappedPages=pages.map(pageFromRow);
    const mappedMedia=mediaRows.map(x=>mediaFromRow(client,x));

    let profileRows=[],orderRows=[],orderItemRows=[],paymentRows=[],addressRows=[],couponRows=[],favoriteRows=[],cartRows=[],cartItemRows=[],loadedCartId=null;
    if(authUser?.id){
      [profileRows,orderRows,orderItemRows,paymentRows,addressRows,favoriteRows]=await Promise.all([
        query(client,'profiles','*'),query(client,'orders','*',q=>q.order('created_at',{ascending:false})),
        query(client,'order_items','*'),query(client,'payments','*'),query(client,'addresses','*',q=>q.order('created_at',{ascending:false})),
        query(client,'user_favorites','*')
      ]);
      if(isAdmin) couponRows=await query(client,'coupons','*',q=>q.order('created_at',{ascending:false}));
      const { data:cart,error:cartError }=await client.from('carts').select('id').eq('user_id',authUser.id).maybeSingle();
      if(cartError && cartError.code!=='PGRST116') fail(cartError,'خواندن سبد خرید');
      if(cart?.id){ loadedCartId=cart.id; cartItemRows=await query(client,'cart_items','*',q=>q.eq('cart_id',cart.id)); }
    }
    const profiles=profileRows.map(profileFromRow);
    const paymentByOrder=new Map(paymentRows.map(x=>[x.order_id,x]));
    const mappedOrders=orderRows.map(order=>orderFromRow(order,orderItemRows.filter(line=>line.order_id===order.id),paymentByOrder.get(order.id)));
    const mappedPayments=paymentRows.map(paymentFromRow);
    const mappedAddresses=addressRows.map(a=>({ id:a.id,userId:a.user_id,recipient:a.recipient,phone:a.phone,province:a.province,city:a.city,address:a.address,postalCode:a.postal_code,isDefault:Boolean(a.is_default),createdAt:a.created_at }));
    const mappedCoupons=couponRows.map(couponFromRow);
    const mappedFavorites=favoriteRows.map(x=>x.product_id);
    mappedSettings.favorites=mappedFavorites.slice();
    const variantById=new Map(mappedVariants.map(v=>[v.id,v]));
    const cartId=loadedCartId;
    const cartItems=cartItemRows.map(item=>{
      const variant=variantById.get(item.variant_id),p=mappedProducts.find(x=>x.id===variant?.product_id);
      return p&&variant?{id:p.id,variantId:variant.id,size:variant.size,color:variant.color,qty:Number(item.quantity)}:null;
    }).filter(Boolean);
    const customers=profiles.map(p=>{
      const customerOrders=mappedOrders.filter(o=>o.userId===p.id);
      return { id:p.id,name:p.name,email:p.email,phone:p.phone,role:p.role,active:p.active,orders:customerOrders.length,total:customerOrders.filter(o=>o.paymentStatus==='PAID').reduce((n,o)=>n+o.total,0) };
    });
    return {
      products:mappedProducts,categories:mappedCategories,cart:cartItems,orders:mappedOrders,customers,coupons:mappedCoupons,
      reviews:mappedReviews,banners:mappedBanners,media:mappedMedia,settings:mappedSettings,users:profiles,profiles,
      payments:mappedPayments,pageContents:mappedPages,addresses:mappedAddresses,productImages:mappedImages,
      newsletterSubscribers:[],favorites:mappedFavorites,cartId
    };
  }

  function createRepositories(client, state) {
    const context={client,state};
    const categories=new StateRepository({ ...context,entity:'categories',table:'categories',toRow:categoryToRow,fromRow:categoryFromRow });
    const products=new ProductRepository(context);
    const productImages=new class extends StateRepository {
      constructor(){ super({ ...context,entity:'productImages',table:'product_images',toRow:x=>({product_id:x.productId,url:x.url,alt:x.alt||null,sort_order:Number(x.sortOrder||0)}),fromRow:x=>({id:x.id,productId:x.product_id,url:x.url,alt:x.alt||'',sortOrder:Number(x.sort_order||0),createdAt:x.created_at}) }); }
      async create(input){
        const persisted=await persistImageUrl(client,input.url);
        const row=await super.create({...input,url:persisted.url});
        state.productImages=state.productImages||[];upsertLocal(state.productImages,row);
        const p=state.products.find(x=>String(x.id)===String(row.productId));if(p){p.images=(state.productImages.filter(x=>x.productId===p.id).sort((a,b)=>a.sortOrder-b.sortOrder).map(x=>x.url));}
        return row;
      }
      async delete(id){const row=await this.getById(id);const ok=await super.delete(id);if(row){const p=state.products.find(x=>String(x.id)===String(row.productId));if(p)p.images=state.productImages.filter(x=>x.productId===p.id).sort((a,b)=>a.sortOrder-b.sortOrder).map(x=>x.url);}return ok;}
      async filter(criteria={}){return runFilter(state.productImages||[],criteria);}
    }();
    const coupons=new StateRepository({ ...context,entity:'coupons',table:'coupons',key:'id',toRow:couponToRow,fromRow:couponFromRow });
    const reviews=new class extends StateRepository {
      constructor(){super({ ...context,entity:'reviews',table:'reviews',toRow:(x,mode)=>{const status=Object.entries(REVIEW_STATUS).find(([,label])=>label===x.status)?.[0]||x.status||'pending';const row={product_id:x.productId,rating:Number(x.rating),body:String(x.text||'').trim(),status:mode==='create'?'pending':status};if(mode==='create')row.user_id=g.ToubaAuth?.currentUser?.id;if(isUuid(x.id))row.id=x.id;return row;},fromRow:x=>reviewFromRow(x,state.products||[]) });}
      async create(input){return super.create(input);}
      async update(id,patch){const review=await this.getById(id);const next=await super.update(id,patch);const p=state.products.find(x=>x.id===review.productId);next.product=p?.name||review.product;next.name=review.name;return next;}
    }();
    const banners=new StateRepository({ ...context,entity:'banners',table:'banners',toRow:bannerToRow,fromRow:bannerFromRow });
    const pageContents=new class extends StateRepository {
      constructor(){super({ ...context,entity:'pageContents',table:'page_contents',key:'key',toRow:x=>({key:String(x.key||''),title:x.title||null,body:String(x.body||''),is_published:x.published!==false}),fromRow:pageFromRow});}
      async create(input){const result=await super.create(input);return result;}
      async update(id,patch){const key=patch.key||id;const {data,error}=await client.from('page_contents').update({title:patch.title||null,body:String(patch.body||''),is_published:patch.published!==false}).eq('key',key).select('*').single();fail(error,'ذخیره محتوای صفحه');const row=pageFromRow(data);upsertLocal(state.pageContents,row);return row;}
      async delete(id){const row=await this.getById(id);if(!row)return false;const {error}=await client.from('page_contents').delete().eq('key',row.key);fail(error,'حذف محتوای صفحه');removeLocal(state.pageContents,id);return true;}
    }();
    const siteSettings=new class {
      async list(){return Object.entries(state.settings||{}).map(([key,value])=>({key,value:clone(value)}));}
      async getById(key){return Object.hasOwn(state.settings||{},key)?{key,value:clone(state.settings[key])}:null;}
      async create(row){return this.update(row.key,row);}
      async update(key,patch){let value=clone(patch.value);if(key==='homepage'){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('محتوای صفحهٔ اصلی معتبر نیست.');value.heroImage=safePublicUrl(value.heroImage)||'';value.heroButtonUrl=safePublicUrl(value.heroButtonUrl)||'/shop';}const {data,error}=await client.from('site_settings').upsert({key,value,is_public:true},{onConflict:'key'}).select('*').single();fail(error,'ذخیره تنظیمات فروشگاه');state.settings[key]=data.value;return {key,value:clone(data.value)};}
      async delete(key){const {error}=await client.from('site_settings').delete().eq('key',key);fail(error,'حذف تنظیمات فروشگاه');delete state.settings[key];return true;}
      async search(query){const q=String(query||'').toLowerCase();return (await this.list()).filter(x=>x.key.toLowerCase().includes(q));}
      async filter(criteria={}){return runFilter(await this.list(),criteria);}
    }();
    const profiles=new StateRepository({ ...context,entity:'profiles',table:'profiles',toRow:x=>({display_name:x.name||x.displayName||'',phone:x.phone||null}),fromRow:profileFromRow,canCreate:false,canDelete:false });
    const orders=new class {
      async list(){return clone(state.orders||[]);}
      async getById(id){const row=state.orders.find(x=>String(x.id)===String(id));return row?clone(row):null;}
      async create(){throw new Error('ثبت سفارش فقط از مسیر اتمیک Supabase و درگاه پرداخت مجاز است.');}
      async update(id,patch){
        const status=patch.status||'PROCESSING';
        const tracking=patch.trackingCode||null;
        const {data,error}=await client.rpc('admin_update_order_status',{p_order_id:id,p_status:APP_ORDER_STATUS[status]||status,p_tracking_code:tracking});
        fail(error,'به‌روزرسانی وضعیت سفارش');
        const found=state.orders.find(x=>String(x.id)===String(id));
        if(found){found.status=ORDER_STATUS[data?.status]||String(data?.status||status).toUpperCase();if(tracking)found.trackingCode=tracking;found.timeline=[...(found.timeline||[]),{status:found.status,at:new Date().toISOString()}];}
        return found?clone(found):data;
      }
      async delete(){throw new Error('حذف سفارش ثبت‌شده مجاز نیست؛ سفارش را از مسیر وضعیت/بازپرداخت مدیریت کنید.');}
      async search(query){const q=String(query||'').toLowerCase();return clone(state.orders.filter(o=>[o.id,o.number,o.customer,o.phone,o.trackingCode].some(x=>String(x||'').toLowerCase().includes(q))));}
      async filter(criteria={}){return runFilter(state.orders||[],criteria);}
    }();
    const payments=new class {
      async list(){return clone(state.payments||[]);} async getById(id){return clone(state.payments.find(x=>String(x.id)===String(id))||null);}
      async create(){throw new Error('پرداخت فقط توسط سرور ثبت می‌شود.');} async update(){throw new Error('وضعیت پرداخت فقط توسط سرور و استعلام تراکنش بله تغییر می‌کند.');} async delete(){throw new Error('حذف تراکنش پرداخت مجاز نیست.');}
      async search(q){return clone(state.payments.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())));} async filter(c={}){return runFilter(state.payments||[],c);}
    }();
    const cart=new class {
      async list(){return clone(state.cart||[]);}
      async set(item,qty){
        const user=g.ToubaAuth?.currentUser;
        if(!user?.id||user.authProvider!=='supabase')throw new Error('برای ذخیرهٔ امن سبد خرید، با حساب مشتری وارد شوید. دادهٔ سبد به‌صورت محلی ذخیره نمی‌شود.');
        const variantId=item.variantId;
        if(!isUuid(variantId))throw new Error('ترکیب محصول برای ذخیره در سبد معتبر نیست؛ صفحه را تازه‌سازی کنید.');
        const {error}=await client.rpc('set_cart_item_quantity',{p_variant_id:variantId,p_quantity:qty});fail(error,'ذخیره سبد خرید');
        const index=state.cart.findIndex(x=>x.variantId===variantId);
        if(qty<=0){if(index>=0)state.cart.splice(index,1);}else if(index>=0)state.cart[index]={...state.cart[index],...item,qty};else state.cart.push({...item,qty});
        return clone(state.cart);
      }
      async create(item){const current=state.cart.find(x=>x.id===item.id&&x.size===item.size&&x.color===item.color);return this.set(item,Number(current?.qty||0)+Number(item.qty||1));}
      async update(key,patch){const current=state.cart.find(x=>`${x.id}::${x.size}::${x.color}`===String(key)||x.variantId===String(key));if(!current)throw new Error('مورد سبد خرید پیدا نشد.');const next={...current,...patch};if(next.variantId!==current.variantId){await this.set(current,0);return this.set(next,Number(next.qty||1));}return this.set(next,Number(next.qty||current.qty));}
      async delete(key){const current=state.cart.find(x=>`${x.id}::${x.size}::${x.color}`===String(key)||x.variantId===String(key));if(!current)return false;await this.set(current,0);return true;}
      async getById(key){return clone(state.cart.find(x=>`${x.id}::${x.size}::${x.color}`===String(key)||x.variantId===String(key))||null);}
      async search(q){return clone(state.cart.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())));} async filter(c={}){return runFilter(state.cart||[],c);}
    }();
    const addresses=new StateRepository({ ...context,entity:'addresses',table:'addresses',toRow:x=>({user_id:x.userId||g.ToubaAuth?.currentUser?.id,recipient:x.recipient,phone:normalizePhone(x.phone),province:x.province,city:x.city,address:x.address,postal_code:x.postalCode||x.postal,is_default:Boolean(x.isDefault)}),fromRow:x=>({id:x.id,userId:x.user_id,recipient:x.recipient,phone:x.phone,province:x.province,city:x.city,address:x.address,postalCode:x.postal_code,isDefault:Boolean(x.is_default),createdAt:x.created_at}) });
    const customers=new class {
      async list(){return clone(state.customers||[]);} async getById(id){return clone(state.customers.find(x=>String(x.id)===String(id))||null);}
      async update(id,patch){const {data,error}=await client.rpc('admin_set_profile_active',{p_profile_id:id,p_is_active:Boolean(patch.active??patch.is_active)});fail(error,'به‌روزرسانی وضعیت مشتری');const profile=state.profiles.find(x=>String(x.id)===String(id));if(profile){profile.active=Boolean(data?.is_active);profile.isActive=profile.active;}const customer=state.customers.find(x=>String(x.id)===String(id));if(customer)customer.active=Boolean(data?.is_active);return clone(customer||data);}
      async create(){throw new Error('حساب مشتری باید از Supabase Auth ثبت‌نام شود.');} async delete(){throw new Error('حذف Auth user فقط از مسیر امن مدیر سامانه انجام می‌شود.');}
      async search(q){return clone(state.customers.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())));} async filter(c={}){return runFilter(state.customers||[],c);}
    }();
    const favorites=new class {
      async list(){return clone(state.favorites||[]);}
      async create(input){const productId=typeof input==='string'?input:input.productId;if(!g.ToubaAuth?.currentUser?.id)throw new Error('برای همگام‌سازی علاقه‌مندی‌ها وارد حساب کاربری شوید.');const {error}=await client.from('user_favorites').upsert({user_id:g.ToubaAuth.currentUser.id,product_id:productId},{onConflict:'user_id,product_id',ignoreDuplicates:true});fail(error,'ذخیره علاقه‌مندی');if(!state.favorites.includes(productId))state.favorites.push(productId);state.settings.favorites=state.favorites.slice();return {productId};}
      async delete(productId){if(!g.ToubaAuth?.currentUser?.id)throw new Error('برای همگام‌سازی علاقه‌مندی‌ها وارد حساب کاربری شوید.');const {error}=await client.from('user_favorites').delete().eq('user_id',g.ToubaAuth.currentUser.id).eq('product_id',productId);fail(error,'حذف علاقه‌مندی');state.favorites=state.favorites.filter(x=>x!==productId);state.settings.favorites=state.favorites.slice();return true;}
      async filter(){return this.list();}
    }();
    const media=new class {
      async list(){return clone(state.media||[]);}async getById(id){return clone(state.media.find(x=>x.id===id)||null);}
      async create(input){
        const persisted=await persistImageUrl(client,input.url);
        const user=g.ToubaAuth?.currentUser;
        const {data,error}=await client.from('media').insert({storage_path:persisted.storagePath||null,external_url:persisted.externalUrl||null,alt:input.alt||null,mime_type:persisted.mimeType,byte_size:persisted.byteSize,created_by:user?.id||null}).select('*').single();
        fail(error,'ثبت رسانه');const row=mediaFromRow(client,data);state.media.unshift(row);return clone(row);
      }
      async delete(id){const row=await this.getById(id);if(!row)return false;if(row.storagePath){const {error:removeError}=await client.storage.from('product-images').remove([row.storagePath]);fail(removeError,'حذف فایل رسانه');}const {error}=await client.from('media').delete().eq('id',id);fail(error,'حذف رسانه');removeLocal(state.media,id);return true;}
      async update(id,patch){const {data,error}=await client.from('media').update({alt:patch.alt}).eq('id',id).select('*').single();fail(error,'ویرایش رسانه');const row=mediaFromRow(client,data);upsertLocal(state.media,row);return row;}
      async search(q){return clone(state.media.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())));}async filter(c={}){return runFilter(state.media||[],c);}
    }();
    const newsletterSubscribers=new class {
      async create(input){const contact=typeof input==='string'?input:input.contact;const {data,error}=await client.rpc('subscribe_newsletter',{p_contact:String(contact||'').trim()});fail(error,'ثبت عضویت خبرنامه');return data;}
    }();
    const contactMessages=new class {
      async create(input){const {data,error}=await client.rpc('submit_contact_message',{p_name:input.name,p_phone:normalizePhone(input.phone),p_message:input.message});fail(error,'ثبت پیام پشتیبانی');return data;}
      async list(){const {data,error}=await client.rpc('admin_list_contact_messages');fail(error,'خواندن پیام‌های پشتیبانی');return clone((data||[]).map(row=>({id:row.id,name:row.name,phone:row.phone,message:row.message,createdAt:row.created_at,status:row.status})));}
      async update(id,patch){const {data,error}=await client.rpc('admin_update_contact_message_status',{p_message_id:id,p_status:patch.status});fail(error,'به‌روزرسانی پیام پشتیبانی');return data;}
    }();

    return Object.freeze({products,productImages,categories,orders,users:profiles,profiles,customers,addresses,cart,coupons,reviews,banners,payments,pageContents,siteSettings,media,favorites,newsletterSubscribers,contactMessages});
  }

  async function persistImageUrl(client,url) {
    const value=String(url||'').trim();
    if(!value)throw new Error('آدرس تصویر خالی است.');
    if(!value.startsWith('data:image/')) {
      const safeUrl=safePublicUrl(value,{optional:false});
      return {url:safeUrl,externalUrl:safeUrl,storagePath:null,mimeType:'image/jpeg',byteSize:1};
    }
    const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
    if(!match)throw new Error('تصویر باید JPEG، PNG یا WebP باشد.');
    const bytes=Uint8Array.from(atob(match[2].replace(/\s/g,'')),c=>c.charCodeAt(0));
    if(bytes.length<16||bytes.length>5*1024*1024)throw new Error('حجم فایل تصویر باید کمتر از ۵ مگابایت باشد.');
    const user=g.ToubaAuth?.currentUser;
    if(!user?.id||!['admin','super_admin'].includes(String(user.role).toLowerCase()))throw new Error('آپلود تصویر فقط برای مدیر واردشده مجاز است.');
    const ext=match[1].split('/')[1].replace('jpeg','jpg');
    const path=`${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
    const {error}=await client.storage.from('product-images').upload(path,bytes,{contentType:match[1],upsert:false});
    fail(error,'آپلود تصویر به Supabase Storage');
    const publicUrl=client.storage.from('product-images').getPublicUrl(path).data?.publicUrl;
    if(!publicUrl)throw new Error('آدرس عمومی تصویر از Supabase Storage دریافت نشد.');
    return {url:publicUrl,externalUrl:null,storagePath:path,mimeType:match[1],byteSize:bytes.length};
  }

  g.SupabaseRepositories = Object.freeze({
    create: createRepositories,
    loadState: loadState,
    normalizePhone,
    safePublicUrl,
    isUuid,
    productFromRow,
    productToRow,
    categoryFromRow,
    couponFromRow,
    orderFromRow,
    paymentFromRow
  });
})(window);

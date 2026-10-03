-- Move the storefront off browser snapshots and onto the authenticated Supabase database.
-- Apply after 202610020001_zarinpal_payment_provider.sql. No credentials or admin account are created here.
begin;

-- Remove only the known catalog/coupon/banner seed rows from 202609280003_seed_data.sql.
-- No real orders or customer accounts are seeded by that migration, so unrelated rows are untouched.
delete from public.products
where sku in ('TB-101','TB-102','TB-103','TB-104','TB-105','TB-106','TB-107','TB-108','TB-109','TB-110','TB-111','TB-112');
delete from public.coupons where upper(code) in ('TOUBA10','WELCOME150');
delete from public.banners
where title in ('راحتی، با امضای طوبی','تخفیف ویژه فصل')
  and image_url in ('/hero-shoe.jpg','/product-shoes.jpg');
delete from public.categories c
where c.id in (
  '00000000-0000-0000-0001-000000000001'::uuid,
  '00000000-0000-0000-0001-000000000002'::uuid,
  '00000000-0000-0000-0001-000000000003'::uuid,
  '00000000-0000-0000-0001-000000000004'::uuid,
  '00000000-0000-0000-0001-000000000005'::uuid,
  '00000000-0000-0000-0001-000000000006'::uuid,
  '00000000-0000-0000-0001-000000000007'::uuid,
  '00000000-0000-0000-0001-000000000008'::uuid
)
and not exists (select 1 from public.products p where p.category_id = c.id);

alter table public.orders
  add column if not exists shipping_method text not null default 'normal',
  add column if not exists tracking_code text,
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists coupon_code_snapshot text;
alter table public.orders drop constraint if exists orders_shipping_method_check;
alter table public.orders add constraint orders_shipping_method_check
  check (shipping_method in ('normal','express','free'));
create unique index if not exists orders_tracking_code_unique
  on public.orders(tracking_code) where tracking_code is not null;

alter table public.payments
  add column if not exists authority text,
  add column if not exists provider_code text,
  add column if not exists failure_reason text;
create unique index if not exists payments_authority_unique
  on public.payments(authority) where authority is not null;

-- Media may refer to an approved external/local public asset or a file in Supabase Storage.
alter table public.banners add column if not exists button_text text;

alter table public.media alter column storage_path drop not null;
alter table public.media add column if not exists external_url text;
alter table public.media drop constraint if exists media_storage_location_check;
alter table public.media add constraint media_storage_location_check
  check (
    (storage_path is not null and external_url is null)
    or (storage_path is null and external_url is not null
      and (external_url like '/%' or external_url like 'https://%'))
  );

create table if not exists public.user_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.user_favorites enable row level security;
grant select, insert, delete on public.user_favorites to authenticated;
create policy user_favorites_owner_access on public.user_favorites for all to authenticated
  using (user_id = (select auth.uid()) and (select public.current_user_is_active()))
  with check (user_id = (select auth.uid()) and (select public.current_user_is_active()));

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  contact text not null unique,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
grant all on public.newsletter_subscribers to service_role;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  message text not null,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','read','resolved'))
);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant all on public.contact_messages to service_role;

-- Safe public storefront defaults; these are configuration, not catalog/demo records.
insert into public.site_settings(key, value, is_public)
values
  ('storeName', '"کفش طوبی"'::jsonb, true),
  ('phone', '""'::jsonb, true),
  ('address', '""'::jsonb, true),
  ('shipping', '80000'::jsonb, true),
  ('freeShipping', '2000000'::jsonb, true),
  ('shippingOptions', '{"normal":80000,"express":160000,"freeFrom":2000000}'::jsonb, true),
  ('about', '""'::jsonb, true),
  ('homepage', '{"heroTitle":"قدم‌هایی مطمئن با کفش طوبی","heroText":"کفش‌های شیک، راحت و بادوام","heroButtonText":"مشاهده محصولات","heroButtonUrl":"/shop","heroImage":"/touba-hero-editorial.jpg","categoryIds":[],"featuredProductIds":[],"bestSellerProductIds":[],"advantages":[],"aboutText":"","footerText":"تمامی حقوق برای فروشگاه کفش طوبی محفوظ است."}'::jsonb, true),
  ('metaDescription', '"خرید آنلاین کفش طوبی"'::jsonb, true)
on conflict (key) do nothing;

-- Do not allow browser snapshots or direct client mutations of authoritative order/payment rows.
revoke insert, update, delete on public.orders, public.order_items, public.payments from authenticated;
grant select on public.orders, public.order_items, public.payments to authenticated;
-- Cart writes are validated by a function so a client cannot create arbitrary cart rows.
revoke insert, update, delete on public.carts, public.cart_items from authenticated;
grant select on public.carts, public.cart_items to authenticated;

create or replace function public.commerce_health()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', '202610030001',
    'database', 'supabase',
    'orders', to_regclass('public.orders') is not null,
    'payments', to_regclass('public.payments') is not null,
    'products', to_regclass('public.products') is not null
  );
$$;
revoke all on function public.commerce_health() from public;
grant execute on function public.commerce_health() to anon, authenticated;

create or replace function public.set_cart_item_quantity(p_variant_id uuid, p_quantity integer)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_cart_id uuid;
  v_stock integer;
  v_quantity integer;
begin
  if v_user_id is null or not (select public.current_user_is_active()) then
    raise exception using errcode = '42501', message = 'active authenticated account required';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 99 then
    raise exception using errcode = '22023', message = 'invalid cart quantity';
  end if;
  select v.stock into v_stock
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where v.id = p_variant_id and p.is_active
   for update of v;
  if not found then raise exception using errcode = 'P0002', message = 'product variant is unavailable'; end if;
  if p_quantity > v_stock then raise exception using errcode = '22023', message = 'cart quantity exceeds available stock'; end if;

  insert into public.carts(user_id) values (v_user_id)
  on conflict (user_id) do update set updated_at = now()
  returning id into v_cart_id;
  if v_cart_id is null then select id into v_cart_id from public.carts where user_id = v_user_id; end if;

  if p_quantity = 0 then
    delete from public.cart_items where cart_id = v_cart_id and variant_id = p_variant_id;
    return jsonb_build_object('variantId', p_variant_id, 'quantity', 0);
  end if;
  insert into public.cart_items(cart_id, variant_id, quantity)
  values (v_cart_id, p_variant_id, p_quantity)
  on conflict (cart_id, variant_id) do update set quantity = excluded.quantity, updated_at = now();
  select quantity into v_quantity from public.cart_items where cart_id = v_cart_id and variant_id = p_variant_id;
  return jsonb_build_object('variantId', p_variant_id, 'quantity', v_quantity);
end;
$$;
revoke all on function public.set_cart_item_quantity(uuid, integer) from public, anon;
grant execute on function public.set_cart_item_quantity(uuid, integer) to authenticated;

create or replace function public.validate_coupon(p_code text, p_subtotal_toman bigint)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_coupon public.coupons%rowtype;
  v_discount bigint;
begin
  if (select auth.uid()) is null or not (select public.current_user_is_active()) then
    return jsonb_build_object('valid', false, 'reason', 'authentication_required');
  end if;
  if p_subtotal_toman is null or p_subtotal_toman < 0 then
    return jsonb_build_object('valid', false, 'reason', 'invalid_subtotal');
  end if;
  select * into v_coupon from public.coupons
   where upper(code) = upper(btrim(coalesce(p_code, '')))
   for update;
  if not found or not v_coupon.is_active then
    return jsonb_build_object('valid', false, 'reason', 'coupon_unavailable');
  end if;
  if p_subtotal_toman < v_coupon.minimum_order_toman then
    return jsonb_build_object('valid', false, 'reason', 'minimum_not_met');
  end if;
  if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
    return jsonb_build_object('valid', false, 'reason', 'usage_limit_reached');
  end if;
  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    return jsonb_build_object('valid', false, 'reason', 'not_started');
  end if;
  if v_coupon.ends_at is not null and now() > v_coupon.ends_at then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  v_discount := case when v_coupon.discount_type = 'percent'
    then least(p_subtotal_toman, round(p_subtotal_toman::numeric * v_coupon.amount / 100)::bigint)
    else least(p_subtotal_toman, v_coupon.amount::bigint) end;
  return jsonb_build_object('valid', true, 'code', v_coupon.code, 'discount', v_discount);
end;
$$;
revoke all on function public.validate_coupon(text, bigint) from public, anon;
grant execute on function public.validate_coupon(text, bigint) to authenticated;

create or replace function public.create_order_with_payment(
  p_items jsonb,
  p_address jsonb,
  p_shipping_method text,
  p_coupon_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item record;
  v_expired record;
  v_expired_line record;
  v_variant_id uuid;
  v_quantity integer;
  v_stock integer;
  v_unit_price bigint;
  v_product_name text;
  v_product_sku text;
  v_variant_sku text;
  v_size text;
  v_color text;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_shipping bigint := 0;
  v_total bigint := 0;
  v_normal_shipping bigint := 0;
  v_express_shipping bigint := 0;
  v_free_threshold bigint := 0;
  v_shipping_options jsonb := '{}'::jsonb;
  v_coupon public.coupons%rowtype;
  v_coupon_id uuid;
  v_coupon_code text;
  v_order_id uuid;
  v_number text;
  v_tracking text;
  v_payment_id uuid;
  v_snapshot jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_existing jsonb;
begin
  if v_user_id is null or not (select public.current_user_is_active()) then
    raise exception using errcode = '42501', message = 'active authenticated account required';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'order must contain between 1 and 50 items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e(value)
    where coalesce(e.value->>'variantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(e.value->>'quantity','') !~ '^[1-9][0-9]{0,1}$'
  ) then raise exception using errcode = '22023', message = 'invalid order line'; end if;
  if coalesce(p_shipping_method,'') not in ('normal','express','free') then
    raise exception using errcode = '22023', message = 'invalid shipping method';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 100 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if jsonb_typeof(p_address) is distinct from 'object'
     or length(btrim(coalesce(p_address->>'recipient',''))) not between 3 and 100
     or coalesce(p_address->>'phone','') !~ '^09[0-9]{9}$'
     or length(btrim(coalesce(p_address->>'province',''))) not between 2 and 100
     or length(btrim(coalesce(p_address->>'city',''))) not between 2 and 100
     or length(btrim(coalesce(p_address->>'address',''))) not between 10 and 1000
     or coalesce(p_address->>'postal_code','') !~ '^[0-9]{10}$' then
    raise exception using errcode = '22023', message = 'invalid delivery address';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key, 0));
  select jsonb_build_object('orderId', o.id, 'number', o.number, 'totalToman', o.total_toman, 'status', o.status)
    into v_existing from public.orders o
   where o.user_id = v_user_id and o.idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  -- Expired pending checkouts release reserved inventory and coupon capacity exactly once.
  for v_expired in
    select o.id, o.coupon_id from public.orders o
     join public.payments p on p.order_id = o.id
     where o.status = 'pending_payment' and p.status = 'pending' and p.authority is null
       and o.created_at < now() - interval '30 minutes'
     for update of o skip locked
  loop
    for v_expired_line in
      select oi.variant_id, oi.quantity from public.order_items oi where oi.order_id = v_expired.id and oi.variant_id is not null
    loop
      update public.product_variants set stock = stock + v_expired_line.quantity
       where id = v_expired_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'EXPIRED', failure_reason = 'Checkout expired',
      callback_payload = jsonb_build_object('outcome','expired','at',now())
     where order_id = v_expired.id and status = 'pending';
    update public.orders set status = 'cancelled', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','cancelled','at',now(),'source','expiry'))
     where id = v_expired.id and status = 'pending_payment';
    if v_expired.coupon_id is not null then
      update public.coupons set usage_count = greatest(usage_count - 1, 0) where id = v_expired.coupon_id;
    end if;
  end loop;

  select value into v_shipping_options from public.site_settings where key = 'shippingOptions';
  v_normal_shipping := coalesce(nullif(v_shipping_options->>'normal','')::bigint, 0);
  v_express_shipping := coalesce(nullif(v_shipping_options->>'express','')::bigint, v_normal_shipping);
  v_free_threshold := coalesce(nullif(v_shipping_options->>'freeFrom','')::bigint, 0);

  -- Sort/lock variants consistently, validate authoritative price/stock, and reserve stock atomically.
  for v_item in
    select (e.value->>'variantId')::uuid as variant_id,
           sum((e.value->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_items) e(value)
     group by (e.value->>'variantId')::uuid
     order by (e.value->>'variantId')::uuid
  loop
    select v.stock, coalesce(v.price_toman, p.price_toman), p.name, p.sku, v.sku, v.size, v.color
      into v_stock, v_unit_price, v_product_name, v_product_sku, v_variant_sku, v_size, v_color
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = v_item.variant_id and p.is_active = true
     for update of v;
    if not found then raise exception using errcode = 'P0002', message = 'product variant is unavailable'; end if;
    if v_item.quantity < 1 or v_item.quantity > 99 or v_stock < v_item.quantity then
      raise exception using errcode = '22023', message = 'insufficient stock';
    end if;
    update public.product_variants set stock = stock - v_item.quantity where id = v_item.variant_id;
    v_subtotal := v_subtotal + v_unit_price * v_item.quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'variantId', v_item.variant_id,
      'productId', (select product_id from public.product_variants where id = v_item.variant_id),
      'name', v_product_name,
      'sku', coalesce(v_variant_sku, v_product_sku),
      'size', v_size,
      'color', v_color,
      'variantLabel', 'سایز ' || v_size || '، ' || v_color,
      'unitPrice', v_unit_price,
      'quantity', v_item.quantity
    ));
  end loop;

  if p_shipping_method = 'normal' then v_shipping := v_normal_shipping;
  elsif p_shipping_method = 'express' then v_shipping := v_express_shipping;
  else
    if v_subtotal < v_free_threshold then raise exception using errcode = '22023', message = 'order is not eligible for free shipping'; end if;
    v_shipping := 0;
  end if;

  if nullif(btrim(coalesce(p_coupon_code,'')), '') is not null then
    select * into v_coupon from public.coupons
     where upper(code) = upper(btrim(p_coupon_code))
     for update;
    if not found or not v_coupon.is_active then raise exception using errcode = '22023', message = 'coupon unavailable'; end if;
    if v_subtotal < v_coupon.minimum_order_toman then raise exception using errcode = '22023', message = 'coupon minimum not met'; end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then raise exception using errcode = '22023', message = 'coupon usage limit reached'; end if;
    if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception using errcode = '22023', message = 'coupon has not started'; end if;
    if v_coupon.ends_at is not null and now() > v_coupon.ends_at then raise exception using errcode = '22023', message = 'coupon expired'; end if;
    v_coupon_id := v_coupon.id;
    v_coupon_code := v_coupon.code;
    v_discount := case when v_coupon.discount_type = 'percent'
      then least(v_subtotal, round(v_subtotal::numeric * v_coupon.amount / 100)::bigint)
      else least(v_subtotal, v_coupon.amount::bigint) end;
    update public.coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  v_total := v_subtotal + v_shipping - v_discount;
  if v_total < 1000 then raise exception using errcode = '22023', message = 'order total is below the payment provider minimum'; end if;
  v_snapshot := jsonb_build_object(
    'recipient', btrim(p_address->>'recipient'),
    'phone', p_address->>'phone',
    'province', btrim(p_address->>'province'),
    'city', btrim(p_address->>'city'),
    'address', btrim(p_address->>'address'),
    'postal_code', p_address->>'postal_code',
    'note', left(coalesce(p_address->>'note',''), 1000)
  );
  v_number := 'TB-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_tracking := 'TRK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.orders(number, user_id, status, currency, subtotal_toman, shipping_toman, discount_toman,
    total_toman, address_snapshot, coupon_id, idempotency_key, shipping_method, tracking_code,
    coupon_code_snapshot, status_history)
  values (v_number, v_user_id, 'pending_payment', 'IRR', v_subtotal, v_shipping, v_discount, v_total,
    v_snapshot, v_coupon_id, p_idempotency_key, p_shipping_method, v_tracking, v_coupon_code,
    jsonb_build_array(jsonb_build_object('status','pending_payment','at',now(),'source','checkout')))
  returning id into v_order_id;

  insert into public.order_items(order_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
    sku_snapshot, unit_price_toman, quantity)
  select v_order_id, (line->>'productId')::uuid, (line->>'variantId')::uuid, line->>'name', line->>'variantLabel',
    line->>'sku', (line->>'unitPrice')::bigint, (line->>'quantity')::integer
  from jsonb_array_elements(v_lines) line;

  insert into public.payments(order_id, provider, status, amount_toman)
  values (v_order_id, 'zarinpal', 'pending', v_total)
  returning id into v_payment_id;

  insert into public.carts(user_id) values (v_user_id) on conflict (user_id) do nothing;
  return jsonb_build_object('orderId', v_order_id, 'number', v_number, 'totalToman', v_total,
    'paymentId', v_payment_id, 'status', 'pending_payment');
end;
$$;
revoke all on function public.create_order_with_payment(jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.create_order_with_payment(jsonb,jsonb,text,text,text) to authenticated;

create or replace function public.cancel_pending_order(p_order_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_line record;
  v_at timestamptz := now();
begin
  if v_user_id is null or not (select public.current_user_is_active()) then
    raise exception using errcode = '42501', message = 'active authenticated account required';
  end if;
  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'pending order not found'; end if;
  select * into v_payment from public.payments where order_id = v_order.id for update;
  if v_order.status <> 'pending_payment' or v_payment.status <> 'pending' then
    return jsonb_build_object('success',false,'cancelled',false,'reason','not_pending');
  end if;
  -- If an authority has been attached, the customer may already be at the
  -- provider page. Keep its reservation until the signed provider callback.
  if v_payment.authority is not null then
    return jsonb_build_object('success',false,'cancelled',false,'reason','payment_authority_exists');
  end if;
  for v_line in
    select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null
  loop
    update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
  end loop;
  if v_order.coupon_id is not null then
    update public.coupons set usage_count = greatest(usage_count - 1, 0) where id = v_order.coupon_id;
  end if;
  update public.payments set status = 'failed', provider_code = 'CHECKOUT_ABORTED',
    failure_reason = 'Payment request was not started',
    callback_payload = jsonb_build_object('outcome','cancelled','source','checkout','at',v_at)
   where id = v_payment.id;
  update public.orders set status = 'cancelled',
    status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','cancelled','at',v_at,'source','checkout'))
   where id = v_order.id;
  return jsonb_build_object('success',true,'cancelled',true,'orderId',v_order.id);
end;
$$;
revoke all on function public.cancel_pending_order(uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid) to authenticated;

create or replace function public.attach_zarinpal_authority(p_order_id uuid, p_authority text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_authority is null or p_authority !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception using errcode = '22023', message = 'invalid payment authority';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_order.id is null or v_payment.provider <> 'zarinpal' or v_payment.status <> 'pending' or v_order.status <> 'pending_payment' then
    raise exception using errcode = 'P0002', message = 'pending payment not found';
  end if;
  if v_payment.authority is not null and v_payment.authority <> p_authority then
    raise exception using errcode = '23505', message = 'payment already has a different authority';
  end if;
  update public.payments set authority = p_authority, provider_reference = p_authority where id = v_payment.id;
  return jsonb_build_object('orderId', p_order_id, 'paymentId', v_payment.id, 'authority', p_authority);
end;
$$;
revoke all on function public.attach_zarinpal_authority(uuid,text) from public, anon, authenticated;
grant execute on function public.attach_zarinpal_authority(uuid,text) to service_role;

create or replace function public.settle_zarinpal_payment(
  p_order_id uuid,
  p_authority text,
  p_outcome text,
  p_amount_toman bigint,
  p_reference_id text default null,
  p_provider_code text default null,
  p_callback_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_line record;
  v_cart_id uuid;
  v_at timestamptz := now();
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_outcome not in ('paid','failed','cancelled') then
    raise exception using errcode = '22023', message = 'invalid settlement outcome';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order not found'; end if;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_payment.provider <> 'zarinpal' then raise exception using errcode = 'P0002', message = 'ZarinPal payment not found'; end if;
  if v_payment.amount_toman <> p_amount_toman or v_order.total_toman <> p_amount_toman then
    raise exception using errcode = '22023', message = 'payment amount does not match the stored order';
  end if;
  if v_payment.authority is not null and coalesce(p_authority,'') <> v_payment.authority then
    raise exception using errcode = '42501', message = 'payment authority does not match';
  end if;
  if v_payment.authority is null and p_outcome = 'paid' then
    raise exception using errcode = '42501', message = 'payment authority has not been attached';
  end if;
  if v_payment.status = 'verified' then
    if p_outcome = 'paid' and v_payment.authority = p_authority then
      return jsonb_build_object('success',true,'idempotent',true,'orderId',p_order_id,'outcome','paid');
    end if;
    raise exception using errcode = '23505', message = 'verified payment cannot be changed';
  end if;
  if v_payment.status = 'failed' then
    if p_outcome in ('failed','cancelled') then
      return jsonb_build_object('success',true,'idempotent',true,'orderId',p_order_id,'outcome',p_outcome);
    end if;
    raise exception using errcode = '23505', message = 'failed payment cannot be re-used';
  end if;
  if v_payment.status <> 'pending' then raise exception using errcode = '23505', message = 'payment is not pending'; end if;

  if p_outcome = 'paid' then
    update public.payments set status = 'verified', provider_reference = coalesce(nullif(p_reference_id,''), p_authority),
      verified_at = v_at, provider_code = left(coalesce(p_provider_code,'100'),32),
      callback_payload = coalesce(p_callback_payload,'{}'::jsonb)
     where id = v_payment.id;
    update public.orders set status = 'paid', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','paid','at',v_at,'source','zarinpal')) where id = v_order.id;
    select id into v_cart_id from public.carts where user_id = v_order.user_id;
    if v_cart_id is not null then
      for v_line in select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null loop
        update public.cart_items set quantity = quantity - v_line.quantity, updated_at = v_at
         where cart_id = v_cart_id and variant_id = v_line.variant_id and quantity > v_line.quantity;
        delete from public.cart_items where cart_id = v_cart_id and variant_id = v_line.variant_id and quantity <= v_line.quantity;
      end loop;
    end if;
    return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome','paid');
  end if;

  -- Failed/cancelled attempts return reserved stock and coupon capacity exactly once.
  if v_order.status = 'pending_payment' then
    for v_line in select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    if v_order.coupon_id is not null then
      update public.coupons set usage_count = greatest(usage_count - 1, 0) where id = v_order.coupon_id;
    end if;
    update public.orders set status = 'cancelled', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','cancelled','at',v_at,'source','zarinpal','outcome',p_outcome)) where id = v_order.id;
  end if;
  update public.payments set status = 'failed', provider_code = left(coalesce(p_provider_code,''),32),
    failure_reason = left(p_outcome,64), callback_payload = coalesce(p_callback_payload,'{}'::jsonb)
   where id = v_payment.id;
  return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome',p_outcome);
end;
$$;
revoke all on function public.settle_zarinpal_payment(uuid,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.settle_zarinpal_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;

create or replace function public.admin_update_order_status(p_order_id uuid, p_status text, p_tracking_code text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_next public.order_status;
  v_line record;
  v_at timestamptz := now();
  v_actor uuid := (select auth.uid());
begin
  if not (select public.current_user_is_admin()) then raise exception using errcode = '42501', message = 'active admin required'; end if;
  v_next := case upper(coalesce(p_status,''))
    when 'PAID' then 'paid'::public.order_status
    when 'CONFIRMED' then 'processing'::public.order_status
    when 'PROCESSING' then 'processing'::public.order_status
    when 'SHIPPED' then 'shipped'::public.order_status
    when 'DELIVERED' then 'delivered'::public.order_status
    when 'CANCELLED' then 'cancelled'::public.order_status
    when 'لغو شده' then 'cancelled'::public.order_status
    when 'در حال آماده‌سازی' then 'processing'::public.order_status
    when 'ارسال شده' then 'shipped'::public.order_status
    when 'تحویل داده شده' then 'delivered'::public.order_status
    when 'تأیید شده' then 'processing'::public.order_status
    else null end;
  if v_next is null then raise exception using errcode = '22023', message = 'invalid order transition'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order not found'; end if;
  if v_next = 'cancelled' then
    if v_order.status <> 'pending_payment' then
      raise exception using errcode = '22023', message = 'paid orders require a separately verified refund before cancellation';
    end if;
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if not found or v_payment.status <> 'pending' or v_payment.authority is not null then
      raise exception using errcode = '22023', message = 'orders with a ZarinPal authority must be reconciled through the provider callback';
    end if;
    for v_line in select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'ADMIN_CANCELLED', failure_reason = 'Cancelled by admin',
      callback_payload = jsonb_build_object('outcome','cancelled','source','admin','at',v_at)
      where order_id = v_order.id and status = 'pending';
    if v_order.coupon_id is not null then update public.coupons set usage_count = greatest(usage_count - 1,0) where id = v_order.coupon_id; end if;
  elsif v_next = 'paid' then
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if v_order.status <> 'paid' or not found or v_payment.status <> 'verified' then
      raise exception using errcode = '42501', message = 'payment status can only be confirmed by the verified provider callback';
    end if;
  elsif v_next = 'processing' and v_order.status not in ('paid','processing') then
    raise exception using errcode = '22023', message = 'order must be paid before fulfillment';
  elsif v_next = 'shipped' and v_order.status not in ('processing','shipped') then
    raise exception using errcode = '22023', message = 'order must be processing before shipment';
  elsif v_next = 'delivered' and v_order.status not in ('shipped','delivered') then
    raise exception using errcode = '22023', message = 'order must be shipped before delivery';
  end if;
  if p_tracking_code is not null and length(p_tracking_code) > 80 then raise exception using errcode = '22023', message = 'invalid tracking code'; end if;
  update public.orders set status = v_next,
    tracking_code = coalesce(nullif(btrim(p_tracking_code),''), tracking_code),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status',v_next::text,'at',v_at,'actor',v_actor))
   where id = v_order.id;
  return jsonb_build_object('success',true,'orderId',v_order.id,'status',v_next::text);
end;
$$;
revoke all on function public.admin_update_order_status(uuid,text,text) from public, anon;
grant execute on function public.admin_update_order_status(uuid,text,text) to authenticated;

create or replace function public.admin_set_profile_active(p_profile_id uuid, p_is_active boolean)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = (select auth.uid()) and is_active for update;
  if not found or v_actor.role not in ('admin','super_admin') then raise exception using errcode = '42501', message = 'active admin required'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'profile not found'; end if;
  if v_target.id = v_actor.id then raise exception using errcode = '42501', message = 'cannot change own active status'; end if;
  if v_actor.role = 'admin' and v_target.role <> 'customer' then raise exception using errcode = '42501', message = 'only a super admin can change another admin'; end if;
  update public.profiles set is_active = p_is_active where id = p_profile_id;
  return jsonb_build_object('id',p_profile_id,'is_active',p_is_active);
end;
$$;
revoke all on function public.admin_set_profile_active(uuid,boolean) from public, anon;
grant execute on function public.admin_set_profile_active(uuid,boolean) to authenticated;

create or replace function public.subscribe_newsletter(p_contact text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_contact text := lower(btrim(coalesce(p_contact,'')));
begin
  if length(v_contact) > 254 or (v_contact !~ '^09[0-9]{9}$' and v_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode = '22023', message = 'invalid contact';
  end if;
  insert into public.newsletter_subscribers(contact) values (v_contact)
  on conflict (contact) do update set is_active = true;
  return jsonb_build_object('success',true);
end;
$$;
revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;

create or replace function public.submit_contact_message(p_name text, p_phone text, p_message text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  if length(btrim(coalesce(p_name,''))) not between 3 and 100
    or v_phone !~ '^09[0-9]{9}$'
    or length(btrim(coalesce(p_message,''))) not between 10 and 5000 then
    raise exception using errcode = '22023', message = 'invalid contact message';
  end if;
  insert into public.contact_messages(name,phone,message)
  values (btrim(p_name),v_phone,btrim(p_message)) returning id into v_id;
  return jsonb_build_object('success',true,'messageId',v_id);
end;
$$;
revoke all on function public.submit_contact_message(text,text,text) from public;
grant execute on function public.submit_contact_message(text,text,text) to anon, authenticated;

create or replace function public.admin_list_contact_messages()
returns table(id uuid,name text,phone text,message text,created_at timestamptz,status text)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (select public.current_user_is_admin()) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  return query
    select m.id,m.name,m.phone,m.message,m.created_at,m.status
      from public.contact_messages m
     order by m.created_at desc
     limit 500;
end;
$$;
revoke all on function public.admin_list_contact_messages() from public, anon;
grant execute on function public.admin_list_contact_messages() to authenticated;

create or replace function public.admin_update_contact_message_status(p_message_id uuid,p_status text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (select public.current_user_is_admin()) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  if p_status not in ('new','read','resolved') then
    raise exception using errcode = '22023', message = 'invalid contact message status';
  end if;
  update public.contact_messages set status=p_status where id=p_message_id;
  if not found then raise exception using errcode = 'P0002', message = 'contact message not found'; end if;
  return jsonb_build_object('id',p_message_id,'status',p_status);
end;
$$;
revoke all on function public.admin_update_contact_message_status(uuid,text) from public, anon;
grant execute on function public.admin_update_contact_message_status(uuid,text) to authenticated;

commit;

-- Bale Pay (بله‌پی): replaces the retired ZarinPal gateway with Bale wallet payments.
-- Apply after 202610030001_live_commerce.sql. No bot tokens or secrets live in SQL.
begin;

-- Fail closed: rows created by the retired gateway must be reconciled by hand
-- instead of being silently relabelled as wallet transactions.
do $$
begin
  if exists (select 1 from public.payments where provider is distinct from 'balepay') then
    raise exception 'payments contains rows from the retired gateway; export or reconcile them before switching to Bale Pay';
  end if;
end
$$;

-- Never let a newly inserted payment fall back to a mock or legacy gateway.
alter table public.payments
  alter column provider drop default;

alter table public.payments
  drop constraint if exists payments_provider_zarinpal_check;

alter table public.payments
  add constraint payments_provider_balepay_check check (provider = 'balepay');

comment on column public.payments.authority is 'Bale invoice reference: blp_<32 hex> derived from the order id and the server secret.';
comment on column public.payments.provider_reference is 'Bale wallet transaction id (pre_checkout_query.id / telegram_payment_charge_id).';
comment on column public.payments.provider_code is 'Last inquireTransaction status or a synthetic failure code.';


-- Checkout creates the order and its wallet payment row in one transaction.
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
  values (v_order_id, 'balepay', 'pending', v_total)
  returning id into v_payment_id;

  insert into public.carts(user_id) values (v_user_id) on conflict (user_id) do nothing;
  return jsonb_build_object('orderId', v_order_id, 'number', v_number, 'totalToman', v_total,
    'paymentId', v_payment_id, 'status', 'pending_payment');
end;
$$;
revoke all on function public.create_order_with_payment(jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.create_order_with_payment(jsonb,jsonb,text,text,text) to authenticated;


-- Customers may abandon an invoice link; releasing the order stays possible until Bale reports a transaction.
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
  -- A Bale invoice link is cheap to create and often abandoned, so an attached
  -- authority alone must not freeze the order. Once Bale reports a transaction
  -- id (pre-checkout), money may already be in flight and only the settlement
  -- path is allowed to close the payment.
  if v_payment.provider_reference is not null then
    return jsonb_build_object('success',false,'cancelled',false,'reason','bale_transaction_recorded');
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
    callback_payload = jsonb_build_object('outcome','cancelled','source','checkout','provider','balepay','at',v_at)
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


-- One entry point for both lifecycle steps: the storefront attaches the invoice
-- authority before opening the wallet, and the inbound Bale update attaches the
-- wallet transaction id (pre_checkout_query.id == telegram_payment_charge_id).
create or replace function public.attach_balepay_invoice(
  p_order_id uuid,
  p_authority text default null,
  p_transaction_id text default null
)
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
  if p_authority is null and p_transaction_id is null then
    raise exception using errcode = '22023', message = 'nothing to attach';
  end if;
  if p_authority is not null and p_authority !~ '^blp_[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'invalid Bale invoice authority';
  end if;
  if p_transaction_id is not null and p_transaction_id !~ '^[A-Za-z0-9_-]{6,128}$' then
    raise exception using errcode = '22023', message = 'invalid Bale transaction id';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_order.id is null or v_payment.provider <> 'balepay' or v_payment.status <> 'pending' or v_order.status <> 'pending_payment' then
    raise exception using errcode = 'P0002', message = 'pending payment not found';
  end if;
  if p_authority is not null and v_payment.authority is not null and v_payment.authority <> p_authority then
    raise exception using errcode = '23505', message = 'payment already has a different authority';
  end if;
  if v_payment.authority is null and p_authority is null then
    raise exception using errcode = '22023', message = 'Bale invoice authority must be attached first';
  end if;
  update public.payments
     set authority = coalesce(authority, p_authority),
         provider_reference = coalesce(nullif(p_transaction_id,''), provider_reference)
   where id = v_payment.id;
  return jsonb_build_object('orderId', p_order_id, 'paymentId', v_payment.id,
    'authority', coalesce(v_payment.authority, p_authority),
    'transactionId', coalesce(nullif(p_transaction_id,''), v_payment.provider_reference));
end;
$$;
revoke all on function public.attach_balepay_invoice(uuid,text,text) from public, anon, authenticated;
grant execute on function public.attach_balepay_invoice(uuid,text,text) to service_role;


create or replace function public.settle_balepay_payment(
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
  if not found or v_payment.provider <> 'balepay' then raise exception using errcode = 'P0002', message = 'Bale Pay payment not found'; end if;
  if v_payment.amount_toman <> p_amount_toman or v_order.total_toman <> p_amount_toman then
    raise exception using errcode = '22023', message = 'payment amount does not match the stored order';
  end if;
  if v_payment.authority is not null and coalesce(p_authority,'') <> v_payment.authority then
    raise exception using errcode = '42501', message = 'payment authority does not match';
  end if;
  if v_payment.authority is null and p_outcome = 'paid' then
    raise exception using errcode = '42501', message = 'Bale invoice has not been attached';
  end if;
  -- A settled Bale payment is only final once the provider transaction is known;
  -- that id is captured from the pre-checkout update or the successful payment.
  if p_outcome = 'paid' and coalesce(nullif(p_reference_id,''), v_payment.provider_reference) is null then
    raise exception using errcode = '42501', message = 'Bale transaction id is required to mark a payment as paid';
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
    update public.payments set status = 'verified',
      provider_reference = coalesce(nullif(p_reference_id,''), v_payment.provider_reference, p_authority),
      verified_at = v_at, provider_code = left(coalesce(p_provider_code,'paid'),32),
      callback_payload = coalesce(p_callback_payload,'{}'::jsonb)
     where id = v_payment.id;
    update public.orders set status = 'paid', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','paid','at',v_at,'source','balepay')) where id = v_order.id;
    select id into v_cart_id from public.carts where user_id = v_order.user_id;
    if v_cart_id is not null then
      for v_line in select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null loop
        update public.cart_items set quantity = quantity - v_line.quantity, updated_at = v_at
         where cart_id = v_cart_id and variant_id = v_line.variant_id and quantity > v_line.quantity;
        delete from public.cart_items where cart_id = v_cart_id and variant_id = v_line.variant_id and quantity <= v_line.quantity;
      end loop;
    end if;
    return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome','paid',
      'referenceId', coalesce(nullif(p_reference_id,''), v_payment.provider_reference));
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
      jsonb_build_object('status','cancelled','at',v_at,'source','balepay','outcome',p_outcome)) where id = v_order.id;
  end if;
  update public.payments set status = 'failed', provider_code = left(coalesce(p_provider_code,''),32),
    failure_reason = left(p_outcome,64), callback_payload = coalesce(p_callback_payload,'{}'::jsonb)
   where id = v_payment.id;
  return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome',p_outcome);
end;
$$;
revoke all on function public.settle_balepay_payment(uuid,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.settle_balepay_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;


-- Customers usually pay within minutes; anything still untouched after the grace
-- period returns its reservations so abandoned invoices cannot hold stock forever.
create or replace function public.expire_stale_balepay_checkouts(p_grace_minutes integer default 360)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired record;
  v_line record;
  v_grace integer := greatest(coalesce(p_grace_minutes, 360), 60);
  v_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' and not coalesce((select public.current_user_is_admin()), false) then
    raise exception using errcode = '42501', message = 'admin or service role required';
  end if;
  for v_expired in
    select o.id, o.coupon_id from public.orders o
     join public.payments p on p.order_id = o.id
     where o.status = 'pending_payment' and p.status = 'pending' and p.provider = 'balepay'
       and p.provider_reference is null
       and o.created_at < now() - make_interval(mins => v_grace)
     for update of o skip locked
  loop
    for v_line in
      select oi.variant_id, oi.quantity from public.order_items oi
       where oi.order_id = v_expired.id and oi.variant_id is not null
    loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'EXPIRED', failure_reason = 'Bale invoice expired before payment',
      callback_payload = jsonb_build_object('outcome','expired','source','balepay','at',now())
     where order_id = v_expired.id and status = 'pending';
    update public.orders set status = 'cancelled', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','cancelled','at',now(),'source','expiry'))
     where id = v_expired.id and status = 'pending_payment';
    if v_expired.coupon_id is not null then
      update public.coupons set usage_count = greatest(usage_count - 1, 0) where id = v_expired.coupon_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('success',true,'expired',v_count,'graceMinutes',v_grace);
end;
$$;
revoke all on function public.expire_stale_balepay_checkouts(integer) from public, anon;
grant execute on function public.expire_stale_balepay_checkouts(integer) to authenticated, service_role;


-- Fulfilment transitions stay server-authoritative for the wallet gateway too.
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
    if not found or v_payment.status <> 'pending' or v_payment.provider_reference is not null then
      raise exception using errcode = '22023', message = 'orders with a recorded Bale transaction must be reconciled through inquireTransaction before cancellation';
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


-- Retired gateway entry points.
drop function if exists public.attach_zarinpal_authority(uuid,text);
drop function if exists public.settle_zarinpal_payment(uuid,text,text,bigint,text,text,jsonb);

notify pgrst, 'reload schema';

commit;

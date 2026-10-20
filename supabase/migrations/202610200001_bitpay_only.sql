-- BitPay-only checkout (۱۴۰۴/۰۷/۲۹). The previous card-to-card gateway is retired from
-- the application: no route, library, environment variable, client bridge or admin panel
-- references it anymore. BitPay (bitpay.ir, contract BP_PGW_DOC 2.2) is the single live
-- gateway: the browser hands the customer to the bank page, and only the server's own
-- gateway-result-second call settles the payment.
-- Runs after 202610170001_bitpay_gateway.sql. No secret lives in SQL.
begin;

-- A checkout still pending under the retired gateway is closed out and its reservations
-- released (none is expected on a fresh production database; preview databases may hold
-- test rows). Rows that already reached a terminal state keep their provider name as
-- ledger history — rewriting history would falsify the record.
do $$
declare
  v_row record;
  v_line record;
  v_history bigint;
begin
  if exists (select 1 from public.payments where provider not in ('blupal','bitpay','zarinpal','balepay','bluepal')) then
    raise exception 'payments contains an unknown provider; reconcile it before retiring the old gateway';
  end if;
  select count(*) into v_history from public.payments
   where provider in ('zarinpal','balepay','bluepal','blupal') and status <> 'pending';
  if v_history > 0 then
    raise notice 'bitpay-only: % retired-gateway payment row(s) stay in the table as history', v_history;
  end if;
  for v_row in
    select p.order_id from public.payments p
     join public.orders o on o.id = p.order_id
     where p.provider = 'blupal' and p.status = 'pending'
     for update of p skip locked
  loop
    for v_line in
      select variant_id, quantity from public.order_items
       where order_id = v_row.order_id and variant_id is not null
    loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments
       set status = 'failed', provider_code = 'GATEWAY_RETIRED',
           failure_reason = 'Retired gateway checkout was abandoned before any payment was verified',
           callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('migration','bitpay_only','at',now())
     where order_id = v_row.order_id and status = 'pending' and provider = 'blupal';
    update public.orders
       set status = 'cancelled',
           status_history = status_history || jsonb_build_array(
             jsonb_build_object('status','cancelled','at',now(),'source','bitpay_only_migration'))
     where id = v_row.order_id and status = 'pending_payment';
    update public.coupons c
       set usage_count = greatest(c.usage_count - 1, 0)
      from public.orders o
     where o.id = v_row.order_id and c.id = o.coupon_id;
  end loop;
end
$$;

-- BitPay is the only writable provider; retired names remain valid history.
drop trigger if exists payments_enforce_blupal_provider on public.payments;
create or replace function public.enforce_bitpay_payment_provider()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.provider is distinct from 'bitpay' then
    raise exception using errcode = '22023', message = 'new payments must use the bitpay provider';
  end if;
  return new;
end;
$$;
grant execute on function public.enforce_bitpay_payment_provider() to public, authenticated, service_role;

drop trigger if exists payments_enforce_bitpay_provider on public.payments;
create trigger payments_enforce_bitpay_provider
  before insert or update on public.payments
  for each row execute function public.enforce_bitpay_payment_provider();

drop function if exists public.enforce_blupal_payment_provider();

comment on column public.payments.provider is 'BitPay is the only writable provider; older names appear in pre-switch rows as history.';
comment on column public.payments.authority is 'BitPay id_get returned by payment/gateway-send and used by gateway-result-second.';
comment on column public.payments.provider_reference is 'BitPay trans_id reported by the bank for the settled transaction.';
comment on column public.payments.provider_code is 'Last gateway state (SENT, RETURNED, PAID, FAILED) or a synthetic failure code.';
comment on column public.payments.callback_payload is 'Gateway metadata: idGet, amountRial, factorId, transId and the attempt history.';

-- create_order_with_payment: seeds the payment row straight into the single live gateway.
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
  -- Only rows whose invoice was never created are swept here; a checkout that already has an
  -- invoice_id may still be matched to a transfer any moment and belongs to the status/expiry path.
  for v_expired in
    select o.id, o.coupon_id from public.orders o
     join public.payments p on p.order_id = o.id
     where o.status = 'pending_payment' and p.status = 'pending' and p.authority is null
       and p.provider = 'bitpay'
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
      callback_payload = callback_payload || jsonb_build_object('outcome','expired','source','bitpay','at',now())
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
  -- BitPay rejects amounts below 5,000 RIAL, i.e. 500 Toman.
  if v_total < 500 then raise exception using errcode = '22023', message = 'order total is below the payment provider minimum'; end if;
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
  values (v_order_id, 'bitpay', 'pending', v_total)
  returning id into v_payment_id;

  insert into public.carts(user_id) values (v_user_id) on conflict (user_id) do nothing;
  return jsonb_build_object('orderId', v_order_id, 'number', v_number, 'totalToman', v_total,
    'paymentId', v_payment_id, 'status', 'pending_payment');
end;
$$;
revoke all on function public.create_order_with_payment(jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.create_order_with_payment(jsonb,jsonb,text,text,text) to authenticated;

commit;

-- BitPay (بیت‌پی · bitpay.ir) — درگاه مستقیم پرداخت بانکی به‌عنوان گزینه‌ای موازی با BluPal.
-- مستندات: BP_PGW_DOC v2.2 — gateway-send → id_get → gateway-<id_get>-get → بازگشت با
-- trans_id/id_get (فقط سرنخ) → استعلام سروربه‌سرور gateway-result-second (تنها مبنای تسویه).
-- پس از 202610050001_blupal_provider.sql اعمال شود. هیچ کلیدی در SQL نیست و مسیرهای بلوپال
-- دست‌نخورده‌اند: ردیف‌های پرداخت تازه همان‌طور که ساخته می‌شوند provider='blupal' می‌مانند و
-- فقط درگاه وب (attach_bitpay_payment) یک چک‌اوتِ بی‌فاکتور را به 'bitpay' جابه‌جا می‌کند.
begin;

-- The provider check must admit the second live gateway while keeping every retired name as
-- read-only history (a rewritten ledger is worse than an ugly constraint name).
alter table public.payments
  drop constraint if exists payments_provider_blupal_check;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname from pg_catalog.pg_constraint con
     join pg_catalog.pg_class cls on cls.oid = con.conrelid
     join pg_catalog.pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and cls.relname = 'payments' and con.contype = 'c'
      and pg_catalog.pg_get_constraintdef(con.oid) ilike '%provider = any%'
  loop
    execute format('alter table public.payments drop constraint %I', v_constraint.conname);
  end loop;
end
$$;

alter table public.payments
  add constraint payments_provider_gateways_check
  check (provider in ('blupal','bitpay','zarinpal','balepay','bluepal'));

-- Same trigger, one rule added: a brand-new, invoice-less, still-pending 'blupal' row (the row
-- create_order_with_payment always makes) may be handed to BitPay exactly once, by the attach RPC.
-- Anything else about provider stays frozen: no moves onto retired names, no moves back from
-- bitpay, no switches after an invoice exists — that would be a way to fake a paid order.
create or replace function public.enforce_blupal_payment_provider()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.provider not in ('blupal','bitpay') then
      raise exception using errcode = '22023', message = 'new payments must use the blupal or bitpay provider';
    end if;
  else
    if new.provider not in ('blupal','bitpay') then
      raise exception using errcode = '22023', message = 'a payment cannot be moved onto a retired gateway';
    end if;
    if new.provider is distinct from old.provider then
      if not (old.provider = 'blupal' and new.provider = 'bitpay'
              and old.status = 'pending' and old.authority is null and old.provider_reference is null) then
        raise exception using errcode = '22023',
          message = 'a payment can only switch to bitpay before any gateway invoice is recorded';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- The attach path itself must bypass nothing: it runs as service_role and goes through the same
-- trigger, so the switch is validated twice.

-- Store the BitPay transaction (id_get) against the order before the customer is redirected.
-- Re-issuing after a never-paid attempt is allowed only for rows already owned by bitpay —
-- a blupal invoice can never be hijacked by a second gateway writing over it.
create or replace function public.attach_bitpay_payment(
  p_order_id uuid,
  p_id_get text,
  p_amount_rial bigint default null,
  p_factor_id text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_history jsonb;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_id_get is null or p_id_get !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid bitpay id_get';
  end if;
  if p_amount_rial is not null and (p_amount_rial < 5000 or p_amount_rial > 999999999999) then
    raise exception using errcode = '22023', message = 'invalid bitpay amount';
  end if;
  if p_factor_id is not null and p_factor_id !~ '^[0-9]{1,18}$' then
    raise exception using errcode = '22023', message = 'invalid bitpay factorId';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_order.id is null
     or v_payment.provider not in ('blupal','bitpay')
     or v_payment.status <> 'pending' or v_order.status <> 'pending_payment'
     or (v_payment.provider = 'blupal' and v_payment.authority is not null) then
    raise exception using errcode = 'P0002', message = 'pending bitpay-eligible payment not found';
  end if;
  if v_payment.authority is not null and v_payment.authority <> p_id_get then
    v_history := coalesce(v_payment.callback_payload->'attempts','[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('idGet', v_payment.authority, 'at', v_payment.updated_at,
                         'replacedBy', p_id_get, 'code', v_payment.provider_code));
  else
    v_history := coalesce(v_payment.callback_payload->'attempts','[]'::jsonb);
  end if;
  update public.payments
     set provider = 'bitpay',
         authority = p_id_get,
         provider_code = 'SENT',
         callback_payload = jsonb_build_object(
           'provider', 'bitpay',
           'idGet', p_id_get,
           'amountRial', p_amount_rial,
           'factorId', p_factor_id,
           'attempts', v_history,
           'attachedAt', now()),
         updated_at = now()
   where id = v_payment.id;
  return jsonb_build_object('orderId', p_order_id, 'paymentId', v_payment.id,
    'authority', p_id_get, 'reused', v_payment.authority is not null and v_payment.authority = p_id_get);
end;
$$;
revoke all on function public.attach_bitpay_payment(uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public.attach_bitpay_payment(uuid,text,bigint,text) to service_role;


-- The browser return is a lead, not proof: trans_id is only recorded here so the result page can
-- re-run gateway-result-second if the callback crashed before settling. Never trusted as payment.
create or replace function public.record_bitpay_trans_id(
  p_order_id uuid,
  p_id_get text,
  p_trans_id text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_id_get is null or p_id_get !~ '^[0-9]{1,20}$'
     or p_trans_id is null or p_trans_id !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid bitpay identifiers';
  end if;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_payment.provider <> 'bitpay' or v_payment.status <> 'pending'
     or v_payment.authority <> p_id_get then
    raise exception using errcode = 'P0002', message = 'pending bitpay payment not found';
  end if;
  update public.payments
     set callback_payload = coalesce(callback_payload,'{}'::jsonb)
       || jsonb_build_object('transId', p_trans_id, 'transIdAt', now()),
         provider_code = 'RETURNED',
         updated_at = now()
   where id = v_payment.id;
  return jsonb_build_object('orderId', p_order_id, 'transId', p_trans_id);
end;
$$;
revoke all on function public.record_bitpay_trans_id(uuid,text,text) from public, anon, authenticated;
grant execute on function public.record_bitpay_trans_id(uuid,text,text) to service_role;


-- Only the server's own gateway-result-second call (status 1 / 11) may reach this function with
-- outcome='paid'; the browser redirect and any client claim are never a source of truth.
create or replace function public.settle_bitpay_payment(
  p_order_id uuid,
  p_id_get text,
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
  if not found or v_payment.provider <> 'bitpay' then raise exception using errcode = 'P0002', message = 'bitpay payment not found'; end if;
  if v_payment.amount_toman <> p_amount_toman or v_order.total_toman <> p_amount_toman then
    raise exception using errcode = '22023', message = 'payment amount does not match the stored order';
  end if;
  if p_id_get is not null and p_id_get !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid bitpay id_get';
  end if;
  if v_payment.authority is not null and coalesce(p_id_get,'') <> v_payment.authority then
    raise exception using errcode = '42501', message = 'bitpay transaction id does not match';
  end if;
  if v_payment.authority is null and p_outcome = 'paid' then
    raise exception using errcode = '42501', message = 'bitpay transaction has not been recorded';
  end if;
  -- Nothing is paid without a traceable trans_id; a reference that contradicts the recorded
  -- callback is rejected outright (the browser cannot launder an arbitrary number).
  if p_outcome = 'paid' and coalesce(nullif(p_reference_id,''), v_payment.provider_reference, v_payment.authority) is null then
    raise exception using errcode = '42501', message = 'a bitpay trans_id or id_get is required to mark a payment as paid';
  end if;
  if p_outcome = 'paid' and v_payment.callback_payload->>'transId' is not null
     and nullif(p_reference_id,'') is not null
     and v_payment.callback_payload->>'transId' <> p_reference_id then
    raise exception using errcode = '42501', message = 'bitpay trans_id does not match the recorded callback';
  end if;
  if p_outcome = 'paid' and v_payment.amount_irr < 5000 then
    raise exception using errcode = '22023', message = 'payment amount is below the bitpay gateway minimum';
  end if;
  if v_payment.status = 'verified' then
    if p_outcome = 'paid' and v_payment.authority = p_id_get then
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
  if v_payment.status <> 'pending' then
    raise exception using errcode = '23505', message = 'payment is not awaiting settlement';
  end if;

  if p_outcome = 'paid' then
    update public.payments set status = 'verified',
      provider_reference = coalesce(nullif(p_reference_id,''), v_payment.provider_reference, v_payment.authority),
      verified_at = v_at, provider_code = left(coalesce(p_provider_code,'PAID'),32),
      callback_payload = coalesce(v_payment.callback_payload,'{}'::jsonb) || coalesce(p_callback_payload,'{}'::jsonb)
        || jsonb_build_object('settledAt', v_at, 'idGet', coalesce(nullif(p_id_get,''), v_payment.authority))
     where id = v_payment.id;
    update public.orders set status = 'paid', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','paid','at',v_at,'source','bitpay')) where id = v_order.id;
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
      jsonb_build_object('status','cancelled','at',v_at,'source','bitpay','outcome',p_outcome)) where id = v_order.id;
  end if;
  update public.payments set status = 'failed', provider_code = left(coalesce(p_provider_code,'FAILED'),32),
    failure_reason = left(p_outcome,64),
    callback_payload = coalesce(v_payment.callback_payload,'{}'::jsonb) || coalesce(p_callback_payload,'{}'::jsonb)
      || jsonb_build_object('settledAt', v_at)
   where id = v_payment.id;
  return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome',p_outcome);
end;
$$;
revoke all on function public.settle_bitpay_payment(uuid,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.settle_bitpay_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;


-- An id_get the buyer never completed is harmless at bitpay (nothing was captured), but it must not
-- hold stock forever. Rows whose trans_id already arrived are deliberately NOT swept: once the bank
-- has returned a traceable transaction, only gateway-result-second (or a human with the panel) may
-- close them — auto-cancelling could clash with a verification still in flight.
create or replace function public.expire_stale_bitpay_checkouts(p_grace_minutes integer default 120)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired record;
  v_line record;
  v_grace integer := greatest(coalesce(p_grace_minutes, 120), 15);
  v_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' and not coalesce((select public.current_user_is_admin()), false) then
    raise exception using errcode = '42501', message = 'admin or service role required';
  end if;
  for v_expired in
    select o.id, o.coupon_id from public.orders o
     join public.payments p on p.order_id = o.id
     where o.status = 'pending_payment' and p.status = 'pending' and p.provider = 'bitpay'
       and p.provider_reference is null
       and coalesce(p.callback_payload->>'transId','') = ''
       and greatest(p.created_at, p.updated_at) < now() - make_interval(mins => v_grace)
     for update of o skip locked
  loop
    for v_line in
      select oi.variant_id, oi.quantity from public.order_items oi
       where oi.order_id = v_expired.id and oi.variant_id is not null
    loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'EXPIRED', failure_reason = 'BitPay transaction was never paid',
      callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('outcome','expired','source','bitpay','at',now())
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
revoke all on function public.expire_stale_bitpay_checkouts(integer) from public, anon;
grant execute on function public.expire_stale_bitpay_checkouts(integer) to authenticated, service_role;

comment on column public.payments.provider is 'blupal and bitpay are the two writable gateways; zarinpal/balepay/bluepal remain as history only, and a fresh invoice-less blupal row may be handed to bitpay exactly once.';
comment on column public.payments.authority is 'BluPal invoice_id, or the BitPay id_get returned by POST /payment/gateway-send.';

commit;
notify pgrst, 'reload schema';

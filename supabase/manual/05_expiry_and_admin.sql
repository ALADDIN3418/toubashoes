-- بلوپال (BluPal · blupal.top) — قطعهٔ 5 از 6: جاروب انقضا و تغییر وضعیت توسط مدیر
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- Customers usually pay within minutes. Anything whose invoice was never verified after the grace
-- period returns its reservations, so abandoned card-to-card transfers cannot hold stock forever.
-- Sandbox invoices expire after ~20 minutes; live invoices have no expiry, so the sweep is the only
-- guard. A payment BluPal already confirmed is never swept here; settle_blupal_payment closes it.
create or replace function public.expire_stale_blupal_checkouts(p_grace_minutes integer default 60)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired record;
  v_line record;
  v_grace integer := greatest(coalesce(p_grace_minutes, 60), 15);
  v_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' and not coalesce((select public.current_user_is_admin()), false) then
    raise exception using errcode = '42501', message = 'admin or service role required';
  end if;
  for v_expired in
    select o.id, o.coupon_id from public.orders o
     join public.payments p on p.order_id = o.id
     where o.status = 'pending_payment' and p.status = 'pending' and p.provider = 'blupal'
       and p.provider_reference is null
       and greatest(p.created_at, p.updated_at) < now() - make_interval(mins => v_grace)
     for update of o skip locked
  loop
    for v_line in
      select oi.variant_id, oi.quantity from public.order_items oi
       where oi.order_id = v_expired.id and oi.variant_id is not null
    loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'EXPIRED', failure_reason = 'BluPal invoice was never paid',
      callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('outcome','expired','source','blupal','at',now())
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
revoke all on function public.expire_stale_blupal_checkouts(integer) from public, anon;
grant execute on function public.expire_stale_blupal_checkouts(integer) to authenticated, service_role;


-- Fulfilment transitions stay server-authoritative for the card-to-card gateway too.
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
      raise exception using errcode = '22023', message = 'orders with a verified BluPal payment must be refunded from the BluPal panel before cancellation';
    end if;
    for v_line in select variant_id, quantity from public.order_items where order_id = v_order.id and variant_id is not null loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments set status = 'failed', provider_code = 'ADMIN_CANCELLED', failure_reason = 'Cancelled by admin',
      callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('outcome','cancelled','source','admin','at',v_at)
      where order_id = v_order.id and status = 'pending';
    if v_order.coupon_id is not null then update public.coupons set usage_count = greatest(usage_count - 1,0) where id = v_order.coupon_id; end if;
  elsif v_next = 'paid' then
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if v_order.status <> 'paid' or not found or v_payment.status <> 'verified' then
      raise exception using errcode = '42501', message = 'payment status can only be confirmed by the BluPal invoice status check';
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

commit;

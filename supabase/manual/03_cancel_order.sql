-- بلوپال (BluPal · blupal.top) — قطعهٔ 3 از 7: لغو سفارش پرداخت‌نشده توسط مشتری
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- Customers may abandon the hosted payment page; releasing the order stays possible until BluPal
-- confirms the transaction, but never while a gateway attempt is still fresh.
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
  -- A verified BluPal payment means the money moved; only settlement/refund closes it.
  if v_payment.provider_reference is not null then
    return jsonb_build_object('success',false,'cancelled',false,'reason','gateway_transaction_recorded');
  end if;
  -- A transfer may have been matched a second ago, so a very recent invoice is quarantined
  -- briefly instead of releasing stock that is already sold;
  -- expire_stale_blupal_checkouts closes it afterwards.
  if v_payment.authority is not null
     and greatest(v_payment.created_at, v_payment.updated_at) > v_at - interval '10 minutes' then
    return jsonb_build_object('success',false,'cancelled',false,'reason','gateway_verification_pending');
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
    callback_payload = callback_payload || jsonb_build_object('outcome','cancelled','source','checkout','provider','blupal','at',v_at)
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

commit;

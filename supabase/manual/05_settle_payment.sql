-- بلوپال (BluPal · blupal.top) — قطعهٔ 5 از 7: تسویهٔ یک‌مصرف — تنها راه paid شدن سفارش
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- Only the gateway's own GET /v1/invoices/{invoice_id} may reach this function; the webhook body
-- and the browser redirect are never a source of truth.
create or replace function public.settle_blupal_payment(
  p_order_id uuid,
  p_invoice_id text,
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
  if not found or v_payment.provider <> 'blupal' then raise exception using errcode = 'P0002', message = 'BluPal payment not found'; end if;
  if v_payment.amount_toman <> p_amount_toman or v_order.total_toman <> p_amount_toman then
    raise exception using errcode = '22023', message = 'payment amount does not match the stored order';
  end if;
  -- The invoice the caller wants to settle must be the one we created for this order.
  if p_invoice_id is not null and p_invoice_id !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid BluPal invoice id';
  end if;
  if v_payment.authority is not null and coalesce(p_invoice_id,'') <> v_payment.authority then
    raise exception using errcode = '42501', message = 'payment invoice id does not match';
  end if;
  if v_payment.authority is null and p_outcome = 'paid' then
    raise exception using errcode = '42501', message = 'BluPal invoice has not been recorded';
  end if;
  -- Nothing is ever marked paid without a traceable identifier: the transaction_id returned by
  -- GET /v1/invoices/{invoice_id}, or failing that the invoice id itself.
  if p_outcome = 'paid' and coalesce(nullif(p_reference_id,''), v_payment.provider_reference,
                                     nullif(p_invoice_id,''), v_payment.authority) is null then
    raise exception using errcode = '42501', message = 'a BluPal invoice id or transaction id is required to mark a payment as paid';
  end if;
  -- The gateway amount is only ever cross-checked, never applied: order totals live in Toman and
  -- the payments table derives the rial amount from them.
  if p_outcome = 'paid' and v_payment.amount_irr < 100000 then
    raise exception using errcode = '22023', message = 'payment amount is below the BluPal invoice minimum';
  end if;
  if v_payment.status = 'verified' then
    if p_outcome = 'paid' and v_payment.authority = p_invoice_id then
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
      provider_reference = coalesce(nullif(p_reference_id,''), v_payment.provider_reference, p_invoice_id),
      verified_at = v_at, provider_code = left(coalesce(p_provider_code,'PAID'),32),
      callback_payload = coalesce(v_payment.callback_payload,'{}'::jsonb) || coalesce(p_callback_payload,'{}'::jsonb)
        || jsonb_build_object('settledAt', v_at, 'invoiceId', coalesce(nullif(p_invoice_id,''), v_payment.authority))
     where id = v_payment.id;
    update public.orders set status = 'paid', status_history = status_history || jsonb_build_array(
      jsonb_build_object('status','paid','at',v_at,'source','blupal')) where id = v_order.id;
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
      jsonb_build_object('status','cancelled','at',v_at,'source','blupal','outcome',p_outcome)) where id = v_order.id;
  end if;
  update public.payments set status = 'failed', provider_code = left(coalesce(p_provider_code,'EXPIRED'),32),
    failure_reason = left(p_outcome,64),
    callback_payload = coalesce(v_payment.callback_payload,'{}'::jsonb) || coalesce(p_callback_payload,'{}'::jsonb)
      || jsonb_build_object('settledAt', v_at)
   where id = v_payment.id;
  return jsonb_build_object('success',true,'idempotent',false,'orderId',p_order_id,'outcome',p_outcome);
end;
$$;
revoke all on function public.settle_blupal_payment(uuid,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.settle_blupal_payment(uuid,text,text,bigint,text,text,jsonb) to service_role;

commit;

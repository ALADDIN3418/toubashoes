-- بلوپال (BluPal · blupal.top) — قطعهٔ 3 از 6: ثبت فاکتور بلوپال روی سفارش (فقط service_role)
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- The storefront stores the BluPal invoice (payment_link, destination card and the corrected
-- amount) before redirecting the customer. Retrying after an expired invoice is allowed: the
-- pending row keeps its history and simply points at the newest invoice id.
create or replace function public.attach_blupal_payment(
  p_order_id uuid,
  p_invoice_id text,
  p_payment_url text default null,
  p_card_number text default null,
  p_amount_rial bigint default null,
  p_final_amount_rial bigint default null,
  p_status text default null
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
  -- BluPal invoice ids are short numerics (123), so the old {6,64} pattern would reject them.
  if p_invoice_id is null or p_invoice_id !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid BluPal invoice id';
  end if;
  if p_payment_url is not null and left(p_payment_url, 8) <> 'https://' then
    raise exception using errcode = '22023', message = 'invalid BluPal payment url';
  end if;
  if p_card_number is not null and p_card_number !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'invalid BluPal card number';
  end if;
  if p_amount_rial is not null and p_amount_rial < 0 then
    raise exception using errcode = '22023', message = 'invalid gateway amount';
  end if;
  if p_final_amount_rial is not null and p_amount_rial is not null
     and (p_final_amount_rial < p_amount_rial or p_final_amount_rial > p_amount_rial + 999) then
    raise exception using errcode = '22023', message = 'invalid BluPal final amount';
  end if;
  if p_status is not null and p_status not in ('PENDING','PAID','EXPIRED','CANCELED') then
    raise exception using errcode = '22023', message = 'invalid BluPal invoice status';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found or v_order.id is null or v_payment.provider <> 'blupal'
     or v_payment.status <> 'pending' or v_order.status <> 'pending_payment' then
    raise exception using errcode = 'P0002', message = 'pending payment not found';
  end if;
  if v_payment.authority is not null and v_payment.authority <> p_invoice_id then
    v_history := coalesce(v_payment.callback_payload->'attempts','[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('invoiceId', v_payment.authority, 'at', v_payment.updated_at,
                         'replacedBy', p_invoice_id, 'code', v_payment.provider_code));
  else
    v_history := coalesce(v_payment.callback_payload->'attempts','[]'::jsonb);
  end if;
  update public.payments
     set authority = p_invoice_id,
         provider_code = left(coalesce(nullif(p_status,''), provider_code, 'PENDING'),32),
         callback_payload = jsonb_build_object(
           'provider', 'blupal',
           'invoiceId', p_invoice_id,
           'paymentUrl', nullif(p_payment_url,''),
           'cardNumber', nullif(p_card_number,''),
           'amountRial', p_amount_rial,
           'finalAmountRial', p_final_amount_rial,
           'status', coalesce(nullif(p_status,''),'PENDING'),
           'attempts', v_history,
           'attachedAt', now()),
         updated_at = now()
   where id = v_payment.id;
  return jsonb_build_object('orderId', p_order_id, 'paymentId', v_payment.id,
    'authority', p_invoice_id, 'reused', v_payment.authority is not null and v_payment.authority = p_invoice_id);
end;
$$;
revoke all on function public.attach_blupal_payment(uuid,text,text,text,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.attach_blupal_payment(uuid,text,text,text,bigint,bigint,text) to service_role;

commit;

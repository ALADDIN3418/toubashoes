-- بلوپال (BluPal · blupal.top) — قطعهٔ 1 از 6: قفل provider و تبدیل ردیف‌های درگاه‌های قبلی
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- BluPal (بلوپال · blupal.top) — درگاه کارت‌به‌کارت با فاکتور.
-- قرارداد: POST /v1/invoices/create (مبلغ ریالی) سپس GET /v1/invoices/{invoice_id} به‌عنوان تنها
-- نهایی‌ساز پرداخت، و وب‌هوک payment.completed فقط به‌عنوان سرنخ.
-- پس از 202610030001_live_commerce.sql اعمال شود. هیچ کلید یا رمزی در SQL نیست.

-- A pending row that never reached the previous provider is closed out and its reservations are
-- released. Anything with money attached must be reconciled by hand first, because the provider
-- CHECK constraint added below is validated against every existing row.
do $$
declare
  v_row record;
  v_line record;
begin
  if exists (select 1 from public.payments where provider not in ('zarinpal','balepay','bluepal','blupal')) then
    raise exception 'payments contains an unknown provider; reconcile it before switching to BluPal';
  end if;
  if exists (select 1 from public.payments where provider in ('zarinpal','balepay','bluepal') and status <> 'pending') then
    raise exception 'payments contains settled rows from the retired gateway; export or refund them before switching to BluPal';
  end if;
  for v_row in
    select p.order_id from public.payments p
     join public.orders o on o.id = p.order_id
     where p.provider in ('zarinpal','balepay','bluepal') and p.status = 'pending'
     for update of p skip locked
  loop
    for v_line in
      select variant_id, quantity from public.order_items
       where order_id = v_row.order_id and variant_id is not null
    loop
      update public.product_variants set stock = stock + v_line.quantity where id = v_line.variant_id;
    end loop;
    update public.payments
       set provider = 'blupal', status = 'failed', provider_code = 'GATEWAY_RETIRED',
           failure_reason = 'Retired gateway checkout was abandoned before any payment was verified',
           callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('migration','blupal','at',now())
     where order_id = v_row.order_id and status = 'pending';
    update public.orders
       set status = 'cancelled',
           status_history = status_history || jsonb_build_array(
             jsonb_build_object('status','cancelled','at',now(),'source','blupal_migration'))
     where id = v_row.order_id and status = 'pending_payment';
    update public.coupons c
       set usage_count = greatest(c.usage_count - 1, 0)
      from public.orders o
     where o.id = v_row.order_id and c.id = o.coupon_id;
  end loop;
end
$$;

-- Never let a newly inserted payment fall back to a mock or legacy gateway.
alter table public.payments
  alter column provider drop default;

alter table public.payments
  drop constraint if exists payments_provider_zarinpal_check;

alter table public.payments
  drop constraint if exists payments_provider_balepay_check;

-- The never-adopted redirect-gateway build (if it was ever applied) must not survive either.
alter table public.payments
  drop constraint if exists payments_provider_bluepal_check;

alter table public.payments
  add constraint payments_provider_blupal_check check (provider = 'blupal');

comment on column public.payments.authority is 'BluPal invoice_id returned by POST /v1/invoices/create and used by GET /v1/invoices/{invoice_id}.';
comment on column public.payments.provider_reference is 'BluPal transaction_id reported for the paid invoice, when the gateway provides one.';
comment on column public.payments.provider_code is 'Last BluPal invoice status (PENDING, PAID, EXPIRED, CANCELED) or a synthetic failure code.';
comment on column public.payments.callback_payload is 'Gateway metadata: payment_link, destination card, amount and final_amount in rial plus the attempt history.';

commit;

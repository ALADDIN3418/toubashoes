-- بلوپال (BluPal · blupal.top) — قطعهٔ 1 از 7: قفل provider، بستن سبد‌های رهاشده و بایگانی تاریخچهٔ درگاه قبلی
-- با «node scripts/blupal-sql-chunks.js» از supabase/migrations/202610050001_blupal_provider.sql
-- ساخته شده؛ خودسرانه ویرایشش نکن. قطعه‌ها را به ترتیب شماره و هرکدام کامل اجرا کن.

begin;

-- BluPal (بلوپال · blupal.top) — درگاه کارت‌به‌کارت با فاکتور.
-- قرارداد: POST /v1/invoices/create (مبلغ ریالی) سپس GET /v1/invoices/{invoice_id} به‌عنوان تنها
-- نهایی‌ساز پرداخت، و وب‌هوک payment.completed فقط به‌عنوان سرنخ.
-- پس از 202610030001_live_commerce.sql اعمال شود. هیچ کلید یا رمزی در SQL نیست.

-- A pending row that never reached the previous provider is closed out and its reservations are
-- released. Rows that already reached a terminal state are left exactly as they are: their provider
-- name is history, not a switchable setting, and rewriting 'zarinpal' into 'blupal' would falsify
-- the ledger. The CHECK constraint below therefore keeps admitting the retired names while the
-- application can only ever write 'blupal' (no column default, rows are inserted by RPCs only).
do $$
declare
  v_row record;
  v_line record;
  v_history bigint;
begin
  if exists (select 1 from public.payments where provider not in ('zarinpal','balepay','bluepal','blupal')) then
    raise exception 'payments contains an unknown provider; reconcile it before switching to BluPal';
  end if;
  select count(*) into v_history from public.payments
   where provider in ('zarinpal','balepay','bluepal') and status <> 'pending';
  if v_history > 0 then
    raise notice 'blupal: % retired-gateway payment row(s) stay in the table as history', v_history;
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
       set status = 'failed', provider_code = 'GATEWAY_RETIRED',
           failure_reason = 'Retired gateway checkout was abandoned before any payment was verified',
           callback_payload = coalesce(callback_payload,'{}'::jsonb) || jsonb_build_object('migration','blupal','at',now())
     where order_id = v_row.order_id and status = 'pending'
       and provider in ('zarinpal','balepay','bluepal');
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

-- Never let a mock or legacy gateway answer for a new payment: the column has no default, and the
-- only values the application can write come from create_order_with_payment, which uses 'blupal'.
alter table public.payments
  alter column provider drop default;

alter table public.payments
  drop constraint if exists payments_provider_zarinpal_check;

alter table public.payments
  drop constraint if exists payments_provider_balepay_check;

-- The never-adopted redirect-gateway build (if it was ever applied) must not survive either, and the
-- constraint added below is dropped first so re-running this file stays harmless.
alter table public.payments
  drop constraint if exists payments_provider_bluepal_check;

alter table public.payments
  drop constraint if exists payments_provider_blupal_check;

-- A database that was only partially migrated may carry the same rule under a name nobody knows.
-- Every check that pins payments.provider to a literal value goes, whatever it is called.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname from pg_catalog.pg_constraint con
     join pg_catalog.pg_class cls on cls.oid = con.conrelid
     join pg_catalog.pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and cls.relname = 'payments' and con.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(con.oid) ilike '%zarinpal%'
        or pg_catalog.pg_get_constraintdef(con.oid) ilike '%balepay%'
        or pg_catalog.pg_get_constraintdef(con.oid) ilike '%bluepal%'
        or pg_catalog.pg_get_constraintdef(con.oid) ilike ('%provider = ' || chr(39) || 'blupal' || chr(39) || '%')
        or pg_catalog.pg_get_constraintdef(con.oid) ilike '%provider = any%'
      )
  loop
    execute format('alter table public.payments drop constraint %I', v_constraint.conname);
  end loop;
end
$$;

-- 'blupal' is the only provider the storefront can choose. The retired names stay listed so the
-- rows already recorded under them remain valid history instead of forcing a rewrite of the ledger.
alter table public.payments
  add constraint payments_provider_blupal_check
  check (provider in ('blupal','zarinpal','balepay','bluepal'));

-- ...and nothing may be written with them: a new payment must be blupal, and an existing payment may
-- never be moved onto a retired gateway (which would be a way to fake a paid order).
create or replace function public.enforce_blupal_payment_provider()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.provider is distinct from 'blupal' then
      raise exception using errcode = '22023', message = 'new payments must use the blupal provider';
    end if;
  elsif new.provider is distinct from old.provider and new.provider is distinct from 'blupal' then
    raise exception using errcode = '22023', message = 'a payment cannot be moved onto a retired gateway';
  end if;
  return new;
end;
$$;
grant execute on function public.enforce_blupal_payment_provider() to public, authenticated, service_role;

drop trigger if exists payments_enforce_blupal_provider on public.payments;
create trigger payments_enforce_blupal_provider
  before insert or update on public.payments
  for each row execute function public.enforce_blupal_payment_provider();

comment on column public.payments.provider is 'BluPal is the only writable provider; zarinpal/balepay/bluepal appear in pre-switch rows as history.';

comment on column public.payments.authority is 'BluPal invoice_id returned by POST /v1/invoices/create and used by GET /v1/invoices/{invoice_id}.';
comment on column public.payments.provider_reference is 'BluPal transaction_id reported for the paid invoice, when the gateway provides one.';
comment on column public.payments.provider_code is 'Last BluPal invoice status (PENDING, PAID, EXPIRED, CANCELED) or a synthetic failure code.';
comment on column public.payments.callback_payload is 'Gateway metadata: payment_link, destination card, amount and final_amount in rial plus the attempt history.';

commit;

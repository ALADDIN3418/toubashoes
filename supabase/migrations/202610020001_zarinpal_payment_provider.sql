begin;

-- Never let a newly inserted payment silently fall back to a mock gateway.
-- Keep the migration fail-closed if a non-ZarinPal record already exists so
-- historic data is reviewed explicitly instead of being relabeled as real.
do $$
begin
  if exists (
    select 1
    from public.payments
    where provider is distinct from 'zarinpal'
  ) then
    raise exception 'payments contains non-ZarinPal providers; reconcile those rows before applying this migration';
  end if;
end
$$;

alter table public.payments
  alter column provider drop default;

alter table public.payments
  drop constraint if exists payments_provider_zarinpal_check;

alter table public.payments
  add constraint payments_provider_zarinpal_check check (provider = 'zarinpal');

commit;
